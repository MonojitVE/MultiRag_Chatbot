import { CheckCircle2, Loader2, XCircle, HelpCircle } from 'lucide-react';

const STATUS_MAP = {
  completed:  { label: 'Indexed',    cls: 'badge-green',  Icon: CheckCircle2 },
  processing: { label: 'Processing', cls: 'badge-amber',  Icon: Loader2 },
  failed:     { label: 'Failed',     cls: 'badge-red',    Icon: XCircle },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_MAP[status] || { label: status, cls: 'badge-gray', Icon: HelpCircle };
  const { Icon } = cfg;
  return (
    <span className={`badge ${cfg.cls} ${status === 'processing' ? 'badge-spin' : ''}`}>
      <Icon /> {cfg.label}
    </span>
  );
}
