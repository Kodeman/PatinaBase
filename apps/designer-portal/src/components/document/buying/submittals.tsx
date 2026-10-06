'use client';

import { useState } from 'react';
import {
  useDecideSubmittal,
  useProjectSubmittals,
  useRecordSubmittal,
  type FfeLineSubmittalRow,
  type SubmittalDecision,
  type SubmittalKind,
} from '@patina/supabase';
import { fmtDay, todayYmd } from '@/lib/document/format';
import { DocumentAction } from '../document-action';
import { CellSub, FIELD_CLS, LABEL_CLS } from '../line-unfold/cell';

/**
 * C-24 (M4): a line's submittals — dated approvals that gate an order. A CFA
 * (cutting for approval), a strike-off, a shop drawing, a finish or seat
 * sample: requested, received with its dye lot and the date the mill holds
 * the fabric to, then decided once. A re-request is a new submittal. A
 * configured piece's own submittal milestone reads here too (the view's
 * `configuration_milestone` source), so the unfold never asks twice.
 */

export const SUBMITTAL_KIND_LABEL: Record<string, string> = {
  cfa: 'CFA',
  strike_off: 'Strike-off',
  shop_drawing: 'Shop drawing',
  finish_sample: 'Finish sample',
  seat_sample: 'Seat sample',
  custom_submittal: 'Submittal',
};

const KINDS: SubmittalKind[] = ['cfa', 'strike_off', 'shop_drawing', 'finish_sample', 'seat_sample'];

const DECISION_WORD: Record<string, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  revise: 'Revise and resubmit',
};

/** The submittal's facts in one line: requested, received, dye lot, reserve. */
export function submittalFacts(row: FfeLineSubmittalRow): string {
  const facts: string[] = [];
  if (row.requested_on) facts.push(`requested ${fmtDay(row.requested_on)}`);
  if (row.received_on) facts.push(`received ${fmtDay(row.received_on)}`);
  if (row.dye_lot) facts.push(`dye lot ${row.dye_lot}`);
  if (row.reserve_expires_on) facts.push(`reserve to ${fmtDay(row.reserve_expires_on)}`);
  const decision = row.decision && DECISION_WORD[row.decision];
  if (decision) {
    facts.push(row.decided_at ? `${decision.toLowerCase()} ${fmtDay(row.decided_at)}` : decision.toLowerCase());
  } else {
    facts.push(row.source === 'configuration_milestone' ? 'pending on the configuration' : 'not yet decided');
  }
  return facts.join(' · ');
}

