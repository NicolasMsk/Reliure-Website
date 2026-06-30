# Plan 7 — Enrichissement fiches produits & accueil — Design

**Date :** 2026-07-01
**Statut :** Approuvé (design validé lors du cadrage)
**Prérequis :** Plans 1-6 livrés et déployés.

## 1. Objectif

Donner plus de matière au site pour qu'il paraisse abouti : (A) un **bloc « Détails » structuré** sur les fiches produits (matériaux, temps de réalisation, dimensions, technique — éditables dans l'admin), et (B) **4 nouvelles sections** sur la page d'accueil.

## 2. Partie A — Fiches produits

### Nouveaux champs (table `products`)
4 colonnes TEXT, optionnelles : `materials`, `duration`, `dimensions`, `technique`. Le poids (`weight_grams`) existe déjà.

Migration SQL idempotente, à exécuter une fois dans Supabase (comme les précédentes).

### Affichage (fiche produit)
Sous la description, un bloc **« Détails »** sous forme de liste (libellé + valeur). **Seuls les champs renseignés s'affichent** (pas de ligne vide). Libellés bilingues :
- Matériaux / Materials
- Technique & finitions / Technique & finishing
- Temps de réalisation / Time to make
- Dimensions / Dimensions
- Poids / Weight (depuis `weight_grams`, formaté « 950 g »)

### Admin
Le formulaire produit (`/admin`) gagne 4 champs de saisie (Matériaux, Technique & finitions, Temps de réalisation, Dimensions). `GET/PATCH/POST` les gèrent. Création par défaut : champs vides.

### Démo
Le script de seed remplit ces 4 champs pour les 6 créations de démo (valeurs crédibles, FR — l'EN reprend la même valeur faute de traduction par produit ; les libellés, eux, sont traduits).

> Note bilingue : les **libellés** du bloc sont traduits (i18n) ; les **valeurs** (matériaux, technique…) sont un seul texte saisi par l'artisane (en pratique en français). Pas de double champ FR/EN par souci de simplicité — cohérent avec le besoin (YAGNI).

## 3. Partie B — Accueil (4 sections)

Insérées dans `public/index.html`, dans la charte (alternance crème / aplat bordeaux / accents verts), textes soignés FR/EN que je rédige :

1. **« Pourquoi me confier votre ouvrage »** — 4 arguments de réassurance (soin & patience · matières nobles · savoir-faire traditionnel · pièce unique), en grille (`.reasons`, style proche des services).
2. **« Les matières nobles »** — cuir pleine fleur, fil de lin, dorure à la feuille, papier vergé — courte présentation par matière (`.materials-grid`).
3. **« Le déroulé d'une commande »** — étapes client : Prise de contact → Devis → Création → Livraison (`.steps`, réutilisé).
4. **Bandeau manifeste** — une citation/vision sur la reliure sacrée (`.cta-band`/`.manifesto`, aplat fort).

Placement cohérent dans le flux existant (héros → savoir-faire → **pourquoi** → prestations → **matières** → vedette → **déroulé** → témoignages → **manifeste** → CTA). Alternance des fonds respectée pour le rythme visuel.

## 4. Architecture & fichiers

```
migrations/
└── 2026-07-01-product-details.sql      # 4 colonnes products
src/
├── lib/products.ts                     # ProductRow += materials/duration/dimensions/technique
├── routes/admin.ts                     # create/patch gèrent les 4 champs
scripts/seed.ts                         # remplit les 4 champs des 6 démos
public/
├── produit.html, js/produit.js         # bloc « Détails »
├── admin.html, js/admin.js             # 4 champs de saisie
├── index.html                          # 4 sections
├── i18n/fr.json, en.json               # libellés détails + textes accueil
├── css/style.css                       # .product-details, .reasons, .materials-grid, .manifesto
```

Cache : bump des assets (`?v=8`) et de `DICT_VERSION` (nouvelles clés i18n).

## 5. Sécurité / qualité

- Champs admin derrière `requireAdmin` (déjà le cas) ; longueurs bornées (ex. 300 car.) ; échappement à l'affichage (escHtml).
- PATCH profil-style : ne mettre à jour que les champs fournis (déjà le pattern de `account.ts` ; pour products on accepte explicitement les 4 nouveaux dans le whitelist de champs).
- Parité i18n maintenue (test).

## 6. Tests

- `products.test.ts` : pas de logique nouvelle critique (les colonnes passent par select '*') — vérifier que `listProducts`/`getProductBySlug` renvoient toujours correctement (déjà couvert). Ajout léger : un test que la sérialisation inclut les nouveaux champs si présents (optionnel).
- Vérif manuelle : créer/éditer un produit avec les 4 champs dans l'admin → ils s'affichent dans le bloc Détails ; champs vides → non affichés ; accueil montre les 4 sections bilingues.
- Tests existants verts ; parité i18n garantie.

## 7. Hors périmètre (YAGNI)

- Traduction par produit des valeurs (matériaux, etc.) — un seul texte saisi.
- Filtres/tri par matériau. Avis. Produits liés.

## 8. Critères de succès

- Les fiches affichent un bloc « Détails » net (matériaux, technique, temps, dimensions, poids), uniquement pour les champs remplis ; éditables dans l'admin.
- L'accueil a 4 sections supplémentaires cohérentes et bilingues, qui étoffent la page.
- Les 6 démos sont remplies pour donner l'impression d'un catalogue travaillé.
- Migration appliquée ; tout déployé ; cache versionné (affichage immédiat).
