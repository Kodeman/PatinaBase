'use client';

/**
 * The margin rail (spec §5, D12): anchored items down the document's right
 * edge — and the notification model itself (D2): nothing here breaks
 * through; it accumulates quietly and the Desk re-sorts. Empty margins show
 * the R8 placeholder so the full-bleed geometry holds.
 */

import { useState } from 'react';
import { useMarginItems } from '@/hooks/use-margin-items';
import type { MarginItemRow } from '@/lib/document/margin-derivation';
import { MarginItem } from './margin-item';
import { DecisionBody, InvoiceBody, MessageBody, PulseBody } from './margin-bodies';

export function MarginRail({
  projectId,
  proposalId,
  clientName,
  onHoverLine,
}: {
  projectId: string | null;
  proposalId: string | null;
  clientName: string;
  onHoverLine: (lineId: string | null) => void;
}) {
  const { data: items, isLoading } = useMarginItems(projectId, proposalId);
  const [openId, setOpenId] = useState<string | null>(null);

  const decisionRows = (items ?? []).filter((i) => i.kind === 'decision');

  const bodyFor = (row: MarginItemRow) => {
    switch (row.kind) {
      case 'decision':
        return <DecisionBody row={row} projectId={projectId} />;
      case 'message':
        return <MessageBody row={row} projectId={projectId} />;
      case 'invoice':
        return <InvoiceBody row={row} projectId={projectId} />;
      case 'pulse':
        return (
          <PulseBody
            row={row}
            projectId={projectId}
            clientName={clientName}
            decisionRows={decisionRows}
          />
        );
      case 'time':
        return null; // review/edit lives in the Hours ledger (Slice 5)
    }
  };

  return (
    <>
      <p className="mb-3 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        In the margin
      </p>

      {!isLoading && (items ?? []).length === 0 && (
        <p className="text-[11px] italic leading-relaxed text-[var(--text-muted)]">
          The margin — decisions, messages, and money gather here
        </p>
      )}

      {(items ?? []).map((row) => {
        const expandable = row.kind !== 'time';
        return (
          <MarginItem
            key={`${row.kind}-${row.item_id}`}
            row={row}
            open={openId === row.item_id}
            onToggle={
              expandable
                ? () => setOpenId((v) => (v === row.item_id ? null : row.item_id))
                : undefined
            }
            onHoverAnchor={onHoverLine}
          >
            {bodyFor(row)}
          </MarginItem>
        );
      })}
    </>
  );
}
