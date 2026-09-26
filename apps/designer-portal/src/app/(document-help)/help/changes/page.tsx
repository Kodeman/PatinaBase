'use client';

/**
 * The Help Center · "What changed" (return teaching, system-architecture §5;
 * mockup 04). A pull: reached from ⌘K, the help panel and the since-line only.
 * No dot, badge, count or read state; opening it marks nothing and moves no
 * cursor. Releases newest first, each with its notes, then every other note
 * under "Also", dismissed ones included.
 *
 * A static segment beside `/help/[surfaceKey]`; Next resolves `changes` here
 * before the dynamic route.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { useChangesList } from '@/hooks/use-changes-list';
import { captureTeachingEvent } from '@/lib/analytics/teaching-events';
import type { TeachingNoteView } from '@/lib/teaching/types';

const DATE_WORD = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `2026-09-11` → `11 September 2026`, read as a calendar date. */
function dateWord(isoDate: string): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isNaN(ms) ? isoDate : DATE_WORD.format(ms);
}

function NoteSentences({ notes }: { notes: TeachingNoteView[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="mt-3 space-y-3">
      {notes.map((note) => (
        <li key={note.noteKey}>
          <p className="font-heading text-[15px] italic leading-[1.55] text-[var(--text-body)]">
            {note.body}
          </p>
          {note.act && (
            <Link
              href={note.act.href}
              className="inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-clay-ink)] underline decoration-[var(--color-aged-oak)] underline-offset-4 hover:opacity-80"
            >
              {note.act.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function WhatChangedPage() {
  const { releases, also, isLoading } = useChangesList();

  useEffect(() => {
    captureTeachingEvent('help.teaching_changes.opened');
  }, []);

  const empty = !isLoading && releases.length === 0 && also.length === 0;

  return (
    <article className="space-y-7">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
          The Help Center
        </p>
        <h1 className="mt-1 font-heading text-[24px] font-medium text-[var(--color-charcoal)]">
          What changed
        </h1>
      </header>

      {empty && (
        <p className="font-heading text-[15px] italic leading-relaxed text-[var(--text-muted)]">
          Nothing has changed in the Document yet.
        </p>
      )}

      {releases.map((release) => (
        <section
          key={release.id}
          aria-labelledby={`release-${release.id}`}
          className="border-t border-[var(--color-pearl)] pt-4"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-faint)]">
            {dateWord(release.shippedOn)}
          </p>
          <h2
            id={`release-${release.id}`}
            className="mt-1 font-heading text-[20px] font-medium leading-snug text-[var(--color-charcoal)]"
          >
            {release.headline}
          </h2>
          {release.prose && (
            <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-[var(--text-body)]">
              {release.prose}
            </p>
          )}
          <NoteSentences notes={release.notes} />
        </section>
      ))}

      {also.length > 0 && (
        <section aria-labelledby="changes-also" className="border-t border-[var(--color-pearl)] pt-4">
          <h2
            id="changes-also"
            className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]"
          >
            Also
          </h2>
          <NoteSentences notes={also} />
        </section>
      )}
    </article>
  );
}
