import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/lib/slug';

test('slugify met en minuscules et remplace les espaces', () => {
  assert.equal(slugify('Bible Brodée Or'), 'bible-brodee-or');
});
test('slugify retire les accents', () => {
  assert.equal(slugify('Évangéliaire ancien'), 'evangeliaire-ancien');
});
test('slugify supprime la ponctuation', () => {
  assert.equal(slugify('Missel (XIXe) — n°3'), 'missel-xixe-n-3');
});
test('slugify gère les tirets multiples et bords', () => {
  assert.equal(slugify('  --Bible---A--  '), 'bible-a');
});
