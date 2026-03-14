'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { ProductGridProps, ProductGridProduct } from '@patina/shared/types';
import { FormField, TextInput } from './form-field';

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
            <button
              onClick={() => removeProduct(idx)}
              className="p-1 text-patina-clay-beige hover:text-red-500"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
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
      <button
        onClick={addProduct}
        className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-patina-clay-beige/40 rounded-lg text-xs text-patina-clay-beige hover:border-patina-mocha-brown hover:text-patina-mocha-brown transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Product
      </button>
    </div>
  );
}
