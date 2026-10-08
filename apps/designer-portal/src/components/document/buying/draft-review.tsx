'use client';

import { useState } from 'react';
import {
  OPEN_PROCUREMENT_DRAFT_STATUSES,
  useDiscardProcurementDraft,
  useProcurementDrafts,
  useResendStalledProcurementDraft,
  useSendProcurementDraft,
  useUpdateProcurementDraft,
  type ProcurementDraftRow,
} from '@patina/supabase';
import { lineMakerRecord, type LineMakerSource } from '@/lib/document/install-reading';
import { FOCUS_FFE_LINE_EVENT, type FocusFfeLineRequest } from '@/lib/document/registry';
import { DocumentAction } from '../document-action';
import { LABEL_CLS } from '../line-unfold/cell';

/**
 * C-28 (d2 §M11): an outbound letter composed by SQL, awaiting a member's
 * review. The recipient is always visible; the subject and body are editable
 * while it awaits review; Send saves any edit, then hands the stored draft to
 * procurement-draft-send. Nothing leaves without this click. Discard ends it.
 * A draft claimed by a send reads "Sending since …"; once that send has
 * stalled (00720: claimed over 10 minutes ago) it offers Send again.
 */

/** updated_at is the claim time while a draft is sending (it refuses edits). */
export type ReviewableDraft = Pick<
  ProcurementDraftRow,
  'id' | 'kind' | 'status' | 'to_email' | 'subject' | 'body'
> & { updated_at?: string };

/** 00720: a send claimed longer ago than this has stalled. */
const STALLED_SEND_MS = 10 * 60 * 1000;

function sendingSince(iso: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return at.toDateString() === new Date().toDateString()
    ? time
    : `${at.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export const DRAFT_KIND_LABEL: Record<string, string> = {
  ack_discrepancy_reply: 'Reply to the maker',
  ack_chase: 'Acknowledgment chase',
  receiver_inbound_notice: 'Inbound notice to the receiver',
  vendor_claim_notice: 'Claim notice to the vendor',
  client_delay_note: 'Note to the client',
  client_substitution_note: 'Note to the client',
  memo_return_note: 'Memo return note',
  maker_eta_request: 'Arrival date request to the maker',
  maker_follow_up: 'Follow-up to the maker',
};

const INPUT_CLS =
  'w-full rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-1.5 text-[13px] text-[var(--color-charcoal)] outline-none focus-visible:border-[var(--color-clay)] disabled:opacity-60';

/**
 * 506-2 `Add an address`: where a maker's address is kept today. A maker with
 * a vendor record keeps it on that record's Orders-book page (the Orders
 * email); a maker named only by hand or by brand has no record yet, so the act
 * lands on the line's own maker selector. Reached at press time, as
 * order-cell's `Open the order` is: a static `../command-bar` import drags
 * @patina/help-system's ESM into every suite that renders the unfold.
 *
 * US-19 F3-22 (517-1, `one-voice`): `onTerms` opens the vendor page on its
 * `terms` sub-page with focus on the Orders email, not the default `thread`.
 */
export function landOnMakerAddress(
  line: LineMakerSource & { id: string },
  { onTerms = false }: { onTerms?: boolean } = {},
) {
  const vendorId = lineMakerRecord(line)?.vendorId;
  if (vendorId) {
    void import('../command-bar').then(({ openLedger }) =>
      openLedger(
        'orders',
        onTerms
          ? { page: 'vendors', vendorId, vendorPage: 'terms', focus: 'orders-email' }
          : { page: 'vendors', vendorId },
      ),
    );
    return;
  }
  const request: FocusFfeLineRequest = { itemId: line.id, cell: 'maker' };
  window.dispatchEvent(new CustomEvent(FOCUS_FFE_LINE_EVENT, { detail: request }));
}

export function DraftReview({
  draft,
  surfaceKey = 'project',
  regionKey = 'procurement-draft',
  addressee,
  onAddAddress,
}: {
  draft: ReviewableDraft;
  surfaceKey?: string;
  regionKey?: string;
  /** The maker the letter is to, for the held Send's reason (R12). */
  addressee?: string | null;
  /** 506-2: the repair for a draft with no address; offered only when given. */
  onAddAddress?: () => void;
}) {
  const update = useUpdateProcurementDraft({ errorSurface: 'inline' });
  const send = useSendProcurementDraft({ errorSurface: 'inline' });
  const discard = useDiscardProcurementDraft({ errorSurface: 'inline' });
  const resend = useResendStalledProcurementDraft({ errorSurface: 'inline' });
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'sent' | 'discarded' | null>(null);

  const status = outcome ?? draft.status;
  const editable = status === 'awaiting_review';
  const stalled =
    status === 'sending' &&
    !!draft.updated_at &&
    Date.now() - new Date(draft.updated_at).getTime() > STALLED_SEND_MS;
  const pending = update.isPending || send.isPending || discard.isPending || resend.isPending;
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

  const sendAgain = () => {
    setError(null);
    resend
      .mutateAsync(draft.id)
      .then(() => setOutcome('sent'))
      .catch((e: Error) => setError(e.message || 'The letter was not sent.'));
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
        {recipient ?? <span className="text-[var(--color-terracotta-ink)]">no address on file</span>}
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
            {/* 506-2: no address holds the Send (§A5), never native disabled,
                so its reason is reachable by keyboard. */}
            <DocumentAction
              actionKey="send-procurement-draft"
              surfaceKey={surfaceKey}
              regionKey={regionKey}
              variant="primary"
              held={!recipient}
              aria-describedby={recipient ? undefined : `${fieldId}-no-address`}
              disabled={pending || !recipient || blank}
              loading={update.isPending || send.isPending}
              loadingLabel="Sending"
              onClick={sendDraft}
            >
              Send
            </DocumentAction>
            {!recipient && onAddAddress && (
              <DocumentAction
                actionKey="add-maker-address"
                surfaceKey={surfaceKey}
                regionKey={regionKey}
                variant="tertiary"
                onClick={onAddAddress}
              >
                Add an address
              </DocumentAction>
            )}
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
          {!recipient && (
            <p id={`${fieldId}-no-address`} className="text-[11px] text-[var(--text-muted)]">
              {addressee ? `No address on file for ${addressee}.` : 'No address on file.'}
            </p>
          )}
        </>
      ) : (
        <>
          <p role="status" className="text-[12px] text-[var(--text-muted)]">
            {status === 'sent'
              ? `Sent${recipient ? ` to ${recipient}` : ''}.`
              : status === 'sending'
                ? draft.updated_at
                  ? `Sending since ${sendingSince(draft.updated_at)}.`
                  : 'Sending.'
                : 'Discarded.'}
          </p>
          {stalled && (
            <div className="flex flex-wrap items-baseline gap-x-3">
              <DocumentAction
                actionKey="resend-procurement-draft"
                surfaceKey={surfaceKey}
                regionKey={regionKey}
                variant="primary"
                disabled={pending}
                loading={resend.isPending}
                loadingLabel="Sending"
                onClick={sendAgain}
              >
                Send again
              </DocumentAction>
            </div>
          )}
        </>
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
 * The drafts awaiting review (or sending) on one purchase order, of the kinds
 * the host cell owns (the Order cell answers the acknowledgment; Movement, the
 * receiver; Receiving, the claim). Renders nothing when there are none. A
 * line's own date request is that line's, not its PO's (511-R6).
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
  const { data } = useProcurementDrafts(
    purchaseOrderId ? projectId : null,
    OPEN_PROCUREMENT_DRAFT_STATUSES,
  );
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
