const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const MIN_PASSWORD_LENGTH = 12;

// Security fix: no rate limiting previously existed on login, making brute-force
// credential guessing trivial. 8 attempts / 15 min per IP is generous for a real
// admin who mistypes, but blocks automated guessing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' }
});

function signToken(user) {
  // "tv" (token_version) is checked against the DB on every request - bumping
  // it (e.g. on password change) instantly invalidates every token issued before.
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, tv: user.token_version },
    JWT_SECRET,
    { expiresIn: '24h' } // shortened from 7d - a stolen cookie now has a much smaller window
  );
}

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis" });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Nom d'utilisateur ou mot de passe incorrect" });
  }

  const token = signToken(user);
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'strict', // upgraded from 'lax' - closes remaining CSRF gap on state-changing admin requests
    secure: isProd,
    maxAge: 24 * 60 * 60 * 1000
  });
  res.json({ id: user.id, username: user.username, role: user.role });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, role: req.user.role });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password || new_password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères` });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Le mot de passe actuel est incorrect' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  // Bumping token_version invalidates every existing session for this account
  // (including a possibly-stolen one) the moment the password changes.
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(hash, req.user.id);

  // Re-issue a fresh token for the current browser so the user making the change
  // isn't immediately logged out by their own password update.
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const token = signToken(updated);
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd,
    maxAge: 24 * 60 * 60 * 1000
  });
  res.json({ ok: true });
});

module.exports = router;
