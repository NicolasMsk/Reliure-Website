import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../src/lib/stats';

const NOW = new Date('2026-06-15T12:00:00Z');
const thisMonth = '2026-06-10T10:00:00Z';
const lastMonth = '2026-05-10T10:00:00Z';

const DATA = {
  products: [
    { id: 'p1', category: 'bibles-restaurees', status: 'disponible' },
    { id: 'p2', category: 'bibles-brodees', status: 'disponible' },
    { id: 'p3', category: 'bibles-restaurees', status: 'vendu' },
    { id: 'p4', category: 'livres-religieux', status: 'brouillon' },
  ],
  orders: [
    { id: 'o1', amount: 200, status: 'payée', created_at: thisMonth, customer_email: 'a@a.fr', product_id: 'p3' },
    { id: 'o2', amount: 120, status: 'expédiée', created_at: lastMonth, customer_email: 'b@b.fr', product_id: 'p9' },
  ],
  customRequests: [
    { id: 'c1', status: 'nouvelle' }, { id: 'c2', status: 'payée' },
  ],
  messages: [
    { id: 'm1', status: 'nouveau' }, { id: 'm2', status: 'lu' }, { id: 'm3', status: 'nouveau' },
  ],
};

test('computeStats : CA mois vs total', () => {
  const s = computeStats(DATA, NOW);
  assert.equal(s.revenue_month, 200);   // seulement o1 (juin)
  assert.equal(s.revenue_total, 320);   // o1 + o2
});

test('computeStats : comptages stock par statut + par catégorie', () => {
  const s = computeStats(DATA, NOW);
  assert.equal(s.products_available, 2);
  assert.equal(s.products_sold, 1);
  assert.equal(s.products_draft, 1);
  assert.deepEqual(s.by_category['bibles-restaurees'], 1); // disponibles uniquement
  assert.equal(s.by_category['bibles-brodees'], 1);
});

test('computeStats : à-traiter (à expédier, demandes nouvelles, messages non lus)', () => {
  const s = computeStats(DATA, NOW);
  assert.equal(s.orders_to_ship, 1);   // o1 status payée
  assert.equal(s.custom_new, 1);       // c1
  assert.equal(s.messages_unread, 2);  // m1, m3
});

test('computeStats : ventes (compte + récentes)', () => {
  const s = computeStats(DATA, NOW);
  assert.equal(s.orders_count, 2);
  assert.equal(s.recent_sales.length, 2);
  assert.equal(s.recent_sales[0].id, 'o1'); // plus récent d'abord
});

test('computeStats : frontière de mois en UTC', () => {
  const data = { products: [], customRequests: [], messages: [], orders: [
    { id: 'a', amount: 100, status: 'payée', created_at: '2026-06-01T00:30:00Z', customer_email: null, product_id: null },
    { id: 'b', amount: 50,  status: 'payée', created_at: '2026-05-31T23:30:00Z', customer_email: null, product_id: null },
  ]};
  const s = computeStats(data, new Date('2026-06-15T12:00:00Z'));
  assert.equal(s.revenue_month, 100); // a (juin UTC) inclus, b (mai) exclu
  assert.equal(s.revenue_total, 150);
});

test('computeStats : données dégradées (null/absent) ne plante pas', () => {
  const s = computeStats({ products: [{ id: 'x', category: null, status: 'disponible' }], orders: [{ id: 'o', amount: null as any, status: 'payée', created_at: '2026-06-10T10:00:00Z', customer_email: null, product_id: null }], customRequests: [], messages: [] }, new Date('2026-06-15T12:00:00Z'));
  assert.equal(s.revenue_total, 0);
  assert.equal(s.products_available, 1);
  assert.deepEqual(s.by_category, {});
});
