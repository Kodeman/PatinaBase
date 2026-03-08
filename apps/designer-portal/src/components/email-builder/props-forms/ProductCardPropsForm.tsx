'use client';

import type { ProductCardProps } from '@patina/types';
import { FormField, TextInput, TextArea } from './FormField';

interface Props {
  props: ProductCardProps;
  onChange: (partial: Partial<ProductCardProps>) => void;
}

export function ProductCardPropsForm({ props, onChange }: Props) {
  return (
    <div className="space-y-4">
      <FormField label="Image URL">
        <TextInput value={props.image_url} onChange={(v) => onChange({ image_url: v })} placeholder="https://..." />
      </FormField>
      <FormField label="Provenance">
        <TextInput value={props.provenance} onChange={(v) => onChange({ provenance: v })} />
      </FormField>
      <FormField label="Product Name">
        <TextInput value={props.product_name} onChange={(v) => onChange({ product_name: v })} />
      </FormField>
      <FormField label="Description">
        <TextArea value={props.description} onChange={(v) => onChange({ description: v })} rows={2} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Price">
          <TextInput value={props.price} onChange={(v) => onChange({ price: v })} />
        </FormField>
        <FormField label="Style Match">
          <TextInput value={props.style_match} onChange={(v) => onChange({ style_match: v })} />
        </FormField>
      </div>
      <FormField label="Product URL">
        <TextInput value={props.product_url} onChange={(v) => onChange({ product_url: v })} />
      </FormField>
    </div>
  );
}
