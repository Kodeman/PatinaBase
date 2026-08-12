/**
 * Ink stamp (spec v1.1 §10): DM Mono 600 uppercase, 1.5px state-color
 * border, 3px radius, −1.5° rotation, transparent fill. The rotation is
 * the entire skeuomorphism budget for state. `ink` optionally darkens the
 * text against paper while the border keeps the brand color.
 */

/**
 * `size` — 'xs' is the historical 10px mark, kept as the default so no existing
 * surface shifts. 'sm' is the 12px metadata floor the Document's newer surfaces
 * hold to (R7's lifecycle stamp, I114–I120); the grammar is identical at both.
 */
export function Stamp({
  label,
  color,
  ink,
  size = 'xs',
}: {
  label: string;
  color: string;
  ink?: string;
  size?: 'xs' | 'sm';
}) {
  return (
    <span
      className={`inline-block -rotate-[1.5deg] whitespace-nowrap rounded-[3px] border-[1.5px] bg-transparent px-[9px] py-[3px] font-mono font-semibold uppercase ${
        size === 'sm'
          ? 'text-[12px] tracking-[0.08em]'
          : 'text-[10px] tracking-[0.1em]'
      }`}
      style={{ borderColor: color, color: ink ?? color }}
    >
      {label}
    </span>
  );
}
