'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreateTemplate } from '@patina/supabase';
import { FieldGroup } from '@/components/portal/field-group';
import { Button } from '@/components/ui/controls';

export default function NewTemplatePage() {
  const router = useRouter();
  const createTemplate = useCreateTemplate();
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) return;
    createTemplate.mutate(
      { name: name.trim(), subject_default: subject.trim(), html_content: body.trim() },
      { onSuccess: () => router.push('/portal/communications/templates') }
    );
  };

  return (
    <div className="pt-8">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/communications/templates">← Templates</Link>
        </Button>
      </div>
      <h1 className="type-page-title mb-8">Create Template</h1>
      <div className="max-w-2xl space-y-8">
        <FieldGroup label="Template Name"><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" className="type-body w-full border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-primary)]" /></FieldGroup>
        <FieldGroup label="Subject"><input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Default subject line" className="type-body w-full border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-primary)]" /></FieldGroup>
        <FieldGroup label="Body"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Template content (HTML)" className="type-body w-full resize-none border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-primary)]" /></FieldGroup>
        <Button variant="primary" onClick={handleSubmit} disabled={createTemplate.isPending || !name.trim()}>
          {createTemplate.isPending ? 'Saving...' : 'Save Template'}
        </Button>
      </div>
    </div>
  );
}
