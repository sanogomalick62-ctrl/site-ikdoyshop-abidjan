const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { pruneActivityLog } = require('../lib/activityLog');

const router = express.Router();

// ADMIN: list recent activity, most recent first
router.get('/', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const rows = db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?').all(limit);
  pruneActivityLog();
  res.json(rows);
});

module.exports = router;
