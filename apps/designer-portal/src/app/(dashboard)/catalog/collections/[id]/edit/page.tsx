'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Save, X, AlertCircle, Loader2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, Alert, AlertDescription, Tabs, TabsList, TabsTrigger, TabsContent, toast, Skeleton } from '@patina/design-system';
import { CollectionDetailsForm } from '@/components/collections/collection-details-form';
import { CollectionProductsForm } from '@/components/collections/collection-products-form';
import { CollectionRulesForm } from '@/components/collections/collection-rules-form';
import { canEditProducts } from '@/lib/permissions';
import type { Collection, UserRole } from '@patina/types';
import { catalogApi } from '@/lib/api-client';

export default function EditCollectionPage() {
  const router = useRouter();
  const params = useParams();
  const collectionId = params?.id as string;
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('details');
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [collectionData, setCollectionData] = useState<Partial<Collection> | null>(null);

  // Check permissions
  const sessionRoles = user?.roles ?? [];
  const userRole =
    (sessionRoles[0] as UserRole | undefined) ?? (user as any)?.role;
  const canEdit = canEditProducts(userRole);
  const isDesigner = sessionRoles.includes('designer') || (user as any)?.role === 'designer';

  // Fetch collection data
  const { data: collectionResponse, isLoading, error } = useQuery({
    queryKey: ['collection', collectionId],
    queryFn: () => catalogApi.getCollection(collectionId),
    enabled: !!collectionId && canEdit,
  });

  // Set collection data when loaded
  useEffect(() => {
    if (collectionResponse?.data) {
      setCollectionData(collectionResponse.data);
    }
  }, [collectionResponse]);

  if (!canEdit) {
    router.push('/catalog/collections');
    return null;
  }

  // Handle collection data changes
  const handleCollectionChange = (updates: Partial<Collection>) => {
    setCollectionData((prev) => (prev ? { ...prev, ...updates } : null));
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
    if (!collectionData) return false;

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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle save
  const handleSave = async () => {
    if (!collectionData || !validate()) {
      setActiveTab('details');
      return;
    }

    setIsSaving(true);
    try {
      await catalogApi.updateCollection(collectionId, collectionData);

      toast({
        title: 'Collection updated',
        description: 'The collection has been successfully updated.',
      });

      router.push('/catalog/collections');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update the collection. Please try again.',
        variant: 'destructive',
      });
      console.error('Failed to update collection:', error);
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

  // Loading state
  if (isLoading || !collectionData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load collection. Please try again later.
            {error && <div className="mt-1 text-xs">{String(error)}</div>}
          </AlertDescription>
        </Alert>
        <Button onClick={() => router.push('/catalog/collections')}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Collections
        </Button>
      </div>
    );
  }

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
            <span>{collectionData.name}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Collection</h1>
          <p className="text-muted-foreground">Update collection details and manage content</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
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

      {/* Permission Notice */}
      {isDesigner && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            As a designer, you can edit collections, but only administrators can publish or delete them.
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
            {isSaving ? (
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
  );
}
