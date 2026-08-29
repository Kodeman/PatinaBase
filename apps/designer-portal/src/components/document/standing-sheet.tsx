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
import type {
  LensInputItem,
  LensStandingItem,
} from '@/lib/document/lens-band-derivation';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { DocSheet } from './overlays/doc-sheet';

const ROW =
  'grid grid-cols-[1fr_auto] items-center gap-x-3 border-b border-dashed border-[rgba(139,115,85,0.14)] py-2.5 last:border-b-0';
const EYEBROW =
  'font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-terracotta-ink)]';
const SENTENCE = 'mt-0.5 font-heading text-[14px] text-[var(--color-charcoal)]';

export function StandingSheet({
  open,
  onClose,
  items,
  inputs = [],
  triggerRef,
}: {
  open: boolean;
  onClose: () => void;
  items: readonly LensStandingItem[];
  /** W3-R2 — the stage's open inputs, their own section under the exceptions. */
  inputs?: readonly LensInputItem[];
  /** The band's `+N MORE` button — where focus goes when the sheet is put
   *  back, if the button itself was replaced while the sheet stood open. */
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <DocSheet
      open={open}
      onClose={onClose}
      title={`Standing · ${items.length + inputs.length}`}
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
              className={ROW}
            >
              <div className="min-w-0">
                <p className={EYEBROW}>{item.eyebrow}</p>
                <p className={SENTENCE}>{item.sentence}</p>
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
        {inputs.length > 0 && (
          <>
            {/* W3-R2 — the inputs are facts about the next stage, not standing
                exceptions, so they stand under their own rule and heading in
                the same register rather than mixing into the list above. */}
            <p
              data-standing-input-heading
              className={`mt-4 border-t border-[var(--rule-mid)] pt-3 ${EYEBROW}`}
            >
              INPUT NEEDED · {inputs.length}
            </p>
            <ul className="w-full">
              {inputs.map((item) => (
                <li key={item.key} data-standing-input-row className={ROW}>
                  <div className="min-w-0">
                    <p className={EYEBROW}>{item.eyebrow}</p>
                    <p className={SENTENCE}>{item.sentence}</p>
                  </div>
                  {item.act && (
                    <DocumentAction
                      actionKey={`standing-input-${item.key}`}
                      variant="secondary"
                      onClick={item.act.onAct}
                    >
                      {item.act.label}
                    </DocumentAction>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </DocumentActionGroup>
    </DocSheet>
  );
}
