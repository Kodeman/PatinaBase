'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  Save,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

// Hooks and services
import {
  useProduct,
  useUpdateProduct,
  useDeleteProduct,
  usePublishProduct,
  useUnpublishProduct,
} from '@/hooks/use-admin-products';

// UI components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { VariantEditor } from '@/components/catalog/variant-editor';
import { ErrorBoundary } from '@/components/error-boundary';

// Types
import type { Product, ProductStatus } from '@patina/types';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const productDetailsSchema = z.object({
  name: z.string().min(1, 'Product name is required').max(200, 'Name too long'),
  brand: z.string().min(1, 'Brand is required').max(100, 'Brand too long'),
  shortDescription: z.string().min(10, 'Short description must be at least 10 characters').max(500, 'Short description too long'),
  longDescription: z.string().optional(),
  price: z.number().min(0, 'Price must be positive'),
  msrp: z.number().min(0, 'MSRP must be positive').optional(),
  salePrice: z.number().min(0, 'Sale price must be positive').optional(),
  currency: z.string().default('USD'),
  status: z.enum(['draft', 'in_review', 'published', 'deprecated']),
});

const productSeoSchema = z.object({
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  seoTitle: z.string().max(60, 'SEO title should be under 60 characters').optional(),
  seoDescription: z.string().max(160, 'SEO description should be under 160 characters').optional(),
  seoKeywords: z.array(z.string()).optional(),
});

type ProductDetailsFormData = z.infer<typeof productDetailsSchema>;
type ProductSeoFormData = z.infer<typeof productSeoSchema>;

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ProductEditPageClientProps {
  productId: string;
}

