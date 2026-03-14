'use client';

import type { TextBlockProps } from '@patina/shared/types';
import { FormField, TextArea, SelectInput } from './form-field';

interface Props {
  props: TextBlockProps;
  onChange: (partial: Partial<TextBlockProps>) => void;
}

export function TextBlockPropsForm({ props, onChange }: Props) {
  return (
    <div className="space-y-4">
      <FormField label="Text">
        <TextArea value={props.text} onChange={(v) => onChange({ text: v })} rows={4} />
      </FormField>
      <FormField label="Alignment">
        <SelectInput
          value={props.align}
          onChange={(v) => onChange({ align: v as 'left' | 'center' | 'right' })}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' },
          ]}
        />
      </FormField>
    </div>
  );
}
