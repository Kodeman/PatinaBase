'use client';

/**
 * US-31 B5a — one staged outbound message, reviewed in the ready-to-send
 * sheet. Lifted from the procurement DraftReview: the kind, the To line (or
 * "no address on file"), an editable subject (email only) and body, Send and
 * Discard. A message claimed by a send reads "Sending since …"; once that send
 * is unconfirmed it stays held; confirmed delivery can finish recording.
 *
 * Nothing leaves without a Send press. The send itself is the sheet's: it
 * saves any edit, reads the job's lead again and calls outbound-draft-send.
 * A seat that may not send (Q11) edits and saves for the lead; its Send is held.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { useDiscardOutboundDraft, useOutboundDrafts, useUpdateOutboundDraft } from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { DocumentAction } from '../document-action';
import { SavingWord } from '../work-block';
import { LABEL_CLS } from '../line-unfold/cell';

export type OutboundDraftRow = NonNullable<ReturnType<typeof useOutboundDrafts>['data']>[number];

/** The text a review holds before it is saved. */
export interface OutboundDraftText {
  subject: string;
  body: string;
}

/** One send's answer for one message. */
export interface OutboundSendResult {
  id: string;
  ok: boolean;
  error?: string;
}

export const OUTBOUND_KIND_LABEL: Record<string, string> = {
  invoice_reminder: 'Invoice reminder',
  invoice_overdue: 'Overdue invoice note',
  decision_reminder: 'Decision reminder',
  decision_overdue: 'Overdue decision note',
  client_digest: 'Project update to the client',
  review_request: 'Review request',
  trade_site_digest: 'Site summary for the trade',
  trade_day_of: 'Day-of text to the trade',
  delivery_confirm: 'Delivery confirmation',
  site_request_due: 'Site request reminder',
  homeowner_window_pick: 'Delivery window request',
  hours_prompt: 'Hours reminder',
  service_acceptance_request: 'Service acceptance request',
};

export function outboundKindLabel(kind: string): string {
  return OUTBOUND_KIND_LABEL[kind] ?? 'Message';
}

