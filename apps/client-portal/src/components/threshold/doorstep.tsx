'use client';

import type { ReactNode } from 'react';

import { ScoredAction } from '@/components/making/scored-action';
import { countInWords } from '@/components/making/standing-sentence';

/* ── The doorstep ───────────────────────────────────────────────────────────
   Where she is standing when the page opens. One sentence in Playfair says
   what is closed; one mono line behind it says what closed last; one scored
   act offers to quiet the house down to what moved.

   `sentence: null` is the honest state, not a loading state — the counts it is
   made of resolve client-side, so the server render and the first client paint
   would disagree. Until the surface can say something true it holds the
   sentence's measure open and says nothing, and the live region stays mounted
   so the words are announced when they land rather than appearing in silence.
   (The Making's masthead keeps the same rule; this is that rule, on the
   Threshold's own type.)

   The since toggle is offered only when there IS a yesterday. A client reading
   the page for the first time is not asked what changed since a moment that
   never happened. ─────────────────────────────────────────────────────────── */

export interface DoorstepProps {
  /** The standing sentence, or null while the surface cannot yet speak. */
  sentence: string | null;
  /** The one line of history behind it, or null when there is none. */
  previously: string | null;
  /** How much of the drawing waits on her hand, already in words. */
  keySentence: string;
  /** How many units moved since her last reading. */
  changedCount: number;
  /** True only when there was a previous read to compare against. */
  showSince: boolean;
  onToggleSince?: () => void;
  /** The house ledger and the letterbox stand here. */
  children?: ReactNode;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : `${text[0].toUpperCase()}${text.slice(1)}`;
}

/** "Two things moved since." — nothing at all when nothing did. */
function movedLine(count: number): string | null {
  const moved = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  if (moved === 0) return null;
  const thing = moved === 1 ? 'thing' : 'things';
  return `${capitalize(countInWords(moved))} ${thing} moved since.`;
}

export function Doorstep({
  sentence,
  previously,
  keySentence,
  changedCount,
  showSince,
  onToggleSince,
  children,
}: DoorstepProps) {
  const moved = movedLine(changedCount);

  return (
    <section
      id="doorstep"
      data-threshold-unit="doorstep"
      data-testid="doorstep"
      className="pt-[clamp(14px,2vw,22px)]"
    >
      <div aria-live="polite">
        {sentence ? (
          <p
            data-testid="doorstep-sentence"
            className="font-heading max-w-[26ch] text-[clamp(1.45rem,2.9vw,2.1rem)] font-medium leading-[1.22] tracking-[-0.014em] text-[var(--text-primary)] max-[860px]:max-w-none"
          >
            {sentence}
          </p>
        ) : (
          // The sentence's measure, held open: the same block on the server and
          // on the first client paint, so nothing below it moves when the words
          // land.
          <div
            aria-hidden="true"
            data-testid="doorstep-sentence-pending"
            className="min-h-[5.1rem]"
          />
        )}
      </div>

      {previously && (
        <p
          data-testid="doorstep-previously"
          className="mt-[0.5em] font-mono text-[11.5px] leading-[1.5] tracking-[0.04em] text-[var(--text-body)]"
        >
          {previously}
        </p>
      )}

      <p
        data-testid="doorstep-key-sentence"
        className="mt-2 text-[15px] leading-[1.62] text-[var(--text-body)]"
      >
        {keySentence}
      </p>

      {(showSince || moved) && (
        <div className="mt-[14px] flex flex-wrap items-baseline gap-x-[22px] gap-y-1">
          {showSince && (
            <ScoredAction
              actionKey="since_yesterday"
              regionKey="doorstep"
              surfaceKey="the_threshold"
              variant="tertiary"
              onClick={onToggleSince}
            >
              What changed since yesterday
            </ScoredAction>
          )}
          {moved && (
            <span
              data-testid="doorstep-changed"
              className="font-mono text-[11px] leading-[1.5] tracking-[0.04em] text-[var(--text-body)]"
            >
              {moved}
            </span>
          )}
        </div>
      )}

      {children && (
        <div className="mt-[clamp(16px,2vw,24px)] grid items-start gap-[clamp(20px,3vw,44px)] [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)] max-[960px]:[grid-template-columns:minmax(0,1fr)]">
          {children}
        </div>
      )}
    </section>
  );
}
