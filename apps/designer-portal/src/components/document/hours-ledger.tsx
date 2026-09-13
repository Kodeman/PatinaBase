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

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createBrowserClient,
  filterProjectUnbilledEntries,
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useOrganizations,
  useProjectHoursTotal,
  useStampProjectPricingStudio,
  useStudioHoursRollup,
  useTimeEntryLedger,
  useUpdateTimeEntry,
  type TimeEntryLedgerRow,
  type TimeHoursGroupBy,
} from '@patina/supabase';
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
  timeRateRoleLabel,
} from '@/lib/document/authority-hours';
import { documentEvents } from '@/lib/analytics/document-events';
import { hoursMemberScopePending } from '@/lib/document/open-hours-scope';

// R96 — the registry is the single source of the surface icon (no drift).
const HOURS_ICON = STUDIO_LEDGERS.find((l) => l.key === 'hours')!.icon;

type AnyRecord = any;

const getSupabase = () => createBrowserClient() as AnyRecord;

const SOURCE_LABEL: Record<string, string> = {
  timer_auto: 'in hand',
  timer_manual: 'timer',
  manual_entry: 'typed',
};

const TERRACOTTA_INK = 'var(--color-terracotta-ink)';

/** HT-8 — the four scopes of one sheet. No page, no tab bar, no leaderboard. */
export type HoursScope = 'mine' | 'member' | 'project' | 'studio';

/** HT-36 — how the studio scope's buckets are cut. The five the rollup admits. */
const GROUP_BY: ReadonlyArray<[TimeHoursGroupBy, string]> = [
  ['member', 'by person'],
  ['project', 'by document'],
  ['day', 'by day'],
  ['iso_week', 'by week'],
  ['activity', 'by activity'],
];

