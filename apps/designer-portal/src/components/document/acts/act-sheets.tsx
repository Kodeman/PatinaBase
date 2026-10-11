'use client';

/**
 * US-25 slice 5 — the four scoped act sheets. Each reads its one record and
 * hands its draft to an existing send path; none writes send code of its own.
 *
 *   Chase this PO            compose_ack_chase_draft → update_procurement_draft
 *                            → procurement-draft-send (the C-28 draft path)
 *   Remind this invoice      invoice-send type 'reminder' + chase_invoice (00209),
 *                            as the Receivables page's dunning act
 *   Follow up this proposal  the letterhead composer's note send
 *   Approve this order's     release_purchase_order (00710): returns the held
 *   release                  order to draft; nothing is sent
 *
 * SQ-746 ruling (b): a non-lead's PO chase is saved as an ack_chase draft for
 * the lead; her invoice reminder and proposal follow-up are read-only, since
 * the draft store holds no invoice or proposal kind. Q11 does not apply to a
 * release: only a seat that can release ever sees a held order.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useChaseInvoice,
  useComposeProcurementDraft,
  useInvoice,
  useProposal,
  usePurchaseOrders,
  useReleasePurchaseOrder,
  useSendInvoice,
  useSendProcurementDraft,
  useUpdateProcurementDraft,
} from '@patina/supabase';
import { firstNameOf } from '@/lib/document/account-identity';
import { invoiceBalanceCents } from '@/lib/document/account-summary';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import { fmtDay, fmtUsd } from '@/lib/document/format';
import { useSendDocumentNote } from '../letterhead-instruments';
import { ActDraft, type ActDraftText } from './act-draft';
import { useActViewer, type ActViewer } from './act-viewer';

interface SheetProps {
  need: DeskNeed;
  onDone: () => void;
}

function Reading() {
  return <p className="text-[13px] text-[var(--text-muted)]">Loading the record…</p>;
}

function Missing() {
  return (
    <p className="text-[14px] text-[var(--color-charcoal)]">
      This record is no longer open. Put the sheet back to see what stands now.
    </p>
  );
}

const capitalised = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/** The purchase order as its own record returns it. */
interface OrderRecord {
  id: string;
  po_number?: string | null;
  vendor_po_number?: string | null;
  sent_at?: string | null;
  vendor?: { name?: string | null } | null;
}

/** SQ-778 N3 — the order the need names, read off the purchase order itself:
 *  a PO need not ride a live paper line, and its number is on the record. */
function useOrder(projectId: string, purchaseOrderId: string) {
  const orders = usePurchaseOrders({ projectId });
  const po = (orders.data as OrderRecord[] | undefined)?.find((o) => o.id === purchaseOrderId) ?? null;
  return {
    loaded: orders.isSuccess,
    po,
    maker: po?.vendor?.name?.trim() || null,
    label: po?.po_number?.trim() || po?.vendor_po_number?.trim() || null,
  };
}

export function PoChaseSheet({ need, onDone }: SheetProps) {
  const purchaseOrderId = need.need.recordId!;
  const viewer = useActViewer(need.projectId);
  const order = useOrder(need.projectId, purchaseOrderId);
  const queryClient = useQueryClient();
  const compose = useComposeProcurementDraft({ errorSurface: 'inline' });
  const update = useUpdateProcurementDraft({ errorSurface: 'inline' });
  const send = useSendProcurementDraft({ errorSurface: 'inline' });
  if (!order.loaded) return <Reading />;

  // "Purchase order PO-HD-0412": the record's own number, never a bare "The".
  const po = order.label ? `purchase order ${order.label}` : 'the purchase order';
  const sent = order.po?.sent_at ? fmtDay(order.po.sent_at) : null;
  // The draft path's own route: compose the chase, then store her words on it.
  const composeChase = () => compose.mutateAsync({ kind: 'ack_chase', purchaseOrderId });
  const storeWords = (draftId: string, { subject, body }: ActDraftText) => async () => {
    await update.mutateAsync({ draftId, request: { subject, body } });
    void queryClient.invalidateQueries({ queryKey: ['document-state'] });
  };

  return (
    <ActDraft
      need={need}
      viewer={viewer}
      regionKey="act-chase-po"
      counterpart={order.maker}
      record={`${capitalised(po)}${sent ? `, sent ${sent}` : ''} — no acknowledgment`}
      initial={{
        subject: `${capitalised(po)}: please acknowledge`,
        body: [
          `Hello ${order.maker ?? 'there'},`,
          `We sent ${po}${sent ? ` on ${sent}` : ''} and have not yet received your acknowledgment. Please confirm the order, pricing and ship date when you can.`,
          'Thank you.',
        ].join('\n\n'),
      }}
      sendLabel={`Send the chase to ${order.maker ?? 'the maker'}`}
      onSend={async (text, confirmSend) => {
        const draft = await composeChase();
        await storeWords(draft.id, text)();
        // SQ-774 R3 — the lead is read again after the draft is held, just
        // before it goes; if she may no longer send, it stays held for the lead.
        await confirmSend({ draftHeld: true });
        await send.mutateAsync(draft.id);
      }}
      onSaveForLead={async (text) => {
        const draft = await composeChase();
        // SQ-777 F1 — the draft is saved; storing her words on it is recorded
        // after, and only that is offered again if it fails.
        return storeWords(draft.id, text);
      }}
      onDone={onDone}
    />
  );
}

