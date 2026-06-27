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
