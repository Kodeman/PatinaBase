'use client';

import { useRef, useState } from 'react';
import {
  canDeliverShipment,
  describeShipmentStatus,
  formatItemSummary,
  formatSlip,
  hasOpenInspectionWindow,
  type FulfillmentShipmentRow,
} from '@patina/fulfillment';
import { ModeChip } from '@/components/fulfillment/shared/mode-chip';
import { DeadlineClock } from '@/components/fulfillment/shared/deadline-clock';
import {
  useConfirmAppointment,
  useDeliverShipment,
  useUploadShipmentPod,
} from '@/hooks/use-fulfillment-shipments';

// ShipmentRow (S5, spec §5.4) — one row per shipment. Layout: ModeChip leads,
// then client/item/PO refs; carrier+tracking in DM Mono; a plain-language
// status sentence; the right block carries promised-vs-current ETA (mono,
// terracotta slip delta) and, on rows with an open inspection window, the
// DeadlineClock — the loudest element on the board by contrast, not ornament
// (BOH-DECISIONS I5). Action affordances (confirm appointment / upload POD /
// mark delivered) render inline, gated by canDeliverShipment — the same pure
// function the API routes enforce server-side, so "why is Deliver disabled"
// and "why did the API 409" never drift apart (see the route headers under
// api/admin/fulfillment/shipments/ for the RPC-layer gap this papers over).

const monoCls = 'font-mono' as const;
const monoStyle = { fontFamily: 'var(--font-meta)' } as const;

function SlipFigure({ promised, current }: { promised: string | null; current: string | null }) {
  const slip = formatSlip(promised, current);
  return (
    <div className="flex flex-col items-end" data-testid="shipment-slip">
      <span
        className="text-[0.53rem] uppercase tracking-[0.13em] text-[var(--text-muted)]"
        style={monoStyle}
      >
        Promised {promised ? '· ' + promised : ''}
      </span>
      <span
        data-testid="shipment-slip-value"
        data-slipped={slip.slipped}
        className={`${monoCls} mt-0.5 text-[0.9rem] tabular-nums`}
        style={{
          ...monoStyle,
          color: slip.slipped ? 'var(--color-terracotta, var(--color-error))' : 'var(--text-primary)',
        }}
      >
        {slip.display}
      </span>
    </div>
  );
}

function AppointmentAction({ shipmentId }: { shipmentId: string }) {
  const confirm = useConfirmAppointment(shipmentId);
  return (
    <div className="flex flex-col items-end gap-1" data-testid="shipment-appointment-action">
      <button
        type="button"
        data-testid="shipment-confirm-appointment"
        disabled={confirm.isPending}
        onClick={() => confirm.mutate(undefined)}
        className="rounded-sm px-2.5 py-1 text-[0.68rem] font-medium disabled:opacity-40"
        style={{ backgroundColor: 'var(--color-clay)', color: 'var(--bg-surface)' }}
      >
        {confirm.isPending ? 'Confirming…' : 'Confirm appointment'}
      </button>
      {confirm.isError && (
        <span data-testid="shipment-appointment-error" className="text-[0.62rem] text-[var(--color-error)]">
          {(confirm.error as Error).message}
        </span>
      )}
    </div>
  );
}

