'use client';

import { useState } from 'react';
import { Search, Plus, Layers, Trash2, Edit, Eye, Zap, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAdminCollections,
  useCreateAdminCollection,
  useDeleteAdminCollection,
  usePublishAdminCollection,
  useEvaluateAdminCollection,
  type AdminCollectionFilters,
} from '@/hooks/use-admin-collections';
import Link from 'next/link';
import { PageHeader, Section, FilterTabs } from '@/components/portal';

type CollectionType = 'manual' | 'rule' | 'smart';
type CollectionStatus = 'draft' | 'published' | 'scheduled';

export default function CollectionsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CollectionStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | CollectionType>('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state for create modal
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState<CollectionType>('manual');

  const filters: AdminCollectionFilters = {
    ...(searchQuery ? { q: searchQuery } : {}),
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(typeFilter !== 'all' ? { type: typeFilter } : {}),
  };

  const {
    collections,
    isLoading,
    isEmpty,
    totalCollections,
  } = useAdminCollections(filters);

  const createMutation = useCreateAdminCollection();
  const deleteMutation = useDeleteAdminCollection();
  const publishMutation = usePublishAdminCollection();
  const evaluateMutation = useEvaluateAdminCollection();

  const statusOptions = [
    { value: 'all', label: 'All Status' },
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

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createMutation.mutateAsync({
      name: newName,
      description: newDescription,
      type: newType,
    } as any);
    setCreateModalOpen(false);
    setNewName('');
    setNewDescription('');
    setNewType('manual');
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteMutation.mutateAsync(deleteId);
    setDeleteId(null);
  };

  const typeLabel = (type: CollectionType) => {
    switch (type) {
      case 'manual': return 'Curated';
      case 'rule': return 'Dynamic';
      case 'smart': return 'AI-Powered';
    }
  };

  return (
    <div>
      <PageHeader
        title="Collections"
        description={`Organize products into curated collections${totalCollections > 0 ? ` · ${totalCollections} total` : ''}.`}
        actions={
          <Button onClick={() => setCreateModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Collection
          </Button>
        }
      />

      <Section className="mt-10">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              placeholder="Search collections..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <FilterTabs
            items={statusOptions}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as typeof statusFilter)}
            className="border-b-0"
          />

          <FilterTabs
            items={typeOptions}
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as typeof typeFilter)}
            className="border-b-0"
          />
        </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden animate-pulse">
              <div className="aspect-video bg-muted" />
              <CardContent className="p-4 space-y-2">
                <div className="h-5 bg-muted rounded w-2/3" />
                <div className="h-4 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Collections Grid */}
      {!isLoading && collections.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <Card key={collection.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className="aspect-video bg-muted flex items-center justify-center relative">
                {collection.coverImage ? (
                  <img
                    src={collection.coverImage}
                    alt={collection.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Layers className="h-12 w-12 text-muted-foreground" />
                )}
                {collection.featured && (
                  <Badge className="absolute top-2 left-2" variant="default">
                    Featured
                  </Badge>
                )}
              </div>
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-lg line-clamp-1">{collection.name}</h3>
                    <div className="flex items-center gap-1">
                      <Badge variant={collection.status === 'published' ? 'default' : 'secondary'}>
                        {collection.status}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/catalog/collections/${collection.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          {collection.status === 'draft' && (
                            <DropdownMenuItem onClick={() => publishMutation.mutate(collection.id)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Publish
                            </DropdownMenuItem>
                          )}
                          {collection.type === 'rule' && (
                            <DropdownMenuItem onClick={() => evaluateMutation.mutate(collection.id)}>
                              <Zap className="mr-2 h-4 w-4" />
                              Evaluate Rules
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteId(collection.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {collection.description || 'No description'}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{collection.productCount} products</span>
                    <Badge variant="outline" className="text-xs">
                      {typeLabel(collection.type)}
                    </Badge>
                  </div>
                  {collection.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {collection.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {collection.tags.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{collection.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && isEmpty && (
        <div className="py-12 text-center">
          <Layers className="mx-auto mb-4 h-8 w-8 text-[var(--text-muted)]" />
          <p className="type-body italic text-[var(--text-muted)] max-w-md mx-auto">
            {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
              ? 'No collections match your filters. Try adjusting your search.'
              : 'No collections yet. Create your first collection to get started.'}
          </p>
          <Button className="mt-4" onClick={() => setCreateModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Collection
          </Button>
        </div>
      )}
      </Section>

      {/* Create Collection Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Collection</DialogTitle>
            <DialogDescription>
              Create a new collection to organize products.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Collection name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v as CollectionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Curated (Manual)</SelectItem>
                  <SelectItem value="rule">Dynamic (Rule-based)</SelectItem>
                  <SelectItem value="smart">AI-Powered (Smart)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Collection</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this collection? This action cannot be undone.
              All products will be removed from the collection but not deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
