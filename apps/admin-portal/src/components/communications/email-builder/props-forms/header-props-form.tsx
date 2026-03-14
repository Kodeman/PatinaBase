'use client';

import type { HeaderBlockProps } from '@patina/shared/types';
import { FormField, TextInput } from './form-field';

interface Props {
  props: HeaderBlockProps;
  onChange: (partial: Partial<HeaderBlockProps>) => void;
}

export function HeaderPropsForm({ props, onChange }: Props) {
  return (
    <div className="space-y-4">
      <FormField label="Tagline">
        <TextInput value={props.tagline} onChange={(v) => onChange({ tagline: v })} />
      </FormField>
    </div>
  );
}
