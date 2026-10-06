import { CellSub, UnfoldCell } from './cell';

/**
 * C-14 cell 2 — the quote. Present and quiet until Phase 2 (C-29) records
 * quotes against the line.
 */
export function QuoteCell() {
  return (
    <UnfoldCell head="Quote" testId="line-quote-cell">
      <CellSub>No quote recorded</CellSub>
    </UnfoldCell>
  );
}
