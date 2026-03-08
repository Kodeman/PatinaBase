'use client';

import Link from 'next/link';
import { useDesignerTeachingStats, useTeachingQueue } from '@patina/supabase';
import { TeachingModeCard } from '@/components/teaching/TeachingModeCard';
import { ImpactStats } from '@/components/teaching/ImpactStats';

const TEACHING_MODES = [
  {
    id: 'quick_tags',
    title: 'Quick Tags',
    description: 'Rapid style classification with swipe gestures. Perfect for building initial coverage.',
    icon: 'zap',
    href: '/teaching/quick',
    color: 'bg-amber-500',
    estimate: '~15 sec/product',
  },
  {
    id: 'deep_analysis',
    title: 'Deep Analysis',
    description: 'Comprehensive teaching with spectrum sliders and client matching. For nuanced products.',
    icon: 'microscope',
    href: '/teaching/deep',
    color: 'bg-blue-500',
    estimate: '~2 min/product',
  },
  {
    id: 'validation',
    title: 'Validation',
    description: 'Review and validate classifications made by other designers. Build consensus.',
    icon: 'check-circle',
    href: '/teaching/validate',
    color: 'bg-green-500',
    estimate: '~30 sec/product',
  },
] as const;

export default function TeachingDashboardPage() {
  const { data: stats, isLoading: statsLoading } = useDesignerTeachingStats();
  const { data: queue, isLoading: queueLoading } = useTeachingQueue({ status: ['pending'], limit: 5 });

  const pendingCount = queue?.length ?? 0;

  return (
    <div className="px-8 py-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-serif text-patina-charcoal mb-2">Teaching Studio</h1>
          <p className="text-patina-mocha-brown max-w-2xl">
            Help train the style intelligence by classifying products. Your expertise directly improves
            client-product matching for the entire community.
          </p>
        </div>

        {/* Impact Stats */}
        <ImpactStats stats={stats} isLoading={statsLoading} />

        {/* Teaching Modes */}
        <div className="mb-12">
          <h2 className="text-lg font-medium text-patina-charcoal mb-4">Choose Your Mode</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TEACHING_MODES.map((mode) => (
              <TeachingModeCard key={mode.id} mode={mode} />
            ))}
          </div>
        </div>

        {/* Quick Start / Queue Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pending Queue */}
          <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-patina-charcoal">Teaching Queue</h3>
              <span className="px-2 py-1 text-xs bg-patina-clay-beige/30 rounded-full text-patina-charcoal">
                {pendingCount} pending
              </span>
            </div>

            {queueLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-12 h-12 bg-patina-clay-beige/30 rounded" />
                    <div className="flex-1">
                      <div className="h-4 bg-patina-clay-beige/30 rounded w-3/4 mb-1" />
                      <div className="h-3 bg-patina-clay-beige/30 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : queue && queue.length > 0 ? (
              <div className="space-y-3">
                {(queue as Array<{ id: string; product: unknown; priority: string }>).slice(0, 5).map((item) => {
                  const product = item.product as { id: string; name: string; images: string[]; price_retail: number | null } | null;
                  if (!product) return null;

                  return (
                    <Link
                      key={item.id}
                      href={`/teaching/product/${product.id}`}
                      className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-patina-off-white transition-colors"
                    >
                      <div className="w-12 h-12 bg-patina-clay-beige/20 rounded overflow-hidden flex-shrink-0">
                        {product.images?.[0] && (
                          <img
                            src={product.images[0]}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-patina-charcoal truncate">
                          {product.name}
                        </p>
                        <p className="text-xs text-patina-mocha-brown">
                          {item.priority === 'high' ? 'High priority' : 'Normal priority'}
                        </p>
                      </div>
                      <svg
                        className="w-5 h-5 text-patina-clay-beige"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6">
                <svg
                  className="w-12 h-12 mx-auto text-patina-clay-beige mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-patina-mocha-brown text-sm">All caught up!</p>
                <p className="text-patina-mocha-brown/70 text-xs mt-1">
                  No products waiting for teaching
                </p>
              </div>
            )}

            {queue && queue.length > 0 && (
              <Link
                href="/teaching/quick"
                className="mt-4 block w-full py-2 text-center text-sm text-patina-mocha-brown hover:text-patina-charcoal transition-colors"
              >
                Start teaching →
              </Link>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
            <h3 className="font-medium text-patina-charcoal mb-4">Your Achievements</h3>

            {stats?.badges && stats.badges.length > 0 ? (
              <div className="grid grid-cols-3 gap-4">
                {(stats.badges as Array<{ id: string; name: string; iconName: string }>).map((badge) => (
                  <div
                    key={badge.id}
                    className="text-center p-3 bg-patina-off-white rounded-lg"
                  >
                    <div className="w-10 h-10 mx-auto mb-2 bg-patina-mocha-brown/10 rounded-full flex items-center justify-center">
                      <span className="text-lg">🏆</span>
                    </div>
                    <p className="text-xs font-medium text-patina-charcoal">{badge.name}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto mb-3 bg-patina-clay-beige/20 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-patina-clay-beige"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                    />
                  </svg>
                </div>
                <p className="text-patina-mocha-brown text-sm">No badges yet</p>
                <p className="text-patina-mocha-brown/70 text-xs mt-1">
                  Start teaching to earn your first badge
                </p>
              </div>
            )}

            {/* Badge hints */}
            <div className="mt-6 pt-4 border-t border-patina-clay-beige/30">
              <p className="text-xs text-patina-mocha-brown/70 mb-2">Upcoming badges:</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-patina-mocha-brown">
                  <span className="opacity-50">🎯</span>
                  <span>First Steps: Teach 10 products</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-patina-mocha-brown">
                  <span className="opacity-50">⭐</span>
                  <span>Style Expert: 50+ products with 90% accuracy</span>
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}
