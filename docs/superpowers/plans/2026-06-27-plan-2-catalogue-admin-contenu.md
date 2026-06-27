# Plan 2 — Contenu enrichi, Catalogue & Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. For all visual/HTML/CSS tasks (Lot 1, and the boutique/produit/admin pages), additionally apply the `frontend-design` skill to keep the medieval/religious aesthetic distinctive (illuminated-manuscript feel, gold tooling, embroidery motifs) and never generic.

**Goal:** Enrichir le site avec du contenu soigné (savoir-faire, services, témoignages, FAQ, À propos étoffée) sur le thème religieux (bibles, broderie), puis ajouter une boutique alimentée par Supabase (catalogue + fiches produits) et un panneau admin permettant de gérer les créations et téléverser des photos vers Supabase Storage.

**Architecture:** On prolonge la base du Plan 1 (Express/TS modulaire, pages statiques + i18n côté client, design system CSS). Nouveau code serveur isolé par responsabilité : `src/lib/{slug,products,storage}.ts` (logique testable), `src/routes/{products,admin}.ts` (API). Pages publiques rendues côté client en consommant l'API JSON. Données produits dans les tables déjà créées au Plan 1 ; images dans un bucket Supabase Storage `product-images`.

**Tech Stack:** Node ≥18, Express 4, TypeScript 5, @supabase/supabase-js, Multer (upload multipart), node:test via tsx. Polices/CSS existants. Bilingue FR/EN via dictionnaires JSON.

**Convention de commit :** chaque commit se termine par `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Contexte pour l'implémenteur (lire avant de commencer)

État du dépôt (Plan 1 livré) :
- `src/app.ts` expose `createApp()` ; il appelle déjà `registerPageRoutes(app, PUBLIC_DIR)` et `registerContactRoutes(app)`, sert les statiques de `public/` avec cache, a une session cookie signée par `ADMIN_PASSWORD`, helmet, un rate-limiter sur `/api/`.
- `src/lib/clients.ts` expose `getSupabase()` (clé service, bypass RLS), `getStripe()`, `getResend()` (init paresseuse).
- `src/config.ts` expose `PORT, APP_URL, EMAIL_FROM, CONTACT_TO, IS_PRODUCTION`.
- `src/routes/pages.ts` mappe des URLs propres → fichiers HTML via l'objet `PAGE_ALIASES` (`/`, `/a-propos`, `/contact`).
- `public/css/style.css` : design system médiéval (variables `--burgundy --cream --sage --gold ...`, classes `.container .section .section--alt .center .rule .btn .grid .card .field .form-note ...`). Header/footer injectés par `public/js/layout.js`. i18n par `public/js/i18n.js` (`window.I18N` : `.init() .setLang() .t(key) .current .dict`, applique `[data-i18n]` et `[data-i18n-placeholder]`).
- `public/i18n/fr.json` & `en.json` : dictionnaires plats ; un test de parité (`test/i18n.test.ts`) impose les mêmes clés des deux côtés.
- Tables Supabase déjà créées : `products(id,slug,title_fr,title_en,description_fr,description_en,price,category,status,weight_grams,created_at,updated_at)`, `product_images(id,product_id,storage_path,alt_fr,alt_en,sort_order)`, plus `customers/orders/custom_requests`. `products.status ∈ {brouillon,disponible,vendu}`.
- Tests lancés par `npm test` (`tsx --test test/*.test.ts`). Le `.env` local contient les vraies clés Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`).

Règles transverses :
- Ne **jamais** renommer une classe CSS ou une clé i18n existante. Les nouvelles chaînes vont dans `fr.json` ET `en.json` (sinon le test de parité casse).
- Toute nouvelle page HTML inclut `<header class="site-header" id="site-header"></header>`, `<footer class="site-footer" id="site-footer"></footer>`, charge `/js/i18n.js` puis `/js/layout.js`, et lie `/css/style.css`.
- Échapper tout contenu dynamique rendu en HTML.

---

## Structure des fichiers (créée/modifiée par ce plan)

```
src/
├── lib/
│   ├── slug.ts            # slugify() — pur, testable
│   ├── products.ts        # listProducts(), getProductBySlug(), getAllProducts(), createProduct()... (accès Supabase)
│   └── storage.ts         # uploadProductImage(), deleteStorageObject(), publicUrl()
├── routes/
│   ├── products.ts        # API publique : GET /api/products, GET /api/products/:slug
│   └── admin.ts           # API admin protégée : login/logout + CRUD produits + images
public/
├── boutique.html, produit.html, faq.html, admin.html
├── js/
│   ├── categories.js      # mapping slug→{fr,en} partagé (client)
│   ├── boutique.js, produit.js, faq.js, admin.js
├── css/style.css          # + composants additifs
scripts/
└── seed.ts                # 6-8 produits de démo + images (manuel)
test/
├── slug.test.ts
└── products.test.ts
```

---

# LOT 1 — Contenu & vitrine enrichie

### Task 1 : Mapping des catégories (partagé client)

**Files:**
- Create: `public/js/categories.js`

- [ ] **Step 1 : Créer `public/js/categories.js`**

```js
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
```

- [ ] **Step 2 : Commit**

```bash
git add public/js/categories.js
git commit -m "feat: shared category slug→label mapping (FR/EN)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 : Chaînes i18n du contenu enrichi

**Files:**
- Modify: `public/i18n/fr.json`
- Modify: `public/i18n/en.json`

- [ ] **Step 1 : Ajouter les clés dans `public/i18n/fr.json`**

Ajouter ces paires (avant l'accolade fermante ; garder le JSON valide). Tu PEUX adapter les formulations, mais garde EXACTEMENT le même ensemble de clés dans les deux fichiers.

```json
  "home.hero.title": "L'art sacré de la reliure",
  "home.hero.subtitle": "Bibles restaurées, reliées et brodées à la main — pour transmettre ce qui compte.",
  "home.hero.cta": "Découvrir la boutique",
  "home.savoirfaire.title": "Le savoir-faire",
  "home.savoirfaire.intro": "Chaque ouvrage traverse les mêmes gestes patients, hérités des relieurs d'art.",
  "home.step1.title": "Analyse & démontage",
  "home.step1.text": "J'étudie l'ouvrage, son histoire et son état, puis je le démonte avec soin.",
  "home.step2.title": "Couture & corps d'ouvrage",
  "home.step2.text": "Les cahiers sont recousus à la main et le corps du livre reconstitué.",
  "home.step3.title": "Couvrure cuir & broderie",
  "home.step3.text": "Habillage en cuir pleine fleur, rehaussé de broderies réalisées à la main.",
  "home.step4.title": "Dorure & finition",
  "home.step4.text": "Titres et motifs dorés à chaud, finitions et protection de l'ouvrage.",
  "home.services.title": "Mes prestations",
  "home.service1.title": "Restauration de bibles",
  "home.service1.text": "Redonner vie aux bibles anciennes et familiales transmises de génération en génération.",
  "home.service2.title": "Bibles sur-mesure brodées",
  "home.service2.text": "Créer une bible unique, reliée cuir et brodée selon vos souhaits.",
  "home.service3.title": "Livres religieux & missels",
  "home.service3.text": "Reliure et restauration de missels, évangéliaires et ouvrages liturgiques.",
  "home.service4.title": "Reliure & restauration générale",
  "home.service4.text": "Carnets, registres et ouvrages profanes, avec le même soin d'atelier.",
  "home.featured.title": "Créations en vedette",
  "home.featured.empty": "De nouvelles créations seront bientôt présentées ici.",
  "home.testimonials.title": "Ils m'ont fait confiance",
  "home.testi1.text": "Ma bible familiale, abîmée par le temps, a retrouvé toute sa dignité. Un travail d'orfèvre.",
  "home.testi1.author": "Marie-Hélène, Lyon",
  "home.testi2.text": "La bible brodée offerte pour notre mariage est une merveille. Un objet de transmission.",
  "home.testi2.author": "Paul & Agnès, Nantes",
  "home.testi3.text": "Restauration d'un missel du XIXe siècle : minutie, écoute et résultat exceptionnel.",
  "home.testi3.author": "Père Joseph, Tours",
  "home.cta.title": "Une bible à restaurer, un projet à créer ?",
  "home.cta.text": "Confiez-moi votre ouvrage ou imaginons ensemble une pièce unique.",
  "home.cta.shop": "Voir la boutique",
  "home.cta.custom": "Demander un devis",
  "about.title": "L'atelier",
  "about.lead": "Artisane relieuse, je consacre mon métier au livre sacré et à sa transmission.",
  "about.p1": "Depuis l'atelier, je restaure des bibles que l'on m'a confiées — souvent chargées d'histoire familiale — et je crée des pièces uniques, reliées cuir et rehaussées de broderies faites main.",
  "about.p2": "Mon approche : le respect absolu de l'objet, des matériaux nobles (cuir pleine fleur, fils de lin, dorure à chaud) et la patience des gestes traditionnels.",
  "about.p3": "Chaque ouvrage est une rencontre. Qu'il s'agisse d'une bible centenaire ou d'un missel à protéger, je m'engage à lui rendre toute sa noblesse.",
  "about.values.title": "Mes engagements",
  "about.value1": "Matériaux nobles et durables",
  "about.value2": "Savoir-faire traditionnel",
  "about.value3": "Respect de l'objet transmis",
  "faq.title": "Questions fréquentes",
  "faq.q1": "Quels sont vos délais ?",
  "faq.a1": "Comptez 3 à 6 semaines selon la nature du travail. Un délai précis vous est donné au devis.",
  "faq.q2": "Comment se passe un devis ?",
  "faq.a2": "Décrivez votre projet via le formulaire sur-mesure ; je vous réponds avec une proposition détaillée.",
  "faq.q3": "Puis-je vous confier ma bible par la poste ?",
  "faq.a3": "Oui. Je vous conseille un envoi suivi et assuré ; je vous tiens informé à chaque étape.",
  "faq.q4": "Livrez-vous à l'étranger ?",
  "faq.a4": "Oui, j'expédie en France et à l'international, avec suivi.",
  "faq.q5": "Comment entretenir une reliure cuir ?",
  "faq.a5": "À l'abri de l'humidité et du soleil direct ; un soin du cuir adapté une à deux fois par an.",
  "nav.faq": "FAQ"
```

Note : `home.hero.*` et `home.featured.title` existent déjà — **remplace** leurs valeurs par celles ci-dessus (ne crée pas de doublon de clé). `about.text` existe déjà au Plan 1 : tu peux le laisser (inutilisé) ou le retirer des DEUX fichiers ; le plus simple est de le **conserver** dans les deux pour ne pas casser la parité, mais il ne sera plus référencé. Idem `nav.faq` : nouvelle clé.

- [ ] **Step 2 : Ajouter les MÊMES clés (traduites) dans `public/i18n/en.json`**

```json
  "home.hero.title": "The sacred art of bookbinding",
  "home.hero.subtitle": "Bibles restored, bound and embroidered by hand — to pass on what matters.",
  "home.hero.cta": "Explore the shop",
  "home.savoirfaire.title": "The craft",
  "home.savoirfaire.intro": "Every work goes through the same patient steps, inherited from fine bookbinders.",
  "home.step1.title": "Assessment & disassembly",
  "home.step1.text": "I study the work, its history and condition, then carefully take it apart.",
  "home.step2.title": "Sewing & text block",
  "home.step2.text": "The sections are hand-sewn and the body of the book rebuilt.",
  "home.step3.title": "Leather covering & embroidery",
  "home.step3.text": "Full-grain leather covering, enhanced with hand-made embroidery.",
  "home.step4.title": "Gilding & finishing",
  "home.step4.text": "Titles and motifs gold-tooled, finishing and protection of the work.",
  "home.services.title": "What I offer",
  "home.service1.title": "Bible restoration",
  "home.service1.text": "Bringing old and family Bibles back to life, passed down through generations.",
  "home.service2.title": "Bespoke embroidered Bibles",
  "home.service2.text": "Creating a unique Bible, leather-bound and embroidered to your wishes.",
  "home.service3.title": "Religious books & missals",
  "home.service3.text": "Binding and restoring missals, evangeliaries and liturgical works.",
  "home.service4.title": "General binding & restoration",
  "home.service4.text": "Notebooks, registers and secular works, with the same workshop care.",
  "home.featured.title": "Featured creations",
  "home.featured.empty": "New creations will be shown here soon.",
  "home.testimonials.title": "They trusted me",
  "home.testi1.text": "My family Bible, worn by time, regained all its dignity. Masterful work.",
  "home.testi1.author": "Marie-Hélène, Lyon",
  "home.testi2.text": "The embroidered Bible given for our wedding is a marvel. An heirloom.",
  "home.testi2.author": "Paul & Agnès, Nantes",
  "home.testi3.text": "Restoration of a 19th-century missal: precision, care and an exceptional result.",
  "home.testi3.author": "Father Joseph, Tours",
  "home.cta.title": "A Bible to restore, a project to create?",
  "home.cta.text": "Entrust me with your work, or let's imagine a unique piece together.",
  "home.cta.shop": "Visit the shop",
  "home.cta.custom": "Request a quote",
  "about.title": "The workshop",
  "about.lead": "As a bookbinder, I devote my craft to the sacred book and its transmission.",
  "about.p1": "From the workshop, I restore Bibles entrusted to me — often rich with family history — and create unique pieces, leather-bound and enhanced with hand-made embroidery.",
  "about.p2": "My approach: absolute respect for the object, fine materials (full-grain leather, linen thread, gold tooling) and the patience of traditional gestures.",
  "about.p3": "Each work is an encounter. Whether a century-old Bible or a missal to protect, I am committed to restoring all its nobility.",
  "about.values.title": "My commitments",
  "about.value1": "Fine, durable materials",
  "about.value2": "Traditional craftsmanship",
  "about.value3": "Respect for the entrusted object",
  "faq.title": "Frequently asked questions",
  "faq.q1": "What are your lead times?",
  "faq.a1": "Allow 3 to 6 weeks depending on the work. A precise timeline is given with the quote.",
  "faq.q2": "How does a quote work?",
  "faq.a2": "Describe your project via the bespoke form; I reply with a detailed proposal.",
  "faq.q3": "Can I send you my Bible by post?",
  "faq.a3": "Yes. I recommend tracked, insured shipping; I keep you informed at every step.",
  "faq.q4": "Do you ship abroad?",
  "faq.a4": "Yes, I ship within France and internationally, with tracking.",
  "faq.q5": "How do I care for a leather binding?",
  "faq.a5": "Away from humidity and direct sun; a suitable leather care once or twice a year.",
  "nav.faq": "FAQ"
```

- [ ] **Step 3 : Vérifier la parité i18n**

Run : `npm test`
Expected : tous les tests passent, dont `i18n.test.ts` (même ensemble de clés, aucune valeur vide). Si échec de parité, comparer les clés FR vs EN et corriger.

- [ ] **Step 4 : Commit**

```bash
git add public/i18n/fr.json public/i18n/en.json
git commit -m "feat: i18n strings for enriched content (savoir-faire, services, testimonials, FAQ, about)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 : Composants CSS additifs (steps, services, testimonials, faq, cta-band)

> Appliquer le skill `frontend-design`. Cohérence avec la palette/typo existante. Ne renomme aucune classe existante.

**Files:**
- Modify: `public/css/style.css` (ajouter à la fin)

- [ ] **Step 1 : Ajouter les styles à la fin de `public/css/style.css`**

```css
/* ═══ Plan 2 — composants de contenu ═══ */

