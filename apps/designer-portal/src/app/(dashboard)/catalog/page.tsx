'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { AlertCircle, Plus, LogIn, ShieldCheck, ShieldX } from 'lucide-react';
import { Alert, AlertDescription, Badge, Button, Card, CardContent, Skeleton, toast } from '@patina/design-system';
import type { Product, UserRole } from '@patina/types';
import { ErrorBoundary } from '@/components/error-boundary';
import {
  CatalogAnalyticsBanner,
  CatalogModals,
  CatalogOnboarding,
  CatalogResults,
  CatalogSearchBar,
  useCatalogPresenter,
} from '@/features/catalog';
import { ProductEditorModal } from '@/components/products/product-editor-modal';
import { DeleteProductDialog } from '@/components/catalog/delete-product-dialog';
import { catalogApi } from '@/lib/api-client';
import { canCreateProducts, canEditProducts, canDeleteProducts } from '@/lib/permissions';
import { useDeleteProduct } from '@/hooks/use-products';

type EditorMode = 'create' | 'edit';

const createEmptyProduct = (): Product => {
  const timestamp = new Date().toISOString();
  const tempId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `temp-${Date.now()}`;
  return {
    id: tempId,
    slug: '',
    name: '',
    brand: '',
    shortDescription: '',
    category: 'sofa',
    manufacturerId: 'temp-manufacturer',
    price: 0,
    currency: 'USD',
    materials: [],
    colors: [],
    styleTags: [],
    status: 'draft',
    has3D: false,
    arSupported: false,
    customizable: false,
    images: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const prepareProductPayload = (product: Product) => {
  const {
    id,
    createdAt,
    updatedAt,
    versions,
    reviewedAt,
    reviewedBy,
    reviewNotes,
    ...rest
  } = product;

  const slugSourceRaw =
    rest.slug?.trim().length && rest.slug.trim() !== ''
      ? rest.slug.trim()
      : rest.name?.trim() ?? '';
  const slugSource = slugSourceRaw || `product-${Date.now()}`;

  return {
    ...rest,
    slug: slugify(slugSource),
    name: rest.name?.trim() ?? '',
    brand: rest.brand?.trim() ?? '',
    shortDescription: rest.shortDescription?.trim() ?? '',
    manufacturerId: rest.manufacturerId || 'temp-manufacturer',
    materials: rest.materials || [],
    colors: rest.colors || [],
    styleTags: rest.styleTags || [],
    images: rest.images || [],
    variants: rest.variants || [],
  };
};

function CatalogPageContent() {
  const router = useRouter();
  const { session, user, signIn } = useAuth();
  const { state, data, actions, modals } = useCatalogPresenter();

  // Editor modal state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('edit');
  const [selectedProductForEdit, setSelectedProductForEdit] = useState<Product | undefined>();

  // Delete dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Delete mutation
  const deleteProductMutation = useDeleteProduct();

  // Check permissions
  const userRole = (user?.roles?.[0] as UserRole | undefined) ?? (user as any)?.role;
  const canCreate = canCreateProducts(userRole);
  const canEdit = canEditProducts(userRole);
  const canDelete = canDeleteProducts(userRole);

  // Check if catalog is empty (no products, no search, no filters, done loading)
  const hasNoFilters = Object.keys(state.filters || {}).length === 0;
  const hasNoSearch = !state.searchQuery || state.searchQuery.trim() === '';
  const isEmptyCatalog =
    !data.isLoading &&
    !data.error &&
    data.products.length === 0 &&
    hasNoSearch &&
    hasNoFilters;

  // Show onboarding when catalog is truly empty
  if (isEmptyCatalog) {
    return (
      <CatalogOnboarding
        canCreate={canCreate}
        onCreateProduct={() => router.push('/catalog/new')}
      />
    );
  }

  // Handlers
  const openCreateProductModal = () => {
    const draftProduct = createEmptyProduct();
    setEditorMode('create');
    setSelectedProductForEdit(draftProduct);
    setIsEditorOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    if (!canEdit) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to edit products.',
        variant: 'destructive',
      });
      return;
    }
    // Navigate to dedicated edit page for better UX
    router.push(`/catalog/${product.id}/edit`);
  };

  const handleSaveProduct = async (product: Product, mode: EditorMode) => {
    try {
      const payload = prepareProductPayload(product);
      if (mode === 'create') {
        await catalogApi.createProduct(payload);
        toast({
          title: 'Product created',
          description: 'The product has been added to the catalog.',
        });
      } else {
        await catalogApi.updateProduct(product.id, payload);
        toast({
          title: 'Product updated',
          description: 'The product has been successfully updated.',
        });
      }
      setIsEditorOpen(false);
      setSelectedProductForEdit(undefined);
      actions.submitSearch(state.searchQuery);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save the product. Please try again.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDeleteProduct = (product: Product) => {
    if (!canDelete) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to delete products. Only administrators can delete products.',
        variant: 'destructive',
      });
      return;
    }
    setProductToDelete(product);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!productToDelete) return;

    try {
      await deleteProductMutation.mutateAsync(productToDelete.id);
      toast({
        title: 'Product deleted',
        description: `${productToDelete.name} has been permanently deleted from the catalog.`,
      });
      setIsDeleteDialogOpen(false);
      setProductToDelete(null);
      // Refresh the product list
      actions.submitSearch(state.searchQuery);
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: 'Failed to delete the product. Please try again.',
        variant: 'destructive',
      });
      console.error('Failed to delete product:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Product Catalog</h1>
          <p className="text-muted-foreground">Browse and search thousands of curated products</p>
        </div>
        {canCreate && (
          <Button onClick={() => router.push('/catalog/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Create Product
          </Button>
        )}
      </div>

      <CatalogAnalyticsBanner collections={data.featuredCollections} />

      {/* Permission Debug Indicator - only in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className={`rounded-lg border p-3 text-sm ${
          session ? 'bg-muted/50 border-muted' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
        }`}>
          <div className="flex flex-wrap items-center gap-3">
            {session ? (
              <>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-green-600" />
                  <span className="font-medium">Logged in:</span>
                  <span className="text-muted-foreground">{user?.email}</span>
                </div>
                <Badge variant="subtle" color="primary">
                  Role: {userRole || 'none'}
                </Badge>
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-muted-foreground">Permissions:</span>
                  <Badge variant={canCreate ? 'success' : 'subtle'} className="text-xs">
                    {canCreate ? 'Create' : 'No Create'}
                  </Badge>
                  <Badge variant={canEdit ? 'success' : 'subtle'} className="text-xs">
                    {canEdit ? 'Edit' : 'No Edit'}
                  </Badge>
                  <Badge variant={canDelete ? 'success' : 'subtle'} className="text-xs">
                    {canDelete ? 'Delete' : 'No Delete'}
                  </Badge>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <ShieldX className="h-4 w-4 text-amber-600" />
                  <span className="font-medium text-amber-800 dark:text-amber-200">Not logged in</span>
                  <span className="text-amber-700 dark:text-amber-300">- Create/Edit/Delete buttons are hidden</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  onClick={() => signIn()}
                >
                  <LogIn className="mr-2 h-3 w-3" />
                  Sign In
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <CatalogSearchBar
        searchQuery={state.searchQuery}
        viewMode={state.viewMode}
        filters={state.filters}
        activeFilterCount={data.activeFilterCount}
        onSearchChange={actions.setSearchQuery}
        onSearchSubmit={actions.submitSearch}
        onOpenFilters={actions.openFilters}
        onChangeView={actions.setViewMode}
        onLoadPreset={actions.loadFilterPreset}
        onClearFilters={actions.clearFilters}
        onClearFilterKey={actions.clearFilterKey}
        onClearPriceFilter={actions.clearPriceFilter}
        onRemoveTag={actions.removeFilterTag}
      />

      {data.error && (
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load products. Please check that the catalog service is running on port 3011.
            <div className="mt-1 text-xs">{String(data.error)}</div>
          </AlertDescription>
        </Alert>
      )}

      <CatalogResults
        products={data.products}
        viewMode={state.viewMode}
        isLoading={data.isLoading}
        isError={Boolean(data.error)}
        totalProducts={data.totalProducts}
        totalPages={data.totalPages}
        page={state.page}
        resultsRange={data.resultsRange}
        searchQuery={state.searchQuery}
        filters={state.filters}
        onViewProduct={actions.viewProduct}
        onEditProduct={handleEditProduct}
        onDeleteProduct={handleDeleteProduct}
        onPageChange={actions.goToPage}
        onClearFilters={actions.clearFilters}
        canEdit={canEdit}
        canDelete={canDelete}
      />

      <CatalogModals
        filters={state.filters}
        isFilterOpen={state.isFilterOpen}
        onFilterOpenChange={(open) => (open ? actions.openFilters() : actions.closeFilters())}
        onFiltersChange={actions.updateFilters}
        onClearFilters={actions.clearFilters}
        selectedProduct={modals.selectedProduct}
        isDetailModalOpen={state.isDetailModalOpen}
        onDetailModalOpenChange={actions.setDetailModalOpen}
        onViewProduct={actions.viewProduct}
      />

      {/* Product Editor Modal for Quick Edits */}
      <ProductEditorModal
        open={isEditorOpen}
        onOpenChange={(open) => {
          setIsEditorOpen(open);
          if (!open) {
            setSelectedProductForEdit(undefined);
            setEditorMode('edit');
          }
        }}
        product={selectedProductForEdit}
        onSave={handleSaveProduct}
        mode={editorMode}
      />

      {/* Delete Product Dialog */}
      <DeleteProductDialog
        open={isDeleteDialogOpen}
        product={productToDelete}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        isDeleting={deleteProductMutation.isPending}
      />
    </div>
  );
}

function CatalogLoadingFallback() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Card>
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-6 w-1/3" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...Array(8).keys()].map((i) => (
              <Card key={`loading-${i}`}>
                <CardContent className="p-0">
                  <Skeleton className="h-64 w-full rounded-t-lg" />
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-6 w-1/4" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CatalogPage() {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div className="space-y-6">
          <Alert variant="error">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <strong>Failed to load catalog page</strong>
                <p className="text-sm">{error.message || 'An unexpected error occurred while loading the catalog.'}</p>
                <Button onClick={reset} variant="secondary" size="sm">
                  Try Again
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}
    >
      <Suspense fallback={<CatalogLoadingFallback />}>
        <CatalogPageContent />
      </Suspense>
    </ErrorBoundary>
  );
}
