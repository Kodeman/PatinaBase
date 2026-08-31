'use client';

/**
 * The document spine (spec §3, D12; R127 Wave 1). Above the `--rule-mid`: the
 * head — `Put down`, the household, ONE progress mark, the stage phrase — one
 * reserved block that keeps its height at every offset. Below it: this paper's
 * own furniture. A sticky full-height rail only when the paper can keep its
 * working measure: 136px of words from 1180px, 200px from 1440px. Below
 * 1180px, D13's mobile sheet is the document index.
 *
 * The timer and the presence line are evicted (R127 §4 / OD-16): the studio
 * drawer already prints `IN HAND TODAY`, and neither tenant is true across the
 * whole document at once.
 *
 * Below the rule, the ladder (R127 Wave 2) — at BOTH desktop tiers, not only
 * from 1440. The rail's one block used to be a running index that hid below
 * 1440 because the paper needed its measure more; a 136px rail that prints
 * words does not have that trade to make.
 */

import Link from 'next/link';
import { StrataMark } from './strata-mark';
import { LensLadder } from './spine/lens-ladder';
import { fillStateAtSection } from '@/lib/document/fill-state';
import type { DocumentIndexKey } from '@/lib/document/document-index';
import type {
  LadderDoor,
  LadderSegment,
} from '@/lib/document/lens-ladder-derivation';
import type { SpineSection } from '@/lib/document/section-derivation';
import type { SectionKey } from '@/lib/document/desk-derivation';
import type { TicketPhase } from '@/lib/document/ticket-derivation';

export interface DocSpineProps {
  sections: SpineSection[];
  /** Scroll to (and unfold) a section. W7-R1 §1 retired the arc that pressed
   *  it, so the rail itself reads this no longer; it stays declared because
   *  the page's own section landing is still routed through the spine's
   *  callers (the same rule `projectId` below states). */
  onJump?: (key: SectionKey) => void;
  /** C-3 · the ladder. One segment per stop this spread puts on the paper
   *  (`deriveLadderSegments`), and the doors filed beneath them
   *  (`deriveLadderDoors`). Empty on a spread that mounts no region — the
   *  track then says so in words (OD-2). */
  segments?: readonly LadderSegment[];
  doors?: readonly LadderDoor[];
  /** The project whose region headings a jump lands focus on
   *  (`regionHeadingId`). The landing itself is the page's — it owns the one
   *  running-index call — so this is declared for the rail's callers and read
   *  by nothing here. */
  projectId?: string | null;
  /** The stop whose own region head is in frame — its value yields, its name
   *  stays (RF-02). W3 wires the observer; until then nothing is in frame. */
  headInFrame?: DocumentIndexKey | null;
  /** L-6 — the letterhead is in frame. The head then yields its stage phrase
   *  only; the household and the count stay printed and turn `--text-muted`
   *  (RF-02). The mark never yields. */
  letterheadInFrame?: boolean;
  /** C-4 · the reading stop and the jump that reaches it. ONE
   *  `useDocumentRunningIndex` call stands on this document and it stands on
   *  the page (W1 lifted it there for the margin rail and the mobile bar);
   *  the rail is handed the answer rather than opening a second observer over
   *  the same roots (D-B6, retired here). */
  activeKey?: DocumentIndexKey | null;
  onJumpRegion?: (key: DocumentIndexKey) => void;
  onToggleRoom?: (roomId: string) => void;
  /** The PHASE this job stands in, and where it stands — `PROCUREMENT &
   *  ORDERS` over `4 OF 6` (reconciliation §7). The section label is a
   *  different vocabulary and prints only where no phase has been placed. */
  stageWord?: string | null;
  /** W7-R1 §1 · the phase ITSELF, not a formatted ordinal: the spine prints
   *  `N OF M` and names the mark from the same pair, so the glyph and the
   *  count cannot disagree. */
  stagePhase?: TicketPhase | null;
  /**
   * W5-R4 (F2) — a pre-work spread's rail head prints ONE line: the stage
   * name, and nothing under it.
   *
   * `stageWord` is derived from the ticket's phase, which exists only once a
   * project has a schedule, so on brief/discovery/direction/proposal it is
   * always `null` and the head fell through to `activeSection.sub` — a rich
   * per-key sentence (`Awaiting signature`, `In discovery`, `Respond by
   * Aug 12`) never meant as a second rail line. The band already takes the
   * pre-work fallback explicitly (`page.tsx`'s `bandStageWord`) and prints
   * `<CLIENT> · DISCOVERY`; W5-R2 §3 requires the two to AGREE, which is a
   * second clause beyond "no ordinal". The project paper keeps its two lines
   * and its ordinal.
   */
  preWork?: boolean;
  /** Who this document is for — the same name the letterhead's HouseholdChip
   *  prints (`row.client_name`). Absent on documents that carry no household. */
  household?: string;
  /** C-1 · the room lens. The room taken in hand, named in the head and put
   *  down from it, so the release is reachable at every offset. */
  roomInHand?: { id: string; name: string } | null;
  onReleaseRoom?: (roomId: string) => void;
}

