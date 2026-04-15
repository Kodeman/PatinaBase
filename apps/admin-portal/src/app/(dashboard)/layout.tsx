'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { TopBar } from '@/components/portal/top-bar';
import { SubNav } from '@/components/portal/sub-nav';
import { MobileTabBar } from '@/components/portal/mobile-tab-bar';
import { PageContainer } from '@/components/portal/page-container';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { ToastProvider } from '@/components/portal/toast-provider';
import { CommandPalette } from '@/components/portal/command-palette';
import { CommandPaletteProvider } from '@/contexts/command-palette-context';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('[Dashboard Error]', error, errorInfo);
      }}
    >
      <a href="#main-content" className="skip-link sr-only-focusable">
        Skip to main content
      </a>

      <CommandPaletteProvider>
        <ToastProvider>
          <div className="flex min-h-screen flex-col bg-[var(--bg-primary)]">
            <Suspense fallback={null}>
              <TopBar />
              <SubNav />
            </Suspense>

            <main
              id="main-content"
              className="flex-1 pb-24 pt-8 md:pb-8"
              tabIndex={-1}
              role="main"
              aria-label="Main content"
            >
              <PageContainer>
                <Suspense fallback={<LoadingStrata />}>
                  <div className="animate-page-enter">{children}</div>
                </Suspense>
              </PageContainer>
            </main>

            <MobileTabBar />
            <CommandPalette />
          </div>
        </ToastProvider>
      </CommandPaletteProvider>
    </ErrorBoundary>
  );
}
