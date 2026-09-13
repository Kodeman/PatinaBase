/**
 * Pure helpers for time-entry billing (Wave 4, 00177/00178; W5 HT-21 adds a
 * client-facing dated sub-table).
 *
 * Line-item semantics for kind='time': ONE line per invoice draft with
 * quantity = 1 and unit_amount_cents = amount_cents = the SUM of the selected
 * entries' view-resolved amounts. The hours ride in the description (and
 * metadata.total_minutes); metadata.time_entry_ids carries provenance. This
 * keeps qty × unit math exact everywhere (computeInvoiceTotals, the
 * issue_invoice RPC, detail/print/client renderers) — a weighted hourly rate
 * would re-round and drift from the per-entry amounts the view computed.
 *
 * HT-21 (W5, corrected in fix round 1 — findings B1/B2): the persisted
 * `description` is ALWAYS the generic "Design services" phrasing, and
 * `invoice-composer.ts`'s `buildComposerLines` emits exactly ONE kind='time'
 * line for the whole selection, never one per person — the client's folio
 * (`invoice_line_items.description`) is read verbatim by `resolve_invoice_link`
 * (00588) and rendered verbatim by the pay-link sheet and the printed/PDF
 * copy, so a name written there reaches the homeowner regardless of what any
 * sanitiser does to the separate `attribution` field (LEAH-15, REP-15;
 * plan-v2 §6: "No staffing detail reaches the homeowner"). Per-person naming
 * stays exactly where it already worked, designer-side only: the composer's
 * own entry picker (`invoice-composer.tsx`), which reads each entry's
 * `member_name` directly before these entries are ever merged into a line.
 * `buildTimeLineDraft` also collects a `dateRows` table (date · minutes ·
 * rate, no name) for the client folio's dated sub-table — see
 * `invoice-composer.ts` for how that rides the existing
 * `metadata.attribution` field with no DB change.
 */

// ── Duration formatting ──

/** 270 → "4h 30m" — re-exported from @patina/shared so the invoice renderers
 * (designer + client portals) and this module share one implementation. */
export { formatMinutesAsHours as formatHoursLabel } from "@patina/shared";
import { formatMinutesAsHours as formatHoursLabel } from "@patina/shared";

/** Minutes → decimal hours rounded to 0.1 (for metric blocks). */
export function minutesToHours(minutes: number): number {
  return Math.round(((minutes || 0) / 60) * 10) / 10;
}

// ── Invoice time-line assembly ──

export interface TimeLineEntryInput {
  id: string;
  duration_minutes: number;
  amount_cents: number;
  /** The entry's author. Kept for callers that still group by person
   *  (`groupEntriesByPerson`) for their OWN designer-side rendering (e.g. the
   *  composer's entry picker) — `buildTimeLineDraft` itself no longer uses
   *  this to name the persisted line (fix round 1, findings B1/B2). */
  user_id?: string | null;
  /** The author's display name. Never reaches `buildTimeLineDraft`'s
   *  `description` (fix round 1) — that field is the invoice's own
   *  persisted `description`, which the client folio and the printed copy
   *  render verbatim. Kept on this input type for designer-side callers that
   *  render a name from the raw entry directly, before grouping/merging. */
  member_name?: string | null;
  /** ISO timestamp, for the dated sub-table row (HT-21). An entry missing it
   *  contributes to the totals but not to `dateRows`. */
  started_at?: string | null;
  /** The per-hour rate that priced this entry, for the sub-table's rate
   *  column. Distinct from `amount_cents` (which may include partial-hour
   *  rounding) so the printed rate matches what the ledger shows. */
  resolved_rate_cents?: number | null;
}

/** One dated row for the client folio's sub-table (HT-21). Carries no name —
 *  "the homeowner gets no staffing detail" (LEAH-15, REP-15). */
export interface TimeLineDateRow {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  minutes: number;
  rateCents: number;
}

