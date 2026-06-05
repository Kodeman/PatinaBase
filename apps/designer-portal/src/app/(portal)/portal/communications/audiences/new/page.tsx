'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreateAudienceSegment } from '@patina/supabase';
import { FieldGroup } from '@/components/portal/field-group';
import { Button } from '@/components/ui/controls';

export default function NewAudiencePage() {
  const router = useRouter();
  const createAudience = useCreateAudienceSegment();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) return;
    createAudience.mutate(
      { name: name.trim(), description: description.trim(), rules: { logic: 'and', conditions: [] } },
      { onSuccess: () => router.push('/portal/communications/audiences') }
    );
  };

  return (
    <div className="pt-8">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/communications/audiences">← Audiences</Link>
        </Button>
      </div>
      <h1 className="type-page-title mb-8">Create Audience</h1>
      <div className="max-w-2xl space-y-8">
        <FieldGroup label="Audience Name"><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Audience name" className="type-body w-full border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-primary)]" /></FieldGroup>
        <FieldGroup label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Describe this audience segment" className="type-body w-full resize-none border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-primary)]" /></FieldGroup>
        <Button variant="primary" onClick={handleSubmit} disabled={createAudience.isPending || !name.trim()}>
          {createAudience.isPending ? 'Creating...' : 'Create Audience'}
        </Button>
      </div>
    </div>
  );
}
