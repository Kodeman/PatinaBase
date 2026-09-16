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

import type {
  PartyRole,
  PeopleDirectoryRow,
  PeopleDirectorySeat,
} from "@patina/supabase";
import {
  getFieldTradeLabel,
  getPartyKindLabel,
  getVendorSpecialtyLabel,
  partyKindOwesPaper,
} from "@patina/types";
import { MONTH_NAME_FORMAT } from "./dates";
import type { DirectoryChip } from "./directory-roles";

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
export type PartyStatus = "active" | "warm" | "due" | "cool";

export type JourneyType =
  | "inquiry"
  | "proposal"
  | "project"
  | "message"
  | "decision"
  | "touchpoint"
  | "review"
  | "install"
  | "care";

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
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** A quiet, human "how long ago" for the relationship line. */
export function humanizeSince(
  iso: string | null | undefined,
  now: Date,
): string {
  const d = daysSince(iso, now);
  if (d == null) return "no recent contact";
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  const months = Math.round(d / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

export function roleLabel(role: PartyRole): string {
  switch (role) {
    case "client":
      return "Client";
    case "maker":
      return "Maker";
    case "gc":
      return "GC";
    case "team":
      return "Team";
    case "lead":
      return "Lead";
    // Field kinds (00281) — short badge labels (the field-config vocab spells
    // 'Subcontractor' in full; the roster badge wants a tight token).
    case "sub":
      return "Sub";
    case "installer":
      return "Installer";
    case "receiver":
      return "Receiver";
    // Wave 4 (00419/00420) roster-widening kinds — allied site professionals
    // (project_parties, non-field, no SMS) and the studio rolodex's own
    // contact branch (studio_contacts rows with no matching project party).
    case "architect":
      return "Architect";
    case "photographer":
      return "Photographer";
    case "stager":
      return "Stager";
    // The studio rolodex branch (people_directory role='contact', 00420).
    case "contact":
      return "Contact";
  }
}

function humanizeTeamRole(raw: string | null | undefined): string {
  switch (raw) {
    case "lead_designer":
      return "lead designer";
    case "support_designer":
      return "support designer";
    case "bookkeeper":
      return "bookkeeper";
    case "previous_lead":
      return "previous lead";
    default:
      return raw ?? "studio";
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
export type IssuanceState = "paper" | "sent" | "draft";

export function deriveIssuanceState(
  p: Pick<DirectoryPerson, "meta">,
): IssuanceState {
  if (p.meta?.["issued_on_paper"] === true) return "paper";
  if (p.meta?.["has_sent_proposal"] === true) return "sent";
  return "draft";
}

/**
 * The status dot. Drives the prototype's gold/sage/terracotta/pearl dot and
 * feeds the nurture banding.
 */
export function deriveStatusDot(p: DirectoryPerson, now: Date): PartyStatus {
  const dormant = daysSince(p.last_touch_at, now);

  switch (p.role) {
    case "lead":
      // New/viewed leads still owe a response; contacted leads are warm.
      return p.status_raw === "new" || p.status_raw === "viewed"
        ? "due"
        : "warm";

    case "client": {
      if (p.status_raw === "active") return "active";
      // The dot and the line must say the same thing. A document still in the
      // studio's hands is not motion — it draws the neutral dot, so a glance
      // down the dot column cannot read progress that has not happened. Paper
      // and email issuance are both motion.
      if (p.status_raw === "proposal")
        return deriveIssuanceState(p) === "draft" ? "cool" : "warm";
      if (p.status_raw === "completed" || p.status_raw === "nurture") {
        if (dormant != null && dormant >= NURTURE_DUE_DAYS) return "due";
        if (dormant != null && dormant >= NURTURE_DORMANT_DAYS) return "warm";
        return "cool";
      }
      if (p.status_raw === "lead") return "due";
      return "warm";
    }

    case "maker":
      // Founding-circle and recently-engaged makers read warm; others cool.
      if (p.meta?.["founding_circle"]) return "warm";
      if (dormant != null && dormant <= MAKER_WARM_DAYS) return "warm";
      return "cool";

    case "gc":
    case "team":
      return "active";

    // Field kinds (00281): the dot reflects SMS consent (status_raw carries
    // sms_consent_status for the field branch). Texting = active; invited but
    // not yet replied = warm; opted out / never asked = cool.
    case "sub":
    case "installer":
    case "receiver":
      if (p.status_raw === "granted") return "active";
      if (p.status_raw === "pending") return "warm";
      return "cool";

    // Wave 4 hardening — allied professionals (architect/photographer/stager)
    // carry no SMS consent or nurture lifecycle of their own, and a rolodex
    // 'contact' row is a card, not a relationship in progress — a neutral
    // (cool/pearl) dot rather than fabricating a signal that doesn't exist.
    case "architect":
    case "photographer":
    case "stager":
    case "contact":
      return "cool";
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
    case "lead":
      return p.status_raw === "new" || p.status_raw === "viewed";
    case "client":
      // J7: only a real send starts the clock on "they haven't answered yet".
      // A draft has not been asked for an answer; a paper issuance was handed
      // over in person, so a nudge about silence would be a lie about what
      // happened. See deriveIssuanceState for the ordering.
      if (p.status_raw === "proposal") return deriveIssuanceState(p) === "sent";
      if (p.status_raw === "lead") return true;
      if (p.status_raw === "completed" || p.status_raw === "nurture")
        return dormant != null && dormant >= NURTURE_DUE_DAYS;
      return false;
    case "maker":
    case "gc":
    case "team":
    // Field parties are coordinated over SMS, not nurtured — never "due" here.
    case "sub":
    case "installer":
    case "receiver":
    // Call Sheet Wave 3/4 (00419/00420) roster-widening kinds — coordinated
    // per-project like gc, never nurture-due. The studio rolodex branch
    // (00420) is likewise not a relationship to nurture.
    case "architect":
    case "photographer":
    case "stager":
    case "contact":
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
  const foreignScope = p.scope === "studio";
  const due = foreignScope ? false : isNurtureDue(p, now);
  const since = humanizeSince(p.last_touch_at, now);

  const text = ((): string => {
    switch (p.role) {
      case "client": {
        if (p.status_raw === "active")
          return `Active project · last touched ${since}`;
        if (p.status_raw === "proposal") {
          switch (deriveIssuanceState(p)) {
            case "paper":
              return "Issued on paper · awaiting recorded signature";
            case "sent":
              return `Proposal sent · ${due ? "hesitating" : "awaiting signature"}`;
            case "draft":
              return "Direction drafted · not yet sent";
          }
        }
        if (p.status_raw === "completed" || p.status_raw === "nurture")
          return due
            ? `Past client · ${since} · time to reconnect`
            : `Past client · ${since}`;
        return `Client · ${since}`;
      }

      case "lead": {
        const kind =
          String(p.meta?.["project_type"] ?? "").replace(/_/g, " ") ||
          "inquiry";
        return due
          ? `New lead · ${kind} · respond within 24 hours`
          : `Lead · ${kind}`;
      }

      case "maker": {
        const cat = String(p.meta?.["primary_category"] ?? "").replace(
          /_/g,
          " ",
        );
        const lead =
          (p.meta?.["lead_times"] as Record<string, unknown> | null) ?? null;
        const std =
          lead && typeof lead["standard"] === "number"
            ? `${lead["standard"]}d lead`
            : null;
        const bits = ["Maker", cat || null, std].filter(Boolean);
        return bits.join(" · ");
      }

      case "gc": {
        const proj = String(p.meta?.["project_name"] ?? "").trim();
        return proj ? `GC · ${proj}` : "General contractor";
      }

      case "team":
        return `Studio · ${humanizeTeamRole(p.status_raw)}`;

      // Field kinds (00281): the trade + the project they work. Consent reads
      // off the roster's consent chip, so the line stays about the work, not
      // status.
      case "sub":
      case "installer":
      case "receiver": {
        const trade = getFieldTradeLabel(
          p.meta?.["trade"] as string | undefined,
        );
        const proj = String(p.meta?.["project_name"] ?? "").trim();
        const bits = [trade || null, proj || null].filter(Boolean);
        return bits.join(" · ") || "Field party";
      }

      // Wave 4 (00419) roster-widening kinds — allied site professionals on a
      // project (no SMS, never "due" — see isNurtureDue). Same "role ·
      // project" shape the gc line already uses.
      case "architect":
      case "photographer":
      case "stager": {
        const proj = String(p.meta?.["project_name"] ?? "").trim();
        return proj ? `${roleLabel(p.role)} · ${proj}` : roleLabel(p.role);
      }

      // Wave 4 (00420) studio rolodex branch — a studio_contacts row with no
      // matching project party. Names what KIND of contact this is (the same
      // free-text PartyKind vocab a person card's contact_kind draws from,
      // labeled via @patina/types' getPartyKindLabel) plus vendor specialties
      // when any are on file. Never a due/nurture read — a rolodex card is a
      // reference, not a relationship in progress.
      case "contact": {
        const kindLabel =
          getPartyKindLabel(p.meta?.["contact_kind"] as string | undefined) ||
          "Contact";
        const rawSpecialties = p.meta?.["specialties"];
        const specialties = Array.isArray(rawSpecialties)
          ? rawSpecialties
              .filter((s): s is string => typeof s === "string")
              .map((s) => getVendorSpecialtyLabel(s) || s)
          : [];
        return specialties.length > 0
          ? `${kindLabel} · ${specialties.join(", ")}`
          : kindLabel;
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
export function deriveNurtureQueue(
  people: DirectoryPerson[],
  now: Date,
): NurtureEntry[] {
  const entries: NurtureEntry[] = [];

  for (const p of people) {
    const dot = deriveStatusDot(p, now);
    const due = isNurtureDue(p, now);
    // Out of touch but not worth surfacing yet — EXCEPT a proposal-stage
    // client. An unsent Direction now wears the neutral dot (it is not in
    // motion), but it is still a live thread the studio is holding: it stays
    // in the queue, relabeled and ranked below everything due, rather than
    // disappearing from the one surface that would remind anyone to send it.
    const holdingADocument = p.role === "client" && p.status_raw === "proposal";
    if (!due && dot === "cool" && !holdingADocument) continue;

    const dormant = daysSince(p.last_touch_at, now) ?? 0;
    const trust =
      num(p.meta?.["total_revenue"]) / 100_000 +
      num(p.meta?.["total_projects"]) +
      num(p.meta?.["satisfaction_score"]);

    // Reason: lean on the relationship line, sharpened for the queue.
    const line = deriveRelationshipLine(p, now);
    let reason = line.text;
    if (p.role === "client" && due)
      reason = `${humanizeSince(p.last_touch_at, now)} since last touch — reconnect now`;
    if (p.role === "lead" && due) reason = "New lead — respond within 24 hours";

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

/** A month label for the journey date stamp (e.g. "April 2026"). A DATE-only
 *  value (kickoff_date, suggested_date) parses as UTC midnight and shifts back a
 *  month in negative-offset timezones — coerce it to local midnight first (the
 *  same guard `dates.ts` applies). */
function fmtMonth(iso: string): string {
  const coerced = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso;
  const d = new Date(coerced);
  return `${MONTH_NAME_FORMAT.format(d)} ${d.getFullYear()}`;
}

/** Dollars from a cents amount, no decimals when round (e.g. "$25,100"). */
function fmtDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
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
  const { proposals, projects, decisions, threads, touchpoints, reviews } =
    inputs;

  // ── proposals: inquiry (created) → sent → signed (the hinge) ──────────────
  for (const p of proposals ?? []) {
    const href = `/doc/${p.id}`;
    const title = (p.title ?? "").trim();
    add(
      out,
      "inquiry",
      "Inquiry",
      title ? `Proposal drafted — ${title}.` : "Proposal drafted.",
      p.created_at,
      href,
    );
    add(
      out,
      "proposal",
      "Proposal",
      "Proposal sent — awaiting their signature.",
      p.sent_at,
      href,
    );
    if (p.signed_at) {
      const amount =
        typeof p.total_cents === "number" && p.total_cents > 0
          ? ` — ${fmtDollars(p.total_cents)}`
          : "";
      add(
        out,
        "proposal",
        "Signed",
        `Proposal signed${amount}.`,
        p.signed_at,
        href,
      );
    }
  }

  // ── projects: opened (kickoff/created) → completed (care) ─────────────────
  for (const pj of projects ?? []) {
    const href = `/doc/${pj.id}`;
    const name = (pj.name ?? "").trim() || "project";
    const opened = pj.kickoff_date ?? pj.created_at;
    add(out, "project", "Project", `Project opened — ${name}.`, opened, href);
    if (pj.completed_at) {
      add(
        out,
        "care",
        "Care",
        `Project delivered — ${name} complete.`,
        pj.completed_at,
        href,
      );
    }
  }

  // ── decisions: resolved (carrying the choice) or still open ───────────────
  for (const d of decisions ?? []) {
    const title = (d.title ?? "").trim() || "A decision";
    const choice = (d.chosen_label ?? "").trim();
    const when = d.resolved_at ?? d.created_at;
    const text =
      d.resolved_at && choice
        ? `${title} — chose ${choice}.`
        : d.resolved_at
          ? `${title} — resolved.`
          : `${title} — awaiting a call.`;
    add(out, "decision", "Decision", text, when);
  }

  // ── threads: the running conversation, anchored at the last word ──────────
  for (const t of threads ?? []) {
    const count = typeof t.message_count === "number" ? t.message_count : 0;
    const subject = (t.subject ?? "").trim();
    const lead =
      count > 0
        ? `${count} ${count === 1 ? "message" : "messages"}`
        : "A conversation";
    const text = subject ? `${lead} — ${subject}.` : `${lead}.`;
    add(
      out,
      "message",
      "Thread",
      text,
      t.last_message_at,
      `/people?thread=${t.id}`,
    );
  }

  // ── touchpoints: the human reach-outs that keep a tie warm ────────────────
  for (const tp of touchpoints ?? []) {
    const reason = (tp.reason ?? "").trim();
    const kind = tp.touchpoint_type.replace(/_/g, " ");
    const text = reason || `${kind} touchpoint.`;
    const when =
      tp.status === "sent"
        ? (tp.created_at ?? tp.suggested_date)
        : (tp.suggested_date ?? tp.created_at);
    add(out, "touchpoint", "Touchpoint", text, when);
  }

  // ── reviews: the words that bring the next client ─────────────────────────
  for (const r of reviews ?? []) {
    const stars =
      typeof r.rating === "number" && r.rating > 0
        ? `${"★".repeat(Math.min(5, Math.round(r.rating)))} `
        : "";
    const snippet = (r.review_text ?? "").trim();
    const quoted = snippet
      ? `“${snippet.length > 90 ? `${snippet.slice(0, 88)}…` : snippet}”`
      : "Review collected.";
    add(out, "review", "Review", `${stars}${quoted}`, r.created_at);
  }

  return sortJourney(out);
}

export { fmtMonth as formatJourneyDate };

/** Stable chronological sort helper for journey events (oldest first). */
export function sortJourney(events: JourneyEvent[]): JourneyEvent[] {
  return [...events].sort((a, b) => a.sortAt - b.sortAt);
}

// ═══════════════════════════════════════════════════════════════════════════
// THE PEOPLE ROOM, REDESIGNED — "Everyone on the Job" (W2b)
//
// The room's unit is the person card, not the party row, and the Directory is
// ONE LIST OF TWO ENTRY TYPES: people are circles, firms are 42px rounded
// squares (PR-g, direction §1 line 2). `people_directory` v4 emits both from
// its contacts branch, told apart by `meta.entity_kind`.
//
// Everything below is pure: rows in, facts out. No React, no I/O, `today`
// injected. The row renders what these return and decides nothing itself.
// ═══════════════════════════════════════════════════════════════════════════

/** A circle or a square: the one visual difference a firm gets. */
export type DirectoryEntryKind = "person" | "firm";

/** A firm is a card whose `entity_kind` says so. Everything else is a human —
 *  an uncarded seat included, since a seat is always somebody. */
export function directoryEntryKind(p: DirectoryPerson): DirectoryEntryKind {
  return p.meta?.["entity_kind"] === "company" ? "firm" : "person";
}

/**
 * A COMPANY-ONLY ENGAGEMENT IS NOT A PERSON (QA-R2-9).
 *
 * `people_directory`'s field-parties branch mints an identity for every
 * uncarded seat, keyed by `party_identity_key(card, login, phone, email, id)`.
 * A bid taken from a firm with nobody named — Rivera Finishes: `display_name`
 * and `company_name` both the firm, no card, no login — falls through that
 * COALESCE chain to the party row's own id and surfaces as a person-shaped row
 * BESIDE the firm's own row: the same entity twice, and one too many heads.
 *
 * Such a row belongs to the Call Sheet's Bidding / Done bands (which read the
 * roster, not this view) and to the firm's own Directory row. Nowhere else.
 */
export function directoryEntryIsCompanyOnlySeat(p: DirectoryPerson): boolean {
  if (directoryEntryKind(p) === "firm") return false;
  if (p.role === "contact" || p.role === "team") return false;
  if (p.profile_id) return false;
  const meta = p.meta ?? {};
  if (typeof meta["studio_contact_id"] === "string") return false;
  const companyName = meta["company_name"];
  if (typeof companyName !== "string" || !companyName.trim()) return false;
  return (
    companyName.trim().toLowerCase() === p.display_name.trim().toLowerCase()
  );
}

/**
 * WHICH STUDIO THE ROLODEX ACTUALLY SITS IN (QA-R2-1).
 *
 * The room used to resolve its `organizationId` as
 * `orgs.find(o => o.type === 'design_studio')?.id` — a first match over an
 * UNORDERED membership read. `designer@patina.dev` belongs to two
 * `design_studio` organizations and every one of the 49 `studio_contacts` rows
 * lives under one of them, so half the time the rolodex read came back empty
 * and the company card printed "Unnamed" for its crew and "Signs: on file" for
 * its payee.
 *
 * `people_directory`'s contacts branch carries each card's own
 * `meta.organization_id`, so the answer is in the rows already in hand: the org
 * that actually holds the cards, ties broken by id so the answer never moves
 * between renders.
 */
export function directoryRolodexOrgId(
  rows: readonly DirectoryPerson[],
): string | null {
  const tally = new Map<string, number>();
  for (const row of rows) {
    const org = row.meta?.["organization_id"];
    if (typeof org !== "string" || !org) continue;
    tally.set(org, (tally.get(org) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [org, count] of [...tally.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (count > bestCount) {
      best = org;
      bestCount = count;
    }
  }
  return best;
}

/**
 * TWO QUESTIONS THE FACES ASK OF A STAGE, and the words they use for each.
 *
 *  · CLOSED FOR GOOD — the seat is history: they left, retired, declined, or
 *    never answered. The company card's "1 person · 2 projects" (SPEC §5.3 #1)
 *    and its Jobs region count everything that is NOT this, because Northgate
 *    Electric's Lindqvist seat is running out its warranty and the spec counts
 *    it as one of the firm's two projects.
 *  · NOT AN OPEN JOB — closed for good, OR running out a warranty. The
 *    Directory firm row's "N open jobs" and the person card's live/past split
 *    ask this one: a warranty is a clock, not a crew on site.
 */
const CLOSED_SEAT_STAGES: ReadonlySet<string> = new Set([
  "off_job",
  "retired",
  "declined",
  "no_response",
]);

export function seatIsClosed(stage: string | null | undefined): boolean {
  return CLOSED_SEAT_STAGES.has(String(stage));
}

export function seatIsDone(stage: string | null | undefined): boolean {
  return seatIsClosed(stage) || String(stage) === "warranty";
}

/**
 * A LEGACY `designer_clients` ROW IS NOT A PERSON CARD (QA-R7-3).
 *
 * `people_directory`'s CLIENTS branch emits one row per `designer_clients`
 * row — the pre-People-CRM lead/client tracker. The Okonkwo seed's row there
 * is the HOUSEHOLD ("The Okonkwo household"), not a human, and it carries
 * Adaeze's own number, so the duplicate-phone scan paired her with it and the
 * band named a legacy artifact where R-Y asks for the two people who share a
 * number. The row it also stood up in the list opened a card that contradicts
 * it: the branch hard-codes `seat_count` 0 and NULL for consent, paper and the
 * contact rule, and the card reads "Nothing on file yet…" under a row printing
 * a live `tel:` link to that very number.
 *
 * E1 person identity is `studio_contacts` (direction §2.2's object-to-surface
 * table) — Adaeze and Chidi each hold one, and those are the rows the Directory
 * stands for. A household's own Directory presence is PR-c's `client_households`
 * object, P2 scope, not an incidental collision against an older table.
 */
export function directoryEntryIsLegacyClientRecord(
  p: DirectoryPerson,
): boolean {
  return p.role === "client";
}

/**
 * CR8-2 — A DUPLICATE IS NOT THE SAME THING AS A BRANCH.
 *
 * QA-R7-3's fix dropped the whole CLIENTS branch from the list and the head,
 * and 00626:1437 emits `'client'` for every `designer_clients` row — so the
 * studio's own client records left the room with the household: Karin
 * Lindqvist, the Ashfords, Elena Marlowe, Nora Ellison and two Client User
 * rows, none of which holds a `studio_contacts` card. The head fell from
 * 41 people to 34 while `portfolio-view` and `nurture-view` went on reading
 * those very rows, and SPEC §3's own head derivation counts Karin Lindqvist
 * among the 29.
 *
 * The row QA-R7-3 was actually about is the one that DUPLICATES a card: "The
 * Okonkwo household" carries Adaeze's own number, and the branch hard-codes
 * NULL consent/paper/rule and `seat_count` 0, so the card is always the better
 * record of the same human. So the exclusion is what it always meant — a
 * legacy record whose profile or whose phone already resolves to a person
 * card — and a client the studio has no card for stays in its own book,
 * exactly as a `lead` row does.
 *
 * (`directoryDuplicatePairs` keeps its UNCONDITIONAL exclusion: a branch that
 * can never carry consent, paper or a rule can never win a dedupe, so it has
 * no business naming itself in the duplicate band whether or not a card
 * exists.)
 */
export function directoryEntryIsCardedElsewhere(
  p: DirectoryPerson,
  carded: { profileIds: ReadonlySet<string>; phones: ReadonlySet<string> },
): boolean {
  if (!directoryEntryIsLegacyClientRecord(p)) return false;
  if (p.profile_id && carded.profileIds.has(p.profile_id)) return true;
  const phone = digits(p.phone);
  return phone.length >= 10 && carded.phones.has(phone);
}

/** The rows the Directory and its head actually stand for (QA-R2-9,
 *  QA-R7-3, CR8-2). */
export function directoryIdentityRows(
  rows: readonly DirectoryPerson[],
): DirectoryPerson[] {
  // The person CARDS in hand — the only thing a legacy client record can be a
  // duplicate OF. `people_directory`'s contacts branch is where every card
  // lives (00626:1845-1869); a firm is not a human, and a legacy client row
  // cannot vouch for another legacy client row.
  const profileIds = new Set<string>();
  const phones = new Set<string>();
  for (const row of rows) {
    if (row.role !== "contact") continue;
    if (directoryEntryKind(row) === "firm") continue;
    if (row.profile_id) profileIds.add(row.profile_id);
    const phone = digits(row.phone);
    if (phone.length >= 10) phones.add(phone);
  }
  const carded = { profileIds, phones };
  return rows.filter(
    (row) =>
      !directoryEntryIsCompanyOnlySeat(row) &&
      !directoryEntryIsCardedElsewhere(row, carded),
  );
}

/** The head counts CARDS, not rows (`people-room.tsx:383` counted rows, and v4
 *  is what makes the count honest). "29 people · 22 firms". */
export function directoryEntryCounts(rows: readonly DirectoryPerson[]): {
  people: number;
  firms: number;
} {
  let people = 0;
  let firms = 0;
  for (const row of rows) {
    if (directoryEntryKind(row) === "firm") firms += 1;
    else people += 1;
  }
  return { people, firms };
}

/** "29 people · 22 firms" — one noun each, never pluralised wrongly. */
export function directoryHeadLine(counts: {
  people: number;
  firms: number;
}): string {
  const people = `${counts.people} ${counts.people === 1 ? "person" : "people"}`;
  const firms = `${counts.firms} ${counts.firms === 1 ? "firm" : "firms"}`;
  return `${people} · ${firms}`;
}

/** What this card IS to the studio. A contact row carries its own
 *  `contact_kind`; an uncarded seat carries its party kind as the role. */
export function directoryContactKind(p: DirectoryPerson): string | null {
  const kind = p.meta?.["contact_kind"];
  if (typeof kind === "string" && kind) return kind;
  return p.role === "contact" ? null : p.role;
}

/**
 * WHICH LIST A TRADE VALUE CAME OUT OF (QA-R7-2).
 *
 * They are two different vocabularies and neither map answers for the other:
 * `FieldTrade` (00281 — what a body does on a job) and `VendorSpecialty` (the
 * maker's own list). `studio_contacts.specialties` holds the second, so
 * labelling it through the trade map fell to that map's raw-value fallback and
 * printed `tile_stone` on Claire Bissett's Directory row — a schema word on a
 * face, which SPEC §8 #3 forbids.
 */
export type DirectoryTradeVocabulary = "trade" | "specialty";

export interface DirectoryTrade {
  value: string;
  vocabulary: DirectoryTradeVocabulary;
}

/** The trade or specialty this identity works in, WITH the list it came from. */
export function directoryTradeEntryOf(
  p: DirectoryPerson,
): DirectoryTrade | null {
  const specialties = p.meta?.["specialties"];
  if (
    Array.isArray(specialties) &&
    typeof specialties[0] === "string" &&
    specialties[0]
  ) {
    return { value: specialties[0], vocabulary: "specialty" };
  }
  const trade = p.meta?.["trade"];
  if (typeof trade === "string" && trade) {
    return { value: trade, vocabulary: "trade" };
  }
  return null;
}

/** The raw value alone — what the trade chip narrows on. */
export function directoryTradeOf(p: DirectoryPerson): string | null {
  return directoryTradeEntryOf(p)?.value ?? null;
}

/**
 * CR8-3 — THE CHIP NARROWS ON THE TRADE THE ROW PRINTS.
 *
 * `personIdentityLine` takes the card's own trade or specialty first and the
 * SEAT's trade after it, because 00626's contacts branch — where every carded
 * human lives — emits no `trade` key at all for a crew or sub card (trade is a
 * seat fact, QA-R7-1). The chip predicate kept asking only the card, so on the
 * seeded studio every one of the eight trade chips narrowed to zero rows over
 * a list visibly reading "· electrical", "· drywall", "· plumbing" — the room
 * printing "Nobody under this narrowing yet." about people it had just listed.
 * One precedence, both places.
 */
export function directoryTradeAdmits(
  p: DirectoryPerson,
  trade: string,
  seatTrade: string | null | undefined,
): boolean {
  if (trade === "all") return true;
  return (directoryTradeOf(p) ?? seatTrade ?? null) === trade;
}

/**
 * The WORDS a studio reads for a trade or a specialty (QA-R7-2).
 *
 * `getFieldTradeLabel` hands back the raw token for anything outside
 * `FieldTrade`, so an unrecognized value — a specialty, or legacy free text on
 * an older seat — is put through the specialty map, whose own fallback
 * humanizes what it does not know. Nothing reaches a face as snake_case.
 */
export function directoryTradeLabel(
  value: string | null | undefined,
  vocabulary: DirectoryTradeVocabulary = "trade",
): string {
  if (!value) return "";
  if (vocabulary === "specialty") return getVendorSpecialtyLabel(value);
  const label = getFieldTradeLabel(value);
  return label === value ? getVendorSpecialtyLabel(value) : label;
}

/**
 * THE TRADE LIVES ON THE SEAT, NOT ON THE CARD (QA-R7-1).
 *
 * A carded crew member holds no trade of their own: `trade` is a seat fact
 * (`project_parties.trade`) and `people_directory`'s contacts branch — where
 * every carded human now lives — has no column for it. So the Directory's
 * identity line printed the firm's name alone for every crew and sub row in
 * the book, where SPEC §5.1 #8 fixes it as "Northgate Electric · electrical".
 *
 * One pass over the seats the Directory already reads, keyed on both joins a
 * row can answer to (`identity_key` and `person_id`). An OPEN seat's trade
 * wins over a finished one's; within either, the first seat naming a trade
 * wins, and the seats arrive in the view's deterministic order (CR7-3), so one
 * row reads the same way twice.
 */
export function directorySeatTradeIndex(
  seats: readonly PeopleDirectorySeat[] | undefined,
): Map<string, string> {
  const open = new Map<string, string>();
  const finished = new Map<string, string>();
  for (const seat of seats ?? []) {
    const trade = typeof seat.trade === "string" ? seat.trade.trim() : "";
    if (!trade) continue;
    const target = seatIsDone(seat.stage) ? finished : open;
    for (const key of [seat.identity_key, seat.person_id]) {
      if (!key || target.has(key)) continue;
      target.set(key, trade);
    }
  }
  for (const [key, trade] of finished) {
    if (!open.has(key)) open.set(key, trade);
  }
  return open;
}

/** The firm this identity works at, by name and by card id. */
export function directoryFirmOf(p: DirectoryPerson): {
  id: string | null;
  name: string | null;
} {
  const id = p.meta?.["company_id"];
  const name = p.meta?.["company_name"];
  return {
    id: typeof id === "string" && id ? id : null,
    name: typeof name === "string" && name ? name : null,
  };
}

/**
 * A COMPANY'S OWN KIND VOCABULARY (`studio_contacts.contact_kind` on an
 * `entity_kind = 'company'` row) — deliberately DISTINCT from a person's
 * PartyKind: a firm card names what KIND OF FIRM it is, not a role on a
 * project. Free TEXT (00417, no CHECK), so an unrecognized value prettifies
 * rather than printing raw snake_case.
 *
 * CR-6: it lives HERE, beside the derivations that need it, rather than inside
 * `directory/company-row.tsx` — this module takes no React import, and the row
 * component re-exports the function it used to own.
 */
const COMPANY_KIND_LABELS: Record<string, string> = {
  gc: "GC firm",
  workroom: "Workroom",
  showroom: "Showroom",
  vendor: "Vendor",
  supplier: "Supplier",
};

/** Free TEXT never reaches a face as snake_case (SPEC §8 #3). */
function prettifyKind(kind: string): string {
  return kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function companyKindLabel(kind: string | null | undefined): string {
  if (!kind) return "Company";
  return COMPANY_KIND_LABELS[kind] ?? prettifyKind(kind);
}

/**
 * The firm ROW's word (SPEC §5.1 #13 / §5.3 #1), which fixes `gc` as "GC" —
 * not "GC firm" and certainly not the party map's "General Contractor". Every
 * other kind falls through the company vocabulary, then the party vocabulary
 * (so a `sub` firm still reads "Subcontractor"), then prettification.
 */
const COMPANY_KIND_SHORT_LABELS: Record<string, string> = { gc: "GC" };

export function companyKindShortLabel(kind: string | null | undefined): string {
  if (!kind) return "Company";
  const short = COMPANY_KIND_SHORT_LABELS[kind] ?? COMPANY_KIND_LABELS[kind];
  if (short) return short;
  const party = getPartyKindLabel(kind);
  if (party && party !== kind) return party;
  return prettifyKind(kind);
}

/**
 * CR11-4 — THE RUNNING-PROSE KIND WORD, keyed separately from the column-head
 * map above.
 *
 * `companyKindShortLabel` is the word a firm ROW prints on its own, sentence
 * case: "GC", "Subcontractor", "Vendor". The company card's header puts the
 * kind AFTER a trade — SPEC §5.3 #1 fixes that literal as "Electrical sub" —
 * where a capitalised column head reads wrong ("Electrical Subcontractor") and
 * the raw column token reads worse ("Carpentry gc", "Tile & stone vendor").
 * This map is that second register, and every company_kind 00592's CHECK
 * admits has an entry except `other`, which has no prose word at all: a kind
 * with no entry prints nothing rather than a token.
 */
const COMPANY_KIND_PROSE_WORDS: Record<string, string> = {
  gc: "GC",
  sub: "sub",
  architect: "architect",
  engineer: "engineer",
  lender: "lender",
  authority: "authority",
  inspector: "inspector",
  showroom: "showroom",
  vendor: "vendor",
  workroom: "workroom",
  supplier: "supplier",
  stager: "stager",
  photography: "photography",
  maker: "maker",
};

export function companyKindProseWord(
  kind: string | null | undefined,
): string | null {
  if (!kind) return null;
  return COMPANY_KIND_PROSE_WORDS[kind] ?? null;
}

/**
 * A CARD's kind, in words. `contact_kind` carries the CARD vocabulary, which is
 * the party vocabulary PLUS the studio's own kinds (`studio`, `showroom`,
 * `workroom`, `authority`, `photography`, `maker`…). CR-15: putting it through
 * `getPartyKindLabel` alone printed the raw token `studio` on Leah Hartwell's,
 * Priya Natarajan's and Dale Whitcomb's Directory rows.
 */
export function contactCardKindLabel(kind: string | null | undefined): string {
  if (!kind) return "";
  const party = getPartyKindLabel(kind);
  if (party && party !== kind) return party;
  return COMPANY_KIND_LABELS[kind] ?? prettifyKind(kind);
}

const CLIENT_KINDS = new Set(["client", "lead", "client_rep"]);

/**
 * QA-R11-1: the client side of a job, as the Directory's own chip test already
 * reads it. A field link opens the Call Sheet and the site access card, which
 * PR-w rules studio-only — so a client-side card is never a subject for one.
 */
export function isClientSideKind(kind: string | null | undefined): boolean {
  return !!kind && CLIENT_KINDS.has(kind);
}
const CREW_KINDS = new Set([
  "gc",
  "sub",
  "installer",
  "receiver",
  "architect",
  "engineer",
  "inspector",
  "lender",
]);
const MAKER_KINDS = new Set([
  "maker",
  "vendor",
  "workroom",
  "showroom",
  "supplier",
]);
/**
 * CR-7: the studio's OWN people carry `contact_kind = 'studio'` on their card
 * (Leah Hartwell, Priya Natarajan, Dale Whitcomb in the seed); `'team'` is the
 * `project_team_members` branch's role. Both belong under the Studio chip
 * (SPEC §5.1 #2) — with only `'team'` here the three fell through to Crew.
 */
const STUDIO_KINDS = new Set(["studio", "team"]);

/**
 * Which of the six chips an entry falls under (direction §3.1). A firm sorts
 * into Firms AND into the band of the crew it carries, which is why the chip
 * test is asked of the entry, not of a stored column.
 */
export function directoryBandOf(p: DirectoryPerson): DirectoryChip {
  if (directoryEntryKind(p) === "firm") return "firms";
  const kind = directoryContactKind(p) ?? "";
  if (CLIENT_KINDS.has(kind)) return "clients";
  if (STUDIO_KINDS.has(kind)) return "studio";
  if (MAKER_KINDS.has(kind)) return "makers";
  if (CREW_KINDS.has(kind)) return "crew";
  if (p.meta?.["vendor_id"]) return "makers";
  return "crew";
}

/**
 * PR-g: firms appear under Everyone as well as under Firms, sorted into the
 * band of the crew they carry. A chip admits an entry when the entry's own
 * band matches, and Everyone admits everything.
 */
export function directoryChipAdmits(
  chip: DirectoryChip,
  p: DirectoryPerson,
  firmBand?: DirectoryChip | null,
): boolean {
  if (chip === "everyone") return true;
  const band = directoryBandOf(p);
  if (chip === "firms") return band === "firms";
  if (band === "firms") return (firmBand ?? null) === chip;
  return band === chip;
}

/** Digits only, for the phone-suffix match. */
function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * The ask bar's match, over name, firm, phone DIGITS, trade and email
 * (direction §3.1). Four digits is the floor — fewer matches half the book.
 */
export function directoryEntryMatches(
  p: DirectoryPerson,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const firm = directoryFirmOf(p).name ?? "";
  const trade = directoryTradeEntryOf(p);
  const haystack = [
    p.display_name,
    firm,
    p.email ?? "",
    // QA-R7-2: the words the row actually prints, out of the right list.
    trade ? directoryTradeLabel(trade.value, trade.vocabulary) : "",
    trade?.value ?? "",
    getPartyKindLabel(directoryContactKind(p) ?? ""),
  ]
    .join(" ")
    .toLowerCase();
  if (haystack.includes(query)) return true;
  const typed = digits(rawQuery);
  return typed.length >= 4 && digits(p.phone).endsWith(typed);
}

/**
 * "Northgate Electric · electrical" — the person row's second line.
 *
 * QA-R7-1: `seatTrade` is the trade off this identity's most relevant seat,
 * resolved by `directorySeatTradeIndex` from the seats the caller already
 * holds. The card's own trade or specialty still wins when it carries one; the
 * seat answers for every carded crew member, who carries none.
 */
export function personIdentityLine(
  p: DirectoryPerson,
  seatTrade?: string | null,
): string {
  const parts: string[] = [];
  const firm = directoryFirmOf(p).name;
  if (firm) parts.push(firm);
  const trade: DirectoryTrade | null =
    directoryTradeEntryOf(p) ??
    (seatTrade ? { value: seatTrade, vocabulary: "trade" } : null);
  if (trade) {
    parts.push(
      directoryTradeLabel(trade.value, trade.vocabulary).toLowerCase(),
    );
  }
  if (parts.length === 0) {
    // CR-15: the CARD vocabulary, not the party map — a studio person with no
    // firm and no specialty printed the raw token `studio` here.
    const kind = contactCardKindLabel(directoryContactKind(p));
    if (kind) parts.push(kind);
  }
  return parts.join(" · ");
}

/** "GC · 3 on the crew · 2 open jobs" — the firm row's second line. */
export function firmIdentityLine(
  p: DirectoryPerson,
  counts: { crew: number; jobs: number },
): string {
  const parts: string[] = [];
  // CR-6: a FIRM's kind is the company vocabulary. `getPartyKindLabel` has no
  // entry for showroom/workroom/authority/supplier/photography/maker, so seven
  // of twenty-one firm rows printed a raw lowercase token — and it turned `gc`
  // into "General Contractor" where the spec fixes the word as "GC".
  const kind = directoryContactKind(p);
  if (kind) parts.push(companyKindShortLabel(kind));
  parts.push(`${counts.crew} on the crew`);
  parts.push(`${counts.jobs} open ${counts.jobs === 1 ? "job" : "jobs"}`);
  return parts.join(" · ");
}

/**
 * R-A / C13 / C24: a lender or an inspector never owed the studio paper, so
 * neither the person nor their firm prints a paper word at all. The view
 * reports the fact; this is the display rule that decides whether it is owed.
 */
export function entryOwesPaperWord(p: DirectoryPerson): boolean {
  return partyKindOwesPaper(directoryContactKind(p));
}

/**
 * The paper word an entry actually prints — `null` where none is owed, so a
 * firm that never had to file anything shows nothing rather than "Not on file".
 */
export function entryPaperWord(p: DirectoryPerson): string | null {
  return entryOwesPaperWord(p) ? p.paper_state : null;
}

/**
 * A rule that FORBIDS a channel takes the leading rule; a rule that merely
 * prefers one is ordinary prose (C3). `contact_rule_summary` renders the
 * clause order, so the block is read off the sentence it wrote.
 */
export function contactRuleBlocks(summary: string | null | undefined): boolean {
  if (!summary) return false;
  return /\b(never|do not|don't|no )/i.test(summary);
}

/** Two cards sharing a phone number — dedupe rule 1 (`crm-model.md` §4). */
export function directoryDuplicatePairs(
  rows: readonly DirectoryPerson[],
): Array<[DirectoryPerson, DirectoryPerson]> {
  const byPhone = new Map<string, DirectoryPerson[]>();
  for (const row of rows) {
    if (directoryEntryKind(row) === "firm") continue;
    // M2R-6 — BOTH SIDES OF A PAIR MUST BE ROLODEX CARDS, because W3 put an
    // ACT on this band ("Compare these two") and the act merges two
    // `studio_contacts` ids. `people_directory` has five identity branches and
    // only the `contact` branch's `person_id` is a card id: a `lead` row
    // carries `leads.contact_phone` and a `team` row the teammate's profile
    // phone, so a lead or a teammate the studio has SINCE carded — the
    // ordinary case — paired with their own card. Pressing it opened the sheet
    // with one column reading "—" for every field and answered
    // `merge_contact_not_found` → "One of these cards is no longer in the
    // book.", which is false: the row is in the book, it was never a card.
    // This also subsumes QA-R7-3's legacy-client leg (`role === 'client'`),
    // whose collision was the same shape one branch over.
    if (row.role !== "contact") continue;
    const key = digits(row.phone);
    if (key.length < 10) continue;
    const bucket = byPhone.get(key);
    if (bucket) bucket.push(row);
    else byPhone.set(key, [row]);
  }
  const pairs: Array<[DirectoryPerson, DirectoryPerson]> = [];
  for (const bucket of byPhone.values()) {
    if (bucket.length < 2) continue;
    const sorted = [...bucket].sort((a, b) =>
      a.display_name.localeCompare(b.display_name),
    );
    pairs.push([sorted[0], sorted[1]]);
  }
  return pairs;
}

/** The duplicate band's sentence. It names the collision and nothing else —
 *  the Compare & merge sheet is phase 2 (R-Y). */
export const DIRECTORY_DUPLICATE_SENTENCE = "These two cards share a phone.";

/** The empty state, one sentence (house sheet §A10). */
export const DIRECTORY_EMPTY_SENTENCE = "Nobody under this narrowing yet.";

/**
 * `contact_rule_summary()` already writes the routed clause — "Write Rosa
 * Delgado instead." — as part of its fixed clause order. R-L/C22 say the
 * routed line must also carry a WAY TO REACH her: a routing instruction with
 * no channel attached sends the reader nowhere.
 *
 * So the clause is lifted back out of the sentence and handed to
 * `ContactRuleLine`, which owns the one channel-selection rule (email if
 * present, then the office phone tel-linked). The rest of the summary prints
 * unchanged, in the order the database wrote it.
 */
export function splitRoutedClause(summary: string | null | undefined): {
  rest: string | null;
  routedName: string | null;
} {
  if (!summary) return { rest: null, routedName: null };
  const match = /\s*Write (.+?) instead\.\s*/.exec(summary);
  if (!match) return { rest: summary, routedName: null };
  const rest = (
    summary.slice(0, match.index) +
    " " +
    summary.slice(match.index + match[0].length)
  )
    .replace(/\s+/g, " ")
    .trim();
  return { rest: rest || null, routedName: match[1] };
}
