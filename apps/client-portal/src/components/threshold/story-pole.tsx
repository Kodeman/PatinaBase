'use client';

import { useEffect, useState } from 'react';

import { getPhaseLabel } from '@patina/types';

import { InlineAct } from '@/components/threshold/instruments/inline-act';
import {
  parseSpineDate,
  recognisePhaseSlug,
  startOfWeek,
  type SpinePhase,
  type splitSpinePhases,
} from '@/components/threshold/instruments/making-spine';
import { ScoredAction } from '@/components/threshold/instruments/scored-action';

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

   Narrow, the rail collapses to one dot per chapter. The dots under the
   doorplate say the same thing the rail says and take one line to say it.

   Not a threshold unit and never dimmable: the pole is the page's own measure,
   and a measure that fades in one reading of the house is no measure.
   ────────────────────────────────────────────────────────────────────────── */

/** The mock's brass. Lane 4 declares --threshold-accent once on the page root. */
const ACCENT = 'var(--threshold-accent, #8A5F19)';

const LONG_MONTH = new Intl.DateTimeFormat('en-US', { month: 'long' });
/** "12 October" — the day the pole speaks a week by. */
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

/**
 * The chapter's name, resolved per phase rather than taken off the spine.
 *
 * `normalizePhaseSlug` answers `'consultation'` twice over: once when it truly
 * recognises the first chapter, and once as its can-never-be-undefined
 * fallback for anything it cannot place. `project_phases.phase_key` is null on
 * most real rows, so every unplaceable phase collapses onto one label and a
 * six-chapter pole reads "Discovery" four times. When the slug is the fallback
 * answer the row's own name gets a second hearing — as a client label when it
 * names one, and otherwise as itself, because a phase the house calls by its
 * own name is still a distinct graduation.
 */
function graduationName(phase: SpinePhase): string {
  if (phase.slug !== 'consultation') return getPhaseLabel(phase.slug, 'client');
  const fromName = recognisePhaseSlug(phase.title);
  if (fromName) return getPhaseLabel(fromName, 'client');
  return phase.title.trim() || getPhaseLabel('consultation', 'client');
}

/**
 * The chapter's span, in the pole's own idiom: "March" when it opens and
 * closes in one month, "April–May" when it does not, and "week of 12
 * October" for a chapter still ahead that carries only the day it is aimed at.
 * A phase carrying no date at all is simply not dated.
 */
function graduationSpan(phase: SpinePhase): string | null {
  const from = parseSpineDate(phase.startDate);
  const closed = parseSpineDate(phase.completionDate);
  const to = closed ?? parseSpineDate(phase.targetDate);

  if (from && to) {
    const opens = LONG_MONTH.format(from);
    const closes = LONG_MONTH.format(to);
    return opens === closes && from.getFullYear() === to.getFullYear()
      ? opens
      : `${opens}\u2013${closes}`;
  }

  if (!from && to && !closed && phase.status !== 'completed') {
    return `week of ${DAY_MONTH.format(startOfWeek(to))}`;
  }

  const only = from ?? to;
  return only ? LONG_MONTH.format(only) : null;
}

/**
 * The section of the page a chapter owns.
 *
 * ONLY a chapter with a place of its own is a link (SF-03): three chapter
 * names resolving to one anchor is worse than no link at all, and a
 * graduation whose section is not on this page stays plain text rather than
 * pointing at nothing. Procurement is the road — the goods on order stand
 * there; installation is the key — the drawing of what stands in the house.
 * The other four chapters have no section of their own on the Threshold.
 */
const CHAPTER_SECTION: Partial<Record<SpinePhase['slug'], string>> = {
  procurement: 'road',
  installation: 'key',
};

export interface StoryPoleProps {
  phases: ReturnType<typeof splitSpinePhases>;
  /** The page's sections, in reading order, by anchor id. */
  sections: Array<{ id: string; label: string }>;
}

