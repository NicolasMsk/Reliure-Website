import { SupabaseClient } from '@supabase/supabase-js';

export interface AuthUser { id: string; email?: string | null; }
export interface CustomerRow { id: string; auth_user_id: string; name: string | null; email: string | null; created_at: string; }

/** Trouve la fiche customer par auth_user_id, la crée si absente. */
export async function ensureCustomer(sb: SupabaseClient, authUser: AuthUser, name?: string): Promise<CustomerRow> {
  const { data: existing } = await sb.from('customers').select('*').eq('auth_user_id', authUser.id).maybeSingle();
  if (existing) return existing as CustomerRow;
  const { data, error } = await sb.from('customers')
    .insert({ auth_user_id: authUser.id, email: authUser.email ?? null, name: name ?? null })
    .select().single();
  if (error) throw new Error(error.message);
  return data as CustomerRow;
}

/** Commandes du client : par customer_id OU par email (vérifié), dédupliquées par id. */
export async function getCustomerOrders(sb: SupabaseClient, customerId: string, email: string | null): Promise<any[]> {
  let query = sb.from('orders').select('*');
  if (email) query = query.or(`customer_id.eq.${customerId},customer_email.eq.${email}`);
  else query = query.eq('customer_id', customerId);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  const out: any[] = [];
  for (const o of (data ?? [])) { if (!seen.has(o.id)) { seen.add(o.id); out.push(o); } }
  return out;
}
