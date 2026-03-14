'use client';

/**
 * ProductCreateDialog Component
 *
 * A modal dialog for creating new products in the admin catalog.
 *
 * Features:
 * - Form validation with react-hook-form and zod
 * - TanStack Query mutation for API integration
 * - Multi-input support for tags, materials, colors, and style tags
 * - Category dropdown with API data
 * - Loading states and error handling
 * - Success toast notifications
 * - Automatic list refresh on success
 *
 * @module components/catalog/product-create-dialog
 */

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, X, Plus } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';
import {
  Button,
  Input,
  Label
} from '@patina/design-system';
import { useCreateAdminProduct } from '@/hooks/admin/use-admin-products';
import { catalogService } from '@/services/admin/catalog';
import type { Category } from '@patina/types';
import type { CreateProductRequest } from '@/types/admin/catalog-service';

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

/**
 * Product creation form validation schema.
 * Ensures all required fields are present and properly formatted.
 */
const createProductSchema = z.object({
  name: z.string()
    .min(1, 'Product name is required')
    .min(3, 'Product name must be at least 3 characters')
    .max(255, 'Product name must be less than 255 characters'),

  brand: z.string()
    .min(1, 'Brand is required')
    .min(2, 'Brand must be at least 2 characters')
    .max(100, 'Brand must be less than 100 characters'),

  shortDescription: z.string()
    .min(1, 'Short description is required')
    .min(10, 'Short description must be at least 10 characters')
    .max(500, 'Short description must be less than 500 characters'),

  price: z.coerce
    .number({ invalid_type_error: 'Price must be a number' })
    .positive('Price must be greater than 0')
    .max(1000000, 'Price must be less than 1,000,000'),

  msrp: z.coerce
    .number({ invalid_type_error: 'MSRP must be a number' })
    .positive('MSRP must be greater than 0')
    .max(1000000, 'MSRP must be less than 1,000,000')
    .optional()
    .nullable()
    .transform(val => val === null ? undefined : val),

  status: z.enum(['draft', 'in_review'], {
    errorMap: () => ({ message: 'Status must be either draft or in_review' })
  }).default('draft'),

  categoryId: z.string()
    .min(1, 'Category is required')
    .uuid('Invalid category ID'),

  tags: z.array(z.string()).default([]),
  materials: z.array(z.string()).default([]),
  colors: z.array(z.string()).default([]),
  styleTags: z.array(z.string()).default([]),
});

type CreateProductFormData = z.infer<typeof createProductSchema>;

// ============================================================================
// COMPONENT PROPS
// ============================================================================

interface ProductCreateDialogProps {
  /** Controls dialog open state */
  open: boolean;
  /** Callback when dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Optional callback after successful product creation */
  onSuccess?: (productId: string) => void;
}

// ============================================================================
// MULTI-INPUT COMPONENT
// ============================================================================

/**
 * Multi-input field for entering multiple values (tags, materials, etc.)
 * Supports keyboard entry (Enter/comma) and removal.
 */
interface MultiInputProps {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
  id?: string;
}

