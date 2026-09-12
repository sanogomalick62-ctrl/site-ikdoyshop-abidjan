// Small fetch wrapper used across the public site
const API = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw await API._err(res);
    return res.json();
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw await API._err(res);
    return res.json();
  },
  async _err(res) {
    try {
      const data = await res.json();
      return new Error(data.error || `Request failed (${res.status})`);
    } catch {
      return new Error(`Request failed (${res.status})`);
    }
  }
};

function fmtMoney(n, symbol) {
  const sym = symbol || (window.SITE_CONTENT && window.SITE_CONTENT.currency_symbol) || '$';
  return `${Number(n).toFixed(2)}${sym}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Security fix: content-editor-supplied values (social links, contact email) used
// to be passed straight to setAttribute('href', ...) with no validation. setAttribute
// does NOT sanitize URL schemes, so a value like "javascript:..." would execute if
// clicked. This only allows the schemes an <a href> should ever actually need.
function safeHref(value, fallback) {
  const v = String(value ?? '').trim();
  if (!v) return fallback;
  if (v.startsWith('mailto:') || v.startsWith('tel:')) return v;
  // A bare email address (e.g. the contact_email field, stored without a
  // "mailto:" prefix) should still produce a working mail link.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'mailto:' + v;
  try {
    const url = new URL(v, window.location.origin);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch { /* falls through to fallback below */ }
  return fallback;
}

// Loads site_content once and applies to any element with [data-content="key"]
async function loadSiteContent() {
  try {
    const content = await API.get('/api/content');
    window.SITE_CONTENT = content;
    document.querySelectorAll('[data-content]').forEach(el => {
      const key = el.getAttribute('data-content');
      if (content[key] !== undefined) el.textContent = content[key];
    });
    document.querySelectorAll('[data-content-href]').forEach(el => {
      const key = el.getAttribute('data-content-href');
      if (content[key]) el.setAttribute('href', safeHref(content[key], el.getAttribute('href')));
    });
    const banner = document.getElementById('announceBar');
    if (banner && content.banner_message) banner.textContent = content.banner_message;
    return content;
  } catch (e) {
    console.warn('Could not load site content', e);
    return {};
  }
}
