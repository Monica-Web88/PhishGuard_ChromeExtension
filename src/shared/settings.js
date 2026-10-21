import { DEFAULT_SETTINGS } from './constants.js';
import { normalizeHostInput } from './domainUtils.js';

const KEY = 'settings';

export async function getSettings() {
  const stored = (await chrome.storage.local.get(KEY))[KEY] || {};
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export async function addToAllowlist(hostInput) {
  const host = normalizeHostInput(hostInput);
  if (!host) return getSettings();
  const s = await getSettings();
  if (s.allowlist.includes(host)) return s;
  return saveSettings({ allowlist: [...s.allowlist, host].sort() });
}

export async function removeFromAllowlist(host) {
  const s = await getSettings();
  return saveSettings({ allowlist: s.allowlist.filter((h) => h !== host) });
}
