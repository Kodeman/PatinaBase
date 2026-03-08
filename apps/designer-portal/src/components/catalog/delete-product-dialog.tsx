'use client';

import { AlertCircle } from 'lucide-react';
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
import type { Product } from '@patina/types';

interface DeleteProductDialogProps {
  open: boolean;
  product: Product | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function DeleteProductDialog({
  open,
  product,
  onOpenChange,
  onConfirm,
  isDeleting = false,
}: DeleteProductDialogProps) {
  if (!product) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div className="flex-1">
              <AlertDialogTitle className="text-xl">Delete Product</AlertDialogTitle>
              <AlertDialogDescription className="mt-2">
                Are you sure you want to delete <strong>{product.name}</strong>?
                This action cannot be undone.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive" />
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-destructive">
                This will permanently delete:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Product details and specifications</li>
                <li>All product images and media</li>
                <li>Product variants and pricing information</li>
                <li>Product from all collections</li>
                <li>Historical data and analytics</li>
              </ul>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'Deleting...' : 'Delete Product'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
