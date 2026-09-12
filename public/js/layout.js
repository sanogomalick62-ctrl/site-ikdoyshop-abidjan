function renderHeader(activePage) {
  const nav = [
    { href: '/index.html', label: 'Accueil', key: 'home' },
    { href: '/shop.html', label: 'Boutique', key: 'shop' },
    { href: '/shop.html?category=national', label: 'National', key: 'national' },
    { href: '/shop.html?category=retro', label: 'Rétro', key: 'retro' },
    { href: '/track-order.html', label: 'Suivre ma commande', key: 'track' }
  ];
  const navHtml = nav.map(n => `<a href="${n.href}" class="${n.key === activePage ? 'active' : ''}">${n.label}</a>`).join('');

  document.getElementById('siteHeader').innerHTML = `
    <div id="announceBar" class="announce">Nouveaux maillots de la saison disponibles — commandez maintenant, confirmation par WhatsApp.</div>
    <header class="site-header">
      <div class="wrap">
        <a href="/index.html" class="brand">
          <img src="/images/logo.png" alt="Logo IKODY SHOP">
          <span data-content="site_name">IKODY SHOP</span>
        </a>
        <nav class="main-nav">${navHtml}</nav>
        <div class="header-actions">
          <button class="icon-btn" onclick="openCartDrawer()" aria-label="Ouvrir le panier">
            ${ICONS.cart}<span class="badge cart-badge" style="display:none">0</span>
          </button>
        </div>
      </div>
    </header>
  `;
  Cart.updateBadge();
}

function renderFooter() {
  document.getElementById('siteFooter').innerHTML = `
    <footer class="site-footer">
      <div class="wrap">
        <div class="footer-grid">
          <div>
            <div class="footer-brand">
              <img src="/images/logo.png" alt="Logo IKODY SHOP">
              <span data-content="site_name">IKODY SHOP</span>
            </div>
            <p data-content="about_text">Boutique de maillots indépendante pour les supporters qui prennent leurs couleurs au sérieux.</p>
          </div>
          <div>
            <h5>Boutique</h5>
            <ul>
              <li><a href="/shop.html">Tous les maillots</a></li>
              <li><a href="/shop.html?category=club">Club</a></li>
              <li><a href="/shop.html?category=national">Équipes nationales</a></li>
              <li><a href="/shop.html?category=retro">Rétro</a></li>
            </ul>
          </div>
          <div>
            <h5>Assistance</h5>
            <ul>
              <li><a href="/track-order.html">Suivre ma commande</a></li>
              <li><a href="/cart.html">Mon panier</a></li>
              <li><a href="mailto:" data-content-href="contact_email" data-content="contact_email">Nous écrire</a></li>
            </ul>
          </div>
          <div>
            <h5>Suivez-nous</h5>
            <ul>
              <li><a href="#" data-content-href="instagram_url">Instagram</a></li>
              <li><a href="#" data-content-href="facebook_url">Facebook</a></li>
              <li><a href="#" data-content-href="tiktok_url">TikTok</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} <span data-content="site_name">IKODY SHOP</span>. Tous droits réservés.</span>
          <span data-content="contact_phone">Contactez-nous</span>
        </div>
      </div>
    </footer>
  `;
}

function renderCartDrawer() {
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="drawer-overlay" id="drawerOverlay" onclick="closeCartDrawer()"></div>
    <aside class="cart-drawer" id="cartDrawer">
      <div class="cart-drawer-head">
        <h3>Votre panier</h3>
        <button onclick="closeCartDrawer()" aria-label="Fermer le panier">&times;</button>
      </div>
      <div class="cart-drawer-body" id="cartDrawerBody"></div>
      <div class="cart-drawer-foot">
        <div class="summary-row total" style="margin-bottom:14px;">
          <span>Total</span>
          <span class="price" id="drawerTotal">$0.00</span>
        </div>
        <a href="/checkout.html" class="btn btn-primary btn-block">Commander</a>
        <a href="/cart.html" class="btn btn-outline btn-block" style="margin-top:10px;">Voir le panier complet</a>
      </div>
    </aside>
  `;
  document.body.appendChild(div);
}

function renderDrawerContents() {
  const items = Cart.read();
  const body = document.getElementById('cartDrawerBody');
  if (!body) return;
  if (items.length === 0) {
    body.innerHTML = `<div class="empty-state"><div class="glyph">${ICONS.basket}</div><p>Votre panier est vide.</p></div>`;
  } else {
    body.innerHTML = items.map(i => `
      <div class="cart-line">
        <div class="thumb">${i.image_url ? `<img src="${escapeHtml(i.image_url)}" alt="">` : `<span class="placeholder">${ICONS.shirt}</span>`}</div>
        <div class="meta">
          <div class="team">${escapeHtml(i.team)}</div>
          <h4>${escapeHtml(i.name)}</h4>
          <span class="size-badge">Taille ${escapeHtml(i.size)} · x${i.qty}</span>
        </div>
        <div class="right">
          <span class="price">${fmtMoney(i.price * i.qty)}</span>
          <a href="#" class="remove-link" onclick="event.preventDefault(); Cart.remove(${i.product_id}, '${i.size}'); renderDrawerContents();">Retirer</a>
        </div>
      </div>
    `).join('');
  }
  document.getElementById('drawerTotal').textContent = fmtMoney(Cart.total());
}

function openCartDrawer() {
  renderDrawerContents();
  document.getElementById('cartDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}
function closeCartDrawer() {
  document.getElementById('cartDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}

function initLayout(activePage) {
  renderHeader(activePage);
  renderFooter();
  renderCartDrawer();
  loadSiteContent();
}
