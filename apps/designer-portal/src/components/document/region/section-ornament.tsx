/**
 * The Section header's printed device (US-28 S1 `.orn`; specimens/shared.css):
 * three rules, nothing to read. A region's head and its folded seam both print
 * it, so a region looks the same closed as open.
 */
export function SectionOrnament() {
  return (
    <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
      <path d="M0 2h34M0 6h28M0 10h20" />
    </svg>
  );
}
