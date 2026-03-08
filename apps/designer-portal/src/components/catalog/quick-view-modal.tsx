'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';
import { Button, Badge } from '@patina/design-system';
import {
  Heart,
  Plus,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export interface QuickViewModalProps {
  product: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewFull?: (product: any) => void;
  onAddToProject?: (product: any) => void;
  onToggleFavorite?: (product: any) => void;
  isFavorite?: boolean;
}

export function QuickViewModal({
  product,
  open,
  onOpenChange,
  onViewFull,
  onAddToProject,
  onToggleFavorite,
  isFavorite = false,
}: QuickViewModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  if (!product) return null;

  const images = product.images?.length > 0
    ? product.images.map((img: any) => img.url || img)
    : [product.imageUrl || product.coverImage || 'https://via.placeholder.com/600'];

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const imageVariants = {
    enter: (direction: number) => ({
      x: shouldReduceMotion ? 0 : direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: shouldReduceMotion ? 0 : direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  const contentVariants = {
    hidden: {
      opacity: 0,
      y: shouldReduceMotion ? 0 : 20,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.2 },
    },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Quick View: {product.name}</DialogTitle>
        </DialogHeader>

        <motion.div
          variants={contentVariants}
          initial="hidden"
          animate="visible"
          className="grid gap-6 md:grid-cols-2"
        >
          {/* Image Gallery */}
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="relative aspect-square bg-muted rounded-lg overflow-hidden">
              <AnimatePresence initial={false} custom={0}>
                <motion.img
                  key={currentImageIndex}
                  src={images[currentImageIndex]}
                  alt={`${product.name} - Image ${currentImageIndex + 1}`}
                  className="w-full h-full object-cover"
                  custom={0}
                  variants={imageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3 }}
                />
              </AnimatePresence>

              {/* Image Navigation */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 dark:bg-gray-800/90 p-2 rounded-full hover:bg-white dark:hover:bg-gray-700 transition-colors shadow-lg"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 dark:bg-gray-800/90 p-2 rounded-full hover:bg-white dark:hover:bg-gray-700 transition-colors shadow-lg"
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>

                  {/* Image Indicators */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {images.map((_: any, index: number) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`h-2 rounded-full transition-all ${
                          index === currentImageIndex
                            ? 'w-8 bg-white'
                            : 'w-2 bg-white/50'
                        }`}
                        aria-label={`Go to image ${index + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Thumbnail Strip */}
            {images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {images.slice(0, 4).map((image: string, index: number) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      currentImageIndex === index
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <img
                      src={image}
                      alt={`Thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* Product Details */}
          <motion.div variants={itemVariants} className="space-y-4">
            {/* Brand and Title */}
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                {product.brand}
              </p>
              <h2 className="text-2xl font-bold">{product.name}</h2>
            </div>

            {/* Price */}
            <div className="text-3xl font-bold text-primary">
              {formatCurrency(product.price)}
            </div>

            {/* Tags */}
            {product.tags && product.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {product.tags.map((tag: string) => (
                  <Badge key={tag} variant="subtle" color="neutral">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Description */}
            {product.description && (
              <p className="text-muted-foreground leading-relaxed">
                {product.description.length > 200
                  ? `${product.description.slice(0, 200)}...`
                  : product.description}
              </p>
            )}

            {/* Key Features */}
            {product.features && product.features.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Key Features</h3>
                <ul className="space-y-1">
                  {product.features.slice(0, 4).map((feature: string, index: number) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3 pt-4">
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  size="lg"
                  onClick={() => {
                    onAddToProject?.(product);
                    onOpenChange(false);
                  }}
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Add to Project
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className={`h-12 w-12 ${
                    isFavorite ? 'bg-red-500 text-white hover:bg-red-600' : ''
                  }`}
                  onClick={() => onToggleFavorite?.(product)}
                  aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Heart className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`} />
                </Button>
              </div>

              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => {
                  onViewFull?.(product);
                  onOpenChange(false);
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Full Details
              </Button>
            </div>

            {/* Quick Info */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Category</div>
                <div className="text-sm font-medium truncate">
                  {product.category?.name || 'General'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Status</div>
                <div className="text-sm font-medium">
                  {product.status === 'published' ? 'In Stock' : 'Unavailable'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">SKU</div>
                <div className="text-sm font-medium truncate">
                  {product.sku || 'N/A'}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
