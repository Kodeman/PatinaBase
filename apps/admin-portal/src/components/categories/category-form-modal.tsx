'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, FolderTree } from 'lucide-react';
import type { Category } from '@patina/types';

interface CategoryFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category;
  categories?: Category[];
  onSave: (category: Partial<Category>) => Promise<void>;
}

export function CategoryFormModal({
  open,
  onOpenChange,
  category,
  categories = [],
  onSave,
}: CategoryFormModalProps) {
  const [formData, setFormData] = useState<Partial<Category>>({
    name: '',
    slug: '',
    description: '',
    parentId: undefined,
    order: 0,
    isActive: true,
    image: '',
    seoTitle: '',
    seoDescription: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when category changes or modal opens
  useEffect(() => {
    if (open) {
      if (category) {
        setFormData({
          name: category.name,
          slug: category.slug,
          description: category.description || '',
          parentId: category.parentId,
          order: category.order,
          isActive: category.isActive,
          image: category.image || '',
          seoTitle: category.seoTitle || '',
          seoDescription: category.seoDescription || '',
        });
      } else {
        setFormData({
          name: '',
          slug: '',
          description: '',
          parentId: undefined,
          order: 0,
          isActive: true,
          image: '',
          seoTitle: '',
          seoDescription: '',
        });
      }
      setError(null);
    }
  }, [open, category]);

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      // Only auto-generate slug if it's a new category and slug hasn't been manually edited
      slug: !category && !prev.slug?.includes('-custom-')
        ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        : prev.slug,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name?.trim()) {
      setError('Category name is required');
      return;
    }

    if (!formData.slug?.trim()) {
      setError('Category slug is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const dataToSave: Partial<Category> = {
        ...formData,
        id: category?.id,
      };

      await onSave(dataToSave);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save category');
    } finally {
      setIsSaving(false);
    }
  };

  // Get available parent categories (exclude current category and its children)
  const availableParentCategories = categories.filter((cat) => {
    if (category && cat.id === category.id) return false; // Can't be parent of itself
    if (category && cat.parentId === category.id) return false; // Can't select its own children
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{category ? 'Edit Category' : 'Create New Category'}</DialogTitle>
          <DialogDescription>
            {category ? 'Update the category details below.' : 'Add a new category to organize your products.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="seo">SEO</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Category Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g., Sofas, Dining Tables"
                  required
                />
              </div>

              {/* Slug */}
              <div className="space-y-2">
                <Label htmlFor="slug">
                  Slug <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="e.g., sofas, dining-tables"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  URL-friendly identifier (lowercase, hyphens only)
                </p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe this category..."
                  rows={3}
                />
              </div>

              {/* Parent Category */}
              <div className="space-y-2">
                <Label htmlFor="parentId">Parent Category</Label>
                <select
                  id="parentId"
                  value={formData.parentId || ''}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value || undefined })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">None (Top Level)</option>
                  {availableParentCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.path || cat.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Select a parent to create a subcategory
                </p>
              </div>

              {/* Order */}
              <div className="space-y-2">
                <Label htmlFor="order">Display Order</Label>
                <Input
                  id="order"
                  type="number"
                  value={formData.order}
                  onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                  min="0"
                />
                <p className="text-xs text-muted-foreground">
                  Lower numbers appear first
                </p>
              </div>

              {/* Image URL */}
              <div className="space-y-2">
                <Label htmlFor="image">Image URL</Label>
                <Input
                  id="image"
                  type="url"
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              {/* Is Active */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked as boolean })}
                />
                <Label htmlFor="isActive" className="font-normal cursor-pointer">
                  Active (visible to users)
                </Label>
              </div>
            </TabsContent>

            <TabsContent value="seo" className="space-y-4">
              {/* SEO Title */}
              <div className="space-y-2">
                <Label htmlFor="seoTitle">SEO Title</Label>
                <Input
                  id="seoTitle"
                  value={formData.seoTitle}
                  onChange={(e) => setFormData({ ...formData, seoTitle: e.target.value })}
                  placeholder={`${formData.name || 'Category'} - Shop High-Quality Furniture`}
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.seoTitle?.length || 0}/60 characters (recommended: 50-60)
                </p>
              </div>

              {/* SEO Description */}
              <div className="space-y-2">
                <Label htmlFor="seoDescription">SEO Description</Label>
                <Textarea
                  id="seoDescription"
                  value={formData.seoDescription}
                  onChange={(e) => setFormData({ ...formData, seoDescription: e.target.value })}
                  placeholder="Describe this category for search engines..."
                  rows={3}
                  maxLength={160}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.seoDescription?.length || 0}/160 characters (recommended: 120-160)
                </p>
              </div>

              <Alert>
                <FolderTree className="h-4 w-4" />
                <AlertDescription>
                  SEO optimization helps customers find this category through search engines.
                  Include relevant keywords naturally in your title and description.
                </AlertDescription>
              </Alert>
            </TabsContent>
          </Tabs>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !formData.name?.trim() || !formData.slug?.trim()}>
              {isSaving ? 'Saving...' : category ? 'Update Category' : 'Create Category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
