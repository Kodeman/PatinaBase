'use client';

import * as React from 'react';
import { DollarSign, Calendar, AlertCircle } from 'lucide-react';
import { Input, Label, Select, Switch, Badge } from '@patina/design-system';
import { cn } from '@/lib/utils';
import type { Product, Variant } from '@patina/types';

interface PricingTabProps {
  product?: Product;
  onChange: (updates: Partial<Product>) => void;
}

const CURRENCIES = [
  { value: 'USD', label: 'USD ($)', symbol: '$' },
  { value: 'EUR', label: 'EUR (€)', symbol: '€' },
  { value: 'GBP', label: 'GBP (£)', symbol: '£' },
  { value: 'CAD', label: 'CAD (C$)', symbol: 'C$' },
  { value: 'AUD', label: 'AUD (A$)', symbol: 'A$' },
];

export function PricingTab({ product, onChange }: PricingTabProps) {
  const [hasVariants, setHasVariants] = React.useState(
    (product?.variants?.length || 0) > 0
  );
  const [onSale, setOnSale] = React.useState(!!product?.salePrice);

  const currency = product?.currency || 'USD';
  const currencySymbol =
    CURRENCIES.find((c) => c.value === currency)?.symbol || '$';

  const handleInputChange = (field: keyof Product) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    onChange({ [field]: value ? parseFloat(value) : undefined });
  };

  const handleDateChange = (field: keyof Product) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    onChange({ [field]: e.target.value ? new Date(e.target.value) : undefined });
  };

  const handleCurrencyChange = (value: string) => {
    onChange({ currency: value });
  };

  const handleSaleToggle = (checked: boolean) => {
    setOnSale(checked);
    if (!checked) {
      onChange({
        salePrice: undefined,
        salePriceStart: undefined,
        salePriceEnd: undefined,
      });
    }
  };

  // Calculate discount percentage
  const discountPercentage =
    product?.price && product?.salePrice
      ? Math.round(((product.price - product.salePrice) / product.price) * 100)
      : 0;

  // Check if sale is active
  const now = new Date();
  const saleIsActive =
    product?.salePrice &&
    (!product.salePriceStart || new Date(product.salePriceStart) <= now) &&
    (!product.salePriceEnd || new Date(product.salePriceEnd) >= now);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold mb-1">Pricing & Discounts</h3>
        <p className="text-sm text-muted-foreground">
          Configure base pricing, sale prices, and variant-specific pricing.
        </p>
      </div>

      {/* Base Pricing */}
      <div className="space-y-4">
        <div>
          <h4 className="text-base font-semibold mb-3">Base Pricing</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="currency">Currency*</Label>
            <Select value={currency} onValueChange={handleCurrencyChange}>
              {CURRENCIES.map((curr) => (
                <option key={curr.value} value={curr.value}>
                  {curr.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">Regular Price*</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {currencySymbol}
              </span>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={product?.price || ''}
                onChange={handleInputChange('price')}
                className="pl-8"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="msrp">MSRP (Optional)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {currencySymbol}
              </span>
              <Input
                id="msrp"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={product?.msrp || ''}
                onChange={handleInputChange('msrp')}
                className="pl-8"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Manufacturer's suggested retail price
            </p>
          </div>
        </div>
      </div>

      {/* Sale Pricing */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-semibold">Sale Pricing</h4>
            <p className="text-sm text-muted-foreground">
              Set a discounted price with optional date range
            </p>
          </div>
          <Switch
            id="on-sale"
            checked={onSale}
            onCheckedChange={handleSaleToggle}
          />
        </div>

        {onSale && (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sale-price">Sale Price*</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {currencySymbol}
                  </span>
                  <Input
                    id="sale-price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={product?.salePrice || ''}
                    onChange={handleInputChange('salePrice')}
                    className="pl-8"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sale-start">Start Date (Optional)</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="sale-start"
                    type="datetime-local"
                    value={
                      product?.salePriceStart
                        ? new Date(product.salePriceStart)
                            .toISOString()
                            .slice(0, 16)
                        : ''
                    }
                    onChange={handleDateChange('salePriceStart')}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sale-end">End Date (Optional)</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="sale-end"
                    type="datetime-local"
                    value={
                      product?.salePriceEnd
                        ? new Date(product.salePriceEnd).toISOString().slice(0, 16)
                        : ''
                    }
                    onChange={handleDateChange('salePriceEnd')}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            {/* Discount Summary */}
            {product?.price && product?.salePrice && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Discount:</span>
                  <Badge variant={saleIsActive ? 'success' : 'secondary'}>
                    {discountPercentage}% OFF
                  </Badge>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Save:</span>{' '}
                  <span className="font-medium">
                    {currencySymbol}
                    {(product.price - product.salePrice).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Sale Status Warning */}
            {product?.salePrice && !saleIsActive && (
              <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-900 dark:text-yellow-100">
                    Sale not currently active
                  </p>
                  <p className="text-yellow-800 dark:text-yellow-200 text-xs mt-1">
                    The sale price will not be displayed until the start date or
                    after the end date has passed.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Variant Pricing */}
      {hasVariants && (
        <div className="space-y-4 pt-4 border-t border-border">
          <div>
            <h4 className="text-base font-semibold mb-1">Variant Pricing</h4>
            <p className="text-sm text-muted-foreground">
              Configure pricing overrides for specific variants
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-center text-muted-foreground">
              Variant pricing configuration will be available in the Inventory tab.
              Set up variants first to configure variant-specific pricing.
            </p>
          </div>
        </div>
      )}

      {/* Pricing Summary */}
      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold">Pricing Summary</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Regular Price</p>
            <p className="text-lg font-semibold">
              {currencySymbol}
              {product?.price?.toFixed(2) || '0.00'}
            </p>
          </div>

          {product?.msrp && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">MSRP</p>
              <p className="text-lg font-semibold">
                {currencySymbol}
                {product.msrp.toFixed(2)}
              </p>
            </div>
          )}

          {product?.salePrice && (
            <>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Sale Price</p>
                <p className="text-lg font-semibold text-green-600">
                  {currencySymbol}
                  {product.salePrice.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">You Save</p>
                <p className="text-lg font-semibold text-green-600">
                  {discountPercentage}%
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pricing Tips */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Pricing Tips
        </h4>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>Research competitor pricing before setting your prices</li>
          <li>Consider your costs, margins, and target customer when pricing</li>
          <li>Use MSRP to show value when offering discounts</li>
          <li>Schedule sales in advance using start and end dates</li>
          <li>Monitor pricing performance and adjust as needed</li>
        </ul>
      </div>
    </div>
  );
}
