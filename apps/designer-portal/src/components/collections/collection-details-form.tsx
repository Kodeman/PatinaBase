'use client';

import { Label, Input, Textarea, Badge } from '@patina/design-system';
import type { Collection, CollectionType } from '@patina/types';
import { Package, Zap, Sparkles } from 'lucide-react';

interface CollectionDetailsFormProps {
  collection: Partial<Collection>;
  onChange: (updates: Partial<Collection>) => void;
  errors?: Record<string, string>;
}

export function CollectionDetailsForm({ collection, onChange, errors }: CollectionDetailsFormProps) {
  const collectionTypes: Array<{
    value: CollectionType;
    label: string;
    description: string;
    icon: React.ComponentType<any>;
    color: 'blue' | 'purple' | 'green';
  }> = [
    {
      value: 'manual',
      label: 'Manual Collection',
      description: 'Curate products manually',
      icon: Package,
      color: 'blue',
    },
    {
      value: 'rule',
      label: 'Dynamic Collection',
      description: 'Auto-include products by rules',
      icon: Zap,
      color: 'purple',
    },
    {
      value: 'smart',
      label: 'Smart Collection',
      description: 'AI-powered recommendations',
      icon: Sparkles,
      color: 'green',
    },
  ];

  const statuses = [
    { value: 'draft', label: 'Draft' },
    { value: 'published', label: 'Published' },
    { value: 'scheduled', label: 'Scheduled' },
  ];

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    onChange({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    });
  };

  return (
    <div className="space-y-6">
      {/* Collection Type */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Collection Type</Label>
        <div className="grid gap-3">
          {collectionTypes.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => onChange({ type: type.value })}
              className={`flex items-start gap-4 p-4 rounded-lg border-2 transition-all text-left ${
                collection.type === type.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div
                className={`rounded-lg p-2 ${
                  collection.type === type.value ? 'bg-primary/10' : 'bg-muted'
                }`}
              >
                <type.icon
                  className={`h-5 w-5 ${
                    collection.type === type.value ? 'text-primary' : 'text-muted-foreground'
                  }`}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{type.label}</span>
                  <Badge variant="subtle" color={type.color} className="text-xs">
                    {type.value}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{type.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Basic Info */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">
            Collection Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            value={collection.name || ''}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g., Modern Minimalist Living"
            className={errors?.name ? 'border-destructive' : ''}
          />
          {errors?.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">
            Slug <span className="text-destructive">*</span>
          </Label>
          <Input
            id="slug"
            value={collection.slug || ''}
            onChange={(e) => onChange({ slug: e.target.value })}
            placeholder="modern-minimalist-living"
            className={errors?.slug ? 'border-destructive' : ''}
          />
          <p className="text-xs text-muted-foreground">
            URL-friendly identifier (lowercase, hyphens only)
          </p>
          {errors?.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={collection.description || ''}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Describe this collection and what makes it special..."
            rows={4}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              value={collection.status || 'draft'}
              onChange={(e) => onChange({ status: e.target.value as any })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayOrder">Display Order</Label>
            <Input
              id="displayOrder"
              type="number"
              value={collection.displayOrder || 0}
              onChange={(e) => onChange({ displayOrder: parseInt(e.target.value) || 0 })}
              placeholder="0"
              min="0"
            />
            <p className="text-xs text-muted-foreground">Lower numbers appear first</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tags">Tags (comma-separated)</Label>
          <Input
            id="tags"
            value={collection.tags?.join(', ') || ''}
            onChange={(e) =>
              onChange({
                tags: e.target.value
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
            placeholder="e.g., modern, minimalist, scandinavian"
          />
          <p className="text-xs text-muted-foreground">
            Add tags to help customers find this collection
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="heroImage">Hero Image URL</Label>
          <Input
            id="heroImage"
            type="url"
            value={collection.heroImage || ''}
            onChange={(e) => onChange({ heroImage: e.target.value })}
            placeholder="https://..."
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="featured"
            checked={collection.featured || false}
            onChange={(e) => onChange({ featured: e.target.checked })}
            className="rounded border-gray-300"
          />
          <Label htmlFor="featured" className="font-normal cursor-pointer">
            Mark as featured collection
          </Label>
        </div>
      </div>

      {/* SEO Section */}
      <div className="space-y-4 pt-4 border-t">
        <h3 className="text-lg font-semibold">SEO</h3>

        <div className="space-y-2">
          <Label htmlFor="seoTitle">SEO Title</Label>
          <Input
            id="seoTitle"
            value={collection.seoTitle || ''}
            onChange={(e) => onChange({ seoTitle: e.target.value })}
            placeholder={`${collection.name || 'Collection'} - Shop High-Quality Furniture`}
            maxLength={60}
          />
          <p className="text-xs text-muted-foreground">
            {collection.seoTitle?.length || 0}/60 characters (recommended: 50-60)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="seoDescription">SEO Description</Label>
          <Textarea
            id="seoDescription"
            value={collection.seoDescription || ''}
            onChange={(e) => onChange({ seoDescription: e.target.value })}
            placeholder="Describe this collection for search engines..."
            rows={3}
            maxLength={160}
          />
          <p className="text-xs text-muted-foreground">
            {collection.seoDescription?.length || 0}/160 characters (recommended: 120-160)
          </p>
        </div>
      </div>
    </div>
  );
}
