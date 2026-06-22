import { useEffect, useState, useCallback } from 'react';
import { getDocuments } from '../services/api';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';

function StatCard({ icon, value, label, colorClass }) {
  return (
    <div className={`stat-card stat-${colorClass}`}>
      <div className={`stat-icon icon-${colorClass}`}>{icon}</div>
      <div className="stat-body">
        <span className="stat-value">{value ?? '—'}</span>
        <span className="stat-label">{label}</span>
      </div>
    </div>
  );
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fileIcon(ext) {
  return { pdf: '📄', docx: '📝', txt: '📃' }[ext] || '📁';
}

export default function Dashboard({ onTabChange }) {
  const { addToast } = useToast();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getDocuments();
      setDocs(data);
    } catch (e) {
      addToast('Failed to load documents: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const total      = docs.length;
  const indexed    = docs.filter(d => d.status === 'completed').length;
  const processing = docs.filter(d => d.status === 'processing').length;
  const failed     = docs.filter(d => d.status === 'failed').length;
  const recent     = docs.slice(0, 6);

  return (
    <div className="tab-pane">
      <div className="page-header">
        <h2>📊 Dashboard</h2>
        <p>Overview of your RAG knowledge base</p>
      </div>

      {/* Stats grid */}
      <div className="stats-grid">
        <StatCard icon="📂" value={total}      label="Total Documents"  colorClass="indigo" />
        <StatCard icon="✅" value={indexed}    label="Indexed & Ready"  colorClass="green"  />
        <StatCard icon="⏳" value={processing} label="Processing"       colorClass="amber"  />
        <StatCard icon="❌" value={failed}     label="Failed"           colorClass="red"    />
      </div>

      {/* Recent docs */}
      <div className="panel">
        <div className="panel-header">
          <h3>🕐 Recent Documents</h3>
          <button className="btn-sm" onClick={load} disabled={loading}>
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="loading-state">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="empty-state">
              <span>📥</span>
              <p>No documents yet. Upload your first document.</p>
            </div>
          ) : (
            recent.map(d => (
              <div key={d.id} className="recent-doc-item">
                <div className="doc-icon">{fileIcon(d.file_type)}</div>
                <div className="doc-info">
                  <div className="doc-name">{d.filename}</div>
                  <div className="doc-meta">{fmtDate(d.upload_timestamp)} · {d.department || 'No dept'}</div>
                </div>
                <StatusBadge status={d.status} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="quick-actions">
        <button className="quick-action-btn" onClick={() => onTabChange('upload')}>
          ☁️ Upload Documents
        </button>
        <button className="quick-action-btn" onClick={() => onTabChange('documents')}>
          📁 Manage Documents
        </button>
        <a href="/api/docs" target="_blank" rel="noreferrer" className="quick-action-btn">
          📖 API Docs
        </a>
      </div>
    </div>
  );
}
