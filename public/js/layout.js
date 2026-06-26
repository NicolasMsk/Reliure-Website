/* Injecte l'en-tête et le pied de page partagés dans les éléments
   #site-header et #site-footer, puis branche la bascule de langue.
   Dépend de window.I18N (i18n.js chargé avant). */
(function () {
  function headerHTML() {
    return `
      <div class="container">
        <a href="/" class="brand">Reliure</a>
        <nav class="nav" aria-label="Navigation principale">
          <a href="/" data-i18n="nav.home"></a>
          <a href="/boutique" data-i18n="nav.shop"></a>
          <a href="/sur-mesure" data-i18n="nav.custom"></a>
          <a href="/a-propos" data-i18n="nav.about"></a>
          <a href="/contact" data-i18n="nav.contact"></a>
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
        <p class="brand">Reliure</p>
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

  function markActiveLang() {
    const lang = window.I18N ? window.I18N.current : 'fr';
    document.querySelectorAll('.lang-toggle button').forEach((b) => {
      const isActive = b.getAttribute('data-lang') === lang;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function mount() {
    const h = document.getElementById('site-header');
    const f = document.getElementById('site-footer');
    if (h) h.innerHTML = headerHTML();
    if (f) f.innerHTML = footerHTML();

    markActivePage();

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
  document.addEventListener('i18n:ready', markActiveLang);
})();
