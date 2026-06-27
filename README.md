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

## Feuille de route (plans)

- **Plan 1** — Fondations & design (ce plan) ✅
- **Plan 2** — Catalogue produits & admin
- **Plan 3** — Paiement & commandes (Stripe Checkout + webhook)
- **Plan 4** — Comptes clients (Supabase Auth)
- **Plan 5** — Parcours sur-mesure
