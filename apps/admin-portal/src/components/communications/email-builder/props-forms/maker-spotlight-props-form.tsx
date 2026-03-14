'use client';

import type { MakerSpotlightProps } from '@patina/shared/types';
import { FormField, TextInput, TextArea } from './form-field';

interface Props {
  props: MakerSpotlightProps;
  onChange: (partial: Partial<MakerSpotlightProps>) => void;
}

export function MakerSpotlightPropsForm({ props, onChange }: Props) {
  return (
    <div className="space-y-4">
      <FormField label="Portrait URL">
        <TextInput value={props.portrait_url} onChange={(v) => onChange({ portrait_url: v })} placeholder="https://..." />
      </FormField>
      <FormField label="Maker Name">
        <TextInput value={props.maker_name} onChange={(v) => onChange({ maker_name: v })} />
      </FormField>
      <FormField label="Story">
        <TextArea value={props.story} onChange={(v) => onChange({ story: v })} rows={3} />
      </FormField>
      <FormField label="Link Text">
        <TextInput value={props.link_text} onChange={(v) => onChange({ link_text: v })} />
      </FormField>
      <FormField label="Link URL">
        <TextInput value={props.link_url} onChange={(v) => onChange({ link_url: v })} />
      </FormField>
    </div>
  );
}
