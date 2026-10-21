import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResult, levelFor, isTrusted } from '../src/shared/engine.js';
import { evaluateRedirects } from '../src/shared/redirects.js';
import { registrableDomain, subdomainLabels, hostMatches, normalizeHostInput } from '../src/shared/domainUtils.js';

test('registrableDomain handles multi-part public suffixes', () => {
  assert.equal(registrableDomain('login.paypal.com'), 'paypal.com');
  assert.equal(registrableDomain('shop.example.co.uk'), 'example.co.uk');
  assert.equal(registrableDomain('example.com'), 'example.com');
  assert.equal(registrableDomain('203.0.113.7'), '203.0.113.7');
  assert.deepEqual(subdomainLabels('a.b.example.com'), ['a', 'b']);
});

test('hostMatches / normalizeHostInput', () => {
  assert.ok(hostMatches('app.example.com', 'example.com'));
  assert.ok(hostMatches('example.com', '*.example.com'));
  assert.ok(!hostMatches('notexample.com', 'example.com'));
  assert.equal(normalizeHostInput('  HTTPS://Intranet.Example.com/path '), 'intranet.example.com');
  assert.equal(normalizeHostInput(''), '');
});

test('levelFor respects sensitivity presets', () => {
  assert.equal(levelFor(54, 'balanced'), 'medium');
  assert.equal(levelFor(55, 'balanced'), 'high');
  assert.equal(levelFor(40, 'strict'), 'high');
  assert.equal(levelFor(40, 'relaxed'), 'medium');
  assert.equal(levelFor(10, 'balanced'), 'low');
});

test('redirect heuristics', () => {
  assert.deepEqual(evaluateRedirects(['https://a.com', 'https://b.com']), []);
  const hopping = evaluateRedirects(['https://a.com', 'https://b.net', 'https://c.org']);
  assert.equal(hopping[0].id, 'redirect-hopping');
  const longChain = evaluateRedirects(['https://a.com/1', 'https://a.com/2', 'https://a.com/3', 'https://a.com/4', 'https://a.com/5']);
  assert.equal(longChain[0].id, 'redirect-chain');
});

test('clean https page scores 0 / low', () => {
  const r = buildResult({ url: 'https://www.github.com/', dom: { passwordFields: 1, forms: [], iframes: [], links: [], metaRefresh: null } });
  assert.equal(r.score, 0);
  assert.equal(r.level, 'low');
});

test('a classic phishing page combines signals into a HIGH score', () => {
  const r = buildResult({
    url: 'http://paypa1-secure-login.com/signin',
    dom: {
      passwordFields: 1,
      forms: [{ action: 'https://collector.evil.test/post' }],
      iframes: [{ src: 'https://tracker.evil.test/', hidden: true }],
      links: [], metaRefresh: null,
    },
  });
  assert.equal(r.level, 'high');
  assert.ok(r.score >= 55 && r.score <= 100);
  const found = r.findings.map((f) => f.id);
  for (const id of ['brand-lookalike', 'password-over-http', 'form-exfiltration', 'hidden-iframe', 'no-https']) {
    assert.ok(found.includes(id), `missing ${id}`);
  }
  assert.deepEqual(r.findings.map((f) => f.points), [...r.findings.map((f) => f.points)].sort((a, b) => b - a)); // sorted
});

test('score is capped at 100', () => {
  const r = buildResult({
    url: 'http://user@203.0.113.7:8080/paypal-login',
    dom: { passwordFields: 1, forms: [{ action: 'https://x.evil.test' }], iframes: [{ src: 'https://t.evil.test', hidden: true }], links: [], metaRefresh: null },
    redirects: ['https://a.com', 'https://b.net', 'https://c.org'],
  });
  assert.equal(r.score, 100);
});

test('trusted sites are never flagged', () => {
  const settings = { allowlist: ['paypa1.com'] };
  assert.ok(isTrusted('login.paypa1.com', settings.allowlist));
  const r = buildResult({ url: 'https://login.paypa1.com/', settings });
  assert.equal(r.level, 'trusted');
  assert.equal(r.score, 0);
});

test('sensitivity changes the level for the same page', () => {
  const url = 'http://example.com:8080/'; // no-https 10 + odd-port 5 = 15
  assert.equal(buildResult({ url, settings: { sensitivity: 'strict' } }).level, 'low');
  const url2 = 'http://free-login-verify.top/'; // risky-tld 10 + no-https 10 + hyphens 8 + lure 8 = 36
  assert.equal(buildResult({ url: url2, settings: { sensitivity: 'strict' } }).level, 'medium');
  assert.equal(buildResult({ url: url2, settings: { sensitivity: 'relaxed' } }).level, 'medium');
  assert.equal(buildResult({ url: url2, settings: { sensitivity: 'balanced' } }).level, 'medium');
});

test('a one-letter typo of a known brand is dangerous on its own', () => {
  for (const url of ['https://www.paypel.com/', 'https://walamrt.com/', 'https://paypa1.com/']) {
    const r = buildResult({ url });
    assert.equal(r.level, 'high', url);
  }
});

test('long query strings alone do not add risk, but very long host+path does', () => {
  const botCheck = 'https://www.walmart.com/blocked?url=' + 'A'.repeat(300) + '&uuid=1&g=b';
  assert.equal(buildResult({ url: botCheck }).score, 0);
  const longPath = 'https://www.example.com/' + 'a/'.repeat(60);
  assert.equal(buildResult({ url: longPath }).score, 5);
});

test('forwarded from a look-alike address to a clean site is still flagged', () => {
  const chain = ['https://walamrt.com/', 'https://www.walmart.com/'];
  const r = buildResult({ url: 'https://www.walmart.com/', redirects: chain });
  assert.deepEqual(r.findings.map((f) => f.id), ['origin-lookalike']);
  assert.equal(r.level, 'low'); // 20 points: shown in the popup, but no scary overlay on the real site
  // A normal redirect (http -> https on the same site, or a clean origin) adds nothing
  assert.equal(buildResult({ url: 'https://www.walmart.com/', redirects: ['http://www.walmart.com/', 'https://www.walmart.com/'] }).score, 0);
  assert.equal(buildResult({ url: 'https://www.walmart.com/', redirects: ['https://walmart.com/', 'https://www.walmart.com/'] }).score, 0);
});
