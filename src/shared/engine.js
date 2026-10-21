import { analyzeUrl } from './urlAnalysis.js';
import { evaluateDomSignals } from './domSignals.js';
import { evaluateRedirects } from './redirects.js';
import { DEFAULT_SETTINGS, LEVELS, SENSITIVITY } from './constants.js';
import { hostMatches, safeParseUrl } from './domainUtils.js';

/**
 * If the navigation STARTED at a look-alike address and was forwarded elsewhere (typo-squat -> real site or
 * ad page), the final page looks clean – so score the address the user actually typed or clicked.
 */
export function evaluateOrigin(chain, finalHost) {
  if (!Array.isArray(chain) || chain.length < 2) return [];
  const origin = safeParseUrl(chain[0]);
  if (!origin || origin.hostname.toLowerCase() === finalHost) return [];
  const hit = analyzeUrl(chain[0]).find((f) => f.id === 'brand-lookalike');
  if (!hit) return [];
  return [{
    id: 'origin-lookalike',
    title: 'Started from a look-alike address',
    detail: `You were forwarded from ${origin.hostname}. ${hit.title}.`,
    points: 20,
  }];
}

export function severityOf(points) {
  return points >= 30 ? 'high' : points >= 15 ? 'medium' : 'low';
}

/** Maps a numeric score to a risk level for the chosen sensitivity preset. */
export function levelFor(score, sensitivity = 'balanced') {
  const t = SENSITIVITY[sensitivity] || SENSITIVITY.balanced;
  if (score >= t.high) return LEVELS.HIGH;
  if (score >= t.medium) return LEVELS.MEDIUM;
  return LEVELS.LOW;
}

export function isTrusted(host, allowlist = []) {
  return allowlist.some((entry) => hostMatches(host, entry));
}

/**
 * Combines every signal source into one result object.
 *
 * @param {{url:string, dom?:object|null, redirects?:string[], settings?:object, now?:number}} input
 */
export function buildResult({ url, dom = null, redirects = [], settings = DEFAULT_SETTINGS, now = Date.now() }) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  const parsed = safeParseUrl(url);
  const host = parsed ? parsed.hostname.toLowerCase() : '';

  if (isTrusted(host, merged.allowlist)) {
    return { url, host, score: 0, level: LEVELS.TRUSTED, findings: [], trusted: true, scannedAt: now, domScanned: !!dom };
  }

  const raw = [
    ...analyzeUrl(url),
    ...(dom ? evaluateDomSignals(dom, url) : []),
    ...evaluateRedirects(redirects),
    ...evaluateOrigin(redirects, host),
  ];
  // De-duplicate by id, keeping the highest-scoring instance.
  const byId = new Map();
  for (const f of raw) if (!byId.has(f.id) || byId.get(f.id).points < f.points) byId.set(f.id, f);
  const findings = [...byId.values()]
    .map((f) => ({ ...f, severity: severityOf(f.points) }))
    .sort((a, b) => b.points - a.points);

  const score = Math.min(100, findings.reduce((sum, f) => sum + f.points, 0));
  return {
    url, host, score, level: levelFor(score, merged.sensitivity), findings,
    trusted: false, scannedAt: now, domScanned: !!dom,
  };
}
