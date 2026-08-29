'use client';

/**
 * LetterheadVitals (Track 7 · R80) — the project letterhead's vitals: start
 * date · target date · budget band write ONE column with a quiet per-field
 * status (the Piece's facet-field grammar, compacted to the letterhead's
 * one-line scale). The phase word and the contract total stay static — they
 * are derived facts, not editables.
 *
 * Date Instruments lane D5 — the two dates moved off the R40/R70 blur-save
 * law onto the Calendar Folio: a Folio trigger opens FolioPopover/
 * FolioCalendar in day mode, and SET is the commit (never blur), matching the
 * one date grammar the rest of the Document now speaks (DECISIONS.md I133).
 * Money and everything below the line keep blur-save untouched.
 *
 * Below the line, a quiet "Phases" fold: each project phase's hour estimate
 * (project_phases.estimated_hours, 00177) as an editable mono field beside its
 * logged actual — estimates beside actuals, where the hours truly live.
 *
 * Zero shadows (D4); failures read inline at the field (R83). Renders only on
 * project documents (the page passes projectId).
 */

import { useEffect, useRef, useState } from 'react';
import { useProjectV2, useProjectPhases } from '@patina/supabase';
import { useUpdatePhaseEstimates } from '@/hooks/use-time-tracking';
import {
  usePhaseActualMinutes,
  useSaveProjectVitals,
  type ProjectVitalsPatch,
} from '@/hooks/use-project-lifecycle';
import { centsToDollarString, dollarsToCents } from '@/lib/document/closure-derivation';
import { FolioCalendar, FolioPopover, type FolioSelection } from '@/components/document/date';
import { fmtDay, todayYmd } from '@/lib/document/format';


type AnyRecord = any;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const prettyPhase = (phase: string | null) =>
  phase
    ? phase
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : null;

const fmtHours = (minutes: number) => {
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
};

/** One save channel per field — mutation + a transient quiet status (the
 *  Piece's useFacetSave, retargeted at the project vitals write). */
function useVitalSave(projectId: string) {
  const mutation = useSaveProjectVitals(projectId);
  const [state, setState] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const save = async (patch: ProjectVitalsPatch) => {
    setState('saving');
    setErrorMsg(null);
    try {
      await mutation.mutateAsync(patch);
      setState('saved');
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState('idle'), 1800);
    } catch (e) {
      setState('error');
      setErrorMsg(e instanceof Error ? e.message : 'Could not save just now.');
    }
  };

  return { save, state, errorMsg };
}

function SaveDot({ state, errorMsg }: { state: SaveState; errorMsg: string | null }) {
  if (state === 'idle') return null;
  return (
    <span
      role="status"
      aria-live="polite"
      className={`ml-1 font-mono text-[11px] uppercase tracking-[0.05em] ${
        state === 'error' ? 'text-[var(--color-terracotta-ink)]' : 'text-[var(--color-sage)]'
      }`}
    >
      {state === 'saving' && '· saving…'}
      {state === 'saved' && '✓'}
      {state === 'error' && `· ${errorMsg ?? "couldn't save"}`}
    </span>
  );
}

/** SET-save date vital through the Calendar Folio, styled as the same quiet
 *  mono text treatment the blur-save fields wear. An `open` guard (not a
 *  `focused` ref) keeps a server echo from clobbering the trigger's label
 *  while the popover is up — the popover, not focus, is what must not be
 *  interrupted. An echo that lands while open is remembered (`pendingEcho`,
 *  not applied to `value`) rather than dropped: a close that ISN'T a fresh
 *  commit (Esc, outside click) flushes it so the display never gets stuck
 *  showing what the popover opened with. `commit`/`clear` both discard any
 *  pending echo — the locally authored value wins over a now-stale one. */
