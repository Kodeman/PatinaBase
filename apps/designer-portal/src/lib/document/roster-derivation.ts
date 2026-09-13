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

import type {
  PeopleDirectorySeat,
  ProjectRosterRow,
  RosterBand,
} from '@patina/supabase';

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
  return seatProfileRole(row.kind);
}

/** The same truth, for a seat that carries only its kind. */
export function seatProfileRole(kind: string | null | undefined): string | null {
  return PROFILE_OPENABLE_KINDS.includes(kind ?? '') ? (kind as string) : null;
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

// ============================================================================
// THE CALL SHEET, BANDED BY THE WINDOW (direction §3.4, SPEC §5.4)
//
// Build & supply is retired. The sheet prints Studio side, Client side, and
// then the four window bands `rosterBandFor` decides. One row shape carries
// all three sources — a team login, the document's own client, and a seat off
// `people_directory_seats` — so the bands, the vitals and the row component
// never branch on which table a name came from.
//
// Pure. `today` is injected, every date is a DATE string compared as a string,
// and nothing here reads a clock or a hook.
// ============================================================================

/** The six bands the sheet prints, in the order it prints them. */
export type CallSheetBand =
  | 'studioSide'
  | 'clientSide'
  | 'this_week'
  | 'later'
  | 'bidding'
  | 'done';

export const CALL_SHEET_BANDS: readonly CallSheetBand[] = [
  'studioSide',
  'clientSide',
  'this_week',
  'later',
  'bidding',
  'done',
] as const;

/** The band headings. The four window labels match `ROSTER_BAND_LABELS`; they
 *  are restated here so the sheet's own two bands live in the same table. */
export const CALL_SHEET_BAND_LABELS: Record<CallSheetBand, string> = {
  studioSide: 'Studio side',
  clientSide: 'Client side',
  this_week: 'On the job · this week',
  later: 'On the job · later',
  bidding: 'Bidding',
  done: 'Done',
};

/** Where a row came from. A seat is the only kind that can be written to. */
export type CallSheetRowSource = 'seat' | 'team' | 'client';

/** One printable line on the Call Sheet. */
export interface CallSheetRow {
  key: string;
  /** `project_parties.id` — null for a team login and for the synthetic client. */
  seatId: string | null;
  /** The identity's `people_directory.person_id`, where the seat has one. */
  personId: string | null;
  /** `profiles.id` — a studio login. Present on the studio side and on the
   *  document's own client; a seat carries none. */
  profileId: string | null;
  source: CallSheetRowSource;
  name: string;
  partyKind: string | null;
  trade: string | null;
  companyName: string | null;
  companyId: string | null;
  /** The mono second line: role and title on the studio side, kind · trade on
   *  a seat. */
  meta: string;
  phone: string | null;
  email: string | null;
  phoneE164: string | null;
  reach: RosterReachState | null;
  /** `project_parties.stage` — the stored value, reduced to a word by the row. */
  stage: string | null;
  consent: string | null;
  paper: string | null;
  ruleSummary: string | null;
  onSiteFrom: string | null;
  onSiteTo: string | null;
  offJobAt: string | null;
  offJobReason: string | null;
  showToClient: boolean | null;
  projectId: string | null;
}

export interface CallSheetProjection {
  bands: Record<CallSheetBand, CallSheetRow[]>;
  rows: CallSheetRow[];
}

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** The date parts of a DATE column or a timestamp, read as written. Never a
 *  `new Date()` — a DATE string parsed as UTC and printed in a local zone
 *  loses a day west of Greenwich, which on a site window is a real day. */
function dateParts(value: string | null | undefined): [number, number, number] | null {
  const raw = (value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;
  const [, y, m, d] = match;
  const month = Number(m);
  if (month < 1 || month > 12) return null;
  return [Number(y), month, Number(d)];
}

/** "13 August 2027" — the long form every sentence uses. */
export function rosterLongDate(value: string | null | undefined): string {
  const parts = dateParts(value);
  if (!parts) return '';
  const [y, m, d] = parts;
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

/** "16 Oct 2026" — the short form the head line and the window use. */
export function rosterShortDate(value: string | null | undefined): string {
  const parts = dateParts(value);
  if (!parts) return '';
  const [y, m, d] = parts;
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** The window on a seat line: "12 Oct 2026 to 13 Aug 2027", "From 9 Nov 2026",
 *  "Until 19 Dec 2026", or nothing at all. */
export function seatWindowText(
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  const start = rosterShortDate(from);
  const end = rosterShortDate(to);
  if (start && end) return `${start} to ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return '';
}

function metaOf(kind: string | null, trade: string | null, kindLabel: string): string {
  return [kindLabel || (kind ?? ''), trade ?? ''].filter(Boolean).join(' · ');
}

/**
 * A seat, as a Call Sheet row. `roster` is the same seat's `v_project_roster`
 * line when the caller could read one: the seats view carries `phone_e164` but
 * no dialable phone and no email, and a row with a number nobody can tap is
 * the thing this program exists to end.
 */
export function callSheetRowFromSeat(
  seat: PeopleDirectorySeat,
  roster: ProjectRosterRow | undefined,
  kindLabel: string,
  tradeLabel: string,
): CallSheetRow {
  const name = seat.display_name ?? roster?.display_name ?? seat.company_name ?? 'Unnamed';
  return {
    key: `seat:${seat.seat_id}`,
    seatId: seat.seat_id,
    personId: seat.person_id,
    profileId: null,
    source: 'seat',
    name,
    partyKind: seat.party_kind,
    trade: seat.trade,
    companyName: seat.company_name ?? roster?.company_name ?? null,
    companyId: seat.company_id,
    meta: metaOf(seat.party_kind, tradeLabel || null, kindLabel),
    phone: roster?.phone ?? null,
    email: roster?.email ?? null,
    phoneE164: seat.phone_e164,
    reach: (seat.reach_state as RosterReachState | null) ?? null,
    stage: seat.stage,
    consent: seat.consent_status,
    paper: seat.paper_state,
    ruleSummary: seat.contact_rule_summary,
    onSiteFrom: seat.on_site_from,
    onSiteTo: seat.on_site_to,
    offJobAt: seat.off_job_at,
    offJobReason: seat.off_job_reason,
    showToClient: seat.show_to_client,
    projectId: seat.project_id,
  };
}

/** A studio login, as a Call Sheet row. Nothing writes to it: a team row is a
 *  `project_team_members` seat with no party behind it. */
export function callSheetRowFromTeam(
  row: ProjectRosterRow,
  meta: string,
): CallSheetRow {
  return {
    key: `team:${row.roster_id ?? row.display_name ?? ''}`,
    seatId: null,
    personId: null,
    profileId: row.profile_id,
    source: 'team',
    name: row.display_name ?? 'Unnamed',
    partyKind: row.kind,
    trade: row.trade,
    companyName: row.company_name,
    companyId: null,
    meta,
    phone: row.phone,
    email: row.email,
    phoneE164: null,
    reach: reachState(row),
    stage: null,
    consent: null,
    paper: null,
    ruleSummary: null,
    onSiteFrom: null,
    onSiteTo: null,
    offJobAt: null,
    offJobReason: null,
    showToClient: null,
    projectId: row.project_id,
  };
}

/** The document's own client, when no seat already claims them. */
export function callSheetRowFromClient(row: ProjectRosterRow): CallSheetRow {
  return {
    key: `client:${row.roster_id ?? row.display_name ?? ''}`,
    seatId: null,
    personId: null,
    profileId: row.profile_id,
    source: 'client',
    name: row.display_name ?? 'Unnamed',
    partyKind: 'client',
    trade: null,
    companyName: null,
    companyId: null,
    meta: 'The client',
    phone: row.phone,
    email: row.email,
    phoneE164: null,
    reach: reachState(row),
    stage: null,
    consent: null,
    paper: null,
    ruleSummary: null,
    onSiteFrom: null,
    onSiteTo: null,
    offJobAt: null,
    offJobReason: null,
    showToClient: null,
    projectId: row.project_id,
  };
}

/** Party kinds that stand on the client side of the sheet whatever their
 *  window says — the household is not crew and never bands by a site date. */
const CLIENT_BAND_KINDS: readonly string[] = ['client', 'client_rep'];

export interface CallSheetLabels {
  /** `getPartyKindLabel` — passed in so this module keeps a type-only import
   *  surface (the ESM trap the file's header names). */
  kindLabel: (kind: string | null | undefined) => string;
  tradeLabel: (kind: string | null | undefined, trade: string | null | undefined) => string;
  /** The studio side's own second line: role, and a title only when it adds
   *  something. */
  teamMeta: (row: ProjectRosterRow) => string;
}

/**
 * The whole sheet, in six bands.
 *
 * · Studio side — `v_project_roster`'s team branch.
 * · Client side — seats whose kind is `client` / `client_rep`, plus the
 *   document's own client when no seat claims them.
 * · this week / later / bidding / done — every other seat, banded by
 *   `rosterBandFor` (a done stage decides, then a bid stage, then the window).
 *
 * Seats are the source for the crew bands, `v_project_roster` for the studio
 * side, and the two are joined on the seat id for the phone and the email.
 */
export function callSheetProjection(
  rosterRows: ProjectRosterRow[],
  seats: PeopleDirectorySeat[],
  options: {
    client?: SyntheticClient | null;
    today: string;
    labels: CallSheetLabels;
    bandFor: (seat: { stage: string | null; on_site_from: string | null; on_site_to: string | null }, today: string) => RosterBand;
  },
): CallSheetProjection {
  const { client, today, labels, bandFor } = options;
  const bands: Record<CallSheetBand, CallSheetRow[]> = {
    studioSide: [],
    clientSide: [],
    this_week: [],
    later: [],
    bidding: [],
    done: [],
  };

  const rosterBySeat = new Map<string, ProjectRosterRow>();
  for (const row of rosterRows) {
    if (row.source === 'party' && row.roster_id) rosterBySeat.set(row.roster_id, row);
  }

  for (const row of rosterRows) {
    if (row.source === 'team') bands.studioSide.push(callSheetRowFromTeam(row, labels.teamMeta(row)));
  }
  bands.studioSide.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  for (const seat of seats) {
    const row = callSheetRowFromSeat(
      seat,
      rosterBySeat.get(seat.seat_id),
      labels.kindLabel(seat.party_kind),
      labels.tradeLabel(seat.party_kind, seat.trade),
    );
    if (CLIENT_BAND_KINDS.includes(seat.party_kind ?? '')) {
      bands.clientSide.push(row);
      continue;
    }
    bands[bandFor(seat, today)].push(row);
  }

  // The client leads their own side; a rep follows, then by name.
  bands.clientSide.sort((a, b) => {
    const ra = a.partyKind === 'client' ? 0 : 1;
    const rb = b.partyKind === 'client' ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  // The crew bands read in window order — the soonest window first, an undated
  // seat last — so "who is here this week" reads as a day, not as an alphabet.
  const byWindow = (a: CallSheetRow, b: CallSheetRow) => {
    const fa = a.onSiteFrom ?? '';
    const fb = b.onSiteFrom ?? '';
    if (fa !== fb) {
      if (!fa) return 1;
      if (!fb) return -1;
      return fa.localeCompare(fb);
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  };
  bands.this_week.sort(byWindow);
  bands.later.sort(byWindow);
  bands.bidding.sort(byWindow);
  bands.done.sort(byWindow);

  const synthetic = syntheticClientRow(client);
  if (synthetic) {
    const claimed = bands.clientSide.some(
      (r) =>
        (!!synthetic.profile_id && r.profileId === synthetic.profile_id) ||
        normalizeName(r.name) === normalizeName(synthetic.display_name),
    );
    if (!claimed) bands.clientSide.unshift(callSheetRowFromClient(synthetic));
  }

  const rows = CALL_SHEET_BANDS.flatMap((band) => bands[band]);
  return { bands, rows };
}

// ============================================================================
// VITALS — counted off the window (SPEC §5.4 #3)
// ============================================================================

export interface CallSheetVitals {
  onTheJobThisWeek: number;
  textable: number;
  withAccounts: number;
  onPaper: number;
}

/**
 * The four counts. The first one counts the WINDOW — who is on site this week
 * — not everyone the sheet has ever listed, which is the number direction §3.4
 * asks the line to carry. Everyone printed counts toward the other three;
 * "reachable by text" is a standing grant on the studio's own record, never an
 * invite.
 */
export function callSheetVitals(projection: CallSheetProjection): CallSheetVitals {
  let textable = 0;
  let withAccounts = 0;
  let onPaper = 0;
  for (const row of projection.rows) {
    if (row.consent === 'granted') textable += 1;
    if (row.reach === 'account') withAccounts += 1;
    if (row.reach === 'on_paper') onPaper += 1;
  }
  return {
    onTheJobThisWeek: projection.bands.this_week.length,
    textable,
    withAccounts,
    onPaper,
  };
}

/** "12 on the job this week · 5 reachable by text · 4 with accounts · 2 on
 *  paper" — always all four counts, even at zero. */
export function callSheetVitalsLine(projection: CallSheetProjection): string {
  const v = callSheetVitals(projection);
  return `${v.onTheJobThisWeek} on the job this week · ${v.textable} reachable by text · ${v.withAccounts} with accounts · ${v.onPaper} on paper`;
}

// ============================================================================
// THE SENTENCES (SPEC §5.8)
//
// The consent sentence is NOT here: R-Q asks for one wording everywhere, and
// it lives in `components/document/people/consent-sentence.ts` beside the
// person card that prints it most. A second copy would be a second wording.
// ============================================================================

/**
 * PR-h / R-S — a firm's lapsed paper prints on the roster row as a CLAUSE IN
 * WORDS, never a badge: "Site access held. Northgate Electric's insurance
 * lapsed 31 March 2026." The document lives on the company card; this is the
 * row's sentence about it.
 */
export function heldClause(
  companyName: string | null | undefined,
  paper: { docLabel: string; expiresOn: string | null | undefined; blocks: string[] },
): string {
  const firm = (companyName ?? '').trim();
  const blocks = paper.blocks.includes('site_access')
    ? 'Site access held.'
    : paper.blocks.includes('payment')
      ? 'Payment held.'
      : paper.blocks.includes('draw')
        ? 'The draw is held.'
        : 'Held.';
  const when = rosterLongDate(paper.expiresOn);
  const owner = firm ? `${firm}’s ` : '';
  const lapsed = when ? ` lapsed ${when}` : ' has lapsed';
  return `${blocks} ${owner}${paper.docLabel}${lapsed}.`;
}

/**
 * PR-d / PR-l — the field link ends with the ENGAGEMENT, and the sentence says
 * so in words. No 90-day clock on a face.
 */
export function fieldLinkExpirySentence(to: string | null | undefined): string {
  const when = rosterLongDate(to);
  return when
    ? `Ends with the job, ${when}. Renews when they use it.`
    : 'Ends with the job. Renews when they use it.';
}

/**
 * R-U — the site access line under the Call Sheet heading: "Key held by Ngozi
 * Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026." Each clause prints
 * only where the card holds the fact.
 */
export function siteAccessSummaryLine(facts: {
  keyHolderName?: string | null;
  gateControllerName?: string | null;
  changedAt?: string | null;
}): string {
  const parts: string[] = [];
  if (facts.keyHolderName?.trim()) parts.push(`Key held by ${facts.keyHolderName.trim()}.`);
  if (facts.gateControllerName?.trim())
    parts.push(`${facts.gateControllerName.trim()} controls the gate.`);
  const changed = rosterShortDate(facts.changedAt);
  if (changed) parts.push(`Changed ${changed}.`);
  return parts.join(' ');
}

/**
 * PR-r — the way in, in words, with NO code. "Lockbox, version 3. The code is
 * held off Patina; ask Luis Ochoa." The second sentence names the key holder,
 * or nobody, and never a field where a code could be typed.
 */
export function wayInSentence(
  lockboxVersion: string | null | undefined,
  askName: string | null | undefined,
): string {
  const version = (lockboxVersion ?? '').trim();
  const ask = (askName ?? '').trim();
  const held = ask
    ? `The code is held off Patina; ask ${ask}.`
    : 'The code is held off Patina.';
  return version ? `${version}. ${held}` : held;
}

/** The authority phrase, as plain text (direction §3.8 — authority is NEVER a
 *  state word). "$2,500" from integer cents; a prepares-only grant says so. */
export function authorityPhrase(
  grants: ReadonlyArray<{
    scope: string;
    threshold_cents: number | null;
    prepares_only: boolean;
  }>,
  labels: Record<string, string>,
): string {
  if (grants.length === 0) return '';
  const phrases = grants.map((grant) => {
    if (grant.prepares_only) return 'Prepares only';
    const label = labels[grant.scope] ?? grant.scope;
    if (grant.threshold_cents != null) {
      const dollars = Math.round(grant.threshold_cents / 100);
      return `${label} to $${dollars.toLocaleString('en-US')}`;
    }
    return label;
  });
  return Array.from(new Set(phrases)).join('. ') + '.';
}
