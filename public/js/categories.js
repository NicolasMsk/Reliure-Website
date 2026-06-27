/* Catégories de la boutique — source unique (slug → libellés FR/EN). */
(function () {
  window.CATEGORIES = [
    { slug: 'bibles-restaurees', fr: 'Bibles restaurées',          en: 'Restored Bibles' },
    { slug: 'bibles-brodees',    fr: 'Bibles sur-mesure brodées',  en: 'Bespoke embroidered Bibles' },
    { slug: 'livres-religieux',  fr: 'Livres religieux & missels',  en: 'Religious books & missals' },
    { slug: 'coffrets-sacres',   fr: 'Coffrets & écrins sacrés',    en: 'Sacred cases & boxes' },
    { slug: 'autres-reliures',   fr: 'Carnets & autres reliures',   en: 'Notebooks & other bindings' },
  ];
  window.categoryLabel = function (slug, lang) {
    const c = window.CATEGORIES.find((x) => x.slug === slug);
    return c ? (lang === 'en' ? c.en : c.fr) : slug;
  };
})();
