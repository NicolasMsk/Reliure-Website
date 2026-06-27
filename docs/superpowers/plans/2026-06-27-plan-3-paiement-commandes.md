# Plan 3 — Paiement & Commandes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. For visual/HTML tasks (merci page, admin orders tab) apply the `frontend-design` skill, reusing the existing medieval/religious design system.

**Goal:** Permettre l'achat réel d'une pièce via Stripe Checkout hébergé : créer une session de paiement, enregistrer la commande via webhook, marquer la pièce vendue, notifier client + artisane par email (Resend), afficher une page de remerciement, et gérer le suivi des commandes dans l'admin. Tout fonctionne dès l'ajout des clés ; sans clés, dégradation propre.

**Architecture:** On prolonge la base Express/TS modulaire. Logique isolée et testable dans `src/lib/payments.ts` (config + construction de session, `paymentsConfigured()`), `src/lib/orders.ts` (insert idempotent + statut), `src/lib/emails.ts` (templates). Routes dans `src/routes/checkout.ts` et `src/routes/stripe-webhook.ts` (corps brut pour la signature). L'admin gagne des routes commandes. Page `/merci` bilingue côté client.

**Tech Stack:** Node ≥18, Express 4, TypeScript 5, `stripe` (déjà en dépendance), `@supabase/supabase-js`, `resend`, node:test via tsx. Bilingue FR/EN via dictionnaires JSON.

**Convention de commit :** chaque commit se termine par `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Contexte pour l'implémenteur (lire avant de commencer)

État du dépôt (Plans 1 & 2 livrés) :
- `src/app.ts` `createApp()` : helmet, compression, **`express.json()` global**, rate-limiter `/api/`, cookie-session (clé `SESSION_SECRET`), puis `registerPageRoutes(app, PUBLIC_DIR)`, `registerContactRoutes(app)`, `registerProductRoutes(app)`, `registerAdminRoutes(app)`, puis static (`/css /js /i18n /images` avec cache prod-only, puis `public/`).
- `src/config.ts` : `PORT, APP_URL, EMAIL_FROM, CONTACT_TO, IS_PRODUCTION`.
- `src/lib/clients.ts` : `getStripe()`, `getSupabase()`, `getResend()` (init paresseuse, lisent `process.env` au 1er appel).
- `src/lib/storage.ts` : `publicUrl(storagePath)`.
- `src/lib/products.ts` : `getProductBySlug(sb, slug)` (ne renvoie que `disponible`), `ProductRow`.
- `src/routes/products.ts` : API publique. `src/routes/admin.ts` : `registerAdminRoutes(app)`, `requireAdmin`, CRUD produits + images. `src/routes/pages.ts` : `PAGE_ALIASES` + `/produit/:slug`.
- Table `orders` existe déjà (voir spec §7) : `id, stripe_session_id UNIQUE, product_id, customer_id, customer_email, amount, shipping_address JSONB, status('payée'|'expédiée'|'livrée'), lang, created_at, shipped_at, delivered_at`.
- i18n : `public/i18n/fr.json`/`en.json` (plats, parité imposée par `test/i18n.test.ts`). `public/js/i18n.js` (`window.I18N`), `public/js/util.js` (`window.escHtml`/`escAttr`), `public/js/categories.js`, `public/js/layout.js` (header/footer + nav).
- `public/js/produit.js` : rend la fiche ; le bouton actuel est `<a class="btn" href="/contact?produit=slug">Réserver…</a>` — à remplacer par un vrai bouton d'achat.
- Tests : `npm test` (`tsx --test test/*.test.ts`). Actuellement **16 tests**.
- `.env` a `STRIPE_SECRET_KEY=sk_test_dummy`, `STRIPE_WEBHOOK_SECRET=whsec_dummy`, `RESEND_API_KEY=re_dummy` (factices) — donc `paymentsConfigured()` doit retourner false avec ces valeurs.

Règles : ne jamais renommer une classe CSS/clé i18n existante ; nouvelles chaînes i18n dans fr.json ET en.json ; échapper le contenu dynamique ; recalculer le montant côté serveur.

---

## Structure des fichiers

```
src/
├── config.ts              # + SHIPPING_RATES, SHIPPING_COUNTRIES, ORDER_NOTIFY_EMAIL, CURRENCY
├── lib/
│   ├── payments.ts        # paymentsConfigured(); buildLineItem(); buildShippingOptions(); createCheckoutSession()
│   ├── orders.ts          # createOrderFromSession(); listOrders(); setOrderStatus()
│   └── emails.ts          # buildOrderConfirmation(lang, data); buildOrderNotify(data)
├── routes/
│   ├── checkout.ts        # POST /api/checkout ; GET /api/checkout/session/:id
│   ├── stripe-webhook.ts  # POST /api/stripe/webhook (raw body)
│   └── admin.ts           # + GET /api/admin/orders ; PATCH /api/admin/orders/:id/status
public/
├── merci.html, js/merci.js
├── js/produit.js          # bouton Acheter → /api/checkout
├── admin.html, js/admin.js # + onglet Commandes
test/
├── payments.test.ts
└── orders.test.ts
```

---

# LOT 1 — Cœur paiement (config, payments, orders, emails, checkout, webhook)

### Task 1 : Config paiement & port

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1 : Ajouter à la fin de `src/config.ts`**

```ts
export const CURRENCY = 'eur';

/** Tarifs de port (modifiables ici). Montants en euros. */
export const SHIPPING_RATES = [
  { key: 'fr',     label_fr: 'France',        label_en: 'France',        amount: 8 },
  { key: 'eu',     label_fr: 'Europe',        label_en: 'Europe',        amount: 15 },
  { key: 'world',  label_fr: 'Reste du monde', label_en: 'Rest of world', amount: 25 },
] as const;