export function StoryPole({ phases, sections }: StoryPoleProps) {
  const [here, setHere] = useState(0);
  // Below 600 the rail is a sticky bar that opens; above it, the rail is
  // always the rail and this says nothing.
  const [open, setOpen] = useState(false);

  const onThePage = new Set(sections.map((section) => section.id));
  const graduations = [...phases.settled, ...(phases.current ? [phases.current] : []), ...phases.future]
    .sort((a, b) => a.index - b.index)
    .map((phase) => {
      const place = CHAPTER_SECTION[phase.slug];
      return {
        phase,
        held: phase.id === phases.current?.id,
        name: graduationName(phase),
        span: graduationSpan(phase),
        target: place && onThePage.has(place) ? place : null,
      };
    });
  const heldAt = graduations.findIndex((graduation) => graduation.held);

  // A finished house holds nothing: `current` is null, so `heldAt` is -1. Its
  // walked chapters are then read off their own status, or the pole would draw
  // six ungraduated chapters and tell a client whose house is done that
  // nothing has begun.
  const walkedAt = (index: number): boolean =>
    heldAt >= 0 ? index < heldAt : graduations[index]?.phase.status === 'completed';

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

  const caretTop =
    sections.length > 1 ? `${Math.round((here / (sections.length - 1)) * 100)}%` : '0%';
  const hereLabel = sections[here]?.label ?? sections[0]?.label ?? '';

  return (
    <aside
      id="story-pole"
      data-testid="story-pole"
      data-open={open ? 'true' : 'false'}
      aria-label="The story pole"
      className="pt-1.5 max-[600px]:sticky max-[600px]:top-0 max-[600px]:z-[2] max-[600px]:border-b max-[600px]:border-[var(--border-default)] max-[600px]:bg-[var(--bg-primary)] max-[600px]:pb-1 max-[600px]:pt-0"
    >
      <p className="mb-3 font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)] max-[600px]:hidden">
        The story pole
      </p>

      {/* ≤600: one line that says where she is and opens the same list. The
          rail used to be hidden outright here, which left a 5,700px page with
          no way to move through it (IA-23 / C03). */}
      <div className="hidden items-center gap-3 max-[600px]:flex">
        <ScoredAction
          actionKey="story_pole_open"
          regionKey="story_pole"
          surfaceKey="the_threshold"
          variant="tertiary"
          data-testid="story-pole-toggle"
          aria-expanded={open}
          aria-controls="story-pole-rail"
          onClick={() => setOpen((was) => !was)}
        >
          {`You are in: ${hereLabel}`}
        </ScoredAction>

        <div
          aria-hidden="true"
          data-testid="story-pole-dots"
          className="flex items-center gap-2.5"
        >
          {graduations.map((graduation, index) => {
            const walked = walkedAt(index);
            return (
              <span
                key={graduation.phase.id}
                data-dot={graduation.held ? 'held' : walked ? 'walked' : 'ahead'}
                style={
                  graduation.held
                    ? { backgroundColor: ACCENT, borderColor: ACCENT }
                    : walked
                      ? { borderColor: 'var(--text-primary)' }
                      : { borderColor: 'var(--border-default)' }
                }
                className="h-2 w-2 rounded-full border"
              />
            );
          })}
        </div>
      </div>

      <ol
        id="story-pole-rail"
        data-testid="story-pole-rail"
        className={`relative m-0 list-none border-l border-[var(--border-default)] py-0 pl-4 pr-0 max-[600px]:mt-2.5 ${
          open ? '' : 'max-[600px]:hidden'
        }`}
      >
        {graduations.map((graduation, index) => (
          <li
            key={graduation.phase.id}
            data-testid={`story-pole-graduation-${graduation.phase.id}`}
            data-held={graduation.held || undefined}
            data-walked={walkedAt(index) || undefined}
            style={graduation.held ? { color: ACCENT } : undefined}
            className={
              graduation.held
                ? 'relative pb-6 font-mono text-[11px] leading-[1.4] tracking-[0.02em]'
                : 'relative pb-6 font-mono text-[11px] leading-[1.4] tracking-[0.02em] text-[var(--text-muted)]'
            }
          >
            <span
              aria-hidden="true"
              style={
                graduation.held
                  ? { backgroundColor: ACCENT }
                  : walkedAt(index)
                    ? { backgroundColor: 'var(--text-primary)' }
                    : { backgroundColor: 'var(--border-default)' }
              }
              className={
                graduation.held
                  ? 'absolute -left-4 top-1.5 h-0.5 w-5'
                  : 'absolute -left-4 top-[7px] h-px w-[9px]'
              }
            />
            <b
              style={graduation.held ? { color: ACCENT } : undefined}
              className={
                graduation.held
                  ? 'block font-medium uppercase tracking-[0.09em]'
                  : 'block font-normal uppercase tracking-[0.09em] text-[var(--text-body)]'
              }
            >
              {graduation.target ? (
                <InlineAct
                  href={`#${graduation.target}`}
                  data-testid={`story-pole-link-${graduation.phase.id}`}
                  onClick={() => setOpen(false)}
                >
                  {graduation.name}
                </InlineAct>
              ) : (
                graduation.name
              )}
            </b>
            {graduation.span && (
              <span data-testid={`story-pole-span-${graduation.phase.id}`}>
                {graduation.span}
              </span>
            )}
            {graduation.held && <span className="block">the house stands here</span>}
          </li>
        ))}
      </ol>

      {/* ≤600 the toggle above already says where she is, so this does not say
          it twice. */}
      <div className="relative mt-1.5 min-h-[56px] border-l border-[var(--border-subtle)] py-0.5 pl-4 max-[600px]:hidden">
        <span
          aria-hidden="true"
          data-testid="story-pole-caret"
          style={{ top: caretTop }}
          className="absolute -left-[5px] h-0 w-0 border-y-4 border-l-[7px] border-y-transparent border-l-[var(--text-primary)] motion-safe:transition-[top] motion-safe:duration-300 max-[600px]:hidden"
        />
        {/* No live region: this label changes on every scroll tick, and a
            screen reader announcing each one would talk over the page. */}
        <p
          data-testid="story-pole-here"
          className="max-w-[14ch] font-mono text-[11px] leading-[1.5] tracking-[0.03em] text-[var(--text-body)] max-[600px]:max-w-none"
        >
          {hereLabel}
        </p>
      </div>
    </aside>
  );
}
