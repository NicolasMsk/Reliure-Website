import { Express, Request, Response } from 'express';
import express from 'express';
import type Stripe from 'stripe';
import { getStripe, getSupabase, getResend } from '../lib/clients';
import { paymentsConfigured } from '../lib/payments';
import { createOrderFromSession } from '../lib/orders';
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
      if (session.payment_status !== 'paid') {
        // Session non payée (ex. paiement asynchrone en attente) — 200 pour éviter les retries.
        res.json({ received: true });
        return;
      }
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
