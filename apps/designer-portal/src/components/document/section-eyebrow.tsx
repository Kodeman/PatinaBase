/**
 * Section eyebrow (Desk light restyle): the strata mini-mark + a DM Mono
 * uppercase label, with an optional count in Clay. The three lines descend in
 * width and fade Mocha → Clay → Clay — the brand's quiet section device.
 * Replaces the old dark SectionLabel on the light Desk. The label content
 * (including any `id` span for `aria-labelledby`) is passed as children.
 *
 * QA-2 — THE LABEL IS ITS OWN ELEMENT, AND THE COUNT IS A LABELLED FACT.
 * The label and the count used to sit as bare siblings inside the <h2> with
 * only a flex gap between them, so the heading's own text read "Studio side2"
 * and its accessible name "Studio side 2" — no element anywhere said exactly
 * "Studio side", which SPEC §5.4 #4 and direction §3.4 name as the band's
 * heading. The label now carries its own <span>, and the digits are spoken
 * through a labelled companion rather than as tail digits on the heading.
 */

export function SectionEyebrow({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <h2 className="mb-4 flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
      <span aria-hidden className="inline-flex flex-col gap-[2px]">
        <i className="block h-[1.5px] w-[34px] rounded-[1px] bg-[var(--color-mocha)]" />
        <i className="block h-[1.5px] w-[24px] rounded-[1px] bg-[var(--color-clay)] opacity-70" />
        <i className="block h-[1.5px] w-[14px] rounded-[1px] bg-[var(--color-clay)] opacity-[0.35]" />
      </span>
      <span>{children}</span>
      {typeof count === 'number' && count > 0 && (
        <>
          <span aria-hidden className="text-[var(--color-clay-ink)]">
            {count}
          </span>
          <span className="sr-only">{`, ${count} listed`}</span>
        </>
      )}
    </h2>
  );
}
