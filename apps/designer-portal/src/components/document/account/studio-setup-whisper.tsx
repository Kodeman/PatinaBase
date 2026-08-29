'use client';

/**
 * Studio setup whisper (U7, Desk) — the MarginNote *visual* idiom (an italic
 * Playfair line, en-dash lead) without MarginNote's once-only localStorage
 * contract. This note's visibility is a live derivation — `owner &&
 * openCount >= 2` — so it comes and goes with the checklist itself rather
 * than being permanently dismissed. Owner-only: a member/guest can't act on
 * the checklist's admin-gated rows (invite, branding) anyway, so whispering
 * at them about the studio's setup would just be noise they can't resolve.
 */

import { openAccountPage } from './account-sheet';

export interface StudioSetupWhisperProps {
  isOwner: boolean;
  openCount: number;
  className?: string;
}

export function StudioSetupWhisper({
  isOwner,
  openCount,
  className,
}: StudioSetupWhisperProps) {
  if (!isOwner || openCount < 2) return null;

  return (
    <aside role="note" className={`flex max-w-[34ch] items-start gap-2 ${className ?? ''}`}>
      <p className="min-w-0 flex-1">
        <span className="font-heading text-[15px] italic leading-[1.55] text-[var(--text-body)]">
          <span aria-hidden className="mr-1 not-italic text-[var(--text-muted)]">
            –
          </span>
          The studio isn&rsquo;t fully set up.
        </span>{' '}
        <button
          type="button"
          onClick={() => openAccountPage('studio')}
          className="da-score-hover inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-clay-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
        >
          Finish setting up
        </button>
      </p>
    </aside>
  );
}