/** Local calendar date, not a UTC shift of it — the rollup takes dates. */
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

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
  // HT-8 — which of the four scopes this sheet is answering. A document in hand
  // opens on that document (HT-9: everyone's hours on it, not the holder's), a
  // person in hand opens on that person, and otherwise the sheet is still mine.
  const [memberScope, setMemberScope] = useState<{
    id: string;
    name: string | null;
  } | null>(
    hoursMemberScopePending.userId
      ? { id: hoursMemberScopePending.userId, name: hoursMemberScopePending.name }
      : null,
  );
  const [scope, setScope] = useState<HoursScope>(
    hoursMemberScopePending.userId
      ? 'member'
      : initialContext?.projectId
        ? 'project'
        : 'mine',
  );
  const [groupBy, setGroupBy] = useState<TimeHoursGroupBy>('member');
  const [showEntries, setShowEntries] = useState(false);

  useEffect(() => {
    hoursMemberScopePending.userId = null;
    hoursMemberScopePending.name = null;
  }, []);
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
        .select('*, project:projects(name, studio_id)')
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

  // The repair act and the rate card are the studio's, not a member's: HT-3's
  // card and HT-3-g's stamp both admit an owner or admin only.
  const { data: orgs } = useOrganizations();
  const viewerStudio = useMemo(
    () => orgs?.find((org) => org.type === 'design_studio') ?? orgs?.[0] ?? null,
    [orgs],
  );
  const viewerIsOwnerOrAdmin =
    viewerStudio?.membership?.role === 'owner' ||
    viewerStudio?.membership?.role === 'admin';

  const { data: projects } = useQuery({
    queryKey: ['document-hours-projects'],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('projects')
        .select('id, name, status')
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
        .select(
          'id, project_id, duration_minutes, amount_cents, authority_rate_id, billing_state',
        );
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
  const [billingProjectId, setBillingProjectId] = useState(
    initialContext?.projectId ?? '',
  );
  const billingTargetProjectId =
    lensProjectId ??
    (unbilledProjects.length === 1
      ? unbilledProjects[0]
      : unbilledProjects.includes(billingProjectId)
        ? billingProjectId
        : null);
  const billingTargetRows = useMemo(
    () =>
      billingTargetProjectId
        ? filterProjectUnbilledEntries(
            unbilledRows ?? [],
            billingTargetProjectId,
          )
        : [],
    [billingTargetProjectId, unbilledRows],
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
    const startedMs = Date.now();
    try {
      const written = await createEntry.mutateAsync({
        projectId: addProject,
        durationMinutes: parsedAdd,
        activity: addActivity,
        source: 'manual_entry',
      });
      // HT-27 — the capture instrument, read off what the server actually
      // stored rather than what the form asked for (the rate is the server's).
      documentEvents.time.entryLogged({
        surface: 'hours_ledger',
        source: 'manual_entry',
        activity: addActivity,
        billable: written.billable,
        rate_source: written.rate_source ?? null,
        rate_role: written.rate_role ?? null,
        duration_minutes: written.duration_minutes,
        latency_ms: Date.now() - startedMs,
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
          for (const field of Object.keys(updates))
            documentEvents.time.entryAdjusted({ field, by_admin: false });
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

  // The shown week, as the dates the rollup and the fact view bucket by.
  const fromDate = isoDate(weekStart);
  const toDate = isoDate(new Date(weekEnd.getTime() - 86_400_000));

  // The studios the viewer can name, for the pricing-studio fact on a row
  // (HT-3-e(3) — Patina makes the pricing studio visible rather than impossible
  // to move).
  const studioNames = useMemo(
    () => new Map((orgs ?? []).map((org) => [org.id, org.name as string])),
    [orgs],
  );
  const lensPricingStudioId = useMemo(() => {
    if (!lensProjectId) return null;
    const row = (entries ?? []).find((e) => e.project_id === lensProjectId);
    return (row?.project?.studio_id as string | null) ?? null;
  }, [entries, lensProjectId]);

  // HT-8 — the lens is the admin's instrument; a plain member never sees it.
  // The two scoped words appear only with something in hand: the member scope's
  // one door is the person (no staff picker in a money ledger), and "this
  // document" means the one the sheet was opened onto.
  const lensWords: ReadonlyArray<[HoursScope, string]> = useMemo(() => {
    const words: Array<[HoursScope, string]> = [['mine', 'mine']];
    if (memberScope) words.push(['member', memberScope.name ?? 'this person']);
    if (lensProjectId) words.push(['project', 'this document']);
    words.push(['studio', 'the studio']);
    return words;
  }, [memberScope, lensProjectId]);

  useEffect(() => {
    documentEvents.time.scopeViewed({
      scope,
      group_by: scope === 'mine' ? null : groupBy,
    });
  }, [scope, groupBy]);

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
            <em className="italic text-[var(--color-clay-ink)]">· {weekLabel}</em>
            {lensName && (
              <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
                · {lensName}
                <button
                  type="button"
                  onClick={() => setLensProjectId(null)}
                  className="ml-1.5 text-[var(--color-clay-ink)] hover:opacity-80"
                >
                  all documents ×
                </button>
              </span>
            )}
          </h2>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.07em] text-[var(--color-aged-oak)]">
            {weekOffset === 0 && (
              <>Today · {fmtMinutes(todayMin)} &nbsp;·&nbsp; </>
            )}
            Week · {fmtMinutes(weekMin)}
            {/* R77 — week paging: walk the history, quietly. */}
            <button
              type="button"
              onClick={() => setWeekOffset((o) => o + 1)}
              className="ml-3 text-[var(--color-clay-ink)] hover:opacity-80"
            >
              ‹ earlier
            </button>
            {weekOffset > 0 && (
              <button
                type="button"
                onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
                className="ml-2 text-[var(--color-clay-ink)] hover:opacity-80"
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
          className="whitespace-nowrap rounded-[3px] border border-[rgba(196,165,123,0.4)] px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--color-clay-ink)] transition-colors hover:bg-[var(--color-clay)] hover:text-white disabled:border-[var(--color-pearl)] disabled:text-[var(--color-aged-oak)] disabled:hover:bg-transparent"
        >
          Export week → Accounts
        </button>
      </div>

      {/* HT-8 — the scope lens: two to four DM-mono words, scored. Absent for a
          plain member, whose sheet is her own hours and her project totals. */}
      {viewerIsOwnerOrAdmin && lensWords.length > 1 && (
        <p
          role="group"
          aria-label="Hours scope"
          className="mb-4 flex flex-wrap items-baseline gap-x-3 border-b border-[var(--color-pearl)]/70 pb-2"
        >
          {lensWords.map(([key, label]) => {
            const on = scope === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setScope(key);
                  setShowEntries(false);
                }}
                aria-current={on ? 'true' : undefined}
                className={`da-score-hover min-h-11 inline-flex items-center font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${
                  on
                    ? 'da-score-on text-[var(--color-charcoal)]'
                    : 'text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </p>
      )}

      {/* Front-matter (R5): utilization — the shown week + the balance. */}
      {scope === 'mine' && (
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
      )}

      <PendingTimeAuthorizationBand
        rows={pendingAuthorizationRows ?? []}
        projects={projects ?? []}
        onSelectProject={setLensProjectId}
        showStudioRateDoor={viewerIsOwnerOrAdmin}
      />

      {/* A project-scoped Hours sheet carries the same RPC-owned authority
          readout as the open project document. Studio-wide mode stays a
          cross-project ledger rather than inventing an aggregate cap. */}
      {lensProjectId && (
        <ProjectAuthorityBandForProject projectId={lensProjectId} />
      )}

      {/* HT-3-e(3) — which studio prices this document's hours, said out loud.
          An unnamed one is why every hour here reads "rate pending". */}
      {scope === 'project' && lensProjectId && (
        <PricingStudioLine
          projectId={lensProjectId}
          pricingStudioId={lensPricingStudioId}
          studioName={
            lensPricingStudioId ? (studioNames.get(lensPricingStudioId) ?? null) : null
          }
          viewerStudioId={viewerStudio?.id ?? null}
          viewerIsOwnerOrAdmin={viewerIsOwnerOrAdmin}
        />
      )}

      {/* HT-30 — the totals are the front matter of the rows that produced
          them, and the rows are one act away (HT-36: aggregate by default). */}
      {scope !== 'mine' &&
        (viewerIsOwnerOrAdmin && viewerStudio ? (
          <ScopeRollup
            scope={scope}
            studioId={viewerStudio.id}
            memberId={scope === 'member' ? (memberScope?.id ?? null) : null}
            memberName={memberScope?.name ?? null}
            projectId={scope === 'project' ? lensProjectId : null}
            groupBy={groupBy}
            onGroupBy={setGroupBy}
            from={fromDate}
            to={toDate}
            weekLabel={weekLabel}
          />
        ) : scope === 'project' && lensProjectId ? (
          <MemberProjectTotal projectId={lensProjectId} />
        ) : null)}

      {scope !== 'mine' && (
        <div className="mb-4">
          <DocumentAction
            actionKey="show-scope-time-entries"
            surfaceKey="hours"
            regionKey="scope-readout"
            variant="tertiary"
            onClick={() => setShowEntries((open) => !open)}
          >
            {showEntries ? 'Hide the entries' : 'The entries'}
          </DocumentAction>
          {showEntries && (
            <ScopeEntries
              studioId={scope === 'studio' ? (viewerStudio?.id ?? null) : null}
              memberId={scope === 'member' ? (memberScope?.id ?? null) : null}
              projectId={scope === 'project' ? lensProjectId : null}
              from={fromDate}
              to={toDate}
              studioNames={studioNames}
            />
          )}
        </div>
      )}

      {/* R77 — the all-time unbilled balance, with its one act. */}
      {unbilledMinutes > 0 && (
        <div className="-mt-2 mb-4 flex flex-wrap items-baseline gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
          <span className="text-[var(--color-clay-ink)]">unbilled · all time</span>
          <span className="text-[var(--color-charcoal)]">
            {fmtUsd(unbilledCents)} · {fmtMinutes(unbilledMinutes)}
          </span>
          {unbilledProjects.length > 1 && (
            <span>· {unbilledProjects.length} documents</span>
          )}
          {!lensProjectId && unbilledProjects.length > 1 && (
            <select
              aria-label="Project to bill"
              value={billingTargetProjectId ?? ''}
              onChange={(event) => setBillingProjectId(event.target.value)}
              className="rounded-[3px] border border-[var(--color-pearl)] bg-white px-2 py-1 text-[11px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none [&_option]:bg-[var(--doc-paper)]"
            >
              <option value="">Choose a document…</option>
              {unbilledProjects.map((projectId) => (
                <option key={projectId} value={projectId}>
                  {(projects ?? []).find((project) => project.id === projectId)
                    ?.name ?? 'Untitled project'}
                </option>
              ))}
            </select>
          )}
          <DocumentAction
            actionKey="bill-unbilled-time"
            surfaceKey="hours"
            regionKey="unbilled-balance"
            variant="primary"
            disabled={!billingTargetProjectId || billingTargetRows.length === 0}
            onClick={() =>
              openInvoiceComposer({
                projectId: billingTargetProjectId ?? undefined,
                initialTimeEntryIds: billingTargetRows.map(
                  (row) => row.id as string,
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
          className="mb-3 rounded-[3px] border border-[rgba(196,131,111,0.4)] px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.05em]"
          style={{ color: TERRACOTTA_INK }}
        >
          {note}
        </p>
      )}

      {/* The zero-entries state (help-desk Wave 1, copy §E.3): nothing this
          week AND no unbilled balance anywhere reads as "never logged" — the
          teaching state. A designer with history keeps the quiet week lines. */}
      {scope === 'mine' &&
        days.length === 0 &&
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

      {scope === 'mine' &&
        days.map(([day, rows]) => (
        <section key={day} className="mb-4">
          <p className="mb-1 flex items-baseline justify-between font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--color-clay-ink)]">
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
                viewerStudioId={viewerStudio?.id ?? null}
                viewerIsOwnerOrAdmin={viewerIsOwnerOrAdmin}
                onCommit={commit}
                onOpenAuthority={setLensProjectId}
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
          {(projects ?? [])
            .filter((project) => project.status === 'active')
            .map((p) => (
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

const SCOPE_CAPTION: Record<HoursScope, string> = {
  mine: 'mine',
  member: 'this person',
  project: 'this document',
  studio: 'the studio',
};

/**
 * HT-3-e(3) / HT-3-g — the studio that prices this document's hours. Where the
 * column is unnamed every hour on it resolves 'none', so the line carries the
 * repair: naming it is an act only an owner or admin of a studio that employs
 * the document's designer may take, and the server decides, not this button.
 */
function PricingStudioLine({
  projectId,
  pricingStudioId,
  studioName,
  viewerStudioId,
  viewerIsOwnerOrAdmin,
}: {
  projectId: string;
  pricingStudioId: string | null;
  studioName: string | null;
  viewerStudioId: string | null;
  viewerIsOwnerOrAdmin: boolean;
}) {
  const stampStudio = useStampProjectPricingStudio();
  const [note, setNote] = useState<string | null>(null);

  return (
    <p className="-mt-1 mb-4 flex flex-wrap items-baseline gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
      <span className="text-[var(--color-clay-ink)]">priced by</span>
      <span className="text-[var(--color-charcoal)]">
        {pricingStudioId
          ? (studioName ?? 'another studio')
          : 'no studio yet — hours here read “rate pending”'}
      </span>
      {!pricingStudioId && viewerIsOwnerOrAdmin && viewerStudioId && (
        <DocumentAction
          actionKey="stamp-project-pricing-studio"
          surfaceKey="hours"
          regionKey="scope-pricing-studio"
          variant="tertiary"
          disabled={stampStudio.isPending}
          loading={stampStudio.isPending}
          loadingLabel="Naming…"
          onClick={() => {
            setNote(null);
            stampStudio.mutate(
              { projectId, studioId: viewerStudioId },
              {
                onError: (err) =>
                  setNote(
                    err instanceof Error
                      ? err.message
                      : 'The studio could not be named on this document.',
                  ),
              },
            );
          }}
        >
          Name your studio
        </DocumentAction>
      )}
      {note && <span style={{ color: TERRACOTTA_INK }}>{note}</span>}
    </p>
  );
}

/**
 * The aggregate a scope answers with (00607, SECURITY INVOKER — RLS decides what
 * it can see, and these props carry no secret). The grand total sits above the
 * buckets that produced it (HT-30), the buckets never carry notes (HT-36), and
 * internal time stands in its own group rather than quietly padding a billable
 * line.
 */
function ScopeRollup({
  scope,
  studioId,
  memberId,
  memberName,
  projectId,
  groupBy,
  onGroupBy,
  from,
  to,
  weekLabel,
}: {
  scope: HoursScope;
  studioId: string;
  memberId: string | null;
  memberName: string | null;
  projectId: string | null;
  groupBy: TimeHoursGroupBy;
  onGroupBy: (groupBy: TimeHoursGroupBy) => void;
  from: string;
  to: string;
  weekLabel: string;
}) {
  const rollup = useStudioHoursRollup({
    studioId,
    from,
    to,
    groupBy,
    userId: memberId,
    projectId,
  });
  const rows = rollup.data ?? [];
  const totalMinutes = rows.reduce((sum, row) => sum + row.total_minutes, 0);
  const billableCents = rows.reduce((sum, row) => sum + row.billable_cents, 0);
  const entryCount = rows.reduce((sum, row) => sum + row.entry_count, 0);
  const internal = rows.filter((row) => row.internal_minutes > 0);

  return (
    <section className="mb-4">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--color-clay-ink)]">
        {scope === 'member'
          ? (memberName ?? SCOPE_CAPTION.member)
          : SCOPE_CAPTION[scope]}{' '}
        · {weekLabel}
      </p>
      <p className="mt-0.5 text-[15px] text-[var(--color-charcoal)]">
        {fmtMinutes(totalMinutes)}
        {billableCents > 0 && (
          <>
            {' '}
            <span className="text-[var(--color-aged-oak)]">·</span>{' '}
            {fmtUsd(billableCents)} billable
          </>
        )}
        {entryCount > 0 && (
          <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
            {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </p>

      <p
        role="group"
        aria-label="Group hours"
        className="mt-1.5 flex flex-wrap items-baseline gap-x-3"
      >
        {GROUP_BY.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onGroupBy(key)}
            aria-current={groupBy === key ? 'true' : undefined}
            className={`da-score-hover inline-flex items-center font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
              groupBy === key
                ? 'da-score-on text-[var(--color-charcoal)]'
                : 'text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]'
            }`}
          >
            {label}
          </button>
        ))}
      </p>

      {rollup.isError ? (
        <p
          role="alert"
          className="mt-2 font-mono text-[11px] uppercase tracking-[0.05em]"
          style={{ color: TERRACOTTA_INK }}
        >
          These hours could not be read —{' '}
          {rollup.error instanceof Error ? rollup.error.message : 'try again'}
        </p>
      ) : rows.length === 0 ? (
        <p className="py-3 text-[12px] italic text-[var(--color-aged-oak)]">
          Nothing logged in this window.
        </p>
      ) : (
        <ul className="mt-2">
          {rows.map((row) => (
            <li
              key={row.bucket_key}
              className="flex items-baseline justify-between gap-3 border-b border-[var(--color-pearl)] py-1.5"
            >
              <span className="min-w-0 truncate text-[12.5px] text-[var(--color-charcoal)]">
                {row.bucket_label || row.member_name || '—'}
              </span>
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
                {fmtMinutes(row.total_minutes)}
                {row.billable_minutes > 0 &&
                  ` · ${fmtMinutes(row.billable_minutes)} billable`}
                {row.billable_cents > 0 && ` · ${fmtUsd(row.billable_cents)}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {internal.length > 0 && (
        <>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.07em] text-[var(--color-aged-oak)]">
            — internal —
          </p>
          <ul>
            {internal.map((row) => (
              <li
                key={`internal-${row.bucket_key}`}
                className="flex items-baseline justify-between gap-3 border-b border-[var(--color-pearl)] py-1.5"
              >
                <span className="min-w-0 truncate text-[12.5px] text-[var(--color-charcoal)]">
                  {row.bucket_label || row.member_name || '—'}
                </span>
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
                  {fmtMinutes(row.internal_minutes)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * HT-10-a — what a rostered member keeps after 00606 narrowed her per-row read
 * to her own rows: the project's total, from the one DEFINER function, which
 * raises for a caller who is not on the project rather than answering zero.
 */
function MemberProjectTotal({ projectId }: { projectId: string }) {
  const total = useProjectHoursTotal(projectId);

  if (total.isError) {
    return (
      <p className="mb-4 py-2 text-[12px] italic text-[var(--color-aged-oak)]">
        This document&rsquo;s total is for its team — you are not on it.
      </p>
    );
  }
  const data = total.data;
  return (
    <section className="mb-4">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--color-clay-ink)]">
        this document · all time
      </p>
      <p className="mt-0.5 text-[15px] text-[var(--color-charcoal)]">
        {fmtMinutes(data?.minutes ?? 0)}
        {(data?.billable_minutes ?? 0) > 0 && (
          <>
            {' '}
            <span className="text-[var(--color-aged-oak)]">·</span>{' '}
            {fmtMinutes(data?.billable_minutes ?? 0)} billable
          </>
        )}
        {(data?.amount_cents ?? 0) > 0 && (
          <>
            {' '}
            <span className="text-[var(--color-aged-oak)]">·</span>{' '}
            {fmtUsd(data?.amount_cents ?? 0)}
          </>
        )}
      </p>
    </section>
  );
}

/**
 * The entries behind an aggregate (HT-36's detail act), read from the 00604 fact
 * view — which carries no `notes` column at all, so free text takes a second,
 * explicit act per row and reads the table.
 */
function ScopeEntries({
  studioId,
  memberId,
  projectId,
  from,
  to,
  studioNames,
}: {
  studioId: string | null;
  memberId: string | null;
  projectId: string | null;
  from: string;
  to: string;
  studioNames: Map<string, string>;
}) {
  const ledger = useTimeEntryLedger({
    studioId,
    userId: memberId,
    projectId,
    from,
    to,
    includeRunning: false,
  });
  const rows = ledger.data ?? [];

  if (ledger.isError) {
    return (
      <p
        role="alert"
        className="mt-2 font-mono text-[11px] uppercase tracking-[0.05em]"
        style={{ color: TERRACOTTA_INK }}
      >
        These entries could not be read —{' '}
        {ledger.error instanceof Error ? ledger.error.message : 'try again'}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="py-2 text-[12px] italic text-[var(--color-aged-oak)]">
        No entries in this window.
      </p>
    );
  }

  return (
    <ul className="mt-2">
      {rows.map((row) => (
        <ScopeEntryRow key={row.id} row={row} studioNames={studioNames} />
      ))}
    </ul>
  );
}

/** One entry as the studio reads it: the person first, then the document, the
 *  work, the money, and the studio that priced it. Read-only — an adjustment is
 *  made where the hour lives, not in an aggregate. */
function ScopeEntryRow({
  row,
  studioNames,
}: {
  row: TimeEntryLedgerRow;
  studioNames: Map<string, string>;
}) {
  const [showNote, setShowNote] = useState(false);
  // The fact view prints `resolved_rate_cents` (0 where nothing priced the
  // hour), not the entry column — so the provenance is read off the view's own
  // names rather than the table's.
  const provenance = timeRateProvenance(
    {
      hourly_rate_cents: row.resolved_rate_cents,
      rate_source: row.rate_source ?? null,
      rate_role: row.rate_role ?? null,
      billable: row.billable,
      billing_state: row.billing_state ?? null,
    },
    null,
  );
  const roleLabel = timeRateRoleLabel(row.rate_role ?? null);

  return (
    <li className="border-b border-[var(--color-pearl)] px-1 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium text-[var(--color-charcoal)]">
            {row.member_name ?? 'A teammate'}
          </p>
          <p className="truncate font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
            {[
              row.project_name ?? 'Project',
              row.day,
              row.activity ?? 'activity not set',
              provenance.kind === 'rated'
                ? `${provenance.label} · ${fmtUsd(provenance.hourlyRateCents)}/hr`
                : provenance.label,
              roleLabel,
              row.amount_cents > 0 ? fmtUsd(row.amount_cents) : null,
              row.studio_id
                ? `priced by ${studioNames.get(row.studio_id) ?? 'another studio'}`
                : 'no pricing studio',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 items-baseline gap-2.5">
          <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-charcoal)]">
            {fmtMinutes(row.duration_minutes ?? 0)}
          </span>
          <span
            className="whitespace-nowrap rounded-[3px] border px-1.5 py-[2px] font-mono text-[11px] uppercase tracking-[0.06em]"
            style={
              row.invoice_id
                ? { borderColor: 'var(--color-sage)', color: 'var(--color-sage)' }
                : {
                    borderColor: 'var(--color-pearl)',
                    color: 'var(--color-aged-oak)',
                  }
            }
          >
            {timeBillingStateLabel(row)}
          </span>
          <DocumentAction
            actionKey="show-time-entry-note"
            surfaceKey="hours"
            regionKey="scope-entry-row"
            variant="tertiary"
            onClick={() => setShowNote((open) => !open)}
          >
            {showNote ? 'Hide note' : 'Note'}
          </DocumentAction>
        </div>
      </div>
      {showNote && <ScopeEntryNote entryId={row.id} />}
    </li>
  );
}

/** HT-36 — free text is read from the table, by an act, one entry at a time.
 *  It is never a column of the rollup or of the fact view. */
function ScopeEntryNote({ entryId }: { entryId: string }) {
  const note = useQuery({
    queryKey: ['document-hours-entry-note', entryId],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('project_time_entries')
        .select('notes')
        .eq('id', entryId)
        .maybeSingle();
      if (error) throw error;
      return ((data?.notes as string | null) ?? null) as string | null;
    },
  });

  return (
    <p className="mt-1 text-[12px] italic leading-relaxed text-[var(--color-mocha)]">
      {note.isLoading
        ? 'Reading…'
        : note.isError
          ? 'That note is not yours to read.'
          : (note.data ?? 'No note on this entry.')}
    </p>
  );
}

/** One entry line — inline-editable until billed; unbilled lines carry their
 *  view-resolved money and the R77 delete-with-confirm. */
function EntryRow({
  entry: e,
  unbilled,
  viewerStudioId,
  viewerIsOwnerOrAdmin,
  onCommit,
  onOpenAuthority,
  onDeleted,
}: {
  entry: AnyRecord;
  unbilled: UnbilledInfo | undefined;
  /** The viewer's own studio — the one a repair may name (HT-3-g(3)). */
  viewerStudioId: string | null;
  viewerIsOwnerOrAdmin: boolean;
  onCommit: (entry: AnyRecord, updates: AnyRecord) => void;
  onOpenAuthority: (projectId: string) => void;
  onDeleted: () => void;
}) {
  const deleteEntry = useDeleteTimeEntry({ errorSurface: 'inline' });
  const stampStudio = useStampProjectPricingStudio();
  const [confirming, setConfirming] = useState(false);
  const [rowNote, setRowNote] = useState<string | null>(null);
  const billed = Boolean(e.invoice_id);
  const authority = useProjectBillingAuthority(e.project_id);
  const provenance = timeRateProvenance(e, authority.data);
  const roleLabel = timeRateRoleLabel(provenance.rateRole);
  const billingLabel = timeBillingStateLabel(e);
  const amountCents = e.rated_amount_cents ?? unbilled?.amount_cents ?? 0;
  const pricingStudioId = (e.project?.studio_id as string | null) ?? null;
  const ratePending = provenance.kind === 'pending';

  // HT-26/HT-27's alarm — an hour nobody can price. Fires once per entry per
  // session (the emitter dedups); a re-render is not a second unpriced hour.
  useEffect(() => {
    if (!ratePending) return;
    documentEvents.time.rateUnresolved({
      entry_id: e.id as string,
      project_id: e.project_id as string,
      project_kind: null,
      rate_source: 'none',
    });
  }, [ratePending, e.id, e.project_id]);

  const stamp = () => {
    if (!viewerStudioId) return;
    setRowNote(null);
    stampStudio.mutate(
      { projectId: e.project_id as string, studioId: viewerStudioId },
      {
        onError: (err) =>
          setRowNote(
            err instanceof Error
              ? err.message
              : 'The studio could not be named on this document.',
          ),
      },
    );
  };

  const doDelete = async () => {
    setRowNote(null);
    try {
      await deleteEntry.mutateAsync({ id: e.id, projectId: e.project_id });
      documentEvents.time.entryDeleted({ by_admin: false });
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
          <p className="truncate font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
            {[
              e.phase_key,
              SOURCE_LABEL[e.source] ?? e.source,
              // HT-26 — the rate and where it came from, and never a blank:
              // "rate pending" is a fact, an empty cell is three different
              // facts wearing the same face.
              provenance.kind === 'rated'
                ? `${provenance.label} · ${fmtUsd(provenance.hourlyRateCents)}/hr${provenance.version ? ` · v${provenance.version}` : ''}`
                : provenance.label,
              // HT-41 — the role the member picked, where they hold more than one.
              roleLabel,
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
          className="rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-1.5 py-1 text-[11px] text-[var(--color-mocha)] focus:border-[var(--color-clay)] focus:outline-none disabled:opacity-40 [&_option]:bg-[var(--doc-paper)]"
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
        {e.billing_state === 'pending_authorization' && !billed ? (
          <button
            type="button"
            aria-label={`Review billing authority for ${e.project?.name ?? 'this document'}`}
            onClick={() => onOpenAuthority(e.project_id as string)}
            className="whitespace-nowrap rounded-[3px] border border-[var(--color-pearl)] px-1.5 py-[2px] font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]"
          >
            {billingLabel} →
          </button>
        ) : (
          <span
            className="whitespace-nowrap rounded-[3px] border px-1.5 py-[2px] font-mono text-[11px] uppercase tracking-[0.06em]"
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
        )}
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
              className="text-[13px] leading-none text-[var(--color-aged-oak)] decoration-transparent hover:text-[var(--color-terracotta-ink)]"
            >
              ×
            </DocumentAction>
          )
        ) : (
          <span aria-hidden className="w-[13px]" />
        )}
      </div>
      {/* HT-26 + HT-3-g — an hour with no rate has two repairs, and which one
          it is depends on whether the document names a pricing studio at all.
          Both are the studio's act: owner or admin only. */}
      {ratePending && viewerIsOwnerOrAdmin && (
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          {pricingStudioId === null && viewerStudioId ? (
            <DocumentAction
              actionKey="stamp-project-pricing-studio"
              surfaceKey="hours"
              regionKey="time-entry-rate-pending"
              variant="tertiary"
              disabled={stampStudio.isPending}
              loading={stampStudio.isPending}
              loadingLabel="Naming…"
              onClick={stamp}
            >
              Name the studio that prices this document
            </DocumentAction>
          ) : (
            <a
              href="/desk?account=studio"
              className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-clay-ink)] underline decoration-dotted underline-offset-4 hover:text-[var(--color-charcoal)]"
            >
              Set the studio rate →
            </a>
          )}
        </div>
      )}
      {rowNote && (
        <p
          className="mt-1 font-mono text-[11px] uppercase tracking-[0.05em]"
          style={{ color: TERRACOTTA_INK }}
        >
          {rowNote}
        </p>
      )}
    </li>
  );
}
