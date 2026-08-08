'use client';

/**
 * The Hours ledger (D9: capture in the document, review in the drawer;
 * spec v1.2 §9; R77 full depth): a week of entries across every engagement —
 * document · activity · phase · source · duration, inline-editable until an
 * invoice claims them (00177 guard) — with today/week totals and a batch-add
 * row.
 *
 * R77 gave the ledger its history and its balance:
 *  - WEEK PAGING — ‹ earlier / later › walks back through past weeks.
 *  - ALL-TIME UNBILLED BALANCE — the studio's unclaimed hours as money
 *    (project_unbilled_time, view-resolved rates), with a "bill it →"
 *    handoff into the R74b composer.
 *  - PER-DOCUMENT LENS — an optional OpenLedgerContext prop scopes the whole
 *    ledger to one document (the Account band links in pre-filtered once the
 *    drawer passes its sheet context through).
 *  - DELETE WITH CONFIRM on unbilled entries; billed entries stay immutable.
 *
 * R75: "Export week → Accounts" opens the composer with the shown week's
 * unbilled entries pre-ticked (per-entry include/exclude + resolved rates
 * live there; one act, review before draft). Failures render inline (R83).
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import {
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useUpdateTimeEntry,
} from '@/hooks/use-time-tracking';
import { ACTIVITIES, fmtMinutes } from '@/lib/document/time-derivation';
import { fmtDay, fmtUsd } from '@/lib/document/format';
import { LedgerFrontMatter } from './ledger-front-matter';
import { hoursUtilization } from '@/lib/document/ledger-summary';
import { openInvoiceComposer } from './accounts/invoice-overlays';
import type { OpenLedgerContext } from './command-bar';
import { DocSheetHead } from './overlays/doc-sheet';
import { STUDIO_LEDGERS } from '@/lib/document/registry';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { ProjectAuthorityBandForProject } from './commercial/project-authority-band';
import { PendingTimeAuthorizationBand } from './pending-time-authorization-band';
import { useProjectBillingAuthority } from '@/hooks/use-commercial-documents';
import {
  isInvoiceEligibleTimeEntry,
  timeBillingStateLabel,
  timeRateProvenance,
} from '@/lib/document/authority-hours';

// R96 — the registry is the single source of the surface icon (no drift).
const HOURS_ICON = STUDIO_LEDGERS.find((l) => l.key === 'hours')!.icon;

type AnyRecord = any;

const getSupabase = () => createBrowserClient() as AnyRecord;

const SOURCE_LABEL: Record<string, string> = {
  timer_auto: 'in hand',
  timer_manual: 'timer',
  manual_entry: 'typed',
};

const TERRACOTTA_INK = '#C4836F';

/** Local Monday 00:00 of the week `offset` weeks before the current one. */
function weekRange(offset: number): { start: Date; end: Date } {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - offset * 7); // back to Monday
  const end = new Date(d);
  end.setDate(end.getDate() + 7);
  return { start: d, end };
}

interface UnbilledInfo {
  amount_cents: number;
  project_id: string;
  authority_rate_id?: string | null;
}

