'use client';

import * as React from 'react';
import { Plus, Trash2, Package, AlertTriangle, CheckCircle } from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  Label
} from '@patina/design-system';
import { Select } from './shared-components';
import { cn } from '@/lib/utils';
import type { Product, Variant, AvailabilityStatus } from '@patina/types';

interface InventoryTabProps {
  product?: Product;
  onChange: (updates: Partial<Product>) => void;
}

const AVAILABILITY_STATUSES: {
  value: AvailabilityStatus;
  label: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'success';
}[] = [
  { value: 'in_stock', label: 'In Stock', variant: 'success' },
  { value: 'out_of_stock', label: 'Out of Stock', variant: 'destructive' },
  { value: 'preorder', label: 'Pre-order', variant: 'default' },
  { value: 'backorder', label: 'Backorder', variant: 'secondary' },
  { value: 'discontinued', label: 'Discontinued', variant: 'destructive' },
];

export function InventoryTab({ product, onChange }: InventoryTabProps) {
  const [variants, setVariants] = React.useState<Variant[]>(
    product?.variants || []
  );

  const handleAddVariant = () => {
    const newVariant: Variant = {
      id: `temp-${Date.now()}`,
      productId: product?.id || '',
      sku: '',
      name: '',
      options: {},
      availabilityStatus: 'in_stock',
      quantity: 0,
      leadTimeDays: 0,
    };
    const updatedVariants = [...variants, newVariant];
    setVariants(updatedVariants);
    onChange({ variants: updatedVariants });
  };

  const handleRemoveVariant = (index: number) => {
    const updatedVariants = variants.filter((_, i) => i !== index);
    setVariants(updatedVariants);
    onChange({ variants: updatedVariants });
  };

  const handleVariantChange = (
    index: number,
    field: keyof Variant,
    value: any
  ) => {
    const updatedVariants = [...variants];
    updatedVariants[index] = { ...updatedVariants[index], [field]: value };
    setVariants(updatedVariants);
    onChange({ variants: updatedVariants });
  };

  const handleOptionChange = (
    index: number,
    optionKey: string,
    optionValue: string
  ) => {
    const updatedVariants = [...variants];
    updatedVariants[index] = {
      ...updatedVariants[index],
      options: { ...updatedVariants[index].options, [optionKey]: optionValue },
    };
    setVariants(updatedVariants);
    onChange({ variants: updatedVariants });
  };

  // Calculate total stock
  const totalStock = variants.reduce(
    (sum, variant) => sum + (variant.quantity || 0),
    0
  );

  // Count variants by status
  const variantsByStatus = variants.reduce(
    (acc, variant) => {
      acc[variant.availabilityStatus] = (acc[variant.availabilityStatus] || 0) + 1;
      return acc;
    },
    {} as Record<AvailabilityStatus, number>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold mb-1">Inventory & Variants</h3>
        <p className="text-sm text-muted-foreground">
          Manage product variants, stock levels, and availability status.
        </p>
      </div>

      {/* Inventory Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Total Variants</p>
          </div>
          <p className="text-2xl font-semibold">{variants.length}</p>
        </div>

        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <p className="text-xs text-muted-foreground">In Stock</p>
          </div>
          <p className="text-2xl font-semibold">
            {variantsByStatus.in_stock || 0}
          </p>
        </div>

        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600" />
            <p className="text-xs text-muted-foreground">Low Stock</p>
          </div>
          <p className="text-2xl font-semibold">
            {variants.filter((v) => (v.quantity || 0) > 0 && (v.quantity || 0) < 10).length}
          </p>
        </div>

        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Total Stock</p>
          </div>
          <p className="text-2xl font-semibold">{totalStock}</p>
        </div>
      </div>

      {/* Add Variant Button */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-base font-semibold">Product Variants</h4>
          <p className="text-sm text-muted-foreground">
            Create variants for different sizes, colors, or configurations
          </p>
        </div>
        <Button onClick={handleAddVariant} variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          Add Variant
        </Button>
      </div>

      {/* Variants List */}
      {variants.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-8">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-muted mx-auto flex items-center justify-center">
              <Package className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium mb-1">No variants yet</p>
              <p className="text-sm text-muted-foreground">
                Add variants to manage different SKUs, stock levels, and pricing
              </p>
            </div>
            <Button onClick={handleAddVariant} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Create First Variant
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {variants.map((variant, index) => (
            <div
              key={variant.id}
              className="border border-border rounded-lg p-4 space-y-4"
            >
              {/* Variant Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Variant {index + 1}</Badge>
                  {variant.availabilityStatus && (
                    <Badge
                      variant={
                        AVAILABILITY_STATUSES.find(
                          (s) => s.value === variant.availabilityStatus
                        )?.variant || 'default'
                      }
                    >
                      {AVAILABILITY_STATUSES.find(
                        (s) => s.value === variant.availabilityStatus
                      )?.label || variant.availabilityStatus}
                    </Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleRemoveVariant(index)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              {/* Variant Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`variant-sku-${index}`}>SKU*</Label>
                  <Input
                    id={`variant-sku-${index}`}
                    placeholder="e.g., SOF-BLU-84"
                    value={variant.sku}
                    onChange={(e) =>
                      handleVariantChange(index, 'sku', e.target.value)
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`variant-name-${index}`}>Variant Name</Label>
                  <Input
                    id={`variant-name-${index}`}
                    placeholder="e.g., Blue, 84 inch"
                    value={variant.name || ''}
                    onChange={(e) =>
                      handleVariantChange(index, 'name', e.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`variant-barcode-${index}`}>Barcode</Label>
                  <Input
                    id={`variant-barcode-${index}`}
                    placeholder="UPC/EAN"
                    value={variant.barcode || ''}
                    onChange={(e) =>
                      handleVariantChange(index, 'barcode', e.target.value)
                    }
                  />
                </div>
              </div>

              {/* Variant Options (Color, Size, etc.) */}
              <div className="space-y-2">
                <Label>Variant Options</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Input
                      placeholder="Option (e.g., Color)"
                      value={Object.keys(variant.options)[0] || ''}
                      onChange={(e) => {
                        const newOptions = { ...variant.options };
                        const oldKey = Object.keys(newOptions)[0];
                        if (oldKey) {
                          const value = newOptions[oldKey];
                          delete newOptions[oldKey];
                          newOptions[e.target.value] = value;
                        } else {
                          newOptions[e.target.value] = '';
                        }
                        handleVariantChange(index, 'options', newOptions);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Input
                      placeholder="Value (e.g., Navy Blue)"
                      value={String(Object.values(variant.options)[0] || '')}
                      onChange={(e) => {
                        const key = Object.keys(variant.options)[0];
                        if (key) {
                          handleOptionChange(index, key, e.target.value);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Stock & Availability */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`variant-status-${index}`}>
                    Availability Status*
                  </Label>
                  <Select
                    id={`variant-status-${index}`}
                    value={variant.availabilityStatus}
                    onChange={(e) =>
                      handleVariantChange(
                        index,
                        'availabilityStatus',
                        e.target.value as AvailabilityStatus
                      )
                    }
                  >
                    {AVAILABILITY_STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`variant-quantity-${index}`}>
                    Stock Quantity
                  </Label>
                  <Input
                    id={`variant-quantity-${index}`}
                    type="number"
                    min="0"
                    placeholder="0"
                    value={variant.quantity || ''}
                    onChange={(e) =>
                      handleVariantChange(
                        index,
                        'quantity',
                        parseInt(e.target.value) || 0
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`variant-leadtime-${index}`}>
                    Lead Time (Days)
                  </Label>
                  <Input
                    id={`variant-leadtime-${index}`}
                    type="number"
                    min="0"
                    placeholder="0"
                    value={variant.leadTimeDays || ''}
                    onChange={(e) =>
                      handleVariantChange(
                        index,
                        'leadTimeDays',
                        parseInt(e.target.value) || 0
                      )
                    }
                  />
                </div>
              </div>

              {/* Pricing Overrides */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`variant-price-${index}`}>
                    Price Override
                  </Label>
                  <Input
                    id={`variant-price-${index}`}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Use base price"
                    value={variant.price || ''}
                    onChange={(e) =>
                      handleVariantChange(
                        index,
                        'price',
                        parseFloat(e.target.value) || undefined
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use base product price
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`variant-sale-price-${index}`}>
                    Sale Price Override
                  </Label>
                  <Input
                    id={`variant-sale-price-${index}`}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Use base sale price"
                    value={variant.salePrice || ''}
                    onChange={(e) =>
                      handleVariantChange(
                        index,
                        'salePrice',
                        parseFloat(e.target.value) || undefined
                      )
                    }
                  />
                </div>
              </div>

              {/* Low Stock Warning */}
              {variant.availabilityStatus === 'in_stock' &&
                (variant.quantity || 0) < 10 &&
                (variant.quantity || 0) > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-yellow-900 dark:text-yellow-100">
                        Low stock warning
                      </p>
                      <p className="text-yellow-800 dark:text-yellow-200 text-xs">
                        This variant has low stock. Consider restocking soon.
                      </p>
                    </div>
                  </div>
                )}
            </div>
          ))}
        </div>
      )}

      {/* Inventory Tips */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-2">
        <h4 className="text-sm font-semibold">Inventory Best Practices</h4>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>Use clear, consistent SKU naming conventions</li>
          <li>Keep stock quantities accurate to prevent overselling</li>
          <li>Set realistic lead times for out-of-stock items</li>
          <li>Use variant options to organize product configurations</li>
          <li>Monitor low stock levels and reorder proactively</li>
        </ul>
      </div>
    </div>
  );
}
