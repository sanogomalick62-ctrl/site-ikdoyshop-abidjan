// Client-side cart, persisted in localStorage. Prices are re-validated
// server-side when the order is actually placed, so this is just for UX.
const CART_KEY = 'ikody_cart_v1';

const Cart = {
  read() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch { return []; }
  },
  write(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    Cart.updateBadge();
  },
  add(product, size, qty) {
    const items = Cart.read();
    const existing = items.find(i => i.product_id === product.id && i.size === size);
    if (existing) {
      existing.qty += qty;
    } else {
      items.push({
        product_id: product.id,
        name: product.name,
        team: product.team,
        image_url: product.image_url,
        price: product.price,
        size,
        qty
      });
    }
    Cart.write(items);
  },
  updateQty(product_id, size, qty) {
    let items = Cart.read();
    items = items.map(i => (i.product_id === product_id && i.size === size) ? { ...i, qty: Math.max(1, qty) } : i);
    Cart.write(items);
  },
  remove(product_id, size) {
    const items = Cart.read().filter(i => !(i.product_id === product_id && i.size === size));
    Cart.write(items);
  },
  clear() { Cart.write([]); },
  count() { return Cart.read().reduce((sum, i) => sum + i.qty, 0); },
  total() { return Cart.read().reduce((sum, i) => sum + i.qty * i.price, 0); },
  updateBadge() {
    document.querySelectorAll('.cart-badge').forEach(el => {
      const c = Cart.count();
      el.textContent = c;
      el.style.display = c > 0 ? 'flex' : 'none';
    });
  }
};

document.addEventListener('DOMContentLoaded', Cart.updateBadge);