function sendingSince(iso: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return at.toDateString() === new Date().toDateString()
    ? time
    : `${at.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

const INPUT_CLS =
  'w-full rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-1.5 text-[13px] text-[var(--color-charcoal)] outline-none focus-visible:border-[var(--color-clay)] disabled:opacity-60';

export function OutboundDraftReview({
  draft,
  initialText,
  canSend,
  sendHoldReason,
  ready,
  leadName,
  sending,
  result,
  onEdit,
  onSend,
}: {
  draft: OutboundDraftRow;
  /** Retained editor words, never the stored comparison baseline. */
  initialText?: OutboundDraftText;
  /** Q11 — this seat sends; false holds Send for the lead. */
  canSend: boolean;
  /** A recipient, subject or outcome hold is separate from seat authority. */
  sendHoldReason?: string | null;
  /** False until who leads the job is read. */
  ready: boolean;
  /** The lead as the copy names her ("the lead" when unnamed). */
  leadName: string;
  /** A send that covers this message is under way. */
  sending: boolean;
  /** This message's answer from the last send, if any. */
  result?: OutboundSendResult;
  /** Reports the unsaved text (null once it matches the stored draft). */
  onEdit: (id: string, text: OutboundDraftText | null) => void;
  /** Sends this one message, saving any edit first. */
  onSend: (ids: string[]) => Promise<void>;
}) {
  // US-34 N3 — `optimistic-ink` on: a saved edit becomes the stored text at
  // once (the TEXT only; sending and discarding stay pending-only, §5.2) and
  // a refusal puts the old text back, keeping the typed words; off: today's.
  const ink = useFeatureFlag('optimistic-ink').value === true;
  const update = useUpdateOutboundDraft({ optimistic: ink });
  const discard = useDiscardOutboundDraft();
  const storedSubject = draft.subject ?? '';
  const [subject, setSubject] = useState(initialText?.subject ?? storedSubject);
  const [body, setBody] = useState(initialText?.body ?? draft.body);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [discarded, setDiscarded] = useState(false);

  const email = draft.channel === 'email';
  const status = discarded ? 'discarded' : result?.ok ? 'sent' : draft.status;
  const editable = status === 'awaiting_review';
  const finishDelivery = status === 'sending' && !!draft.delivered_at;
  const pending = sending || update.isPending || discard.isPending;
  const recipient = draft.to_address?.trim() || null;
  const edited = subject !== storedSubject || body !== draft.body;
  const blank = !body.trim() || (email && !subject.trim());
  const label = outboundKindLabel(draft.kind);
  const fieldId = `outbound-${draft.id}`;
  const lead = leadName.charAt(0).toUpperCase() + leadName.slice(1);
  const focusedWithin = useRef(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    // A claim refetch removes the focused Send; keep focus with the held words.
    if (status === 'sending' && focusedWithin.current) statusRef.current?.focus();
  }, [status]);

  const report = (nextSubject: string, nextBody: string) => {
    setSaved(false);
    onEdit(
      draft.id,
      nextSubject === storedSubject && nextBody === draft.body
        ? null
        : { subject: nextSubject, body: nextBody },
    );
  };

  const send = async () => {
    setError(null);
    try {
      await onSend([draft.id]);
    } catch (e) {
      setError((e as Error).message || 'The message was not sent.');
    }
  };

  const saveForLead = () => {
    setError(null);
    update
      .mutateAsync({ id: draft.id, subject: email ? subject.trim() : storedSubject, body })
      .then(() => {
        onEdit(draft.id, null);
        setSaved(true);
      })
      .catch((e: Error) =>
        setError(
          ink
            ? 'Couldn’t save the draft. Your words are kept here.'
            : e.message || 'The draft was not saved.',
        ),
      );
  };

  const discardDraft = () => {
    setError(null);
    discard
      .mutateAsync(draft.id)
      .then(() => {
        onEdit(draft.id, null);
        setDiscarded(true);
      })
      .catch((e: Error) => setError(e.message || 'The draft was not discarded.'));
  };

  return (
    <section
      aria-label={`${label}, ready to send`}
      onFocusCapture={() => { focusedWithin.current = true; }}
      onBlurCapture={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) {
          focusedWithin.current = false;
        }
      }}
      data-testid="outbound-draft-review"
      className="flex flex-col gap-1.5 pt-2"
    >
      <p className={LABEL_CLS}>{label}</p>
      <p className="text-[12px] text-[var(--color-charcoal)]" data-testid="outbound-recipient">
        To{' '}
        {recipient ?? <span className="text-[var(--color-terracotta-ink)]">no address on file</span>}
      </p>
      {(editable || status === 'sending') && (
        <>
          {email && (
            <>
              <label htmlFor={`${fieldId}-subject`} className="sr-only">
                Subject
              </label>
              <input
                id={`${fieldId}-subject`}
                value={subject}
                maxLength={300}
                readOnly={!editable}
                disabled={editable && pending}
                onChange={(e) => {
                  setSubject(e.target.value);
                  report(e.target.value, body);
                }}
                className={INPUT_CLS}
              />
            </>
          )}
          <label htmlFor={`${fieldId}-body`} className="sr-only">
            {email ? 'Correspondence' : 'Message'}
          </label>
          <textarea
            id={`${fieldId}-body`}
            value={body}
            rows={email ? 8 : 3}
            maxLength={20000}
            readOnly={!editable}
            disabled={editable && pending}
            onChange={(e) => {
              setBody(e.target.value);
              report(subject, e.target.value);
            }}
            className={`${INPUT_CLS} resize-y font-heading leading-snug`}
          />
          {editable && (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3">
                {/* No address, a blank draft or a seat that is not the lead's holds
                    the Send (never native disabled), so its reason stays reachable. */}
                <DocumentAction
                  actionKey="send-outbound-draft"
                  surfaceKey="desk"
                  regionKey="ready-to-send"
                  variant="primary"
                  held={pending || !!sendHoldReason || !recipient || !canSend}
                  aria-describedby={
                    sendHoldReason || !canSend || !recipient
                      ? `${fieldId}-send-hold-reason`
                      : undefined
                  }
                  disabled={pending || !ready || !canSend || !!sendHoldReason || !recipient || blank}
                  loading={sending || (!ink && update.isPending)}
                  loadingLabel="Sending"
                  onClick={send}
                >
                  Send
                </DocumentAction>
                {ready && !canSend && edited && (
                  <DocumentAction
                    actionKey="save-outbound-draft-for-lead"
                    surfaceKey="desk"
                    regionKey="ready-to-send"
                    variant="secondary"
                    disabled={pending || blank}
                    loading={update.isPending}
                    loadingLabel="Saving"
                    onClick={saveForLead}
                  >
                    {`Save the draft for ${leadName}`}
                  </DocumentAction>
                )}
                {ink && (
                  <span aria-busy={update.isPending || undefined} className="font-mono text-[11px] text-[var(--text-muted)]">
                    <SavingWord active={update.isPending} />
                  </span>
                )}
                <DocumentAction
                  actionKey="discard-outbound-draft"
                  surfaceKey="desk"
                  regionKey="ready-to-send"
                  variant="tertiary"
                  disabled={pending}
                  onClick={discardDraft}
                >
                  Discard draft
                </DocumentAction>
              </div>
              {(sendHoldReason || !ready || !canSend || !recipient) && (
                <p id={`${fieldId}-send-hold-reason`} className="text-[11px] text-[var(--text-muted)]">
                  {sendHoldReason ? sendHoldReason : !ready
                    ? 'Loading who leads this project…'
                    : !recipient && !canSend
                      ? `No address on file. ${lead} sees this first.`
                      : !recipient
                        ? 'No address on file.'
                        : `${lead} sees this first.`}
                </p>
              )}
              {saved && (
                <p role="status" className="text-[11px] text-[var(--text-muted)]">
                  {`Saved for ${leadName}.`}
                </p>
              )}
            </>
          )}
        </>
      )}
      {!editable && (
        <>
          <p ref={statusRef} tabIndex={-1} role="status" className="text-[12px] text-[var(--text-muted)]">
            {status === 'sent'
              ? `Sent${recipient ? ` to ${recipient}` : ''}.`
              : finishDelivery
                ? 'Delivered. Finish recording delivery; this will not send another message.'
                : status === 'sending'
                  ? draft.claimed_at || draft.updated_at
                    ? `Sending since ${sendingSince((draft.claimed_at ?? draft.updated_at)!)}.`
                    : 'Sending.'
                  : 'Discarded.'}
          </p>
          {sendHoldReason && status === 'sending' && (
            <p className="text-[11px] text-[var(--text-muted)]">{sendHoldReason}</p>
          )}
          {finishDelivery && ready && canSend && !sendHoldReason && (
            <div className="flex flex-wrap items-baseline gap-x-3">
              <DocumentAction
                actionKey="finalize-outbound-draft"
                surfaceKey="desk"
                regionKey="ready-to-send"
                variant="primary"
                disabled={pending}
                loading={sending}
                loadingLabel="Recording"
                onClick={send}
              >
                Finish recording delivery
              </DocumentAction>
            </div>
          )}
        </>
      )}
      {result && !result.ok && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          {`Send held: ${(result.error || 'The outcome is unconfirmed').replace(/\.$/, '')}.`}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </section>
  );
}
