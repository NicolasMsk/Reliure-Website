/* Fiche produit : résout le slug depuis l'URL, charge le détail. */
document.addEventListener('i18n:ready', load, { once: true });

async function load() {
  const root = document.getElementById('product-root');
  const slug = location.pathname.split('/').filter(Boolean).pop();
  const lang = window.I18N ? window.I18N.current : 'fr';
  try {
    const res = await fetch(`/api/products/${encodeURIComponent(slug)}`);
    if (res.status === 404) { root.innerHTML = `<p class="center">${lang === 'en' ? 'Item not found.' : 'Création introuvable.'}</p>`; return; }
    const p = await res.json();
    root.innerHTML = view(p, lang);
    wireGallery();
  } catch {
    root.innerHTML = `<p class="center">${lang === 'en' ? 'Loading error.' : 'Erreur de chargement.'}</p>`;
  }
}

function view(p, lang) {
  const title = lang === 'en' ? p.title_en : p.title_fr;
  const desc = (lang === 'en' ? p.description_en : p.description_fr) || '';
  const cat = window.categoryLabel ? window.categoryLabel(p.category, lang) : p.category;
  const imgs = p.images && p.images.length ? p.images : [{ url: '/images/placeholder-1.jpg', alt_fr: '', alt_en: '' }];
  const main = imgs[0].url;
  const thumbs = imgs.map((im, i) => `<img src="${im.url}" data-full="${im.url}" class="${i === 0 ? 'active' : ''}" alt="${esc(title, true)}" />`).join('');
  const reserve = lang === 'en' ? 'Reserve this piece' : 'Réserver cette pièce';
  return `<div class="product">
    <div class="gallery">
      <div class="gallery-main"><img id="gmain" src="${main}" alt="${esc(title, true)}" /></div>
      <div class="thumbs">${thumbs}</div>
    </div>
    <div class="product-info">
      <p class="cat">${esc(cat)}</p>
      <h1>${esc(title)}</h1>
      <p class="price">${Number(p.price).toFixed(2)} €</p>
      <div>${esc(desc).replace(/\n/g, '<br>')}</div>
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
function esc(s, attr){let o=String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');return attr?o.replace(/"/g,'&quot;'):o;}
