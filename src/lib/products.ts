import { SupabaseClient } from '@supabase/supabase-js';

export interface ProductRow {
  id: string;
  slug: string;
  title_fr: string;
  title_en: string;
  description_fr: string | null;
  description_en: string | null;
  price: number;
  category: string | null;
  status: 'brouillon' | 'disponible' | 'vendu';
  weight_grams: number;
  created_at: string;
  updated_at: string;
}

/** Liste les produits disponibles, optionnellement filtrés par catégorie. */
export async function listProducts(sb: SupabaseClient, category?: string): Promise<ProductRow[]> {
  let q = sb.from('products').select('*').eq('status', 'disponible');
  if (category) q = q.eq('category', category);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductRow[];
}

/** Récupère un produit disponible par slug, ou null. */
export async function getProductBySlug(sb: SupabaseClient, slug: string): Promise<ProductRow | null> {
  const { data, error } = await sb
    .from('products').select('*')
    .eq('slug', slug).eq('status', 'disponible')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProductRow) ?? null;
}
