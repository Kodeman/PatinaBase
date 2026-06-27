/**
 * Status chip (Desk light restyle): a 6px status-color dot + a DM Mono
 * uppercase label. No fill, no pill, no rotation — the dot carries the status
 * hue, the type carries the word. Replaces the rotated Stamp on the folio face
 * (the Stamp is retained inside the document view).
 */

export function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
