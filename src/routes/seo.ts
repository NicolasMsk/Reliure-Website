import { Express, Request } from 'express';
import { getSupabase } from '../lib/clients';
import { listProducts } from '../lib/products';

/** Pages statiques indexables (URLs propres). */
const STATIC_PATHS = ['/', '/boutique', '/sur-mesure', '/a-propos', '/contact', '/faq'];

/** Base absolue : APP_URL si défini, sinon déduite de la requête. */
function base(req: Request): string {
  const env = (process.env.APP_URL || '').replace(/\/+$/, '');
  if (env) return env;
  return `${req.protocol}://${req.get('host')}`;
}

export function registerSeoRoutes(app: Express): void {
  app.get('/robots.txt', (req, res) => {
    const b = base(req);
    res.type('text/plain').send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /compte',
        'Disallow: /merci',
        'Disallow: /api/',
        `Sitemap: ${b}/sitemap.xml`,
        '',
      ].join('\n'),
    );
  });

  app.get('/sitemap.xml', async (req, res) => {
    const b = base(req);
    const urls: { loc: string; lastmod?: string }[] = STATIC_PATHS.map((p) => ({ loc: b + p }));

    // Produits disponibles (best-effort : si Supabase indispo, sitemap = pages statiques).
    try {
      const products = await listProducts(getSupabase());
      for (const p of products) {
        urls.push({ loc: `${b}/produit/${p.slug}`, lastmod: p.updated_at });
      }
    } catch {
      /* pas de produits dans le sitemap si la base est indisponible */
    }

    const body = urls
      .map((u) => {
        const lastmod = u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : '';
        return `  <url><loc>${u.loc}</loc>${lastmod}</url>`;
      })
      .join('\n');

    res
      .type('application/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
  });
}