export interface TimeLineDraft {
  /** Always the generic phrasing, e.g. "Design services — 4h 30m
   *  (3 entries)" — never a person's name (fix round 1, findings B1/B2):
   *  this is the persisted `invoice_line_items.description`, read verbatim
   *  by the client's pay-link sheet and the printed/PDF copy. */
  description: string;
  /** Sum of the entries' view-resolved amount_cents. */
  amountCents: number;
  totalMinutes: number;
  entryIds: string[];
  /** Date · minutes · rate, oldest first, for the client's dated sub-table
   *  (HT-21). Empty when no input entry carried `started_at`. */
  dateRows: TimeLineDateRow[];
}

/** Build one kind='time' invoice line from a group of selected unbilled
 *  entries — always ONE line, always the generic "Design services"
 *  phrasing, regardless of how many distinct authors the entries carry
 *  (fix round 1, findings B1/B2). Naming who did the work stays a
 *  designer-side-only concern, handled by the composer's own entry picker
 *  reading `member_name` off each entry directly — never by this function's
 *  output, which is what the client and the printed copy see. */
export function buildTimeLineDraft(
  entries: TimeLineEntryInput[],
): TimeLineDraft | null {
  if (entries.length === 0) return null;
  const totalMinutes = entries.reduce(
    (sum, e) => sum + (e.duration_minutes || 0),
    0,
  );
  const amountCents = entries.reduce(
    (sum, e) => sum + (e.amount_cents || 0),
    0,
  );
  const noun = entries.length === 1 ? "entry" : "entries";
  const label = "Design services";

  const dateRows: TimeLineDateRow[] = entries
    .filter((e): e is TimeLineEntryInput & { started_at: string } =>
      Boolean(e.started_at),
    )
    .map((e) => ({
      date: e.started_at.slice(0, 10),
      minutes: e.duration_minutes || 0,
      rateCents: e.resolved_rate_cents ?? 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    description: `${label} — ${formatHoursLabel(totalMinutes)} (${entries.length} ${noun})`,
    amountCents,
    totalMinutes,
    entryIds: entries.map((e) => e.id),
    dateRows,
  };
}

interface PersonGroupable {
  user_id?: string | null;
  member_name?: string | null;
}

export interface PersonGroup<T> {
  userId: string | null;
  memberName: string | null;
  entries: T[];
}

/**
 * Group entries by author (HT-21). No longer called by the invoice composer
 * (fix round 1, finding B2 — the composer now merges every selected entry
 * into ONE line via `buildTimeLineDraft`), kept as a pure utility for
 * designer-side, non-invoice groupings that still want a per-person split.
 * Entries with no `user_id` land in one shared unnamed group. Named groups
 * sort alphabetically; the unnamed
 * group, if any, sorts last.
 */
export function groupEntriesByPerson<T extends PersonGroupable>(
  entries: T[],
): PersonGroup<T>[] {
  const groups = new Map<string, PersonGroup<T>>();
  for (const entry of entries) {
    const key = entry.user_id ?? "";
    let group = groups.get(key);
    if (!group) {
      group = {
        userId: entry.user_id ?? null,
        memberName: entry.member_name ?? null,
        entries: [],
      };
      groups.set(key, group);
    }
    group.entries.push(entry);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.memberName && b.memberName)
      return a.memberName.localeCompare(b.memberName);
    if (a.memberName) return -1;
    if (b.memberName) return 1;
    return 0;
  });
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
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Group entries by local week (Monday start), newest week first. Entries keep
 * their input order within a group (callers pass newest-first lists).
 */
export function groupEntriesByWeek<T extends WeekGroupable>(
  entries: T[],
): WeekGroup<T>[] {
  const groups = new Map<string, WeekGroup<T>>();
  for (const entry of entries) {
    const monday = weekStartOf(entry.started_at);
    const key = isoDate(monday);
    let group = groups.get(key);
    if (!group) {
      group = {
        weekStart: key,
        label: `Week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
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
  return [...groups.values()].sort((a, b) =>
    a.weekStart < b.weekStart ? 1 : -1,
  );
}

// ── Studio report period windows ──

/** One implementation, in @patina/supabase beside the hook that reads it. */
export { studioPeriodStartISO, type StudioPeriod } from "@patina/supabase";
import type { StudioPeriod } from "@patina/supabase";

export const STUDIO_PERIODS: Array<{ key: StudioPeriod; label: string }> = [
  { key: "week", label: "This Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
];
