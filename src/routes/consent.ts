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
