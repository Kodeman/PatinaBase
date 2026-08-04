/**
 * Call Sheet derivation (Wave 3) — pure presentation logic over
 * `v_project_roster` rows (00418). No React, no design-system, type-only
 * imports so the module stays off the ESM traps the jest suite hits elsewhere
 * (same posture as field-sms.ts / desk-derivation.ts).
 *
 * Three things live here, and nothing else:
 *   · `groupRoster`  — the deck's three sections (slide 11) and their order.
 *   · `reachState`   — the one sentence the whole program is about: does this
 *                      person log in, open a link, or only ever get a call.
 *   · `vitals`       — the sheet's mono line and the letterhead instrument's
 *                      terracotta suffix, counted from the same rows.
 *
 * INVARIANT (carried from the fold, 00418): `studio_contact_id` on a party row
 * does NOT mean "came from the rolodex" — the fold stamps client_rep/other rows
 * too, and an evidence-free fold card REUSES its source party's uuid as its
 * `studio_contacts.id`, so the two id spaces overlap by design. Nothing in this
 * file may branch on `studio_contact_id` to infer provenance; it doesn't.
 */

import type { ProjectRosterRow } from '@patina/supabase';

// ============================================================================
// GROUPING (slide 11)
// ============================================================================

export interface GroupedRoster {
  /** Source 'team' — real studio logins on this project. */
  studioSide: ProjectRosterRow[];
  /** Party kinds 'client' / 'client_rep'. */
  clientSide: ProjectRosterRow[];
  /** Everyone else, in trade order (see BUILD_SUPPLY_ORDER). */
  buildSupply: ProjectRosterRow[];
}

export type RosterGroup = keyof GroupedRoster;

/** The client half of the sheet — party kinds only (a team row is never here,
 *  the source check wins first). 'client' leads 'client_rep' (deck: the client,
 *  then the spouse / property manager). */
const CLIENT_SIDE_KINDS: readonly string[] = ['client', 'client_rep'];

/**
 * Build & supply order, straight off slide 11:
 *   architect → gc → subs → vendors → installers → receivers → photographer →
 *   stager → other.
 * A kind this list doesn't name sorts after every named one (never dropped,
 * never silently promoted) — the party_kind CHECK is code-resident vocab and
 * can widen ahead of this file.
 */
const BUILD_SUPPLY_ORDER: readonly string[] = [
  'architect',
  'gc',
  'sub',
  'vendor',
  'installer',
  'receiver',
  'photographer',
  'stager',
  'other',
];

function buildSupplyRank(kind: string | null | undefined): number {
  const i = BUILD_SUPPLY_ORDER.indexOf(kind ?? '');
  return i === -1 ? BUILD_SUPPLY_ORDER.length : i;
}

function nameOf(row: ProjectRosterRow): string {
  return (row.display_name ?? row.company_name ?? '').trim();
}

/** Case-insensitive name order — the tie-breaker inside every bucket. */
function byName(a: ProjectRosterRow, b: ProjectRosterRow): number {
  return nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' });
}

/**
 * Split a roster into the sheet's three groups.
 *
 * · studioSide  = `source === 'team'` — checked FIRST, so a team row can never
 *                 be pulled into the client half by its kind.
 * · clientSide  = party kind 'client' or 'client_rep', client before rep.
 * · buildSupply = everything else, in BUILD_SUPPLY_ORDER; within one kind by
 *                 trade (blank trades last — "subs by trade" on slide 11, and
 *                 the same rule reads correctly for a vendor's specialty),
 *                 then by name.
 *
 * Studio and client sides sort by name (there is no staff seniority column to
 * order by — `staff_role` is free TEXT with no rank, so inventing one here
 * would be a fiction).
 */
