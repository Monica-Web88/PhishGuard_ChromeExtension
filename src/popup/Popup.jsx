import { useCallback, useEffect, useState } from 'react';
import { MESSAGES, LEVELS } from '../shared/constants.js';
import './popup.css';

const LEVEL_COPY = {
  [LEVELS.HIGH]: { label: 'Dangerous', hint: 'Do not enter passwords or personal data on this page.' },
  [LEVELS.MEDIUM]: { label: 'Suspicious', hint: 'Some red flags were found. Proceed with care.' },
  [LEVELS.LOW]: { label: 'Looks safe', hint: 'No significant red flags detected.' },
  [LEVELS.TRUSTED]: { label: 'Trusted', hint: 'You added this site to your trusted list.' },
};

async function resolveTabId() {
  const fromQuery = new URLSearchParams(location.search).get('tabId'); // handy for tests/dev
  if (fromQuery) return Number(fromQuery);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

function ScoreRing({ score, level }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`ring ring-${level}`} viewBox="0 0 80 80" role="img" aria-label={`Risk score ${score} out of 100`}>
      <circle className="ring-bg" cx="40" cy="40" r={r} />
      <circle className="ring-fg" cx="40" cy="40" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      <text x="40" y="46" textAnchor="middle" className="ring-text">{score}</text>
    </svg>
  );
}

export default function Popup() {
  const [tabId, setTabId] = useState(null);
  const [result, setResult] = useState(undefined); // undefined = loading, null = nothing to show

  const load = useCallback(async (id) => {
    setResult(await chrome.runtime.sendMessage({ type: MESSAGES.GET_RESULT, tabId: id }));
  }, []);

  useEffect(() => {
    resolveTabId().then((id) => {
      setTabId(id);
      if (id != null) load(id);
      else setResult(null);
    });
  }, [load]);

  const toggleTrust = async () => {
    const type = result.trusted ? MESSAGES.UNTRUST_SITE : MESSAGES.TRUST_SITE;
    const next = await chrome.runtime.sendMessage({ type, host: result.host, tabId });
    if (next) setResult(next);
    else load(tabId);
  };

  const rescan = async () => {
    setResult(undefined);
    try {
      await chrome.tabs.sendMessage(tabId, { type: MESSAGES.RESCAN });
    } catch { /* content script not available on this page */ }
    setTimeout(() => load(tabId), 500);
  };

  if (result === undefined) return <main className="popup"><p className="muted">Scanning…</p></main>;

  if (result === null) {
    return (
      <main className="popup">
        <Header />
        <p className="muted">This page can’t be scanned (browser pages, the Web Store and local files are skipped).</p>
        <Footer />
      </main>
    );
  }

  const copy = LEVEL_COPY[result.level];
  return (
    <main className="popup">
      <Header />
      <section className={`summary level-${result.level}`}>
        <ScoreRing score={result.score} level={result.level} />
        <div>
          <h2>{copy.label}</h2>
          <p className="host" title={result.url}>{result.host}</p>
          <p className="hint">{copy.hint}</p>
        </div>
      </section>

      {result.findings.length > 0 ? (
        <ul className="findings" aria-label="Detected red flags">
          {result.findings.map((f) => (
            <li key={f.id} className={`finding sev-${f.severity}`}>
              <span className="chip">+{f.points}</span>
              <div>
                <strong>{f.title}</strong>
                <p>{f.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{result.trusted ? 'Scanning is skipped for trusted sites.' : 'No red flags found on this page.'}</p>
      )}

      <div className="actions">
        <button type="button" onClick={rescan}>Re-scan page</button>
        <button type="button" className={result.trusted ? '' : 'secondary'} onClick={toggleTrust}>
          {result.trusted ? 'Remove from trusted' : 'Trust this site'}
        </button>
      </div>
      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header>
      <img src="icons/icon48.png" alt="" width="24" height="24" />
      <h1>PhishGuard</h1>
    </header>
  );
}

function Footer() {
  return (
    <footer>
      <a href="options.html" onClick={(e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); }}>Settings</a>
    </footer>
  );
}
