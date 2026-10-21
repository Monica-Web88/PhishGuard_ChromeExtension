import { MESSAGES, LEVELS } from '../shared/constants.js';
import { buildResult } from '../shared/engine.js';
import { getSettings, addToAllowlist, removeFromAllowlist } from '../shared/settings.js';
import { applyBadge } from './badge.js';

/**
 * Service worker = the brain of the extension.
 *  - tracks each tab's redirect chain (webRequest.onBeforeRedirect)
 *  - receives DOM signals from the content script and computes the risk score
 *  - keeps results in chrome.storage.session (the worker is stateless between wake-ups)
 *  - drives the toolbar badge and answers popup requests
 */

const resultKey = (tabId) => `result:${tabId}`;
const chainKey = (tabId) => `chain:${tabId}`;
const domKey = (tabId) => `dom:${tabId}`;

const session = {
  get: async (key) => (await chrome.storage.session.get(key))[key],
  set: (key, value) => chrome.storage.session.set({ [key]: value }),
  remove: (keys) => chrome.storage.session.remove(keys),
};

// ---- Redirect tracking ------------------------------------------------------------------

chrome.webNavigation.onBeforeNavigate.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0 || tabId < 0) return;
  await session.set(chainKey(tabId), [url]);
});

chrome.webRequest.onBeforeRedirect.addListener(
  async ({ tabId, redirectUrl }) => {
    if (tabId < 0) return;
    const chain = (await session.get(chainKey(tabId))) || [];
    await session.set(chainKey(tabId), [...chain, redirectUrl].slice(-20));
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
);

// ---- Scoring ----------------------------------------------------------------------------

async function evaluate(tabId, url, dom) {
  // Remember the latest DOM snapshot so a later re-score (settings change, "trust site") keeps its findings.
  if (dom) await session.set(domKey(tabId), dom);
  const [settings, chain, storedDom] = await Promise.all([
    getSettings(), session.get(chainKey(tabId)), dom ? dom : session.get(domKey(tabId)),
  ]);
  const result = buildResult({ url, dom: storedDom || null, redirects: chain || [], settings });
  await session.set(resultKey(tabId), result);
  await applyBadge(tabId, result);
  return { result, settings };
}

// Fast first pass from URL + redirects alone, before the page has even rendered.
chrome.webNavigation.onCommitted.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0 || tabId < 0) return;
  if (!/^https?:/.test(url)) {
    await session.remove([resultKey(tabId), domKey(tabId)]);
    await chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }
  await session.remove([domKey(tabId)]); // new document -> stale DOM data no longer applies
  await evaluate(tabId, url, null);
});

chrome.tabs.onRemoved.addListener((tabId) => session.remove([resultKey(tabId), chainKey(tabId), domKey(tabId)]));

// ---- Message router ---------------------------------------------------------------------

async function handleMessage(msg, sender) {
  switch (msg?.type) {
    case MESSAGES.PAGE_SIGNALS: {
      const tab = sender.tab;
      if (!tab || sender.frameId !== 0) return null; // only trust the top-level frame
      const { result, settings } = await evaluate(tab.id, sender.url || tab.url, msg.data);
      return { result, shouldWarn: settings.showOverlay && result.level === LEVELS.HIGH };
    }
    case MESSAGES.GET_RESULT: {
      return (await session.get(resultKey(msg.tabId))) || null;
    }
    case MESSAGES.TRUST_SITE:
    case MESSAGES.UNTRUST_SITE: {
      msg.type === MESSAGES.TRUST_SITE ? await addToAllowlist(msg.host) : await removeFromAllowlist(msg.host);
      if (msg.tabId != null) {
        const tab = await chrome.tabs.get(msg.tabId).catch(() => null);
        if (tab?.url) return (await evaluate(msg.tabId, tab.url, null)).result;
      }
      return null;
    }
    case MESSAGES.GO_BACK: {
      const tabId = sender.tab?.id;
      if (tabId == null) return null;
      try {
        await chrome.tabs.goBack(tabId);
      } catch {
        await chrome.tabs.update(tabId, { url: 'about:blank' });
      }
      return true;
    }
    default:
      return null;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch((err) => {
    console.error('[PhishGuard]', err);
    sendResponse(null);
  });
  return true; // keep the channel open for the async response
});

// Re-score open tabs when the user edits settings (allowlist / sensitivity).
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    const prev = await session.get(resultKey(tab.id));
    if (prev) await evaluate(tab.id, tab.url, null);
  }
});
