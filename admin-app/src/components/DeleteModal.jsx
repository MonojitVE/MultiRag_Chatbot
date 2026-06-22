export default function DeleteModal({ docName, onConfirm, onCancel, loading }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-icon danger">🗑️</div>
        <h3>Delete Document?</h3>
        <p>
          <strong>"{docName}"</strong> will be permanently removed — including all
          chunks, vectors, and the S3 object.
        </p>
        <div className="modal-actions">
          <button className="btn-modal-cancel" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className="btn-modal-danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting…' : '🗑️ Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
