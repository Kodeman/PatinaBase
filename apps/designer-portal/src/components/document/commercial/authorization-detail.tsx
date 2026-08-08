"use client";

/**
 * AuthorizationDetail — the DocSheet a row in AuthorizationsLedger opens.
 *
 *   figure band       authorized / deposit due / deposit paid / lines PO-ready
 *   deposit line       invoice id + posture copy (furnishingsDepositPosture)
 *   what-was-signed    room-grouped item table with per-line delta glyphs
 *   dispatch-retry     moved from the retired WaveDetail
 *   VoidAct            the terracotta scored act (void-supersede-act.tsx)
 */

import { useMemo, useState } from "react";
import {
  useProposalSendDispatchStatus,
  useRetryProposalSend,
} from "@patina/supabase";
import { Button } from "@/components/ui/controls";
import {
  useAuthorizationLineDrift,
  useCommercialDocument,
  useSendFurnishingsAuthorization,
} from "@/hooks/use-commercial-documents";
import { signedOnPaperNote } from "@/lib/document/commercial-documents";
import {
  furnishingsDepositPosture,
  money,
  when,
  type ProjectInstrumentItemView,
  type ProjectInstrumentView,
} from "@/lib/document/project-commerce";
import { DocSheet } from "../overlays/doc-sheet";
import {
  RECORD_ON_PAPER_ACT_LABEL,
  RecordOnPaperSheet,
} from "./record-on-paper-sheet";
import { VoidAct } from "./void-supersede-act";

const depositCopy: Record<
  ReturnType<typeof furnishingsDepositPosture>,
  string
> = {
  draft: "No deposit is due before this authorization is signed.",
  awaiting_signature: "Awaiting client signature; no deposit is due yet.",
  ready_to_execute: "Client signed; studio countersign is still required.",
  preparing_invoice: "Signed; preparing the deposit invoice.",
  invoice_ready: "Deposit invoice ready for client payment.",
};

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="block font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </span>
      <strong className="text-[13px] text-[var(--color-charcoal)]">{value}</strong>
    </span>
  );
}

