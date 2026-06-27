/* Charge jusqu'à 3 produits disponibles dans #featured-grid. */
document.addEventListener('i18n:ready', () => loadFeatured(), { once: true });
async function loadFeatured() {
  const grid = document.getElementById('featured-grid');
  const empty = document.getElementById('featured-empty');
  if (!grid) return;
  try {
    const res = await fetch('/api/products');
    const items = res.ok ? await res.json() : [];
    const lang = window.I18N ? window.I18N.current : 'fr';
    const top = items.slice(0, 3);
    if (top.length === 0) { empty.classList.remove('hidden'); return; }
    grid.innerHTML = top.map((p) => cardHTML(p, lang)).join('');
  } catch { if (empty) empty.classList.remove('hidden'); }
}
function cardHTML(p, lang) {
  const title = lang === 'en' ? p.title_en : p.title_fr;
  const img = p.image_url || '/images/placeholder-1.jpg';
  const price = Number(p.price).toFixed(2);
  return `<a class="card" href="/produit/${encodeURIComponent(p.slug)}">
    <img src="${img}" alt="${escapeAttr(title)}" />
    <div class="card-body"><h3>${escapeHtml(title)}</h3><div class="price">${price} €</div></div>
  </a>`;
}
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function escapeAttr(s){return escapeHtml(s).replace(/"/g,'&quot;');}
