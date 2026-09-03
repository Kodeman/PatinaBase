'use client';

/**
 * The Help Center · "The keys" (onboarding Wave 1, task L5; decision 8).
 *
 * The second of the reference's two doorways — the `?` sheet is the first.
 * Both render `buildKeysReference()`, so the page cannot fall behind the
 * overlay, and neither can fall behind the registry the chords are read from.
 *
 * Authored in code rather than in Sanity on purpose: the doorway rows are
 * generated from `registry.tsx`, and a CMS copy of them would be a second
 * source that quietly goes stale.
 *
 * A hand-built route segment sitting beside `/help/[surfaceKey]`; two path
 * segments, so the dynamic single-segment route is untouched.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { KeysReferenceList } from '@/components/document/overlays/keys-sheet';
import { HELP_EVENTS, safeCapture } from '@/lib/help-system/help-events';
import { THE_WORDS_HREF } from '@/lib/help-system/keys-reference';

export default function TheKeysPage() {
  useEffect(() => {
    safeCapture(HELP_EVENTS.SHORTCUTS_OPENED, { source: 'help_center' });
  }, []);

  return (
    <article className="space-y-7">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Getting started
        </p>
        <h1 className="mt-1 font-heading text-[24px] font-medium text-[var(--color-charcoal)]">
          The keys
        </h1>
        <p className="mt-2 font-heading text-[15px] italic leading-relaxed text-[var(--text-muted)]">
          Every key the studio answers to. Two keys open any room or book; the
          rest are for the work you are already in the middle of. Press{' '}
          <span className="not-italic font-mono text-[12px]">?</span> anywhere
          you are not typing to read this page over your desk.
        </p>
      </header>

      <KeysReferenceList />

      <footer className="border-t border-[var(--color-pearl)] pt-4">
        <Link
          href={THE_WORDS_HREF}
          className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-clay-ink)] hover:opacity-80"
        >
          The words — what Patina calls things →
        </Link>
      </footer>
    </article>
  );
}
