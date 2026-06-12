'use client';

/**
 * The Hours ledger (D9: capture in the document, review in the drawer;
 * spec v1.2 §9): this week's entries across every engagement — document ·
 * activity · phase · source · duration, inline-editable until an invoice
 * claims them (00177 guard) — with today/week totals and a batch-add row.
 * "Export week → Accounts" arrives with the Accounts book (Slice 6).
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { useCreateTimeEntry, useUpdateTimeEntry } from '@/hooks/use-time-tracking';
import { ACTIVITIES, fmtMinutes } from '@/lib/document/time-derivation';
import { fmtDay } from '@/lib/document/format';
import { LedgerFrontMatter } from './ledger-front-matter';
import { hoursUtilization } from '@/lib/document/ledger-summary';

type AnyRecord = any;

const getSupabase = () => createBrowserClient() as AnyRecord;

const SOURCE_LABEL: Record<string, string> = {
  timer_auto: 'in hand',
  timer_manual: 'timer',
  manual_entry: 'typed',
};

function weekStartISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  return d.toISOString();
}

export function HoursLedger() {
  const updateEntry = useUpdateTimeEntry();
  const createEntry = useCreateTimeEntry();

  const { data: entries, refetch } = useQuery({
    queryKey: ['document-hours-week'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) return [];
      const { data, error } = await supabase
        .from('project_time_entries')
        .select('*, project:projects(name)')
        .eq('user_id', userData.user.id)
        .gte('started_at', weekStartISO())
        .not('duration_minutes', 'is', null)
        .order('started_at', { ascending: false });
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

  const [addProject, setAddProject] = useState('');
  const [addMinutes, setAddMinutes] = useState('');
  const [addActivity, setAddActivity] = useState('design');
  const [addBusy, setAddBusy] = useState(false);

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
  const weekMin = (entries ?? []).reduce((s, e) => s + (e.duration_minutes ?? 0), 0);
  const util = hoursUtilization(entries ?? []);

  const parsedAdd = parseInt(addMinutes, 10);
  const addValid = addProject && Number.isFinite(parsedAdd) && parsedAdd >= 1;

  const batchAdd = async () => {
    if (!addValid || addBusy) return;
    setAddBusy(true);
    try {
      await createEntry.mutateAsync({
        projectId: addProject,
        durationMinutes: parsedAdd,
        activity: addActivity,
        source: 'manual_entry',
      });
      setAddMinutes('');
      void refetch();
    } finally {
      setAddBusy(false);
    }
  };

  const commit = (entry: AnyRecord, updates: AnyRecord) => {
    updateEntry.mutate(
      { id: entry.id, projectId: entry.project_id, updates },
      { onSuccess: () => void refetch() },
    );
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl text-[var(--color-pearl)]">
            Hours <em className="italic text-[var(--color-clay)]">· this week</em>
          </h2>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.07em] text-[rgba(250,247,242,0.45)]">
            Today · {fmtMinutes(todayMin)} &nbsp;·&nbsp; Week · {fmtMinutes(weekMin)}
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Arrives with the Accounts book (Slice 6)"
          className="whitespace-nowrap rounded-[3px] border border-[rgba(250,247,242,0.15)] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.07em] text-[rgba(250,247,242,0.3)]"
        >
          Export week → Accounts
        </button>
      </div>

      {/* Front-matter (R5): utilization — the week's logged time + billable share. */}
      <LedgerFrontMatter
        caption="utilization"
        stats={[
          { label: 'logged this week', value: fmtMinutes(util.totalMinutes) },
          ...(util.billablePct !== null
            ? [{ label: 'billable', value: `${util.billablePct}%` }]
            : []),
          ...((openEstimateMinutes ?? 0) > 0
            ? [{ label: 'of open work est.', value: fmtMinutes(openEstimateMinutes ?? 0) }]
            : []),
        ]}
      />

      {days.length === 0 && (
        <p className="py-3 text-[12px] italic text-[rgba(250,247,242,0.5)]">
          Nothing logged this week — pick up a document and the time follows.
        </p>
      )}

      {days.map(([day, rows]) => (
        <section key={day} className="mb-4">
          <p className="mb-1 flex items-baseline justify-between font-mono text-[9px] font-semibold uppercase tracking-[0.07em] text-[var(--color-clay)]">
            <span>{day === todayKey ? 'Today' : fmtDay(rows[0].started_at)}</span>
            <span className="text-[rgba(250,247,242,0.4)]">
              {fmtMinutes(rows.reduce((s, e) => s + (e.duration_minutes ?? 0), 0))}
            </span>
          </p>
          <ul>
            {rows.map((e) => {
              const billed = Boolean(e.invoice_id);
              return (
                <li
                  key={e.id}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-[rgba(250,247,242,0.08)] px-1 py-2"
                >
                  <div>
                    <p className="text-[12.5px] font-medium text-[var(--color-off-white)]">
                      {e.project?.name ?? 'Project'}
                    </p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.4)]">
                      {[e.phase_key, SOURCE_LABEL[e.source] ?? e.source].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <select
                    aria-label="Activity"
                    disabled={billed}
                    className="rounded-[3px] border border-[rgba(250,247,242,0.15)] bg-transparent px-1.5 py-1 text-[10.5px] text-[rgba(250,247,242,0.75)] focus:border-[var(--color-clay)] focus:outline-none disabled:opacity-40 [&_option]:bg-[var(--color-charcoal)]"
                    value={e.activity ?? ''}
                    onChange={(ev) => commit(e, { activity: ev.target.value || null })}
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
                    className="w-[64px] rounded-[3px] border border-[rgba(250,247,242,0.15)] bg-transparent px-1.5 py-1 text-right text-[11px] text-[var(--color-off-white)] focus:border-[var(--color-clay)] focus:outline-none disabled:opacity-40"
                    defaultValue={e.duration_minutes}
                    onBlur={(ev) => {
                      const v = parseInt(ev.target.value, 10);
                      if (Number.isFinite(v) && v >= 1 && v !== e.duration_minutes)
                        commit(e, { duration_minutes: v });
                    }}
                  />
                  <span
                    className="whitespace-nowrap rounded-[3px] border px-1.5 py-[2px] font-mono text-[8px] uppercase tracking-[0.06em]"
                    style={
                      billed
                        ? { borderColor: 'var(--color-sage)', color: 'var(--color-sage)' }
                        : {
                            borderColor: 'rgba(250,247,242,0.2)',
                            color: 'rgba(250,247,242,0.45)',
                          }
                    }
                  >
                    {billed ? 'Billed' : e.billable ? 'Unbilled' : 'Non-bill'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* Batch add — the prototype's hours-add row */}
      <div className="mt-4 grid grid-cols-[1.2fr_0.7fr_1fr_auto] items-center gap-2">
        <select
          aria-label="Project"
          className="rounded-[4px] border border-[rgba(250,247,242,0.18)] bg-[rgba(250,247,242,0.05)] px-2 py-1.5 text-[11px] text-[var(--color-off-white)] focus:border-[var(--color-clay)] focus:outline-none [&_option]:bg-[var(--color-charcoal)]"
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
          className="rounded-[4px] border border-[rgba(250,247,242,0.18)] bg-[rgba(250,247,242,0.05)] px-2 py-1.5 text-[11px] text-[var(--color-off-white)] focus:border-[var(--color-clay)] focus:outline-none"
          value={addMinutes}
          onChange={(e) => setAddMinutes(e.target.value)}
        />
        <select
          aria-label="Activity"
          className="rounded-[4px] border border-[rgba(250,247,242,0.18)] bg-[rgba(250,247,242,0.05)] px-2 py-1.5 text-[11px] text-[var(--color-off-white)] focus:border-[var(--color-clay)] focus:outline-none [&_option]:bg-[var(--color-charcoal)]"
          value={addActivity}
          onChange={(e) => setAddActivity(e.target.value)}
        >
          {ACTIVITIES.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!addValid || addBusy}
          onClick={() => void batchAdd()}
          className="rounded-[4px] border border-[var(--color-clay)] bg-[var(--color-clay)] px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
