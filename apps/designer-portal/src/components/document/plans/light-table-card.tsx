'use client';

/**
 * One page on the Light Table. The card states what the table THINKS and asks
 * for the one thing it cannot know. Nothing here writes: the rev letter is a
 * preview off the pure model, and the letters never come from a filename.
 *
 * A near miss is the one place the table refuses to decide. It says what it
 * read, what it holds, and offers three forks — and until one is pressed the
 * card is unresolved and the confirm strip's primary stays shut.
 */

import { useEffect, useState } from 'react';
import { Input, Select } from '@/components/ui/controls';
import { previewRevLetter, type LightTableProposal } from '@/lib/plans/model';
import { StatusChip } from '../status-chip';

const DISCIPLINES = ['A', 'ID', 'EL', 'M', 'S', 'FP', 'L', 'P'];

const KIND_WORD: Record<LightTableProposal['kind'], { label: string; color: string }> = {
  confirm_current: { label: 'Already current', color: '#85947C' },
  revision: { label: 'A revision', color: 'var(--color-golden-hour)' },
  new_sheet: { label: 'A new sheet', color: 'var(--color-aged-oak)' },
  unmatched: { label: 'No sheet number', color: 'var(--color-terracotta)' },
};

const FORK_CLASS =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';

export interface LightTableCardProps {
  proposal: LightTableProposal;
  /** Display only — the card owns the object URL and revokes it on unmount. */
  thumbnail: Blob | null;
  /** The matched sheet's current revision, for the "becomes Rev x" preview. */
  currentRev: string | null;
  onChange: (next: LightTableProposal) => void;
}

export function LightTableCard({
  proposal,
  thumbnail,
  currentRev,
  onChange,
}: LightTableCardProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!thumbnail) {
      setThumbnailUrl(null);
      return;
    }
    const url = URL.createObjectURL(thumbnail);
    setThumbnailUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnail]);

  const kind = KIND_WORD[proposal.kind];
  const becomes =
    proposal.kind === 'confirm_current' ? null : previewRevLetter(currentRev);
  const unresolved = proposal.requiresFork && proposal.fork == null;

  const answerFork = (fork: NonNullable<LightTableProposal['fork']>) => {
    if (fork === 'new_sheet') {
      onChange({
        ...proposal,
        fork,
        kind: 'new_sheet',
        // A new sheet keeps the number the page's own ink carried, not the
        // number of the sheet it was nearly mistaken for.
        sheetId: null,
        sheetNumber: proposal.parsedNumber,
        discipline: proposal.parsedNumber?.split('-')[0] ?? null,
      });
      return;
    }
    onChange({
      ...proposal,
      fork,
      kind: fork === 'revision' ? 'revision' : 'confirm_current',
    });
  };

  return (
    <div
      data-plan-card
      data-page-index={proposal.pageIndex}
      data-unresolved={unresolved ? 'true' : undefined}
      className={`flex flex-col gap-2 border bg-[var(--doc-paper)] p-3 ${
        unresolved
          ? 'border-[var(--color-golden-hour)]'
          : 'border-[var(--doc-ink-border)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
          p.{proposal.pageIndex + 1}
        </span>
        <StatusChip label={kind.label} color={kind.color} />
      </div>

      <div className="flex h-[160px] items-center justify-center overflow-hidden border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)]">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            aria-hidden
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Drawing the page…
          </span>
        )}
      </div>

      {proposal.kind === 'unmatched' ? (
        <p className="text-[0.78rem] text-[var(--color-charcoal)]">
          No sheet number on this page. It goes to the Folio as a loose paper —
          the current set stays a set.
        </p>
      ) : proposal.sheetId && proposal.fork !== 'new_sheet' ? (
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-charcoal)]">
            {proposal.sheetNumber}
          </p>
          <p className="truncate text-[0.78rem] text-[var(--text-muted)]">
            {proposal.sheetTitle}
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          <Input
            aria-label={`Sheet number for page ${proposal.pageIndex + 1}`}
            value={proposal.sheetNumber ?? ''}
            placeholder="Sheet number"
            onChange={(event) =>
              onChange({ ...proposal, sheetNumber: event.target.value })
            }
          />
          <Input
            aria-label={`Sheet title for page ${proposal.pageIndex + 1}`}
            value={proposal.sheetTitle ?? ''}
            placeholder="Sheet title"
            onChange={(event) =>
              onChange({ ...proposal, sheetTitle: event.target.value })
            }
          />
          <Select
            aria-label={`Discipline for page ${proposal.pageIndex + 1}`}
            value={proposal.discipline ?? ''}
            onChange={(event) =>
              onChange({ ...proposal, discipline: event.target.value || null })
            }
          >
            <option value="">Discipline —</option>
            {[
              ...new Set(
                [...DISCIPLINES, proposal.discipline].filter(
                  (value): value is string => Boolean(value),
                ),
              ),
            ].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>
      )}

      {becomes && proposal.kind !== 'unmatched' && (
        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          becomes Rev {becomes}
        </p>
      )}

      {proposal.nearMiss && (
        <div className="border-l-2 border-[var(--color-golden-hour)] pl-2.5">
          <p className="text-[0.78rem] leading-snug text-[var(--color-charcoal)]">
            parsed {proposal.nearMiss.parsed} — a letter O, not a zero. You hold
            an {proposal.nearMiss.canonical}. Which is this?
          </p>
          <div
            role="group"
            aria-label={`What page ${proposal.pageIndex + 1} is`}
            className="mt-1.5 flex flex-wrap gap-1.5"
          >
            <button
              type="button"
              aria-pressed={proposal.fork === 'revision'}
              onClick={() => answerFork('revision')}
              className={`${FORK_CLASS} ${
                proposal.fork === 'revision'
                  ? 'border-[var(--color-clay)] text-[var(--color-charcoal)]'
                  : 'border-[var(--doc-ink-border)] text-[var(--text-muted)]'
              }`}
            >
              a revision of {proposal.nearMiss.canonical}
            </button>
            <button
              type="button"
              aria-pressed={proposal.fork === 'new_sheet'}
              onClick={() => answerFork('new_sheet')}
              className={`${FORK_CLASS} ${
                proposal.fork === 'new_sheet'
                  ? 'border-[var(--color-clay)] text-[var(--color-charcoal)]'
                  : 'border-[var(--doc-ink-border)] text-[var(--text-muted)]'
              }`}
            >
              a new sheet
            </button>
            <button
              type="button"
              aria-pressed={proposal.fork === 'confirm_current'}
              onClick={() => answerFork('confirm_current')}
              className={`${FORK_CLASS} ${
                proposal.fork === 'confirm_current'
                  ? 'border-[var(--color-clay)] text-[var(--color-charcoal)]'
                  : 'border-[var(--doc-ink-border)] text-[var(--text-muted)]'
              }`}
            >
              file to {proposal.nearMiss.canonical} · no new revision
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
