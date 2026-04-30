'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Upload } from 'lucide-react';
import { useAdminCatalogPresenter } from '@/features/catalog/hooks/useAdminCatalogPresenter';
import {
  AdminCatalogSearchBar,
  AdminCatalogResults,
  AdminCatalogFilters,
  BulkActionToolbar,
} from '@/components/catalog';
import { Button } from '@/components/ui/button';
import { PageHeader, Section } from '@/components/portal';

const ProductCreateDialog = dynamic(
  () =>
    import('@/components/catalog/product-create-dialog').then((mod) => ({
      default: mod.ProductCreateDialog,
    })),
  { ssr: false, loading: () => null }
);

const BulkActionDialogs = dynamic(
  () =>
    import('@/components/catalog/bulk-action-dialogs').then((mod) => ({
      default: mod.BulkActionDialogs,
    })),
  { ssr: false, loading: () => null }
);

const BulkImportDialog = dynamic(
  () =>
    import('@/components/catalog/bulk-import-dialog').then((mod) => ({
      default: mod.BulkImportDialog,
    })),
  { ssr: false, loading: () => null }
);

export default function CatalogPage() {
  const presenter = useAdminCatalogPresenter();
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Catalog"
        description="Manage products, variants, and categories."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Product
            </Button>
          </div>
        }
      />

      <BulkActionToolbar presenter={presenter} />

      <Section className="mt-10">
        <AdminCatalogSearchBar
          presenter={presenter}
          onFilterClick={() => setIsFilterPanelOpen(true)}
        />
        <div className="mt-6">
          <AdminCatalogResults presenter={presenter} />
        </div>
      </Section>

      <AdminCatalogFilters
        presenter={presenter}
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
      />

      <BulkActionDialogs presenter={presenter} />

      <ProductCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={(productId) => {
          presenter.refreshData();
          console.log('Product created:', productId);
        }}
      />

      <BulkImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onSuccess={() => {
          presenter.refreshData();
        }}
      />
    </div>
  );
}
