'use client';

/**
 * Procurement → Calendar (project-axis view, Sprint 2 Wave 2.3 CB1).
 *
 * Per PRD §8 ("Logistics, at a glance"): a two-month visual timeline of
 * deliveries and install milestones organized by project. v1 confirmed
 * **project-axis only** — the vendor-axis variant defers to v2 ("not useful
 * at solo-designer scale," PRD §3 decisions).
 *
 * Data dependencies (all from `@patina/supabase` — Wave 2.2):
 *   • useDeliveryCalendar(rangeStart, rangeEnd)  — rows from the
 *     `delivery_events` view (migration 00150). One row per PO
 *     (event_type=delivery_expected) and one per project_phase whose
 *     phase_key matches 'install' (event_type=install_milestone).
 *
 * Conflict detection runs client-side via
 * `apps/designer-portal/src/lib/procurement/delivery-conflicts.ts` against
 * the same `events` list. Conflicts render below the grid in a panel of
 * cards, one per conflict, with 2–3 resolution suggestions each.
 *
 * Date range:
 *   - rangeStart = today's Monday (ISO YYYY-MM-DD, UTC)
 *   - rangeEnd   = rangeStart + 56 days (8 weeks)
 *   - Grid columns are 8 weekly buckets, labeled with the Monday of each.
 *
 * Layout:
 *   - Header band (title + range meta + event count)
 *   - 8-column grid (project name in col 1, then 8 week columns)
 *   - Conflicts panel below the grid (if any)
 *   - Legend strip at the bottom
 *
 * Style hooks borrow the PRD's `.cal-evt.del` (sage tint for deliveries)
 * and `.cal-evt.ins` (champagne/clay tint for installs). Inline because we
 * deliberately avoid creating new design-system primitives in this lane
 * (out of scope per dispatch).
 */

import { useEffect, useMemo } from 'react';
import {
  useDeliveryCalendar,
  type DeliveryEvent,
} from '@patina/supabase';
import { LoadingStrata } from '@/components/portal/loading-strata';
import {
  detectDeliveryConflicts,
  type ConflictType,
  type DeliveryConflict,
} from '@/lib/procurement/delivery-conflicts';
import { procurementEvents } from '@/lib/analytics/procurement-events';

// ─── Date helpers ───────────────────────────────────────────────────────────

/** Number of weeks the calendar shows (≈ 2 months). */
const CALENDAR_WEEKS = 8;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ISO YYYY-MM-DD of a Date in UTC (avoids local-tz drift across midnight). */
function isoUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the Monday-of-this-week for a given date in UTC. JavaScript's
 * getUTCDay() returns 0..6 with 0 = Sunday — we shift so Monday is 0 and
 * Sunday becomes 6, then subtract that many days. Works for any day of week
 * including Sunday (which lands on the *previous* Monday).
 */
