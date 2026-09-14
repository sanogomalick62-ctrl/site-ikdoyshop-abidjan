const db = require('../db');

const insertLog = db.prepare(`INSERT INTO activity_log (actor_username, actor_role, action, description) VALUES (?, ?, ?, ?)`);

// req comes from an authenticated route (req.user is set by requireAuth).
// action: short machine key like 'product.create' - used for future filtering.
// description: human-readable French sentence shown directly in the admin UI.
function logActivity(req, action, description) {
  try {
    insertLog.run(req.user?.username || 'inconnu', req.user?.role || 'admin', action, description);
  } catch (e) {
    // Logging must never break the actual request it's attached to.
    console.error('Activity log failed:', e.message);
  }
}

// Same as logActivity, but for the one route (login) that doesn't have req.user
// set yet at the point the event happens, since requireAuth hasn't run there.
function logActivityRaw(username, role, action, description) {
  try {
    insertLog.run(username, role, action, description);
  } catch (e) {
    console.error('Activity log failed:', e.message);
  }
}

// Keeps the table from growing forever on a small shop's disk - runs occasionally,
// keeps the most recent 2000 entries.
function pruneActivityLog() {
  try {
    db.prepare(`DELETE FROM activity_log WHERE id NOT IN (
      SELECT id FROM activity_log ORDER BY id DESC LIMIT 2000
    )`).run();
  } catch (e) {
    console.error('Activity log prune failed:', e.message);
  }
}

module.exports = { logActivity, logActivityRaw, pruneActivityLog };
