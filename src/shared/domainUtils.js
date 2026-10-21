/** Small, dependency-free hostname helpers. */

// Second-level labels that are commonly used under country-code TLDs (example.co.uk, example.com.au …).
// A full Public Suffix List would be more precise; this keeps the extension tiny and offline.
const CC_SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne', 'go']);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function isIpHost(host) {
  if (!host) return false;
  if (host.startsWith('[') && host.endsWith(']')) return true; // IPv6 literal
  if (IPV4.test(host)) return true;
  // Hex / octal / decimal-integer IPv4 forms are normalised to dotted-quad by the URL parser,
  // but keep a guard for odd inputs such as "0x7f.1".
  return /^0x[0-9a-f]+(\.|$)/i.test(host) || /^\d+$/.test(host);
}

export function isLoopbackHost(host) {
  return host === 'localhost' || host.endsWith('.localhost');
}

/** Parses a string into a URL or returns null. */
export function safeParseUrl(input) {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

/**
 * Returns the registrable domain ("eTLD+1") for a hostname using a compact heuristic.
 *   login.paypal.com   -> paypal.com
 *   shop.example.co.uk -> example.co.uk
 */
export function registrableDomain(host) {
  if (!host || isIpHost(host)) return host || '';
  const labels = host.toLowerCase().split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  if (tld.length === 2 && CC_SECOND_LEVEL.has(sld)) return labels.slice(-3).join('.');
  return labels.slice(-2).join('.');
}

/** Labels that appear to the left of the registrable domain. */
export function subdomainLabels(host) {
  if (!host || isIpHost(host)) return [];
  const reg = registrableDomain(host);
  const rest = host.slice(0, Math.max(0, host.length - reg.length)).replace(/\.$/, '');
  return rest ? rest.split('.') : [];
}

/** First label of the registrable domain ("paypal" for "paypal.com"). */
export function mainLabel(host) {
  return registrableDomain(host).split('.')[0] || '';
}

export function tldOf(host) {
  const labels = (host || '').split('.');
  return labels[labels.length - 1] || '';
}

/** True when `host` equals `entry` or is a subdomain of it. */
export function hostMatches(host, entry) {
  const h = (host || '').toLowerCase();
  const e = (entry || '').toLowerCase().replace(/^\*\./, '');
  return !!e && (h === e || h.endsWith('.' + e));
}

/** Normalises user input ("https://Example.com/path") to a bare hostname. */
export function normalizeHostInput(input) {
  const trimmed = (input || '').trim().toLowerCase();
  if (!trimmed) return '';
  const parsed = safeParseUrl(/^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`);
  return parsed ? parsed.hostname : '';
}