function DeliverActions({ row }: { row: FulfillmentShipmentRow }) {
  const gate = canDeliverShipment(row);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const uploadPod = useUploadShipmentPod(row.id);
  const deliver = useDeliverShipment(row.id);

  const onFileChosen = (file: File | undefined) => {
    if (!file) return;
    setPendingFileName(file.name);
    uploadPod.mutate(file);
  };

  return (
    <div className="flex flex-col items-end gap-1" data-testid="shipment-deliver-actions">
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="shipment-upload-pod"
          disabled={!gate.allowed || uploadPod.isPending}
          title={gate.allowed ? undefined : gate.message ?? undefined}
          onClick={() => fileRef.current?.click()}
          className="rounded-sm border px-2.5 py-1 text-[0.68rem] font-medium disabled:opacity-40"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
        >
          {uploadPod.isPending ? 'Uploading…' : 'Upload POD'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          data-testid="shipment-pod-file-input"
          onChange={(e) => onFileChosen(e.target.files?.[0])}
        />
        <button
          type="button"
          data-testid="shipment-deliver-button"
          disabled={!gate.allowed || deliver.isPending}
          title={gate.allowed ? undefined : gate.message ?? undefined}
          onClick={() => deliver.mutate()}
          className="rounded-sm px-2.5 py-1 text-[0.68rem] font-medium disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-clay)', color: 'var(--bg-surface)' }}
        >
          {deliver.isPending ? 'Marking…' : 'Mark delivered'}
        </button>
      </div>
      {!gate.allowed && gate.reason === 'appointment_required' && (
        <span data-testid="shipment-deliver-blocked-reason" className="text-[0.62rem] text-[var(--color-terracotta, var(--color-error))]">
          {gate.message}
        </span>
      )}
      {pendingFileName && uploadPod.isError && (
        <span data-testid="shipment-pod-error" className="text-[0.62rem] text-[var(--color-error)]">
          {(uploadPod.error as Error).message}
        </span>
      )}
      {deliver.isError && (
        <span data-testid="shipment-deliver-error" className="text-[0.62rem] text-[var(--color-error)]">
          {(deliver.error as Error).message}
        </span>
      )}
    </div>
  );
}

export interface ShipmentRowProps {
  row: FulfillmentShipmentRow;
  nowMs?: number;
}

export function ShipmentRow({ row, nowMs }: ShipmentRowProps) {
  const now = nowMs ?? Date.now();
  const openWindow = hasOpenInspectionWindow(row, now);
  const statusSentence = describeShipmentStatus(row, now);
  const itemSummary = formatItemSummary(row.itemNames);

  return (
    <div
      data-testid="shipment-row"
      data-shipment-id={row.id}
      data-mode={row.mode}
      data-delivered={!!row.deliveredAt}
      data-open-window={openWindow}
      className="grid grid-cols-[auto_1fr_auto] items-start gap-4 border-b border-[var(--border-subtle)] py-5"
    >
      <ModeChip mode={row.mode} />

      <div className="min-w-0">
        <div className="type-item-name truncate">
          <span data-testid="shipment-client-name">{row.clientName}</span>
          <span className="mx-1.5 text-[var(--text-subtle)]">·</span>
          <span data-testid="shipment-item-summary" className="text-[var(--text-muted)]">
            {itemSummary}
          </span>
          {row.poNumber && (
            <>
              <span className="mx-1.5 text-[var(--text-subtle)]">·</span>
              <span
                data-testid="shipment-po-number"
                className={monoCls}
                style={{ ...monoStyle, fontSize: '0.72rem', color: 'var(--text-muted)' }}
              >
                {row.poNumber}
              </span>
            </>
          )}
        </div>

        <div
          data-testid="shipment-carrier-tracking"
          className={`${monoCls} mt-0.5 text-[0.72rem] text-[var(--text-muted)]`}
          style={monoStyle}
        >
          {row.carrier ?? '—'}
          {row.tracking ? ` · ${row.tracking}` : ''}
        </div>

        <div data-testid="shipment-status" className="mt-1.5 type-body-small text-[var(--text-primary)]">
          {statusSentence}
        </div>

        <div className="mt-3">
          {!row.deliveredAt &&
            (row.mode === 'ltl' || row.mode === 'white_glove') &&
            !row.appointmentConfirmedAt && <AppointmentAction shipmentId={row.id} />}
          {!row.deliveredAt && <DeliverActions row={row} />}
        </div>
      </div>

      <div className="flex flex-col items-end gap-3">
        <SlipFigure promised={row.committedShip} current={row.currentEta} />
        {openWindow && <DeadlineClock closesAt={row.inspectionClosesAt} nowMs={now} />}
      </div>
    </div>
  );
}
