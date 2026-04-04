'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@patina/design-system';
import { Button } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@patina/design-system';
import {
  Heart,
  Share2,
  ExternalLink,
  Ruler,
  Package,
  Star,
  Plus,
  Minus,
  ShoppingBag,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ProductGallery, MediaBadges, ARViewButton, ThreeDViewButton } from '@/components/media';
import { SimilarProductsCompact } from './similar-products';

interface ProductDetailModalProps {
  product: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToProposal?: (product: any, quantity: number, variant?: string) => void;
  onViewProduct?: (product: any) => void;
}

export function ProductDetailModal({
  product,
  open,
  onOpenChange,
  onAddToProposal,
  onViewProduct,
}: ProductDetailModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState('');
  const [quantity, setQuantity] = useState(1);

  if (!product) return null;

  // Get all images: media assets or fallback to imageUrl
  const productImages = product.media?.filter((asset: any) => asset.type === 'image')
    .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
    .map((asset: any) => asset.cdnUrl || asset.uri) ||
    (product.imageUrl ? [product.imageUrl] : []);

  const images = productImages.length > 0 ? productImages : [product.imageUrl, product.imageUrl, product.imageUrl];

  const variants = product.variants || [
    { id: '1', name: 'Grey Velvet', stock: 12 },
    { id: '2', name: 'Blue Velvet', stock: 8 },
    { id: '3', name: 'Green Velvet', stock: 5 },
  ];

  const specifications = product.specifications || [
    { label: 'Dimensions', value: '84" W x 36" D x 32" H' },
    { label: 'Seat Height', value: '18"' },
    { label: 'Weight', value: '185 lbs' },
    { label: 'Material', value: 'Velvet, Hardwood Frame' },
    { label: 'Assembly', value: 'Required (30-45 min)' },
  ];

  const reviews = [
    {
      id: '1',
      author: 'Emily S.',
      rating: 5,
      date: '2 weeks ago',
      comment: 'Absolutely love this sofa! The quality is exceptional and it looks beautiful in my living room.',
    },
    {
      id: '2',
      author: 'Michael R.',
      rating: 4,
      date: '1 month ago',
      comment: 'Great sofa, very comfortable. Assembly was straightforward.',
    },
  ];

  const relatedProducts = [
    {
      id: 'r1',
      name: 'Matching Ottoman',
      price: 49900,
      image: 'https://via.placeholder.com/200',
    },
    {
      id: 'r2',
      name: 'Throw Pillows Set',
      price: 12900,
      image: 'https://via.placeholder.com/200',
    },
  ];

  const handleAddToProposal = () => {
    onAddToProposal?.(product, quantity, selectedVariant);
    onOpenChange(false);
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Image Gallery */}
          <div>
            <ProductGallery
              images={images}
              productName={product.name}
              enableZoom={true}
              enableLightbox={true}
            />
            {/* Advanced Media Buttons */}
            <div className="mt-4 space-y-2">
              {product.arSupported && (
                <ARViewButton
                  onClick={() => {
                    // TODO: Implement AR view
                    console.log('Opening AR view...');
                  }}
                  className="w-full"
                />
              )}
              {product.has3D && (
                <ThreeDViewButton
                  onClick={() => {
                    // TODO: Implement 3D model viewer
                    console.log('Opening 3D model...');
                  }}
                  className="w-full"
                />
              )}
            </div>
          </div>

          {/* Product Details */}
          <div>
            <div className="mb-6">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    {product.brand}
                  </p>
                  <h2 className="text-2xl font-bold">{product.name}</h2>
                </div>
                <div className="flex gap-2">
                  {product.sourceUrl && (
                    <Button variant="ghost" size="icon" asChild>
                      <a
                        href={product.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="View original product page"
                      >
                        <ExternalLink className="h-5 w-5" />
                      </a>
                    </Button>
                  )}
                  <Button variant="ghost" size="icon">
                    <Heart className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="icon">
                    <Share2 className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-4 w-4 ${
                        star <= 4 ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  4.5 (124 reviews)
                </span>
              </div>

              <div className="text-3xl font-bold text-purple-600 mb-4">
                {formatCurrency(product.price)}
              </div>

              {product.tags && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {product.tags.map((tag: string) => (
                    <Badge key={tag} variant="subtle" color="neutral">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              <p className="text-gray-700 dark:text-gray-300 mb-6">
                {product.description ||
                  'Beautiful and comfortable sofa crafted with premium materials. Perfect for modern living spaces.'}
              </p>
            </div>

            {/* Variant Selection */}
            {variants.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-medium mb-3">Select Variant</p>
                <div className="grid grid-cols-3 gap-2">
                  {variants.map((variant: any) => (
                    <button
                      key={variant.id}
                      onClick={() => setSelectedVariant(variant.id)}
                      className={`p-3 border-2 rounded-lg text-sm transition-all ${
                        selectedVariant === variant.id
                          ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-medium">{variant.name}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {variant.stock} in stock
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="mb-6">
              <p className="text-sm font-medium mb-3">Quantity</p>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-16 text-center font-semibold text-lg">{quantity}</span>
                <Button variant="outline" size="icon" onClick={() => setQuantity(quantity + 1)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="grid gap-3 mb-6">
              <Button size="lg" onClick={handleAddToProposal}>
                <ShoppingBag className="h-5 w-5 mr-2" />
                Add to Proposal
              </Button>
              <Button variant="outline" size="lg">
                <Heart className="h-5 w-5 mr-2" />
                Add to Favorites
              </Button>
            </div>

            {/* Quick Info */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-center">
                <Package className="h-6 w-6 mx-auto mb-1 text-gray-600 dark:text-gray-400" />
                <p className="text-xs text-gray-600 dark:text-gray-400">Free Shipping</p>
              </div>
              <div className="text-center">
                <Ruler className="h-6 w-6 mx-auto mb-1 text-gray-600 dark:text-gray-400" />
                <p className="text-xs text-gray-600 dark:text-gray-400">Easy Assembly</p>
              </div>
              <div className="text-center">
                <Star className="h-6 w-6 mx-auto mb-1 text-gray-600 dark:text-gray-400" />
                <p className="text-xs text-gray-600 dark:text-gray-400">1 Year Warranty</p>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Info Tabs */}
        <Tabs defaultValue="specs" className="mt-6">
          <TabsList className="w-full">
            <TabsTrigger value="specs" className="flex-1">
              Specifications
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex-1">
              Reviews
            </TabsTrigger>
            <TabsTrigger value="related" className="flex-1">
              Related Items
            </TabsTrigger>
          </TabsList>

          <TabsContent value="specs" className="mt-4">
            <div className="space-y-3">
              {specifications.map((spec: any, index: number) => (
                <div
                  key={index}
                  className="flex justify-between py-2 border-b last:border-b-0"
                >
                  <span className="text-gray-600 dark:text-gray-400">{spec.label}</span>
                  <span className="font-medium">{spec.value}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="reviews" className="mt-4">
            <div className="space-y-4">
              {reviews.map((review) => (
                <div key={review.id} className="border-b pb-4 last:border-b-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{review.author}</p>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-3 w-3 ${
                              star <= review.rating
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'text-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {review.date}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{review.comment}</p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="related" className="mt-4">
            <SimilarProductsCompact
              productId={product.id}
              onViewProduct={(similarProduct) => {
                onViewProduct?.(similarProduct);
                onOpenChange(false);
              }}
              limit={6}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
