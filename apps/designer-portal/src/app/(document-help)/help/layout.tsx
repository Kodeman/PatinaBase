/**
 * The Help Center — re-homed (R89).
 *
 * The browsable Layer-4 reference used to live under the portal tree
 * (`/portal/help/**`). The Document has no portal chrome to hang it on, so it
 * re-homed here to `/help` — its own route group, paper-styled to match the
 * Document (D4 zero shadows, Playfair masthead, DM-mono instruments). The R21
 * dissolve retired the portal tree; `/portal/help/:path*` is now a permanent
 * redirect onto this one, segment for segment (next.config.js). The
 * in-context ContextualHelpPanel (⌘K "Help…") is the reactive door; this is the
 * reference destination you seek out.
 */

import type { Metadata } from 'next';
import { HelpHeaderLine } from './help-header-line';

export const metadata: Metadata = {
  title: 'Help · Patina',
};

/** US-28 S6 — the house Header line on the --paper ground, at the measure. */
export default function HelpCenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-[880px] px-6 pb-24 max-[599px]:px-4">
        <HelpHeaderLine />
        <main>{children}</main>
      </div>
    </div>
  );
}
