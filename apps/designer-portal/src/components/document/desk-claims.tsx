'use client';

/**
 * The claims grid (R143 · D3).
 *
 * Three columns at ≥1024, two at 640–1023, one below — the arithmetic is
 * forced: 390 − 48 padding − 48 gutters ÷ 3 is a 98px card, and a Playfair
 * name cannot wrap into it without truncating, which is banned.
 *
 * `align-items: start` (globals.css) is the point: a quiet card is shorter
 * than a loud one, and the page has to look like that.
 */

import type { ClaimCard } from '@/lib/document/desk-roster-derivation';
import { DeskClaimCard, STAGE_TONE } from './desk-claim-card';

export function DeskClaimsGrid({
  cards,
  settle,
  startIndex = 0,
  firstTourAnchor,
  id,
}: {
  cards: readonly ClaimCard[];
  settle: boolean;
  startIndex?: number;
  firstTourAnchor?: string;
  id?: string;
}) {
  return (
    <ul id={id} className="desk-claims-grid">
      {cards.map((card, position) => (
        <DeskClaimCard
          key={card.line.engagementId}
          card={card}
          // The wash follows the JOB's stage, never its group's: By person
          // regroups the same cards away from their stage.
          tone={STAGE_TONE[card.line.stage]}
          index={startIndex + position}
          settle={settle}
          tourAnchor={position === 0 ? firstTourAnchor : undefined}
        />
      ))}
    </ul>
  );
}
