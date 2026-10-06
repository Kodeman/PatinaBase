'use client';

import { useState } from 'react';
import {
  useSetPurchaseOrderTracking,
  type PurchaseOrderEtaHistoryEntry,
  type SetPurchaseOrderTrackingInput,
} from '@patina/supabase';
import { folioSignedUrl, useUploadFolioFile } from '@/hooks/use-folio';
import { fmtDay } from '@/lib/document/format';
import { DateTextInput } from '../date-text-input';
import { DocumentAction } from '../document-action';
import { CellSub, FIELD_CLS, LABEL_CLS } from './cell';

/** The tracking columns on purchase_orders (00698). */
export interface TrackingFields {
  carrier?: string | null;
  tracking_number?: string | null;
  bol_document_path?: string | null;
  shipped_on?: string | null;
  eta_history?: PurchaseOrderEtaHistoryEntry[] | null;
}

const TRACKING_URLS: Array<[RegExp, (n: string) => string]> = [
  [/\bups\b/i, (n) => `https://www.ups.com/track?tracknum=${n}`],
  [/fed\s*ex/i, (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`],
  [
    /\busps\b|postal service/i,
    (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`,
  ],
];

/** A carrier's tracking page for UPS, FedEx and USPS; null for any other carrier. */
export function trackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): string | null {
  const number = trackingNumber?.trim();
  if (!carrier || !number) return null;
  const match = TRACKING_URLS.find(([re]) => re.test(carrier));
  return match ? match[1](encodeURIComponent(number)) : null;
}

export interface EtaMove {
  eta: string;
  /** The date this entry replaced; null for the first recorded date. */
  was: string | null;
  note: string | null;
}

/** eta_history (oldest first) as moves, newest first. */
export function etaMoves(
  history: PurchaseOrderEtaHistoryEntry[] | null | undefined,
): EtaMove[] {
  const list = Array.isArray(history) ? history : [];
  return list
    .map((h, i) => ({
      eta: h.eta,
      was: i > 0 ? list[i - 1].eta : null,
      note: h.note ?? null,
    }))
    .reverse();
}

/** "14 Nov (was 2 Nov · vendor delay)". */
export function etaMoveText(move: EtaMove): string {
  const aside = [move.was ? `was ${fmtDay(move.was)}` : null, move.note]
    .filter(Boolean)
    .join(' · ');
  return aside ? `${fmtDay(move.eta)} (${aside})` : fmtDay(move.eta);
}

export interface TrackingDraft {
  carrier: string;
  trackingNumber: string;
  shippedOn: string;
}

const norm = (v: string | null | undefined) => v?.trim() || null;

/**
 * The set_purchase_order_tracking patch: only the fields the edit changed,
 * blank sent as null (clears). An empty object means nothing to save.
 */
export function trackingPatch(
  before: TrackingFields,
  draft: TrackingDraft,
): SetPurchaseOrderTrackingInput['tracking'] {
  const patch: SetPurchaseOrderTrackingInput['tracking'] = {};
  if (norm(draft.carrier) !== norm(before.carrier)) patch.carrier = norm(draft.carrier);
  if (norm(draft.trackingNumber) !== norm(before.tracking_number))
    patch.trackingNumber = norm(draft.trackingNumber);
  if (norm(draft.shippedOn) !== norm(before.shipped_on?.slice(0, 10)))
    patch.shippedOn = norm(draft.shippedOn);
  return patch;
}

/** The maker lane's shipment words (00350), plus the parcel carriers that link. */
const CARRIER_SUGGESTIONS = ['UPS', 'FedEx', 'USPS', 'LTL', 'White glove', 'Their truck'];

/**
 * C-18 (D1-07): how the PO ships, in the Movement cell. The dated record
 * ("Shipped 22 Oct · UPS 1Z…"), the bill of lading, and an inline edit that
 * writes only what changed through set_purchase_order_tracking.
 */