export function groupRoster(rows: ProjectRosterRow[]): GroupedRoster {
  const studioSide: ProjectRosterRow[] = [];
  const clientSide: ProjectRosterRow[] = [];
  const buildSupply: ProjectRosterRow[] = [];

  for (const row of rows) {
    if (row.source === 'team') {
      studioSide.push(row);
    } else if (CLIENT_SIDE_KINDS.includes(row.kind ?? '')) {
      clientSide.push(row);
    } else {
      buildSupply.push(row);
    }
  }

  studioSide.sort(byName);

  clientSide.sort((a, b) => {
    const ra = a.kind === 'client' ? 0 : 1;
    const rb = b.kind === 'client' ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return byName(a, b);
  });

  buildSupply.sort((a, b) => {
    const ra = buildSupplyRank(a.kind);
    const rb = buildSupplyRank(b.kind);
    if (ra !== rb) return ra - rb;
    const ta = (a.trade ?? '').trim();
    const tb = (b.trade ?? '').trim();
    if (ta !== tb) {
      if (!ta) return 1;
      if (!tb) return -1;
      return ta.localeCompare(tb, undefined, { sensitivity: 'base' });
    }
    return byName(a, b);
  });

  return { studioSide, clientSide, buildSupply };
}

// ============================================================================
// REACH (slide 11's reach chip — the argument of the whole program)
// ============================================================================

/** Mirrors `@patina/types` ReachState; re-declared structurally so this module
 *  keeps a type-only import surface. */
export type RosterReachState = 'account' | 'field_link' | 'on_paper';

/**
 * How this person is actually reachable, in strict precedence:
 *   1. `profile_id` non-null  → ACCOUNT   (they log in)
 *   2. `has_active_field_link` → FIELD LINK (a no-login link is live)
 *   3. otherwise               → ON PAPER  (a phone number and a hope)
 *
 * An account wins over a live field link deliberately: someone who can log in
 * is reachable that way whether or not a link happens to be minted.
 */
export function reachState(row: ProjectRosterRow): RosterReachState {
  if (row.profile_id) return 'account';
  if (row.has_active_field_link) return 'field_link';
  return 'on_paper';
}

// ============================================================================
// VITALS (the sheet's mono line + the letterhead instrument's suffix)
// ============================================================================

export interface RosterVitals {
  total: number;
  /** Consent actually granted — 'pending' is an invite, not a rail. */
  textable: number;
  withAccounts: number;
  onPaper: number;
}

export function vitals(rows: ProjectRosterRow[]): RosterVitals {
  let textable = 0;
  let withAccounts = 0;
  let onPaper = 0;
  for (const row of rows) {
    if (row.sms_consent_status === 'granted') textable += 1;
    if (row.profile_id) withAccounts += 1;
    if (reachState(row) === 'on_paper') onPaper += 1;
  }
  return { total: rows.length, textable, withAccounts, onPaper };
}

/**
 * The sheet's mono vitals line — "16 ON THE JOB · 6 REACHABLE BY TEXT ·
 * 4 WITH ACCOUNTS". Always all three counts, even at zero: a call sheet that
 * says "0 REACHABLE BY TEXT" is telling the truth the deck wants told.
 */
export function vitalsLine(rows: ProjectRosterRow[]): string {
  const v = vitals(rows);
  return `${v.total} ON THE JOB · ${v.textable} REACHABLE BY TEXT · ${v.withAccounts} WITH ACCOUNTS`;
}

/**
 * The letterhead instrument's terracotta tail — "· 2 ON PAPER", or '' when
 * nobody is. The instrument itself (letterhead-instruments.tsx) owns the
 * "CALL SHEET · N" head; this is only the number that needs saying out loud.
 */
export function vitalsInstrumentSuffix(rows: ProjectRosterRow[]): string {
  const { onPaper } = vitals(rows);
  return onPaper > 0 ? `· ${onPaper} ON PAPER` : '';
}

// ============================================================================
// KICKOFF RETIREMENT (slide 15)
// ============================================================================

/**
 * The kickoff band retires itself at four names — "not at a dismissal, not at
 * a don't-show-again checkbox, at the point where the sheet is doing its job"
 * (slide 15's figcap). LATER still writes the permanent dismissal; this is the
 * other, quieter way the band goes away.
 */
export function kickoffRetired(rows: ProjectRosterRow[]): boolean {
  return rows.length >= 4;
}
