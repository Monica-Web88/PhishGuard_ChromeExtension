// End-to-end test: loads the BUILT extension into real Chromium and drives it against local fixture pages.
// Fake hostnames (*.test) are mapped to 127.0.0.1 so the extension sees realistic, non-localhost URLs.
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dist = resolve('dist');
const shots = resolve('docs/screenshots');
mkdirSync(shots, { recursive: true });

// ---- tiny fixture server -----------------------------------------------------------------
let PORT = 0;
const page = (name) => readFileSync(`e2e/fixtures/${name}`, 'utf8').replaceAll('__PORT__', PORT);
const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  const html = (body) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(body); };
  if (path === '/signin') return html(page('phish.html'));
  if (path === '/shop') return html(page('benign.html'));
  if (path === '/px.html') return html('<p>tracking pixel frame</p>');
  if (path === '/r1') { res.writeHead(302, { location: `http://hop2.test:${PORT}/r2` }); return res.end(); }
  if (path === '/r2') { res.writeHead(302, { location: `http://hop3.test:${PORT}/r3` }); return res.end(); }
  if (path === '/r3') { res.writeHead(302, { location: `http://final-shop.test:${PORT}/shop` }); return res.end(); }
  res.writeHead(404); res.end('not found');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
PORT = server.address().port;

// ---- helpers -----------------------------------------------------------------------------
let failures = 0;
const check = (cond, label) => { console.log(`${cond ? '  ✔' : '  ✘'} ${label}`); if (!cond) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'phishguard-e2e-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', // new headless mode, which supports extensions
  headless: true,
  viewport: { width: 1000, height: 700 },
  args: [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    '--host-resolver-rules=MAP *.test 127.0.0.1',
  ],
});

let [sw] = context.serviceWorkers();
sw ??= await context.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
const tabIdFor = (pattern) => sw.evaluate(async (p) => (await chrome.tabs.query({ url: p }))[0]?.id, pattern);
const badge = (tabId) => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);

try {
  console.log(`Extension loaded (${extId}), fixtures on :${PORT}`);

  // 1) Phishing page -> overlay + HIGH badge
  console.log('\n[1] Phishing page');
  const phish = await context.newPage();
  await phish.goto(`http://paypa1-secure-login.test:${PORT}/signin`);
  await phish.waitForSelector('#phishguard-overlay', { timeout: 8000 }).catch(() => {});
  const overlayText = await phish.locator('#phishguard-overlay .card').innerText().catch(() => '') // CSS locators pierce the open shadow root;
  check(overlayText.includes('Deceptive site warning'), 'full-page warning overlay is shown');
  check(/Impersonates paypal/i.test(overlayText), 'overlay explains the look-alike brand');
  check(/Password field on an insecure page/i.test(overlayText), 'overlay lists the insecure password field');
  await phish.screenshot({ path: join(shots, 'warning-overlay.png') });
  const phishTab = await tabIdFor('*://paypa1-secure-login.test/*');
  const phishBadge = Number(await badge(phishTab));
  check(phishBadge >= 55, `toolbar badge shows a high score (${phishBadge})`);

  // 2) Popup details
  console.log('\n[2] Popup');
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 380, height: 560 });
  await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${phishTab}`);
  await popup.waitForSelector('.findings');
  const popupText = await popup.locator('main').innerText();
  check(popupText.includes('Dangerous'), 'popup labels the page "Dangerous"');
  for (const t of ['Impersonates paypal', 'Password field on an insecure page', 'Login form submits to a different place',
    'Hidden third-party iframe', 'Link text does not match its destination']) {
    check(popupText.includes(t), `popup lists: ${t}`);
  }
  await popup.screenshot({ path: join(shots, 'popup-dangerous.png') });

  // 3) Dismiss overlay with "Proceed anyway"
  console.log('\n[3] Overlay actions');
  await phish.locator('#phishguard-overlay button[data-action="proceed"]').click();
  check((await phish.locator('#phishguard-overlay').count()) === 0, '"Proceed anyway" removes the overlay');

  // 4) Trust the site from the popup
  await popup.getByRole('button', { name: 'Trust this site' }).click();
  await popup.waitForSelector('text=Trusted');
  check(true, 'popup "Trust this site" marks the page Trusted');
  await sleep(300);
  check((await badge(phishTab)) === '✓', 'badge switches to ✓ for trusted site');
  await phish.reload();
  await sleep(1500);
  check((await phish.locator('#phishguard-overlay').count()) === 0, 'trusted site no longer triggers the overlay');

  // 5) Benign page
  console.log('\n[4] Benign page');
  const shop = await context.newPage();
  await shop.goto(`http://shop.example.test:${PORT}/shop`);
  await sleep(1500);
  check((await shop.locator('#phishguard-overlay').count()) === 0, 'no overlay on a harmless page');
  const shopTab = await tabIdFor('*://shop.example.test/*');
  const shopPopup = await context.newPage();
  await shopPopup.setViewportSize({ width: 380, height: 400 });
  await shopPopup.goto(`chrome-extension://${extId}/popup.html?tabId=${shopTab}`);
  await shopPopup.waitForSelector('.summary');
  const shopText = await shopPopup.locator('main').innerText();
  check(shopText.includes('Looks safe'), 'popup says "Looks safe"');
  await shopPopup.screenshot({ path: join(shots, 'popup-safe.png') });

  // 6) Redirect chain
  console.log('\n[5] Redirect chain');
  const hop = await context.newPage();
  await hop.goto(`http://hop1.test:${PORT}/r1`);
  await sleep(1500);
  const hopTab = await tabIdFor('*://final-shop.test/*');
  const hopPopup = await context.newPage();
  await hopPopup.goto(`chrome-extension://${extId}/popup.html?tabId=${hopTab}`);
  await hopPopup.waitForSelector('.summary');
  check((await hopPopup.locator('main').innerText()).includes('Bounced across several domains'), 'redirect hopping across domains is detected');

  // 7) Options page persists the allowlist
  console.log('\n[6] Options');
  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extId}/options.html`);
  await opts.getByLabel('Domain to trust').fill('intranet.example.org');
  await opts.getByRole('button', { name: 'Add' }).click();
  await opts.waitForSelector('text=intranet.example.org');
  await opts.reload();
  check((await opts.locator('.list').innerText()).includes('intranet.example.org'), 'allowlist entry persists after reload');
  await opts.screenshot({ path: join(shots, 'options.png') });
} catch (err) {
  console.error('\nE2E crashed:', err);
  failures += 1;
} finally {
  await context.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll e2e checks passed');
process.exit(failures ? 1 : 0);
