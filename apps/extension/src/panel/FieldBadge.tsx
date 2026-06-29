/** Per-field status pill (Region A) — verdigris verified, brass edited, rust missing. */
import type { FieldStatus } from '../state/types';

const MAP: Record<FieldStatus, { label: string; cls: string }> = {
  verified: { label: 'verified', cls: 'text-verdigris border-verdigris/40 bg-verdigris/5' },
  extracted: { label: 'read', cls: 'text-ink-soft border-line' },
  edited: { label: 'edited', cls: 'text-brass border-brass/40 bg-brass/5' },
  missing: { label: 'needs check', cls: 'text-rust border-rust/40 bg-rust/5' },
};

export function FieldBadge({ status }: { status: FieldStatus }) {
  const m = MAP[status];
  return (
    <span
      className={`font-mono text-[0.55rem] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-sm border whitespace-nowrap ${m.cls}`}
    >
      {m.label}
    </span>
  );
}
