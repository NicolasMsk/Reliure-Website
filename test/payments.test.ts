import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentsConfigured, buildLineItem, buildShippingOptions } from '../src/lib/payments';

test('paymentsConfigured: false si clé factice ou absente', () => {
  assert.equal(paymentsConfigured({ STRIPE_SECRET_KEY: 'sk_test_dummy', STRIPE_WEBHOOK_SECRET: 'whsec_dummy' }), false);
  assert.equal(paymentsConfigured({}), false);
  assert.equal(paymentsConfigured({ STRIPE_SECRET_KEY: 'sk_live_abc' }), false); // webhook manquant
});

test('paymentsConfigured: true si clés réelles présentes', () => {
  assert.equal(paymentsConfigured({ STRIPE_SECRET_KEY: 'sk_test_51abc', STRIPE_WEBHOOK_SECRET: 'whsec_realKey123' }), true);
});

test('buildLineItem: unit_amount en centimes, nom selon langue', () => {
  const li = buildLineItem({ title_fr: 'Bible', title_en: 'Bible EN', price: 120 } as any, 'fr');
  assert.equal(li.price_data.currency, 'eur');
  assert.equal(li.price_data.unit_amount, 12000);
  assert.equal(li.price_data.product_data.name, 'Bible');
  assert.equal(li.quantity, 1);
  const liEn = buildLineItem({ title_fr: 'Bible', title_en: 'Bible EN', price: 120 } as any, 'en');
  assert.equal(liEn.price_data.product_data.name, 'Bible EN');
});

test('buildShippingOptions: une option par tarif, montant en centimes', () => {
  const opts = buildShippingOptions('fr');
  assert.equal(opts.length, 3);
  assert.equal(opts[0].shipping_rate_data.fixed_amount.amount, 800);
  assert.equal(opts[0].shipping_rate_data.fixed_amount.currency, 'eur');
  assert.equal(opts[0].shipping_rate_data.display_name, 'France');
});
