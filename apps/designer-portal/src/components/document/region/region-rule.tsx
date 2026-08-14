/**
 * The rule that opens a region — a printed device, not a divider with meaning.
 * Purely presentational: it carries no name, no state, and nothing for a screen
 * reader to read, so it is hidden from the accessibility tree outright.
 */
export function RegionRule({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      role="presentation"
      className={['doc-region-rule', className ?? ''].join(' ').trim()}
    />
  );
}
