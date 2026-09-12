const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { validateImageContent } = require('../middleware/upload');

const router = express.Router();

function parseProduct(row) {
  if (!row) return row;
  let images = [];
  try { images = JSON.parse(row.images || '[]'); } catch { images = []; }
  return { ...row, sizes: JSON.parse(row.sizes || '[]'), images, featured: !!row.featured, active: !!row.active };
}

// Security fix: product images used to accept an arbitrary "image_url" string from
// the admin form and interpolate it directly into <img src="..."> on the frontend
// with no escaping - a crafted value could break out of the attribute and inject
// script (stored XSS). Fixed at the source: only our own generated upload paths
// are ever accepted or stored, never arbitrary external URLs or free text.
const SAFE_UPLOAD_PATH = /^\/uploads\/[A-Za-z0-9_.-]+$/;
function sanitizeImagePaths(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(v => typeof v === 'string' && SAFE_UPLOAD_PATH.test(v));
}

// ---------- PUBLIC ----------

// GET /api/products?category=&team=&league=&search=&featured=1
router.get('/', (req, res) => {
  const { category, team, league, search, featured } = req.query;
  let sql = 'SELECT * FROM products WHERE active = 1';
  const params = [];

  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (team) { sql += ' AND team = ?'; params.push(team); }
  if (league) { sql += ' AND league = ?'; params.push(league); }
  if (featured) { sql += ' AND featured = 1'; }
  if (search) { sql += ' AND (name LIKE ? OR team LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(parseProduct));
});

router.get('/teams', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT team FROM products WHERE active = 1 ORDER BY team').all();
  res.json(rows.map(r => r.team));
});

// Distinct leagues currently in use (for the shop's league filter). Optionally
// scoped to a category, since leagues mainly make sense for "club" jerseys.
router.get('/leagues', (req, res) => {
  const { category } = req.query;
  let sql = "SELECT DISTINCT league FROM products WHERE active = 1 AND league IS NOT NULL AND league != ''";
  const params = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  sql += ' ORDER BY league';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(r => r.league));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Produit introuvable' });
  res.json(parseProduct(row));
});

// ---------- ADMIN ----------

router.get('/admin/all', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(rows.map(parseProduct));
});

const MAX_IMAGES = 6;

router.post('/', requireAuth, upload.array('images', MAX_IMAGES), validateImageContent, (req, res) => {
  const b = req.body;
  if (!b.name || !b.team || !b.price) return res.status(400).json({ error: "Le nom, l'équipe et le prix sont requis" });

  let sizes = b.sizes;
  try { sizes = JSON.stringify(Array.isArray(JSON.parse(sizes)) ? JSON.parse(sizes) : []); }
  catch { sizes = JSON.stringify(String(sizes || '').split(',').map(s => s.trim()).filter(Boolean)); }

  const uploadedUrls = (req.files || []).map(f => `/uploads/${f.filename}`);
  const images = uploadedUrls; // no arbitrary external/text image_url accepted - uploads only
  const image_url = images[0] || '';

  const info = db.prepare(`INSERT INTO products
    (name, team, category, league, description, price, compare_at_price, sizes, stock, image_url, images, featured, active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      b.name, b.team, b.category || 'club', b.league || '', b.description || '',
      parseFloat(b.price), b.compare_at_price ? parseFloat(b.compare_at_price) : null,
      sizes, parseInt(b.stock || 0, 10), image_url, JSON.stringify(images),
      b.featured ? 1 : 0, b.active === '0' ? 0 : 1
    );

  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(parseProduct(row));
});

router.put('/:id', requireAuth, upload.array('images', MAX_IMAGES), validateImageContent, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produit introuvable' });

  const b = req.body;
  let sizes = existing.sizes;
  if (b.sizes) {
    try { sizes = JSON.stringify(Array.isArray(JSON.parse(b.sizes)) ? JSON.parse(b.sizes) : []); }
    catch { sizes = JSON.stringify(String(b.sizes).split(',').map(s => s.trim()).filter(Boolean)); }
  }

  // "keep_images" carries the existing image URLs the admin chose to keep (JSON array).
  // Any newly uploaded files are appended after those, in upload order. Sanitized so
  // this field can't be used to smuggle an arbitrary string into the images array.
  let keptImages = [];
  if (b.keep_images !== undefined) {
    try { keptImages = sanitizeImagePaths(JSON.parse(b.keep_images)); }
    catch { keptImages = []; }
  } else {
    try { keptImages = sanitizeImagePaths(JSON.parse(existing.images || '[]')); } catch { keptImages = []; }
  }
  const newUrls = (req.files || []).map(f => `/uploads/${f.filename}`);
  const images = [...keptImages, ...newUrls].slice(0, MAX_IMAGES);
  const image_url = images[0] || '';

  db.prepare(`UPDATE products SET
    name=?, team=?, category=?, league=?, description=?, price=?, compare_at_price=?, sizes=?, stock=?,
    image_url=?, images=?, featured=?, active=?, updated_at=datetime('now')
    WHERE id=?`)
    .run(
      b.name ?? existing.name,
      b.team ?? existing.team,
      b.category ?? existing.category,
      b.league ?? existing.league,
      b.description ?? existing.description,
      b.price !== undefined ? parseFloat(b.price) : existing.price,
      b.compare_at_price !== undefined ? (b.compare_at_price ? parseFloat(b.compare_at_price) : null) : existing.compare_at_price,
      sizes,
      b.stock !== undefined ? parseInt(b.stock, 10) : existing.stock,
      image_url,
      JSON.stringify(images),
      b.featured !== undefined ? (b.featured === '1' || b.featured === true ? 1 : 0) : existing.featured,
      b.active !== undefined ? (b.active === '1' || b.active === true ? 1 : 0) : existing.active,
      req.params.id
    );

  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(parseProduct(row));
});

router.delete('/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Produit introuvable' });
  res.json({ ok: true });
});

module.exports = router;
