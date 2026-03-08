'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateTemplate } from '@patina/supabase/hooks';
import { ChevronLeft, Save } from 'lucide-react';
import type { EmailTemplateCategory } from '@patina/types/types';

export default function NewTemplatePage() {
  const router = useRouter();
  const createTemplate = useCreateTemplate();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EmailTemplateCategory>('campaign');
  const [subjectDefault, setSubjectDefault] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const autoSlug = (value: string) => {
    setName(value);
    if (!slug || slug === nameToSlug(name)) {
      setSlug(nameToSlug(value));
    }
  };

  const handleCreate = async () => {
    if (!name || !slug) return;
    setIsCreating(true);
    try {
      const result = await createTemplate.mutateAsync({
        name,
        slug,
        description: description || undefined,
        category,
        subject_default: subjectDefault || undefined,
        html_content: '',
        variables: [],
      });
      router.push(`/communications/templates/${result.id}`);
    } catch {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-patina-off-white">
      <div className="bg-white border-b border-patina-clay-beige/20 px-8 py-6">
        <button
          onClick={() => router.push('/communications/templates')}
          className="flex items-center gap-1 text-sm text-patina-clay-beige hover:text-patina-charcoal mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Templates
        </button>
        <h1 className="text-2xl font-display font-semibold text-patina-charcoal">New Template</h1>
        <p className="text-sm text-patina-clay-beige mt-1">Create a new email template</p>
      </div>

      <div className="px-8 py-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-patina-charcoal mb-1">Template Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => autoSlug(e.target.value)}
              placeholder="e.g. Spring Collection Launch"
              className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-patina-charcoal mb-1">Slug</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="spring-collection-launch"
              className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 font-mono"
            />
            <p className="text-xs text-patina-clay-beige mt-1">Lowercase letters, numbers, and hyphens only</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-patina-charcoal mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Brief description of this template's purpose..."
              className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-patina-charcoal mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as EmailTemplateCategory)}
                className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20"
              >
                <option value="transactional">Transactional</option>
                <option value="engagement">Engagement</option>
                <option value="campaign">Campaign</option>
                <option value="sequence">Sequence</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-patina-charcoal mb-1">Default Subject</label>
              <input
                type="text"
                value={subjectDefault}
                onChange={(e) => setSubjectDefault(e.target.value)}
                placeholder="Optional default subject line"
                className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20"
              />
            </div>
          </div>

          <div className="pt-3 flex justify-end">
            <button
              onClick={handleCreate}
              disabled={!name || !slug || isCreating}
              className="flex items-center gap-2 px-6 py-2.5 bg-patina-mocha-brown text-white rounded-lg text-sm font-medium hover:bg-patina-charcoal transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isCreating ? 'Creating...' : 'Create Template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
