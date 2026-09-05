/**
 * SignedStamp — P-17 / R13, the designer's ground.
 *
 * The eleven-state stamp grammar is one mark with four dials: border weight,
 * border pigment, word ink, rotation. SIGNED is the terminal, most consequential
 * state: doubled border, mocha border, mocha word, −1.1deg. No fill, no shadow,
 * no check — sage stops carrying approval meaning here and stays a material
 * pigment (delivered goods, walkthrough phase) elsewhere.
 *
 * Local to the portal on purpose: this wave does not mint a shared package
 * component, and the general-purpose `Stamp` next door is a single-rule mark
 * at −1.5deg that a dozen non-approval surfaces already draw.
 *
 * The two pigments travel as custom properties rather than as direct
 * `borderColor` values: `color-mix` is dropped by jsdom's CSSOM, so a stamp
 * that set border-color inline could not be read back by any test.
 */

import type { CSSProperties } from 'react';

/** Outer rule — the state's pigment at the grammar's settled border opacity. */
export const SIGNED_STAMP_BORDER =
  'color-mix(in srgb, var(--color-mocha) 88%, transparent)';
/** The doubled rule, inset, at the grammar's inner weight. */
export const SIGNED_STAMP_INNER_RULE =
  'color-mix(in srgb, var(--color-mocha) 42%, transparent)';
/** Word ink never degrades — it is the pigment at full strength. */
export const SIGNED_STAMP_INK = 'var(--color-mocha)';

const STAMP_PIGMENTS = {
  '--signed-stamp-border': SIGNED_STAMP_BORDER,
  '--signed-stamp-rule': SIGNED_STAMP_INNER_RULE,
} as CSSProperties;

export function SignedStamp({ label = 'SIGNED' }: { label?: string }) {
  return (
    <span
      data-signed-stamp
      style={STAMP_PIGMENTS}
      className="relative inline-block -rotate-[1.1deg] whitespace-nowrap border-[1.5px] border-[color:var(--signed-stamp-border)] bg-transparent px-[9px] py-[3px] font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-mocha)]"
    >
      <span
        aria-hidden="true"
        data-signed-stamp-inner
        className="pointer-events-none absolute inset-[2.5px] border border-[color:var(--signed-stamp-rule)]"
      />
      {label}
    </span>
  );
}
