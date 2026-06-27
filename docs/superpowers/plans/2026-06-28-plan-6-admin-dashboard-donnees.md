# Plan 6 — Espace admin & enrichissement des données — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. For visual/HTML tasks (admin dashboard, account, sur-mesure) apply the `frontend-design` skill, reusing the existing medieval/sage design system.

**Goal:** Enrichir le modèle de données (champs clients, suivi commande, téléphone sur-mesure, messages de contact persistés, journal de consentement RGPD) et transformer l'admin en espace de pilotage avec navigation par onglets et tableau de bord de statistiques (CA, ventes, stock, à-traiter).

**Architecture:** Migration SQL idempotente pour les colonnes/tables. Logique d'agrégation et d'accès isolée et testable dans `src/lib/{stats,contact-messages,consents}.ts`. Endpoint unique `GET /api/admin/stats`. Admin refondu en onglets côté client (un panneau visible à la fois). Extensions des routes/pages existantes (contact, account, custom, orders).

**Tech Stack:** Node ≥18, Express 4, TypeScript 5, @supabase/supabase-js, node:test via tsx. Bilingue FR/EN.

**Convention de commit :** chaque commit se termine par `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Contexte pour l'implémenteur (lire avant de commencer)

État du dépôt (Plans 1-5 livrés) :
- `src/app.ts` `createApp()` : webhook (raw) avant `express.json()`, puis json, rate-limiter `/api/`, cookie-session (clé `SESSION_SECRET`), health, puis `registerPageRoutes`, `registerContactRoutes`, `registerProductRoutes`, `registerAdminRoutes`, `registerCheckoutRoutes`, `registerConfigRoute`, `registerAccountRoutes`, `registerCustomRoutes`, puis static.
- `src/lib/clients.ts` : `getSupabase()` (clé service), `getStripe()`, `getResend()`.
- `src/lib/customers.ts` : `ensureCustomer(sb, authUser, name?)`, `getCustomerOrders(sb, customerId, email)`, types `AuthUser`/`CustomerRow`.
- `src/lib/orders.ts` : `listOrders(sb)`, `setOrderStatus(sb, id, status)`, `OrderRow`, `createOrderFromSession`.
- `src/lib/custom-requests.ts` : `createCustomRequest(sb, input)`, `listCustomRequests`, `getCustomRequest`, `setCustomRequestStatus`, `attachPaymentLink`, `VALID_STATUSES`. `CustomRequestInput` a `{name,email,description,budget?,reference_images?,lang}`.
- `src/routes/admin.ts` : `registerAdminRoutes(app)`, `requireAdmin`, multer wrappers (`uploadSingle`), routes produits/images/commandes/sur-mesure. `getSupabase()` importé.
- `src/routes/account.ts` : `requireUser`, `GET/PATCH /api/account/me` (PATCH ne gère que `name`), `GET /api/account/orders`.
- `src/routes/contact.ts` : `registerContactRoutes`, `POST /api/contact` (validation + email Resend best-effort, honeypot non présent ici — c'est le formulaire de contact simple ; email valide requis).
- `src/routes/custom.ts` : `registerCustomRoutes`, `POST /api/custom-request` (multipart, honeypot `website`, validations).
- `src/routes/config.ts` : `registerConfigRoute`. `src/routes/stripe-webhook.ts`.
- `public/js/admin.js` : globals (`$`, `EDIT_ID`, `show('login-view'|'admin-view'|'editor-view')`, `showList()` charge produits+commandes+sur-mesure). `public/admin.html` : `#login-view`, `#admin-view` (contient les tables), `#editor-view`. `.hidden { display:none !important }` existe.
- `public/js/util.js` : `window.escHtml`, `window.escAttr`. `public/js/i18n.js` (`window.I18N`). `public/js/supabase-auth.js` (`window.AUTH`). `public/js/compte.js`, `public/js/sur-mesure.js`.
- i18n : `public/i18n/fr.json`/`en.json` (parité imposée par `test/i18n.test.ts`).
- Tests : `npm test` (`tsx --test test/*.test.ts`) — **33 tests**.
- `.env` : colonnes/tables de ce plan PAS encore en base — la migration (Task 1) doit être appliquée dans Supabase. Travailler sur `main` (commits directs sur main, pas de branche de feature).

Règles : ne jamais renommer une classe CSS/clé i18n existante ; nouvelles chaînes i18n dans fr.json ET en.json ; échapper le contenu dynamique ; routes admin derrière `requireAdmin`.

---

# LOT 1 — Données (migration + libs + tests)

### Task 1 : Migration SQL

**Files:**
- Create: `migrations/2026-06-28-data-enrichment.sql`
- Modify: `README.md`

- [ ] **Step 1 : Créer `migrations/2026-06-28-data-enrichment.sql`**

```sql
-- ═══════════════════════════════════════════════════════
-- RELIURE — Migration : enrichissement des données (2026-06-28)
-- À exécuter dans le SQL Editor de Supabase. Idempotent.
-- ═══════════════════════════════════════════════════════

-- ── customers : coordonnées ────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone         TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS postal_code   TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city          TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS country        TEXT;

-- ── orders : suivi d'expédition ────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;

-- ── custom_requests : téléphone ────────────────────────
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS phone TEXT;

-- ── Messages de contact (persistés) ────────────────────
CREATE TABLE IF NOT EXISTS contact_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  message     TEXT NOT NULL,
  lang        TEXT NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr','en')),
  status      TEXT NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','lu')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages (status);

-- ── Journal de consentement (RGPD) ─────────────────────
CREATE TABLE IF NOT EXISTS consents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  email         TEXT,
  consent_type  TEXT NOT NULL,
  granted       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consents_email ON consents (email);

-- ── Sécurité : RLS deny-by-default sur les nouvelles tables ──
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents         ENABLE ROW LEVEL SECURITY;
-- Aucune policy publique : seul le serveur (clé service) lit/écrit.
```

