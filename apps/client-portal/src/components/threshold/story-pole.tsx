'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

import type { splitSpinePhases } from '@/components/making/making-spine';

/* ── The story pole ─────────────────────────────────────────────────────────
   A carpenter's story pole is marked once and then never re-marked: the
   graduations are the building's own measure, and you hold the pole up to the
   work to see where you are. So the six chapters are struck once and the open
   one stays struck — the pole does NOT advance as she scrolls. Only the caret
   beside it moves, and all it reports is where she is reading.

   The caret is a reading aid, not a state. A runtime without an
   IntersectionObserver (jsdom, an old browser, a prerender) gets the pole and
   the first section's name and nothing else — never a broken observer and
   never a blank rail.

   Narrow, the rail collapses to six dots. Six dots under the doorplate say the
   same thing the rail says and take one line to say it. ─────────────────── */

export interface StoryPoleProps {
  phases: ReturnType<typeof splitSpinePhases>;
  /** The page's sections, in reading order, by anchor id. */
  sections: Array<{ id: string; label: string }>;
}

export function StoryPole({ phases, sections }: StoryPoleProps) {
  const [here, setHere] = useState(0);

  const graduations = [
    ...phases.settled.map((phase) => ({ phase, held: false })),
    ...(phases.current ? [{ phase: phases.current, held: true }] : []),
    ...phases.future.map((phase) => ({ phase, held: false })),
  ];
  const sectionIds = sections.map((section) => section.id).join('|');

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return undefined;

    const ids = sectionIds.length > 0 ? sectionIds.split('|') : [];
    const nodes = ids
      .map((id, index) => ({ node: document.getElementById(id), index }))
      .filter((entry): entry is { node: HTMLElement; index: number } => entry.node !== null);
    if (nodes.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const found = nodes.find((candidate) => candidate.node === entry.target);
          if (found) setHere(found.index);
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    nodes.forEach((entry) => observer.observe(entry.node));
    return () => observer.disconnect();
  }, [sectionIds]);

  const accent = { '--threshold-accent': 'var(--color-gold)' } as CSSProperties;
  const caretTop =
    sections.length > 1 ? `${Math.round((here / (sections.length - 1)) * 100)}%` : '0%';

  return (
    <aside
      id="story-pole"
      data-threshold-unit="story-pole"
      data-testid="story-pole"
      aria-label="The story pole"
      style={accent}
      className="pt-1.5"
    >
      <p className="mb-3 font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]">
        The story pole
      </p>

      <div
        aria-hidden="true"
        data-testid="story-pole-dots"
        className="mb-2.5 hidden items-center gap-2.5 max-[600px]:flex"
      >
        {graduations.map((graduation) => (
          <span
            key={graduation.phase.id}
            className={
              graduation.held
                ? 'h-2 w-2 rounded-full border border-[var(--threshold-accent)] bg-[var(--threshold-accent)]'
                : 'h-2 w-2 rounded-full border border-[var(--border-default)]'
            }
          />
        ))}
      </div>

      <ol
        data-testid="story-pole-rail"
        className="relative m-0 list-none border-l border-[var(--border-default)] py-0 pl-4 pr-0 max-[600px]:hidden"
      >
        {graduations.map((graduation) => (
          <li
            key={graduation.phase.id}
            data-testid={`story-pole-graduation-${graduation.phase.id}`}
            data-held={graduation.held || undefined}
            className={
              graduation.held
                ? 'relative pb-6 font-mono text-[11px] leading-[1.4] tracking-[0.02em] text-[var(--text-primary)] before:absolute before:-left-4 before:top-1.5 before:h-0.5 before:w-5 before:bg-[var(--threshold-accent)] before:content-[""]'
                : 'relative pb-6 font-mono text-[11px] leading-[1.4] tracking-[0.02em] text-[var(--text-muted)] before:absolute before:-left-4 before:top-[7px] before:h-px before:w-[9px] before:bg-[var(--border-default)] before:content-[""]'
            }
          >
            <b
              className={
                graduation.held
                  ? 'block font-medium uppercase tracking-[0.09em] text-[var(--text-primary)]'
                  : 'block font-normal uppercase tracking-[0.09em] text-[var(--text-body)]'
              }
            >
              {graduation.phase.label}
            </b>
            {graduation.held && <span className="block">the house stands here</span>}
          </li>
        ))}
      </ol>

      <div className="relative mt-1.5 min-h-[56px] border-l border-[var(--border-subtle)] py-0.5 pl-4 max-[600px]:min-h-0 max-[600px]:border-l-0 max-[600px]:pl-0">
        <span
          aria-hidden="true"
          data-testid="story-pole-caret"
          style={{ top: caretTop }}
          className="absolute -left-[5px] h-0 w-0 border-y-4 border-l-[7px] border-y-transparent border-l-[var(--text-primary)] motion-safe:transition-[top] motion-safe:duration-300 max-[600px]:hidden"
        />
        <p
          data-testid="story-pole-here"
          aria-live="polite"
          className="max-w-[14ch] font-mono text-[11px] leading-[1.5] tracking-[0.03em] text-[var(--text-body)] max-[600px]:max-w-none"
        >
          {sections[here]?.label ?? sections[0]?.label ?? ''}
        </p>
      </div>
    </aside>
  );
}
