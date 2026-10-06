'use client';

/**
 * C-26 (D1-07, d2 §M6.5): the PO's shipments in the Movement cell. A
 * shipment is a mode, a carrier, a PRO or tracking number, a bill of lading,
 * and which pieces travelled, so a PO can ship in parts. Recording one ships
 * the PO (record_po_shipment advances it); each shipment then takes its own
 * arrival date and its own delivery, which starts the claim clock.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  usePoShipments,
  useProcurementItems,
  useRecordPoShipment,
  type PoShipmentRequest,
  type PoShipmentWithLines,
  type ShipmentMode,
} from '@patina/supabase';
import { useUploadFolioFile } from '@/hooks/use-folio';
import { fmtDay, todayYmd } from '@/lib/document/format';
import { DateTextInput } from '../date-text-input';
import { DocumentAction } from '../document-action';
import { CellSub, FIELD_CLS, LABEL_CLS } from './cell';
import { trackingUrl } from './movement-tracking';

export const SHIPMENT_MODES: ReadonlyArray<{ value: ShipmentMode; label: string }> = [
  { value: 'parcel', label: 'parcel' },
  { value: 'ltl', label: 'LTL' },
  { value: 'white_glove', label: 'white glove' },
  { value: 'studio_pickup', label: 'studio pickup' },
];

export interface ShipmentPiece {
  id: string;
  name: string;
  quantity?: number | null;
}

/** Pieces of one line already on the PO's shipments. */
export function shippedQty(
  shipments: readonly PoShipmentWithLines[],
  itemId: string,
): number {
  return shipments.reduce(
    (sum, s) =>
      sum +
      (s.po_shipment_lines ?? [])
        .filter((l) => l.ffe_item_id === itemId)
        .reduce((n, l) => n + l.qty, 0),
    0,
  );
}

/** Pieces of a line still to ship. */
export function remainingQty(
  piece: ShipmentPiece,
  shipments: readonly PoShipmentWithLines[],
): number {
  return Math.max(0, (piece.quantity ?? 1) - shippedQty(shipments, piece.id));
}

export interface ShipmentDraft {
  mode: ShipmentMode | '';
  carrier: string;
  tracking: string;
  shippedOn: string;
  currentEta: string;
  /** itemId → quantity as typed. */
  qty: Record<string, string>;
}

/** A new shipment carries everything still to ship, sent today. */
export function freshShipment(
  pieces: readonly ShipmentPiece[],
  shipments: readonly PoShipmentWithLines[],
  today: string,
): ShipmentDraft {
  const qty: Record<string, string> = {};
  for (const p of pieces) {
    const left = remainingQty(p, shipments);
    if (left > 0) qty[p.id] = String(left);
  }
  return { mode: '', carrier: '', tracking: '', shippedOn: today, currentEta: '', qty };
}

/**
 * The record_po_shipment request for a new shipment: only the fields given,
 * and the pieces with a whole quantity above zero. A part shipment carries
 * fewer than what remains; null when a quantity is not a whole number or no
 * piece travels.
 */
export function shipmentRequest(
  draft: ShipmentDraft,
  bolDocumentPath?: string | null,
): PoShipmentRequest | null {
  const lines: { ffeItemId: string; qty: number }[] = [];
  for (const [ffeItemId, raw] of Object.entries(draft.qty)) {
    const text = raw.trim();
    if (text === '' || text === '0') continue;
    if (!/^\d+$/.test(text)) return null;
    lines.push({ ffeItemId, qty: Number(text) });
  }
  if (lines.length === 0) return null;
  const request: PoShipmentRequest = { lines };
  if (draft.mode) request.mode = draft.mode;
  if (draft.carrier.trim()) request.carrier = draft.carrier.trim();
  if (draft.tracking.trim()) request.tracking = draft.tracking.trim();
  if (draft.shippedOn) request.shippedOn = draft.shippedOn;
  if (draft.currentEta) request.currentEta = draft.currentEta;
  if (bolDocumentPath) request.bolDocumentPath = bolDocumentPath;
  return request;
}

const modeWord = (mode: string | null) =>
  SHIPMENT_MODES.find((m) => m.value === mode)?.label ?? null;

