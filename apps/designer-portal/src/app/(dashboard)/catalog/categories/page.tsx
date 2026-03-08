'use client';

import { useState } from 'react';
import { FolderTree, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import type { Category } from '@patina/types';

import { useCategoryTree } from '@/hooks/use-categories';

function CategoryItem({ category, level = 0 }: { category: Category; level?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = category.children && category.children.length > 0;

  // Handle different field names for product count
  const productCount = (category as any).productCount || (category as any)._count?.products || 0;

  return (
    <div>
      <div
        className="flex items-center gap-3 rounded-lg border p-4 hover:bg-accent transition-colors cursor-pointer"
        style={{ marginLeft: `${level * 24}px` }}
        onClick={() => hasChildren && setIsExpanded(!isExpanded)}
      >
        {hasChildren && (
          <div className="flex-shrink-0">
            <ChevronRight
              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
          </div>
        )}
        {!hasChildren && <div className="w-4" />}

        <FolderTree className="h-5 w-5 text-muted-foreground flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{category.name}</span>
            {productCount > 0 && (
              <Badge variant="subtle" color="neutral" className="text-xs">
                {productCount} products
              </Badge>
            )}
          </div>
          {category.description && (
            <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
          )}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="mt-2 space-y-2">
          {category.children?.map((child) => (
            <CategoryItem key={child.id} category={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const { data, isLoading, error, refetch } = useCategoryTree();

  const categories = data?.categories || [];
  const totalCategories = data?.meta?.total || 0;
  const maxDepth = data?.meta?.maxDepth || 0;

  // Calculate stats from category tree
  const totalProducts = categories.reduce((acc, cat) => {
    const count = (cat as any).productCount || (cat as any)._count?.products || 0;
    const childCount = cat.children?.reduce((childAcc, child) => {
      return childAcc + ((child as any).productCount || (child as any)._count?.products || 0);
    }, 0) || 0;
    return acc + count + childCount;
  }, 0);

  const totalSubcategories = categories.reduce(
    (acc, cat) => acc + (cat.children?.length || 0),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Categories</h2>
        <p className="text-muted-foreground">
          Browse product categories and taxonomy
        </p>
      </div>

      {/* Category Tree */}
      <Card>
        <CardContent className="p-6">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Loading categories...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Failed to load categories</h3>
              <p className="text-muted-foreground mb-4">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
              <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Try Again
              </button>
            </div>
          )}

          {!isLoading && !error && categories.length === 0 && (
            <div className="text-center py-12">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <FolderTree className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No categories available</h3>
              <p className="text-muted-foreground">
                Categories will appear here once they are created by administrators
              </p>
            </div>
          )}

          {!isLoading && !error && categories.length > 0 && (
            <div className="space-y-2">
              {categories.map((category) => (
                <CategoryItem key={category.id} category={category} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Card */}
      {!isLoading && !error && categories.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Total Categories</p>
                <p className="text-2xl font-bold">{totalCategories}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Products</p>
                <p className="text-2xl font-bold">{totalProducts}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Subcategories</p>
                <p className="text-2xl font-bold">{totalSubcategories}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Banner */}
      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Category management is restricted to administrators.
            If you need changes to the category structure, please contact your administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
