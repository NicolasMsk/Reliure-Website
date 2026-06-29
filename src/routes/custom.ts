import { Express, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { getResend } from '../lib/clients';
import { getSupabase } from '../lib/clients';
import { isAllowedImage, uploadReference } from '../lib/storage';
import { createCustomRequest } from '../lib/custom-requests';
import { EMAIL_FROM, ORDER_NOTIFY_EMAIL } from '../config';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedImage(file.mimetype)) cb(null, true);
    else cb(new Error('BAD_MIME'));
  },
});

/** Enveloppe multer : transforme toute MulterError (taille, nombre, MIME) en 400 JSON propre. */
function uploadImages(req: Request, res: Response, next: NextFunction): void {
  upload.array('images', 3)(req, res, (err: any) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image trop volumineuse (max 5 Mo).'
        : (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') ? 'Trop de fichiers (max 3).'
        : err.message === 'BAD_MIME' ? 'Format d\'image non autorisé (jpeg/png/webp).'
        : 'Fichier invalide.';
      res.status(400).json({ error: msg });
      return;
    }
    next();
  });
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function registerCustomRoutes(app: Express): void {
  const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Trop de demandes. Réessayez plus tard.' } });

  app.post('/api/custom-request', limiter, uploadImages, async (req: Request, res: Response): Promise<void> => {
    const b = req.body as any;
    // Honeypot : si rempli, bot → succès silencieux sans rien enregistrer
    if (b.website) { res.json({ success: true }); return; }

    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 200) : '';
    const email = typeof b.email === 'string' ? b.email.trim().slice(0, 200) : '';
    const description = typeof b.description === 'string' ? b.description.trim().slice(0, 5000) : '';
    const budget = typeof b.budget === 'string' ? b.budget.trim().slice(0, 100) : '';
    const phone = typeof b.phone === 'string' ? b.phone.trim().slice(0, 40) : '';
    const lang = b.lang === 'en' ? 'en' : 'fr';

    if (!name || !description) { res.status(400).json({ error: 'Champs obligatoires manquants.' }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: 'Adresse email invalide.' }); return; }

    const files = ((req as any).files as Array<{ buffer: Buffer; mimetype: string; originalname: string }>) || [];
    for (const f of files) {
      if (!isAllowedImage(f.mimetype)) { res.status(400).json({ error: 'Format d\'image non autorisé (jpeg/png/webp).' }); return; }
    }

    try {
      const sb = getSupabase();
      // 1. Créer la demande (sans images) pour obtenir l'id
      const created = await createCustomRequest(sb, { name, email, description, budget, phone, reference_images: [], lang });
      // 2. Uploader les photos, rattacher les chemins
      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const ext = (files[i].originalname.split('.').pop() || 'jpg');
        try { paths.push(await uploadReference(created.id, files[i].buffer, files[i].mimetype, ext, i)); }
        catch (e: any) { console.error('upload référence', e.message); }
      }
      if (paths.length) {
        await sb.from('custom_requests').update({ reference_images: paths }).eq('id', created.id);
      }
      // 3. Email best-effort à l'artisane
      if (ORDER_NOTIFY_EMAIL) {
        try {
          await getResend().emails.send({
            from: EMAIL_FROM, to: ORDER_NOTIFY_EMAIL,
            subject: `🎨 Nouvelle demande sur-mesure — ${esc(name)}`,
            html: `<p><strong>${esc(name)}</strong> (${esc(email)})</p><p>Téléphone : ${esc(phone) || '—'}</p><p>Budget : ${esc(budget) || '—'}</p><p>${esc(description).replace(/\n/g, '<br>')}</p><p>${paths.length} photo(s) jointe(s).</p>`,
          });
        } catch (e: any) { console.error('email sur-mesure', e.message); }
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error('POST /api/custom-request', err.message);
      res.status(500).json({ error: 'Erreur lors de l\'envoi. Réessayez.' });
    }
  });
}
