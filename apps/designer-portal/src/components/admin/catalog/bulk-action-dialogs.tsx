'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@patina/design-system';
import {
  Input,
  Label
} from '@patina/design-system';
import { useState } from 'react';
import type { AdminCatalogPresenter } from '@/features/admin/catalog/hooks/useAdminCatalogPresenter';

interface BulkActionDialogsProps {
  presenter: AdminCatalogPresenter;
}

export function BulkActionDialogs({ presenter }: BulkActionDialogsProps) {
  const [unpublishReason, setUnpublishReason] = useState('');

  return (
    <>
      {/* Publish Confirmation Dialog */}
      <AlertDialog open={presenter.isPublishModalOpen} onOpenChange={presenter.closePublishModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish Products</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to publish {presenter.selectedCount} product
              {presenter.selectedCount !== 1 ? 's' : ''}? Published products will be visible to
              all users.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await presenter.handleBulkPublish();
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unpublish Confirmation Dialog */}
      <AlertDialog
        open={presenter.isUnpublishModalOpen}
        onOpenChange={presenter.closeUnpublishModal}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish Products</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unpublish {presenter.selectedCount} product
              {presenter.selectedCount !== 1 ? 's' : ''}? Unpublished products will no longer be
              visible to users.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="unpublish-reason" className="text-sm font-medium">
              Reason (optional)
            </Label>
            <Input
              id="unpublish-reason"
              placeholder="Enter reason for unpublishing..."
              value={unpublishReason}
              onChange={(e) => setUnpublishReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUnpublishReason('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await presenter.handleBulkUnpublish(unpublishReason || undefined);
                setUnpublishReason('');
              }}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              Unpublish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={presenter.isDeleteModalOpen} onOpenChange={presenter.closeDeleteModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Products</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {presenter.selectedCount} product
              {presenter.selectedCount !== 1 ? 's' : ''}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-800">
              <strong>Warning:</strong> Deleting products will permanently remove all associated
              data including variants, images, and order history.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await presenter.handleBulkDelete();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
