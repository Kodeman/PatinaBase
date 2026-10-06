'use client';

import { useState } from 'react';
import {
  useMarkSampleReturned,
  useRecordSampleRequest,
  useSampleRequests,
  type SampleKind,
  type SampleRequestRow,
} from '@patina/supabase';
import { parseDollarsToCents } from '@/lib/currency-ui';
import { fmtDay, todayYmd } from '@/lib/document/format';
import { DocumentAction } from '../document-action';
import { CellSub, FIELD_CLS, LABEL_CLS } from './cell';

/**
 * C-35 (d2 §M10): a memo or sample request, with a return-by date, against a
 * line or a maker. CFAs are not here (M4 submittals gate an order); a memo
 * library, sample-box ordering and shelf inventory are the parked side
 * journey (synthesis §7 C-35). Shared by the unfold's "The buy" cell
 * (ffeItemId scope) and the Vendors maker card (vendorId, no project).
 */

export const SAMPLE_KIND_LABEL: Record<SampleKind, string> = {
  memo: 'Memo',
  finish_chip: 'Finish chip',
  loaner: 'Loaner',
  other: 'Sample',
};

const KINDS: SampleKind[] = ['memo', 'finish_chip', 'loaner', 'other'];

/** "Memo from Kravet · return by 21 Oct" — the sample's facts in one line. */
export function sampleSentence(row: SampleRequestRow, vendorName?: string | null): string {
  const kind = SAMPLE_KIND_LABEL[row.kind as SampleKind] ?? 'Sample';
  const from = vendorName ? ` from ${vendorName}` : '';
  const head = `${kind}${from}`;
  if (row.status === 'cancelled') return `${head} · cancelled`;
  if (row.status === 'returned') {
    return row.returned_on ? `${head} · returned ${fmtDay(row.returned_on)}` : `${head} · returned`;
  }
  if (row.return_by) return `${head} · return by ${fmtDay(row.return_by)}`;
  if (row.status === 'received') return `${head} · received`;
  return `${head} · requested`;
}

export interface SampleRequestScope {
  projectId?: string | null;
  organizationId?: string | null;
  ffeItemId?: string | null;
  vendorId?: string | null;
}

/** "Request a sample": kind, description, requested date, return-by, fee,
 *  billable. The scope (line, maker, project/studio) comes from context, not
 *  a field the designer fills in. */
