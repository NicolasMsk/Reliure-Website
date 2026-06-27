# Plan 5 — Sur-mesure (devis + paiement) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. For visual/HTML tasks (sur-mesure page, admin tab) apply the `frontend-design` skill, reusing the existing medieval/religious design system.

**Goal:** Parcours sur-mesure complet : page publique avec formulaire de demande de devis (+ photos de référence), stockage des demandes, notification email à l'artisane, gestion admin (statut + génération de lien de paiement Stripe), et bouclage automatique du paiement via le webhook existant.

**Architecture:** Logique testable isolée dans `src/lib/custom-requests.ts` ; upload de photos dans un bucket Supabase Storage **privé** `custom-references` (URLs signées à la lecture admin) ; route publique multipart `src/routes/custom.ts` avec garde-fous anti-abus ; génération de Stripe Payment Link dans `src/lib/payments.ts` ; le webhook Stripe existant marque la demande payée via `metadata.custom_request_id`.

**Tech Stack:** Node ≥18, Express 4, TypeScript 5, `stripe`, `@supabase/supabase-js`, `multer` (déjà présent), `resend`, node:test via tsx. Bilingue FR/EN.

**Convention de commit :** chaque commit se termine par `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Contexte pour l'implémenteur (lire avant de commencer)

État du dépôt (Plans 1-4 livrés) :
- `src/app.ts` `createApp()` : webhook Stripe (raw) AVANT `express.json()`, puis json, rate-limiter `/api/`, cookie-session, health, puis `registerPageRoutes`, `registerContactRoutes`, `registerProductRoutes`, `registerAdminRoutes`, `registerCheckoutRoutes`, `registerConfigRoute`, `registerAccountRoutes`, puis static.
- `src/lib/clients.ts` : `getStripe()`, `getSupabase()` (clé service), `getResend()`.
- `src/lib/storage.ts` : `isAllowedImage(mime)`, `uploadProductImage(productId, buffer, mime, ext, index)`, `deleteStorageObject(path)`, `publicUrl(storagePath)`. Bucket public `product-images` existant.
- `src/lib/payments.ts` : `paymentsConfigured(env?)`, `buildLineItem`, `buildShippingOptions`, `createCheckoutSession(product, lang, customerId?)`. Importe `getStripe`, `CURRENCY`, etc.
- `src/lib/orders.ts` : `createOrderFromSession(sb, session)` (idempotent ; lit `metadata.product_id`/`customer_id`).
- `src/routes/stripe-webhook.ts` : sur `checkout.session.completed`, guard `payment_status === 'paid'`, puis `createOrderFromSession`. Monté AVANT `express.json()`.
- `src/routes/admin.ts` : `registerAdminRoutes(app)`, `requireAdmin`, multer (`multer.memoryStorage`, 5 Mo) déjà importé pour les images produits ; routes produits/images/commandes. `getSupabase()` importé.
- `src/routes/pages.ts` : `PAGE_ALIASES` (`/`, `/a-propos`, `/contact`, `/faq`, `/boutique`, `/merci`, `/compte`, `/admin`) + `/produit/:slug`. `import path`.
- Table `custom_requests` : `id, name, email, description, budget, reference_images (JSONB), status ('nouvelle'|'devis_envoyé'|'payée'|'terminée'), stripe_payment_link, lang, created_at, updated_at` (+ trigger updated_at).
- Front : `public/js/i18n.js`, `public/js/util.js` (`escHtml`/`escAttr`), `public/js/layout.js` (nav a déjà `<a href="/sur-mesure" data-i18n="nav.custom">`). `public/admin.html` + `public/js/admin.js` (vue admin avec onglets produits/commandes ; `showList()` charge les listes).
- i18n : `public/i18n/fr.json`/`en.json` (103 clés, parité imposée par `test/i18n.test.ts`).
- Tests : `npm test` (`tsx --test test/*.test.ts`) — actuellement **30 tests**.
- **Travailler sur `main` directement** (le projet vit sur main ; pas de branche de feature).

Règles : ne jamais renommer une classe CSS/clé i18n existante ; nouvelles chaînes i18n dans fr.json ET en.json ; échapper le contenu dynamique ; montant Stripe recalculé serveur.

---

## Structure des fichiers

```
src/
├── lib/
│   ├── custom-requests.ts   # createCustomRequest, listCustomRequests, getCustomRequest, setCustomRequestStatus, attachPaymentLink, VALID_STATUSES
│   ├── storage.ts           # + uploadReference(), signedUrl()
│   └── payments.ts          # + createPaymentLink(amountEur, label, customRequestId)
├── routes/
│   ├── custom.ts            # POST /api/custom-request (multipart public)
│   ├── admin.ts             # + custom-requests routes
│   └── stripe-webhook.ts    # + metadata.custom_request_id → payée
public/
├── sur-mesure.html, js/sur-mesure.js
├── admin.html, js/admin.js  # + onglet Demandes sur-mesure
test/
└── custom-requests.test.ts
```

---

# LOT 1 — Backend (lib, storage, route publique, payment link, webhook)

### Task 1 : `src/lib/custom-requests.ts` + tests

**Files:**
- Create: `src/lib/custom-requests.ts`
- Test: `test/custom-requests.test.ts`

- [ ] **Step 1 : Écrire `test/custom-requests.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCustomRequest, setCustomRequestStatus, VALID_STATUSES } from '../src/lib/custom-requests';

function fakeSb() {
  const inserted: any[] = [];
  const updates: any[] = [];
  const sb: any = {
    from(table: string) {
      return {
        _table: table,
        insert(row: any) { inserted.push({ table: this._table, row }); return { select() { return { single() { return Promise.resolve({ data: { id: 'cr-new', ...row }, error: null }); } }; } }; },
        update(patch: any) { const u: any = { table: this._table, patch }; updates.push(u); return { eq(_c: string, v: any) { u.id = v; return Promise.resolve({ error: null }); } }; },
      };
    },
  };
  return { sb, inserted, updates };
}

test('createCustomRequest insère les champs et le statut nouvelle', async () => {
  const { sb, inserted } = fakeSb();
  const r = await createCustomRequest(sb, {
    name: 'Marie', email: 'marie@test.fr', description: 'Restaurer une bible',
    budget: '300-500€', reference_images: ['cr-1/a.jpg'], lang: 'fr',
  });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].row.name, 'Marie');
  assert.equal(inserted[0].row.email, 'marie@test.fr');
  assert.equal(inserted[0].row.status, 'nouvelle');
  assert.deepEqual(inserted[0].row.reference_images, ['cr-1/a.jpg']);
  assert.equal(r.id, 'cr-new');
});

test('setCustomRequestStatus rejette un statut invalide', async () => {
  const { sb } = fakeSb();
  await assert.rejects(() => setCustomRequestStatus(sb, 'cr-1', 'n_importe_quoi' as any));
});

test('setCustomRequestStatus accepte les statuts valides', async () => {
  const { sb, updates } = fakeSb();
  for (const s of VALID_STATUSES) {
    await setCustomRequestStatus(sb, 'cr-1', s);
  }
  assert.equal(updates.length, VALID_STATUSES.length);
  assert.equal(updates[0].patch.status, VALID_STATUSES[0]);
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run : `npm test` → FAIL (`Cannot find module '../src/lib/custom-requests'`).

- [ ] **Step 3 : Implémenter `src/lib/custom-requests.ts`**

```ts
import { SupabaseClient } from '@supabase/supabase-js';

export const VALID_STATUSES = ['nouvelle', 'devis_envoyé', 'payée', 'terminée'] as const;
export type CustomStatus = (typeof VALID_STATUSES)[number];

export interface CustomRequestInput {
  name: string; email: string; description: string;
  budget?: string | null; reference_images?: string[]; lang: 'fr' | 'en';
}

export interface CustomRequestRow {
  id: string; name: string; email: string; description: string;
  budget: string | null; reference_images: string[] | null;
  status: CustomStatus; stripe_payment_link: string | null;
  lang: 'fr' | 'en'; created_at: string; updated_at: string;
}

export async function createCustomRequest(sb: SupabaseClient, input: CustomRequestInput): Promise<CustomRequestRow> {
  const { data, error } = await sb.from('custom_requests').insert({
    name: input.name, email: input.email, description: input.description,
    budget: input.budget ?? null, reference_images: input.reference_images ?? [],
    status: 'nouvelle', lang: input.lang,
  }).select().single();
  if (error) throw new Error(error.message);
  return data as CustomRequestRow;
}

export async function listCustomRequests(sb: SupabaseClient): Promise<CustomRequestRow[]> {
  const { data, error } = await sb.from('custom_requests').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomRequestRow[];
}

export async function getCustomRequest(sb: SupabaseClient, id: string): Promise<CustomRequestRow | null> {
  const { data, error } = await sb.from('custom_requests').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CustomRequestRow) ?? null;
}

export async function setCustomRequestStatus(sb: SupabaseClient, id: string, status: CustomStatus): Promise<void> {
  if (!VALID_STATUSES.includes(status)) throw new Error(`Statut invalide: ${status}`);
  const { error } = await sb.from('custom_requests').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function attachPaymentLink(sb: SupabaseClient, id: string, url: string): Promise<void> {
  const { error } = await sb.from('custom_requests').update({ stripe_payment_link: url, status: 'devis_envoyé' }).eq('id', id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4 : Lancer (succès attendu)**

Run : `npm test` → PASS (3 nouveaux tests custom-requests).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/custom-requests.ts test/custom-requests.test.ts
git commit -m "feat: custom-requests lib (create, list, status, payment link) with tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 : Helpers Storage (bucket privé références + URLs signées)

**Files:**
- Modify: `src/lib/storage.ts`

- [ ] **Step 1 : Ajouter à `src/lib/storage.ts`**

```ts
const REFERENCES_BUCKET = 'custom-references';

/** Téléverse une photo de référence (bucket privé), renvoie le storage_path. */
export async function uploadReference(requestId: string, buffer: Buffer, mime: string, ext: string, index: number): Promise<string> {
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const path = `${requestId}/${Date.now()}-${index}.${safeExt}`;
  const { error } = await getSupabase().storage.from(REFERENCES_BUCKET).upload(path, buffer, { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** URL signée temporaire pour un objet d'un bucket (lecture privée). */
export async function signedReferenceUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const { data, error } = await getSupabase().storage.from(REFERENCES_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
```

(Garder les exports existants intacts ; `getSupabase` est déjà importé en haut du fichier.)

- [ ] **Step 2 : Compiler**

Run : `npm run build` puis `rm -rf dist`
Expected : compile sans erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat: storage helpers for private reference bucket (upload + signed URL)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 : Génération de Stripe Payment Link

**Files:**
- Modify: `src/lib/payments.ts`

- [ ] **Step 1 : Ajouter `createPaymentLink` à `src/lib/payments.ts`**

```ts
/** Crée un Stripe Payment Link pour un montant convenu (devis sur-mesure). */
export async function createPaymentLink(amountEur: number, label: string, customRequestId: string): Promise<{ url: string }> {
  const stripe = getStripe();
  const price = await stripe.prices.create({
    currency: CURRENCY,
    unit_amount: Math.round(amountEur * 100),
    product_data: { name: label },
  });
  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { custom_request_id: customRequestId },
  });
  return { url: link.url };
}
```

(Le fichier importe déjà `getStripe` et `CURRENCY`.)

- [ ] **Step 2 : Compiler**

Run : `npm run build` puis `rm -rf dist`
Expected : compile sans erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/payments.ts
git commit -m "feat: Stripe payment link creation for bespoke quotes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 : Route publique de demande sur-mesure (`src/routes/custom.ts`)

**Files:**
- Create: `src/routes/custom.ts`
- Modify: `src/app.ts`

- [ ] **Step 1 : Implémenter `src/routes/custom.ts`**

```ts
import { Express, Request, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { getResend } from '../lib/clients';
import { getSupabase } from '../lib/clients';
import { isAllowedImage, uploadReference } from '../lib/storage';
import { createCustomRequest } from '../lib/custom-requests';
import { EMAIL_FROM, ORDER_NOTIFY_EMAIL } from '../config';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 3 } });

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function registerCustomRoutes(app: Express): void {
  const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Trop de demandes. Réessayez plus tard.' } });

  app.post('/api/custom-request', limiter, upload.array('images', 3), async (req: Request, res: Response): Promise<void> => {
    const b = req.body as any;
    // Honeypot : si rempli, bot → succès silencieux sans rien enregistrer
    if (b.website) { res.json({ success: true }); return; }

    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 200) : '';
    const email = typeof b.email === 'string' ? b.email.trim().slice(0, 200) : '';
    const description = typeof b.description === 'string' ? b.description.trim().slice(0, 5000) : '';
    const budget = typeof b.budget === 'string' ? b.budget.trim().slice(0, 100) : '';
    const lang = b.lang === 'en' ? 'en' : 'fr';

    if (!name || !description) { res.status(400).json({ error: 'Champs obligatoires manquants.' }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: 'Adresse email invalide.' }); return; }

    const files = ((req as any).files as Array<{ buffer: Buffer; mimetype: string; originalname: string }>) || [];
    for (const f of files) {
      if (!isAllowedImage(f.mimetype)) { res.status(400).json({ error: 'Format d\'image non autorisé (jpeg/png/webp).' }); return; }
    }

    try {
      const sb = getSupabase();
      // 1. Créer la demande (sans images) pour obtenir l'id
      const created = await createCustomRequest(sb, { name, email, description, budget, reference_images: [], lang });
      // 2. Uploader les photos, rattacher les chemins
      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const ext = (files[i].originalname.split('.').pop() || 'jpg');
        try { paths.push(await uploadReference(created.id, files[i].buffer, files[i].mimetype, ext, i)); }
        catch (e: any) { console.error('upload référence', e.message); }
      }
      if (paths.length) {
        await sb.from('custom_requests').update({ reference_images: paths }).eq('id', created.id);
      }
      // 3. Email best-effort à l'artisane
      if (ORDER_NOTIFY_EMAIL) {
        try {
          await getResend().emails.send({
            from: EMAIL_FROM, to: ORDER_NOTIFY_EMAIL,
            subject: `🎨 Nouvelle demande sur-mesure — ${esc(name)}`,
            html: `<p><strong>${esc(name)}</strong> (${esc(email)})</p><p>Budget : ${esc(budget) || '—'}</p><p>${esc(description).replace(/\n/g, '<br>')}</p><p>${paths.length} photo(s) jointe(s).</p>`,
          });
        } catch (e: any) { console.error('email sur-mesure', e.message); }
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error('POST /api/custom-request', err.message);
      res.status(500).json({ error: 'Erreur lors de l\'envoi. Réessayez.' });
    }
  });
}
```

- [ ] **Step 2 : Brancher dans `src/app.ts`**

Import : `import { registerCustomRoutes } from './routes/custom';`
Appel (avec les autres `register*`, ex. après `registerAccountRoutes(app);`) :
```ts
  registerCustomRoutes(app);
