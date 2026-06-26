import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv } from '../src/lib/env';

test('validateEnv retourne la liste des variables manquantes', () => {
  const missing = validateEnv({ STRIPE_SECRET_KEY: 'x' }, ['STRIPE_SECRET_KEY', 'SUPABASE_URL']);
  assert.deepEqual(missing, ['SUPABASE_URL']);
});

test('validateEnv retourne un tableau vide quand tout est présent', () => {
  const missing = validateEnv({ A: '1', B: '2' }, ['A', 'B']);
  assert.deepEqual(missing, []);
});

test('validateEnv considère une chaîne vide comme manquante', () => {
  const missing = validateEnv({ A: '' }, ['A']);
  assert.deepEqual(missing, ['A']);
});
