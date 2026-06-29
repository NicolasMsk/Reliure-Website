import express, { Express, Request, Response } from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cookieSession from 'cookie-session';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { IS_PRODUCTION } from './config';
import { registerPageRoutes } from './routes/pages';
import { registerContactRoutes } from './routes/contact';
import { registerProductRoutes } from './routes/products';
import { registerAdminRoutes } from './routes/admin';
import { registerCheckoutRoutes } from './routes/checkout';
import { registerStripeWebhook } from './routes/stripe-webhook';
import { registerConfigRoute } from './routes/config';
import { registerAccountRoutes } from './routes/account';
import { registerCustomRoutes } from './routes/custom';
import { registerConsentRoute } from './routes/consent';

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
  // Webhook Stripe — corps brut, AVANT express.json()
  registerStripeWebhook(app);

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
      // SESSION_SECRET est requis au démarrage via server.ts (validateEnv) ;
      // le fallback 'dev-test-insecure' est donc inatteignable en production et
      // n'existe que pour les tests qui construisent createApp() sans cet env.
      keys: [process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || 'dev-test-insecure'],
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
  registerProductRoutes(app);
  registerAdminRoutes(app);
  registerCheckoutRoutes(app);
  registerConfigRoute(app);
  registerAccountRoutes(app);
  registerCustomRoutes(app);
  registerConsentRoute(app);

  // Cache des assets.
  // CSS/JS/i18n : maxAge 0 → le navigateur REVALIDE à chaque chargement (via ETag).
  //   Comme ces fichiers changent à chaque déploiement sans changer de nom,
  //   cela garantit qu'aucune version périmée n'est servie (réponses 304 si inchangé).
  // Images : cache court (1 j en prod) — elles changent rarement, et restent légères à revalider.
  const imgMaxAge = IS_PRODUCTION ? '1d' : 0;
  app.use('/css', express.static(path.join(PUBLIC_DIR, 'css'), { maxAge: 0 }));
  app.use('/js', express.static(path.join(PUBLIC_DIR, 'js'), { maxAge: 0 }));
  app.use('/i18n', express.static(path.join(PUBLIC_DIR, 'i18n'), { maxAge: 0 }));
  app.use('/images', express.static(path.join(PUBLIC_DIR, 'images'), { maxAge: imgMaxAge }));

  // HTML restant (sans cache)
  app.use(express.static(PUBLIC_DIR, { redirect: false }));

  return app;
}