function MultiInput({ label, placeholder, values, onChange, id }: MultiInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Add value on Enter or comma
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault();
      const newValue = inputValue.trim();

      // Avoid duplicates
      if (!values.includes(newValue)) {
        onChange([...values, newValue]);
      }
      setInputValue('');
    }

    // Remove last value on Backspace when input is empty
    if (e.key === 'Backspace' && !inputValue && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  const removeValue = (indexToRemove: number) => {
    onChange(values.filter((_, index) => index !== indexToRemove));
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap gap-2 p-2 border rounded-md min-h-[42px] focus-within:ring-2 focus-within:ring-ring">
        {values.map((value, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-secondary text-secondary-foreground rounded-md"
          >
            {value}
            <button
              type="button"
              onClick={() => removeValue(index)}
              className="hover:bg-secondary-foreground/20 rounded-sm p-0.5"
              aria-label={`Remove ${value}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] outline-none bg-transparent text-sm"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Press Enter or comma to add, Backspace to remove
      </p>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Product creation dialog component.
 * Renders a modal form for creating new products with validation and API integration.
 */
export function ProductCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: ProductCreateDialogProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  // React Hook Form setup with zod validation
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
  } = useForm<CreateProductFormData>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      name: '',
      brand: '',
      shortDescription: '',
      price: 0,
      msrp: undefined,
      status: 'draft',
      categoryId: '',
      tags: [],
      materials: [],
      colors: [],
      styleTags: [],
    },
  });

  // Watch array fields for multi-input components
  const tags = watch('tags');
  const materials = watch('materials');
  const colors = watch('colors');
  const styleTags = watch('styleTags');

  // TanStack Query mutation for creating products
  const createProductMutation = useCreateAdminProduct();

  /**
   * Load categories when dialog opens.
   * Categories are required for the category dropdown.
   */
  useEffect(() => {
    if (open && categories.length === 0) {
      loadCategories();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadCategories = async () => {
    setIsLoadingCategories(true);
    try {
      const response = await catalogService.getCategories();
      if (response.data) {
        setCategories(response.data);
      }
    } catch (error) {
      toast.error('Failed to load categories', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsLoadingCategories(false);
    }
  };

  /**
   * Form submission handler.
   * Transforms form data and sends to API via mutation.
   */
  const onSubmit = async (data: CreateProductFormData) => {
    try {
      // Transform form data to API request format
      const productData: CreateProductRequest = {
        name: data.name,
        brand: data.brand,
        category: 'sofa', // Will be overridden by categoryId lookup
        categoryId: data.categoryId,
        shortDescription: data.shortDescription,
        price: data.price,
        currency: 'USD',
        status: data.status,
        tags: data.tags.length > 0 ? data.tags : undefined,
        materials: data.materials.length > 0 ? data.materials : undefined,
        colors: data.colors.length > 0 ? data.colors : undefined,
        styleTags: data.styleTags.length > 0 ? data.styleTags : undefined,
      } as any;

      // Execute mutation
      const result = await createProductMutation.mutateAsync(productData as any);

      // Success handling
      toast.success('Product created successfully', {
        description: `${data.name} has been added to the catalog`,
      });

      // Extract product ID from response
      const productId = result?.data?.id;

      // Reset form and close dialog
      reset();
      onOpenChange(false);

      // Call success callback if provided
      if (onSuccess && productId) {
        onSuccess(productId);
      }
    } catch (error) {
      // Error handling - mutation already handles query invalidation
      toast.error('Failed to create product', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }
  };

  /**
   * Handle dialog close.
   * Resets form when dialog is closed.
   */
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !isSubmitting) {
      reset();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Product</DialogTitle>
          <DialogDescription>
            Add a new product to the catalog. All fields marked with an asterisk (*) are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Information Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Basic Information</h3>

            {/* Product Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Product Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                {...register('name')}
                placeholder="e.g., Modern Sectional Sofa"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'name-error' : undefined}
              />
              {errors.name && (
                <p id="name-error" className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* Brand */}
            <div className="space-y-2">
              <Label htmlFor="brand">
                Brand <span className="text-destructive">*</span>
              </Label>
              <Input
                id="brand"
                {...register('brand')}
                placeholder="e.g., Herman Miller"
                aria-invalid={!!errors.brand}
                aria-describedby={errors.brand ? 'brand-error' : undefined}
              />
              {errors.brand && (
                <p id="brand-error" className="text-sm text-destructive">
                  {errors.brand.message}
                </p>
              )}
            </div>

            {/* Short Description */}
            <div className="space-y-2">
              <Label htmlFor="shortDescription">
                Short Description <span className="text-destructive">*</span>
              </Label>
              <textarea
                id="shortDescription"
                {...register('shortDescription')}
                rows={3}
                placeholder="Brief description of the product..."
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                aria-invalid={!!errors.shortDescription}
                aria-describedby={errors.shortDescription ? 'description-error' : undefined}
              />
              {errors.shortDescription && (
                <p id="description-error" className="text-sm text-destructive">
                  {errors.shortDescription.message}
                </p>
              )}
            </div>
          </div>

          {/* Pricing Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Pricing</h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Price */}
              <div className="space-y-2">
                <Label htmlFor="price">
                  Price (USD) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('price')}
                  placeholder="0.00"
                  aria-invalid={!!errors.price}
                  aria-describedby={errors.price ? 'price-error' : undefined}
                />
                {errors.price && (
                  <p id="price-error" className="text-sm text-destructive">
                    {errors.price.message}
                  </p>
                )}
              </div>

              {/* MSRP */}
              <div className="space-y-2">
                <Label htmlFor="msrp">MSRP (USD)</Label>
                <Input
                  id="msrp"
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('msrp')}
                  placeholder="0.00"
                  aria-invalid={!!errors.msrp}
                  aria-describedby={errors.msrp ? 'msrp-error' : undefined}
                />
                {errors.msrp && (
                  <p id="msrp-error" className="text-sm text-destructive">
                    {errors.msrp.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Categorization Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Categorization</h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Category */}
              <div className="space-y-2">
                <Label htmlFor="categoryId">
                  Category <span className="text-destructive">*</span>
                </Label>
                <select
                  id="categoryId"
                  {...register('categoryId')}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-invalid={!!errors.categoryId}
                  aria-describedby={errors.categoryId ? 'category-error' : undefined}
                  disabled={isLoadingCategories}
                >
                  <option value="">Select a category...</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {errors.categoryId && (
                  <p id="category-error" className="text-sm text-destructive">
                    {errors.categoryId.message}
                  </p>
                )}
                {isLoadingCategories && (
                  <p className="text-xs text-muted-foreground">Loading categories...</p>
                )}
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label htmlFor="status">
                  Status <span className="text-destructive">*</span>
                </Label>
                <select
                  id="status"
                  {...register('status')}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-invalid={!!errors.status}
                  aria-describedby={errors.status ? 'status-error' : undefined}
                >
                  <option value="draft">Draft</option>
                  <option value="in_review">In Review</option>
                </select>
                {errors.status && (
                  <p id="status-error" className="text-sm text-destructive">
                    {errors.status.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Product Attributes Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Product Attributes</h3>

            {/* Tags */}
            <MultiInput
              id="tags"
              label="Tags"
              placeholder="Add tags..."
              values={tags}
              onChange={(values) => setValue('tags', values)}
            />

            {/* Materials */}
            <MultiInput
              id="materials"
              label="Materials"
              placeholder="e.g., Leather, Oak, Steel..."
              values={materials}
              onChange={(values) => setValue('materials', values)}
            />

            {/* Colors */}
            <MultiInput
              id="colors"
              label="Colors"
              placeholder="e.g., Navy, Charcoal, Walnut..."
              values={colors}
              onChange={(values) => setValue('colors', values)}
            />

            {/* Style Tags */}
            <MultiInput
              id="styleTags"
              label="Style Tags"
              placeholder="e.g., Modern, Scandinavian, Industrial..."
              values={styleTags}
              onChange={(values) => setValue('styleTags', values)}
            />
          </div>

          {/* Form Actions */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || createProductMutation.isPending}
            >
              {isSubmitting || createProductMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Product
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
