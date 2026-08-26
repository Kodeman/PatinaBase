'use client';

/**
 * The preview-confirm (R18, R11 precedent: review-then-send). The PO
 * renders as PAPER over the document — "This is what the vendor receives"
 * — and the one action is Send to vendor. No confirm dialogs anywhere in
 * the weave: the confirm step is the document showing you the document.
 *
 * One component, both homes (unfold action row + Orders ledger rows).
 * Mount with mode 'send' for drafted/unsent POs, 'resend' for sent ones.
 * On open it calls po-send mode 'preview' (numbers + renders + stores the
 * PDF, stamps nothing) and shows the signed PDF; Send posts mode 'send'.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLogPOAcknowledgment, useSendPurchaseOrder } from '@patina/supabase';
import { poSendErrorMessage } from '@/components/portal/procurement/po-send-actions';
import { procurementEvents } from '@/lib/analytics/procurement-events';
import { fmtDay } from '@/lib/document/format';
import { DateTextInput } from './date-text-input';
import { DocumentAction, DocumentActionGroup } from './document-action';

export interface PoPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrderId: string;
  vendorName: string;
  /** Resolved client-side recipient hint (clientVendorEmailHint). */
  vendorEmailHint: string | null;
  /** 'resend' renders the muted re-send wording for already-sent POs. */
  mode?: 'send' | 'resend';
  onSent?: (sentAtIso: string) => void;
  /**
   * PRC-07 (R84): ack context for the resend preview. When the PO has been
   * sent but never acknowledged, the paper offers the log-acknowledgment act
   * (phoned/emailed acks stamp acknowledged_at). All optional — the unfold's
   * drafted-PO mount omits them and no ack affordance renders.
   */
  sentAt?: string | null;
  acknowledgedAt?: string | null;
  vendorPoNumber?: string | null;
  confirmedEta?: string | null;
}

/**
 * PRC-07 (R84) — the manual vendor-acknowledgment act, in Document grammar.
 * Ports the LogAcknowledgmentPopover's logic (log_po_acknowledgment RPC,
 * 00186/00190: ack date stamped server-side NOW() idempotently; PO # and ETA
 * coalesce — blank keeps what's on file) with quiet inline confirm (R51) and
 * the R83 inline error band. One form, two homes: the resend preview's paper
 * and the Orders book's rows — both converged onto the same laid-paper ink
 * (R96), so `tone` is retained for caller compatibility but no longer changes
 * anything (the DocSheet `variant` precedent).
 */
export function LogAckInline({
  purchaseOrderId,
  vendorPoNumber,
  confirmedEta,
  sentAt,
  onLogged,
}: {
  purchaseOrderId: string;
  vendorPoNumber?: string | null;
  confirmedEta?: string | null;
  /** ISO sent_at when known — keeps the days-to-ack metric honest. */
  sentAt?: string | null;
  /** Retained for backward compatibility — both tones are now the same
   *  laid-paper ink (R96), so the prop no longer changes anything. */
  tone?: 'paper' | 'book';
  onLogged?: () => void;
}) {
  const qc = useQueryClient();
  const logAck = useLogPOAcknowledgment({ errorSurface: 'inline' });
  const [poNo, setPoNo] = useState(vendorPoNumber ?? '');
  const [eta, setEta] = useState(confirmedEta ? confirmedEta.slice(0, 10) : '');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label =
    'font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]';
  const input =
    'rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-1 font-mono text-[10.5px] text-[var(--color-charcoal)] outline-none';

  const confirm = async () => {
    if (logAck.isPending) return;
    setError(null);
    try {
      await logAck.mutateAsync({
        purchaseOrderId,
        // undefined preserves the stored value (the RPC coalesces NULL inputs).
        vendorPoNumber: poNo.trim() || undefined,
        confirmedEta: eta || undefined,
      });
      procurementEvents.poAcknowledgmentLogged({
        days_since_sent: sentAt
          ? Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(sentAt).getTime()) / 86_400_000,
              ),
            )
          : null,
      });
      // One act, many surfaces (§5): unfold PO cell, ledger row, Desk need.
      void qc.invalidateQueries({ queryKey: ['project-ffe-items'] });
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      setDone(true);
      onLogged?.();
    } catch (e) {
      setError(
        (e as Error).message || 'The acknowledgment could not be logged.',
      );
    }
  };

  if (done) {
    // R51: the quiet confirmation — a line of text at the act site.
    return (
      <p className="text-[10.5px] text-[var(--color-charcoal)]">
        Acknowledged — logged {fmtDay(new Date().toISOString())}.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-[10px] text-[var(--text-muted)]">
        Stamped as of today — PO # and ETA are optional, blank keeps
        what&rsquo;s on file.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className={label}>Vendor PO #</span>
          <input
            type="text"
            value={poNo}
            onChange={(e) => setPoNo(e.target.value)}
            placeholder="NA-2026-…"
            className={`w-[130px] ${input}`}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className={label}>Confirmed ETA</span>
          <DateTextInput
            value={eta || null}
            onChange={(value) => setEta(value ?? '')}
            ariaLabel="Confirmed ETA"
            className={input}
          />
        </label>
        <DocumentAction
          actionKey="log-po-acknowledgment"
          surfaceKey="orders"
          regionKey="po-acknowledgment"
          variant="primary"
          disabled={logAck.isPending}
          loading={logAck.isPending}
          loadingLabel="Logging…"
          onClick={() => void confirm()}
        >
          Log acknowledgment
        </DocumentAction>
      </div>
      {error && (
        // R83: the failure renders as a quiet inline band at the act site.
        <div role="alert" className="mt-1.5 text-[10.5px] text-[var(--color-terracotta-ink)]">
          <p>{error}</p>
          <DocumentActionGroup
            surfaceKey="orders"
            regionKey="po-acknowledgment-error"
            className="mt-2"
          >
            <DocumentAction
              actionKey="retry-po-acknowledgment"
              variant="primary"
              onClick={() => void confirm()}
            >
              Try again
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      )}
    </div>
  );
}

