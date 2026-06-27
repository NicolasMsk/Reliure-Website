import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureCustomer, getCustomerOrders } from '../src/lib/customers';

/** Faux client Supabase pour customers + orders. */
function fakeSb(opts: { customer?: any; orders?: any[] } = {}) {
  const inserted: any[] = [];
  const sb: any = {
    from(table: string) {
      const b: any = {
        _table: table, _filters: {}, _or: null,
        select() { return this; },
        eq(c: string, v: any) { this._filters[c] = v; return this; },
        or(expr: string) { this._or = expr; return this; },
        order() { return this; },
        maybeSingle() {
          if (this._table === 'customers') return Promise.resolve({ data: opts.customer ?? null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        insert(row: any) {
          inserted.push({ table: this._table, row });
          return { select() { return { single() { return Promise.resolve({ data: { id: 'cust-new', ...row }, error: null }); } }; } };
        },
        then(resolve: any) {
          // requête liste (orders)
          resolve({ data: opts.orders ?? [], error: null });
        },
      };
      return b;
    },
  };
  return { sb, inserted };
}

const AUTH_USER = { id: 'auth-123', email: 'client@test.fr' };

test('ensureCustomer crée la fiche si absente', async () => {
  const { sb, inserted } = fakeSb({ customer: null });
  const c = await ensureCustomer(sb, AUTH_USER, 'Marie');
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].row.auth_user_id, 'auth-123');
  assert.equal(inserted[0].row.email, 'client@test.fr');
  assert.equal(inserted[0].row.name, 'Marie');
  assert.equal(c.id, 'cust-new');
});

test('ensureCustomer réutilise la fiche existante', async () => {
  const { sb, inserted } = fakeSb({ customer: { id: 'cust-1', auth_user_id: 'auth-123', email: 'client@test.fr' } });
  const c = await ensureCustomer(sb, AUTH_USER);
  assert.equal(inserted.length, 0);
  assert.equal(c.id, 'cust-1');
});

test('getCustomerOrders combine par customer_id et email, dédupliqué', async () => {
  const orders = [
    { id: 'o1', customer_id: 'cust-1', customer_email: 'client@test.fr' },
    { id: 'o1', customer_id: 'cust-1', customer_email: 'client@test.fr' }, // doublon
    { id: 'o2', customer_id: null, customer_email: 'client@test.fr' },
  ];
  const { sb } = fakeSb({ orders });
  const out = await getCustomerOrders(sb, 'cust-1', 'client@test.fr');
  const ids = out.map((o: any) => o.id).sort();
  assert.deepEqual(ids, ['o1', 'o2']);
});
