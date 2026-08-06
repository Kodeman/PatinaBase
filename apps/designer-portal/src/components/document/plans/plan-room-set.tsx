'use client';

/**
 * The current set and the drawing log — the room's resting face.
 *
 * Every holder line here is read off transmittals by the pure model: nobody
 * types "Boone holds Rev B", the ledger says it. When anyone is behind, one
 * golden-hour band across the page says so and offers the single act that fixes
 * it — issue the current set.
 *
 * The log is a CSS grid, never a <table>: the Document's ledgers are ruled
 * paper, not tabular data (D4 · zero shadows throughout).
 */

import type { PlanRoomBundle } from '@patina/supabase';
import {
  deriveCurrentSet,
  deriveDrawingLog,
  deriveHolders,
  type DrawingLogEvent,
} from '@/lib/plans/model';
import { fmtDay } from '@/lib/document/format';
import { DocumentAction, DocumentActionRow } from '../document-action';
import { SectionEyebrow } from '../section-eyebrow';
import { StatusChip } from '../status-chip';

const STATE_WORD: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'var(--color-aged-oak)' },
  shared: { label: 'Shared', color: '#85947C' },
};

const EVENT_COLOR: Record<DrawingLogEvent, string> = {
  filed: 'var(--color-aged-oak)',
  flipped: 'var(--color-golden-hour)',
  issued: '#85947C',
  transmitted: 'var(--color-clay)',
};

/** The rev letter as a drawing wears it: a small ruled box, not a pill. */
function RevLetterBadge({ letter }: { letter: string | null }) {
  return (
    <span className="inline-flex min-h-[22px] min-w-[22px] items-center justify-center border border-[var(--color-aged-oak)] px-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-charcoal)]">
      {letter ?? '—'}
    </span>
  );
}

export interface PlanRoomSetProps {
  bundle: PlanRoomBundle;
  onOpenSheet: (sheetId: string) => void;
  onIssue: () => void;
  onChooseFile: () => void;
}

export function PlanRoomSet({
  bundle,
  onOpenSheet,
  onIssue,
  onChooseFile,
}: PlanRoomSetProps) {
  const set = deriveCurrentSet(bundle);
  const holders = deriveHolders(bundle);
  const log = deriveDrawingLog(bundle);
  const behind = holders.filter((holder) => holder.behindCount > 0);

  if (set.length === 0) {
    return (
      <section
        aria-label="The light table"
        className="mx-auto max-w-[42rem] px-4 py-20 text-center md:px-8"
      >
        <div className="inline-block text-left">
          <SectionEyebrow>The light table</SectionEyebrow>
        </div>
        <p className="mx-auto max-w-[34rem] font-heading text-[1.35rem] italic leading-relaxed text-[var(--color-charcoal)]">
          Drop a PDF set — the table splits it, proposes where each page belongs,
          and nothing is current until you confirm.
        </p>
        <DocumentActionRow
          surfaceKey="plan-room"
          regionKey="empty-invitation"
          className="mt-6 justify-center"
        >
          <DocumentAction
            actionKey="choose-plan-pdf-empty"
            variant="primary"
            onClick={onChooseFile}
          >
            Choose a PDF
          </DocumentAction>
        </DocumentActionRow>
      </section>
    );
  }

  return (
    <section aria-label="The current set" className="px-4 py-6 md:px-8">
      {behind.length > 0 && (
        <div
          data-plan-holder-band
          className="mb-6 flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 border-l-2 border-[var(--color-golden-hour)] bg-white/40 px-3 py-2.5"
        >
          <div className="min-w-0">
            {behind.map((holder) => (
              <p
                key={holder.partyKey}
                className="text-[0.82rem] text-[var(--color-charcoal)]"
              >
                {holder.partyDisplayName} holds Rev {holder.behindRev} · current
                is Rev {holder.currentRev} · last sent {fmtDay(holder.sentAt)}
              </p>
            ))}
          </div>
          <DocumentActionRow
            surfaceKey="plan-room"
            regionKey="holders-behind"
            aria-label="Bring the holders current"
          >
            <DocumentAction
              actionKey="issue-current-set-band"
              variant="primary"
              onClick={onIssue}
            >
              Issue the current set
            </DocumentAction>
          </DocumentActionRow>
        </div>
      )}

      <SectionEyebrow count={set.length}>The current set</SectionEyebrow>
      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {set.map((row) => {
          const held = holders
            .flatMap((holder) =>
              holder.holds
                .filter((sheet) => sheet.sheetId === row.sheetId)
                .map((sheet) => ({ holder, sheet })),
            )
            .sort((a, b) =>
              a.holder.partyDisplayName.localeCompare(b.holder.partyDisplayName),
            );
          const word = STATE_WORD[row.state] ?? {
            label: row.state,
            color: 'var(--color-aged-oak)',
          };
          return (
            <button
              key={row.sheetId}
              type="button"
              onClick={() => onOpenSheet(row.sheetId)}
              className="flex min-h-[44px] flex-col items-start gap-1.5 border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-3 text-left hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <RevLetterBadge letter={row.revLetter} />
                  <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-charcoal)]">
                    {row.sheetNumber}
                  </span>
                </span>
                <StatusChip label={word.label} color={word.color} />
              </span>
              <span className="line-clamp-2 text-[0.82rem] text-[var(--color-charcoal)]">
                {row.title}
              </span>
              {held.length > 0 && (
                <span className="mt-0.5 flex flex-col gap-0.5">
                  {held.map(({ holder, sheet }) => (
                    <span
                      key={holder.partyKey}
                      className={`font-mono text-[8.5px] uppercase tracking-[0.1em] ${
                        sheet.behind
                          ? 'text-[var(--color-golden-hour)]'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {holder.partyDisplayName} holds Rev {sheet.heldRev}
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <SectionEyebrow count={log.length}>The drawing log</SectionEyebrow>
      <div role="list" aria-label="Drawing log" className="grid">
        <div
          aria-hidden
          className="grid grid-cols-[5.5rem_7rem_minmax(0,1fr)] gap-3 border-b border-[var(--color-pearl)] pb-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--text-muted)] sm:grid-cols-[6rem_7rem_minmax(0,1fr)_12rem]"
        >
          <span>When</span>
          <span>Event</span>
          <span>What</span>
          <span className="hidden sm:block">Who</span>
        </div>
        {log.map((row) => (
          <div
            key={row.key}
            role="listitem"
            className="grid grid-cols-[5.5rem_7rem_minmax(0,1fr)] gap-3 border-b border-[var(--color-pearl)] py-2 sm:grid-cols-[6rem_7rem_minmax(0,1fr)_12rem]"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              {fmtDay(row.at)}
            </span>
            <span>
              <StatusChip label={row.event} color={EVENT_COLOR[row.event]} />
            </span>
            <span className="text-[0.8rem] text-[var(--color-charcoal)]">
              {row.what}
            </span>
            <span className="col-span-3 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)] sm:col-span-1">
              {row.who ?? ''}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
