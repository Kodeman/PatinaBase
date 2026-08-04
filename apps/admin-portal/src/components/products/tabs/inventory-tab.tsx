'use client';

import * as React from 'react';
import { Package } from 'lucide-react';
import type { Product } from '@patina/types';

interface InventoryTabProps {
  product?: Product;
  onChange: (updates: Partial<Product>) => void;
}

/**
 * Inventory tab.
 *
 * The legacy variant-based inventory model (per-variant SKU/stock/lead-time
 * rows) was retired — furniture configuration now runs through the option
 * groups / product configurations system. This tab is kept as a stable
 * mount point for `catalog/new` until a configuration-aware inventory view
 * lands here.
 */
export function InventoryTab({ product: _product, onChange: _onChange }: InventoryTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Inventory</h3>
        <p className="text-sm text-muted-foreground">
          Stock and lead-time tracking now lives on each product&apos;s option
          groups and configurations.
        </p>
      </div>

      <div className="border-2 border-dashed border-border rounded-lg p-8">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-muted mx-auto flex items-center justify-center">
            <Package className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium mb-1">Nothing to configure here yet</p>
            <p className="text-sm text-muted-foreground">
              Options, components, and lead times are managed on the product&apos;s
              configuration once it has been created.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
