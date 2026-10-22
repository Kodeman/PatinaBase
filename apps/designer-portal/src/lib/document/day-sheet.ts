/**
 * The Day Sheet (US-25 slice 4, direction.md §3 B · Q1 · Q5 · Q6).
 *
 * At most five sentences across the seat's jobs, read off the one ranked need
 * list (`deriveDeskNeedList`), so a job's line here and its band on the paper
 * name the same head need. Pure, and handed `now`: nothing here reads a clock.
 *
 * Q1 guards, which the tests pin: never more than five lines, no overflow
 * count, no "cleared today", no streak, and "Not today" lasts one working
 * day with no counter of its own.
 *
 * US-28 U-Q2 — Today is the top five of ONE ranked list of the open needs and
 * the needs settled today. Settling never changes a line's rank, so no slot
 * ever refills; a newly arrived need that outranks a line enters Today (M7)
 * and the line it displaces moves to Also yours with its state. A slot frees
 * only when a need is resolved at its source and so no longer exists.
 */

import type { NeedState } from '@patina/supabase';
import type { SectionKey } from './desk-derivation';
import type { RosterLine } from './desk-roster-derivation';
import { rankDeskNeeds, type DeskNeed } from './desk-need-list';
import { classOfNeed } from './need-class';
import {
  firstName,
  handoffReadFor,
  scopeDeskNeeds,
  type DeskDesigners,
  type DeskHolder,
  type DeskLeads,
  type DeskScope,
} from './desk-scope';

/** Q1 — the sheet's hard cap. */
export const DAY_SHEET_LINES = 5;

/**
 * A need state as the sheet reads it. `updatedAt` (the row's `updated_at`)
 * dates a "Not today" or a set-aside written today; until the hook selects it
 * (US-28 S3), such a line reads as written on an earlier day.
 */
export type SheetNeedState = NeedState & { updatedAt?: string | null };

/** U-Q4 — a teammate's acted fact (`studio_need_state_facts()`): who and
 *  when, and nothing else. Never merged into her own states. */
export interface TeammateAct {
  userId: string;
  actedAt: string;
}

/** How a line settled today. `drafted`: a member who may not send saved the
 *  draft for the job's lead (Q11); `read`: a hand-off note read. */
export type SheetSettledKind = 'acted' | 'drafted' | 'read' | 'not_today' | 'set_aside';

export interface SheetSettled {
  kind: SheetSettledKind;
  /** When it settled: `acted_at`, or a deferral's `updated_at`. */
  at: string;
  /** `acted`: who the studio now waits on. `drafted`: the lead it waits for. */
  who?: string;
  /** A teammate's user id, where the job's holder acted (U-Q4). */
  by?: string;
  /** `not_today` / `set_aside`: the local day it comes back. */
  until?: string;
  reason?: string | null;
}

/** A line of the one ranked list; `settled` once it settled today. */
export type SheetEntry = DeskNeed & { settled?: SheetSettled };

/** US-28 change 7 — the settled words of a draft saved for the lead. */
export function draftedForWords(lead: string): string {
  return `Drafted for ${lead} · she sees this first`;
}

/**
 * US-28 change 5 — where a job stands, by its id (`project_id ??
 * engagement_id`). `yours`: the studio owes an act. `settled`: every line it
 * has on the list settled today. `back`: put off until a day ahead. `others`:
 * the studio owes no act — acted on before today. A job with no need on the
 * list has no entry: the ledger reads it as `others` when it carries a motion,
 * else `rest`.
 */
export type DeskStanding = 'yours' | 'settled' | 'back' | 'others' | 'rest';

/** The order a job's needs decide its standing in: one owed act makes it
 *  yours, whatever else it carries. */
const STANDING_ORDER: Record<DeskStanding, number> = {
  yours: 0,
  settled: 1,
  back: 2,
  others: 3,
  rest: 4,
};

export interface DaySheetWaiting {
  need: DeskNeed;
  /** Who the studio is waiting on: the state's own name, else the need's. */
  who: string;
  /** When she acted (`acted_at`). */
  since: string;
  /** A teammate's user id, where the job's holder acted (U-Q4). */
  by?: string;
}

export interface DaySheetSetAside {
  need: DeskNeed;
  /** The local day it comes back (`set_aside_until`, or a "Not today"'s
   *  `deferred_until`). */
  until: string;
  reason: string | null;
}