/* Savoir-faire : étapes numérotées */
.steps { display: grid; gap: 1.6rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 2rem; }
.step { text-align: center; padding: 1.4rem 1rem; }
.step .step-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 3rem; height: 3rem; margin-bottom: 0.8rem;
  border: 1px solid var(--gold-deep); border-radius: 50%;
  font-family: var(--font-display); font-size: 1.3rem; color: var(--gold-deep);
}
.step h3 { font-size: 1.2rem; }
.step p { font-size: 1rem; }

/* Services : cartes */
.services { display: grid; gap: 1.4rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-top: 2rem; }
.service-card {
  background: var(--cream); border: 1px solid var(--line); border-radius: 3px;
  padding: 1.6rem 1.4rem; transition: transform .2s, box-shadow .2s;
}
.service-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(66,10,25,0.12); }
.service-card h3 { font-size: 1.25rem; }

/* Témoignages */
.testimonials { display: grid; gap: 1.4rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin-top: 2rem; }
.testimonial {
  background: var(--bg); border-left: 3px solid var(--gold-deep);
  padding: 1.4rem 1.5rem; font-style: italic; color: var(--text-soft);
}
.testimonial .author { display: block; margin-top: 0.8rem; font-style: normal; color: var(--accent); font-family: var(--font-display); }

/* Bandeau d'appel */
.cta-band { background: var(--burgundy-deep); color: var(--cream); text-align: center; }
.cta-band h2 { color: var(--cream); }
.cta-band p { color: rgba(240,234,216,0.85); }
.cta-band .btn { margin: 0.4rem; }

/* FAQ : accordéon */
.faq { max-width: 760px; margin: 2rem auto 0; }
.faq-item { border-bottom: 1px solid var(--line); }
.faq-q {
  width: 100%; text-align: left; background: none; border: none; cursor: pointer;
  font-family: var(--font-display); font-size: 1.2rem; color: var(--accent);
  padding: 1.1rem 2rem 1.1rem 0; position: relative;
}
.faq-q::after { content: '+'; position: absolute; right: 0.3rem; top: 50%; transform: translateY(-50%); color: var(--gold-deep); font-size: 1.4rem; }
.faq-item.open .faq-q::after { content: '−'; }
.faq-a { max-height: 0; overflow: hidden; transition: max-height .3s ease; }
.faq-item.open .faq-a { max-height: 400px; }
.faq-a p { padding: 0 0 1.1rem; }

