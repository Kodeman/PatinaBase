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
import { getFieldTradeLabel, getPartyKindLabel, getVendorSpecialtyLabel } from '@patina/types';

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
    // Field kinds (00281) — short badge labels (the field-config vocab spells
    // 'Subcontractor' in full; the roster badge wants a tight token).
    case 'sub':
      return 'Sub';
    case 'installer':
      return 'Installer';
    case 'receiver':
      return 'Receiver';
    // Wave 4 (00419/00420) roster-widening kinds — allied site professionals
    // (project_parties, non-field, no SMS) and the studio rolodex's own
    // contact branch (studio_contacts rows with no matching project party).
    case 'architect':
      return 'Architect';
    case 'photographer':
      return 'Photographer';
    case 'stager':
      return 'Stager';
    // The studio rolodex branch (people_directory role='contact', 00420).
    case 'contact':
      return 'Contact';
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
 * Where a proposal-stage relationship's document actually IS.
 *
 * designer_clients.status flips to 'proposal' the instant a client is linked to
 * ANY proposal, draft or not (set_document_client, 00225) — it says nothing
 * about whether anything left the studio. people_directory's meta carries the
 * evidence that does (00478), and it is read in ONE order everywhere:
 *
 *   1. issued_on_paper — the agreement was handed over without an email
 *      (00477). Not a send; also not a draft. It must never render as
 *      "Proposal sent", and it must never draw a "nothing has gone out" nudge.
 *   2. has_sent_proposal — a real outbound send happened (proposals.sent_at or
 *      a proposal_send_dispatches row; 00478 takes the union so an orphan
 *      legacy row with a null designer_client_id still counts).
 *   3. otherwise the document is still in the studio's hands.
 *
 * Fail-closed by construction: absent keys (a pre-00478 view, or a fixture that
 * predates it) read as 'draft' — the state that claims the least.
 */
export type IssuanceState = 'paper' | 'sent' | 'draft';

export function deriveIssuanceState(p: Pick<DirectoryPerson, 'meta'>): IssuanceState {
  if (p.meta?.['issued_on_paper'] === true) return 'paper';
  if (p.meta?.['has_sent_proposal'] === true) return 'sent';
  return 'draft';
}

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
      // The dot and the line must say the same thing. A document still in the
      // studio's hands is not motion — it draws the neutral dot, so a glance
      // down the dot column cannot read progress that has not happened. Paper
      // and email issuance are both motion.
      if (p.status_raw === 'proposal')
        return deriveIssuanceState(p) === 'draft' ? 'cool' : 'warm';
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

    // Field kinds (00281): the dot reflects SMS consent (status_raw carries
    // sms_consent_status for the field branch). Texting = active; invited but
    // not yet replied = warm; opted out / never asked = cool.
    case 'sub':
    case 'installer':
    case 'receiver':
      if (p.status_raw === 'granted') return 'active';
      if (p.status_raw === 'pending') return 'warm';
      return 'cool';

    // Wave 4 hardening — allied professionals (architect/photographer/stager)
    // carry no SMS consent or nurture lifecycle of their own, and a rolodex
    // 'contact' row is a card, not a relationship in progress — a neutral
    // (cool/pearl) dot rather than fabricating a signal that doesn't exist.
    case 'architect':
    case 'photographer':
    case 'stager':
    case 'contact':
      return 'cool';
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
      // J7: only a real send starts the clock on "they haven't answered yet".
      // A draft has not been asked for an answer; a paper issuance was handed
      // over in person, so a nudge about silence would be a lie about what
      // happened. See deriveIssuanceState for the ordering.
      if (p.status_raw === 'proposal') return deriveIssuanceState(p) === 'sent';
      if (p.status_raw === 'lead') return true;
      if (p.status_raw === 'completed' || p.status_raw === 'nurture')
        return dormant != null && dormant >= NURTURE_DUE_DAYS;
      return false;
    case 'maker':
    case 'gc':
    case 'team':
    // Field parties are coordinated over SMS, not nurtured — never "due" here.
    case 'sub':
    case 'installer':
    case 'receiver':
    // Call Sheet Wave 3/4 (00419/00420) roster-widening kinds — coordinated
    // per-project like gc, never nurture-due. The studio rolodex branch
    // (00420) is likewise not a relationship to nurture.
    case 'architect':
    case 'photographer':
    case 'stager':
    case 'contact':
      return false;
  }
}

