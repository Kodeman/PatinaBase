'use client';

import { useState } from 'react';
import { Search, Plus, SlidersHorizontal, AlertCircle } from 'lucide-react';
import { Button } from '@patina/design-system';
import { Input } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { Card, CardContent } from '@patina/design-system';
import { Skeleton } from '@patina/design-system';
import { Alert, AlertDescription } from '@patina/design-system';
import { toast } from '@patina/design-system';
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
import { useCollections, useFeaturedCollections } from '@/hooks/use-collections';
import { CollectionHero } from '@/components/collections/collection-hero';
import { CollectionCard } from '@/components/collections/collection-card';
import { CreateCollectionModal } from '@/components/collections/create-collection-modal';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { canEditProducts, canDeleteProducts } from '@/lib/permissions';
import { catalogApi } from '@/lib/api-client';
import type { Collection, CollectionType, UserRole } from '@patina/types';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

type FilterStatus = 'all' | 'draft' | 'published' | 'scheduled';
type FilterType = 'all' | CollectionType;

export default function CollectionsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [collectionToDelete, setCollectionToDelete] = useState<Collection | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const queryClient = useQueryClient();

  // Check permissions
  const userRole = (user?.roles?.[0] as UserRole | undefined) ?? (user as any)?.role;
  const canEdit = canEditProducts(userRole);
  const canDelete = canDeleteProducts(userRole);

  // Fetch featured collections for hero
  const { data: featuredData, isLoading: isFeaturedLoading } = useFeaturedCollections(3);

  // Build filters
  const filters: any = {
    page,
    pageSize,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    q: searchQuery.length >= 2 ? searchQuery : undefined,
  };

  // Fetch all collections with filters
  const { data: collectionsData, isLoading, error } = useCollections(filters);

  // Extract collections from response
  const featuredCollections: Collection[] =
    (featuredData as any)?.data?.collections ||
    (featuredData as any)?.collections ||
    [];

  const collections: Collection[] =
    (collectionsData as any)?.data?.collections ||
    (collectionsData as any)?.collections ||
    [];

  const totalCollections =
    (collectionsData as any)?.data?.total ||
    (collectionsData as any)?.total ||
    collections.length;

  const totalPages = Math.ceil(totalCollections / pageSize);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (collectionId: string) => catalogApi.deleteCollection(collectionId),
    onSuccess: () => {
      toast({
        title: 'Collection deleted',
        description: 'The collection has been successfully deleted.',
      });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      setCollectionToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete the collection. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleCreateSuccess = (collectionId: string) => {
    router.push(`/catalog/collections/${collectionId}`);
  };

  const handleEditCollection = (collection: Collection) => {
    router.push(`/catalog/collections/${collection.id}/edit`);
  };

  const handleDeleteCollection = (collection: Collection) => {
    setCollectionToDelete(collection);
  };

  const statusOptions = [
    { value: 'all', label: 'All Status', count: totalCollections },
    { value: 'published', label: 'Published' },
    { value: 'draft', label: 'Draft' },
    { value: 'scheduled', label: 'Scheduled' },
  ];

  const typeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'manual', label: 'Curated' },
    { value: 'rule', label: 'Dynamic' },
    { value: 'smart', label: 'AI-Powered' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Collections</h1>
        <p className="text-muted-foreground">
          Browse curated collections and discover products by theme
        </p>
      </div>

      {/* Featured Collections Hero */}
      {!isFeaturedLoading && featuredCollections.length > 0 && (
        <CollectionHero collections={featuredCollections} />
      )}

      {/* Search and Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search collections..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Collection
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {statusOptions.map((option) => (
            <Button
              key={option.value}
              variant={statusFilter === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setStatusFilter(option.value as FilterStatus);
                setPage(1);
              }}
            >
              {option.label}
              {option.count !== undefined && statusFilter === option.value && (
                <Badge variant="solid" className="ml-2">
                  {option.count}
                </Badge>
              )}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Type:</span>
          <div className="flex gap-1 rounded-lg border p-1">
            {typeOptions.map((option) => (
              <Button
                key={option.value}
                variant={typeFilter === option.value ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => {
                  setTypeFilter(option.value as FilterType);
                  setPage(1);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load collections. Please check that the catalog service is running.
            {error && <div className="mt-1 text-xs">{String(error)}</div>}
          </AlertDescription>
        </Alert>
      )}

      {/* Results Count */}
      {!error && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            {isLoading ? (
              'Loading collections...'
            ) : (
              <>
                {totalCollections > 0 ? (
                  <>
                    Showing {(page - 1) * pageSize + 1}-
                    {Math.min(page * pageSize, totalCollections)} of {totalCollections}{' '}
                    collections
                    {searchQuery && ` for "${searchQuery}"`}
                  </>
                ) : (
                  'No collections found'
                )}
              </>
            )}
          </div>
          {totalPages > 1 && !isLoading && (
            <div className="text-xs">
              Page {page} of {totalPages}
            </div>
          )}
        </div>
      )}

      {/* Collections Grid */}
      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="p-0">
                <Skeleton className="h-48 w-full rounded-t-lg" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              onEdit={handleEditCollection}
              onDelete={handleDeleteCollection}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && collections.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <SlidersHorizontal className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No collections found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Get started by creating your first collection'}
            </p>
            {(searchQuery || statusFilter !== 'all' || typeFilter !== 'all') && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setTypeFilter('all');
                }}
              >
                Clear Filters
              </Button>
            )}
            {!searchQuery && statusFilter === 'all' && typeFilter === 'all' && (
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Collection
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {!isLoading && !error && collections.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPage(pageNum)}
                  className="w-10"
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}

      {/* Create Collection Modal */}
      <CreateCollectionModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSuccess={handleCreateSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!collectionToDelete} onOpenChange={(open) => !open && setCollectionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Collection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{collectionToDelete?.name}"? This will remove all
              products from this collection but will not delete the products themselves. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => collectionToDelete && deleteMutation.mutate(collectionToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