export function ProductEditPageClient({ productId }: ProductEditPageClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('details');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Fetch product data
  const { product, isLoading, error, refetch } = useProduct(productId);

  // Mutations
  const updateProductMutation = useUpdateProduct();
  const deleteProductMutation = useDeleteProduct();
  const publishProductMutation = usePublishProduct();
  const unpublishProductMutation = useUnpublishProduct();

  // Form setup for Details tab
  const detailsForm = useForm<ProductDetailsFormData>({
    resolver: zodResolver(productDetailsSchema),
    defaultValues: {
      name: '',
      brand: '',
      shortDescription: '',
      longDescription: '',
      price: 0,
      msrp: 0,
      salePrice: 0,
      currency: 'USD',
      status: 'draft',
    },
  });

  // Form setup for SEO tab
  const seoForm = useForm<ProductSeoFormData>({
    resolver: zodResolver(productSeoSchema),
    defaultValues: {
      slug: '',
      seoTitle: '',
      seoDescription: '',
      seoKeywords: [],
    },
  });

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Populate forms when product data loads
  useEffect(() => {
    if (product) {
      detailsForm.reset({
        name: product.name || '',
        brand: product.brand || '',
        shortDescription: product.shortDescription || '',
        longDescription: product.longDescription || '',
        price: product.price || 0,
        msrp: product.msrp || 0,
        salePrice: product.salePrice || 0,
        currency: product.currency || 'USD',
        status: product.status || 'draft',
      });

      seoForm.reset({
        slug: product.slug || '',
        seoTitle: product.seoTitle || '',
        seoDescription: product.seoDescription || '',
        seoKeywords: product.seoKeywords || [],
      });
    }
  }, [product, detailsForm, seoForm]);

  // Track form changes for unsaved changes warning
  useEffect(() => {
    const detailsSubscription = detailsForm.watch(() => {
      setHasUnsavedChanges(true);
    });
    const seoSubscription = seoForm.watch(() => {
      setHasUnsavedChanges(true);
    });

    return () => {
      detailsSubscription.unsubscribe();
      seoSubscription.unsubscribe();
    };
  }, [detailsForm, seoForm]);

  // Navigation warning for unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSave = useCallback(async () => {
    const detailsValid = await detailsForm.trigger();
    const seoValid = await seoForm.trigger();

    if (!detailsValid || !seoValid) {
      toast({
        title: 'Validation Error',
        description: 'Please fix the errors before saving.',
        variant: 'destructive',
      });
      return;
    }

    const detailsData = detailsForm.getValues();
    const seoData = seoForm.getValues();

    try {
      await updateProductMutation.mutateAsync({
        productId,
        data: {
          ...detailsData,
          ...seoData,
        },
      });

      setHasUnsavedChanges(false);
      setLastSaved(new Date());

      toast({
        title: 'Product saved',
        description: 'Your changes have been saved successfully.',
      });
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Failed to save product',
        variant: 'destructive',
      });
    }
  }, [detailsForm, seoForm, updateProductMutation, productId, toast]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteProductMutation.mutateAsync(productId);

      toast({
        title: 'Product deleted',
        description: 'The product has been deleted successfully.',
      });

      router.push('/catalog');
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete product',
        variant: 'destructive',
      });
    }
  }, [deleteProductMutation, productId, router, toast]);

  const handlePublishToggle = useCallback(async () => {
    const isPublished = product?.status === 'published';

    try {
      if (isPublished) {
        await unpublishProductMutation.mutateAsync(productId);
        toast({
          title: 'Product unpublished',
          description: 'The product is now hidden from customers.',
        });
      } else {
        await publishProductMutation.mutateAsync({ productId });
        toast({
          title: 'Product published',
          description: 'The product is now visible to customers.',
        });
      }

      refetch();
    } catch (error) {
      toast({
        title: 'Action failed',
        description: error instanceof Error ? error.message : 'Failed to update publish status',
        variant: 'destructive',
      });
    }
  }, [product, publishProductMutation, unpublishProductMutation, productId, refetch, toast]);

  // ============================================================================
  // RENDER STATES
  // ============================================================================

  if (isLoading) {
    return <ProductEditSkeleton />;
  }

  if (error || !product) {
    const errorMessage = error instanceof Error ? error.message : '';
    const isAuthError = errorMessage.includes('Unauthorized') || errorMessage.includes('401');
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-2xl font-semibold">
          {isAuthError ? 'Access denied' : 'Product not found'}
        </h2>
        <p className="text-muted-foreground">
          {isAuthError
            ? 'You do not have permission to edit this product.'
            : errorMessage || 'The product you are looking for does not exist.'}
        </p>
        <Button asChild>
          <Link href="/catalog">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Catalog
          </Link>
        </Button>
      </div>
    );
  }

  const isPublished = product.status === 'published';

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="flex flex-col h-full">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center justify-between px-6 py-4">
          {/* Left: Back button and title */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/catalog">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">{product.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground">{product.brand}</span>
                {hasUnsavedChanges && (
                  <span className="text-xs text-orange-600 font-medium">Unsaved changes</span>
                )}
                {isAutoSaving && (
                  <span className="text-xs text-blue-600 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving...
                  </span>
                )}
                {lastSaved && !hasUnsavedChanges && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Saved {lastSaved.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handlePublishToggle}
              disabled={publishProductMutation.isPending || unpublishProductMutation.isPending}
            >
              {isPublished ? (
                <>
                  <EyeOff className="mr-2 h-4 w-4" />
                  Unpublish
                </>
              ) : (
                <>
                  <Eye className="mr-2 h-4 w-4" />
                  Publish
                </>
              )}
            </Button>

            <Button
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={deleteProductMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>

            <Button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || updateProductMutation.isPending}
            >
              {updateProductMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content with Tabs */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="variants">Variants</TabsTrigger>
              <TabsTrigger value="media">Media</TabsTrigger>
              <TabsTrigger value="seo">SEO</TabsTrigger>
            </TabsList>

            {/* Details Tab */}
            <TabsContent value="details">
              <DetailsTab form={detailsForm} />
            </TabsContent>

            {/* Variants Tab */}
            <TabsContent value="variants">
              <ErrorBoundary
                fallback={
                  <div className="flex flex-col items-center justify-center py-12 gap-4 border-2 border-dashed rounded-lg">
                    <AlertCircle className="h-12 w-12 text-destructive" />
                    <p className="text-muted-foreground">Failed to load variant editor</p>
                    <Button onClick={() => window.location.reload()} variant="outline">
                      Reload Page
                    </Button>
                  </div>
                }
              >
                <VariantEditor productId={productId} />
              </ErrorBoundary>
            </TabsContent>

            {/* Media Tab */}
            <TabsContent value="media">
              <MediaTab productId={productId} images={product.images || []} />
            </TabsContent>

            {/* SEO Tab */}
            <TabsContent value="seo">
              <SeoTab form={seoForm} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{product.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowDeleteDialog(false);
                handleDelete();
              }}
              disabled={deleteProductMutation.isPending}
            >
              {deleteProductMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Product'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// TAB COMPONENTS
// ============================================================================

/**
 * Details Tab - Basic product information
 */
function DetailsTab({ form }: { form: ReturnType<typeof useForm<ProductDetailsFormData>> }) {
  const { register, formState: { errors }, watch } = form;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Product Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Product Name *</Label>
          <Input
            id="name"
            {...register('name')}
            placeholder="e.g., Modern Walnut Dining Table"
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        {/* Brand */}
        <div className="space-y-2">
          <Label htmlFor="brand">Brand *</Label>
          <Input
            id="brand"
            {...register('brand')}
            placeholder="e.g., Herman Miller"
          />
          {errors.brand && (
            <p className="text-sm text-destructive">{errors.brand.message}</p>
          )}
        </div>
      </div>

      {/* Short Description */}
      <div className="space-y-2">
        <Label htmlFor="shortDescription">Short Description *</Label>
        <textarea
          id="shortDescription"
          {...register('shortDescription')}
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Brief description for catalog listings..."
        />
        {errors.shortDescription && (
          <p className="text-sm text-destructive">{errors.shortDescription.message}</p>
        )}
      </div>

      {/* Long Description */}
      <div className="space-y-2">
        <Label htmlFor="longDescription">Long Description</Label>
        <textarea
          id="longDescription"
          {...register('longDescription')}
          rows={8}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Detailed product description with features, materials, care instructions..."
        />
      </div>

      {/* Pricing */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Pricing</h3>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="price">Price *</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              {...register('price', { valueAsNumber: true })}
              placeholder="0.00"
            />
            {errors.price && (
              <p className="text-sm text-destructive">{errors.price.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="msrp">MSRP</Label>
            <Input
              id="msrp"
              type="number"
              step="0.01"
              {...register('msrp', { valueAsNumber: true })}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="salePrice">Sale Price</Label>
            <Input
              id="salePrice"
              type="number"
              step="0.01"
              {...register('salePrice', { valueAsNumber: true })}
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <select
          id="status"
          {...register('status')}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="draft">Draft</option>
          <option value="in_review">In Review</option>
          <option value="published">Published</option>
          <option value="deprecated">Deprecated</option>
        </select>
      </div>
    </div>
  );
}


/**
 * Media Tab - Image and video management
 */
function MediaTab({ productId, images }: { productId: string; images: any[] }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Product Media</h3>
          <p className="text-sm text-muted-foreground">
            Upload and manage product images, videos, and 3D models.
          </p>
        </div>
        <Button>Upload Media</Button>
      </div>

      {images.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">No media files yet</p>
          <Button variant="outline">Upload First Image</Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {images.map((image, index) => (
            <div key={image.id} className="relative aspect-square border rounded-lg overflow-hidden group">
              <img
                src={image.url}
                alt={image.alt || `Product image ${index + 1}`}
                className="object-cover w-full h-full"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button size="sm" variant="secondary">Edit</Button>
                <Button size="sm" variant="destructive">Delete</Button>
              </div>
              {image.isPrimary && (
                <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                  Primary
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * SEO Tab - Search engine optimization
 */
function SeoTab({ form }: { form: ReturnType<typeof useForm<ProductSeoFormData>> }) {
  const { register, formState: { errors }, watch } = form;

  const seoTitle = watch('seoTitle') || '';
  const seoDescription = watch('seoDescription') || '';

  return (
    <div className="space-y-6">
      {/* Slug */}
      <div className="space-y-2">
        <Label htmlFor="slug">URL Slug *</Label>
        <Input
          id="slug"
          {...register('slug')}
          placeholder="modern-walnut-dining-table"
        />
        {errors.slug && (
          <p className="text-sm text-destructive">{errors.slug.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Must be lowercase alphanumeric with hyphens only
        </p>
      </div>

      {/* SEO Title */}
      <div className="space-y-2">
        <Label htmlFor="seoTitle">SEO Title</Label>
        <Input
          id="seoTitle"
          {...register('seoTitle')}
          placeholder="Modern Walnut Dining Table | Brand Name"
          maxLength={60}
        />
        <div className="flex justify-between text-xs">
          {errors.seoTitle ? (
            <p className="text-destructive">{errors.seoTitle.message}</p>
          ) : (
            <p className="text-muted-foreground">Recommended: 50-60 characters</p>
          )}
          <p className={seoTitle.length > 60 ? 'text-destructive' : 'text-muted-foreground'}>
            {seoTitle.length}/60
          </p>
        </div>
      </div>

      {/* SEO Description */}
      <div className="space-y-2">
        <Label htmlFor="seoDescription">SEO Description</Label>
        <textarea
          id="seoDescription"
          {...register('seoDescription')}
          rows={4}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Handcrafted modern dining table made from sustainably sourced walnut..."
          maxLength={160}
        />
        <div className="flex justify-between text-xs">
          {errors.seoDescription ? (
            <p className="text-destructive">{errors.seoDescription.message}</p>
          ) : (
            <p className="text-muted-foreground">Recommended: 120-160 characters</p>
          )}
          <p className={seoDescription.length > 160 ? 'text-destructive' : 'text-muted-foreground'}>
            {seoDescription.length}/160
          </p>
        </div>
      </div>

      {/* SEO Preview */}
      <div className="space-y-2">
        <Label>Search Engine Preview</Label>
        <div className="border rounded-lg p-4 bg-muted/50">
          <p className="text-blue-600 text-lg font-medium">
            {seoTitle || 'Product Title - Brand Name'}
          </p>
          <p className="text-sm text-green-700">
            https://patina.com/products/{watch('slug') || 'product-slug'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {seoDescription || 'Product description will appear here...'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

export function ProductEditSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div>
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-32 mt-2" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="h-10 w-full max-w-md mb-6" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}