/** Pays autorisés à la livraison (codes ISO-2). Élargir si besoin. */
export const SHIPPING_COUNTRIES = [
  'FR','BE','LU','CH','DE','ES','IT','NL','PT','AT','IE','GB',
  'US','CA','SE','DK','FI','NO','PL','CZ','GR','AU','NZ','JP',
] as const;

/** Destinataire des notifications de commande. */
export const ORDER_NOTIFY_EMAIL = process.env.ORDER_NOTIFY_EMAIL || process.env.CONTACT_TO || '';
```

- [ ] **Step 2 : Compiler**

Run : `npm run build` puis `rm -rf dist`
Expected : compile sans erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/config.ts
git commit -m "feat: payment/shipping configuration (rates, countries, currency)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 : `src/lib/payments.ts` + tests (logique pure)

**Files:**
- Create: `src/lib/payments.ts`
- Test: `test/payments.test.ts`

- [ ] **Step 1 : Écrire `test/payments.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentsConfigured, buildLineItem, buildShippingOptions } from '../src/lib/payments';

test('paymentsConfigured: false si clé factice ou absente', () => {
  assert.equal(paymentsConfigured({ STRIPE_SECRET_KEY: 'sk_test_dummy', STRIPE_WEBHOOK_SECRET: 'whsec_dummy' }), false);
  assert.equal(paymentsConfigured({}), false);
  assert.equal(paymentsConfigured({ STRIPE_SECRET_KEY: 'sk_live_abc' }), false); // webhook manquant
});

test('paymentsConfigured: true si clés réelles présentes', () => {
  assert.equal(paymentsConfigured({ STRIPE_SECRET_KEY: 'sk_test_51abc', STRIPE_WEBHOOK_SECRET: 'whsec_realKey123' }), true);
});

test('buildLineItem: unit_amount en centimes, nom selon langue', () => {
  const li = buildLineItem({ title_fr: 'Bible', title_en: 'Bible EN', price: 120 } as any, 'fr');
  assert.equal(li.price_data.currency, 'eur');
  assert.equal(li.price_data.unit_amount, 12000);
  assert.equal(li.price_data.product_data.name, 'Bible');
  assert.equal(li.quantity, 1);
  const liEn = buildLineItem({ title_fr: 'Bible', title_en: 'Bible EN', price: 120 } as any, 'en');
  assert.equal(liEn.price_data.product_data.name, 'Bible EN');
});

