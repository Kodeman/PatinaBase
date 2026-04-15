'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';
import { catalogService } from '@/services/catalog';
import { DetailsTab, MediaTab, PricingTab, InventoryTab, SEOTab } from '@/components/products/tabs';
import {
  PageHeader,
  FilterTabs,
  Section,
} from '@/components/portal';
import type { Product } from '@/types';

const tabConfig = [
  { value: 'details', label: 'Details' },
  { value: 'media', label: 'Media' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'seo', label: 'SEO' },
];

export default function NewProductPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('details');
  const [isSaving, setIsSaving] = useState(false);

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

  const handleProductChange = (updates: Partial<Product>) => {
    setProductData((prev) => ({ ...prev, ...updates }));
  };

  const handleSave = async () => {
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
      await catalogService.createProduct(productData as Product);
      toast({
        title: 'Product created',
        description: 'The product has been successfully created.',
      });
      router.push('/catalog' as any);
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

  const handleCancel = () => {
    router.push('/catalog' as any);
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/catalog' as any)}
          className="h-auto p-0 hover:bg-transparent"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="type-meta-small">Catalog</span>
        </Button>
      </div>
      <PageHeader
        title="Create New"
        accent="Product"
        description="Add a new product to your catalog."
        actions={
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
        }
      />

      <Section className="mt-10">
        <FilterTabs items={tabConfig} value={activeTab} onChange={setActiveTab} />
        <div className="mt-6">
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
        </div>
      </Section>

      <div className="mt-10 flex items-center justify-between border-t border-[var(--border-default)] pt-6">
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
