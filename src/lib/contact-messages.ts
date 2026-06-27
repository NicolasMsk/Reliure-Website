import { SupabaseClient } from '@supabase/supabase-js';

export const MESSAGE_STATUSES = ['nouveau', 'lu'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export interface ContactMessageInput { name: string; email: string; message: string; lang: 'fr' | 'en'; }
export interface ContactMessageRow extends ContactMessageInput { id: string; status: MessageStatus; created_at: string; }

export async function createContactMessage(sb: SupabaseClient, input: ContactMessageInput): Promise<ContactMessageRow> {
  const { data, error } = await sb.from('contact_messages')
    .insert({ name: input.name, email: input.email, message: input.message, lang: input.lang, status: 'nouveau' })
    .select().single();
  if (error) throw new Error(error.message);
  return data as ContactMessageRow;
}

export async function listContactMessages(sb: SupabaseClient): Promise<ContactMessageRow[]> {
  const { data, error } = await sb.from('contact_messages').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ContactMessageRow[];
}

export async function setMessageStatus(sb: SupabaseClient, id: string, status: MessageStatus): Promise<void> {
  if (!MESSAGE_STATUSES.includes(status)) throw new Error(`Statut invalide: ${status}`);
  const { error } = await sb.from('contact_messages').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}
