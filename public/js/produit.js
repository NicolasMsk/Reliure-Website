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
  wireBuy(PRODUCT);
}

function view(p, lang) {
  const buyLabel = lang === 'en' ? 'Buy' : 'Acheter';
  const title = lang === 'en' ? p.title_en : p.title_fr;
  const desc = (lang === 'en' ? p.description_en : p.description_fr) || '';
  const cat = window.categoryLabel ? window.categoryLabel(p.category, lang) : p.category;
  const imgs = p.images && p.images.length ? p.images : [{ url: '/images/placeholder-1.jpg', alt_fr: '', alt_en: '' }];
  const main = imgs[0].url;
  const thumbs = imgs.map((im, i) => `<img src="${escAttr(im.url)}" data-full="${escAttr(im.url)}" class="${i === 0 ? 'active' : ''}" alt="${escAttr(title)}" />`).join('');
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
        <button class="btn" id="buy-btn" data-slug="${escAttr(p.slug)}">${escHtml(buyLabel)}</button>
        <span id="buy-note" class="form-note" hidden></span>
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

/* Bouton Acheter : ouvre Stripe Checkout, ou affiche un message si indisponible. */
function wireBuy(p) {
  const btn = document.getElementById('buy-btn');
  const note = document.getElementById('buy-note');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    note.hidden = true;
    const lang = window.I18N ? window.I18N.current : 'fr';
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: p.slug, lang }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.url) { window.location.href = d.url; return; }
      }
      // 503 / 409 / autres → message
      const body = await res.json().catch(() => ({}));
      note.textContent = body.code === 'payments_unavailable'
        ? window.I18N.t('product.unavailable')
        : (body.error || window.I18N.t('product.unavailable'));
      note.className = 'form-note is-error';
      note.hidden = false;
      btn.disabled = false;
    } catch {
      note.textContent = window.I18N.t('product.unavailable');
      note.className = 'form-note is-error';
      note.hidden = false;
      btn.disabled = false;
    }
  });
}
