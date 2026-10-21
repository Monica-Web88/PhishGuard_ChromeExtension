import { registrableDomain, safeParseUrl } from './domainUtils.js';

/** A finding is { id, title, detail, points }. */
const finding = (id, title, detail, points) => ({ id, title, detail, points });

const LOOKS_LIKE_DOMAIN = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;

function hostOf(href, base) {
  const u = safeParseUrl(new URL(href, base).href);
  return u ? u.hostname : '';
}

function resolve(href, base) {
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}

/**
 * Turns the plain data extracted from the DOM (see content/extract.js) into findings.
 * Keeping this pure (no DOM access) makes it trivial to unit-test.
 *
 * @param {{passwordFields:number, forms:{action:string}[], iframes:{src:string,hidden:boolean}[],
 *          links:{text:string,href:string}[], metaRefresh:string|null}} data
 * @param {string} pageUrl
 */
export function evaluateDomSignals(data, pageUrl) {
  const out = [];
  const page = safeParseUrl(pageUrl);
  if (!page || !data) return out;
  const pageReg = registrableDomain(page.hostname);
  const isHttp = page.protocol === 'http:';
  const isLocal = page.hostname === 'localhost' || page.hostname.endsWith('.localhost');

  // 1) Password field on an unencrypted page
  if (data.passwordFields > 0 && isHttp && !isLocal) {
    out.push(finding('password-over-http', 'Password field on an insecure page',
      'This page asks for a password but is not served over HTTPS – anyone on the network can read it.', 35));
  }

  // 2) Forms that submit somewhere unexpected
  const forms = data.forms || [];
  const risky = [];
  for (const f of forms) {
    const target = resolve(f.action || '', pageUrl);
    if (!target) continue;
    if (target.protocol === 'javascript:' || target.protocol === 'data:') {
      risky.push(`a ${target.protocol} URL`);
    } else if (data.passwordFields > 0 && page.protocol === 'https:' && target.protocol === 'http:') {
      risky.push('an unencrypted (http) URL');
    } else if (data.passwordFields > 0 && registrableDomain(target.hostname) !== pageReg) {
      risky.push(target.hostname);
    }
  }
  if (risky.length) {
    out.push(finding('form-exfiltration', 'Login form submits to a different place',
      `A form containing a password field sends data to ${risky[0]}.`, 25));
  }

  // 3) Hidden iframes pointing to other sites
  const hiddenCross = (data.iframes || []).filter((f) => {
    if (!f.hidden) return false;
    const t = resolve(f.src || '', pageUrl);
    return t && /^https?:$/.test(t.protocol) && registrableDomain(t.hostname) !== pageReg;
  });
  if (hiddenCross.length) {
    const pts = Math.min(30, 20 + (hiddenCross.length - 1) * 5);
    out.push(finding('hidden-iframe', 'Hidden third-party iframe',
      `${hiddenCross.length} invisible iframe(s) load content from ${resolve(hiddenCross[0].src, pageUrl).hostname}.`, pts));
  }

  // 4) Links whose visible text names one site but point to another
  const mismatched = (data.links || []).filter((l) => {
    const text = (l.text || '').trim();
    if (!LOOKS_LIKE_DOMAIN.test(text)) return false;
    const shown = resolve(/^https?:/i.test(text) ? text : `https://${text}`, pageUrl);
    const real = resolve(l.href || '', pageUrl);
    return shown && real && /^https?:$/.test(real.protocol)
      && registrableDomain(shown.hostname) !== registrableDomain(real.hostname);
  });
  if (mismatched.length) {
    out.push(finding('link-mismatch', 'Link text does not match its destination',
      `"${mismatched[0].text.trim().slice(0, 40)}" actually leads to ${hostOf(mismatched[0].href, pageUrl)}.`,
      Math.min(25, 15 + (mismatched.length - 1) * 5)));
  }

  // 5) Meta refresh to another site
  if (data.metaRefresh) {
    const m = /url\s*=\s*['"]?([^'";]+)/i.exec(data.metaRefresh);
    const t = m && resolve(m[1].trim(), pageUrl);
    if (t && /^https?:$/.test(t.protocol) && registrableDomain(t.hostname) !== pageReg) {
      out.push(finding('meta-refresh', 'Automatic redirect to another site',
        `The page forwards visitors to ${t.hostname} via a meta-refresh tag.`, 15));
    }
  }

  return out;
}
