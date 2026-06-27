# Reliure — Site vitrine & boutique

Site de reliure d'art (bilingue FR/EN) : vitrine, boutique de pièces uniques et commandes sur-mesure.

## Architecture

| Composant | Technologie |
|---|---|
| Backend | Express.js (TypeScript) |
| Base de données | Supabase (PostgreSQL) |
| Images | Supabase Storage |
| Auth clients | Supabase Auth |
| Paiements | Stripe Checkout |
| Emails | Resend |
| Hébergement | Railway |

## Développement local

```bash
npm install
cp .env.example .env   # puis remplir les valeurs
npm run dev            # http://localhost:3000
npm test               # tests (node:test via tsx)
npm run build          # compile vers dist/
```

## Variables d'environnement

Voir `.env.example`. Requises au démarrage : `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `ADMIN_PASSWORD`.

## Base de données

Exécuter `schema.sql` dans le SQL Editor de Supabase.

## Déploiement Railway

1. Connecter le dépôt à Railway.
2. Build : `npm run build` — Start : `npm start`.
3. Renseigner les variables d'environnement (Railway fournit `PORT`).
4. Configurer `APP_URL` sur l'URL publique Railway.

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

## Activer les paiements (Stripe) & emails (Resend)

1. **Stripe** : créer un compte, récupérer la clé secrète (`sk_test_…` en test, `sk_live_…` en prod) → `STRIPE_SECRET_KEY`.
2. **Webhook Stripe** : créer un endpoint pointant sur `{APP_URL}/api/stripe/webhook`, événement `checkout.session.completed`, copier le secret `whsec_…` → `STRIPE_WEBHOOK_SECRET`.
   - En local : `stripe listen --forward-to localhost:3000/api/stripe/webhook` (Stripe CLI) donne un `whsec_…` de test.
3. **Resend** : vérifier le domaine d'envoi, mettre `RESEND_API_KEY` (`re_…`) et un `EMAIL_FROM` vérifié ; `ORDER_NOTIFY_EMAIL` (ou `CONTACT_TO`) reçoit les notifications de commande.
4. **Frais de port** : modifier `SHIPPING_RATES` / `SHIPPING_COUNTRIES` dans `src/config.ts`.

Sans clés valides, le site fonctionne et le bouton « Acheter » affiche un message « paiement bientôt disponible ».

## Feuille de route (plans)

- **Plan 1** — Fondations & design (ce plan) ✅
- **Plan 2** — Catalogue produits & admin
- **Plan 3** — Paiement & commandes (Stripe Checkout + webhook)
- **Plan 4** — Comptes clients (Supabase Auth)
- **Plan 5** — Parcours sur-mesure
