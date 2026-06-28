import { Express, Request, Response } from 'express';
import { getResend, getSupabase } from '../lib/clients';
import { createContactMessage } from '../lib/contact-messages';
import { EMAIL_FROM, CONTACT_TO } from '../config';

interface ContactBody {
  name?: string;
  email?: string;
  message?: string;
}

/** Échappe les caractères HTML dangereux pour éviter toute injection. */
const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function registerContactRoutes(app: Express): void {
  app.post('/api/contact', async (req: Request, res: Response): Promise<void> => {
    const { name, email, message } = req.body as ContactBody;

    if (!name || !email || !message) {
      res.status(400).json({ error: 'Champs obligatoires manquants.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Adresse email invalide.' });
      return;
    }
    if (!CONTACT_TO) {
      console.error('❌  CONTACT_TO non configuré.');
      res.status(500).json({ error: 'Configuration serveur incomplète.' });
      return;
    }

    // Empêche l'injection d'en-têtes via le nom dans le sujet (CR/LF).
    const safeName = name.replace(/[\r\n]+/g, ' ').trim();
    const lang = ((req.body as any)?.lang === 'en' ? 'en' : 'fr') as 'fr' | 'en';

    // Persister d'abord (rien n'est perdu même si l'email échoue)
    try {
      await createContactMessage(getSupabase(), { name, email, message, lang });
    } catch (e: any) {
      console.error('⚠️  Persistance message contact:', e.message);
    }

    try {
      const { error } = await getResend().emails.send({
        from: EMAIL_FROM,
        to: CONTACT_TO,
        replyTo: email,
        subject: `📩 Nouveau message — ${safeName}`,
        html: `<p><strong>De :</strong> ${esc(name)} (${esc(email)})</p><p>${esc(message).replace(/\n/g, '<br>')}</p>`,
      });
      if (error) {
        console.error('⚠️  Resend a renvoyé une erreur :', error);
        res.status(502).json({ error: 'Envoi impossible. Réessayez plus tard.' });
        return;
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error('⚠️  Échec envoi contact :', err.message);
      res.status(502).json({ error: 'Envoi impossible. Réessayez plus tard.' });
    }
  });
}
