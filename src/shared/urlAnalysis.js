import { BRAND_DOMAINS, LURE_WORDS, SUSPICIOUS_TLDS } from './brands.js';
import {
  isIpHost, isLoopbackHost, safeParseUrl, registrableDomain, subdomainLabels, mainLabel, tldOf,
} from './domainUtils.js';

/** A finding is { id, title, detail, points }. */
const finding = (id, title, detail, points) => ({ id, title, detail, points });

/** Optimal-string-alignment distance (Levenshtein + adjacent transpositions). */
export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

const LEET = { 0: 'o', 1: 'l', 3: 'e', 4: 'a', 5: 's', 7: 't', $: 's', '@': 'a' };

/** Undoes common character substitutions: "paypa1" -> "paypal", "rnicrosoft" -> "microsoft". */
export function deobfuscate(label) {
  return label
    .replace(/[013457$@]/g, (c) => LEET[c] ?? c)
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w');
}

const BRANDS = BRAND_DOMAINS.map((domain) => ({ domain, name: domain.split('.')[0] }));

/** Returns the brand a hostname appears to impersonate (or null). */
export function findBrandImpersonation(host) {
  const reg = registrableDomain(host);
  if (BRANDS.some((b) => b.domain === reg)) return null; // the real thing
  const label = mainLabel(host);
  const subs = subdomainLabels(host);

  const deob = deobfuscate(label);
  const tokens = deob.split('-');

  for (const brand of BRANDS) {
    // 1) Brand used as a sub-domain of someone else's domain: paypal.com.evil.xyz, login.paypal.evil.com
    if (subs.includes(brand.name) || host.includes(`${brand.domain}.`)) {
      return { brand, kind: 'subdomain' };
    }
    // 2) Brand + lure word in the registrable label: paypal-login.com, secure-apple-id.net, paypa1secure.com
    const hasBrand = tokens.includes(brand.name) || deob.startsWith(brand.name) || deob.endsWith(brand.name);
    const hasLure = tokens.some((t) => LURE_WORDS.includes(t))
      || LURE_WORDS.some((w) => deob.startsWith(brand.name + w) || deob.endsWith(w + brand.name));
    if (hasBrand && hasLure) return { brand, kind: 'lure' };
    // 3) Typosquat: one edit away from the brand name (after undoing leet-speak)
    if (brand.name.length >= 5 && label !== brand.name) {
      for (const c of new Set([label, deob])) {
        if (c.length >= 4 && editDistance(c, brand.name) <= 1) return { brand, kind: 'typosquat' };
      }
    }
  }
  return null;
}

/**
 * Static analysis of a URL – no page content needed.
 * @param {string} urlString
 * @returns {{id:string,title:string,detail:string,points:number}[]}
 */
export function analyzeUrl(urlString) {
  const url = safeParseUrl(urlString);
  if (!url || !/^https?:$/.test(url.protocol)) return [];
  const host = url.hostname.toLowerCase();
  if (isLoopbackHost(host)) return [];

  const out = [];
  const subs = subdomainLabels(host);

  if (isIpHost(host)) {
    out.push(finding('ip-host', 'Address is a raw IP', `The site is served from ${host} instead of a domain name.`, 25));
  }

  if (host.split('.').some((l) => l.startsWith('xn--'))) {
    out.push(finding('punycode', 'Internationalised look-alike characters',
      'The domain uses punycode (xn--), which can disguise letters from other alphabets as Latin ones.', 25));
  }

  const impersonation = findBrandImpersonation(host);
  if (impersonation) {
    const { brand, kind } = impersonation;
    const detail = {
      subdomain: `"${brand.domain}" appears inside the address but the real domain is ${registrableDomain(host)}.`,
      lure: `The domain combines "${brand.name}" with a lure word, but it is not ${brand.domain}.`,
      typosquat: `The domain is one character away from ${brand.domain}.`,
    }[kind];
    out.push(finding('brand-lookalike', `Impersonates ${brand.name}`, detail, { typosquat: 55, subdomain: 55, lure: 45 }[kind]));
  }

  if (url.username || url.password) {
    out.push(finding('userinfo', 'Credentials embedded in URL',
      'The address contains "user@host" syntax, a classic trick to hide the real destination.', 30));
  }

  if (url.protocol === 'http:') {
    out.push(finding('no-https', 'Connection is not encrypted', 'The page was loaded over plain HTTP.', 10));
  }

  if (subs.length >= 3) {
    out.push(finding('many-subdomains', 'Unusually deep sub-domain nesting',
      `${subs.length} sub-domain levels were used, which can push the real domain out of view.`, 10));
  }

  if (SUSPICIOUS_TLDS.has(tldOf(host)) && !isIpHost(host)) {
    out.push(finding('risky-tld', 'High-abuse top-level domain', `".${tldOf(host)}" domains are frequently used for phishing.`, 10));
  }

  const hyphens = mainLabel(host).startsWith('xn--') ? 0 : (mainLabel(host).match(/-/g) || []).length;
  if (hyphens >= 2) {
    out.push(finding('hyphens', 'Many hyphens in domain', `The domain contains ${hyphens} hyphens.`, 8));
  }

  const lures = LURE_WORDS.filter((w) => host.includes(w));
  if (lures.length >= 2) {
    out.push(finding('lure-words', 'Credential-themed words in domain', `The domain contains: ${lures.slice(0, 3).join(', ')}.`, 8));
  }

  if (url.port && !['80', '443'].includes(url.port)) {
    out.push(finding('odd-port', 'Non-standard port', `The site uses port ${url.port}.`, 5));
  }

  // Only host + path count: long query strings (tracking, login redirects, bot checks) are normal on big sites.
  if (host.length + url.pathname.length > 100) {
    out.push(finding('long-url', 'Very long URL', 'Long addresses are often used to hide the real destination.', 5));
  }

  return out;
}
