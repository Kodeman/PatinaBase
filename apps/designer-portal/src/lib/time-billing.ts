/**
 * Pure helpers for time-entry billing (Wave 4, 00177/00178).
 *
 * Line-item semantics for kind='time': ONE line per invoice draft with
 * quantity = 1 and unit_amount_cents = amount_cents = the SUM of the selected
 * entries' view-resolved amounts. The hours ride in the description (and
 * metadata.total_minutes); metadata.time_entry_ids carries provenance. This
 * keeps qty × unit math exact everywhere (computeInvoiceTotals, the
 * issue_invoice RPC, detail/print/client renderers) — a weighted hourly rate
 * would re-round and drift from the per-entry amounts the view computed.
 */

// ── Duration formatting ──

/** 270 → "4h 30m" — re-exported from @patina/shared so the invoice renderers
 * (designer + client portals) and this module share one implementation. */
export { formatMinutesAsHours as formatHoursLabel } from '@patina/shared';
import { formatMinutesAsHours as formatHoursLabel } from '@patina/shared';

/** Minutes → decimal hours rounded to 0.1 (for metric blocks). */
export function minutesToHours(minutes: number): number {
  return Math.round(((minutes || 0) / 60) * 10) / 10;
}

// ── Invoice time-line assembly ──

export interface TimeLineEntryInput {
  id: string;
  duration_minutes: number;
  amount_cents: number;
}

export interface TimeLineDraft {
  /** e.g. "Design services — 4h 30m (3 entries)" */
  description: string;
  /** Sum of the entries' view-resolved amount_cents. */
  amountCents: number;
  totalMinutes: number;
  entryIds: string[];
}

/** Build the single kind='time' invoice line from selected unbilled entries. */
export function buildTimeLineDraft(entries: TimeLineEntryInput[]): TimeLineDraft | null {
  if (entries.length === 0) return null;
  const totalMinutes = entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
  const amountCents = entries.reduce((sum, e) => sum + (e.amount_cents || 0), 0);
  const noun = entries.length === 1 ? 'entry' : 'entries';
  return {
    description: `Design services — ${formatHoursLabel(totalMinutes)} (${entries.length} ${noun})`,
    amountCents,
    totalMinutes,
    entryIds: entries.map((e) => e.id),
  };
}

// ── Week grouping (time tables + composer picker) ──

export interface WeekGroup<T> {
  /** ISO date (YYYY-MM-DD) of the local Monday starting the week. */
  weekStart: string;
  /** e.g. "Week of Jun 1" */
  label: string;
  entries: T[];
  totalMinutes: number;
  /** Sum of amount_cents where present (0 when the rows carry none). */
  amountCents: number;
}

interface WeekGroupable {
  started_at: string;
  duration_minutes: number | null;
  amount_cents?: number | null;
}

/** Local Monday (00:00) of the week containing the timestamp. */
function weekStartOf(iso: string): Date {
  const d = new Date(iso);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
  return monday;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Group entries by local week (Monday start), newest week first. Entries keep
 * their input order within a group (callers pass newest-first lists).
 */
export function groupEntriesByWeek<T extends WeekGroupable>(entries: T[]): WeekGroup<T>[] {
  const groups = new Map<string, WeekGroup<T>>();
  for (const entry of entries) {
    const monday = weekStartOf(entry.started_at);
    const key = isoDate(monday);
    let group = groups.get(key);
    if (!group) {
      group = {
        weekStart: key,
        label: `Week of ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        entries: [],
        totalMinutes: 0,
        amountCents: 0,
      };
      groups.set(key, group);
    }
    group.entries.push(entry);
    group.totalMinutes += entry.duration_minutes || 0;
    group.amountCents += entry.amount_cents || 0;
  }
  return [...groups.values()].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}

// ── Studio report period windows ──

export type StudioPeriod = 'week' | 'month' | 'quarter' | 'year';

export const STUDIO_PERIODS: Array<{ key: StudioPeriod; label: string }> = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
];

/**
 * Inclusive lower bound (ISO timestamp) for a rolling report window ending
 * now. Mirrors the earnings page's rolling periods ("week" = last 7 days).
 */
export function studioPeriodStartISO(period: StudioPeriod, now: Date = new Date()): string {
  const start = new Date(now);
  if (period === 'week') start.setDate(now.getDate() - 7);
  else if (period === 'month') start.setMonth(now.getMonth() - 1);
  else if (period === 'quarter') start.setMonth(now.getMonth() - 3);
  else start.setFullYear(now.getFullYear() - 1);
  return start.toISOString();
}
