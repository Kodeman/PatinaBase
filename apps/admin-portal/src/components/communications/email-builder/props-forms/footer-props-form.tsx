'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { FooterBlockProps } from '@patina/shared/types';
import { FormField, TextArea } from './form-field';

interface Props {
  props: FooterBlockProps;
  onChange: (partial: Partial<FooterBlockProps>) => void;
}

export function FooterPropsForm({ props, onChange }: Props) {
  const links = props.nav_links || [];

  const updateLink = (idx: number, partial: Partial<{ label: string; url: string }>) => {
    const updated = links.map((l, i) => (i === idx ? { ...l, ...partial } : l));
    onChange({ nav_links: updated });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span className="block text-[11px] font-medium text-patina-clay-beige uppercase tracking-wider">Nav Links</span>
        {links.map((link, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              type="text"
              value={link.label}
              onChange={(e) => updateLink(idx, { label: e.target.value })}
              placeholder="Label"
              className="flex-1 px-2 py-1.5 text-sm border border-patina-clay-beige/30 rounded-md bg-white"
            />
            <input
              type="text"
              value={link.url}
              onChange={(e) => updateLink(idx, { url: e.target.value })}
              placeholder="URL"
              className="flex-1 px-2 py-1.5 text-sm border border-patina-clay-beige/30 rounded-md bg-white"
            />
            <button
              onClick={() => onChange({ nav_links: links.filter((_, i) => i !== idx) })}
              className="p-1 text-patina-clay-beige hover:text-red-500"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange({ nav_links: [...links, { label: '', url: '#' }] })}
          className="flex items-center gap-1 text-xs text-patina-clay-beige hover:text-patina-mocha-brown"
        >
          <Plus className="w-3 h-3" /> Add link
        </button>
      </div>

      <FormField label="Compliance Text">
        <TextArea value={props.compliance_text} onChange={(v) => onChange({ compliance_text: v })} rows={3} />
      </FormField>
    </div>
  );
}
