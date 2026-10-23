import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFacts, factsErrors, factsForm } from './product-facts';

// The seeded v1 product facts (packages/db seed-content-studio.ts), trimmed.
const V1 = {
  ages: { min: 6, max: 10 },
  modules: [{ key: 'words', name_fr: 'Mots', name_en: 'Words', what: 'Vocabulaire.' }],
  languages: ['fr', 'en'],
  free_tier: { price: '0 FCFA', max_children: 3 },
  paid_offer: null,
  other_facts: ['Hors-ligne.', 'Limites de session.'],
};

test('an untouched form gives back an equal object (no false "unsaved changes")', () => {
  assert.equal(JSON.stringify(buildFacts(V1, factsForm(V1))), JSON.stringify(V1));
  assert.deepEqual(buildFacts({}, factsForm({})), {});
});

test('the paid offer becomes a structured block; other keys are kept', () => {
  const form = { ...factsForm(V1), paid: true, paidName: ' Gabee Famille ', paidPrice: '2 000 FCFA / mois', paidIncludes: 'Enfants illimités\n\n Rapports détaillés ' };
  const out = buildFacts(V1, form);
  assert.deepEqual(out.paid_offer, { name: 'Gabee Famille', price: '2 000 FCFA / mois', includes: ['Enfants illimités', 'Rapports détaillés'] });
  assert.deepEqual(out.modules, V1.modules);
  assert.deepEqual(out.languages, V1.languages);
  // Unticking it again says "no paid offer" (null), so agents never mention one.
  assert.equal(buildFacts(out, { ...factsForm(out), paid: false }).paid_offer, null);
});

test('an emptied block is removed, other facts are one per line', () => {
  const out = buildFacts(V1, { ...factsForm(V1), ageMin: '', ageMax: '', freePrice: '', freeChildren: '', otherFacts: 'Un fait\n  \nDeux faits ' });
  assert.equal('ages' in out, false);
  assert.equal('free_tier' in out, false);
  assert.deepEqual(out.other_facts, ['Un fait', 'Deux faits']);
});

test('a paid offer given as a plain string is read as its name', () => {
  const form = factsForm({ paid_offer: 'Premium' });
  assert.deepEqual([form.paid, form.paidName], [true, 'Premium']);
});

test('factsErrors says what is wrong, in plain words', () => {
  const ok = factsForm(V1);
  assert.deepEqual(factsErrors(ok, 'fr'), { ages: null, freeChildren: null, paid: null });
  assert.match(factsErrors({ ...ok, ageMin: '11' }, 'fr').ages ?? '', /minimum/);
  assert.match(factsErrors({ ...ok, ageMax: '' }, 'fr').ages ?? '', /entre 1 et 18/);
  assert.match(factsErrors({ ...ok, freeChildren: '2.5' }, 'en').freeChildren ?? '', /whole number/);
  assert.match(factsErrors({ ...ok, paid: true, paidName: 'X' }, 'fr').paid ?? '', /nom et le prix/);
});
