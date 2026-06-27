import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContactMessage, setMessageStatus, MESSAGE_STATUSES } from '../src/lib/contact-messages';

function fakeSb() {
  const inserted: any[] = []; const updates: any[] = [];
  const sb: any = { from(t: string) { return {
    _t: t,
    insert(row: any) { inserted.push({ t: this._t, row }); return { select() { return { single() { return Promise.resolve({ data: { id: 'm-new', ...row }, error: null }); } }; } }; },
    update(p: any) { const u: any = { t: this._t, p }; updates.push(u); return { eq(_c: string, v: any) { u.id = v; return Promise.resolve({ error: null }); } }; },
  }; } };
  return { sb, inserted, updates };
}

test('createContactMessage insère avec statut nouveau', async () => {
  const { sb, inserted } = fakeSb();
  const m = await createContactMessage(sb, { name: 'Marie', email: 'm@m.fr', message: 'Bonjour', lang: 'fr' });
  assert.equal(inserted[0].row.status, 'nouveau');
  assert.equal(inserted[0].row.name, 'Marie');
  assert.equal(m.id, 'm-new');
});

test('setMessageStatus rejette un statut invalide', async () => {
  const { sb } = fakeSb();
  await assert.rejects(() => setMessageStatus(sb, 'm1', 'x' as any));
});

test('setMessageStatus accepte les statuts valides', async () => {
  const { sb, updates } = fakeSb();
  for (const s of MESSAGE_STATUSES) await setMessageStatus(sb, 'm1', s);
  assert.equal(updates.length, MESSAGE_STATUSES.length);
});
