'use client';

import { useState } from 'react';
import type { FulfillmentShipmentEligiblePo, ShipmentMode } from '@patina/fulfillment';
import { useCreateShipment } from '@/hooks/use-fulfillment-shipments';

// "Tracking (manual entry v1)" — the Shipment Board's creation affordance
// (spec §5.4). Picks an acknowledged PO with no shipment yet, mode, carrier,
// tracking; POSTs to /api/admin/fulfillment/shipments, which binds verbatim
// to fulfillment_record_shipment (00353) — this call both creates the
// shipment row AND steps the PO/lines to shipped (see the route header for
// the quoted RPC body). Collapsed by default (a quiet affordance, not a
// dominant board element — the shipments already on the board are the point).

const MODES: ShipmentMode[] = ['parcel', 'ltl', 'white_glove'];
const MODE_LABEL: Record<ShipmentMode, string> = {
  parcel: 'Parcel',
  ltl: 'LTL',
  white_glove: 'White Glove',
};

const labelCls = 'block text-[0.6rem] uppercase tracking-[0.08em] text-[var(--text-muted)]';
const fieldCls = 'mt-1 w-full rounded-sm border bg-transparent px-2 py-1.5 text-[0.8rem]';
const fieldStyle = { borderColor: 'var(--border-default)', color: 'var(--text-primary)' } as const;

export interface AddShipmentFormProps {
  eligiblePos: FulfillmentShipmentEligiblePo[];
}

export function AddShipmentForm({ eligiblePos }: AddShipmentFormProps) {
  const [open, setOpen] = useState(false);
  const [poId, setPoId] = useState('');
  const [mode, setMode] = useState<ShipmentMode>('parcel');
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const create = useCreateShipment();

  const valid = !!poId && !!carrier.trim() && !!tracking.trim();

  if (!open) {
    return (
      <div className="flex justify-end pb-4">
        <button
          type="button"
          data-testid="shipment-add-open"
          onClick={() => setOpen(true)}
          disabled={eligiblePos.length === 0}
          title={eligiblePos.length === 0 ? 'No acknowledged POs are waiting to ship' : undefined}
          className="rounded-sm border px-3 py-1.5 text-[0.72rem] font-medium disabled:opacity-40"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
        >
          + Add shipment
        </button>
      </div>
    );
  }

  return (
    <section
      data-testid="shipment-add-form"
      className="mb-6 flex flex-col gap-3 border border-[var(--border-default)] p-4"
    >
      <div
        className="text-[0.55rem] uppercase tracking-[0.13em] text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-meta)' }}
      >
        Record tracking — manual entry (v1)
      </div>

      {create.isSuccess ? (
        <div data-testid="shipment-add-success" className="text-[0.75rem] text-[var(--color-sage, var(--color-success))]">
          Shipment recorded — the PO has stepped to shipped.
        </div>
      ) : (
        <>
          <div>
            <label className={labelCls} style={{ fontFamily: 'var(--font-meta)' }}>
              PO
            </label>
            <select
              data-testid="shipment-add-po"
              value={poId}
              onChange={(e) => setPoId(e.target.value)}
              className={fieldCls}
              style={fieldStyle}
            >
              <option value="">Select an acknowledged PO…</option>
              {eligiblePos.map((po) => (
                <option key={po.poId} value={po.poId}>
                  {po.poNumber ?? po.poId} — {po.clientName} · {po.vendorName ?? po.vendorId}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls} style={{ fontFamily: 'var(--font-meta)' }}>
              Mode
            </label>
            <select
              data-testid="shipment-add-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as ShipmentMode)}
              className={fieldCls}
              style={fieldStyle}
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls} style={{ fontFamily: 'var(--font-meta)' }}>
              Carrier
            </label>
            <input
              data-testid="shipment-add-carrier"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="e.g. UPS, XPO Logistics"
              className={fieldCls}
              style={fieldStyle}
            />
          </div>

          <div>
            <label className={labelCls} style={{ fontFamily: 'var(--font-meta)' }}>
              Tracking number
            </label>
            <input
              data-testid="shipment-add-tracking"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="e.g. 1Z999AA10123456784"
              className={`${fieldCls} font-mono`}
              style={fieldStyle}
            />
          </div>

          {create.isError && (
            <div data-testid="shipment-add-error" className="text-[0.72rem] text-[var(--color-error)]">
              {(create.error as Error).message}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-sm px-3 py-1.5 text-[0.72rem]"
              style={{ color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="shipment-add-submit"
              disabled={!valid || create.isPending}
              onClick={() => create.mutate({ poId, mode, carrier: carrier.trim(), tracking: tracking.trim() })}
              className="rounded-sm px-3 py-1.5 text-[0.72rem] font-medium disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-clay)', color: 'var(--bg-surface)' }}
            >
              {create.isPending ? 'Recording…' : 'Record shipment'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
