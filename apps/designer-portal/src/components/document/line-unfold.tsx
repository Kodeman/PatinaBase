'use client';

/**
 * FF&E line unfold (spec §6, §13 Slice 4): PO detail · movement · receiving,
 * with the existing Order Assistant and LogInspectionDrawer mounted in
 * place (both are portal-local shadow-free panels — R3-clean). Prototype
 * v0.4 .line-detail recipe: clay left border, three-column grid.
 */

import { useState } from 'react';
import { useVendor } from '@patina/supabase';
import { OrderAssistant } from '@/components/portal/procurement/order-assistant';
import { LogInspectionDrawer } from '@/components/portal/procurement/log-inspection-drawer';
import { deriveLineStamp } from '@/lib/document/stamp-derivation';
import { fmtDay } from '@/lib/document/format';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FFERow = any;

const ACTION_BTN =
  'rounded-[4px] border border-[var(--color-pearl)] px-2.5 py-1.5 text-[10.5px] font-medium text-[var(--color-charcoal)] hover:border-[var(--color-clay)] disabled:opacity-50';

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="mb-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="text-[11.5px] font-medium text-[var(--color-charcoal)]">{value}</p>
      {sub && <p className="text-[10px] text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}

const ORDERABLE = new Set(['specified', 'quoted', 'approved']);

export function LineUnfold({
  item,
  projectId,
  projectName,
  onAddNote,
  onFold,
}: {
  item: FFERow;
  projectId: string;
  projectName: string;
  onAddNote: (lineId: string) => void;
  onFold: () => void;
}) {
  const stamp = deriveLineStamp(item);
  const po = item.purchase_order ?? null;
  const vendorId: string = item.vendor_id ?? po?.vendor_id ?? '';
  const { data: vendor } = useVendor(vendorId) as { data: FFERow | undefined };

  const [assistantOpen, setAssistantOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);

  const orderable = ORDERABLE.has(item.status) && !item.blocked;
  const inspectable = Boolean(po) && (item.status === 'shipped' || item.status === 'delivered');

  const openClaims = (item.item_claims ?? []).filter(
    (c: { state: string }) => c.state === 'drafted' || c.state === 'vendor_notified',
  );
  const receivingValue =
    stamp.kind === 'damaged'
      ? `Open claim${openClaims.length > 1 ? 's' : ''} · ${openClaims[0]?.state === 'vendor_notified' ? 'vendor notified' : 'drafted'}`
      : stamp.kind === 'received'
        ? `${item.received_quantity ?? 0} of ${item.quantity} inspected`
        : stamp.kind === 'delivered'
          ? 'Awaiting inspection'
          : '—';

  return (
    <div className="mb-2 mt-1 rounded-r-[5px] border-l-[3px] border-[var(--color-clay)] bg-[rgba(196,165,123,0.05)] px-4 py-3.5">
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Cell
          label="Purchase order"
          value={po ? (po.vendor_po_number ?? po.sidemark ?? 'PO drafted') : 'Not yet ordered'}
          sub={
            po
              ? [
                  `placed ${fmtDay(po.created_at)}`,
                  po.payment_pattern ? po.payment_pattern.replace(/_/g, ' ') : null,
                  po.acknowledged_at ? 'acknowledged' : 'awaiting acknowledgment',
                ]
                  .filter(Boolean)
                  .join(' · ')
              : item.vendor_name ?? undefined
          }
        />
        <Cell
          label="Movement"
          value={item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          sub={po?.confirmed_eta ? `arrives ~${fmtDay(po.confirmed_eta)}` : item.eta ? `eta ~${fmtDay(item.eta)}` : undefined}
        />
        <Cell label="Receiving" value={receivingValue} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {orderable && (
          <button
            type="button"
            className={ACTION_BTN}
            disabled={!vendor}
            title={vendor ? undefined : 'No vendor on this line yet'}
            onClick={() => setAssistantOpen(true)}
          >
            Order with Assistant
          </button>
        )}
        {inspectable && (
          <button type="button" className={ACTION_BTN} onClick={() => setInspectionOpen(true)}>
            Log inspection
          </button>
        )}
        <button type="button" className={ACTION_BTN} onClick={() => onAddNote(item.id)}>
          + Note
        </button>
        <button type="button" className={ACTION_BTN} onClick={onFold}>
          Fold ↑
        </button>
      </div>

      {vendor && (
        <OrderAssistant
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
          vendor={vendor}
          project={{ id: projectId, name: projectName }}
          ffeItems={[item]}
        />
      )}
      {po && (
        <LogInspectionDrawer
          open={inspectionOpen}
          onOpenChange={setInspectionOpen}
          purchaseOrderId={po.id}
          projectId={projectId}
          poLabel={po.vendor_po_number ?? po.sidemark ?? 'PO'}
          vendorName={item.vendor_name ?? vendor?.name ?? 'Vendor'}
          projectName={projectName}
        />
      )}
    </div>
  );
}
