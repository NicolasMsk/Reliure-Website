/* Fiche produit : résout le slug depuis l'URL, charge le détail, re-rend au changement de langue. */
let PRODUCT = null; // cache du produit chargé

document.addEventListener('i18n:ready', load, { once: true });
document.addEventListener('i18n:ready', render); // re-render au changement de langue

async function load() {
  const slug = location.pathname.split('/').filter(Boolean).pop();
  try {
    const res = await fetch(`/api/products/${encodeURIComponent(slug)}`);
    if (res.status === 404) { PRODUCT = 404; render(); return; }
    PRODUCT = await res.json();
  } catch {
    PRODUCT = 'error';
  }
  render();
}

function render() {
  const root = document.getElementById('product-root');
  if (!root || PRODUCT == null) return;
  const lang = window.I18N ? window.I18N.current : 'fr';
  if (PRODUCT === 404) { root.innerHTML = `<p class="center">${lang === 'en' ? 'Item not found.' : 'Création introuvable.'}</p>`; return; }
  if (PRODUCT === 'error') { root.innerHTML = `<p class="center">${lang === 'en' ? 'Loading error.' : 'Erreur de chargement.'}</p>`; return; }
  root.innerHTML = view(PRODUCT, lang);
  wireGallery();
}

function view(p, lang) {
  const title = lang === 'en' ? p.title_en : p.title_fr;
  const desc = (lang === 'en' ? p.description_en : p.description_fr) || '';
  const cat = window.categoryLabel ? window.categoryLabel(p.category, lang) : p.category;
  const imgs = p.images && p.images.length ? p.images : [{ url: '/images/placeholder-1.jpg', alt_fr: '', alt_en: '' }];
  const main = imgs[0].url;
  const thumbs = imgs.map((im, i) => `<img src="${escAttr(im.url)}" data-full="${escAttr(im.url)}" class="${i === 0 ? 'active' : ''}" alt="${escAttr(title)}" />`).join('');
  const reserve = lang === 'en' ? 'Reserve this piece' : 'Réserver cette pièce';
  return `<div class="product">
    <div class="gallery">
      <div class="gallery-main"><img id="gmain" src="${escAttr(main)}" alt="${escAttr(title)}" /></div>
      <div class="thumbs">${thumbs}</div>
    </div>
    <div class="product-info">
      <p class="cat">${escHtml(cat)}</p>
      <h1>${escHtml(title)}</h1>
      <p class="price">${Number(p.price).toFixed(2)} €</p>
      <div>${escHtml(desc).replace(/\n/g, '<br>')}</div>
      <p style="margin-top:1.5rem">
        <a class="btn" href="/contact?produit=${encodeURIComponent(p.slug)}">${reserve}</a>
      </p>
    </div>
  </div>`;
}

function wireGallery() {
  const main = document.getElementById('gmain');
  document.querySelectorAll('.thumbs img').forEach((t) => {
    t.addEventListener('click', () => {
      main.src = t.getAttribute('data-full');
      document.querySelectorAll('.thumbs img').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
    });
  });
}
