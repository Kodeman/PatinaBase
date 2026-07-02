import type { Metadata } from 'next';
import { StudioDrawer } from '@/components/document/studio-drawer';
import { LogStrip } from '@/components/document/log-strip';
import { CommandBar } from '@/components/document/command-bar';
import { InterruptionSettings } from '@/components/document/interruption-settings';
import { AccountSheet } from '@/components/document/account/account-sheet';
import { InvoiceOverlays } from '@/components/document/accounts/invoice-overlays';
import { MobileShellProvider } from '@/components/document/mobile/mobile-shell';
import { MobileBar } from '@/components/document/mobile/mobile-bar';
import { MobileSheets } from '@/components/document/mobile/mobile-sheets';
import { DocumentTimeProvider } from '@/hooks/document-time-provider';
import { DocumentGate } from './document-gate';

export const metadata: Metadata = {
  title: 'The Desk · Patina',
};

/**
 * The Document route group. Deliberately minimal: no zone nav, no sub-nav,
 * no utility bar (D1 — the desk and the paper are the only chrome). Auth is
 * enforced by the existing middleware matcher; providers come from the root
 * layout. The desk surface is off-white paper (Desk light restyle — see
 * DECISIONS, reverses the v1.1 §10 charcoal desk). The open document paints its
 * own --doc-paper background over this, so /doc/[id] is unaffected.
 */
export default function DocumentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <DocumentGate>
        {/* One time system above the Desk and every document (R4): the
            log-offer strip rides across navigation inside the provider. */}
        <DocumentTimeProvider>
          {/* D13: the phone's physics live in the shell (below 980px). */}
          <MobileShellProvider>
            {children}
            <LogStrip />
            <StudioDrawer />
            {/* ⌘K from anywhere in the document model (spec §3). */}
            <CommandBar />
            {/* D2 break-through rules — opened from ⌘K, ships all-off. */}
            <InterruptionSettings />
            {/* R5 — the Account sheet: identity, status, settings, sign out.
                Opened from the Studio Drawer nameplate, the mobile drawer, ⌘K. */}
            <AccountSheet />
            {/* R74 — the Invoice folio + composer, openable from any surface
                (Accounts rows, Account band, margin, Hours, FF&E, ⌘K). */}
            <InvoiceOverlays />
            <MobileBar />
            <MobileSheets />
          </MobileShellProvider>
        </DocumentTimeProvider>
      </DocumentGate>
    </div>
  );
}
