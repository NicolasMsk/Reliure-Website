# Plan 2 — Contenu enrichi, Catalogue & Admin — Design

**Date :** 2026-06-27
**Statut :** En cadrage
**Prérequis :** Plan 1 livré (fondations, design, i18n, schéma Supabase appliqué, base connectée)

## 1. Contexte métier (précision importante)

L'activité est **centrée sur le religieux** : reliure et **restauration de bibles** (y compris les bibles transmises par les clients), **création de bibles sur-mesure**, avec **broderie** (spécialité signature), dorure à chaud et cuir. Périmètre : **religieux au cœur + un peu de reliure générale** en complément.

L'esthétique médiévale/enluminée déjà en place sert parfaitement ce thème. Le contenu et le ton doivent évoquer le sacré, la transmission, le soin patient de l'objet de dévotion — sans excès, avec sobriété et noblesse.

## 2. Objectif du Plan 2

Transformer le squelette du Plan 1 en un site **riche en contenu** et doté d'une **boutique gérable** :
1. **Contenu & vitrine enrichie** — sections savoir-faire, services, témoignages, FAQ, page À propos étoffée ; textes soignés FR/EN rédigés par l'IA.
2. **Catalogue** — boutique alimentée par la base + fiches produits + données de démo.
3. **Admin** — panneau protégé pour gérer les créations et téléverser les photos (Supabase Storage).

## 3. Catégories de la boutique

Valeurs stockées dans `products.category` (slug technique → libellé FR/EN affiché) :

| Slug | FR | EN |
|---|---|---|
| `bibles-restaurees` | Bibles restaurées | Restored Bibles |
| `bibles-brodees` | Bibles sur-mesure brodées | Bespoke embroidered Bibles |
| `livres-religieux` | Livres religieux & missels | Religious books & missals |
| `coffrets-sacres` | Coffrets & écrins sacrés | Sacred cases & boxes |
| `autres-reliures` | Carnets & autres reliures | Notebooks & other bindings |

Le mapping slug→libellé bilingue vit dans un module partagé (`public/js/categories.js` côté client + une constante serveur si besoin) pour rester DRY et cohérent avec l'i18n.

## 4. Partie 1 — Contenu & vitrine enrichie

**Page d'accueil** (`public/index.html`), sections dans l'ordre :
1. Héros (existant) — accroche ajustée au thème (bibles & reliure d'art sacrée).
2. **Savoir-faire** (`.steps`) — 4 étapes : *Analyse & démontage → Couture & corps d'ouvrage → Couvrure cuir & broderie → Dorure & finition*. Chaque étape : numéro orné, titre, courte description.
3. **Services** (`.services`) — 4 cartes : *Restauration de bibles · Bibles sur-mesure brodées · Reliure de livres religieux · Reliure & restauration générale*.
4. **Créations en vedette** (`.grid`) — alimentée par la base (Partie 2) ; fallback élégant si vide.
5. **Témoignages** (`.testimonials`) — 3 avis (placeholders crédibles FR/EN au départ).
6. **Bandeau d'appel** (`.cta-band`) — vers la boutique et le sur-mesure.

**Page À propos** (`public/a-propos.html`) enrichie : histoire de l'artisane, vocation autour du livre sacré, philosophie (matériaux nobles, respect de l'objet transmis), la broderie comme signature, engagements. Photo d'atelier (image libre de droits en attendant).

**Nouvelle page FAQ** (`public/faq.html`, route `/faq`) : délais, tarifs/devis, envoi France & International, confier sa bible (assurance, suivi), entretien d'une reliure, déroulé d'une commande sur-mesure. Composant `.faq` (accordéon léger en JS vanilla, accessible).

**i18n** : toutes les nouvelles chaînes ajoutées à `fr.json` / `en.json` (le test de parité garantit la complétude). Nouveaux composants CSS **additifs** (`.steps`, `.services`, `.testimonials`, `.faq`, `.cta-band`) cohérents avec la palette et le style existants — aucun renommage de classes existantes.

## 5. Partie 2 — Catalogue (boutique + fiches produits)

**Pages publiques :**
- **Boutique** (`/boutique`, `public/boutique.html`) : grille des produits `disponible` depuis la base, **filtres par catégorie** (les 5 ci-dessus + « Toutes »), badge « Pièce unique » / « Vendu ». Rendu côté client par `public/js/boutique.js` consommant l'API.
- **Fiche produit** (`/produit/:slug`, `public/produit.html` + route serveur) : galerie d'images (Supabase Storage), titre, description, prix, catégorie. Bouton **« Acheter »** : en attendant Stripe (Plan 3), il pointe vers la page **sur-mesure/contact** avec le produit pré-rempli, et un libellé « Réserver cette pièce » (pas de fausse promesse de paiement). Décision assumée pour la v2.

**API publique (lecture, via clé serveur) :**
- `GET /api/products` — liste des produits `disponible`, filtrable `?category=<slug>`. Renvoie titre/description dans les 2 langues + 1ʳᵉ image.
- `GET /api/products/:slug` — détail d'un produit `disponible` + toutes ses images ordonnées.
- Module serveur dédié : `src/routes/products.ts` (`registerProductRoutes(app)`).
- Accès données encapsulé dans `src/lib/products.ts` (fonctions `listProducts`, `getProductBySlug`) pour isoler la logique Supabase et la rendre testable.

