# Plan 3 — Paiement & Commandes — Design

**Date :** 2026-06-27
**Statut :** Approuvé (l'utilisatrice a validé le design et autorisé l'enchaînement spec → plan → exécution)
**Prérequis :** Plans 1 & 2 livrés (boutique alimentée par Supabase, fiches produits, admin produits/images).

## 1. Objectif

Permettre l'achat réel d'une pièce unique via **Stripe Checkout hébergé**, enregistrer la commande, marquer la pièce vendue, notifier client + artisane par email (Resend), et donner à l'admin un suivi des commandes (expédiée/livrée).

Tout doit être codé pour **fonctionner dès l'ajout des clés** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`) ; sans clés valides, le site continue de tourner et le paiement affiche un message clair plutôt que de planter.

## 2. Parcours d'achat

1. Fiche produit → bouton **« Acheter »** → `POST /api/checkout` avec `{ slug, lang }`.
2. Le serveur :
   - récupère le produit ; **refuse** (409) si `status !== 'disponible'` ;
   - crée une **Stripe Checkout Session** (`mode: 'payment'`) :
     - line item via `price_data` dynamique (devise EUR, `unit_amount` = prix×100, nom = titre dans la langue),
     - `shipping_address_collection.allowed_countries` = liste configurable,
     - `shipping_options` = 3 tarifs (`shipping_rate_data`) France / Europe / Monde, montants configurables,
     - `metadata.product_id`, `metadata.slug`, `metadata.lang`,
     - `success_url = {APP_URL}/merci?session_id={CHECKOUT_SESSION_ID}` (et `/en/merci`… → une seule page `merci.html` bilingue avec `?lang`),
     - `cancel_url = {APP_URL}/produit/{slug}`.
   - renvoie `{ url }` ; le client est redirigé côté navigateur.
