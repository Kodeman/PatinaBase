import { modeLabel, type ShipmentMode } from '@patina/fulfillment';

// ModeChip (S5, spec §5.4) — the Shipment Board's first-position identifier:
// "rows are shipments" and the mode (parcel|ltl|white_glove) is the first
// thing an operator needs to read about one, so the chip leads every row.
// Small DM Mono uppercase label in a hairline border — same flat, no-shadow
// register as the rest of Back of House (no filled badge, no color-coding
// beyond the freight modes' slightly heavier border — LTL/white_glove carry
// the appointment-gate obligation the chip's border weight quietly signals).

export interface ModeChipProps {
  mode: ShipmentMode | string;
}

export function ModeChip({ mode }: ModeChipProps) {
  const freight = mode === 'ltl' || mode === 'white_glove';
  return (
    <span
      data-testid="mode-chip"
      data-mode={mode}
      className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.1em]"
      style={{
        fontFamily: 'var(--font-meta)',
        border: `1px solid var(--border-${freight ? 'strong' : 'default'}, var(--border-default))`,
        color: 'var(--text-primary)',
      }}
    >
      {modeLabel(mode)}
    </span>
  );
}
