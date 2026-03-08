'use client';

import type { DividerBlockProps } from '@patina/types';
import { FormField, SelectInput } from './FormField';

interface Props {
  props: DividerBlockProps;
  onChange: (partial: Partial<DividerBlockProps>) => void;
}

export function DividerPropsForm({ props, onChange }: Props) {
  return (
    <div className="space-y-4">
      <FormField label="Style">
        <SelectInput
          value={props.variant}
          onChange={(v) => onChange({ variant: v as 'subtle' | 'gold' })}
          options={[
            { value: 'subtle', label: 'Subtle (light gray)' },
            { value: 'gold', label: 'Gold (accent)' },
          ]}
        />
      </FormField>
    </div>
  );
}
