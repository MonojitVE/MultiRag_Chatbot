import { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import LoginGate from './components/LoginGate';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import Upload from './pages/Upload';
import Settings from './pages/Settings';
import { getConfig, getDocuments } from './services/api';
import { Zap, Cloud } from 'lucide-react';

const TAB_LABELS = {
  dashboard: 'Dashboard',
  documents: 'Documents',
  upload: 'Upload',
  settings: 'Settings',
};

function AdminShell() {
  const { isLoggedIn } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [docCount, setDocCount] = useState(0);
  const [llmLabel, setLlmLabel] = useState('Loading…');
  const [s3Label, setS3Label] = useState('Checking…');
  const [serverStatus, setServerStatus] = useState('checking');

  const refreshTopbar = useCallback(async () => {
    try {
      const [cfg, docs] = await Promise.all([getConfig(), getDocuments()]);
      setLlmLabel(`${cfg.llm_provider}: ${cfg.llm_model}`);
      setS3Label(`S3: ${cfg.s3_enabled ? 'Enabled' : 'Local'}`);
      setDocCount(docs.length);
      setServerStatus('online');
    } catch {
      setServerStatus('offline');
      setLlmLabel('Unreachable');
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) refreshTopbar();
  }, [isLoggedIn, refreshTopbar]);

  if (!isLoggedIn) return <LoginGate />;

  const pages = {
    dashboard: <Dashboard onTabChange={setTab} />,
    documents: <Documents />,
    upload:    <Upload onTabChange={setTab} />,
    settings:  <Settings />,
  };

  return (
    <div className="app-shell">
      <Sidebar
        activeTab={tab}
        onTabChange={setTab}
        docCount={docCount}
        status={serverStatus}
      />

      <main className="main-area">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <nav className="breadcrumb">
              <span>Admin</span>
              <span className="bc-sep">›</span>
              <span className="bc-active">{TAB_LABELS[tab]}</span>
            </nav>
          </div>
          <div className="topbar-right">
            <div className="topbar-badge"><Zap /> {llmLabel}</div>
            <div className="topbar-badge s3-badge"><Cloud /> {s3Label}</div>
          </div>
        </header>

        {/* Page content */}
        <div className="page-content">
          {pages[tab]}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AdminShell />
      </ToastProvider>
    </AuthProvider>
  );
}