**Données de démo :** un script `scripts/seed.ts` (exécuté manuellement, `npx tsx scripts/seed.ts`) insère 6-8 créations d'exemple réparties sur les catégories, avec textes FR/EN soignés et images libres de droits téléversées dans Storage. Idempotent (upsert par slug). Remplaçables ensuite via l'admin.

## 6. Partie 3 — Admin (gestion des créations)

- **Connexion** (`/admin`, `public/admin.html`) protégée par `ADMIN_PASSWORD` via session cookie (le middleware `requireAdmin` et la session existent déjà dans `app.ts`/le pattern Aura). Routes : `POST /api/admin/login`, `POST /api/admin/logout`.
- **Gestion produits** (`src/routes/admin.ts`, `registerAdminRoutes(app)`), toutes derrière `requireAdmin` :
  - `GET /api/admin/products` — liste complète (tous statuts).
  - `POST /api/admin/products` — créer (titre/description FR+EN, prix, catégorie, poids, statut, slug auto depuis le titre FR).
  - `PATCH /api/admin/products/:id` — modifier (dont changement de statut `brouillon`/`disponible`/`vendu`).
  - `DELETE /api/admin/products/:id` — supprimer.
  - `POST /api/admin/products/:id/images` — **upload d'image** vers Supabase Storage (bucket `product-images`), crée la ligne `product_images`.
  - `DELETE /api/admin/images/:id` — supprimer une image (Storage + ligne).
  - `PATCH /api/admin/images/:id` — réordonner (`sort_order`) / éditer alt.
- **Interface admin** (`public/admin.html` + `public/js/admin.js`) : connexion, tableau des produits, formulaire création/édition bilingue, zone d'upload d'images avec aperçu et réordonnancement. Style cohérent (peut être plus sobre/utilitaire que la vitrine).
- **Génération de slug** : helper pur `slugify()` dans `src/lib/slug.ts` (testable : accents → ASCII, espaces → tirets, unicité gérée par suffixe si collision).

## 7. Supabase Storage

- Bucket **`product-images`** : lecture publique, écriture via clé serveur uniquement.
- Création : étape manuelle (dashboard) OU via le script de seed/un script d'init. Le design fournit les instructions + le SQL/políticas de bucket nécessaires (comme `schema.sql` au Plan 1).
- Les images référencées par `product_images.storage_path` ; URL publique construite par le serveur/au client via l'URL Storage publique.

## 8. Architecture & fichiers (nouveaux/modifiés)

```
src/
├── routes/
│   ├── products.ts        # API publique catalogue (registerProductRoutes)
│   └── admin.ts           # API admin protégée (registerAdminRoutes)
├── lib/
│   ├── products.ts        # accès données produits (list/get) — testable
│   ├── slug.ts            # slugify() — testable
│   └── storage.ts         # upload/suppression Supabase Storage
public/
├── boutique.html, produit.html, faq.html, admin.html
├── js/
│   ├── boutique.js, produit.js, admin.js, faq.js, categories.js
├── css/style.css          # + composants additifs (.steps .services .testimonials .faq .cta-band + styles boutique/produit/admin)
scripts/
└── seed.ts                # données de démo (manuel)
test/
├── slug.test.ts           # slugify
└── products.test.ts       # listProducts/getProductBySlug (avec Supabase mocké ou via test d'API)
```

Toutes les routes enregistrées dans `createApp()` en conservant les signatures `register*(app[, publicDir])`.

## 9. Sécurité

- Routes admin derrière `requireAdmin` (session cookie signée par `ADMIN_PASSWORD`).
- Upload : validation du type MIME (jpeg/png/webp) et de la taille (limite raisonnable, ex. 5 Mo) ; noms de fichiers générés côté serveur (pas de chemin fourni par le client).
- Lecture publique limitée aux produits `disponible` (déjà câblé par les policies RLS du Plan 1 ; le serveur filtre aussi explicitement).
- Échappement systématique des contenus rendus (déjà la règle).

## 10. Tests

- `slug.test.ts` : accents, espaces, casse, caractères spéciaux, collisions.
- `products.test.ts` : `listProducts` (filtre catégorie, ne renvoie que `disponible`), `getProductBySlug` (introuvable → null). Via mock du client Supabase ou test d'intégration léger.
- Les tests existants (env, app, i18n) restent verts. Parité i18n maintenue avec les nouvelles clés.
- Vérification manuelle : boutique affiche les produits seedés, filtres OK, fiche produit OK, admin permet créer/éditer/uploader/supprimer.

## 11. Hors périmètre Plan 2 (YAGNI)

- Paiement Stripe réel (Plan 3) — le bouton « Acheter » mène au sur-mesure/contact en attendant.
- Comptes clients / Auth (Plan 4).
- Parcours sur-mesure complet avec devis + lien de paiement (Plan 5) — la page sur-mesure reste un formulaire de contact enrichi pour l'instant.
- Multi-images drag&drop avancé : réordonnancement simple (boutons monter/descendre) suffit.

## 12. Critères de succès

- Le site vitrine est visiblement riche : savoir-faire, services, témoignages, FAQ, À propos étoffée — en FR et EN, ton religieux/artisanal soigné.
- La boutique affiche les créations depuis la base, filtrables par catégorie ; chaque fiche produit montre images + détails.
- L'artisane peut, sans aide technique : se connecter à l'admin, créer une création, téléverser des photos, la publier (`disponible`) → elle apparaît dans la boutique ; la marquer `vendu` → elle disparaît.
- Données de démo en place pour que rien ne soit vide.
- Tous les tests passent ; parité i18n garantie.
