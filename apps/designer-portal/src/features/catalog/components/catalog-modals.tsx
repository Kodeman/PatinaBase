'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@patina/design-system';

import { CatalogFilterPanel } from '@/components/catalog/catalog-filters';
import type { CatalogFilters } from '@/components/catalog/catalog-filters';

import type { CatalogDisplayProduct } from '../types';

const ProductDetailModal = dynamic(
  () => import('@/components/catalog/product-detail-modal').then((mod) => ({ default: mod.ProductDetailModal })),
  { loading: () => <Skeleton className="h-96 w-full" />, ssr: false }
);

interface CatalogModalsProps {
  filters: CatalogFilters;
  isFilterOpen: boolean;
  onFilterOpenChange: (open: boolean) => void;
  onFiltersChange: (filters: CatalogFilters) => void;
  onClearFilters: () => void;
  selectedProduct: CatalogDisplayProduct | null;
  isDetailModalOpen: boolean;
  onDetailModalOpenChange: (open: boolean) => void;
  onViewProduct: (product: CatalogDisplayProduct) => void;
}

export function CatalogModals({
  filters,
  isFilterOpen,
  onFilterOpenChange,
  onFiltersChange,
  onClearFilters,
  selectedProduct,
  isDetailModalOpen,
  onDetailModalOpenChange,
  onViewProduct,
}: CatalogModalsProps) {
  return (
    <>
      <CatalogFilterPanel
        open={isFilterOpen}
        onOpenChange={onFilterOpenChange}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onClearFilters={onClearFilters}
      />

      {isDetailModalOpen && selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          open={isDetailModalOpen}
          onOpenChange={onDetailModalOpenChange}
          onViewProduct={onViewProduct}
        />
      )}
    </>
  );
}