/* Valeurs (À propos) */
.values { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center; margin-top: 1.5rem; list-style: none; padding: 0; }
.values li { background: var(--cream); border: 1px solid var(--line); border-radius: 2px; padding: 0.7rem 1.2rem; font-family: var(--font-display); color: var(--accent); }

/* Boutique : filtres + badges */
.filters { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin: 1.5rem 0 2.5rem; }
.filter-btn {
  background: transparent; border: 1px solid var(--line); border-radius: 2px; cursor: pointer;
  font-family: var(--font-body); font-size: 0.95rem; color: var(--text-soft); padding: 0.45rem 1rem;
  transition: background .2s, color .2s, border-color .2s;
}
.filter-btn:hover { border-color: var(--gold-deep); color: var(--accent); }
.filter-btn.active { background: var(--accent); color: var(--cream); border-color: var(--accent); }
.badge {
  display: inline-block; font-size: 0.78rem; letter-spacing: 0.04em; padding: 0.15rem 0.6rem;
  border-radius: 2px; background: var(--gold); color: var(--burgundy-deep); font-family: var(--font-display);
}
.badge--sold { background: var(--sage-deep); color: var(--cream); }
.card .price { font-family: var(--font-display); color: var(--accent); font-size: 1.15rem; margin-top: 0.4rem; }

/* Fiche produit */
.product { display: grid; gap: 2.5rem; grid-template-columns: 1fr; align-items: start; }
@media (min-width: 820px) { .product { grid-template-columns: 1.1fr 1fr; } }
.gallery .gallery-main img { width: 100%; aspect-ratio: 3/4; object-fit: cover; border: 1px solid var(--line); }
.gallery .thumbs { display: flex; gap: 0.6rem; margin-top: 0.6rem; flex-wrap: wrap; }
.gallery .thumbs img { width: 72px; height: 90px; object-fit: cover; border: 1px solid var(--line); cursor: pointer; opacity: 0.7; }
.gallery .thumbs img.active { opacity: 1; border-color: var(--gold-deep); }
.product-info .price { font-family: var(--font-display); font-size: 1.6rem; color: var(--accent); }
.product-info .cat { color: var(--sage-deep); font-style: italic; }

/* Admin (utilitaire, sobre) */
.admin-wrap { max-width: 960px; margin: 0 auto; }
.admin-table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
.admin-table th, .admin-table td { text-align: left; padding: 0.6rem 0.7rem; border-bottom: 1px solid var(--line); font-size: 0.95rem; }
.admin-table th { font-family: var(--font-display); color: var(--accent); }
.admin-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.btn--sm { font-size: 0.85rem; padding: 0.35em 0.9em; }
.btn--danger { background: #7a1d1d; border-color: #7a1d1d; }
.admin-thumbs { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.admin-thumbs figure { margin: 0; text-align: center; }
.admin-thumbs img { width: 80px; height: 100px; object-fit: cover; border: 1px solid var(--line); }
.hidden { display: none !important; }
```

- [ ] **Step 2 : Vérifier (pas de régression)**

Run : `npm test`
Expected : 7+ tests passent (CSS n'affecte pas les tests).

- [ ] **Step 3 : Commit**

```bash
git add public/css/style.css
git commit -m "feat: additive CSS components (steps, services, testimonials, faq, shop, product, admin)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 : Page d'accueil enrichie

> Appliquer le skill `frontend-design`.

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1 : Remplacer le `<main>` de `public/index.html`**

Conserver `<head>` (titre/desc peuvent être ajustés), `#site-header`, `#site-footer` et les `<script>`. Ajouter `<script src="/js/categories.js"></script>` avant `/js/layout.js` n'est pas nécessaire ici. Remplacer le contenu de `<main>` par :

```html
  <main>
    <section class="hero" style="--hero-image: url('/images/hero.jpg');">
      <div class="container">
        <h1 data-i18n="home.hero.title"></h1>
        <p data-i18n="home.hero.subtitle"></p>
        <a class="btn" href="/boutique" data-i18n="home.hero.cta"></a>
      </div>
    </section>

    <section class="section center">
      <div class="container">
        <h2 data-i18n="home.savoirfaire.title"></h2>
        <div class="rule"></div>
        <p style="max-width:60ch;margin-inline:auto" data-i18n="home.savoirfaire.intro"></p>
        <div class="steps">
          <div class="step"><span class="step-num">I</span><h3 data-i18n="home.step1.title"></h3><p data-i18n="home.step1.text"></p></div>
          <div class="step"><span class="step-num">II</span><h3 data-i18n="home.step2.title"></h3><p data-i18n="home.step2.text"></p></div>
          <div class="step"><span class="step-num">III</span><h3 data-i18n="home.step3.title"></h3><p data-i18n="home.step3.text"></p></div>
          <div class="step"><span class="step-num">IV</span><h3 data-i18n="home.step4.title"></h3><p data-i18n="home.step4.text"></p></div>
        </div>
      </div>
    </section>

    <section class="section section--alt">
      <div class="container center">
        <h2 data-i18n="home.services.title"></h2>
        <div class="rule"></div>
        <div class="services">
          <div class="service-card"><h3 data-i18n="home.service1.title"></h3><p data-i18n="home.service1.text"></p></div>
          <div class="service-card"><h3 data-i18n="home.service2.title"></h3><p data-i18n="home.service2.text"></p></div>
          <div class="service-card"><h3 data-i18n="home.service3.title"></h3><p data-i18n="home.service3.text"></p></div>
          <div class="service-card"><h3 data-i18n="home.service4.title"></h3><p data-i18n="home.service4.text"></p></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container center">
        <h2 data-i18n="home.featured.title"></h2>
        <div class="rule"></div>
        <div class="grid" id="featured-grid"></div>
        <p id="featured-empty" class="hidden" data-i18n="home.featured.empty"></p>
      </div>
    </section>

    <section class="section section--alt">
      <div class="container center">
        <h2 data-i18n="home.testimonials.title"></h2>
        <div class="rule"></div>
        <div class="testimonials">
          <blockquote class="testimonial"><span data-i18n="home.testi1.text"></span><span class="author" data-i18n="home.testi1.author"></span></blockquote>
          <blockquote class="testimonial"><span data-i18n="home.testi2.text"></span><span class="author" data-i18n="home.testi2.author"></span></blockquote>
          <blockquote class="testimonial"><span data-i18n="home.testi3.text"></span><span class="author" data-i18n="home.testi3.author"></span></blockquote>
        </div>
      </div>
    </section>

    <section class="section cta-band">
      <div class="container">
        <h2 data-i18n="home.cta.title"></h2>
        <p data-i18n="home.cta.text"></p>
        <a class="btn" href="/boutique" data-i18n="home.cta.shop"></a>
        <a class="btn btn--ghost" href="/sur-mesure" data-i18n="home.cta.custom"></a>
      </div>
    </section>
  </main>
```

- [ ] **Step 2 : Alimenter la grille « en vedette » depuis l'API**

Ajouter, juste avant `</body>` (après `/js/layout.js`), un petit script inline OU un fichier. Pour rester propre, créer `public/js/featured.js` :

```js
/* Charge jusqu'à 3 produits disponibles dans #featured-grid. */
document.addEventListener('i18n:ready', () => loadFeatured(), { once: true });
async function loadFeatured() {
  const grid = document.getElementById('featured-grid');
  const empty = document.getElementById('featured-empty');
  if (!grid) return;
  try {
    const res = await fetch('/api/products');
    const items = res.ok ? await res.json() : [];
    const lang = window.I18N ? window.I18N.current : 'fr';
    const top = items.slice(0, 3);
    if (top.length === 0) { empty.classList.remove('hidden'); return; }
    grid.innerHTML = top.map((p) => cardHTML(p, lang)).join('');
  } catch { if (empty) empty.classList.remove('hidden'); }
}
function cardHTML(p, lang) {
  const title = lang === 'en' ? p.title_en : p.title_fr;
  const img = p.image_url || '/images/placeholder-1.jpg';
  const price = Number(p.price).toFixed(2);
  return `<a class="card" href="/produit/${encodeURIComponent(p.slug)}">
    <img src="${img}" alt="${escapeAttr(title)}" />
    <div class="card-body"><h3>${escapeHtml(title)}</h3><div class="price">${price} €</div></div>
  </a>`;
}
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function escapeAttr(s){return escapeHtml(s).replace(/"/g,'&quot;');}
```

Et l'inclure dans `index.html` avant `</body>` :
```html
  <script src="/js/featured.js"></script>
```

Note : `loadFeatured` dépend de l'API `GET /api/products` (Lot 2, Task 7). Avant que le Lot 2 soit fait, la grille restera vide et affichera le message « bientôt » — comportement acceptable. `escapeHtml`/`escapeAttr` sont aussi utilisés ailleurs ; si tu factorises, mets-les dans un util partagé `public/js/util.js` et adapte les imports — sinon garde-les locaux (le plan suppose locaux pour rester simple).

- [ ] **Step 3 : Vérification visuelle**

Run : `npm run dev` puis ouvrir `/`.
Expected : sections savoir-faire, services, témoignages, bandeau s'affichent stylées et bilingues. Grille en vedette vide (normal tant que le Lot 2 n'est pas là).

- [ ] **Step 4 : Commit**

```bash
git add public/index.html public/js/featured.js
git commit -m "feat: enriched home page (savoir-faire, services, testimonials, CTA) + featured loader

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5 : Page À propos enrichie + page FAQ + routes + lien nav

> Appliquer le skill `frontend-design`.

**Files:**
- Modify: `public/a-propos.html`
- Create: `public/faq.html`
- Create: `public/js/faq.js`
- Modify: `src/routes/pages.ts`
- Modify: `public/js/layout.js`

- [ ] **Step 1 : Remplacer le `<main>` de `public/a-propos.html`**

```html
  <main>
    <section class="section">
      <div class="container" style="max-width:760px">
        <h1 class="center" data-i18n="about.title"></h1>
        <div class="rule"></div>
        <p style="font-size:1.25rem;color:var(--text)" data-i18n="about.lead"></p>
        <p data-i18n="about.p1"></p>
        <img src="/images/atelier.jpg" alt="" style="width:100%;border:1px solid var(--line);margin:1.5rem 0" />
        <p data-i18n="about.p2"></p>
        <p data-i18n="about.p3"></p>
        <h2 class="center" style="margin-top:2.5rem" data-i18n="about.values.title"></h2>
        <ul class="values">
          <li data-i18n="about.value1"></li>
          <li data-i18n="about.value2"></li>
          <li data-i18n="about.value3"></li>
        </ul>
      </div>
    </section>
  </main>
```

- [ ] **Step 2 : Télécharger une image d'atelier libre de droits**

```bash
curl -L -o public/images/atelier.jpg "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1200&q=80"
```
Vérifier `file public/images/atelier.jpg` → JPEG, taille > 10 Ko. Ajouter la source à `public/images/CREDITS.md`.

- [ ] **Step 3 : Créer `public/faq.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reliure — FAQ</title>
  <meta name="description" content="Questions fréquentes sur la restauration et la création de reliures et de bibles." />
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
  <header class="site-header" id="site-header"></header>
  <main>
    <section class="section">
      <div class="container">
        <h1 class="center" data-i18n="faq.title"></h1>
        <div class="rule"></div>
        <div class="faq">
          <div class="faq-item"><button class="faq-q" data-i18n="faq.q1"></button><div class="faq-a"><p data-i18n="faq.a1"></p></div></div>
          <div class="faq-item"><button class="faq-q" data-i18n="faq.q2"></button><div class="faq-a"><p data-i18n="faq.a2"></p></div></div>
          <div class="faq-item"><button class="faq-q" data-i18n="faq.q3"></button><div class="faq-a"><p data-i18n="faq.a3"></p></div></div>
          <div class="faq-item"><button class="faq-q" data-i18n="faq.q4"></button><div class="faq-a"><p data-i18n="faq.a4"></p></div></div>
          <div class="faq-item"><button class="faq-q" data-i18n="faq.q5"></button><div class="faq-a"><p data-i18n="faq.a5"></p></div></div>
        </div>
      </div>
    </section>
  </main>
  <footer class="site-footer" id="site-footer"></footer>
  <script src="/js/i18n.js"></script>
  <script src="/js/layout.js"></script>
  <script src="/js/faq.js"></script>
</body>
</html>
```

- [ ] **Step 4 : Créer `public/js/faq.js`** (accordéon accessible)

```js
/* Accordéon FAQ — ouvre/ferme au clic, accessible clavier (les boutons le sont nativement). */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.faq-item .faq-q').forEach((btn) => {
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const open = item.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
});
```

- [ ] **Step 5 : Ajouter les routes `/faq` (et préparer `/sur-mesure`) dans `src/routes/pages.ts`**

Remplacer l'objet `PAGE_ALIASES` par :
```ts
const PAGE_ALIASES: Record<string, string> = {
  '/': 'index.html',
  '/a-propos': 'a-propos.html',
  '/contact': 'contact.html',
  '/faq': 'faq.html',
  '/boutique': 'boutique.html',
};
```
Note : `/boutique` est ajouté ici (la page est créée au Lot 2). `/sur-mesure` et `/compte` restent volontairement non mappés (Plans futurs) ; `/sur-mesure` pointé par des liens renverra 404 jusqu'au Plan 5 — acceptable, ou tu peux faire pointer le lien CTA vers `/contact` pour l'instant (voir Task 4 : le lien `home.cta.custom` va vers `/sur-mesure`). Pour éviter un 404 visible, **change dans `index.html` le `href="/sur-mesure"` en `href="/contact"`** dans le bandeau CTA (Task 4 Step 1) — fais-le maintenant si pas déjà fait.

- [ ] **Step 6 : Ajouter le lien FAQ dans la nav (`public/js/layout.js`)**

Dans `headerHTML()`, ajouter le lien FAQ entre « contact » et « compte » (ou après contact) :
```html
          <a href="/faq" data-i18n="nav.faq"></a>