function RequestSample({ scope }: { scope: SampleRequestScope }) {
  const record = useRecordSampleRequest({ errorSurface: 'inline' });
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SampleKind>('memo');
  const [description, setDescription] = useState('');
  const [requestedOn, setRequestedOn] = useState(todayYmd());
  const [returnBy, setReturnBy] = useState('');
  const [fee, setFee] = useState('');
  const [billable, setBillable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <DocumentAction
        actionKey="request-sample"
        surfaceKey="project"
        regionKey="ffe-samples"
        variant="tertiary"
        onClick={() => setOpen(true)}
      >
        Request a sample
      </DocumentAction>
    );
  }

  const save = () => {
    setError(null);
    const trimmedFee = fee.trim();
    const feeCents = trimmedFee ? parseDollarsToCents(trimmedFee) : null;
    if (trimmedFee && feeCents === null) {
      setError('Enter the fee in dollars, e.g. 25 or 25.50.');
      return;
    }
    record
      .mutateAsync({
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
        ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
        ...(scope.ffeItemId ? { ffeItemId: scope.ffeItemId } : {}),
        ...(scope.vendorId ? { vendorId: scope.vendorId } : {}),
        kind,
        description: description.trim() || undefined,
        requestedOn: requestedOn || undefined,
        returnBy: returnBy || undefined,
        feeCents: feeCents ?? undefined,
        billableToClient: billable,
      })
      .then(() => {
        setOpen(false);
        setDescription('');
        setReturnBy('');
        setFee('');
        setBillable(false);
      })
      .catch((e: Error) => setError(e.message || 'The sample request was not recorded.'));
  };

  return (
    <div data-testid="request-sample-form" className="flex flex-col gap-1.5">
      <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Kind</span>
          <select
            aria-label="Sample kind"
            value={kind}
            disabled={record.isPending}
            onChange={(e) => setKind(e.target.value as SampleKind)}
            className={FIELD_CLS}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {SAMPLE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 items-baseline gap-1.5">
          <span className={`${LABEL_CLS} shrink-0`}>Description</span>
          <input
            aria-label="Description"
            value={description}
            maxLength={500}
            disabled={record.isPending}
            onChange={(e) => setDescription(e.target.value)}
            className={`min-w-0 flex-1 ${FIELD_CLS}`}
          />
        </label>
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Requested</span>
          <input
            type="date"
            aria-label="Requested on"
            value={requestedOn}
            disabled={record.isPending}
            onChange={(e) => setRequestedOn(e.target.value)}
            className={FIELD_CLS}
          />
        </label>
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Return by</span>
          <input
            type="date"
            aria-label="Return by"
            value={returnBy}
            disabled={record.isPending}
            onChange={(e) => setReturnBy(e.target.value)}
            className={FIELD_CLS}
          />
        </label>
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Fee</span>
          <span className="text-[11px] text-[var(--text-muted)]">$</span>
          <input
            aria-label="Fee"
            inputMode="decimal"
            value={fee}
            placeholder="0"
            disabled={record.isPending}
            onChange={(e) => setFee(e.target.value)}
            className={`w-20 ${FIELD_CLS}`}
          />
        </label>
        <label className="flex items-baseline gap-1.5">
          <input
            type="checkbox"
            checked={billable}
            disabled={record.isPending}
            onChange={(e) => setBillable(e.target.checked)}
          />
          <span className={LABEL_CLS}>Billable to client</span>
        </label>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <DocumentAction
          actionKey="record-sample-request"
          surfaceKey="project"
          regionKey="ffe-samples"
          variant="secondary"
          loading={record.isPending}
          onClick={save}
        >
          Record it
        </DocumentAction>
        <DocumentAction
          actionKey="cancel-sample-request"
          surfaceKey="project"
          regionKey="ffe-samples"
          variant="tertiary"
          disabled={record.isPending}
          onClick={() => setOpen(false)}
        >
          Put back
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

/** "Mark returned" — the act the memo_return Desk need carries. */
function MarkReturned({ sample }: { sample: SampleRequestRow }) {
  const markReturned = useMarkSampleReturned({ errorSurface: 'inline' });
  const [open, setOpen] = useState(false);
  const [returnedOn, setReturnedOn] = useState(todayYmd());
  const [tracking, setTracking] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <DocumentAction
        actionKey="mark-sample-returned"
        surfaceKey="project"
        regionKey="ffe-samples"
        variant="tertiary"
        onClick={() => setOpen(true)}
      >
        Mark returned
      </DocumentAction>
    );
  }

  const save = () => {
    setError(null);
    markReturned
      .mutateAsync({
        sampleId: sample.id,
        returnedOn: returnedOn || undefined,
        returnTracking: tracking.trim() || undefined,
      })
      .then(() => setOpen(false))
      .catch((e: Error) => setError(e.message || 'The return was not recorded.'));
  };

  return (
    <div data-testid="mark-returned-form" className="mt-1 flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Returned</span>
          <input
            type="date"
            aria-label="Returned on"
            value={returnedOn}
            disabled={markReturned.isPending}
            onChange={(e) => setReturnedOn(e.target.value)}
            className={FIELD_CLS}
          />
        </label>
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Tracking</span>
          <input
            aria-label="Return tracking"
            value={tracking}
            maxLength={200}
            disabled={markReturned.isPending}
            onChange={(e) => setTracking(e.target.value)}
            className={`w-28 ${FIELD_CLS}`}
          />
        </label>
        <DocumentAction
          actionKey="save-sample-returned"
          surfaceKey="project"
          regionKey="ffe-samples"
          variant="secondary"
          loading={markReturned.isPending}
          onClick={save}
        >
          Save
        </DocumentAction>
        <DocumentAction
          actionKey="cancel-sample-returned"
          surfaceKey="project"
          regionKey="ffe-samples"
          variant="tertiary"
          disabled={markReturned.isPending}
          onClick={() => setOpen(false)}
        >
          Put back
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

const isOpenSample = (row: SampleRequestRow) => row.status !== 'returned' && row.status !== 'cancelled';

/** The samples on one FF&E line — "The buy" cell. */
export function LineSamples({
  projectId,
  itemId,
  vendorId,
  vendorName,
  canEdit,
}: {
  projectId: string;
  itemId: string;
  /** The line's maker, if any — the sample's implicit vendor. */
  vendorId?: string | null;
  vendorName?: string | null;
  canEdit: boolean;
}) {
  const { data } = useSampleRequests({ projectId });
  const rows = (data ?? []).filter((row) => row.ffe_item_id === itemId);
  if (rows.length === 0 && !canEdit) return null;

  return (
    <div data-testid="line-samples" className="mt-2 flex flex-col gap-1.5">
      <p className={LABEL_CLS}>Samples</p>
      {rows.length === 0 && <CellSub>None recorded</CellSub>}
      {rows.map((row) => (
        <div key={row.id} data-testid="line-sample">
          <p className="text-[11px] text-[var(--color-charcoal)]">
            {sampleSentence(row, vendorName)}
          </p>
          {canEdit && isOpenSample(row) && <MarkReturned sample={row} />}
        </div>
      ))}
      {canEdit && (
        <RequestSample scope={{ projectId, ffeItemId: itemId, vendorId: vendorId ?? undefined }} />
      )}
    </div>
  );
}

/** The samples requested against one maker — the Vendors maker card. No
 *  project: a studio's samples with no project are organization-scoped
 *  (record_sample_request's rule), then filtered to this vendor client-side. */
export function VendorSamples({
  organizationId,
  vendorId,
  vendorName,
  canEdit,
}: {
  organizationId: string | null;
  vendorId: string;
  vendorName: string;
  canEdit: boolean;
}) {
  const { data } = useSampleRequests(organizationId ? { organizationId } : null);
  const rows = (data ?? []).filter((row) => row.vendor_id === vendorId);
  if (rows.length === 0 && !canEdit) return null;

  return (
    <div data-testid="vendor-samples" className="mt-2 flex flex-col gap-1.5">
      <p className={LABEL_CLS}>Samples</p>
      {rows.length === 0 && <CellSub>None recorded</CellSub>}
      {rows.map((row) => (
        <div key={row.id} data-testid="vendor-sample">
          <p className="text-[11px] text-[var(--color-charcoal)]">{sampleSentence(row, vendorName)}</p>
          {canEdit && isOpenSample(row) && <MarkReturned sample={row} />}
        </div>
      ))}
      {canEdit && organizationId && (
        <RequestSample scope={{ organizationId, vendorId }} />
      )}
    </div>
  );
}
