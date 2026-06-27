import { getSupabase } from './clients';

const BUCKET = 'product-images';
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export function isAllowedImage(mime: string): boolean {
  return ALLOWED.includes(mime);
}

/** URL publique d'un objet du bucket Storage product-images. */
export function publicUrl(storagePath: string): string {
  const base = process.env.SUPABASE_URL!.replace(/\/$/, '');
  return `${base}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

/** Téléverse un buffer image, renvoie le storage_path. */
export async function uploadProductImage(
  productId: string, buffer: Buffer, mime: string, ext: string, index: number,
): Promise<string> {
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const path = `${productId}/${Date.now()}-${index}.${safeExt}`;
  const { error } = await getSupabase().storage.from(BUCKET).upload(path, buffer, {
    contentType: mime, upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

/** Supprime un objet du bucket. */
export async function deleteStorageObject(storagePath: string): Promise<void> {
  const { error } = await getSupabase().storage.from(BUCKET).remove([storagePath]);
  if (error) throw new Error(error.message);
}

const REFERENCES_BUCKET = 'custom-references';

/** Téléverse une photo de référence (bucket privé), renvoie le storage_path. */
export async function uploadReference(requestId: string, buffer: Buffer, mime: string, ext: string, index: number): Promise<string> {
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const path = `${requestId}/${Date.now()}-${index}.${safeExt}`;
  const { error } = await getSupabase().storage.from(REFERENCES_BUCKET).upload(path, buffer, { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** URL signée temporaire pour un objet d'un bucket (lecture privée). */
export async function signedReferenceUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const { data, error } = await getSupabase().storage.from(REFERENCES_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
