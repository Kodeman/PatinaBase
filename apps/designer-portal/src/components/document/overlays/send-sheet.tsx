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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
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
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { useProposalMirrorData } from '../drafting/proposal-mirror';
import { useDraftingState } from '@/hooks/use-drafting-state';
import { assessProposalSendReadiness } from '@/lib/document/proposal-send-validation';

const EXPIRY_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '21', label: '21 days' },
  { value: '30', label: '30 days' },
  { value: '', label: 'No expiration' },
];

const labelCls =
  'font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';

const fieldCls =
  'w-full rounded-[4px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[13px] text-[var(--color-charcoal)] outline-none transition-colors placeholder:italic placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)]';

function sendReviewFingerprint({
  proposalTotalCents,
  clientTotalCents,
  sendSnapshot,
  draftingGaps,
  blockers,
  warnings,
}: {
  proposalTotalCents: number;
  clientTotalCents: number;
  sendSnapshot: unknown;
  draftingGaps: string[];
  blockers: string[];
  warnings: string[];
}) {
  return JSON.stringify({
    proposalTotalCents,
    clientTotalCents,
    sendSnapshot,
    draftingGaps,
    blockers,
    warnings,
  });
}

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
  const clientPayload = useProposalMirrorData(proposalId);
  const draftingState = useDraftingState(proposalId, open);
  // Treat fresh drafting reconciliation as a required capability: if it is
  // unavailable during a rolling update, sending stays fail-closed.
  const draftingVerification = draftingState as typeof draftingState & {
    isFetching?: boolean;
    refresh?: () => Promise<{ gaps: string[] }>;
  };
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
  const [acknowledgedIncomplete, setAcknowledgedIncomplete] = useState(false);
  const [isPreparingSend, setIsPreparingSend] = useState(false);
  const sendAttemptInFlight = useRef(false);
  const [refreshedGaps, setRefreshedGaps] = useState<string[] | null>(null);
  const [refreshedClientData, setRefreshedClientData] = useState<
    NonNullable<typeof clientPayload.data> | null
  >(null);

  const sourceGapsFingerprint = JSON.stringify(draftingState.gaps);
  useEffect(() => {
    setRefreshedGaps(null);
  }, [sourceGapsFingerprint]);

  useEffect(() => {
    setRefreshedClientData(null);
  }, [clientPayload.data]);

  const effectiveGaps = refreshedGaps ?? draftingState.gaps;
  const effectiveClientData = refreshedClientData ?? clientPayload.data;

  const paymentMutationsPending = useIsMutating({
    predicate: (mutation) => {
      if (mutation.options.mutationKey?.[0] !== 'proposal-payment-schedule') {
        return false;
      }
      const variables = mutation.state.variables as
        | { proposalId?: string }
        | undefined;
      return variables?.proposalId === proposalId;
    },
  });

  const readiness = useMemo(() => {
    if (!proposal || !effectiveClientData) return null;
    return assessProposalSendReadiness({
      proposalTotalCents: proposal.total_amount ?? 0,
      clientTotalCents: effectiveClientData.totalCents,
      milestones: effectiveClientData.milestones,
      draftingGaps: effectiveGaps,
    });
  }, [effectiveClientData, effectiveGaps, proposal]);

  const reviewFingerprint = useMemo(() => {
    if (!proposal || !effectiveClientData || !readiness) return null;
    return sendReviewFingerprint({
      proposalTotalCents: proposal.total_amount ?? 0,
      clientTotalCents: effectiveClientData.totalCents,
      sendSnapshot: effectiveClientData.sendSnapshot,
      draftingGaps: effectiveGaps,
      blockers: readiness.blockers,
      warnings: readiness.warnings,
    });
  }, [effectiveClientData, effectiveGaps, proposal, readiness]);

  const checkingClientCopy =
    clientPayload.isLoading ||
    clientPayload.isFetching ||
    draftingState.isLoading ||
    draftingVerification.isFetching ||
    paymentMutationsPending > 0 ||
    isPreparingSend;
  const hasBlockers = (readiness?.blockers.length ?? 0) > 0;
  const incompleteIsAcknowledged =
    !readiness?.requiresIncompleteAcknowledgement || acknowledgedIncomplete;

  const clientEmail: string | undefined = proposal?.client?.email ?? undefined;

  // Pre-fill the recipient from the linked client's email once it loads, but
  // only when the designer hasn't already typed an address.
  useEffect(() => {
    if (clientEmail) {
      setRecipientEmail((prev) => (prev ? prev : clientEmail));
    }
  }, [clientEmail]);

  useEffect(() => {
    setAcknowledgedIncomplete(false);
  }, [open, reviewFingerprint]);

  const canSend = Boolean(
    proposal?.client_id &&
      recipientEmail &&
      readiness &&
      reviewFingerprint &&
      effectiveClientData?.sendSnapshot &&
      draftingVerification.refresh &&
      !checkingClientCopy &&
      !clientPayload.error &&
      !hasBlockers &&
      incompleteIsAcknowledged,
  );

  const handleSend = async () => {
    if (!canSend || sendAttemptInFlight.current) return;

    sendAttemptInFlight.current = true;
    setIsPreparingSend(true);
    setSendError(null);

    const validUntil = expiryDays
      ? new Date(Date.now() + parseInt(expiryDays) * 86400000).toISOString()
      : undefined;

    try {
      const refreshDrafting = draftingVerification.refresh;
      if (!refreshDrafting) {
        throw new Error(
          'The proposal readiness check is unavailable. Refresh the page before sending.',
        );
      }

      const [freshClientPayload, freshDraftingState] = await Promise.all([
        clientPayload.refetch(),
        refreshDrafting(),
      ]);
      if (freshClientPayload.error) throw freshClientPayload.error;
      if (!freshClientPayload.data?.sendSnapshot) {
        throw new Error(
          'The latest client copy could not be verified. Refresh and review it before sending.',
        );
      }

      const freshReadiness = assessProposalSendReadiness({
        proposalTotalCents: proposal.total_amount ?? 0,
        clientTotalCents: freshClientPayload.data.totalCents,
        milestones: freshClientPayload.data.milestones,
        draftingGaps: freshDraftingState.gaps,
      });
      const freshReviewFingerprint = sendReviewFingerprint({
        proposalTotalCents: proposal.total_amount ?? 0,
        clientTotalCents: freshClientPayload.data.totalCents,
        sendSnapshot: freshClientPayload.data.sendSnapshot,
        draftingGaps: freshDraftingState.gaps,
        blockers: freshReadiness.blockers,
        warnings: freshReadiness.warnings,
      });

      if (freshReviewFingerprint !== reviewFingerprint) {
        setRefreshedClientData(freshClientPayload.data);
        setRefreshedGaps(freshDraftingState.gaps);
        setAcknowledgedIncomplete(false);
        setSendError(
          'The client copy changed during the final check. Review the updated details, then send again.',
        );
        return;
      }

      const result = await sendProposal.mutateAsync({
        proposalId,
        expectedSnapshot: freshClientPayload.data.sendSnapshot,
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
    } finally {
      sendAttemptInFlight.current = false;
      setIsPreparingSend(false);
    }
  };

  const total = ((proposal?.total_amount || 0) / 100).toLocaleString();

  return (
    <DocSheet open={open} onClose={onClose} title="Send proposal">
      <div className="mx-auto max-w-xl">
        <p className={labelCls}>
          {proposal?.title ?? 'Proposal'} &middot; v{proposal?.version || 1}.0
          &middot; ${total}
        </p>
        <h2 className="mt-1 font-heading text-xl text-[var(--color-charcoal)]">
          Send proposal
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
          The client receives a branded email with your note and a link to the
          full proposal — same design, same fonts. They sign at the bottom;
          you&rsquo;re notified when they open, view, and sign.
        </p>

        {!proposal ? (
          <p className="mt-6 text-[12.5px] italic text-[var(--color-aged-oak)]">
            Loading…
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            {/* Link-a-client banner */}
            {!proposal.client_id && (
              <div className="rounded-[4px] border border-[rgba(196,124,92,0.4)] bg-[rgba(196,124,92,0.08)] p-3.5">
                <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--color-clay)]">
                  Link a client to send
                </p>
                <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
                  This proposal isn&rsquo;t linked to a client yet. Choose the
                  client it belongs to so they receive the proposal and can sign
                  it.
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
                    {linkError}{' '}
                    <span className="opacity-80">
                      Pick the client again to retry.
                    </span>
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
                <p className="text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
                  Another version of this proposal has already been accepted.
                  Sending this version will not affect the accepted one.
                </p>
              </div>
            )}

            {/* Recipient — the linked client */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="send-sheet-recipient">
                Recipient
              </label>
              {proposal.client_id ? (
                <div className="rounded-[4px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[13px]">
                  <span className="text-[var(--color-charcoal)]">
                    {proposal.client?.full_name ||
                      proposal.client?.email ||
                      'Linked client'}
                  </span>
                  {proposal.client?.email && (
                    <span className="ml-2 text-[var(--color-aged-oak)]">
                      &middot; {proposal.client.email}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-[12px] italic text-[var(--color-aged-oak)]">
                  Link a client above to set the recipient.
                </p>
              )}
              <DocumentAction
                actionKey="toggle-alternate-recipient"
                surfaceKey="open-document"
                regionKey="send-proposal-sheet"
                variant="tertiary"
                onClick={() => setShowAltAddress((s) => !s)}
                className="mt-0.5 self-start"
              >
                {showAltAddress
                  ? 'Hide alternate address'
                  : 'Send to a different address'}
              </DocumentAction>
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
                    <option
                      key={opt.value}
                      value={opt.value}
                      className="bg-[var(--doc-paper)] text-[var(--color-charcoal)]"
                    >
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

            {/* Canonical client-copy validation */}
            <div className="rounded-[4px] border border-[var(--color-pearl)] bg-white/70 p-3.5">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
                Client copy check
              </p>

              {checkingClientCopy && (
                <p role="status" className="mt-2 text-[12px] text-[var(--color-mocha)]">
                  Checking the latest client preview and payment schedule…
                </p>
              )}

              {!checkingClientCopy && clientPayload.error && (
                <p role="alert" className="mt-2 text-[12px] text-[var(--color-terracotta)]">
                  The client preview could not be verified. Refresh it before sending.
                </p>
              )}

              {!checkingClientCopy && !clientPayload.error && hasBlockers && (
                <div role="alert" className="mt-2 text-[12px] text-[var(--color-terracotta)]">
                  <p className="font-semibold">Not safe to send yet</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {readiness?.blockers.map((blocker, index) => (
                      <li key={`${blocker}-${index}`}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!checkingClientCopy &&
                !clientPayload.error &&
                !hasBlockers &&
                readiness?.requiresIncompleteAcknowledgement && (
                  <div className="mt-2 text-[12px] text-[var(--color-mocha)]">
                    <p className="font-semibold">This draft is incomplete</p>
                    {readiness.warnings.map((warning) => (
                      <p key={warning} className="mt-1">
                        {warning}
                      </p>
                    ))}
                    <label className="mt-2 flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={acknowledgedIncomplete}
                        onChange={(event) =>
                          setAcknowledgedIncomplete(event.target.checked)
                        }
                        className="mt-0.5"
                      />
                      <span>I reviewed the missing parts and still want to send this version.</span>
                    </label>
                  </div>
                )}

              {!checkingClientCopy &&
                !clientPayload.error &&
                !hasBlockers &&
                !readiness?.requiresIncompleteAcknowledgement && (
                  <p role="status" className="mt-2 text-[12px] text-[var(--color-sage)]">
                    Client total and payment schedule are ready to send.
                  </p>
                )}

              {!checkingClientCopy &&
                effectiveClientData?.paymentSchedule.storedAmountsMatch === false && (
                  <p role="status" className="mt-2 text-[11px] text-[var(--color-aged-oak)]">
                    Payment amounts will be synchronized to the current proposal total before send.
                  </p>
                )}
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
            <DocumentActionGroup
              surfaceKey="open-document"
              regionKey="send-proposal-sheet"
              className="border-t border-[var(--color-pearl)] pt-5"
              aria-label="Send proposal actions"
            >
              <DocumentAction
                actionKey="send-proposal"
                variant="primary"
                onClick={handleSend}
                disabled={!canSend}
                loading={sendProposal.isPending}
                loadingLabel="Sending…"
                trailing="→"
              >
                Send proposal
              </DocumentAction>
              <DocumentAction
                actionKey="send-later"
                variant="tertiary"
                onClick={onClose}
              >
                Send later
              </DocumentAction>
            </DocumentActionGroup>
          </div>
        )}
      </div>
    </DocSheet>
  );
}
