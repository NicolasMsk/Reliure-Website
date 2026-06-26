# Site de reliure d'art — Boutique & vitrine — Design

**Date :** 2026-06-26
**Statut :** Validé en cadrage, prêt pour le plan d'implémentation

## 1. Vision

Site vitrine et boutique en ligne pour une artisane relieuse (auto-entrepreneuse) permettant
d'exposer et de vendre ses créations de reliure d'art. Deux modes de vente coexistent :

1. **Pièces uniques en vente directe** — chaque création est un exemplaire unique ; une fois
   vendue, elle est retirée de la vente.
2. **Commandes sur-mesure** — demande de devis via formulaire, puis paiement via lien Stripe
   généré par l'artisane.

Direction artistique : **médiéval raffiné et élégant** (manuscrits enluminés, cuir, dorure).
Bilingue **français / anglais**. Le rendu visuel sera réalisé avec le skill `frontend-design`
pour éviter tout rendu générique « IA ».

## 2. Stack technique

Identique au site Aura Intuitive (réutilisation des patterns) :

| Composant | Technologie |
|---|---|
| Backend | Express.js (TypeScript) |
| Base de données | Supabase (PostgreSQL) |
| Stockage images | Supabase Storage (bucket public en lecture, écriture via clé service) |
| Authentification | Supabase Auth (email/mot de passe) |
| Paiements | Stripe Checkout (sessions hébergées) |
| Emails | Resend |
| Hébergement | Railway |
| Frontend | HTML/CSS/JS statique dans `public/` |

## 3. Choix d'architecture du paiement

**Retenu : Stripe Checkout hébergé (Option A).** Le serveur crée une session Checkout par achat.
Stripe gère la page de paiement sécurisée, la collecte de l'adresse de livraison, le calcul des
**frais de port par zone (France / International)** via les Shipping Rates Stripe, et la TVA si
applicable. La confirmation arrive par **webhook**.

Justification : meilleur rapport élégance / robustesse / délai de mise en ligne pour un lancement
d'auto-entrepreneuse. Le design médiéval s'exprime sur tout le site ; seule la page de paiement
finale est habillée Stripe (personnalisable avec logo + couleurs).

Options écartées : panier 100 % sur-mesure (Stripe Elements) — trop de code/surface de sécurité
pour la v1 ; liens de paiement fixes — trop rigides pour des pièces uniques + zones de port.

## 4. Modèle de données (Supabase / PostgreSQL)

### `products`
Créations exposées. Pièces **uniques**.
- `id` (UUID, PK)
- `slug` (TEXT, unique) — pour les URLs propres
- `title_fr`, `title_en` (TEXT)
- `description_fr`, `description_en` (TEXT)
- `price` (NUMERIC) — en euros
- `category` (TEXT) — ex : carnet, registre, restauration, coffret…
- `status` (TEXT) — `brouillon` | `disponible` | `vendu`
- `weight_grams` (INT) — pour estimer le port
- `stripe_price_id` ou prix dynamique (à trancher au plan : prix dynamique recommandé)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### `product_images`
Plusieurs images par produit.
- `id` (UUID, PK)
- `product_id` (UUID, FK → products)
- `storage_path` (TEXT) — chemin dans Supabase Storage
- `alt_fr`, `alt_en` (TEXT)
- `sort_order` (INT)

### `orders`
Commandes en vente directe.
- `id` (UUID, PK)
- `stripe_session_id` (TEXT, unique)
- `product_id` (UUID, FK → products)
- `customer_id` (UUID, FK → customers, nullable pour invité)
- `customer_email` (TEXT)
- `amount` (NUMERIC)
- `shipping_address` (JSONB)
- `status` (TEXT) — `payée` | `expédiée` | `livrée`
- `lang` (TEXT) — `fr` | `en`
- `created_at`, `shipped_at`, `delivered_at` (TIMESTAMPTZ)

### `customers`
Comptes clients (liés à Supabase Auth via `auth_user_id`).
- `id` (UUID, PK)
- `auth_user_id` (UUID, unique) — référence Supabase Auth
- `name` (TEXT)
- `email` (TEXT)
- `created_at` (TIMESTAMPTZ)
- Historique = jointure sur `orders.customer_id`.

