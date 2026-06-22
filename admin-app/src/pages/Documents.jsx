import { useEffect, useState, useCallback } from 'react';
import { getDocuments, deleteDocument } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import DeleteModal from '../components/DeleteModal';

function fmtDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fileIcon(ext) {
  return { pdf: '📄', docx: '📝', txt: '📃' }[ext] || '📁';
}

export default function Documents() {
  const { adminKey } = useAuth();
  const { addToast } = useToast();

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
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

  /* Auto-refresh while any doc is processing */
  useEffect(() => {
    const hasProcessing = docs.some(d => d.status === 'processing');
    if (!hasProcessing) return;
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [docs, load]);

  const filtered = docs.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      d.filename.toLowerCase().includes(q) ||
      (d.department || '').toLowerCase().includes(q) ||
      (d.author || '').toLowerCase().includes(q);
    const matchStatus = !statusFilter || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDocument(deleteTarget.id, adminKey);
      addToast(`"${deleteTarget.filename}" deleted.`, 'success');
      setDeleteTarget(null);
      load();
    } catch (e) {
      addToast('Delete failed: ' + e.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="tab-pane">
      <div className="page-header">
        <h2>📁 Knowledge Base</h2>
        <p>All ingested documents and their processing status</p>
      </div>

      {/* Toolbar */}
      <div className="docs-toolbar">
        <div className="search-box">
          <span>🔍</span>
          <input
            type="text"
            placeholder="Search by filename, department, author…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="completed">Indexed</option>
          <option value="processing">Processing</option>
          <option value="failed">Failed</option>
        </select>
        <button className="btn-sm" onClick={load} disabled={loading}>
          ↻ Refresh
        </button>
      </div>

      {/* Table */}
      <div className="panel">
        <div className="panel-body no-pad">
          <table className="docs-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Department</th>
                <th>Author</th>
                <th>Status</th>
                <th>Uploaded</th>
                <th>S3</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><div className="empty-state">⏳ Loading…</div></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8}><div className="empty-state">📥 No documents found.</div></td></tr>
              ) : filtered.map(d => (
                <tr key={d.id}>
                  <td className="filename">
                    {fileIcon(d.file_type)} <span title={d.filename}>{d.filename}</span>
                  </td>
                  <td><span className="type-badge">{d.file_type.toUpperCase()}</span></td>
                  <td>{d.department || '—'}</td>
                  <td>{d.author || '—'}</td>
                  <td><StatusBadge status={d.status} /></td>
                  <td className="date-cell">{fmtDate(d.upload_timestamp)}</td>
                  <td>
                    {d.s3_url
                      ? <a href={d.s3_url} target="_blank" rel="noreferrer" className="s3-link">🔗 S3</a>
                      : <span className="muted-text">Local</span>
                    }
                  </td>
                  <td>
                    <button
                      className="btn-delete-doc"
                      onClick={() => setDeleteTarget(d)}
                      title="Delete document"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {deleteTarget && (
        <DeleteModal
          docName={deleteTarget.filename}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
