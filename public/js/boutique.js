/* Boutique : charge les produits, gère les filtres par catégorie. */
let ALL = [];
let CURRENT = 'all';

document.addEventListener('i18n:ready', init, { once: true });
document.addEventListener('i18n:ready', render); // re-render au changement de langue

async function init() {
  renderFilters();
  try {
    const res = await fetch('/api/products');
    ALL = res.ok ? await res.json() : [];
  } catch { ALL = []; }
  render();
}

function renderFilters() {
  const lang = window.I18N ? window.I18N.current : 'fr';
  const el = document.getElementById('filters');
  if (!el) return;
  const all = lang === 'en' ? 'All' : 'Toutes';
  const btns = [`<button class="filter-btn${CURRENT === 'all' ? ' active' : ''}" data-cat="all">${all}</button>`]
    .concat((window.CATEGORIES || []).map((c) =>
      `<button class="filter-btn${CURRENT === c.slug ? ' active' : ''}" data-cat="${c.slug}">${lang === 'en' ? c.en : c.fr}</button>`));
  el.innerHTML = btns.join('');
  el.querySelectorAll('.filter-btn').forEach((b) =>
    b.addEventListener('click', () => { CURRENT = b.getAttribute('data-cat'); renderFilters(); render(); }));
}

function render() {
  const grid = document.getElementById('shop-grid');
  const empty = document.getElementById('shop-empty');
  if (!grid) return;
  const lang = window.I18N ? window.I18N.current : 'fr';
  const items = CURRENT === 'all' ? ALL : ALL.filter((p) => p.category === CURRENT);
  if (!items.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  grid.innerHTML = items.map((p) => card(p, lang)).join('');
}

function card(p, lang) {
  const title = lang === 'en' ? p.title_en : p.title_fr;
  const img = p.image_url || '/images/placeholder-1.jpg';
  const sold = p.status === 'vendu';
  const badge = sold
    ? `<span class="badge badge--sold">${lang === 'en' ? 'Sold' : 'Vendu'}</span>`
    : `<span class="badge">${lang === 'en' ? 'Unique piece' : 'Pièce unique'}</span>`;
  return `<a class="card" href="/produit/${encodeURIComponent(p.slug)}">
    <img src="${escAttr(img)}" alt="${escAttr(title)}" />
    <div class="card-body">${badge}<h3>${escHtml(title)}</h3><div class="price">${Number(p.price).toFixed(2)} €</div></div>
  </a>`;
}
