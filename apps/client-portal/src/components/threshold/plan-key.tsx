'use client';

import { useSyncExternalStore } from 'react';

import { moneyInWords } from '@/components/making/standing-sentence';
import type { ThresholdMark } from '@/lib/threshold/derive';
import {
  LEADER_TEXT_DX,
  LEADER_TYPE,
  PLAN_MARK_STROKE,
  type PlanKeyGeometry,
} from '@/lib/threshold/plan-key';

/* ── The plan key ───────────────────────────────────────────────────────────
   A key on a drawing, not a floor plan: the whole house in one band of rooms,
   the road running off the right edge, and ink only where something waits on
   her hand. Every room is a link down to its band, and so is the road — the
   drawing is how you walk the page.

   The geometry is decided in lib/threshold/plan-key.ts and arrives whole. This
   file draws it and letters it, and the list beside it says in words what the
   marks say in ink, because a mark nobody can read is decoration.

   ── THE ELEVEN-PIXEL FLOOR ────────────────────────────────────────────────
   SVG type is in USER UNITS, so its rendered size is `fontSize × width / vbW`
   and shrinks as the house gains rooms. On a 390-wide phone (≈358px of content
   inside the sheet's gutters) 13 units over a five-room viewBox renders at
   6.7px. So on a phone the drawing does what the mock does: the type goes up
   to 17 units, and the viewBox CROPS so the divisor can never grow past what
   17 units can carry. The house then reads left-to-right within the crop, and
   the key list beside it still names every mark in full-size prose.
   ────────────────────────────────────────────────────────────────────────── */

/** …and on a phone, where it does not. Mirrors the mock's ≤600px bump. */
export const PLAN_PHONE_TYPE = 17;
/** A 390px phone, less the sheet's own clamp(14px,4vw,26px) gutters. */
export const PLAN_PHONE_CONTENT_PX = 358;
/** The reading floor the crop exists to hold. */
const TYPE_FLOOR_PX = 11;
/** The widest viewBox `PLAN_PHONE_TYPE` still renders at the floor. */
const PHONE_MAX_VIEWBOX = Math.floor((PLAN_PHONE_TYPE * PLAN_PHONE_CONTENT_PX) / TYPE_FLOOR_PX);

const PHONE_QUERY = '(max-width: 600px)';

/** The phone's viewBox: the same drawing, cropped so the letters stay legible. */
export function planPhoneViewBox(viewBox: string): string {
  const [minX, minY, width, height] = viewBox.split(/\s+/).map(Number);
  if (![minX, minY, width, height].every(Number.isFinite)) return viewBox;
  return `${minX} ${minY} ${Math.min(width, PHONE_MAX_VIEWBOX)} ${height}`;
}

/**
 * A stubbed matchMedia (jsdom, jest's `resetMocks`) can answer with nothing at
 * all; the drawing then simply stays at its desktop measure.
 */
function phoneQuery(): MediaQueryList | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
  return window.matchMedia(PHONE_QUERY) as MediaQueryList | undefined;
}

function subscribeToPhone(onChange: () => void): () => void {
  const query = phoneQuery();
  query?.addEventListener?.('change', onChange);
  return () => query?.removeEventListener?.('change', onChange);
}

function isPhone(): boolean {
  return phoneQuery()?.matches === true;
}

/** The server has no viewport, so it draws the house at its desktop measure. */
function isPhoneOnServer(): boolean {
  return false;
}

export interface PlanKeyProps {
  geometry: PlanKeyGeometry;
  marks: ThresholdMark[];
  /** How much of this drawing waits on her hand, already in words. */
  keySentence: string;
}

const STATE_WORD: Record<ThresholdMark['kind'], string> = {
  door: 'Shut',
  wall: 'Hatched',
};

const TEXT_CLASS = 'fill-current stroke-none font-mono tracking-[0.4px]';
const ANCHOR_CLASS =
  'text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--threshold-accent,#8A5F19)]';

/** The mark, said in words: what it is, what it is worth, what it wants. */
function markSentence(mark: ThresholdMark): string {
  const money = mark.amountCents > 0 ? `${moneyInWords(mark.amountCents)}, ` : '';
  return mark.kind === 'door'
    ? `${mark.label} — ${money}your name.`
    : `${mark.label} — ${money}held back until you accept it.`;
}

