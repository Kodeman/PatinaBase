'use client';

/**
 * The Amendment sheet (Track 7 · R81) — scope changes as a paper act. A
 * revise-sheet sibling: a charcoal DocSheet (D8) that slides up over the open
 * document — an overlay, never a route; the document beneath never unmounts
 * (D1). Zero shadows (D4); failures inline at the act (R83); no toasts (D2).
 *
 * One sheet, two readings:
 *   · COMPOSE — what's changing, why, the fee/timeline impacts (the legacy
 *     scope-change-form's math, ported: new total = current + FF&E + fee),
 *     optional new rooms, then "Send to the client →" (or park as a draft).
 *   · REVIEW — an existing amendment opened from the quiet ledger strip at
 *     the sheet's foot: its impacts, its status word, and the act its state
 *     earns — Send for a draft, APPLY for an approved one
 *     (apply_scope_change, 00084 — rooms/lines/budget/timeline in ONE
 *     transaction, §5).
 *
 * There is deliberately NO list page (R81): the margin and the Account band
 * are the status tracking; this sheet's strip exists so an approved
 * amendment has an apply door before those entries are wired post-merge.
 *
 * Entry today: the R14 margin-note escalation (margin-bodies) seeds compose
 * with the note's words and the note records what it became. The Account
 * band's entry is Track 8's to mount (post-merge wiring).
 */

import { useEffect, useState } from 'react';
import { useProjectV2, useScopeChangeRequests } from '@patina/supabase';
import {
  useApplyAmendment,
  useComposeAmendment,
  useSendAmendment,
} from '@/hooks/use-amendments';
import {
  amendmentImpactLine,
  amendmentStatusWord,
  computeAmendmentTotals,
} from '@/lib/document/amendment-derivation';
import { dollarsToCents } from '@/lib/document/closure-derivation';
import { familyLabel } from '@/lib/document/family-label';
import { fmtDay } from '@/lib/document/format';
import { DocSheet } from './doc-sheet';


type AnyRecord = any;

const labelCls =
  'font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';
const fieldCls =
  'w-full rounded-[4px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[13px] text-[var(--color-charcoal)] outline-none transition-colors placeholder:italic placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)]';
const quietBtnCls =
  'font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]';
const solidBtnCls =
  'rounded-[4px] bg-[var(--color-clay)] px-4 py-2 text-[12px] font-medium text-[var(--color-charcoal)] transition-opacity hover:opacity-90 disabled:opacity-40';

const fmtMoney = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

export interface AmendmentSeed {
  title?: string;
  description?: string;
  /** The R14 margin note this compose escalated from, when any. */
  noteId?: string | null;
}

