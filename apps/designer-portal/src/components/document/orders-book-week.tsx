'use client';

/**
 * The Week (R28, C-8): the old calendar in book material — weeks across,
 * projects down; expected / received / conflict events. The intelligence is
 * promoted, not just preserved: the same classifier output that marks these
 * cells rises on the Desk as need lines (collision tier) and in-motion chips
 * (drift tier) through use-desk-engagements.
 *
 * Book material: hairline rules and DM-mono numerals over the charcoal
 * sheet — never cards, never a dashboard.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createBrowserClient, type DeliveryEvent } from '@patina/supabase';
import {
  detectDeliveryConflicts,
  detectInstallCollisions,
} from '@/lib/procurement/delivery-conflicts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

const getSupabase = () => createBrowserClient() as AnyRecord;

const WEEKS_ACROSS = 8;
const DAY_MS = 86_400_000;

const mondayOf = (d: Date): Date => {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
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

  const { weeks, projects, cells, conflictWeeksByProject, conflictLines } = useMemo(() => {
    const start = mondayOf(new Date());
    const weeks: string[] = Array.from({ length: WEEKS_ACROSS }, (_, i) =>
      iso(new Date(start.getTime() + i * 7 * DAY_MS)),
    );

    const byProject = new Map<string, { name: string; events: DeliveryEvent[] }>();
    for (const e of events ?? []) {
      const entry = byProject.get(e.project_id) ?? { name: e.project_name, events: [] };
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
      const week = iso(mondayOf(new Date(`${e.event_date.slice(0, 10)}T00:00:00Z`)));
      const key = `${e.project_id}|${week}`;
      const list = cells.get(key) ?? [];
      list.push(e);
      cells.set(key, list);
    }

    // Conflict marking: collisions (cross-project weeks) + per-project pairs.
    const collisions = detectInstallCollisions(events ?? []);
    const conflicts = detectDeliveryConflicts(events ?? []);
    const conflictWeeksByProject = new Set<string>();
    for (const col of collisions) {
      for (const pid of col.projectIds) conflictWeeksByProject.add(`${pid}|${col.weekOf}`);
    }
    for (const c of conflicts) {
      for (const e of [c.eventA, c.eventB]) {
        if (!e.event_date) continue;
        const week = iso(mondayOf(new Date(`${e.event_date.slice(0, 10)}T00:00:00Z`)));
        conflictWeeksByProject.add(`${e.project_id}|${week}`);
      }
    }

    const conflictLines = [
      ...collisions.map((c) => c.message),
      ...conflicts.map((c) => c.message),
    ];

    return { weeks, projects, cells, conflictWeeksByProject, conflictLines };
  }, [events]);

  if (isLoading) {
    return <p className="py-3 text-[12px] italic text-[rgba(250,247,242,0.5)]">Opening the week…</p>;
  }

  if (projects.length === 0) {
    return (
      <p className="py-3 text-[12px] italic text-[rgba(250,247,242,0.5)]">
        Nothing on the calendar — no dated deliveries or installs in the next{' '}
        {WEEKS_ACROSS} weeks.
      </p>
    );
  }

  const received = (e: DeliveryEvent) =>
    e.po_status === 'delivered' || e.delivered_date != null || e.inspection_id != null;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border-b border-[rgba(250,247,242,0.14)] px-1 pb-1 text-left font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-[rgba(250,247,242,0.35)]">
                Project
              </th>
              {weeks.map((w, i) => (
                <th
                  key={w}
                  className={`border-b border-[rgba(250,247,242,0.14)] px-1 pb-1 text-left font-mono text-[8px] font-semibold uppercase tracking-[0.08em] ${
                    i === 0 ? 'text-[var(--color-clay)]' : 'text-[rgba(250,247,242,0.35)]'
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
                <td className="max-w-[140px] truncate border-b border-[rgba(250,247,242,0.08)] py-1.5 pr-2 text-[11px] text-[var(--color-off-white)]">
                  {p.name}
                </td>
                {weeks.map((w) => {
                  const key = `${p.id}|${w}`;
                  const cellEvents = cells.get(key) ?? [];
                  const conflicted = conflictWeeksByProject.has(key);
                  return (
                    <td
                      key={w}
                      className={`border-b border-[rgba(250,247,242,0.08)] px-1 py-1.5 align-top ${
                        conflicted ? 'border-l-2 border-l-[var(--color-terracotta)]' : ''
                      }`}
                    >
                      {cellEvents.map((e) => (
                        <p
                          key={e.event_id}
                          className="whitespace-nowrap font-mono text-[8.5px] uppercase tracking-[0.04em]"
                          style={{
                            color:
                              e.event_type === 'install_milestone'
                                ? conflicted
                                  ? 'var(--color-terracotta)'
                                  : 'var(--color-off-white)'
                                : received(e)
                                  ? 'var(--color-sage)'
                                  : 'rgba(250,247,242,0.55)',
                          }}
                        >
                          {e.event_type === 'install_milestone'
                            ? `install ·${dayOfMonth(e.event_date!)}`
                            : `${received(e) ? '✓' : '▴'} ${(e.vendor_name ?? 'delivery')
                                .split(' ')[0]
                                .toLowerCase()} ·${dayOfMonth(e.event_date!)}`}
                        </p>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The conflict lines — same classifier the Desk promotes (R28). */}
      {conflictLines.length > 0 && (
        <div className="mt-3 border-t border-[rgba(250,247,242,0.12)] pt-2">
          <p className="mb-1 font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--color-terracotta)]">
            Conflicts · {conflictLines.length}
          </p>
          {conflictLines.map((line, i) => (
            <p key={i} className="py-0.5 text-[11px] leading-relaxed text-[rgba(250,247,242,0.7)]">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