export function InvoiceReminderSheet({ need, onDone }: SheetProps) {
  const invoiceId = need.need.recordId!;
  const viewer = useActViewer(need.projectId);
  const { data: invoice, isSuccess } = useInvoice(invoiceId);
  const queryClient = useQueryClient();
  const sendInvoice = useSendInvoice({ errorSurface: 'inline' });
  const chase = useChaseInvoice({ errorSurface: 'inline' });
  if (!isSuccess) return <Reading />;
  if (!invoice) return <Missing />;

  const client =
    invoice.client?.full_name?.trim() || invoice.project?.client?.full_name?.trim() || null;
  const label = invoice.invoice_number ? `Invoice ${invoice.invoice_number}` : 'The invoice';
  const balance = fmtUsd(invoiceBalanceCents(invoice));
  const due = invoice.due_date ? fmtDay(invoice.due_date) : null;
  const projectId = invoice.project_id ?? undefined;

  return (
    <ActDraft
      need={need}
      viewer={viewer}
      regionKey="act-remind-invoice"
      counterpart={client}
      record={`${label} · ${balance}${due ? ` · due ${due}` : ''}`}
      bodyLabel="A note with the reminder"
      initial={{
        subject: null,
        body: [
          `${client ? firstNameOf(client) : 'Hello'},`,
          `A reminder that ${label.charAt(0).toLowerCase()}${label.slice(1)} for ${balance}${due ? ` was due ${due}` : ' is now due'}. Let me know if you have any questions about it.`,
          'Thank you.',
        ].join('\n\n'),
      }}
      sendLabel={`Send the reminder to ${client ?? 'the client'}`}
      // The Receivables dunning act's two writes, in its order: the overdue
      // notice, then the chase stamp the Desk reads (00209).
      onSend={async ({ body }, confirmSend) => {
        await confirmSend();
        await sendInvoice.mutateAsync({ invoiceId, projectId, type: 'reminder', message: body });
        // SQ-777 F1 — the reminder went; the chase stamp only records it.
        return async () => {
          await chase.mutateAsync({ invoiceId, projectId });
          void queryClient.invalidateQueries({ queryKey: ['document-state'] });
        };
      }}
      onDone={onDone}
    />
  );
}

const PROPOSAL_STATE: Record<string, string> = {
  proposal_declined: 'declined',
  proposal_expired: 'expired',
  hesitating_proposal: 'not yet signed',
};

function proposalNote(kind: string, first: string): string {
  if (kind === 'proposal_declined')
    return `${first}, thank you for telling me where you landed. Could we talk through what would make it work for you?`;
  if (kind === 'proposal_expired')
    return `${first}, the proposal has expired. Would you like me to send a fresh one?`;
  return `${first}, checking in on the proposal. Is there anything I can answer for you?`;
}

export function ProposalFollowUpSheet({ need, onDone }: SheetProps) {
  const proposalId = need.need.recordId!;
  const { data: proposal, isSuccess } = useProposal(proposalId);
  const viewer = useActViewer(proposal?.project_id ?? need.projectId);
  const sendNote = useSendDocumentNote(proposal?.project_id ?? null, proposal?.client?.id ?? null, {
    errorSurface: 'inline',
  });
  if (!isSuccess) return <Reading />;
  if (!proposal) return <Missing />;

  const client: string | null = proposal.client?.full_name?.trim() || null;
  const kind = need.need.kind;
  const declined = kind === 'proposal_declined';
  // proposals.decline_reason (the row `useProposal` selects with `*`); the
  // hand-authored Proposal type does not carry it.
  const reason: string | null =
    (proposal as { decline_reason?: string | null }).decline_reason?.trim() || null;
  const who = client ?? 'The client';

  return (
    <ActDraft
      need={need}
      viewer={viewer}
      regionKey="act-follow-up-proposal"
      counterpart={client}
      record={`${proposal.title?.trim() || 'The proposal'} · ${PROPOSAL_STATE[kind] ?? 'open'}`}
      // US-25 fix-now 14 — the follow-up quotes what she said.
      quote={declined ? `${who} declined the proposal${reason ? `: “${reason}”` : '.'}` : null}
      initial={{ subject: null, body: proposalNote(kind, client ? firstNameOf(client) : 'Hello') }}
      sendLabel={`Send the follow-up to ${client ?? 'the client'}`}
      // SQ-777 F3 — the lead is read again once the thread is open, right
      // before the message is written; a reassignment meanwhile writes nothing.
      onSend={async ({ body }, confirmSend) => {
        await sendNote.mutateAsync({ body, confirm: () => confirmSend() });
      }}
      onDone={onDone}
    />
  );
}

export function ReleaseOrderSheet({ need }: SheetProps) {
  const purchaseOrderId = need.need.recordId!;
  const lead = useActViewer(need.projectId);
  const order = useOrder(need.projectId, purchaseOrderId);
  const queryClient = useQueryClient();
  const release = useReleasePurchaseOrder({ errorSurface: 'inline' });
  const [approved, setApproved] = useState(false);
  if (!order.loaded) return <Reading />;
  const maker = order.maker ?? 'the maker';

  // SQ-764 F22 — the release only returns the held order to draft; it is sent
  // from its purchase order. The sheet says so, and stays until put back.
  if (approved) {
    return (
      <p role="status" className="text-[14px] text-[var(--color-charcoal)]">
        {`Release approved. The order is ready to send to ${maker} from its purchase order.`}
      </p>
    );
  }

  // Q11 does not apply: the held order rose only for a seat that can release.
  const viewer: ActViewer = { ...lead, ready: true, canSend: true, leadFirstName: null, recheck: undefined };

  return (
    <ActDraft
      need={need}
      viewer={viewer}
      regionKey="act-release-order"
      counterpart={order.maker}
      record={need.need.text}
      initial={null}
      sendLabel="Approve release"
      onSend={async () => {
        await release.mutateAsync(purchaseOrderId);
        void queryClient.invalidateQueries({ queryKey: ['document-state'] });
      }}
      onDone={() => setApproved(true)}
    />
  );
}
