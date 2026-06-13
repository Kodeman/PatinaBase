'use client';

/**
 * Receiving (R28, C-9): the front-matter stat line (arriving · awaiting log ·
 * claims · 30-day pass rate — the I23 LedgerFrontMatter precedent) over the
 * warehouse-day queue. Every Inspect mounts the SAME I17 inspection drawer
 * the line unfolds use — one component, two doors. Cleared inspections fold
 * into the Settled group (the margin's Settled-fold pattern).
 *
 * The 30-day inspection window powers both the pass rate and the Cleared
 * fold; the warehouse queue is delivered POs with no inspection yet.
 */

import { useMemo, useState } from 'react';
import {
  useDamageClaims,
  usePurchaseOrders,
  useReceivingInspections,
} from '@patina/supabase';
import { LogInspectionDrawer } from '@/components/portal/procurement/log-inspection-drawer';
import { LedgerFrontMatter } from './ledger-front-matter';
import { receivingFrontMatter } from '@/lib/document/ledger-summary';
import { fmtDay } from '@/lib/document/format';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

const isoOffsetDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

export function ReceivingBookPage({ onOpenDocument }: { onOpenDocument: (projectId: string | null) => void }) {
  const since30 = useMemo(() => isoOffsetDays(-30), []);
  const { data: orders, isLoading: ordersLoading } = usePurchaseOrders() as {
    data: AnyRecord[] | undefined;
    isLoading: boolean;
  };
  const { data: inspections, isLoading: inspLoading } = useReceivingInspections({
    sinceDate: since30,
  }) as { data: AnyRecord[] | undefined; isLoading: boolean };
  const { data: draftedClaims } = useDamageClaims({ state: 'drafted' }) as {
    data: AnyRecord[] | undefined;
  };
  const { data: notifiedClaims } = useDamageClaims({ state: 'vendor_notified' }) as {
    data: AnyRecord[] | undefined;
  };

  const [target, setTarget] = useState<AnyRecord | null>(null);
  const [showCleared, setShowCleared] = useState(false);

  const openClaimCount = (draftedClaims?.length ?? 0) + (notifiedClaims?.length ?? 0);

  // Warehouse-day queue: delivered POs with no inspection logged, oldest ETA
  // first (the day's work, in arrival order).
  const queue = useMemo(() => {
    const inspectedPoIds = new Set((inspections ?? []).map((i) => i.purchase_order_id));
    return (orders ?? [])
      .filter((po) => po.status === 'delivered' && !inspectedPoIds.has(po.id))
      .sort((a, b) => {
        const ax = a.confirmed_eta ?? a.delivered_date ?? '';
        const bx = b.confirmed_eta ?? b.delivered_date ?? '';
        return ax < bx ? -1 : ax > bx ? 1 : 0;
      });
  }, [orders, inspections]);

  // Cleared inspections (clean, 30-day window) — the Settled fold.
  const cleared = useMemo(
    () => (inspections ?? []).filter((i) => i.outcome === 'clean'),
    [inspections],
  );

  const stats = useMemo(
    () => receivingFrontMatter((orders ?? []) as AnyRecord[], (inspections ?? []) as AnyRecord[], openClaimCount),
    [orders, inspections, openClaimCount],
  );

  const isLoading = ordersLoading || inspLoading;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h2 className="font-heading text-xl text-[var(--color-pearl)]">
          Receiving <em className="italic text-[var(--color-clay)]">· the warehouse day</em>
        </h2>
      </div>

      {!isLoading && <LedgerFrontMatter caption="receiving" stats={stats} />}

      {isLoading ? (
        <p className="py-3 text-[12px] italic text-[rgba(250,247,242,0.5)]">Opening the book…</p>
      ) : (
        <>
          {/* The warehouse-day queue — delivered, awaiting the log. */}
          <p className="mb-1 font-mono text-[8.5px] font-semibold uppercase tracking-[0.08em] text-[rgba(250,247,242,0.4)]">
            Awaiting inspection · {queue.length}
          </p>
          <ul className="mb-5">
            {queue.map((po) => (
              <li
                key={po.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-[rgba(250,247,242,0.08)] px-1 py-2.5"
              >
                <div>
                  <p className="text-[12.5px] font-medium text-[var(--color-off-white)]">
                    {po.po_number ?? po.vendor_po_number ?? po.sidemark ?? 'PO'} ·{' '}
                    {po.vendor?.name ?? 'Vendor'}
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.4)]">
                    {[
                      po.project?.name ?? 'Project',
                      po.delivered_date
                        ? `delivered ${fmtDay(po.delivered_date)}`
                        : po.confirmed_eta
                          ? `arrived ~${fmtDay(po.confirmed_eta)}`
                          : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTarget(po)}
                  className="whitespace-nowrap rounded-[3px] border border-[var(--color-clay)] px-2.5 py-1 text-[10.5px] text-[var(--color-clay)] hover:bg-[rgba(196,165,123,0.1)]"
                >
                  Inspect
                </button>
                <button
                  type="button"
                  onClick={() => onOpenDocument(po.project_id ?? po.project?.id ?? null)}
                  className="whitespace-nowrap text-[10.5px] text-[var(--color-clay)] hover:underline"
                >
                  open document →
                </button>
              </li>
            ))}
            {queue.length === 0 && (
              <li className="py-2 text-[11px] italic text-[rgba(250,247,242,0.4)]">
                Nothing waiting on the warehouse floor.
              </li>
            )}
          </ul>

          {/* The Settled fold — cleared inspections, collapsed (R12 pattern). */}
          {cleared.length > 0 && (
            <div className="border-t border-[rgba(250,247,242,0.1)] pt-2">
              <button
                type="button"
                onClick={() => setShowCleared((v) => !v)}
                aria-expanded={showCleared}
                className="font-mono text-[8.5px] uppercase tracking-[0.07em] text-[rgba(250,247,242,0.4)] hover:text-[var(--color-clay)]"
              >
                Settled · {cleared.length} cleared · 30 days {showCleared ? '↑' : '↓'}
              </button>
              {showCleared && (
                <ul className="mt-1.5 opacity-70">
                  {cleared.map((i) => (
                    <li
                      key={i.id}
                      className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-dashed border-[rgba(250,247,242,0.08)] px-1 py-1.5"
                    >
                      <span className="text-[11px] text-[rgba(250,247,242,0.7)]">
                        {i.purchase_order?.vendor?.name ?? 'Vendor'} ·{' '}
                        {i.purchase_order?.project?.name ?? 'Project'}
                      </span>
                      <span className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--color-sage)]">
                        clean · {fmtDay(i.inspected_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {/* I17: the same inspection drawer the line unfolds mount. */}
      {target && (
        <LogInspectionDrawer
          open
          onOpenChange={(o: boolean) => {
            if (!o) setTarget(null);
          }}
          purchaseOrderId={target.id}
          projectId={target.project_id ?? target.project?.id ?? undefined}
          poLabel={target.vendor_po_number ?? target.po_number ?? target.sidemark ?? 'PO'}
          vendorName={target.vendor?.name ?? 'Vendor'}
          projectName={target.project?.name ?? 'Project'}
        />
      )}
    </div>
  );
}