Note : `gen_random_uuid()` est disponible par défaut sur Supabase (extension pgcrypto activée). Si erreur, exécuter d'abord `create extension if not exists pgcrypto;`.

- [ ] **Step 2 : Documenter dans `README.md`**

Ajouter :
````markdown
## Migration données (2026-06-28)

Exécuter `migrations/2026-06-28-data-enrichment.sql` dans Supabase → SQL Editor (idempotent).
Ajoute : coordonnées client (téléphone/adresse), n° de suivi commande, téléphone sur-mesure,
table `contact_messages` (messages persistés) et `consents` (journal RGPD).
````

- [ ] **Step 3 : Appliquer la migration dans Supabase** (étape manuelle)

Copier-coller le SQL dans Supabase → SQL Editor → Run. Cocher une fois fait. (Hors code.)

- [ ] **Step 4 : Commit**

```bash
git add migrations/2026-06-28-data-enrichment.sql README.md
git commit -m "feat: data-enrichment SQL migration (customer fields, tracking, contact_messages, consents)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 : `src/lib/stats.ts` + tests

**Files:**
- Create: `src/lib/stats.ts`
- Test: `test/stats.test.ts`

- [ ] **Step 1 : Écrire `test/stats.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../src/lib/stats';

const NOW = new Date('2026-06-15T12:00:00Z');
const thisMonth = '2026-06-10T10:00:00Z';
const lastMonth = '2026-05-10T10:00:00Z';

const DATA = {
  products: [
    { id: 'p1', category: 'bibles-restaurees', status: 'disponible' },
    { id: 'p2', category: 'bibles-brodees', status: 'disponible' },
    { id: 'p3', category: 'bibles-restaurees', status: 'vendu' },
    { id: 'p4', category: 'livres-religieux', status: 'brouillon' },
  ],
  orders: [
    { id: 'o1', amount: 200, status: 'payée', created_at: thisMonth, customer_email: 'a@a.fr', product_id: 'p3' },
    { id: 'o2', amount: 120, status: 'expédiée', created_at: lastMonth, customer_email: 'b@b.fr', product_id: 'p9' },
  ],
  customRequests: [
    { id: 'c1', status: 'nouvelle' }, { id: 'c2', status: 'payée' },
  ],
  messages: [
    { id: 'm1', status: 'nouveau' }, { id: 'm2', status: 'lu' }, { id: 'm3', status: 'nouveau' },
  ],
};

test('computeStats : CA mois vs total', () => {
  const s = computeStats(DATA, NOW);
  assert.equal(s.revenue_month, 200);   // seulement o1 (juin)
  assert.equal(s.revenue_total, 320);   // o1 + o2
});

test('computeStats : comptages stock par statut + par catégorie', () => {
  const s = computeStats(DATA, NOW);
  assert.equal(s.products_available, 2);
  assert.equal(s.products_sold, 1);
  assert.equal(s.products_draft, 1);
  assert.deepEqual(s.by_category['bibles-restaurees'], 1); // disponibles uniquement
  assert.equal(s.by_category['bibles-brodees'], 1);
});

test('computeStats : à-traiter (à expédier, demandes nouvelles, messages non lus)', () => {
  const s = computeStats(DATA, NOW);
  assert.equal(s.orders_to_ship, 1);   // o1 status payée
  assert.equal(s.custom_new, 1);       // c1
  assert.equal(s.messages_unread, 2);  // m1, m3
});

