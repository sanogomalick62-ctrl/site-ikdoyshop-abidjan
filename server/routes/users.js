const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireOwner, (req, res) => {
  const rows = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at').all();
  res.json(rows);
});

router.post('/', requireAuth, requireOwner, (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || password.length < 12) {
    return res.status(400).json({ error: "Nom d'utilisateur requis, mot de passe d'au moins 12 caractères" });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)')
    .run(username, hash, role === 'owner' ? 'owner' : 'admin');

  res.status(201).json({ id: info.lastInsertRowid, username, role: role === 'owner' ? 'owner' : 'admin' });
});

router.delete('/:id', requireAuth, requireOwner, (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: "Vous ne pouvez pas supprimer votre propre compte pendant que vous êtes connecté avec" });
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ ok: true });
});

module.exports = router;