3. Paiement sur la page Stripe → redirection vers **`/merci`** (page de remerciement FR/EN).
4. **Webhook** `POST /api/stripe/webhook` (corps brut, signature vérifiée) :
   - sur `checkout.session.completed` :
     - idempotent : si une commande existe déjà pour ce `stripe_session_id`, ne rien refaire ;
     - insère la commande (`orders`) : `product_id`, `customer_email`, `amount` (total/100), `shipping_address` (JSONB depuis `session.customer_details`/`shipping_details`), `status='payée'`, `lang` ;
     - marque le produit `status='vendu'` ;
     - envoie un **email de confirmation au client** + une **notification à l'artisane** (Resend), dans la langue de la commande ; échec d'email = best-effort (loggé, n'invalide pas la commande).

## 3. Configuration (un seul endroit)

Dans `src/config.ts` :
- `SHIPPING_RATES` : tableau `{ key, label_fr, label_en, amount }` — défauts : France 8€, Europe 15€, Monde 25€.
- `SHIPPING_COUNTRIES` : liste de codes pays autorisés (large par défaut : FR + UE + US/CA/CH/GB… ; modifiable).
- `ORDER_NOTIFY_EMAIL` : destinataire des notifications de commande (défaut = `CONTACT_TO`).
- Devise : `EUR`.

## 4. Disponibilité des clés (dégradation propre)

- `POST /api/checkout` : si `STRIPE_SECRET_KEY` absente/factice → renvoie `503` `{ error, code: 'payments_unavailable' }` ; le front affiche un message « paiement bientôt disponible » sans casser la page.
- Webhook : si `STRIPE_WEBHOOK_SECRET` absent → `503` (Stripe ne l'appellera de toute façon pas).
- Emails : si `RESEND_API_KEY` factice → l'envoi échoue silencieusement (loggé), la commande reste enregistrée.
- Helper `paymentsConfigured()` (vérifie présence + format `sk_`/`whsec_`) pour piloter ces comportements et permettre les tests sans vraies clés.

## 5. Pages & UI

- **`/merci`** (`public/merci.html` + `public/js/merci.js`) : page de remerciement bilingue ; lit `?session_id`, appelle `GET /api/checkout/session/:id` (lecture légère : statut payé + email masqué) pour confirmer, affiche un message de confirmation + lien retour boutique. Tolérante si le webhook n'a pas encore tourné (message « confirmation en cours »).
- **Fiche produit** : le bouton « Acheter » déclenche le checkout (remplace le lien `/contact?produit=`). En cas de `503`, message inline.
- **Admin — onglet Commandes** : liste des commandes (`GET /api/admin/orders`, triées par date), affiche produit/montant/email/adresse/statut ; boutons **Marquer expédiée** / **Marquer livrée** (`PATCH /api/admin/orders/:id/status`).

## 6. Architecture & fichiers

```
src/
├── lib/
│   ├── payments.ts        # paymentsConfigured(); createCheckoutSession(); construction line item + shipping_options
│   └── orders.ts          # createOrderFromSession() (insert idempotent), listOrders(), setOrderStatus()
├── routes/
│   ├── checkout.ts        # POST /api/checkout ; GET /api/checkout/session/:id ; registerCheckoutRoutes(app)
│   └── stripe-webhook.ts  # POST /api/stripe/webhook (raw body) ; registerStripeWebhook(app)
│   └── admin.ts           # + routes commandes (GET orders, PATCH status)
public/
├── merci.html, js/merci.js
├── js/produit.js          # bouton Acheter → checkout
├── js/admin.js            # + onglet commandes
emails/ (templates in code, dans payments/orders or a lib/emails.ts)
└── src/lib/emails.ts      # buildOrderConfirmation(fr/en), buildOrderNotify()
test/
├── payments.test.ts       # paymentsConfigured(), construction des shipping_options/line item (pure, sans réseau)
└── orders.test.ts         # createOrderFromSession idempotent + mapping (Supabase mocké)
```

**Webhook & body brut** : la route webhook doit recevoir le corps **brut** (`express.raw`) pour la vérification de signature — montée AVANT `express.json()` dans `app.ts` (ou via un `express.raw` ciblé sur ce path). À gérer proprement dans `createApp()`.

**Branchement** : `registerCheckoutRoutes(app)` et `registerStripeWebhook(app)` ajoutés dans `createApp()`. Routes `/merci` ajoutée à `PAGE_ALIASES`.

## 7. Données

Utilise la table `orders` déjà créée au Plan 1 :
`id, stripe_session_id (unique), product_id, customer_id (null pour invité), customer_email, amount, shipping_address (JSONB), status ('payée'|'expédiée'|'livrée'), lang, created_at, shipped_at, delivered_at`.
Pas de migration nécessaire. (Le `customer_id` reste null tant que les comptes clients n'existent pas — Plan 4.)

## 8. Sécurité

- Webhook : signature Stripe vérifiée (`stripe.webhooks.constructEvent`) ; rejet 400 si invalide.
- Routes admin commandes derrière `requireAdmin`.
- Montant **toujours** recalculé côté serveur depuis le prix en base (jamais depuis le client) à la création de la session.
- Vérif disponibilité avant création de session (limite la double-vente sur pièce unique).
- Échappement des données affichées (emails, page merci, admin).

## 9. Tests

- `payments.test.ts` : `paymentsConfigured()` (clés factices/absentes → false ; `sk_`/`whsec_` présents → true) ; construction du line item (unit_amount = prix×100) et des `shipping_options` depuis `SHIPPING_RATES` — fonctions pures, sans appel réseau.
- `orders.test.ts` : `createOrderFromSession` insère une fois (idempotent sur `stripe_session_id`), mappe correctement les champs (Supabase mocké, comme `products.test.ts`).
- Les tests existants restent verts. Parité i18n maintenue (nouvelles clés merci/acheter/notifications).
- Vérif manuelle avec clés Stripe **test** (l'utilisatrice les ajoutera) : achat de bout en bout via Stripe CLI pour le webhook ; documenté dans le plan/README.

## 10. Critères de succès

- Avec des clés Stripe test : cliquer « Acheter » mène à la page Stripe, le paiement crée une commande, marque la pièce vendue, envoie les emails, et redirige vers « Merci ».
- Sans clés : le site tourne, « Acheter » affiche un message propre, aucun crash.
- L'admin voit les commandes et peut les marquer expédiée/livrée.
- Montants/port corrects et configurables en un seul endroit.
- Tous les tests passent ; parité i18n garantie.

## 11. Note d'exploitation (pour l'utilisatrice, plus tard)

Pour activer : créer le compte Stripe, mettre `STRIPE_SECRET_KEY` (test `sk_test_…` puis live), configurer un **endpoint webhook** Stripe pointant sur `{APP_URL}/api/stripe/webhook` et copier le `whsec_…` dans `STRIPE_WEBHOOK_SECRET` ; vérifier le domaine d'envoi Resend. Étapes détaillées dans le README (ajoutées par le plan).
