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

  // Assets avec cache — UNIQUEMENT en production. En dev, pas de cache long
  // (sinon le navigateur sert d'anciens JS/CSS après une modification).
  const cssJsMaxAge = IS_PRODUCTION ? '7d' : 0;
  const i18nMaxAge = IS_PRODUCTION ? '1d' : 0;
  const imgMaxAge = IS_PRODUCTION ? '30d' : 0;
  app.use('/css', express.static(path.join(PUBLIC_DIR, 'css'), { maxAge: cssJsMaxAge }));
  app.use('/js', express.static(path.join(PUBLIC_DIR, 'js'), { maxAge: cssJsMaxAge }));
  app.use('/i18n', express.static(path.join(PUBLIC_DIR, 'i18n'), { maxAge: i18nMaxAge }));
  app.use('/images', express.static(path.join(PUBLIC_DIR, 'images'), { maxAge: imgMaxAge }));

  // HTML restant (sans cache)
  app.use(express.static(PUBLIC_DIR, { redirect: false }));

  return app;
}
