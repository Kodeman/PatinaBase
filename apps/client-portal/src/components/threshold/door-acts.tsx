'use client';

import { useId, useState } from 'react';
import type { CommercialDocumentKind } from '@patina/types';
import {
  useDeclineProposal,
  useRequestProposalChange,
  useSendMessage,
  useStartProjectThread,
} from '@patina/supabase';

import { ScoredAction } from '@/components/making/scored-action';
import { useDeclineCommercialDocument } from '@/hooks/use-commercial-client';

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
   resolved kind, so a door over a legacy paper declines exactly as it did.

   ASKING IS A LETTER, NOT A ROUTE. `ProposalClarifyButton` started the
   project thread and then navigated to `/messages?thread=…`. The thread is
   still started the same way — the question is simply posted into it from
   here, because a page that opens in place may not send the client away to
   finish a sentence she has already typed. ─────────────────────────────── */

/** "5 August" — the deck's own date idiom, as the door itself dates things. */
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

const REASON_MAX = 1000;
const FEEDBACK_MAX = 1000;
const QUESTION_MAX = 1000;

type ActKey = 'read' | 'question' | 'change' | 'decline';

export interface DoorActsProps {
  proposalId: string;
  /** Null on a paper minted from the schedule; the ask then has no thread. */
  projectId: string | null;
  /** The resolved kind, as the door resolves it. Decides the decline rail. */
  kind: CommercialDocumentKind;
  onDeclined?: () => void;
}

export function DoorActs({ proposalId, projectId, kind, onDeclined }: DoorActsProps) {
  const panelId = `door-acts-${useId().replace(/:/g, '')}`;

  const startThread = useStartProjectThread();
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

  const isLegacy = kind === 'legacy';
  const asking = startThread.isPending || sendMessage.isPending;
  const declining = declineLegacy.isPending || declineDocument.isPending;

  function toggle(key: ActKey) {
    setError(null);
    setOpen((current) => (current === key ? null : key));
  }

  async function onAsk() {
    setError(null);
    const trimmed = question.trim();
    if (!trimmed) {
      setError('Add a question so your studio knows what to answer.');
      return;
    }
    if (!projectId) {
      setError('This paper is not filed under a project, so there is no thread to ask in.');
      return;
    }
    try {
      const threadId = await startThread.mutateAsync(projectId);
      await sendMessage.mutateAsync({ threadId, body: trimmed });
      setQuestion('');
      setOpen(null);
      setReceipt('Your question was sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send your question');
    }
  }

  async function onRequestChange() {
    setError(null);
    const trimmed = feedback.trim();
    if (!trimmed) {
      setError('Add a note so your designer knows what to change.');
      return;
    }
    try {
      await requestChange.mutateAsync({ proposalId, feedback: trimmed });
      setFeedback('');
      setOpen(null);
      setReceipt('Your note was sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send your note');
    }
  }

  async function onDecline() {
    setError(null);
    const trimmed = reason.trim() || undefined;
    try {
      if (isLegacy) {
        await declineLegacy.mutateAsync({ proposalId, reason: trimmed });
      } else {
        await declineDocument.mutateAsync(trimmed);
      }
      setReason('');
      setOpen(null);
      setDeclinedAt(new Date());
      onDeclined?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isLegacy
            ? 'Failed to decline proposal'
            : 'Failed to decline this document.',
      );
    }
  }

  const acts: { key: ActKey; label: string }[] = [
    ...(isLegacy ? [] : [{ key: 'read' as const, label: 'Read it in full' }]),
    ...(declinedAt
      ? []
      : [
          { key: 'question' as const, label: 'Ask a question' },
          { key: 'change' as const, label: 'Request a change' },
          { key: 'decline' as const, label: 'Decline' },
        ]),
  ];

  return (
    <div
      data-testid="door-acts"
      className="mt-6 border-t border-[var(--border-subtle)] pt-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        {acts.map((act) => (
          <ScoredAction
            key={act.key}
            actionKey={`door_${act.key}`}
            regionKey="door"
            variant="tertiary"
            aria-expanded={open === act.key}
            aria-controls={panelId}
            onClick={() => toggle(act.key)}
          >
            {act.label}
          </ScoredAction>
        ))}
      </div>

      {declinedAt && (
        <p
          data-testid="door-declined"
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

      <div id={panelId}>
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
            pending={declining}
            onConfirm={onDecline}
            onDismiss={() => setOpen(null)}
          />
        )}
      </div>
    </div>
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
  pending: boolean;
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
  pending,
  onConfirm,
  onDismiss,
}: PanelProps) {
  return (
    <div data-testid={`${testId}-panel`} className="mt-4 max-w-[56ch]">
      <p className="font-heading text-[1.05rem] text-[var(--text-primary)]">{title}</p>
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
        <p role="alert" className="mt-2 text-[15px] leading-normal text-[var(--color-error)]">
          {error}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <ScoredAction
          actionKey={confirmKey}
          regionKey="door"
          variant="secondary"
          loading={pending}
          loadingLabel={confirmLoadingLabel}
          onClick={onConfirm}
        >
          {confirmLabel}
        </ScoredAction>
        <ScoredAction
          actionKey={`${confirmKey}_dismiss`}
          regionKey="door"
          variant="tertiary"
          disabled={pending}
          onClick={onDismiss}
        >
          Never mind
        </ScoredAction>
      </div>
    </div>
  );
}
