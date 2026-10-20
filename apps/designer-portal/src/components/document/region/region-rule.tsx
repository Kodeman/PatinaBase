/**
 * The mark at the head of a region — a printed device, not a divider with
 * meaning. Purely presentational: it carries no name, no state, and nothing for
 * a screen reader to read, so it is hidden from the accessibility tree outright.
 *
 * US-28 S7 (uplift.md area 2; house sheet §G), US-43 R3: each region is a
 * Section that CLOSES on its own 1px `--hairline-strong` with 48px of space
 * below. The mark names its region for that close —
 * `[data-region-rule]` — and the close is drawn on the region itself, under
 * the paper (`[data-document-paper]`, globals.css `US-28 S7 document`), so no
 * caller restructures. The next region opens on the previous one's close, so
 * `mid`, the default, draws nothing at the head.
 *
 * `strong` opens a movement: the double rule (`.doc-rule-strong`, the old
 * `.doc-region-rule` recipe) at the head, and the region still closes. It is
 * opt-in, at a site that opens a movement (the Pieces head; the Desk's day),
 * at most once per view; the hairline close above it keeps any charcoal edge
 * more than 48px away.
 */
export function RegionRule({
  className,
  weight = 'mid',
}: {
  className?: string;
  weight?: 'mid' | 'strong';
}) {
  return (
    <div
      aria-hidden="true"
      role="presentation"
      data-region-rule=""
      data-rule-weight={weight}
      className={[weight === 'strong' ? 'doc-rule-strong' : '', className ?? '']
        .join(' ')
        .trim() || undefined}
    />
  );
}
