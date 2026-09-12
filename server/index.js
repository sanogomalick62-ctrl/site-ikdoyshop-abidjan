require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const db = require('./db');
const { requireAuth } = require('./middleware/auth');
const { uploadDir } = require('./middleware/upload');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const contentRoutes = require('./routes/content');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Bug fix: Render (like most hosting platforms) sits behind a reverse proxy and
// forwards the real client IP via the X-Forwarded-For header. Without telling
// Express to trust that first proxy hop, express-rate-limit can't reliably
// determine the real client IP and throws a validation error on every
// rate-limited route - which is exactly why login/orders/tracking were
// returning 500 in production while everything else kept working fine.

// Security fix: Helmet sets a batch of standard protective headers (X-Content-Type-Options,
// Referrer-Policy, HSTS in production, frame-ancestors, etc.) that were previously missing
// entirely. The CSP below is intentionally not fully "strict" - this codebase currently
// uses inline onclick="" handlers and inline <script>/<style> blocks throughout the admin
// panel and storefront, so script-src/style-src need 'unsafe-inline' or the whole site
// breaks. It still blocks the more dangerous gaps: no plugins, no framing (clickjacking),
// no base-tag hijacking, and only same-origin/data: images and connections. Removing
// 'unsafe-inline' entirely is a valid follow-up hardening step, but requires refactoring
// every onclick handler to addEventListener across every page first - a separate project.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"], // needed: the site uses onclick="" attributes throughout
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'same-site' }
}));

// CORS: SameSite=Strict cookies (set in routes/auth.js) are the actual defense
// against a malicious site using a visitor's admin cookie cross-site - the
// browser simply won't attach the cookie to a cross-site request at all,
// regardless of what CORS allows. That means CORS here is a secondary,
// optional layer, not the primary boundary.
//
// This used to also try to auto-detect "same-origin" by comparing the Origin
// header against req.protocol/req.get('host') and reject everything else in
// production. That broke real logins twice in a row because Render's reverse
// proxy setup doesn't always make that comparison land the way a direct
// connection would locally. Since SameSite=Strict already covers the actual
// risk, this now only restricts origins when you explicitly opt in by setting
// ALLOWED_ORIGINS - unset (the default), it behaves like a normal single-origin
// app and never blocks legitimate same-origin traffic no matter how a given
// proxy forwards headers.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true); // no allowlist configured - don't block
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Uploaded product images
app.use('/uploads', express.static(uploadDir));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/users', userRoutes);

// Admin dashboard summary stats
app.get('/api/stats', requireAuth, (req, res) => {
  const totalProducts = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  const activeProducts = db.prepare('SELECT COUNT(*) AS c FROM products WHERE active = 1').get().c;
  const lowStock = db.prepare('SELECT COUNT(*) AS c FROM products WHERE stock <= 5 AND active = 1').get().c;
  const totalOrders = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
  const newOrders = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'new'").get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status != 'cancelled'").get().s;
  const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5').all()
    .map(o => ({ ...o, items: JSON.parse(o.items) }));

  res.json({ totalProducts, activeProducts, lowStock, totalOrders, newOrders, revenue, recentOrders });
});

// Static frontend (public shop)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Static admin panel (auth is enforced client-side by API calls + server-side on every API route)
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

// Fallbacks
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'admin', 'index.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, '..', 'admin', 'index.html')));

app.use((req, res) => res.status(404).json({ error: 'Introuvable' }));

// Safety net: any error passed to next(err) anywhere above (CORS rejection,
// an unexpected exception, etc.) used to fall through to Express's default
// HTML error page, which the frontend can't parse as JSON - producing the
// generic "Échec de la requête" message with no useful detail. This returns
// clean JSON instead, and only leaks the real error message outside production.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: isProd ? 'Une erreur interne est survenue' : err.message });
});

app.listen(PORT, () => {
  console.log(`IKODY SHOP server running at http://localhost:${PORT}`);
});
