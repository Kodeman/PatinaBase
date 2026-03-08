'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Heart, Plus, Eye, Share2, TrendingUp } from 'lucide-react';
import { Button, Card, CardContent, Badge } from '@patina/design-system';
import { formatCurrency } from '@/lib/utils';
import { useSwipeGesture } from '@/hooks/use-swipe-gesture';
import type { Product } from '@patina/types';

export interface ProductCardAnimatedProps {
  product: any;
  index: number;
  viewMode: 'grid' | 'list';
  onView: (product: any) => void;
  onQuickView?: (product: any) => void;
  onToggleFavorite?: (product: any) => void;
  onToggleCompare?: (product: any) => void;
  isFavorite?: boolean;
  isComparing?: boolean;
  onAddToProject?: (product: any) => void;
}

export function ProductCardAnimated({
  product,
  index,
  viewMode,
  onView,
  onQuickView,
  onToggleFavorite,
  onToggleCompare,
  isFavorite = false,
  isComparing = false,
  onAddToProject,
}: ProductCardAnimatedProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isHovered, setIsHovered] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  // Swipe gesture for mobile
  const swipeRef = useSwipeGesture({
    enabled: viewMode === 'grid',
    onSwipeLeft: () => {
      setSwipeDirection('left');
      onToggleFavorite?.(product);
      setTimeout(() => setSwipeDirection(null), 300);
    },
    onSwipeRight: () => {
      setSwipeDirection('right');
      onToggleCompare?.(product);
      setTimeout(() => setSwipeDirection(null), 300);
    },
  });

  // Animation variants
  const cardVariants = {
    hidden: {
      opacity: 0,
      y: shouldReduceMotion ? 0 : 20,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
        ease: 'easeOut',
        delay: shouldReduceMotion ? 0 : Math.min(index * 0.05, 0.75),
      },
    },
    hover: shouldReduceMotion ? {} : {
      y: -4,
      transition: {
        duration: 0.2,
        ease: 'easeOut',
      },
    },
    swipeLeft: {
      x: -100,
      opacity: 0.5,
      transition: { duration: 0.3 },
    },
    swipeRight: {
      x: 100,
      opacity: 0.5,
      transition: { duration: 0.3 },
    },
  };

  const imageVariants = {
    initial: { scale: 1 },
    hover: shouldReduceMotion ? {} : {
      scale: 1.05,
      transition: { duration: 0.3 },
    },
  };

  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.2 },
    },
  };

  const actionButtonVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.2,
      },
    }),
  };

  return (
    <motion.div
      ref={swipeRef as any}
      variants={cardVariants}
      initial="hidden"
      animate={swipeDirection ? `swipe${swipeDirection === 'left' ? 'Left' : 'Right'}` : 'visible'}
      whileHover="hover"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      data-keyboard-nav-item
      tabIndex={0}
      className="outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onView(product);
        }
      }}
    >
      <Card
        className={`group overflow-hidden transition-colors cursor-pointer h-full ${
          isComparing ? 'border-primary border-2' : 'hover:border-primary'
        }`}
        onClick={() => onView(product)}
      >
        {viewMode === 'grid' ? (
          <CardContent className="p-0 flex flex-col h-full">
            {/* Image Container */}
            <div className="relative aspect-square overflow-hidden bg-muted">
              <motion.img
                src={product.imageUrl || product.coverImage || 'https://via.placeholder.com/400'}
                alt={product.name}
                className="h-full w-full object-cover"
                variants={imageVariants}
                initial="initial"
                animate={isHovered ? 'hover' : 'initial'}
                loading="lazy"
              />

              {/* Hover Overlay */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"
                variants={overlayVariants}
                initial="hidden"
                animate={isHovered ? 'visible' : 'hidden'}
              />

              {/* Top Right Actions */}
              <div className="absolute right-2 top-2 flex flex-col gap-2">
                <motion.div
                  initial={{ scale: 1 }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    size="icon"
                    variant="secondary"
                    className={`h-9 w-9 rounded-full shadow-md ${
                      isFavorite ? 'bg-red-500 text-white hover:bg-red-600' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite?.(product);
                    }}
                    aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                  </Button>
                </motion.div>

                {isComparing && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  >
                    <Badge variant="solid" className="rounded-full px-2 py-1 text-xs">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Comparing
                    </Badge>
                  </motion.div>
                )}
              </div>

              {/* Bottom Action Buttons (Desktop) */}
              {isHovered && (
                <motion.div
                  className="absolute bottom-3 left-3 right-3 hidden sm:flex gap-2"
                  variants={overlayVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <motion.div
                    custom={0}
                    variants={actionButtonVariants}
                    className="flex-1"
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full backdrop-blur-sm bg-white/90 hover:bg-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickView?.(product);
                      }}
                      aria-label="Quick view product"
                    >
                      <Eye className="mr-1 h-3 w-3" />
                      Quick View
                    </Button>
                  </motion.div>
                  <motion.div custom={1} variants={actionButtonVariants}>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="backdrop-blur-sm bg-white/90 hover:bg-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleCompare?.(product);
                      }}
                      aria-label={isComparing ? 'Remove from comparison' : 'Add to comparison'}
                    >
                      <Share2 className="h-3 w-3" />
                    </Button>
                  </motion.div>
                </motion.div>
              )}

              {/* Mobile Swipe Indicator */}
              {swipeDirection && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center bg-black/50 sm:hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="text-white text-lg font-semibold">
                    {swipeDirection === 'left' ? '❤️ Favorited' : '📊 Comparing'}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Details */}
            <div className="p-4 space-y-2 flex-1 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate group-hover:text-primary transition-colors text-base">
                    {product.name}
                  </h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {product.brand}
                  </p>
                </div>
              </div>

              {product.tags && product.tags.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
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
                  {product.tags.length > 2 && (
                    <span className="text-xs text-muted-foreground">
                      +{product.tags.length - 2}
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t mt-auto">
                <span className="text-lg font-bold text-primary">
                  {formatCurrency(product.price)}
                </span>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddToProject?.(product);
                  }}
                  className="min-h-[44px] sm:min-h-0"
                  aria-label="Add to project"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        ) : (
          // List View (Horizontal on mobile)
          <CardContent className="p-4">
            <div className="flex gap-4">
              <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                <motion.img
                  src={product.imageUrl || product.coverImage || 'https://via.placeholder.com/200'}
                  alt={product.name}
                  className="h-full w-full object-cover"
                  variants={imageVariants}
                  initial="initial"
                  animate={isHovered ? 'hover' : 'initial'}
                  loading="lazy"
                />
              </div>
              <div className="flex flex-1 flex-col justify-between min-w-0">
                <div>
                  <h3 className="font-semibold truncate">{product.name}</h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {product.brand}
                  </p>
                </div>
                {product.tags && product.tags.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {product.tags.slice(0, 3).map((tag: string) => (
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
              </div>
              <div className="flex flex-col items-end justify-between">
                <span className="text-lg font-bold text-primary">
                  {formatCurrency(product.price)}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    className={`min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 ${
                      isFavorite ? 'bg-red-500 text-white hover:bg-red-600' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite?.(product);
                    }}
                    aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                  </Button>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToProject?.(product);
                    }}
                    className="min-h-[44px] sm:min-h-0"
                    aria-label="Add to project"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </motion.div>
  );
}
