'use client';

/**
 * The red letter — every need the document is carrying, printed once, in one
 * place, at the top of the page.
 *
 * It is a region, not an alert: the needs are already true when the page opens
 * and nothing about them is a live interruption, so it must never seize a
 * screen reader mid-sentence the way role="alert" would.
 */

import type { NeedKind } from '@/lib/document/desk-derivation';
import { DocumentAction, DocumentActionGroup } from './document-action';

export interface RedLetterRow {
  key: string;
  kind: NeedKind;
  text: string;
  actionLabel: string | null;
  onAct: () => void;
  urgent: boolean;
}

export function RedLetterZone({ rows }: { rows: readonly RedLetterRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section
      role="region"
      aria-label="Needs attention"
      className="rounded-[3px] border-l-2 border-[var(--color-terracotta)] bg-[rgba(212,160,144,0.08)] px-3.5 py-2.5"
    >
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[#C4836F]">
        Needs attention · in one place
      </p>
      <ul className="mt-1.5">
        {rows.map((row) => (
          <li
            key={row.key}
            data-need-kind={row.kind}
            data-need-urgent={row.urgent || undefined}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 border-b border-dashed border-[rgba(139,115,85,0.14)] py-1 last:border-b-0"
          >
            <p className="font-heading text-[14px] font-medium text-[var(--color-charcoal)]">
              {row.text}
            </p>
            {row.actionLabel && (
              <DocumentActionGroup
                surfaceKey="document"
                regionKey="red-letter"
                className="justify-end"
              >
                <DocumentAction
                  actionKey={`red-letter-${row.kind}`}
                  variant="secondary"
                  onClick={row.onAct}
                >
                  {row.actionLabel}
                </DocumentAction>
              </DocumentActionGroup>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
