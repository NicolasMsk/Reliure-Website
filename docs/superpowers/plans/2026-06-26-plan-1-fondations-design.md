# Plan 1 — Fondations & Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. For all visual/CSS/HTML tasks (Tasks 7–12), additionally apply the `frontend-design` skill to keep the rendering distinctive and avoid a generic "AI template" look.

**Goal:** Mettre en place les fondations techniques et le squelette visuel bilingue (FR/EN) du site de reliure d'art : serveur Express/TS, clients Supabase/Stripe/Resend, système de design « médiéval raffiné », layout partagé, pages Accueil / À propos / Contact, et schéma de base de données complet.

**Architecture:** Serveur Express en TypeScript servant des pages HTML statiques depuis `public/`. Code serveur découpé en modules focalisés (`config`, `lib/`, `routes/`). Internationalisation côté client via dictionnaires JSON + petit script `i18n.js`. Layout (en-tête/pied de page) injecté par `layout.js` pour rester DRY. Palette et typographie définies dans un seul fichier de design tokens CSS. Schéma PostgreSQL complet appliqué dans Supabase dès le départ.

**Tech Stack:** Node ≥18, Express 4, TypeScript 5, `@supabase/supabase-js`, `stripe`, `resend`, `helmet`, `compression`, `express-rate-limit`, `cookie-session`, `dotenv`. Tests via le runner intégré `node:test` exécuté avec `tsx`. Polices Google Fonts (Cormorant Garamond, EB Garamond). Hébergement Railway.

**Convention de commit:** chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Structure des fichiers (créée au fil des tâches)

```
Reliure Website/
├── package.json
├── tsconfig.json
├── .gitignore
├── .env.example
├── schema.sql                     # Schéma complet Supabase (toutes tables v1)
├── README.md
├── src/
│   ├── server.ts                  # Point d'entrée : assemble l'app + listen
│   ├── app.ts                     # Construit l'app Express (sans listen) — testable
│   ├── config.ts                  # Constantes dérivées de l'env (PORT, APP_URL, EMAIL_FROM…)
│   ├── lib/
│   │   ├── env.ts                 # validateEnv() — vérifie les variables requises
│   │   └── clients.ts             # Instances Stripe / Supabase / Resend (init paresseuse)
│   └── routes/
│       ├── pages.ts               # Routes des pages (URLs propres FR/EN)
│       └── contact.ts             # POST /api/contact → email Resend
├── public/
│   ├── index.html                 # Accueil
│   ├── a-propos.html              # À propos
│   ├── contact.html               # Contact
│   ├── css/
│   │   └── style.css              # Design tokens + styles globaux
│   ├── js/
│   │   ├── i18n.js                # Bascule de langue côté client
│   │   └── layout.js              # Injection en-tête / pied de page
│   ├── i18n/
│   │   ├── fr.json                # Dictionnaire français
│   │   └── en.json                # Dictionnaire anglais
│   └── images/
│       └── .gitkeep
└── test/
    ├── env.test.ts
    ├── i18n.test.ts
    └── app.test.ts
```

---

### Task 0 : Scaffolding du projet

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `public/images/.gitkeep`

- [ ] **Step 1 : Initialiser git**

Run:
```bash
git init && git branch -M main
```
Expected : `Initialized empty Git repository`.

- [ ] **Step 2 : Créer `package.json`**

```json
{
  "name": "reliure-website",
  "version": "1.0.0",
  "description": "Site vitrine & boutique de reliure d'art (bilingue FR/EN)",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "tsx watch src/server.ts",
    "test": "tsx --test test/*.test.ts"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "compression": "^1.8.1",
    "cookie-session": "^2.1.0",
    "dotenv": "^16.4.0",
    "express": "^4.21.0",
    "express-rate-limit": "^8.2.1",
    "helmet": "^8.1.0",
    "resend": "^4.0.0",
    "stripe": "^17.0.0"
  },
  "devDependencies": {
    "@types/compression": "^1.8.1",
    "@types/cookie-session": "^2.0.49",
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 3 : Créer `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "public", "test"]
}
```

- [ ] **Step 4 : Créer `.gitignore`**

```
node_modules/
dist/
.env
.DS_Store
*.log
.superpowers/
```

- [ ] **Step 5 : Créer `.env.example`**

```
# ─── Serveur ──────────────────────────────
PORT=3000
APP_URL=http://localhost:3000
NODE_ENV=development

# ─── Supabase ─────────────────────────────
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxx

# ─── Stripe ───────────────────────────────
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# ─── Resend (emails) ──────────────────────
RESEND_API_KEY=re_xxx
EMAIL_FROM=Reliure <onboarding@resend.dev>
CONTACT_TO=ton-email@exemple.fr

# ─── Admin ────────────────────────────────
ADMIN_PASSWORD=change-moi
```

- [ ] **Step 6 : Créer le dossier d'images**

```bash
mkdir -p public/images && echo "" > public/images/.gitkeep
```

- [ ] **Step 7 : Installer les dépendances**

Run:
```bash
npm install
```
Expected : `node_modules/` créé, aucun message d'erreur de résolution.

- [ ] **Step 8 : Commit**

```bash
git add -A
git commit -m "chore: scaffold project (package.json, tsconfig, env, gitignore)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1 : Module de validation de l'environnement

