'use client';

import { useState } from 'react';
import { Search, X, Plus, GripVertical } from 'lucide-react';
import { Input, Button, Card, CardContent, Badge } from '@patina/design-system';
import type { Collection, Product, CollectionItem } from '@patina/types';
import { formatCurrency } from '@/lib/utils';

interface CollectionProductsFormProps {
  collection: Partial<Collection>;
  onChange: (updates: Partial<Collection>) => void;
  products?: Product[];
  onSearchProducts?: (query: string) => Promise<Product[]>;
}

export function CollectionProductsForm({
  collection,
  onChange,
  products = [],
  onSearchProducts,
}: CollectionProductsFormProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const selectedProductIds = new Set(collection.items?.map((item) => item.productId) || []);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !onSearchProducts) return;

    setIsSearching(true);
    try {
      const results = await onSearchProducts(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Failed to search products:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddProduct = (product: Product) => {
    const items = collection.items || [];
    const newItem: CollectionItem = {
      id: `temp-${Date.now()}`,
      collectionId: collection.id || '',
      productId: product.id,
      product,
      displayOrder: items.length,
      addedAt: new Date(),
    };

    onChange({ items: [...items, newItem] });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleRemoveProduct = (productId: string) => {
    const items = collection.items?.filter((item) => item.productId !== productId) || [];
    // Reorder remaining items
    const reorderedItems = items.map((item, index) => ({
      ...item,
      displayOrder: index,
    }));
    onChange({ items: reorderedItems });
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    const items = [...(collection.items || [])];
    const [movedItem] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, movedItem);

    // Update display order
    const reorderedItems = items.map((item, index) => ({
      ...item,
      displayOrder: index,
    }));
    onChange({ items: reorderedItems });
  };

  const collectionItems = collection.items || [];

  return (
    <div className="space-y-6">
      {/* Search Products */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Add Products</h3>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search products by name, brand, SKU..."
              className="pl-9"
            />
          </div>
          <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
            {isSearching ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            <p className="text-sm text-muted-foreground">{searchResults.length} results found</p>
            {searchResults.map((product) => {
              const isAdded = selectedProductIds.has(product.id);
              return (
                <div
                  key={product.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="h-12 w-12 rounded-md bg-muted flex-shrink-0 overflow-hidden">
                    {product.images?.[0]?.url && (
                      <img
                        src={product.images[0].url}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{product.name}</p>
                    <p className="text-sm text-muted-foreground">{product.brand}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatCurrency(product.price)}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAddProduct(product)}
                    disabled={isAdded}
                  >
                    {isAdded ? (
                      <>
                        <Check className="mr-1 h-3 w-3" />
                        Added
                      </>
                    ) : (
                      <>
                        <Plus className="mr-1 h-3 w-3" />
                        Add
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Products */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Products in Collection</h3>
          <Badge variant="secondary">{collectionItems.length} products</Badge>
        </div>

        {collectionItems.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No products added yet</h3>
              <p className="text-muted-foreground">
                Search and add products to this collection using the search above
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {collectionItems
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map((item, index) => {
                const product = item.product;
                if (!product) return null;

                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors group"
                  >
                    <button
                      type="button"
                      className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Drag to reorder"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                    </button>

                    <div className="h-12 w-12 rounded-md bg-muted flex-shrink-0 overflow-hidden">
                      {product.images?.[0]?.url && (
                        <img
                          src={product.images[0].url}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{product.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm text-muted-foreground">{product.brand}</p>
                        {product.tags?.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="subtle" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(product.price)}</p>
                      <p className="text-xs text-muted-foreground">Position: {index + 1}</p>
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleRemoveProduct(product.id)}
                      title="Remove from collection"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {collectionItems.length > 0 && (
        <div className="text-sm text-muted-foreground">
          <strong>Tip:</strong> Drag products to reorder them. The order here determines how they'll appear in the collection.
        </div>
      )}
    </div>
  );
}

function Check({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
