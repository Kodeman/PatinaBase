'use client';

import type { CtaButtonProps } from '@patina/types';
import { FormField, TextInput, TextArea, SelectInput } from './FormField';

interface Props {
  props: CtaButtonProps;
  onChange: (partial: Partial<CtaButtonProps>) => void;
}

export function CtaButtonPropsForm({ props, onChange }: Props) {
  return (
    <div className="space-y-4">
      <FormField label="Button Text">
        <TextInput value={props.text} onChange={(v) => onChange({ text: v })} />
      </FormField>
      <FormField label="URL">
        <TextInput value={props.url} onChange={(v) => onChange({ url: v })} />
      </FormField>
      <FormField label="Supporting Text">
        <TextArea value={props.supporting_text} onChange={(v) => onChange({ supporting_text: v })} rows={2} />
      </FormField>
      <FormField label="Variant">
        <SelectInput
          value={props.variant}
          onChange={(v) => onChange({ variant: v as 'primary' | 'dark' })}
          options={[
            { value: 'primary', label: 'Primary (gold)' },
            { value: 'dark', label: 'Dark (charcoal)' },
          ]}
        />
      </FormField>
    </div>
  );
}
