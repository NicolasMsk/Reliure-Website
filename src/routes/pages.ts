import { Express } from 'express';
import path from 'path';

/** Associe une URL propre à un fichier HTML de public/. */
const PAGE_ALIASES: Record<string, string> = {
  '/': 'index.html',
  '/a-propos': 'a-propos.html',
  '/contact': 'contact.html',
  '/faq': 'faq.html',
  '/boutique': 'boutique.html',
};

export function registerPageRoutes(app: Express, publicDir: string): void {
  for (const [route, file] of Object.entries(PAGE_ALIASES)) {
    app.get(route, (_req, res) => {
      res.sendFile(path.join(publicDir, file));
    });
  }
}
