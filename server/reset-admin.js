// Resets (or creates) an admin account's password directly.
// Use this any time you're locked out or unsure what the current login is.
//
// Usage:
//   node server/reset-admin.js <username> <new_password>
//
// Example:
//   node server/reset-admin.js admin MyNewPassword123
//
// If the username doesn't exist yet, it will be created as an "owner".
// If it exists, its password is overwritten with the one you give here.

const bcrypt = require('bcryptjs');
const db = require('./db');

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error('Usage: node server/reset-admin.js <username> <new_password>');
  process.exit(1);
}
if (password.length < 12) {
  console.error('Password must be at least 12 characters.');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

if (existing) {
  // Bump token_version too, so a reset (often used after a suspected compromise)
  // also kills any existing session for this account, not just the password.
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(hash, existing.id);
  console.log(`Password updated for existing user "${username}" (all previous sessions invalidated).`);
} else {
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run(username, hash, 'owner');
  console.log(`Created new owner account "${username}".`);
}

console.log('----------------------------------------');
console.log('You can now log in at /admin with:');
console.log('  Username:', username);
console.log('  Password:', password);
console.log('----------------------------------------');
db.close();