function VitalDate({
  projectId,
  column,
  serverValue,
  label,
}: {
  projectId: string;
  column: 'start_date' | 'target_end_date';
  serverValue: string | null;
  label: string;
}) {
  const [value, setValue] = useState(serverValue ?? '');
  const [open, setOpen] = useState(false);
  const lastServer = useRef(serverValue ?? '');
  const pendingEcho = useRef<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { save, state, errorMsg } = useVitalSave(projectId);

  useEffect(() => {
    const incoming = serverValue ?? '';
    if (incoming === lastServer.current) return;
    lastServer.current = incoming;
    if (open) {
      pendingEcho.current = incoming;
    } else {
      setValue(incoming);
      pendingEcho.current = null;
    }
  }, [serverValue, open]);

  // Flush a pending echo the instant the popover closes without a commit —
  // `commit`/`clear` already clear `pendingEcho` before this can fire, so a
  // fresh local write is never clobbered by a stale one.
  useEffect(() => {
    if (open || pendingEcho.current == null) return;
    setValue(pendingEcho.current);
    pendingEcho.current = null;
  }, [open]);

  const commit = (selection: FolioSelection) => {
    if (selection.kind !== 'day') return;
    setOpen(false);
    pendingEcho.current = null;
    setValue(selection.date);
    if (selection.date !== (serverValue ?? '')) void save({ [column]: selection.date });
  };

  const clear = () => {
    pendingEcho.current = null;
    setValue('');
    if ((serverValue ?? '') !== '') void save({ [column]: null });
  };

  return (
    <span className="relative inline-flex items-baseline gap-1">
      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        onClick={() => setOpen(true)}
        disabled={state === 'saving'}
        className="border-b border-transparent bg-transparent font-mono text-[11px] text-[var(--text-primary)] hover:border-[var(--color-pearl)] focus:border-[var(--color-clay)] focus:text-[var(--color-charcoal)] focus:outline-none disabled:opacity-50"
      >
        {value ? fmtDay(value) : '—'}
      </button>
      {value && (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={clear}
          disabled={state === 'saving'}
          className="font-mono text-[11px] text-[var(--text-muted)] hover:text-[var(--color-clay-ink)] disabled:opacity-50"
        >
          ×
        </button>
      )}
      <SaveDot state={state} errorMsg={errorMsg} />
      {open && (
        <FolioPopover onClose={() => setOpen(false)} aria-label={`${label} date`} returnFocusRef={triggerRef}>
          <FolioCalendar
            value={value ? { kind: 'day', date: value } : null}
            today={todayYmd()}
            modes={['day']}
            readoutLabels={{ day: label.toUpperCase(), span: label.toUpperCase() }}
            onCommit={commit}
          />
        </FolioPopover>
      )}
    </span>
  );
}

/** Blur-save money vital (dollars in, cents stored). */
function VitalMoney({
  projectId,
  column,
  serverCents,
  ariaLabel,
  placeholder,
  autoFocus = false,
}: {
  projectId: string;
  column: 'budget_min' | 'budget_max';
  serverCents: number | null;
  ariaLabel: string;
  placeholder: string;
  /** Set on the first field the ghost affordance reveals, so opening the band
   *  by keyboard does not drop focus onto the body. */
  autoFocus?: boolean;
}) {
  const serverDollars = centsToDollarString(serverCents);
  const [value, setValue] = useState(serverDollars);
  const focused = useRef(false);
  const lastServer = useRef(serverDollars);
  const { save, state, errorMsg } = useVitalSave(projectId);

  useEffect(() => {
    if (serverDollars !== lastServer.current) {
      lastServer.current = serverDollars;
      if (!focused.current) setValue(serverDollars);
    }
  }, [serverDollars]);

  const commit = () => {
    focused.current = false;
    const cents = dollarsToCents(value);
    if (cents !== serverCents) void save({ [column]: cents });
  };

  return (
    <span className="inline-flex items-baseline">
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        onFocus={() => (focused.current = true)}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            e.currentTarget.blur();
          }
        }}
        disabled={state === 'saving'}
        size={Math.max(4, value.length + 1)}
        className="border-b border-transparent bg-transparent text-right font-mono text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] hover:border-[var(--color-pearl)] focus:border-[var(--color-clay)] focus:text-[var(--color-charcoal)] focus:outline-none disabled:opacity-50"
      />
      <SaveDot state={state} errorMsg={errorMsg} />
    </span>
  );
}

