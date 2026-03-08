/**
 * ProductCreateDialog Integration Example
 *
 * This file demonstrates how to integrate the ProductCreateDialog
 * into your catalog page or any other page in the admin portal.
 *
 * Copy the relevant parts into your actual page component.
 */

'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductCreateDialog } from '@/components/catalog';

/**
 * Example 1: Basic Integration
 * Minimal setup with dialog state management
 */
export function BasicIntegrationExample() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <div>
      {/* Trigger Button */}
      <Button onClick={() => setIsCreateDialogOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Create Product
      </Button>

      {/* Dialog */}
      <ProductCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  );
}

/**
 * Example 2: With Success Callback
 * Shows how to handle post-creation actions
 */
export function WithSuccessCallbackExample() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const handleProductCreated = (productId: string) => {
    console.log('Product created with ID:', productId);

    // Option 1: Navigate to product detail page
    // router.push(`/catalog/products/${productId}`);

    // Option 2: Navigate to product editor
    // router.push(`/catalog/products/${productId}/edit`);

    // Option 3: Just log for now (dialog auto-closes and list auto-refreshes)
    // The product list will automatically refresh due to query invalidation
  };

  return (
    <div>
      <Button onClick={() => setIsCreateDialogOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Create Product
      </Button>

      <ProductCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={handleProductCreated}
      />
    </div>
  );
}

/**
 * Example 3: Full Catalog Page Integration
 * Shows complete integration with page header and existing components
 */
export function CatalogPageIntegrationExample() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Product Catalog</h1>
          <p className="text-muted-foreground">
            Manage your product inventory and catalog
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline">
            Import Products
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Product
          </Button>
        </div>
      </div>

      {/* Existing Catalog Components */}
      {/*
      <AdminCatalogSearchBar />
      <AdminCatalogFilters />
      <AdminCatalogResults />
      */}

      {/* Create Product Dialog */}
      <ProductCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={(productId) => {
          console.log('Successfully created product:', productId);
          // Product list will auto-refresh via query invalidation
        }}
      />
    </div>
  );
}

/**
 * Example 4: With Toolbar Integration
 * Shows integration into a toolbar component
 */
export function ToolbarIntegrationExample() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <div className="flex items-center justify-between p-4 border-b">
      {/* Left side - filters/search */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          placeholder="Search products..."
          className="px-3 py-2 border rounded-md"
        />
      </div>

      {/* Right side - actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsCreateDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Product
        </Button>
      </div>

      <ProductCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  );
}

/**
 * Example 5: With Error Boundary
 * Production-ready example with error handling
 */
export function WithErrorBoundaryExample() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);

  const handleProductCreated = (productId: string) => {
    setLastCreatedId(productId);
    console.log('Product created:', productId);

    // Show additional success message or navigate
    // The mutation already shows a toast, so this is optional
  };

  return (
    <div>
      <Button onClick={() => setIsCreateDialogOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Create Product
      </Button>

      {lastCreatedId && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-800">
            Last created product ID: {lastCreatedId}
          </p>
        </div>
      )}

      <ProductCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={handleProductCreated}
      />
    </div>
  );
}

/**
 * Example 6: Programmatic Opening
 * Shows how to open dialog from different triggers
 */
export function ProgrammaticOpeningExample() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Example: Open from keyboard shortcut
  const handleKeyboardShortcut = (event: KeyboardEvent) => {
    if (event.key === 'n' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      setIsCreateDialogOpen(true);
    }
  };

  // Example: Open from URL parameter
  // useEffect(() => {
  //   const params = new URLSearchParams(window.location.search);
  //   if (params.get('action') === 'create') {
  //     setIsCreateDialogOpen(true);
  //   }
  // }, []);

  return (
    <div>
      <div className="space-y-2">
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Product
        </Button>

        <p className="text-sm text-muted-foreground">
          Tip: Press Cmd/Ctrl + N to create a new product
        </p>
      </div>

      <ProductCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  );
}

/**
 * Example 7: Multiple Dialog States
 * Shows pattern for managing multiple dialogs
 */
export function MultipleDialogsExample() {
  const [dialogState, setDialogState] = useState<
    'none' | 'create' | 'import' | 'export'
  >('none');

  return (
    <div>
      <div className="flex items-center gap-2">
        <Button onClick={() => setDialogState('create')}>
          <Plus className="h-4 w-4 mr-2" />
          Create
        </Button>
        <Button variant="outline" onClick={() => setDialogState('import')}>
          Import
        </Button>
        <Button variant="outline" onClick={() => setDialogState('export')}>
          Export
        </Button>
      </div>

      {/* Create Dialog */}
      <ProductCreateDialog
        open={dialogState === 'create'}
        onOpenChange={(open) => setDialogState(open ? 'create' : 'none')}
      />

      {/* Other dialogs would go here */}
      {/* <ImportDialog open={dialogState === 'import'} ... /> */}
      {/* <ExportDialog open={dialogState === 'export'} ... /> */}
    </div>
  );
}

// Export all examples for documentation
export const examples = {
  BasicIntegrationExample,
  WithSuccessCallbackExample,
  CatalogPageIntegrationExample,
  ToolbarIntegrationExample,
  WithErrorBoundaryExample,
  ProgrammaticOpeningExample,
  MultipleDialogsExample,
};
