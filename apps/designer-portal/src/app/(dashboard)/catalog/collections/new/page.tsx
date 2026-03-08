'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { ChevronLeft, Save, X, AlertCircle } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, Alert, AlertDescription, Tabs, TabsList, TabsTrigger, TabsContent, toast } from '@patina/design-system';
import { CollectionDetailsForm } from '@/components/collections/collection-details-form';
import { CollectionProductsForm } from '@/components/collections/collection-products-form';
import { CollectionRulesForm } from '@/components/collections/collection-rules-form';
import { canCreateProducts } from '@/lib/permissions';
import type { Collection, UserRole } from '@patina/types';
import { catalogApi } from '@/lib/api-client';

const tabConfig = [
  { id: 'details', label: 'Details' },
  { id: 'content', label: 'Content' },
];

export default function NewCollectionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('details');
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [collectionData, setCollectionData] = useState<Partial<Collection>>({
    name: '',
    slug: '',
    type: 'manual',
    description: '',
    status: 'draft',
    featured: false,
    displayOrder: 0,
    tags: [],
    items: [],
    rule: undefined,
  });

  // Check permissions
  const sessionRoles = user?.roles ?? [];
  const userRole =
    (sessionRoles[0] as UserRole | undefined) ?? (user as any)?.role;
  const canCreate = canCreateProducts(userRole);
  const isDesigner = sessionRoles.includes('designer') || (user as any)?.role === 'designer';

  if (!canCreate) {
    router.push('/catalog/collections');
    return null;
  }

  // Handle collection data changes
  const handleCollectionChange = (updates: Partial<Collection>) => {
    setCollectionData((prev) => ({ ...prev, ...updates }));
    // Clear errors for updated fields
    const updatedFields = Object.keys(updates);
    setErrors((prev) => {
      const newErrors = { ...prev };
      updatedFields.forEach((field) => delete newErrors[field]);
      return newErrors;
    });
  };

  // Validate form
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!collectionData.name?.trim()) {
      newErrors.name = 'Collection name is required';
    }

    if (!collectionData.slug?.trim()) {
      newErrors.slug = 'Slug is required';
    }

    if (!collectionData.type) {
      newErrors.type = 'Collection type is required';
    }

    // Validate content based on type
    if (collectionData.type === 'manual' && (!collectionData.items || collectionData.items.length === 0)) {
      toast({
        title: 'No products added',
        description: 'Please add at least one product to this manual collection',
        variant: 'destructive',
      });
      setActiveTab('content');
      return false;
    }

    if (collectionData.type === 'rule' && (!collectionData.rule?.conditions || collectionData.rule.conditions.length === 0)) {
      toast({
        title: 'No rules defined',
        description: 'Please add at least one rule for this dynamic collection',
        variant: 'destructive',
      });
      setActiveTab('content');
      return false;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle save
  const handleSave = async () => {
    if (!validate()) {
      setActiveTab('details');
      return;
    }

    setIsSaving(true);
    try {
      // Create the collection
      const response = await catalogApi.createCollection(collectionData as Collection);

      toast({
        title: 'Collection created',
        description: 'The collection has been successfully created.',
      });

      router.push('/catalog/collections');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create the collection. Please try again.',
        variant: 'destructive',
      });
      console.error('Failed to create collection:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    router.push('/catalog/collections');
  };

  // Handle search products for manual collections
  const handleSearchProducts = async (query: string) => {
    try {
      const response = await catalogApi.searchProducts({ q: query, pageSize: 20 });
      return response.data.products || [];
    } catch (error) {
      console.error('Failed to search products:', error);
      return [];
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb and Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/catalog/collections')}
              className="h-auto p-0 hover:bg-transparent"
            >
              Collections
            </Button>
            <ChevronLeft className="h-4 w-4 rotate-180" />
            <span>New Collection</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Create New Collection</h1>
          <p className="text-muted-foreground">Organize products into curated collections</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Creating...' : 'Create Collection'}
          </Button>
        </div>
      </div>

      {/* Permission Notice */}
      {isDesigner && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            As a designer, you can create collections, but only administrators can publish them.
          </AlertDescription>
        </Alert>
      )}

      {/* Collection Form with Tabs */}
      <Card>
        <CardHeader className="border-b border-border p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start rounded-none border-0 bg-transparent p-0">
              <TabsTrigger
                value="details"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Details
              </TabsTrigger>
              <TabsTrigger
                value="content"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                {collectionData.type === 'manual' ? 'Products' : collectionData.type === 'rule' ? 'Rules' : 'Content'}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value="details" className="mt-0">
              <CollectionDetailsForm
                collection={collectionData}
                onChange={handleCollectionChange}
                errors={errors}
              />
            </TabsContent>

            <TabsContent value="content" className="mt-0">
              {collectionData.type === 'manual' && (
                <CollectionProductsForm
                  collection={collectionData}
                  onChange={handleCollectionChange}
                  onSearchProducts={handleSearchProducts}
                />
              )}

              {collectionData.type === 'rule' && (
                <CollectionRulesForm
                  collection={collectionData}
                  onChange={handleCollectionChange}
                />
              )}

              {collectionData.type === 'smart' && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    AI-powered smart collections automatically suggest products based on style
                    compatibility and customer preferences. The AI model will analyze your
                    collection name and description to find relevant products. This feature is
                    currently in beta.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Bottom Action Bar */}
      <div className="flex justify-between items-center border-t border-border pt-6">
        <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
          Cancel
        </Button>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Creating...' : 'Create Collection'}
          </Button>
        </div>
      </div>
    </div>
  );
}
