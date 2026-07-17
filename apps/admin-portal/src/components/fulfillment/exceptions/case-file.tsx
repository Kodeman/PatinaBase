'use client';

import {
  inspectionCountdown,
  circledIndex,
  EXCEPTION_TYPE_LABELS,
  type ExceptionCaseFileDTO,
} from '@patina/fulfillment';
import { EvidenceGrid } from './evidence-grid';
import { ResolutionPaths } from './resolution-paths';

// The Exception case file (S7, spec §5.5) — clock dominant, evidence to R2,
// resolution paths as sentences with their ledger consequence in mono before
// commit. Feel ported (not markup) from the presentation's DMG-0031 case file.

const labelCls = 'text-[0.53rem] uppercase tracking-[0.13em] text-[var(--text-muted)]';

function ClockHero({ caseFile }: { caseFile: ExceptionCaseFileDTO }) {
  const countdown = inspectionCountdown(caseFile.clockDueAt, Date.now());
  const color = countdown?.terracotta
    ? 'var(--color-terracotta, var(--color-error))'
    : 'var(--color-sage, var(--color-success))';

  return (
    <div className="mt-4 border-y py-4" style={{ borderColor: 'var(--border-default)' }} data-testid="exception-clock-hero">
      <div className={labelCls}>
        {caseFile.type === 'damage' ? 'Carrier claim window · per carrier profile' : 'Clock'}
      </div>
      <div
        className="mt-1 leading-none tabular-nums"
        style={{ fontFamily: 'var(--font-meta)', color, fontSize: '2.4rem', fontWeight: 600 }}
        data-testid="exception-clock-value"
      >
        {countdown ? countdown.label.toUpperCase() : caseFile.clockDueAt ? '—' : 'NO CLOCK'}
      </div>
    </div>
  );
}

export function CaseFile({ caseFile }: { caseFile: ExceptionCaseFileDTO }) {
  const typeLabel = EXCEPTION_TYPE_LABELS[caseFile.type] ?? caseFile.type;
  const refs: string[] = [];
  if (caseFile.orderNo != null) refs.push(`Order #${caseFile.orderNo}`);
  if (caseFile.clientName) refs.push(caseFile.clientName);
  if (caseFile.poNumber) refs.push(caseFile.poNumber);
  if (caseFile.itemIndex != null) refs.push(`line ${circledIndex(caseFile.itemIndex)}`);
  if (caseFile.shipmentMode) refs.push(caseFile.shipmentMode.replace('_', ' ').toUpperCase());

  return (
    <div data-testid="case-file" data-exception-type={caseFile.type} data-status={caseFile.status}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="type-item-name">{typeLabel}</h2>
        <span
          className="text-[0.7rem] uppercase tracking-[0.1em] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-meta)' }}
          data-testid="case-file-status"
        >
          {caseFile.status === 'pending_leah' ? 'with Leah' : caseFile.status}
        </span>
      </div>
      <div className="mt-1 text-[0.85rem] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-meta)' }}>
        {refs.join(' · ')}
      </div>

      <ClockHero caseFile={caseFile} />

      <EvidenceGrid caseFile={caseFile} />

      {caseFile.status === 'pending_leah' ? (
        <div className="mt-6 border p-3" style={{ borderColor: 'var(--border-default)' }} data-testid="pending-leah">
          <div className={labelCls}>With Leah</div>
          <p className="mt-1 text-[0.9rem] text-[var(--text-body)]">
            This substitution is awaiting Leah&apos;s ruling at Mission Control. Her decision writes back here and
            drafts the client note.
          </p>
        </div>
      ) : (
        <ResolutionPaths caseFile={caseFile} />
      )}
    </div>
  );
}
