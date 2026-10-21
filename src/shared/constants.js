/** Shared constants for PhishGuard. */

export const MESSAGES = Object.freeze({
  PAGE_SIGNALS: 'PHISHGUARD_PAGE_SIGNALS', // content script -> service worker
  GET_RESULT: 'PHISHGUARD_GET_RESULT', // popup -> service worker
  TRUST_SITE: 'PHISHGUARD_TRUST_SITE', // popup/overlay -> service worker
  UNTRUST_SITE: 'PHISHGUARD_UNTRUST_SITE',
  GO_BACK: 'PHISHGUARD_GO_BACK', // overlay -> service worker
  RESCAN: 'PHISHGUARD_RESCAN', // popup -> content script
});

export const LEVELS = Object.freeze({
  TRUSTED: 'trusted',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

/** Score thresholds (inclusive lower bound) for each sensitivity preset. */
export const SENSITIVITY = Object.freeze({
  strict: { medium: 20, high: 40 },
  balanced: { medium: 25, high: 55 },
  relaxed: { medium: 35, high: 70 },
});

export const DEFAULT_SETTINGS = Object.freeze({
  sensitivity: 'balanced',
  showOverlay: true,
  allowlist: [],
});

export const OVERLAY_ID = 'phishguard-overlay';
