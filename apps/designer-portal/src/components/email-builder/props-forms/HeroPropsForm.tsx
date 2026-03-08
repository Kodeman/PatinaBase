'use client';

import type { HeroBlockProps } from '@patina/types';
import { FormField, TextInput, TextArea } from './FormField';

interface Props {
  props: HeroBlockProps;
  onChange: (partial: Partial<HeroBlockProps>) => void;
}

export function HeroPropsForm({ props, onChange }: Props) {
  return (
    <div className="space-y-4">
      <FormField label="Greeting">
        <TextInput value={props.greeting} onChange={(v) => onChange({ greeting: v })} />
      </FormField>
      <FormField label="Headline">
        <TextInput value={props.headline} onChange={(v) => onChange({ headline: v })} />
      </FormField>
      <FormField label="Subline">
        <TextArea value={props.subline} onChange={(v) => onChange({ subline: v })} rows={2} />
      </FormField>
    </div>
  );
}