/** The phases fold — estimate fields (blur-save, 00177) beside logged actuals. */
function PhasesFold({ projectId }: { projectId: string }) {
  const { data: phases } = useProjectPhases(projectId) as { data: AnyRecord[] | undefined };
  const { data: actualMinutes } = usePhaseActualMinutes(projectId);
  const updateEstimates = useUpdatePhaseEstimates();
  const [values, setValues] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<string | null>(null);

  if (!phases || phases.length === 0) return null;

  const valueFor = (p: AnyRecord) =>
    values[p.id] ?? (p.estimated_hours != null ? String(p.estimated_hours) : '');

  const commit = (p: AnyRecord) => {
    const raw = valueFor(p).trim();
    const parsed = raw === '' ? null : Math.round(parseFloat(raw) * 10) / 10;
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
    const current = p.estimated_hours != null ? Number(p.estimated_hours) : null;
    if (parsed === current) return;
    setRowError(null);
    updateEstimates.mutate(
      { projectId, changes: [{ phaseId: p.id as string, estimatedHours: parsed }] },
      {
        onError: (err) =>
          setRowError(err instanceof Error ? err.message : 'Could not save the estimate.'),
      },
    );
  };

  return (
    <div className="mt-1.5">
      <table className="text-left">
        <caption className="sr-only">Phase hour estimates beside logged actuals</caption>
        <tbody>
          {phases.map((p) => {
            const logged = actualMinutes?.[p.phase_key ?? ''] ?? 0;
            return (
              <tr key={p.id}>
                <td className="pr-4 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  {p.name ?? prettyPhase(p.phase_key)}
                </td>
                <td className="pr-2 text-right font-mono text-[11px] text-[var(--text-muted)]">
                  {logged > 0 ? fmtHours(logged) : '—'}
                </td>
                <td className="pr-1 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
                  of
                </td>
                <td>
                  <input
                    value={valueFor(p)}
                    aria-label={`${p.name ?? prettyPhase(p.phase_key)} — estimated hours`}
                    placeholder="est"
                    inputMode="decimal"
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [p.id]: e.target.value.replace(/[^0-9.]/g, ''),
                      }))
                    }
                    onBlur={() => commit(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.currentTarget.blur();
                      } else if (e.key === 'Escape') {
                        e.stopPropagation();
                        e.currentTarget.blur();
                      }
                    }}
                    className="w-10 border-b border-transparent bg-transparent text-right font-mono text-[11px] text-[var(--text-muted)] placeholder:text-[var(--color-aged-oak)] hover:border-[var(--color-pearl)] focus:border-[var(--color-clay)] focus:text-[var(--color-charcoal)] focus:outline-none"
                  />
                  <span className="font-mono text-[11px] text-[var(--text-muted)]">h est.</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rowError && (
        <p role="alert" className="mt-0.5 text-[11px] text-[var(--color-terracotta-ink)]">
          {rowError}
        </p>
      )}
    </div>
  );
}

/** The contract total as a stated figure: a sub-dollar amount keeps its cents
 *  rather than rounding down into a bare "$0", and a credit keeps its sign.
 *  Only an exact zero is the absence of a recorded amount. */
function contractTotal(cents: number): string {
  const abs = Math.abs(cents);
  const whole = abs % 100 === 0;
  const body = (abs / 100).toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return `${cents < 0 ? '−' : ''}$${body}`;
}

