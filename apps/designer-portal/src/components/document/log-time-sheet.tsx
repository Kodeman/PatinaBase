'use client';

/**
 * "Log time" — the hour captured with NOTHING in hand (W3 · HT-11 · HT-13 ·
 * HT-24 · HT-25 · HT-41).
 *
 * The ⌘K verb that closes the one hole capture has: a 45-minute client call,
 * taken away from the desk, had no home. It could not reuse the "Draw an
 * invoice" pattern — that row is gated on a document in hand, which is exactly
 * when the auto-timer is already running and no form is needed.
 *
 * Five interactions, end to end: ⌘K (or a bare `t`) → project · duration ·
 * date · activity → Enter.
 *
 * The document list is EVERY project this member can read, not only the ones
 * she is rostered to (HT-25 — 00597 seats her on first log). The date is hers
 * to set with no bound (HT-13); past 30 days the form says "backdated" in its
 * own ink, as a word, never a badge (HT-40). The activity starts UNSET and
 * stays optional (HT-24 — recorded, never required). `billable` is stated, and
 * seeded from the resolved answer with its reason beside it (HT-11/HT-12).
 *
 * No inline natural-language parser in this wave (plan-v2 §4 / §6): the parser
 * is the largest single piece of that surface and the form is what makes the
 * hour loggable at all.
 *
 * R83 — failures render inline here, never as a toast.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useCreateTimeEntry,
  useMyRateRoles,
  useTimeCaptureProjects,
  type TimeRateRole,
} from '@patina/supabase';
import { ACTIVITIES } from '@/lib/document/time-derivation';
import { documentEvents } from '@/lib/analytics/document-events';
import { DocumentAction } from './document-action';
import {
  BillablePill,
  RateRoleChip,
  isoDateValue,
  startedAtFromDateValue,
  useBillableIntent,
  BACKDATE_MARK_DAYS,
} from './time-capture';

const SURFACE_KEY = 'time';
const REGION_KEY = 'log-time-verb';

/** Open the "Log time" form from anywhere — ⌘K's verb and the bare `t` key. */
export function openLogTime() {
  window.dispatchEvent(new CustomEvent('document:open-log-time'));
}