export function HoursLedger({
  initialContext = null,
}: {
  /** R77 — the per-document lens: `{ projectId }` scopes the ledger. (The
   *  studio drawer passes its sheet context through post-merge wiring.) */
  initialContext?: OpenLedgerContext | null;
}) {
  const updateEntry = useUpdateTimeEntry({ errorSurface: 'inline' });
  const createEntry = useCreateTimeEntry({ errorSurface: 'inline' });

  // ── The lens + the page ───────────────────────────────────────────────────
  const [lensProjectId, setLensProjectId] = useState<string | null>(
    initialContext?.projectId ?? null,
  );
  const [weekOffset, setWeekOffset] = useState(0);
  const { start: weekStart, end: weekEnd } = useMemo(
    () => weekRange(weekOffset),
    [weekOffset],
  );

  const { data: entries, refetch } = useQuery({
    queryKey: ['document-hours-week', weekOffset, lensProjectId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) return [];
      let query = supabase
        .from('project_time_entries')
        .select('*, project:projects(name)')
        .eq('user_id', userData.user.id)
        .gte('started_at', weekStart.toISOString())
        .lt('started_at', weekEnd.toISOString())
        .not('duration_minutes', 'is', null)
        .order('started_at', { ascending: false });
      if (lensProjectId) query = query.eq('project_id', lensProjectId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AnyRecord[];
    },
  });

  const { data: projects } = useQuery({
    queryKey: ['document-hours-projects'],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('projects')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return (data ?? []) as AnyRecord[];
    },
  });

  // R23: open section-task estimates give Hours its "of N est." readout.
  const { data: openEstimateMinutes } = useQuery({
    queryKey: ['document-hours-estimates'],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('project_tasks')
        .select('estimate_minutes')
        .eq('status', 'todo')
        .not('estimate_minutes', 'is', null)
        .not('section_key', 'is', null);
      if (error) throw error;
      return ((data ?? []) as AnyRecord[]).reduce(
        (s, t) => s + (t.estimate_minutes ?? 0),
        0,
      ) as number;
    },
  });

  // R77 — the all-time unbilled balance (00177 view: billable, completed,
  // unclaimed, view-resolved rates). A balance, not a flow — it deliberately
  // ignores the shown week; the lens scopes it like everything else.
  const { data: unbilledRows, refetch: refetchUnbilled } = useQuery({
    queryKey: ['document-hours-unbilled', lensProjectId],
    queryFn: async () => {
      let query = getSupabase()
        .from('project_unbilled_time')
        .select('id, project_id, duration_minutes, amount_cents');
      if (lensProjectId) query = query.eq('project_id', lensProjectId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AnyRecord[];
    },
  });

  const {
    data: pendingAuthorizationRows,
    refetch: refetchPendingAuthorization,
  } = useQuery({
    queryKey: ['document-hours-pending-authorization', lensProjectId],
    queryFn: async () => {
      let query = getSupabase()
        .from('project_time_entries')
        .select('id, project_id, duration_minutes')
        .eq('billable', true)
        .is('invoice_id', null)
        .eq('billing_state', 'pending_authorization')
        .not('duration_minutes', 'is', null);
      if (lensProjectId) query = query.eq('project_id', lensProjectId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AnyRecord[];
    },
  });

  const unbilledById = useMemo(() => {
    const map = new Map<string, UnbilledInfo>();
    for (const row of unbilledRows ?? [])
      map.set(row.id, {
        amount_cents: row.rated_amount_cents ?? row.amount_cents ?? 0,
        project_id: row.project_id,
        authority_rate_id: row.authority_rate_id ?? null,
      });
    return map;
  }, [unbilledRows]);
  const unbilledMinutes = (unbilledRows ?? []).reduce(
    (s, r) => s + (r.duration_minutes ?? 0),
    0,
  );
  const unbilledCents = (unbilledRows ?? []).reduce(
    (s, r) => s + (r.rated_amount_cents ?? r.amount_cents ?? 0),
    0,
  );
  const unbilledProjects = useMemo(
    () => [...new Set((unbilledRows ?? []).map((r) => r.project_id as string))],
    [unbilledRows],
  );

  const [addProject, setAddProject] = useState(initialContext?.projectId ?? '');
  const [addMinutes, setAddMinutes] = useState('');
  const [addActivity, setAddActivity] = useState('design');
  const [addBusy, setAddBusy] = useState(false);
  /** R83 — the ledger's quiet inline note (add/delete failures, never a toast). */
  const [note, setNote] = useState<string | null>(null);

  const days = useMemo(() => {
    const byDay = new Map<string, AnyRecord[]>();
    for (const e of entries ?? []) {
      const day = new Date(e.started_at).toDateString();
      byDay.set(day, [...(byDay.get(day) ?? []), e]);
    }
    return [...byDay.entries()];
  }, [entries]);

  const todayKey = new Date().toDateString();
  const todayMin = (entries ?? [])
    .filter((e) => new Date(e.started_at).toDateString() === todayKey)
    .reduce((s, e) => s + (e.duration_minutes ?? 0), 0);
  const weekMin = (entries ?? []).reduce(
    (s, e) => s + (e.duration_minutes ?? 0),
    0,
  );
  const util = hoursUtilization(entries ?? []);

  // R75 — the shown week's exportable share: billable, completed, unclaimed.
  const weekUnbilled = useMemo(
    () => (entries ?? []).filter(isInvoiceEligibleTimeEntry),
    [entries],
  );
  const weekUnbilledProjects = useMemo(
    () => [...new Set(weekUnbilled.map((e) => e.project_id as string))],
    [weekUnbilled],
  );

  const parsedAdd = parseInt(addMinutes, 10);
  const addValid = addProject && Number.isFinite(parsedAdd) && parsedAdd >= 1;

  const batchAdd = async () => {
    if (!addValid || addBusy) return;
    setAddBusy(true);
    setNote(null);
    try {
      await createEntry.mutateAsync({
        projectId: addProject,
        durationMinutes: parsedAdd,
        activity: addActivity,
        source: 'manual_entry',
      });
      setAddMinutes('');
      void refetch();
      void refetchUnbilled();
      void refetchPendingAuthorization();
    } catch (e) {
      setNote(
        `Could not add — ${e instanceof Error ? e.message : 'try again'}`,
      );
    } finally {
      setAddBusy(false);
    }
  };

  const commit = (entry: AnyRecord, updates: AnyRecord) => {
    updateEntry.mutate(
      { id: entry.id, projectId: entry.project_id, updates },
      {
        onSuccess: () => {
          void refetch();
          void refetchUnbilled();
          void refetchPendingAuthorization();
        },
        onError: (e) =>
          setNote(
            `Could not save — ${e instanceof Error ? e.message : 'try again'}`,
          ),
      },
    );
  };

  const lensName =
    lensProjectId != null
      ? ((projects ?? []).find((p) => p.id === lensProjectId)?.name ??
        (entries ?? []).find((e) => e.project_id === lensProjectId)?.project
          ?.name ??
        'one document')
      : null;

  const weekLabel =
    weekOffset === 0
      ? 'this week'
      : `week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  return (
    <div className="mx-auto max-w-3xl">
      <DocSheetHead
        icon={HOURS_ICON}
        title="Hours"
        helpKey={DOCUMENT_SURFACE_KEYS.hours}
      />
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-xl text-[var(--color-charcoal)]">
            Hours{' '}
            <em className="italic text-[var(--color-clay)]">· {weekLabel}</em>
            {lensName && (
              <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
                · {lensName}
                <button
                  type="button"
                  onClick={() => setLensProjectId(null)}
                  className="ml-1.5 text-[var(--color-clay)] hover:opacity-80"
                >
                  all documents ×
                </button>
              </span>
            )}
          </h2>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--color-aged-oak)]">
            {weekOffset === 0 && (
              <>Today · {fmtMinutes(todayMin)} &nbsp;·&nbsp; </>
            )}
            Week · {fmtMinutes(weekMin)}
            {/* R77 — week paging: walk the history, quietly. */}
            <button
              type="button"
              onClick={() => setWeekOffset((o) => o + 1)}
              className="ml-3 text-[var(--color-clay)] hover:opacity-80"
            >
              ‹ earlier
            </button>
            {weekOffset > 0 && (
              <button
                type="button"
                onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
                className="ml-2 text-[var(--color-clay)] hover:opacity-80"
              >
                later ›
              </button>
            )}
          </p>
        </div>
        <button
          type="button"
          disabled={weekUnbilled.length === 0}
          title={
            weekUnbilled.length === 0
              ? 'Nothing unbilled this week'
              : 'Open the invoice composer with this week ticked'
          }
          onClick={() =>
            openInvoiceComposer({
              // One document → land scoped; several → the composer asks and
              // ticks that document's share of the week (R75).
              projectId:
                weekUnbilledProjects.length === 1
                  ? weekUnbilledProjects[0]
                  : undefined,
              initialTimeEntryIds: weekUnbilled.map((e) => e.id),
            })
          }
          className="whitespace-nowrap rounded-[3px] border border-[rgba(196,165,123,0.4)] px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.07em] text-[var(--color-clay)] transition-colors hover:bg-[var(--color-clay)] hover:text-white disabled:border-[var(--color-pearl)] disabled:text-[var(--color-aged-oak)] disabled:hover:bg-transparent"
        >
          Export week → Accounts
        </button>
      </div>

      {/* Front-matter (R5): utilization — the shown week + the balance. */}
      <LedgerFrontMatter
        caption="utilization"
        stats={[
          {
            label: `logged ${weekLabel}`,
            value: fmtMinutes(util.totalMinutes),
          },
          ...(util.billablePct !== null
            ? [{ label: 'billable', value: `${util.billablePct}%` }]
            : []),
          ...((openEstimateMinutes ?? 0) > 0 && weekOffset === 0
            ? [
                {
                  label: 'of open work est.',
                  value: fmtMinutes(openEstimateMinutes ?? 0),
                },
              ]
            : []),
        ]}
      />

      <PendingTimeAuthorizationBand
        rows={pendingAuthorizationRows ?? []}
        projects={projects ?? []}
        onSelectProject={setLensProjectId}
      />

      {/* A project-scoped Hours sheet carries the same RPC-owned authority
          readout as the open project document. Studio-wide mode stays a
          cross-project ledger rather than inventing an aggregate cap. */}
      {lensProjectId && (
        <ProjectAuthorityBandForProject projectId={lensProjectId} />
      )}

      {/* R77 — the all-time unbilled balance, with its one act. */}
      {unbilledMinutes > 0 && (
        <div className="-mt-2 mb-4 flex flex-wrap items-baseline gap-2 font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
          <span className="text-[var(--color-clay)]">unbilled · all time</span>
          <span className="text-[var(--color-charcoal)]">
            {fmtUsd(unbilledCents)} · {fmtMinutes(unbilledMinutes)}
          </span>
          {unbilledProjects.length > 1 && (
            <span>· {unbilledProjects.length} documents</span>
          )}
          <DocumentAction
            actionKey="bill-unbilled-time"
            surfaceKey="hours"
            regionKey="unbilled-balance"
            variant="primary"
            onClick={() =>
              openInvoiceComposer({
                projectId:
                  lensProjectId ??
                  (unbilledProjects.length === 1
                    ? unbilledProjects[0]
                    : undefined),
                initialTimeEntryIds: (unbilledRows ?? []).map(
                  (r) => r.id as string,
                ),
              })
            }
          >
            Bill it
          </DocumentAction>
        </div>
      )}

      {note && (
        <p
          className="mb-3 rounded-[3px] border border-[rgba(196,131,111,0.4)] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.05em]"
          style={{ color: TERRACOTTA_INK }}
        >
          {note}
        </p>
      )}

      {/* The zero-entries state (help-desk Wave 1, copy §E.3): nothing this
          week AND no unbilled balance anywhere reads as "never logged" — the
          teaching state. A designer with history keeps the quiet week lines. */}
      {days.length === 0 &&
        (weekOffset === 0 && unbilledMinutes === 0 ? (
          <div className="py-4">
            <p className="font-heading text-[15px] italic text-[var(--color-charcoal)]">
              No hours logged yet
            </p>
            <p className="mt-1.5 max-w-[52ch] text-[12px] leading-relaxed text-[var(--color-aged-oak)]">
              Time logs itself while a document is in your hand; you can also
              add an entry by hand. What you track here is what you draw onto an
              invoice later.
            </p>
          </div>
        ) : (
          <p className="py-3 text-[12px] italic text-[var(--color-aged-oak)]">
            {weekOffset === 0
              ? 'Nothing logged this week — pick up a document and the time follows.'
              : 'Nothing logged that week.'}
          </p>
        ))}

      {days.map(([day, rows]) => (
        <section key={day} className="mb-4">
          <p className="mb-1 flex items-baseline justify-between font-mono text-[9px] font-semibold uppercase tracking-[0.07em] text-[var(--color-clay)]">
            <span>
              {day === todayKey ? 'Today' : fmtDay(rows[0].started_at)}
            </span>
            <span className="text-[var(--color-aged-oak)]">
              {fmtMinutes(
                rows.reduce((s, e) => s + (e.duration_minutes ?? 0), 0),
              )}
            </span>
          </p>
          <ul>
            {rows.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                unbilled={unbilledById.get(e.id)}
                onCommit={commit}
                onDeleted={() => {
                  void refetch();
                  void refetchUnbilled();
                }}
              />
            ))}
          </ul>
        </section>
      ))}

      {/* Batch add — the prototype's hours-add row */}
      <div className="mt-4 grid grid-cols-[1.2fr_0.7fr_1fr_auto] items-center gap-2">
        <select
          aria-label="Project"
          className="rounded-[4px] border border-[var(--color-pearl)] bg-white px-2 py-1.5 text-[11px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none [&_option]:bg-[var(--doc-paper)]"
          value={addProject}
          onChange={(e) => setAddProject(e.target.value)}
        >
          <option value="">Document…</option>
          {(projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          placeholder="Minutes"
          aria-label="Minutes"
          className="rounded-[4px] border border-[var(--color-pearl)] bg-white px-2 py-1.5 text-[11px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
          value={addMinutes}
          onChange={(e) => setAddMinutes(e.target.value)}
        />
        <select
          aria-label="Activity"
          className="rounded-[4px] border border-[var(--color-pearl)] bg-white px-2 py-1.5 text-[11px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none [&_option]:bg-[var(--doc-paper)]"
          value={addActivity}
          onChange={(e) => setAddActivity(e.target.value)}
        >
          {ACTIVITIES.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
        <DocumentAction
          actionKey="add-time-entry"
          surfaceKey="hours"
          regionKey="batch-entry"
          variant="primary"
          disabled={!addValid || addBusy}
          loading={addBusy}
          loadingLabel="Adding…"
          onClick={() => void batchAdd()}
        >
          Add
        </DocumentAction>
      </div>
    </div>
  );
}

/** One entry line — inline-editable until billed; unbilled lines carry their
 *  view-resolved money and the R77 delete-with-confirm. */
function EntryRow({
  entry: e,
  unbilled,
  onCommit,
  onDeleted,
}: {
  entry: AnyRecord;
  unbilled: UnbilledInfo | undefined;
  onCommit: (entry: AnyRecord, updates: AnyRecord) => void;
  onDeleted: () => void;
}) {
  const deleteEntry = useDeleteTimeEntry({ errorSurface: 'inline' });
  const [confirming, setConfirming] = useState(false);
  const [rowNote, setRowNote] = useState<string | null>(null);
  const billed = Boolean(e.invoice_id);
  const authority = useProjectBillingAuthority(e.project_id);
  const provenance = timeRateProvenance(e, authority.data);
  const billingLabel = timeBillingStateLabel(e);
  const amountCents = e.rated_amount_cents ?? unbilled?.amount_cents ?? 0;

  const doDelete = async () => {
    setRowNote(null);
    try {
      await deleteEntry.mutateAsync({ id: e.id, projectId: e.project_id });
      onDeleted();
    } catch (err) {
      setRowNote(err instanceof Error ? err.message : 'Could not delete');
      setConfirming(false);
    }
  };

  return (
    <li className="border-b border-[var(--color-pearl)] px-1 py-2">
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium text-[var(--color-charcoal)]">
            {e.project?.name ?? 'Project'}
          </p>
          <p className="truncate font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
            {[
              e.phase_key,
              SOURCE_LABEL[e.source] ?? e.source,
              provenance
                ? `${provenance.role} · ${fmtUsd(provenance.hourlyRateCents)}/hr${provenance.version ? ` · v${provenance.version}` : ''}`
                : null,
              // New rows use the server-rated snapshot; legacy rows retain
              // the project_unbilled_time amount alias.
              amountCents > 0
                ? fmtUsd(amountCents)
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <select
          aria-label="Activity"
          disabled={billed}
          className="rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-1.5 py-1 text-[10.5px] text-[var(--color-mocha)] focus:border-[var(--color-clay)] focus:outline-none disabled:opacity-40 [&_option]:bg-[var(--doc-paper)]"
          value={e.activity ?? ''}
          onChange={(ev) => onCommit(e, { activity: ev.target.value || null })}
        >
          <option value="">—</option>
          {ACTIVITIES.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          aria-label="Duration (minutes)"
          disabled={billed}
          className="w-[64px] rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-1.5 py-1 text-right text-[11px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none disabled:opacity-40"
          defaultValue={e.duration_minutes}
          onBlur={(ev) => {
            const v = parseInt(ev.target.value, 10);
            if (Number.isFinite(v) && v >= 1 && v !== e.duration_minutes)
              onCommit(e, { duration_minutes: v });
          }}
        />
        <span
          className="whitespace-nowrap rounded-[3px] border px-1.5 py-[2px] font-mono text-[8px] uppercase tracking-[0.06em]"
          style={
            billed
              ? { borderColor: 'var(--color-sage)', color: 'var(--color-sage)' }
              : {
                  borderColor: 'var(--color-pearl)',
                  color: 'var(--color-aged-oak)',
                }
          }
        >
          {billingLabel}
        </span>
        {/* R77 — delete-with-confirm; a billed entry is history, immutable. */}
        {!billed ? (
          confirming ? (
            <DocumentActionGroup
              surfaceKey="hours"
              regionKey="delete-entry-confirmation"
              className="items-center"
            >
              <span className="text-[var(--color-aged-oak)]">delete?</span>
              <DocumentAction
                actionKey="confirm-delete-time-entry"
                variant="danger"
                disabled={deleteEntry.isPending}
                loading={deleteEntry.isPending}
                loadingLabel="Deleting…"
                onClick={() => void doDelete()}
              >
                Delete
              </DocumentAction>
              <DocumentAction
                actionKey="cancel-delete-time-entry"
                variant="tertiary"
                onClick={() => setConfirming(false)}
              >
                Keep
              </DocumentAction>
            </DocumentActionGroup>
          ) : (
            <DocumentAction
              actionKey="open-delete-time-entry-confirmation"
              surfaceKey="hours"
              regionKey="time-entry-actions"
              variant="tertiary"
              aria-label="Delete entry"
              onClick={() => setConfirming(true)}
              className="text-[13px] leading-none text-[var(--color-aged-oak)] decoration-transparent hover:text-[#C4836F]"
            >
              ×
            </DocumentAction>
          )
        ) : (
          <span aria-hidden className="w-[13px]" />
        )}
      </div>
      {rowNote && (
        <p
          className="mt-1 font-mono text-[9px] uppercase tracking-[0.05em]"
          style={{ color: TERRACOTTA_INK }}
        >
          {rowNote}
        </p>
      )}
    </li>
  );
}
