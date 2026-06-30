# Plan 7 — Enrichissement fiches produits & accueil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). For HTML/CSS tasks apply the `frontend-design` skill, reusing the existing medieval/sage/burgundy design system.

**Goal:** Ajouter un bloc « Détails » structuré aux fiches produits (matériaux, technique, temps de réalisation, dimensions, poids — éditables dans l'admin) et 4 nouvelles sections à la page d'accueil.

**Architecture:** 4 nouvelles colonnes TEXT sur `products` (migration SQL idempotente, appliquée manuellement dans Supabase). `ProductRow` + admin (create/patch) + affichage produit + seed étendus. 4 sections HTML additionnelles sur l'accueil avec i18n FR/EN. Cache cassé via `?v=8` + `DICT_VERSION`.

**Tech Stack:** Express/TS, Supabase, node:test/tsx, HTML/CSS/JS vanilla, i18n JSON.

**Convention de commit :** finir chaque message par `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Travailler sur `main`.

---

## Contexte pour l'implémenteur (lire avant de commencer)

- `src/lib/products.ts` : `ProductRow` (id, slug, title_fr/en, description_fr/en, price, category, status, weight_grams, created_at, updated_at), `listProducts(sb, category?)`, `getProductBySlug(sb, slug)` (font `.select('*')` → renvoient toutes les colonnes). `ProductRow` est un type TS à étendre.
- `src/routes/admin.ts` : `registerAdminRoutes(app)`, `requireAdmin`. `POST /api/admin/products` construit `row` à partir du body (whitelist de champs) ; `PATCH /api/admin/products/:id` copie un sous-ensemble de champs (`for (const k of ['title_fr','title_en','description_fr','description_en','category']) ...` + price/weight_grams/status). Il faut y ajouter les 4 nouveaux champs.
- `src/routes/products.ts` : `GET /api/products/:slug` renvoie `{ ...product, images }` → les nouvelles colonnes passent automatiquement.
- `public/js/produit.js` : `view(p, lang)` construit la fiche (galerie + titre + cat + prix + description + bouton). Ajouter le bloc « Détails » après la description. Utilise `window.escHtml`/`escAttr`. Re-rend au changement de langue.
- `public/admin.html` : `#product-form` (éditeur) avec champs title_fr/en, description_fr/en, price, category (select #cat-select), weight_grams, status. `public/js/admin.js` : `openEditor(id)` pré-remplit le formulaire (boucle sur des clés), `onSave` envoie le body (boucle sur des clés). Ajouter les 4 champs au HTML + aux deux boucles.
- `public/index.html` : structure actuelle = héros → savoir-faire (`.steps`) → prestations (`.section--alt` `.services`) → vedette (`.grid`) → témoignages (`.section--alt` `.testimonials`) → CTA (`.cta-band`). On insère 4 sections.
- `public/i18n/fr.json`/`en.json` : dicos plats, parité imposée par `test/i18n.test.ts`. `public/js/i18n.js` a `const DICT_VERSION = 6;` (et fetch `/i18n/${lang}.json?v=${DICT_VERSION}`) → **à passer à 8**.
- Les liens assets dans `public/*.html` sont versionnés `?v=7` → **à passer à 8** (sed).
- `scripts/seed.ts` : 6 produits (SEEDS) avec descriptions + 3 images chacun (idempotent, remplace les images). À étendre avec les 4 nouveaux champs.
- Tests : `npm test` (42). Migration manuelle (l'utilisateur exécute le SQL dans Supabase) — les libs ne dépendent pas de la migration (Supabase mocké).

Règles : ne jamais renommer une classe/clé existante ; nouvelles clés i18n dans fr.json ET en.json ; échapper le contenu dynamique.

---

# LOT 1 — Données : migration + ProductRow + admin + seed

### Task 1 : Migration SQL (4 colonnes)

**Files:**
- Create: `migrations/2026-07-01-product-details.sql`
- Modify: `README.md`

- [ ] **Step 1 : Créer `migrations/2026-07-01-product-details.sql`**

```sql
-- ═══════════════════════════════════════════════════════
-- LIVRE DE SOIE — Migration : détails produits (2026-07-01)
-- À exécuter dans le SQL Editor de Supabase. Idempotent.
-- ═══════════════════════════════════════════════════════
ALTER TABLE products ADD COLUMN IF NOT EXISTS materials  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS duration   TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS dimensions TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS technique  TEXT;
```

- [ ] **Step 2 : Note dans `README.md`**

Ajouter :
````markdown
## Migration détails produits (2026-07-01)
Exécuter `migrations/2026-07-01-product-details.sql` dans Supabase → SQL Editor.
Ajoute aux produits : `materials`, `duration`, `dimensions`, `technique` (bloc « Détails » des fiches).
````

- [ ] **Step 3 : Commit**

```bash
git add migrations/2026-07-01-product-details.sql README.md
git commit -m "feat: migration for product detail fields (materials, duration, dimensions, technique)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 : Étendre `ProductRow`

**Files:**
- Modify: `src/lib/products.ts`

- [ ] **Step 1 : Ajouter les 4 champs optionnels à l'interface `ProductRow`**

Dans `src/lib/products.ts`, dans l'interface `ProductRow`, ajouter (avant `created_at`) :
```ts
  materials: string | null;
  duration: string | null;
  dimensions: string | null;
  technique: string | null;
```

- [ ] **Step 2 : Compiler**

Run : `npm run build` puis `rm -rf dist`
Expected : compile sans erreur (les fonctions font déjà `select('*')`, rien d'autre à changer).

- [ ] **Step 3 : Commit**

```bash
git add src/lib/products.ts
git commit -m "feat: ProductRow includes detail fields

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 : Admin API — accepter les 4 champs

**Files:**
- Modify: `src/routes/admin.ts`

- [ ] **Step 1 : `POST /api/admin/products` — inclure les 4 champs dans `row`**

Repérer dans `registerAdminRoutes` le handler `POST /api/admin/products` qui construit l'objet `row`. Ajouter les 4 champs (texte, borné à 300 caractères, null si absent). Dans la construction de `row`, ajouter :
```ts
      materials:  typeof b.materials  === 'string' ? b.materials.trim().slice(0, 300)  : null,
      duration:   typeof b.duration   === 'string' ? b.duration.trim().slice(0, 120)   : null,
      dimensions: typeof b.dimensions === 'string' ? b.dimensions.trim().slice(0, 120) : null,
      technique:  typeof b.technique  === 'string' ? b.technique.trim().slice(0, 300)  : null,
```
(`b` est `req.body as any`, déjà utilisé dans ce handler.)

- [ ] **Step 2 : `PATCH /api/admin/products/:id` — gérer les 4 champs**

Dans le handler PATCH, repérer la boucle qui copie les champs string (`for (const k of ['title_fr','title_en','description_fr','description_en','category']) if (k in b) patch[k] = b[k];`). Ajouter les 4 clés à cette liste :
```ts
    for (const k of ['title_fr','title_en','description_fr','description_en','category','materials','duration','dimensions','technique']) if (k in b) patch[k] = b[k];
```

- [ ] **Step 3 : Vérifier**

Run : `npm test` (42 verts) puis `npm run build` (clean) puis `rm -rf dist`.

- [ ] **Step 4 : Commit**

```bash
git add src/routes/admin.ts
git commit -m "feat: admin product create/patch handle detail fields

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 : Seed — remplir les détails des 6 démos

**Files:**
- Modify: `scripts/seed.ts`

- [ ] **Step 1 : Étendre l'interface `Seed` et chaque entrée**

Dans `scripts/seed.ts`, ajouter à l'interface `Seed` : `materials: string; duration: string; dimensions: string; technique: string;`. Puis ajouter ces 4 propriétés à **chacune** des 6 entrées du tableau `SEEDS` :

```ts
// 1. Bible familiale restaurée
materials: 'Cuir pleine fleur, fil de lin, dorure à la feuille', duration: '~25 h sur 3 semaines', dimensions: '24 × 17 × 6 cm', technique: 'Démontage, couture main sur ruban, coiffes refaites, dorure ravivée',
// 2. Bible brodée « Fleur de lys »
materials: 'Cuir bordeaux pleine fleur, fil de soie, or, tranches dorées', duration: '~40 h', dimensions: '22 × 15 × 5 cm', technique: 'Reliure plein cuir, broderie main soie & or, tranches dorées à la feuille',
// 3. Missel ancien relié
materials: 'Cuir sombre, laiton, papier consolidé', duration: '~20 h', dimensions: '20 × 14 × 4 cm', technique: 'Dos à nerfs, estampage à froid, fermoirs laiton',
// 4. Écrin de protection cuir
materials: 'Cuir fauve, velours bordeaux', duration: '~12 h', dimensions: 'Sur-mesure (selon l\'ouvrage)', technique: 'Couture main, intérieur velours, fermeture aimantée',
// 5. Carnet relié cuir
materials: 'Cuir pleine peau, papier vergé crème, soie', duration: '~6 h', dimensions: '21 × 14 × 2 cm', technique: 'Couture apparente, coins arrondis, signet de soie',
// 6. Évangéliaire doré
materials: 'Cuir noir, dorure à chaud, tranches dorées', duration: '~35 h', dimensions: '26 × 18 × 5 cm', technique: 'Reliure plein cuir, croix dorée à chaud, dos à nerfs, tranchefile main',
```
(Insérer chaque ligne dans l'objet `Seed` correspondant, à côté de `price`/`category`. Garder l'ordre des 6 produits.)

- [ ] **Step 2 : Inclure les champs dans l'upsert**

Dans `main()`, l'objet `row` upserté doit inclure les 4 nouveaux champs. Ajouter à `row` :
```ts
      materials: s.materials, duration: s.duration, dimensions: s.dimensions, technique: s.technique,
```

- [ ] **Step 3 : Commit** (le seed sera relancé après la migration, Lot final)

```bash
git add scripts/seed.ts
git commit -m "feat: seed fills product detail fields for the 6 demos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# LOT 2 — Fiche produit : bloc « Détails » + admin form

### Task 5 : Libellés i18n du bloc Détails

**Files:**
- Modify: `public/i18n/fr.json`, `public/i18n/en.json`
- Modify: `public/js/i18n.js` (DICT_VERSION → 8)

- [ ] **Step 1 : Ajouter les clés (FR)** dans `public/i18n/fr.json`

```json
  "product.details": "Détails",
  "product.materials": "Matériaux",
  "product.technique": "Technique & finitions",
  "product.duration": "Temps de réalisation",
  "product.dimensions": "Dimensions",
  "product.weight": "Poids"
```

- [ ] **Step 2 : Ajouter les mêmes clés (EN)** dans `public/i18n/en.json`

```json
  "product.details": "Details",
  "product.materials": "Materials",
  "product.technique": "Technique & finishing",
  "product.duration": "Time to make",
  "product.dimensions": "Dimensions",
  "product.weight": "Weight"
```

- [ ] **Step 3 : Bump `DICT_VERSION`** dans `public/js/i18n.js`

Remplacer `const DICT_VERSION = 6;` par `const DICT_VERSION = 8;`.

- [ ] **Step 4 : Vérifier la parité**

Run : `npm test`
Expected : `i18n.test.ts` vert (mêmes clés des deux côtés).

- [ ] **Step 5 : Commit**

```bash
git add public/i18n/fr.json public/i18n/en.json public/js/i18n.js
git commit -m "feat: i18n labels for product details block (FR/EN) + bump DICT_VERSION

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 : Affichage du bloc « Détails » sur la fiche

> Appliquer le skill `frontend-design`.

**Files:**
- Modify: `public/js/produit.js`
- Modify: `public/css/style.css`

- [ ] **Step 1 : Ajouter le bloc dans `view(p, lang)` (`public/js/produit.js`)**

Dans la fonction `view(p, lang)`, juste après le `<div>` de la description (avant le `<p>` du bouton Acheter), insérer un bloc détails. D'abord, en tête de `view`, construire les lignes :
```js
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
```
Puis, dans le template HTML retourné par `view`, insérer `${detailsHtml}` entre le `<div>${escHtml(desc)...}</div>` (description) et le `<p>` du bouton « Acheter ». Exemple — remplacer :
```js
      <div>${escHtml(desc).replace(/\n/g, '<br>')}</div>
      <p style="margin-top:1.5rem">
```
par :
```js
      <div>${escHtml(desc).replace(/\n/g, '<br>')}</div>
      ${detailsHtml}
      <p style="margin-top:1.5rem">
```

- [ ] **Step 2 : Styles du bloc (`public/css/style.css`, à la fin)**

```css
/* ═══ Plan 7 — bloc Détails produit ═══ */
.product-details { margin-top: 1.8rem; padding-top: 1.4rem; border-top: 1px solid var(--line); }
.product-details h2 { font-size: 1.3rem; margin-bottom: 0.6rem; }
.product-details dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.4rem 1.2rem; margin: 0; }
.product-details dt { font-family: var(--font-display); color: var(--fir); font-weight: 600; }
.product-details dd { margin: 0; color: var(--text-soft); }
@media (max-width: 520px) { .product-details dl { grid-template-columns: 1fr; gap: 0.1rem 0; } .product-details dt { margin-top: 0.6rem; } }
```

- [ ] **Step 3 : Vérification**

Run : `npm test` puis `npm run dev`. Comme la migration n'est peut-être pas encore appliquée en local, le bloc peut être vide — vérifier au moins l'absence d'erreur JS sur `/produit/<slug>`. (Le rendu réel sera validé après migration + seed, lot final.)

- [ ] **Step 4 : Commit**

```bash
git add public/js/produit.js public/css/style.css
git commit -m "feat: product Details block (materials, technique, duration, dimensions, weight)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7 : Champs Détails dans l'admin

**Files:**
- Modify: `public/admin.html`
- Modify: `public/js/admin.js`

- [ ] **Step 1 : Ajouter les 4 champs au formulaire (`public/admin.html`)**

Dans `#product-form`, après le champ `weight_grams` (ou après `category`), ajouter :
```html
            <label class="field"><span>Matériaux</span><input name="materials" /></label>
            <label class="field"><span>Technique & finitions</span><input name="technique" /></label>
            <label class="field"><span>Temps de réalisation</span><input name="duration" /></label>
            <label class="field"><span>Dimensions</span><input name="dimensions" /></label>
```

- [ ] **Step 2 : Pré-remplir + envoyer ces champs (`public/js/admin.js`)**

Dans `openEditor(id)`, la boucle qui remplit le formulaire copie un tableau de clés ; y ajouter les 4. Repérer :
```js
for (const k of ['title_fr','title_en','description_fr','description_en','price','category','weight_grams','status']) if (f[k]) f[k].value = p[k] ?? '';
```
et remplacer par :
```js
for (const k of ['title_fr','title_en','description_fr','description_en','price','category','weight_grams','status','materials','technique','duration','dimensions']) if (f[k]) f[k].value = p[k] ?? '';
```
Dans `onSave`, la construction du `body` copie aussi un tableau de clés ; même ajout. Repérer :
```js
for (const k of ['title_fr','title_en','description_fr','description_en','price','category','weight_grams','status']) body[k] = f[k].value;
```
et remplacer par :
```js
for (const k of ['title_fr','title_en','description_fr','description_en','price','category','weight_grams','status','materials','technique','duration','dimensions']) body[k] = f[k].value;
```

- [ ] **Step 3 : Vérifier**

Run : `npm test` puis `npm run dev`, se connecter à `/admin`, éditer un produit → les 4 champs apparaissent dans le formulaire (vides si migration pas encore appliquée — pas d'erreur).

- [ ] **Step 4 : Commit**

```bash
git add public/admin.html public/js/admin.js
git commit -m "feat: admin product form fields for materials/technique/duration/dimensions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# LOT 3 — Accueil : 4 sections

### Task 8 : Clés i18n des sections d'accueil

**Files:**
- Modify: `public/i18n/fr.json`, `public/i18n/en.json`

- [ ] **Step 1 : Ajouter les clés (FR)**

```json
  "home.why.title": "Pourquoi me confier votre ouvrage",
  "home.why1.title": "Soin & patience",
  "home.why1.text": "Chaque ouvrage est traité comme une pièce de musée, sans précipitation.",
  "home.why2.title": "Matières nobles",
  "home.why2.text": "Cuir pleine fleur, fil de lin, dorure à la feuille : rien que des matériaux durables.",
  "home.why3.title": "Savoir-faire traditionnel",
  "home.why3.text": "Des gestes hérités des relieurs d'art, appris et transmis avec rigueur.",
  "home.why4.title": "Pièce unique",
  "home.why4.text": "Votre ouvrage est traité comme un objet de transmission, jamais standardisé.",
  "home.matter.title": "Les matières nobles",
  "home.matter.intro": "Je ne travaille qu'avec des matériaux choisis pour leur beauté et leur longévité.",
  "home.matter1.title": "Cuir pleine fleur", "home.matter1.text": "Souple, résistant, il se patine avec le temps.",
  "home.matter2.title": "Fil de lin", "home.matter2.text": "Pour une couture solide qui traverse les décennies.",
  "home.matter3.title": "Dorure à la feuille", "home.matter3.text": "Or véritable, posé à chaud, pour titres et motifs.",
  "home.matter4.title": "Papier vergé", "home.matter4.text": "Pages crème de belle main, agréables au toucher.",
  "home.order.title": "Le déroulé d'une commande",
  "home.order1.title": "Prise de contact", "home.order1.text": "Vous décrivez votre projet et vos souhaits.",
  "home.order2.title": "Devis", "home.order2.text": "Je vous propose une solution, un délai et un prix.",
  "home.order3.title": "Création", "home.order3.text": "L'ouvrage prend forme à l'atelier, geste après geste.",
  "home.order4.title": "Livraison", "home.order4.text": "Expédition soignée et suivie, ou remise en main propre.",
  "home.manifesto": "Un livre relié à la main, c'est une mémoire que l'on protège et que l'on transmet."
```

- [ ] **Step 2 : Ajouter les mêmes clés (EN)**

```json
  "home.why.title": "Why entrust your work to me",
  "home.why1.title": "Care & patience",
  "home.why1.text": "Each work is treated like a museum piece, never rushed.",
  "home.why2.title": "Fine materials",
  "home.why2.text": "Full-grain leather, linen thread, gold leaf — only durable materials.",
  "home.why3.title": "Traditional craft",
  "home.why3.text": "Gestures inherited from fine bookbinders, learned and passed on with rigour.",
  "home.why4.title": "Unique piece",
  "home.why4.text": "Your work is treated as an heirloom, never standardised.",
  "home.matter.title": "Fine materials",
  "home.matter.intro": "I only work with materials chosen for their beauty and longevity.",
  "home.matter1.title": "Full-grain leather", "home.matter1.text": "Supple, durable, it gains a patina over time.",
  "home.matter2.title": "Linen thread", "home.matter2.text": "For strong sewing that lasts for decades.",
  "home.matter3.title": "Gold leaf", "home.matter3.text": "Real gold, applied with heat, for titles and motifs.",
  "home.matter4.title": "Laid paper", "home.matter4.text": "Fine cream pages, pleasant to the touch.",
  "home.order.title": "How a commission unfolds",
  "home.order1.title": "Get in touch", "home.order1.text": "You describe your project and wishes.",
  "home.order2.title": "Quote", "home.order2.text": "I propose a solution, a timeline and a price.",
  "home.order3.title": "Creation", "home.order3.text": "The work takes shape in the workshop, step by step.",
  "home.order4.title": "Delivery", "home.order4.text": "Careful tracked shipping, or hand delivery.",
  "home.manifesto": "A hand-bound book is a memory we protect and pass on."
```

- [ ] **Step 3 : Vérifier la parité**

Run : `npm test` → `i18n.test.ts` vert.

- [ ] **Step 4 : Commit**

```bash
git add public/i18n/fr.json public/i18n/en.json
git commit -m "feat: i18n strings for 4 new home sections (why, materials, order steps, manifesto)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9 : Sections d'accueil + styles

> Appliquer le skill `frontend-design`.

**Files:**
- Modify: `public/index.html`
- Modify: `public/css/style.css`

- [ ] **Step 1 : Insérer la section « Pourquoi » après la section savoir-faire**

Dans `public/index.html`, repérer la fin de la section savoir-faire (`</section>` qui suit la grille `.steps`). Juste après, insérer :
```html
    <section class="section section--alt">
      <div class="container center">
        <h2 data-i18n="home.why.title"></h2>
        <div class="rule"></div>
        <div class="reasons">
          <div class="reason"><h3 data-i18n="home.why1.title"></h3><p data-i18n="home.why1.text"></p></div>
          <div class="reason"><h3 data-i18n="home.why2.title"></h3><p data-i18n="home.why2.text"></p></div>
          <div class="reason"><h3 data-i18n="home.why3.title"></h3><p data-i18n="home.why3.text"></p></div>
          <div class="reason"><h3 data-i18n="home.why4.title"></h3><p data-i18n="home.why4.text"></p></div>
        </div>
      </div>
    </section>
```
Note : c'est un aplat bordeaux (section--alt) → les titres `.reason h3` et textes doivent être clairs (géré au Step 5 CSS).

- [ ] **Step 2 : Insérer « Les matières nobles » après la section prestations**

Repérer la fin de la section prestations (`.services`, qui est en `.section--alt`). Juste après son `</section>`, insérer (section claire) :
```html
    <section class="section">
      <div class="container center">
        <h2 data-i18n="home.matter.title"></h2>
        <div class="rule"></div>
        <p style="max-width:60ch;margin-inline:auto" data-i18n="home.matter.intro"></p>
        <div class="materials-grid">
          <div class="matter"><h3 data-i18n="home.matter1.title"></h3><p data-i18n="home.matter1.text"></p></div>
          <div class="matter"><h3 data-i18n="home.matter2.title"></h3><p data-i18n="home.matter2.text"></p></div>
          <div class="matter"><h3 data-i18n="home.matter3.title"></h3><p data-i18n="home.matter3.text"></p></div>
          <div class="matter"><h3 data-i18n="home.matter4.title"></h3><p data-i18n="home.matter4.text"></p></div>
        </div>
      </div>
    </section>
```

- [ ] **Step 3 : Insérer « Le déroulé d'une commande » après la section vedette**

Repérer la fin de la section « Créations en vedette » (`#featured-grid`). Juste après son `</section>`, insérer (section claire, réutilise `.steps`) :
```html
    <section class="section">
      <div class="container center">
        <h2 data-i18n="home.order.title"></h2>
        <div class="rule"></div>
        <div class="steps">
          <div class="step"><span class="step-num">I</span><h3 data-i18n="home.order1.title"></h3><p data-i18n="home.order1.text"></p></div>
          <div class="step"><span class="step-num">II</span><h3 data-i18n="home.order2.title"></h3><p data-i18n="home.order2.text"></p></div>
          <div class="step"><span class="step-num">III</span><h3 data-i18n="home.order3.title"></h3><p data-i18n="home.order3.text"></p></div>
          <div class="step"><span class="step-num">IV</span><h3 data-i18n="home.order4.title"></h3><p data-i18n="home.order4.text"></p></div>
        </div>
      </div>
    </section>
```

- [ ] **Step 4 : Insérer le bandeau « manifeste » après les témoignages (avant le CTA final)**

Repérer la fin de la section témoignages (`.testimonials`, en `.section--alt`). Juste après son `</section>` (et avant la section `.cta-band`), insérer :
```html
    <section class="section manifesto">
      <div class="container center">
        <p class="manifesto-quote" data-i18n="home.manifesto"></p>
      </div>
    </section>
```

- [ ] **Step 5 : Styles (`public/css/style.css`, à la fin)**

```css
/* ═══ Plan 7 — sections accueil ═══ */
.reasons, .materials-grid { display: grid; gap: 1.4rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 2rem; }
.reason h3, .matter h3 { font-size: 1.2rem; }
/* « Pourquoi » est sur aplat bordeaux (.section--alt) → texte clair */
.section--alt .reason h3 { color: var(--gold); }
.section--alt .reason p { color: rgba(240, 234, 216, 0.88); }
.matter h3 { color: var(--fir); }
/* Bandeau manifeste : aplat vert sapin, citation crème */
.manifesto { background: var(--fir-deep); }
.manifesto-quote {
  color: var(--cream); font-family: var(--font-display); font-style: italic;
  font-size: clamp(1.4rem, 3vw, 2rem); max-width: 50ch; margin: 0 auto; line-height: 1.4;
}
```

- [ ] **Step 6 : Vérification visuelle**

Run : `npm run dev`, ouvrir `/` :
- 4 nouvelles sections présentes, bilingues (toggle FR/EN), lisibles ;
- la section « Pourquoi » (bordeaux) a titres or + texte crème ;
- le bandeau manifeste est vert sapin avec citation crème ;
- alternance des fonds cohérente, pas deux aplats identiques collés.
Aucune erreur console.

- [ ] **Step 7 : Commit**

```bash
git add public/index.html public/css/style.css
git commit -m "feat: 4 enriched home sections (why, fine materials, commission steps, manifesto)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10 : Bump des versions d'assets

**Files:**
- Modify: `public/*.html`

- [ ] **Step 1 : Passer tous les `?v=7` à `?v=8`**

Run :
```bash
sed -i -E 's#\?v=7"#?v=8"#g' public/*.html
grep -oE '\?v=[0-9]+' public/index.html | sort -u
```
Expected : `?v=8` partout (cohérent avec `DICT_VERSION = 8` posé en Task 5).

- [ ] **Step 2 : Vérifier**

Run : `npm test` (42 verts), `npm run build` (clean), `rm -rf dist`.

- [ ] **Step 3 : Commit**

```bash
git add public/*.html
git commit -m "chore: bump asset version to v=8 (product details + home sections)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (auteur du plan)

**Couverture spec :**
- §2 colonnes (materials/duration/dimensions/technique) → Task 1. ProductRow → Task 2. Admin → Tasks 3,7. Affichage bloc Détails (libellés i18n, seuls champs remplis, poids formaté) → Tasks 5,6. Seed rempli → Task 4. ✅
- §3 4 sections accueil (why, matières, déroulé, manifeste) + i18n + CSS → Tasks 8,9. ✅
- §4 cache (assets v=8 + DICT_VERSION 8) → Tasks 5,10. ✅
- §5 sécurité (requireAdmin déjà, longueurs bornées, escHtml) → Tasks 3,6. ✅

**Placeholders :** aucun TODO. Le rendu réel des fiches dépend de la migration (manuelle) + re-seed — fait au lot final post-implémentation (hors plan, étape d'exploitation).

**Cohérence types/clés :** `ProductRow` champs (Task 2) = colonnes SQL (Task 1) = clés body admin (Tasks 3,7) = clés seed (Task 4) = clés lues dans produit.js (Task 6) : `materials, duration, dimensions, technique`. Libellés i18n `product.*` (Task 5) lus par produit.js (Task 6). Clés `home.why*/matter*/order*/manifesto` (Task 8) = `data-i18n` de index.html (Task 9). `DICT_VERSION = 8` (Task 5) cohérent avec `?v=8` (Task 10). `.section--alt .reason` clair sur bordeaux ; `.manifesto` vert sapin — cohérent avec la charte. `escHtml`/`escAttr` de util.js.

**Note d'exploitation :** après implémentation → appliquer `migrations/2026-07-01-product-details.sql` dans Supabase, puis `npm run seed` (remplit les détails des démos), puis déployer (push). La migration et le seed sont des étapes manuelles/post-merge.
