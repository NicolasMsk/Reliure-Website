import { SupabaseClient } from '@supabase/supabase-js';

export const VALID_STATUSES = ['nouvelle', 'devis_envoyé', 'payée', 'terminée'] as const;
export type CustomStatus = (typeof VALID_STATUSES)[number];

export interface CustomRequestInput {
  name: string; email: string; description: string;
  budget?: string | null; reference_images?: string[]; lang: 'fr' | 'en';
  phone?: string | null;
}

export interface CustomRequestRow {
  id: string; name: string; email: string; description: string;
  budget: string | null; reference_images: string[] | null;
  status: CustomStatus; stripe_payment_link: string | null;
  lang: 'fr' | 'en'; created_at: string; updated_at: string;
}

export async function createCustomRequest(sb: SupabaseClient, input: CustomRequestInput): Promise<CustomRequestRow> {
  const { data, error } = await sb.from('custom_requests').insert({
    name: input.name, email: input.email, description: input.description,
    budget: input.budget ?? null, reference_images: input.reference_images ?? [],
    phone: input.phone ?? null,
    status: 'nouvelle', lang: input.lang,
  }).select().single();
  if (error) throw new Error(error.message);
  return data as CustomRequestRow;
}

export async function listCustomRequests(sb: SupabaseClient): Promise<CustomRequestRow[]> {
  const { data, error } = await sb.from('custom_requests').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomRequestRow[];
}

export async function getCustomRequest(sb: SupabaseClient, id: string): Promise<CustomRequestRow | null> {
  const { data, error } = await sb.from('custom_requests').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CustomRequestRow) ?? null;
}

export async function setCustomRequestStatus(sb: SupabaseClient, id: string, status: CustomStatus): Promise<void> {
  if (!VALID_STATUSES.includes(status)) throw new Error(`Statut invalide: ${status}`);
  const { error } = await sb.from('custom_requests').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function attachPaymentLink(sb: SupabaseClient, id: string, url: string): Promise<void> {
  const { error } = await sb.from('custom_requests').update({ stripe_payment_link: url, status: 'devis_envoyé' }).eq('id', id);
  if (error) throw new Error(error.message);
}
