'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MoreHorizontal,
  AlertCircle,
  CheckCircle2,
  Edit,
  Copy,
  Trash2,
} from 'lucide-react';
import { ProductListItem as SharedProductListItem } from '@patina/catalog-ui';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ProductListItem } from '@/types';
import type { AdminCatalogPresenter } from '@/features/catalog/hooks/useAdminCatalogPresenter';

interface AdminProductListProps {
  product: ProductListItem;
  presenter: AdminCatalogPresenter;
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  published: 'default',
  draft: 'secondary',
  in_review: 'outline',
  deprecated: 'destructive',
} as const;

export const AdminProductList = React.memo(function AdminProductList({
  product,
  presenter,
}: AdminProductListProps) {
  const router = useRouter();
  const isSelected = presenter.selectedProducts?.includes(product.id) || false;

  const leadingSlot = (
    <Checkbox
      checked={isSelected}
      onCheckedChange={() => presenter.handleProductToggle(product.id)}
      aria-label={`Select ${product.name}`}
    />
  );

  const actionsSlot = (
    <div className="flex items-center gap-2">
      <Badge variant={STATUS_VARIANTS[product.status] || 'secondary'} className="text-[10px]">
        {product.status}
      </Badge>
      {product.hasValidationIssues ? (
        <AlertCircle className="h-4 w-4 text-red-500" aria-label="Has issues" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="No issues" />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="px-2" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/catalog/${product.id}`} className="cursor-pointer">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Link>
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
  );

  return (
    <SharedProductListItem
      id={product.id}
      name={product.name}
      maker={product.brand}
      thumbUrl={product.coverImage}
      price={product.price}
      status={product.status}
      onClick={(id) => router.push(`/catalog/${id}`)}
      leadingSlot={leadingSlot}
      actionsSlot={actionsSlot}
    />
  );
});
