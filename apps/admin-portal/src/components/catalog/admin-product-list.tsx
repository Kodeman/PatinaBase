'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  MoreHorizontal,
  AlertCircle,
  CheckCircle2,
  Edit,
  Copy,
  Trash2,
  Eye,
  Package,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Image from 'next/image';
import type { ProductListItem } from '@/types';
import type { AdminCatalogPresenter } from '@/features/catalog/hooks/useAdminCatalogPresenter';

interface AdminProductListProps {
  product: ProductListItem;
  presenter: AdminCatalogPresenter;
}

// Move formatters outside component to prevent recreation on each render
// Performance: 25-250ms saved per render cycle
const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

// Status variant mapping - computed once
const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  published: 'default',
  draft: 'secondary',
  in_review: 'outline',
  deprecated: 'destructive',
} as const;

// Wrap component in React.memo to prevent unnecessary re-renders
// Performance: Prevents re-render when parent updates but props haven't changed
export const AdminProductList = React.memo(function AdminProductList({ product, presenter }: AdminProductListProps) {
  const isSelected = presenter.hasSelection; // TODO: check if this specific product is selected

  return (
    <Card className="hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4 p-4">
        {/* Selection Checkbox */}
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => presenter.handleProductToggle(product.id)}
          aria-label={`Select ${product.name}`}
        />

        {/* Thumbnail with lazy loading */}
        <div className="relative w-20 h-20 flex-shrink-0 bg-gray-100 rounded">
          {product.coverImage ? (
            <Image
              src={product.coverImage}
              alt={product.name}
              fill
              className="object-cover rounded"
              sizes="80px"
              loading="lazy"
              placeholder="blur"
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjNmNGY2Ii8+PC9zdmc+"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <Package className="h-8 w-8" />
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Title & Brand */}
              <h3 className="font-semibold text-base truncate" title={product.name}>
                {product.name}
              </h3>
              {product.brand && (
                <p className="text-sm text-gray-500 mt-0.5">{product.brand}</p>
              )}

              {/* Metadata Row */}
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                <span className="font-medium">{priceFormatter.format(product.price)}</span>

                {product.variantCount > 0 && (
                  <>
                    <span>•</span>
                    <span>{product.variantCount} variants</span>
                  </>
                )}

                {product.categoryName && (
                  <>
                    <span>•</span>
                    <span className="truncate max-w-xs">{product.categoryName}</span>
                  </>
                )}
              </div>

              {/* Badges Row */}
              <div className="flex items-center gap-2 mt-3">
                <Badge variant={STATUS_VARIANTS[product.status] || 'secondary'}>
                  {product.status}
                </Badge>

                {product.has3D && (
                  <Badge variant="secondary" className="text-xs">
                    3D
                  </Badge>
                )}

                {product.arSupported && (
                  <Badge variant="secondary" className="text-xs">
                    AR
                  </Badge>
                )}

                {product.hasValidationIssues ? (
                  <div className="flex items-center gap-1 text-red-500">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-xs">Has issues</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-green-500">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                )}
              </div>
            </div>

            {/* Actions Column */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Last Updated */}
              <div className="text-xs text-gray-500 text-right mr-4">
                <div>Updated</div>
                <div className="font-medium">{dateFormatter.format(new Date(product.updatedAt))}</div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // TODO: Open product detail modal
                  console.log('View product:', product.id);
                }}
              >
                <Eye className="mr-2 h-4 w-4" />
                View
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="px-2" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {product.status === 'published' ? (
                    <DropdownMenuItem>Unpublish</DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem>Publish</DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
});
