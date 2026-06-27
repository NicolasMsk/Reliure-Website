/* Charge jusqu'à 3 produits disponibles dans #featured-grid, re-rendu au changement de langue. */
(function () {
  let ITEMS = null; // cache des produits chargés

  function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function escapeAttr(s){return escapeHtml(s).replace(/"/g,'&quot;');}

  function cardHTML(p, lang) {
    const title = lang === 'en' ? p.title_en : p.title_fr;
    const img = p.image_url || '/images/placeholder-1.jpg';
    const price = Number(p.price).toFixed(2);
    return `<a class="card" href="/produit/${encodeURIComponent(p.slug)}">
      <img src="${img}" alt="${escapeAttr(title)}" />
      <div class="card-body"><h3>${escapeHtml(title)}</h3><div class="price">${price} €</div></div>
    </a>`;
  }

  function render() {
    const grid = document.getElementById('featured-grid');
    const empty = document.getElementById('featured-empty');
    if (!grid) return;
    const lang = window.I18N ? window.I18N.current : 'fr';
    const top = (ITEMS || []).slice(0, 3);
    if (top.length === 0) { grid.innerHTML = ''; if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');
    grid.innerHTML = top.map((p) => cardHTML(p, lang)).join('');
  }

  async function fetchItems() {
    try {
      const res = await fetch('/api/products');
      ITEMS = res.ok ? await res.json() : [];
    } catch { ITEMS = []; }
    render();
  }

  // Premier chargement : récupère puis rend. Re-rendu à chaque changement de langue.
  document.addEventListener('i18n:ready', fetchItems, { once: true });
  document.addEventListener('i18n:ready', render);
})();