**Files:**
- Create: `src/lib/env.ts`
- Test: `test/env.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

`test/env.test.ts` :
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv } from '../src/lib/env';

test('validateEnv retourne la liste des variables manquantes', () => {
  const missing = validateEnv({ STRIPE_SECRET_KEY: 'x' }, ['STRIPE_SECRET_KEY', 'SUPABASE_URL']);
  assert.deepEqual(missing, ['SUPABASE_URL']);
});

test('validateEnv retourne un tableau vide quand tout est présent', () => {
  const missing = validateEnv({ A: '1', B: '2' }, ['A', 'B']);
  assert.deepEqual(missing, []);
});

test('validateEnv considère une chaîne vide comme manquante', () => {
  const missing = validateEnv({ A: '' }, ['A']);
  assert.deepEqual(missing, ['A']);
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run : `npm test`
Expected : FAIL — `Cannot find module '../src/lib/env'`.

- [ ] **Step 3 : Écrire l'implémentation minimale**

`src/lib/env.ts` :
```ts
/** Variables d'environnement requises pour démarrer le serveur. */
export const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'ADMIN_PASSWORD',
] as const;

/**
 * Renvoie la liste des clés requises absentes ou vides de `source`.
 * Une chaîne vide ou un espace blanc compte comme absente.
 */
