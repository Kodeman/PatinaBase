/**
 * Coordination party tokens — Track 5 (the four ball-in-court courts).
 *
 * The prototype's four party dots (`pd-you` / `pd-sarah` / `pd-gc` / `pd-vendor`)
 * mapped onto the real `court` axis (00213): designer | client | gc | vendor.
 * Each token carries a label, a dot color (a globals.css brand var), short copy
 * for the court bar, and the "waiting on …" verb the open-item row uses.
 *
 * Pure data + tiny helpers — no React, no design-system import (keeps the Jest-ESM
 * boundary clean, like party-derived tokens elsewhere). Concrete party identity
 * (a named GC / vendor from project_parties, 00212) is layered on top by
 * `partyFor`, which falls back to these generic court tokens when no row exists.
 */

import type { Court } from '@/lib/document/coordination-derivation';

export interface CourtToken {
  /** The display label for the court ("You", "Client", "GC", "Vendor"). */
  label: string;
  /** The mono court-bar label ("in your court" / "waiting on …"). */
  barLabel: string;
  /** The "waiting on <who>" verb fragment for the open-item / sheet copy. */
  waitingOn: string;
  /** Dot color — a globals.css brand CSS var, used as inline `background`. */
  dotColor: string;
  /** Two-letter initials for a fallback avatar. */
  initials: string;
}

/**
 * The four court tokens. Colors follow the prototype palette exactly:
 *   · designer (you)  → clay        (--cl  = --color-clay)
 *   · client          → sage        (--sa  = --color-sage,  pd-sarah)
 *   · gc              → dusty-blue  (--db  = --color-dusty-blue, pd-gc)
 *   · vendor          → aged-oak    (--ao  = --color-aged-oak, pd-vendor)
 */
export const COURT_TOKENS: Record<Court, CourtToken> = {
  designer: {
    label: 'You',
    barLabel: 'in your court',
    waitingOn: 'you',
    dotColor: 'var(--color-clay)',
    initials: 'YO',
  },
  client: {
    label: 'Client',
    barLabel: 'waiting on the client',
    waitingOn: 'the client',
    dotColor: 'var(--color-sage)',
    initials: 'CL',
  },
  gc: {
    label: 'GC',
    barLabel: 'waiting on the GC',
    waitingOn: 'the GC',
    dotColor: 'var(--color-dusty-blue)',
    initials: 'GC',
  },
  vendor: {
    label: 'Vendor',
    barLabel: 'waiting on a vendor',
    waitingOn: 'a vendor',
    dotColor: 'var(--color-aged-oak)',
    initials: 'VE',
  },
};

/** The generic court token (no concrete party). */
export function courtToken(court: Court): CourtToken {
  return COURT_TOKENS[court];
}

/**
 * A concrete party row (00212) the court can point at — only the fields the
 * tokens need. (`CoordinationItem.court_party` from the hook is assignable.)
 */
export interface PartyLike {
  display_name: string | null;
  company_name: string | null;
  party_kind?: 'gc' | 'vendor' | 'client_rep' | 'other' | null;
}

/**
 * Resolve a display token for a court, layering a concrete project_parties row
 * (the named GC / vendor) over the generic court token when one is supplied.
 * Falls back to the generic court token (R46: a court is tracked even with no
 * party row yet). `clientName` lets the client court show the real client's name.
 */
export function partyFor(
  court: Court,
  opts?: { party?: PartyLike | null; clientName?: string | null },
): CourtToken {
  const base = COURT_TOKENS[court];

  // A named party row wins for gc/vendor/other courts.
  const party = opts?.party;
  if (party) {
    const name = firstNonEmpty(party.display_name, party.company_name);
    if (name) {
      return {
        ...base,
        label: name,
        barLabel: court === 'designer' ? base.barLabel : `waiting on ${name}`,
        waitingOn: name,
        initials: initialsFor(name),
      };
    }
  }

  // The client court can show the real client's name.
  if (court === 'client') {
    const name = firstNonEmpty(opts?.clientName);
    if (name) {
      return {
        ...base,
        label: name,
        barLabel: `waiting on ${name}`,
        waitingOn: name,
        initials: initialsFor(name),
      };
    }
  }

  return base;
}

/** Two-letter initials from a display name (uppercased; defensive on blanks). */
export function initialsFor(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '··';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function firstNonEmpty(...vals: (string | null | undefined)[]): string | null {
  for (const v of vals) {
    const t = (v ?? '').trim();
    if (t) return t;
  }
  return null;
}