export function PoPreview({
  open,
  onOpenChange,
  purchaseOrderId,
  vendorName,
  vendorEmailHint,
  mode = 'send',
  onSent,
  sentAt,
  acknowledgedAt,
  vendorPoNumber,
  confirmedEta,
}: PoPreviewProps) {
  const qc = useQueryClient();
  // R83: failures render inline on this paper — no global toast (D2).
  const sendPo = useSendPurchaseOrder({ errorSurface: 'inline' });
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [poNumber, setPoNumber] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // PRC-27 (R84): the manual sent-stamp for phone / fax / trade-portal orders.
  const [marking, setMarking] = useState(false);
  const previewedFor = useRef<string | null>(null);

  // Render + store the PDF the moment the paper lifts (mode 'preview'
  // stamps nothing — the server always allows it).
  useEffect(() => {
    if (!open || previewedFor.current === purchaseOrderId) return;
    previewedFor.current = purchaseOrderId;
    setSignedUrl(null);
    setError(null);
    setWarning(null);
    sendPo
      .mutateAsync({ purchaseOrderId, mode: 'preview' })
      .then((r) => {
        setSignedUrl(r.signedUrl ?? null);
        setPoNumber(r.poNumber ?? null);
        if (r.warnings?.length) setWarning(poSendErrorMessage(r.warnings[0]));
        if (!r.signedUrl)
          setError(
            'The PDF rendered but the preview link could not be created.',
          );
      })
      .catch((e: Error) => setError(poSendErrorMessage(e.message)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purchaseOrderId]);

  useEffect(() => {
    if (!open) previewedFor.current = null;
  }, [open]);

  if (!open) return null;

  // One runner, two stamps (PRC-27): 'send' emails the vendor; 'mark_sent'
  // stamps sent_at without emailing — the phone / fax / trade-portal path
  // ported from po-send-actions. Both clear the Desk's po_unsent nag through
  // the same invalidations (the derivation reads document-state).
  const stamp = async (sendMode: 'send' | 'mark_sent') => {
    if (sending || marking) return;
    (sendMode === 'send' ? setSending : setMarking)(true);
    setError(null);
    try {
      const r = await sendPo.mutateAsync({
        purchaseOrderId,
        mode: sendMode,
        recipientEmail:
          sendMode === 'send' ? (vendorEmailHint ?? undefined) : undefined,
      });
      const stamped = new Date().toISOString();
      // One act, many surfaces (§5): PO cell, Orders row, Desk, margin.
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      void qc.invalidateQueries({ queryKey: ['project-ffe-items'] });
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      void qc.invalidateQueries({ queryKey: ['margin-items'] });
      onSent?.(stamped);
      onOpenChange(false);
      void r;
    } catch (e) {
      setError(poSendErrorMessage((e as Error).message));
    } finally {
      (sendMode === 'send' ? setSending : setMarking)(false);
    }
  };
  const send = () => stamp('send');

  return (
    <div
      role="dialog"
      aria-label="Purchase order preview"
      className="fixed inset-0 z-[60]"
    >
      {/* The desk shows through around the lifted paper — no scrim-as-dialog,
          just the document receding behind its own artifact. */}
      <button
        type="button"
        aria-label="Put the preview down"
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 cursor-default bg-[rgba(44,41,38,0.45)]"
      />
      <div className="absolute inset-x-0 top-[4vh] mx-auto flex h-[92vh] w-[min(720px,94vw)] flex-col rounded-[6px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)]">
        <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-pearl)] px-5 py-3">
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-clay-ink)]">
              {mode === 'resend' ? 'Resend purchase order' : 'Purchase order'}
              {poNumber ? ` · ${poNumber}` : ''}
            </p>
            <p className="mt-0.5 font-heading text-[15px] text-[var(--color-charcoal)]">
              This is what {vendorName} receives
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-[3px] border border-transparent px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)] hover:border-[rgba(196,165,123,0.35)] hover:text-[var(--color-clay-ink)]"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 bg-[#3a3631]">
          {signedUrl ? (
            <iframe
              title="Purchase order PDF"
              src={signedUrl}
              className="h-full w-full border-0"
            />
          ) : (
            <p className="px-5 py-6 text-[12px] italic text-[rgba(250,247,242,0.6)]">
              {error ?? 'Rendering the purchase order…'}
            </p>
          )}
        </div>

        {/* PRC-07 (R84): a sent-but-unacknowledged PO offers the ack act on
            the paper itself — the vendor phoned or emailed; log it here. */}
        {mode === 'resend' && sentAt && !acknowledgedAt && (
          <div className="border-t border-[var(--color-pearl)] px-5 py-2.5">
            <p className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.08em] text-[var(--color-clay-ink)]">
              Vendor confirmed by phone or email?
            </p>
            <LogAckInline
              purchaseOrderId={purchaseOrderId}
              vendorPoNumber={vendorPoNumber}
              confirmedEta={confirmedEta}
              sentAt={sentAt}
              tone="paper"
            />
          </div>
        )}

        <DocumentActionGroup
          surfaceKey="orders"
          regionKey="po-preview"
          className="border-t border-[var(--color-pearl)] px-5 py-3"
        >
          {error && signedUrl && (
            <p className="text-[11px] text-[var(--color-terracotta-ink)]">{error}</p>
          )}
          {warning && !error && (
            <p className="text-[11px] text-[var(--text-muted)]">{warning}</p>
          )}
          {/* PRC-27: the manual path — always available on an unsent PO
              (deliberately not gated on the PDF or a vendor email: an
              out-of-sync PO's fix is exactly "mark it sent manually"). */}
          {mode === 'send' && (
            <DocumentAction
              actionKey="mark-po-sent-manually"
              variant="secondary"
              disabled={sending || marking}
              loading={marking}
              loadingLabel="Marking…"
              onClick={() => void stamp('mark_sent')}
              title="For orders placed through a vendor portal, phone, or showroom — stamps the sent date without emailing."
            >
              Released by phone / portal — mark as sent
            </DocumentAction>
          )}
          <span className="ml-auto text-[11px] text-[var(--text-muted)]">
            {vendorEmailHint
              ? `to ${vendorEmailHint}`
              : 'no vendor email on file'}
          </span>
          <DocumentAction
            actionKey={
              mode === 'resend' ? 'resend-po-to-vendor' : 'send-po-to-vendor'
            }
            variant="primary"
            disabled={!signedUrl || !vendorEmailHint || sending || marking}
            loading={sending}
            loadingLabel="Sending…"
            onClick={() => void send()}
          >
            {mode === 'resend' ? 'Resend to vendor' : 'Send to vendor'}
          </DocumentAction>
        </DocumentActionGroup>
      </div>
    </div>
  );
}