/** "Shipped 22 Oct · LTL · Estes" — the shipment's dated record. */
export function shipmentRecord(s: PoShipmentWithLines): string {
  return [`Shipped ${fmtDay(s.shipped_on)}`, modeWord(s.mode), s.carrier?.trim() || null]
    .filter(Boolean)
    .join(' · ');
}

/** "Halden Sofa ×1 · Ottoman ×2" — what travelled. */
export function shipmentPieces(
  s: PoShipmentWithLines,
  pieces: readonly ShipmentPiece[],
): string | null {
  const names = (s.po_shipment_lines ?? []).map((l) => {
    const name = pieces.find((p) => p.id === l.ffe_item_id)?.name ?? 'a piece';
    return `${name} ×${l.qty}`;
  });
  return names.length > 0 ? names.join(' · ') : null;
}

const SHIPPABLE = new Set(['confirmed', 'in_production', 'shipped', 'delivered']);
const RECORDABLE = new Set(['confirmed', 'in_production', 'shipped']);

export function PoShipments({
  poId,
  itemId,
  projectId,
  poStatus,
}: {
  poId: string;
  itemId: string;
  projectId: string;
  poStatus: string | null;
}) {
  const { data: shipments } = usePoShipments(poId);
  const [recording, setRecording] = useState(false);
  const list = shipments ?? [];
  if (!poStatus || !SHIPPABLE.has(poStatus)) return null;
  const canRecord = RECORDABLE.has(poStatus);
  if (list.length === 0 && !canRecord) return null;

  return (
    <div className="mt-1" data-testid="line-shipments">
      {list.length > 0 && (
        <ul aria-label="Shipments" className="flex flex-col gap-1">
          {list.map((s) => (
            <ShipmentRow key={s.id} shipment={s} poId={poId} projectId={projectId} />
          ))}
        </ul>
      )}
      {canRecord &&
        (recording ? (
          <ShipmentForm
            poId={poId}
            itemId={itemId}
            projectId={projectId}
            shipments={list}
            onClose={() => setRecording(false)}
          />
        ) : (
          <DocumentAction
            actionKey="open-record-po-shipment"
            surfaceKey="project"
            regionKey="ffe-movement"
            variant="tertiary"
            onClick={() => setRecording(true)}
          >
            {list.length > 0 ? 'Record another shipment' : 'Record a shipment'}
          </DocumentAction>
        ))}
    </div>
  );
}

function useShipmentWrite(projectId: string) {
  const qc = useQueryClient();
  const record = useRecordPoShipment({ errorSurface: 'inline' });
  const run = async (poId: string, request: PoShipmentRequest) => {
    await record.mutateAsync({
      purchaseOrderId: poId,
      projectId,
      request,
      localDate: todayYmd(),
    });
    // One act, many surfaces: the line cell, the Orders row, the Week, the Desk.
    void qc.invalidateQueries({ queryKey: ['project-ffe-items'] });
    void qc.invalidateQueries({ queryKey: ['document-state'] });
  };
  return { run, isPending: record.isPending };
}

