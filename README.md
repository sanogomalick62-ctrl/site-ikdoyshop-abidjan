# IKODY SHOP

A full football-jersey e-commerce site with a built-in admin panel — Node.js/Express backend, SQLite database, JWT-based admin login, and a plain HTML/CSS/JS storefront (no build step needed).

**The entire site (storefront + admin panel + error messages) is in French.** All text is either hardcoded in French in the page files or editable from Admin → Site content — see section 8 if you want to change any of it.

- **Public site**: home, shop with filters, product pages, cart, checkout (manual orders — no online payment), order confirmation, order tracking.
- **Admin panel** (`/admin`): dashboard stats, product CRUD with image upload, order management, site content editor (hero text, banners, contact info, socials), admin-user management.

---

## 1. Requirements

- Node.js 18+ (built and tested on Node 22)
- npm

No external database service is needed — it uses a local SQLite file.

---

## 2. First-time setup

```bash
cd ikody-shop
npm install
cp .env.example .env
```

Open `.env` and set:
- `JWT_SECRET` — any long random string (used to sign admin login sessions)
- `SEED_ADMIN_USER` / `SEED_ADMIN_PASS` — the first admin account's login (only used the very first time you seed)

Then create the database and seed it with your first admin account, default site text, and a few sample products:

```bash
npm run seed
```

This prints the admin username/password it just created — **write it down**, you'll use it to log in to `/admin`.

> Re-running `npm run seed` later is safe but **won't change an existing admin password** — it only creates the very first admin account and skips if any admin already exists. If you're locked out or forget your password, use the reset script below instead of re-seeding.

### Forgot your admin password / locked out?

Run this any time (server can be running or stopped):

```bash
node server/reset-admin.js <username> <new_password>
```

Example:
```bash
node server/reset-admin.js admin MyNewSecurePassword123
```

If that username already exists, its password is overwritten. If it doesn't exist, it's created as an owner account. Either way it prints the login to use.

---

## 3. Running it

```bash
npm start
```

The site runs at **http://localhost:3000**
The admin panel is at **http://localhost:3000/admin**

Log in with the username/password from the seed step, then immediately go to **Admin users → Change my password** and set your own password.

---

## 4. Using the admin panel

| Section | What you can do |
|---|---|
| Dashboard | Revenue, order counts, low-stock alerts, recent orders |
| Products | Add/edit/delete jerseys: name, team, category, price, sale price, sizes, stock, up to 6 images per product (auto-rotating carousel on the product page), description, featured flag, active/inactive |
| Orders | View every order placed, see customer contact info + items, update status (new → contacted → confirmed → shipped → completed / cancelled), add internal notes |
| Site content | Edit the shop name, homepage hero text, announcement banner, about text, contact phone/email/WhatsApp/address, and social links — all update the live site instantly |
| Admin users | (Owner role only) add or remove other admin accounts, change your own password |

**Auto-logout on inactivity**: admins are automatically logged out after 15 minutes of inactivity in the panel (mouse, keyboard, scroll, and touch all count as activity). A warning with a countdown appears 60 seconds before that happens, with a "Rester connecté" button to stay logged in — any activity at all also dismisses it. To change the timing, edit `IDLE_TIMEOUT_MS` and `IDLE_WARNING_MS` near the bottom of `admin/js/admin.js`.

**Two roles:**
- `owner` — everything, including managing other admin accounts
- `admin` — everything except managing other admin accounts

**Orders are manual by design**: no payment is collected online. A customer fills in their name/phone/address at checkout, the order is saved, and you follow up with them directly (phone, WhatsApp, email) to confirm sizing and arrange payment. Customers can check their own order status on the "Track my order" page using their order reference + phone number.

**Product images**: uploaded through the admin panel are stored in `server/uploads/` and served at `/uploads/...`. Back this folder up along with `server/data/ikody.db` — see below.

---

## 5. Your data

Everything lives in two places on disk:

- `server/data/ikody.db` — the SQLite database (products, orders, site content, admin accounts)
- `server/uploads/` — uploaded product images

**Back these up regularly** (a simple cron job that copies both somewhere safe is enough for a small shop). If you redeploy or move servers, copy these two locations across and everything — products, orders, admin accounts — comes with it.

---

## 6. Deploying it online

This is a normal Node.js server, so it needs a host that can run a persistent Node process (not a static-only host like GitHub Pages). Good low-effort options:

- **Render.com** or **Railway.app** — connect your git repo, set the environment variables from `.env.example`, set the start command to `npm start`, and add a persistent disk mounted at `server/data` and `server/uploads` (both hosts support this) so your database and images survive redeploys.
- **A basic VPS** (DigitalOcean, Hetzner, etc.) — `git clone` your repo, `npm install`, `npm run seed` once, then run it behind a process manager like `pm2` and put Nginx or Caddy in front for HTTPS.

Whichever you choose:
1. Set `NODE_ENV=production` and a strong random `JWT_SECRET` in the environment.
2. Make sure `server/data/` and `server/uploads/` are on **persistent** storage — on platforms with ephemeral filesystems (like some serverless/container setups), a redeploy without a persistent volume will wipe your database.
3. Put the site behind HTTPS — admin login cookies are marked `secure` in production, meaning they only work over HTTPS.

### Upgrading from Render's free tier to a paid plan with a persistent disk

Render's free tier has no persistent storage — every restart or redeploy wipes `server/data/ikody.db` and any uploaded product images. If you started on free and want your data (and a custom domain, which free doesn't support at all) to actually stick, upgrade to Render's Starter plan (~$7/month):

