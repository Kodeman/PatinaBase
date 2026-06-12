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
import { useSendPurchaseOrder } from '@patina/supabase';
import { poSendErrorMessage } from '@/components/portal/procurement/po-send-actions';

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
}

export function PoPreview({
  open,
  onOpenChange,
  purchaseOrderId,
  vendorName,
  vendorEmailHint,
  mode = 'send',
  onSent,
}: PoPreviewProps) {
  const qc = useQueryClient();
  const sendPo = useSendPurchaseOrder();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [poNumber, setPoNumber] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
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
        if (!r.signedUrl) setError('The PDF rendered but the preview link could not be created.');
      })
      .catch((e: Error) => setError(poSendErrorMessage(e.message)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purchaseOrderId]);

  useEffect(() => {
    if (!open) previewedFor.current = null;
  }, [open]);

  if (!open) return null;

  const send = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await sendPo.mutateAsync({
        purchaseOrderId,
        mode: 'send',
        recipientEmail: vendorEmailHint ?? undefined,
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
      setSending(false);
    }
  };

  return (
    <div role="dialog" aria-label="Purchase order preview" className="fixed inset-0 z-[60]">
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
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-clay)]">
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
            className="rounded-[3px] border border-transparent px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)] hover:border-[rgba(196,165,123,0.35)] hover:text-[var(--color-clay)]"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 bg-[#3a3631]">
          {signedUrl ? (
            <iframe title="Purchase order PDF" src={signedUrl} className="h-full w-full border-0" />
          ) : (
            <p className="px-5 py-6 text-[12px] italic text-[rgba(250,247,242,0.6)]">
              {error ?? 'Rendering the purchase order…'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--color-pearl)] px-5 py-3">
          {error && signedUrl && (
            <p className="text-[11px] text-[#C4836F]">{error}</p>
          )}
          {warning && !error && (
            <p className="text-[11px] text-[var(--text-muted)]">{warning}</p>
          )}
          <span className="ml-auto text-[11px] text-[var(--text-muted)]">
            {vendorEmailHint ? `to ${vendorEmailHint}` : 'no vendor email on file'}
          </span>
          <button
            type="button"
            disabled={!signedUrl || !vendorEmailHint || sending}
            onClick={() => void send()}
            className="rounded-[4px] border border-[var(--color-clay)] bg-[var(--color-clay)] px-3.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {sending ? 'Sending…' : mode === 'resend' ? 'Resend to vendor' : 'Send to vendor'}
          </button>
        </div>
      </div>
    </div>
  );
}
