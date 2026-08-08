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

export interface ProjectRosterProjection {
  groups: GroupedRoster;
  rows: ProjectRosterRow[];
}

export interface RosterIdentity {
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
  profile_id?: string | null;
  studio_contact_id?: string | null;
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

// ============================================================================
// THE CLIENT (Wave 5) — the one name the view cannot give us
// ============================================================================

/**
 * `v_project_roster` has no client branch: it unions `project_parties` with
 * `project_team_members`, and the project's actual client lives on
 * `projects.client_id`. So the person the whole job is for never appeared in
 * the sheet's CLIENT SIDE group.
 *
 * Rather than widen the view (a migration for one row the document already
 * holds in hand), the /doc/[id] page — which already reads `client_name` /
 * `client_profile_id` for the letterhead — hands them down and this module
 * PREPENDS a synthetic row. It is marked by its `source`, never by its kind,
 * so every consumer can tell "the client" from "a party row that happens to
 * be kind=client".
 */
export const CLIENT_SYNTHETIC_SOURCE = 'client-synthetic';

export interface SyntheticClient {
  /** The document's `client_name`. Blank/absent means no client row at all. */
  name: string | null | undefined;
  /** The document's `client_profile_id` — non-null means they log in. */
  profileId?: string | null;
  projectId?: string | null;
}

/** True for the row this module synthesized rather than read from the view. */
export function isSyntheticClientRow(row: ProjectRosterRow): boolean {
  return row.source === CLIENT_SYNTHETIC_SOURCE;
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * The synthetic client row, or null when the document carries no client name.
 * `reach` derives normally off `profile_id` (ACCOUNT when they log in, ON
 * PAPER otherwise) — nothing special-cases it. `roster_id` is stable across
 * renders so the expanded-row state keyed on it survives a refetch.
 */
export function syntheticClientRow(
  client: SyntheticClient | null | undefined,
): ProjectRosterRow | null {
  const name = (client?.name ?? '').trim();
  if (!name) return null;
  const profileId = client?.profileId ?? null;
  return {
    roster_id: `client:${profileId || name}`,
    source: CLIENT_SYNTHETIC_SOURCE,
    project_id: client?.projectId ?? null,
    kind: 'client',
    display_name: name,
    company_name: null,
    email: null,
    phone: null,
    trade: null,
    job_title: null,
    staff_role: null,
    studio_contact_id: null,
    profile_id: profileId,
    show_to_client: null,
    has_active_field_link: false,
    sms_consent_status: null,
    updated_at: null,
  };
}

/**
 * Has a real `project_parties` row already claimed this client? A studio that
 * tracked the client as a party (same profile, or the same name typed by
 * hand) must not read twice on the sheet — the party row wins, because it is
 * the one with a phone number, a consent state, and actions under it.
 */
function clientAlreadyOnSheet(
  clientRows: ProjectRosterRow[],
  synthetic: ProjectRosterRow,
): boolean {
  return clientRows.some(
    (r) =>
      r.kind === 'client' &&
      ((!!synthetic.profile_id && r.profile_id === synthetic.profile_id) ||
        normalizeName(r.display_name) === normalizeName(synthetic.display_name)),
  );
}

// ============================================================================
// THE CHEVRON'S DESTINATION
// ============================================================================

/**
 * The party kinds `people_directory`'s party branch actually admits (00420) —
 * and therefore the only rows whose chevron can open PartyProfileSheet with
 * anything in it. 'vendor' / 'client_rep' / 'other' / 'client' are excluded
 * from the view by design, so a chevron on them would open an empty sheet.
 */
const PROFILE_OPENABLE_KINDS: readonly string[] = [
  'gc',
  'sub',
  'installer',
  'receiver',
  'architect',
  'photographer',
  'stager',
];

/**
 * The `PartyRole` to open PartyProfileSheet with for this row, or null when
 * the row has no profile to open (a team row, the synthetic client, or a
 * party kind the directory view excludes). Returned as a plain string so this
 * module keeps its type-only import surface; the caller casts.
 */
export function rosterProfileRole(row: ProjectRosterRow): string | null {
  if (row.source !== 'party' || !row.roster_id) return null;
  return PROFILE_OPENABLE_KINDS.includes(row.kind ?? '') ? (row.kind as string) : null;
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
 *
 * `client` (Wave 5, optional) is the document's own client identity. When
 * given — and when no party row already claims them — a synthetic client row
 * is PREPENDED to clientSide, ahead of the name sort: the client leads their
 * own side of the sheet, never sorts into the middle of their reps.
 */
export function groupRoster(
  rows: ProjectRosterRow[],
  client?: SyntheticClient | null,
): GroupedRoster {
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

  const synthetic = syntheticClientRow(client);
  if (synthetic && !clientAlreadyOnSheet(clientSide, synthetic)) {
    clientSide.unshift(synthetic);
  }

  return { studioSide, clientSide, buildSupply };
}

/** Every row the sheet shows, in group order — the array the vitals count. */
export function flattenRoster(groups: GroupedRoster): ProjectRosterRow[] {
  return [...groups.studioSide, ...groups.clientSide, ...groups.buildSupply];
}

function identityKeys(identity: RosterIdentity): string[] {
  const keys: string[] = [];
  const name = normalizeName(identity.display_name);
  const email = (identity.email ?? '').trim().toLowerCase();
  const phone = (identity.phone ?? '').replace(/\D/g, '');

  if (identity.profile_id) keys.push(`profile:${identity.profile_id}`);
  if (identity.studio_contact_id) keys.push(`contact:${identity.studio_contact_id}`);
  if (email) keys.push(`email:${email}:${name}`);
  if (phone) keys.push(`phone:${phone}:${name}`);

  return keys;
}

function dedupeRank(row: ProjectRosterRow): number {
  if (row.source === 'team') return 0;
  if (CLIENT_SIDE_KINDS.includes(row.kind ?? '')) return 1;
  return 2 + buildSupplyRank(row.kind);
}

/**
 * Collapse rows that resolve to the same permission-bearing profile, rolodex
 * card, email/name, or phone/name identity. Team membership wins a collision
 * because it is the access-bearing record; no identity is inferred from a
 * display name alone.
 */
export function dedupeRoster(rows: ProjectRosterRow[]): ProjectRosterRow[] {
  const ranked = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => dedupeRank(a.row) - dedupeRank(b.row) || a.index - b.index);
  const seen = new Set<string>();
  const unique: ProjectRosterRow[] = [];

  for (const { row } of ranked) {
    const keys = identityKeys(row);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    unique.push(row);
  }

  return unique;
}

export function rosterHasIdentity(
  rows: ProjectRosterRow[],
  identity: RosterIdentity,
): boolean {
  const candidate = new Set(identityKeys(identity));
  if (candidate.size === 0) return false;
  return rows.some((row) => identityKeys(row).some((key) => candidate.has(key)));
}

/** The one projection consumed by every project-roster surface. */
export function projectRosterProjection(
  rows: ProjectRosterRow[],
  client?: SyntheticClient | null,
): ProjectRosterProjection {
  const groups = groupRoster(dedupeRoster(rows), client);
  return { groups, rows: flattenRoster(groups) };
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

/**
 * The synthetic client (Wave 5) counts toward `total` and `withAccounts` —
 * they are on the job, and they do log in — but never toward `textable`:
 * there is no `project_parties` row behind them, so there is no consent
 * ledger and no SMS rail. Saying "reachable by text" about a row nothing can
 * text would be the one lie this line exists to avoid.
 */
export function vitals(rows: ProjectRosterRow[]): RosterVitals {
  let textable = 0;
  let withAccounts = 0;
  let onPaper = 0;
  for (const row of rows) {
    if (!isSyntheticClientRow(row) && row.sms_consent_status === 'granted') textable += 1;
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
