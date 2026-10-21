import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, SENSITIVITY } from '../shared/constants.js';
import { getSettings, saveSettings, addToAllowlist, removeFromAllowlist } from '../shared/settings.js';
import { normalizeHostInput } from '../shared/domainUtils.js';
import './options.css';

const PRESETS = {
  strict: 'Strict – warn early (more false alarms)',
  balanced: 'Balanced – recommended',
  relaxed: 'Relaxed – only the clearest threats',
};

export default function Options() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const update = async (patch) => setSettings(await saveSettings(patch));

  const add = async (e) => {
    e.preventDefault();
    if (!normalizeHostInput(draft)) {
      setError('Enter a valid domain such as example.com');
      return;
    }
    setError('');
    setSettings(await addToAllowlist(draft));
    setDraft('');
  };

  return (
    <main className="page">
      <h1>PhishGuard settings</h1>

      <section>
        <h2>Detection sensitivity</h2>
        <label htmlFor="sens" className="sr-only">Sensitivity</label>
        <select id="sens" value={settings.sensitivity} onChange={(e) => update({ sensitivity: e.target.value })}>
          {Object.keys(SENSITIVITY).map((k) => <option key={k} value={k}>{PRESETS[k]}</option>)}
        </select>
        <p className="muted">
          Warning threshold: {SENSITIVITY[settings.sensitivity].high}/100 · Suspicious threshold: {SENSITIVITY[settings.sensitivity].medium}/100
        </p>
      </section>

      <section>
        <h2>Warning screen</h2>
        <label className="check">
          <input type="checkbox" checked={settings.showOverlay} onChange={(e) => update({ showOverlay: e.target.checked })} />
          Show a full-page warning on dangerous sites
        </label>
      </section>

      <section>
        <h2>Trusted sites</h2>
        <p className="muted">PhishGuard skips scanning these domains (and their sub-domains).</p>
        <form onSubmit={add} className="add">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="intranet.example.com" aria-label="Domain to trust" />
          <button type="submit">Add</button>
        </form>
        {error && <p role="alert" className="error">{error}</p>}
        <ul className="list">
          {settings.allowlist.length === 0 && <li className="muted">No trusted sites yet.</li>}
          {settings.allowlist.map((h) => (
            <li key={h}>
              <span>{h}</span>
              <button type="button" className="link" onClick={async () => setSettings(await removeFromAllowlist(h))}>Remove</button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
