'use client';

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, TrendingUp, Plus, ChevronRight } from 'lucide-react';
import { Button, Badge, Card, CardContent } from '@patina/design-system';
import { formatCurrency } from '@/lib/utils';

export interface ProductComparisonProps {
  products: any[];
  onRemove: (productId: string) => void;
  onClear: () => void;
  onViewProduct: (product: any) => void;
  onAddToProject?: (product: any) => void;
  maxProducts?: number;
}

export function ProductComparison({
  products,
  onRemove,
  onClear,
  onViewProduct,
  onAddToProject,
  maxProducts = 3,
}: ProductComparisonProps) {
  const shouldReduceMotion = useReducedMotion();

  if (products.length === 0) return null;

  const containerVariants = {
    hidden: {
      y: shouldReduceMotion ? 0 : 100,
      opacity: 0,
    },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 30,
      },
    },
    exit: {
      y: shouldReduceMotion ? 0 : 100,
      opacity: 0,
      transition: {
        duration: 0.2,
      },
    },
  };

  const productVariants = {
    hidden: {
      scale: shouldReduceMotion ? 1 : 0.8,
      opacity: 0,
    },
    visible: {
      scale: 1,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 400,
        damping: 25,
      },
    },
    exit: {
      scale: shouldReduceMotion ? 1 : 0.8,
      opacity: 0,
      x: shouldReduceMotion ? 0 : -100,
      transition: {
        duration: 0.2,
      },
    },
  };

  return (
    <AnimatePresence>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background shadow-2xl"
      >
        <div className="container mx-auto px-4 py-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">
                Comparing Products
                <span className="text-sm text-muted-foreground ml-2">
                  ({products.length}/{maxProducts})
                </span>
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
              >
                Clear All
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClear}
                aria-label="Close comparison"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {products.map((product) => (
                <motion.div
                  key={product.id}
                  variants={productVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  layout
                >
                  <Card className="relative overflow-hidden group">
                    <CardContent className="p-4">
                      {/* Remove Button */}
                      <button
                        onClick={() => onRemove(product.id)}
                        className="absolute top-2 right-2 z-10 bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        aria-label={`Remove ${product.name} from comparison`}
                      >
                        <X className="h-3 w-3" />
                      </button>

                      {/* Product Image */}
                      <div className="relative aspect-square bg-muted rounded-lg overflow-hidden mb-3">
                        <img
                          src={product.imageUrl || product.coverImage || 'https://via.placeholder.com/300'}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>

                      {/* Product Info */}
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs text-muted-foreground truncate">
                            {product.brand}
                          </p>
                          <h4 className="font-semibold truncate">
                            {product.name}
                          </h4>
                        </div>

                        <div className="text-lg font-bold text-primary">
                          {formatCurrency(product.price)}
                        </div>

                        {/* Tags */}
                        {product.tags && product.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {product.tags.slice(0, 2).map((tag: string) => (
                              <Badge
                                key={tag}
                                variant="subtle"
                                color="neutral"
                                className="text-xs"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Quick Comparison Points */}
                        <div className="space-y-1 text-xs text-muted-foreground pt-2 border-t">
                          <div className="flex justify-between">
                            <span>Category:</span>
                            <span className="font-medium text-foreground">
                              {product.category?.name || 'General'}
                            </span>
                          </div>
                          {product.dimensions && (
                            <div className="flex justify-between">
                              <span>Size:</span>
                              <span className="font-medium text-foreground">
                                {product.dimensions}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Status:</span>
                            <span className="font-medium text-foreground">
                              {product.status === 'published' ? 'In Stock' : 'Unavailable'}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => onViewProduct(product)}
                          >
                            View
                            <ChevronRight className="h-3 w-3 ml-1" />
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => onAddToProject?.(product)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}

              {/* Empty Slots */}
              {Array.from({ length: maxProducts - products.length }).map((_, index) => (
                <motion.div
                  key={`empty-${index}`}
                  variants={productVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  layout
                >
                  <Card className="h-full border-dashed">
                    <CardContent className="p-4 h-full flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <Plus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">
                          Add product to compare
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Help Text */}
          {products.length < maxProducts && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-muted-foreground text-center mt-3"
            >
              Select up to {maxProducts} products to compare their features and prices
            </motion.p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
