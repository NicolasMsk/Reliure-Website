/* Internationalisation côté client.
   Usage HTML : <span data-i18n="nav.home"></span>
   La langue est lue depuis ?lang=, puis localStorage, sinon 'fr'. */
(function () {
  const SUPPORTED = ['fr', 'en'];

  function detectLang() {
    const param = new URLSearchParams(location.search).get('lang');
    if (param && SUPPORTED.includes(param)) return param;
    const stored = localStorage.getItem('lang');
    if (stored && SUPPORTED.includes(stored)) return stored;
    return 'fr';
  }

  async function loadDict(lang) {
    const res = await fetch(`/i18n/${lang}.json`);
    return res.json();
  }

  function apply(dict) {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key]) el.setAttribute('placeholder', dict[key]);
    });
  }

  window.I18N = {
    current: detectLang(),
    dict: {},
    async init() {
      this.current = detectLang();
      document.documentElement.lang = this.current;
      this.dict = await loadDict(this.current);
      apply(this.dict);
      document.dispatchEvent(new CustomEvent('i18n:ready', { detail: { lang: this.current } }));
    },
    async setLang(lang) {
      if (!SUPPORTED.includes(lang)) return;
      localStorage.setItem('lang', lang);
      this.current = lang;
      document.documentElement.lang = lang;
      this.dict = await loadDict(lang);
      apply(this.dict);
      document.dispatchEvent(new CustomEvent('i18n:ready', { detail: { lang } }));
    },
    t(key) {
      return this.dict[key] || key;
    },
  };
})();
