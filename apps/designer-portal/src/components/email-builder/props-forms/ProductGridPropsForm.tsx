'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { ProductGridProps, ProductGridProduct } from '@patina/types';
import { FormField, TextInput } from './FormField';
import { Button, IconButton } from '@/components/ui/controls';

interface Props {
  props: ProductGridProps;
  onChange: (partial: Partial<ProductGridProps>) => void;
}

const emptyProduct: ProductGridProduct = {
  image_url: '',
  provenance: 'Craftsmanship',
  product_name: 'New Product',
  description: 'Product description',
  price: '$0,000',
  style_match: '90% Match',
  product_url: '#',
};

export function ProductGridPropsForm({ props, onChange }: Props) {
  const products = props.products || [];

  const updateProduct = (idx: number, partial: Partial<ProductGridProduct>) => {
    const updated = products.map((p, i) => (i === idx ? { ...p, ...partial } : p));
    onChange({ products: updated });
  };

  const addProduct = () => {
    onChange({ products: [...products, { ...emptyProduct }] });
  };

  const removeProduct = (idx: number) => {
    onChange({ products: products.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-4">
      {products.map((product, idx) => (
        <div key={idx} className="border border-patina-clay-beige/20 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-patina-charcoal">Product {idx + 1}</span>
            <IconButton
              label="Remove product"
              size="sm"
              onClick={() => removeProduct(idx)}
              className="hover:text-red-500"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </IconButton>
          </div>
          <FormField label="Name">
            <TextInput value={product.product_name} onChange={(v) => updateProduct(idx, { product_name: v })} />
          </FormField>
          <FormField label="Image URL">
            <TextInput value={product.image_url} onChange={(v) => updateProduct(idx, { image_url: v })} />
          </FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Price">
              <TextInput value={product.price} onChange={(v) => updateProduct(idx, { price: v })} />
            </FormField>
            <FormField label="Match">
              <TextInput value={product.style_match} onChange={(v) => updateProduct(idx, { style_match: v })} />
            </FormField>
          </div>
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        onClick={addProduct}
        className="w-full border-dashed"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Product
      </Button>
    </div>
  );
}
