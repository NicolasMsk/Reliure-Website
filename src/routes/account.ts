import { Express, Request, Response, NextFunction } from 'express';
import { getSupabase } from '../lib/clients';
import { ensureCustomer, getCustomerOrders, AuthUser } from '../lib/customers';

interface AuthedRequest extends Request { authUser?: AuthUser; }

/** Vérifie le JWT Supabase (Authorization: Bearer ...) côté serveur. */
async function requireUser(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) { res.status(401).json({ error: 'Non authentifié.' }); return; }
  try {
    const { data, error } = await getSupabase().auth.getUser(token);
    if (error || !data?.user) { res.status(401).json({ error: 'Session invalide.' }); return; }
    req.authUser = { id: data.user.id, email: data.user.email };
    next();
  } catch {
    res.status(401).json({ error: 'Session invalide.' });
  }
}

export function registerAccountRoutes(app: Express): void {
  app.get('/api/account/me', requireUser, async (req: AuthedRequest, res: Response): Promise<void> => {
    try {
      const c = await ensureCustomer(getSupabase(), req.authUser!);
      res.json({
        email: c.email, name: c.name,
        phone: (c as any).phone ?? '', address_line1: (c as any).address_line1 ?? '',
        address_line2: (c as any).address_line2 ?? '', postal_code: (c as any).postal_code ?? '',
        city: (c as any).city ?? '', country: (c as any).country ?? '',
      });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch('/api/account/me', requireUser, async (req: AuthedRequest, res: Response): Promise<void> => {
    const b = req.body as any;
    const str = (v: any, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : null);
    const patch: Record<string, any> = {
      name: str(b.name, 200),
      phone: str(b.phone, 40),
      address_line1: str(b.address_line1, 200),
      address_line2: str(b.address_line2, 200),
      postal_code: str(b.postal_code, 20),
      city: str(b.city, 120),
      country: str(b.country, 80),
    };
    try {
      const c = await ensureCustomer(getSupabase(), req.authUser!);
      const { error } = await getSupabase().from('customers').update(patch).eq('id', c.id);
      if (error) { res.status(500).json({ error: error.message }); return; }
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/account/orders', requireUser, async (req: AuthedRequest, res: Response): Promise<void> => {
    try {
      const sb = getSupabase();
      const c = await ensureCustomer(sb, req.authUser!);
      const orders = await getCustomerOrders(sb, c.id, req.authUser!.email ?? null);
      res.json(orders);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
}
