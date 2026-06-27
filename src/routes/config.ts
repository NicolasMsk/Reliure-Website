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
