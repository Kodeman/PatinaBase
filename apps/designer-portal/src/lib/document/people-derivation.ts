/**
 * people-derivation — the People Room's pure read models (R57–R60).
 *
 * Mirrors desk/margin/section derivation: pure functions over rows + `now`,
 * no React, no design-system imports, no I/O. The relationship journey and the
 * nurture queue are DERIVATIONS, never stored tables (R51/R52) — the journey is
 * woven from a person's existing document history + human touchpoints, the same
 * way `deriveSections` weaves the spine.
 *
 * Threshold constants live at the top, discoverable for Leah-tuning.
 *
 * CONTRACT OWNERSHIP (frozen by Wave 0):
 *  · deriveStatusDot / deriveRelationshipLine / roleLabel — directory line
 *    (Track A consumes; implemented here).
 *  · deriveNurtureQueue — dormancy + trust ranking (Track C owns; a working v1
 *    is implemented here so the Nurture view stands up; refine in place).
 *  · deriveRelationshipJourney — the woven timeline (Track B owns; the signature
 *    + input contract are frozen here, the body is a stub returning []).
 */

import type { PartyRole, PeopleDirectoryRow } from '@patina/supabase';

export type { PartyRole };

/** The canonical party shape — a row of `public.people_directory`. */
export type DirectoryPerson = PeopleDirectoryRow;

// ─── thresholds (tunable) ──────────────────────────────────────────────────
/** Past-client quiet past this → "drifting" (warm nudge). */
export const NURTURE_DORMANT_DAYS = 180; // ~6 months
/** Quiet past this → "reconnect now" (Joan Marsh in the prototype: 8 months). */
export const NURTURE_DUE_DAYS = 240; // ~8 months
/** A new lead should get a reply inside this window. */
export const LEAD_RESPOND_HOURS = 24;
/** Maker counts as recently engaged if touched inside this window. */
export const MAKER_WARM_DAYS = 75;

const DAY_MS = 86_400_000;

// ─── shared types ──────────────────────────────────────────────────────────

/** The status dot on a directory row (prototype: gold/sage/terracotta/pearl). */
export type PartyStatus = 'active' | 'warm' | 'due' | 'cool';

export type JourneyType =
  | 'inquiry'
  | 'proposal'
  | 'project'
  | 'message'
  | 'decision'
  | 'touchpoint'
  | 'review'
  | 'install'
  | 'care';

/** One woven event on the Relationship Journey (R51). Derived, never stored. */
export interface JourneyEvent {
  type: JourneyType;
  /** Short mono label (Inquiry, Proposal, Thread, Decision, …). */
  label: string;
  /** The human line. */
  text: string;
  /** ISO timestamp the event anchors to (UI formats it). */
  at: string;
  /** Epoch ms for stable ordering. */
  sortAt: number;
  /** Optional deep-link to the source surface (document, thread, decision). */
  href?: string;
}

/** A ranked nurture-queue entry (R52). */
export interface NurtureEntry {
  person: DirectoryPerson;
  /** Reconnect-now (true) vs warm/keep-tending (false). */
  due: boolean;
  /** Why this surfaced. */
  reason: string;
  /** Ranking weight — higher sorts first within its band. */
  score: number;
}

// ─── small helpers ─────────────────────────────────────────────────────────

function asMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function daysSince(iso: string | null | undefined, now: Date): number | null {
  const t = asMs(iso);
  return t == null ? null : Math.floor((now.getTime() - t) / DAY_MS);
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** A quiet, human "how long ago" for the relationship line. */
export function humanizeSince(iso: string | null | undefined, now: Date): string {
  const d = daysSince(iso, now);
  if (d == null) return 'no recent contact';
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d}d ago`;
  const months = Math.round(d / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

export function roleLabel(role: PartyRole): string {
  switch (role) {
    case 'client':
      return 'Client';
    case 'maker':
      return 'Maker';
    case 'gc':
      return 'GC';
    case 'team':
      return 'Team';
    case 'lead':
      return 'Lead';
  }
}

function humanizeTeamRole(raw: string | null | undefined): string {
  switch (raw) {
    case 'lead_designer':
      return 'lead designer';
    case 'support_designer':
      return 'support designer';
    case 'bookkeeper':
      return 'bookkeeper';
    case 'previous_lead':
      return 'previous lead';
    default:
      return raw ?? 'studio';
  }
}

// ─── directory line + status dot (Track A) ─────────────────────────────────

/**
 * The status dot. Drives the prototype's gold/sage/terracotta/pearl dot and
 * feeds the nurture banding.
 */
export function deriveStatusDot(p: DirectoryPerson, now: Date): PartyStatus {
  const dormant = daysSince(p.last_touch_at, now);

  switch (p.role) {
    case 'lead':
      // New/viewed leads still owe a response; contacted leads are warm.
      return p.status_raw === 'new' || p.status_raw === 'viewed' ? 'due' : 'warm';

    case 'client': {
      if (p.status_raw === 'active') return 'active';
      if (p.status_raw === 'proposal') return 'warm';
      if (p.status_raw === 'completed' || p.status_raw === 'nurture') {
        if (dormant != null && dormant >= NURTURE_DUE_DAYS) return 'due';
        if (dormant != null && dormant >= NURTURE_DORMANT_DAYS) return 'warm';
        return 'cool';
      }
      if (p.status_raw === 'lead') return 'due';
      return 'warm';
    }

    case 'maker':
      // Founding-circle and recently-engaged makers read warm; others cool.
      if (p.meta?.['founding_circle']) return 'warm';
      if (dormant != null && dormant <= MAKER_WARM_DAYS) return 'warm';
      return 'cool';

    case 'gc':
    case 'team':
      return 'active';
  }
}

/**
 * Whether a party needs tending NOW (the terracotta "due" accent + the Nurture
 * "reconnect now" band). DISTINCT from the directory status dot: a proposal-
 * stage client reads a warm dot but is nurture-due (a nudge is overdue) — the
 * prototype's David Chen. A dormant high-trust past client and an unanswered new
 * lead are due; everyone else is not.
 */
export function isNurtureDue(p: DirectoryPerson, now: Date): boolean {
  const dormant = daysSince(p.last_touch_at, now);
  switch (p.role) {
    case 'lead':
      return p.status_raw === 'new' || p.status_raw === 'viewed';
    case 'client':
      if (p.status_raw === 'proposal' || p.status_raw === 'lead') return true;
      if (p.status_raw === 'completed' || p.status_raw === 'nurture')
        return dormant != null && dormant >= NURTURE_DUE_DAYS;
      return false;
    case 'maker':
    case 'gc':
    case 'team':
      return false;
  }
}

/**
 * The role-appropriate one-line under a person's name, plus whether it should
 * read as "due" (terracotta accent — see isNurtureDue).
 */
export function deriveRelationshipLine(
  p: DirectoryPerson,
  now: Date,
): { text: string; due: boolean } {
  const due = isNurtureDue(p, now);
  const since = humanizeSince(p.last_touch_at, now);

  switch (p.role) {
    case 'client': {
      if (p.status_raw === 'active') return { text: `Active project · last touched ${since}`, due };
      if (p.status_raw === 'proposal')
        return { text: `Proposal sent · ${due ? 'hesitating' : 'awaiting signature'}`, due };
      if (p.status_raw === 'completed' || p.status_raw === 'nurture')
        return {
          text: due ? `Past client · ${since} · time to reconnect` : `Past client · ${since}`,
          due,
        };
      return { text: `Client · ${since}`, due };
    }

    case 'lead': {
      const kind = String(p.meta?.['project_type'] ?? '').replace(/_/g, ' ') || 'inquiry';
      return { text: due ? `New lead · ${kind} · respond within 24 hours` : `Lead · ${kind}`, due };
    }

    case 'maker': {
      const cat = String(p.meta?.['primary_category'] ?? '').replace(/_/g, ' ');
      const lead = (p.meta?.['lead_times'] as Record<string, unknown> | null) ?? null;
      const std = lead && typeof lead['standard'] === 'number' ? `${lead['standard']}d lead` : null;
      const bits = ['Maker', cat || null, std].filter(Boolean);
      return { text: bits.join(' · '), due: false };
    }

    case 'gc': {
      const proj = String(p.meta?.['project_name'] ?? '').trim();
      return { text: proj ? `GC · ${proj}` : 'General contractor', due: false };
    }

    case 'team':
      return { text: `Studio · ${humanizeTeamRole(p.status_raw)}`, due: false };
  }
}

// ─── nurture queue (Track C owns; working v1) ──────────────────────────────

/**
 * Rank the roster by who needs tending. Leads owing a reply and dormant
 * high-trust clients float to the "reconnect now" band (due); active/warm ties
 * fall into "keep tending"; cool ties drop off. Trust (revenue, satisfaction,
 * completed projects) breaks ties within a band.
 *
 * Track C refines the copy/weighting in place — the signature is frozen.
 */
export function deriveNurtureQueue(people: DirectoryPerson[], now: Date): NurtureEntry[] {
  const entries: NurtureEntry[] = [];

  for (const p of people) {
    const dot = deriveStatusDot(p, now);
    const due = isNurtureDue(p, now);
    if (!due && dot === 'cool') continue; // out of touch but not worth surfacing yet

    const dormant = daysSince(p.last_touch_at, now) ?? 0;
    const trust =
      num(p.meta?.['total_revenue']) / 100_000 +
      num(p.meta?.['total_projects']) +
      num(p.meta?.['satisfaction_score']);

    // Reason: lean on the relationship line, sharpened for the queue.
    const line = deriveRelationshipLine(p, now);
    let reason = line.text;
    if (p.role === 'client' && due) reason = `${humanizeSince(p.last_touch_at, now)} since last touch — reconnect now`;
    if (p.role === 'lead' && due) reason = 'New lead — respond within 24 hours';

    // Score: due-ness dominates, then trust, then dormancy.
    const score = (due ? 1_000_000 : 0) + trust * 100 + Math.min(dormant, 720);

    entries.push({ person: p, due, reason, score });
  }

  return entries.sort((a, b) => b.score - a.score);
}

// ─── the relationship journey (Track B owns; contract frozen) ──────────────

/**
 * The inputs the journey weaves. Track B assembles these from existing hooks
 * (projects, proposals, decisions, threads, nurture touchpoints, reviews) for
 * the opened person — there is NO activity table to read (R51).
 */
export interface JourneyInputs {
  person: DirectoryPerson;
  projects?: Array<{
    id: string;
    name: string;
    status?: string | null;
    created_at?: string | null;
    kickoff_date?: string | null;
    completed_at?: string | null;
  }>;
  proposals?: Array<{
    id: string;
    title?: string | null;
    status?: string | null;
    created_at?: string | null;
    sent_at?: string | null;
    signed_at?: string | null;
    total_cents?: number | null;
  }>;
  decisions?: Array<{
    id: string;
    title?: string | null;
    status?: string | null;
    created_at?: string | null;
    resolved_at?: string | null;
    chosen_label?: string | null;
  }>;
  threads?: Array<{
    id: string;
    subject?: string | null;
    message_count?: number | null;
    last_message_at?: string | null;
  }>;
  touchpoints?: Array<{
    id: string;
    touchpoint_type: string;
    status?: string | null;
    reason?: string | null;
    suggested_date?: string | null;
    created_at?: string | null;
  }>;
  reviews?: Array<{
    id: string;
    rating?: number | null;
    review_text?: string | null;
    created_at?: string | null;
  }>;
}

/** A US-month label for the journey date stamp (e.g. "Apr 2026"). A DATE-only
 *  value (kickoff_date, suggested_date) parses as UTC midnight and shifts back a
 *  month in negative-offset timezones — coerce it to local midnight first (the
 *  same guard desk-derivation's fmtDay uses). */
function fmtMonth(iso: string): string {
  const coerced = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso;
  const d = new Date(coerced);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Dollars from a cents amount, no decimals when round (e.g. "$25,100"). */
function fmtDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

/** Pushes an event when its timestamp is real; silently drops null/garbage. */
function add(
  out: JourneyEvent[],
  type: JourneyType,
  label: string,
  text: string,
  iso: string | null | undefined,
  href?: string,
): void {
  const ms = asMs(iso);
  if (ms == null) return;
  out.push({ type, label, text, at: iso as string, sortAt: ms, href });
}

/**
 * Weave the entire relationship into one ordered timeline (oldest → newest by
 * default; the UI may reverse). DERIVATION — no stored log: every event is read
 * live from an existing surface (proposal, project, decision, thread, touchpoint,
 * review) the same way the spine derives its sections from project stage.
 *
 * Each input is mapped to the JourneyType that best names it:
 *  · proposals  → `inquiry` (created) + `proposal` (sent) + `proposal` (signed,
 *    carrying the amount). A signed proposal's signing is the relationship's hinge.
 *  · projects   → `project` (opened/kickoff) + `install`/`care` (completed:
 *    a completed project reads as care, an active one as the live project).
 *  · decisions  → `decision`, anchored at resolution when responded, else creation,
 *    carrying the chosen option's label when one is selected.
 *  · threads    → `message`, anchored at the last message, carrying the count.
 *  · touchpoints→ `touchpoint`, anchored at the send/suggested/created date.
 *  · reviews    → `review`, anchored at creation, carrying the rating + a snippet.
 *
 * A sparse party (a maker/GC/team person with only a project link, no proposals
 * or decisions) yields a short, honest journey — never a fabricated one. Events
 * with no real timestamp are dropped, not invented.
 */
export function deriveRelationshipJourney(
  inputs: JourneyInputs,
  _now: Date,
): JourneyEvent[] {
  const out: JourneyEvent[] = [];
  const { proposals, projects, decisions, threads, touchpoints, reviews } = inputs;

  // ── proposals: inquiry (created) → sent → signed (the hinge) ──────────────
  for (const p of proposals ?? []) {
    const href = `/doc/${p.id}`;
    const title = (p.title ?? '').trim();
    add(
      out,
      'inquiry',
      'Inquiry',
      title ? `Proposal drafted — ${title}.` : 'Proposal drafted.',
      p.created_at,
      href,
    );
    add(out, 'proposal', 'Proposal', 'Proposal sent — awaiting their signature.', p.sent_at, href);
    if (p.signed_at) {
      const amount =
        typeof p.total_cents === 'number' && p.total_cents > 0
          ? ` — ${fmtDollars(p.total_cents)}`
          : '';
      add(out, 'proposal', 'Signed', `Proposal signed${amount}.`, p.signed_at, href);
    }
  }

  // ── projects: opened (kickoff/created) → completed (care) ─────────────────
  for (const pj of projects ?? []) {
    const href = `/doc/${pj.id}`;
    const name = (pj.name ?? '').trim() || 'project';
    const opened = pj.kickoff_date ?? pj.created_at;
    add(out, 'project', 'Project', `Project opened — ${name}.`, opened, href);
    if (pj.completed_at) {
      add(
        out,
        'care',
        'Care',
        `Project delivered — ${name} complete.`,
        pj.completed_at,
        href,
      );
    }
  }

  // ── decisions: resolved (carrying the choice) or still open ───────────────
  for (const d of decisions ?? []) {
    const title = (d.title ?? '').trim() || 'A decision';
    const choice = (d.chosen_label ?? '').trim();
    const when = d.resolved_at ?? d.created_at;
    const text =
      d.resolved_at && choice
        ? `${title} — chose ${choice}.`
        : d.resolved_at
          ? `${title} — resolved.`
          : `${title} — awaiting a call.`;
    add(out, 'decision', 'Decision', text, when);
  }

  // ── threads: the running conversation, anchored at the last word ──────────
  for (const t of threads ?? []) {
    const count = typeof t.message_count === 'number' ? t.message_count : 0;
    const subject = (t.subject ?? '').trim();
    const lead =
      count > 0
        ? `${count} ${count === 1 ? 'message' : 'messages'}`
        : 'A conversation';
    const text = subject ? `${lead} — ${subject}.` : `${lead}.`;
    add(out, 'message', 'Thread', text, t.last_message_at, `/people?thread=${t.id}`);
  }

  // ── touchpoints: the human reach-outs that keep a tie warm ────────────────
  for (const tp of touchpoints ?? []) {
    const reason = (tp.reason ?? '').trim();
    const kind = tp.touchpoint_type.replace(/_/g, ' ');
    const text = reason || `${kind} touchpoint.`;
    const when = tp.status === 'sent' ? (tp.created_at ?? tp.suggested_date) : tp.suggested_date ?? tp.created_at;
    add(out, 'touchpoint', 'Touchpoint', text, when);
  }

  // ── reviews: the words that bring the next client ─────────────────────────
  for (const r of reviews ?? []) {
    const stars = typeof r.rating === 'number' && r.rating > 0 ? `${'★'.repeat(Math.min(5, Math.round(r.rating)))} ` : '';
    const snippet = (r.review_text ?? '').trim();
    const quoted = snippet ? `“${snippet.length > 90 ? `${snippet.slice(0, 88)}…` : snippet}”` : 'Review collected.';
    add(out, 'review', 'Review', `${stars}${quoted}`, r.created_at);
  }

  return sortJourney(out);
}

export { fmtMonth as formatJourneyDate };

/** Stable chronological sort helper for journey events (oldest first). */
export function sortJourney(events: JourneyEvent[]): JourneyEvent[] {
  return [...events].sort((a, b) => a.sortAt - b.sortAt);
}
