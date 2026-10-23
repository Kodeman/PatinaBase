'use client';

/**
 * Needs your attention (WP-01.8): the Day Sheet's ranked lines as one
 * numbered editorial list. Each line names its job and opens the exact place:
 * the need's own destination where it has one, the job at the line it
 * carries, else the job. A need that opens a ledger opens it, as the Desk's
 * own lines do. Leaving for a job holds the Desk's place first (F6) and
 * remembers the studio as the job's way back (C1 §2).
 */

import { type MouseEvent } from 'react';
import type { DaySheet, SheetCard } from '@/lib/document/day-sheet';
import type { DeskScope } from '@/lib/document/desk-scope';
import { deskActionLabel, deskNeedText, type NeedLine } from '@/lib/document/desk-derivation';
import { DocumentAction } from '@/components/document/document-action';
import { openLedger } from '@/components/document/command-bar';

export interface AttentionItem {
  key: string;
  /** The job the line opens (`/doc/<docId>`). */
  docId: string;
  jobName: string;
  sentence: string;
  actLabel: string;
  href: string;
  ledger?: NeedLine['ledger'];
  /** The element Back returns focus to. */
  anchorId: string;
}

export function attentionAnchorId(key: string): string {
  return `studio-attention-${key}`;
}

/** The need's own destination; else its job, at the line it carries. */
export function attentionHref(docId: string, need: Pick<NeedLine, 'deepLink' | 'draft'>): string {
  if (need.deepLink) return need.deepLink;
  const line = need.draft?.ffeItemId;
  return line ? `/doc/${docId}?ffeItemId=${encodeURIComponent(line)}` : `/doc/${docId}`;
}

/** The sheet's open lines, in rank order; a line settled today has left. */
export function deriveAttentionItems(
  sheet: Pick<DaySheet, 'lines'>,
  cards: readonly Pick<SheetCard, 'jobId' | 'name'>[],
  oneVoice: boolean,
): AttentionItem[] {
  const names = new Map(cards.map((card) => [card.jobId, card.name]));
  return sheet.lines
    .filter((entry) => !entry.settled)
    .map((entry) => ({
      key: entry.key,
      docId: entry.projectId,
      jobName: names.get(entry.projectId) ?? entry.projectName,
      sentence: deskNeedText(entry.need, oneVoice),
      actLabel: deskActionLabel(entry.need, oneVoice) ?? 'Open project file',
      href: attentionHref(entry.projectId, entry.need),
      ...(entry.need.ledger ? { ledger: entry.need.ledger } : {}),
      anchorId: attentionAnchorId(entry.key),
    }));
}

const SCOPES: ReadonlyArray<{ key: DeskScope; word: string }> = [
  { key: 'mine', word: 'Mine' },
  { key: 'studio', word: 'Studio' },
];

export function AttentionList({
  items,
  unchecked,
  scope,
  onScope,
  onLeave,
}: {
  items: readonly AttentionItem[];
  unchecked: readonly string[];
  scope: DeskScope;
  onScope: (scope: DeskScope) => void;
  /** Called before the page leaves for a job. */
  onLeave: (item: AttentionItem) => void;
}) {
  const open = (item: AttentionItem) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (item.ledger) {
      event.preventDefault();
      openLedger(item.ledger.name, item.ledger.context);
      return;
    }
    onLeave(item);
  };

  return (
    <section
      aria-labelledby="studio-attention-head"
      data-studio-attention
      data-tour-anchor="desk-needs-your-hand"
      className="border-t-2 border-[var(--ink)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3 pt-4">
        <h2 id="studio-attention-head" className="t-d2">
          Needs your attention
        </h2>
        <div role="group" aria-label="Whose lines" className="flex gap-3">
          {SCOPES.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={scope === option.key}
              onClick={() => onScope(option.key)}
              className="r8-small min-h-11 text-[var(--ink-faint)] underline-offset-4 aria-pressed:text-[var(--color-forest)] aria-pressed:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              {option.word}
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="t-body-sm border-t border-[var(--hairline-strong)] py-5 text-[var(--ink-faint)]">
          {unchecked.length > 0
            ? `Not checked: ${unchecked.join(', ')}.`
            : 'Nothing needs your hand today.'}
        </p>
      ) : (
        <ol className="min-[600px]:max-[1179px]:grid min-[600px]:max-[1179px]:grid-cols-3 min-[600px]:max-[1179px]:gap-5">
          {items.map((item, index) => (
            <li
              key={item.key}
              data-studio-attention-item={item.key}
              className="grid grid-cols-[24px_minmax(0,1fr)] gap-4 border-t border-[var(--hairline-strong)] py-5 min-[600px]:max-[1179px]:grid-cols-1"
            >
              <span
                aria-hidden="true"
                className="font-heading text-[23px] italic leading-none text-[var(--color-forest)] min-[600px]:max-[1179px]:hidden"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="r8-small text-[var(--ink-faint)]">{item.jobName}</p>
                <h3 className="t-d3 mt-1 [overflow-wrap:anywhere]">{item.sentence}</h3>
                <DocumentAction
                  id={item.anchorId}
                  actionKey="studio-attention-open"
                  variant="tertiary"
                  href={item.href}
                  onClick={open(item)}
                  aria-label={`${item.actLabel} — ${item.jobName}`}
                  className="mt-2"
                >
                  {item.actLabel}
                </DocumentAction>
              </div>
            </li>
          ))}
        </ol>
      )}
      {items.length > 0 && unchecked.length > 0 && (
        <p className="r8-small border-t border-[var(--hairline-strong)] pt-3 text-[var(--ink-faint)]">
          {`Not checked: ${unchecked.join(', ')}.`}
        </p>
      )}
    </section>
  );
}
