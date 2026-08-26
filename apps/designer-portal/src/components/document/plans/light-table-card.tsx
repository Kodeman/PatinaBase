'use client';

/**
 * One page on the Light Table. The card states what the table THINKS and asks
 * for the one thing it cannot know. Nothing here writes: the rev letter is a
 * preview off the pure model, and the letters never come from a filename.
 *
 * A near miss is the one place the table refuses to decide. It says what it
 * read, what it holds, and offers three forks — and until one is pressed the
 * card is unresolved and the confirm strip's primary stays shut.
 *
 * A page whose number could not be read is NOT limited to "new sheet or loose
 * paper". A scanned plot, or a title block the text layer lost, is very often
 * a revision of a sheet the room already holds — so those cards carry a
 * "file it to a sheet you already hold" chooser too.
 */

import { useEffect, useState } from 'react';
import { Input, Select } from '@/components/ui/controls';
import {
  nearMissSentence,
  previewRevLetter,
  type KnownSheet,
  type LightTableProposal,
} from '@/lib/plans/model';
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
  /**
   * Display only — the card owns the object URL and revokes it on unmount.
   * `undefined` is a page still being drawn; `null` is a page the table TRIED
   * to draw and could not. The two must not share a state: a failure that
   * looks like work in progress is a placeholder that never ends.
   */
  thumbnail: Blob | null | undefined;
  /** The matched sheet's current revision, for the "becomes Rev x" preview. */
  currentRev: string | null;
  /** Every sheet the room holds, for the file-to-an-existing-sheet chooser. */
  sheets: KnownSheet[];
  /** Set when another staged card claims the same sheet or number. */
  conflict: string | null;
  onChange: (next: LightTableProposal) => void;
}

export function LightTableCard({
  proposal,
  thumbnail,
  currentRev,
  sheets,
  conflict,
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
  // A page the table could not read a number off. Its identity is entirely the
  // designer's to give — by hand, or by pointing at a sheet already held.
  const unread = proposal.parsedNumber == null;

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

  const fileToExistingSheet = (sheetId: string) => {
    if (!sheetId) {
      // Back to where it was: a page with no number is a loose paper again.
      onChange({
        ...proposal,
        kind: 'unmatched',
        fork: null,
        sheetId: null,
        sheetNumber: null,
        discipline: null,
      });
      return;
    }
    const sheet = sheets.find((entry) => entry.id === sheetId);
    if (!sheet) return;
    onChange({
      ...proposal,
      kind: 'revision',
      fork: 'revision',
      sheetId: sheet.id,
      sheetNumber: sheet.sheet_number,
      sheetTitle: sheet.title,
      discipline: sheet.discipline ?? null,
    });
  };

  return (
    <div
      data-plan-card
      data-page-index={proposal.pageIndex}
      data-unresolved={unresolved ? 'true' : undefined}
      data-conflicted={conflict ? 'true' : undefined}
      className={`flex flex-col gap-2 border bg-[var(--doc-paper)] p-3 ${
        conflict
          ? 'border-[var(--color-terracotta)]'
          : unresolved
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
        ) : thumbnail === null ? (
          // The page is still placeable — only its picture is missing.
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
            No preview
          </span>
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
            className="min-h-11"
            onChange={(event) =>
              onChange({ ...proposal, sheetNumber: event.target.value })
            }
          />
          <Input
            aria-label={`Sheet title for page ${proposal.pageIndex + 1}`}
            value={proposal.sheetTitle ?? ''}
            placeholder="Sheet title"
            className="min-h-11"
            onChange={(event) =>
              onChange({ ...proposal, sheetTitle: event.target.value })
            }
          />
          <Select
            aria-label={`Discipline for page ${proposal.pageIndex + 1}`}
            value={proposal.discipline ?? ''}
            className="min-h-11"
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

      {/* The table could not read this page's number. Rather than forcing a new
          sheet or the Folio, let it land on a sheet the room already holds. */}
      {unread && (
        <Select
          aria-label={`File page ${proposal.pageIndex + 1} to an existing sheet`}
          value={proposal.sheetId ?? ''}
          className="min-h-11"
          onChange={(event) => fileToExistingSheet(event.target.value)}
        >
          <option value="">File to an existing sheet —</option>
          {sheets.map((sheet) => (
            <option key={sheet.id} value={sheet.id}>
              {sheet.sheet_number} · {sheet.title}
            </option>
          ))}
        </Select>
      )}

      {becomes && proposal.kind !== 'unmatched' && (
        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          becomes Rev {becomes}
        </p>
      )}

      {conflict && (
        <p
          role="alert"
          className="border-l-2 border-[var(--color-terracotta)] pl-2 text-[0.75rem] leading-snug text-[var(--color-terracotta-ink)]"
        >
          {conflict}
        </p>
      )}

      {proposal.nearMiss && (
        <div className="border-l-2 border-[var(--color-golden-hour)] pl-2.5">
          <p className="text-[0.78rem] leading-snug text-[var(--color-charcoal)]">
            {nearMissSentence(proposal.nearMiss)}
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