export function PlanKey({ geometry, marks, keySentence }: PlanKeyProps) {
  // The crop is an ATTRIBUTE, so CSS cannot do it — the mock swaps it in
  // script for the same reason (`cropDrawings`). The type bump rides along
  // rather than living in a second stylesheet that could disagree.
  const phone = useSyncExternalStore(subscribeToPhone, isPhone, isPhoneOnServer);
  const phoneViewBox = planPhoneViewBox(geometry.viewBox);
  const type = phone ? PLAN_PHONE_TYPE : LEADER_TYPE;

  return (
    <section
      id="key"
      data-threshold-unit="key"
      data-dimmable
      data-testid="plan-key"
      aria-label="Plan key"
      className="mt-[clamp(16px,2vw,24px)] border-t border-[var(--border-default)] pt-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p
          data-testid="plan-key-sentence"
          className="font-heading text-[clamp(1.05rem,1.6vw,1.28rem)] font-medium leading-[1.3] tracking-[-0.01em] text-[var(--text-primary)]"
        >
          {keySentence}
        </p>
        <p className="font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]">
          Key · the whole house
        </p>
      </div>

      <div className="mt-2.5 grid items-start gap-[clamp(18px,2.6vw,36px)] [grid-template-columns:minmax(0,1.45fr)_minmax(230px,1fr)] max-[960px]:[grid-template-columns:minmax(0,1fr)]">
        <svg
          role="group"
          aria-label="The whole house"
          viewBox={phone ? phoneViewBox : geometry.viewBox}
          data-vb-phone={phoneViewBox}
          className="block h-auto w-full max-w-[560px] fill-none stroke-current stroke-1 text-[var(--text-primary)]"
        >
          {geometry.rects.map((rect, index) => {
            const label = geometry.labels[index];
            return (
              <a
                key={rect.roomId}
                href={`#${rect.anchor}`}
                aria-label={label?.text ?? 'Room'}
                className={ANCHOR_CLASS}
              >
                <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} />
                {label && (
                  <text x={label.x} y={label.y} fontSize={type} className={TEXT_CLASS}>
                    {label.text}
                  </text>
                )}
              </a>
            );
          })}

          <a href={`#${geometry.road.anchor}`} aria-label="The road" className={ANCHOR_CLASS}>
            <line
              x1={geometry.road.x1}
              y1={geometry.road.y}
              x2={geometry.road.x2}
              y2={geometry.road.y}
              strokeDasharray="6 5"
            />
            {/* On the room labels' own baseline, under the dash: at the
                road's mid-height the words sat across the dashes they name. */}
            <text
              x={geometry.road.x2}
              y={geometry.roadLabelY}
              textAnchor="end"
              fontSize={type}
              className={TEXT_CLASS}
            >
              The road
            </text>
          </a>

          {geometry.doorMarks.map((mark) => (
            <line
              key={`${mark.anchor}-${mark.roomId}-${mark.y1}`}
              data-plan-mark={mark.kind}
              x1={mark.x}
              y1={mark.y1}
              x2={mark.x}
              y2={mark.y2}
              stroke="var(--threshold-accent, #8A5F19)"
              strokeWidth={PLAN_MARK_STROKE}
            />
          ))}

          {geometry.leaders.map((leader) => (
            <g key={`${leader.text}-${leader.toX}-${leader.toY}`}>
              <line x1={leader.fromX} y1={leader.fromY} x2={leader.toX} y2={leader.toY} />
              <text
                x={leader.toX + LEADER_TEXT_DX}
                y={leader.toY + 4}
                fontSize={type}
                className={TEXT_CLASS}
              >
                {leader.text}
              </text>
            </g>
          ))}
        </svg>

        <div className="grid max-w-[46ch] gap-[11px] pt-0.5" data-testid="plan-key-list">
          {marks.map((mark) => (
            <div
              key={mark.id}
              data-testid={`plan-key-item-${mark.id}`}
              className="text-[15px] leading-[1.5] text-[var(--text-body)]"
            >
              <span className="mb-px block font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-primary)]">
                {STATE_WORD[mark.kind]}
              </span>
              {markSentence(mark)}
            </div>
          ))}

          {geometry.rects.length > 0 && (
            <div
              data-testid="plan-key-item-open"
              className="text-[15px] leading-[1.5] text-[var(--text-body)]"
            >
              <span className="mb-px block font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]">
                Open
              </span>
              Everything else in the house stands open.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
