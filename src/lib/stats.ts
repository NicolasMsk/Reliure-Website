import { SupabaseClient } from '@supabase/supabase-js';

export interface StatsData {
  products: Array<{ id: string; category: string | null; status: string }>;
  orders: Array<{ id: string; amount: number; status: string; created_at: string; customer_email: string | null; product_id: string | null }>;
  customRequests: Array<{ id: string; status: string }>;
  messages: Array<{ id: string; status: string }>;
}

export interface StatsResult {
  revenue_month: number;
  revenue_total: number;
  orders_count: number;
  orders_count_month: number;
  products_available: number;
  products_sold: number;
  products_draft: number;
  by_category: Record<string, number>;
  orders_to_ship: number;
  custom_new: number;
  messages_unread: number;
  recent_sales: Array<{ id: string; amount: number; status: string; created_at: string; customer_email: string | null }>;
}

/** Calcule les agrégats du tableau de bord (pur, testable). `now` injectable. */
export function computeStats(data: StatsData, now: Date = new Date()): StatsResult {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const inMonth = (iso: string) => new Date(iso) >= monthStart;

  const orders = data.orders ?? [];
  const products = data.products ?? [];
  const customRequests = data.customRequests ?? [];
  const messages = data.messages ?? [];

  const by_category: Record<string, number> = {};
  for (const p of products) {
    if (p.status === 'disponible' && p.category) by_category[p.category] = (by_category[p.category] ?? 0) + 1;
  }

  const recent_sales = [...orders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((o) => ({ id: o.id, amount: o.amount, status: o.status, created_at: o.created_at, customer_email: o.customer_email }));

  return {
    revenue_month: orders.filter((o) => inMonth(o.created_at)).reduce((s, o) => s + Number(o.amount || 0), 0),
    revenue_total: orders.reduce((s, o) => s + Number(o.amount || 0), 0),
    orders_count: orders.length,
    orders_count_month: orders.filter((o) => inMonth(o.created_at)).length,
    products_available: products.filter((p) => p.status === 'disponible').length,
    products_sold: products.filter((p) => p.status === 'vendu').length,
    products_draft: products.filter((p) => p.status === 'brouillon').length,
    by_category,
    orders_to_ship: orders.filter((o) => o.status === 'payée').length,
    custom_new: customRequests.filter((c) => c.status === 'nouvelle').length,
    messages_unread: messages.filter((m) => m.status === 'nouveau').length,
    recent_sales,
  };
}

/** Lit les données nécessaires puis calcule les stats. */
export async function getStats(sb: SupabaseClient): Promise<StatsResult> {
  const [products, orders, customRequests, messages] = await Promise.all([
    sb.from('products').select('id, category, status'),
    sb.from('orders').select('id, amount, status, created_at, customer_email, product_id'),
    sb.from('custom_requests').select('id, status'),
    sb.from('contact_messages').select('id, status'),
  ]);
  return computeStats({
    products: (products.data ?? []) as any,
    orders: (orders.data ?? []) as any,
    customRequests: (customRequests.data ?? []) as any,
    messages: (messages.data ?? []) as any,
  });
}
