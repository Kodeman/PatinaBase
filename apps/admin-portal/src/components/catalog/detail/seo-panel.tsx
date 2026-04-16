'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useProductEdit } from '@patina/catalog-ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AdminSeoExtras {
  slug?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
}

interface SEOPanelProps {
  defaultOpen?: boolean;
}

export function SEOPanel({ defaultOpen = false }: SEOPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { draft, updateField } = useProductEdit<AdminSeoExtras>();

  return (
    <div className="mb-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
          )}
          <span className="font-heading text-[1.1rem] font-normal text-[var(--text-primary)]">
            SEO
          </span>
          <span className="font-mono text-[0.55rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            Admin
          </span>
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-[var(--border-subtle)] p-4">
          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug</Label>
            <Input
              id="slug"
              value={draft.slug || ''}
              onChange={(e) => updateField('slug', e.target.value)}
              placeholder="e.g. modern-walnut-dining-table"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers and hyphens only.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="seoTitle">Meta Title</Label>
            <Input
              id="seoTitle"
              value={draft.seoTitle || ''}
              onChange={(e) => updateField('seoTitle', e.target.value)}
              placeholder="Appears in browser tab and search results"
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground">
              {(draft.seoTitle || '').length}/60 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="seoDescription">Meta Description</Label>
            <textarea
              id="seoDescription"
              rows={3}
              value={draft.seoDescription || ''}
              onChange={(e) => updateField('seoDescription', e.target.value)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Short summary for search engines"
              maxLength={160}
            />
            <p className="text-xs text-muted-foreground">
              {(draft.seoDescription || '').length}/160 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="seoKeywords">Keywords (comma-separated)</Label>
            <Input
              id="seoKeywords"
              value={(draft.seoKeywords || []).join(', ')}
              onChange={(e) =>
                updateField(
                  'seoKeywords',
                  e.target.value
                    .split(',')
                    .map((k) => k.trim())
                    .filter(Boolean)
                )
              }
              placeholder="dining table, walnut, modern"
            />
          </div>
        </div>
      )}
    </div>
  );
}
