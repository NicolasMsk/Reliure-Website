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
        phone: c.phone ?? '', address_line1: c.address_line1 ?? '',
        address_line2: c.address_line2 ?? '', postal_code: c.postal_code ?? '',
        city: c.city ?? '', country: c.country ?? '',
      });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch('/api/account/me', requireUser, async (req: AuthedRequest, res: Response): Promise<void> => {
    const b = req.body as any;
    const patch: Record<string, any> = {};
    const set = (k: string, n: number) => { if (typeof b[k] === 'string') patch[k] = b[k].trim().slice(0, n); };
    set('name', 200); set('phone', 40); set('address_line1', 200); set('address_line2', 200);
    set('postal_code', 20); set('city', 120); set('country', 80);
    try {
      const c = await ensureCustomer(getSupabase(), req.authUser!);
      if (Object.keys(patch).length > 0) {
        const { error } = await getSupabase().from('customers').update(patch).eq('id', c.id);
        if (error) { res.status(500).json({ error: error.message }); return; }
      }
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
