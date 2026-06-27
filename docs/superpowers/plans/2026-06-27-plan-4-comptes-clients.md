# Plan 4 — Comptes clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. For visual/HTML tasks (account page) apply the `frontend-design` skill, reusing the existing medieval/religious design system.

**Goal:** Permettre aux clients de créer un compte (Supabase Auth email/mot de passe), se connecter/déconnecter, voir leur historique de commandes ; rattacher les commandes payées au compte. Le serveur vérifie le JWT Supabase et lit les données via la clé service.

**Architecture:** Auth côté navigateur (SDK Supabase via CDN + clé publiable exposée par `GET /api/config`). Endpoints compte serveur protégés par un middleware `requireUser` qui vérifie le JWT. Logique testable isolée dans `src/lib/customers.ts`. Liaison commande↔compte via `metadata.customer_id` Stripe (lu par le webhook existant).

**Tech Stack:** Node ≥18, Express 4, TypeScript 5, `@supabase/supabase-js` (serveur déjà présent ; navigateur via CDN UMD), node:test via tsx. Bilingue FR/EN.

**Convention de commit :** chaque commit se termine par `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Contexte pour l'implémenteur (lire avant de commencer)

État du dépôt (Plans 1-3 livrés) :
- `src/app.ts` `createApp()` : webhook Stripe (raw) AVANT `express.json()`, puis json, rate-limiter `/api/`, cookie-session, health, puis `registerPageRoutes`, `registerContactRoutes`, `registerProductRoutes`, `registerAdminRoutes`, `registerCheckoutRoutes`, puis static.
- `src/lib/clients.ts` : `getSupabase()` (clé service — peut vérifier un JWT via `auth.getUser(jwt)`), `getStripe()`, `getResend()`.
- `src/config.ts` : `PORT, APP_URL, EMAIL_FROM, CONTACT_TO, IS_PRODUCTION, CURRENCY, SHIPPING_*`. **`process.env.SUPABASE_URL` et `process.env.SUPABASE_ANON_KEY`** sont dans `.env` (clé publiable `sb_publishable_…`).
- `src/lib/orders.ts` : `createOrderFromSession(sb, session)` insère la commande (idempotent, gère 23505), marque le produit vendu. **Ne lit pas encore `metadata.customer_id`** — à ajouter (Task 4).
- `src/routes/checkout.ts` : `POST /api/checkout` (vérifie `paymentsConfigured()`, 503 sinon ; 409 si produit indispo ; crée session via `createCheckoutSession(product, lang)`). `createCheckoutSession` est dans `src/lib/payments.ts` et pose `metadata: { product_id, slug, lang }`.
- `src/lib/payments.ts` : `createCheckoutSession(product, lang)` — à étendre pour accepter un `customerId` optionnel dans les metadata (Task 4).
- Table `customers` : `id, auth_user_id (unique), name, email, created_at`. `orders.customer_id` existe.
- Front : `public/js/i18n.js` (`window.I18N`), `public/js/util.js` (`escHtml`/`escAttr`), `public/js/layout.js` (nav contient déjà `<a href="/compte" data-i18n="nav.account">`). `public/js/produit.js` : bouton Acheter → `POST /api/checkout` (Task 6 l'étend pour envoyer le Bearer).
- i18n : `public/i18n/fr.json`/`en.json` (85 clés, parité imposée par `test/i18n.test.ts`).
- Tests : `npm test` (`tsx --test test/*.test.ts`) — actuellement **23 tests**.
- Pas de bundler : le SDK Supabase navigateur se charge via CDN UMD `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` (expose `window.supabase.createClient`). helmet CSP désactivée → OK.

Règles : ne jamais renommer une classe CSS/clé i18n existante ; nouvelles chaînes i18n dans fr.json ET en.json ; échapper le contenu dynamique ; ne jamais exposer la clé service.

---

## Structure des fichiers

```
src/
├── lib/
│   └── customers.ts       # ensureCustomer(sb, authUser, name?); getCustomerOrders(sb, customerId, email)
├── routes/
│   ├── config.ts          # GET /api/config ; registerConfigRoute(app)
│   ├── account.ts         # requireUser; GET/PATCH /api/account/me; GET /api/account/orders; registerAccountRoutes(app)
│   ├── checkout.ts        # + Bearer optionnel → metadata.customer_id
│   └── ... (payments.ts, orders.ts modifiés)
public/
├── compte.html
├── js/
│   ├── supabase-auth.js   # init client Supabase navigateur + helpers
│   ├── compte.js          # logique page compte (tabs, forms, historique, reset)
│   └── produit.js         # + Authorization Bearer si connecté
test/
├── customers.test.ts      # ensureCustomer + getCustomerOrders
└── orders.test.ts         # + customer_id depuis metadata
```

---

# LOT 1 — Backend (config, customers, account, liaison commande)

### Task 1 : Endpoint de configuration publique

**Files:**
- Create: `src/routes/config.ts`
- Modify: `src/app.ts`

- [ ] **Step 1 : Créer `src/routes/config.ts`**

```ts
import { Express, Request, Response } from 'express';

/** Expose au navigateur l'URL Supabase + la clé publiable (non secrète). */
export function registerConfigRoute(app: Express): void {
  app.get('/api/config', (_req: Request, res: Response): void => {
    res.json({
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    });
  });
}
```

- [ ] **Step 2 : Brancher dans `src/app.ts`**

Import : `import { registerConfigRoute } from './routes/config';`
Appel (avec les autres `register*`, ex. juste après `registerCheckoutRoutes(app);`) :
```ts
  registerConfigRoute(app);