```

- [ ] **Step 3 : Vérifier**

Run : `npm test` puis `npm run dev` :
```bash
# Champs manquants → 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/custom-request -F "name=" -F "email=bad"
# Honeypot rempli → 200 silencieux
curl -s -X POST localhost:3000/api/custom-request -F "name=Bot" -F "email=b@b.fr" -F "description=x" -F "website=spam"
```
Expected : 400 pour champs manquants ; `{"success":true}` pour le honeypot (rien enregistré). Un envoi valide (sans bucket créé) pourrait échouer à l'upload mais la demande texte est enregistrée — c'est acceptable ; le bucket sera créé en Task 8.

- [ ] **Step 4 : Commit**

```bash
git add src/routes/custom.ts src/app.ts
git commit -m "feat: public custom-request endpoint (multipart, validation, honeypot, rate-limit, email)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5 : Webhook — bouclage du paiement sur-mesure

**Files:**
- Modify: `src/routes/stripe-webhook.ts`

- [ ] **Step 1 : Gérer `metadata.custom_request_id` dans le webhook**

Dans `src/routes/stripe-webhook.ts`, dans le bloc `checkout.session.completed` (après le guard `payment_status === 'paid'`), AVANT ou À LA PLACE de l'appel `createOrderFromSession` selon le type : un Payment Link sur-mesure n'a PAS de `product_id` mais a `custom_request_id`. Ajouter :
```ts
      // Paiement d'un devis sur-mesure (Payment Link) ?
      const customRequestId = session.metadata?.custom_request_id;
      if (customRequestId) {
        try {
          const { setCustomRequestStatus } = await import('../lib/custom-requests');
          await setCustomRequestStatus(getSupabase(), customRequestId, 'payée');
          console.log(`✅ Devis sur-mesure payé — demande ${customRequestId}`);
        } catch (e: any) {
          console.error('❌ maj demande sur-mesure:', e.message);
        }
        res.json({ received: true });
        return;
      }
```
Placer ce bloc juste après le guard `payment_status` et avant l'appel à `createOrderFromSession` (ainsi un paiement de devis ne tente pas de créer une commande produit). Garder le reste inchangé.

