'use client';

/**
 * The Relationship Journey (R51 / Track B) — the woven timeline at the heart of
 * a person's profile. Every row is a DERIVED event (deriveRelationshipJourney),
 * never a stored activity log: it reads the person's proposals, projects,
 * decisions, threads, touchpoints, and reviews and weaves them oldest → newest
 * the same way the spine derives its sections from project stage.
 *
 * The prototype's `.journey` rail: a quiet vertical line with a type-tinted dot
 * per event, a mono date stamp, a mono type label, and the human line. Events
 * with a deep-link follow it on click (a proposal/project → its document, a
 * thread → the Threads view). Zero shadows (D4); typography-first.
 */

import {
  formatJourneyDate,
  type JourneyEvent,
  type JourneyType,
} from '@/lib/document/people-derivation';

/** The dot colour per journey type (prototype `.jdot.<type>`). */
const DOT: Record<JourneyType, string> = {
  inquiry: 'var(--color-aged-oak)',
  proposal: 'var(--color-clay)',
  project: 'var(--color-golden-hour)',
  message: 'var(--color-dusty-blue)',
  decision: '#c4836f',
  touchpoint: 'var(--color-sage)',
  review: 'var(--color-golden-hour)',
  install: 'var(--color-mocha)',
  care: 'var(--color-sage)',
};

function JourneyRow({
  event,
  onFollow,
}: {
  event: JourneyEvent;
  onFollow?: (href: string) => void;
}) {
  const dateLabel = formatJourneyDate(event.at);
  const body = (
    <>
      <span
        aria-hidden
        className="absolute left-[-1.4rem] top-[0.6rem] h-[11px] w-[11px] rounded-full border-2 border-white"
        style={{ background: DOT[event.type] }}
      />
      <span className="font-mono text-[0.42rem] font-semibold uppercase tracking-[0.05em] text-[var(--color-clay-ink)]">
        {event.label}
      </span>
      <span className="block font-mono text-[0.5rem] uppercase tracking-[0.04em] text-[var(--color-aged-oak)]">
        {dateLabel}
      </span>
      <span className="mt-[0.1rem] block text-[0.78rem] leading-relaxed text-[var(--color-charcoal)] group-hover:text-[var(--color-mocha)]">
        {event.text}
      </span>
    </>
  );

  if (event.href && onFollow) {
    return (
      <button
        type="button"
        onClick={() => onFollow(event.href!)}
        className="group relative block w-full px-0 pb-[0.7rem] pt-[0.45rem] text-left"
      >
        {body}
      </button>
    );
  }

  return <div className="relative px-0 pb-[0.7rem] pt-[0.45rem]">{body}</div>;
}

export function RelationshipJourney({
  events,
  onFollow,
  emptyLine = 'The relationship begins here — its history fills in as you work together.',
}: {
  events: JourneyEvent[];
  /** Follow a deep-link (a proposal/project → its document; a thread → Threads). */
  onFollow?: (href: string) => void;
  emptyLine?: string;
}) {
  return (
    <>
      <div className="mb-[0.7rem] mt-[1.3rem] font-mono text-[0.5rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
        Relationship journey
      </div>
      {events.length === 0 ? (
        <p className="text-[0.72rem] italic leading-relaxed text-[var(--color-aged-oak)]">
          {emptyLine}
        </p>
      ) : (
        <div className="relative pl-[1.4rem] before:absolute before:bottom-[6px] before:left-[5px] before:top-[6px] before:w-[1.5px] before:bg-[var(--color-pearl)] before:content-['']">
          {events.map((e, i) => (
            <JourneyRow key={`${e.type}:${e.at}:${i}`} event={e} onFollow={onFollow} />
          ))}
        </div>
      )}
    </>
  );
}
