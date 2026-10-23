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

export const TRACKING_CARRIERS = [
  // Public tracking page: https://www.ups.com/track
  { id: 'ups', label: 'UPS', aliases: ['ups'], template: 'https://www.ups.com/track?tracknum={pro}' },
  // Public tracking page: https://www.fedex.com/fedextrack/
  { id: 'fedex', label: 'FedEx', aliases: ['fedex', 'fedex ground', 'fed ex'], template: 'https://www.fedex.com/fedextrack/?trknbr={pro}' },
  // Public tracking page: https://tools.usps.com/go/TrackConfirmAction
  { id: 'usps', label: 'USPS', aliases: ['usps', 'united states postal service', 'postal service'], template: 'https://tools.usps.com/go/TrackConfirmAction?tLabels={pro}' },
  // Public tracking page; prefill pending walk: https://www.estes-express.com/myestes/shipment-tracking/
  { id: 'estes', label: 'Estes', aliases: ['estes', 'estes express', 'estes express lines'], template: 'https://www.estes-express.com/myestes/shipment-tracking/?type=PRO&query={pro}' },
  // No confirmed public deep link: https://www.odfl.com/us/en/tools/trace-track-ltl-freight.html
  { id: 'odfl', label: 'Old Dominion', aliases: ['old dominion', 'odfl', 'old dominion freight line'], template: 'https://www.odfl.com/us/en/tools/trace-track-ltl-freight.html' },
  // No confirmed public deep link: https://www.xpo.com/help-center/shipment-tracking-and-reporting/how-track-ltl-shipment/
  { id: 'xpo', label: 'XPO', aliases: ['xpo', 'xpo logistics'], template: 'https://www.xpo.com/help-center/shipment-tracking-and-reporting/how-track-ltl-shipment/' },
  // No confirmed public deep link: https://www.rlcarriers.com/freight/shipping/shipment-tracing
  { id: 'rl', label: 'R+L', aliases: ['r+l', 'r+l carriers'], template: 'https://www.rlcarriers.com/freight/shipping/shipment-tracing' },
  // No confirmed public deep link: https://www.saia.com/track
  { id: 'saia', label: 'Saia', aliases: ['saia', 'saia ltl freight'], template: 'https://www.saia.com/track' },
  // No confirmed public deep link: https://arcb.com/tools/tracking.html
  { id: 'abf', label: 'ABF / ArcBest', aliases: ['abf / arcbest', 'abf', 'abf freight', 'arcbest'], template: 'https://arcb.com/tools/tracking.html' },
  // Carrier-owned format strips a three-letter terminal prefix, dashes and leading zeros: https://www.sefl.com/webconnect/tracing
  { id: 'sefl', label: 'SEFL', aliases: ['sefl', 'southeastern freight lines'], template: 'https://www.sefl.com/webconnect/tracing?Type=PN&RefNum1={pro}' },
  { id: 'other', label: 'Other', aliases: ['other'], template: null },
];

function selectedCarrier(carrier: string | null | undefined) {
  const name = carrier?.trim().toLowerCase() ?? '';
  return TRACKING_CARRIERS.find((c) => c.aliases.includes(name));
}

/** Uses only an explicitly named carrier, never the shape of a PRO number. */
export function trackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): string | null {
  const selected = selectedCarrier(carrier);
  let number = trackingNumber?.trim() ?? '';
  if (selected?.id === 'sefl') number = number.replace(/^[a-z]{3}[-\s]*/i, '').replace(/-/g, '').replace(/^0+/, '');
  if (!number || !selected?.template) return null;
  return selected.template.replace('{pro}', encodeURIComponent(number));
}

export function CarrierPicker({ value, disabled, onChange, ariaLabel }: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const legacy = value && !TRACKING_CARRIERS.some((c) => c.label === value);
  return (
    <select aria-label={ariaLabel} value={value} disabled={disabled}
      onChange={(e) => onChange(e.target.value)} className={FIELD_CLS}>
      <option value="">Not set</option>
      {legacy && <option value={value}>{value}</option>}
      {TRACKING_CARRIERS.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
    </select>
  );
}

export function CarrierTrackingNumber({ carrier, number }: { carrier: string | null; number: string }) {
  const [copyStatus, setCopyStatus] = useState('');
  const href = trackingUrl(carrier, number);
  const selected = selectedCarrier(carrier);
  if (!href) return <span>{number}</span>;
  const landing = !selected?.template?.includes('{pro}');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(number);
      setCopyStatus('PRO copied.');
    } catch {
      setCopyStatus('Could not copy. Select the PRO to copy it.');
    }
  };
  return (
    <>
      {landing && <><span>{number}</span>{' · '}</>}
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="underline decoration-[var(--color-pearl)] underline-offset-2 hover:text-[var(--color-charcoal)]">
        {landing ? `Open ${selected?.label} tracking` : number}
      </a>
      {landing && <>
        {' · '}<button type="button" onClick={() => void copy()} className="underline underline-offset-2">Copy PRO</button>
        <span role="status">{copyStatus}</span>
      </>}
    </>
  );
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
          {number && <CarrierTrackingNumber carrier={carrier} number={number} />}
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
          <CarrierPicker value={draft.carrier} disabled={busy} ariaLabel="Tracking carrier"
            onChange={(carrier) => setDraft({ ...draft, carrier })} />
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