test('buildShippingOptions: une option par tarif, montant en centimes', () => {
  const opts = buildShippingOptions('fr');
  assert.equal(opts.length, 3);
  assert.equal(opts[0].shipping_rate_data.fixed_amount.amount, 800);
  assert.equal(opts[0].shipping_rate_data.fixed_amount.currency, 'eur');
  assert.equal(opts[0].shipping_rate_data.display_name, 'France');
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run : `npm test` → FAIL (`Cannot find module '../src/lib/payments'`).

- [ ] **Step 3 : Implémenter `src/lib/payments.ts`**

```ts
import type Stripe from 'stripe';
import { getStripe } from './clients';
import { CURRENCY, SHIPPING_RATES, SHIPPING_COUNTRIES, APP_URL } from '../config';
import type { ProductRow } from './products';

/** Les paiements sont configurés si les clés ont un format réel (pas les valeurs factices). */
export function paymentsConfigured(env: Record<string, string | undefined> = process.env): boolean {
  const sk = env.STRIPE_SECRET_KEY ?? '';
  const wh = env.STRIPE_WEBHOOK_SECRET ?? '';
  const skOk = /^sk_(test|live)_/.test(sk) && sk !== 'sk_test_dummy';
  const whOk = wh.startsWith('whsec_') && wh !== 'whsec_dummy';
  return skOk && whOk;
}

export function buildLineItem(product: ProductRow, lang: 'fr' | 'en') {
  const name = lang === 'en' ? product.title_en : product.title_fr;
  return {
    quantity: 1,
    price_data: {
      currency: CURRENCY,
      unit_amount: Math.round(Number(product.price) * 100),
      product_data: { name },
    },
  };
}

export function buildShippingOptions(lang: 'fr' | 'en') {
  return SHIPPING_RATES.map((r) => ({
    shipping_rate_data: {
      type: 'fixed_amount' as const,
      fixed_amount: { amount: Math.round(r.amount * 100), currency: CURRENCY },
      display_name: lang === 'en' ? r.label_en : r.label_fr,
    },
  }));
}

/** Crée une session Stripe Checkout pour un produit unique. */
export async function createCheckoutSession(product: ProductRow, lang: 'fr' | 'en'): Promise<Stripe.Checkout.Session> {
  return getStripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [buildLineItem(product, lang) as any],
    shipping_options: buildShippingOptions(lang) as any,
    shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES as any },
    locale: lang,
    metadata: { product_id: product.id, slug: product.slug, lang },
    success_url: `${APP_URL}/merci?session_id={CHECKOUT_SESSION_ID}&lang=${lang}`,
    cancel_url: `${APP_URL}/produit/${product.slug}`,
  });
}
```

- [ ] **Step 4 : Lancer (succès attendu)**

Run : `npm test` → PASS (4 nouveaux tests payments).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/payments.ts test/payments.test.ts
git commit -m "feat: payments lib (config check, line item, shipping options, checkout session) with tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 : `src/lib/orders.ts` + tests (insert idempotent, statut)

**Files:**
- Create: `src/lib/orders.ts`
- Test: `test/orders.test.ts`

- [ ] **Step 1 : Écrire `test/orders.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrderFromSession } from '../src/lib/orders';

/** Faux client Supabase enregistrant les inserts et simulant l'unicité de stripe_session_id. */
function fakeSb(existingSessions: string[] = []) {
  const inserted: any[] = [];
  const productUpdates: any[] = [];
  const sb: any = {
    from(table: string) {
      return {
        _table: table,
        select() { return this; },
        eq(col: string, val: any) { this._eqCol = col; this._eqVal = val; return this; },
        maybeSingle() {
          if (this._table === 'orders' && this._eqCol === 'stripe_session_id') {
            return Promise.resolve({ data: existingSessions.includes(this._eqVal) ? { id: 'x' } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(row: any) { inserted.push({ table: this._table, row }); return { select() { return { single() { return Promise.resolve({ data: { id: 'new', ...row }, error: null }); } }; } }; },
        update(patch: any) { productUpdates.push({ table: this._table, patch, eqCol: undefined }); const self = this; return { eq(_c: string, _v: any) { productUpdates[productUpdates.length - 1].id = _v; return Promise.resolve({ error: null }); } }; },
      };
    },
  };
  return { sb, inserted, productUpdates };
}

const SESSION = {
  id: 'cs_test_1',
  amount_total: 12800,
  customer_details: { email: 'client@test.fr' },
  shipping_details: { address: { line1: '1 rue X', city: 'Paris', country: 'FR' } },
  metadata: { product_id: 'p1', slug: 'bible-a', lang: 'fr' },
} as any;

test('createOrderFromSession insère la commande et marque le produit vendu', async () => {
  const { sb, inserted, productUpdates } = fakeSb([]);
  const created = await createOrderFromSession(sb, SESSION);
  assert.equal(created, true);
  const order = inserted.find((i) => i.table === 'orders');
  assert.ok(order);
  assert.equal(order.row.stripe_session_id, 'cs_test_1');
  assert.equal(order.row.amount, 128);
  assert.equal(order.row.customer_email, 'client@test.fr');
  assert.equal(order.row.product_id, 'p1');
  assert.equal(order.row.status, 'payée');
  assert.equal(order.row.lang, 'fr');
  const upd = productUpdates.find((u) => u.table === 'products');
  assert.equal(upd.patch.status, 'vendu');
  assert.equal(upd.id, 'p1');
});

test('createOrderFromSession est idempotent (session déjà traitée)', async () => {
  const { sb, inserted } = fakeSb(['cs_test_1']);
  const created = await createOrderFromSession(sb, SESSION);
  assert.equal(created, false);
  assert.equal(inserted.length, 0);
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run : `npm test` → FAIL (`Cannot find module '../src/lib/orders'`).

- [ ] **Step 3 : Implémenter `src/lib/orders.ts`**

```ts
import { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

export interface OrderRow {
  id: string;
  stripe_session_id: string;
  product_id: string | null;
  customer_email: string | null;
  amount: number;
  shipping_address: any;
  status: 'payée' | 'expédiée' | 'livrée';
  lang: 'fr' | 'en';
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
}

/**
 * Crée la commande depuis une session Stripe complétée et marque le produit vendu.
 * Idempotent : ne fait rien si une commande existe déjà pour ce stripe_session_id.
 * Renvoie true si une commande a été créée, false si déjà traitée.
 */
export async function createOrderFromSession(sb: SupabaseClient, session: Stripe.Checkout.Session): Promise<boolean> {
  const { data: existing } = await sb.from('orders').select('id').eq('stripe_session_id', session.id).maybeSingle();
  if (existing) return false;

  const lang = (session.metadata?.lang === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const productId = session.metadata?.product_id ?? null;
  const shipping = (session as any).shipping_details?.address ?? (session as any).customer_details?.address ?? null;

  await sb.from('orders').insert({
    stripe_session_id: session.id,
    product_id: productId,
    customer_email: session.customer_details?.email ?? null,
    amount: (session.amount_total ?? 0) / 100,
    shipping_address: shipping,
    status: 'payée',
    lang,
  }).select().single();

  if (productId) {
    await sb.from('products').update({ status: 'vendu' }).eq('id', productId);
  }
  return true;
}

/** Liste les commandes (admin), plus récentes d'abord. */
export async function listOrders(sb: SupabaseClient): Promise<OrderRow[]> {
  const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as OrderRow[];
}

/** Met à jour le statut d'une commande (et l'horodatage associé). */
export async function setOrderStatus(sb: SupabaseClient, id: string, status: 'payée' | 'expédiée' | 'livrée'): Promise<void> {
  const patch: Record<string, any> = { status };
  if (status === 'expédiée') patch.shipped_at = new Date().toISOString();
  if (status === 'livrée') patch.delivered_at = new Date().toISOString();
  const { error } = await sb.from('orders').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4 : Lancer (succès attendu)**

Run : `npm test` → PASS (2 nouveaux tests orders).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/orders.ts test/orders.test.ts
git commit -m "feat: orders lib (idempotent create from session, list, status) with tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 : Templates d'email de commande

**Files:**
- Create: `src/lib/emails.ts`

- [ ] **Step 1 : Implémenter `src/lib/emails.ts`**

```ts
export interface OrderEmailData {
  productTitle: string;
  amount: number;       // euros
  email: string;
  shippingAddress?: any;
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function addressLines(a: any): string {
  if (!a) return '';
  const parts = [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.country].filter(Boolean);
  return parts.map((p: string) => esc(p)).join('<br>');
}

const SHELL = (title: string, body: string) => `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;background:#f7f3e8;font-family:Georgia,serif;color:#2a1a1f;">
  <div style="max-width:560px;margin:0 auto;background:#f0ead8;border:1px solid rgba(92,15,36,.2);">
    <div style="background:#420a19;color:#f0ead8;padding:24px;text-align:center;">
      <h1 style="margin:0;font-size:22px;letter-spacing:2px;color:#d2bf81;">Reliure</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:.85;">${esc(title)}</p>
    </div>
    <div style="padding:24px;line-height:1.6;">${body}</div>
    <div style="padding:16px 24px;border-top:1px solid rgba(92,15,36,.15);font-size:11px;color:#5a4a4f;text-align:center;">Reliure — atelier de reliure d'art</div>
  </div>
</body></html>`;

export function buildOrderConfirmation(lang: 'fr' | 'en', d: OrderEmailData): { subject: string; html: string } {
  if (lang === 'en') {
    return {
      subject: 'Your order is confirmed — Reliure',
      html: SHELL('Order confirmed', `
        <p>Thank you for your order!</p>
        <p><strong>${esc(d.productTitle)}</strong> — €${d.amount.toFixed(2)}</p>
        ${d.shippingAddress ? `<p>Shipping to:<br>${addressLines(d.shippingAddress)}</p>` : ''}
        <p>I will carefully prepare and ship your piece. You'll be notified when it's on its way.</p>`),
    };
  }
  return {
    subject: 'Votre commande est confirmée — Reliure',
    html: SHELL('Commande confirmée', `
      <p>Merci pour votre commande !</p>
      <p><strong>${esc(d.productTitle)}</strong> — ${d.amount.toFixed(2)} €</p>
      ${d.shippingAddress ? `<p>Livraison à :<br>${addressLines(d.shippingAddress)}</p>` : ''}
      <p>Je prépare votre pièce avec soin et vous préviendrai de son expédition.</p>`),
  };
}

export function buildOrderNotify(d: OrderEmailData): { subject: string; html: string } {
  return {
    subject: `🔔 Nouvelle commande — ${d.productTitle}`,
    html: SHELL('Nouvelle commande', `
      <p>Nouvelle vente :</p>
      <p><strong>${esc(d.productTitle)}</strong> — ${d.amount.toFixed(2)} €</p>
      <p>Client : ${esc(d.email)}</p>
      ${d.shippingAddress ? `<p>Adresse :<br>${addressLines(d.shippingAddress)}</p>` : ''}`),
  };
}
```

- [ ] **Step 2 : Compiler**

Run : `npm run build` puis `rm -rf dist`
Expected : compile sans erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/emails.ts
git commit -m "feat: bilingual order confirmation + admin notification email templates

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5 : Route checkout (`src/routes/checkout.ts`) + branchement

**Files:**
- Create: `src/routes/checkout.ts`
- Modify: `src/app.ts`

- [ ] **Step 1 : Implémenter `src/routes/checkout.ts`**

```ts
import { Express, Request, Response } from 'express';
import { getSupabase, getStripe } from '../lib/clients';
import { getProductBySlug } from '../lib/products';
import { paymentsConfigured, createCheckoutSession } from '../lib/payments';

export function registerCheckoutRoutes(app: Express): void {
  app.post('/api/checkout', async (req: Request, res: Response): Promise<void> => {
    if (!paymentsConfigured()) {
      res.status(503).json({ error: 'Le paiement en ligne sera bientôt disponible.', code: 'payments_unavailable' });
      return;
    }
    const { slug } = req.body as { slug?: string };
    const lang = (req.body?.lang === 'en' ? 'en' : 'fr') as 'fr' | 'en';
    if (!slug) { res.status(400).json({ error: 'Produit manquant.' }); return; }

    try {
      const product = await getProductBySlug(getSupabase(), slug);
      if (!product) { res.status(409).json({ error: 'Cette pièce n\'est plus disponible.' }); return; }
      const session = await createCheckoutSession(product, lang);
      res.json({ url: session.url });
    } catch (err: any) {
      console.error('POST /api/checkout', err.message);
      res.status(502).json({ error: 'Impossible de démarrer le paiement. Réessayez.' });
    }
  });

  // Lecture légère pour la page Merci (statut + email masqué)
  app.get('/api/checkout/session/:id', async (req: Request, res: Response): Promise<void> => {
    if (!paymentsConfigured()) { res.status(503).json({ error: 'unavailable' }); return; }
    try {
      const s = await getStripe().checkout.sessions.retrieve(req.params.id);
      const email = s.customer_details?.email ?? '';
      const masked = email ? email.replace(/^(.).*(@.*)$/, '$1***$2') : '';
      res.json({ paid: s.payment_status === 'paid', email: masked });
    } catch {
      res.status(404).json({ error: 'introuvable' });
    }
  });
}
```

- [ ] **Step 2 : Brancher dans `src/app.ts`**

Import en haut : `import { registerCheckoutRoutes } from './routes/checkout';`
Appel après `registerAdminRoutes(app);` :
```ts
  registerCheckoutRoutes(app);
```

- [ ] **Step 3 : Vérifier (dégradation propre sans clés)**

Run : `npm test` (16+6=22 verts) puis `npm run dev` :
```bash
curl -s -X POST localhost:3000/api/checkout -H "Content-Type: application/json" -d '{"slug":"bible-familiale-restauree","lang":"fr"}'
```
Expected : `{"error":"Le paiement en ligne sera bientôt disponible.","code":"payments_unavailable"}` (clés factices → 503). Pas de crash.

- [ ] **Step 4 : Commit**

```bash
git add src/routes/checkout.ts src/app.ts
git commit -m "feat: checkout route (Stripe session) with graceful degradation when keys absent

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 : Webhook Stripe (`src/routes/stripe-webhook.ts`) + corps brut

**Files:**
- Create: `src/routes/stripe-webhook.ts`
- Modify: `src/app.ts`

- [ ] **Step 1 : Implémenter `src/routes/stripe-webhook.ts`**

```ts
import { Express, Request, Response } from 'express';
import express from 'express';
import type Stripe from 'stripe';
import { getStripe, getSupabase, getResend } from '../lib/clients';
import { paymentsConfigured } from '../lib/payments';
import { createOrderFromSession } from '../lib/orders';
import { getProductBySlug } from '../lib/products';
import { buildOrderConfirmation, buildOrderNotify } from '../lib/emails';
import { EMAIL_FROM, ORDER_NOTIFY_EMAIL } from '../config';

/** Doit être enregistré AVANT express.json() global (corps brut requis). */
export function registerStripeWebhook(app: Express): void {
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response): Promise<void> => {
    if (!paymentsConfigured()) { res.status(503).json({ error: 'unavailable' }); return; }
    const sig = req.headers['stripe-signature'] as string | undefined;
    if (!sig) { res.status(400).json({ error: 'missing signature' }); return; }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(req.body as Buffer, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err: any) {
      console.error('⚠️  Webhook signature invalide:', err.message);
      res.status(400).json({ error: `Webhook Error: ${err.message}` });
      return;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      try {
        const sb = getSupabase();
        const created = await createOrderFromSession(sb, session);
        if (created) {
          // Emails best-effort
          const lang = (session.metadata?.lang === 'en' ? 'en' : 'fr') as 'fr' | 'en';
          const slug = session.metadata?.slug;
          let title = slug ?? 'Création';
          try {
            // le produit est maintenant 'vendu' donc getProductBySlug (disponible) ne le renvoie plus :
            // on lit le titre directement.
            if (slug) {
              const { data } = await sb.from('products').select('title_fr,title_en').eq('slug', slug).maybeSingle();
              if (data) title = lang === 'en' ? data.title_en : data.title_fr;
            }
          } catch { /* ignore */ }
          const amount = (session.amount_total ?? 0) / 100;
          const email = session.customer_details?.email ?? '';
          const shipping = (session as any).shipping_details?.address ?? null;
          const data = { productTitle: title, amount, email, shippingAddress: shipping };
          if (email) {
            try { const c = buildOrderConfirmation(lang, data); await getResend().emails.send({ from: EMAIL_FROM, to: email, subject: c.subject, html: c.html }); }
            catch (e: any) { console.error('⚠️  email client:', e.message); }
          }
          if (ORDER_NOTIFY_EMAIL) {
            try { const n = buildOrderNotify(data); await getResend().emails.send({ from: EMAIL_FROM, to: ORDER_NOTIFY_EMAIL, subject: n.subject, html: n.html }); }
            catch (e: any) { console.error('⚠️  email notif:', e.message); }
          }
          console.log(`✅ Commande enregistrée — session ${session.id}`);
        }
      } catch (err: any) {
        console.error('❌ Traitement webhook:', err.message);
        // 500 → Stripe réessaiera
        res.status(500).json({ error: 'processing error' });
        return;
      }
    }
    res.json({ received: true });
  });
}
```

Note : `getProductBySlug` n'est plus utilisé ici (titre lu directement car le produit est passé `vendu`) — retirer l'import si laissé inutilisé pour éviter un warning TS (`noUnusedLocals` n'est pas activé, mais rester propre).

- [ ] **Step 2 : Brancher AVANT `express.json()` dans `src/app.ts`**

Dans `createApp()`, le webhook doit être monté **avant** `app.use(express.json())`. Repérer la ligne `app.use(express.json());` et insérer juste avant :
```ts
  // Webhook Stripe — corps brut, AVANT express.json()
  registerStripeWebhook(app);
```
Et ajouter l'import en haut : `import { registerStripeWebhook } from './routes/stripe-webhook';`
(Garder `registerCheckoutRoutes(app)` à sa place après les autres routes — il utilise express.json, c'est correct.)

- [ ] **Step 3 : Vérifier**

Run : `npm test` (toujours verts) puis `npm run dev` :
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/stripe/webhook -H "Content-Type: application/json" -d '{}'
```
Expected : `503` (clés factices). Avec de vraies clés, une signature absente donnerait 400. Pas de crash, et les routes JSON normales fonctionnent toujours (vérifier `curl localhost:3000/api/products` → 200).

- [ ] **Step 4 : Commit**

```bash
git add src/routes/stripe-webhook.ts src/app.ts
git commit -m "feat: Stripe webhook (raw body, signature verify) → create order, mark sold, send emails

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# LOT 2 — Front (Merci, bouton Acheter) & Admin commandes

### Task 7 : Page « Merci » + i18n

> Appliquer le skill `frontend-design`.

**Files:**
- Create: `public/merci.html`
- Create: `public/js/merci.js`
- Modify: `src/routes/pages.ts` (alias `/merci`)
- Modify: `public/i18n/fr.json`, `public/i18n/en.json`

- [ ] **Step 1 : Ajouter les clés i18n (FR puis EN, mêmes clés)**

`fr.json` :
```json
  "merci.title": "Merci pour votre commande",
  "merci.confirmed": "Votre paiement a bien été reçu. Vous allez recevoir un email de confirmation.",
  "merci.pending": "Confirmation en cours… vous recevrez un email sous peu.",
  "merci.back": "Retour à la boutique",
  "product.buy": "Acheter",
  "product.unavailable": "Le paiement en ligne sera bientôt disponible. Contactez-moi pour réserver cette pièce.",
  "product.sold": "Pièce vendue"
```
`en.json` :
```json
  "merci.title": "Thank you for your order",
  "merci.confirmed": "Your payment was received. You will get a confirmation email shortly.",
  "merci.pending": "Confirming… you will receive an email shortly.",
  "merci.back": "Back to the shop",
  "product.buy": "Buy",
  "product.unavailable": "Online payment will be available soon. Contact me to reserve this piece.",
  "product.sold": "Sold"
```

- [ ] **Step 2 : Créer `public/merci.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reliure — Merci</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
  <header class="site-header" id="site-header"></header>
  <main>
    <section class="section center">
      <div class="container" style="max-width:640px">
        <h1 data-i18n="merci.title"></h1>
        <div class="rule"></div>
        <p id="merci-msg" data-i18n="merci.pending"></p>
        <a class="btn" href="/boutique" data-i18n="merci.back"></a>
      </div>
    </section>
  </main>
  <footer class="site-footer" id="site-footer"></footer>
  <script src="/js/i18n.js"></script>
  <script src="/js/layout.js"></script>
  <script src="/js/merci.js"></script>
</body>
</html>
```

- [ ] **Step 3 : Créer `public/js/merci.js`**

```js
/* Page Merci : confirme la commande via l'API si session_id présent. */
document.addEventListener('i18n:ready', async () => {
  const msg = document.getElementById('merci-msg');
  const id = new URLSearchParams(location.search).get('session_id');
  if (!id || !msg) return;
  try {
    const res = await fetch(`/api/checkout/session/${encodeURIComponent(id)}`);
    if (res.ok) {
      const d = await res.json();
      if (d.paid) msg.textContent = window.I18N.t('merci.confirmed');
    }
  } catch { /* garde le message d'attente */ }
}, { once: true });
```

- [ ] **Step 4 : Ajouter l'alias `/merci` dans `src/routes/pages.ts`**

Ajouter `'/merci': 'merci.html'` à l'objet `PAGE_ALIASES`.

- [ ] **Step 5 : Vérifier**

Run : `npm test` (parité i18n verte) puis `npm run dev`, ouvrir `/merci` → page de remerciement bilingue (message « confirmation en cours » sans session_id).

- [ ] **Step 6 : Commit**

```bash
git add public/merci.html public/js/merci.js src/routes/pages.ts public/i18n/fr.json public/i18n/en.json
git commit -m "feat: thank-you page (bilingual) + checkout i18n keys

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8 : Bouton « Acheter » sur la fiche produit

> Appliquer le skill `frontend-design`.

**Files:**
- Modify: `public/js/produit.js`

- [ ] **Step 1 : Remplacer le bouton de réservation par un bouton d'achat**

Dans `public/js/produit.js`, dans la fonction `view(...)`, remplacer le bloc du bouton (actuellement `<a class="btn" href="/contact?produit=...">${reserve}</a>`) par un bouton d'achat avec data-attribut :
```js
  const buyLabel = lang === 'en' ? 'Buy' : 'Acheter';
  // ...dans le template retourné, remplacer le <p> du lien par :
  //   <p style="margin-top:1.5rem">
  //     <button class="btn" id="buy-btn" data-slug="${escAttr(p.slug)}">${buyLabel}</button>
  //     <span id="buy-note" class="form-note" hidden></span>
  //   </p>
```
Concrètement, dans le `return \`...\`` de `view`, remplace la ligne :
```js
        <a class="btn" href="/contact?produit=${encodeURIComponent(p.slug)}">${reserve}</a>
```
par :
```js
        <button class="btn" id="buy-btn" data-slug="${escAttr(p.slug)}">${escHtml(buyLabel)}</button>
        <span id="buy-note" class="form-note" hidden></span>
```
et supprime la variable `reserve` désormais inutilisée ; ajoute `const buyLabel = lang === 'en' ? 'Buy' : 'Acheter';` au début de `view`.

- [ ] **Step 2 : Brancher l'action d'achat après le rendu**

Dans `produit.js`, dans la fonction qui s'exécute après avoir injecté le HTML (là où `wireGallery()` est appelé), ajouter un appel `wireBuy(p)` et définir :
```js
function wireBuy(p) {
  const btn = document.getElementById('buy-btn');
  const note = document.getElementById('buy-note');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    note.hidden = true;
    const lang = window.I18N ? window.I18N.current : 'fr';
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: p.slug, lang }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.url) { window.location.href = d.url; return; }
      }
      // 503 / 409 / autres → message
      const body = await res.json().catch(() => ({}));
      note.textContent = body.code === 'payments_unavailable'
        ? window.I18N.t('product.unavailable')
        : (body.error || window.I18N.t('product.unavailable'));
      note.className = 'form-note is-error';
      note.hidden = false;
      btn.disabled = false;
    } catch {
      note.textContent = window.I18N.t('product.unavailable');
      note.className = 'form-note is-error';
      note.hidden = false;
      btn.disabled = false;
    }
  });
}
```
Note : `produit.js` re-rend au changement de langue (listener `render`) ; assure-toi que `wireBuy` est rappelé à chaque rendu (l'appeler là où `wireGallery` est appelé, dans la fonction de rendu).

- [ ] **Step 3 : Vérifier**

Run : `npm test` puis `npm run dev`, ouvrir une fiche produit (`/produit/bible-familiale-restauree`), cliquer « Acheter » → sans vraies clés, message « paiement bientôt disponible » s'affiche proprement, bouton réactivé. Changer de langue → bouton re-rendu et libellé traduit.

- [ ] **Step 4 : Commit**

```bash
git add public/js/produit.js
git commit -m "feat: product Buy button triggers Stripe checkout (graceful message if unavailable)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9 : Admin — onglet Commandes (API + UI)

> Appliquer le skill `frontend-design` (sobre, cohérent).

**Files:**
- Modify: `src/routes/admin.ts`
- Modify: `public/admin.html`
- Modify: `public/js/admin.js`

- [ ] **Step 1 : Ajouter les routes commandes dans `src/routes/admin.ts`**

Importer en haut : `import { listOrders, setOrderStatus } from '../lib/orders';`
Ajouter dans `registerAdminRoutes`, derrière `requireAdmin` :
```ts
  app.get('/api/admin/orders', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    try {
      const orders = await listOrders(getSupabase());
      res.json(orders);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch('/api/admin/orders/:id/status', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const status = (req.body as any)?.status;
    if (!['payée', 'expédiée', 'livrée'].includes(status)) { res.status(400).json({ error: 'Statut invalide.' }); return; }
    try {
      await setOrderStatus(getSupabase(), req.params.id, status);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
```

- [ ] **Step 2 : Ajouter l'onglet Commandes dans `public/admin.html`**

Dans la vue `#admin-view`, après le tableau des produits, ajouter une section Commandes :
```html
          <h2 style="margin-top:2.5rem">Commandes</h2>
          <table class="admin-table">
            <thead><tr><th>Date</th><th>Produit/Email</th><th>Montant</th><th>Adresse</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody id="orders-tbody"></tbody>
          </table>
```

- [ ] **Step 3 : Charger et gérer les commandes dans `public/js/admin.js`**

Dans `showList()` (après avoir rempli les produits), appeler `loadOrders()`. Ajouter :
```js
async function loadOrders() {
  const tb = document.getElementById('orders-tbody');
  if (!tb) return;
  const orders = await fetch('/api/admin/orders').then((r) => r.ok ? r.json() : []).catch(() => []);
  tb.innerHTML = orders.length ? orders.map(orderRow).join('') : `<tr><td colspan="6">Aucune commande pour l'instant.</td></tr>`;
  tb.querySelectorAll('[data-ship]').forEach((b) => b.addEventListener('click', () => setOrder(b.getAttribute('data-ship'), 'expédiée')));
  tb.querySelectorAll('[data-deliver]').forEach((b) => b.addEventListener('click', () => setOrder(b.getAttribute('data-deliver'), 'livrée')));
}
function orderRow(o) {
  const a = o.shipping_address || {};
  const addr = [a.line1, a.postal_code, a.city, a.country].filter(Boolean).join(', ');
  const date = (o.created_at || '').slice(0, 10);
  return `<tr>
    <td>${escHtml(date)}</td>
    <td>${escHtml(o.customer_email || '')}</td>
    <td>${Number(o.amount).toFixed(2)} €</td>
    <td>${escHtml(addr)}</td>
    <td>${escHtml(o.status)}</td>
    <td class="admin-actions">
      <button class="btn btn--sm" data-ship="${o.id}">Expédiée</button>
      <button class="btn btn--sm" data-deliver="${o.id}">Livrée</button>
    </td></tr>`;
}
async function setOrder(id, status) {
  await fetch(`/api/admin/orders/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  loadOrders();
}
```
(`escHtml` vient de `util.js`, déjà chargé dans admin.html.)

- [ ] **Step 4 : Vérifier**

Run : `npm test` puis `npm run dev`, se connecter à `/admin` → l'onglet Commandes s'affiche (« Aucune commande » tant qu'il n'y a pas de vente). Pas d'erreur console.

- [ ] **Step 5 : Commit**

```bash
git add src/routes/admin.ts public/admin.html public/js/admin.js
git commit -m "feat: admin orders tab (list + mark shipped/delivered)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10 : Documentation d'activation (README)

**Files:**
- Modify: `README.md`

- [ ] **Step 1 : Ajouter une section au `README.md`**

````markdown
## Activer les paiements (Stripe) & emails (Resend)

1. **Stripe** : créer un compte, récupérer la clé secrète (`sk_test_…` en test, `sk_live_…` en prod) → `STRIPE_SECRET_KEY`.
2. **Webhook Stripe** : créer un endpoint pointant sur `{APP_URL}/api/stripe/webhook`, événement `checkout.session.completed`, copier le secret `whsec_…` → `STRIPE_WEBHOOK_SECRET`.
   - En local : `stripe listen --forward-to localhost:3000/api/stripe/webhook` (Stripe CLI) donne un `whsec_…` de test.
3. **Resend** : vérifier le domaine d'envoi, mettre `RESEND_API_KEY` (`re_…`) et un `EMAIL_FROM` vérifié ; `ORDER_NOTIFY_EMAIL` (ou `CONTACT_TO`) reçoit les notifications de commande.
4. **Frais de port** : modifier `SHIPPING_RATES` / `SHIPPING_COUNTRIES` dans `src/config.ts`.

Sans clés valides, le site fonctionne et le bouton « Acheter » affiche un message « paiement bientôt disponible ».
````

- [ ] **Step 2 : Commit**

```bash
git add README.md
git commit -m "docs: how to enable Stripe payments and Resend emails

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (auteur du plan)

**Couverture spec :**
- §2 parcours (checkout, webhook, vendu, emails) → Tasks 2,3,4,5,6. ✅
- §3 config (rates/countries/notify/currency) → Task 1. ✅
- §4 dégradation sans clés (`paymentsConfigured`, 503) → Tasks 2,5,6,8. ✅
- §5 pages (merci, bouton acheter, admin commandes) → Tasks 7,8,9. ✅
- §6 architecture/fichiers → respectée. ✅
- §7 données (table orders existante) → Task 3 (pas de migration). ✅
- §8 sécurité (signature webhook, requireAdmin, montant serveur, dispo) → Tasks 5,6,9. ✅
- §9 tests (payments, orders, parité) → Tasks 2,3,7. ✅
- §11 doc activation → Task 10. ✅

**Placeholders :** aucun TODO non résolu. Le titre produit dans le webhook est lu directement (le produit étant passé `vendu`, `getProductBySlug` ne le renverrait pas) — résolu explicitement. Le bouton Acheter remplace bien le lien contact.

**Cohérence types/signatures :** `paymentsConfigured(env?)`, `buildLineItem(product,lang)`, `buildShippingOptions(lang)`, `createCheckoutSession(product,lang)` cohérents (Task 2 def, Tasks 5/6 usage). `createOrderFromSession(sb,session)`, `listOrders(sb)`, `setOrderStatus(sb,id,status)` cohérents (Task 3 def, Tasks 6/9 usage). `buildOrderConfirmation(lang,data)`/`buildOrderNotify(data)` (Task 4 def, Task 6 usage). i18n : nouvelles clés (merci.*, product.buy/unavailable/sold) ajoutées FR+EN. Webhook monté avant `express.json()` (point d'attention explicite Task 6 Step 2). `escHtml`/`escAttr` viennent de util.js (déjà chargé partout).

**Risque connu documenté :** double-vente concurrente d'une pièce unique atténuée par la vérif `disponible` à la création de session (pas un verrou transactionnel strict — acceptable pour des pièces d'art uniques à faible concurrence). Noté dans la spec §8.