export interface DaySheet {
  /** Today: the top five of the one ranked list, settled lines in place. */
  lines: SheetEntry[];
  /** The same list past the fifth line: Also yours, settling in place there. */
  alsoYours: SheetEntry[];
  /** Acted on before today: with others. */
  waitingOn: DaySheetWaiting[];
  /** Put off until a day ahead, on an earlier day: Coming back. */
  setAside: DaySheetSetAside[];
  standing: ReadonlyMap<string, DeskStanding>;
  /** True only when nothing is on the sheet AND every feed answered. */
  empty: boolean;
  /** The feeds this read could not answer; the sheet names them. */
  unchecked: string[];
}

export interface DaySheetInput {
  needs: readonly DeskNeed[];
  /** Her own states only (the table, filtered to her rows). */
  states: ReadonlyMap<string, SheetNeedState>;
  leads: DeskLeads;
  meUserId: string | null | undefined;
  scope: DeskScope;
  /** Who carries each job no one leads yet (`deskDesignersOf(live)`). */
  designers?: DeskDesigners;
  /** U-Q4 — teammates' acted facts, by need key. A line holds the act of the
   *  teammate who carries its job; anyone else's act leaves it open. */
  teammateActs?: ReadonlyMap<string, readonly TeammateAct[]>;
  unreadFeeds: readonly string[];
  now: Date;
}

/** A local calendar day as `YYYY-MM-DD` — the shape `deferred_until` stores. */
export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "Not today" returns the need on the next working day (Mon–Fri):
 *  Friday, Saturday and Sunday all come back on Monday. */
export function nextWorkingDay(now: Date): string {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
  return localDay(next);
}

/** A bare date still ahead of today, read as local calendar days. */
function stillAhead(day: string | null, today: string): boolean {
  return Boolean(day && day.slice(0, 10) > today);
}

/** An event stamp that falls on today's local calendar day. */
function onDay(at: string | null | undefined, today: string): boolean {
  if (!at) return false;
  const date = new Date(at);
  return Number.isFinite(date.getTime()) && localDay(date) === today;
}

function waitingWho(entry: DeskNeed, state: Pick<NeedState, 'waitingOn'> | null | undefined): string {
  const named = state?.waitingOn?.trim() || entry.need.draft?.maker?.trim();
  if (named) return named;
  if (entry.need.owner === 'maker') return 'the maker';
  if (entry.need.owner === 'client') return 'the client';
  return entry.projectName;
}

/**
 * SQ-751 F7 — an aggregate ("2 POs sent") is acted on one record at a time,
 * each under its own key. The line stands for the first record not acted on
 * before today, re-keyed to it, so chasing the first PO never quiets the
 * second; once every record is acted on, it reads as the first.
 *
 * U-Q2 — a record acted on today holds the line: it settles in place under
 * that record's key and rank, and the records after it wait in the job until
 * tomorrow, so a chase never refills Today.
 */
function nextUnacted(entry: DeskNeed, states: ReadonlyMap<string, NeedState>, today: string): DeskNeed {
  const records = entry.need.records;
  if (!records) return entry;
  const next = records.find((record) => {
    const actedAt = states.get(`${entry.need.kind}:${record.recordId}`)?.actedAt;
    return !actedAt || onDay(actedAt, today);
  });
  if (!next || next === records[0]) return entry;
  const key = `${entry.need.kind}:${next.recordId}`;
  return {
    ...entry,
    key,
    need: {
      ...entry.need,
      key,
      recordId: next.recordId,
      at: next.at,
      ...(next.dueOn !== undefined ? { dueOn: next.dueOn } : {}),
    },
  };
}

/** U-Q4 — the act of the teammate who carries the job (its lead, else its
 *  designer), latest first. Anyone else's act — a draft saved for the
 *  holder — leaves the line open: the holder still owes it. */
function holderActOf(entry: DeskNeed, input: DaySheetInput): TeammateAct | null {
  const holder =
    input.leads.get(entry.projectId)?.leadUserId ?? input.designers?.get(entry.projectId) ?? null;
  if (!holder || holder === input.meUserId) return null;
  let latest: TeammateAct | null = null;
  for (const act of input.teammateActs?.get(entry.key) ?? []) {
    if (act.userId === holder && (!latest || act.actedAt > latest.actedAt)) latest = act;
  }
  return latest;
}

/** Change 7 — her act was a draft saved for the job's lead (Q11): it waits on
 *  the lead by first name, as the act sheet saved it. */
function draftedFor(entry: DeskNeed, state: NeedState, input: DaySheetInput): string | null {
  const lead = input.leads.get(entry.projectId);
  const waiting = state.waitingOn?.trim();
  if (!lead || !waiting || lead.leadUserId === input.meUserId) return null;
  return firstName(lead.leadName) === waiting ? waiting : null;
}

