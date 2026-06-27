import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listProducts, getProductBySlug } from '../src/lib/products';

/** Faux client Supabase minimal, façonné pour les requêtes utilisées. */
function fakeSupabase(rows: any[]) {
  const builder: any = {
    _filters: {},
    select() { return this; },
    eq(col: string, val: any) { this._filters[col] = val; return this; },
    order() { return this; },
    then(resolve: any) {
      let data = rows;
      if (this._filters.status) data = data.filter((r) => r.status === this._filters.status);
      if (this._filters.category) data = data.filter((r) => r.category === this._filters.category);
      resolve({ data, error: null });
    },
    maybeSingle() {
      let data = rows;
      if (this._filters.slug) data = data.filter((r) => r.slug === this._filters.slug);
      if (this._filters.status) data = data.filter((r) => r.status === this._filters.status);
      return Promise.resolve({ data: data[0] ?? null, error: null });
    },
  };
  return { from() { return builder; } } as any;
}

const ROWS = [
  { id: '1', slug: 'bible-a', title_fr: 'Bible A', category: 'bibles-restaurees', status: 'disponible', price: 200 },
  { id: '2', slug: 'bible-b', title_fr: 'Bible B', category: 'bibles-brodees', status: 'disponible', price: 300 },
  { id: '3', slug: 'brouillon', title_fr: 'Brouillon', category: 'bibles-restaurees', status: 'brouillon', price: 0 },
];

test('listProducts ne renvoie que les produits disponibles', async () => {
  const out = await listProducts(fakeSupabase(ROWS));
  assert.equal(out.length, 2);
  assert.ok(out.every((p) => p.status === 'disponible'));
});

test('listProducts filtre par catégorie', async () => {
  const out = await listProducts(fakeSupabase(ROWS), 'bibles-brodees');
  assert.equal(out.length, 1);
  assert.equal(out[0].slug, 'bible-b');
});

test('getProductBySlug renvoie le produit', async () => {
  const out = await getProductBySlug(fakeSupabase(ROWS), 'bible-a');
  assert.equal(out?.slug, 'bible-a');
});

test('getProductBySlug renvoie null si introuvable', async () => {
  const out = await getProductBySlug(fakeSupabase(ROWS), 'inconnu');
  assert.equal(out, null);
});
