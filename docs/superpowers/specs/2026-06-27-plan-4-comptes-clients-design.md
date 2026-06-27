# Plan 4 — Comptes clients — Design

**Date :** 2026-06-27
**Statut :** Approuvé (design validé, enchaînement spec → plan → exécution autorisé)
**Prérequis :** Plans 1-3 livrés (boutique, admin, paiement Stripe + commandes).

## 1. Objectif

Permettre aux clients de **créer un compte** (email + mot de passe via Supabase Auth), de **se connecter/déconnecter**, et de consulter leur **historique de commandes**. Rattacher les commandes payées au compte du client.

## 2. Méthode d'authentification

**Supabase Auth, email + mot de passe.** L'authentification se fait **côté navigateur** avec le SDK Supabase et la **clé publiable** (`SUPABASE_ANON_KEY`, conçue pour le client). Supabase gère : inscription, email de confirmation (mailer Supabase par défaut), connexion, sessions (JWT), réinitialisation de mot de passe.

Le serveur Express reste **centré service-key** : il ne stocke pas de mots de passe ; il **vérifie** le JWT Supabase reçu du navigateur pour les endpoints de compte, puis lit/écrit les données via la clé service.

## 3. Exposition de la configuration au navigateur

Nouvel endpoint public `GET /api/config` → `{ supabaseUrl, supabaseAnonKey }`. La clé publiable n'est pas secrète (faite pour le navigateur). Le SDK Supabase est chargé via CDN UMD (`@supabase/supabase-js@2`) — pas de bundler dans ce projet. (CSP helmet est déjà désactivée, le script externe se charge.)

## 4. Pages & UI

- **`/compte`** (`public/compte.html` + `public/js/compte.js`) :
  - **Non connecté** : onglets **Connexion** / **Inscription** (nom + email + mot de passe), + lien **« Mot de passe oublié »** (déclenche l'email Supabase).
  - **Connecté** : profil (nom, email), **historique de commandes** (date, produit/montant, statut), bouton **Déconnexion**.
  - **Récupération** : si l'URL contient un token de récupération Supabase (retour d'email de reset), afficher un mini-formulaire « nouveau mot de passe » (`supabase.auth.updateUser({ password })`).
