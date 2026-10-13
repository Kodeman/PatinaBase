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
import {
  KeysReferenceList,
  type KeysOpenSource,
} from '@/components/document/overlays/keys-sheet';
import { HELP_EVENTS, safeCapture } from '@/lib/help-system/help-events';
import { THE_WORDS_HREF } from '@/lib/help-system/keys-reference';

const SOURCE: KeysOpenSource = 'help_center';

export default function TheKeysPage() {
  useEffect(() => {
    safeCapture(HELP_EVENTS.SHORTCUTS_OPENED, { source: SOURCE });
  }, []);

  return (
    <article>
      <header className="mb-12">
        <p className="eb">Getting started</p>
        <h1 className="t-d2 mt-2">The keys</h1>
        <p className="t-body mt-3 max-w-[64ch] text-[var(--text-muted)]">
          Every key the studio answers to. Two keys open any room or book; the
          rest are for the work you are already in the middle of. Press{' '}
          <kbd className="keycap">?</kbd> anywhere you are not typing to read
          this page over your desk.
        </p>
      </header>

      <KeysReferenceList />

      <footer className="mt-12 border-t border-[var(--doc-ink-border)] pt-4">
        <Link href={THE_WORDS_HREF} className="name t-body-sm inline-flex min-h-11 items-center">
          The words — what Patina calls things →
        </Link>
      </footer>
    </article>
  );
}
