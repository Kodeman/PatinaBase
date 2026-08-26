'use client';

/**
 * SendSheet (R44) — the document-native send instrument. The legacy
 * /portal/proposals/[id]/send route, ported 1:1 into a charcoal DocSheet (D8)
 * that slides up over the open Proposal — never a route, never an unmount (D1).
 *
 * Same contract as the legacy form: the proposal's linked client is the
 * recipient, with CC, expiry, personal message, the link-a-client banner
 * (ClientPicker), and the accepted-sibling warning (useProposalVersions).
 *
 * Preview does NOT stamp; only Send mutates (send_proposal RPC via
 * useSendProposal — flips → 'sent' AND supersedes sibling versions). On success
 * the sheet closes and the proposal / document-state / desk read models are
 * invalidated so the line stamp, margin, and Desk move in one act (§5).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { PROPOSAL_CLIENT_MUTATION_KEY } from '@patina/supabase';
import {
  useProposal,
  useRetryProposalSend,
  useProposalSendDispatchStatus,
  useSendProposal,
  useProposalVersions,
  type ProposalEmailDeliveryState,
} from '@/hooks/use-proposals';
import { ClientPicker } from '@/components/portal/client-picker';
import { useClient, useInviteAndLinkClient } from '@/hooks/use-clients';
import { useAttachDocumentClient } from '@/hooks/use-attach-client';
import { useToast } from '@/components/portal/toast-provider';
import { proposalEvents } from '@/lib/analytics';
import { DocSheet } from './doc-sheet';
import {
  CapturedHouseholdInvite,
  inviteAndAttachCapturedHousehold,
} from './captured-household-invite';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { useProposalMirrorData } from '../drafting/proposal-mirror';
import { useDraftingState } from '@/hooks/use-drafting-state';
import { assessProposalSendReadiness } from '@/lib/document/proposal-send-validation';
import { useProposalAutosaveBarrier } from '@/hooks/use-proposal-autosave-barrier';
import {
  flushProposalAutosaves,
  getProposalAutosaveSnapshot,
  isProposalAutosaveSnapshotClean,
  ProposalAutosaveBarrierError,
} from '@/lib/proposal-autosave-registry';

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

function normalizeOptionalCcEmail(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function isValidOptionalCcEmail(value: string): boolean {
  const normalized = normalizeOptionalCcEmail(value);
  return (
    !normalized ||
    (normalized.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
  );
}

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

type DeliveryRecovery = {
  dispatchId: string;
  sentAt: string;
  state: ProposalEmailDeliveryState;
  retryable: boolean;
  detail?: string;
};

function deliveryRecoveryMessage(recovery: DeliveryRecovery): string {
  if (
    !recovery.retryable &&
    (recovery.state === 'failed' || recovery.state === 'ambiguous')
  ) {
    return 'The proposal is sent, but the safe email retry window has ended. Confirm delivery with the client directly; Patina will not risk sending a duplicate.';
  }
  switch (recovery.state) {
    case 'pending':
      return 'The proposal is sent. Its email is queued but has not been dispatched yet.';
    case 'in_flight':
      return 'The proposal is sent. Email delivery is still being confirmed.';
    case 'suppressed':
      return 'The proposal is sent, but this client is currently suppressed from email. Follow up directly or correct their email settings.';
    case 'failed':
      return 'The proposal is sent, but the email provider rejected this attempt.';
    case 'ambiguous':
      return 'The proposal is sent, but delivery could not be confirmed. Checking again is safe and will not create a second proposal send.';
    case 'delivered':
      return 'The proposal email was delivered to the provider.';
    case 'unconfirmed':
      return 'The proposal is sent, but email delivery could not be confirmed and the safe retry window has ended. Confirm with the client directly; Patina will not risk a duplicate.';
  }
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
  const proposalQuery = useProposal(proposalId);
  const proposal = proposalQuery.data as any;
  const { data: versions } = useProposalVersions(proposalId);
  const { data: capturedHousehold, isLoading: capturedHouseholdLoading } =
    useClient(proposal?.designer_client_id ?? '');
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
  const retryProposalSend = useRetryProposalSend({ errorSurface: 'inline' });
  const attachClient = useAttachDocumentClient();
  const inviteAndLinkClient = useInviteAndLinkClient();
  const { toast } = useToast();

  // A sibling version already accepted? Sending this one won't affect it.
  const hasAcceptedSibling = (versions ?? []).some(
    (v) => v.id !== proposalId && v.status === 'accepted',
  );

  const [ccEmail, setCcEmail] = useState('');
  const [expiryDays, setExpiryDays] = useState('14');
  const [personalMessage, setPersonalMessage] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [acknowledgedIncomplete, setAcknowledgedIncomplete] = useState(false);
  const [isPreparingSend, setIsPreparingSend] = useState(false);
  const sendAttemptInFlight = useRef(false);
  const [refreshedGaps, setRefreshedGaps] = useState<string[] | null>(null);
  const [refreshedClientData, setRefreshedClientData] = useState<
    NonNullable<typeof clientPayload.data> | null
  >(null);
  const [clientCopyReviewState, setClientCopyReviewState] = useState<
    'idle' | 'flushing' | 'ready' | 'error'
  >('idle');
  const [clientCopyReviewError, setClientCopyReviewError] = useState<
    string | null
  >(null);
  const clientCopyReviewAttempt = useRef(0);
  const [deliveryRecovery, setDeliveryRecovery] =
    useState<DeliveryRecovery | null>(null);
  const committedDispatchId =
    typeof proposal?.proposal_send_dispatch_id === 'string'
      ? proposal.proposal_send_dispatch_id
      : null;
  const committedSentAt =
    typeof proposal?.sent_at === 'string' ? proposal.sent_at : null;
  const shouldReadDeliveryStatus =
    open &&
    Boolean(proposal && proposal.status !== 'draft') &&
    Boolean(committedDispatchId && committedSentAt);
  const deliveryStatus = useProposalSendDispatchStatus({
    proposalId,
    dispatchId: committedDispatchId,
    sentAt: committedSentAt,
    enabled: shouldReadDeliveryStatus,
  });

  useEffect(() => {
    setDeliveryRecovery(null);
  }, [proposalId]);

  useEffect(() => {
    if (!open || !proposal || proposal.status === 'draft') {
      setDeliveryRecovery(null);
      return;
    }
    if (deliveryStatus.data) {
      setDeliveryRecovery({
        dispatchId: deliveryStatus.data.dispatchId,
        sentAt: deliveryStatus.data.sentAt,
        state: deliveryStatus.data.state,
        retryable: deliveryStatus.data.retryable,
        detail: deliveryStatus.data.detail,
      });
    } else if (deliveryStatus.isError) {
      setDeliveryRecovery(null);
    }
  }, [
    deliveryStatus.data,
    deliveryStatus.isError,
    open,
    proposal,
  ]);

  const sourceGapsFingerprint = JSON.stringify(draftingState.gaps);
  useEffect(() => {
    setRefreshedGaps(null);
  }, [sourceGapsFingerprint]);

  useEffect(() => {
    setRefreshedClientData(null);
  }, [clientPayload.data]);

  const effectiveGaps = refreshedGaps ?? draftingState.gaps;
  const effectiveClientData = refreshedClientData ?? clientPayload.data;
  const autosaveBarrier = useProposalAutosaveBarrier(proposalId);

  const clientPayloadRef = useRef(clientPayload);
  clientPayloadRef.current = clientPayload;
  const draftingVerificationRef = useRef(draftingVerification);
  draftingVerificationRef.current = draftingVerification;

  const readClientCopyAfterAutosaves = useCallback(async () => {
    // Flush, then read. If a background control queues another patch during
    // the reads, repeat so the reviewed snapshot is always bounded by a clean
    // proposal-scoped autosave barrier.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await flushProposalAutosaves(proposalId);
      const beforeRead = getProposalAutosaveSnapshot(proposalId);
      if (!isProposalAutosaveSnapshotClean(beforeRead)) continue;

      const refreshDrafting = draftingVerificationRef.current.refresh;
      if (!refreshDrafting) {
        throw new Error(
          'The proposal readiness check is unavailable. Refresh the page before sending.',
        );
      }

      const [freshClientPayload, freshDraftingState] = await Promise.all([
        clientPayloadRef.current.refetch(),
        refreshDrafting(),
      ]);
      if (freshClientPayload.error) throw freshClientPayload.error;
      if (!freshClientPayload.data?.sendSnapshot) {
        throw new Error(
          'The latest client copy could not be verified. Refresh and review it before sending.',
        );
      }

      const afterRead = getProposalAutosaveSnapshot(proposalId);
      // Clean alone is not sufficient: a buffer can become dirty, save, and
      // return to clean while these reads are in flight. Its revision proves
      // whether the reviewed mirror was bounded by one stable registry state.
      if (
        isProposalAutosaveSnapshotClean(afterRead) &&
        afterRead.revision === beforeRead.revision
      ) {
        return {
          clientData: freshClientPayload.data,
          draftingGaps: freshDraftingState.gaps,
        };
      }
    }

    throw new ProposalAutosaveBarrierError(
      'Proposal edits changed during review. Wait for saving to finish, then review again.',
    );
  }, [proposalId]);

  useEffect(() => {
    const attempt = ++clientCopyReviewAttempt.current;
    if (!open) {
      setClientCopyReviewState('idle');
      setClientCopyReviewError(null);
      return;
    }

    setClientCopyReviewState('flushing');
    setClientCopyReviewError(null);
    void readClientCopyAfterAutosaves()
      .then(({ clientData, draftingGaps }) => {
        if (clientCopyReviewAttempt.current !== attempt) return;
        setRefreshedClientData(clientData);
        setRefreshedGaps(draftingGaps);
        setClientCopyReviewState('ready');
      })
      .catch((error) => {
        if (clientCopyReviewAttempt.current !== attempt) return;
        setClientCopyReviewState('error');
        setClientCopyReviewError(
          error instanceof Error
            ? error.message
            : 'Proposal edits could not be saved and reviewed.',
        );
      });

    return () => {
      if (clientCopyReviewAttempt.current === attempt) {
        clientCopyReviewAttempt.current += 1;
      }
    };
  }, [open, proposalId, readClientCopyAfterAutosaves]);

  const proposalWritesPending = useIsMutating({
    predicate: (mutation) => {
      const mutationDomain = mutation.options.mutationKey?.[0];
      if (
        mutationDomain !== 'proposal-payment-schedule' &&
        mutationDomain !== PROPOSAL_CLIENT_MUTATION_KEY
      ) {
        return false;
      }
      const variables = mutation.state.variables as
        | { proposalId?: string; targetProposalId?: string }
        | undefined;
      return (
        variables?.proposalId === proposalId ||
        variables?.targetProposalId === proposalId
      );
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

  const autosaveReviewError =
    autosaveBarrier.error !== null
      ? `Proposal edits could not be saved: ${autosaveBarrier.error}`
      : clientCopyReviewState === 'error'
        ? clientCopyReviewError
        : null;
  const clientCopyError = clientPayload.error || draftingState.error;
  const checkingAutosaves =
    !autosaveReviewError &&
    (clientCopyReviewState === 'idle' ||
      clientCopyReviewState === 'flushing' ||
      autosaveBarrier.dirty ||
      autosaveBarrier.flushing);
  const checkingClientCopy =
    !clientCopyError &&
    (clientPayload.isLoading ||
      clientPayload.isFetching ||
      draftingState.isLoading ||
      draftingVerification.isFetching ||
      proposalWritesPending > 0 ||
      checkingAutosaves ||
      isPreparingSend);
  const hasBlockers = (readiness?.blockers.length ?? 0) > 0;
  const incompleteIsAcknowledged =
    !readiness?.requiresIncompleteAcknowledgement || acknowledgedIncomplete;

  const clientEmail: string | undefined = proposal?.client?.email ?? undefined;
  const normalizedCcEmail = normalizeOptionalCcEmail(ccEmail);
  const ccEmailError = isValidOptionalCcEmail(ccEmail)
    ? null
    : 'Enter a valid CC email address before sending.';
  const sentProposalNeedsDeliveryStatus =
    Boolean(proposal && proposal.status !== 'draft') && !deliveryRecovery;
  const deliveryStatusLoadError =
    sentProposalNeedsDeliveryStatus &&
    (deliveryStatus.isError ||
      !committedDispatchId ||
      !committedSentAt);

  useEffect(() => {
    setAcknowledgedIncomplete(false);
  }, [open, reviewFingerprint]);

  const canSend = Boolean(
    proposal?.status === 'draft' &&
      !deliveryRecovery &&
      proposal?.client_id &&
      clientEmail &&
      readiness &&
      reviewFingerprint &&
      effectiveClientData?.sendSnapshot &&
      clientCopyReviewState === 'ready' &&
      isProposalAutosaveSnapshotClean(autosaveBarrier) &&
      !checkingClientCopy &&
      !autosaveReviewError &&
      !clientCopyError &&
      !ccEmailError &&
      !hasBlockers &&
      incompleteIsAcknowledged,
  );

  const handleSend = async () => {
    if (!canSend || sendAttemptInFlight.current) return;

    sendAttemptInFlight.current = true;
    setIsPreparingSend(true);
    setSendError(null);
    setClientCopyReviewState('flushing');
    setClientCopyReviewError(null);

    const validUntil = expiryDays
      ? new Date(Date.now() + parseInt(expiryDays) * 86400000).toISOString()
      : undefined;

    let clientCopyVerified = false;
    try {
      const { clientData: freshClientData, draftingGaps } =
        await readClientCopyAfterAutosaves();
      clientCopyVerified = true;
      setClientCopyReviewState('ready');

      const freshReadiness = assessProposalSendReadiness({
        proposalTotalCents: proposal.total_amount ?? 0,
        clientTotalCents: freshClientData.totalCents,
        milestones: freshClientData.milestones,
        draftingGaps,
      });
      const freshReviewFingerprint = sendReviewFingerprint({
        proposalTotalCents: proposal.total_amount ?? 0,
        clientTotalCents: freshClientData.totalCents,
        sendSnapshot: freshClientData.sendSnapshot,
        draftingGaps,
        blockers: freshReadiness.blockers,
        warnings: freshReadiness.warnings,
      });

      if (freshReviewFingerprint !== reviewFingerprint) {
        setRefreshedClientData(freshClientData);
        setRefreshedGaps(draftingGaps);
        setAcknowledgedIncomplete(false);
        setSendError(
          'The client copy changed during the final check. Review the updated details, then send again.',
        );
        return;
      }

      const result = await sendProposal.mutateAsync({
        proposalId,
        expectedSnapshot: freshClientData.sendSnapshot,
        personalMessage: personalMessage || undefined,
        ccEmail: normalizedCcEmail,
        validUntil,
      });
      proposalEvents.sent({
        proposalId,
        hasPersonalMessage: !!personalMessage,
        hasCcEmail: !!normalizedCcEmail,
        itemCount: proposal?.items?.length ?? 0,
        totalAmount: proposal?.total_amount ?? 0,
      });
      // One act, many surfaces (§5): the send flipped the proposal AND
      // superseded siblings — refetch the document/desk read models so the line
      // stamp, margin, and Desk move together. (useSendProposal already
      // invalidates the proposal keys.)
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      void qc.invalidateQueries({ queryKey: ['desk-engagements'] });
      if (result._emailDispatched) {
        onSent?.();
        onClose();
      } else {
        const recovery: DeliveryRecovery = {
          dispatchId: result.proposal_send_dispatch_id ?? '',
          sentAt: result.sent_at ?? '',
          state: result._emailDeliveryState,
          retryable: result._emailRetryable,
          detail: result._emailDispatchDetail,
        };
        setDeliveryRecovery(recovery);
        toast(deliveryRecoveryMessage(recovery), 'warning');
      }
    } catch (err) {
      console.error('Failed to send proposal:', err);
      if (!clientCopyVerified || err instanceof ProposalAutosaveBarrierError) {
        setClientCopyReviewState('error');
        setClientCopyReviewError(
          err instanceof Error
            ? err.message
            : 'Proposal edits could not be saved and reviewed.',
        );
      }
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

  const handleRetryDelivery = async () => {
    if (!deliveryRecovery?.dispatchId || !deliveryRecovery.sentAt) return;
    setSendError(null);
    try {
      const result = await retryProposalSend.mutateAsync({
        proposalId,
        dispatchId: deliveryRecovery.dispatchId,
        sentAt: deliveryRecovery.sentAt,
      });
      const next: DeliveryRecovery = {
        ...deliveryRecovery,
        state: result._emailDeliveryState,
        retryable: result._emailRetryable,
        detail: result._emailDispatchDetail,
      };
      setDeliveryRecovery(next);
      if (result._emailDispatched) {
        toast('Proposal email delivered to the provider.', 'success');
        onSent?.();
        onClose();
      }
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : 'Could not check email delivery. Try again.',
      );
    }
  };

  const handleInviteCapturedHousehold = async () => {
    if (
      !proposal?.designer_client_id ||
      !capturedHousehold?.client_email ||
      inviteAndLinkClient.isPending
    ) {
      return;
    }

    setLinkError(null);
    try {
      await inviteAndAttachCapturedHousehold({
        proposalId,
        designerClientId: proposal.designer_client_id,
        clientEmail: capturedHousehold.client_email,
        clientName: capturedHousehold.client_name ?? undefined,
        invite: inviteAndLinkClient.mutateAsync,
        attach: attachClient.mutateAsync,
      });
    } catch (err) {
      setLinkError(
        err instanceof Error
          ? err.message
          : 'Could not invite and link this client. Try again.',
      );
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

        {proposalQuery.isError ? (
          <p
            role="alert"
            className="mt-6 text-[12.5px] text-[var(--color-terracotta-ink)]"
          >
            This proposal could not be loaded. Close this panel and try again.
          </p>
        ) : !proposal ? (
          <p
            role="status"
            className="mt-6 text-[12.5px] italic text-[var(--color-aged-oak)]"
          >
            Loading…
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            {/* Link-a-client banner */}
            {!proposal.client_id && (
              <div className="rounded-[4px] border border-[rgba(196,124,92,0.4)] bg-[rgba(196,124,92,0.08)] p-3.5">
                <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--color-clay-ink)]">
                  Link a client to send
                </p>
                {proposal.designer_client_id && capturedHouseholdLoading ? (
                  <p className="text-[12.5px] italic leading-relaxed text-[var(--color-mocha)]">
                    Loading the captured household…
                  </p>
                ) : capturedHousehold?.client_email ? (
                  <CapturedHouseholdInvite
                    name={capturedHousehold.client_name}
                    email={capturedHousehold.client_email}
                    pending={
                      inviteAndLinkClient.isPending || attachClient.isPending
                    }
                    onInvite={handleInviteCapturedHousehold}
                  />
                ) : (
                  <>
                    <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
                      This proposal isn&rsquo;t linked to a client yet. Choose the
                      client it belongs to so they receive the proposal and can
                      sign it.
                    </p>
                    <div className="max-w-[320px]">
                      <ClientPicker
                        value={null}
                        onChange={(clientId) => {
                          setLinkError(null);
                          attachClient.mutate(
                            {
                              engagementKind: 'proposal',
                              targetId: proposalId,
                              clientId,
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
                  </>
                )}
                {linkError && (
                  <p
                    role="alert"
                    className="mt-2 text-[11px] leading-snug text-[var(--color-terracotta-ink)]"
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
                <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--color-clay-ink)]">
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
              <p className={labelCls}>
                Recipient
              </p>
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
              {proposal.client_id && !clientEmail && (
                <p role="alert" className="text-[12px] text-[var(--color-terracotta-ink)]">
                  Add an email to the linked client before sending.
                </p>
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
                  maxLength={254}
                  aria-invalid={ccEmailError ? true : undefined}
                  aria-describedby={
                    ccEmailError ? 'send-sheet-cc-error' : undefined
                  }
                  className={fieldCls}
                />
                {ccEmailError && (
                  <p
                    id="send-sheet-cc-error"
                    role="alert"
                    className="text-[11px] text-[var(--color-terracotta-ink)]"
                  >
                    {ccEmailError}
                  </p>
                )}
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

              {!checkingClientCopy && autosaveReviewError && (
                <p role="alert" className="mt-2 text-[12px] text-[var(--color-terracotta-ink)]">
                  {autosaveReviewError} Sending is blocked until every proposal edit is saved.
                </p>
              )}

              {!checkingClientCopy && !autosaveReviewError && clientCopyError && (
                <p role="alert" className="mt-2 text-[12px] text-[var(--color-terracotta-ink)]">
                  The client preview or proposal readiness could not be verified. Refresh before sending.
                </p>
              )}

              {!checkingClientCopy && !autosaveReviewError && !clientCopyError && hasBlockers && (
                <div role="alert" className="mt-2 text-[12px] text-[var(--color-terracotta-ink)]">
                  <p className="font-semibold">Not safe to send yet</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {readiness?.blockers.map((blocker, index) => (
                      <li key={`${blocker}-${index}`}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!checkingClientCopy &&
                !autosaveReviewError &&
                !clientCopyError &&
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
                !autosaveReviewError &&
                !clientCopyError &&
                !hasBlockers &&
                !readiness?.requiresIncompleteAcknowledgement && (
                  <p role="status" className="mt-2 text-[12px] text-[var(--color-sage)]">
                    Client total and payment schedule are ready to send.
                  </p>
                )}

              {!checkingClientCopy &&
                !autosaveReviewError &&
                effectiveClientData?.paymentSchedule.storedAmountsMatch === false && (
                  <p role="status" className="mt-2 text-[11px] text-[var(--color-aged-oak)]">
                    Payment amounts will be synchronized to the current proposal total before send.
                  </p>
                )}
            </div>

            {/* Send status and recovery */}
            {sentProposalNeedsDeliveryStatus &&
              !deliveryStatusLoadError &&
              deliveryStatus.isLoading && (
                <div
                  role="status"
                  className="rounded-[4px] border border-[var(--color-pearl)] bg-white/70 p-3 text-[12.5px] text-[var(--color-mocha)]"
                >
                  The proposal is sent. Checking its email delivery status…
                </div>
              )}

            {deliveryStatusLoadError && (
              <div
                role="alert"
                className="rounded-[4px] border border-[rgba(196,124,92,0.4)] bg-[rgba(196,124,92,0.08)] p-3 text-[12.5px] text-[var(--color-clay-ink)]"
              >
                The proposal is sent, but its email delivery status could not
                be verified. Refresh before retrying so Patina does not risk a
                duplicate email.
              </div>
            )}

            {deliveryRecovery && (
              <div
                role="status"
                className="rounded-[4px] border border-[rgba(196,124,92,0.4)] bg-[rgba(196,124,92,0.08)] p-3 text-[12.5px] text-[var(--color-clay-ink)]"
              >
                <p>{deliveryRecoveryMessage(deliveryRecovery)}</p>
                {deliveryRecovery.detail && (
                  <p className="mt-1 text-[11px] opacity-80">
                    {deliveryRecovery.detail}
                  </p>
                )}
              </div>
            )}

            {sendError && (
              <div
                role="alert"
                className="rounded-[4px] border border-[rgba(196,124,92,0.4)] bg-[rgba(196,124,92,0.08)] p-3 text-[12.5px] text-[var(--color-clay-ink)]"
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
              {proposal.status !== 'draft' || deliveryRecovery ? (
                <>
                  {deliveryRecovery?.retryable &&
                    deliveryRecovery.state !== 'suppressed' &&
                    deliveryRecovery.state !== 'delivered' && (
                      <DocumentAction
                        actionKey="retry-proposal-email"
                        variant="primary"
                        onClick={handleRetryDelivery}
                        loading={retryProposalSend.isPending}
                        loadingLabel="Checking…"
                        trailing="→"
                      >
                        {deliveryRecovery.state === 'in_flight'
                          ? 'Check delivery'
                          : 'Retry email delivery'}
                      </DocumentAction>
                    )}
                  <DocumentAction
                    actionKey="close-send-status"
                    variant="tertiary"
                    onClick={onClose}
                  >
                    Close
                  </DocumentAction>
                </>
              ) : (
                <>
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
                </>
              )}
            </DocumentActionGroup>
          </div>
        )}
      </div>
    </DocSheet>
  );
}