```
(Insérer la ligne dans la chaîne template de `headerHTML`, à côté des autres `<a>`. Ne pas toucher au reste.)

- [ ] **Step 7 : Vérification**

Run : `npm test` (parité i18n OK) puis `npm run dev` :
- `/a-propos` → page étoffée avec image atelier
- `/faq` → accordéon fonctionne (clic ouvre/ferme), bilingue
- la nav affiche « FAQ »

- [ ] **Step 8 : Commit**

```bash
git add public/a-propos.html public/faq.html public/js/faq.js src/routes/pages.ts public/js/layout.js public/images/atelier.jpg public/images/CREDITS.md
git commit -m "feat: enriched about page, FAQ page with accordion, nav link and routes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# LOT 2 — Catalogue (boutique + fiches produits)

### Task 6 : Accès données produits (`src/lib/products.ts`) + tests

**Files:**
- Create: `src/lib/products.ts`
- Create: `test/products.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

`test/products.test.ts` — on teste la logique de transformation sans toucher au vrai réseau, en injectant un faux client Supabase :
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listProducts, getProductBySlug } from '../src/lib/products';

/** Faux client Supabase minimal, façonné pour les requêtes utilisées. */
function fakeSupabase(rows: any[]) {
  const builder: any = {
    _filters: {},
    select() { return this; },
    eq(col: string, val: any) { this._filters[col] = val; return this; },
    order() { return this; },
    then(resolve: any) {
      let data = rows;
      if (this._filters.status) data = data.filter((r) => r.status === this._filters.status);
      if (this._filters.category) data = data.filter((r) => r.category === this._filters.category);
      resolve({ data, error: null });
    },
    maybeSingle() {
      let data = rows;
      if (this._filters.slug) data = data.filter((r) => r.slug === this._filters.slug);
      if (this._filters.status) data = data.filter((r) => r.status === this._filters.status);
      return Promise.resolve({ data: data[0] ?? null, error: null });
    },
  };
  return { from() { return builder; } } as any;
}

const ROWS = [
  { id: '1', slug: 'bible-a', title_fr: 'Bible A', category: 'bibles-restaurees', status: 'disponible', price: 200 },
  { id: '2', slug: 'bible-b', title_fr: 'Bible B', category: 'bibles-brodees', status: 'disponible', price: 300 },
  { id: '3', slug: 'brouillon', title_fr: 'Brouillon', category: 'bibles-restaurees', status: 'brouillon', price: 0 },
];

test('listProducts ne renvoie que les produits disponibles', async () => {
  const out = await listProducts(fakeSupabase(ROWS));
  assert.equal(out.length, 2);
  assert.ok(out.every((p) => p.status === 'disponible'));
});

test('listProducts filtre par catégorie', async () => {
  const out = await listProducts(fakeSupabase(ROWS), 'bibles-brodees');
  assert.equal(out.length, 1);
  assert.equal(out[0].slug, 'bible-b');
});

test('getProductBySlug renvoie le produit', async () => {
  const out = await getProductBySlug(fakeSupabase(ROWS), 'bible-a');
  assert.equal(out?.slug, 'bible-a');
});

test('getProductBySlug renvoie null si introuvable', async () => {
  const out = await getProductBySlug(fakeSupabase(ROWS), 'inconnu');
  assert.equal(out, null);
});
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run : `npm test`
Expected : FAIL — `Cannot find module '../src/lib/products'`.

- [ ] **Step 3 : Implémenter `src/lib/products.ts`**

```ts
import { SupabaseClient } from '@supabase/supabase-js';

export interface ProductRow {
  id: string;
  slug: string;
  title_fr: string;
  title_en: string;
  description_fr: string | null;
  description_en: string | null;
  price: number;
  category: string | null;
  status: 'brouillon' | 'disponible' | 'vendu';
  weight_grams: number;
  created_at: string;
  updated_at: string;
}

