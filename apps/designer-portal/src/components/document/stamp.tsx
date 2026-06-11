/**
 * Ink stamp (spec v1.1 §10): DM Mono 600 uppercase, 1.5px state-color
 * border, 3px radius, −1.5° rotation, transparent fill. The rotation is
 * the entire skeuomorphism budget for state. `ink` optionally darkens the
 * text against paper while the border keeps the brand color.
 */

export function Stamp({
  label,
  color,
  ink,
}: {
  label: string;
  color: string;
  ink?: string;
}) {
  return (
    <span
      className="inline-block -rotate-[1.5deg] whitespace-nowrap rounded-[3px] border-[1.5px] bg-transparent px-[9px] py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
      style={{ borderColor: color, color: ink ?? color }}
    >
      {label}
    </span>
  );
}
