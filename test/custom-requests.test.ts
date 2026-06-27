import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCustomRequest, setCustomRequestStatus, VALID_STATUSES } from '../src/lib/custom-requests';

function fakeSb() {
  const inserted: any[] = [];
  const updates: any[] = [];
  const sb: any = {
    from(table: string) {
      return {
        _table: table,
        insert(row: any) { inserted.push({ table: this._table, row }); return { select() { return { single() { return Promise.resolve({ data: { id: 'cr-new', ...row }, error: null }); } }; } }; },
        update(patch: any) { const u: any = { table: this._table, patch }; updates.push(u); return { eq(_c: string, v: any) { u.id = v; return Promise.resolve({ error: null }); } }; },
      };
    },
  };
  return { sb, inserted, updates };
}

test('createCustomRequest insère les champs et le statut nouvelle', async () => {
  const { sb, inserted } = fakeSb();
  const r = await createCustomRequest(sb, {
    name: 'Marie', email: 'marie@test.fr', description: 'Restaurer une bible',
    budget: '300-500€', reference_images: ['cr-1/a.jpg'], lang: 'fr',
  });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].row.name, 'Marie');
  assert.equal(inserted[0].row.email, 'marie@test.fr');
  assert.equal(inserted[0].row.status, 'nouvelle');
  assert.deepEqual(inserted[0].row.reference_images, ['cr-1/a.jpg']);
  assert.equal(r.id, 'cr-new');
});

test('setCustomRequestStatus rejette un statut invalide', async () => {
  const { sb } = fakeSb();
  await assert.rejects(() => setCustomRequestStatus(sb, 'cr-1', 'n_importe_quoi' as any));
});

test('setCustomRequestStatus accepte les statuts valides', async () => {
  const { sb, updates } = fakeSb();
  for (const s of VALID_STATUSES) {
    await setCustomRequestStatus(sb, 'cr-1', s);
  }
  assert.equal(updates.length, VALID_STATUSES.length);
  assert.equal(updates[0].patch.status, VALID_STATUSES[0]);
});
