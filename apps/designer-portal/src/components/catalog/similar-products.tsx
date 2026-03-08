'use client';

import { Card, CardContent } from '@patina/design-system';
import { Button } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { Skeleton } from '@patina/design-system';
import { Heart, Plus, Eye, Sparkles } from 'lucide-react';
import { useSimilarProducts } from '@/hooks/use-search';
import { formatCurrency } from '@/lib/utils';

interface SimilarProductsProps {
  productId: string | null;
  onViewProduct?: (product: any) => void;
  onAddToProposal?: (product: any) => void;
  limit?: number;
  title?: string;
  className?: string;
}

export function SimilarProducts({
  productId,
  onViewProduct,
  onAddToProposal,
  limit = 4,
  title = 'Similar Products',
  className = '',
}: SimilarProductsProps) {
  const { data, isLoading, error } = useSimilarProducts(productId, limit);

  const products = (data as any)?.products || [];

  if (error) {
    return null; // Gracefully hide on error
  }

  if (isLoading) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-0">
                <Skeleton className="aspect-square w-full rounded-t-lg" />
                <div className="p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-6 w-1/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return null; // Don't show if no similar products
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {products.slice(0, limit).map((product: any) => {
          const imageUrl =
            product.coverImage || product.images?.[0]?.url || 'https://via.placeholder.com/400';
          const tags = product.styleTags || product.tags || [];

          return (
            <Card
              key={product.id}
              className="group overflow-hidden hover:border-primary transition-colors cursor-pointer"
              onClick={() => onViewProduct?.(product)}
            >
              <CardContent className="p-0">
                {/* Image */}
                <div className="relative aspect-square overflow-hidden bg-muted">
                  <img
                    src={imageUrl}
                    alt={product.name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute right-2 top-2">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8 rounded-full shadow-md"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Add to favorites logic
                      }}
                    >
                      <Heart className="h-4 w-4" />
                    </Button>
                  </div>
                  {product.similarityScore && (
                    <div className="absolute left-2 top-2">
                      <Badge variant="solid" className="text-xs">
                        {Math.round(product.similarityScore * 100)}% match
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                        {product.name}
                      </h4>
                      <p className="text-xs text-muted-foreground">{product.brand}</p>
                    </div>
                  </div>

                  {tags.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {tags.slice(0, 2).map((tag: string) => (
                        <Badge key={tag} variant="subtle" color="neutral" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="font-bold text-sm">{formatCurrency(product.price)}</span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewProduct?.(product);
                        }}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToProposal?.(product);
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Compact version for use in product detail modals
 */
export function SimilarProductsCompact({
  productId,
  onViewProduct,
  limit = 4,
}: SimilarProductsProps) {
  const { data, isLoading, error } = useSimilarProducts(productId, limit);

  const products = (data as any)?.products || [];

  if (error || isLoading || products.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {products.slice(0, limit).map((product: any) => {
        const imageUrl =
          product.coverImage || product.images?.[0]?.url || 'https://via.placeholder.com/200';

        return (
          <div
            key={product.id}
            className="flex gap-3 p-3 rounded-lg border hover:bg-accent transition-colors cursor-pointer"
            onClick={() => onViewProduct?.(product)}
          >
            <div className="relative h-20 w-20 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
              <img src={imageUrl} alt={product.name} className="h-full w-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm truncate">{product.name}</h4>
              <p className="text-xs text-muted-foreground">{product.brand}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="font-bold text-sm">{formatCurrency(product.price)}</span>
                {product.similarityScore && (
                  <Badge variant="subtle" color="neutral" className="text-xs">
                    {Math.round(product.similarityScore * 100)}% match
                  </Badge>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
