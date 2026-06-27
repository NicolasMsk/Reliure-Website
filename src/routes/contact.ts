import { Express, Request, Response } from 'express';
import { getResend } from '../lib/clients';
import { EMAIL_FROM, CONTACT_TO } from '../config';

interface ContactBody {
  name?: string;
  email?: string;
  message?: string;
}

export function registerContactRoutes(app: Express): void {
  app.post('/api/contact', async (req: Request, res: Response): Promise<void> => {
    const { name, email, message } = req.body as ContactBody;

    if (!name || !email || !message) {
      res.status(400).json({ error: 'Champs obligatoires manquants.' });
      return;
    }
    if (!CONTACT_TO) {
      console.error('❌  CONTACT_TO non configuré.');
      res.status(500).json({ error: 'Configuration serveur incomplète.' });
      return;
    }

    try {
      await getResend().emails.send({
        from: EMAIL_FROM,
        to: CONTACT_TO,
        replyTo: email,
        subject: `📩 Nouveau message — ${name}`,
        html: `<p><strong>De :</strong> ${name} (${email})</p><p>${String(message).replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`,
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error('⚠️  Échec envoi contact :', err.message);
      res.status(502).json({ error: 'Envoi impossible. Réessayez plus tard.' });
    }
  });
}
