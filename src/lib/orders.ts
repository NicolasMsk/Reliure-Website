import { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

export interface OrderRow {
  id: string;
  stripe_session_id: string;
  product_id: string | null;
  customer_email: string | null;
  amount: number;
  shipping_address: any;
  status: 'payée' | 'expédiée' | 'livrée';
  lang: 'fr' | 'en';
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
}

/**
 * Crée la commande depuis une session Stripe complétée et marque le produit vendu.
 * Idempotent : ne fait rien si une commande existe déjà pour ce stripe_session_id.
 * Renvoie true si une commande a été créée, false si déjà traitée.
 */
export async function createOrderFromSession(sb: SupabaseClient, session: Stripe.Checkout.Session): Promise<boolean> {
  const { data: existing } = await sb.from('orders').select('id').eq('stripe_session_id', session.id).maybeSingle();
  if (existing) return false;

  const lang = (session.metadata?.lang === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const productId = session.metadata?.product_id ?? null;
  const shipping = (session as any).shipping_details?.address ?? (session as any).customer_details?.address ?? null;

  const { error: insErr } = await sb.from('orders').insert({
    stripe_session_id: session.id,
    product_id: productId,
    customer_email: session.customer_details?.email ?? null,
    amount: (session.amount_total ?? 0) / 100,
    shipping_address: shipping,
    status: 'payée',
    lang,
  });
  if (insErr) {
    if ((insErr as any).code === '23505') return false; // déjà traité (course) — idempotent
    throw new Error(insErr.message);
  }

  if (productId) {
    const { error: updErr } = await sb.from('products').update({ status: 'vendu' }).eq('id', productId);
    if (updErr) console.error('⚠️  produit non marqué vendu', productId, updErr.message);
  }
  return true;
}

/** Liste les commandes (admin), plus récentes d'abord. */
export async function listOrders(sb: SupabaseClient): Promise<OrderRow[]> {
  const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as OrderRow[];
}

/** Met à jour le statut d'une commande (et l'horodatage associé). */
export async function setOrderStatus(sb: SupabaseClient, id: string, status: 'payée' | 'expédiée' | 'livrée'): Promise<void> {
  const patch: Record<string, any> = { status };
  if (status === 'expédiée') patch.shipped_at = new Date().toISOString();
  if (status === 'livrée') patch.delivered_at = new Date().toISOString();
  const { error } = await sb.from('orders').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}
