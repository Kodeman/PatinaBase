'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import { useVendors } from '@/hooks/use-pipeline';
import { Skeleton } from '@/components/ui/skeleton';
import { ReviewCard } from '@/components/pipeline/review/review-card';

export default function LeahReviewPage() {
  const { data: vendors, isLoading } = useVendors({
    awaiting_leah: true,
    sort_by: 'total_score',
    sort_dir: 'desc',
  });

  const queue = useMemo(() => vendors ?? [], [vendors]);
  const [index, setIndex] = useState(0);

  const current = queue[index];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="space-y-6">
        <Link
          href="/pipeline"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to pipeline
        </Link>
        <div className="rounded-sm border border-dashed py-16 text-center">
          <ClipboardCheck className="mx-auto h-10 w-10 text-patina-success" />
          <p className="mt-3 font-display text-xl">All caught up.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No vendors are waiting on your review.
          </p>
        </div>
      </div>
    );
  }

  const handleComplete = () => {
    if (index + 1 < queue.length) {
      setIndex(index + 1);
    } else {
      // The last one was just submitted; useVendors will refetch and drop it.
      setIndex(0);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/pipeline"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to pipeline
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold tracking-tight">
            <ClipboardCheck className="h-7 w-7" />
            Leah&rsquo;s review
          </h1>
        </div>
        <div className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
          {Math.min(index + 1, queue.length)} of {queue.length}
        </div>
      </div>

      {current && <ReviewCard key={current.id} slug={current.slug} onComplete={handleComplete} />}
    </div>
  );
}
