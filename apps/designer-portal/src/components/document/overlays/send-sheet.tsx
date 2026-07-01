'use client';

/**
 * SendSheet (R44) — the document-native send instrument. The legacy
 * /portal/proposals/[id]/send route, ported 1:1 into a charcoal DocSheet (D8)
 * that slides up over the open Proposal — never a route, never an unmount (D1).
 *
 * Same contract as the legacy form: recipient (with a "send to a different
 * address" toggle), CC, expiry, personal message, the link-a-client banner
 * (ClientPicker), and the accepted-sibling warning (useProposalVersions).
 *
 * Preview does NOT stamp; only Send mutates (send_proposal RPC via
 * useSendProposal — flips → 'sent' AND supersedes sibling versions). On success
 * the sheet closes and the proposal / document-state / desk read models are
 * invalidated so the line stamp, margin, and Desk move in one act (§5).
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useProposal,
  useSendProposal,
  useUpdateProposal,
  useProposalVersions,
} from '@/hooks/use-proposals';
import { ClientPicker } from '@/components/portal/client-picker';
import { useToast } from '@/components/portal/toast-provider';
import { proposalEvents } from '@/lib/analytics';
import { DocSheet } from './doc-sheet';

const EXPIRY_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '21', label: '21 days' },
  { value: '30', label: '30 days' },
  { value: '', label: 'No expiration' },
];

const labelCls =
  'font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[rgba(250,247,242,0.5)]';

const fieldCls =
  'w-full rounded-[4px] border border-[rgba(250,247,242,0.18)] bg-[rgba(250,247,242,0.04)] px-3 py-2 text-[13px] text-[var(--color-off-white)] outline-none transition-colors placeholder:italic placeholder:text-[rgba(250,247,242,0.35)] focus:border-[var(--color-clay)]';

export function SendSheet({
  proposalId,
  open,
  onClose,
  onSent,
}: {
  proposalId: string;
  open: boolean;
  onClose: () => void;
  /** Fired after a successful send, before onClose — lets a caller (e.g. the
   *  Drafting Room) navigate back to the document the proposal lives in. */
  onSent?: () => void;
}) {
  const qc = useQueryClient();
  const { data: proposal } = useProposal(proposalId) as { data: any };
  const { data: versions } = useProposalVersions(proposalId);
  // R83 — this sheet renders failures inline at the act site (sendError /
  // linkError bands below); the global mutation toast stays quiet.
  const sendProposal = useSendProposal({ errorSurface: 'inline' });
  const updateProposal = useUpdateProposal({ errorSurface: 'inline' });
  const { toast } = useToast();

  // A sibling version already accepted? Sending this one won't affect it.
  const hasAcceptedSibling = (versions ?? []).some(
    (v) => v.id !== proposalId && v.status === 'accepted',
  );

  const [recipientEmail, setRecipientEmail] = useState('');
  const [ccEmail, setCcEmail] = useState('');
  const [expiryDays, setExpiryDays] = useState('14');
  const [personalMessage, setPersonalMessage] = useState('');
  const [showAltAddress, setShowAltAddress] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const clientEmail: string | undefined = proposal?.client?.email ?? undefined;

  // Pre-fill the recipient from the linked client's email once it loads, but
  // only when the designer hasn't already typed an address.
  useEffect(() => {
    if (clientEmail) {
      setRecipientEmail((prev) => (prev ? prev : clientEmail));
    }
  }, [clientEmail]);

  const handleSend = async () => {
    if (!proposal?.client_id || !recipientEmail) return;

    setSendError(null);

    const validUntil = expiryDays
      ? new Date(Date.now() + parseInt(expiryDays) * 86400000).toISOString()
      : undefined;

    try {
      const result = await sendProposal.mutateAsync({
        proposalId,
        personalMessage: personalMessage || undefined,
        ccEmail: ccEmail || undefined,
        validUntil,
      });
      proposalEvents.sent({
        proposalId,
        hasPersonalMessage: !!personalMessage,
        hasCcEmail: !!ccEmail,
        itemCount: proposal?.items?.length ?? 0,
        totalAmount: proposal?.total_amount ?? 0,
      });
      if (!result._emailDispatched) {
        toast(
          'Proposal marked as sent, but the notification email could not be dispatched. Follow up with your client directly.',
          'warning',
        );
      }
      // One act, many surfaces (§5): the send flipped the proposal AND
      // superseded siblings — refetch the document/desk read models so the line
      // stamp, margin, and Desk move together. (useSendProposal already
      // invalidates the proposal keys.)
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      void qc.invalidateQueries({ queryKey: ['desk-engagements'] });
      onSent?.();
      onClose();
    } catch (err) {
      console.error('Failed to send proposal:', err);
      setSendError(
        err instanceof Error
          ? err.message
          : 'Could not send the proposal. Please try again.',
      );
    }
  };

  const total = ((proposal?.total_amount || 0) / 100).toLocaleString();

  return (
    <DocSheet open={open} onClose={onClose} title="Send proposal">
      <div className="mx-auto max-w-xl">
        <p className={labelCls}>
          {proposal?.title ?? 'Proposal'} &middot; v{proposal?.version || 1}.0 &middot; ${total}
        </p>
        <h2 className="mt-1 font-heading text-xl text-[var(--color-pearl)]">Send proposal</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[rgba(250,247,242,0.6)]">
          The client receives a branded email with your note and a link to the full proposal — same
          design, same fonts. They sign at the bottom; you&rsquo;re notified when they open, view,
          and sign.
        </p>

        {!proposal ? (
          <p className="mt-6 text-[12.5px] italic text-[rgba(250,247,242,0.45)]">Loading…</p>
        ) : (
          <div className="mt-5 space-y-5">
            {/* Link-a-client banner */}
            {!proposal.client_id && (
              <div className="rounded-[4px] border border-[rgba(196,124,92,0.4)] bg-[rgba(196,124,92,0.08)] p-3.5">
                <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--color-clay)]">
                  Link a client to send
                </p>
                <p className="mb-3 text-[12.5px] leading-relaxed text-[rgba(250,247,242,0.7)]">
                  This proposal isn&rsquo;t linked to a client yet. Choose the client it belongs to
                  so they receive the proposal and can sign it.
                </p>
                <div className="max-w-[320px]">
                  <ClientPicker
                    value={null}
                    onChange={(clientId) => {
                      setLinkError(null);
                      updateProposal.mutate(
                        {
                          proposalId,
                          updates: { client_id: clientId },
                        },
                        {
                          // R83 — inline at the act, in the banner that owns it.
                          onError: (err) =>
                            setLinkError(
                              err instanceof Error
                                ? err.message
                                : 'Could not link the client. Try again.',
                            ),
                        },
                      );
                    }}
                    placeholder="Link a client…"
                  />
                </div>
                {linkError && (
                  <p
                    role="alert"
                    className="mt-2 text-[11px] leading-snug text-[var(--color-terracotta)]"
                  >
                    {linkError} <span className="opacity-80">Pick the client again to retry.</span>
                  </p>
                )}
              </div>
            )}

            {/* Accepted-sibling warning */}
            {hasAcceptedSibling && (
              <div className="rounded-[4px] border border-[rgba(196,124,92,0.4)] bg-[rgba(196,124,92,0.08)] p-3.5">
                <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--color-clay)]">
                  Another version is already accepted
                </p>
                <p className="text-[12.5px] leading-relaxed text-[rgba(250,247,242,0.7)]">
                  Another version of this proposal has already been accepted. Sending this version
                  will not affect the accepted one.
                </p>
              </div>
            )}

            {/* Recipient — the linked client */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="send-sheet-recipient">
                Recipient
              </label>
              {proposal.client_id ? (
                <div className="rounded-[4px] border border-[rgba(250,247,242,0.14)] bg-[rgba(250,247,242,0.04)] px-3 py-2 text-[13px]">
                  <span className="text-[var(--color-off-white)]">
                    {proposal.client?.full_name || proposal.client?.email || 'Linked client'}
                  </span>
                  {proposal.client?.email && (
                    <span className="ml-2 text-[rgba(250,247,242,0.45)]">
                      &middot; {proposal.client.email}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-[12px] italic text-[rgba(250,247,242,0.45)]">
                  Link a client above to set the recipient.
                </p>
              )}
              <button
                type="button"
                onClick={() => setShowAltAddress((s) => !s)}
                className="mt-0.5 self-start font-mono text-[9px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.5)] hover:text-[var(--color-clay)]"
              >
                {showAltAddress ? 'Hide alternate address' : 'Send to a different address'}
              </button>
              {showAltAddress && (
                <input
                  id="send-sheet-recipient"
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="client@email.com"
                  className={`${fieldCls} mt-1`}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              {/* CC */}
              <div className="flex flex-col gap-1.5">
                <label className={labelCls} htmlFor="send-sheet-cc">
                  CC (optional)
                </label>
                <input
                  id="send-sheet-cc"
                  type="email"
                  value={ccEmail}
                  onChange={(e) => setCcEmail(e.target.value)}
                  placeholder="partner@email.com"
                  className={fieldCls}
                />
              </div>

              {/* Expiry */}
              <div className="flex flex-col gap-1.5">
                <label className={labelCls} htmlFor="send-sheet-expires">
                  Expires after
                </label>
                <select
                  id="send-sheet-expires"
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  className={fieldCls}
                >
                  {EXPIRY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="text-[var(--color-charcoal)]">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Personal message */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="send-sheet-message">
                Personal message
              </label>
              <textarea
                id="send-sheet-message"
                rows={5}
                value={personalMessage}
                onChange={(e) => setPersonalMessage(e.target.value)}
                placeholder="Write a personal note to your client…"
                className={`${fieldCls} resize-y`}
                style={{ minHeight: 110 }}
              />
            </div>

            {/* Send error */}
            {sendError && (
              <div
                role="alert"
                className="rounded-[4px] border border-[rgba(196,124,92,0.4)] bg-[rgba(196,124,92,0.08)] p-3 text-[12.5px] text-[var(--color-clay)]"
              >
                {sendError}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-4 border-t border-[rgba(250,247,242,0.1)] pt-5">
              <button
                type="button"
                onClick={handleSend}
                disabled={!proposal.client_id || !recipientEmail || sendProposal.isPending}
                className="rounded-[4px] bg-[var(--color-clay)] px-4 py-2 text-[12px] font-medium text-[var(--color-charcoal)] transition-opacity disabled:opacity-40"
              >
                {sendProposal.isPending ? 'Sending…' : 'Send proposal →'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="font-mono text-[9px] uppercase tracking-[0.06em] text-[rgba(250,247,242,0.5)] hover:text-[var(--color-off-white)]"
              >
                Send later
              </button>
            </div>
          </div>
        )}
      </div>
    </DocSheet>
  );
}
