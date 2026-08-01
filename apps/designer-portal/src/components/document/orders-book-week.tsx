'use client';

/**
 * The Week (R28, C-8): the old calendar in book material — weeks across,
 * projects down; expected / received / conflict events. The intelligence is
 * promoted, not just preserved: the same classifier output that marks these
 * cells rises on the Desk as need lines (collision tier) and in-motion chips
 * (drift tier) through use-desk-engagements.
 *
 * Book material: hairline rules and DM-mono numerals over the laid paper
 * sheet (R96) — never cards, never a dashboard.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createBrowserClient, type DeliveryEvent } from '@patina/supabase';
import {
  detectDeliveryConflicts,
  detectInstallCollisions,
} from '@/lib/procurement/delivery-conflicts';

type AnyRecord = any;

const getSupabase = () => createBrowserClient() as AnyRecord;

const WEEKS_ACROSS = 8;
const DAY_MS = 86_400_000;

const mondayOf = (d: Date): Date => {
  const out = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dow = out.getUTCDay();
  out.setUTCDate(out.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return out;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fmtShort = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
const dayOfMonth = (isoDate: string) => String(Number(isoDate.slice(8, 10)));

// The .wk-ev pill recipe (HTML §7): 2.5px left border + tinted bg + radius.
// Three tones — clay (expected), sage (received), terracotta (conflict).
const WK_EV_BASE =
  'doc-type-meta mb-1 inline-block rounded-[3px] border-l-[2.5px] px-1.5 py-1 leading-tight text-[var(--color-charcoal)]';
const WK_EV_TONE = {
  clay: 'border-l-[var(--color-clay)] bg-[rgba(196,165,123,0.10)]',
  sage: 'border-l-[var(--color-sage)] bg-[rgba(168,181,160,0.12)]',
  terracotta: 'border-l-[var(--color-terracotta)] bg-[rgba(212,160,144,0.12)]',
} as const;

function useWeekEvents() {
  return useQuery({
    queryKey: ['orders-book', 'week-events'],
    queryFn: async () => {
      const start = mondayOf(new Date());
      const end = new Date(start.getTime() + WEEKS_ACROSS * 7 * DAY_MS);
      const { data, error } = await getSupabase()
        .from('delivery_events')
        .select('*')
        .gte('event_date', iso(start))
        .lt('event_date', iso(end));
      if (error) throw error;
      return (data ?? []) as DeliveryEvent[];
    },
  });
}

export function WeekBookPage() {
  const { data: events, isLoading } = useWeekEvents();

  const {
    weeks,
    projects,
    cells,
    collisionWeeksByProject,
    conflictWeeksByProject,
    hasConflicts,
  } = useMemo(() => {
    const start = mondayOf(new Date());
    const weeks: string[] = Array.from({ length: WEEKS_ACROSS }, (_, i) =>
      iso(new Date(start.getTime() + i * 7 * DAY_MS)),
    );

    const byProject = new Map<
      string,
      { name: string; events: DeliveryEvent[] }
    >();
    for (const e of events ?? []) {
      const entry = byProject.get(e.project_id) ?? {
        name: e.project_name,
        events: [],
      };
      entry.events.push(e);
      byProject.set(e.project_id, entry);
    }
    const projects = [...byProject.entries()]
      .map(([id, v]) => ({ id, name: v.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // cell key `${projectId}|${weekIso}` → events, week-bucketed.
    const cells = new Map<string, DeliveryEvent[]>();
    for (const e of events ?? []) {
      if (!e.event_date) continue;
      const week = iso(
        mondayOf(new Date(`${e.event_date.slice(0, 10)}T00:00:00Z`)),
      );
      const key = `${e.project_id}|${week}`;
      const list = cells.get(key) ?? [];
      list.push(e);
      cells.set(key, list);
    }

    // Conflict marking. Two distinct sets so only TRUE install collisions
    // wear "⚠ collides" (M2): collisionWeeks = cross-project install collisions
    // (an install can't be in two homes); conflictWeeks = the wider set
    // (overlap/late/drift) that earns the terracotta cell border but no word.
    const collisions = detectInstallCollisions(events ?? []);
    const conflicts = detectDeliveryConflicts(events ?? []);
    const collisionWeeksByProject = new Set<string>();
    for (const col of collisions) {
      for (const pid of col.projectIds)
        collisionWeeksByProject.add(`${pid}|${col.weekOf}`);
    }
    const conflictWeeksByProject = new Set<string>(collisionWeeksByProject);
    for (const c of conflicts) {
      for (const e of [c.eventA, c.eventB]) {
        if (!e.event_date) continue;
        const week = iso(
          mondayOf(new Date(`${e.event_date.slice(0, 10)}T00:00:00Z`)),
        );
        conflictWeeksByProject.add(`${e.project_id}|${week}`);
      }
    }

    const hasConflicts = collisions.length + conflicts.length > 0;

    return {
      weeks,
      projects,
      cells,
      collisionWeeksByProject,
      conflictWeeksByProject,
      hasConflicts,
    };
  }, [events]);

  if (isLoading) {
    return (
      <p className="doc-type-body py-3 italic text-[var(--color-quiet-ink)]">
        Opening the week…
      </p>
    );
  }

  if (projects.length === 0) {
    return (
      <p className="doc-type-body py-3 italic text-[var(--color-quiet-ink)]">
        Nothing on the calendar — no dated deliveries or installs in the next{' '}
        {WEEKS_ACROSS} weeks.
      </p>
    );
  }

  const received = (e: DeliveryEvent) =>
    e.po_status === 'delivered' ||
    e.delivered_date != null ||
    e.inspection_id != null;

  return (
    <div className="min-w-0">
      <div
        role="region"
        aria-label="Eight-week delivery calendar"
        tabIndex={0}
        data-orders-week-scroll
        className="max-w-full overflow-x-auto overscroll-x-contain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
      >
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <th className="doc-type-meta border-b border-[var(--color-pearl)] px-1 pb-2 text-left font-semibold uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
                Project
              </th>
              {weeks.map((w, i) => (
                <th
                  key={w}
                  className={`doc-type-meta border-b border-[var(--color-pearl)] px-1 pb-2 text-left font-semibold uppercase tracking-[0.08em] ${
                    i === 0
                      ? 'text-[var(--color-charcoal)]'
                      : 'text-[var(--color-quiet-ink)]'
                  }`}
                >
                  {fmtShort(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td className="doc-type-body max-w-[140px] truncate border-b border-[var(--color-pearl)] py-2 pr-2 text-[var(--color-charcoal)]">
                  {p.name}
                </td>
                {weeks.map((w) => {
                  const key = `${p.id}|${w}`;
                  const cellEvents = cells.get(key) ?? [];
                  const collides = collisionWeeksByProject.has(key);
                  const conflicted = conflictWeeksByProject.has(key);
                  return (
                    <td
                      key={w}
                      className={`border-b border-[var(--color-pearl)] px-1 py-1.5 align-top ${
                        conflicted
                          ? 'border-l-2 border-l-[var(--color-terracotta)]'
                          : ''
                      }`}
                    >
                      {cellEvents.map((e) => {
                        const isInstall = e.event_type === 'install_milestone';
                        // Only a true cross-project install collision wears
                        // the word "⚠ collides" (M2); a delivery overlap gets
                        // the cell border but no annotation.
                        const tone = isInstall
                          ? collides
                            ? 'terracotta'
                            : 'clay'
                          : received(e)
                            ? 'sage'
                            : 'clay';
                        const label = isInstall
                          ? `Install ·${dayOfMonth(e.event_date!)}${collides ? ' ⚠ collides' : ''}`
                          : `${e.vendor_name ?? 'Delivery'} ·${dayOfMonth(e.event_date!)}${received(e) ? ' ✓ recvd' : ''}`;
                        return (
                          <span
                            key={e.event_id}
                            className={`${WK_EV_BASE} ${WK_EV_TONE[tone]}`}
                          >
                            {label}
                          </span>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The legend (HTML §7). The actionable conflicts rise on the Desk as
          need lines (R28) — the page marks them; the Desk carries the act. */}
      <p className="doc-type-meta mt-3 uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
        Expected · <span className="text-[var(--color-sage)]">received</span>
        {hasConflicts && (
          <>
            {' · '}
            <span className="text-[var(--color-terracotta)]">
              conflict — also on your Desk
            </span>
          </>
        )}
      </p>
    </div>
  );
}
