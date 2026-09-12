// ---------- API helper (admin) ----------
const AdminAPI = {
  async request(method, url, body, isForm) {
    const opts = { method, credentials: 'include' };
    if (body) {
      if (isForm) { opts.body = body; }
      else { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
    }
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }

    // A 401 on the login endpoint means "wrong username/password", not "session expired" -
    // let it fall through so the real server message is shown.
    const isLoginAttempt = url === '/api/auth/login';
    if (res.status === 401 && !isLoginAttempt) {
      const onLoginPage = location.pathname === '/admin/' || location.pathname === '/admin' || location.pathname.endsWith('/admin/index.html');
      if (!onLoginPage) location.href = '/admin/index.html';
      throw new Error('Session expirée. Veuillez vous reconnecter.');
    }

    if (!res.ok) throw new Error((data && data.error) || `Échec de la requête (${res.status})`);
    return data;
  },
  get(url) { return this.request('GET', url); },
  post(url, body, isForm) { return this.request('POST', url, body, isForm); },
  put(url, body, isForm) { return this.request('PUT', url, body, isForm); },
  patch(url, body) { return this.request('PATCH', url, body); },
  del(url) { return this.request('DELETE', url); }
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function fmtMoney(n) {
  const sym = (window.SITE_CONTENT && window.SITE_CONTENT.currency_symbol) || '$';
  return `${Number(n).toFixed(2)}${sym}`;
}
function fmtDate(d) {
  return new Date(d).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

// ---------- Auth guard + shell ----------
const NAV_ITEMS = [
  { href: '/admin/dashboard.html', label: 'Tableau de bord', ico: 'barChart', key: 'dashboard' },
  { href: '/admin/products.html', label: 'Produits', ico: 'shirt', key: 'products' },
  { href: '/admin/orders.html', label: 'Commandes', ico: 'package', key: 'orders' },
  { href: '/admin/content.html', label: 'Contenu du site', ico: 'edit', key: 'content' },
  { href: '/admin/users.html', label: 'Administrateurs', ico: 'user', key: 'users' }
];

let CURRENT_ADMIN = null;

async function requireAdminAuth() {
  try {
    CURRENT_ADMIN = await AdminAPI.get('/api/auth/me');
    return CURRENT_ADMIN;
  } catch (e) {
    location.href = '/admin/index.html';
    return null;
  }
}

function renderAdminShell(activeKey) {
  const navHtml = NAV_ITEMS
    .filter(item => item.key !== 'users' || (CURRENT_ADMIN && CURRENT_ADMIN.role === 'owner'))
    .map(item => `<a href="${item.href}" class="${item.key === activeKey ? 'active' : ''}"><span class="ico">${ICONS[item.ico]}</span><span class="label">${item.label}</span></a>`)
    .join('');

  document.getElementById('sidebar').innerHTML = `
    <div class="brand"><img src="/images/logo.png" alt=""><span>IKODY ADMIN</span></div>
    <nav>${navHtml}</nav>
    <div class="foot">
      <div class="user"><span class="user-ico">${ICONS.user}</span> ${escapeHtml(CURRENT_ADMIN?.username || '')} <span class="pill pill-${CURRENT_ADMIN?.role}">${CURRENT_ADMIN?.role === 'owner' ? 'propriétaire' : 'admin'}</span></div>
      <button onclick="adminLogout()">Se déconnecter</button>
    </div>
  `;
}

async function adminLogout() {
  try { await AdminAPI.post('/api/auth/logout'); } catch {}
  location.href = '/admin/index.html';
}

// Load site content (for currency symbol etc.) - best effort
async function loadAdminSiteContent() {
  try { window.SITE_CONTENT = await AdminAPI.get('/api/content'); } catch {}
}

async function initAdminPage(activeKey) {
  const admin = await requireAdminAuth();
  if (!admin) return null;
  renderAdminShell(activeKey);
  await loadAdminSiteContent();
  startIdleWatcher();
  return admin;
}

function statusPillClass(status) { return `pill pill-${status}`; }

// ---------- Idle auto-logout ----------
// Adjust these two values to change how long an admin can sit idle before being logged out.
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // total time of inactivity before logout (15 min)
const IDLE_WARNING_MS = 60 * 1000;      // how long before that to show the warning (60s)

let idleWarnTimer = null;
let idleLogoutTimer = null;
let idleCountdownInterval = null;

function clearIdleTimers() {
  clearTimeout(idleWarnTimer);
  clearTimeout(idleLogoutTimer);
  clearInterval(idleCountdownInterval);
}

function scheduleIdleTimers() {
  clearIdleTimers();
  idleWarnTimer = setTimeout(showIdleWarning, IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
  idleLogoutTimer = setTimeout(idleAutoLogout, IDLE_TIMEOUT_MS);
}

function ensureIdleWarningModal() {
  if (document.getElementById('idleWarningOverlay')) return;
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="modal-overlay" id="idleWarningOverlay">
      <div class="modal-box">
        <div class="modal-head"><h3><span class="modal-head-icon">${ICONS.clock}</span> Toujours là ?</h3></div>
        <p style="color:var(--ink-soft); font-size:14px; margin:0 0 4px;">
          Vous allez être déconnecté automatiquement pour inactivité dans
          <strong id="idleCountdown">60</strong> secondes.
        </p>
        <div class="modal-actions">
          <button class="btn btn-outline" onclick="adminLogout()">Se déconnecter maintenant</button>
          <button class="btn btn-primary" onclick="resetIdleActivity()">Rester connecté</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(div);
}

function showIdleWarning() {
  ensureIdleWarningModal();
  let remaining = Math.round(IDLE_WARNING_MS / 1000);
  const countdownEl = document.getElementById('idleCountdown');
  if (countdownEl) countdownEl.textContent = remaining;
  document.getElementById('idleWarningOverlay').classList.add('open');

  clearInterval(idleCountdownInterval);
  idleCountdownInterval = setInterval(() => {
    remaining -= 1;
    const el = document.getElementById('idleCountdown');
    if (el) el.textContent = Math.max(remaining, 0);
    if (remaining <= 0) clearInterval(idleCountdownInterval);
  }, 1000);
}

function idleAutoLogout() {
  const overlay = document.getElementById('idleWarningOverlay');
  if (overlay) overlay.classList.remove('open');
  AdminAPI.post('/api/auth/logout').catch(() => {}).finally(() => {
    location.href = '/admin/index.html?timeout=1';
  });
}

// Called both by user activity and by the "Rester connecté" button - hides the
// warning if shown and restarts the full idle countdown from zero.
function resetIdleActivity() {
  const overlay = document.getElementById('idleWarningOverlay');
  if (overlay) overlay.classList.remove('open');
  scheduleIdleTimers();
}

function startIdleWatcher() {
  scheduleIdleTimers();
  const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
  let lastReset = Date.now();
  activityEvents.forEach(evt => {
    document.addEventListener(evt, () => {
      const now = Date.now();
      if (now - lastReset < 1000) return; // throttle so mousemove doesn't spam timer resets
      lastReset = now;
      resetIdleActivity();
    }, { passive: true });
  });
}