- [ ] **Step 2 : Vérifier**

Run : `npm test` (verts) puis `npm run build` (clean). (Le comportement réel se teste avec Stripe ; ici on vérifie la non-régression et la compilation.)

- [ ] **Step 3 : Commit**

```bash
git add src/routes/stripe-webhook.ts
git commit -m "feat: webhook marks custom request paid via payment-link metadata

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 : Routes admin sur-mesure

**Files:**
- Modify: `src/routes/admin.ts`

- [ ] **Step 1 : Ajouter les routes dans `registerAdminRoutes` (`src/routes/admin.ts`)**

Imports en haut :
```ts
import { listCustomRequests, getCustomRequest, setCustomRequestStatus, attachPaymentLink, VALID_STATUSES } from '../lib/custom-requests';
import { signedReferenceUrl } from '../lib/storage';
import { paymentsConfigured, createPaymentLink } from '../lib/payments';
```
Routes (toutes derrière `requireAdmin`) :
```ts
  app.get('/api/admin/custom-requests', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    try { res.json(await listCustomRequests(getSupabase())); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/admin/custom-requests/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
      const r = await getCustomRequest(getSupabase(), req.params.id);
      if (!r) { res.status(404).json({ error: 'Demande introuvable.' }); return; }
      const images: string[] = [];
      for (const p of (r.reference_images ?? [])) {
        const u = await signedReferenceUrl(p);
        if (u) images.push(u);
      }
      res.json({ ...r, signed_images: images });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch('/api/admin/custom-requests/:id/status', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const status = (req.body as any)?.status;
    if (!VALID_STATUSES.includes(status)) { res.status(400).json({ error: 'Statut invalide.' }); return; }
    try { await setCustomRequestStatus(getSupabase(), req.params.id, status); res.json({ success: true }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/admin/custom-requests/:id/payment-link', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    if (!paymentsConfigured()) { res.status(503).json({ error: 'Paiement indisponible (clés Stripe manquantes).', code: 'payments_unavailable' }); return; }
    const amount = Number((req.body as any)?.amount);
    const label = typeof (req.body as any)?.label === 'string' ? (req.body as any).label.trim().slice(0, 200) : '';
    if (!amount || amount <= 0) { res.status(400).json({ error: 'Montant invalide.' }); return; }
    try {
      const { url } = await createPaymentLink(amount, label || 'Création sur-mesure', req.params.id);
      await attachPaymentLink(getSupabase(), req.params.id, url);
      res.json({ url });
    } catch (err: any) { console.error('payment-link', err.message); res.status(502).json({ error: 'Création du lien impossible.' }); }
  });
```

- [ ] **Step 2 : Vérifier (auth + non-régression)**

Run : `npm test` puis `npm run dev` :
```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/admin/custom-requests   # 401 sans session
```
Expected : 401. `npm run build` clean.

- [ ] **Step 3 : Commit**

```bash
git add src/routes/admin.ts
git commit -m "feat: admin custom-requests routes (list, detail w/ signed images, status, payment link)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# LOT 2 — Frontend (page sur-mesure, onglet admin) & doc

### Task 7 : Page publique « Sur-mesure » + i18n

> Appliquer le skill `frontend-design`.

**Files:**
- Create: `public/sur-mesure.html`
- Create: `public/js/sur-mesure.js`
- Modify: `src/routes/pages.ts` (alias `/sur-mesure`)
- Modify: `public/i18n/fr.json`, `public/i18n/en.json`

- [ ] **Step 1 : Ajouter les clés i18n (FR puis EN, mêmes clés)**

`fr.json` :
```json
  "custom.title": "Sur-mesure",
  "custom.intro": "Une bible à restaurer, une création unique à imaginer ? Décrivez votre projet, je vous réponds avec une proposition personnalisée.",
  "custom.name": "Votre nom",
  "custom.email": "Votre email",
  "custom.budget": "Budget indicatif (optionnel)",
  "custom.description": "Décrivez votre projet",
  "custom.images": "Photos de référence (jusqu'à 3, optionnel)",
  "custom.send": "Envoyer ma demande",
  "custom.success": "Demande envoyée, merci ! Je vous réponds au plus vite.",
  "custom.error": "Une erreur est survenue. Réessayez ou écrivez-moi directement."
```
`en.json` :
```json
  "custom.title": "Bespoke",
  "custom.intro": "A Bible to restore, a unique creation to imagine? Describe your project and I'll reply with a personalized proposal.",
  "custom.name": "Your name",
  "custom.email": "Your email",
  "custom.budget": "Indicative budget (optional)",
  "custom.description": "Describe your project",
  "custom.images": "Reference photos (up to 3, optional)",
  "custom.send": "Send my request",
  "custom.success": "Request sent, thank you! I'll reply as soon as possible.",
  "custom.error": "Something went wrong. Please try again or email me directly."
```

- [ ] **Step 2 : Créer `public/sur-mesure.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reliure — Sur-mesure</title>
  <meta name="description" content="Demande de création ou restauration sur-mesure : bibles, livres religieux, reliure d'art." />
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
  <header class="site-header" id="site-header"></header>
  <main>
    <section class="section">
      <div class="container" style="max-width:620px">
        <h1 class="center" data-i18n="custom.title"></h1>
        <div class="rule"></div>
        <p class="center" data-i18n="custom.intro"></p>
        <form id="custom-form">
          <label class="field"><span data-i18n="custom.name"></span><input type="text" name="name" required /></label>
          <label class="field"><span data-i18n="custom.email"></span><input type="email" name="email" required /></label>
          <label class="field"><span data-i18n="custom.budget"></span><input type="text" name="budget" /></label>
          <label class="field"><span data-i18n="custom.description"></span><textarea name="description" required></textarea></label>
          <label class="field"><span data-i18n="custom.images"></span><input type="file" name="images" accept="image/*" multiple /></label>
          <!-- Honeypot anti-bot (caché) -->
          <input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true" />
          <button class="btn" type="submit" data-i18n="custom.send"></button>
          <p class="form-note hidden" id="custom-note"></p>
        </form>
      </div>
    </section>
  </main>
  <footer class="site-footer" id="site-footer"></footer>
  <script src="/js/i18n.js"></script>
  <script src="/js/util.js"></script>
  <script src="/js/layout.js"></script>
  <script src="/js/sur-mesure.js"></script>
</body>
</html>
```

- [ ] **Step 3 : Créer `public/js/sur-mesure.js`**

```js
/* Formulaire sur-mesure : envoi multipart (texte + photos) avec garde anti-double-soumission. */
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('custom-form');
    const note = document.getElementById('custom-note');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      note.hidden = true;
      try {
        const fd = new FormData(form);
        fd.append('lang', window.I18N ? window.I18N.current : 'fr');
        const res = await fetch('/api/custom-request', { method: 'POST', body: fd });
        const ok = res.ok;
        note.textContent = window.I18N.t(ok ? 'custom.success' : 'custom.error');
        note.className = 'form-note ' + (ok ? 'is-success' : 'is-error');
        note.hidden = false;
        if (ok) form.reset();
      } catch {
        note.textContent = window.I18N.t('custom.error');
        note.className = 'form-note is-error';
        note.hidden = false;
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  });
})();
```

- [ ] **Step 4 : Ajouter l'alias `/sur-mesure` dans `src/routes/pages.ts`**

Ajouter `'/sur-mesure': 'sur-mesure.html'` à `PAGE_ALIASES`.

- [ ] **Step 5 : Vérifier**

Run : `npm test` (parité i18n verte) puis `npm run dev`, ouvrir `/sur-mesure` → formulaire stylé bilingue ; la nav « Sur-mesure » ouvre la page (plus de 404). Soumettre une demande de test (sans bucket → la demande texte s'enregistre, message de succès).

- [ ] **Step 6 : Commit**

```bash
git add public/sur-mesure.html public/js/sur-mesure.js src/routes/pages.ts public/i18n/fr.json public/i18n/en.json
git commit -m "feat: bespoke request page (form + reference photos, honeypot) + i18n + route

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8 : Onglet admin « Demandes sur-mesure » + bucket

> Appliquer le skill `frontend-design` (sobre, cohérent).

**Files:**
- Modify: `public/admin.html`
- Modify: `public/js/admin.js`
- Modify: `README.md` (bucket privé)

- [ ] **Step 1 : Ajouter la section dans `public/admin.html`**

Dans `#admin-view`, après la table Commandes, ajouter :
```html
          <h2 style="margin-top:2.5rem">Demandes sur-mesure</h2>
          <table class="admin-table">
            <thead><tr><th>Date</th><th>Nom / Email</th><th>Budget</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody id="custom-tbody"></tbody>
          </table>
          <div id="custom-detail" class="hidden" style="margin-top:1rem"></div>
```

- [ ] **Step 2 : Gérer les demandes dans `public/js/admin.js`**

Dans `showList()` (après `loadOrders()`), appeler `loadCustom()`. Ajouter :
```js
async function loadCustom() {
  const tb = document.getElementById('custom-tbody');
  if (!tb) return;
  const rows = await fetch('/api/admin/custom-requests').then((r) => r.ok ? r.json() : []).catch(() => []);
  tb.innerHTML = rows.length ? rows.map(customRow).join('') : `<tr><td colspan="5">Aucune demande pour l'instant.</td></tr>`;
  tb.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => viewCustom(b.getAttribute('data-view'))));
}
function customRow(r) {
  const date = (r.created_at || '').slice(0, 10);
  return `<tr>
    <td>${escHtml(date)}</td>
    <td>${escHtml(r.name)}<br><span style="color:var(--text-soft)">${escHtml(r.email)}</span></td>
    <td>${escHtml(r.budget || '—')}</td>
    <td>${escHtml(r.status)}</td>
    <td class="admin-actions"><button class="btn btn--sm" data-view="${escAttr(r.id)}">Voir</button></td>
  </tr>`;
}
async function viewCustom(id) {
  const box = document.getElementById('custom-detail');
  const r = await fetch(`/api/admin/custom-requests/${id}`).then((x) => x.ok ? x.json() : null).catch(() => null);
  if (!r) { box.innerHTML = ''; box.classList.add('hidden'); return; }
  const imgs = (r.signed_images || []).map((u) => `<img src="${escAttr(u)}" style="width:120px;height:150px;object-fit:cover;border:1px solid var(--line);margin:.3rem" />`).join('');
  const link = r.stripe_payment_link ? `<p>Lien : <a href="${escAttr(r.stripe_payment_link)}" target="_blank">${escHtml(r.stripe_payment_link)}</a></p>` : '';
  box.innerHTML = `
    <div class="service-card">
      <h3>${escHtml(r.name)} — ${escHtml(r.email)}</h3>
      <p>${escHtml(r.description).replace(/\n/g, '<br>')}</p>
      <p><em>Budget : ${escHtml(r.budget || '—')}</em></p>
      <div>${imgs}</div>
      <p style="margin-top:1rem">Statut :
        <select id="custom-status">
          <option value="nouvelle">Nouvelle</option>
          <option value="devis_envoyé">Devis envoyé</option>
          <option value="payée">Payée</option>
          <option value="terminée">Terminée</option>
        </select>
        <button class="btn btn--sm" id="custom-status-save">Enregistrer</button>
      </p>
      ${link}
      <p style="margin-top:1rem">Générer un lien de paiement :
        <input type="number" id="pl-amount" min="1" step="0.01" placeholder="Montant €" style="width:120px" />
        <input type="text" id="pl-label" placeholder="Libellé" />
        <button class="btn btn--sm" id="pl-create">Créer le lien</button>
      </p>
      <p class="form-note hidden" id="custom-note2"></p>
    </div>`;
  box.classList.remove('hidden');
  document.getElementById('custom-status').value = r.status;
  document.getElementById('custom-status-save').addEventListener('click', async () => {
    const status = document.getElementById('custom-status').value;
    await fetch(`/api/admin/custom-requests/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    loadCustom();
  });
  document.getElementById('pl-create').addEventListener('click', async () => {
    const amount = Number(document.getElementById('pl-amount').value);
    const label = document.getElementById('pl-label').value;
    const note2 = document.getElementById('custom-note2');
    const res = await fetch(`/api/admin/custom-requests/${id}/payment-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, label }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.url) { note2.textContent = 'Lien créé : ' + body.url; note2.className = 'form-note is-success'; }
    else { note2.textContent = body.error || 'Échec de création du lien.'; note2.className = 'form-note is-error'; }
    note2.hidden = false;
    viewCustom(id);
  });
}
```
(`escHtml`/`escAttr` viennent de `util.js`, déjà chargé dans admin.html.)

- [ ] **Step 3 : Documenter le bucket privé dans `README.md`**

````markdown
## Bucket Storage privé (photos sur-mesure)

Créer un bucket **privé** `custom-references` :
- Dashboard Supabase → Storage → New bucket → nom `custom-references`, **NE PAS cocher** Public → Create.

Ou via SQL :
```sql
insert into storage.buckets (id, name, public)
values ('custom-references', 'custom-references', false)
on conflict (id) do nothing;
```
Les photos sont lues par l'admin via des URLs signées temporaires (clé service).
````

- [ ] **Step 4 : Créer le bucket privé via la clé service**

Exécuter un script ponctuel (comme au Plan 2 pour `product-images`) :
```bash
node -e "require('dotenv').config(); const { createClient } = require('@supabase/supabase-js'); const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY); sb.storage.createBucket('custom-references', { public: false }).then(r => console.log(JSON.stringify(r))).catch(e => console.error(e));"
```
Expected : succès, ou « already exists » (idempotent). Si le `require('@supabase/supabase-js')` échoue sous tsx/ESM, utiliser un fichier `scripts/_create-bucket-custom.ts` temporaire avec import ESM, l'exécuter via `npx tsx`, puis le supprimer.

- [ ] **Step 5 : Vérifier (bout en bout, sans Stripe)**

Run : `npm test` puis `npm run dev` :
- Soumettre une demande sur-mesure avec 1-2 photos sur `/sur-mesure` → message succès.
- Se connecter à `/admin`, onglet « Demandes sur-mesure » → la demande apparaît ; « Voir » affiche description + **photos** (URLs signées) ; changer le statut fonctionne.
- Génération de lien : sans clés Stripe → message « paiement indisponible » propre (503).

- [ ] **Step 6 : Commit**

```bash
git add public/admin.html public/js/admin.js README.md
git commit -m "feat: admin bespoke-requests tab (detail, signed photos, status, payment link) + bucket docs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (auteur du plan)

