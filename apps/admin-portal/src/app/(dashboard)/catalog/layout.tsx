'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ErrorBoundary } from '@/components/error-boundary';
import { CatalogErrorFallback } from '@/components/catalog/catalog-error-fallback';
import { FilterTabs } from '@/components/portal';

const catalogTabs = [
  { value: 'products', label: 'Products' },
  { value: 'collections', label: 'Collections' },
  { value: 'categories', label: 'Categories' },
];

const hrefByTab: Record<string, string> = {
  products: '/catalog',
  collections: '/catalog/collections',
  categories: '/catalog/categories',
};

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const getActiveTab = () => {
    if (
      pathname === '/catalog' ||
      pathname === '/catalog/new' ||
      pathname?.startsWith('/catalog/edit') ||
      pathname?.match(/^\/catalog\/[^/]+$/)
    ) {
      return 'products';
    }
    if (pathname?.startsWith('/catalog/collections')) return 'collections';
    if (pathname?.startsWith('/catalog/categories')) return 'categories';
    return 'products';
  };

  const activeTab = getActiveTab();

  return (
    <ErrorBoundary
      fallback={<CatalogErrorFallback />}
      onError={(error, errorInfo) => {
        console.error('[Catalog Error]', error, errorInfo);
      }}
    >
      <div>
        <FilterTabs
          items={catalogTabs}
          value={activeTab}
          onChange={(v) => router.push(hrefByTab[v] as any)}
        />
        <div className="mt-6">{children}</div>
      </div>
    </ErrorBoundary>
  );
}
