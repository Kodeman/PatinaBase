'use client';

import * as React from 'react';
import { Input, Label, Textarea, Select, Badge } from '@patina/design-system';
import type { Product, ProductCategory, ProductStatus } from '@patina/types';

interface DetailsTabProps {
  product?: Product;
  onChange: (updates: Partial<Product>) => void;
}

const PRODUCT_CATEGORIES: { value: ProductCategory; label: string }[] = [
  { value: 'sofa', label: 'Sofa' },
  { value: 'chair', label: 'Chair' },
  { value: 'table', label: 'Table' },
  { value: 'bed', label: 'Bed' },
  { value: 'storage', label: 'Storage' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'decor', label: 'Decor' },
  { value: 'outdoor', label: 'Outdoor' },
];

const PRODUCT_STATUSES: { value: ProductStatus; label: string; variant?: 'default' | 'secondary' | 'destructive' | 'success' }[] = [
  { value: 'draft', label: 'Draft', variant: 'secondary' },
  { value: 'in_review', label: 'In Review', variant: 'default' },
  { value: 'published', label: 'Published', variant: 'success' },
  { value: 'deprecated', label: 'Deprecated', variant: 'destructive' },
];

export function DetailsTab({ product, onChange }: DetailsTabProps) {
  const [tags, setTags] = React.useState<string[]>(product?.tags || []);
  const [tagInput, setTagInput] = React.useState('');
  const [styleTags, setStyleTags] = React.useState<string[]>(product?.styleTags || []);
  const [styleTagInput, setStyleTagInput] = React.useState('');

  const handleInputChange = (field: keyof Product) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    onChange({ [field]: e.target.value });
  };

  const handleSelectChange = (field: keyof Product) => (value: string) => {
    onChange({ [field]: value });
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTags = [...tags, tagInput.trim()];
      setTags(newTags);
      onChange({ tags: newTags });
      setTagInput('');
    }
  };

  const handleRemoveTag = (index: number) => {
    const newTags = tags.filter((_, i) => i !== index);
    setTags(newTags);
    onChange({ tags: newTags });
  };

  const handleAddStyleTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && styleTagInput.trim()) {
      e.preventDefault();
      const newStyleTags = [...styleTags, styleTagInput.trim()];
      setStyleTags(newStyleTags);
      onChange({ styleTags: newStyleTags });
      setStyleTagInput('');
    }
  };

  const handleRemoveStyleTag = (index: number) => {
    const newStyleTags = styleTags.filter((_, i) => i !== index);
    setStyleTags(newStyleTags);
    onChange({ styleTags: newStyleTags });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold mb-1">Product Details</h3>
        <p className="text-sm text-muted-foreground">
          Basic information about the product, including name, brand, and description.
        </p>
      </div>

      {/* Basic Information */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="product-name">Product Name*</Label>
            <Input
              id="product-name"
              placeholder="e.g., Modern Velvet Sofa"
              value={product?.name || ''}
              onChange={handleInputChange('name')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-brand">Brand*</Label>
            <Input
              id="product-brand"
              placeholder="e.g., West Elm"
              value={product?.brand || ''}
              onChange={handleInputChange('brand')}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="product-sku">SKU / Product ID</Label>
            <Input
              id="product-sku"
              placeholder="Auto-generated"
              value={product?.id || ''}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Automatically generated on save
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-external-id">External ID</Label>
            <Input
              id="product-external-id"
              placeholder="e.g., VENDOR-12345"
              value={product?.externalId || ''}
              onChange={handleInputChange('externalId')}
            />
            <p className="text-xs text-muted-foreground">
              Optional vendor or manufacturer ID
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="product-short-description">Short Description*</Label>
          <Textarea
            id="product-short-description"
            placeholder="Brief description for product listings (max 200 characters)"
            value={product?.shortDescription || ''}
            onChange={handleInputChange('shortDescription')}
            rows={3}
            maxLength={200}
            required
          />
          <p className="text-xs text-muted-foreground">
            {product?.shortDescription?.length || 0}/200 characters
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="product-long-description">Long Description</Label>
          <Textarea
            id="product-long-description"
            placeholder="Detailed product description with features, materials, and care instructions"
            value={product?.longDescription || ''}
            onChange={handleInputChange('longDescription')}
            rows={6}
          />
        </div>
      </div>

      {/* Categorization */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div>
          <h4 className="text-base font-semibold mb-3">Categorization</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="product-category">Category*</Label>
            <Select
              value={product?.category}
              onValueChange={handleSelectChange('category')}
              placeholder="Select a category"
              options={PRODUCT_CATEGORIES}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-status">Status*</Label>
            <Select
              value={product?.status}
              onValueChange={handleSelectChange('status')}
              placeholder="Select a status"
              options={PRODUCT_STATUSES}
            />
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label htmlFor="product-tags">Product Tags</Label>
          <Input
            id="product-tags"
            placeholder="Type a tag and press Enter"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleAddTag}
          />
          <p className="text-xs text-muted-foreground">
            Add searchable keywords (e.g., "sustainable", "handmade", "modern")
          </p>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {tags.map((tag, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => handleRemoveTag(index)}
                >
                  {tag}
                  <span className="ml-1 text-xs">×</span>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Style Tags */}
        <div className="space-y-2">
          <Label htmlFor="product-style-tags">Style Tags</Label>
          <Input
            id="product-style-tags"
            placeholder="Type a style tag and press Enter"
            value={styleTagInput}
            onChange={(e) => setStyleTagInput(e.target.value)}
            onKeyDown={handleAddStyleTag}
          />
          <p className="text-xs text-muted-foreground">
            Add style descriptors (e.g., "mid-century", "minimalist", "bohemian")
          </p>
          {styleTags.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {styleTags.map((tag, index) => (
                <Badge
                  key={index}
                  variant="default"
                  className="cursor-pointer"
                  onClick={() => handleRemoveStyleTag(index)}
                >
                  {tag}
                  <span className="ml-1 text-xs">×</span>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Publishing Information */}
      {product?.publishedAt && (
        <div className="pt-4 border-t border-border">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <h4 className="text-sm font-semibold">Publishing Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Published:</span>{' '}
                <span className="font-medium">
                  {new Date(product.publishedAt).toLocaleDateString()}
                </span>
              </div>
              {product.version && (
                <div>
                  <span className="text-muted-foreground">Version:</span>{' '}
                  <span className="font-medium">{product.version}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