export function LetterheadVitals({ projectId }: { projectId: string }) {
  const { data: project } = useProjectV2(projectId) as { data: AnyRecord };
  const [phasesOpen, setPhasesOpen] = useState(false);
  const [bandOpen, setBandOpen] = useState(false);

  if (!project) return null;

  const phaseWord = prettyPhase(project.current_phase);
  const total = project.total_amount_cents ?? null;
  // Band-honest empty rendering: with neither bound recorded, the two dollar
  // marks and the dash have nothing to punctuate, and a contract total of zero
  // is the absence of a recorded amount rather than a project worth nothing.
  // Both read as stated figures, so neither renders until it is one.
  const bandUnset = project.budget_min == null && project.budget_max == null;

  return (
    <div className="mt-1">
      {/* A plain <div>, not <p>: a VitalDate's FolioPopover mounts a <div>
          while open (no portal, by the Folio's own house rule — see
          folio-popover.tsx), and a <div> can never legally nest inside a
          <p> (the browser silently closes it, a hydration hazard). */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] text-[var(--text-primary)]">
        {phaseWord && <span>{phaseWord}</span>}
        <VitalDate
          projectId={projectId}
          column="start_date"
          serverValue={project.start_date ?? null}
          label="Start"
        />
        <VitalDate
          projectId={projectId}
          column="target_end_date"
          serverValue={project.target_end_date ?? null}
          label="Target"
        />
        {bandUnset && !bandOpen ? (
          <button
            type="button"
            onClick={() => setBandOpen(true)}
            className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)] hover:text-[var(--color-clay-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            Set a budget band
          </button>
        ) : (
          <span className="inline-flex items-baseline gap-0.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              Band
            </span>
            <span className="font-mono text-[11px] text-[var(--text-primary)]">$</span>
            <VitalMoney
              projectId={projectId}
              column="budget_min"
              serverCents={project.budget_min ?? null}
              ariaLabel="Budget band minimum (dollars)"
              placeholder="from"
              autoFocus={bandOpen}
            />
            <span className="font-mono text-[11px] text-[var(--text-primary)]">–</span>
            <VitalMoney
              projectId={projectId}
              column="budget_max"
              serverCents={project.budget_max ?? null}
              ariaLabel="Budget band maximum (dollars)"
              placeholder="to"
            />
          </span>
        )}
        {total != null && total !== 0 && (
          <span className="font-mono text-[11px]">{contractTotal(total)}</span>
        )}
        <button
          type="button"
          aria-expanded={phasesOpen}
          onClick={() => setPhasesOpen((v) => !v)}
          className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)] hover:text-[var(--color-clay-ink)]"
        >
          Phases {phasesOpen ? '▾' : '▸'}
        </button>
      </div>
      {phasesOpen && <PhasesFold projectId={projectId} />}
    </div>
  );
}

/** The letterhead title as a blur-save field (R80): Playfair, borderless at
 *  rest — the heading IS the input. Used by DocLetterhead on project docs. */
export function LetterheadTitle({
  projectId,
  serverTitle,
}: {
  projectId: string;
  serverTitle: string;
}) {
  const [value, setValue] = useState(serverTitle);
  const focused = useRef(false);
  const lastServer = useRef(serverTitle);
  const { save, state, errorMsg } = useVitalSave(projectId);

  useEffect(() => {
    if (serverTitle !== lastServer.current) {
      lastServer.current = serverTitle;
      if (!focused.current) setValue(serverTitle);
    }
  }, [serverTitle]);

  const commit = () => {
    focused.current = false;
    const next = value.trim();
    if (next === '') {
      setValue(serverTitle); // a document keeps its name — blank never saves
      return;
    }
    if (next !== serverTitle) void save({ name: next });
  };

  return (
    <h1 className="flex items-baseline gap-2 font-heading text-[40px] font-medium leading-[1.08] tracking-[-0.015em] text-[var(--text-primary)]">
      <input
        type="text"
        aria-label="Project title"
        value={value}
        onFocus={() => (focused.current = true)}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            e.currentTarget.blur();
          }
        }}
        disabled={state === 'saving'}
        className="min-w-0 flex-1 border-b border-transparent bg-transparent font-heading text-[40px] font-medium leading-[1.08] tracking-[-0.015em] text-[var(--text-primary)] hover:border-[var(--color-pearl)] focus:border-[var(--color-clay)] focus:outline-none disabled:opacity-60"
      />
      <SaveDot state={state} errorMsg={errorMsg} />
    </h1>
  );
}
