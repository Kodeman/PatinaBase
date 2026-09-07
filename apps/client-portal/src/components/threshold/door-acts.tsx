'use client';

import { useId, useRef, useState } from 'react';
import type { MouseEvent, RefObject } from 'react';
import type { CommercialDocumentKind } from '@patina/types';
import {
  useDeclineProposal,
  useRequestProposalChange,
  useSendMessage,
  useStartDirectThread,
  useStartProjectThread,
} from '@patina/supabase';

import { ScoredAction } from '@/components/threshold/instruments/scored-action';
import { useDeclineCommercialDocument } from '@/hooks/use-commercial-client';
import { hasPassed } from '@/lib/threshold/expiry';
import { refusalSentence } from '@/lib/threshold/refusal';

import { InstrumentReading } from './instrument-reading';

/* ── THE OTHER FOUR THINGS A CLIENT DOES AT A DOOR ───────────────────────────
   Signing is one answer to a paper and the shipped door already takes it. The
   old `/proposals/[id]` page took the other four — read the whole of it, ask a
   question, request a change, decline — and it took them in modal dialogs at
   the end of a route. They come back here as unfolds on the leaf itself: the
   same hooks, the same wording of the ask (the dialogs' titles, descriptions,
   field labels, placeholders and confirm labels are carried over word for
   word), with the route and the modal chrome left behind.

   DECLINE BRANCHES THE WAY THE OLD PAGE BRANCHED. A legacy row went through
   `useDeclineProposal` (decline_proposal directly); everything else went
   through `useDeclineCommercialDocument` (POST /api/proposals/[id]/decline,
   which resolves the kind fail-closed first). Both are kept, chosen by the
   resolved kind — and an UNRESOLVED kind is not a legacy row. A null `kind`
   means the door has not learned what this paper is yet, so Decline is
   withheld rather than sent down the rail that skips the fail-closed route.

   AN ACT THAT CANNOT COMPLETE IS NOT OFFERED — AND THE ORIGIN AGREEMENT CAN
   COMPLETE IT. The rule stands; what changed is the reading of it. This used
   to withhold "Ask a question" whenever the paper carried no project, and
   R30's origin door is exactly that paper: an agreement is bound to no project
   until the studio countersigns, so a household's VERY FIRST paper was the one
   door in the house that could not ask its studio a question. It could always
   have asked — there is simply no project thread to ask in, because there is
   no project yet.

   So the question goes to the studio ON THE AGREEMENT instead:
   `rpc_start_direct_thread` opens (or finds) the direct thread between the
   homeowner and that agreement's own designer, which the roster row or the
   live lead behind every sent agreement already authorizes. The letter is the
   same letter, named after the same paper; only the thread it lands in
   differs. With neither a project nor a designer to address, the act is still
   withheld — the rule is intact, its scope was simply wrong.

   Past `valid_until`, the old page held every act back (`isActionable`,
   page.tsx:124-133) even before the expiry job ran, and neither
   `decline_proposal` nor `request_proposal_change` checks the date itself; the
   same gate is kept here.

   ASKING IS A LETTER, NOT A ROUTE. `ProposalClarifyButton` started the
   project thread and then navigated to `/messages?thread=…`. The thread is
   still started the same way — the question is simply posted into it from
   here, because a page that opens in place may not send the client away to
   finish a sentence she has already typed. The letter names the paper it is
   about: standing in the thread, the old flow supplied that context by where
   the client was; a letter has to carry it. ────────────────────────────── */

/** "5 August" — the deck's own date idiom, as the door itself dates things. */
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

const REASON_MAX = 1000;
const FEEDBACK_MAX = 1000;
const QUESTION_MAX = 1000;

type ActKey = 'read' | 'question' | 'change' | 'decline';

export interface DoorActsProps {
  proposalId: string;
  /** Null on a paper minted from the schedule, and on an ORIGIN agreement,
   *  which is bound to no project until the studio countersigns it. */
  projectId: string | null;
  /**
   * R30 — the designer whose studio sent this paper, for a paper that has no
   * project to hold a thread. The ask then goes to the direct thread between
   * the two of them. Null where the door does not know one, and the ask is
   * withheld only when BOTH this and `projectId` are null.
   */
  studioProfileId?: string | null;
  /** The paper's own title, carried into the question so the studio knows
   *  which door it was asked at. */
  title: string;
  /**
   * The resolved kind, as the door resolves it. Decides the decline rail.
   * Null while the door has not resolved one — never read as legacy.
   */
  kind: CommercialDocumentKind | null;
  /** `proposals.valid_until`, when the paper carries one. */
  validUntil?: string | null;
  onDeclined?: () => void;
}