export function ShipmentTracking({
  poId,
  itemId,
  projectId,
  record,
  open,
}: {
  poId: string;
  itemId: string;
  projectId: string;
  record: TrackingFields;
  /** Offer the edit (the PO is in production or later). */
  open: boolean;
}) {
  const [openError, setOpenError] = useState(false);
  const [editing, setEditing] = useState(false);

  const carrier = norm(record.carrier);
  const number = norm(record.tracking_number);
  const shippedOn = norm(record.shipped_on?.slice(0, 10));
  const bolPath = norm(record.bol_document_path);
  if (!open && !carrier && !number && !shippedOn && !bolPath) return null;

  const href = trackingUrl(carrier, number);

  const openBol = async () => {
    if (!bolPath) return;
    setOpenError(false);
    // Open first, inside the click, so the signed URL is not popup-blocked.
    const win = window.open('', '_blank');
    const url = await folioSignedUrl(bolPath);
    if (url && win) {
      win.opener = null;
      win.location.href = url;
    } else {
      win?.close();
      setOpenError(true);
    }
  };

  const recordLine = [shippedOn ? `Shipped ${fmtDay(shippedOn)}` : null, carrier]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mt-1" data-testid="line-movement-tracking">
      {(recordLine || number) && (
        <CellSub>
          {recordLine}
          {recordLine && number ? ' ' : null}
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
      )}
      {bolPath && (
        <button
          type="button"
          onClick={() => void openBol()}
          className="text-[11px] text-[var(--text-muted)] underline decoration-[var(--color-pearl)] underline-offset-2 hover:text-[var(--color-charcoal)]"
        >
          Bill of lading
        </button>
      )}
      {openError && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          The bill of lading could not be opened.
        </p>
      )}
      {open &&
        (editing ? (
          <TrackingEditor
            poId={poId}
            itemId={itemId}
            projectId={projectId}
            record={record}
            onClose={() => setEditing(false)}
          />
        ) : (
          <DocumentAction
            actionKey={
              carrier || number || shippedOn || bolPath ? 'edit-po-tracking' : 'add-po-tracking'
            }
            surfaceKey="project"
            regionKey="ffe-movement"
            variant="tertiary"
            onClick={() => setEditing(true)}
          >
            {carrier || number || shippedOn || bolPath ? 'Edit tracking' : 'Add tracking'}
          </DocumentAction>
        ))}
    </div>
  );
}

/**
 * The unfolded edit: carrier, tracking, ship date and the BOL attach. Its own
 * component, so the mutations mount only once the edit is open.
 */
function TrackingEditor({
  poId,
  itemId,
  projectId,
  record,
  onClose,
}: {
  poId: string;
  itemId: string;
  projectId: string;
  record: TrackingFields;
  onClose: () => void;
}) {
  const setTracking = useSetPurchaseOrderTracking({ errorSurface: 'inline' });
  const upload = useUploadFolioFile(projectId);
  const [draft, setDraft] = useState<TrackingDraft>(() => ({
    carrier: norm(record.carrier) ?? '',
    trackingNumber: norm(record.tracking_number) ?? '',
    shippedOn: norm(record.shipped_on?.slice(0, 10)) ?? '',
  }));
  const [error, setError] = useState<string | null>(null);
  const bolPath = norm(record.bol_document_path);
  const busy = setTracking.isPending || upload.isPending;

  const save = () => {
    if (busy) return;
    const patch = trackingPatch(record, draft);
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setError(null);
    setTracking
      .mutateAsync({ purchaseOrderId: poId, tracking: patch })
      .then(onClose)
      .catch((e: Error) => setError(e.message || 'The tracking could not be saved.'));
  };

  const attachBol = async (file: File | undefined) => {
    if (!file || busy) return;
    setError(null);
    try {
      const filed = await upload.mutateAsync({
        file,
        anchor: { kind: 'line', anchorId: itemId },
      });
      if (!filed.storage_path) throw new Error('The bill of lading did not upload.');
      await setTracking.mutateAsync({
        purchaseOrderId: poId,
        tracking: { bolDocumentPath: filed.storage_path },
      });
    } catch (e) {
      setError((e as Error).message || 'The bill of lading could not be attached.');
    }
  };

  return (
    <>
      <div className="mt-1 flex flex-col gap-1">
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>carrier</span>
          <input
            list={`carriers-${poId}`}
            value={draft.carrier}
            maxLength={120}
            disabled={busy}
            onChange={(e) => setDraft({ ...draft, carrier: e.target.value })}
            className={FIELD_CLS}
          />
          <datalist id={`carriers-${poId}`}>
            {CARRIER_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>tracking</span>
          <input
            value={draft.trackingNumber}
            maxLength={120}
            disabled={busy}
            placeholder="PRO or tracking number"
            onChange={(e) => setDraft({ ...draft, trackingNumber: e.target.value })}
            className={FIELD_CLS}
          />
        </label>
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>shipped</span>
          <DateTextInput
            value={draft.shippedOn || null}
            ariaLabel="Ship date"
            disabled={busy}
            onChange={(value) => setDraft({ ...draft, shippedOn: value ?? '' })}
            className="bg-transparent text-[11px] text-[var(--color-charcoal)] outline-none"
          />
        </label>
        <label className="block cursor-pointer text-[11px] text-[var(--text-muted)] hover:text-[var(--color-charcoal)]">
          {upload.isPending
            ? 'Attaching…'
            : bolPath
              ? 'Replace the bill of lading'
              : 'Attach the bill of lading'}
          <input
            type="file"
            accept="application/pdf,image/*"
            disabled={busy}
            className="sr-only"
            onChange={(e) => {
              void attachBol(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <div className="flex items-center gap-2">
          <DocumentAction
            actionKey="save-po-tracking"
            surfaceKey="project"
            regionKey="ffe-movement"
            variant="secondary"
            loading={setTracking.isPending}
            loadingLabel="Saving…"
            onClick={save}
          >
            Save tracking
          </DocumentAction>
          <DocumentAction
            actionKey="close-po-tracking"
            surfaceKey="project"
            regionKey="ffe-movement"
            variant="tertiary"
            onClick={onClose}
          >
            Cancel
          </DocumentAction>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </>
  );
}