/**
 * The role-appropriate one-line under a person's name, plus whether it should
 * read as "due" (terracotta accent — see isNurtureDue).
 *
 * Wave 4 hardening: a STUDIO-scoped row (`p.scope === 'studio'` — 00420's
 * appended column, meaning this is a co-member's client/lead/party, or a
 * role='contact' rolodex card the viewer merely CAN see) never wears the
 * due-state accent, and its line carries the mono 'STUDIO' marker instead —
 * "someone owes a reply" is a work queue for the row's OWNER, not a task for
 * every teammate who can read the shared book.
 */
export function deriveRelationshipLine(
  p: DirectoryPerson,
  now: Date,
): { text: string; due: boolean } {
  const foreignScope = p.scope === 'studio';
  const due = foreignScope ? false : isNurtureDue(p, now);
  const since = humanizeSince(p.last_touch_at, now);

  const text = ((): string => {
    switch (p.role) {
      case 'client': {
        if (p.status_raw === 'active') return `Active project · last touched ${since}`;
        if (p.status_raw === 'proposal') {
          switch (deriveIssuanceState(p)) {
            case 'paper':
              return 'Issued on paper · awaiting recorded signature';
            case 'sent':
              return `Proposal sent · ${due ? 'hesitating' : 'awaiting signature'}`;
            case 'draft':
              return 'Direction drafted · not yet sent';
          }
        }
        if (p.status_raw === 'completed' || p.status_raw === 'nurture')
          return due ? `Past client · ${since} · time to reconnect` : `Past client · ${since}`;
        return `Client · ${since}`;
      }

      case 'lead': {
        const kind = String(p.meta?.['project_type'] ?? '').replace(/_/g, ' ') || 'inquiry';
        return due ? `New lead · ${kind} · respond within 24 hours` : `Lead · ${kind}`;
      }

      case 'maker': {
        const cat = String(p.meta?.['primary_category'] ?? '').replace(/_/g, ' ');
        const lead = (p.meta?.['lead_times'] as Record<string, unknown> | null) ?? null;
        const std = lead && typeof lead['standard'] === 'number' ? `${lead['standard']}d lead` : null;
        const bits = ['Maker', cat || null, std].filter(Boolean);
        return bits.join(' · ');
      }

      case 'gc': {
        const proj = String(p.meta?.['project_name'] ?? '').trim();
        return proj ? `GC · ${proj}` : 'General contractor';
      }

      case 'team':
        return `Studio · ${humanizeTeamRole(p.status_raw)}`;

      // Field kinds (00281): the trade + the project they work. Consent reads
      // off the roster's consent chip, so the line stays about the work, not
      // status.
      case 'sub':
      case 'installer':
      case 'receiver': {
        const trade = getFieldTradeLabel(p.meta?.['trade'] as string | undefined);
        const proj = String(p.meta?.['project_name'] ?? '').trim();
        const bits = [trade || null, proj || null].filter(Boolean);
        return bits.join(' · ') || 'Field party';
      }

      // Wave 4 (00419) roster-widening kinds — allied site professionals on a
      // project (no SMS, never "due" — see isNurtureDue). Same "role ·
      // project" shape the gc line already uses.
      case 'architect':
      case 'photographer':
      case 'stager': {
        const proj = String(p.meta?.['project_name'] ?? '').trim();
        return proj ? `${roleLabel(p.role)} · ${proj}` : roleLabel(p.role);
      }

      // Wave 4 (00420) studio rolodex branch — a studio_contacts row with no
      // matching project party. Names what KIND of contact this is (the same
      // free-text PartyKind vocab a person card's contact_kind draws from,
      // labeled via @patina/types' getPartyKindLabel) plus vendor specialties
      // when any are on file. Never a due/nurture read — a rolodex card is a
      // reference, not a relationship in progress.
      case 'contact': {
        const kindLabel =
          getPartyKindLabel(p.meta?.['contact_kind'] as string | undefined) || 'Contact';
        const rawSpecialties = p.meta?.['specialties'];
        const specialties = Array.isArray(rawSpecialties)
          ? rawSpecialties
              .filter((s): s is string => typeof s === 'string')
              .map((s) => getVendorSpecialtyLabel(s) || s)
          : [];
        return specialties.length > 0 ? `${kindLabel} · ${specialties.join(', ')}` : kindLabel;
      }
    }
  })();

  return foreignScope ? { text: `${text} · STUDIO`, due } : { text, due };
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
    // Out of touch but not worth surfacing yet — EXCEPT a proposal-stage
    // client. An unsent Direction now wears the neutral dot (it is not in
    // motion), but it is still a live thread the studio is holding: it stays
    // in the queue, relabeled and ranked below everything due, rather than
    // disappearing from the one surface that would remind anyone to send it.
    const holdingADocument = p.role === 'client' && p.status_raw === 'proposal';
    if (!due && dot === 'cool' && !holdingADocument) continue;

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
