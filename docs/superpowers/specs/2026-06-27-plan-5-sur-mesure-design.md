# Plan 5 — Sur-mesure (demande de devis + paiement) — Design

**Date :** 2026-06-27
**Statut :** Approuvé (design validé, enchaînement spec → plan → exécution autorisé)
**Prérequis :** Plans 1-4 livrés (boutique, admin, paiement Stripe + webhook, comptes clients).

## 1. Objectif

Offrir un parcours **sur-mesure** complet : un visiteur décrit son projet (avec photos de référence), l'artisane reçoit la demande, échange, puis **génère un lien de paiement Stripe** depuis l'admin ; le paiement marque automatiquement la demande comme payée. Cela rend fonctionnel le lien nav « Sur-mesure » (404 jusqu'ici).

## 2. Parcours

1. **Page `/sur-mesure`** : présentation + formulaire (nom, email, description, budget, jusqu'à 3 photos de référence).
2. **`POST /api/custom-request`** (multipart) : validation (champs requis, email valide, ≤ 3 fichiers, MIME jpeg/png/webp, ≤ 5 Mo chacun, honeypot anti-bot, rate-limit dédié), upload des photos dans le bucket **privé** `custom-references`, insertion dans `custom_requests` (status `nouvelle`, `reference_images` = chemins Storage), **email de notification à l'artisane** (Resend, best-effort). Réponse de confirmation au client.
3. **Admin → onglet Demandes sur-mesure** : liste, détail (description + photos via URLs signées), changement de statut, génération de lien de paiement.
4. **Génération du lien de paiement** : l'artisane saisit montant + libellé → le serveur crée un **Stripe Payment Link** (`metadata.custom_request_id`) → URL stockée dans `custom_requests.stripe_payment_link`, statut → `devis_envoyé`. L'artisane copie le lien et l'envoie au client.
5. **Bouclage** : à la réception du paiement, le **webhook existant** (`checkout.session.completed`) détecte `metadata.custom_request_id` et marque la demande `payée`.

## 3. Données

Table `custom_requests` (déjà créée Plan 1) :
`id, name, email, description, budget (TEXT), reference_images (JSONB), status ('nouvelle'|'devis_envoyé'|'payée'|'terminée'), stripe_payment_link (TEXT), lang, created_at, updated_at`.
Pas de migration. `reference_images` stocke un tableau de chemins Storage (clé service pour lire/écrire ; URLs signées à la lecture admin).

## 4. Stockage des photos de référence

- **Bucket privé** `custom-references` (lecture non publique — ce sont des photos de clients).
- Upload serveur via clé service ; chemins `<requestId>/<timestamp>-<i>.<ext>`.
- Lecture (admin) via **URLs signées** courtes (`createSignedUrl`, ex. 1h).
- Création du bucket : étape (dashboard ou SQL/script) documentée dans le plan/README, comme `product-images`.

## 5. Sécurité (upload public)

- **Rate-limit dédié** sur `POST /api/custom-request` (ex. 5 / heure / IP) en plus du limiter global.
- Validation stricte : nb fichiers ≤ 3, taille ≤ 5 Mo, MIME ∈ {jpeg, png, webp} (réutilise `isAllowedImage`).
- **Honeypot** : champ caché ; si rempli → réponse 200 silencieuse sans rien enregistrer (anti-bot).
- Champs texte requis (name, email valide via regex serveur, description non vide) ; longueurs bornées (description ≤ 5000, budget ≤ 100, name ≤ 200).
- Échappement systématique dans les emails et l'admin.
- Routes admin derrière `requireAdmin` ; génération de lien gated par `paymentsConfigured()` (503 sinon).

## 6. Architecture & fichiers

```
src/
├── lib/
│   ├── custom-requests.ts   # createCustomRequest(sb, data); listCustomRequests(sb); getCustomRequest(sb,id);
│   │                        # setCustomRequestStatus(sb,id,status); attachPaymentLink(sb,id,url)
│   ├── storage.ts           # + uploadReference(requestId,buffer,mime,ext,i); signedUrl(bucket,path,expires)
│   └── payments.ts          # + createPaymentLink(amountEur, label, customRequestId) -> { url }
├── routes/
│   ├── custom.ts            # POST /api/custom-request (multipart public) ; registerCustomRoutes(app)
│   ├── admin.ts             # + GET /api/admin/custom-requests ; GET .../:id (signed urls) ;
│   │                        #   PATCH .../:id/status ; POST .../:id/payment-link
│   └── stripe-webhook.ts    # + si metadata.custom_request_id → setCustomRequestStatus 'payée'
public/
├── sur-mesure.html, js/sur-mesure.js
├── admin.html, js/admin.js  # + onglet Demandes sur-mesure
test/
└── custom-requests.test.ts  # createCustomRequest (mapping), setStatus (validation), payment amount→cents
```

Branchements dans `createApp()` : `registerCustomRoutes(app)`. Alias `/sur-mesure` dans `PAGE_ALIASES`.

## 7. Paiement — Stripe Payment Link

- `createPaymentLink(amountEur, label, customRequestId)` (dans `payments.ts`) : crée un `price` inline (`stripe.prices.create({ currency:'eur', unit_amount: amount*100, product_data:{ name: label } })`) puis `stripe.paymentLinks.create({ line_items:[{ price, quantity:1 }], metadata:{ custom_request_id } })`. Renvoie `{ url }`.
- Le webhook : sur `checkout.session.completed`, si `session.metadata?.custom_request_id` (les Payment Links propagent les metadata aux sessions) ET pas de `product_id` (pour ne pas confondre avec un achat boutique) → `setCustomRequestStatus(sb, id, 'payée')`. Best-effort, idempotent (mettre à 'payée' est idempotent).
- Sans clés Stripe : `POST .../payment-link` renvoie 503 ; l'admin affiche un message.

## 8. i18n

Nouvelles clés `custom.*` (FR/EN) pour la page sur-mesure (titre, intro, labels du formulaire, bouton, messages succès/erreur). Parité imposée par le test existant.

## 9. Tests

- `custom-requests.test.ts` : `createCustomRequest` mappe les champs et insère (Supabase mocké) ; `setCustomRequestStatus` rejette un statut invalide ; logique de montant→centimes du payment link (fonction pure, sans réseau).
- Validation d'upload : test de `isAllowedImage` déjà couvert (Plan 2) ; honeypot/limites testés au niveau route si faisable, sinon vérif manuelle.
- Tests existants verts ; parité i18n maintenue.
- Vérif manuelle : soumettre une demande (avec photos), la voir dans l'admin avec photos signées, changer le statut, générer un lien (avec clés Stripe test).

## 10. Critères de succès

- Un visiteur peut envoyer une demande sur-mesure avec photos ; l'artisane la reçoit par email et la voit dans l'admin (photos affichées via URLs signées).
- L'artisane peut changer le statut et **générer un lien de paiement Stripe** (avec clés) à envoyer au client.
- Le paiement du lien marque la demande « payée » automatiquement (webhook).
- Sans clés Stripe : la demande fonctionne ; seule la génération de lien est inactive (message clair).
- Garde-fous anti-abus actifs (limites, honeypot, rate-limit) ; photos clients non publiques.
- Tous les tests passent ; parité i18n garantie.

## 11. Notes d'exploitation

- Créer le bucket **privé** `custom-references` dans Supabase (Storage → New bucket, **décocher** Public). Documenté dans le README.
- Les Payment Links nécessitent les clés Stripe (mêmes que Plan 3). L'event webhook est déjà configuré (Plan 3) — aucun nouvel endpoint à déclarer côté Stripe.
