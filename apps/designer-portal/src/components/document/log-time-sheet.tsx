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
 * W4 (HT-15) adds the one hour that belongs to no document: studio time. It is
 * the same form with the document left unnamed — `project_id NULL`, the
 * member's studio stamped beside it, non-billable by constraint — never a
 * sentinel "Internal" project, which would pollute every list, roster, board and
 * invoice path.
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
import { useDocumentTime } from '@/hooks/document-time-provider';
import { useInternalTimeStudio } from '@/hooks/use-viewer-studio';
import { documentEvents } from '@/lib/analytics/document-events';
import { DocumentAction } from './document-action';
import {
  BillablePill,
  RateRoleChip,
  isDayValue,
  isoDateValue,
  startedAtFromDateValue,
  useBillableIntent,
  BACKDATE_MARK_DAYS,
} from './time-capture';

const SURFACE_KEY = 'time';
const REGION_KEY = 'log-time-verb';

/**
 * W4 (HT-15) — the internal door, as a value the document `<select>` can hold.
 * Not a project id and never sent as one: it means "no document", which is what
 * `log_time` writes as `project_id NULL` with the member's studio stamped
 * beside it. A sentinel "Internal" PROJECT was the rejected alternative — it
 * would pollute every project list, roster, board and invoice path.
 */
const INTERNAL = '__internal__';

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
  // The document in hand is the one answer the form already has. Without it
  // the ⌘K door asked a question the Hours add row never asks, and — worse —
  // kept whatever was picked last time, so a reopened form proposed the wrong
  // house.
  const { heldProjectId } = useDocumentTime();
  const { data: projects } = useTimeCaptureProjects();
  // HT-15 — the studio an internal hour belongs to. Absent for a member who
  // belongs to no design studio, and then the option is not offered at all.
  const { studio: internalStudio } = useInternalTimeStudio();
  const [projectId, setProjectId] = useState('');
  const [minutes, setMinutes] = useState('');
  const [date, setDate] = useState(() => isoDateValue(new Date()));
  const [activity, setActivity] = useState('');
  const [billable, setBillable] = useState(false);
  // HT-11 — billable is STATED. `statedFor` records the document she said it
  // about, so a late authority read cannot overrule her (W3-R4-M1) and a
  // different document asks the question again.
  const [statedFor, setStatedFor] = useState<string | null>(null);
  const [rateRole, setRateRole] = useState<TimeRateRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  // HT-15 — an hour on nothing a client is billed for. The pill, the role chip
  // and the authority read all belong to a project and are stood down here:
  // 00610's CHECK refuses a billable project-less row, so the honest control is
  // one that says the answer rather than one that asks for it.
  const internal = projectId === INTERNAL;
  const namedProjectId = internal ? '' : projectId;

  const intent = useBillableIntent(namedProjectId || null);
  // HT-25 — the list is every document she can read, rostered or not, because
  // 00597 seats her on first log. Say so BEFORE she logs: a seat appears on
  // someone else's roster and the owner can remove it, so it is not a surprise
  // to spring afterwards.
  const { data: myRoles } = useMyRateRoles(namedProjectId || null);
  const willBeSeated = Boolean(namedProjectId) && myRoles?.length === 0;

  // The pill is SEEDED, not decided: the resolved answer lands the moment the
  // authority read settles for the document just picked, and a hand that has
  // already touched the pill for that document keeps its own answer — INCLUDING
  // a hand that touched it while the read was still in flight, which the
  // `seededFor` guard alone could not protect because it is only written when
  // the read settles (W3-R4-M1).
  const billableStated = Boolean(namedProjectId) && statedFor === projectId;
  const stateBillable = (next: boolean) => {
    setStatedFor(projectId);
    setBillable(next);
  };
  useEffect(() => {
    setStatedFor(null);
  }, [projectId]);
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!namedProjectId || !intent.isSettled) return;
    if (billableStated) return;
    if (seededFor.current === namedProjectId) return;
    seededFor.current = namedProjectId;
    setBillable(intent.billable);
  }, [namedProjectId, intent.isSettled, intent.billable, billableStated]);
  // An internal hour is non-billable by constraint, not by preference.
  useEffect(() => {
    if (internal) setBillable(false);
  }, [internal]);

  // The document follows what is in hand — on open, and if the hand changes
  // while the form stands. Held in its own effect so a change of hand never
  // wipes minutes already typed.
  useEffect(() => {
    if (!open) return;
    setProjectId(heldProjectId ?? '');
  }, [open, heldProjectId]);

  useEffect(() => {
    if (!open) return;
    setNote(null);
    setMinutes('');
    setActivity('');
    setRateRole(null);
    setDate(isoDateValue(new Date()));
    setStatedFor(null);
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
  // A cleared date field is not "today" — it is an unanswered question, and
  // the act waits for it (W3-R3-M2).
  // …and neither is an unanswered authority: until the read settles the pill
  // shows the fail-closed default, not a resolved answer, and logging in that
  // window writes `billable = false` whatever the agreement says (W3-R4-M1).
  // Her own statement is an answer too — that is what keeps a failed read from
  // stranding the form with nothing she can do.
  const valid =
    (internal
      ? Boolean(internalStudio)
      : Boolean(projectId) && (intent.isSettled || billableStated)) &&
    isDayValue(date) &&
    Number.isFinite(parsed) &&
    parsed >= 1;
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
        projectId: internal ? null : projectId,
        studioId: internal ? (internalStudio?.id ?? null) : null,
        durationMinutes: parsed,
        startedAt: startedAtFromDateValue(date),
        activity: activity || null,
        billable: internal ? false : billable,
        rateRole: internal ? null : rateRole,
        source: internal ? 'internal' : 'command_bar',
      });
      // HT-27 — read off what the server actually stored, not what was asked.
      documentEvents.time.entryLogged({
        surface: 'command_bar',
        source: internal ? 'internal' : 'command_bar',
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
                {/* HT-15 — the owner's own hours, and the studio's, without a
                    client's house to misattribute them to. */}
                {internalStudio && (
                  <option value={INTERNAL}>Studio time — no document</option>
                )}
                {(projects ?? [])
                  .filter((p) => p.status === 'active')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              {internal && (
                <span className="mt-1 block t-head text-[var(--color-aged-oak)]">
                  Studio time — non-billable, and out of every document&apos;s
                  hours
                </span>
              )}
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
                value={internal ? false : billable}
                onChange={stateBillable}
                reason={
                  internal
                    ? 'Non-billable — studio time belongs to no client'
                    : intent.isSettled || intent.unreadable
                      ? intent.sentence
                      : null
                }
                // W3-R5-m4 — `stateBillable` records the answer against
                // `projectId`, which is `''` with no document picked; the
                // `[projectId]` effect then clears `statedFor` the moment a
                // document IS picked, so a tap made before that point was
                // silently thrown away. Disabling the pill until a document
                // is named is honest about what her tap can actually do.
                disabled={!projectId || internal}
                surfaceKey={SURFACE_KEY}
                regionKey={REGION_KEY}
              />
              <RateRoleChip
                projectId={namedProjectId || null}
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
