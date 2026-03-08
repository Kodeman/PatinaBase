'use client';

import { useState, Suspense } from 'react';
import { Header } from '@/components/layout/header';
import { AceternitySidebar } from '@/components/layout/aceternity-sidebar';
import { Skeleton } from '@patina/design-system';

// Loading component for page content
function PageLoadingFallback() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Aceternity Sidebar with hover expand */}
      <AceternitySidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-muted/10 p-4 sm:p-6">
          <Suspense fallback={<PageLoadingFallback />}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