export function LogTimeSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createEntry = useCreateTimeEntry({ errorSurface: 'inline' });
  const { data: projects } = useTimeCaptureProjects();
  const [projectId, setProjectId] = useState('');
  const [minutes, setMinutes] = useState('');
  const [date, setDate] = useState(() => isoDateValue(new Date()));
  const [activity, setActivity] = useState('');
  const [billable, setBillable] = useState(false);
  const [rateRole, setRateRole] = useState<TimeRateRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  const intent = useBillableIntent(projectId || null);
  // HT-25 — the list is every document she can read, rostered or not, because
  // 00597 seats her on first log. Say so BEFORE she logs: a seat appears on
  // someone else's roster and the owner can remove it, so it is not a surprise
  // to spring afterwards.
  const { data: myRoles } = useMyRateRoles(projectId || null);
  const willBeSeated = Boolean(projectId) && myRoles?.length === 0;

  // The pill is SEEDED, not decided: the resolved answer lands the moment the
  // authority read settles for the document just picked, and a hand that has
  // already touched the pill for that document keeps its own answer.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId || !intent.isSettled) return;
    if (seededFor.current === projectId) return;
    seededFor.current = projectId;
    setBillable(intent.billable);
  }, [projectId, intent.isSettled, intent.billable]);

  useEffect(() => {
    if (!open) return;
    setNote(null);
    setMinutes('');
    setActivity('');
    setRateRole(null);
    setDate(isoDateValue(new Date()));
    seededFor.current = null;
    const t = requestAnimationFrame(() => firstFieldRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const parsed = parseInt(minutes, 10);
  const valid = Boolean(projectId) && Number.isFinite(parsed) && parsed >= 1;
  const backdated =
    Date.now() - new Date(startedAtFromDateValue(date)).getTime() >
    BACKDATE_MARK_DAYS * 86_400_000;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setNote(null);
    const startedMs = Date.now();
    try {
      const written = await createEntry.mutateAsync({
        projectId,
        durationMinutes: parsed,
        startedAt: startedAtFromDateValue(date),
        activity: activity || null,
        billable,
        rateRole,
        source: 'command_bar',
      });
      // HT-27 — read off what the server actually stored, not what was asked.
      documentEvents.time.entryLogged({
        surface: 'command_bar',
        source: 'command_bar',
        activity: written.activity ?? null,
        billable: written.billable,
        rate_source: written.rate_source ?? null,
        rate_role: written.rate_role ?? null,
        duration_minutes: written.duration_minutes,
        latency_ms: Date.now() - startedMs,
      });
      onClose();
    } catch (e) {
      setNote(
        `Could not log that hour — ${e instanceof Error ? e.message : 'try again'}`,
      );
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const layer = (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[16vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Log time"
    >
      <button
        type="button"
        aria-label="Close log time backdrop"
        tabIndex={-1}
        onMouseDown={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(28,25,23,0.28)]"
      />
      <div className="relative w-full max-w-[460px] rounded-[6px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-5 py-5">
        <p className="t-d3 text-[var(--color-charcoal)]">Log time</p>
        <p className="mb-4 mt-1 t-body-sm text-[var(--color-aged-oak)]">
          An hour with nothing in hand — a call, a drive, a sourcing run. Pick
          the document, say how long, and press Enter.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3">
            <label className="block">
              <span className="mb-1 block t-head text-[var(--color-aged-oak)]">
                Document
              </span>
              <select
                ref={firstFieldRef}
                aria-label="Document"
                className="min-h-11 w-full rounded-[4px] border border-[var(--color-pearl)] bg-white px-2 t-body-sm text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none [&_option]:bg-[var(--doc-paper)]"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">Document…</option>
                {(projects ?? [])
                  .filter((p) => p.status === 'active')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              {willBeSeated && (
                <span className="mt-1 block t-head text-[var(--color-aged-oak)]">
                  You are not on this roster — logging here seats you as a
                  support designer
                </span>
              )}
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block t-head text-[var(--color-aged-oak)]">
                  Minutes
                </span>
                <input
                  type="number"
                  min={1}
                  aria-label="Minutes"
                  className="min-h-11 w-full rounded-[4px] border border-[var(--color-pearl)] bg-white px-2 t-body-sm text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block t-head text-[var(--color-aged-oak)]">
                  Date
                </span>
                <input
                  type="date"
                  aria-label="Date"
                  className="min-h-11 w-full rounded-[4px] border border-[var(--color-pearl)] bg-white px-2 t-body-sm text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block t-head text-[var(--color-aged-oak)]">
                What the work was
              </span>
              <select
                aria-label="Activity"
                className="min-h-11 w-full rounded-[4px] border border-[var(--color-pearl)] bg-white px-2 t-body-sm text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none [&_option]:bg-[var(--doc-paper)]"
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
              >
                <option value="">activity not set</option>
                {ACTIVITIES.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <BillablePill
                value={billable}
                onChange={setBillable}
                reason={intent.isSettled ? intent.sentence : null}
                surfaceKey={SURFACE_KEY}
                regionKey={REGION_KEY}
              />
              <RateRoleChip
                projectId={projectId || null}
                value={rateRole}
                onChange={setRateRole}
              />
            </div>

            {backdated && (
              <p className="t-head text-[var(--color-aged-oak)]">backdated</p>
            )}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <DocumentAction
              actionKey="cancel-log-time"
              surfaceKey={SURFACE_KEY}
              regionKey={REGION_KEY}
              variant="tertiary"
              type="button"
              onClick={onClose}
            >
              Never mind
            </DocumentAction>
            <DocumentAction
              actionKey="submit-log-time"
              surfaceKey={SURFACE_KEY}
              regionKey={REGION_KEY}
              variant="primary"
              type="submit"
              disabled={!valid || busy}
              loading={busy}
              loadingLabel="Logging…"
            >
              Log it
            </DocumentAction>
          </div>
        </form>

        {note && (
          <p
            role="alert"
            className="mt-3 t-head text-[var(--color-terracotta-ink)]"
          >
            {note}
          </p>
        )}
      </div>
    </div>
  );

  return typeof document === 'undefined'
    ? layer
    : createPortal(layer, document.body);
}

/** The layout host for the ⌘K verb and the bare `t` key. */
export function LogTimeOverlay() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('document:open-log-time', onOpen);
    return () => window.removeEventListener('document:open-log-time', onOpen);
  }, []);
  return <LogTimeSheet open={open} onClose={() => setOpen(false)} />;
}