export function validateEnv(
  source: Record<string, string | undefined>,
  required: readonly string[] = REQUIRED_ENV,
): string[] {
  return required.filter((key) => {
    const value = source[key];
    return value === undefined || value.trim() === '';
  });
}
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run : `npm test`
Expected : PASS (3 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/env.ts test/env.test.ts
git commit -m "feat: env validation helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 : Clients de services (Supabase / Stripe / Resend) + config

**Files:**
- Create: `src/lib/clients.ts`
- Create: `src/config.ts`

Note : pas de test unitaire ici (ce sont des wrappers d'init autour de SDK externes). L'initialisation paresseuse évite de planter les tests qui n'ont pas besoin de ces clients.

- [ ] **Step 1 : Créer `src/config.ts`**

```ts
import 'dotenv/config';

export const PORT = Number(process.env.PORT) || 3000;
export const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
export const EMAIL_FROM = process.env.EMAIL_FROM || 'Reliure <onboarding@resend.dev>';
export const CONTACT_TO = process.env.CONTACT_TO || '';
export const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
```

- [ ] **Step 2 : Créer `src/lib/clients.ts`**

```ts
import Stripe from 'stripe';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

let _stripe: Stripe | null = null;
let _supabase: SupabaseClient | null = null;
let _resend: Resend | null = null;

export function getStripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return _stripe;
}

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );
  }
  return _supabase;
}

export function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}
```

- [ ] **Step 3 : Vérifier la compilation**

Run : `npm run build`
Expected : compilation sans erreur (le dossier `dist/` apparaît). Puis nettoyer : `rm -rf dist`.

- [ ] **Step 4 : Commit**

```bash
git add src/config.ts src/lib/clients.ts
git commit -m "feat: service clients (Stripe/Supabase/Resend) and config

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 : Application Express (app.ts) + route santé + service des fichiers statiques

**Files:**
- Create: `src/app.ts`
- Test: `test/app.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

`test/app.test.ts` :
```ts
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../src/app';

const app = createApp();
const server: Server = app.listen(0);
const base = () => {
  const addr = server.address();
  if (addr && typeof addr === 'object') return `http://127.0.0.1:${addr.port}`;
  throw new Error('server address unavailable');
};

after(() => server.close());

test('GET /api/health renvoie 200 et { ok: true }', async () => {
  const res = await fetch(`${base()}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test("GET / sert la page d'accueil (HTML)", async () => {
  const res = await fetch(`${base()}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/html/);
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run : `npm test`
Expected : FAIL — `Cannot find module '../src/app'`.

- [ ] **Step 3 : Écrire l'implémentation**

`src/app.ts` :
```ts
import express, { Express, Request, Response } from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cookieSession from 'cookie-session';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { IS_PRODUCTION } from './config';
import { registerPageRoutes } from './routes/pages';
import { registerContactRoutes } from './routes/contact';

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

export function createApp(): Express {
  const app = express();

  if (IS_PRODUCTION) app.set('trust proxy', 1);

  app.use(compression());
  app.use(
    helmet({
      contentSecurityPolicy: false, // styles/scripts inline tolérés (admin, i18n)
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de requêtes, veuillez réessayer plus tard.' },
  });
  app.use('/api/', generalLimiter);

  app.use(
    cookieSession({
      name: 'reliure_admin',
      keys: [process.env.ADMIN_PASSWORD || 'dev-secret'],
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PRODUCTION,
    }),
  );

  // Santé (pour Railway + tests)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Routes des pages (URLs propres) AVANT le static pour gérer les alias
  registerPageRoutes(app, PUBLIC_DIR);
  registerContactRoutes(app);

  // Assets avec cache
  app.use('/css', express.static(path.join(PUBLIC_DIR, 'css'), { maxAge: '7d' }));
  app.use('/js', express.static(path.join(PUBLIC_DIR, 'js'), { maxAge: '7d' }));
  app.use('/i18n', express.static(path.join(PUBLIC_DIR, 'i18n'), { maxAge: '1d' }));
  app.use('/images', express.static(path.join(PUBLIC_DIR, 'images'), { maxAge: '30d' }));

  // HTML restant (sans cache)
  app.use(express.static(PUBLIC_DIR, { redirect: false }));

  return app;
}
```

Note : ce test dépend des routes (Task 5/Task 9) et de `public/index.html` (Task 9). On crée des fichiers minimaux maintenant pour faire passer le test, puis on les étoffe.

- [ ] **Step 4 : Créer les stubs nécessaires au test**

`src/routes/pages.ts` (stub minimal — étoffé en Task 8) :
```ts
import { Express } from 'express';
import path from 'path';

export function registerPageRoutes(app: Express, publicDir: string): void {
  app.get('/', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}
```

`src/routes/contact.ts` (stub minimal — étoffé en Task 11) :
```ts
import { Express } from 'express';

export function registerContactRoutes(_app: Express): void {
  // étoffé dans la Task 11
}
```

`public/index.html` (stub minimal — remplacé en Task 9) :
```html
<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Reliure</title></head>
<body><h1>Reliure</h1></body></html>
```

- [ ] **Step 5 : Lancer le test pour vérifier qu'il passe**

Run : `npm test`
Expected : PASS (env + app : 5 tests au total).

- [ ] **Step 6 : Commit**

```bash
git add src/app.ts src/routes/pages.ts src/routes/contact.ts public/index.html test/app.test.ts
git commit -m "feat: express app skeleton with health route and static serving

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 : Point d'entrée du serveur (server.ts)

**Files:**
- Create: `src/server.ts`

- [ ] **Step 1 : Écrire `src/server.ts`**

```ts
import 'dotenv/config';
import { createApp } from './app';
import { validateEnv } from './lib/env';
import { PORT } from './config';

const missing = validateEnv(process.env);
if (missing.length > 0) {
  console.error(`❌  Variables d'environnement manquantes : ${missing.join(', ')}`);
  process.exit(1);
}

const app = createApp();

app.listen(PORT, () => {
  console.log(`
  ✦ ═══════════════════════════════════════════ ✦
    Reliure — serveur démarré
    → http://localhost:${PORT}
    → Admin : http://localhost:${PORT}/admin
  ✦ ═══════════════════════════════════════════ ✦
  `);
});
```

- [ ] **Step 2 : Vérifier le démarrage (sans vraies clés)**

Crée un `.env` local à partir de `.env.example` avec des valeurs factices non vides pour les 6 variables requises, puis :
Run : `npm run dev`
Expected : le bandeau « serveur démarré » s'affiche. Ouvre `http://localhost:3000/api/health` → `{"ok":true}`. Arrête le serveur (Ctrl+C).

- [ ] **Step 3 : Commit**

```bash
git add src/server.ts
git commit -m "feat: server entrypoint with env validation gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5 : Dictionnaires d'internationalisation (FR/EN) + test de parité

**Files:**
- Create: `public/i18n/fr.json`
- Create: `public/i18n/en.json`
- Test: `test/i18n.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

`test/i18n.test.ts` :
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fr from '../public/i18n/fr.json';
import en from '../public/i18n/en.json';

function keys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort();
}

test('fr.json et en.json ont exactement les mêmes clés', () => {
  assert.deepEqual(keys(fr as any), keys(en as any));
});

test('aucune valeur de traduction n\'est vide', () => {
  for (const [k, v] of Object.entries(fr as Record<string, string>)) {
    assert.ok(v && v.trim().length > 0, `fr.${k} est vide`);
  }
  for (const [k, v] of Object.entries(en as Record<string, string>)) {
    assert.ok(v && v.trim().length > 0, `en.${k} est vide`);
  }
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run : `npm test`
Expected : FAIL — fichiers JSON introuvables.

- [ ] **Step 3 : Créer `public/i18n/fr.json`**

```json
{
  "nav.home": "Accueil",
  "nav.shop": "Boutique",
  "nav.custom": "Sur-mesure",
  "nav.about": "À propos",
  "nav.contact": "Contact",
  "nav.account": "Mon compte",
  "home.hero.title": "L'art de la reliure, façonné à la main",
  "home.hero.subtitle": "Des pièces uniques, reliées avec patience et savoir-faire.",
  "home.hero.cta": "Découvrir la boutique",
  "home.intro.title": "Un atelier, une passion",
  "home.intro.text": "Chaque ouvrage est restauré ou créé avec des matériaux nobles — cuir, papier de garde, dorure à chaud — dans la tradition des relieurs d'art.",
  "home.featured.title": "Créations en vedette",
  "about.title": "À propos de l'atelier",
  "about.text": "Artisane relieuse, je redonne vie aux livres et crée des pièces uniques mêlant tradition et caractère.",
  "contact.title": "Me contacter",
  "contact.intro": "Une question, un projet ? Écrivez-moi.",
  "contact.name": "Votre nom",
  "contact.email": "Votre email",
  "contact.message": "Votre message",
  "contact.send": "Envoyer",
  "contact.success": "Message envoyé, merci ! Je vous réponds au plus vite.",
  "contact.error": "Une erreur est survenue. Réessayez ou écrivez-moi directement.",
  "footer.tagline": "Reliure d'art — pièces uniques & sur-mesure",
  "footer.rights": "Tous droits réservés"
}
```

- [ ] **Step 4 : Créer `public/i18n/en.json`**

```json
{
  "nav.home": "Home",
  "nav.shop": "Shop",
  "nav.custom": "Bespoke",
  "nav.about": "About",
  "nav.contact": "Contact",
  "nav.account": "My account",
  "home.hero.title": "The art of bookbinding, crafted by hand",
  "home.hero.subtitle": "One-of-a-kind pieces, bound with patience and craft.",
  "home.hero.cta": "Explore the shop",
  "home.intro.title": "A workshop, a passion",
  "home.intro.text": "Each work is restored or created with fine materials — leather, endpapers, gold tooling — in the tradition of fine bookbinding.",
  "home.featured.title": "Featured creations",
  "about.title": "About the workshop",
  "about.text": "As a bookbinder, I bring books back to life and craft unique pieces blending tradition and character.",
  "contact.title": "Get in touch",
  "contact.intro": "A question, a project? Write to me.",
  "contact.name": "Your name",
  "contact.email": "Your email",
  "contact.message": "Your message",
  "contact.send": "Send",
  "contact.success": "Message sent, thank you! I'll get back to you shortly.",
  "contact.error": "Something went wrong. Please try again or email me directly.",
  "footer.tagline": "Fine bookbinding — unique & bespoke pieces",
  "footer.rights": "All rights reserved"
}
```

- [ ] **Step 5 : Lancer le test pour vérifier qu'il passe**

Run : `npm test`
Expected : PASS.

- [ ] **Step 6 : Commit**

```bash
git add public/i18n/fr.json public/i18n/en.json test/i18n.test.ts
git commit -m "feat: bilingual i18n dictionaries with key-parity test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 : Script i18n côté client

**Files:**
- Create: `public/js/i18n.js`

- [ ] **Step 1 : Écrire `public/js/i18n.js`**

```js
/* Internationalisation côté client.
   Usage HTML : <span data-i18n="nav.home"></span>
   La langue est lue depuis ?lang=, puis localStorage, sinon 'fr'. */
(function () {
  const SUPPORTED = ['fr', 'en'];

  function detectLang() {
    const param = new URLSearchParams(location.search).get('lang');
    if (param && SUPPORTED.includes(param)) return param;
    const stored = localStorage.getItem('lang');
    if (stored && SUPPORTED.includes(stored)) return stored;
    return 'fr';
  }

  async function loadDict(lang) {
    const res = await fetch(`/i18n/${lang}.json`);
    return res.json();
  }

  function apply(dict) {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key]) el.setAttribute('placeholder', dict[key]);
    });
  }

  window.I18N = {
    current: detectLang(),
    dict: {},
    async init() {
      this.current = detectLang();
      document.documentElement.lang = this.current;
      this.dict = await loadDict(this.current);
      apply(this.dict);
      document.dispatchEvent(new CustomEvent('i18n:ready', { detail: { lang: this.current } }));
    },
    async setLang(lang) {
      if (!SUPPORTED.includes(lang)) return;
      localStorage.setItem('lang', lang);
      this.current = lang;
      document.documentElement.lang = lang;
      this.dict = await loadDict(lang);
      apply(this.dict);
      document.dispatchEvent(new CustomEvent('i18n:ready', { detail: { lang } }));
    },
    t(key) {
      return this.dict[key] || key;
    },
  };
})();
```

- [ ] **Step 2 : Commit**

```bash
git add public/js/i18n.js
git commit -m "feat: client-side i18n switcher

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7 : Système de design (CSS tokens + styles globaux)