/** Liste les produits disponibles, optionnellement filtrés par catégorie. */
export async function listProducts(sb: SupabaseClient, category?: string): Promise<ProductRow[]> {
  let q = sb.from('products').select('*').eq('status', 'disponible');
  if (category) q = q.eq('category', category);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductRow[];
}

/** Récupère un produit disponible par slug, ou null. */
export async function getProductBySlug(sb: SupabaseClient, slug: string): Promise<ProductRow | null> {
  const { data, error } = await sb
    .from('products').select('*')
    .eq('slug', slug).eq('status', 'disponible')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProductRow) ?? null;
}
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run : `npm test`
Expected : PASS (4 nouveaux tests products + existants).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/products.ts test/products.test.ts
git commit -m "feat: product data access (listProducts, getProductBySlug) with tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7 : API publique catalogue (`src/routes/products.ts`) + branchement

**Files:**
- Create: `src/routes/products.ts`
- Modify: `src/app.ts`

- [ ] **Step 1 : Implémenter `src/routes/products.ts`**

```ts
import { Express, Request, Response } from 'express';
import { getSupabase } from '../lib/clients';
import { listProducts, getProductBySlug } from '../lib/products';

/** URL publique d'un objet du bucket Storage product-images. */
function imageUrl(storagePath: string): string {
  const base = process.env.SUPABASE_URL!.replace(/\/$/, '');
  return `${base}/storage/v1/object/public/product-images/${storagePath}`;
}

export function registerProductRoutes(app: Express): void {
  // Liste (avec 1ère image)
  app.get('/api/products', async (req: Request, res: Response): Promise<void> => {
    try {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const sb = getSupabase();
      const products = await listProducts(sb, category);
      // 1ère image de chaque produit
      const ids = products.map((p) => p.id);
      let imagesByProduct: Record<string, string> = {};
      if (ids.length) {
        const { data: imgs } = await sb
          .from('product_images').select('product_id, storage_path, sort_order')
          .in('product_id', ids).order('sort_order', { ascending: true });
        for (const im of imgs ?? []) {
          if (!(im.product_id in imagesByProduct)) imagesByProduct[im.product_id] = imageUrl(im.storage_path);
        }
      }
      res.json(products.map((p) => ({ ...p, image_url: imagesByProduct[p.id] || null })));
    } catch (err: any) {
      console.error('GET /api/products', err.message);
      res.status(500).json({ error: 'Erreur de chargement des produits.' });
    }
  });

  // Détail + toutes les images
  app.get('/api/products/:slug', async (req: Request, res: Response): Promise<void> => {
    try {
      const sb = getSupabase();
      const product = await getProductBySlug(sb, req.params.slug);
      if (!product) { res.status(404).json({ error: 'Produit introuvable.' }); return; }
      const { data: imgs } = await sb
        .from('product_images').select('storage_path, alt_fr, alt_en, sort_order')
        .eq('product_id', product.id).order('sort_order', { ascending: true });
      const images = (imgs ?? []).map((im) => ({ url: imageUrl(im.storage_path), alt_fr: im.alt_fr, alt_en: im.alt_en }));
      res.json({ ...product, images });
    } catch (err: any) {
      console.error('GET /api/products/:slug', err.message);
      res.status(500).json({ error: 'Erreur de chargement du produit.' });
    }
  });
}
```

- [ ] **Step 2 : Brancher dans `src/app.ts`**

Ajouter l'import en haut :
```ts
import { registerProductRoutes } from './routes/products';
```
Et l'appel juste après `registerContactRoutes(app);` :
```ts
  registerProductRoutes(app);
```

- [ ] **Step 3 : Ajouter la route serveur `/produit/:slug`**

