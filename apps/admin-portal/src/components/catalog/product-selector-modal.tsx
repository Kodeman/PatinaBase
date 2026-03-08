'use client';

import { useState, useMemo } from 'react';
import { Search, Check, Package } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Product } from '@patina/types';
import { cn } from '@/lib/utils';

interface ProductSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProducts: Product[];
  onProductsChange: (products: Product[]) => void;
  products?: Product[];
  isLoading?: boolean;
  onSearch?: (query: string) => void;
}

export function ProductSelectorModal({
  open,
  onOpenChange,
  selectedProducts,
  onProductsChange,
  products = [],
  isLoading = false,
  onSearch,
}: ProductSelectorModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [localSelected, setLocalSelected] = useState<Set<string>>(
    new Set(selectedProducts.map((p) => p.id))
  );

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (onSearch) {
      onSearch(value);
    }
  };

  const toggleProduct = (product: Product) => {
    const newSelected = new Set(localSelected);
    if (newSelected.has(product.id)) {
      newSelected.delete(product.id);
    } else {
      newSelected.add(product.id);
    }
    setLocalSelected(newSelected);
  };

  const handleConfirm = () => {
    const selectedProductsList = products.filter((p) => localSelected.has(p.id));
    onProductsChange(selectedProductsList);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setLocalSelected(new Set(selectedProducts.map((p) => p.id)));
    onOpenChange(false);
  };

  const filteredProducts = useMemo(() => {
    if (!searchQuery) return products;
    const query = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(query) ||
        p.brand?.toLowerCase().includes(query) ||
        p.tags?.some((tag) => tag.toLowerCase().includes(query))
    );
  }, [products, searchQuery]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Products</DialogTitle>
          <DialogDescription>
            Search and select products to add to this collection
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        {/* Selected Count */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {localSelected.size} product{localSelected.size !== 1 ? 's' : ''} selected
          </span>
          {localSelected.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocalSelected(new Set())}
            >
              Clear selection
            </Button>
          )}
        </div>

        {/* Products Grid */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6).keys()].map((i) => (
                <Card key={i}>
                  <CardContent className="p-0">
                    <Skeleton className="h-48 w-full rounded-t-lg" />
                    <div className="p-3 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No products found</h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? 'Try adjusting your search query'
                  : 'No products available'}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((product) => {
                const isSelected = localSelected.has(product.id);
                const primaryImage = product.images?.find((img) => img.isPrimary);

                return (
                  <Card
                    key={product.id}
                    className={cn(
                      'cursor-pointer transition-all hover:shadow-md',
                      isSelected && 'ring-2 ring-primary'
                    )}
                    onClick={() => toggleProduct(product)}
                  >
                    <CardContent className="p-0">
                      <div className="relative aspect-square bg-muted">
                        {primaryImage?.url ? (
                          <img
                            src={primaryImage.url}
                            alt={product.name || 'Product'}
                            className="w-full h-full object-cover rounded-t-lg"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <Package className="h-12 w-12 text-muted-foreground" />
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1.5">
                            <Check className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="p-3 space-y-1">
                        <h4 className="font-medium text-sm line-clamp-1">
                          {product.name || 'Unnamed Product'}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {product.brand || 'No brand'}
                        </p>
                        {product.price && (
                          <p className="text-sm font-semibold">
                            ${product.price.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Add {localSelected.size} Product{localSelected.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
