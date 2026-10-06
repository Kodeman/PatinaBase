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
import {
  createBrowserClient,
  type DeliveryEvent,
  type PurchaseOrder,
} from '@patina/supabase';
import {
  detectDeliveryConflicts,
  detectInstallCollisions,
} from '@/lib/procurement/delivery-conflicts';
import { etaMoves, trackingUrl } from './line-unfold/movement-tracking';

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

/**
 * C-26 (d2 §M6): the day a delivery sits on — the next undelivered
 * shipment's current ETA, else the vendor's confirmed ETA, else the view's
 * event_date (an install milestone's target).
 */
export function weekEta(e: DeliveryEvent): string | null {
  const date = e.current_eta || e.confirmed_eta || e.event_date;
  return date ? date.slice(0, 10) : null;
}

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

type WeekMovement = Pick<
  PurchaseOrder,
  'id' | 'carrier' | 'tracking_number' | 'eta_history'
>;

/**
 * C-18: carrier, tracking and ETA history for the window's POs. The
 * delivery_events view carries none of them. Keyed under 'purchase-orders' so
 * the tracking, ETA and status writes refresh it.
 */
function useWeekMovement(poIds: string[]) {
  return useQuery({
    queryKey: ['purchase-orders', 'week-movement', poIds],
    enabled: poIds.length > 0,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('purchase_orders')
        .select('id, carrier, tracking_number, eta_history')
        .in('id', poIds);
      if (error) throw error;
      return new Map(
        ((data ?? []) as WeekMovement[]).map((po) => [po.id, po]),
      );
    },
  });
}

/** The quiet line under a delivery: "UPS 1Z…" on a shipped row, and "moved from 2 Nov". */
function MovementNote({
  event,
  po,
}: {
  event: DeliveryEvent;
  po: WeekMovement | undefined;
}) {
  if (!po) return null;
  const shipped = event.po_status === 'shipped';
  const carrier = shipped ? po.carrier?.trim() || null : null;
  const number = shipped ? po.tracking_number?.trim() || null : null;
  const href = trackingUrl(carrier, number);
  const last = etaMoves(po.eta_history)[0];
  const moved = last?.was ? `moved from ${fmtShort(last.was)}` : null;
  if (!carrier && !number && !moved) return null;
  return (
    <span className="block text-[var(--color-quiet-ink)]">
      {carrier}
      {carrier && number ? ' ' : null}
      {number &&
        (href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[var(--color-pearl)] underline-offset-2"
          >
            {number}
          </a>
        ) : (
          number
        ))}
      {(carrier || number) && moved ? ' · ' : null}
      {moved}
    </span>
  );
}

export function WeekBookPage({
  projectId,
  onClearProject,
}: {
  projectId?: string | null;
  onClearProject?: () => void;
} = {}) {
  const { data: allEvents, isLoading } = useWeekEvents();

  // US-16 (C-08): the hook has no project filter, so the lens narrows the
  // already-fetched window client-side — same shape as the Ledger's lens.
  const events = useMemo(
    () =>
      projectId
        ? (allEvents ?? []).filter((e) => e.project_id === projectId)
        : allEvents,
    [allEvents, projectId],
  );

  const poIds = useMemo(
    () =>
      [
        ...new Set(
          (events ?? [])
            .filter((e) => e.event_type === 'delivery_expected')
            .map((e) => e.purchase_order_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ].sort(),
    [events],
  );
  const { data: movement } = useWeekMovement(poIds);

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
      const date = weekEta(e);
      if (!date) continue;
      const week = iso(mondayOf(new Date(`${date}T00:00:00Z`)));
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
      <div>
        {projectId && (
          <div className="mb-3 flex items-center gap-x-2.5 border-b border-[var(--color-pearl)] pb-1">
            <span className="doc-type-meta uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
              project ·
            </span>
            <button
              type="button"
              onClick={onClearProject}
              className="da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center uppercase tracking-[0.06em] text-[var(--color-quiet-ink)] transition-colors hover:text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
            >
              all projects
            </button>
          </div>
        )}
        <p className="doc-type-body py-3 italic text-[var(--color-quiet-ink)]">
          Nothing on the calendar — no dated deliveries or installs in the next{' '}
          {WEEKS_ACROSS} weeks.
        </p>
      </div>
    );
  }

  const received = (e: DeliveryEvent) =>
    e.po_status === 'delivered' ||
    e.delivered_date != null ||
    e.inspection_id != null;

  return (
    <div className="min-w-0">
      {/* US-16 (C-08): the lens followed the designer in from the Document —
          quiet, same LensLink grammar as the Ledger (:365-376), not a pill. */}
      {projectId && (
        <div className="mb-3 flex items-center gap-x-2.5 border-b border-[var(--color-pearl)] pb-1">
          <span className="doc-type-meta uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
            project ·
          </span>
          <button
            type="button"
            onClick={onClearProject}
            className="da-score-hover doc-type-meta inline-flex min-h-11 min-w-11 items-center uppercase tracking-[0.06em] text-[var(--color-quiet-ink)] transition-colors hover:text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
          >
            all projects
          </button>
        </div>
      )}
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
                        const day = dayOfMonth(weekEta(e)!);
                        const label = isInstall
                          ? `Install ·${day}${collides ? ' ⚠ collides' : ''}`
                          : `${e.vendor_name ?? 'Delivery'} ·${day}${received(e) ? ' ✓ recvd' : ''}`;
                        return (
                          <span
                            key={e.event_id}
                            className={`${WK_EV_BASE} ${WK_EV_TONE[tone]}`}
                          >
                            {label}
                            {!isInstall && e.purchase_order_id && (
                              <MovementNote
                                event={e}
                                po={movement?.get(e.purchase_order_id)}
                              />
                            )}
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
            <span className="text-[var(--color-terracotta-ink)]">
              conflict — also on your Desk
            </span>
          </>
        )}
      </p>
    </div>
  );
}
