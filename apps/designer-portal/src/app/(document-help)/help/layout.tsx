/**
 * The Help Center — re-homed (R89).
 *
 * The browsable Layer-4 reference used to live under the portal tree
 * (`/portal/help/**`, which stays until the dissolve per D7). At the dissolve
 * the Document has no portal chrome to hang it on, so it re-homes here to
 * `/help` — its own route group, outside `(portal)`, paper-styled to match the
 * Document (D4 zero shadows, Playfair masthead, DM-mono instruments). The
 * in-context ContextualHelpPanel (⌘K "Help…") is the reactive door; this is the
 * reference destination you seek out.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Help · Patina',
};

export default function HelpCenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--doc-paper)] text-[var(--color-charcoal)]">
      <header className="border-b border-[var(--color-pearl)] px-7 py-4">
        <div className="mx-auto flex max-w-3xl items-baseline justify-between">
          <Link
            href="/help"
            className="font-heading text-[22px] font-medium text-[var(--color-charcoal)] hover:text-[var(--color-clay)]"
          >
            Help
          </Link>
          <Link
            href="/desk"
            className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-clay)] hover:opacity-80"
          >
            ← The Desk
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-7 py-10">{children}</main>
    </div>
  );
}
