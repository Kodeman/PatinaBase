/**
 * H5 / D-B16 — a region's OUTER box does not depend on its density.
 *
 * Promotion may only change what is INSIDE a region root. The moment quiet and
 * full disagree about the root's own top margin, its border, its reserve, or
 * whether a `RegionRule` is mounted, a stop opening ahead of the reader moves
 * every root below it — the layout shift H5 forbids and `lens-density`'s
 * region-top invariant measures in the browser.
 *
 * jsdom loads no stylesheet, so a computed `marginTop` there is always `0px`
 * and proves nothing. The class list is what actually decides the box under
 * Tailwind, so that is what this compares — sorted, so a re-ordering is not a
 * false alarm — together with the inline reserve custom property and the rule
 * count.
 *
 * Not a test file: the six region suites import it into their own quiet → full
 * cases, where the pair is already rendered.
 */

export function regionBoxSignature(root: Element | null | undefined): string {
  if (!root) return '<no root>';
  const el = root as HTMLElement;
  return JSON.stringify({
    className: el.className
      .toString()
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(' '),
    reserve: el.style?.getPropertyValue('--doc-quiet-reserve') ?? '',
    rules: el.querySelectorAll('[data-rule-weight]').length,
  });
}
