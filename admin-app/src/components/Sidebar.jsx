import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',  icon: '📊' },
  { id: 'documents', label: 'Documents',  icon: '📁' },
  { id: 'upload',    label: 'Upload',     icon: '☁️'  },
  { id: 'settings',  label: 'Settings',  icon: '⚙️'  },
];

export default function Sidebar({ activeTab, onTabChange, docCount, status }) {
  const { logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">🧠</div>
        <div className="brand-text">
          <span className="brand-name">AETHER</span>
          <span className="brand-sub">Admin Panel</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => onTabChange(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {item.id === 'documents' && (
              <span className="nav-badge">{docCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="server-status">
          <span className={`status-dot ${status}`} />
          <span className="status-label">
            {status === 'online' ? 'Connected' : 'Offline'}
          </span>
        </div>
        <button className="btn-logout" onClick={logout} title="Sign out">
          ↩
        </button>
      </div>
    </aside>
  );
}
