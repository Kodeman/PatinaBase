'use client';

import { useState } from 'react';
import {
  useDiscardProcurementDraft,
  useProcurementDrafts,
  useSendProcurementDraft,
  useUpdateProcurementDraft,
  type ProcurementDraftRow,
} from '@patina/supabase';
import { DocumentAction } from '../document-action';
import { LABEL_CLS } from '../line-unfold/cell';

/**
 * C-28 (d2 §M11): an outbound letter composed by SQL, awaiting a member's
 * review. The recipient is always visible; the subject and body are editable
 * while it awaits review; Send saves any edit, then hands the stored draft to
 * procurement-draft-send. Nothing leaves without this click. Discard ends it.
 */

export type ReviewableDraft = Pick<
  ProcurementDraftRow,
  'id' | 'kind' | 'status' | 'to_email' | 'subject' | 'body'
>;

export const DRAFT_KIND_LABEL: Record<string, string> = {
  ack_discrepancy_reply: 'Reply to the maker',
  ack_chase: 'Acknowledgment chase',
  receiver_inbound_notice: 'Inbound notice to the receiver',
  vendor_claim_notice: 'Claim notice to the vendor',
  client_delay_note: 'Note to the client',
  client_substitution_note: 'Note to the client',
  memo_return_note: 'Memo return note',
};

const INPUT_CLS =
  'w-full rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-1.5 text-[13px] text-[var(--color-charcoal)] outline-none focus-visible:border-[var(--color-clay)] disabled:opacity-60';

export function DraftReview({
  draft,
  surfaceKey = 'project',
  regionKey = 'procurement-draft',
}: {
  draft: ReviewableDraft;
  surfaceKey?: string;
  regionKey?: string;
}) {
  const update = useUpdateProcurementDraft({ errorSurface: 'inline' });
  const send = useSendProcurementDraft({ errorSurface: 'inline' });
  const discard = useDiscardProcurementDraft({ errorSurface: 'inline' });
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'sent' | 'discarded' | null>(null);

  const status = outcome ?? draft.status;
  const editable = status === 'awaiting_review';
  const pending = update.isPending || send.isPending || discard.isPending;
  const recipient = draft.to_email?.trim() || null;
  const edited = subject.trim() !== draft.subject || body !== draft.body;
  const blank = !subject.trim() || !body.trim();
  const label = DRAFT_KIND_LABEL[draft.kind] ?? 'Letter';
  const fieldId = `draft-${draft.id}`;

  const sendDraft = async () => {
    setError(null);
    try {
      if (edited) {
        await update.mutateAsync({ draftId: draft.id, request: { subject: subject.trim(), body } });
      }
      await send.mutateAsync(draft.id);
      setOutcome('sent');
    } catch (e) {
      setError((e as Error).message || 'The letter was not sent.');
    }
  };

  const discardDraft = () => {
    setError(null);
    discard
      .mutateAsync(draft.id)
      .then(() => setOutcome('discarded'))
      .catch((e: Error) => setError(e.message || 'The draft was not discarded.'));
  };

  return (
    <section
      aria-label={`${label}, drafted`}
      data-testid="draft-review"
      className="mt-2 flex flex-col gap-1.5 border-t border-[var(--color-pearl)] pt-2"
    >
      <p className={LABEL_CLS}>{label}</p>
      <p className="text-[12px] text-[var(--color-charcoal)]" data-testid="draft-recipient">
        To{' '}
        {recipient ?? (
          <span className="text-[var(--color-terracotta-ink)]">
            no address on file — add an email to the contact card
          </span>
        )}
      </p>
      {editable ? (
        <>
          <label htmlFor={`${fieldId}-subject`} className="sr-only">
            Subject
          </label>
          <input
            id={`${fieldId}-subject`}
            value={subject}
            maxLength={300}
            disabled={pending}
            onChange={(e) => setSubject(e.target.value)}
            className={INPUT_CLS}
          />
          <label htmlFor={`${fieldId}-body`} className="sr-only">
            Letter
          </label>
          <textarea
            id={`${fieldId}-body`}
            value={body}
            rows={8}
            maxLength={20000}
            disabled={pending}
            onChange={(e) => setBody(e.target.value)}
            className={`${INPUT_CLS} resize-y font-heading leading-snug`}
          />
          <div className="flex flex-wrap items-baseline gap-x-3">
            <DocumentAction
              actionKey="send-procurement-draft"
              surfaceKey={surfaceKey}
              regionKey={regionKey}
              variant="primary"
              disabled={pending || !recipient || blank}
              loading={update.isPending || send.isPending}
              loadingLabel="Sending"
              onClick={sendDraft}
            >
              Send
            </DocumentAction>
            <DocumentAction
              actionKey="discard-procurement-draft"
              surfaceKey={surfaceKey}
              regionKey={regionKey}
              variant="tertiary"
              disabled={pending}
              onClick={discardDraft}
            >
              Discard
            </DocumentAction>
          </div>
        </>
      ) : (
        <p role="status" className="text-[12px] text-[var(--text-muted)]">
          {status === 'sent' ? `Sent${recipient ? ` to ${recipient}` : ''}.` : 'Discarded.'}
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

/**
 * The drafts awaiting review on one purchase order, of the kinds the host cell
 * owns (the Order cell answers the acknowledgment; Movement, the receiver;
 * Receiving, the claim). Renders nothing when there are none.
 */
export function PurchaseOrderDrafts({
  projectId,
  purchaseOrderId,
  kinds,
}: {
  projectId: string | null | undefined;
  purchaseOrderId: string | null | undefined;
  kinds: readonly string[];
}) {
  const { data } = useProcurementDrafts(purchaseOrderId ? projectId : null, 'awaiting_review');
  const drafts = (data ?? []).filter(
    (d) => d.purchase_order_id === purchaseOrderId && kinds.includes(d.kind),
  );
  if (drafts.length === 0) return null;
  return (
    <>
      {drafts.map((d) => (
        <DraftReview key={d.id} draft={d} regionKey="line-unfold" />
      ))}
    </>
  );
}