/** One shipment: its record, what travelled, its arrival, its delivery. */
function ShipmentRow({
  shipment,
  poId,
  projectId,
}: {
  shipment: PoShipmentWithLines;
  poId: string;
  projectId: string;
}) {
  const write = useShipmentWrite(projectId);
  const { data: items } = useProcurementItems({ purchaseOrderId: poId });
  const [delivering, setDelivering] = useState(false);
  const [deliveredOn, setDeliveredOn] = useState<string | null>(() => todayYmd());
  const [error, setError] = useState<string | null>(null);
  const number = shipment.tracking?.trim() || null;
  const href = trackingUrl(shipment.carrier, number);
  const pieces = shipmentPieces(shipment, (items ?? []) as ShipmentPiece[]);

  const patch = (request: PoShipmentRequest) => {
    if (write.isPending) return;
    setError(null);
    write
      .run(poId, { id: shipment.id, ...request })
      .then(() => setDelivering(false))
      .catch((e: Error) => setError(e.message || 'The shipment could not be saved.'));
  };

  return (
    <li data-shipment={shipment.id}>
      <CellSub>
        {shipmentRecord(shipment)}
        {number && ' '}
        {number &&
          (href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-[var(--color-pearl)] underline-offset-2 hover:text-[var(--color-charcoal)]"
            >
              {number}
            </a>
          ) : (
            <span>{number}</span>
          ))}
      </CellSub>
      {pieces && <CellSub>{pieces}</CellSub>}
      {shipment.delivered_on ? (
        <CellSub>delivered {fmtDay(shipment.delivered_on)}</CellSub>
      ) : (
        <>
          <label className="flex items-baseline gap-1.5">
            <span className={LABEL_CLS}>arrives</span>
            <DateTextInput
              value={shipment.current_eta}
              ariaLabel="Shipment arrives"
              disabled={write.isPending}
              onChange={(value) => {
                if (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && value !== shipment.current_eta) {
                  patch({ currentEta: value });
                }
              }}
              className="bg-transparent text-[11px] text-[var(--color-charcoal)] outline-none"
            />
          </label>
          {delivering ? (
            <div className="flex flex-wrap items-baseline gap-x-2">
              <label className="flex items-baseline gap-1.5">
                <span className={LABEL_CLS}>delivered</span>
                <DateTextInput
                  value={deliveredOn}
                  ariaLabel="Delivered on"
                  disabled={write.isPending}
                  onChange={setDeliveredOn}
                  className={FIELD_CLS}
                />
              </label>
              <DocumentAction
                actionKey="save-shipment-delivered"
                surfaceKey="project"
                regionKey="ffe-movement"
                variant="secondary"
                disabled={!deliveredOn}
                loading={write.isPending}
                loadingLabel="Saving…"
                onClick={() => {
                  if (deliveredOn) patch({ deliveredOn });
                }}
              >
                Save as delivered
              </DocumentAction>
              <DocumentAction
                actionKey="cancel-shipment-delivered"
                surfaceKey="project"
                regionKey="ffe-movement"
                variant="tertiary"
                onClick={() => setDelivering(false)}
              >
                Cancel
              </DocumentAction>
            </div>
          ) : (
            <DocumentAction
              actionKey="open-shipment-delivered"
              surfaceKey="project"
              regionKey="ffe-movement"
              variant="tertiary"
              onClick={() => setDelivering(true)}
            >
              Mark delivered
            </DocumentAction>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * Record a shipment: mode, carrier, PRO or tracking, ship date, arrival, the
 * bill of lading, and how many of each piece travelled. Its own component,
 * so the PO's pieces load only once it is open.
 */
function ShipmentForm({
  poId,
  itemId,
  projectId,
  shipments,
  onClose,
}: {
  poId: string;
  itemId: string;
  projectId: string;
  shipments: readonly PoShipmentWithLines[];
  onClose: () => void;
}) {
  const write = useShipmentWrite(projectId);
  const upload = useUploadFolioFile(projectId);
  const { data: items, isLoading } = useProcurementItems({ purchaseOrderId: poId });
  const pieces = ((items ?? []) as (ShipmentPiece & { purchase_order_id?: string | null })[])
    .filter((it) => it.purchase_order_id === poId);
  const [draft, setDraft] = useState<ShipmentDraft | null>(null);
  const [bol, setBol] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The pieces arrive after the form opens; the draft starts from them once.
  const current = draft ?? (pieces.length > 0 ? freshShipment(pieces, shipments, todayYmd()) : null);
  const busy = write.isPending || upload.isPending;
  const ready = current ? shipmentRequest(current) : null;

  const set = (patch: Partial<ShipmentDraft>) => current && setDraft({ ...current, ...patch });

  const save = async () => {
    if (busy || !current || !ready) return;
    setError(null);
    try {
      let bolPath: string | null = null;
      if (bol) {
        const filed = await upload.mutateAsync({ file: bol, anchor: { kind: 'line', anchorId: itemId } });
        bolPath = filed.storage_path ?? null;
      }
      await write.run(poId, shipmentRequest(current, bolPath) as PoShipmentRequest);
      onClose();
    } catch (e) {
      setError((e as Error).message || 'The shipment could not be recorded.');
    }
  };

  if (!current) {
    return <CellSub>{isLoading ? 'Reading the order…' : 'No pieces on this order.'}</CellSub>;
  }

  return (
    <div data-testid="record-shipment-form" className="mt-1 flex flex-col gap-1 border-l border-[var(--color-pearl)] pl-2.5">
      <label className="flex items-baseline gap-1.5">
        <span className={LABEL_CLS}>mode</span>
        <select
          aria-label="Shipment mode"
          value={current.mode}
          disabled={busy}
          onChange={(e) => set({ mode: e.target.value as ShipmentMode | '' })}
          className={FIELD_CLS}
        >
          <option value="">not set</option>
          {SHIPMENT_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-baseline gap-1.5">
        <span className={LABEL_CLS}>carrier</span>
        <input
          aria-label="Shipment carrier"
          value={current.carrier}
          maxLength={120}
          disabled={busy}
          onChange={(e) => set({ carrier: e.target.value })}
          className={FIELD_CLS}
        />
      </label>
      <label className="flex items-baseline gap-1.5">
        <span className={LABEL_CLS}>tracking</span>
        <input
          aria-label="Shipment tracking"
          value={current.tracking}
          maxLength={200}
          disabled={busy}
          placeholder="PRO or tracking number"
          onChange={(e) => set({ tracking: e.target.value })}
          className={FIELD_CLS}
        />
      </label>
      <label className="flex items-baseline gap-1.5">
        <span className={LABEL_CLS}>shipped</span>
        <DateTextInput
          value={current.shippedOn || null}
          ariaLabel="Shipment ship date"
          disabled={busy}
          onChange={(value) => set({ shippedOn: value ?? '' })}
          className={FIELD_CLS}
        />
      </label>
      <label className="flex items-baseline gap-1.5">
        <span className={LABEL_CLS}>arrives</span>
        <DateTextInput
          value={current.currentEta || null}
          ariaLabel="Shipment ETA"
          disabled={busy}
          onChange={(value) => set({ currentEta: value ?? '' })}
          className={FIELD_CLS}
        />
      </label>
      <fieldset className="flex flex-col gap-0.5">
        <legend className={LABEL_CLS}>pieces on this shipment</legend>
        {pieces.map((p) => {
          const left = remainingQty(p, shipments);
          return (
            <label key={p.id} className="flex items-baseline gap-1.5 text-[11px] text-[var(--color-charcoal)]">
              <input
                aria-label={`${p.name} pieces shipped`}
                inputMode="numeric"
                value={current.qty[p.id] ?? ''}
                disabled={busy || left === 0}
                onChange={(e) => set({ qty: { ...current.qty, [p.id]: e.target.value } })}
                className={`${FIELD_CLS} w-10 border-b border-[var(--color-pearl)]`}
              />
              <span>
                of {left} · {p.name}
              </span>
            </label>
          );
        })}
      </fieldset>
      <label className="block cursor-pointer text-[11px] text-[var(--text-muted)] hover:text-[var(--color-charcoal)]">
        {bol ? `Bill of lading · ${bol.name}` : 'Attach the bill of lading'}
        <input
          type="file"
          accept="application/pdf,image/*"
          disabled={busy}
          className="sr-only"
          onChange={(e) => setBol(e.target.files?.[0] ?? null)}
        />
      </label>
      {!ready && (
        <p className="text-[11px] text-[var(--text-muted)]">
          Say how many of each piece travelled.
        </p>
      )}
      <div className="flex items-center gap-2">
        <DocumentAction
          actionKey="record-po-shipment"
          surfaceKey="project"
          regionKey="ffe-movement"
          variant="secondary"
          disabled={!ready}
          loading={busy}
          loadingLabel="Saving…"
          onClick={() => void save()}
        >
          Save as shipped
        </DocumentAction>
        <DocumentAction
          actionKey="close-record-po-shipment"
          surfaceKey="project"
          regionKey="ffe-movement"
          variant="tertiary"
          onClick={onClose}
        >
          Cancel
        </DocumentAction>
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}