1. In your Render service → **Settings**, change **Instance Type** from Free to **Starter**.
2. Still in Settings, find **Disks** and add one — give it a mount path like `/var/data` and a size of 1 GB (plenty for this shop).
3. Add two environment variables:
   - `DATA_DIR` = `/var/data/db`
   - `UPLOADS_DIR` = `/var/data/uploads`

   The app automatically creates these folders on the disk the first time it starts — you don't need to create them yourself. (These two variables only matter when you set them; if you don't set them, the app just uses its own local folders as before, which is correct for local development and for the free tier.)
4. Save — Render redeploys automatically. From this point on, your database and images live on the persistent disk and survive restarts and redeploys.
5. Optional cleanup: your Start Command was set to `node server/seed.js && node server/index.js` for the free tier (to recreate the admin account after every wipe). Now that data persists, you can simplify it to just `node server/index.js` — or leave the seed step in, since it's harmless and just skips everything that already exists.
6. You can now also add your custom domain from the same Settings page (see the earlier section on connecting a domain).

---

## 7. Project structure

```
ikody-shop/
  server/            Express API + SQLite database
    index.js         App entry point
    db.js            Database schema
    seed.js          Creates first admin account + sample data
    routes/          products, orders, content, users, auth
    middleware/       auth (JWT), upload (multer)
    data/            ikody.db lives here (created on first run)
    uploads/         product images live here
  public/            Customer-facing storefront (plain HTML/CSS/JS)
  admin/             Admin panel (plain HTML/CSS/JS, calls the same API)
  .env.example       Copy to .env and fill in
```

---

## 8. Customizing the look

All storefront styling lives in `public/css/style.css` (CSS variables at the top — colors, fonts, spacing). The admin panel has its own matching stylesheet at `admin/css/admin.css`. The logo is at `public/images/logo.png` — replace that file to change the logo everywhere (it's referenced by path, not duplicated).

**Icons**: every icon on the site (cart, categories, admin nav, etc.) is an inline SVG defined once in `public/js/icons.js` as the `ICONS` object — no emoji, no external image files. To add a new icon, add a new entry to that file (any 24x24 stroke-based SVG works) and reference it as `ICONS.yourName` wherever you need it.

**Product leagues (club subcategories)**: products can optionally be tagged with a league (Ligue 1, Serie A, Premier League, etc.) from the League field on the product form. The shop automatically shows a league filter under "Catégorie" whenever at least one product has a league set — there's no fixed list to maintain, it's driven entirely by what's actually in your catalog.

**Loading splash screen**: the homepage shows a brief branded loading screen the first time someone visits in a browser session — the logo appears, winks (the eye position was measured directly from your logo's pixels, so it lines up exactly), and the tagline fades in underneath. It only shows once per session (tracked via sessionStorage), not on every page navigation, so browsing the site afterward stays fast. To change its timing or which page shows it, look for the `splashScreen` block near the top of `public/index.html` and the matching `.splash-*` rules in `public/css/style.css`.

Text content (shop name, hero copy, contact info, social links) does **not** need a code change — edit it from **Admin → Site content**.

---

## 9. Security

This project went through a security review (September 2026) and every Medium-severity-or-higher finding was fixed:

- **Session security**: passwords need 12+ characters, JWT sessions last 24h (down from 7 days), and changing a password (or running `reset-admin.js`) instantly invalidates every other existing session for that account - not just the password.
- **Rate limiting**: login (8 attempts/15min), order placement (10/hour), and order tracking (30/10min) are all throttled per IP to block brute-forcing and spam.
- **Stock enforcement**: orders now atomically check and decrement stock in a single transaction - no more accepting an order for more stock than exists. Cancelling an order restores the stock.
- **Order tracking privacy**: the public tracking endpoint returns only status/items/total - never the customer's phone, email, address, or notes.
- **Upload validation**: product images are checked by their actual file signature after upload (not just the claimed file type), and only the app's own generated `/uploads/...` paths are ever stored or rendered - no arbitrary external image URLs.
- **Security headers**: Helmet is enabled (CSP, HSTS, X-Content-Type-Options, clickjacking protection, etc.). One honest tradeoff: the CSP allows inline scripts/styles/event-handler attributes (`'unsafe-inline'`) because the codebase uses `onclick=""` attributes throughout the admin panel and storefront. Removing that entirely would require refactoring every inline handler to `addEventListener` first - a valid follow-up if you want maximum hardening, but a separate, larger job.
- **CORS**: the real defense against a malicious site abusing an admin's session is the `SameSite=Strict` cookie below - the browser won't attach it to a cross-site request at all, regardless of CORS. An origin allowlist is available as an optional extra layer (set `ALLOWED_ORIGINS`, comma-separated) but is off by default, since an earlier attempt at auto-detecting "same-origin" broke real logins behind Render's reverse proxy twice - not worth the fragility for a secondary layer.
- **CSRF**: cookies upgraded from `SameSite=Lax` to `SameSite=Strict`.
- **Startup safety check**: the server now refuses to start in production if `JWT_SECRET` is missing, still the placeholder value, or too short - instead of silently falling back to a guessable default.

**One finding I deliberately didn't "fix" as a bug**: the report flagged that `admin` accounts can do everything `owner` can except manage other admins. That's not an oversight - it's exactly the permission model this README already documented from the start (admin = day-to-day shop management, owner = also manages who else has access). If you want finer-grained permissions (e.g. an admin role that can only view orders but not edit products), that's a reasonable thing to add - just ask.
