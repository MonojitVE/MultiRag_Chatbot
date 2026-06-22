import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getConfig } from '../services/api';

export default function LoginGate() {
  const { login } = useAuth();
  const { addToast } = useToast();
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    setError('');
    try {
      await getConfig(); // verify server reachable
      login(key.trim());
      addToast('Welcome to the Admin Panel!', 'success');
    } catch {
      setError('Could not connect to the backend. Make sure the server is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">🛡️</div>
          <h1>RAG Admin Panel</h1>
          <p>Enter your admin API key to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-input-group">
            <label htmlFor="adminKey">Admin API Key</label>
            <div className="password-wrapper">
              <input
                id="adminKey"
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Enter your admin API key..."
                autoComplete="current-password"
              />
              <button
                type="button"
                className="toggle-pw-btn"
                onClick={() => setShowKey(v => !v)}
                aria-label="Toggle visibility"
              >
                {showKey ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error">
              ⚠️ <span>{error}</span>
            </div>
          )}

          <button type="submit" className="btn-login" disabled={loading || !key.trim()}>
            {loading ? 'Connecting…' : 'Access Admin Panel'} →
          </button>
        </form>

        <p className="login-hint">
          Key is set via <code>ADMIN_API_KEY</code> in your server <code>.env</code>
        </p>
      </div>
    </div>
  );
}