function PendingSubmittal({ row, canEdit }: { row: FfeLineSubmittalRow; canEdit: boolean }) {
  const record = useRecordSubmittal({ errorSurface: 'inline' });
  const decide = useDecideSubmittal({ errorSurface: 'inline' });
  const [receivedOn, setReceivedOn] = useState(row.received_on ?? '');
  const [dyeLot, setDyeLot] = useState(row.dye_lot ?? '');
  const [reserve, setReserve] = useState(row.reserve_expires_on ?? '');
  const [error, setError] = useState<string | null>(null);
  const pending = record.isPending || decide.isPending;
  const id = row.id as string;

  const changed =
    receivedOn !== (row.received_on ?? '') ||
    dyeLot.trim() !== (row.dye_lot ?? '') ||
    reserve !== (row.reserve_expires_on ?? '');

  const save = () => {
    setError(null);
    record
      .mutateAsync({
        id,
        receivedOn: receivedOn || null,
        dyeLot: dyeLot.trim() || null,
        reserveExpiresOn: reserve || null,
      })
      .catch((e: Error) => setError(e.message || 'The submittal was not saved.'));
  };
  const decideAs = (decision: SubmittalDecision) => {
    setError(null);
    decide
      .mutateAsync({ submittalId: id, decision })
      .catch((e: Error) => setError(e.message || 'The decision was not saved.'));
  };

  if (!canEdit) return null;
  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Received</span>
          <input
            type="date"
            aria-label="Received on"
            value={receivedOn}
            disabled={pending}
            onChange={(e) => setReceivedOn(e.target.value)}
            className={FIELD_CLS}
          />
        </label>
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Dye lot</span>
          <input
            aria-label="Dye lot"
            value={dyeLot}
            maxLength={120}
            disabled={pending}
            onChange={(e) => setDyeLot(e.target.value)}
            className={`w-20 ${FIELD_CLS}`}
          />
        </label>
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Reserve to</span>
          <input
            type="date"
            aria-label="Reserve expires on"
            value={reserve}
            disabled={pending}
            onChange={(e) => setReserve(e.target.value)}
            className={FIELD_CLS}
          />
        </label>
        {changed && (
          <DocumentAction
            actionKey="save-submittal"
            surfaceKey="project"
            regionKey="ffe-submittals"
            variant="tertiary"
            disabled={pending}
            onClick={save}
          >
            Save
          </DocumentAction>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <DocumentAction
          actionKey="approve-submittal"
          surfaceKey="project"
          regionKey="ffe-submittals"
          variant="tertiary"
          disabled={pending}
          onClick={() => decideAs('approved')}
        >
          Approve
        </DocumentAction>
        <DocumentAction
          actionKey="revise-submittal"
          surfaceKey="project"
          regionKey="ffe-submittals"
          variant="tertiary"
          disabled={pending}
          onClick={() => decideAs('revise')}
        >
          Revise
        </DocumentAction>
        <DocumentAction
          actionKey="reject-submittal"
          surfaceKey="project"
          regionKey="ffe-submittals"
          variant="tertiary"
          disabled={pending}
          onClick={() => decideAs('rejected')}
        >
          Reject
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

function RequestSubmittal({ itemId, defaultKind }: { itemId: string; defaultKind: SubmittalKind }) {
  const record = useRecordSubmittal({ errorSurface: 'inline' });
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SubmittalKind>(defaultKind);
  const [requestedOn, setRequestedOn] = useState(todayYmd());
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <DocumentAction
        actionKey="request-submittal"
        surfaceKey="project"
        regionKey="ffe-submittals"
        variant="tertiary"
        onClick={() => setOpen(true)}
      >
        Record a submittal
      </DocumentAction>
    );
  }
  const save = () => {
    setError(null);
    record
      .mutateAsync({ ffeItemId: itemId, kind, requestedOn: requestedOn || null })
      .then(() => setOpen(false))
      .catch((e: Error) => setError(e.message || 'The submittal was not recorded.'));
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <select
          aria-label="Submittal kind"
          value={kind}
          disabled={record.isPending}
          onChange={(e) => setKind(e.target.value as SubmittalKind)}
          className={FIELD_CLS}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {SUBMITTAL_KIND_LABEL[k]}
            </option>
          ))}
        </select>
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
        <DocumentAction
          actionKey="record-submittal"
          surfaceKey="project"
          regionKey="ffe-submittals"
          variant="secondary"
          loading={record.isPending}
          onClick={save}
        >
          Record it
        </DocumentAction>
        <DocumentAction
          actionKey="cancel-submittal"
          surfaceKey="project"
          regionKey="ffe-submittals"
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

/** The submittals on one line, oldest first, with the act to record one. */
export function LineSubmittals({
  projectId,
  itemId,
  canEdit,
  defaultKind = 'shop_drawing',
}: {
  projectId: string;
  itemId: string;
  canEdit: boolean;
  /** A COM fabric line asks for a CFA first. */
  defaultKind?: SubmittalKind;
}) {
  const { data } = useProjectSubmittals(projectId);
  const rows = (data ?? []).filter((row) => row.ffe_item_id === itemId);
  if (rows.length === 0 && !canEdit) return null;

  return (
    <div data-testid="line-submittals" className="mt-2 flex flex-col gap-1.5">
      <p className={LABEL_CLS}>Submittals</p>
      {rows.length === 0 && <CellSub>None recorded</CellSub>}
      {rows.map((row) => (
        <div key={`${row.source}:${row.id}`} data-testid="line-submittal">
          <p className="text-[11px] text-[var(--color-charcoal)]">
            <span className="font-medium">{SUBMITTAL_KIND_LABEL[row.kind ?? ''] ?? 'Submittal'}</span>{' '}
            · {submittalFacts(row)}
          </p>
          {row.source === 'submittal' && row.decision === 'pending' && (
            <PendingSubmittal row={row} canEdit={canEdit} />
          )}
        </div>
      ))}
      {canEdit && <RequestSubmittal itemId={itemId} defaultKind={defaultKind} />}
    </div>
  );
}
