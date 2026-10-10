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
 */

import type { NeedState } from '@patina/supabase';
import type { DeskNeed } from './desk-need-list';
import { classOfNeed } from './need-class';
import { scopeDeskNeeds, type DeskLeads, type DeskScope } from './desk-scope';

/** Q1 — the sheet's hard cap. */
export const DAY_SHEET_LINES = 5;

export interface DaySheetWaiting {
  need: DeskNeed;
  /** Who the studio is waiting on: the state's own name, else the need's. */
  who: string;
  /** When she acted (`acted_at`). */
  since: string;
}

export interface DaySheetSetAside {
  need: DeskNeed;
  /** The local day it comes back (`set_aside_until`). */
  until: string;
  reason: string | null;
}

export interface DaySheet {
  lines: DeskNeed[];
  waitingOn: DaySheetWaiting[];
  setAside: DaySheetSetAside[];
  /** True only when nothing is on the sheet AND every feed answered. */
  empty: boolean;
  /** The feeds this read could not answer; the sheet names them. */
  unchecked: string[];
}

export interface DaySheetInput {
  needs: readonly DeskNeed[];
  states: ReadonlyMap<string, NeedState>;
  leads: DeskLeads;
  meUserId: string | null | undefined;
  scope: DeskScope;
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

function waitingWho(entry: DeskNeed, state: NeedState): string {
  const named = state.waitingOn?.trim() || entry.need.draft?.maker?.trim();
  if (named) return named;
  if (entry.need.owner === 'maker') return 'the maker';
  if (entry.need.owner === 'client') return 'the client';
  return entry.projectName;
}

export function deriveDaySheet(input: DaySheetInput): DaySheet {
  const today = localDay(input.now);
  const scoped = scopeDeskNeeds([...input.needs], input.leads, input.meUserId, input.scope);
  const candidates: DeskNeed[] = [];
  const waitingOn: DaySheetWaiting[] = [];
  const setAside: DaySheetSetAside[] = [];

  for (const entry of scoped) {
    const state = input.states.get(entry.key);
    if (state?.actedAt) {
      waitingOn.push({ need: entry, who: waitingWho(entry, state), since: state.actedAt });
      continue;
    }
    if (state && stillAhead(state.setAsideUntil, today)) {
      setAside.push({ need: entry, until: state.setAsideUntil!, reason: state.setAsideReason });
      continue;
    }
    if (state && stillAhead(state.deferredUntil, today)) continue;
    // A setup chore never leads (FR4 ruling 521 (b), the band's selectNext).
    if (classOfNeed(entry.need.kind) === 3) continue;
    candidates.push(entry);
  }

  const lines = candidates.slice(0, DAY_SHEET_LINES);
  const unchecked = [...input.unreadFeeds];
  return {
    lines,
    waitingOn,
    setAside,
    empty: lines.length === 0 && unchecked.length === 0,
    unchecked,
  };
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
