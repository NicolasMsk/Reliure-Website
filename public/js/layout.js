/* Injecte l'en-tête et le pied de page partagés dans les éléments
   #site-header et #site-footer, puis branche la bascule de langue.
   Dépend de window.I18N (i18n.js chargé avant). */
(function () {
  function headerHTML() {
    return `
      <div class="container">
        <a href="/" class="brand">Book of Silk<span class="brand-sub"></span></a>
        <button class="nav-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="primary-nav"><span class="bar"></span></button>
        <nav class="nav" id="primary-nav" aria-label="Navigation principale">
          <a href="/" data-i18n="nav.home"></a>
          <a href="/boutique" data-i18n="nav.shop"></a>
          <a href="/sur-mesure" data-i18n="nav.custom"></a>
          <a href="/a-propos" data-i18n="nav.about"></a>
          <a href="/contact" data-i18n="nav.contact"></a>
          <a href="/faq" data-i18n="nav.faq"></a>
          <a href="/compte" data-i18n="nav.account"></a>
          <span class="lang-toggle" role="group" aria-label="Langue / Language">
            <button type="button" data-lang="fr" lang="fr">FR</button>
            <button type="button" data-lang="en" lang="en">EN</button>
          </span>
        </nav>
      </div>`;
  }

  function footerHTML() {
    const year = new Date().getFullYear();
    return `
      <div class="container">
        <p class="brand">Book of Silk<span class="brand-sub"></span></p>
        <p data-i18n="footer.tagline"></p>
        <p>© ${year} — <span data-i18n="footer.rights"></span></p>
      </div>`;
  }

  /* Marque le lien de navigation correspondant à la page courante. */
  function markActivePage() {
    const here = location.pathname.replace(/\/+$/, '') || '/';
    document.querySelectorAll('.nav a[href]').forEach((a) => {
      const href = (a.getAttribute('href') || '').replace(/\/+$/, '') || '/';
      if (href === here) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    });
  }

  /* Sous-titre de marque : nom localisé à côté de « Book of Silk »,
     masqué quand il vaudrait déjà « Book of Silk » (anglais). */
  function updateBrandSub() {
    const name = (window.I18N && window.I18N.t) ? window.I18N.t('brand.name') : 'Livre de Soie';
    const sub = (name && name !== 'Book of Silk') ? name : '';
    document.querySelectorAll('.brand-sub').forEach((el) => { el.textContent = sub; });
  }

  function markActiveLang() {
    const lang = window.I18N ? window.I18N.current : 'fr';
    document.querySelectorAll('.lang-toggle button').forEach((b) => {
      const isActive = b.getAttribute('data-lang') === lang;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  /* Menu mobile : ouvre/ferme le tiroir, gère aria-expanded, se referme
     au clic sur un lien ou quand on repasse en affichage bureau. */
  function setupNavToggle() {
    const header = document.getElementById('site-header');
    if (!header) return;
    const toggle = header.querySelector('.nav-toggle');
    const nav = header.querySelector('.nav');
    if (!toggle || !nav) return;

    const close = () => { header.classList.remove('nav-open'); toggle.setAttribute('aria-expanded', 'false'); };

    toggle.addEventListener('click', () => {
      const open = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
    window.addEventListener('resize', () => {
      if (window.innerWidth > 860 && header.classList.contains('nav-open')) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && header.classList.contains('nav-open')) { close(); toggle.focus(); }
    });
  }

  function mount() {
    const h = document.getElementById('site-header');
    const f = document.getElementById('site-footer');
    if (h) h.innerHTML = headerHTML();
    if (f) f.innerHTML = footerHTML();

    markActivePage();
    setupNavToggle();

    document.querySelectorAll('.lang-toggle button').forEach((b) => {
      b.addEventListener('click', async () => {
        if (window.I18N) await window.I18N.setLang(b.getAttribute('data-lang'));
        markActiveLang();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    mount();
    if (window.I18N) await window.I18N.init();
    markActiveLang();
  });
  document.addEventListener('i18n:ready', () => { markActiveLang(); updateBrandSub(); });
})();