test('computeStats : ventes (compte + récentes)', () => {
  const s = computeStats(DATA, NOW);
  assert.equal(s.orders_count, 2);
  assert.equal(s.recent_sales.length, 2);
  assert.equal(s.recent_sales[0].id, 'o1'); // plus récent d'abord
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run : `npm test` → FAIL (`Cannot find module '../src/lib/stats'`).

- [ ] **Step 3 : Implémenter `src/lib/stats.ts`**

```ts
import { SupabaseClient } from '@supabase/supabase-js';

export interface StatsData {
  products: Array<{ id: string; category: string | null; status: string }>;
  orders: Array<{ id: string; amount: number; status: string; created_at: string; customer_email: string | null; product_id: string | null }>;
  customRequests: Array<{ id: string; status: string }>;
  messages: Array<{ id: string; status: string }>;
}

export interface StatsResult {
  revenue_month: number;
  revenue_total: number;
  orders_count: number;
  orders_count_month: number;
  products_available: number;
  products_sold: number;
  products_draft: number;
  by_category: Record<string, number>;
  orders_to_ship: number;
  custom_new: number;
  messages_unread: number;
  recent_sales: Array<{ id: string; amount: number; status: string; created_at: string; customer_email: string | null }>;
}

/** Calcule les agrégats du tableau de bord (pur, testable). `now` injectable. */
export function computeStats(data: StatsData, now: Date = new Date()): StatsResult {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const inMonth = (iso: string) => new Date(iso) >= monthStart;

  const orders = data.orders ?? [];
  const products = data.products ?? [];
  const customRequests = data.customRequests ?? [];
  const messages = data.messages ?? [];

  const by_category: Record<string, number> = {};
  for (const p of products) {
    if (p.status === 'disponible' && p.category) by_category[p.category] = (by_category[p.category] ?? 0) + 1;
  }

  const recent_sales = [...orders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((o) => ({ id: o.id, amount: o.amount, status: o.status, created_at: o.created_at, customer_email: o.customer_email }));

  return {
    revenue_month: orders.filter((o) => inMonth(o.created_at)).reduce((s, o) => s + Number(o.amount || 0), 0),
    revenue_total: orders.reduce((s, o) => s + Number(o.amount || 0), 0),
    orders_count: orders.length,
    orders_count_month: orders.filter((o) => inMonth(o.created_at)).length,
    products_available: products.filter((p) => p.status === 'disponible').length,
    products_sold: products.filter((p) => p.status === 'vendu').length,
    products_draft: products.filter((p) => p.status === 'brouillon').length,
    by_category,
    orders_to_ship: orders.filter((o) => o.status === 'payée').length,
    custom_new: customRequests.filter((c) => c.status === 'nouvelle').length,
    messages_unread: messages.filter((m) => m.status === 'nouveau').length,
    recent_sales,
  };
}

/** Lit les données nécessaires puis calcule les stats. */
export async function getStats(sb: SupabaseClient): Promise<StatsResult> {
  const [products, orders, customRequests, messages] = await Promise.all([
    sb.from('products').select('id, category, status'),
    sb.from('orders').select('id, amount, status, created_at, customer_email, product_id'),
    sb.from('custom_requests').select('id, status'),
    sb.from('contact_messages').select('id, status'),
  ]);
  return computeStats({
    products: (products.data ?? []) as any,
    orders: (orders.data ?? []) as any,
    customRequests: (customRequests.data ?? []) as any,
    messages: (messages.data ?? []) as any,
  });
}
```

- [ ] **Step 4 : Lancer (succès attendu)**

Run : `npm test` → PASS (4 nouveaux tests stats).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/stats.ts test/stats.test.ts
git commit -m "feat: stats lib (computeStats pure + getStats) with tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 : `src/lib/contact-messages.ts` + tests

**Files:**
- Create: `src/lib/contact-messages.ts`
- Test: `test/contact-messages.test.ts`

- [ ] **Step 1 : Écrire `test/contact-messages.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContactMessage, setMessageStatus, MESSAGE_STATUSES } from '../src/lib/contact-messages';

function fakeSb() {
  const inserted: any[] = []; const updates: any[] = [];
  const sb: any = { from(t: string) { return {
    _t: t,
    insert(row: any) { inserted.push({ t: this._t, row }); return { select() { return { single() { return Promise.resolve({ data: { id: 'm-new', ...row }, error: null }); } }; } }; },
    update(p: any) { const u: any = { t: this._t, p }; updates.push(u); return { eq(_c: string, v: any) { u.id = v; return Promise.resolve({ error: null }); } }; },
  }; } };
  return { sb, inserted, updates };
}

test('createContactMessage insère avec statut nouveau', async () => {
  const { sb, inserted } = fakeSb();
  const m = await createContactMessage(sb, { name: 'Marie', email: 'm@m.fr', message: 'Bonjour', lang: 'fr' });
  assert.equal(inserted[0].row.status, 'nouveau');
  assert.equal(inserted[0].row.name, 'Marie');
  assert.equal(m.id, 'm-new');
});

test('setMessageStatus rejette un statut invalide', async () => {
  const { sb } = fakeSb();
  await assert.rejects(() => setMessageStatus(sb, 'm1', 'x' as any));
});

test('setMessageStatus accepte les statuts valides', async () => {
  const { sb, updates } = fakeSb();
  for (const s of MESSAGE_STATUSES) await setMessageStatus(sb, 'm1', s);
  assert.equal(updates.length, MESSAGE_STATUSES.length);
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run : `npm test` → FAIL.

- [ ] **Step 3 : Implémenter `src/lib/contact-messages.ts`**

```ts
import { SupabaseClient } from '@supabase/supabase-js';

export const MESSAGE_STATUSES = ['nouveau', 'lu'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export interface ContactMessageInput { name: string; email: string; message: string; lang: 'fr' | 'en'; }
export interface ContactMessageRow extends ContactMessageInput { id: string; status: MessageStatus; created_at: string; }

export async function createContactMessage(sb: SupabaseClient, input: ContactMessageInput): Promise<ContactMessageRow> {
  const { data, error } = await sb.from('contact_messages')
    .insert({ name: input.name, email: input.email, message: input.message, lang: input.lang, status: 'nouveau' })
    .select().single();
  if (error) throw new Error(error.message);
  return data as ContactMessageRow;
}

export async function listContactMessages(sb: SupabaseClient): Promise<ContactMessageRow[]> {
  const { data, error } = await sb.from('contact_messages').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ContactMessageRow[];
}

export async function setMessageStatus(sb: SupabaseClient, id: string, status: MessageStatus): Promise<void> {
  if (!MESSAGE_STATUSES.includes(status)) throw new Error(`Statut invalide: ${status}`);
  const { error } = await sb.from('contact_messages').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4 : Lancer (succès attendu)**

Run : `npm test` → PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/contact-messages.ts test/contact-messages.test.ts
git commit -m "feat: contact-messages lib (create/list/status) with tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 : `src/lib/consents.ts`

**Files:**
- Create: `src/lib/consents.ts`

- [ ] **Step 1 : Implémenter `src/lib/consents.ts`**

```ts
import { SupabaseClient } from '@supabase/supabase-js';

export interface ConsentInput { email?: string | null; customer_id?: string | null; consent_type: string; granted?: boolean; }

/** Journalise un consentement (RGPD). Best-effort côté appelant. */
export async function recordConsent(sb: SupabaseClient, input: ConsentInput): Promise<void> {
  const { error } = await sb.from('consents').insert({
    email: input.email ?? null,
    customer_id: input.customer_id ?? null,
    consent_type: input.consent_type,
    granted: input.granted ?? true,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2 : Compiler**

Run : `npm run build` puis `rm -rf dist`
Expected : compile sans erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/consents.ts
git commit -m "feat: consents lib (RGPD consent log)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# LOT 2 — API & routes serveur

### Task 5 : Endpoint stats + routes messages admin

**Files:**
- Modify: `src/routes/admin.ts`

- [ ] **Step 1 : Importer les libs en haut de `src/routes/admin.ts`**

```ts
import { getStats } from '../lib/stats';
import { listContactMessages, setMessageStatus, MESSAGE_STATUSES } from '../lib/contact-messages';
```

- [ ] **Step 2 : Ajouter les routes dans `registerAdminRoutes` (toutes derrière `requireAdmin`)**

```ts
  app.get('/api/admin/stats', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    try { res.json(await getStats(getSupabase())); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/admin/messages', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    try { res.json(await listContactMessages(getSupabase())); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch('/api/admin/messages/:id/status', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const status = (req.body as any)?.status;
    if (!MESSAGE_STATUSES.includes(status)) { res.status(400).json({ error: 'Statut invalide.' }); return; }
    try { await setMessageStatus(getSupabase(), req.params.id, status); res.json({ success: true }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });
```

- [ ] **Step 3 : Étendre la route de statut de commande pour accepter un n° de suivi**

Repérer la route `PATCH /api/admin/orders/:id/status` dans `admin.ts`. La remplacer par une version qui accepte aussi `tracking_number` :
```ts
  app.patch('/api/admin/orders/:id/status', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const status = (req.body as any)?.status;
    const tracking = typeof (req.body as any)?.tracking_number === 'string' ? (req.body as any).tracking_number.trim().slice(0, 100) : undefined;
    if (!['payée', 'expédiée', 'livrée'].includes(status)) { res.status(400).json({ error: 'Statut invalide.' }); return; }
    try {
      await setOrderStatus(getSupabase(), req.params.id, status);
      if (tracking !== undefined) {
        const { error } = await getSupabase().from('orders').update({ tracking_number: tracking || null }).eq('id', req.params.id);
        if (error) { res.status(500).json({ error: error.message }); return; }
      }
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
```
(`setOrderStatus` est déjà importé depuis `../lib/orders`.)

- [ ] **Step 4 : Vérifier**

Run : `npm test` puis `npm run dev` (avec migration appliquée) :
```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/admin/stats     # 401 sans session
```
Expected : 401. `npm run build` clean.

- [ ] **Step 5 : Commit**

```bash
git add src/routes/admin.ts
git commit -m "feat: admin stats endpoint, contact messages routes, order tracking number

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 : Persistance des messages de contact + endpoint consentement

**Files:**
- Modify: `src/routes/contact.ts`
- Create: `src/routes/consent.ts`
- Modify: `src/app.ts`

- [ ] **Step 1 : Persister le message dans `src/routes/contact.ts`**

Dans le handler `POST /api/contact`, après la validation et AVANT (ou autour de) l'envoi d'email, insérer en base. Ajouter l'import :
```ts
import { getSupabase } from '../lib/clients';
import { createContactMessage } from '../lib/contact-messages';
```
Dans le handler, après validation des champs (`name`, `email`, `message`) et calcul de `lang` (ajouter `const lang = (req.body?.lang === 'en' ? 'en' : 'fr');` si absent) :
```ts
    // Persister d'abord (rien n'est perdu même si l'email échoue)
    try {
      await createContactMessage(getSupabase(), { name, email, message, lang });
    } catch (e: any) {
      console.error('⚠️  Persistance message contact:', e.message);
    }
```
(Garder l'envoi d'email existant ensuite, best-effort.)

- [ ] **Step 2 : Créer `src/routes/consent.ts`**

```ts
import { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { getSupabase } from '../lib/clients';
import { recordConsent } from '../lib/consents';

export function registerConsentRoute(app: Express): void {
  const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Trop de requêtes.' } });

  app.post('/api/consent', limiter, async (req: Request, res: Response): Promise<void> => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().slice(0, 200) : '';
    const consent_type = typeof req.body?.consent_type === 'string' ? req.body.consent_type.trim().slice(0, 50) : '';
    if (!email || !consent_type) { res.status(400).json({ error: 'Champs requis.' }); return; }
    try {
      await recordConsent(getSupabase(), { email, consent_type, granted: true });
      res.json({ success: true });
    } catch (err: any) {
      console.error('POST /api/consent', err.message);
      res.status(500).json({ error: 'Erreur.' });
    }
  });
}
```

- [ ] **Step 3 : Brancher dans `src/app.ts`**

Import : `import { registerConsentRoute } from './routes/consent';`
Appel (avec les autres `register*`) :
```ts
  registerConsentRoute(app);
```

- [ ] **Step 4 : Vérifier**

Run : `npm test` puis `npm run dev` :
```bash
curl -s -X POST localhost:3000/api/consent -H "Content-Type: application/json" -d '{"email":"a@a.fr","consent_type":"cgv"}'
```
Expected : `{"success":true}` (avec migration appliquée). Sans migration, 500 (table absente) — appliquer la migration d'abord.

- [ ] **Step 5 : Commit**

```bash
git add src/routes/contact.ts src/routes/consent.ts src/app.ts
git commit -m "feat: persist contact messages + public consent logging endpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7 : Profil compte (téléphone + adresse) & téléphone sur-mesure

**Files:**
- Modify: `src/routes/account.ts`
- Modify: `src/lib/custom-requests.ts`
- Modify: `src/routes/custom.ts`

- [ ] **Step 1 : Étendre `PATCH /api/account/me` dans `src/routes/account.ts`**

Remplacer le corps du handler PATCH pour accepter les champs de profil :
```ts
  app.patch('/api/account/me', requireUser, async (req: AuthedRequest, res: Response): Promise<void> => {
    const b = req.body as any;
    const str = (v: any, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : null);
    const patch: Record<string, any> = {
      name: str(b.name, 200),
      phone: str(b.phone, 40),
      address_line1: str(b.address_line1, 200),
      address_line2: str(b.address_line2, 200),
      postal_code: str(b.postal_code, 20),
      city: str(b.city, 120),
      country: str(b.country, 80),
    };
    try {
      const c = await ensureCustomer(getSupabase(), req.authUser!);
      const { error } = await getSupabase().from('customers').update(patch).eq('id', c.id);
      if (error) { res.status(500).json({ error: error.message }); return; }
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
```

- [ ] **Step 2 : Renvoyer les champs profil dans `GET /api/account/me`**

Remplacer le handler GET pour renvoyer le profil complet :
```ts
  app.get('/api/account/me', requireUser, async (req: AuthedRequest, res: Response): Promise<void> => {
    try {
      const c = await ensureCustomer(getSupabase(), req.authUser!);
      res.json({
        email: c.email, name: c.name,
        phone: (c as any).phone ?? '', address_line1: (c as any).address_line1 ?? '',
        address_line2: (c as any).address_line2 ?? '', postal_code: (c as any).postal_code ?? '',
        city: (c as any).city ?? '', country: (c as any).country ?? '',
      });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
```

- [ ] **Step 3 : Ajouter `phone` à `CustomRequestInput` et l'insert (`src/lib/custom-requests.ts`)**

Dans l'interface `CustomRequestInput`, ajouter `phone?: string | null;`. Dans `createCustomRequest`, ajouter `phone: input.phone ?? null,` à l'objet inséré.

- [ ] **Step 4 : Lire `phone` dans `src/routes/custom.ts`**

Dans le handler `POST /api/custom-request`, après les autres champs, ajouter :
```ts
    const phone = typeof b.phone === 'string' ? b.phone.trim().slice(0, 40) : '';
```
et passer `phone` à `createCustomRequest(sb, { name, email, description, budget, phone, reference_images: [], lang })`.

- [ ] **Step 5 : Vérifier**

Run : `npm test` (verts) puis `npm run build` (clean). `npm run dev` :
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH localhost:3000/api/account/me -H "Content-Type: application/json" -d '{"name":"X"}'   # 401 sans token
```
Expected : 401 (auth requise) — pas de crash.

- [ ] **Step 6 : Commit**

```bash
git add src/routes/account.ts src/lib/custom-requests.ts src/routes/custom.ts
git commit -m "feat: account profile fields (phone/address) + phone on custom requests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# LOT 3 — Frontend (admin onglets + dashboard, compte, sur-mesure)

### Task 8 : CSS dashboard & onglets

> Appliquer le skill `frontend-design`.

**Files:**
- Modify: `public/css/style.css` (ajouter à la fin)

- [ ] **Step 1 : Ajouter les styles**

```css
/* ═══ Plan 6 — admin dashboard & onglets ═══ */
.admin-tabs { display: flex; flex-wrap: wrap; gap: 0.4rem; border-bottom: 1px solid var(--line); margin: 1rem 0 1.5rem; }
.admin-tab {
  background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer;
  font-family: var(--font-display); font-size: 1.05rem; color: var(--text-soft);
  padding: 0.6rem 1rem; transition: color .2s, border-color .2s;
}
.admin-tab:hover { color: var(--accent); }
.admin-tab.active { color: var(--accent); border-bottom-color: var(--gold-deep); }
.admin-tab .badge-count {
  display: inline-block; min-width: 1.3rem; padding: 0 0.35rem; margin-left: 0.35rem;
  background: var(--sage-deep); color: var(--cream); border-radius: 999px; font-size: 0.8rem; font-family: var(--font-body);
}
.admin-panel { display: none; }
.admin-panel.active { display: block; }

.stat-cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 2rem; }
.stat-card {
  background: var(--cream); border: 1px solid var(--line); border-top: 3px solid var(--sage); border-radius: 4px;
  padding: 1.2rem 1.3rem;
}
.stat-card .stat-label { font-size: 0.85rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-soft); }
.stat-card .stat-value { font-family: var(--font-display); font-size: 2rem; color: var(--accent); line-height: 1.1; margin-top: 0.3rem; }
.stat-card .stat-sub { font-size: 0.9rem; color: var(--text-soft); margin-top: 0.2rem; }
.stat-card--todo { border-top-color: var(--burgundy); }
.dash-section { margin-bottom: 2rem; }
.dash-section h3 { color: var(--accent); }
.cat-breakdown { list-style: none; padding: 0; margin: 0.5rem 0; }
.cat-breakdown li { display: flex; justify-content: space-between; padding: 0.35rem 0; border-bottom: 1px solid var(--line); font-size: 0.98rem; }
```

- [ ] **Step 2 : Commit**

```bash
git add public/css/style.css
git commit -m "feat: CSS for admin tabs and dashboard stat cards

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9 : Admin — onglets + tableau de bord + messages + suivi

> Appliquer le skill `frontend-design`. Ne pas casser les fonctions existantes (produits/commandes/sur-mesure).

**Files:**
- Modify: `public/admin.html`
- Modify: `public/js/admin.js`

- [ ] **Step 1 : Restructurer `#admin-view` en onglets dans `public/admin.html`**

Remplacer le contenu intérieur de `#admin-view` (en gardant la barre titre + déconnexion) par : une barre d'onglets + des panneaux. Conserver les éléments existants (`#products-tbody`, `#orders-tbody`, `#custom-tbody`, `#custom-detail`, `#new-btn`, etc.) en les déplaçant dans leurs panneaux respectifs.

```html
        <div id="admin-view" class="hidden">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
            <h1 style="margin:0">Administration</h1>
            <button class="btn btn--sm btn--ghost" id="logout-btn">Déconnexion</button>
          </div>

          <nav class="admin-tabs">
            <button class="admin-tab active" data-tab="dashboard">Tableau de bord</button>
            <button class="admin-tab" data-tab="products">Produits</button>
            <button class="admin-tab" data-tab="orders">Commandes</button>
            <button class="admin-tab" data-tab="custom">Sur-mesure</button>
            <button class="admin-tab" data-tab="messages">Messages <span class="badge-count hidden" id="msg-badge">0</span></button>
          </nav>

          <!-- Tableau de bord -->
          <section class="admin-panel active" data-panel="dashboard">
            <div class="stat-cards" id="stat-cards"></div>
            <div class="dash-section">
              <h3>Répartition du catalogue</h3>
              <ul class="cat-breakdown" id="cat-breakdown"></ul>
            </div>
            <div class="dash-section">
              <h3>Dernières ventes</h3>
              <table class="admin-table"><tbody id="recent-sales"></tbody></table>
            </div>
          </section>

          <!-- Produits -->
          <section class="admin-panel" data-panel="products">
            <button class="btn btn--sm" id="new-btn">+ Nouvelle création</button>
            <table class="admin-table">
              <thead><tr><th>Titre (FR)</th><th>Catégorie</th><th>Prix</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody id="products-tbody"></tbody>
            </table>
          </section>

          <!-- Commandes -->
          <section class="admin-panel" data-panel="orders">
            <table class="admin-table">
              <thead><tr><th>Date</th><th>Email client</th><th>Montant</th><th>Adresse</th><th>Suivi</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody id="orders-tbody"></tbody>
            </table>
          </section>

          <!-- Sur-mesure -->
          <section class="admin-panel" data-panel="custom">
            <table class="admin-table">
              <thead><tr><th>Date</th><th>Nom / Email</th><th>Budget</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody id="custom-tbody"></tbody>
            </table>
            <div id="custom-detail" class="hidden" style="margin-top:1rem"></div>
          </section>

          <!-- Messages -->
          <section class="admin-panel" data-panel="messages">
            <table class="admin-table">
              <thead><tr><th>Date</th><th>Nom / Email</th><th>Message</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody id="messages-tbody"></tbody>
            </table>
          </section>
        </div>
```
(Garder `#editor-view` tel quel, en dehors de `#admin-view`, pour l'édition produit.)

- [ ] **Step 2 : Onglets + dashboard dans `public/js/admin.js`**

Ajouter la gestion des onglets et le chargement du dashboard. Dans `showList()`, appeler `loadDashboard()` et `loadMessages()` en plus des chargements existants, et appeler `wireTabs()` une fois. Ajouter :
```js
function wireTabs() {
  document.querySelectorAll('.admin-tab').forEach((t) => {
    t.addEventListener('click', () => {
      const name = t.getAttribute('data-tab');
      document.querySelectorAll('.admin-tab').forEach((x) => x.classList.toggle('active', x === t));
      document.querySelectorAll('.admin-panel').forEach((p) => p.classList.toggle('active', p.getAttribute('data-panel') === name));
    });
  });
}

async function loadDashboard() {
  const wrap = document.getElementById('stat-cards');
  if (!wrap) return;
  const s = await fetch('/api/admin/stats').then((r) => r.ok ? r.json() : null).catch(() => null);
  if (!s) return;
  const money = (n) => Number(n || 0).toFixed(2) + ' €';
  wrap.innerHTML = `
    <div class="stat-card"><div class="stat-label">CA ce mois</div><div class="stat-value">${money(s.revenue_month)}</div><div class="stat-sub">Total : ${money(s.revenue_total)}</div></div>
    <div class="stat-card"><div class="stat-label">Commandes</div><div class="stat-value">${s.orders_count}</div><div class="stat-sub">${s.products_sold} pièce(s) vendue(s)</div></div>
    <div class="stat-card"><div class="stat-label">Catalogue</div><div class="stat-value">${s.products_available}</div><div class="stat-sub">dispo · ${s.products_draft} brouillon(s)</div></div>
    <div class="stat-card stat-card--todo"><div class="stat-label">À traiter</div><div class="stat-value">${s.orders_to_ship + s.custom_new + s.messages_unread}</div><div class="stat-sub">${s.orders_to_ship} à expédier · ${s.custom_new} devis · ${s.messages_unread} message(s)</div></div>`;
  const cats = document.getElementById('cat-breakdown');
  const entries = Object.entries(s.by_category || {});
  cats.innerHTML = entries.length ? entries.map(([k, v]) => `<li><span>${escHtml(window.categoryLabel ? window.categoryLabel(k, 'fr') : k)}</span><strong>${v}</strong></li>`).join('') : '<li>Aucun produit disponible.</li>';
  const rs = document.getElementById('recent-sales');
  rs.innerHTML = (s.recent_sales || []).length
    ? s.recent_sales.map((o) => `<tr><td>${escHtml((o.created_at || '').slice(0,10))}</td><td>${escHtml(o.customer_email || '')}</td><td>${Number(o.amount).toFixed(2)} €</td><td>${escHtml(o.status)}</td></tr>`).join('')
    : '<tr><td>Aucune vente pour l\'instant.</td></tr>';
}

async function loadMessages() {
  const tb = document.getElementById('messages-tbody');
  if (!tb) return;
  const rows = await fetch('/api/admin/messages').then((r) => r.ok ? r.json() : []).catch(() => []);
  const unread = rows.filter((m) => m.status === 'nouveau').length;
  const badge = document.getElementById('msg-badge');
  if (badge) { badge.textContent = unread; badge.classList.toggle('hidden', unread === 0); }
  tb.innerHTML = rows.length ? rows.map(msgRow).join('') : `<tr><td colspan="5">Aucun message.</td></tr>`;
  tb.querySelectorAll('[data-read]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    await fetch(`/api/admin/messages/${b.getAttribute('data-read')}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'lu' }) });
    loadMessages();
  }));
}
function msgRow(m) {
  const date = (m.created_at || '').slice(0, 10);
  const extrait = (m.message || '').slice(0, 80);
  const action = m.status === 'nouveau' ? `<button class="btn btn--sm" data-read="${escAttr(m.id)}">Marquer lu</button>` : '';
  return `<tr><td>${escHtml(date)}</td><td>${escHtml(m.name)}<br><span style="color:var(--text-soft)">${escHtml(m.email)}</span></td><td>${escHtml(extrait)}</td><td>${escHtml(m.status)}</td><td class="admin-actions">${action}</td></tr>`;
}
```
Puis, dans `showList()`, ajouter au début (une seule fois) `wireTabs();` et après les chargements existants : `loadDashboard(); loadMessages();`.

- [ ] **Step 3 : Ajouter la saisie du n° de suivi dans le détail/ligne commande**

Dans `orderRow(o)` (admin.js), ajouter une colonne « Suivi » et un champ. Remplacer `orderRow` par :
```js
function orderRow(o) {
  const a = o.shipping_address || {};
  const addr = [a.line1, a.postal_code, a.city, a.country].filter(Boolean).join(', ');
  const date = (o.created_at || '').slice(0, 10);
  return `<tr>
    <td>${escHtml(date)}</td>
    <td>${escHtml(o.customer_email || '')}</td>
    <td>${Number(o.amount).toFixed(2)} €</td>
    <td>${escHtml(addr)}</td>
    <td><input type="text" class="track-input" data-track="${escAttr(o.id)}" value="${escAttr(o.tracking_number || '')}" placeholder="N° suivi" style="width:120px" /></td>
    <td>${escHtml(o.status)}</td>
    <td class="admin-actions">
      <button class="btn btn--sm" data-ship="${escAttr(o.id)}">Expédiée</button>
      <button class="btn btn--sm" data-deliver="${escAttr(o.id)}">Livrée</button>
    </td></tr>`;
}
```
Et adapter `setOrder` pour envoyer le n° de suivi saisi sur la ligne :
```js
async function setOrder(id, status, btn) {
  if (btn) btn.disabled = true;
  const input = document.querySelector(`.track-input[data-track="${id}"]`);
  const tracking_number = input ? input.value : undefined;
  try {
    const res = await fetch(`/api/admin/orders/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, tracking_number }),
    });
    if (!res.ok) { alert('Échec de la mise à jour de la commande.'); if (btn) btn.disabled = false; return; }
    loadOrders();
  } catch { alert('Échec de la mise à jour de la commande.'); if (btn) btn.disabled = false; }
}
```

- [ ] **Step 4 : Afficher le téléphone sur-mesure dans le détail admin**

Dans `viewCustom` (admin.js), après la ligne du budget, ajouter l'affichage du téléphone :
```js
      <p><em>Téléphone : ${escHtml(r.phone || '—')}</em></p>
```
(à insérer dans le template HTML de `viewCustom`, près de `Budget`).

- [ ] **Step 5 : Vérifier**

Run : `npm test` puis `npm run dev`, se connecter à `/admin` (mot de passe du `.env`) :
- Les onglets basculent (Tableau de bord / Produits / Commandes / Sur-mesure / Messages).
- Le dashboard affiche les cartes (CA, commandes, catalogue, à-traiter), la répartition par catégorie, les dernières ventes.
- L'onglet Messages liste les messages (badge non-lus) ; « Marquer lu » fonctionne.
- Les commandes ont un champ « N° suivi » ; le sur-mesure affiche le téléphone.
Aucune erreur console.

- [ ] **Step 6 : Commit**

```bash
git add public/admin.html public/js/admin.js
git commit -m "feat: admin redesign — tabbed nav + dashboard stats + messages tab + order tracking input

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10 : Compte — profil éditable + suivi ; inscription tél + CGV ; sur-mesure tél

> Appliquer le skill `frontend-design`.

**Files:**
- Modify: `public/compte.html`
- Modify: `public/js/compte.js`
- Modify: `public/sur-mesure.html`
- Modify: `public/i18n/fr.json`, `public/i18n/en.json`

- [ ] **Step 1 : Ajouter les clés i18n (FR puis EN, mêmes clés)**

`fr.json` :
```json
  "account.profile.title": "Mes informations",
  "account.phone": "Téléphone",
  "account.address1": "Adresse",
  "account.address2": "Complément d'adresse",
  "account.postal": "Code postal",
  "account.city": "Ville",
  "account.country": "Pays",
  "account.save": "Enregistrer",
  "account.saved": "Informations enregistrées.",
  "account.terms": "J'accepte les CGV et la politique de confidentialité",
  "account.order.tracking": "Suivi",
  "custom.phone": "Téléphone (optionnel)"
```
`en.json` :
```json
  "account.profile.title": "My information",
  "account.phone": "Phone",
  "account.address1": "Address",
  "account.address2": "Address line 2",
  "account.postal": "Postal code",
  "account.city": "City",
  "account.country": "Country",
  "account.save": "Save",
  "account.saved": "Information saved.",
  "account.terms": "I accept the terms and privacy policy",
  "account.order.tracking": "Tracking",
  "custom.phone": "Phone (optional)"
```

- [ ] **Step 2 : Inscription — téléphone + case CGV (`public/compte.html`)**

Dans `#signup-form`, ajouter un champ téléphone (optionnel) et une case CGV obligatoire avant le bouton :
```html
            <label class="field"><span data-i18n="account.phone"></span><input type="tel" name="phone" /></label>
            <label class="field" style="flex-direction:row;display:flex;gap:0.5rem;align-items:flex-start">
              <input type="checkbox" name="terms" required style="width:auto;margin-top:0.35rem" />
              <span data-i18n="account.terms"></span>
            </label>
```

- [ ] **Step 3 : Profil éditable + connexion enregistre tél (`public/compte.html`)**

Dans `#account-view`, après le bloc profil/déconnexion et avant l'historique, ajouter un formulaire profil :
```html
          <h2 style="margin-top:1.5rem" data-i18n="account.profile.title"></h2>
          <form id="profile-form">
            <label class="field"><span data-i18n="account.name"></span><input name="name" /></label>
            <label class="field"><span data-i18n="account.phone"></span><input name="phone" type="tel" /></label>
            <label class="field"><span data-i18n="account.address1"></span><input name="address_line1" /></label>
            <label class="field"><span data-i18n="account.address2"></span><input name="address_line2" /></label>
            <label class="field"><span data-i18n="account.postal"></span><input name="postal_code" /></label>
            <label class="field"><span data-i18n="account.city"></span><input name="city" /></label>
            <label class="field"><span data-i18n="account.country"></span><input name="country" /></label>
            <button class="btn" type="submit" data-i18n="account.save"></button>
            <p class="form-note hidden" id="profile-note"></p>
          </form>
```

- [ ] **Step 4 : Logique compte (`public/js/compte.js`)**

a) Signup : enregistrer le consentement CGV. Dans le handler signup (après un `signUp` réussi), appeler l'endpoint consent (best-effort) :
```js
      try { await fetch('/api/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: f.get('email'), consent_type: 'cgv' }) }); } catch {}
```
(Le `phone` saisi à l'inscription n'est pas encore rattaché car le compte n'existe en base qu'après connexion ; il sera renseigné via le profil. Acceptable.)

b) `renderAccount()` : pré-remplir le formulaire profil avec `me` et afficher le suivi dans l'historique. Après avoir récupéré `me`, remplir les champs :
```js
  const f = document.getElementById('profile-form');
  if (f && me) { ['name','phone','address_line1','address_line2','postal_code','city','country'].forEach((k) => { if (f[k]) f[k].value = me[k] || ''; }); }
```
Et brancher la soumission du profil (une fois) :
```js
  if (f && !f.dataset.wired) {
    f.dataset.wired = '1';
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const note = document.getElementById('profile-note');
      const token = await window.AUTH.getToken();
      const body = Object.fromEntries(new FormData(f).entries());
      const res = await fetch('/api/account/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      note.textContent = window.I18N.t(res.ok ? 'account.saved' : 'account.error');
      note.className = 'form-note ' + (res.ok ? 'is-success' : 'is-error'); note.hidden = false;
    });
  }
```

c) `orderRow(o)` : afficher le n° de suivi s'il existe. Remplacer la fonction par :
```js
function orderRow(o) {
  const date = (o.created_at || '').slice(0, 10);
  const track = o.tracking_number ? `<span style="color:var(--sage-deep)"> · ${window.I18N.t('account.order.tracking')}: ${window.escHtml(o.tracking_number)}</span>` : '';
  return `<div class="service-card" style="margin-bottom:.8rem">
    <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap">
      <span>${window.escHtml(date)}</span>
      <strong>${Number(o.amount).toFixed(2)} €</strong>
      <span style="color:var(--sage-deep)">${window.escHtml(o.status)}</span>
    </div>${track}
  </div>`;
}
```

- [ ] **Step 5 : Téléphone sur le formulaire sur-mesure (`public/sur-mesure.html`)**

Dans `#custom-form`, après le champ email, ajouter :
```html
          <label class="field"><span data-i18n="custom.phone"></span><input type="tel" name="phone" /></label>
```
(`sur-mesure.js` envoie déjà tout le `FormData` → le `phone` part automatiquement.)

- [ ] **Step 6 : Vérifier**

Run : `npm test` (parité i18n verte) puis `npm run dev` :
- `/compte` : inscription montre téléphone + case CGV (obligatoire) ; connecté, le **formulaire profil** s'affiche, pré-rempli ; enregistrer met à jour ; l'historique affiche le suivi s'il existe.
- `/sur-mesure` : champ téléphone présent.

- [ ] **Step 7 : Commit**

```bash
git add public/compte.html public/js/compte.js public/sur-mesure.html public/i18n/fr.json public/i18n/en.json
git commit -m "feat: editable account profile (phone/address) + signup consent + tracking display + custom phone

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (auteur du plan)

**Couverture spec :**
- §2 migration (customers/orders/custom + contact_messages + consents) → Task 1. ✅
- §2 branchements (contact persiste, inscription tél+CGV, profil, sur-mesure tél, suivi) → Tasks 6,7,9,10. ✅
- §3 onglets + dashboard + `GET /api/admin/stats` → Tasks 5,8,9. ✅
- §3 messages (table+routes+onglet) → Tasks 3,5,9. ✅
- §3 suivi commande (saisie+affichage) → Tasks 5,9,10. ✅
- §4 fichiers (libs stats/contact-messages/consents) → Tasks 2,3,4. ✅
- §5 sécurité (requireAdmin, RLS, validation, rate-limit consent) → Tasks 1,5,6. ✅
- §6 tests (stats, contact-messages) → Tasks 2,3. ✅

**Placeholders :** aucun TODO. Le téléphone d'inscription non-rattaché immédiatement est une limite assumée et documentée (renseigné via profil). La migration est une étape manuelle explicite (Task 1 Step 3).

**Cohérence types/signatures :** `computeStats(data, now?)`/`getStats(sb)` + `StatsResult` (Task 2) consommés par `/api/admin/stats` (Task 5) et le dashboard (Task 9). `createContactMessage/listContactMessages/setMessageStatus/MESSAGE_STATUSES` (Task 3) utilisés Tasks 5,6,9. `recordConsent` (Task 4) utilisé Task 6. `CustomRequestInput.phone` (Task 7) ↔ `custom.ts` (Task 7) ↔ affichage (Task 9). `tracking_number` cohérent : colonne (Task 1), route status (Task 5), saisie (Task 9), affichage compte (Task 10). Clés i18n `account.*`/`custom.phone` ajoutées FR+EN. `escHtml`/`escAttr` de util.js. Onglets : `data-tab`/`data-panel` cohérents HTML (Task 9 Step 1) ↔ JS `wireTabs` (Task 9 Step 2).

**Note d'ordonnancement :** la migration (Task 1) doit être appliquée avant que les endpoints stats/messages/profil renvoient des données réelles ; les tests unitaires (libs) n'en dépendent pas (Supabase mocké). Le dashboard se charge en dégradation (rien si l'API échoue).
