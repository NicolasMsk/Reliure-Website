import { getSupabase } from './clients';

const BUCKET = 'product-images';
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export function isAllowedImage(mime: string): boolean {
  return ALLOWED.includes(mime);
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
