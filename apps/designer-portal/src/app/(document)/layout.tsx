import type { Metadata } from 'next';
import { StudioDrawer } from '@/components/document/studio-drawer';
import { LogStrip } from '@/components/document/log-strip';
import { CommandBar } from '@/components/document/command-bar';
import { InterruptionSettings } from '@/components/document/interruption-settings';
import { DocumentTimeProvider } from '@/hooks/document-time-provider';
import { DocumentGate } from './document-gate';

export const metadata: Metadata = {
  title: 'The Desk · Patina',
};

/**
 * The Document route group. Deliberately minimal: no zone nav, no sub-nav,
 * no utility bar (D1 — the desk and the paper are the only chrome). Auth is
 * enforced by the existing middleware matcher; providers come from the root
 * layout. The charcoal surface is the desk itself (spec v1.1 §10).
 */
export default function DocumentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-charcoal)]">
      <DocumentGate>
        {/* One time system above the Desk and every document (R4): the
            log-offer strip rides across navigation inside the provider. */}
        <DocumentTimeProvider>
          {children}
          <LogStrip />
          <StudioDrawer />
          {/* ⌘K from anywhere in the document model (spec §3). */}
          <CommandBar />
          {/* D2 break-through rules — opened from ⌘K, ships all-off. */}
          <InterruptionSettings />
        </DocumentTimeProvider>
      </DocumentGate>
    </div>
  );
}
