'use client';

import {
  Badge,
  Button
} from '@patina/design-system';
import { X, CheckCircle, XCircle, Trash2, Copy, Archive, Loader2 } from 'lucide-react';
import type { AdminCatalogPresenter } from '@/features/admin/catalog/hooks/useAdminCatalogPresenter';

interface BulkActionToolbarProps {
  presenter: AdminCatalogPresenter;
}

export function BulkActionToolbar({ presenter }: BulkActionToolbarProps) {
  if (!presenter.hasSelection) {
    return null;
  }

  const isDisabled = presenter.isOperationInProgress;
  const selectedCount = presenter.selectedCount;
  const productText = selectedCount === 1 ? 'product' : 'products';

  return (
    <div
      className="flex items-center justify-between p-4 bg-blue-50 border-b border-blue-200"
      role="toolbar"
      aria-label="Bulk actions for selected products"
    >
      <div className="flex items-center gap-4">
        <div role="status" aria-live="polite" aria-atomic="true">
          <Badge variant="secondary" className="text-sm font-medium">
            {selectedCount} {productText} selected
          </Badge>
        </div>

        {presenter.isOperationInProgress && (
          <div
            className="flex items-center gap-2 text-sm text-blue-600 font-medium"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{presenter.currentOperation} in progress...</span>
          </div>
        )}

        {!presenter.isOperationInProgress && (
          <Button
            variant="ghost"
            size="sm"
            onClick={presenter.handleClearSelection}
            disabled={isDisabled}
            aria-label={`Clear selection of ${selectedCount} ${productText}`}
          >
            <X className="mr-2 h-4 w-4" aria-hidden="true" />
            Clear selection
          </Button>
        )}
      </div>

      <div className="flex gap-2" role="group" aria-label="Bulk action buttons">
        <Button
          variant="outline"
          size="sm"
          onClick={presenter.openPublishModal}
          disabled={isDisabled}
          className="bg-white"
          aria-label={`Publish ${selectedCount} selected ${productText}`}
          aria-busy={presenter.isOperationInProgress && presenter.currentOperation === 'Bulk Publish'}
        >
          {presenter.isOperationInProgress && presenter.currentOperation === 'Bulk Publish' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Publishing...
            </>
          ) : (
            <>
              <CheckCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              Publish
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={presenter.openUnpublishModal}
          disabled={isDisabled}
          className="bg-white"
          aria-label={`Unpublish ${selectedCount} selected ${productText}`}
          aria-busy={presenter.isOperationInProgress && presenter.currentOperation === 'Bulk Unpublish'}
        >
          {presenter.isOperationInProgress && presenter.currentOperation === 'Bulk Unpublish' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Unpublishing...
            </>
          ) : (
            <>
              <XCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              Unpublish
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isDisabled}
          className="bg-white"
          aria-label={`Duplicate ${selectedCount} selected ${productText}`}
        >
          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
          Duplicate
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isDisabled}
          className="bg-white"
          aria-label={`Archive ${selectedCount} selected ${productText}`}
        >
          <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
          Archive
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={presenter.openDeleteModal}
          disabled={isDisabled}
          aria-label={`Delete ${selectedCount} selected ${productText}`}
          aria-busy={presenter.isOperationInProgress && presenter.currentOperation === 'Bulk Delete'}
        >
          {presenter.isOperationInProgress && presenter.currentOperation === 'Bulk Delete' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Deleting...
            </>
          ) : (
            <>
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Delete
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
