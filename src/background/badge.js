import { LEVELS } from '../shared/constants.js';

const COLORS = {
  [LEVELS.HIGH]: '#B3261E',
  [LEVELS.MEDIUM]: '#E37400',
  [LEVELS.LOW]: '#1E8E3E',
  [LEVELS.TRUSTED]: '#1A73E8',
};

export function badgeFor(result) {
  if (result.level === LEVELS.TRUSTED) return { text: '✓', color: COLORS.trusted };
  if (result.level === LEVELS.LOW) return { text: result.score ? String(result.score) : 'OK', color: COLORS.low };
  return { text: String(result.score), color: COLORS[result.level] };
}

export async function applyBadge(tabId, result) {
  const { text, color } = badgeFor(result);
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ tabId, color: '#FFFFFF' });
}
