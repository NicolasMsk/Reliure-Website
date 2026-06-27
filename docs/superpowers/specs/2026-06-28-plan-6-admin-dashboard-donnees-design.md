# Plan 6 — Espace admin & enrichissement des données — Design

**Date :** 2026-06-28
**Statut :** Approuvé (design validé, enchaînement spec → plan → exécution autorisé)
**Prérequis :** Plans 1-5 livrés (boutique, admin produits/commandes/sur-mesure, paiement, comptes clients).

## 1. Objectif

L'artisane accorde une grande importance aux données de son activité. Ce plan : (A) **enrichit le modèle de données** (champs clients, suivi de commande, téléphone sur-mesure, messages de contact persistés, journal de consentement RGPD) ; (B) **transforme l'admin en espace de pilotage** avec **navigation par onglets** et un **tableau de bord de statistiques** (CA, ventes, stock, à-traiter).

## 2. Partie A — Enrichissement des données

### Migration SQL (idempotente, exécutée une fois dans le SQL Editor de Supabase)
- `customers` : `+ phone TEXT, + address_line1 TEXT, + address_line2 TEXT, + postal_code TEXT, + city TEXT, + country TEXT`.
- `orders` : `+ tracking_number TEXT`.
- `custom_requests` : `+ phone TEXT`.
- Nouvelle table **`contact_messages`** : `id UUID PK, name TEXT, email TEXT, message TEXT, lang TEXT('fr'|'en'), status TEXT('nouveau'|'lu') default 'nouveau', created_at TIMESTAMPTZ`.
- Nouvelle table **`consents`** : `id UUID PK, customer_id UUID NULL, email TEXT, consent_type TEXT (ex 'cgv'), granted BOOLEAN default true, created_at TIMESTAMPTZ`.
- RLS **activé** (deny-by-default) sur les 2 nouvelles tables ; aucun accès public (serveur via clé service).
- Toutes les instructions en `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` pour rejouabilité.

