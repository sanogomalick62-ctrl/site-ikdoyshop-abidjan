const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function parseOrder(row) {
  if (!row) return row;
  return { ...row, items: JSON.parse(row.items || '[]') };
}

// Security fix: the public tracking endpoint used to return the full order row -
// phone, email, address, city, internal notes included - to anyone who could guess
// or obtain a ref+phone pair. Only what the customer actually needs to see their
// order status is returned now.
function parseOrderPublic(row) {
  if (!row) return row;
  return {
    order_ref: row.order_ref,
    status: row.status,
    items: JSON.parse(row.items || '[]'),
    total: row.total,
    created_at: row.created_at
  };
}

function genOrderRef() {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `IKD-${Date.now().toString().slice(-6)}${rand}`;
}

class OrderError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Security fix: no rate limiting previously existed on order placement or tracking,
// making both trivial to spam/brute-force. Limits below are generous for a real
// customer but block automated abuse.
const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de commandes envoyées depuis cette connexion. Réessayez plus tard.' }
});

const trackLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' }
});

// PUBLIC: place an order
router.post('/', orderLimiter, (req, res) => {
  const { customer_name, phone, email, address, city, notes, items } = req.body || {};

  if (!customer_name || !phone || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Le nom, le téléphone et au moins un article sont requis' });
  }

  const getProduct = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1');
  // Security/business-logic fix: stock was previously never checked or decremented,
  // so any quantity (including absurd ones) was silently accepted. This now runs
  // as a single atomic transaction: every item's stock is checked AND decremented
  // together, so a failure partway through rolls back everything already decremented
  // rather than leaving stock in a half-updated state.
  const decrementStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND active = 1 AND stock >= ?');

  const placeOrder = db.transaction(() => {
    const validated = [];
    let total = 0;

    for (const item of items) {
      const product = getProduct.get(item.product_id);
      if (!product) throw new OrderError(`Le produit ${item.product_id} n'est pas disponible`, 400);

      const qty = Math.max(1, Math.min(999, parseInt(item.qty, 10) || 1));

      const result = decrementStock.run(qty, product.id, qty);
      if (result.changes === 0) {
        throw new OrderError(`Stock insuffisant pour "${product.name}"`, 409);
      }

      const lineTotal = product.price * qty;
      total += lineTotal;
      validated.push({
        product_id: product.id,
        name: product.name,
        team: product.team,
        size: item.size || 'N/A',
        qty,
        price: product.price
      });
    }

    const order_ref = genOrderRef();
    const info = db.prepare(`INSERT INTO orders
      (order_ref, customer_name, phone, email, address, city, notes, items, total, status)
      VALUES (?,?,?,?,?,?,?,?,?, 'new')`)
      .run(order_ref, customer_name, phone, email || '', address || '', city || '', notes || '', JSON.stringify(validated), total);

    return info.lastInsertRowid;
  });

  try {
    const orderId = placeOrder();
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    res.status(201).json(parseOrder(row));
  } catch (err) {
    if (err instanceof OrderError) return res.status(err.status).json({ error: err.message });
    console.error('Order creation failed:', err);
    res.status(500).json({ error: "Une erreur est survenue lors de la création de la commande" });
  }
});

// PUBLIC: look up an order by ref + phone (order tracking, no auth) - returns
// only status/items/total, never contact details or internal notes.
router.get('/track/:ref', trackLimiter, (req, res) => {
  const { phone } = req.query;
  const row = db.prepare('SELECT * FROM orders WHERE order_ref = ?').get(req.params.ref);
  if (!row || !phone || row.phone.replace(/\s+/g, '') !== String(phone).replace(/\s+/g, '')) {
    return res.status(404).json({ error: 'Commande introuvable. Vérifiez la référence et le numéro de téléphone.' });
  }
  res.json(parseOrderPublic(row));
});

// ADMIN: list all orders
router.get('/', requireAuth, (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT * FROM orders';
  const params = [];
  if (status) { sql += ' WHERE status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(parseOrder));
});

// ADMIN: get one order
router.get('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Commande introuvable' });
  res.json(parseOrder(row));
});

// ADMIN: update order status / notes
router.patch('/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Commande introuvable' });

  const validStatuses = ['new', 'contacted', 'confirmed', 'shipped', 'completed', 'cancelled'];
  const { status, notes } = req.body || {}; // "notes" here = internal admin notes
  if (status && !validStatuses.includes(status)) return res.status(400).json({ error: 'Statut invalide' });

  const newStatus = status || existing.status;

  // Business-logic fix: cancelling an order now restores the stock that was
  // decremented when it was placed, since the sale didn't actually go through.
  const applyUpdate = db.transaction(() => {
    if (newStatus === 'cancelled' && existing.status !== 'cancelled') {
      const items = JSON.parse(existing.items || '[]');
      const restock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
      for (const item of items) restock.run(item.qty, item.product_id);
    }
    db.prepare(`UPDATE orders SET status = ?, notes_internal = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(newStatus, notes !== undefined ? notes : existing.notes_internal, req.params.id);
  });
  applyUpdate();

  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  res.json(parseOrder(row));
});

// ADMIN: delete an order
router.delete('/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Commande introuvable' });
  res.json({ ok: true });
});

module.exports = router;