- Le lien nav **« Mon compte »** (déjà présent, 404 jusqu'ici) pointe sur `/compte` et devient fonctionnel.

## 5. Serveur — `src/routes/account.ts`

- **Middleware `requireUser`** : lit `Authorization: Bearer <jwt>`, vérifie via `getSupabase().auth.getUser(jwt)`. Si invalide → 401. Sinon attache `req.authUser` (id, email).
- **`ensureCustomer(authUser, name?)`** (`src/lib/customers.ts`) : trouve la ligne `customers` par `auth_user_id`, la crée si absente (avec email + nom). Renvoie la ligne `customers`.
- **`GET /api/account/me`** (requireUser) → `{ email, name }` (assure la fiche customer).
- **`GET /api/account/orders`** (requireUser) → commandes du client : `customer_id = me.id` **OU** `customer_email = authUser.email` (récupère les achats invités faits avec le même email, **vérifié**). Triées par date desc.
- **`PATCH /api/account/me`** (requireUser, optionnel V1) → met à jour le `name` du customer. Inclus (cheap).

`registerAccountRoutes(app)` branché dans `createApp()`.

## 6. Liaison commandes ↔ compte

- À l'achat, `public/js/produit.js` ajoute, si une session Supabase existe, l'en-tête `Authorization: Bearer <token>` à l'appel `POST /api/checkout`.
- `src/routes/checkout.ts` : si un Bearer valide est présent, résout le `customer_id` (via `ensureCustomer`) et le passe dans `metadata.customer_id` de la session Stripe.
- `src/lib/orders.ts` `createOrderFromSession` : lit `session.metadata.customer_id` et le pose sur la commande (champ déjà existant `orders.customer_id`).
- L'historique (`GET /api/account/orders`) combine `customer_id` + email vérifié, donc même les commandes passées avant la création du compte (même email) apparaissent.

## 7. Données

- Table `customers` (déjà créée Plan 1) : `id, auth_user_id (unique), name, email, created_at`. Pas de migration.
- `orders.customer_id` existe déjà (Plan 1), rempli via webhook (Plan 3) — on l'alimente désormais réellement pour les clients connectés.
- L'identité Supabase Auth vit dans le schéma `auth` géré par Supabase ; on ne touche qu'à `customers`/`orders` via la clé service.

## 8. Sécurité

- JWT Supabase **vérifié serveur** à chaque endpoint compte (pas de confiance au client).
- `GET /api/account/orders` ne renvoie que les commandes du `customer_id` **ou** de l'email **authentifié** — jamais d'email fourni par le client → pas d'énumération.
- Clé publiable exposée volontairement (navigateur) ; clé **service jamais** exposée.
- RLS reste deny-by-default ; tous les accès passent par le serveur après vérification d'identité.
- Échappement systématique des contenus rendus (profil, historique).
- Rate-limiter `/api/` déjà actif (couvre les endpoints compte).

## 9. Architecture & fichiers

```
src/
├── lib/
│   └── customers.ts       # ensureCustomer(authUser, name?), getCustomerOrders(sb, customer, email)
├── routes/
│   ├── account.ts         # requireUser; GET /api/account/me; GET /api/account/orders; PATCH /api/account/me; registerAccountRoutes(app)
│   ├── config.ts          # GET /api/config (supabaseUrl + anon key) ; registerConfigRoute(app)
│   ├── checkout.ts        # + lecture Bearer optionnel → metadata.customer_id
public/
├── compte.html, js/compte.js, js/supabase-auth.js  # auth.js: init client Supabase + helpers (signUp/in/out/session)
├── js/produit.js          # + Authorization header si connecté
test/
└── customers.test.ts      # ensureCustomer (créé si absent / réutilisé), getCustomerOrders (par id OU email)
```

`src/lib/orders.ts` : `createOrderFromSession` lit `metadata.customer_id` (petite modif, testée).

## 10. Tests

- `customers.test.ts` : `ensureCustomer` crée la ligne si `auth_user_id` absent, la réutilise sinon (Supabase mocké) ; `getCustomerOrders` renvoie l'union (customer_id OU email), dédupliquée par id.
- Mise à jour `orders.test.ts` : `createOrderFromSession` pose `customer_id` quand `metadata.customer_id` est présent (et null sinon).
- La vérification JWT (`requireUser`) n'est pas testée unitairement (dépend de Supabase) ; la logique testable est isolée dans `customers.ts`.
- Parité i18n maintenue (nouvelles clés compte). Tests existants verts.

## 11. Critères de succès

- Un visiteur peut **créer un compte**, confirmer par email, **se connecter**, voir son **historique de commandes**, et se **déconnecter**.
- Un achat effectué connecté apparaît dans l'historique ; un achat invité avec le même email apparaît aussi après connexion.
- « Mot de passe oublié » envoie un email et permet de définir un nouveau mot de passe.
- Aucune donnée d'un autre client n'est accessible (JWT vérifié, email authentifié).
- Tous les tests passent ; parité i18n garantie ; site fonctionne même si Supabase Auth n'est pas encore configuré côté dashboard (page compte affiche un message clair si `/api/config` ne renvoie pas de clé).

## 12. Notes d'exploitation (pour l'utilisatrice)

- Supabase Auth est actif par défaut sur le projet. La **confirmation d'email** est activée par défaut (l'utilisateur clique un lien avant de pouvoir se connecter) ; désactivable dans Supabase → Authentication → Providers/Email si une inscription sans friction est souhaitée.
- L'URL de redirection des emails (confirmation / reset) doit inclure `{APP_URL}/compte` — à configurer dans Supabase → Authentication → URL Configuration (Site URL + Redirect URLs). Détaillé dans le README (ajouté par le plan).
- Pour un envoi d'emails de marque, configurer un SMTP custom dans Supabase (optionnel, plus tard).
