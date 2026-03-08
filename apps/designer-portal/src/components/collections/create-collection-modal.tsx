'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@patina/design-system';
import { Button } from '@patina/design-system';
import { Input } from '@patina/design-system';
import { Textarea } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { Alert, AlertDescription } from '@patina/design-system';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@patina/design-system';
import { Label } from '@patina/design-system';
import { Package, Zap, Sparkles, AlertCircle } from 'lucide-react';
import { useCreateCollection } from '@/hooks/use-collections';
import type { CollectionType } from '@patina/types';

interface CreateCollectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (collectionId: string) => void;
}

export function CreateCollectionModal({
  open,
  onOpenChange,
  onSuccess,
}: CreateCollectionModalProps) {
  const [type, setType] = useState<CollectionType>('manual');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [featured, setFeatured] = useState(false);

  const createMutation = useCreateCollection();

  const collectionTypes = [
    {
      value: 'manual' as const,
      label: 'Curated Collection',
      description: 'Hand-pick products for this collection',
      icon: Package,
      color: 'blue' as const,
    },
    {
      value: 'rule' as const,
      label: 'Dynamic Collection',
      description: 'Automatically include products based on rules',
      icon: Zap,
      color: 'purple' as const,
    },
    {
      value: 'smart' as const,
      label: 'AI-Powered Collection',
      description: 'Let AI suggest products based on style compatibility',
      icon: Sparkles,
      color: 'green' as const,
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const result = await createMutation.mutateAsync({
        name,
        description: description || undefined,
        type,
        tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        featured,
        status: 'draft',
      });

      // Extract the collection ID from the response
      const collectionId = (result as any)?.data?.id || (result as any)?.id;

      // Reset form
      setName('');
      setDescription('');
      setTags('');
      setFeatured(false);
      setType('manual');

      // Close modal
      onOpenChange(false);

      // Call success callback
      if (onSuccess && collectionId) {
        onSuccess(collectionId);
      }
    } catch (error) {
      console.error('Failed to create collection:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Collection</DialogTitle>
          <DialogDescription>
            Choose a collection type and add details to get started.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Collection Type */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Collection Type</Label>
            <div className="grid gap-3">
              {collectionTypes.map((collectionType) => (
                <button
                  key={collectionType.value}
                  type="button"
                  onClick={() => setType(collectionType.value)}
                  className={`flex items-start gap-4 p-4 rounded-lg border-2 transition-all text-left ${
                    type === collectionType.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div
                    className={`rounded-lg p-2 ${
                      type === collectionType.value ? 'bg-primary/10' : 'bg-muted'
                    }`}
                  >
                    <collectionType.icon
                      className={`h-5 w-5 ${
                        type === collectionType.value ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{collectionType.label}</span>
                      <Badge variant="subtle" color={collectionType.color} className="text-xs">
                        {collectionType.value}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {collectionType.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Basic Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Collection Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Modern Minimalist Living"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this collection and what makes it special..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., modern, minimalist, scandinavian"
              />
              <p className="text-xs text-muted-foreground">
                Add tags to help customers find this collection
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="featured"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="featured" className="font-normal cursor-pointer">
                Mark as featured collection
              </Label>
            </div>
          </div>

          {/* Rule-based info */}
          {type === 'rule' && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                After creating this collection, you'll be able to set up rules to automatically
                include products based on criteria like category, price, brand, or tags.
              </AlertDescription>
            </Alert>
          )}

          {/* Smart collection info */}
          {type === 'smart' && (
            <Alert>
              <Sparkles className="h-4 w-4" />
              <AlertDescription>
                AI-powered collections use machine learning to suggest products based on style
                compatibility and customer preferences. This feature is currently in beta.
              </AlertDescription>
            </Alert>
          )}

          {/* Error Display */}
          {createMutation.isError && (
            <Alert variant="error">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to create collection. Please try again.
                {createMutation.error && (
                  <div className="mt-1 text-xs">{String(createMutation.error)}</div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name || createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Collection'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