/** How the line settled today, or null while it is open or settled earlier. */
function settledToday(
  entry: DeskNeed,
  state: SheetNeedState | undefined,
  holderAct: TeammateAct | null,
  input: DaySheetInput,
  today: string,
): SheetSettled | null {
  if (entry.need.kind === 'handoff') {
    const read =
      handoffReadFor(state, input.leads.get(entry.projectId)?.assignedAt) &&
      onDay(state?.actedAt, today);
    return read ? { kind: 'read', at: state!.actedAt! } : null;
  }
  if (state?.actedAt) {
    if (!onDay(state.actedAt, today)) return null;
    const lead = draftedFor(entry, state, input);
    return lead
      ? { kind: 'drafted', at: state.actedAt, who: lead }
      : { kind: 'acted', at: state.actedAt, who: waitingWho(entry, state) };
  }
  if (state && onDay(state.updatedAt, today)) {
    if (state.setAsideUntil) {
      return { kind: 'set_aside', at: state.updatedAt!, until: state.setAsideUntil, reason: state.setAsideReason };
    }
    if (state.deferredUntil) {
      return { kind: 'not_today', at: state.updatedAt!, until: state.deferredUntil };
    }
  }
  if (holderAct && onDay(holderAct.actedAt, today)) {
    return { kind: 'acted', at: holderAct.actedAt, who: waitingWho(entry, null), by: holderAct.userId };
  }
  return null;
}

function stand(standing: Map<string, DeskStanding>, jobId: string, next: DeskStanding): void {
  const held = standing.get(jobId);
  if (!held || STANDING_ORDER[next] < STANDING_ORDER[held]) standing.set(jobId, next);
}

export function deriveDaySheet(input: DaySheetInput): DaySheet {
  const today = localDay(input.now);
  const scoped = scopeDeskNeeds(
    [...input.needs],
    input.leads,
    input.meUserId,
    input.scope,
    input.designers,
  );
  const listed: SheetEntry[] = [];
  const waitingOn: DaySheetWaiting[] = [];
  const setAside: DaySheetSetAside[] = [];

  for (const aggregate of scoped) {
    // A setup chore never leads (FR4 ruling 521 (b), the band's selectNext).
    if (classOfNeed(aggregate.need.kind) === 3) continue;
    const entry = nextUnacted(aggregate, input.states, today);
    const state = input.states.get(entry.key);
    // Her own row keeps precedence only while it still holds the line — an
    // act, or a set-aside or "Not today" still ahead. A spent deferral or a
    // cleared row never shadows the holder's act.
    const ownHolds =
      !!state &&
      (!!state.actedAt || stillAhead(state.setAsideUntil, today) || stillAhead(state.deferredUntil, today));
    const holderAct = ownHolds ? null : holderActOf(entry, input);
    // U-Q2 — a line settled today keeps its place in the one list.
    const settled = settledToday(entry, state, holderAct, input, today);
    if (settled) {
      listed.push({ ...entry, settled });
      continue;
    }
    // SQ-774 R4 — a hand-off is read only for the assignment that stands now
    // (`handoffReadFor`, as `deriveHandoffNeeds` reads it): a read of an
    // earlier hand-off of the same job never silences this one.
    if (entry.need.kind === 'handoff') {
      if (handoffReadFor(state, input.leads.get(entry.projectId)?.assignedAt)) continue;
    } else if (state?.actedAt) {
      waitingOn.push({ need: entry, who: waitingWho(entry, state), since: state.actedAt });
      continue;
    } else if (holderAct) {
      waitingOn.push({
        need: entry,
        who: waitingWho(entry, null),
        since: holderAct.actedAt,
        by: holderAct.userId,
      });
      continue;
    }
    if (state && stillAhead(state.setAsideUntil, today)) {
      setAside.push({ need: entry, until: state.setAsideUntil!, reason: state.setAsideReason });
      continue;
    }
    // F4 — a "Not today" comes back too: it waits in Coming back, never vanishes.
    if (state && stillAhead(state.deferredUntil, today)) {
      setAside.push({ need: entry, until: state.deferredUntil!, reason: null });
      continue;
    }
    listed.push(entry);
  }

  // SQ-774 R5 — an aggregate re-keyed to its next record carries that
  // record's age and due day, so the list is ranked again by the one shared
  // order before the five are taken. Settled lines rank with the open ones,
  // so settling frees no slot (U-Q2).
  const ranked = rankDeskNeeds(listed, input.now);
  const lines = ranked.slice(0, DAY_SHEET_LINES);
  const alsoYours = ranked.slice(DAY_SHEET_LINES);

  const standing = new Map<string, DeskStanding>();
  for (const entry of ranked) stand(standing, entry.projectId, entry.settled ? 'settled' : 'yours');
  for (const { need } of setAside) stand(standing, need.projectId, 'back');
  for (const { need } of waitingOn) stand(standing, need.projectId, 'others');

  const unchecked = [...input.unreadFeeds];
  return {
    lines,
    alsoYours,
    waitingOn,
    setAside,
    standing,
    empty: lines.length === 0 && unchecked.length === 0,
    unchecked,
  };
}

