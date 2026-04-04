'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreateCampaign, useAudienceSegments } from '@patina/supabase';
import { FieldGroup } from '@/components/portal/field-group';
import { PortalButton } from '@/components/portal/button';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function NewCampaignPage() {
  const router = useRouter();
  const createCampaign = useCreateCampaign();
  const { data: rawAudiences } = useAudienceSegments() as { data: Any };
  const audiences = Array.isArray(rawAudiences) ? rawAudiences : [];

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [audienceId, setAudienceId] = useState('');

  const handleSave = (sendNow = false) => {
    if (!name.trim() || !subject.trim()) return;
    createCampaign.mutate(
      { name: name.trim(), subject: subject.trim(), body: content.trim(), audience_segment_id: audienceId || undefined, send_immediately: sendNow },
      { onSuccess: () => router.push('/portal/communications/campaigns') }
    );
  };

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link href="/portal/communications/campaigns" className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">Campaigns</Link>
        <span className="mx-2">&rarr;</span><span>New</span>
      </div>
      <h1 className="type-page-title mb-8">Create Campaign</h1>
      <div className="max-w-2xl space-y-8">
        <FieldGroup label="Campaign Name">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" className="type-body w-full border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-primary)]" />
        </FieldGroup>
        <FieldGroup label="Subject Line">
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" className="type-body w-full border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-primary)]" />
        </FieldGroup>
        {audiences.length > 0 && (
          <FieldGroup label="Audience">
            <select value={audienceId} onChange={(e) => setAudienceId(e.target.value)} className="type-body w-full border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none">
              <option value="">Select audience...</option>
              {audiences.map((a: Any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </FieldGroup>
        )}
        <FieldGroup label="Content">
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} placeholder="Email body" className="type-body w-full resize-none border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-primary)]" />
        </FieldGroup>
        <div className="flex gap-4 pt-4">
          <PortalButton variant="primary" onClick={() => handleSave(false)} disabled={createCampaign.isPending}>Save Draft</PortalButton>
          <PortalButton variant="secondary" onClick={() => handleSave(true)} disabled={createCampaign.isPending}>Send Now</PortalButton>
        </div>
      </div>
    </div>
  );
}