Dans `src/routes/pages.ts`, après la boucle `PAGE_ALIASES`, ajouter une route paramétrée servant le même fichier HTML (le slug est lu côté client) :
```ts
  // Fiche produit — le HTML est statique, le slug est résolu côté client via l'API.
  app.get('/produit/:slug', (_req, res) => {
    res.sendFile(path.join(publicDir, 'produit.html'));
  });
```
(Garder l'`import path` déjà présent.)

- [ ] **Step 4 : Vérifier (avec la vraie base)**

Run : `npm test` (tout vert) puis `npm run dev` et :
```bash
curl -s localhost:3000/api/products | head -c 200
```
Expected : `[]` (aucun produit `disponible` encore) ou la liste si des produits existent. Pas d'erreur 500.

- [ ] **Step 5 : Commit**

```bash
git add src/routes/products.ts src/app.ts src/routes/pages.ts
git commit -m "feat: public catalogue API (list/detail) + product page route

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8 : Page Boutique + fiche produit (front)

> Appliquer le skill `frontend-design`.

**Files:**
- Create: `public/boutique.html`
- Create: `public/js/boutique.js`
- Create: `public/produit.html`
- Create: `public/js/produit.js`

- [ ] **Step 1 : Créer `public/boutique.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reliure — Boutique</title>
  <meta name="description" content="Découvrez les créations : bibles restaurées et brodées, livres religieux, coffrets sacrés." />
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
  <header class="site-header" id="site-header"></header>
  <main>
    <section class="section">
      <div class="container">
        <h1 class="center" data-i18n="nav.shop"></h1>
        <div class="rule"></div>
        <div class="filters" id="filters"></div>
        <div class="grid" id="shop-grid"></div>
        <p id="shop-empty" class="center hidden" data-i18n="home.featured.empty"></p>
      </div>
    </section>
  </main>
  <footer class="site-footer" id="site-footer"></footer>
  <script src="/js/i18n.js"></script>
  <script src="/js/categories.js"></script>
  <script src="/js/layout.js"></script>
  <script src="/js/boutique.js"></script>
</body>
</html>
```

- [ ] **Step 2 : Créer `public/js/boutique.js`**

```js
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
    <img src="${img}" alt="${esc(title, true)}" />
    <div class="card-body">${badge}<h3>${esc(title)}</h3><div class="price">${Number(p.price).toFixed(2)} €</div></div>
  </a>`;
}
function esc(s, attr){let o=String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');return attr?o.replace(/"/g,'&quot;'):o;}
```

Note : `GET /api/products` ne renvoie que les `disponible`, donc le badge « Vendu » n'apparaîtra en pratique pas via cette route ; il est prévu pour cohérence si l'API évolue. C'est volontaire et sans effet de bord.

- [ ] **Step 3 : Créer `public/produit.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reliure — Création</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
  <header class="site-header" id="site-header"></header>
  <main>
    <section class="section">
      <div class="container">
        <div id="product-root"><p class="center" data-i18n="product.loading"></p></div>
      </div>
    </section>
  </main>
  <footer class="site-footer" id="site-footer"></footer>
  <script src="/js/i18n.js"></script>
  <script src="/js/categories.js"></script>
  <script src="/js/layout.js"></script>
  <script src="/js/produit.js"></script>
</body>
</html>
```

- [ ] **Step 4 : Créer `public/js/produit.js`**

```js
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
```

- [ ] **Step 5 : Ajouter les clés i18n `product.loading`**

Dans `public/i18n/fr.json` ajouter `"product.loading": "Chargement…"` et dans `en.json` `"product.loading": "Loading…"`.

- [ ] **Step 6 : Vérification**

Run : `npm test` (parité OK) puis `npm run dev` :
- `/boutique` → filtres affichés, grille vide + message (pas encore de produits) ; cliquer un filtre ne plante pas
- `/produit/inexistant` → message « introuvable »

- [ ] **Step 7 : Commit**

```bash
git add public/boutique.html public/js/boutique.js public/produit.html public/js/produit.js public/i18n/fr.json public/i18n/en.json
git commit -m "feat: shop page with category filters and product detail page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# LOT 3 — Admin & Storage

### Task 9 : Bucket Storage + helper `slugify` + tests

**Files:**
- Create: `src/lib/slug.ts`
- Create: `test/slug.test.ts`
- Create: `src/lib/storage.ts`
- Modify: `README.md` (note bucket)

- [ ] **Step 1 : Écrire le test `test/slug.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/lib/slug';

test('slugify met en minuscules et remplace les espaces', () => {
  assert.equal(slugify('Bible Brodée Or'), 'bible-brodee-or');
});
test('slugify retire les accents', () => {
  assert.equal(slugify('Évangéliaire ancien'), 'evangeliaire-ancien');
});
test('slugify supprime la ponctuation', () => {
  assert.equal(slugify('Missel (XIXe) — n°3'), 'missel-xixe-n-3');
});
test('slugify gère les tirets multiples et bords', () => {
  assert.equal(slugify('  --Bible---A--  '), 'bible-a');
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run : `npm test` → FAIL (`Cannot find module '../src/lib/slug'`).

- [ ] **Step 3 : Implémenter `src/lib/slug.ts`**

```ts
/** Transforme un texte en slug URL : minuscules, sans accents, tirets. */
export function slugify(input: string): string {
  return input
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanum → tiret
    .replace(/^-+|-+$/g, '');    // retire les tirets de bord
}
```

- [ ] **Step 4 : Lancer (succès attendu)**

Run : `npm test` → PASS.

- [ ] **Step 5 : Implémenter `src/lib/storage.ts`**

```ts
import { getSupabase } from './clients';

const BUCKET = 'product-images';
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export function isAllowedImage(mime: string): boolean {
  return ALLOWED.includes(mime);
}

/** Téléverse un buffer image, renvoie le storage_path. */
export async function uploadProductImage(
  productId: string, buffer: Buffer, mime: string, ext: string, index: number,
): Promise<string> {
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const path = `${productId}/${Date.now()}-${index}.${safeExt}`;
  const { error } = await getSupabase().storage.from(BUCKET).upload(path, buffer, {
    contentType: mime, upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

/** Supprime un objet du bucket. */
export async function deleteStorageObject(storagePath: string): Promise<void> {
  const { error } = await getSupabase().storage.from(BUCKET).remove([storagePath]);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 6 : Documenter la création du bucket dans `README.md`**

Ajouter une section :
````markdown
## Supabase Storage (images produits)

Créer un bucket **public** nommé `product-images` :
- Dashboard Supabase → Storage → New bucket → nom `product-images`, cocher **Public bucket** → Create.

Ou via SQL (SQL Editor) :
```sql
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;
```
Les uploads passent par la clé service (serveur) ; la lecture est publique.
````

- [ ] **Step 7 : Commit**

```bash
git add src/lib/slug.ts test/slug.test.ts src/lib/storage.ts README.md
git commit -m "feat: slugify helper (tested) + Supabase Storage helpers + bucket docs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10 : API admin — auth + CRUD produits

**Files:**
- Create: `src/routes/admin.ts`
- Modify: `src/app.ts`
- Modify: `package.json` (ajouter `multer`)

- [ ] **Step 1 : Installer multer**

Run :
```bash
npm install multer && npm install -D @types/multer
```
Expected : ajout aux dépendances, pas d'erreur.

- [ ] **Step 2 : Implémenter `src/routes/admin.ts`**

```ts
import { Express, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { getSupabase } from '../lib/clients';
import { slugify } from '../lib/slug';
import { isAllowedImage, uploadProductImage, deleteStorageObject } from '../lib/storage';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.admin) { next(); return; }
  res.status(401).json({ error: 'Non autorisé.' });
}

/** Génère un slug unique (suffixe -2, -3… si collision). */
async function uniqueSlug(base: string): Promise<string> {
  const sb = getSupabase();
  let slug = base || 'piece';
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await sb.from('products').select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
    n += 1; slug = `${base}-${n}`;
  }
}

export function registerAdminRoutes(app: Express): void {
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Trop de tentatives. Réessayez plus tard.' } });

  app.post('/api/admin/login', loginLimiter, (req: Request, res: Response): void => {
    const { password } = req.body as { password?: string };
    if (password && password === process.env.ADMIN_PASSWORD) {
      req.session!.admin = true; res.json({ success: true });
    } else { res.status(401).json({ error: 'Mot de passe incorrect.' }); }
  });

  app.post('/api/admin/logout', (req: Request, res: Response): void => {
    req.session = null; res.json({ success: true });
  });

  app.get('/api/admin/me', (req: Request, res: Response): void => {
    res.json({ admin: !!req.session?.admin });
  });

  // Liste complète (tous statuts)
  app.get('/api/admin/products', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    const { data, error } = await getSupabase().from('products').select('*').order('created_at', { ascending: false });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data ?? []);
  });

  // Créer
  app.post('/api/admin/products', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const b = req.body as any;
    if (!b.title_fr || !b.title_en) { res.status(400).json({ error: 'Titre FR et EN requis.' }); return; }
    const slug = await uniqueSlug(slugify(b.title_fr));
    const row = {
      slug,
      title_fr: b.title_fr, title_en: b.title_en,
      description_fr: b.description_fr ?? null, description_en: b.description_en ?? null,
      price: Number(b.price) || 0,
      category: b.category ?? null,
      status: ['brouillon', 'disponible', 'vendu'].includes(b.status) ? b.status : 'brouillon',
      weight_grams: Number(b.weight_grams) || 500,
    };
    const { data, error } = await getSupabase().from('products').insert(row).select().single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data);
  });

  // Modifier
  app.patch('/api/admin/products/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const b = req.body as any;
    const patch: Record<string, any> = {};
    for (const k of ['title_fr', 'title_en', 'description_fr', 'description_en', 'category']) if (k in b) patch[k] = b[k];
    if ('price' in b) patch.price = Number(b.price) || 0;
    if ('weight_grams' in b) patch.weight_grams = Number(b.weight_grams) || 500;
    if ('status' in b && ['brouillon', 'disponible', 'vendu'].includes(b.status)) patch.status = b.status;
    const { data, error } = await getSupabase().from('products').update(patch).eq('id', req.params.id).select().single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data);
  });

  // Supprimer (images Storage incluses)
  app.delete('/api/admin/products/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const sb = getSupabase();
    const { data: imgs } = await sb.from('product_images').select('storage_path').eq('product_id', req.params.id);
    for (const im of imgs ?? []) { try { await deleteStorageObject(im.storage_path); } catch { /* best effort */ } }
    const { error } = await sb.from('products').delete().eq('id', req.params.id);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ success: true });
  });

  // Upload image
  app.post('/api/admin/products/:id/images', requireAdmin, upload.single('image'), async (req: Request, res: Response): Promise<void> => {
    const file = (req as any).file as { buffer: Buffer; mimetype: string; originalname: string } | undefined;
    if (!file) { res.status(400).json({ error: 'Aucun fichier.' }); return; }
    if (!isAllowedImage(file.mimetype)) { res.status(400).json({ error: 'Format non autorisé (jpeg/png/webp).' }); return; }
    const sb = getSupabase();
    const { data: existing } = await sb.from('product_images').select('id').eq('product_id', req.params.id);
    const index = (existing?.length ?? 0);
    const ext = (file.originalname.split('.').pop() || 'jpg');
    try {
      const storagePath = await uploadProductImage(req.params.id, file.buffer, file.mimetype, ext, index);
      const { data, error } = await sb.from('product_images')
        .insert({ product_id: req.params.id, storage_path: storagePath, sort_order: index }).select().single();
      if (error) { res.status(500).json({ error: error.message }); return; }
      res.json(data);
    } catch (err: any) { res.status(502).json({ error: err.message }); }
  });

  // Supprimer une image
  app.delete('/api/admin/images/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const sb = getSupabase();
    const { data: img } = await sb.from('product_images').select('storage_path').eq('id', req.params.id).maybeSingle();
    if (img) { try { await deleteStorageObject(img.storage_path); } catch { /* best effort */ } }
    const { error } = await sb.from('product_images').delete().eq('id', req.params.id);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ success: true });
  });
}
```

- [ ] **Step 3 : Brancher dans `src/app.ts`**

Import en haut :
```ts
import { registerAdminRoutes } from './routes/admin';
```
Appel après `registerProductRoutes(app);` :
```ts
  registerAdminRoutes(app);
```

- [ ] **Step 4 : Vérifier auth + non-régression**

Run : `npm test` (tout vert) puis `npm run dev` :
```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/admin/products   # attendu 401
curl -s -X POST localhost:3000/api/admin/login -H "Content-Type: application/json" -d '{"password":"dummy-admin-password"}'  # {"success":true} si ADMIN_PASSWORD=dummy-admin-password
```
Expected : 401 sans session ; login renvoie success avec le bon mot de passe (celui du `.env`).

- [ ] **Step 5 : Commit**

```bash
git add src/routes/admin.ts src/app.ts package.json package-lock.json
git commit -m "feat: admin API — auth, product CRUD, image upload/delete via Storage

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11 : Interface admin (front)

> Le style admin peut être sobre/utilitaire (toujours cohérent avec la palette).

**Files:**
- Create: `public/admin.html`
- Create: `public/js/admin.js`
- Modify: `src/routes/pages.ts` (route `/admin`)

- [ ] **Step 1 : Ajouter la route `/admin` dans `src/routes/pages.ts`**

Ajouter `'/admin': 'admin.html'` à l'objet `PAGE_ALIASES`.

- [ ] **Step 2 : Créer `public/admin.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reliure — Administration</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
  <header class="site-header" id="site-header"></header>
  <main>
    <section class="section">
      <div class="container admin-wrap">
        <!-- Connexion -->
        <div id="login-view">
          <h1 class="center">Administration</h1>
          <div class="rule"></div>
          <form id="login-form" style="max-width:360px;margin:0 auto">
            <label class="field"><span>Mot de passe</span><input type="password" name="password" required /></label>
            <button class="btn" type="submit">Se connecter</button>
            <p class="form-note is-error hidden" id="login-error">Mot de passe incorrect.</p>
          </form>
        </div>

        <!-- Tableau de bord -->
        <div id="admin-view" class="hidden">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
            <h1 style="margin:0">Mes créations</h1>
            <div class="admin-actions">
              <button class="btn btn--sm" id="new-btn">+ Nouvelle création</button>
              <button class="btn btn--sm btn--ghost" id="logout-btn">Déconnexion</button>
            </div>
          </div>
          <table class="admin-table">
            <thead><tr><th>Titre (FR)</th><th>Catégorie</th><th>Prix</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody id="products-tbody"></tbody>
          </table>
        </div>

        <!-- Éditeur (création/édition) -->
        <div id="editor-view" class="hidden">
          <button class="btn btn--sm btn--ghost" id="back-btn">← Retour</button>
          <h2 id="editor-title">Nouvelle création</h2>
          <form id="product-form">
            <input type="hidden" name="id" />
            <label class="field"><span>Titre (FR)</span><input name="title_fr" required /></label>
            <label class="field"><span>Titre (EN)</span><input name="title_en" required /></label>
            <label class="field"><span>Description (FR)</span><textarea name="description_fr"></textarea></label>
            <label class="field"><span>Description (EN)</span><textarea name="description_en"></textarea></label>
            <label class="field"><span>Prix (€)</span><input name="price" type="number" step="0.01" min="0" /></label>
            <label class="field"><span>Catégorie</span><select name="category" id="cat-select"></select></label>
            <label class="field"><span>Poids (g)</span><input name="weight_grams" type="number" min="0" value="500" /></label>
            <label class="field"><span>Statut</span>
              <select name="status">
                <option value="brouillon">Brouillon</option>
                <option value="disponible">Disponible</option>
                <option value="vendu">Vendu</option>
              </select>
            </label>
            <button class="btn" type="submit">Enregistrer</button>
            <p class="form-note hidden" id="form-note"></p>
          </form>
          <div id="images-block" class="hidden">
            <h3>Images</h3>
            <div class="admin-thumbs" id="images-list"></div>
            <label class="field"><span>Ajouter une image (jpeg/png/webp, ≤ 5 Mo)</span><input type="file" id="image-input" accept="image/*" /></label>
          </div>
        </div>
      </div>
    </section>
  </main>
  <footer class="site-footer" id="site-footer"></footer>
  <script src="/js/i18n.js"></script>
  <script src="/js/categories.js"></script>
  <script src="/js/layout.js"></script>
  <script src="/js/admin.js"></script>
</body>
</html>
```

- [ ] **Step 3 : Créer `public/js/admin.js`**

```js
/* Panneau admin : connexion, CRUD produits, upload images. */
const $ = (id) => document.getElementById(id);
let EDIT_ID = null;

document.addEventListener('DOMContentLoaded', async () => {
  fillCategorySelect();
  $('login-form').addEventListener('submit', onLogin);
  $('logout-btn').addEventListener('click', onLogout);
  $('new-btn').addEventListener('click', () => openEditor(null));
  $('back-btn').addEventListener('click', showList);
  $('product-form').addEventListener('submit', onSave);
  $('image-input').addEventListener('change', onUpload);
  const me = await fetch('/api/admin/me').then((r) => r.json()).catch(() => ({ admin: false }));
  if (me.admin) { showList(); } else { show('login-view'); }
});

function fillCategorySelect() {
  const sel = $('cat-select');
  sel.innerHTML = (window.CATEGORIES || []).map((c) => `<option value="${c.slug}">${c.fr}</option>`).join('');
}
function show(id) { ['login-view', 'admin-view', 'editor-view'].forEach((v) => $(v).classList.toggle('hidden', v !== id)); }

async function onLogin(e) {
  e.preventDefault();
  const password = new FormData(e.target).get('password');
  const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  if (res.ok) { showList(); } else { $('login-error').classList.remove('hidden'); }
}
async function onLogout() { await fetch('/api/admin/logout', { method: 'POST' }); show('login-view'); }

async function showList() {
  show('admin-view');
  const rows = await fetch('/api/admin/products').then((r) => r.ok ? r.json() : []).catch(() => []);
  $('products-tbody').innerHTML = rows.map(rowHTML).join('') || `<tr><td colspan="5">Aucune création pour l'instant.</td></tr>`;
  document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openEditor(b.getAttribute('data-edit'))));
  document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => onDelete(b.getAttribute('data-del'))));
}
function rowHTML(p) {
  const cat = window.categoryLabel ? window.categoryLabel(p.category, 'fr') : (p.category || '');
  return `<tr>
    <td>${esc(p.title_fr)}</td><td>${esc(cat)}</td><td>${Number(p.price).toFixed(2)} €</td><td>${esc(p.status)}</td>
    <td class="admin-actions">
      <button class="btn btn--sm" data-edit="${p.id}">Éditer</button>
      <button class="btn btn--sm btn--danger" data-del="${p.id}">Suppr.</button>
    </td></tr>`;
}