```

- [ ] **Step 3 : Vérifier**

Run : `npm test` (23 verts) puis `npm run dev` :
```bash
curl -s localhost:3000/api/config
```
Expected : `{"supabaseUrl":"https://qkerkvmzthyrefncggkt.supabase.co","supabaseAnonKey":"sb_publishable_..."}`.

- [ ] **Step 4 : Commit**

```bash
git add src/routes/config.ts src/app.ts
git commit -m "feat: public config endpoint (Supabase URL + publishable key)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 : `src/lib/customers.ts` + tests

**Files:**
- Create: `src/lib/customers.ts`
- Test: `test/customers.test.ts`

- [ ] **Step 1 : Écrire `test/customers.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureCustomer, getCustomerOrders } from '../src/lib/customers';

/** Faux client Supabase pour customers + orders. */
function fakeSb(opts: { customer?: any; orders?: any[] } = {}) {
  const inserted: any[] = [];
  const sb: any = {
    from(table: string) {
      const b: any = {
        _table: table, _filters: {}, _or: null,
        select() { return this; },
        eq(c: string, v: any) { this._filters[c] = v; return this; },
        or(expr: string) { this._or = expr; return this; },
        order() { return this; },
        maybeSingle() {
          if (this._table === 'customers') return Promise.resolve({ data: opts.customer ?? null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        insert(row: any) {
          inserted.push({ table: this._table, row });
          return { select() { return { single() { return Promise.resolve({ data: { id: 'cust-new', ...row }, error: null }); } }; } };
        },
        then(resolve: any) {
          // requête liste (orders)
          resolve({ data: opts.orders ?? [], error: null });
        },
      };
      return b;
    },
  };
  return { sb, inserted };
}

const AUTH_USER = { id: 'auth-123', email: 'client@test.fr' };

test('ensureCustomer crée la fiche si absente', async () => {
  const { sb, inserted } = fakeSb({ customer: null });
  const c = await ensureCustomer(sb, AUTH_USER, 'Marie');
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].row.auth_user_id, 'auth-123');
  assert.equal(inserted[0].row.email, 'client@test.fr');
  assert.equal(inserted[0].row.name, 'Marie');
  assert.equal(c.id, 'cust-new');
});

test('ensureCustomer réutilise la fiche existante', async () => {
  const { sb, inserted } = fakeSb({ customer: { id: 'cust-1', auth_user_id: 'auth-123', email: 'client@test.fr' } });
  const c = await ensureCustomer(sb, AUTH_USER);
  assert.equal(inserted.length, 0);
  assert.equal(c.id, 'cust-1');
});

test('getCustomerOrders combine par customer_id et email, dédupliqué', async () => {
  const orders = [
    { id: 'o1', customer_id: 'cust-1', customer_email: 'client@test.fr' },
    { id: 'o1', customer_id: 'cust-1', customer_email: 'client@test.fr' }, // doublon
    { id: 'o2', customer_id: null, customer_email: 'client@test.fr' },
  ];
  const { sb } = fakeSb({ orders });
  const out = await getCustomerOrders(sb, 'cust-1', 'client@test.fr');
  const ids = out.map((o: any) => o.id).sort();
  assert.deepEqual(ids, ['o1', 'o2']);
});
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run : `npm test` → FAIL (`Cannot find module '../src/lib/customers'`).

- [ ] **Step 3 : Implémenter `src/lib/customers.ts`**

```ts
import { SupabaseClient } from '@supabase/supabase-js';