> Appliquer le skill `frontend-design` pour ce fichier : viser une élégance médiévale sobre, pas un rendu générique.

**Files:**
- Create: `public/css/style.css`

- [ ] **Step 1 : Écrire `public/css/style.css`**

```css
/* ═══════════════════════════════════════════
   RELIURE — Design system « médiéval raffiné »
   Palette : Bordeaux · Almond Cream · Coastal Sage · Golden Chamomile
   ═══════════════════════════════════════════ */

@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap');

:root {
  /* Palette */
  --burgundy:       #5c0f24;
  --burgundy-deep:  #420a19;
  --cream:          #f0ead8;
  --cream-soft:     #f7f3e8;
  --sage:           #99aba6;
  --sage-deep:      #6f827c;
  --gold:           #d2bf81;
  --gold-deep:      #b59c52;
  --olive:          #6b6a3a;
  --ink:            #2a1a1f;

  /* Rôles */
  --bg:             var(--cream-soft);
  --bg-alt:         var(--cream);
  --text:           var(--ink);
  --text-soft:      #5a4a4f;
  --accent:         var(--burgundy);
  --accent-2:       var(--gold-deep);
  --line:           rgba(92, 15, 36, 0.18);

  /* Typo */
  --font-display: 'Cormorant Garamond', Georgia, serif;
  --font-body:    'EB Garamond', Georgia, serif;

  /* Espacements */
  --maxw: 1120px;
  --gutter: clamp(1.25rem, 4vw, 3rem);
}

*, *::before, *::after { box-sizing: border-box; }

html { scroll-behavior: smooth; }

body {
  margin: 0;
  font-family: var(--font-body);
  font-size: 1.125rem;
  line-height: 1.7;
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 {
  font-family: var(--font-display);
  font-weight: 500;
  line-height: 1.15;
  color: var(--accent);
  margin: 0 0 0.5em;
}
h1 { font-size: clamp(2.4rem, 6vw, 4rem); }
h2 { font-size: clamp(1.8rem, 4vw, 2.6rem); }
h3 { font-size: 1.4rem; }

p { margin: 0 0 1.1em; color: var(--text-soft); }

a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-2); }

.container { max-width: var(--maxw); margin: 0 auto; padding-inline: var(--gutter); }
.section { padding-block: clamp(3rem, 8vw, 6rem); }
.section--alt { background: var(--bg-alt); }
.center { text-align: center; }

/* Filet ornemental réutilisable */
.rule {
  width: 120px; height: 1px; margin: 1.5rem auto;
  background: linear-gradient(90deg, transparent, var(--gold-deep), transparent);
  position: relative;
}
.rule::after {
  content: '✦';
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  color: var(--gold-deep); background: var(--bg);
  padding: 0 0.5rem; font-size: 0.8rem;
}

/* Boutons */
.btn {
  display: inline-block;
  font-family: var(--font-display);
  font-size: 1.05rem; letter-spacing: 0.06em;
  padding: 0.7em 1.8em;
  border: 1px solid var(--accent);
  border-radius: 2px;
  background: var(--accent);
  color: var(--cream);
  cursor: pointer;
  transition: background .25s, color .25s, transform .1s;
}
.btn:hover { background: transparent; color: var(--accent); }
.btn:active { transform: translateY(1px); }
.btn--ghost { background: transparent; color: var(--accent); }
.btn--ghost:hover { background: var(--accent); color: var(--cream); }

/* En-tête */
.site-header {
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--cream-soft) 92%, transparent);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid var(--line);
}
.site-header .container {
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; padding-block: 0.9rem;
}
.brand {
  font-family: var(--font-display); font-size: 1.5rem;
  letter-spacing: 0.12em; color: var(--accent); text-transform: uppercase;
}
.nav { display: flex; align-items: center; gap: clamp(0.8rem, 2vw, 1.8rem); }
.nav a { font-size: 1rem; letter-spacing: 0.04em; color: var(--text); }
.nav a:hover { color: var(--accent); }
.lang-toggle { display: flex; gap: 0.25rem; align-items: center; }
.lang-toggle button {
  background: none; border: none; cursor: pointer;
  font-family: var(--font-body); font-size: 0.95rem; color: var(--text-soft);
  padding: 0.2rem 0.4rem;
}
.lang-toggle button.active { color: var(--accent); font-weight: 600; text-decoration: underline; }

/* Hero */
.hero {
  position: relative; text-align: center;
  padding-block: clamp(4rem, 12vw, 8rem);
  background:
    linear-gradient(rgba(66,10,25,0.55), rgba(66,10,25,0.55)),
    var(--hero-image, none) center/cover no-repeat,
    var(--burgundy-deep);
  color: var(--cream);
}
.hero h1 { color: var(--cream); }
.hero p { color: var(--cream); opacity: 0.92; font-size: 1.3rem; max-width: 40ch; margin-inline: auto; }
.hero .btn { margin-top: 1.5rem; border-color: var(--gold); background: var(--gold); color: var(--burgundy-deep); }
.hero .btn:hover { background: transparent; color: var(--cream); border-color: var(--cream); }

/* Grille de cartes (réutilisée en boutique au Plan 2) */
.grid { display: grid; gap: 1.8rem; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
.card {
  background: var(--cream); border: 1px solid var(--line); border-radius: 3px;
  overflow: hidden; transition: transform .2s, box-shadow .2s;
}
.card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(66,10,25,0.12); }
.card img { width: 100%; aspect-ratio: 3/4; object-fit: cover; display: block; }
.card .card-body { padding: 1rem 1.1rem 1.3rem; }

/* Formulaires */
.field { display: block; margin-bottom: 1.1rem; }
.field label { display: block; font-family: var(--font-display); margin-bottom: 0.3rem; color: var(--accent); }
.field input, .field textarea {
  width: 100%; padding: 0.7rem 0.9rem; font-family: var(--font-body); font-size: 1rem;
  border: 1px solid var(--line); border-radius: 2px; background: var(--cream-soft); color: var(--text);
}
.field textarea { min-height: 140px; resize: vertical; }
.form-note { font-size: 0.95rem; }
.form-note.is-error { color: var(--burgundy); }
.form-note.is-success { color: var(--olive); }

/* Pied de page */
.site-footer {
  background: var(--burgundy-deep); color: var(--cream);
  padding-block: 2.5rem; text-align: center;
}
.site-footer p { color: rgba(240,234,216,0.8); margin: 0.3rem 0; }
.site-footer .brand { color: var(--gold); }

/* Mobile nav simple */
@media (max-width: 720px) {
  .nav { gap: 0.7rem; flex-wrap: wrap; justify-content: flex-end; }
  .nav a { font-size: 0.9rem; }
}
```

