import { registrableDomain, safeParseUrl } from './domainUtils.js';

const finding = (id, title, detail, points) => ({ id, title, detail, points });

/**
 * @param {string[]} chain Ordered list of URLs the navigation passed through (last = final page).
 */
export function evaluateRedirects(chain) {
  const out = [];
  if (!Array.isArray(chain) || chain.length < 3) return out;

  const hops = chain.length - 1;
  const domains = [...new Set(chain.map((u) => safeParseUrl(u)).filter(Boolean).map((u) => registrableDomain(u.hostname)))];

  if (domains.length >= 3) {
    out.push(finding('redirect-hopping', 'Bounced across several domains',
      `You were redirected through ${domains.length} different sites (${domains.slice(0, 3).join(' → ')}).`, 20));
  } else if (hops >= 4) {
    out.push(finding('redirect-chain', 'Long redirect chain', `The page was reached after ${hops} redirects.`, 10));
  }
  return out;
}
