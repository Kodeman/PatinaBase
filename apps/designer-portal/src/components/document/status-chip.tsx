/**
 * Status chip (Desk light restyle): a 6px status-color dot + a DM Mono
 * uppercase label. Approved client responses take the US-45 green record
 * treatment; all other chips keep the unfilled dot and muted label.
 */

export function StatusChip({ label, color, tone }: { label: string; color: string; tone?: 'record' }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-mono text-[11px] font-semibold uppercase tracking-[0.1em] ${tone === 'record' ? 'border border-[var(--color-forest)] bg-[var(--color-green-record)] px-1.5 py-0.5 text-[var(--color-forest)]' : 'text-[var(--text-muted)]'}`}>
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
