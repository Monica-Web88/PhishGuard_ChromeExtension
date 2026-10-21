import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeUrl, editDistance, deobfuscate, findBrandImpersonation } from '../src/shared/urlAnalysis.js';

const ids = (url) => analyzeUrl(url).map((f) => f.id);

test('editDistance handles substitutions, insertions and transpositions', () => {
  assert.equal(editDistance('paypal', 'paypal'), 0);
  assert.equal(editDistance('paypal', 'paypa1'), 1);
  assert.equal(editDistance('google', 'gooogle'), 1);
  assert.equal(editDistance('google', 'googel'), 1); // transposition counts as one edit
  assert.equal(editDistance('google', 'amazon'), 6);
});

test('deobfuscate undoes common character swaps', () => {
  assert.equal(deobfuscate('paypa1'), 'paypal');
  assert.equal(deobfuscate('rnicrosoft'), 'microsoft');
  assert.equal(deobfuscate('g00gle'), 'google');
});

test('legitimate sites produce no findings', () => {
  for (const url of [
    'https://www.paypal.com/signin',
    'https://login.microsoftonline.com/common/oauth2',
    'https://github.com/anthropics/claude-code',
    'https://mail.google.com/mail/u/0/',
    'https://www.bankofamerica.com/',
    'https://applebees.com/en/menu', // contains "apple" but is a different, legitimate word
    'https://shop.example.co.uk/cart',
    'http://localhost:3000/login',
  ]) {
    assert.deepEqual(ids(url), [], url);
  }
});

test('flags typosquatted brand domains', () => {
  for (const url of ['https://paypa1.com/login', 'https://googel.com', 'https://g00gle.com', 'https://rnicrosoft.com', 'https://amaz0n.com']) {
    assert.ok(ids(url).includes('brand-lookalike'), url);
  }
});

test('flags brand + lure-word domains', () => {
  assert.ok(ids('https://paypal-secure-login.com/').includes('brand-lookalike'));
  assert.ok(ids('https://apple-support.net').includes('brand-lookalike'));
  assert.ok(ids('https://netflixbilling.com').includes('brand-lookalike'));
});

test('flags brand placed in sub-domain of another site', () => {
  assert.equal(findBrandImpersonation('paypal.com.account-check.xyz').kind, 'subdomain');
  assert.equal(findBrandImpersonation('login.paypal.evil.com').kind, 'subdomain');
  assert.equal(findBrandImpersonation('login.paypal.com'), null); // genuine sub-domain of the real domain
});

test('flags raw IP hosts, punycode and embedded credentials', () => {
  assert.ok(ids('http://203.0.113.7/login').includes('ip-host'));
  assert.ok(ids('https://xn--pple-43d.com').includes('punycode'));
  assert.ok(ids('https://www.google.com@evil.example/').includes('userinfo'));
});

test('flags plain-http, deep sub-domains, risky TLDs and odd ports', () => {
  assert.ok(ids('http://example.com').includes('no-https'));
  assert.ok(ids('https://a.b.c.d.example.com').includes('many-subdomains'));
  assert.ok(ids('https://free-prizes.top').includes('risky-tld'));
  assert.ok(ids('https://example.com:8443').includes('odd-port'));
});

test('ignores non-web schemes and invalid input', () => {
  assert.deepEqual(analyzeUrl('chrome://extensions'), []);
  assert.deepEqual(analyzeUrl('not a url'), []);
  assert.deepEqual(analyzeUrl(''), []);
});