- [ ] **Step 2 : Commit**

```bash
git add public/css/style.css
git commit -m "feat: medieval-refined design system (palette, typography, components)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8 : Layout partagé (en-tête / pied de page injectés)

> Appliquer le skill `frontend-design`.

**Files:**
- Create: `public/js/layout.js`

- [ ] **Step 1 : Écrire `public/js/layout.js`**

```js
/* Injecte l'en-tête et le pied de page partagés dans les éléments
   #site-header et #site-footer, puis branche la bascule de langue.
   Dépend de window.I18N (i18n.js chargé avant). */
(function () {
  function headerHTML() {
    return `
      <div class="container">
        <a href="/" class="brand">Reliure</a>
        <nav class="nav">
          <a href="/" data-i18n="nav.home"></a>
          <a href="/boutique" data-i18n="nav.shop"></a>
          <a href="/sur-mesure" data-i18n="nav.custom"></a>
          <a href="/a-propos" data-i18n="nav.about"></a>
          <a href="/contact" data-i18n="nav.contact"></a>
          <a href="/compte" data-i18n="nav.account"></a>
          <span class="lang-toggle">
            <button type="button" data-lang="fr">FR</button>
            <button type="button" data-lang="en">EN</button>
          </span>
        </nav>
      </div>`;
  }

  function footerHTML() {
    const year = new Date().getFullYear();
    return `
      <div class="container">
        <p class="brand">Reliure</p>
        <p data-i18n="footer.tagline"></p>
        <p>© ${year} — <span data-i18n="footer.rights"></span></p>
      </div>`;
  }

  function markActiveLang() {
    const lang = window.I18N ? window.I18N.current : 'fr';
    document.querySelectorAll('.lang-toggle button').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
    });
  }

  function mount() {
    const h = document.getElementById('site-header');
    const f = document.getElementById('site-footer');
    if (h) h.innerHTML = headerHTML();
    if (f) f.innerHTML = footerHTML();

    document.querySelectorAll('.lang-toggle button').forEach((b) => {
      b.addEventListener('click', async () => {
        if (window.I18N) await window.I18N.setLang(b.getAttribute('data-lang'));
        markActiveLang();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    mount();
    if (window.I18N) await window.I18N.init();
    markActiveLang();
  });
  document.addEventListener('i18n:ready', markActiveLang);
})();
```

- [ ] **Step 2 : Commit**

```bash
git add public/js/layout.js
git commit -m "feat: shared header/footer layout with language toggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9 : Page d'accueil

> Appliquer le skill `frontend-design`.

**Files:**
- Modify: `public/index.html` (remplace le stub de la Task 3)

- [ ] **Step 1 : Remplacer `public/index.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reliure — L'art de la reliure façonné à la main</title>
  <meta name="description" content="Atelier de reliure d'art : pièces uniques et créations sur-mesure, dans la tradition des relieurs." />
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
  <header class="site-header" id="site-header"></header>

  <main>
    <section class="hero" style="--hero-image: url('/images/hero.jpg');">
      <div class="container">
        <h1 data-i18n="home.hero.title"></h1>
        <p data-i18n="home.hero.subtitle"></p>
        <a class="btn" href="/boutique" data-i18n="home.hero.cta"></a>
      </div>
    </section>

    <section class="section center">
      <div class="container">
        <h2 data-i18n="home.intro.title"></h2>
        <div class="rule"></div>
        <p style="max-width: 60ch; margin-inline: auto;" data-i18n="home.intro.text"></p>
      </div>
    </section>

    <section class="section section--alt">
      <div class="container">
        <h2 class="center" data-i18n="home.featured.title"></h2>
        <div class="rule"></div>
        <!-- Placeholder : la grille sera alimentée par la base au Plan 2 -->
        <div class="grid" id="featured-grid">
          <article class="card">
            <img src="/images/placeholder-1.jpg" alt="" />
            <div class="card-body"><h3>Carnet relié cuir</h3><p>Pièce unique</p></div>
          </article>
          <article class="card">
            <img src="/images/placeholder-2.jpg" alt="" />
            <div class="card-body"><h3>Registre ancien restauré</h3><p>Pièce unique</p></div>
          </article>
          <article class="card">
            <img src="/images/placeholder-3.jpg" alt="" />
            <div class="card-body"><h3>Coffret dorure à chaud</h3><p>Pièce unique</p></div>
          </article>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer" id="site-footer"></footer>

  <script src="/js/i18n.js"></script>
  <script src="/js/layout.js"></script>
</body>
</html>
```

- [ ] **Step 2 : Ajouter des images libres de droits**

Télécharger 4 images libres de droits (Unsplash/Pexels — reliure, livres anciens, cuir, atelier) et les placer dans `public/images/` sous les noms `hero.jpg`, `placeholder-1.jpg`, `placeholder-2.jpg`, `placeholder-3.jpg`.
Exemple (Unsplash, licence libre) :
```bash
curl -L -o public/images/hero.jpg "https://images.unsplash.com/photo-1524578271613-d550eacf6090?w=1600&q=80"
curl -L -o public/images/placeholder-1.jpg "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&q=80"
curl -L -o public/images/placeholder-2.jpg "https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=800&q=80"
curl -L -o public/images/placeholder-3.jpg "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=800&q=80"
```
Vérifier que chaque fichier fait > 10 Ko (téléchargement réussi). Ces images seront remplacées par les vraies photos depuis l'admin (Plan 2). Conserver la source/licence dans `public/images/CREDITS.md`.

- [ ] **Step 3 : Vérification visuelle**

Run : `npm run dev` puis ouvrir `http://localhost:3000/`.
Expected : page d'accueil stylée (hero bordeaux, titres serif), bascule FR/EN fonctionnelle (les textes changent), nav et footer présents.

- [ ] **Step 4 : Commit**

```bash
git add public/index.html public/images
git commit -m "feat: home page with hero, intro and featured grid (royalty-free placeholders)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10 : Page À propos

> Appliquer le skill `frontend-design`.

**Files:**
- Create: `public/a-propos.html`
- Modify: `src/routes/pages.ts` (ajouter l'alias `/a-propos`)

- [ ] **Step 1 : Créer `public/a-propos.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reliure — À propos de l'atelier</title>
  <meta name="description" content="L'histoire de l'atelier de reliure d'art." />
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
  <header class="site-header" id="site-header"></header>
  <main>
    <section class="section">
      <div class="container" style="max-width: 720px;">
        <h1 class="center" data-i18n="about.title"></h1>
        <div class="rule"></div>
        <p data-i18n="about.text"></p>
      </div>
    </section>
  </main>
  <footer class="site-footer" id="site-footer"></footer>
  <script src="/js/i18n.js"></script>
  <script src="/js/layout.js"></script>
</body>
</html>
```

- [ ] **Step 2 : Ajouter l'alias de route dans `src/routes/pages.ts`**

Remplacer le contenu de `src/routes/pages.ts` par :
```ts
import { Express } from 'express';
import path from 'path';

/** Associe une URL propre à un fichier HTML de public/. */
const PAGE_ALIASES: Record<string, string> = {
  '/': 'index.html',
  '/a-propos': 'a-propos.html',
  '/contact': 'contact.html',
};

export function registerPageRoutes(app: Express, publicDir: string): void {
  for (const [route, file] of Object.entries(PAGE_ALIASES)) {
    app.get(route, (_req, res) => {
      res.sendFile(path.join(publicDir, file));
    });
  }
}
```

- [ ] **Step 3 : Vérification**

Run : `npm test` (les tests existants passent toujours) puis `npm run dev` et ouvrir `http://localhost:3000/a-propos`.
Expected : page À propos stylée et bilingue.

- [ ] **Step 4 : Commit**

```bash
git add public/a-propos.html src/routes/pages.ts
git commit -m "feat: about page with clean URL routing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11 : Page Contact + endpoint d'envoi d'email

> Appliquer le skill `frontend-design` pour la page.

**Files:**
- Create: `public/contact.html`
- Modify: `src/routes/contact.ts`
- Create: `public/js/contact.js`

- [ ] **Step 1 : Écrire `src/routes/contact.ts`**

```ts
import { Express, Request, Response } from 'express';
import { getResend } from '../lib/clients';
import { EMAIL_FROM, CONTACT_TO } from '../config';

interface ContactBody {
  name?: string;
  email?: string;
  message?: string;
}

export function registerContactRoutes(app: Express): void {
  app.post('/api/contact', async (req: Request, res: Response): Promise<void> => {
    const { name, email, message } = req.body as ContactBody;

    if (!name || !email || !message) {
      res.status(400).json({ error: 'Champs obligatoires manquants.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Adresse email invalide.' });
      return;
    }
    if (!CONTACT_TO) {
      console.error('❌  CONTACT_TO non configuré.');
      res.status(500).json({ error: 'Configuration serveur incomplète.' });
      return;
    }

    // Échappe le HTML pour neutraliser toute injection dans l'email reçu.
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeName = name.replace(/[\r\n]+/g, ' ').trim(); // évite l'injection d'en-tête dans le sujet

    try {
      // Resend NE LÈVE PAS d'exception sur erreur API : il résout avec { data, error }.
      const { error } = await getResend().emails.send({
        from: EMAIL_FROM,
        to: CONTACT_TO,
        replyTo: email,
        subject: `📩 Nouveau message — ${safeName}`,
        html: `<p><strong>De :</strong> ${esc(name)} (${esc(email)})</p><p>${esc(message).replace(/\n/g, '<br>')}</p>`,
      });
      if (error) {
        console.error('⚠️  Resend a renvoyé une erreur :', error);
        res.status(502).json({ error: 'Envoi impossible. Réessayez plus tard.' });
        return;
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error('⚠️  Échec envoi contact :', err.message);
      res.status(502).json({ error: 'Envoi impossible. Réessayez plus tard.' });
    }
  });
}
```

- [ ] **Step 2 : Créer `public/contact.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reliure — Contact</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
  <header class="site-header" id="site-header"></header>
  <main>
    <section class="section">
      <div class="container" style="max-width: 620px;">
        <h1 class="center" data-i18n="contact.title"></h1>
        <div class="rule"></div>
        <p class="center" data-i18n="contact.intro"></p>
        <form id="contact-form">
          <label class="field">
            <span data-i18n="contact.name"></span>
            <input type="text" name="name" required />
          </label>
          <label class="field">
            <span data-i18n="contact.email"></span>
            <input type="email" name="email" required />
          </label>
          <label class="field">
            <span data-i18n="contact.message"></span>
            <textarea name="message" required></textarea>
          </label>
          <button class="btn" type="submit" data-i18n="contact.send"></button>
          <p class="form-note" id="contact-note" hidden></p>
        </form>
      </div>
    </section>
  </main>
  <footer class="site-footer" id="site-footer"></footer>
  <script src="/js/i18n.js"></script>
  <script src="/js/layout.js"></script>
  <script src="/js/contact.js"></script>
</body>
</html>
```

- [ ] **Step 3 : Créer `public/js/contact.js`**

```js
/* Soumission AJAX du formulaire de contact. */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  const note = document.getElementById('contact-note');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    note.hidden = true;

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const ok = res.ok;
      note.textContent = window.I18N.t(ok ? 'contact.success' : 'contact.error');
      note.className = 'form-note ' + (ok ? 'is-success' : 'is-error');
      note.hidden = false;
      if (ok) form.reset();
    } catch {
      note.textContent = window.I18N.t('contact.error');
      note.className = 'form-note is-error';
      note.hidden = false;
    }
  });
});
```

- [ ] **Step 4 : Vérification**

Run : `npm test` (tout passe). Puis `npm run dev`, ouvrir `http://localhost:3000/contact`.
Expected : formulaire stylé et bilingue. Sans `CONTACT_TO`/clé Resend valide, l'envoi renvoie une erreur affichée proprement (c'est attendu en local). La route est correcte ; l'envoi réel sera validé une fois Resend configuré.

