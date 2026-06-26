import { test } from 'node:test';
import assert from 'node:assert/strict';
import fr from '../public/i18n/fr.json';
import en from '../public/i18n/en.json';

function keys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort();
}

test('fr.json et en.json ont exactement les mêmes clés', () => {
  assert.deepEqual(keys(fr as any), keys(en as any));
});

test('aucune valeur de traduction n\'est vide', () => {
  for (const [k, v] of Object.entries(fr as Record<string, string>)) {
    assert.ok(v && v.trim().length > 0, `fr.${k} est vide`);
  }
  for (const [k, v] of Object.entries(en as Record<string, string>)) {
    assert.ok(v && v.trim().length > 0, `en.${k} est vide`);
  }
});
