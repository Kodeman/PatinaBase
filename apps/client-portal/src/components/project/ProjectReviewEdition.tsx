'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRecordProjectReviewFeedback, useClientProjectReviewBundle } from '@/hooks/use-commercial-client';
import { reviewVerdictFromLabel } from '@/lib/project-review';

const money = (cents: number | null, currency: string) => cents === null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);

export function ProjectReviewEdition({ projectId, editionId }: { projectId: string; editionId: string }) {
  const { data, isLoading, isError } = useClientProjectReviewBundle(editionId, projectId);
  const feedback = useRecordProjectReviewFeedback(editionId);
  const [comments, setComments] = useState<Record<string, string>>({});
  if (isLoading) return <div className="mt-8 h-40 animate-pulse rounded-lg bg-[var(--color-pearl)]" aria-label="Loading selection review" />;
  if (isError || !data) return <p role="alert" className="mt-8 type-body-small text-[var(--text-muted)]">This selection review is unavailable.</p>;
  if (data.items.length === 0) return <p className="mt-8 type-body-small text-[var(--text-muted)]">This selection review has no items.</p>;
  const closed = data.status !== 'published';
  return <section className="mt-8 rounded-lg border border-[var(--border-default)] bg-white p-5" data-testid="project-review-edition">
    <h3 className="font-heading text-base text-[var(--text-primary)]">Selection review</h3>
    <p className="mt-1 type-body-small text-[var(--text-muted)]">Share a preference with your studio. Your response does not authorize a purchase or change an authorization.</p>
    <ul className="mt-4 space-y-4">
      {data.items.map((item) => <li key={item.id} className="flex gap-3 border-t border-[var(--border-subtle)] pt-4">
        {item.imageUrl && <Image src={item.imageUrl} alt="" width={64} height={64} unoptimized className="h-16 w-16 rounded object-cover" />}
        <div className="min-w-0 flex-1"><p className="text-sm font-medium text-[var(--text-primary)]">{item.name}</p><p className="type-meta-small text-[var(--text-muted)]">{item.roomName}{money(item.clientPriceCents, item.currency) ? ` · ${money(item.clientPriceCents, item.currency)}` : ''}</p>
          {item.verdict && <p className="mt-2 type-meta-small text-[var(--text-muted)]">Your response: {item.verdict === 'approved' ? 'Looks good' : item.verdict === 'rejected' ? 'Needs a change' : 'Ask a question'}</p>}
          {!closed && <div className="mt-3 flex flex-wrap gap-2">{(['Looks good', 'Needs a change'] as const).map((label) => <button key={label} type="button" disabled={feedback.isPending} onClick={() => feedback.mutate({ reviewItemId: item.id, verdict: reviewVerdictFromLabel(label) })} className="rounded border border-[var(--border-default)] px-2 py-1 text-xs text-[var(--text-primary)] disabled:opacity-50">{label}</button>)}
            <input aria-label={`Question about ${item.name}`} value={comments[item.id] ?? ''} onChange={(event) => setComments({ ...comments, [item.id]: event.target.value })} placeholder="Ask a question" className="min-w-40 rounded border border-[var(--border-default)] px-2 py-1 text-xs" />
            <button type="button" disabled={feedback.isPending || !(comments[item.id] ?? '').trim()} onClick={() => feedback.mutate({ reviewItemId: item.id, verdict: 'comment', comment: comments[item.id] })} className="rounded border border-[var(--border-default)] px-2 py-1 text-xs text-[var(--text-primary)] disabled:opacity-50">Ask a question</button>
          </div>}
        </div>
      </li>)}
    </ul>
    {closed && <p className="mt-4 type-meta-small text-[var(--text-muted)]">This edition is closed. Your studio can share a newer edition if changes are needed.</p>}
  </section>;
}
