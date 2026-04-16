'use client';

import { memo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MoreHorizontal,
  AlertCircle,
  CheckCircle2,
  Edit,
  Copy,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { ProductCard as SharedProductCard } from '@patina/catalog-ui';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ProductListItem } from '@/types';
import type { AdminCatalogPresenter } from '@/features/catalog/hooks/useAdminCatalogPresenter';

interface AdminProductCardProps {
  product: ProductListItem;
  presenter: AdminCatalogPresenter;
}

export const AdminProductCard = memo(
  function AdminProductCard({ product, presenter }: AdminProductCardProps) {
    const router = useRouter();
    const isSelected = presenter.selectedProducts?.includes(product.id) || false;

    const leadingSlot = (
      <Checkbox
        id={`select-product-${product.id}`}
        checked={isSelected}
        onCheckedChange={() => presenter.handleProductToggle(product.id)}
        className="bg-white shadow-sm"
        aria-label={`Select ${product.name} by ${product.brand || 'Unknown brand'}`}
      />
    );

    const trailingSlot = (
      <div className="flex gap-1">
        {product.has3D && (
          <Badge variant="secondary" className="text-xs bg-white/90 backdrop-blur">
            3D
          </Badge>
        )}
        {product.arSupported && (
          <Badge variant="secondary" className="text-xs bg-white/90 backdrop-blur">
            AR
          </Badge>
        )}
        {product.hasValidationIssues ? (
          <span
            className="inline-flex items-center gap-1 rounded bg-red-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur"
            role="status"
            aria-label="Has validation issues"
          >
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            Issues
          </span>
        ) : (
          <span className="inline-flex items-center rounded bg-emerald-500/90 p-1 text-white backdrop-blur">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">No issues</span>
          </span>
        )}
      </div>
    );

    const footerSlot = (
      <div className="flex items-center gap-2" role="group" aria-label={`Actions for ${product.name}`}>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => router.push(`/catalog/${product.id}`)}
          aria-label={`Edit ${product.name}`}
        >
          <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
          Edit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="px-2"
              aria-label={`More actions for ${product.name}`}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" aria-label="Product actions menu">
            <DropdownMenuItem asChild>
              <Link href={`/catalog/${product.id}`} className="cursor-pointer">
                <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
                Edit
              </Link>
            </DropdownMenuItem>
            {product.sourceUrl && (
              <DropdownMenuItem asChild>
                <a
                  href={product.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                  View Original
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem>
              <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
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
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );

    return (
      <SharedProductCard
        id={product.id}
        name={product.name}
        maker={product.brand}
        imageUrl={product.coverImage}
        price={product.price}
        status={product.status}
        onClick={(id) => router.push(`/catalog/${id}`)}
        leadingSlot={leadingSlot}
        trailingSlot={trailingSlot}
        footerSlot={footerSlot}
      />
    );
  },
  (prevProps, nextProps) =>
    prevProps.product.id === nextProps.product.id &&
    prevProps.product.updatedAt === nextProps.product.updatedAt &&
    prevProps.product.status === nextProps.product.status &&
    prevProps.product.hasValidationIssues === nextProps.product.hasValidationIssues &&
    prevProps.presenter.selectedProducts?.includes(prevProps.product.id) ===
      nextProps.presenter.selectedProducts?.includes(nextProps.product.id)
);
