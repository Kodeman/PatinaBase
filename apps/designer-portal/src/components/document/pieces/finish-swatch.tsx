/**
 * The finish swatch (US-21 S8, a11): its own file, so the overview's room row
 * can show the wall's color without loading the Finishes lens.
 */

import type { RoomFinish } from "@patina/types";

/**
 * The swatch: a 24×24 rect filled with the color, a 1px rule in the
 * surrounding faint ink (SPEC §1, a11). With no color it is an empty box.
 */
export function FinishSwatch({
  hex,
  label,
}: {
  hex: string | null;
  label: string;
}) {
  if (!hex) {
    return (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="0.5"
          y="0.5"
          width="23"
          height="23"
          fill="none"
          stroke="currentColor"
          strokeDasharray="2 2"
        />
      </svg>
    );
  }
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      <rect
        x="0.5"
        y="0.5"
        width="23"
        height="23"
        fill={hex}
        stroke="currentColor"
      />
    </svg>
  );
}

/** How a swatch is named aloud: `Setting Plaster swatch`, else its hex's. */
export function swatchLabel(finish: Pick<RoomFinish, "product" | "hex">) {
  return `${finish.product ?? finish.hex} swatch`;
}