export interface AuthUser { id: string; email?: string | null; }
export interface CustomerRow { id: string; auth_user_id: string; name: string | null; email: string | null; created_at: string; }

/** Trouve la fiche customer par auth_user_id, la crée si absente. */
export async function ensureCustomer(sb: SupabaseClient, authUser: AuthUser, name?: string): Promise<CustomerRow> {
  const { data: existing } = await sb.from('customers').select('*').eq('auth_user_id', authUser.id).maybeSingle();
  if (existing) return existing as CustomerRow;
  const { data, error } = await sb.from('customers')
    .insert({ auth_user_id: authUser.id, email: authUser.email ?? null, name: name ?? null })
    .select().single();
  if (error) throw new Error(error.message);
  return data as CustomerRow;
}

/** Commandes du client : par customer_id OU par email (vérifié), dédupliquées par id. */
export async function getCustomerOrders(sb: SupabaseClient, customerId: string, email: string | null): Promise<any[]> {
  let query = sb.from('orders').select('*');
  if (email) query = query.or(`customer_id.eq.${customerId},customer_email.eq.${email}`);
  else query = query.eq('customer_id', customerId);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  const out: any[] = [];
  for (const o of (data ?? [])) { if (!seen.has(o.id)) { seen.add(o.id); out.push(o); } }
  return out;
}
```

- [ ] **Step 4 : Lancer (succès attendu)**

Run : `npm test` → PASS (3 nouveaux tests customers).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/customers.ts test/customers.test.ts
git commit -m "feat: customers lib (ensureCustomer, getCustomerOrders) with tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 : Routes compte (`src/routes/account.ts`) + branchement

**Files:**
- Create: `src/routes/account.ts`
- Modify: `src/app.ts`

- [ ] **Step 1 : Implémenter `src/routes/account.ts`**

```ts
import { Express, Request, Response, NextFunction } from 'express';
import { getSupabase } from '../lib/clients';
import { ensureCustomer, getCustomerOrders, AuthUser } from '../lib/customers';

interface AuthedRequest extends Request { authUser?: AuthUser; }

/** Vérifie le JWT Supabase (Authorization: Bearer ...) côté serveur. */
async function requireUser(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) { res.status(401).json({ error: 'Non authentifié.' }); return; }
  try {
    const { data, error } = await getSupabase().auth.getUser(token);
    if (error || !data?.user) { res.status(401).json({ error: 'Session invalide.' }); return; }
    req.authUser = { id: data.user.id, email: data.user.email };
    next();
  } catch {
    res.status(401).json({ error: 'Session invalide.' });
  }
}