export function DocSpine({
  sections,
  segments = [],
  doors = [],
  headInFrame = null,
  letterheadInFrame = false,
  activeKey = null,
  onJumpRegion,
  onToggleRoom,
  stageWord = null,
  stagePhase = null,
  preWork = false,
  household,
  roomInHand = null,
  onReleaseRoom,
}: DocSpineProps) {
  const activeSection = sections.find((s) => s.state === 'active');
  const ordinal = stagePhase
    ? `${stagePhase.position} OF ${stagePhase.of}`
    : null;
  const stagePhrase =
    stageWord != null
      ? { top: stageWord, bottom: ordinal }
      : activeSection
        ? { top: activeSection.label, bottom: preWork ? null : activeSection.sub }
        : null;
  // W7-R1 §1 — the fill is the engagement's own, read at the section it stands
  // in; a pre-work spread has placed no phase, so the mark prints unfilled and
  // keeps its box rather than claiming progress the job has not made.
  const markFill: [number, number, number] =
    preWork || !activeSection ? [0, 0, 0] : fillStateAtSection(activeSection.key);
  const markLabel = stagePhrase
    ? `${stagePhrase.top}${ordinal ? ` — ${ordinal.toLowerCase()}` : ''}`
    : 'Document progress';
  return (
    <aside
      aria-label="Document spine"
      data-document-spine
      data-spine-regime="sheet-below-1180-narrow-to-1439-full-from-1440"
      // D13: below 1180px the unified bar's section handle replaces the rail
      // (the spine doubles as a bottom sheet, D3-3).
      className="sticky top-0 z-[2] hidden border-r border-[var(--color-pearl)] bg-[var(--doc-rail-stock)] min-[1180px]:box-border min-[1180px]:block min-[1180px]:h-screen min-[1180px]:w-full min-[1180px]:overflow-x-hidden min-[1180px]:overflow-y-auto min-[1180px]:px-3 min-[1180px]:pb-[var(--doc-shell-floating-bottom)] min-[1180px]:pt-4 min-[1440px]:w-auto min-[1440px]:px-4 min-[1440px]:pt-6"
    >
      {/* One flex column inside the rail's own padding box, so the ladder can
          take the height between the head and the doors (RF-05). The aside
          keeps `min-[1180px]:block` — the regime the shell asserts — and the
          column lives one level in. */}
      <div className="min-[1180px]:flex min-[1180px]:h-full min-[1180px]:flex-col">
        <Link
          href="/desk"
          aria-label="Put down document"
          className="group mb-3 inline-flex min-h-11 w-full min-w-11 shrink-0 items-center justify-center gap-1 rounded-[3px] font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-charcoal)] hover:text-[var(--color-clay-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] min-[1440px]:mb-4 min-[1440px]:justify-start min-[1440px]:px-1.5"
        >
          <span aria-hidden>←</span>
          <span className="da-score-hover hidden group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100 min-[1180px]:inline">
            Put down
          </span>
        </Link>

        {/* The rail head — one tense: the job, and where it stands. Its height is
          RESERVED, never measured, so nothing above the rule moves as the
          paper scrolls. L-6's yield (the stage phrase goes quiet while the
          letterhead is in frame) arrives with the lens band in Wave 3; this
          wave the head prints statically. */}
        <div
          data-spine-head
          // W7-R1 §1 — the arc's 44/48px row is gone and the reserve shrinks
          // with it. MEASURED, not arithmetic (this portal's root is 18px, and
          // the mark is 88×17): 106px of content at 1180–1439, where
          // `PROCUREMENT & ORDERS` wraps inside the 112px measure, and 92.25
          // from 1440, where it does not. Was 126 / 117 with the arc.
          className="doc-rule-mid mb-3 min-h-[107px] shrink-0 pb-3 min-[1440px]:min-h-[93px]"
        >
          {household && (
            <p
              data-rail-label
              className={`truncate text-[13px] leading-tight transition-colors motion-reduce:transition-none ${
                letterheadInFrame
                  ? 'text-[var(--text-muted)]'
                  : 'text-[var(--text-primary)]'
              }`}
            >
              {household}
            </p>
          )}

          {/* W7-R1 §1 — ONE progress mark, where the seven-mark arc stood.
            Kody: "this collection of strata symbols at the top is useless.
            Have it be a single strata mark that is filled in to represent
            current progress on the document." The component already IS the
            brand's progress device (R15 fill-state / R35): three descending
            lines, each a left-clipped fill over a ghost track in the movement
            hues. `md` is 88px wide — inside the 112px measure the narrow tier
            leaves and the 164px the full tier leaves, so one size serves both.

            It is INERT: `role="img"` with the stage word and the ordinal as
            its name, no press, no tooltip, no tabstop. The ladder below the
            rule is this rail's navigation, and the arc's seven per-section
            jumps have no single honest successor. The breath is the one
            ambient move the system keeps, and it stills under reduce
            (`.doc-breath`, globals.css). */}
          <div data-spine-mark className="mt-2 flex items-center">
            <StrataMark
              size="md"
              fill={markFill}
              breathing
              ground="rail"
              label={markLabel}
            />
          </div>

          {stagePhrase && (
            <p
              data-spine-stage-phrase
              className="mt-2 font-mono text-[11px] uppercase leading-tight tracking-[0.05em] text-[var(--text-muted)]"
            >
              {/* Truncate the subject, never the number: the stage name loses
                its tail before `4 OF 6` gives up a character. At 1180–1439
                the 112px measure wraps it at spaces rather than clipping it
                against the rail's own overflow-x-hidden.

                L-6 — while the letterhead is in frame the phrase yields to the
                letterhead's own arc, which is printing the same fact 60px
                away. It yields in place: the head's height is reserved, so
                nothing below it moves. */}
              <span
                data-rail-label
                data-letterhead-in-frame={letterheadInFrame ? 'true' : undefined}
                className={`block break-words transition-opacity duration-200 motion-reduce:transition-none ${
                  letterheadInFrame ? 'opacity-0' : 'opacity-100'
                }`}
              >
                {stagePhrase.top}
              </span>
              {/* RF-02 — the count stays printed through the yield, but it
                  goes muted while the letterhead's arc is stating the same
                  position, and comes back to the primary ink when it leaves.
                  The parent `<p>` is unconditionally muted, so the colour has
                  to be stated here. */}
              {stagePhrase.bottom && (
                <span
                  data-spine-stage-count
                  data-rail-value
                  className={`block break-words transition-colors duration-200 motion-reduce:transition-none ${
                    letterheadInFrame
                      ? 'text-[var(--text-muted)]'
                      : 'text-[var(--text-primary)]'
                  }`}
                >
                  {stagePhrase.bottom}
                </span>
              )}
            </p>
          )}

          {roomInHand && (
            <p
              data-spine-room-in-hand
              className="mt-2 break-words font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-clay-ink)]"
            >
              In hand · {roomInHand.name}
            </p>
          )}
          {roomInHand && onReleaseRoom && (
            <button
              type="button"
              data-spine-release-room
              onClick={() => onReleaseRoom(roomInHand.id)}
              className="group inline-flex min-h-11 w-full min-w-11 items-center justify-start rounded-[3px] font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
            >
              <span className="da-score-hover group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100">
                Put down the room
              </span>
            </button>
          )}
        </div>

        <LensLadder
          segments={segments}
          doors={doors}
          activeKey={activeKey}
          headInFrame={headInFrame}
          onJump={onJumpRegion ?? (() => {})}
          onToggleRoom={onToggleRoom}
        />
      </div>
    </aside>
  );
}
