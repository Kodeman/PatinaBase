'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUpdatePurchaseOrderETA,
  useUpdatePurchaseOrderStatus,
} from '@patina/supabase';
import { fmtDay } from '@/lib/document/format';
import { DateTextInput } from '../date-text-input';
import { DocumentAction } from '../document-action';
import { CellValue, LABEL_CLS, UnfoldCell } from './cell';
import { NEXT_PO_STATUS } from './next-act';

type FFERow = any;

/**
 * The status act's own component, so the mutation mounts only where a move
 * is on offer. The 00184 cascade carries the line (and the balance flip on
 * ship) server-side. Lifted as the line's next act, it leads (primary).
 */
export function PoStatusAct({
  poId,
  projectId,
  to,
  label,
  lifted = false,
  onAdvanced,
}: {
  poId: string;
  projectId: string;
  to: 'in_production' | 'shipped';
  label: string;
  lifted?: boolean;
  onAdvanced: (to: 'in_production' | 'shipped') => void;
}) {
  const qc = useQueryClient();
  const advance = useUpdatePurchaseOrderStatus();
  const [failed, setFailed] = useState(false);

  const run = () => {
    if (advance.isPending) return;
    setFailed(false);
    advance
      .mutateAsync({ purchaseOrderId: poId, status: to, projectId })
      .then(() => {
        onAdvanced(to);
        void qc.invalidateQueries({ queryKey: ['document-state'] });
      })
      .catch(() => setFailed(true));
  };

  return (
    <div className={lifted ? undefined : 'mt-1'}>
      <DocumentAction
        actionKey={`advance-po-${to.replace('_', '-')}`}
        surfaceKey="project"
        regionKey={lifted ? 'ffe-next-act' : 'ffe-movement'}
        variant={lifted ? 'primary' : 'tertiary'}
        loading={advance.isPending}
        loadingLabel="Saving…"
        onClick={run}
      >
        {label}
      </DocumentAction>
      {failed && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          Couldn&rsquo;t save
        </p>
      )}
    </div>
  );
}

/**
 * PRC-12 (R84): the Movement cell with the single-PO confirmed-ETA edit —
 * EtaQuickEditDrawer's mutation ported into a quiet inline date field (the
 * PRD W2.4 vision: vendor emails a delay, type the date, done). Saves on a
 * complete date, confirms in a line of text (R51), fails inline (R83).
 *
 * The status act (C-03) renders here only when it is not the line's lifted
 * next act — e.g. while the ack is still the step ahead of it.
 */
export function MovementCell({
  item,
  po,
  projectId,
  poStatus,
  showAdvance,
  onAdvanced,
}: {
  item: FFERow;
  po: FFERow | null;
  projectId: string;
  /** The PO's status with any just-recorded move applied. */
  poStatus: string | null;
  showAdvance: boolean;
  onAdvanced: (to: 'in_production' | 'shipped') => void;
}) {
  const qc = useQueryClient();
  const updateEta = useUpdatePurchaseOrderETA({ errorSurface: 'inline' });
  const nextStatus = po && poStatus ? NEXT_PO_STATUS[poStatus] : undefined;
  const [eta, setEta] = useState<string>(
    po?.confirmed_eta ? po.confirmed_eta.slice(0, 10) : '',
  );
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Follow external ETA changes (same-truck batch, ack coalesce) into the field.
  useEffect(() => {
    setEta(po?.confirmed_eta ? po.confirmed_eta.slice(0, 10) : '');
  }, [po?.confirmed_eta]);

  const save = (value: string) => {
    // <input type="date"> yields '' until a complete date exists — the same
    // canSave guard the drawer used.
    if (!po || !/^\d{4}-\d{2}-\d{2}$/.test(value) || updateEta.isPending)
      return;
    setError(null);
    setSaved(null);
    updateEta
      .mutateAsync({ purchaseOrderId: po.id, newEta: value })
      .then(() => {
        setSaved(value);
        // One act, many surfaces (§5): line cell, Orders row, Week, Desk.
        void qc.invalidateQueries({ queryKey: ['project-ffe-items'] });
        void qc.invalidateQueries({ queryKey: ['document-state'] });
      })
      .catch((e: Error) =>
        setError(e.message || 'The ETA could not be saved.'),
      );
  };

  return (
    <UnfoldCell head="Movement" testId="line-movement-cell">
      <CellValue>
        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
      </CellValue>
      {po && nextStatus && showAdvance && (
        <PoStatusAct
          key={nextStatus.to}
          poId={po.id}
          projectId={projectId}
          to={nextStatus.to}
          label={nextStatus.label}
          onAdvanced={onAdvanced}
        />
      )}
      {po ? (
        <>
          <label className="flex items-baseline gap-1.5">
            <span className={LABEL_CLS}>arrives</span>
            <DateTextInput
              value={eta || null}
              ariaLabel="Confirmed ETA"
              disabled={updateEta.isPending}
              onChange={(value) => {
                const next = value ?? '';
                setEta(next);
                save(next);
              }}
              className="bg-transparent text-[11px] text-[var(--color-charcoal)] outline-none"
            />
          </label>
          {!eta && po.status === 'shipped' && !error && (
            <p className="text-[11px] text-[var(--text-muted)]">
              shipped — no scheduled arrival
            </p>
          )}
          {saved && !error && (
            // R51: the quiet confirmation.
            <p className="text-[11px] text-[var(--text-muted)]">
              eta updated — arrives ~{fmtDay(saved)}
            </p>
          )}
          {error && (
            // R83: inline at the act — the reason and a retry.
            <div role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
              <p>{error}</p>
              <DocumentAction
                actionKey="retry-save-ffe-eta"
                surfaceKey="project"
                regionKey="ffe-eta-error"
                variant="primary"
                onClick={() => save(eta)}
                className="mt-2"
              >
                Try again
              </DocumentAction>
            </div>
          )}
        </>
      ) : (
        item.eta && (
          <p className="text-[11px] text-[var(--text-muted)]">
            eta ~{fmtDay(item.eta)}
          </p>
        )
      )}
    </UnfoldCell>
  );
}