async function openEditor(id) {
  EDIT_ID = id;
  const f = $('product-form');
  f.reset();
  $('form-note').classList.add('hidden');
  if (id) {
    $('editor-title').textContent = 'Modifier la création';
    const rows = await fetch('/api/admin/products').then((r) => r.json());
    const p = rows.find((x) => x.id === id);
    if (p) { for (const k of ['title_fr','title_en','description_fr','description_en','price','category','weight_grams','status']) if (f[k]) f[k].value = p[k] ?? ''; }
    f.id.value = id;
    $('images-block').classList.remove('hidden');
    loadImages(id);
  } else {
    $('editor-title').textContent = 'Nouvelle création';
    $('images-block').classList.add('hidden'); // images après 1ère sauvegarde
  }
  show('editor-view');
}

async function onSave(e) {
  e.preventDefault();
  const f = e.target;
  const body = {};
  for (const k of ['title_fr','title_en','description_fr','description_en','price','category','weight_grams','status']) body[k] = f[k].value;
  const url = EDIT_ID ? `/api/admin/products/${EDIT_ID}` : '/api/admin/products';
  const method = EDIT_ID ? 'PATCH' : 'POST';
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const note = $('form-note');
  if (res.ok) {
    const saved = await res.json();
    note.textContent = 'Enregistré ✓'; note.className = 'form-note is-success';
    if (!EDIT_ID) { EDIT_ID = saved.id; $('images-block').classList.remove('hidden'); loadImages(saved.id); $('editor-title').textContent = 'Modifier la création'; }
  } else { note.textContent = 'Erreur lors de l\'enregistrement.'; note.className = 'form-note is-error'; }
  note.classList.remove('hidden');
}

async function onDelete(id) {
  if (!confirm('Supprimer définitivement cette création ?')) return;
  await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
  showList();
}

async function loadImages(id) {
  // Réutilise l'API publique du détail si dispo ; sinon liste via admin (ici, simple: via produit non publié → on liste depuis product_images par fetch admin dédié non requis)
  const list = $('images-list');
  const data = await fetch(`/api/admin/products`).then(() => null).catch(() => null); // placeholder no-op
  // On récupère les images en interrogeant l'endpoint public détail seulement si disponible ; sinon vide.
  list.innerHTML = '';
}

async function onUpload(e) {
  if (!EDIT_ID) return;
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData(); fd.append('image', file);
  const res = await fetch(`/api/admin/products/${EDIT_ID}/images`, { method: 'POST', body: fd });
  if (res.ok) { e.target.value = ''; loadImages(EDIT_ID); alert('Image ajoutée ✓'); }
  else { alert('Échec de l\'upload (format ou taille ?)'); }
}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
```

Note importante sur `loadImages` : pour afficher/supprimer les images dans l'admin il faut lister les images d'un produit **quel que soit son statut**. L'API publique `/api/products/:slug` ne renvoie que les produits `disponible`. **Ajoute donc** dans `src/routes/admin.ts` une route `GET /api/admin/products/:id/images` (protégée) qui renvoie les `product_images` du produit (id, url publique, sort_order), et implémente `loadImages()` pour l'appeler et afficher chaque image avec un bouton « Supprimer » (DELETE `/api/admin/images/:id`). Le helper d'URL publique (`imageUrl`) de `src/routes/products.ts` doit être exporté et réutilisé (DRY) — déplace-le dans `src/lib/storage.ts` sous le nom `publicUrl(storagePath)` et importe-le des deux côtés.

- [ ] **Step 3b : Ajouter `publicUrl` dans `src/lib/storage.ts` et la route images admin**

Dans `src/lib/storage.ts`, ajouter :
```ts
export function publicUrl(storagePath: string): string {
  const base = process.env.SUPABASE_URL!.replace(/\/$/, '');
  return `${base}/storage/v1/object/public/product-images/${storagePath}`;
}
```
Dans `src/routes/products.ts`, remplacer la fonction locale `imageUrl` par l'import `import { publicUrl } from '../lib/storage';` et utiliser `publicUrl(...)`.
Dans `src/routes/admin.ts`, ajouter la route :
```ts
  app.get('/api/admin/products/:id/images', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const { data, error } = await getSupabase()
      .from('product_images').select('id, storage_path, sort_order')
      .eq('product_id', req.params.id).order('sort_order', { ascending: true });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json((data ?? []).map((im) => ({ id: im.id, url: publicUrl(im.storage_path), sort_order: im.sort_order })));
  });
