/**
 * Coordination item-type tokens — Track 5 (the five workflow shapes).
 *
 * The prototype's `.item-type` chip (`.ty-selection` … `.ty-punch`) mapped onto
 * the real `coordination_kind` axis (00213): selection | rfi | submittal |
 * signoff | punch. Each token carries a label, the chip's color trio (border /
 * ink / tint — all globals.css brand vars, matching the prototype palette), the
 * "who acts" copy the composer's type grid shows, and `resolveKind` — the
 * per-type resolve panel the open-item sheet mounts (a later slice).
 *
 * Pure data — no React, no design-system. Chip colors are exposed as a
 * CSSProperties-shaped object of brand vars so the chip renders shadow-free (D4)
 * with a 1.5px brand border + a faint brand tint, exactly like the prototype.
 */

import type { CoordinationKind } from '@/lib/document/coordination-derivation';

/** The resolve panel an item's sheet mounts, by workflow shape. */
export type ResolveKind = 'select' | 'answer' | 'approve' | 'sign' | 'verify';

/** The chip's three brand colors (border / ink / tint). All globals.css vars or
 *  rgba tints of them, so nothing is redefined locally. */
export interface ChipColors {
  /** 1.5px border color. */
  border: string;
  /** Label ink. */
  ink: string;
  /** Faint fill tint behind the label. */
  tint: string;
}

export interface ItemTypeToken {
  /** Uppercase mono chip label ("Selection" / "RFI" / "Submittal" / …). */
  label: string;
  /** The composer type-grid "who acts" copy. */
  who: string;
  /** The resolve panel kind the sheet mounts for this type. */
  resolveKind: ResolveKind;
  /** Brand chip colors (border / ink / tint). */
  colors: ChipColors;
}

/**
 * The five type tokens. Colors mirror the prototype's `.ty-*` rules onto the
 * existing brand vars:
 *   · selection → golden-hour (the decision palette)
 *   · rfi       → dusty-blue
 *   · submittal → aged-oak
 *   · signoff   → golden-hour (a slightly stronger tint than selection)
 *   · punch     → terracotta
 */
export const ITEM_TYPE_TOKENS: Record<CoordinationKind, ItemTypeToken> = {
  selection: {
    label: 'Selection',
    who: 'pick an option',
    resolveKind: 'select',
    colors: {
      border: 'var(--color-golden-hour)',
      ink: '#9A7B2E',
      tint: 'rgba(232, 197, 71, 0.08)',
    },
  },
  rfi: {
    label: 'RFI',
    who: 'answer a question',
    resolveKind: 'answer',
    colors: {
      border: 'var(--color-dusty-blue)',
      ink: 'var(--color-dusty-blue)',
      tint: 'rgba(139, 156, 173, 0.08)',
    },
  },
  submittal: {
    label: 'Submittal',
    who: 'review & approve',
    resolveKind: 'approve',
    colors: {
      border: '#CBB48F',
      ink: 'var(--color-aged-oak)',
      tint: 'rgba(139, 115, 85, 0.06)',
    },
  },
  signoff: {
    label: 'Sign-off',
    who: 'approval gate',
    resolveKind: 'sign',
    colors: {
      border: 'var(--color-golden-hour)',
      ink: '#B8923A',
      tint: 'rgba(232, 197, 71, 0.12)',
    },
  },
  punch: {
    label: 'Punch',
    who: 'closeout fix',
    resolveKind: 'verify',
    colors: {
      border: 'var(--color-terracotta)',
      ink: 'var(--color-terracotta-ink)',
      tint: 'rgba(212, 160, 144, 0.08)',
    },
  },
};

/** The display order for the composer's type grid (the prototype's order). */
export const ITEM_TYPE_ORDER: readonly CoordinationKind[] = [
  'selection',
  'rfi',
  'submittal',
  'signoff',
  'punch',
] as const;

/** The token for a coordination kind (defensive default = selection). */
export function itemTypeToken(kind: CoordinationKind): ItemTypeToken {
  return ITEM_TYPE_TOKENS[kind] ?? ITEM_TYPE_TOKENS.selection;
}

/** The resolve panel kind for a coordination item. */
export function resolveKind(kind: CoordinationKind): ResolveKind {
  return itemTypeToken(kind).resolveKind;
}

/**
 * The chip's inline style — a flat, shadow-free (D4) 1.5px brand border + faint
 * brand tint + brand ink, matching the prototype `.item-type` exactly. Returned
 * as a plain object (CSSProperties-shaped) so callers spread it onto `style`
 * without importing React types here.
 */
export function chipStyle(kind: CoordinationKind): {
  color: string;
  borderColor: string;
  backgroundColor: string;
} {
  const { colors } = itemTypeToken(kind);
  return {
    color: colors.ink,
    borderColor: colors.border,
    backgroundColor: colors.tint,
  };
}
