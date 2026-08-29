'use client';

/**
 * The standing sheet (OD-6, L-11).
 *
 * Every standing exception the document is carrying, ranked worst first, each
 * with its own act — the `NEEDS ATTENTION · IN ONE PLACE` block's content moved
 * into an overlay rather than deleted, and strictly more than the two
 * `deriveTicketSeam` used to print before dropping the third whole (F50).
 *
 * It is the shipped `DocSheet` at every width: `fixed inset-0`, Esc and the
 * put-back word close it, and focus returns to the `+N MORE` button the band
 * opened it from.
 */

import { AlertCircle } from 'lucide-react';
import type { RefObject } from 'react';
import type { LensStandingItem } from '@/lib/document/lens-band-derivation';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { DocSheet } from './overlays/doc-sheet';

export function StandingSheet({
  open,
  onClose,
  items,
  triggerRef,
}: {
  open: boolean;
  onClose: () => void;
  items: readonly LensStandingItem[];
  /** The band's `+N MORE` button — where focus goes when the sheet is put
   *  back, if the button itself was replaced while the sheet stood open. */
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <DocSheet
      open={open}
      onClose={onClose}
      title={`Standing · ${items.length}`}
      icon={AlertCircle}
      kind="standing"
      fallbackFocusRef={triggerRef}
    >
      <DocumentActionGroup
        surfaceKey="document"
        regionKey="standing-sheet"
        aria-label="Standing actions"
      >
        <ul className="w-full">
          {items.map((item) => (
            <li
              key={item.key}
              data-standing-row
              data-standing-tier={item.tier}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 border-b border-dashed border-[rgba(139,115,85,0.14)] py-2.5 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-terracotta-ink)]">
                  {item.eyebrow}
                </p>
                <p className="mt-0.5 font-heading text-[14px] text-[var(--color-charcoal)]">
                  {item.sentence}
                </p>
              </div>
              {item.act && (
                <DocumentAction
                  actionKey={`standing-${item.key}`}
                  variant="secondary"
                  onClick={item.act.onAct}
                >
                  {item.act.label}
                </DocumentAction>
              )}
            </li>
          ))}
        </ul>
      </DocumentActionGroup>
    </DocSheet>
  );
}