```
et importer `publicUrl` : `import { ..., publicUrl } from '../lib/storage';`

Puis implémenter `loadImages` dans `admin.js` :
```js
async function loadImages(id) {
  const list = $('images-list');
  const imgs = await fetch(`/api/admin/products/${id}/images`).then((r) => r.ok ? r.json() : []).catch(() => []);
  list.innerHTML = imgs.map((im) => `<figure><img src="${im.url}" alt="" /><br><button class="btn btn--sm btn--danger" data-img="${im.id}">Suppr.</button></figure>`).join('');
  list.querySelectorAll('[data-img]').forEach((b) => b.addEventListener('click', async () => {
    await fetch(`/api/admin/images/${b.getAttribute('data-img')}`, { method: 'DELETE' });
    loadImages(id);
  }));
}
```

- [ ] **Step 4 : Vérifier (compilation + auth UI)**

Run : `npm test` puis `npm run build` (compile, 0 erreur TS) puis nettoyer `dist`. Lancer `npm run dev`, ouvrir `/admin` : la vue connexion s'affiche ; après login (mot de passe du `.env`), le tableau de bord apparaît.

- [ ] **Step 5 : Commit**

```bash
git add public/admin.html public/js/admin.js src/routes/pages.ts src/routes/admin.ts src/routes/products.ts src/lib/storage.ts
git commit -m "feat: admin UI (login, product CRUD, image management) + admin images route + shared publicUrl

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12 : Script de données de démo (`scripts/seed.ts`)

**Files:**
- Create: `scripts/seed.ts`
- Modify: `package.json` (script `seed`)

- [ ] **Step 1 : Créer `scripts/seed.ts`**

```ts
/* Données de démo — insère/MAJ des produits par slug (idempotent).
   Usage : npx tsx scripts/seed.ts   (nécessite .env avec les clés Supabase)
   Les images de démo sont téléversées depuis des URLs libres de droits. */
import 'dotenv/config';
import { getSupabase } from '../src/lib/clients';
import { slugify } from '../src/lib/slug';
import { uploadProductImage } from '../src/lib/storage';

interface Seed { title_fr: string; title_en: string; description_fr: string; description_en: string; price: number; category: string; image: string; }

const SEEDS: Seed[] = [
  { title_fr: 'Bible familiale restaurée', title_en: 'Restored family Bible', description_fr: 'Restauration complète d\'une bible du XIXe siècle : couture refaite, cuir nourri, dorure ravivée.', description_en: 'Full restoration of a 19th-century Bible: resewn, nourished leather, revived gilding.', price: 380, category: 'bibles-restaurees', image: 'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=800&q=80' },
  { title_fr: 'Bible brodée « Fleur de lys »', title_en: 'Embroidered Bible "Fleur de lys"', description_fr: 'Bible sur-mesure reliée cuir bordeaux, broderie or fil de soie, tranches dorées.', description_en: 'Bespoke Bible in burgundy leather, gold silk embroidery, gilt edges.', price: 620, category: 'bibles-brodees', image: 'https://images.unsplash.com/photo-1589998059171-988d887df646?w=800&q=80' },
  { title_fr: 'Missel ancien relié', title_en: 'Bound antique missal', description_fr: 'Reliure d\'un missel liturgique, dos à nerfs et fermoirs laiton.', description_en: 'Binding of a liturgical missal, raised bands and brass clasps.', price: 290, category: 'livres-religieux', image: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=800&q=80' },
  { title_fr: 'Écrin de protection cuir', title_en: 'Leather protective case', description_fr: 'Coffret sur-mesure pour bible, intérieur velours, fermeture aimantée.', description_en: 'Bespoke case for a Bible, velvet interior, magnetic closure.', price: 180, category: 'coffrets-sacres', image: 'https://images.unsplash.com/photo-1524578271613-d550eacf6090?w=800&q=80' },
  { title_fr: 'Carnet relié cuir', title_en: 'Leather-bound notebook', description_fr: 'Carnet pleine peau, papier vergé, signet de soie.', description_en: 'Full-leather notebook, laid paper, silk bookmark.', price: 95, category: 'autres-reliures', image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&q=80' },
  { title_fr: 'Évangéliaire doré', title_en: 'Gilded evangeliary', description_fr: 'Évangéliaire relié cuir noir, croix dorée à chaud, tranchefile main.', description_en: 'Evangeliary in black leather, gold-tooled cross, hand-sewn headband.', price: 540, category: 'livres-religieux', image: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=800&q=80' },
];

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch image ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const sb = getSupabase();
  for (const s of SEEDS) {
    const slug = slugify(s.title_fr);
    const row = {
      slug, title_fr: s.title_fr, title_en: s.title_en,
      description_fr: s.description_fr, description_en: s.description_en,
      price: s.price, category: s.category, status: 'disponible', weight_grams: 800,
    };
    const { data: prod, error } = await sb.from('products').upsert(row, { onConflict: 'slug' }).select().single();
    if (error) { console.error('upsert', slug, error.message); continue; }
    // image si le produit n'en a pas déjà
    const { data: existing } = await sb.from('product_images').select('id').eq('product_id', prod.id);
    if ((existing?.length ?? 0) === 0) {
      try {
        const buf = await fetchBuffer(s.image);
        const p = await uploadProductImage(prod.id, buf, 'image/jpeg', 'jpg', 0);
        await sb.from('product_images').insert({ product_id: prod.id, storage_path: p, sort_order: 0 });
        console.log('✓', slug, '(+image)');
      } catch (e: any) { console.warn('image', slug, e.message); }
    } else { console.log('✓', slug, '(déjà des images)'); }
  }
  console.log('Seed terminé.');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2 : Ajouter le script npm**

Dans `package.json`, section `scripts`, ajouter :
```json
    "seed": "tsx scripts/seed.ts"
```

- [ ] **Step 3 : Exécuter le seed** (nécessite le bucket `product-images` créé — voir Task 9 Step 6)

Run : `npm run seed`
Expected : 6 lignes `✓ <slug> (+image)`. Si le bucket n'existe pas encore, créer le bucket d'abord, puis relancer (idempotent).

- [ ] **Step 4 : Vérifier la boutique**

Run : `npm run dev`, ouvrir `/boutique` → 6 créations affichées avec images, filtres par catégorie fonctionnels. Ouvrir une fiche → galerie + détails. La grille « en vedette » de l'accueil affiche 3 créations.

- [ ] **Step 5 : Commit**

```bash
git add scripts/seed.ts package.json
git commit -m "feat: demo data seed script (idempotent, with Storage images)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (auteur du plan)

**Couverture de la spec :**
- §3 Catégories → Task 1 (mapping) + utilisées partout. ✅
- §4 Contenu enrichi (savoir-faire/services/témoignages/CTA/À propos/FAQ) → Tasks 2,3,4,5. ✅
- §5 Catalogue (boutique, fiche, API, seed) → Tasks 6,7,8,12. ✅
- §6 Admin (auth, CRUD, upload) → Tasks 9,10,11. ✅
- §7 Storage bucket → Task 9 (helpers + doc) + Task 12 (usage). ✅
- §8 Architecture/fichiers → respectée (lib/ routes/ séparés). ✅
- §9 Sécurité (requireAdmin, MIME, taille, échappement) → Tasks 10,11. ✅
- §10 Tests (slug, products) → Tasks 6,9. ✅

**Placeholders :** le bouton « Acheter » → `/contact?produit=slug` est une décision assumée (pas un TODO). `loadImages` initial dans Task 11 Step 3 est un stub explicitement remplacé en Step 3b — signalé clairement. Aucun TODO non résolu.

**Cohérence des types/signatures :** `listProducts(sb, category?)`, `getProductBySlug(sb, slug)` cohérents entre Task 6 (def/test) et Task 7 (usage). `register{Product,Admin}Routes(app)` cohérents avec `createApp()`. `publicUrl(storagePath)` défini en Task 11 Step 3b, importé dans products.ts et admin.ts (remplace l'`imageUrl` local de Task 7 — noté dans Step 3b). `uploadProductImage(productId,buffer,mime,ext,index)` cohérent entre storage.ts (Task 9), admin.ts (Task 10), seed.ts (Task 12). `slugify` cohérent (Task 9 def, Task 10/12 usage). Clés i18n ajoutées en double (FR/EN) → parité garantie par le test.

**Note d'ordonnancement :** Task 7 introduit `imageUrl` localement puis Task 11 Step 3b le refactore en `publicUrl` partagé. Si exécuté strictement dans l'ordre, c'est cohérent (le refactor est explicite). L'implémenteur du Lot 3 doit bien faire ce remplacement pour éviter la duplication.
