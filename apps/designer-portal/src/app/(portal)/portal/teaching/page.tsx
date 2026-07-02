'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDesignerTeachingStats, useTeachingQueue } from '@patina/supabase';
import {
  StrataMark,
  MetricBlock,
  LoadingStrata,
  ProductListItem,
} from '@/components/portal';
import { useHydrated } from '@/hooks/use-hydrated';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function TeachingPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [mode, setMode] = useState<'quick' | 'deep'>('quick');
  const { data: stats, isLoading: statsLoading } = useDesignerTeachingStats() as { data: Any; isLoading: boolean };
  const { data: rawQueue, isLoading: queueLoading } = useTeachingQueue() as { data: Any; isLoading: boolean };
  const queue = Array.isArray(rawQueue) ? rawQueue : [];

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || statsLoading) return <LoadingStrata />;

  const totalTaught = stats?.total_teachings ?? stats?.products_taught ?? 0;
  // `accuracy_score` is the real 0–1 fraction from designer_teaching_stats.
  // Show "—" rather than a fabricated number when the designer has no score yet.
  const accuracyScore = stats?.accuracy_score ?? stats?.accuracy ?? null;
  const accuracy = accuracyScore != null ? Math.round(accuracyScore * 100) : null;
  // Real cumulative count of future matches this designer's teaching improved.
  const matchImpact = stats?.match_impact_count ?? 0;

  return (
    <div className="pt-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="type-page-title mb-1" style={{ fontSize: '1.5rem' }}>
          Teaching Queue
        </h1>
        <span className="type-label-secondary">{queue.length} products need your expertise</span>
      </div>

      {/* Stats — quiet counts, no goals or progress meters (de-gamified, R32/R37). */}
      <div className="mb-6 flex gap-0 border-b border-[var(--border-subtle)] pb-6">
        <div className="pr-8">
          <span className="type-meta-small mb-1 block">Taught</span>
          <span className="type-data-large" style={{ fontSize: '1.8rem' }}>
            {totalTaught.toLocaleString()}
          </span>
          <div className="mt-1 font-body text-[0.72rem] text-[var(--text-muted)]">
            pieces, all time
          </div>
        </div>
        <div className="border-l border-[var(--border-subtle)] px-8">
          <span className="type-meta-small mb-1 block">Your Accuracy</span>
          <span className="type-data-large" style={{ fontSize: '1.8rem' }}>
            {accuracy != null ? `${accuracy}%` : '—'}
          </span>
        </div>
        <div className="border-l border-[var(--border-subtle)] pl-8">
          <span className="type-meta-small mb-1 block">Impact</span>
          <span className="type-data-large" style={{ fontSize: '1.8rem' }}>
            {matchImpact.toLocaleString()}
          </span>
          <div className="mt-1 font-body text-[0.72rem] text-[var(--text-muted)]">
            future matches improved
          </div>
        </div>
        <div className="ml-auto self-center">
          <Link
            href="/portal/teaching/your-eye"
            className="font-body text-[0.8rem] italic text-[var(--text-muted)] underline decoration-[var(--color-pearl)] underline-offset-2 hover:text-[var(--text-primary)]"
          >
            See your eye →
          </Link>
        </div>
      </div>

      {/* Mode Selector */}
      <div className="mb-6 flex gap-2">
        <div
          className={`flex-1 cursor-pointer rounded-md border-2 p-4 ${
            mode === 'quick'
              ? 'border-[var(--accent-primary)] bg-[rgba(196,165,123,0.04)]'
              : 'border-[var(--color-pearl)]'
          }`}
          onClick={() => setMode('quick')}
        >
          <div className="type-label mb-0.5">Quick Tags</div>
          <div className="type-label-secondary">~5 min per product · Style + basic matching</div>
        </div>
        <div
          className={`flex-1 cursor-pointer rounded-md border-2 p-4 ${
            mode === 'deep'
              ? 'border-[var(--accent-primary)] bg-[rgba(196,165,123,0.04)]'
              : 'border-[var(--color-pearl)]'
          }`}
          onClick={() => setMode('deep')}
        >
          <div className="type-label mb-0.5">Deep Analysis</div>
          <div className="type-label-secondary">~15 min per product · Full intelligence mapping</div>
        </div>
        <div
          className="flex-1 cursor-pointer rounded-md border-2 border-[var(--color-pearl)] p-4 hover:border-[var(--accent-primary)]"
          onClick={() => router.push('/portal/teaching/judgments')}
        >
          <div className="type-label mb-0.5">Side by Side</div>
          <div className="type-label-secondary">Seconds per pair · Which is more you?</div>
        </div>
      </div>

      {/* Queue List */}
      <h3 className="type-item-name mb-3 border-b border-[var(--border-subtle)] pb-2">
        Up Next
      </h3>

      {queueLoading ? (
        <LoadingStrata />
      ) : queue.length > 0 ? (
        <div>
          {queue.slice(0, 10).map((item: Any, i: number) => {
            const product = item.product || item;
            const productId = item.product_id || item.id;
            return (
              <ProductListItem
                key={productId}
                id={productId}
                name={product.name || 'Product'}
                maker={product.brand || product.vendor_name}
                tier={product.tier}
                thumbUrl={product.coverImage || product.cover_image || product.images?.[0]?.url}
                price={product.price || product.base_price || 0}
                aiScore={product.aiScore ?? product.ai_score ?? item.ai_score}
                status={product.status}
                onTeach={(id) => router.push(`/portal/teaching/product/${id}`)}
                onClick={(id) => router.push(`/portal/teaching/product/${id}`)}
              />
            );
          })}
        </div>
      ) : (
        <div className="py-12 text-center">
          <p className="mb-2 font-heading text-[1.3rem] font-normal italic text-[var(--text-muted)]">
            All caught up
          </p>
          <p className="font-body text-[0.88rem] text-[var(--text-muted)]">
            No products need teaching right now. Check back soon.
          </p>
        </div>
      )}
    </div>
  );
}
