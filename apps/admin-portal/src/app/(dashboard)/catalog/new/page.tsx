'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';
import { catalogService } from '@/services/catalog';
import { DetailsTab, MediaTab, PricingTab, InventoryTab, SEOTab } from '@/components/products/tabs';
import type { Product } from '@/types';

const tabConfig = [
  { id: 'details', label: 'Details' },
  { id: 'media', label: 'Media' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'seo', label: 'SEO' },
];

export default function NewProductPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('details');
  const [isSaving, setIsSaving] = useState(false);

  // Initialize empty product
  const [productData, setProductData] = useState<Partial<Product>>({
    name: '',
    brand: '',
    longDescription: '',
    shortDescription: '',
    price: 0,
    currency: 'USD',
    status: 'draft',
    styleTags: [],
    materials: [],
    colors: [],
    has3D: false,
    arSupported: false,
  });

  // Handle product data changes
  const handleProductChange = (updates: Partial<Product>) => {
    setProductData((prev) => ({ ...prev, ...updates }));
  };

  // Handle save
  const handleSave = async () => {
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
      const response = await catalogService.createProduct(productData as Product);
      toast({
        title: 'Product created',
        description: 'The product has been successfully created.',
      });
      router.push('/catalog');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create the product. Please try again.',
        variant: 'destructive',
      });
      console.error('Failed to create product:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    router.push('/catalog');
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
              onClick={() => router.push('/catalog')}
              className="h-auto p-0 hover:bg-transparent"
            >
              Catalog
            </Button>
            <ChevronLeft className="h-4 w-4 rotate-180" />
            <span>New Product</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Create New Product</h1>
          <p className="text-muted-foreground">Add a new product to your catalog</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Creating...' : 'Create Product'}
          </Button>
        </div>
      </div>

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
            {isSaving ? 'Creating...' : 'Create Product'}
          </Button>
        </div>
      </div>
    </div>
  );
}
