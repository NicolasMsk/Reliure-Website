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
