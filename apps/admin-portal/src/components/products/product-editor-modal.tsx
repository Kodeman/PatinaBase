'use client';

import * as React from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  DollarSign,
  Package,
  Search as SearchIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Product } from '@patina/types';
import { DetailsTab, MediaTab, PricingTab, InventoryTab, SEOTab } from './tabs';

/**
 * Product Editor Modal with Tabbed Sections
 *
 * Implementation follows Visual Preservation Guide section 3.3:
 * - Radix dialog sized to 90vh/90vw with padding-free content
 * - Header: Media thumbnail + name/SKU stack with save state badges
 * - Tabs: Horizontal scroll on mobile, five-column grid on desktop
 * - Tab panels wrapped in ScrollArea
 * - Footer: Navigation buttons with progress meter
 * - Uses outline variant buttons to match filters and nav
 */

interface ProductEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product;
  onSave: (product: Product) => Promise<void>;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

type SaveState = 'saved' | 'saving' | 'error';

interface TabConfig {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabConfig: TabConfig[] = [
  { id: 'details', label: 'Details', icon: FileText },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'seo', label: 'SEO', icon: SearchIcon },
];

export function ProductEditorModal({
  open,
  onOpenChange,
  product,
  onSave,
  activeTab: controlledActiveTab,
  onTabChange,
}: ProductEditorModalProps) {
  const [internalTab, setInternalTab] = React.useState(tabConfig[0].id);
  const [saveState, setSaveState] = React.useState<SaveState>('saved');
  const [hasChanges, setHasChanges] = React.useState(false);
  const [productData, setProductData] = React.useState<Product | undefined>(product);

  // Controlled/uncontrolled tab handling
  const activeTab = controlledActiveTab ?? internalTab;
  const handleTabChange = (tab: string) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  // Get current tab index for progress
  const currentTabIndex = tabConfig.findIndex((tab) => tab.id === activeTab);
  const totalTabs = tabConfig.length;

  // Navigation handlers
  const handlePrevious = () => {
    if (currentTabIndex > 0) {
      handleTabChange(tabConfig[currentTabIndex - 1].id);
    }
  };

  const handleNext = () => {
    if (currentTabIndex < totalTabs - 1) {
      handleTabChange(tabConfig[currentTabIndex + 1].id);
    }
  };

  // Close handler
  const handleClose = () => {
    onOpenChange(false);
  };

  // Update product data when prop changes
  React.useEffect(() => {
    setProductData(product);
  }, [product]);

  // Reset state when modal closes
  React.useEffect(() => {
    if (!open) {
      setHasChanges(false);
      setSaveState('saved');
      setProductData(product);
    }
  }, [open, product]);

  // Handle product data changes
  const handleProductChange = (updates: Partial<Product>) => {
    setProductData((prev) => (prev ? { ...prev, ...updates } : undefined));
    setHasChanges(true);
    setSaveState('saved');
  };

  // Handle save
  const handleSave = async () => {
    if (productData && onSave) {
      setSaveState('saving');
      try {
        await onSave(productData);
        setSaveState('saved');
        setHasChanges(false);
      } catch (error) {
        setSaveState('error');
        console.error('Failed to save product:', error);
      }
    }
  };

  // Get primary image thumbnail
  const primaryImage = product?.images?.find((img) => img.isPrimary);
  const thumbnailUrl = primaryImage?.url;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-[90vw] h-[90vh] p-0 gap-0',
          'flex flex-col overflow-hidden'
        )}
      >
        {/* Header - Media thumbnail + name/SKU + save state */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <div
            className={cn(
              'w-10 h-10 md:w-12 md:h-12 bg-muted rounded shrink-0 overflow-hidden',
              'flex items-center justify-center'
            )}
          >
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={product?.name || 'Product'}
                className="w-full h-full object-cover"
              />
            ) : (
              <ImageIcon className="w-5 h-5 md:w-6 md:h-6 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate">
              {product?.name || 'New Product'}
            </h2>
            <p className="text-sm text-muted-foreground truncate">
              SKU: {product?.id || 'N/A'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasChanges && (
              <Badge
                variant={
                  saveState === 'saved'
                    ? 'success'
                    : saveState === 'saving'
                    ? 'secondary'
                    : 'destructive'
                }
                className="transition-all duration-200"
              >
                {saveState === 'saved' && 'Saved'}
                {saveState === 'saving' && 'Saving...'}
                {saveState === 'error' && 'Error'}
              </Badge>
            )}
          </div>
        </div>

        {/* Tabs - Horizontal scroll on mobile, five-column grid on desktop */}
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList
            className={cn(
              'w-full h-auto p-1 rounded-none border-b border-border bg-muted/50',
              'overflow-x-auto overflow-y-hidden',
              'md:grid md:grid-cols-5 md:overflow-visible',
              'flex gap-1 shrink-0'
            )}
          >
            {tabConfig.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    'flex items-center gap-2 whitespace-nowrap',
                    'px-4 py-2.5 transition-all duration-200',
                    'data-[state=active]:bg-background data-[state=active]:shadow-sm'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Tab Panels - Each wrapped in ScrollArea */}
          <div className="flex-1 min-h-0">
            <TabsContent
              value="details"
              className="h-full m-0 focus-visible:outline-none focus-visible:ring-0"
            >
              <ScrollArea className="h-full">
                <div className="p-6">
                  <DetailsTab product={productData} onChange={handleProductChange} />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value="media"
              className="h-full m-0 focus-visible:outline-none focus-visible:ring-0"
            >
              <ScrollArea className="h-full">
                <div className="p-6">
                  <MediaTab product={productData} onChange={handleProductChange} />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value="pricing"
              className="h-full m-0 focus-visible:outline-none focus-visible:ring-0"
            >
              <ScrollArea className="h-full">
                <div className="p-6">
                  <PricingTab product={productData} onChange={handleProductChange} />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value="inventory"
              className="h-full m-0 focus-visible:outline-none focus-visible:ring-0"
            >
              <ScrollArea className="h-full">
                <div className="p-6">
                  <InventoryTab product={productData} onChange={handleProductChange} />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value="seo"
              className="h-full m-0 focus-visible:outline-none focus-visible:ring-0"
            >
              <ScrollArea className="h-full">
                <div className="p-6">
                  <SEOTab product={productData} onChange={handleProductChange} />
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer - Navigation buttons with progress meter */}
        <div
          className={cn(
            'flex items-center justify-between gap-4',
            'px-6 py-4 border-t border-border shrink-0'
          )}
        >
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentTabIndex === 0}
            className="transition-all duration-200"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>

          <div className="flex-1 text-center">
            <p className="text-sm text-muted-foreground">
              Step {currentTabIndex + 1} of {totalTabs}
            </p>
          </div>

          <Button
            variant="outline"
            onClick={handleNext}
            disabled={currentTabIndex === totalTabs - 1}
            className="transition-all duration-200"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
