export default function StatusBadge({ status }) {
  const map = {
    completed:  { label: 'Indexed',    cls: 'badge-green',  icon: '✓' },
    processing: { label: 'Processing', cls: 'badge-amber',  icon: '⟳' },
    failed:     { label: 'Failed',     cls: 'badge-red',    icon: '✕' },
  };
  const cfg = map[status] || { label: status, cls: 'badge-gray', icon: '?' };
  return (
    <span className={`badge ${cfg.cls} ${status === 'processing' ? 'badge-spin' : ''}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}