export function registerAccountRoutes(app: Express): void {
  app.get('/api/account/me', requireUser, async (req: AuthedRequest, res: Response): Promise<void> => {
    try {
      const c = await ensureCustomer(getSupabase(), req.authUser!);
      res.json({ email: c.email, name: c.name });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch('/api/account/me', requireUser, async (req: AuthedRequest, res: Response): Promise<void> => {
    const name = (req.body as any)?.name;
    try {
      const c = await ensureCustomer(getSupabase(), req.authUser!);
      const { error } = await getSupabase().from('customers').update({ name: name ?? null }).eq('id', c.id);
      if (error) { res.status(500).json({ error: error.message }); return; }
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/account/orders', requireUser, async (req: AuthedRequest, res: Response): Promise<void> => {
    try {
      const sb = getSupabase();
      const c = await ensureCustomer(sb, req.authUser!);
      const orders = await getCustomerOrders(sb, c.id, req.authUser!.email ?? null);
      res.json(orders);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
}
```

- [ ] **Step 2 : Brancher dans `src/app.ts`**

Import : `import { registerAccountRoutes } from './routes/account';`
Appel après `registerConfigRoute(app);` :
```ts
  registerAccountRoutes(app);
```

- [ ] **Step 3 : Vérifier (sans token → 401)**

Run : `npm test` puis `npm run dev` :
```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/account/me            # 401
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer faux" localhost:3000/api/account/me   # 401
```
Expected : 401 dans les deux cas (pas de crash).

- [ ] **Step 4 : Commit**

```bash
git add src/routes/account.ts src/app.ts
git commit -m "feat: account API (requireUser JWT check, me, orders) protected by Supabase auth

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 : Liaison commande ↔ compte (metadata.customer_id)

**Files:**
- Modify: `src/lib/payments.ts`
- Modify: `src/routes/checkout.ts`
- Modify: `src/lib/orders.ts`
- Modify: `test/orders.test.ts`

- [ ] **Step 1 : Étendre `createCheckoutSession` pour accepter un customerId**

Dans `src/lib/payments.ts`, modifier la signature et les metadata :
```ts
export async function createCheckoutSession(product: ProductRow, lang: 'fr' | 'en', customerId?: string): Promise<Stripe.Checkout.Session> {
  return getStripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [buildLineItem(product, lang) as any],
    shipping_options: buildShippingOptions(lang) as any,
    shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES as any },
    locale: lang,
    metadata: { product_id: product.id, slug: product.slug, lang, customer_id: customerId ?? '' },
    success_url: `${APP_URL}/merci?session_id={CHECKOUT_SESSION_ID}&lang=${lang}`,
    cancel_url: `${APP_URL}/produit/${product.slug}`,
  });
}
```

- [ ] **Step 2 : Lire le Bearer optionnel dans `src/routes/checkout.ts`**

Dans `POST /api/checkout`, après validation du slug et récupération du produit, résoudre un éventuel customer connecté :
```ts
import { ensureCustomer } from '../lib/customers';
// ...
      // Client connecté ? (Bearer optionnel) → rattacher la commande
      let customerId: string | undefined;
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (token) {
        try {
          const { data } = await getSupabase().auth.getUser(token);
          if (data?.user) {
            const c = await ensureCustomer(getSupabase(), { id: data.user.id, email: data.user.email });
            customerId = c.id;
          }
        } catch { /* invité — on continue sans customerId */ }
      }
      const session = await createCheckoutSession(product, lang, customerId);
      res.json({ url: session.url });
```
(Adapter en remplaçant l'appel existant `createCheckoutSession(product, lang)` par la version ci-dessus avec la résolution du token avant.)

- [ ] **Step 3 : Lire `metadata.customer_id` dans `createOrderFromSession`**

Dans `src/lib/orders.ts`, dans `createOrderFromSession`, ajouter la lecture et l'inclure dans l'insert :
```ts
  const customerId = session.metadata?.customer_id || null;
  // ... dans l'objet insert, ajouter :
  //   customer_id: customerId,
```
Insérer la ligne `customer_id: customerId,` dans l'objet passé à `.insert({...})`.

- [ ] **Step 4 : Mettre à jour `test/orders.test.ts`**

Ajouter un test et adapter le SESSION mock pour inclure `metadata.customer_id` :
```ts
test('createOrderFromSession rattache le customer_id depuis metadata', async () => {
  const { sb, inserted } = fakeSb([]);
  const sessionWithCustomer = { ...SESSION, metadata: { ...SESSION.metadata, customer_id: 'cust-9' } } as any;
  await createOrderFromSession(sb, sessionWithCustomer);
  const order = inserted.find((i) => i.table === 'orders');
  assert.equal(order.row.customer_id, 'cust-9');
});

test('createOrderFromSession met customer_id à null si absent', async () => {
  const { sb, inserted } = fakeSb([]);
  await createOrderFromSession(sb, SESSION);
  const order = inserted.find((i) => i.table === 'orders');
  assert.equal(order.row.customer_id, null);
});
```
(Le mock `fakeSb` de orders.test.ts enregistre déjà les inserts ; `SESSION.metadata` n'a pas `customer_id` → null attendu.)

- [ ] **Step 5 : Lancer les tests**

Run : `npm test`
Expected : tous verts, dont les 2 nouveaux tests orders (customer_id). `npm run build` clean.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/payments.ts src/routes/checkout.ts src/lib/orders.ts test/orders.test.ts
git commit -m "feat: link orders to logged-in customer via Stripe metadata.customer_id

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# LOT 2 — Frontend (page compte + auth navigateur)

### Task 5 : Client Supabase navigateur + i18n compte

**Files:**
- Create: `public/js/supabase-auth.js`
- Modify: `public/i18n/fr.json`, `public/i18n/en.json`

- [ ] **Step 1 : Créer `public/js/supabase-auth.js`**

```js
/* Initialise le client Supabase navigateur (clé publiable via /api/config)
   et expose window.AUTH avec des helpers. Charge le SDK UMD si absent. */
(function () {
  let client = null;
  let ready = null;

  function loadSdk() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function init() {
    if (ready) return ready;
    ready = (async () => {
      const cfg = await fetch('/api/config').then((r) => r.json());
      if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('config Supabase absente');
      await loadSdk();
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      return client;
    })();
    return ready;
  }

  window.AUTH = {
    async client() { return init(); },
    async signUp(email, password, name) {
      const c = await init();
      return c.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: location.origin + '/compte' } });
    },
    async signIn(email, password) {
      const c = await init();
      return c.auth.signInWithPassword({ email, password });
    },
    async signOut() { const c = await init(); return c.auth.signOut(); },
    async getSession() { const c = await init(); const { data } = await c.auth.getSession(); return data.session; },
    async getToken() { const s = await this.getSession(); return s ? s.access_token : null; },
    async resetPassword(email) { const c = await init(); return c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/compte' }); },
    async updatePassword(password) { const c = await init(); return c.auth.updateUser({ password }); },
  };
})();
```

- [ ] **Step 2 : Ajouter les clés i18n (FR puis EN, mêmes clés)**

`fr.json` :
```json
  "account.title": "Mon compte",
  "account.login": "Connexion",
  "account.signup": "Inscription",
  "account.name": "Nom",
  "account.email": "Email",
  "account.password": "Mot de passe",
  "account.login.btn": "Se connecter",
  "account.signup.btn": "Créer mon compte",
  "account.forgot": "Mot de passe oublié ?",
  "account.logout": "Se déconnecter",
  "account.orders.title": "Mes commandes",
  "account.orders.empty": "Vous n'avez pas encore de commande.",
  "account.signup.check": "Compte créé ! Vérifiez votre email pour confirmer votre adresse.",
  "account.reset.sent": "Email de réinitialisation envoyé.",
  "account.reset.title": "Choisir un nouveau mot de passe",
  "account.reset.btn": "Enregistrer le mot de passe",
  "account.error": "Une erreur est survenue. Vérifiez vos identifiants.",
  "account.unavailable": "Les comptes ne sont pas encore disponibles."
```
`en.json` :
```json
  "account.title": "My account",
  "account.login": "Log in",
  "account.signup": "Sign up",
  "account.name": "Name",
  "account.email": "Email",
  "account.password": "Password",
  "account.login.btn": "Log in",
  "account.signup.btn": "Create my account",
  "account.forgot": "Forgot password?",
  "account.logout": "Log out",
  "account.orders.title": "My orders",
  "account.orders.empty": "You have no orders yet.",
  "account.signup.check": "Account created! Check your email to confirm your address.",
  "account.reset.sent": "Reset email sent.",
  "account.reset.title": "Choose a new password",
  "account.reset.btn": "Save password",
  "account.error": "Something went wrong. Check your credentials.",
  "account.unavailable": "Accounts are not available yet."
```

- [ ] **Step 3 : Vérifier parité**

Run : `npm test` → parité i18n verte.

- [ ] **Step 4 : Commit**

```bash
git add public/js/supabase-auth.js public/i18n/fr.json public/i18n/en.json
git commit -m "feat: browser Supabase auth helper + account i18n strings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 : Page « Mon compte » + envoi du Bearer à l'achat

> Appliquer le skill `frontend-design`.

**Files:**
- Create: `public/compte.html`
- Create: `public/js/compte.js`
- Modify: `src/routes/pages.ts` (alias `/compte`)
- Modify: `public/js/produit.js` (Bearer si connecté)

- [ ] **Step 1 : Créer `public/compte.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reliure — Mon compte</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
  <header class="site-header" id="site-header"></header>
  <main>
    <section class="section">
      <div class="container" style="max-width:560px">
        <h1 class="center" data-i18n="account.title"></h1>
        <div class="rule"></div>

        <!-- Non connecté -->
        <div id="auth-view" class="hidden">
          <div class="filters" style="justify-content:center">
            <button class="filter-btn active" id="tab-login" data-i18n="account.login"></button>
            <button class="filter-btn" id="tab-signup" data-i18n="account.signup"></button>
          </div>

          <form id="login-form">
            <label class="field"><span data-i18n="account.email"></span><input type="email" name="email" required /></label>
            <label class="field"><span data-i18n="account.password"></span><input type="password" name="password" required /></label>
            <button class="btn" type="submit" data-i18n="account.login.btn"></button>
            <p><a href="#" id="forgot-link" data-i18n="account.forgot"></a></p>
          </form>

          <form id="signup-form" class="hidden">
            <label class="field"><span data-i18n="account.name"></span><input type="text" name="name" required /></label>
            <label class="field"><span data-i18n="account.email"></span><input type="email" name="email" required /></label>
            <label class="field"><span data-i18n="account.password"></span><input type="password" name="password" minlength="6" required /></label>
            <button class="btn" type="submit" data-i18n="account.signup.btn"></button>
          </form>

          <p class="form-note hidden" id="auth-note"></p>
        </div>

        <!-- Réinitialisation (retour d'email) -->
        <div id="reset-view" class="hidden">
          <h2 data-i18n="account.reset.title"></h2>
          <form id="reset-form">
            <label class="field"><span data-i18n="account.password"></span><input type="password" name="password" minlength="6" required /></label>
            <button class="btn" type="submit" data-i18n="account.reset.btn"></button>
          </form>
          <p class="form-note hidden" id="reset-note"></p>
        </div>

        <!-- Connecté -->
        <div id="account-view" class="hidden">
          <p><strong id="acct-name"></strong><br><span id="acct-email" style="color:var(--text-soft)"></span></p>
          <button class="btn btn--sm btn--ghost" id="logout-btn" data-i18n="account.logout"></button>
          <h2 style="margin-top:2rem" data-i18n="account.orders.title"></h2>
          <div class="rule"></div>
          <div id="orders-list"></div>
          <p id="orders-empty" class="hidden" data-i18n="account.orders.empty"></p>
        </div>
      </div>
    </section>
  </main>
  <footer class="site-footer" id="site-footer"></footer>
  <script src="/js/i18n.js"></script>
  <script src="/js/util.js"></script>
  <script src="/js/layout.js"></script>
  <script src="/js/supabase-auth.js"></script>
  <script src="/js/compte.js"></script>
</body>
</html>
```

- [ ] **Step 2 : Créer `public/js/compte.js`**

```js
/* Page compte : connexion / inscription / reset / historique. */
const $ = (id) => document.getElementById(id);
function show(id) { ['auth-view', 'account-view', 'reset-view'].forEach((v) => $(v).classList.toggle('hidden', v !== id)); }
function note(el, key, ok) { el.textContent = window.I18N.t(key); el.className = 'form-note ' + (ok ? 'is-success' : 'is-error'); el.hidden = false; }

document.addEventListener('i18n:ready', init, { once: true });

async function init() {
  // Lien magique de récupération ? (hash contient type=recovery)
  if (location.hash.includes('type=recovery')) { wireReset(); show('reset-view'); return; }

  wireTabs(); wireForms();
  let session = null;
  try { session = await window.AUTH.getSession(); } catch { renderUnavailable(); return; }
  if (session) { await renderAccount(); } else { show('auth-view'); }
}

function renderUnavailable() {
  show('auth-view');
  const n = $('auth-note'); n.textContent = window.I18N.t('account.unavailable'); n.className = 'form-note is-error'; n.hidden = false;
  $('login-form').classList.add('hidden'); $('signup-form').classList.add('hidden');
}

function wireTabs() {
  $('tab-login').addEventListener('click', () => { $('tab-login').classList.add('active'); $('tab-signup').classList.remove('active'); $('login-form').classList.remove('hidden'); $('signup-form').classList.add('hidden'); });
  $('tab-signup').addEventListener('click', () => { $('tab-signup').classList.add('active'); $('tab-login').classList.remove('active'); $('signup-form').classList.remove('hidden'); $('login-form').classList.add('hidden'); });
}

function wireForms() {
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { error } = await window.AUTH.signIn(f.get('email'), f.get('password'));
    if (error) { note($('auth-note'), 'account.error', false); return; }
    await renderAccount();
  });
  $('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { error } = await window.AUTH.signUp(f.get('email'), f.get('password'), f.get('name'));
    if (error) { note($('auth-note'), 'account.error', false); return; }
    note($('auth-note'), 'account.signup.check', true);
  });
  $('forgot-link').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = $('login-form').querySelector('[name=email]').value;
    if (!email) { note($('auth-note'), 'account.error', false); return; }
    await window.AUTH.resetPassword(email);
    note($('auth-note'), 'account.reset.sent', true);
  });
  $('logout-btn').addEventListener('click', async () => { await window.AUTH.signOut(); location.reload(); });
}

function wireReset() {
  $('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = new FormData(e.target).get('password');
    const { error } = await window.AUTH.updatePassword(pw);
    note($('reset-note'), error ? 'account.error' : 'account.reset.sent', !error);
    if (!error) setTimeout(() => { location.href = '/compte'; }, 1200);
  });
}

async function renderAccount() {
  show('account-view');
  const token = await window.AUTH.getToken();
  const me = await fetch('/api/account/me', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : null).catch(() => null);
  if (me) { $('acct-name').textContent = me.name || ''; $('acct-email').textContent = me.email || ''; }
  const orders = await fetch('/api/account/orders', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : []).catch(() => []);
  const list = $('orders-list'); const empty = $('orders-empty');
  if (!orders.length) { empty.classList.remove('hidden'); list.innerHTML = ''; return; }
  empty.classList.add('hidden');
  list.innerHTML = orders.map(orderRow).join('');
}

function orderRow(o) {
  const date = (o.created_at || '').slice(0, 10);
  return `<div class="service-card" style="margin-bottom:.8rem">
    <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap">
      <span>${window.escHtml(date)}</span>
      <strong>${Number(o.amount).toFixed(2)} €</strong>
      <span style="color:var(--sage-deep)">${window.escHtml(o.status)}</span>
    </div>
  </div>`;
}
```

- [ ] **Step 3 : Ajouter l'alias `/compte` dans `src/routes/pages.ts`**

Ajouter `'/compte': 'compte.html'` à `PAGE_ALIASES`.

- [ ] **Step 4 : Envoyer le Bearer à l'achat (`public/js/produit.js`)**

Dans `wireBuy`, avant l'appel `fetch('/api/checkout', ...)`, récupérer le token et l'ajouter aux headers s'il existe :
```js
    const headers = { 'Content-Type': 'application/json' };
    try { if (window.AUTH) { const t = await window.AUTH.getToken(); if (t) headers.Authorization = `Bearer ${t}`; } } catch { /* invité */ }
    const res = await fetch('/api/checkout', { method: 'POST', headers, body: JSON.stringify({ slug: p.slug, lang }) });
```
(Remplace l'objet `headers` existant de l'appel.) Et charger `supabase-auth.js` dans `produit.html` **avant** `produit.js` :
```html
  <script src="/js/supabase-auth.js"></script>
```
(à insérer dans `public/produit.html` juste avant `<script src="/js/produit.js"></script>`.)

- [ ] **Step 5 : Vérifier**

Run : `npm test` (parité OK) puis `npm run dev` :
- `/compte` → onglets Connexion/Inscription s'affichent (si Supabase Auth configuré) ; sinon message « comptes pas encore disponibles » sans crash.
- La nav « Mon compte » ouvre bien `/compte`.
- Fiche produit : le bouton Acheter fonctionne toujours (invité → pas de header ; connecté → header ajouté).

Test manuel complet (avec Supabase Auth activé) : créer un compte → confirmer email → se connecter → voir l'historique (vide au départ).

- [ ] **Step 6 : Commit**

```bash
git add public/compte.html public/js/compte.js src/routes/pages.ts public/js/produit.js public/produit.html
git commit -m "feat: account page (login/signup/reset/order history) + send auth token on checkout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7 : Documentation Supabase Auth (README)

**Files:**
- Modify: `README.md`

- [ ] **Step 1 : Ajouter une section au `README.md`**

````markdown
## Comptes clients (Supabase Auth)

Les comptes utilisent Supabase Auth (email + mot de passe), géré côté navigateur via la clé publiable (`SUPABASE_ANON_KEY`).

Configuration Supabase (dashboard) :
1. **Authentication → URL Configuration** : mettre `Site URL` = l'URL publique du site, et ajouter `{URL}/compte` aux **Redirect URLs** (pour les liens de confirmation et de réinitialisation).
2. **Authentication → Providers → Email** : activé par défaut. La **confirmation d'email** est active par défaut ; la désactiver ici pour une inscription sans friction (optionnel).
3. (Optionnel) **Authentication → Emails / SMTP** : configurer un SMTP custom pour des emails de marque.

Aucune clé secrète côté navigateur : seule la clé publiable est exposée (via `GET /api/config`). Le serveur vérifie chaque jeton avec la clé service.
````

- [ ] **Step 2 : Commit**

```bash
git add README.md
git commit -m "docs: Supabase Auth configuration for customer accounts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (auteur du plan)

**Couverture spec :**
- §2 auth email/mot de passe (navigateur) → Tasks 5,6. ✅
- §3 `/api/config` → Task 1. ✅
- §4 page `/compte` (login/signup/reset/historique) → Task 6. ✅
- §5 `account.ts` (requireUser, me, orders, ensureCustomer) → Tasks 2,3. ✅
- §6 liaison commande↔compte (metadata.customer_id) → Task 4. ✅
- §7 données (customers/orders existantes) → pas de migration. ✅
- §8 sécurité (JWT vérifié, email authentifié, pas d'énumération) → Tasks 2,3. ✅
- §9 fichiers → respectés. ✅
- §10 tests (customers, orders customer_id, parité) → Tasks 2,4,5. ✅
- §12 doc → Task 7. ✅

**Placeholders :** aucun TODO. Page compte gère le cas « config Supabase absente » (message clair). Reset géré via hash `type=recovery`.

**Cohérence types/signatures :** `ensureCustomer(sb, authUser, name?)` / `getCustomerOrders(sb, customerId, email)` cohérents (Task 2 def ; Tasks 3,4 usage). `createCheckoutSession(product, lang, customerId?)` (Task 4 def ; checkout usage). `createOrderFromSession` lit `metadata.customer_id` (Task 4 ; aligné avec payments metadata). `window.AUTH` helpers (Task 5) utilisés par compte.js + produit.js (Tasks 6). i18n : clés `account.*` ajoutées FR+EN. Scripts chargés dans le bon ordre (util.js avant compte.js ; supabase-auth.js avant produit.js).

**Risque connu :** dépend du CDN jsDelivr pour le SDK Supabase navigateur (acceptable ; pas de bundler). En cas d'indisponibilité CDN, la page compte affiche le message d'erreur d'auth — dégradation propre.
