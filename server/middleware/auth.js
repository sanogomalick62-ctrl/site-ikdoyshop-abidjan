const jwt = require('jsonwebtoken');
const db = require('../db');

// Security fix: never silently fall back to a known/guessable secret in production.
// A missing or weak JWT_SECRET there would let anyone forge admin sessions.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const KNOWN_PLACEHOLDER_SECRETS = ['dev-secret-change-me', 'change-this-to-a-long-random-string'];
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required in production - refusing to start with the default fallback secret.');
  }
  if (KNOWN_PLACEHOLDER_SECRETS.includes(process.env.JWT_SECRET)) {
    throw new Error('JWT_SECRET is still set to the placeholder value from .env.example - generate a real random secret.');
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET is too short for production - use at least 32 random characters (64+ hex chars recommended).');
  }
}

function requireAuth(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Security fix: a password change (or a future "log out everywhere") bumps
    // token_version in the database, which instantly invalidates every token
    // issued before that point - even ones already stolen and still "valid" by
    // signature/expiry alone.
    const user = db.prepare('SELECT token_version FROM users WHERE id = ?').get(payload.id);
    if (!user || user.token_version !== payload.tv) {
      return res.status(401).json({ error: 'Session invalide ou expirée' });
    }
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }
}

function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Seul le compte propriétaire peut faire ceci' });
  }
  next();
}

module.exports = { requireAuth, requireOwner, JWT_SECRET };
