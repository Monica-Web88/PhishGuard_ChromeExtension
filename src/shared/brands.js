/**
 * Frequently impersonated brands. `domain` is the legitimate registrable domain.
 * The brand "name" used for look-alike detection is the first label of that domain.
 */
export const BRAND_DOMAINS = [
  'paypal.com', 'google.com', 'microsoft.com', 'apple.com', 'amazon.com', 'facebook.com',
  'instagram.com', 'netflix.com', 'linkedin.com', 'github.com', 'dropbox.com', 'chase.com',
  'bankofamerica.com', 'wellsfargo.com', 'americanexpress.com', 'outlook.com', 'office.com',
  'icloud.com', 'docusign.com', 'adobe.com', 'coinbase.com', 'binance.com', 'paloaltonetworks.com',
  'okta.com', 'walmart.com', 'fedex.com', 'whatsapp.com', 'twitter.com', 'spotify.com', 'yahoo.com',
  'steampowered.com', 'verizon.com', 'capitalone.com', 'citibank.com', 'office365.com', 'salesforce.com',
  'cloudflare.com', 'metamask.io', 'robinhood.com', 'venmo.com', 'zelle.com', 'dhl.com',
];

/** Words attackers bolt onto a brand name ("paypal-login.com"). */
export const LURE_WORDS = [
  'login', 'signin', 'secure', 'security', 'verify', 'verification', 'account', 'update', 'support',
  'service', 'help', 'billing', 'wallet', 'auth', 'password', 'recovery', 'confirm', 'alert', 'portal',
];

/** TLDs that are disproportionately used for throw-away abuse. */
export const SUSPICIOUS_TLDS = new Set([
  'zip', 'mov', 'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz', 'click', 'work', 'country', 'kim',
  'support', 'loan', 'men', 'review', 'rest', 'cam', 'icu', 'monster', 'buzz', 'sbs',
]);
