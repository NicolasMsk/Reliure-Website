import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrderFromSession } from '../src/lib/orders';

/**
 * Faux client Supabase enregistrant les inserts et simulant l'unicité de stripe_session_id.
 * `insertError` : si fourni, l'insert dans `orders` renvoie cette erreur (ex. { code: '23505' }).
 */
function fakeSb(existingSessions: string[] = [], insertError: any = null) {
  const inserted: any[] = [];
  const productUpdates: any[] = [];
  const sb: any = {
    from(table: string) {
      return {
        _table: table,
        select() { return this; },
        eq(col: string, val: any) { this._eqCol = col; this._eqVal = val; return this; },
        maybeSingle() {
          if (this._table === 'orders' && this._eqCol === 'stripe_session_id') {
            return Promise.resolve({ data: existingSessions.includes(this._eqVal) ? { id: 'x' } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(row: any) {
          inserted.push({ table: this._table, row });
          return Promise.resolve({ data: null, error: this._table === 'orders' ? insertError : null });
        },
        update(patch: any) { productUpdates.push({ table: this._table, patch, eqCol: undefined }); return { eq(_c: string, _v: any) { productUpdates[productUpdates.length - 1].id = _v; return Promise.resolve({ error: null }); } }; },
      };
    },
  };
  return { sb, inserted, productUpdates };
}

const SESSION = {
  id: 'cs_test_1',
  amount_total: 12800,
  customer_details: { email: 'client@test.fr' },
  shipping_details: { address: { line1: '1 rue X', city: 'Paris', country: 'FR' } },
  metadata: { product_id: 'p1', slug: 'bible-a', lang: 'fr' },
} as any;

test('createOrderFromSession insère la commande et marque le produit vendu', async () => {
  const { sb, inserted, productUpdates } = fakeSb([]);
  const created = await createOrderFromSession(sb, SESSION);
  assert.equal(created, true);
  const order = inserted.find((i) => i.table === 'orders');
  assert.ok(order);
  assert.equal(order.row.stripe_session_id, 'cs_test_1');
  assert.equal(order.row.amount, 128);
  assert.equal(order.row.customer_email, 'client@test.fr');
  assert.equal(order.row.product_id, 'p1');
  assert.equal(order.row.status, 'payée');
  assert.equal(order.row.lang, 'fr');
  const upd = productUpdates.find((u) => u.table === 'products');
  assert.equal(upd.patch.status, 'vendu');
  assert.equal(upd.id, 'p1');
});

test('createOrderFromSession rattache le customer_id depuis metadata', async () => {
  const { sb, inserted } = fakeSb([]);
  const sessionWithCustomer = { ...SESSION, metadata: { ...SESSION.metadata, customer_id: 'cust-9' } } as any;
  await createOrderFromSession(sb, sessionWithCustomer);
  const order = inserted.find((i) => i.table === 'orders');
  assert.equal(order.row.customer_id, 'cust-9');
});

test('createOrderFromSession met customer_id à null si absent', async () => {
  const { sb, inserted } = fakeSb([]);
  await createOrderFromSession(sb, SESSION);
  const order = inserted.find((i) => i.table === 'orders');
  assert.equal(order.row.customer_id, null);
});

test('createOrderFromSession est idempotent (session déjà traitée)', async () => {
  const { sb, inserted } = fakeSb(['cs_test_1']);
  const created = await createOrderFromSession(sb, SESSION);
  assert.equal(created, false);
  assert.equal(inserted.length, 0);
});

test('createOrderFromSession: violation unicité (23505) lors de l\'insert → false, produit non marqué', async () => {
  // SELECT initial ne trouve rien (course concurrente), mais l'insert échoue sur la contrainte UNIQUE.
  const { sb, inserted, productUpdates } = fakeSb([], { code: '23505', message: 'duplicate key' });
  const created = await createOrderFromSession(sb, SESSION);
  assert.equal(created, false);
  // L'insert a bien été tenté mais le produit ne doit PAS être marqué vendu.
  assert.equal(inserted.filter((i) => i.table === 'orders').length, 1);
  assert.equal(productUpdates.filter((u) => u.table === 'products').length, 0);
});
