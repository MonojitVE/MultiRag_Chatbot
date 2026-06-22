import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, FolderOpen, CloudUpload, Settings, LogOut } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'documents', label: 'Documents',  icon: FolderOpen },
  { id: 'upload',    label: 'Upload',     icon: CloudUpload },
  { id: 'settings',  label: 'Settings',   icon: Settings },
];

export default function Sidebar({ activeTab, onTabChange, docCount, status }) {
  const { logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.5V20a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.5c2.9-1.2 5-4.1 5-7.5a8 8 0 0 0-8-8z"/>
            <path d="M10 22h4"/>
            <path d="M9 10h.01"/>
            <path d="M15 10h.01"/>
            <path d="M12 14a2 2 0 0 0 2-2"/>
          </svg>
        </div>
        <div className="brand-text">
          <span className="brand-name">AETHER</span>
          <span className="brand-sub">Admin Panel</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              <span className="nav-icon"><Icon /></span>
              <span className="nav-label">{item.label}</span>
              {item.id === 'documents' && (
                <span className="nav-badge">{docCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="server-status">
          <span className={`status-dot ${status}`} />
          <span className="status-label">
            {status === 'online' ? 'Connected' : 'Offline'}
          </span>
        </div>
        <button className="btn-logout" onClick={logout} title="Sign out">
          <LogOut />
        </button>
      </div>
    </aside>
  );
}
