'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Edit,
  Share2,
  Trash2,
  Plus,
  Eye,
  Heart,
  AlertCircle,
  Settings,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { Card, CardContent } from '@patina/design-system';
import { Skeleton } from '@patina/design-system';
import { Alert, AlertDescription } from '@patina/design-system';
import { useCollection, useCollectionProducts, useDeleteCollection } from '@/hooks/use-collections';
import { CollectionStats } from '@/components/collections/collection-stats';
import { RuleBuilder } from '@/components/collections/rule-builder';
import { formatCurrency } from '@/lib/utils';
import type { Product } from '@patina/types';
import Link from 'next/link';

export default function CollectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const collectionId = params.id as string;

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Fetch collection and its products
  const { data: collectionData, isLoading: isLoadingCollection, error: collectionError } =
    useCollection(collectionId);

  const { data: productsData, isLoading: isLoadingProducts } =
    useCollectionProducts(collectionId);

  const deleteMutation = useDeleteCollection();

  // Extract data from responses
  const collection = (collectionData as any)?.data || collectionData;
  const products: Product[] =
    (productsData as any)?.data?.products || (productsData as any)?.products || [];

  // Calculate stats
  const stats = useMemo(() => {
    if (!products || products.length === 0) {
      return {
        productCount: 0,
        totalValue: 0,
        averagePrice: 0,
        categoryCount: 0,
        categories: [],
      };
    }

    const totalValue = products.reduce((sum, p) => sum + (p.price || 0), 0);
    const averagePrice = totalValue / products.length;

    // Count categories
    const categoryMap = new Map<string, number>();
    products.forEach((p) => {
      if (p.categoryId) {
        const current = categoryMap.get(p.categoryId) || 0;
        categoryMap.set(p.categoryId, current + 1);
      }
    });

    const categories = Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      productCount: products.length,
      totalValue,
      averagePrice,
      categoryCount: categories.length,
      categories,
    };
  }, [products]);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this collection?')) return;

    try {
      await deleteMutation.mutateAsync(collectionId);
      router.push('/catalog/collections');
    } catch (error) {
      console.error('Failed to delete collection:', error);
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/catalog/collections/${collectionId}`;
    navigator.clipboard.writeText(url);
    alert('Collection link copied to clipboard!');
  };

  if (isLoadingCollection) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (collectionError || !collection) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load collection. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const typeColors = {
    manual: 'blue' as const,
    rule: 'purple' as const,
    smart: 'green' as const,
  };

  const typeLabels = {
    manual: 'Curated',
    rule: 'Dynamic',
    smart: 'AI-Powered',
  };

  const statusColors = {
    draft: 'neutral' as const,
    published: 'green' as const,
    scheduled: 'blue' as const,
    archived: 'neutral' as const,
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Collections
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="solid" color={typeColors[collection.type]}>
                {typeLabels[collection.type]}
              </Badge>
              <Badge variant="subtle" color={statusColors[collection.status]}>
                {collection.status}
              </Badge>
              {collection.featured && (
                <Badge variant="solid" color="warning">
                  Featured
                </Badge>
              )}
            </div>

            <h1 className="text-4xl font-bold tracking-tight">{collection.name}</h1>

            {collection.description && (
              <p className="text-lg text-muted-foreground max-w-3xl">
                {collection.description}
              </p>
            )}

            {collection.tags && collection.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {collection.tags.map((tag) => (
                  <Badge key={tag} variant="subtle" color="neutral">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
            <Button variant="outline" size="sm">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Hero Image */}
      {collection.heroImage && (
        <div className="relative aspect-[21/9] overflow-hidden rounded-xl">
          <img
            src={collection.heroImage}
            alt={collection.name}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      {/* Stats */}
      <CollectionStats {...stats} />

      {/* Rule-based Collection Rules */}
      {collection.type === 'rule' && collection.rule && (
        <RuleBuilder
          rules={collection.rule.conditions}
          operator={collection.rule.operator}
          readOnly
        />
      )}

      {/* Smart Collection Info */}
      {collection.type === 'smart' && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This AI-powered collection automatically suggests products based on style
            compatibility and customer preferences.
          </AlertDescription>
        </Alert>
      )}

      {/* Products Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Products</h2>
          {collection.type === 'manual' && (
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Products
            </Button>
          )}
        </div>

        {isLoadingProducts ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Card key={i}>
                <CardContent className="p-0">
                  <Skeleton className="h-64 w-full rounded-t-lg" />
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : products.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Settings className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No products in this collection</h3>
              <p className="text-muted-foreground mb-4">
                {collection.type === 'manual'
                  ? 'Start adding products to this collection'
                  : collection.type === 'rule'
                  ? 'No products match the current rules'
                  : 'AI has not suggested any products yet'}
              </p>
              {collection.type === 'manual' && (
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Products
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <Link key={product.id} href={`/catalog/products/${product.id}`}>
                <Card className="group overflow-hidden hover:border-primary transition-colors cursor-pointer h-full">
                  <CardContent className="p-0">
                    {/* Image */}
                    <div className="relative aspect-square overflow-hidden bg-muted">
                      <img
                        src={product.coverImage || 'https://via.placeholder.com/400'}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute right-2 top-2">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-8 w-8 rounded-full shadow-md"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          <Heart className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
                            {product.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">{product.brand}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-lg font-bold">
                          {formatCurrency(product.price)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {products.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold mb-1">Quick Actions</h3>
                <p className="text-sm text-muted-foreground">
                  Work with all {stats.productCount} products in this collection
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Add All to Board
                </Button>
                <Button variant="outline">
                  <Share2 className="mr-2 h-4 w-4" />
                  Export Collection
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