export function DoorActs({
  proposalId,
  projectId,
  studioProfileId = null,
  title,
  kind,
  validUntil,
  onDeclined,
}: DoorActsProps) {
  const panelId = `door-acts-${useId().replace(/:/g, '')}`;

  const startThread = useStartProjectThread();
  const startDirectThread = useStartDirectThread();
  const sendMessage = useSendMessage();
  const requestChange = useRequestProposalChange();
  const declineLegacy = useDeclineProposal();
  const declineDocument = useDeclineCommercialDocument(proposalId, projectId);

  const [open, setOpen] = useState<ActKey | null>(null);
  const [question, setQuestion] = useState('');
  const [feedback, setFeedback] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [declinedAt, setDeclinedAt] = useState<Date | null>(null);

  // Where focus goes when a panel closes: the act that opened it. Without it a
  // "Never mind" or a successful send unmounts the focused control and drops
  // the keyboard on <body>.
  const openerRef = useRef<HTMLElement | null>(null);
  // A successful decline takes the Decline act out of `acts`, so restoring to
  // the opener focuses a detached node and the keyboard lands on <body>. The
  // acts row itself survives the act, so the decline path restores there.
  const rowRef = useRef<HTMLDivElement | null>(null);
  // State is render-time, so two clicks in one tick both read `isPending`
  // false. A latch per act closes that, as the gate's own does.
  const askLatch = useRef(false);
  const changeLatch = useRef(false);
  const declineLatch = useRef(false);

  const isLegacy = kind === 'legacy';
  const expired = hasPassed(validUntil);
  const asking =
    startThread.isPending || startDirectThread.isPending || sendMessage.isPending;
  /** A project thread, or the studio's own — either is a thread to ask in. */
  const canAsk = projectId !== null || studioProfileId !== null;
  const declining = declineLegacy.isPending || declineDocument.isPending;

  function toggle(key: ActKey, event: MouseEvent<HTMLButtonElement>) {
    openerRef.current = event.currentTarget;
    setError(null);
    // A receipt belongs to the act that earned it; it may not stand over the
    // next panel the client opens.
    setReceipt(null);
    setOpen((current) => (current === key ? null : key));
  }

  async function onAsk() {
    if (askLatch.current) return;
    setError(null);
    const trimmed = question.trim();
    if (!trimmed) {
      setError('Add a question so your studio knows what to answer.');
      return;
    }
    if (!projectId && !studioProfileId) {
      setError('This paper is not filed under a project, so there is no thread to ask in.');
      return;
    }
    askLatch.current = true;
    try {
      // The project's thread where there is a project; the studio's own where
      // the paper comes before the house. Both return a thread id and the
      // letter below is identical either way — it names the paper it is about,
      // so the studio reads it in context whichever thread it lands in.
      const threadId = projectId
        ? await startThread.mutateAsync(projectId)
        : await startDirectThread.mutateAsync(studioProfileId as string);
      const named = title.trim();
      await sendMessage.mutateAsync({
        threadId,
        body: named ? `About ${named}\n\n${trimmed}` : trimmed,
      });
      setQuestion('');
      setOpen(null);
      setReceipt('Your question was sent');
    } catch (err) {
      setError(refusalSentence(err, 'Unable to send your question right now.'));
    } finally {
      askLatch.current = false;
    }
  }

  async function onRequestChange() {
    if (changeLatch.current) return;
    setError(null);
    const trimmed = feedback.trim();
    if (!trimmed) {
      setError('Add a note so your designer knows what to change.');
      return;
    }
    changeLatch.current = true;
    try {
      await requestChange.mutateAsync({ proposalId, feedback: trimmed });
      setFeedback('');
      setOpen(null);
      setReceipt('Your note was sent');
    } catch (err) {
      setError(refusalSentence(err, 'Unable to send your note right now.'));
    } finally {
      changeLatch.current = false;
    }
  }

  async function onDecline() {
    if (declineLatch.current) return;
    setError(null);
    const trimmed = reason.trim() || undefined;
    declineLatch.current = true;
    try {
      if (isLegacy) {
        await declineLegacy.mutateAsync({ proposalId, reason: trimmed });
      } else {
        await declineDocument.mutateAsync(trimmed);
      }
      setReason('');
      setOpen(null);
      setReceipt(null);
      setDeclinedAt(new Date());
      onDeclined?.();
    } catch (err) {
      setError(refusalSentence(err, 'Unable to decline this paper right now.'));
    } finally {
      declineLatch.current = false;
    }
  }

  // A paper still asking takes every answer. One already declined takes none,
  // and one past its date takes none either — the reading stays, because
  // reading a paper is not acting on it.
  const answerable = !declinedAt && !expired;
  const acts: { key: ActKey; label: string }[] = [
    ...(kind && !isLegacy ? [{ key: 'read' as const, label: 'Read it in full' }] : []),
    ...(answerable && canAsk
      ? [{ key: 'question' as const, label: 'Ask a question' }]
      : []),
    ...(answerable ? [{ key: 'change' as const, label: 'Request a change' }] : []),
    ...(answerable && kind ? [{ key: 'decline' as const, label: 'Decline' }] : []),
  ];

  if (acts.length === 0 && !declinedAt && !receipt) return null;

  // `-panel-` and not `-${key}`: the ask's field id is `${panelId}-question`,
  // and a region sharing an id with the textarea inside it steals the label.
  const panelIdFor = (key: ActKey) => `${panelId}-panel-${key}`;

  return (
    <>
      <div
        data-testid="door-acts"
        data-acts-dock=""
        /* `W2-06`. The door's primary act docks to the bottom edge on a narrow
           viewport (door-gate.tsx). These four answers are the last thing on
           the leaf, and clearing the dock's height was not enough: measured at
           390x844 with Sign docked at y=751, all four sat at y=840 and y=896 —
           below the fold, reachable only by scrolling past the act they are
           alternatives to.

           So they dock too, as a compact row riding directly above the
           primary. 61px is that dock's own height (44px act + 2x8px of padding
           + its 1px rule); this row sits on top of it and the paper scrolls
           under both. It has to be THIS box that sticks and it has to hold
           nothing but the row: a sticky box is constrained by its parent, so a
           wrapper no taller than the row would pin nothing — and the unfolded
           panels, were they children, would be pinned to the bottom edge with
           it. They are siblings below. */
        className="mt-6 border-t border-[var(--border-subtle)] pt-3 max-[600px]:sticky max-[600px]:bottom-[61px] max-[600px]:z-20 max-[600px]:-mx-5 max-[600px]:mt-4 max-[600px]:border-[var(--border-default)] max-[600px]:bg-[var(--bg-surface)] max-[600px]:px-5 max-[600px]:pb-2"
      >
        <div ref={rowRef} tabIndex={-1} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* Reading outranks declining. All four sat at `tertiary`, which
              made "Read it in full" — the act that ends with her knowing more
              — weigh exactly what "Decline" weighs. The other three are
              answers to the paper and stay peers at the lighter weight; the
              reading takes the secondary. */}
          {acts.map((act) => (
            <ScoredAction
              key={act.key}
              actionKey={`door_${act.key}`}
              regionKey="door"
              variant={act.key === 'read' ? 'secondary' : 'tertiary'}
              aria-expanded={open === act.key}
              aria-controls={open === act.key ? panelIdFor(act.key) : undefined}
              onClick={(event) => toggle(act.key, event)}
            >
              {act.label}
            </ScoredAction>
          ))}
        </div>
      </div>

      {declinedAt && (
        <p
          data-testid="door-declined"
          role="status"
          className="mt-3 font-mono text-[11px] leading-relaxed tracking-[0.04em] text-[var(--text-body)]"
        >
          {`Declined ${DAY_MONTH.format(declinedAt)}.`}
        </p>
      )}

      {receipt && !declinedAt && (
        <p
          data-testid="door-acts-receipt"
          role="status"
          className="mt-3 font-mono text-[11px] leading-relaxed tracking-[0.04em] text-[var(--text-body)]"
        >
          {receipt}
        </p>
      )}

      <div id={open ? panelIdFor(open) : undefined}>
        {open === 'read' && <InstrumentReading proposalId={proposalId} />}

        {open === 'question' && (
          <Panel
            title="Ask a question"
            description="Your question goes to your studio as a letter. It won’t decline the paper — it stays open while they answer."
            fieldLabel="Your question"
            fieldId={`${panelId}-question`}
            testId="door-ask-question"
            placeholder="What would you like to know?"
            max={QUESTION_MAX}
            value={question}
            onChange={setQuestion}
            error={error}
            confirmKey="door_ask_send"
            confirmLabel="Send"
            confirmLoadingLabel="Sending"
            pending={asking}
            restoreFocusRef={openerRef}
            onConfirm={onAsk}
            onDismiss={() => setOpen(null)}
          />
        )}

        {open === 'change' && (
          <Panel
            title="Request a change"
            description="Tell your designer what you’d like adjusted. This won’t decline the proposal — it stays open while they take a look."
            fieldLabel="Your note"
            fieldId={`${panelId}-feedback`}
            testId="door-request-change"
            placeholder="What would you like to change?"
            max={FEEDBACK_MAX}
            value={feedback}
            onChange={setFeedback}
            error={error}
            confirmKey="door_change_send"
            confirmLabel="Send note"
            confirmLoadingLabel="Sending"
            pending={requestChange.isPending}
            restoreFocusRef={openerRef}
            onConfirm={onRequestChange}
            onDismiss={() => setOpen(null)}
          />
        )}

        {open === 'decline' && (
          <Panel
            title={isLegacy ? 'Decline this proposal?' : 'Decline this document?'}
            description={
              isLegacy
                ? 'Your designer will be notified. You can share a reason to help them respond — this is optional.'
                : 'Your studio will be notified. You can share a reason to help them respond — this is optional.'
            }
            fieldLabel="Reason (optional)"
            fieldId={`${panelId}-reason`}
            testId="door-decline"
            placeholder="What’s holding you back?"
            max={REASON_MAX}
            value={reason}
            onChange={setReason}
            error={error}
            confirmKey="door_decline_confirm"
            confirmLabel={isLegacy ? 'Decline proposal' : 'Decline document'}
            confirmLoadingLabel="Declining"
            confirmVariant="danger"
            pending={declining}
            restoreFocusRef={openerRef}
            confirmRestoreFocusRef={rowRef}
            onConfirm={onDecline}
            onDismiss={() => setOpen(null)}
          />
        )}
      </div>
    </>
  );
}