/** One Today card: a job and its lines on the sheet. */
export interface SheetCard {
  /** `project_id ?? engagement_id` — the key the sheet's lines carry. */
  jobId: string;
  /** The job's real project, from the roster; null for a lead or proposal. */
  projectId?: string | null;
  name: string;
  /** The job's stage, from the full roster; null where the roster has none. */
  stage: SectionKey | null;
  /** Who carries the job; null where the caller names no holders. */
  holder: DeskHolder | null;
  /** Its lines in rank order, a hand-off first. */
  lines: SheetEntry[];
}

/**
 * US-28 change 1 — Today's lines as cards, one per job. Cards stand in the
 * order of their first line's rank; within a card a hand-off goes first. The
 * stage comes from the full roster map (`project_id ?? engagement_id` → line),
 * built before the ledger drops Today's jobs.
 */
export function groupSheetByJob(
  lines: readonly SheetEntry[],
  rosterJobs: ReadonlyMap<string, Pick<RosterLine, 'name' | 'stage' | 'projectId'>>,
  holderOf?: (jobId: string) => DeskHolder,
): SheetCard[] {
  const cards = new Map<string, SheetCard>();
  for (const line of lines) {
    let card = cards.get(line.projectId);
    if (!card) {
      const job = rosterJobs.get(line.projectId);
      card = {
        jobId: line.projectId,
        projectId: job?.projectId ?? null,
        name: job?.name ?? line.projectName,
        stage: job?.stage ?? null,
        holder: holderOf ? holderOf(line.projectId) : null,
        lines: [],
      };
      cards.set(line.projectId, card);
    }
    card.lines.push(line);
  }
  return [...cards.values()].map((card) => ({
    ...card,
    lines: [
      ...card.lines.filter((line) => line.need.kind === 'handoff'),
      ...card.lines.filter((line) => line.need.kind !== 'handoff'),
    ],
  }));
}

/**
 * US-43 R7 — the card's one state sentence, under its name: whose move the
 * job is today and whether it is late, in words. Never a count (Q1), never
 * "cleared"; a card whose lines all settled says so once.
 */
export function cardStateWords(card: Pick<SheetCard, 'holder' | 'lines'>): string {
  const open = card.lines.filter((line) => !line.settled);
  if (open.length === 0) return settledCardWords(card.lines);
  return openCardWords(
    theirName(card.holder),
    open.some((line) => line.need.kind.startsWith('overdue_')),
  );
}

/** Her own "Not today" or set-aside, not the holder's act. */
const ownDeferral = (settled: SheetSettled) =>
  !settled.by && (settled.kind === 'not_today' || settled.kind === 'set_aside');

function settledCardWords(lines: readonly SheetEntry[]): string {
  return lines.every(({ settled }) => !!settled && ownDeferral(settled)) ? 'Put off for today.' : 'Handled for today.';
}

/** Who else carries the job, where it is not hers; null where it is. */
const theirName = (holder: DeskHolder | null) => (holder && !holder.mine ? (holder.name ?? 'the lead') : null);

function openCardWords(theirs: string | null, late: boolean): string {
  if (theirs) return late ? `Overdue, with ${theirs} today.` : `With ${theirs} today.`;
  return late ? 'Overdue, and yours today.' : 'Yours today.';
}

/**
 * Q5 — the time word beside a line: "just now", "40 minutes ago", "2 hours
 * ago", "yesterday". Only inside 24 hours; older, or with no event time, the
 * line prints none. The Desk keeps no time the job was last opened (the
 * recent-documents list carries no timestamp), so the 24-hour window is the
 * whole rule.
 */
export function timeWord(at: string | null | undefined, now: Date): string | null {
  if (!at) return null;
  const then = new Date(at);
  const elapsed = now.getTime() - then.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 86_400_000) return null;
  if (localDay(then) !== localDay(now)) return 'yesterday';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes === 1 ? 'a minute ago' : `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
}
