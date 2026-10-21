import { MESSAGES } from '../shared/constants.js';
import { extractDomData } from './extract.js';
import { showWarningOverlay, removeWarningOverlay } from './overlay.js';

/**
 * Content script: runs in every top-level http(s) page, extracts DOM signals,
 * and hands them to the service worker, which owns scoring and the toolbar badge.
 */

const MAX_RESCANS = 6;
const DEBOUNCE_MS = 800;
let rescans = 0;
let lastSignature = '';
let timer = null;

const send = (message) => chrome.runtime.sendMessage(message).catch(() => null);

async function scan({ force = false } = {}) {
  const data = extractDomData();
  const signature = JSON.stringify([data.passwordFields, data.forms, data.iframes, data.metaRefresh, data.links.length]);
  if (!force && signature === lastSignature) return;
  lastSignature = signature;

  const reply = await send({ type: MESSAGES.PAGE_SIGNALS, data });
  if (!reply) return;
  if (reply.shouldWarn) {
    showWarningOverlay(reply.result, {
      onBack: () => send({ type: MESSAGES.GO_BACK }),
      onTrust: () => send({ type: MESSAGES.TRUST_SITE, host: reply.result.host }),
    });
  } else {
    removeWarningOverlay();
  }
}

function scheduleRescan() {
  if (rescans >= MAX_RESCANS) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    rescans += 1;
    scan();
  }, DEBOUNCE_MS);
}

// Single-page apps and late-injected login forms: watch for DOM changes (bounded).
new MutationObserver(scheduleRescan).observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === MESSAGES.RESCAN) scan({ force: true });
});

scan({ force: true });