- [ ] **Step 5 : Commit**

```bash
git add public/contact.html public/js/contact.js src/routes/contact.ts
git commit -m "feat: contact page and email endpoint via Resend

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12 : Schéma de base de données complet (Supabase)

**Files:**
- Create: `schema.sql`

- [ ] **Step 1 : Écrire `schema.sql`** (toutes les tables de la v1, utilisées par les plans suivants)

```sql
-- ═══════════════════════════════════════════════════════
-- RELIURE — Schéma Supabase (PostgreSQL)
-- À exécuter dans le SQL Editor de Supabase.
-- ═══════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Produits (pièces uniques) ──────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            TEXT UNIQUE NOT NULL,
  title_fr        TEXT NOT NULL,
  title_en        TEXT NOT NULL,
  description_fr  TEXT,
  description_en  TEXT,
  price           NUMERIC(10,2) NOT NULL DEFAULT 0,
  category        TEXT,
  status          TEXT NOT NULL DEFAULT 'brouillon'
                  CHECK (status IN ('brouillon', 'disponible', 'vendu')),
  weight_grams    INT NOT NULL DEFAULT 500,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_status ON products (status);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products (slug);

-- ── Images de produits ─────────────────────────────────
CREATE TABLE IF NOT EXISTS product_images (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  alt_fr       TEXT,
  alt_en       TEXT,
  sort_order   INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images (product_id);

-- ── Comptes clients (liés à Supabase Auth) ─────────────
CREATE TABLE IF NOT EXISTS customers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id  UUID UNIQUE,
  name          TEXT,
  email         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Commandes (vente directe) ──────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_session_id  TEXT UNIQUE NOT NULL,
  product_id         UUID REFERENCES products(id) ON DELETE SET NULL,
  customer_id        UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_email     TEXT,
  amount             NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping_address   JSONB,
  status             TEXT NOT NULL DEFAULT 'payée'
                     CHECK (status IN ('payée', 'expédiée', 'livrée')),
  lang               TEXT NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr', 'en')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shipped_at         TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);

-- ── Demandes sur-mesure ────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_requests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT NOT NULL,
  email               TEXT NOT NULL,
  description         TEXT NOT NULL,
  budget              TEXT,
  reference_images    JSONB,
  status              TEXT NOT NULL DEFAULT 'nouvelle'
                      CHECK (status IN ('nouvelle', 'devis_envoyé', 'payée', 'terminée')),
  stripe_payment_link TEXT,
  lang                TEXT NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr', 'en')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_requests_status ON custom_requests (status);

-- ── Sécurité : RLS activé partout (le serveur utilise la clé service) ──
ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images  ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_requests ENABLE ROW LEVEL SECURITY;

-- Lecture publique des produits disponibles + leurs images (boutique).
CREATE POLICY products_public_read ON products
  FOR SELECT USING (status = 'disponible');
CREATE POLICY product_images_public_read ON product_images
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_images.product_id
        AND p.status = 'disponible'
    )
  );