### Branchements
- **Contact** : `POST /api/contact` insère le message dans `contact_messages` (en plus de l'email best-effort). Persistance d'abord, email ensuite — un échec d'email ne perd plus le message.
- **Inscription** (compte) : champ **téléphone** (optionnel) + **case obligatoire « J'accepte les CGV et la politique de confidentialité »** ; à la création, le consentement est journalisé via un endpoint dédié.
- **Espace compte** : section **profil éditable** (nom, téléphone, adresse) — `PATCH /api/account/me` étendu.
- **Sur-mesure** : champ **téléphone** (optionnel) sur le formulaire ; stocké dans `custom_requests.phone` ; affiché dans le détail admin.
- **Commande expédiée** : l'admin saisit un **n° de suivi** au passage `expédiée` ; stocké dans `orders.tracking_number`, affiché au client (historique compte) et inclus dans l'email d'expédition (si Resend configuré).

## 3. Partie B — Espace admin repensé

### Navigation par onglets
Une barre d'onglets dans `#admin-view` : **Tableau de bord · Produits · Commandes · Sur-mesure · Messages**. Un seul panneau visible à la fois (bascule JS, pas de rechargement). Conserve la connexion/déconnexion existantes.

### Tableau de bord — `GET /api/admin/stats`
Un endpoint unique (derrière `requireAdmin`) qui calcule et renvoie les agrégats côté serveur :
- **CA** : `revenue_month` (somme `orders.amount` du mois courant), `revenue_total`.
- **Ventes** : `orders_count` total, `orders_count_month`, et `recent_sales` (5 dernières commandes : date, produit/email, montant, statut).
- **Stock & catalogue** : `products_available`, `products_sold`, `products_draft`, et `by_category` (compte par catégorie des produits disponibles).
- **À traiter** : `orders_to_ship` (status `payée`), `custom_new` (demandes `nouvelle`), `messages_unread` (`contact_messages` `nouveau`).
- Calculs en JS à partir des lignes lues (volumes faibles — pas d'agrégation SQL complexe nécessaire). Logique isolée et testable dans `src/lib/stats.ts` (`computeStats(data)` pur + `getStats(sb)` qui lit puis calcule).

### Cartes & rendu
Le dashboard affiche des **cartes de stats** (composant `.stat-card` additif, cohérent avec la palette médiévale/sauge) : CA mois/total, ventes, pièces vendues, stock par statut, répartition par catégorie (liste), et une zone « À traiter » avec compteurs cliquables menant à l'onglet concerné. Plus une liste « Activité récente » (dernières ventes / demandes / messages).

### Sections (onglets)
- **Produits** : table existante (créer/éditer/supprimer/upload images) — déplacée dans l'onglet, présentation soignée.
- **Commandes** : table existante + **saisie du n° de suivi** dans le détail/au passage `expédiée`.
- **Sur-mesure** : existant + **téléphone** affiché dans le détail.
- **Messages** (nouveau) : liste des `contact_messages` (date, nom/email, extrait), détail, bouton **« Marquer lu »** ; badge de non-lus.

## 4. Architecture & fichiers

```
src/
├── lib/
│   ├── stats.ts             # computeStats(data) pur + getStats(sb) ; types StatsResult
│   ├── contact-messages.ts  # createContactMessage, listContactMessages, setMessageStatus
│   ├── customers.ts         # + champs phone/address dans update profil
│   └── consents.ts          # recordConsent(sb, {email, customer_id?, consent_type, granted})
├── routes/
│   ├── admin.ts             # + GET /api/admin/stats ; + messages routes ; + tracking sur status ; + custom phone déjà via lib
│   ├── account.ts           # PATCH /api/account/me étendu (phone + adresse) ; POST consent (ou via /api/consent)
│   ├── contact.ts           # persiste le message + email
│   ├── custom.ts            # + phone
│   └── consent.ts           # POST /api/consent (public, rate-limité) — journalise un consentement
public/
├── admin.html, js/admin.js  # refonte : onglets + dashboard + messages + tracking
├── compte.html, js/compte.js# profil éditable (phone/adresse), affichage suivi
├── sur-mesure.html, js/sur-mesure.js # + téléphone
├── css/style.css            # + .stat-card, .admin-tabs, .admin-panel
migrations/
└── 2026-06-28-data-enrichment.sql
test/
├── stats.test.ts            # computeStats : CA mois/total, comptages, by_category, à-traiter
└── contact-messages.test.ts # create/list/setStatus
```

Tous les nouveaux endpoints branchés dans `createApp()`. Routes admin derrière `requireAdmin`.

## 5. Sécurité & RGPD

- Routes admin (`/api/admin/*`) derrière `requireAdmin` (session). Stats lues via clé service.
- `POST /api/contact` et `POST /api/consent` publics → rate-limités, validés, longueurs bornées, échappement (déjà la norme). Honeypot conservé sur contact si présent.
- Consentement **horodaté** (date + type) — traçabilité RGPD. (Pour une conformité complète, prévoir une page CGV/confidentialité — hors périmètre sauf demande ; un lien vers une page CGV pourra être ajouté.)
- RLS deny-by-default sur `contact_messages` et `consents`.
- Champs personnels (téléphone, adresse) jamais exposés publiquement ; lus seulement par le client authentifié (son profil) et l'admin.

## 6. Tests

- `stats.test.ts` : `computeStats` sur un jeu de données mocké — vérifie CA mois (filtre date) vs total, comptages stock par statut, `by_category`, compteurs à-traiter, `recent_sales` tri+limite.
- `contact-messages.test.ts` : create (mapping + statut `nouveau`), list (tri desc), setStatus (validation `nouveau`/`lu`).
- Tests existants verts ; parité i18n maintenue (nouvelles clés compte/contact/sur-mesure si besoin).
- Vérif manuelle : dashboard affiche des chiffres cohérents avec les données seedées ; onglets basculent ; message de contact apparaît dans l'onglet Messages ; n° de suivi saisi s'affiche dans le compte client ; profil éditable enregistre tél/adresse.

## 7. Migration — note d'exploitation

Le fichier `migrations/2026-06-28-data-enrichment.sql` doit être collé/exécuté dans **Supabase → SQL Editor** (comme le schéma initial). Idempotent : rejouable sans risque. Documenté dans le README. *(Le serveur tolère l'absence des nouvelles colonnes/tables en dégradation partielle, mais le dashboard et les nouvelles fonctions nécessitent la migration appliquée.)*

## 8. Hors périmètre (YAGNI)

- Graphiques/courbes temporelles avancées (le dashboard donne des compteurs et listes ; pas de librairie de charting pour l'instant).
- Export CSV/comptabilité (envisageable plus tard).
- Page CGV/confidentialité complète (optionnelle, sur demande).
- Notifications push / temps réel.

## 9. Critères de succès

- L'admin a une navigation par onglets claire et un tableau de bord affichant CA (mois/total), ventes & pièces vendues, stock par statut + par catégorie, et les éléments à traiter.
- Les messages de contact sont stockés et consultables dans l'admin (plus de perte si l'email échoue).
- Le client peut enregistrer téléphone + adresse dans son compte ; ces infos pré-remplissent les futurs parcours ; il voit le n° de suivi de ses commandes.
- Le sur-mesure capte un téléphone ; les consentements sont journalisés.
- Tous les tests passent ; parité i18n garantie ; sécurité (requireAdmin, RLS, validation) respectée.
