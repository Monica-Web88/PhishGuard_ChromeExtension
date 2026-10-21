import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDomSignals } from '../src/shared/domSignals.js';

const empty = { passwordFields: 0, forms: [], iframes: [], links: [], metaRefresh: null };
const ids = (data, url) => evaluateDomSignals({ ...empty, ...data }, url).map((f) => f.id);

test('password field on http page is flagged, but not on https or localhost', () => {
  assert.deepEqual(ids({ passwordFields: 1 }, 'http://shop.example.com/login'), ['password-over-http']);
  assert.deepEqual(ids({ passwordFields: 1 }, 'https://shop.example.com/login'), []);
  assert.deepEqual(ids({ passwordFields: 1 }, 'http://localhost:5173/login'), []);
});

test('password form that posts to another domain is flagged', () => {
  const data = { passwordFields: 1, forms: [{ action: 'https://collector.evil.test/steal' }] };
  assert.ok(ids(data, 'https://bank.example.com/').includes('form-exfiltration'));
});

test('same-site and relative form actions are fine', () => {
  const data = { passwordFields: 1, forms: [{ action: '/session' }, { action: 'https://auth.example.com/login' }] };
  assert.deepEqual(ids(data, 'https://www.example.com/'), []);
});

test('https page posting a password form to http is flagged', () => {
  const data = { passwordFields: 1, forms: [{ action: 'http://www.example.com/login' }] };
  assert.ok(ids(data, 'https://www.example.com/').includes('form-exfiltration'));
});

test('hidden cross-origin iframes are flagged; visible or same-origin ones are not', () => {
  const hidden = { iframes: [{ src: 'https://tracker.evil.test/x', hidden: true }] };
  assert.deepEqual(ids(hidden, 'https://www.example.com/'), ['hidden-iframe']);
  assert.deepEqual(ids({ iframes: [{ src: 'https://tracker.evil.test/x', hidden: false }] }, 'https://www.example.com/'), []);
  assert.deepEqual(ids({ iframes: [{ src: '/embed', hidden: true }] }, 'https://www.example.com/'), []);
  assert.deepEqual(ids({ iframes: [{ src: 'https://cdn.example.com/x', hidden: true }] }, 'https://www.example.com/'), []);
});

test('more hidden iframes raise the score, capped at 30', () => {
  const many = { iframes: Array.from({ length: 6 }, (_, i) => ({ src: `https://t${i}.evil.test/`, hidden: true })) };
  const [f] = evaluateDomSignals({ ...empty, ...many }, 'https://www.example.com/');
  assert.equal(f.points, 30);
});

test('link text that names a different domain than its href is flagged', () => {
  const links = [{ text: 'www.paypal.com', href: 'https://evil.test/paypal' }];
  assert.deepEqual(ids({ links }, 'https://mail.example.com/'), ['link-mismatch']);
  assert.deepEqual(ids({ links: [{ text: 'paypal.com', href: 'https://www.paypal.com/x' }] }, 'https://mail.example.com/'), []);
  assert.deepEqual(ids({ links: [{ text: 'Click here', href: 'https://evil.test' }] }, 'https://mail.example.com/'), []);
});

test('meta refresh to another site is flagged', () => {
  assert.deepEqual(ids({ metaRefresh: '0; url=https://evil.test/next' }, 'https://www.example.com/'), ['meta-refresh']);
  assert.deepEqual(ids({ metaRefresh: '5; url=/next' }, 'https://www.example.com/'), []);
});
