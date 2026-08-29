/**
 * The rule that opens a region — a printed device, not a divider with meaning.
 * Purely presentational: it carries no name, no state, and nothing for a screen
 * reader to read, so it is hidden from the accessibility tree outright.
 *
 * R126 — three rule weights, three ranks. A region head ends on the 1.5px
 * charcoal rule (`mid`); only a rule that OPENS A MOVEMENT takes the double
 * rule (`strong`, the old `.doc-region-rule` recipe). The mockup draws exactly
 * one of the latter, on the Pieces head.
 *
 * `strong` is the DEFAULT, and stays it. The mockup draws none of the eleven
 * other call sites (mood boards, care, schedule, money, the approval
 * document), so a `mid` default would have demoted all eleven — a 6px double
 * rule to a 1.5px single line — by omission rather than by ruling. `mid` is
 * opt-in, at a site someone has actually looked at.
 */
export function RegionRule({
  className,
  weight = 'strong',
}: {
  className?: string;
  weight?: 'mid' | 'strong';
}) {
  return (
    <div
      aria-hidden="true"
      role="presentation"
      data-rule-weight={weight}
      className={[
        weight === 'strong' ? 'doc-rule-strong' : 'doc-rule-mid',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    />
  );
}
