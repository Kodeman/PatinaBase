'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDesignerTeachingStats, useTeachingQueue } from '@patina/supabase';
import {
  StrataMark,
  MetricBlock,
  LoadingStrata,
  ProductListItem,
  PortalButton,
} from '@/components/portal';
import { ProgressBar } from '@/components/portal/progress-bar';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function TeachingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'quick' | 'deep'>('quick');
  const { data: stats, isLoading: statsLoading } = useDesignerTeachingStats() as { data: Any; isLoading: boolean };
  const { data: rawQueue, isLoading: queueLoading } = useTeachingQueue() as { data: Any; isLoading: boolean };
  const queue = Array.isArray(rawQueue) ? rawQueue : [];

  if (statsLoading) return <LoadingStrata />;

  const totalTaught = stats?.total_teachings ?? stats?.products_taught ?? 0;
  const accuracy = stats?.accuracy ? Math.round(stats.accuracy * 100) : 94;
  const dailyGoal = 20;
  const todayProgress = stats?.today_count ?? Math.min(totalTaught, dailyGoal);

  return (
    <div className="pt-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="type-page-title mb-1" style={{ fontSize: '1.5rem' }}>
          Teaching Queue
        </h1>
        <span className="type-label-secondary">{queue.length} products need your expertise</span>
      </div>

      {/* Daily Stats */}
      <div className="mb-6 flex gap-0 border-b border-[var(--border-subtle)] pb-6">
        <div className="pr-8">
          <span className="type-meta-small mb-1 block">Today&apos;s Progress</span>
          <span className="type-data-large" style={{ fontSize: '1.8rem' }}>
            {todayProgress}
            <span className="ml-1 font-body text-[0.8rem] font-normal text-[var(--text-muted)]">
              of {dailyGoal} goal
            </span>
          </span>
          <div className="mt-2 w-[120px]">
            <ProgressBar progress={(todayProgress / dailyGoal) * 100} />
          </div>
        </div>
        <div className="border-l border-[var(--border-subtle)] px-8">
          <span className="type-meta-small mb-1 block">Your Accuracy</span>
          <span className="type-data-large" style={{ fontSize: '1.8rem' }}>
            {accuracy}%
          </span>
          <div className="mt-1 font-body text-[0.72rem] text-[var(--color-sage)]">
            ↑ 1.4% this week
          </div>
        </div>
        <div className="border-l border-[var(--border-subtle)] pl-8">
          <span className="type-meta-small mb-1 block">Impact</span>
          <span className="type-data-large" style={{ fontSize: '1.8rem' }}>
            847
          </span>
          <div className="mt-1 font-body text-[0.72rem] text-[var(--text-muted)]">
            future matches improved
          </div>
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
