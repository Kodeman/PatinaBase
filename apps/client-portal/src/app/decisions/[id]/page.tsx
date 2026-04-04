'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useClientDecision } from '@/hooks/use-decisions-client';
import { DecisionCardClient } from '@/components/decision-card-client';

export default function ClientDecisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: decision, isLoading } = useClientDecision(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (!decision) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="type-body-small">Decision not found.</p>
        <Link
          href="/decisions"
          className="mt-4 inline-flex items-center gap-1 type-meta text-[var(--accent-primary)] no-underline hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to decisions
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href="/decisions"
        className="mb-6 inline-flex items-center gap-1.5 type-meta no-underline transition hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Decisions
      </Link>

      <DecisionCardClient decision={decision} />
    </div>
  );
}
