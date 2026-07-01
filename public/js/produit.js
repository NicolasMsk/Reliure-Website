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
  updateSeo(PRODUCT, lang);
}

/* Met à jour titre, meta description, Open Graph, canonique et données
   structurées Product (schema.org) à partir du produit chargé. Améliore
   le référencement de chaque fiche (titre générique côté HTML sinon). */
function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', content);
}
function updateSeo(p, lang) {
  if (!p || typeof p !== 'object') return;
  const title = (lang === 'en' ? p.title_en : p.title_fr) || p.title_fr || 'Création';
  const descRaw = (lang === 'en' ? p.description_en : p.description_fr) || '';
  const desc = descRaw.replace(/\s+/g, ' ').trim().slice(0, 155) || `${title} — reliure d'art faite main, Book of Silk.`;
  const url = location.origin + location.pathname;
  const imgs = (p.images && p.images.length) ? p.images.map((im) => im.url) : [location.origin + '/images/hero.png'];

  document.title = `${title} — Book of Silk`;
  setMeta('name', 'description', desc);
  setMeta('property', 'og:title', `${title} — Book of Silk`);
  setMeta('property', 'og:description', desc);
  setMeta('property', 'og:url', url);
  setMeta('property', 'og:image', imgs[0]);

  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
  link.href = url;

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: title,
    image: imgs,
    description: desc,
    brand: { '@type': 'Brand', name: 'Book of Silk' },
    offers: {
      '@type': 'Offer',
      price: Number(p.price).toFixed(2),
      priceCurrency: 'EUR',
      availability: p.status === 'disponible' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: url,
    },
  };
  if (p.category) jsonld.category = p.category;
  let s = document.getElementById('product-jsonld');
  if (!s) { s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'product-jsonld'; document.head.appendChild(s); }
  s.textContent = JSON.stringify(jsonld);
}

function view(p, lang) {
  const buyLabel = (window.I18N && window.I18N.t) ? window.I18N.t('product.buy') : (lang === 'en' ? 'Buy' : 'Acheter');
  const t = (k) => (window.I18N && window.I18N.t) ? window.I18N.t(k) : k;
  const weightTxt = p.weight_grams ? `${p.weight_grams} g` : '';
  const detailRows = [
    [t('product.materials'), p.materials],
    [t('product.technique'), p.technique],
    [t('product.duration'), p.duration],
    [t('product.dimensions'), p.dimensions],
    [t('product.weight'), weightTxt],
  ].filter(([, v]) => v && String(v).trim());
  const detailsHtml = detailRows.length ? `
      <div class="product-details">
        <h2>${escHtml(t('product.details'))}</h2>
        <dl>${detailRows.map(([k, v]) => `<dt>${escHtml(k)}</dt><dd>${escHtml(v)}</dd>`).join('')}</dl>
      </div>` : '';
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
      <div class="dropcap">${escHtml(desc).replace(/\n/g, '<br>')}</div>
      ${detailsHtml}
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
      const headers = { 'Content-Type': 'application/json' };
      try { if (window.AUTH) { const t = await window.AUTH.getToken(); if (t) headers.Authorization = `Bearer ${t}`; } } catch { /* invité */ }
      const res = await fetch('/api/checkout', { method: 'POST', headers, body: JSON.stringify({ slug: p.slug, lang }) });
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
