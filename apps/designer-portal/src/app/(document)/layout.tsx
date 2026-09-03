import type { Metadata } from 'next';
import { StudioDrawer } from '@/components/document/studio-drawer';
import { RegistryShortcuts } from '@/components/document/registry-shortcuts';
import { LogStrip } from '@/components/document/log-strip';
import { CommandBar } from '@/components/document/command-bar';
import { InterruptionSettings } from '@/components/document/interruption-settings';
import { AccountSheet } from '@/components/document/account/account-sheet';
import { DeskDoorway } from '@/components/document/desk-doorway';
import { InvoiceOverlays } from '@/components/document/accounts/invoice-overlays';
import { DraftProposalOverlay } from '@/components/document/rooms/drafting/draft-proposal-opener';
import { DocumentHelpProvider } from '@/components/document/help/document-help';
import { HelpStateProvider } from '@/components/document/help/help-state-provider';
import {
  DeskWalkthrough,
  DeskWalkthroughProvider,
} from '@/components/document/help/desk-walkthrough';
import { MobileShellProvider } from '@/components/document/mobile/mobile-shell';
import { MobileBar } from '@/components/document/mobile/mobile-bar';
import { MobileActionDock } from '@/components/document/mobile/mobile-action-dock';
import { MobileSheets } from '@/components/document/mobile/mobile-sheets';
import { DocumentTimeProvider } from '@/hooks/document-time-provider';
import { DocumentRouteBoundary } from '@/components/document/document-route-boundary';
import { SkipToPaper } from '@/components/document/skip-to-paper';

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
 *
 * NO ToastProvider — and never one. R83 removed the toast layer from (document)
 * surfaces entirely: a failure is reported as a quiet inline band at the act
 * site, where the designer is already looking, not as a floating card in the
 * corner that outlives the moment. Any `toast()` call reached from this tree
 * no-ops against the context default, which is the intended posture, not a bug.
 */
export default function DocumentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* F55 — the skip link, first focusable node in the tree, ahead of the
          route boundary so it survives even the bare /board/* render. */}
      <SkipToPaper />
      <DocumentRouteBoundary bare={children}>
        <div className="document-route-shell min-h-screen bg-[var(--bg-primary)]">
        {/* One time system above the Desk and every document (R4): the
            log-offer strip rides across navigation inside the provider. */}
        <DocumentTimeProvider>
          {/* D13: compact document physics live in the shell below 1180px. */}
          <MobileShellProvider>
            {/* R97 — the Supabase help-state backend (tour/announcement records,
                cross-device via profiles.help_state) is re-homed to the desk
                world here, wrapping the help region. Renders only its children. */}
            <HelpStateProvider>
              {/* R89 — the help affordance's only home (no utility bar): a
                  SurfaceKeyProvider seeded from the pathname wraps the shell, and
                  the ContextualHelpPanel mounts once inside it. Additive provider
                  wrap; children/siblings keep their order. */}
              <DocumentHelpProvider>
                {/* R97 — the Desk Walkthrough publishes first-touch suppression +
                    offer eligibility to desk/page through this provider. */}
                <DeskWalkthroughProvider>
                  {children}
                  <LogStrip />
                  <StudioDrawer />
                  {/* Global "g then l/p/o/a/h/t" doorway shortcuts (R93) — reads
                      the same registry the Studio Drawer does; renders nothing. */}
                  <RegistryShortcuts />
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
                  {/* R85 — the ⌘K "draft a proposal" household-picker cold start. */}
                  <DraftProposalOverlay />
                  <MobileActionDock />
                  <MobileBar />
                  <MobileSheets />
                  {/* R97 — the desk-first intro tour (WelcomeModal + six coachmarks).
                      Self-guards to /desk; renders nothing elsewhere. */}
                  <DeskWalkthrough />
                  {/* R21 dissolve — the /desk?book= / ?account= doorways. LAST
                      on purpose: React runs effects in mount order, so the
                      drawer's open-ledger listener, the Post sheet's, and the
                      Account sheet's must all be attached before this fires.
                      Renders nothing; self-wraps its useSearchParams read in a
                      Suspense boundary. */}
                  <DeskDoorway />
                </DeskWalkthroughProvider>
              </DocumentHelpProvider>
            </HelpStateProvider>
          </MobileShellProvider>
        </DocumentTimeProvider>
        </div>
      </DocumentRouteBoundary>
    </>
  );
}
