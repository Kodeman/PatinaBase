'use client';

import { Fragment, useMemo } from 'react';
import { Heart, Plus, Eye, Edit2, Trash2, Search as SearchIcon, ExternalLink } from 'lucide-react';
import { Badge, Button, Card, CardContent, Skeleton } from '@patina/design-system';

import { ImageZoom, MediaBadges } from '@/components/media';
import type { CatalogFilters } from '@/components/catalog/catalog-filters';
import { formatCurrency } from '@/lib/utils';
import { getOptimizedImageUrl } from '@/lib/media-utils';

import type { CatalogDisplayProduct, CatalogViewMode } from '../types';

interface CatalogResultsProps {
  products: CatalogDisplayProduct[];
  viewMode: CatalogViewMode;
  isLoading: boolean;
  isError: boolean;
  totalProducts: number;
  totalPages: number;
  page: number;
  resultsRange: { start: number; end: number };
  searchQuery: string;
  filters: CatalogFilters;
  onViewProduct: (product: CatalogDisplayProduct) => void;
  onEditProduct?: (product: CatalogDisplayProduct) => void;
  onDeleteProduct?: (product: CatalogDisplayProduct) => void;
  onPageChange: (page: number) => void;
  onClearFilters: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function CatalogResults({
  products,
  viewMode,
  isLoading,
  isError,
  totalProducts,
  totalPages,
  page,
  resultsRange,
  searchQuery,
  filters,
  onViewProduct,
  onEditProduct,
  onDeleteProduct,
  onPageChange,
  onClearFilters,
  canEdit = false,
  canDelete = false,
}: CatalogResultsProps) {
  const hasResults = products.length > 0;
  const hasFilters = useMemo(() => Object.keys(filters).length > 0, [filters]);

  const paginationNumbers = useMemo(() => {
    if (totalPages <= 0) return [];

    const visibleCount = Math.min(5, totalPages);
    const pages: number[] = [];

    for (let i = 0; i < visibleCount; i += 1) {
      let pageNumber: number;
      if (totalPages <= 5) {
        pageNumber = i + 1;
      } else if (page <= 3) {
        pageNumber = i + 1;
      } else if (page >= totalPages - 2) {
        pageNumber = totalPages - 4 + i;
      } else {
        pageNumber = page - 2 + i;
      }
      pages.push(pageNumber);
    }

    return pages;
  }, [page, totalPages]);

  return (
    <Fragment>
      {!isError && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            {isLoading
              ? 'Loading products...'
              : hasResults
              ? (
                  <>
                    Showing {resultsRange.start}-{resultsRange.end} of {totalProducts} products
                    {searchQuery && ` for "${searchQuery}"`}
                  </>
                )
              : 'No products found'}
          </div>
          {totalPages > 1 && !isLoading && (
            <div className="text-xs">Page {page} of {totalPages}</div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className={viewMode === 'grid' ? 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'space-y-4'}>
          {[...Array(8).keys()].map((i) => (
            <Card key={`skeleton-${i}`}>
              <CardContent className="p-0">
                <Skeleton className="h-64 w-full rounded-t-lg" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-6 w-1/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'space-y-4'}>
          {products.map((product) => (
            <Card
              key={product.id}
              className="group overflow-hidden hover:border-primary transition-colors cursor-pointer"
              onClick={() => onViewProduct(product)}
            >
              {viewMode === 'grid' ? (
                <CardContent className="p-0">
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    <ImageZoom
                      src={getOptimizedImageUrl(product.imageUrl, { width: 600, quality: 85 })}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                    <MediaBadges
                      has3D={product.has3D}
                      arSupported={product.arSupported}
                      variant="overlay"
                      size="sm"
                    />
                    <div className="absolute right-2 top-2 space-x-2">
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-8 w-8 rounded-full shadow-md"
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        <Heart className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate group-hover:text-primary transition-colors">{product.name}</h3>
                        <p className="text-sm text-muted-foreground">{product.brand}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {product.tags?.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="subtle" color="neutral" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-lg font-bold">{formatCurrency(product.price)}</span>
                      <div className="flex gap-2">
                        {canEdit && onEditProduct && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              onEditProduct(product);
                            }}
                          >
                            <Edit2 className="mr-1 h-3 w-3" />
                            Edit
                          </Button>
                        )}
                        {canDelete && onDeleteProduct && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteProduct(product);
                            }}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                          >
                            <Trash2 className="mr-1 h-3 w-3" />
                            Delete
                          </Button>
                        )}
                        {product.sourceUrl && (
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            asChild
                          >
                            <a
                              href={product.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              aria-label="View original product page"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation();
                            onViewProduct(product);
                          }}
                        >
                          <Eye className="mr-1 h-3 w-3" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              ) : (
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                      <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                    </div>
                    <div className="flex flex-1 flex-col justify-between">
                      <div>
                        <h3 className="font-semibold">{product.name}</h3>
                        <p className="text-sm text-muted-foreground">{product.brand}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {product.tags?.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="subtle" color="neutral" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between">
                      <span className="text-lg font-bold">{formatCurrency(product.price)}</span>
                      <div className="flex gap-2">
                        {canEdit && onEditProduct && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              onEditProduct(product);
                            }}
                          >
                            <Edit2 className="mr-1 h-3 w-3" />
                            Edit
                          </Button>
                        )}
                        {canDelete && onDeleteProduct && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteProduct(product);
                            }}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                          >
                            <Trash2 className="mr-1 h-3 w-3" />
                            Delete
                          </Button>
                        )}
                        {product.sourceUrl && (
                          <Button
                            size="icon"
                            variant="outline"
                            asChild
                          >
                            <a
                              href={product.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              aria-label="View original product page"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <Button size="icon" variant="outline">
                          <Heart className="h-4 w-4" />
                        </Button>
                        <Button size="sm">
                          <Plus className="mr-1 h-3 w-3" />
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {!isLoading && !isError && !hasResults && (
        <Card>
          <CardContent className="p-12 text-center">
            <SearchIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No products found</h3>
            <p className="text-muted-foreground">
              {searchQuery || hasFilters ? 'Try adjusting your search or filters' : 'No products available in the catalog'}
            </p>
            {hasFilters && (
              <Button variant="outline" onClick={onClearFilters} className="mt-4">
                Clear Filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && hasResults && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}>
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {paginationNumbers.map((pageNumber) => (
              <Button
                key={pageNumber}
                variant={page === pageNumber ? 'default' : 'outline'}
                size="sm"
                onClick={() => onPageChange(pageNumber)}
                className="w-10"
              >
                {pageNumber}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </Fragment>
  );
}
