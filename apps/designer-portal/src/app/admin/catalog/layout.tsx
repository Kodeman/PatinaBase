'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Package, Layers, FolderTree } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { CatalogErrorFallback } from '@/components/admin/catalog';

interface CatalogTab {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const catalogTabs: CatalogTab[] = [
  {
    id: 'products',
    label: 'Products',
    href: '/admin/catalog',
    icon: Package,
  },
  {
    id: 'collections',
    label: 'Collections',
    href: '/admin/catalog/collections',
    icon: Layers,
  },
  {
    id: 'categories',
    label: 'Categories',
    href: '/admin/catalog/categories',
    icon: FolderTree,
  },
];

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Determine active tab based on pathname
  const getActiveTab = () => {
    if (pathname === '/admin/catalog' || pathname === '/admin/catalog/new' || pathname?.startsWith('/admin/catalog/edit')) {
      return 'products';
    }
    if (pathname?.startsWith('/admin/catalog/collections')) {
      return 'collections';
    }
    if (pathname?.startsWith('/admin/catalog/categories')) {
      return 'categories';
    }
    return 'products';
  };

  const activeTab = getActiveTab();

  return (
    <ErrorBoundary
      fallback={<CatalogErrorFallback />}
      onError={(error, errorInfo) => {
        console.error('[Catalog Error]', error, errorInfo);
        // TODO: Send to error tracking service (e.g., Sentry)
      }}
    >
      <div className="space-y-6">
        {/* Tabbed Navigation */}
        <div className="border-b border-border">
          <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Catalog sections">
            {catalogTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  className={cn(
                    'group inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon
                    className={cn(
                      'h-5 w-5 transition-colors',
                      isActive
                        ? 'text-primary'
                        : 'text-muted-foreground group-hover:text-foreground'
                    )}
                  />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div>{children}</div>
      </div>
    </ErrorBoundary>
  );
}
