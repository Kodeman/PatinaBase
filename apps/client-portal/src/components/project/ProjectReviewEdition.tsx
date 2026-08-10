'use client';

import Image from 'next/image';
import { useRecordProjectReviewFeedback, useClientProjectReviewBundle } from '@/hooks/use-commercial-client';
import { reviewVerdictFromLabel } from '@/lib/project-review';

const money = (cents: number | null, currency: string) => cents === null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);

export function ProjectReviewEdition({ projectId }: { projectId: string }) {
  const { data, isLoading } = useClientProjectReviewBundle(projectId);
  const feedback = useRecordProjectReviewFeedback(projectId);
  if (isLoading || !data || data.items.length === 0) return null;
  const closed = data.status !== 'published';
  return <section className="mt-8 rounded-lg border border-[var(--border-default)] bg-white p-5" data-testid="project-review-edition">
    <h3 className="font-heading text-base text-[var(--text-primary)]">Selection review</h3>
    <p className="mt-1 type-body-small text-[var(--text-muted)]">Share a preference with your studio. Your response does not authorize a purchase or change an authorization.</p>
    <ul className="mt-4 space-y-4">
      {data.items.map((item) => <li key={item.id} className="flex gap-3 border-t border-[var(--border-subtle)] pt-4">
        {item.imageUrl && <Image src={item.imageUrl} alt="" width={64} height={64} unoptimized className="h-16 w-16 rounded object-cover" />}
        <div className="min-w-0 flex-1"><p className="text-sm font-medium text-[var(--text-primary)]">{item.name}</p><p className="type-meta-small text-[var(--text-muted)]">{item.roomName}{money(item.clientPriceCents, item.currency) ? ` · ${money(item.clientPriceCents, item.currency)}` : ''}</p>
          {item.verdict && <p className="mt-2 type-meta-small text-[var(--text-muted)]">Your response: {item.verdict === 'approved' ? 'Looks good' : item.verdict === 'rejected' ? 'Needs a change' : 'Ask a question'}</p>}
          {!closed && <div className="mt-3 flex flex-wrap gap-2">{(['Looks good', 'Needs a change', 'Ask a question'] as const).map((label) => <button key={label} type="button" disabled={feedback.isPending} onClick={() => feedback.mutate({ reviewItemId: item.id, verdict: reviewVerdictFromLabel(label) })} className="rounded border border-[var(--border-default)] px-2 py-1 text-xs text-[var(--text-primary)] disabled:opacity-50">{label}</button>)}</div>}
        </div>
      </li>)}
    </ul>
    {closed && <p className="mt-4 type-meta-small text-[var(--text-muted)]">This edition is closed. Your studio can share a newer edition if changes are needed.</p>}
  </section>;
}
