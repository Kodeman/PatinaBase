'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { NotificationBlockProps } from '@patina/types';
import { FormField, TextInput, TextArea } from './FormField';

interface Props {
  props: NotificationBlockProps;
  onChange: (partial: Partial<NotificationBlockProps>) => void;
}

export function NotificationPropsForm({ props, onChange }: Props) {
  const details = props.details || [];

  const updateDetail = (idx: number, partial: Partial<{ key: string; value: string }>) => {
    const updated = details.map((d, i) => (i === idx ? { ...d, ...partial } : d));
    onChange({ details: updated });
  };

  return (
    <div className="space-y-4">
      <FormField label="Badge Label">
        <TextInput value={props.badge_label} onChange={(v) => onChange({ badge_label: v })} />
      </FormField>
      <FormField label="Headline">
        <TextInput value={props.headline} onChange={(v) => onChange({ headline: v })} />
      </FormField>
      <FormField label="Body">
        <TextArea value={props.body} onChange={(v) => onChange({ body: v })} rows={2} />
      </FormField>

      <div className="space-y-2">
        <span className="block text-[11px] font-medium text-patina-clay-beige uppercase tracking-wider">Details</span>
        {details.map((d, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              type="text"
              value={d.key}
              onChange={(e) => updateDetail(idx, { key: e.target.value })}
              placeholder="Key"
              className="flex-1 px-2 py-1.5 text-sm border border-patina-clay-beige/30 rounded-md bg-white"
            />
            <input
              type="text"
              value={d.value}
              onChange={(e) => updateDetail(idx, { value: e.target.value })}
              placeholder="Value"
              className="flex-1 px-2 py-1.5 text-sm border border-patina-clay-beige/30 rounded-md bg-white"
            />
            <button
              onClick={() => onChange({ details: details.filter((_, i) => i !== idx) })}
              className="p-1 text-patina-clay-beige hover:text-red-500"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange({ details: [...details, { key: '', value: '' }] })}
          className="flex items-center gap-1 text-xs text-patina-clay-beige hover:text-patina-mocha-brown"
        >
          <Plus className="w-3 h-3" /> Add detail
        </button>
      </div>

      <FormField label="CTA Text">
        <TextInput value={props.cta_text} onChange={(v) => onChange({ cta_text: v })} />
      </FormField>
      <FormField label="CTA URL">
        <TextInput value={props.cta_url} onChange={(v) => onChange({ cta_url: v })} />
      </FormField>
    </div>
  );
}
