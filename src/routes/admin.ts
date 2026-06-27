import { Express, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { getSupabase } from '../lib/clients';
import { slugify } from '../lib/slug';
import { isAllowedImage, uploadProductImage, deleteStorageObject } from '../lib/storage';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.admin) { next(); return; }
  res.status(401).json({ error: 'Non autorisé.' });
}

/** Génère un slug unique (suffixe -2, -3… si collision). */
async function uniqueSlug(base: string): Promise<string> {
  const sb = getSupabase();
  let slug = base || 'piece';
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await sb.from('products').select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
    n += 1; slug = `${base}-${n}`;
  }
}

export function registerAdminRoutes(app: Express): void {
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Trop de tentatives. Réessayez plus tard.' } });

  app.post('/api/admin/login', loginLimiter, (req: Request, res: Response): void => {
    const { password } = req.body as { password?: string };
    if (password && password === process.env.ADMIN_PASSWORD) {
      req.session!.admin = true; res.json({ success: true });
    } else { res.status(401).json({ error: 'Mot de passe incorrect.' }); }
  });

  app.post('/api/admin/logout', (req: Request, res: Response): void => {
    req.session = null; res.json({ success: true });
  });

  app.get('/api/admin/me', (req: Request, res: Response): void => {
    res.json({ admin: !!req.session?.admin });
  });

  // Liste complète (tous statuts)
  app.get('/api/admin/products', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    const { data, error } = await getSupabase().from('products').select('*').order('created_at', { ascending: false });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data ?? []);
  });

  // Créer
  app.post('/api/admin/products', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const b = req.body as any;
    if (!b.title_fr || !b.title_en) { res.status(400).json({ error: 'Titre FR et EN requis.' }); return; }
    const slug = await uniqueSlug(slugify(b.title_fr));
    const row = {
      slug,
      title_fr: b.title_fr, title_en: b.title_en,
      description_fr: b.description_fr ?? null, description_en: b.description_en ?? null,
      price: Number(b.price) || 0,
      category: b.category ?? null,
      status: ['brouillon', 'disponible', 'vendu'].includes(b.status) ? b.status : 'brouillon',
      weight_grams: Number(b.weight_grams) || 500,
    };
    const { data, error } = await getSupabase().from('products').insert(row).select().single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data);
  });

  // Modifier
  app.patch('/api/admin/products/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const b = req.body as any;
    const patch: Record<string, any> = {};
    for (const k of ['title_fr', 'title_en', 'description_fr', 'description_en', 'category']) if (k in b) patch[k] = b[k];
    if ('price' in b) patch.price = Number(b.price) || 0;
    if ('weight_grams' in b) patch.weight_grams = Number(b.weight_grams) || 500;
    if ('status' in b && ['brouillon', 'disponible', 'vendu'].includes(b.status)) patch.status = b.status;
    const { data, error } = await getSupabase().from('products').update(patch).eq('id', req.params.id).select().single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data);
  });

  // Supprimer (images Storage incluses)
  app.delete('/api/admin/products/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const sb = getSupabase();
    const { data: imgs } = await sb.from('product_images').select('storage_path').eq('product_id', req.params.id);
    for (const im of imgs ?? []) { try { await deleteStorageObject(im.storage_path); } catch { /* best effort */ } }
    const { error } = await sb.from('products').delete().eq('id', req.params.id);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ success: true });
  });

  // Upload image
  app.post('/api/admin/products/:id/images', requireAdmin, upload.single('image'), async (req: Request, res: Response): Promise<void> => {
    const file = (req as any).file as { buffer: Buffer; mimetype: string; originalname: string } | undefined;
    if (!file) { res.status(400).json({ error: 'Aucun fichier.' }); return; }
    if (!isAllowedImage(file.mimetype)) { res.status(400).json({ error: 'Format non autorisé (jpeg/png/webp).' }); return; }
    const sb = getSupabase();
    const { data: existing } = await sb.from('product_images').select('id').eq('product_id', req.params.id);
    const index = (existing?.length ?? 0);
    const ext = (file.originalname.split('.').pop() || 'jpg');
    try {
      const storagePath = await uploadProductImage(req.params.id, file.buffer, file.mimetype, ext, index);
      const { data, error } = await sb.from('product_images')
        .insert({ product_id: req.params.id, storage_path: storagePath, sort_order: index }).select().single();
      if (error) { res.status(500).json({ error: error.message }); return; }
      res.json(data);
    } catch (err: any) { res.status(502).json({ error: err.message }); }
  });

  // Supprimer une image
  app.delete('/api/admin/images/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const sb = getSupabase();
    const { data: img } = await sb.from('product_images').select('storage_path').eq('id', req.params.id).maybeSingle();
    if (img) { try { await deleteStorageObject(img.storage_path); } catch { /* best effort */ } }
    const { error } = await sb.from('product_images').delete().eq('id', req.params.id);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ success: true });
  });
}
