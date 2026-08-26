'use client';

/**
 * WorkOrderSheet — the page the trade gets.
 *
 * The document the trade prices and the document the client signs describe
 * identical work, so this is the same prose, room by room, with the party's
 * name at the top and nothing else added. No client price, no markup, no bid
 * ledger: what a scope costs the studio and what it costs the client are both
 * none of this page's business.
 *
 * PRINT prints the work order and nothing else — the same scoped @media print
 * idiom the call sheet uses, hiding every sibling of the sheet layer and
 * flattening the panel onto the page.
 */

import { ClipboardList } from 'lucide-react';
import type {
  TradeScopeSectionView,
  TradeScopeTermsView,
} from '@/lib/document/project-commerce';
import { DocSheet } from '../../overlays/doc-sheet';
import { DocumentAction } from '../../document-action';

const PRINT_CSS = `@media print {
  body > *:not(:has([data-work-order-region])) { display: none !important; }
  [data-doc-sheet-layer] { position: static !important; overflow: visible !important; padding: 0 !important; }
  [data-testid='doc-sheet-backdrop'] { display: none !important; }
  [data-doc-sheet-panel] { position: static !important; max-width: none !important; max-height: none !important; overflow: visible !important; border: 0 !important; border-radius: 0 !important; }
  .work-order-no-print { display: none !important; }
}`;

export function WorkOrderSheet({
  open,
  onClose,
  projectName,
  scopeNumber,
  title,
  terms,
  sections,
}: {
  open: boolean;
  onClose: () => void;
  projectName: string;
  scopeNumber: number;
  title: string;
  terms: TradeScopeTermsView | null;
  sections: readonly TradeScopeSectionView[];
}) {
  return (
    <DocSheet
      open={open}
      onClose={onClose}
      wide
      icon={ClipboardList}
      title="Work order"
      pageLabel={`TS${scopeNumber}`}
    >
      <style>{PRINT_CSS}</style>
      <div data-work-order-region>
        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-clay-ink)]">
          Work order · Trade scope № {scopeNumber}
        </p>
        <h3 className="mt-1 font-heading text-xl text-[var(--color-charcoal)]">
          {title}
        </h3>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          {projectName}
          {terms?.partyDisplayName ? ` · ${terms.partyDisplayName}` : ''}
          {terms?.partyCompanyName ? ` · ${terms.partyCompanyName}` : ''}
        </p>

        {sections.length === 0 ? (
          <p className="mt-4 text-[11.5px] italic text-[var(--text-muted)]">
            No rooms on this scope.
          </p>
        ) : (
          sections.map((section) => (
            <div
              key={section.id || section.roomName}
              className="mt-4 border-t border-[var(--color-pearl)] pt-3"
            >
              <h4 className="font-heading text-[13.5px] font-medium italic text-[var(--color-charcoal)]">
                {section.roomName || 'Throughout'}
              </h4>
              <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-[var(--color-charcoal)]">
                {section.prose}
              </p>
            </div>
          ))
        )}

        {terms?.terms && (
          <div className="mt-4 border-l-2 border-[var(--color-pearl)] pl-3">
            <p className="whitespace-pre-line text-[11.5px] leading-relaxed text-[var(--color-mocha)]">
              {terms.terms}
            </p>
          </div>
        )}

        <p className="mt-4 text-[10px] italic text-[var(--text-muted)]">
          Payment is per the number agreed with the studio.
        </p>
      </div>

      <div className="work-order-no-print mt-5">
        <DocumentAction
          actionKey="print-work-order"
          surfaceKey="trade-scope"
          regionKey="work-order"
          variant="tertiary"
          onClick={() => window.print()}
        >
          Print
        </DocumentAction>
      </div>
    </DocSheet>
  );
}