-- ── Maintien automatique de updated_at ─────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_custom_requests_updated ON custom_requests;
CREATE TRIGGER trg_custom_requests_updated
  BEFORE UPDATE ON custom_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 2 : Appliquer le schéma dans Supabase**

Créer un projet Supabase (si pas déjà fait), copier-coller `schema.sql` dans le SQL Editor et l'exécuter.
Expected : 5 tables créées sans erreur. (Étape manuelle hors code — à cocher une fois faite.)

- [ ] **Step 3 : Commit**

```bash
git add schema.sql
git commit -m "feat: complete Supabase schema for v1 (products, images, customers, orders, custom_requests)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13 : README + notes de déploiement Railway

**Files:**
- Create: `README.md`

- [ ] **Step 1 : Écrire `README.md`**

````markdown
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
````

- [ ] **Step 2 : Commit**

```bash
git add README.md
git commit -m "docs: README with setup and deployment notes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (rempli par l'auteur du plan)

**Couverture de la spec (Plan 1 = sections « Fondations » de la spec) :**
- Stack technique (spec §2) → Tasks 0–4. ✅
- Choix paiement (spec §3) → posé en config/clients ; usage réel au Plan 3. ✅ (hors périmètre Plan 1)
- Modèle de données (spec §4) → `schema.sql` complet, Task 12. ✅
- Pages publiques (spec §5) → Accueil/À propos/Contact (Tasks 9–11) ; Boutique/Produit/Sur-mesure/Compte → Plans 2/4/5. ✅
- i18n FR/EN (spec §7) → Tasks 5/6 + layout. ✅
- Style médiéval (spec §8) → Task 7 + skill frontend-design sur Tasks 7–12. ✅
- Images libres de droits (spec §8b) → Task 9 Step 2 + CREDITS.md. ✅

**Scan des placeholders :** la grille « featured » de l'accueil est explicitement temporaire (sera alimentée par la base au Plan 2) — signalé en commentaire, pas un placeholder caché. Aucun « TODO/TBD » non résolu.

**Cohérence des types :** `validateEnv(source, required)` — signature identique entre Task 1 et son usage en Task 4. `createApp()` — défini Task 3, utilisé Tasks 3/4. `registerPageRoutes(app, publicDir)` / `registerContactRoutes(app)` — signatures stables entre Tasks 3, 10, 11. `window.I18N.t/init/setLang/current` — cohérents entre Tasks 6, 8, 11. Noms de colonnes du schéma cohérents avec la spec §4.
