'use client';

import { useState } from 'react';
import { Search, Plus, Layers } from 'lucide-react';
import { Button, Input, Card, CardContent, Badge } from '@patina/design-system';

type CollectionType = 'manual' | 'rule' | 'smart';
type CollectionStatus = 'draft' | 'published' | 'scheduled';

interface Collection {
  id: string;
  name: string;
  description: string;
  type: CollectionType;
  status: CollectionStatus;
  productCount: number;
  imageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Mock data - replace with actual API call
const mockCollections: Collection[] = [
  {
    id: '1',
    name: 'Modern Living Room',
    description: 'Contemporary furniture for modern living spaces',
    type: 'manual',
    status: 'published',
    productCount: 24,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '2',
    name: 'Outdoor Essentials',
    description: 'Curated collection of outdoor furniture',
    type: 'rule',
    status: 'published',
    productCount: 18,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

export default function CollectionsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CollectionStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | CollectionType>('all');

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Collections</h2>
          <p className="text-muted-foreground">
            Organize products into curated collections
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Collection
        </Button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search collections..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              {statusOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={statusFilter === option.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(option.value as typeof statusFilter)}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <div className="flex gap-2">
              {typeOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={typeFilter === option.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTypeFilter(option.value as typeof typeFilter)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Collections Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {mockCollections.map((collection) => (
          <Card key={collection.id} className="overflow-hidden hover:shadow-lg transition-shadow">
            <div className="aspect-video bg-muted flex items-center justify-center">
              {collection.imageUrl ? (
                <img
                  src={collection.imageUrl}
                  alt={collection.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Layers className="h-12 w-12 text-muted-foreground" />
              )}
            </div>
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-lg">{collection.name}</h3>
                  <Badge
                    variant="solid"
                    color={collection.status === 'published' ? 'success' : 'neutral'}
                  >
                    {collection.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {collection.description}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{collection.productCount} products</span>
                  <Badge variant="outline" className="text-xs">
                    {collection.type === 'manual' ? 'Curated' : collection.type === 'rule' ? 'Dynamic' : 'AI-Powered'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {mockCollections.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Layers className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No collections found</h3>
            <p className="text-muted-foreground mb-4">
              Get started by creating your first collection
            </p>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Collection
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
