'use client';

import { useEffect, useState } from 'react';
import { formatCents, ledgerLineParts, type SettlementPreview } from '@patina/fulfillment';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/portal/toast-provider';
import { useSettlementPreview, useSettlePo } from '@/hooks/use-fulfillment-settlement';

// Settlement dialog (S7, spec §8) — the three-way match (PO value · vendor
// invoice · variance vs tolerance) with the T3 + pledge (+ T6) posting shown in
// mono as "projected posting" BEFORE commit (fulfillment_settle_po_preview,
// preview == posted). An in-tolerance variance auto-accepts; beyond tolerance a
// typed reason field appears and is required. Commit → fulfillment_settle_po.

const labelCls = 'text-[0.53rem] uppercase tracking-[0.13em] text-[var(--text-muted)]';
const inputCls =
  'w-full border-b border-[var(--border-default)] bg-transparent py-1 text-[0.9rem] tabular-nums outline-none focus:border-[var(--accent-primary)]';

export interface SettleDialogProps {
  poId: string;
  poNumber: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettleDialog({ poId, poNumber, open, onOpenChange }: SettleDialogProps) {
  const { toast } = useToast();
  const previewMut = useSettlementPreview(poId);
  const settleMut = useSettlePo(poId);

  const [invoice, setInvoice] = useState(''); // dollars
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [seeded, setSeeded] = useState(false);

  // On open: preview at invoice=0 to learn the PO value, then pre-fill the
  // invoice input with it (so variance starts at $0).
  useEffect(() => {
    if (!open) {
      setSeeded(false);
      setPreview(null);
      setInvoice('');
      setReason('');
      return;
    }
    if (seeded) return;
    previewMut
      .mutateAsync({ vendorInvoiceCents: 0 })
      .then((res) => {
        setInvoice((res.expectedCents / 100).toFixed(2));
        setSeeded(true);
      })
      .catch(() => setSeeded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Live preview as the operator types the invoice.
  useEffect(() => {
    if (!open || !seeded) return;
    const cents = Math.round(Number(invoice || '0') * 100);
    let cancelled = false;
    const t = setTimeout(() => {
      previewMut
        .mutateAsync({ vendorInvoiceCents: Number.isFinite(cents) ? cents : 0 })
        .then((res) => {
          if (!cancelled) setPreview(res);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, open, seeded]);

  const commit = async () => {
    if (!preview) return;
    if (preview.requiresReason && reason.trim() === '') {
      toast('This variance is beyond tolerance — a typed reason is required', 'error');
      return;
    }
    try {
      await settleMut.mutateAsync({
        vendorInvoiceCents: Math.round(Number(invoice || '0') * 100),
        varianceReason: reason.trim() || undefined,
      });
      toast('Settled', 'success');
      onOpenChange(false);
    } catch (e) {
      toast((e as Error).message || 'Failed to settle', 'error');
    }
  };

  const varianceColor = preview?.autoAccepted
    ? 'var(--color-sage, var(--color-success))'
    : 'var(--color-terracotta, var(--color-error))';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="settle-dialog">
        <SheetHeader>
          <SheetTitle>Settle {poNumber ?? 'PO'}</SheetTitle>
          <SheetDescription>Three-way match — enter the vendor invoice total.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-3 gap-3" data-testid="settle-three-way">
          <div>
            <div className={labelCls}>PO value</div>
            <div className="mt-1 text-[0.9rem] tabular-nums" style={{ fontFamily: 'var(--font-meta)' }}>
              {preview ? formatCents(preview.expectedCents) : '—'}
            </div>
          </div>
          <div>
            <div className={labelCls}>Vendor invoice</div>
            <input
              className={inputCls}
              inputMode="decimal"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              data-testid="settle-invoice"
              placeholder="0.00"
            />
          </div>
          <div>
            <div className={labelCls}>Variance</div>
            <div
              className="mt-1 text-[0.9rem] tabular-nums"
              style={{ fontFamily: 'var(--font-meta)', color: varianceColor }}
              data-testid="settle-variance"
            >
              {preview
                ? `${preview.varianceCents >= 0 ? '+' : ''}${formatCents(preview.varianceCents)}`
                : '—'}
            </div>
            {preview && (
              <div
                data-testid="settle-status"
                className="text-[0.6rem] text-[var(--text-muted)]"
                style={{ fontFamily: 'var(--font-meta)' }}
              >
                {preview.autoAccepted ? 'in tolerance' : 'beyond tolerance'} · tol {formatCents(preview.toleranceCents)}
              </div>
            )}
          </div>
        </div>

        {/* projected posting in mono (preview == posted) */}
        {preview && (
          <div className="mt-4 border-l-2 pl-3" style={{ borderColor: 'var(--border-default)' }} data-testid="settle-posting">
            <div className={labelCls}>Projected posting · before commit</div>
            <div className="mt-1 flex flex-col gap-0.5">
              {preview.lines.map((line, i) => {
                const p = ledgerLineParts(line);
                return (
                  <div
                    key={`${p.code}-${i}`}
                    className="flex items-baseline justify-between gap-4 text-[0.8rem] tabular-nums text-[var(--text-body)]"
                    style={{ fontFamily: 'var(--font-meta)' }}
                  >
                    <span className="text-[var(--text-muted)]">{p.code} {p.name ?? ''}</span>
                    <span className="whitespace-nowrap">{p.side} {p.amount}</span>
                  </div>
                );
              })}
              {preview.pledgeCents > 0 && (
                <div className="mt-1 text-[0.7rem] italic text-[var(--color-sage,var(--color-success))]" style={{ fontFamily: 'var(--font-meta)' }}>
                  Pledge accrual · 25% · {formatCents(preview.pledgeCents)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* typed reason appears only out of tolerance */}
        {preview && preview.requiresReason && (
          <label className="mt-4 flex flex-col gap-1" data-testid="settle-reason-field">
            <span className={labelCls}>Typed reason · required beyond tolerance</span>
            <input
              className={inputCls}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="settle-reason"
              placeholder="e.g. vendor freight surcharge dispute"
            />
          </label>
        )}

        <SheetFooter>
          <Button
            onClick={() => void commit()}
            disabled={!preview || settleMut.isPending || (preview.requiresReason && reason.trim() === '')}
            data-testid="settle-commit"
          >
            {preview?.autoAccepted ? 'Settle — auto-accept' : 'Settle with reason'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