function startOfWeekMondayUtc(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
  const monday = new Date(d.getTime() - day * MS_PER_DAY);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/** Add `n` days to a date and return the new Date. Pure. */
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

/** "Jun 8" header label for the column tops. */
function formatWeekLabel(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Jun 8 – Jun 14, 2026" pretty range for the header meta line. */
function formatDateRange(start: Date, end: Date): string {
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startLabel = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'UTC',
  });
  const endLabel = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${startLabel} – ${endLabel}`;
}

// ─── Grid helpers ───────────────────────────────────────────────────────────

interface ProjectRow {
  projectId: string;
  projectName: string;
  /** weekIndex (0..CALENDAR_WEEKS-1) → events in that week. */
  weeks: DeliveryEvent[][];
}

/**
 * Pivot a flat list of events into a project × week matrix. Projects sort
 * alphabetically by name (PRD §8 visual references "Chen Residence",
 * "Whitfield", etc. — alphabetical is the most boring, predictable shape).
 * Within a week, events sort by date ascending so the rendering is stable.
 */
function pivotEventsToGrid(
  events: DeliveryEvent[],
  rangeStart: Date,
): ProjectRow[] {
  const byProject = new Map<string, ProjectRow>();

  for (const e of events) {
    if (!e.event_date) continue;
    const eventDay = Date.parse(e.event_date);
    if (Number.isNaN(eventDay)) continue;
    const offset = Math.floor(
      (eventDay - rangeStart.getTime()) / MS_PER_DAY,
    );
    const weekIndex = Math.floor(offset / 7);
    if (weekIndex < 0 || weekIndex >= CALENDAR_WEEKS) continue;

    let row = byProject.get(e.project_id);
    if (!row) {
      row = {
        projectId: e.project_id,
        projectName: e.project_name,
        weeks: Array.from({ length: CALENDAR_WEEKS }, () => []),
      };
      byProject.set(e.project_id, row);
    }
    row.weeks[weekIndex].push(e);
  }

  // Sort intra-cell events chronologically.
  for (const row of byProject.values()) {
    for (const cell of row.weeks) {
      cell.sort((a, b) => {
        const ad = a.event_date ?? '';
        const bd = b.event_date ?? '';
        return ad < bd ? -1 : ad > bd ? 1 : 0;
      });
    }
  }

  return Array.from(byProject.values()).sort((a, b) =>
    a.projectName.localeCompare(b.projectName),
  );
}

// ─── Pill helpers ──────────────────────────────────────────────────────────

/**
 * Pick the pill label + style for a single event. Three states per PRD §8:
 *   - delivery_expected with no delivered_date and non-terminal po_status
 *     → sage "Expected delivery" pill
 *   - delivery_expected that already has a delivered_date OR po_status
 *     in {delivered, cancelled} → darker sage "Confirmed received" pill
 *     (with a leading checkmark; we use a unicode ✓ to avoid new icon deps)
 *   - install_milestone → champagne "Install" pill
 */
function pillForEvent(e: DeliveryEvent): {
  label: string;
  className: string;
  style: React.CSSProperties;
} {
  if (e.event_type === 'install_milestone') {
    return {
      label: e.phase_key ? `Install · ${e.phase_key}` : 'Install milestone',
      className: 'cal-pill cal-pill--install',
      style: {
        background: 'rgba(196,165,123,0.15)',
        color: 'var(--color-clay, #C4A57B)',
        borderLeft: '2px solid var(--color-clay, #C4A57B)',
      },
    };
  }

  const isReceived =
    e.delivered_date != null ||
    e.po_status === 'delivered' ||
    e.po_status === 'cancelled';

  if (isReceived) {
    return {
      label: `✓ ${vendorTitle(e)}`,
      className: 'cal-pill cal-pill--received',
      style: {
        background: 'rgba(168,181,160,0.28)',
        color: 'var(--color-sage, #A8B5A0)',
        borderLeft: '2px solid var(--color-sage, #A8B5A0)',
      },
    };
  }

  return {
    label: vendorTitle(e),
    className: 'cal-pill cal-pill--delivery',
    style: {
      background: 'rgba(168,181,160,0.15)',
      color: 'var(--color-sage, #A8B5A0)',
      borderLeft: '2px solid var(--color-sage, #A8B5A0)',
    },
  };
}

/** Short pill title — vendor name + optional item count. */
function vendorTitle(e: DeliveryEvent): string {
  const name = e.vendor_name ?? 'Delivery';
  if (e.ffe_item_count && e.ffe_item_count > 1) {
    return `${name} · ${e.ffe_item_count} items`;
  }
  return name;
}

// ─── Conflict pill colors ──────────────────────────────────────────────────

/**
 * Conflict-type → tint config. Matches PRD §8 legend:
 *   - overlap / late_arrival → terracotta (.cal-evt.risk in PRD CSS)
 *   - drift                  → golden-hour (.cal-evt.warn in PRD CSS)
 */
function conflictAccent(type: ConflictType): {
  label: string;
  color: string;
  background: string;
} {
  switch (type) {
    case 'overlap':
      return {
        label: 'Overlap',
        color: 'var(--color-terracotta, #D4A090)',
        background: 'rgba(212,160,144,0.10)',
      };
    case 'late_arrival':
      return {
        label: 'Late arrival',
        color: 'var(--color-terracotta, #D4A090)',
        background: 'rgba(212,160,144,0.10)',
      };
    case 'drift':
      return {
        label: 'Drift',
        color: 'var(--color-golden-hour, #E8C547)',
        background: 'rgba(232,197,71,0.10)',
      };
  }
}

// ─── Page content ──────────────────────────────────────────────────────────

function CalendarContent() {
  // ─── Range computation (memoized for query-key stability) ────────────────
  // The Monday-of-today anchors the grid. We compute once per mount; if a
  // designer leaves the tab open across midnight on Sunday→Monday the range
  // doesn't recompute, which is the right default (jumping the grid on
  // refresh is less disorienting than jumping it under their cursor).
  const { rangeStart, rangeEnd, weekStarts } = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = startOfWeekMondayUtc(today);
    const end = addDays(start, CALENDAR_WEEKS * 7 - 1); // inclusive
    const weeks = Array.from({ length: CALENDAR_WEEKS }, (_, i) =>
      addDays(start, i * 7),
    );
    return {
      rangeStart: start,
      rangeEnd: end,
      weekStarts: weeks,
    };
  }, []);

  const rangeStartIso = isoUtcDate(rangeStart);
  const rangeEndIso = isoUtcDate(rangeEnd);

  const { data, isLoading, isError, error } = useDeliveryCalendar(
    rangeStartIso,
    rangeEndIso,
  );

  // Cast through the hook's return-type narrowing: useQuery returns
  // DeliveryEvent[] | undefined here.
  const events = useMemo<DeliveryEvent[]>(
    () => (data ?? []) as DeliveryEvent[],
    [data],
  );

  const grid = useMemo(
    () => pivotEventsToGrid(events, rangeStart),
    [events, rangeStart],
  );

  const conflicts = useMemo<DeliveryConflict[]>(
    () => detectDeliveryConflicts(events),
    [events],
  );

  // Refine the `procurement_zone_visited` event with the calendar-specific
  // `conflicts_shown` count once `events` resolves. The parent layout fires
  // a base `zoneVisited` on route entry (without conflict context); this
  // augmented re-fire feeds metric 5 ("Calendar conflicts prevented") per
  // dossier §6. Fires once per events identity (i.e. when the calendar data
  // resolves or refreshes) to avoid double-counting on every render.
  useEffect(() => {
    if (isLoading || isError) return;
    procurementEvents.zoneVisited({
      sub_view: 'calendar',
      conflicts_shown: conflicts.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isError, conflicts.length]);

  // ─── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="pt-8">
        <LoadingStrata />
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="pt-8">
        <div className="mb-6">
          <h1 className="type-section-head">Calendar</h1>
          <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
            Delivery and install timeline across your active projects.
          </p>
        </div>
        <div
          className="rounded-lg border px-6 py-12 text-center"
          style={{
            borderColor: 'var(--color-terracotta, #D4A090)',
            background: 'rgba(212, 160, 144, 0.08)',
          }}
        >
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Could not load the delivery calendar
          </p>
          <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
            {(error as Error)?.message ?? 'Try refreshing the page.'}
          </p>
        </div>
      </div>
    );
  }

  // ─── Empty state ────────────────────────────────────────────────────────
  const hasAny = grid.length > 0;

  return (
    <div className="pt-8">
      {/* Header band */}
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="type-section-head">Calendar</h1>
          <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
            Delivery and install timeline across your active projects.{' '}
            <span className="text-[var(--text-muted)]">
              {formatDateRange(rangeStart, rangeEnd)}.
            </span>
          </p>
        </div>
        <span className="type-meta-small text-[var(--text-muted)]">
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Empty state */}
      {!hasAny && (
        <div className="rounded-lg border border-[var(--border-default)] px-6 py-12 text-center">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            No deliveries scheduled in the next 2 months
          </p>
          <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
            Confirmed ETAs and install milestones will appear here as POs move
            through production.
          </p>
        </div>
      )}

      {/* Grid */}
      {hasAny && (
        <CalendarGrid grid={grid} weekStarts={weekStarts} />
      )}

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <ConflictsPanel conflicts={conflicts} />
      )}

      {/* Legend */}
      {hasAny && <Legend />}
    </div>
  );
}

// ─── Grid component ────────────────────────────────────────────────────────

interface CalendarGridProps {
  grid: ProjectRow[];
  weekStarts: Date[];
}

function CalendarGrid({ grid, weekStarts }: CalendarGridProps) {
  // CSS grid template: 1 project label column + 8 weekly columns.
  // We pin a minimum width so the grid scrolls horizontally on narrow widths
  // rather than squishing the pills to unreadable.
  const gridTemplate = `200px repeat(${CALENDAR_WEEKS}, minmax(110px, 1fr))`;

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border-default)]">
      <div
        className="min-w-[1080px]"
        style={{ display: 'grid', gridTemplateColumns: gridTemplate }}
      >
        {/* Header row */}
        <div
          className="border-b border-r border-[var(--border-default)] bg-[var(--bg-surface,_var(--color-pearl,_#F0EAE2))] px-3 py-2 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-muted)]"
        >
          Project
        </div>
        {weekStarts.map((d, i) => (
          <div
            key={i}
            className="border-b border-r border-[var(--border-default)] bg-[var(--bg-surface,_var(--color-pearl,_#F0EAE2))] px-3 py-2 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-muted)] last:border-r-0"
          >
            {formatWeekLabel(d)}
          </div>
        ))}

        {/* Project rows */}
        {grid.map((row) => (
          <ProjectGridRow key={row.projectId} row={row} />
        ))}
      </div>
    </div>
  );
}

interface ProjectGridRowProps {
  row: ProjectRow;
}

function ProjectGridRow({ row }: ProjectGridRowProps) {
  return (
    <>
      <div className="border-b border-r border-[var(--border-default)] px-3 py-3 text-[0.78rem] font-medium text-[var(--text-primary)]">
        {row.projectName}
      </div>
      {row.weeks.map((cell, i) => (
        <div
          key={i}
          className="flex min-h-[60px] flex-col gap-1 border-b border-r border-[var(--border-default)] p-1.5 last:border-r-0"
        >
          {cell.map((e) => (
            <CalendarEventPill key={e.event_id} event={e} />
          ))}
        </div>
      ))}
    </>
  );
}

// ─── Event pill ────────────────────────────────────────────────────────────

interface CalendarEventPillProps {
  event: DeliveryEvent;
}

function CalendarEventPill({ event }: CalendarEventPillProps) {
  const pill = pillForEvent(event);
  return (
    <div
      className="rounded-[2px] px-1.5 py-[3px] font-mono text-[0.6rem] font-medium leading-tight"
      style={pill.style}
      title={
        event.event_date
          ? `${event.project_name} · ${event.event_date}`
          : event.project_name
      }
    >
      {pill.label}
    </div>
  );
}

// ─── Conflicts panel ──────────────────────────────────────────────────────

interface ConflictsPanelProps {
  conflicts: DeliveryConflict[];
}

function ConflictsPanel({ conflicts }: ConflictsPanelProps) {
  return (
    <section className="mt-8" aria-labelledby="calendar-conflicts-heading">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2
          id="calendar-conflicts-heading"
          className="font-mono text-[0.72rem] uppercase tracking-[0.08em] text-[var(--text-muted)]"
        >
          Conflicts
        </h2>
        <span className="type-meta-small text-[var(--text-muted)]">
          {conflicts.length} flagged
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {conflicts.map((c, i) => (
          <ConflictCard key={`${c.projectId}-${c.eventA.event_id}-${c.eventB.event_id}-${i}`} conflict={c} />
        ))}
      </div>
    </section>
  );
}

interface ConflictCardProps {
  conflict: DeliveryConflict;
}

function ConflictCard({ conflict }: ConflictCardProps) {
  const accent = conflictAccent(conflict.type);
  return (
    <div
      className="flex flex-col gap-2 rounded-[4px] border px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
      style={{
        borderColor: accent.color,
        background: accent.background,
      }}
    >
      <div
        className="inline-flex h-[22px] shrink-0 items-center self-start rounded-[2px] px-2 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.06em]"
        style={{
          color: accent.color,
          background: 'rgba(255,255,255,0.45)',
        }}
      >
        {accent.label}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[0.78rem] font-medium text-[var(--text-primary)]">
          {conflict.projectName}
        </div>
        <div className="text-[0.74rem] leading-[1.5] text-[var(--text-muted)]">
          {conflict.message}
        </div>
        {conflict.suggestions.length > 0 && (
          <ul className="ml-3 mt-1 list-disc text-[0.72rem] leading-[1.55] text-[var(--text-muted)]">
            {conflict.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Legend strip ──────────────────────────────────────────────────────────

function Legend() {
  const items: { label: string; color: string; background: string }[] = [
    {
      label: 'Expected delivery',
      color: 'var(--color-sage, #A8B5A0)',
      background: 'rgba(168,181,160,0.25)',
    },
    {
      label: 'Confirmed received',
      color: 'var(--color-sage, #A8B5A0)',
      background: 'rgba(168,181,160,0.4)',
    },
    {
      label: 'Install milestone',
      color: 'var(--color-clay, #C4A57B)',
      background: 'rgba(196,165,123,0.25)',
    },
    {
      label: 'Conflict · overlap / late',
      color: 'var(--color-terracotta, #D4A090)',
      background: 'rgba(212,160,144,0.25)',
    },
    {
      label: 'Conflict · drift',
      color: 'var(--color-golden-hour, #E8C547)',
      background: 'rgba(232,197,71,0.25)',
    },
  ];
  return (
    <div className="mt-6 flex flex-wrap gap-4 font-mono text-[0.62rem] text-[var(--text-muted)]">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-[10px] w-[10px] rounded-[1px]"
            style={{
              background: item.background,
              borderLeft: `2px solid ${item.color}`,
            }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

// ─── Default export ───────────────────────────────────────────────────────

export default function ProcurementCalendarPage() {
  return <CalendarContent />;
}
