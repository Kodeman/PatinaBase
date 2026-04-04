'use client';

import { Suspense } from 'react';
import { TopBar } from '@/components/portal/top-bar';
import { SubNav } from '@/components/portal/sub-nav';
import { MobileTabBar } from '@/components/portal/mobile-tab-bar';
import { PageContainer } from '@/components/portal/page-container';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { ToastProvider } from '@/components/portal/toast-provider';
import { MessagesPanel } from '@/components/portal/messages-panel';
import { CommandPalette } from '@/components/portal/command-palette';
import { CommandPaletteProvider } from '@/contexts/command-palette-context';
import { MessagesPanelProvider } from '@/contexts/messages-panel-context';

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CommandPaletteProvider>
      <MessagesPanelProvider>
        <ToastProvider>
          <div className="flex min-h-screen flex-col bg-[var(--bg-primary)]">
            <TopBar />
            <SubNav />

            <main className="flex-1 pb-24 pt-8 md:pb-8">
              <PageContainer>
                <Suspense fallback={<LoadingStrata />}>
                  <div className="animate-page-enter">{children}</div>
                </Suspense>
              </PageContainer>
            </main>

            <MobileTabBar />
            <MessagesPanel />
            <CommandPalette />
          </div>
        </ToastProvider>
      </MessagesPanelProvider>
    </CommandPaletteProvider>
  );
}