interface PanelProps {
  title: string;
  description: string;
  fieldLabel: string;
  fieldId: string;
  testId: string;
  placeholder: string;
  max: number;
  value: string;
  onChange: (next: string) => void;
  error: string | null;
  confirmKey: string;
  confirmLabel: string;
  confirmLoadingLabel: string;
  confirmVariant?: 'secondary' | 'danger';
  pending: boolean;
  restoreFocusRef: RefObject<HTMLElement | null>;
  /** Where the CONFIRM act returns focus, when its opener may not survive it. */
  confirmRestoreFocusRef?: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onDismiss: () => void;
}

function Panel({
  title,
  description,
  fieldLabel,
  fieldId,
  testId,
  placeholder,
  max,
  value,
  onChange,
  error,
  confirmKey,
  confirmLabel,
  confirmLoadingLabel,
  confirmVariant = 'secondary',
  pending,
  restoreFocusRef,
  confirmRestoreFocusRef,
  onConfirm,
  onDismiss,
}: PanelProps) {
  return (
    <div data-testid={`${testId}-panel`} className="mt-4 max-w-[56ch]">
      {/* A heading, not a paragraph: the old dialog's title was one, and it is
          how a screen reader finds the panel the act just opened. */}
      <h3 className="font-heading text-[1.05rem] font-normal text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="mt-1 text-[15px] leading-relaxed text-[var(--text-body)]">{description}</p>

      <label
        className="mt-4 block font-mono text-[11px] uppercase tracking-[0.13em] text-[var(--text-muted)]"
        htmlFor={fieldId}
      >
        {fieldLabel}
      </label>
      <textarea
        id={fieldId}
        data-testid={testId}
        value={value}
        rows={4}
        maxLength={max}
        placeholder={placeholder}
        disabled={pending}
        onChange={(event) => onChange(event.target.value.slice(0, max))}
        className="mt-1.5 w-full resize-none border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[15px] leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
      />
      <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
        {value.length} / {max}
      </p>

      {error && (
        <p role="alert" className="mt-2 border-t border-[var(--border-subtle)] pt-2 text-[15px] leading-normal text-[var(--text-body)]">
          {error}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <ScoredAction
          actionKey={confirmKey}
          regionKey="door"
          variant={confirmVariant}
          loading={pending}
          loadingLabel={confirmLoadingLabel}
          restoreFocusRef={confirmRestoreFocusRef ?? restoreFocusRef}
          onClick={onConfirm}
        >
          {confirmLabel}
        </ScoredAction>
        <ScoredAction
          actionKey={`${confirmKey}_dismiss`}
          regionKey="door"
          variant="tertiary"
          disabled={pending}
          restoreFocusRef={restoreFocusRef}
          onClick={onDismiss}
        >
          Never mind
        </ScoredAction>
      </div>
    </div>
  );
}
