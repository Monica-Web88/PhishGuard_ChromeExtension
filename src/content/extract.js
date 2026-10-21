/**
 * DOM -> plain data. This is the only code that touches the live document; everything
 * downstream (shared/domSignals.js) is pure and unit-tested.
 */

const MAX_LINKS = 300;
const MAX_IFRAMES = 50;

/** True when an iframe cannot be seen by the user. */
export function isHiddenIframe(el, win = window) {
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return true;
  const style = win.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return true;
  const rect = el.getBoundingClientRect();
  const w = rect.width || parseFloat(style.width) || 0;
  const h = rect.height || parseFloat(style.height) || 0;
  if (w <= 2 || h <= 2) return true; // 0x0 / 1x1 tracking-pixel style frames
  // Positioned far off-screen
  return rect.right < -100 || rect.bottom < -100 || rect.left > win.innerWidth + 5000;
}

/** @param {Document} doc */
export function extractDomData(doc = document, win = window) {
  const passwordFields = doc.querySelectorAll('input[type="password" i]').length;

  const forms = [...doc.forms].slice(0, 50).map((f) => ({ action: f.getAttribute('action') || '' }));

  const iframes = [...doc.querySelectorAll('iframe')].slice(0, MAX_IFRAMES).map((el) => ({
    src: el.getAttribute('src') || '',
    hidden: isHiddenIframe(el, win),
  }));

  const links = [...doc.querySelectorAll('a[href]')].slice(0, MAX_LINKS).map((a) => ({
    text: (a.textContent || '').trim().slice(0, 120),
    href: a.getAttribute('href') || '',
  }));

  const meta = doc.querySelector('meta[http-equiv="refresh" i]');
  return { passwordFields, forms, iframes, links, metaRefresh: meta ? meta.getAttribute('content') : null };
}
