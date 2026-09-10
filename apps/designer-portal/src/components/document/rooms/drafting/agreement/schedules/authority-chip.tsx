"use client";

/**
 * `creates authority` · `creates authority · deposit only` · `record only`
 *
 * The micro-label a schedule part wears in the editor's header, on its row in
 * the rail, and on its card in the Library picker. It says one thing: whether
 * the figure inside this part becomes billing authority, or is only written
 * down. R9 draws the line; `authorityStanding` is where it is drawn.
 *
 * Room type: the same mono uppercase LABEL the Contract Room uses everywhere.
 * A record-only part wears the quieter ink — it is not a warning, and there is
 * no badge, no count, no colour-as-status.
 */

import {
  AUTHORITY_STANDING_LABEL,
  authorityStanding,
  type AuthorityStanding,
} from "./index";

const INK: Record<AuthorityStanding, string> = {
  authority: "text-[var(--color-charcoal)]",
  "deposit-only": "text-[var(--color-charcoal)]",
  "record-only": "text-[var(--ink-subtle)]",
};

export function AuthorityChip({
  variant,
  className,
}: {
  variant: string | null | undefined;
  className?: string;
}) {
  const standing = authorityStanding(variant);
  return (
    <span
      data-authority-standing={standing}
      className={`font-mono text-[11px] font-semibold uppercase tracking-[0.08em] ${INK[standing]}${
        className ? ` ${className}` : ""
      }`}
    >
      {AUTHORITY_STANDING_LABEL[standing]}
    </span>
  );
}
