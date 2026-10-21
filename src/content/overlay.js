import { OVERLAY_ID } from '../shared/constants.js';

/**
 * Full-page warning rendered inside a Shadow DOM so the (possibly hostile) page's
 * CSS and scripts cannot restyle or remove individual pieces of it.
 */
export function showWarningOverlay(result, { onBack, onTrust }) {
  if (document.getElementById(OVERLAY_ID)) return;

  const host = document.createElement('div');
  host.id = OVERLAY_ID;
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .wrap { position: fixed; inset: 0; display: grid; place-items: center; padding: 24px; box-sizing: border-box;
            background: rgba(120, 12, 12, .94); font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #fff; }
    .card { max-width: 560px; width: 100%; background: #fff; color: #1b1b1f; border-radius: 16px; padding: 28px;
            box-shadow: 0 20px 60px rgba(0,0,0,.45); }
    h1 { margin: 0 0 6px; font-size: 22px; color: #b3261e; }
    .score { display: inline-block; margin: 6px 0 14px; padding: 4px 10px; border-radius: 999px; background: #fde7e7; color: #8c1d18; font-weight: 600; font-size: 13px; }
    p { margin: 0 0 12px; line-height: 1.5; font-size: 15px; }
    ul { margin: 0 0 18px; padding-left: 20px; font-size: 14px; line-height: 1.5; }
    li strong { font-weight: 600; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; }
    button { font: inherit; font-weight: 600; font-size: 14px; border-radius: 10px; padding: 10px 16px; cursor: pointer; border: 1px solid transparent; }
    .primary { background: #1b6ef3; color: #fff; }
    .ghost { background: transparent; color: #55565c; border-color: #c9cad1; }
    button:focus-visible { outline: 3px solid #ffb300; outline-offset: 2px; }
  `;

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  wrap.setAttribute('role', 'alertdialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', 'pg-title');

  const card = document.createElement('div');
  card.className = 'card';

  const title = Object.assign(document.createElement('h1'), { id: 'pg-title', textContent: 'Deceptive site warning' });
  const badge = Object.assign(document.createElement('span'), { className: 'score', textContent: `Risk score ${result.score}/100` });
  const intro = Object.assign(document.createElement('p'), {
    textContent: `PhishGuard thinks ${result.host} may be trying to steal your information. Here is why:`,
  });
  const list = document.createElement('ul');
  for (const f of result.findings.slice(0, 5)) {
    const li = document.createElement('li');
    const strong = Object.assign(document.createElement('strong'), { textContent: f.title });
    li.append(strong, document.createTextNode(` – ${f.detail}`));
    list.append(li);
  }

  const row = document.createElement('div');
  row.className = 'row';
  const back = Object.assign(document.createElement('button'), { className: 'primary', textContent: 'Take me to safety' });
  const proceed = Object.assign(document.createElement('button'), { className: 'ghost', textContent: 'Proceed anyway' });
  const trust = Object.assign(document.createElement('button'), { className: 'ghost', textContent: 'I trust this site' });
  back.dataset.action = 'back';
  proceed.dataset.action = 'proceed';
  trust.dataset.action = 'trust';

  back.addEventListener('click', () => onBack());
  proceed.addEventListener('click', () => host.remove());
  trust.addEventListener('click', async () => {
    await onTrust();
    host.remove();
  });

  row.append(back, proceed, trust);
  card.append(title, badge, intro, list, row);
  wrap.append(card);
  root.append(style, wrap);
  (document.documentElement || document.body).append(host);
  back.focus();
}

export function removeWarningOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}
