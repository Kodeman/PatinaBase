'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { SearchX, Package, Filter, Sparkles } from 'lucide-react';
import { Button, Card, CardContent } from '@patina/design-system';

export interface EmptyStateProps {
  type?: 'no-results' | 'no-products' | 'filtered' | 'error';
  searchQuery?: string;
  hasFilters?: boolean;
  onClearFilters?: () => void;
  onClearSearch?: () => void;
}

export function EmptyState({
  type = 'no-results',
  searchQuery,
  hasFilters = false,
  onClearFilters,
  onClearSearch,
}: EmptyStateProps) {
  const shouldReduceMotion = useReducedMotion();

  const containerVariants = {
    hidden: { opacity: 0, scale: shouldReduceMotion ? 1 : 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.3,
        ease: 'easeOut',
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  };

  const iconVariants = {
    initial: { rotate: 0 },
    animate: shouldReduceMotion ? {} : {
      rotate: [0, -5, 5, -5, 0],
      transition: {
        duration: 0.6,
        ease: 'easeInOut',
        repeat: Infinity,
        repeatDelay: 3,
      },
    },
  };

  const getEmptyStateContent = () => {
    switch (type) {
      case 'no-results':
        return {
          icon: SearchX,
          title: 'No products found',
          description: searchQuery
            ? `We couldn't find any products matching "${searchQuery}"`
            : 'Try adjusting your search or filters to find what you\'re looking for',
          suggestions: [
            'Check your spelling',
            'Try more general keywords',
            'Remove some filters',
          ],
        };

      case 'filtered':
        return {
          icon: Filter,
          title: 'No matches for these filters',
          description: 'Try adjusting your filter criteria to see more products',
          suggestions: [
            'Expand your price range',
            'Select fewer categories',
            'Choose different style tags',
          ],
        };

      case 'no-products':
        return {
          icon: Package,
          title: 'No products available',
          description: 'The catalog is currently empty. Check back soon for new products!',
          suggestions: [],
        };

      case 'error':
        return {
          icon: SearchX,
          title: 'Unable to load products',
          description: 'There was an error loading the catalog. Please try again.',
          suggestions: [
            'Check your internet connection',
            'Refresh the page',
            'Contact support if the issue persists',
          ],
        };

      default:
        return {
          icon: SearchX,
          title: 'No products found',
          description: 'We couldn\'t find any products',
          suggestions: [],
        };
    }
  };

  const content = getEmptyStateContent();
  const Icon = content.icon;

  return (
    <Card>
      <CardContent className="p-12">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="text-center max-w-md mx-auto"
        >
          {/* Icon */}
          <motion.div
            variants={itemVariants}
            className="mb-6 flex justify-center"
          >
            <motion.div
              variants={iconVariants}
              initial="initial"
              animate="animate"
              className="relative"
            >
              <div className="relative">
                <Icon className="h-20 w-20 text-muted-foreground/40" strokeWidth={1.5} />
                {type === 'no-products' && (
                  <motion.div
                    className="absolute -top-2 -right-2"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                  >
                    <Sparkles className="h-6 w-6 text-yellow-500" />
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>

          {/* Title */}
          <motion.h3
            variants={itemVariants}
            className="text-xl font-semibold mb-2"
          >
            {content.title}
          </motion.h3>

          {/* Description */}
          <motion.p
            variants={itemVariants}
            className="text-muted-foreground mb-6"
          >
            {content.description}
          </motion.p>

          {/* Suggestions */}
          {content.suggestions.length > 0 && (
            <motion.div variants={itemVariants} className="mb-6">
              <p className="text-sm font-medium mb-3">Suggestions:</p>
              <ul className="text-sm text-muted-foreground space-y-2">
                {content.suggestions.map((suggestion, index) => (
                  <motion.li
                    key={index}
                    variants={itemVariants}
                    className="flex items-center justify-center gap-2"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {suggestion}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          )}

          {/* Actions */}
          <motion.div
            variants={itemVariants}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            {searchQuery && onClearSearch && (
              <Button
                variant="outline"
                onClick={onClearSearch}
              >
                Clear Search
              </Button>
            )}
            {hasFilters && onClearFilters && (
              <Button
                variant={searchQuery ? 'outline' : 'default'}
                onClick={onClearFilters}
              >
                Clear All Filters
              </Button>
            )}
            {!searchQuery && !hasFilters && (
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Refresh Page
              </Button>
            )}
          </motion.div>
        </motion.div>
      </CardContent>
    </Card>
  );
}
