import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getConfig } from '../services/api';

export default function Settings() {
  const { adminKey, logout } = useAuth();
  const { addToast } = useToast();
  const [config, setConfig] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(e => addToast('Failed to load config: ' + e.message, 'error'));
  }, [addToast]);

  const serverUrl = `${window.location.protocol}//${window.location.host}`;
  const wixCode = `// ═══════════════════════════════════════════════════════
// Wix Velo — http-functions.js
// Paste into: Backend → http-functions.js in Wix Editor
// ═══════════════════════════════════════════════════════
import { ok, badRequest, serverError } from 'wix-http-functions';
import { fetch } from 'wix-fetch';

const RAG_BACKEND_URL = '${serverUrl}/api/wix-chat';

export async function post_ragChat(request) {
  try {
    const body = await request.body.json();
    if (!body.message) return badRequest({ body: JSON.stringify({ error: 'message required' }) });

    const res = await fetch(RAG_BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: body.message, session_id: body.session_id || null }),
    });
    const data = await res.json();
    if (!res.ok) return serverError({ body: JSON.stringify({ error: data.detail }) });

    return ok({
      body: JSON.stringify({ reply: data.reply, sources: data.sources }),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return serverError({ body: JSON.stringify({ error: err.message }) });
  }
}`;

  const copyCode = () => {
    navigator.clipboard.writeText(wixCode).then(() => {
      setCopied(true);
      addToast('Code copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="tab-pane">
      <div className="page-header">
        <h2>⚙️ System Settings</h2>
        <p>Backend configuration and Wix integration guide</p>
      </div>

      <div className="settings-grid">
        {/* Backend config */}
        <div className="panel settings-panel">
          <div className="panel-header"><h3>🖥️ Backend Configuration</h3></div>
          <div className="panel-body">
            {config ? [
              ['LLM Provider', config.llm_provider],
              ['LLM Model',    config.llm_model],
              ['Database',     config.database_type],
              ['S3 Storage',   config.s3_enabled ? '✓ Enabled' : '✗ Disabled (local)'],
              ['S3 Bucket',    config.s3_bucket || '—'],
            ].map(([k, v]) => (
              <div key={k} className="config-row">
                <span className="config-key">{k}</span>
                <span className="config-val">{v}</span>
              </div>
            )) : <div className="loading-state">Loading…</div>}
          </div>
        </div>

        {/* Wix integration */}
        <div className="panel settings-panel">
          <div className="panel-header"><h3>🧩 Wix Integration</h3></div>
          <div className="panel-body">
            <p className="settings-description">
              Paste this into your Wix site&rsquo;s Velo editor under{' '}
              <code>Backend → http-functions.js</code>:
            </p>
            <div className="code-block">
              <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copyCode}>
                {copied ? '✓' : '📋'}
              </button>
              <pre><code>{wixCode}</code></pre>
            </div>
            <div className="wix-steps">
              <h4>📋 Setup Steps</h4>
              <ol>
                <li>Open Wix Editor → <strong>Dev Mode</strong> → Enable Velo</li>
                <li>Go to <strong>Backend → http-functions.js</strong></li>
                <li>Paste the code above</li>
                <li>Publish your site</li>
                <li>Test: <code>POST /_functions/ragChat</code> with <code>&#123;"message":"…"&#125;</code></li>
              </ol>
            </div>
          </div>
        </div>

        {/* Admin key */}
        <div className="panel settings-panel">
          <div className="panel-header"><h3>🔑 Admin API Key</h3></div>
          <div className="panel-body">
            <p className="settings-description">
              Set via <code>ADMIN_API_KEY</code> in your server <code>.env</code>.
              Rotate by updating the env and restarting.
            </p>
            <div className="key-display">
              <span className="key-dots">{showKey ? adminKey : '●●●●●●●●●●●●●●●●'}</span>
              <button className="btn-sm" onClick={() => setShowKey(v => !v)}>
                {showKey ? '🙈 Hide' : '👁️ Show'}
              </button>
            </div>
            <button className="btn-sm danger" onClick={logout} style={{ marginTop: 12 }}>
              ↩ Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
