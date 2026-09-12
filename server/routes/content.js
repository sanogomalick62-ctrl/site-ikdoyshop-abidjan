const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM site_content').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

router.put('/', requireAuth, (req, res) => {
  const updates = req.body || {};
  const upsert = db.prepare(`INSERT INTO site_content (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  const tx = db.transaction((entries) => {
    for (const [k, v] of Object.entries(entries)) upsert.run(k, String(v ?? ''));
  });
  tx(updates);

  const rows = db.prepare('SELECT key, value FROM site_content').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

module.exports = router;
