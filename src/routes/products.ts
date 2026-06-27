import { Express, Request, Response } from 'express';
import { getSupabase } from '../lib/clients';
import { listProducts, getProductBySlug } from '../lib/products';

/** URL publique d'un objet du bucket Storage product-images. */
function imageUrl(storagePath: string): string {
  const base = process.env.SUPABASE_URL!.replace(/\/$/, '');
  return `${base}/storage/v1/object/public/product-images/${storagePath}`;
}

export function registerProductRoutes(app: Express): void {
  // Liste (avec 1ère image)
  app.get('/api/products', async (req: Request, res: Response): Promise<void> => {
    try {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const sb = getSupabase();
      const products = await listProducts(sb, category);
      // 1ère image de chaque produit
      const ids = products.map((p) => p.id);
      let imagesByProduct: Record<string, string> = {};
      if (ids.length) {
        const { data: imgs } = await sb
          .from('product_images').select('product_id, storage_path, sort_order')
          .in('product_id', ids).order('sort_order', { ascending: true });
        for (const im of imgs ?? []) {
          if (!(im.product_id in imagesByProduct)) imagesByProduct[im.product_id] = imageUrl(im.storage_path);
        }
      }
      res.json(products.map((p) => ({ ...p, image_url: imagesByProduct[p.id] || null })));
    } catch (err: any) {
      console.error('GET /api/products', err.message);
      res.status(500).json({ error: 'Erreur de chargement des produits.' });
    }
  });

  // Détail + toutes les images
  app.get('/api/products/:slug', async (req: Request, res: Response): Promise<void> => {
    try {
      const sb = getSupabase();
      const product = await getProductBySlug(sb, req.params.slug);
      if (!product) { res.status(404).json({ error: 'Produit introuvable.' }); return; }
      const { data: imgs } = await sb
        .from('product_images').select('storage_path, alt_fr, alt_en, sort_order')
        .eq('product_id', product.id).order('sort_order', { ascending: true });
      const images = (imgs ?? []).map((im) => ({ url: imageUrl(im.storage_path), alt_fr: im.alt_fr, alt_en: im.alt_en }));
      res.json({ ...product, images });
    } catch (err: any) {
      console.error('GET /api/products/:slug', err.message);
      res.status(500).json({ error: 'Erreur de chargement du produit.' });
    }
  });
}
