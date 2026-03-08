'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { ChevronLeft, Save, X, AlertCircle, Loader2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, Alert, AlertDescription } from '@patina/design-system';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@patina/design-system';
import { toast } from '@patina/design-system';
import { catalogApi } from '@/lib/api-client';
import { DetailsTab, MediaTab, PricingTab, InventoryTab, SEOTab } from '@/components/products/tabs';
import { ValidationIssuesPanel } from '@/components/products/validation-issues-panel';
import { canEditProducts } from '@/lib/permissions';
import type { Product, UserRole } from '@patina/types';

const tabConfig = [
  { id: 'details', label: 'Details' },
  { id: 'media', label: 'Media' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'seo', label: 'SEO' },
  { id: 'validation', label: 'Validation' },
];

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;
  const { user, isLoading: authLoading, status } = useAuth();
  const [activeTab, setActiveTab] = useState('details');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [productData, setProductData] = useState<Partial<Product> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const sessionRoles = user?.roles ?? [];
  const userRole =
    (sessionRoles[0] as UserRole | undefined) ?? (user as any)?.role;
  const isDesigner = sessionRoles.includes('designer') || (user as any)?.role === 'designer';

  // Check permissions
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/auth/login');
      return;
    }

    if (!canEditProducts(userRole)) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to edit products.',
        variant: 'destructive',
      });
      router.push('/catalog');
      return;
    }

    setPermissionChecked(true);
  }, [user, authLoading, router, userRole]);

  // Load product data
  useEffect(() => {
    if (!permissionChecked || !productId) return;

    const loadProduct = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await catalogApi.getProduct(productId);
        setProductData(response.data);
      } catch (error) {
        console.error('Failed to load product:', error);
        setLoadError('Failed to load product. It may not exist or you may not have access.');
        toast({
          title: 'Error',
          description: 'Failed to load product data.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadProduct();
  }, [permissionChecked, productId]);

  // Handle product data changes
  const handleProductChange = (updates: Partial<Product>) => {
    setProductData((prev) => (prev ? { ...prev, ...updates } : updates));
  };

  // Handle save
  const handleSave = async () => {
    if (!productData) return;

    // Validate required fields
    if (!productData.name || !productData.brand) {
      toast({
        title: 'Validation Error',
        description: 'Product name and brand are required.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      await catalogApi.updateProduct(productId, productData);
      toast({
        title: 'Product updated',
        description: 'The product has been successfully updated.',
      });
      router.push('/catalog');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update the product. Please try again.',
        variant: 'destructive',
      });
      console.error('Failed to update product:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    router.push('/catalog');
  };

  // Show loading while checking permissions
  if (!permissionChecked) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
          <div className="text-muted-foreground">Checking permissions...</div>
        </div>
      </div>
    );
  }

  // Show loading while fetching product
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
          <div className="text-muted-foreground">Loading product...</div>
        </div>
      </div>
    );
  }

  // Show error if product failed to load
  if (loadError || !productData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/catalog')}
            className="h-auto p-0 hover:bg-transparent"
          >
            Catalog
          </Button>
          <ChevronLeft className="h-4 w-4 rotate-180" />
          <span>Edit Product</span>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {loadError || 'Product not found.'}
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.push('/catalog')}>
          Back to Catalog
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
              onClick={() => router.push('/catalog')}
              className="h-auto p-0 hover:bg-transparent"
            >
              Catalog
            </Button>
            <ChevronLeft className="h-4 w-4 rotate-180" />
            <span>Edit Product</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Product</h1>
          <p className="text-muted-foreground">
            {productData.name || 'Update product information'}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Permission Notice for Designers */}
      {isDesigner && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            As a designer, you can create and edit products, but only administrators can publish or delete them.
          </AlertDescription>
        </Alert>
      )}

      {/* Product Form with Tabs */}
      <Card>
        <CardHeader className="border-b border-border p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start rounded-none border-0 bg-transparent p-0">
              {tabConfig.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value="details" className="mt-0">
              <DetailsTab product={productData as Product} onChange={handleProductChange} />
            </TabsContent>

            <TabsContent value="media" className="mt-0">
              <MediaTab product={productData as Product} onChange={handleProductChange} />
            </TabsContent>

            <TabsContent value="pricing" className="mt-0">
              <PricingTab product={productData as Product} onChange={handleProductChange} />
            </TabsContent>

            <TabsContent value="inventory" className="mt-0">
              <InventoryTab product={productData as Product} onChange={handleProductChange} />
            </TabsContent>

            <TabsContent value="seo" className="mt-0">
              <SEOTab product={productData as Product} onChange={handleProductChange} />
            </TabsContent>

            <TabsContent value="validation" className="mt-0">
              <ValidationIssuesPanel productId={productId} />
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
          <Button variant="outline" onClick={handleSave} disabled={isSaving}>
            Save as Draft
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
