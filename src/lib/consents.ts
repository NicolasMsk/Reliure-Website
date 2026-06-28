import { SupabaseClient } from '@supabase/supabase-js';

export interface ConsentInput { email?: string | null; customer_id?: string | null; consent_type: string; granted?: boolean; }

/** Journalise un consentement (RGPD). Best-effort côté appelant. */
export async function recordConsent(sb: SupabaseClient, input: ConsentInput): Promise<void> {
  const { error } = await sb.from('consents').insert({
    email: input.email ?? null,
    customer_id: input.customer_id ?? null,
    consent_type: input.consent_type,
    granted: input.granted ?? true,
  });
  if (error) throw new Error(error.message);
}