function DeltaGlyph({
  item,
  currentLineTotalCents,
}: {
  item: ProjectInstrumentItemView;
  currentLineTotalCents: number | null;
}) {
  if (!item.sourceFfeItemId || currentLineTotalCents === null) return null;
  const delta = currentLineTotalCents - item.clientLineTotalCents;
  if (delta === 0) {
    return (
      <span aria-label="Unchanged since signing" className="ml-1.5 text-[var(--text-muted)]">
        —
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      aria-label={
        up
          ? `Schedule now reads ${money(Math.abs(delta))} higher than what was signed`
          : `Schedule now reads ${money(Math.abs(delta))} lower than what was signed`
      }
      className={up ? "ml-1.5 text-[var(--color-terracotta)]" : "ml-1.5 text-[var(--color-sage)]"}
      title={`${up ? "+" : "-"}${money(Math.abs(delta))} since signing`}
    >
      {up ? "▲" : "▼"}
    </span>
  );
}

function DispatchRetryBand({
  instrument,
}: {
  instrument: ProjectInstrumentView;
}) {
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const hasCommittedDelivery = Boolean(
    instrument.proposalSendDispatchId && instrument.sentAt,
  );
  const deliveryStatus = useProposalSendDispatchStatus({
    proposalId: instrument.proposalId,
    dispatchId: instrument.proposalSendDispatchId,
    sentAt: instrument.sentAt,
    enabled: instrument.state !== "draft" && hasCommittedDelivery,
  });
  const retryDelivery = useRetryProposalSend({ errorSurface: "inline" });
  const delivery = deliveryStatus.data;

  if (instrument.state === "draft") return null;

  return (
    <>
      {hasCommittedDelivery && deliveryStatus.isLoading && (
        <p role="status" className="mt-2 text-[10.5px] text-[var(--text-muted)]">
          Checking email delivery…
        </p>
      )}
      {deliveryStatus.isError && (
        <p role="alert" className="mt-2 text-[10.5px] text-[var(--color-terracotta)]">
          Email delivery status is unavailable. Refresh before retrying.
        </p>
      )}
      {!hasCommittedDelivery && (
        <p role="alert" className="mt-2 text-[10.5px] text-[var(--color-terracotta)]">
          Email delivery status is incomplete. Refresh before retrying.
        </p>
      )}
      {delivery && delivery.state !== "delivered" && (
        <div
          role="status"
          className="mt-2 border-l-2 border-[var(--color-aged-oak)] px-3 text-[11px] text-[var(--text-muted)]"
        >
          <p>
            The authorization is sent, but email delivery is
            {delivery.state === "pending" || delivery.state === "in_flight"
              ? " still being confirmed."
              : " not confirmed."}
            {delivery.retryable
              ? " Retrying uses the existing send and will not create a duplicate."
              : " Confirm delivery with the client directly."}
          </p>
          {delivery.detail && <p className="mt-1 text-[10px]">{delivery.detail}</p>}
          {delivery.retryable && (
            <Button
              className="mt-2"
              size="sm"
              variant="ghost"
              loading={retryDelivery.isPending}
              onClick={async () => {
                setDeliveryError(null);
                try {
                  await retryDelivery.mutateAsync({
                    proposalId: instrument.proposalId,
                    dispatchId: delivery.dispatchId,
                    sentAt: delivery.sentAt,
                  });
                } catch (error) {
                  setDeliveryError(
                    error instanceof Error
                      ? error.message
                      : "Email delivery could not be retried.",
                  );
                }
              }}
            >
              Retry email delivery
            </Button>
          )}
        </div>
      )}
      {deliveryError && (
        <p role="alert" className="mt-2 text-[10.5px] text-[var(--color-terracotta)]">
          {deliveryError}
        </p>
      )}
    </>
  );
}

export function AuthorizationDetail({
  projectId,
  instrument,
  clientName = "",
  open,
  onClose,
}: {
  projectId: string;
  instrument: ProjectInstrumentView | null;
  /** Prefills the signer line on the record-on-paper sheet, exactly as the
   *  design-services act already does. Threaded down from the open document's
   *  own `client_name`; optional, because a caller without one should still get
   *  the sheet (empty, typed by hand) rather than no sheet. */
  clientName?: string;
  open: boolean;
  onClose: () => void;
}) {
  const sendAuthorization = useSendFurnishingsAuthorization(projectId);
  const [sendError, setSendError] = useState<string | null>(null);
  const [recordOnPaperOpen, setRecordOnPaperOpen] = useState(false);

  const items = useMemo(
    () => (Array.isArray(instrument?.items) ? instrument.items : []),
    [instrument?.items],
  );
  const ffeItemIds = useMemo(
    () =>
      items
        .map((item) => item.sourceFfeItemId)
        .filter((id): id is string => Boolean(id)),
    [items],
  );
  const driftQuery = useAuthorizationLineDrift(ffeItemIds, open);
  const drift = driftQuery.data;
  // The paper tell for THIS instrument's own execution — read off the same
  // client signature the bundle already carries for design-services
  // (commercial-documents.ts's SIGNED_ON_PAPER_NOTE), rather than a second
  // field on the list RPC's ProjectInstrumentView. Only worth fetching once
  // the instrument is actually executed; there is nothing to have been
  // paper before that.
  const bundle = useCommercialDocument(
    instrument?.proposalId ?? "",
    open && instrument?.state === "executed",
  );
  const signatures = Array.isArray(bundle.data?.signatures)
    ? bundle.data.signatures
    : [];
  const paperSignature = signatures.find(
    (signature) => signature.party === "client" && signature.executedOnPaper,
  );
  const executedOnPaper = Boolean(paperSignature);

  if (!instrument) return null;

  const posture = furnishingsDepositPosture(instrument);
  const roomGroups = new Map<string, ProjectInstrumentItemView[]>();
  for (const item of items) {
    const key = item.roomName || "Unassigned";
    const list = roomGroups.get(key) ?? [];
    list.push(item);
    roomGroups.set(key, list);
  }
  const readyLineCount =
    instrument.state === "executed"
      ? Number.isFinite(instrument.itemCount)
        ? instrument.itemCount
        : items.length
      : 0;

  const send = async () => {
    setSendError(null);
    try {
      await sendAuthorization.mutateAsync(instrument.proposalId);
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "The authorization could not be sent.",
      );
    }
  };

  return (
    <DocSheet
      open={open}
      onClose={onClose}
      title={`Authorization № ${instrument.number} · ${instrument.name}`}
      wide
    >
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-clay)]">
          Authorization № {instrument.number}
        </p>
        <h2 className="mt-1 font-heading text-xl text-[var(--color-charcoal)]">
          {instrument.name}
        </h2>

        {instrument.state === "draft" && (
          <Button
            className="mt-3"
            size="sm"
            loading={sendAuthorization.isPending}
            onClick={send}
          >
            Send for signature
          </Button>
        )}
        {instrument.state === "sent" && (
          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            onClick={() => setRecordOnPaperOpen(true)}
          >
            {RECORD_ON_PAPER_ACT_LABEL.furnishings}
          </Button>
        )}
        {sendError && (
          <p role="alert" className="mt-2 text-[11px] text-[var(--color-terracotta)]">
            {sendError}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[var(--doc-ink-border)] py-4 sm:grid-cols-4">
          <Figure label="authorized" value={money(instrument.totalAmountCents)} />
          <Figure label="deposit due" value={money(instrument.depositRequiredCents)} />
          <Figure label="deposit paid" value={instrument.depositPaid ? "Yes" : "Not yet"} />
          <Figure label="lines PO-ready" value={String(readyLineCount)} />
        </div>

        <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
          {instrument.checkpointId
            ? "Linked to a budget checkpoint"
            : "No budget checkpoint linked"}{" "}
          · {depositCopy[posture]}
          {instrument.depositInvoiceId ? " Deposit invoice on file." : ""}
        </p>

        <DispatchRetryBand instrument={instrument} />

        {instrument.state === "executed" && executedOnPaper && (
          <p className="mt-2 text-[10.5px] italic text-[var(--text-muted)]">
            {signedOnPaperNote(paperSignature?.paperSignedOn)}
          </p>
        )}

        <div className="mt-5">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
            What was signed
          </p>
          {items.length === 0 ? (
            <p className="mt-3 text-[11px] text-[var(--text-muted)]">
              Signed line details are unavailable.
            </p>
          ) : (
            <>
              <div
                data-testid="authorization-lines-scroll"
                className="max-w-full overflow-x-auto overscroll-x-contain"
              >
                {Array.from(roomGroups.entries()).map(([roomName, roomItems]) => (
                  <div key={roomName} className="mt-3">
                    <p className="font-mono text-[9.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      {roomName}
                    </p>
                    <table className="mt-1 w-full min-w-[440px] text-left text-[11px]">
                      <tbody>
                        {roomItems.map((item) => (
                          <tr key={item.id} className="border-t border-[var(--doc-ink-border)]/60">
                            <td className="py-2 pr-2">
                              {item.name}
                              <span className="block text-[9px] text-[var(--text-muted)]">
                                {item.itemType}
                              </span>
                            </td>
                            <td className="py-2 pr-2 text-right">{item.quantity}</td>
                            <td className="py-2 text-right">
                              {money(item.clientUnitPriceCents)} each
                              <span className="ml-1 inline-flex items-center">
                                {money(item.clientLineTotalCents)} total
                                <DeltaGlyph
                                  item={item}
                                  currentLineTotalCents={
                                    item.sourceFfeItemId
                                      ? (drift?.get(item.sourceFfeItemId)?.currentLineTotalCents ?? null)
                                      : null
                                  }
                                />
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] text-[var(--text-muted)]">
                Quantities, client prices, and checkpoint linkage are immutable in
                this authorization snapshot. ▲/▼ compares a line to the
                schedule&rsquo;s current figure for the same item.
              </p>
            </>
          )}
        </div>

        {(instrument.state === "draft" || instrument.state === "sent") && (
          <div className="mt-5 border-t border-[var(--doc-ink-border)] pt-4">
            <VoidAct
              projectId={projectId}
              instrument={instrument}
              onVoided={onClose}
            />
          </div>
        )}
      </div>

      <RecordOnPaperSheet
        kind="furnishings"
        proposalId={instrument.proposalId}
        projectId={projectId}
        clientName={clientName}
        open={recordOnPaperOpen}
        onClose={() => setRecordOnPaperOpen(false)}
        onRecorded={() => setRecordOnPaperOpen(false)}
      />
    </DocSheet>
  );
}