export function AmendmentSheet({
  projectId,
  clientName,
  open,
  onClose,
  seed,
}: {
  projectId: string;
  clientName: string;
  open: boolean;
  onClose: () => void;
  seed?: AmendmentSeed | null;
}) {
  const { data: project } = useProjectV2(projectId) as { data: AnyRecord };
  const { data: amendments } = useScopeChangeRequests(projectId) as {
    data: AnyRecord[] | undefined;
  };

  const compose = useComposeAmendment();
  const sendAmendment = useSendAmendment();
  const applyAmendment = useApplyAmendment();

  // Which existing amendment is under review; null = composing.
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ffeDollars, setFfeDollars] = useState('');
  const [feeDollars, setFeeDollars] = useState('');
  const [weeks, setWeeks] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomBudget, setRoomBudget] = useState('');
  const [rooms, setRooms] = useState<Array<{ name: string; budgetCents: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  // R51 — the quiet inline confirmations.
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Fresh compose every open, seeded from the escalating note when any.
  useEffect(() => {
    if (open) {
      setReviewingId(null);
      setTitle(seed?.title ?? '');
      setDescription(seed?.description ?? '');
      setFfeDollars('');
      setFeeDollars('');
      setWeeks('');
      setRoomName('');
      setRoomBudget('');
      setRooms([]);
      setError(null);
      setConfirmation(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const family = familyLabel(clientName);
  const reviewing = reviewingId
    ? ((amendments ?? []).find((a) => a.id === reviewingId) ?? null)
    : null;

  const impacts = {
    additionalFfeCents: dollarsToCents(ffeDollars) ?? 0,
    additionalFeeCents: dollarsToCents(feeDollars) ?? 0,
    timelineWeeks: parseInt(weeks, 10) || 0,
  };
  const { currentCents, newTotalCents } = computeAmendmentTotals(project, impacts);

  const addRoom = () => {
    const name = roomName.trim();
    if (!name) return;
    setRooms((prev) => [...prev, { name, budgetCents: dollarsToCents(roomBudget) ?? 0 }]);
    setRoomName('');
    setRoomBudget('');
  };

  const submit = (send: boolean) => {
    setError(null);
    compose.mutate(
      {
        projectId,
        title: title.trim(),
        description: description.trim(),
        additionalFfeCents: impacts.additionalFfeCents,
        additionalFeeCents: impacts.additionalFeeCents,
        timelineWeeks: impacts.timelineWeeks,
        newTotalCents,
        newRooms: rooms,
        send,
        noteId: seed?.noteId ?? null,
      },
      {
        onSuccess: (scr) => {
          setConfirmation(
            send
              ? `Sent to ${family} — it settles here when they answer.`
              : 'Parked as a draft — send it when the words are right.',
          );
          setReviewingId(scr.id);
        },
        onError: (err) =>
          setError(
            err instanceof Error ? err.message : 'Could not compose the amendment. Try again.',
          ),
      },
    );
  };

  return (
    <DocSheet open={open} onClose={onClose} title="Amendment">
      <div className="mx-auto max-w-xl">
        <p className={labelCls}>
          {project?.name ?? 'Project'} &middot; current {fmtMoney(currentCents)}
        </p>
        <h2 className="mt-1 font-heading text-xl text-[var(--color-charcoal)]">
          {reviewing ? 'The amendment' : 'Amend the scope'}
        </h2>

        {/* ── REVIEW an existing amendment ──────────────────────────────── */}
        {reviewing ? (
          <div className="mt-4 space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[14px] font-medium text-[var(--color-charcoal)]">
                {reviewing.title}
              </p>
              <span className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
                {amendmentStatusWord(reviewing)}
              </span>
            </div>
            {reviewing.description && (
              <p className="text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
                {reviewing.description}
              </p>
            )}

            <dl className="space-y-1 border-t border-[var(--color-pearl)] pt-3 text-[12px]">
              <Row k="Impact" v={amendmentImpactLine(reviewing)} />
              {(reviewing.new_total_budget_cents ?? 0) > 0 && (
                <Row k="New total" v={fmtMoney(reviewing.new_total_budget_cents)} />
              )}
              {(reviewing.new_rooms ?? []).length > 0 && (
                <Row
                  k="New rooms"
                  v={(reviewing.new_rooms as AnyRecord[])
                    .map((r) => r.name)
                    .filter(Boolean)
                    .join(', ')}
                />
              )}
              {reviewing.sent_at && <Row k="Sent" v={fmtDay(reviewing.sent_at)} />}
              {reviewing.approved_at && (
                <Row
                  k="Approved"
                  v={`${reviewing.approved_by_name || family} · ${fmtDay(reviewing.approved_at)}`}
                />
              )}
              {reviewing.declined_at && (
                <Row
                  k="Declined"
                  v={`${fmtDay(reviewing.declined_at)}${reviewing.decline_reason ? ` — “${reviewing.decline_reason}”` : ''}`}
                />
              )}
              {reviewing.applied_at && <Row k="Applied" v={fmtDay(reviewing.applied_at)} />}
            </dl>

            {confirmation && (
              <p className="text-[12px] text-[rgba(168,181,160,0.9)]">{confirmation}</p>
            )}
            {error && (
              <div
                role="alert"
                className="rounded-[4px] border border-[rgba(196,124,92,0.4)] bg-[rgba(196,124,92,0.08)] p-3 text-[12.5px] text-[var(--color-clay)]"
              >
                {error} <span className="opacity-80">The act is safe to retry.</span>
              </div>
            )}

            <div className="flex items-center gap-4 border-t border-[var(--color-pearl)] pt-4">
              {reviewing.status === 'draft' && (
                <button
                  type="button"
                  disabled={sendAmendment.isPending}
                  onClick={() => {
                    setError(null);
                    setConfirmation(null);
                    sendAmendment.mutate(
                      { requestId: reviewing.id, projectId },
                      {
                        onSuccess: () =>
                          setConfirmation(`Sent to ${family} — it settles here when they answer.`),
                        onError: (err) =>
                          setError(err instanceof Error ? err.message : 'Could not send it.'),
                      },
                    );
                  }}
                  className={solidBtnCls}
                >
                  {sendAmendment.isPending ? 'Sending…' : `Send to ${family} →`}
                </button>
              )}
              {reviewing.status === 'approved' && !reviewing.applied_at && (
                <button
                  type="button"
                  disabled={applyAmendment.isPending}
                  onClick={() => {
                    setError(null);
                    setConfirmation(null);
                    applyAmendment.mutate(
                      { requestId: reviewing.id, projectId },
                      {
                        onSuccess: () =>
                          setConfirmation(
                            'Applied — budget, timeline, and any new rooms landed on the project.',
                          ),
                        onError: (err) =>
                          setError(err instanceof Error ? err.message : 'Could not apply it.'),
                      },
                    );
                  }}
                  className={solidBtnCls}
                >
                  {applyAmendment.isPending ? 'Applying…' : 'Apply to the project →'}
                </button>
              )}
              {(reviewing.status === 'sent' || reviewing.status === 'viewed') && (
                <span className="text-[12px] italic text-[var(--color-aged-oak)]">
                  With {family} — it settles here when they answer.
                </span>
              )}
              <button type="button" onClick={() => setReviewingId(null)} className={quietBtnCls}>
                ← Compose another
              </button>
              <button type="button" onClick={onClose} className={`${quietBtnCls} ml-auto`}>
                Done
              </button>
            </div>
          </div>
        ) : (
          /* ── COMPOSE a new amendment ──────────────────────────────────── */
          <div className="mt-1 space-y-5">
            <p className="text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
              A scope change with its fee and timeline impacts — {family} approve it in their
              portal, then one act applies it to the project.
            </p>

            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="amendment-title">
                What&rsquo;s changing
              </label>
              <input
                id="amendment-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Add the entryway to the project scope"
                className={fieldCls}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="amendment-description">
                Description (visible to {family})
              </label>
              <textarea
                id="amendment-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's being added or changed, and why…"
                className={`${fieldCls} resize-y`}
              />
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <div className="flex flex-col gap-1.5">
                <label className={labelCls} htmlFor="amendment-ffe">
                  Additional FF&amp;E budget
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--color-aged-oak)]">
                    $
                  </span>
                  <input
                    id="amendment-ffe"
                    inputMode="decimal"
                    value={ffeDollars}
                    onChange={(e) => setFfeDollars(e.target.value)}
                    placeholder="0"
                    className={`${fieldCls} pl-7`}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls} htmlFor="amendment-fee">
                  Additional design fee
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--color-aged-oak)]">
                    $
                  </span>
                  <input
                    id="amendment-fee"
                    inputMode="decimal"
                    value={feeDollars}
                    onChange={(e) => setFeeDollars(e.target.value)}
                    placeholder="0"
                    className={`${fieldCls} pl-7`}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls} htmlFor="amendment-weeks">
                  Timeline impact (weeks)
                </label>
                <input
                  id="amendment-weeks"
                  inputMode="numeric"
                  value={weeks}
                  onChange={(e) => setWeeks(e.target.value.replace(/[^0-9-]/g, ''))}
                  placeholder="+0"
                  className={fieldCls}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={labelCls}>New project total</span>
                <p className="px-3 py-2 font-mono text-[13px] text-[var(--color-charcoal)]">
                  {fmtMoney(newTotalCents)}
                  <span className="ml-2 text-[10px] text-[var(--color-aged-oak)]">
                    was {fmtMoney(currentCents)}
                  </span>
                </p>
              </div>
            </div>

            {/* New rooms — the ported simple list (optional). */}
            <div className="flex flex-col gap-1.5">
              <span className={labelCls}>New rooms (optional)</span>
              {rooms.map((room, i) => (
                <div
                  key={`${room.name}-${i}`}
                  className="flex items-center gap-2 rounded-[4px] border border-[var(--color-pearl)] px-3 py-1.5"
                >
                  <span className="flex-1 text-[12.5px] text-[var(--color-charcoal)]">
                    {room.name}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--color-aged-oak)]">
                    {fmtMoney(room.budgetCents)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${room.name}`}
                    onClick={() => setRooms((prev) => prev.filter((_, idx) => idx !== i))}
                    className={quietBtnCls}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addRoom();
                    }
                  }}
                  placeholder="Room name"
                  aria-label="New room name"
                  className={`${fieldCls} flex-1`}
                />
                <div className="relative w-32">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--color-aged-oak)]">
                    $
                  </span>
                  <input
                    inputMode="decimal"
                    value={roomBudget}
                    onChange={(e) => setRoomBudget(e.target.value)}
                    placeholder="Budget"
                    aria-label="New room budget (dollars)"
                    className={`${fieldCls} pl-7`}
                  />
                </div>
                <button
                  type="button"
                  onClick={addRoom}
                  disabled={!roomName.trim()}
                  className="rounded-[4px] border border-[var(--color-pearl)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)] hover:border-[var(--color-clay)] disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-[4px] border border-[rgba(196,124,92,0.4)] bg-[rgba(196,124,92,0.08)] p-3 text-[12.5px] text-[var(--color-clay)]"
              >
                {error} <span className="opacity-80">The act is safe to retry.</span>
              </div>
            )}

            <div className="flex items-center gap-4 border-t border-[var(--color-pearl)] pt-5">
              <button
                type="button"
                disabled={!title.trim() || !description.trim() || compose.isPending}
                onClick={() => submit(true)}
                className={solidBtnCls}
              >
                {compose.isPending ? 'Composing…' : `Send to ${family} →`}
              </button>
              <button
                type="button"
                disabled={!title.trim() || compose.isPending}
                onClick={() => submit(false)}
                className={`${quietBtnCls} disabled:opacity-40`}
              >
                Save as draft
              </button>
              <button type="button" onClick={onClose} className={`${quietBtnCls} ml-auto`}>
                Not now
              </button>
            </div>

            {/* The quiet ledger strip — every amendment on this project, so an
                approved one has its apply door here (no list page, R81). */}
            {(amendments ?? []).length > 0 && (
              <div className="border-t border-[var(--color-pearl)] pt-4">
                <p className={`${labelCls} mb-2`}>On this project</p>
                <ul className="space-y-1">
                  {(amendments ?? []).map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmation(null);
                          setError(null);
                          setReviewingId(a.id);
                        }}
                        className="grid w-full grid-cols-[1fr_auto_auto] items-baseline gap-3 rounded-[3px] px-1.5 py-1 text-left transition-colors hover:bg-[rgba(196,165,123,0.06)]"
                      >
                        <span className="truncate text-[12px] text-[var(--color-charcoal)]">
                          {a.title}
                        </span>
                        <span className="whitespace-nowrap font-mono text-[9px] text-[var(--color-aged-oak)]">
                          {amendmentImpactLine(a)}
                        </span>
                        <span
                          className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.05em]"
                          style={{
                            color:
                              a.status === 'approved' && !a.applied_at
                                ? 'var(--color-clay)'
                                : 'var(--color-aged-oak)',
                          }}
                        >
                          {amendmentStatusWord(a)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </DocSheet>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
        {k}
      </dt>
      <dd className="text-right text-[12px] text-[var(--color-charcoal)]">{v}</dd>
    </div>
  );
}
