'use client';

import type { CSSProperties } from 'react';

import { moneyInWords } from '@/components/making/standing-sentence';
import type { ThresholdMark } from '@/lib/threshold/derive';
import { PLAN_MARK_STROKE, type PlanKeyGeometry } from '@/lib/threshold/plan-key';

/* ── The plan key ───────────────────────────────────────────────────────────
   A key on a drawing, not a floor plan: the whole house in one band of rooms,
   the road running off the right edge, and ink only where something waits on
   her hand. Every room is a link down to its band, and so is the road — the
   drawing is how you walk the page.

   The geometry is decided in lib/threshold/plan-key.ts and arrives whole. This
   file draws it and letters it, and the list beside it says in words what the
   marks say in ink, because a mark nobody can read is decoration.

   The accent is declared once on the section root as --threshold-accent, so
   the stroke on the drawing and the rule on the story pole cannot drift apart.
   ────────────────────────────────────────────────────────────────────────── */

/** Mono in the drawing is in user units; 13 holds the 11px floor at any width. */
const LEADER_TYPE = 13;

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

/** The mark, said in words: what it is, what it is worth, what it wants. */
function markSentence(mark: ThresholdMark): string {
  const money = mark.amountCents > 0 ? `${moneyInWords(mark.amountCents)}, ` : '';
  return mark.kind === 'door'
    ? `${mark.label} — ${money}your name.`
    : `${mark.label} — ${money}held back until you accept it.`;
}

export function PlanKey({ geometry, marks, keySentence }: PlanKeyProps) {
  const accent = { '--threshold-accent': 'var(--color-gold)' } as CSSProperties;

  return (
    <section
      id="key"
      data-threshold-unit="key"
      data-testid="plan-key"
      aria-label="Plan key"
      style={accent}
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
          viewBox={geometry.viewBox}
          className="block h-auto w-full max-w-[560px] fill-none stroke-current stroke-1 text-[var(--text-primary)]"
        >
          {geometry.rects.map((rect, index) => {
            const label = geometry.labels[index];
            return (
              <a key={rect.roomId} href={`#${rect.anchor}`} aria-label={label?.text ?? 'Room'}>
                <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} />
                {label && (
                  <text
                    x={label.x}
                    y={label.y}
                    fontSize={LEADER_TYPE}
                    className="fill-current stroke-none font-mono tracking-[0.4px]"
                  >
                    {label.text}
                  </text>
                )}
              </a>
            );
          })}

          <a href={`#${geometry.road.anchor}`} aria-label="The road">
            <line
              x1={geometry.road.x1}
              y1={geometry.road.y}
              x2={geometry.road.x2}
              y2={geometry.road.y}
              strokeDasharray="6 5"
            />
            <text
              x={geometry.road.x2}
              y={geometry.road.y + 30}
              textAnchor="end"
              fontSize={LEADER_TYPE}
              className="fill-current stroke-none font-mono tracking-[0.4px]"
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
              stroke="var(--threshold-accent)"
              strokeWidth={PLAN_MARK_STROKE}
            />
          ))}

          {geometry.leaders.map((leader) => (
            <g key={`${leader.text}-${leader.toX}-${leader.toY}`}>
              <line x1={leader.fromX} y1={leader.fromY} x2={leader.toX} y2={leader.toY} />
              <text
                x={leader.toX + 4}
                y={leader.toY + 4}
                fontSize={LEADER_TYPE}
                className="fill-current stroke-none font-mono tracking-[0.4px]"
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