**Couverture spec :**
- §2 parcours (form → custom_requests + email ; admin ; payment link ; webhook) → Tasks 1,3,4,5,6,7,8. ✅
- §3 données (custom_requests existante) → pas de migration. ✅
- §4 stockage privé + URLs signées → Tasks 2,6 (signed dans detail). ✅
- §5 sécurité (rate-limit, MIME, honeypot, longueurs, email) → Task 4. ✅
- §6 fichiers → respectés. ✅
- §7 payment link (price + paymentLinks + metadata) → Task 3 ; webhook bouclage → Task 5. ✅
- §8 i18n → Task 7. ✅
- §9 tests (custom-requests) → Task 1. ✅
- §11 doc/bucket → Task 8. ✅

**Placeholders :** aucun TODO. Le `createPaymentLink` montant→centimes est testé indirectement (logique pure `Math.round(amount*100)`) — un test unitaire dédié n'est pas strictement nécessaire mais la logique est triviale et couverte par la vérif manuelle ; les transitions de statut sont testées (Task 1).

**Cohérence types/signatures :** `createCustomRequest(sb, input)`, `listCustomRequests(sb)`, `getCustomRequest(sb,id)`, `setCustomRequestStatus(sb,id,status)`, `attachPaymentLink(sb,id,url)`, `VALID_STATUSES` (Task 1) utilisés en Tasks 4,5,6. `uploadReference(requestId,buffer,mime,ext,i)` / `signedReferenceUrl(path,expires?)` (Task 2) utilisés Tasks 4,6. `createPaymentLink(amountEur,label,customRequestId)` (Task 3) utilisé Task 6. Webhook lit `metadata.custom_request_id` posé par `createPaymentLink` (Task 3↔5). i18n `custom.*` FR+EN. `escHtml`/`escAttr` depuis util.js. Honeypot `website` cohérent entre HTML (Task 7) et route (Task 4).

**Risque connu :** un Payment Link sur-mesure payé déclenche `checkout.session.completed` avec `custom_request_id` mais sans `product_id` → le webhook (Task 5) traite ce cas en premier et `return` avant `createOrderFromSession`, évitant une fausse commande produit. Documenté.
