import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureCustomer, getCustomerOrders } from '../src/lib/customers';

/**
 * Faux client Supabase pour customers + orders.
 * - `customer` : fiche renvoyée par le SELECT initial sur `customers`.
 * - `insertError` : si fourni, l'insert dans `customers` renvoie cette erreur (ex. { code: '23505' }).
 * - `customerAfterInsert` : fiche renvoyée par le SELECT de récupération après une erreur d'insert (course 23505).
 */
function fakeSb(opts: { customer?: any; orders?: any[]; insertError?: any; customerAfterInsert?: any } = {}) {
  const inserted: any[] = [];
  let customersSelectCalls = 0;
  const sb: any = {
    from(table: string) {
      const b: any = {
        _table: table, _filters: {}, _or: null,
        select() { return this; },
        eq(c: string, v: any) { this._filters[c] = v; return this; },
        or(expr: string) { this._or = expr; return this; },
        order() { return this; },
        maybeSingle() {
          if (this._table === 'customers') {
            customersSelectCalls += 1;
            // 1er SELECT = fiche initiale ; SELECT suivant = récupération post-23505.
            const data = customersSelectCalls === 1 ? (opts.customer ?? null) : (opts.customerAfterInsert ?? null);
            return Promise.resolve({ data, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(row: any) {
          inserted.push({ table: this._table, row });
          if (this._table === 'customers' && opts.insertError) {
            return { select() { return { single() { return Promise.resolve({ data: null, error: opts.insertError }); } }; } };
          }
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

test('ensureCustomer relit la fiche existante sur course 23505', async () => {
  // SELECT initial ne trouve rien, l'insert échoue sur la contrainte UNIQUE,
  // puis le SELECT de récupération renvoie la fiche créée par la requête concurrente.
  const { sb, inserted } = fakeSb({
    customer: null,
    insertError: { code: '23505', message: 'duplicate key' },
    customerAfterInsert: { id: 'cust-race', auth_user_id: 'auth-123', email: 'client@test.fr' },
  });
  const c = await ensureCustomer(sb, AUTH_USER, 'Marie');
  assert.equal(inserted.length, 1); // l'insert a bien été tenté une fois
  assert.equal(c.id, 'cust-race');
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

test('getCustomerOrders gère un email contenant une virgule (filtre .or quoté)', async () => {
  // Email "trusted but unescaped" avec virgule/points : le filtre .or doit le citer entre guillemets.
  const trickyEmail = 'a,b(c).d@test.fr';
  let capturedOr: string | null = null;
  const sb: any = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        or(expr: string) { capturedOr = expr; return this; },
        order() { return this; },
        then(resolve: any) { resolve({ data: [], error: null }); },
      };
    },
  };
  const out = await getCustomerOrders(sb, 'cust-1', trickyEmail);
  assert.deepEqual(out, []);
  assert.ok(capturedOr, 'le filtre .or doit avoir été construit');
  assert.ok(capturedOr!.includes(`customer_email.eq."${trickyEmail}"`), `email non quoté : ${capturedOr}`);
});