### `custom_requests`
Demandes de commandes sur-mesure.
- `id` (UUID, PK)
- `name`, `email` (TEXT)
- `description` (TEXT)
- `budget` (TEXT ou NUMERIC)
- `reference_images` (JSONB) — chemins Storage des photos de référence
- `status` (TEXT) — `nouvelle` | `devis_envoyé` | `payée` | `terminée`
- `stripe_payment_link` (TEXT, nullable)
- `lang` (TEXT)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Sécurité :** RLS activé sur toutes les tables ; le serveur utilise la clé service (bypass RLS),
aucune écriture directe côté client. Les comptes clients lisent uniquement leurs propres commandes.

## 5. Pages & parcours

### Pages publiques (FR/EN)
- **Accueil** — héro élégant, sélection de créations, présentation de l'atelier/savoir-faire.
- **Boutique** — grille des pièces `disponible`, filtres par catégorie.
- **Fiche produit** (`/produit/:slug`) — galerie d'images, description, prix, bouton « Acheter ».
- **Sur-mesure** — présentation + formulaire de demande de devis.
- **À propos** — histoire de l'artisane.
- **Contact** — coordonnées + formulaire.
- **Mon compte** — connexion/inscription (Supabase Auth), historique de commandes.

### Parcours achat direct
1. Fiche produit → « Acheter ».
2. Serveur crée une session Stripe Checkout (adresse + shipping rates par zone).
3. Paiement → Stripe redirige vers une page de succès.
4. **Webhook** Stripe : marque le produit `vendu`, crée la commande, envoie les emails de
   confirmation (client + artisane) via Resend.

### Parcours sur-mesure
1. Formulaire de devis → enregistré dans `custom_requests` + email à l'artisane.
2. L'artisane prépare un devis (hors-site / email).
3. Depuis l'admin, elle génère un **lien de paiement Stripe** rattaché à la demande.
4. Le client paie → statut `payée` → suivi dans l'admin.

## 6. Panneau admin (`/admin`, protégé par mot de passe)

- Produits : créer / modifier / changer le statut / supprimer.
- Images : téléversement vers Supabase Storage, réordonnancement.
- Commandes : liste, détail, passage à `expédiée` / `livrée`.
- Demandes sur-mesure : liste, détail, génération de lien de paiement Stripe, changement de statut.

## 7. Internationalisation (FR/EN)

- Sélecteur de langue dans l'en-tête ; préférence mémorisée.
- Contenu produit stocké en deux langues (`*_fr` / `*_en`).
- Emails envoyés dans la langue du client (`lang`), comme Aura.

## 8. Style visuel (médiéval raffiné)

Réalisé à l'implémentation via le skill `frontend-design`. Principes :
- Typographie serif de caractère ; lettrines / capitales ornées avec parcimonie.
- Palette : Bordeaux profond · Almond Cream `#F0EAD8` · Coastal Sage `#99ABA6` ·
  Golden Chamomile `#D2BF81` · accents vert olive / bleu glacé.
- Textures parchemin / cuir subtiles, filets et ornements discrets, espacements généreux.
- Élégant et artisanal — jamais chargé ni « template IA ».

## 8b. Images de remplacement

En attendant les vraies photos des créations, le site utilise des **images libres de droits**
(ex : Unsplash / Pexels — reliure, livres anciens, cuir, parchemin, atelier) cohérentes avec la
direction médiévale raffinée. Elles seront facilement remplaçables depuis l'admin une fois les
vraies photos disponibles.

## 9. Hors périmètre v1 (YAGNI)

- Favoris / wishlist (mentionné mais non retenu pour la v1).
- Panier multi-articles (achat à la pièce suffit pour des pièces uniques).
- Avis clients, blog, newsletter — à envisager plus tard.
- Gestion de stock multi-exemplaires (modèle pièce unique pour la v1).

## 10. Critères de succès

- L'artisane peut ajouter une création avec images depuis l'admin, sans aide technique.
- Un client peut acheter une pièce unique, recevoir confirmation, et la pièce disparaît de la boutique.
- Un client peut envoyer une demande sur-mesure ; l'artisane peut générer un lien de paiement.
- Un client peut créer un compte et consulter son historique de commandes.
- Le site est entièrement disponible en FR et EN.
- Le rendu visuel est manifestement soigné et « médiéval raffiné », pas générique.
