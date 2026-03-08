'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus } from 'lucide-react';
import { useAdminCatalogPresenter } from '@/features/catalog/hooks/useAdminCatalogPresenter';
import {
  AdminCatalogSearchBar,
  AdminCatalogResults,
  AdminCatalogFilters,
  BulkActionToolbar,
} from '@/components/catalog';
import { Button } from '@/components/ui/button';

// Lazy load heavy dialog components - only loaded when needed
// ProductCreateDialog: ~25-30KB (gzipped) - loads when user clicks "Create Product"
// BulkActionDialogs: ~15-20KB (gzipped) - loads when user selects items
const ProductCreateDialog = dynamic(
  () => import('@/components/catalog/product-create-dialog').then(mod => ({ default: mod.ProductCreateDialog })),
  {
    ssr: false,
    loading: () => null,
  }
);

const BulkActionDialogs = dynamic(
  () => import('@/components/catalog/bulk-action-dialogs').then(mod => ({ default: mod.BulkActionDialogs })),
  {
    ssr: false,
    loading: () => null,
  }
);

/**
 * Admin Catalog Page
 *
 * Production-ready catalog management interface with:
 * - Hybrid view modes (grid, list, table)
 * - Advanced filtering and search
 * - Bulk operations (publish, unpublish, delete)
 * - Product creation and editing
 * - Full presenter pattern integration
 * - Responsive design
 * - Keyboard shortcuts
 */
export default function CatalogPage() {
  const presenter = useAdminCatalogPresenter();
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between p-6 border-b bg-white">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catalog</h1>
          <p className="text-muted-foreground mt-1">
            Manage products, variants, and categories
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} size="lg">
          <Plus className="h-4 w-4 mr-2" />
          Create Product
        </Button>
      </div>

      {/* Bulk Action Toolbar (when items selected) */}
      <BulkActionToolbar presenter={presenter} />

      {/* Search Bar */}
      <AdminCatalogSearchBar
        presenter={presenter}
        onFilterClick={() => setIsFilterPanelOpen(true)}
      />

      {/* Results */}
      <div className="flex-1 overflow-auto bg-gray-50">
        <AdminCatalogResults presenter={presenter} />
      </div>

      {/* Filter Panel (Drawer) */}
      <AdminCatalogFilters
        presenter={presenter}
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
      />

      {/* Bulk Action Dialogs */}
      <BulkActionDialogs presenter={presenter} />

      {/* Create Product Dialog */}
      <ProductCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={(productId) => {
          // Refresh the product list after creation
          presenter.refreshData();
          console.log('Product created:', productId);
        }}
      />
    </div>
  );
}
