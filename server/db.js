const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'ikody.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', -- 'owner' | 'admin'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'club', -- 'club' | 'national' | 'retro' | 'training'
  description TEXT DEFAULT '',
  price REAL NOT NULL,
  compare_at_price REAL,
  sizes TEXT NOT NULL DEFAULT '["S","M","L","XL"]', -- JSON array
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_ref TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  city TEXT,
  notes TEXT, -- customer-submitted notes at checkout
  notes_internal TEXT, -- admin-only notes, never shown to the customer
  items TEXT NOT NULL, -- JSON array of {product_id, name, size, qty, price}
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', -- 'new' | 'contacted' | 'confirmed' | 'shipped' | 'completed' | 'cancelled'
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// ---------- Migration: add "images" column (JSON array) for multi-image carousel ----------
const productCols = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);
if (!productCols.includes('images')) {
  db.exec(`ALTER TABLE products ADD COLUMN images TEXT NOT NULL DEFAULT '[]'`);
  // Backfill: any product that already had a single image_url gets it as its first (only) image
  const rows = db.prepare("SELECT id, image_url FROM products WHERE image_url IS NOT NULL AND image_url != ''").all();
  const setImages = db.prepare('UPDATE products SET images = ? WHERE id = ?');
  const tx = db.transaction((items) => {
    for (const r of items) setImages.run(JSON.stringify([r.image_url]), r.id);
  });
  tx(rows);
}

// ---------- Migration: add "league" column - lets club jerseys be grouped by
// competition (Ligue 1, Serie A, Premier League, etc.) as a sub-filter under "club". ----------
if (!productCols.includes('league')) {
  db.exec(`ALTER TABLE products ADD COLUMN league TEXT DEFAULT ''`);
}

// ---------- Migration: add stock reservation guard columns / token_version for
// session revocation. Security fix: changing a password (or being forcibly logged
// out) now invalidates every JWT issued before that point, since each token embeds
// the token_version it was issued with and requireAuth checks it still matches. ----------
const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userCols.includes('token_version')) {
  db.exec(`ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0`);
}

module.exports = db;
