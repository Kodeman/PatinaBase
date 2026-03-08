'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  useTeachingQueue,
  useStyleArchetypes,
  useAssignStyle,
} from '@patina/supabase';

// Queue item shape - types are approximate until db types are regenerated
interface QueueItem {
  id: string;
  product: {
    id: string;
    name: string;
    images: string[];
    price_retail: number | null;
  } | null;
  priority: string;
}

export default function QuickTagsPage() {
  const router = useRouter();
  const { data: queue, isLoading: queueLoading, refetch } = useTeachingQueue({
    status: ['pending'],
    limit: 20,
  });
  const { data: styles, isLoading: stylesLoading } = useStyleArchetypes();
  const assignStyle = useAssignStyle();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const queueItems = queue as QueueItem[] | undefined;
  const currentItem = queueItems?.[currentIndex];
  const product = currentItem?.product;
  const hasMoreProducts = currentIndex < (queueItems?.length ?? 0) - 1;

  const formatPrice = (cents: number | null) => {
    if (!cents) return null;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const handleStyleSelect = useCallback(
    async (styleId: string) => {
      if (!product || isTransitioning) return;

      setSelectedStyleId(styleId);
      setIsTransitioning(true);

      try {
        await assignStyle.mutateAsync({
          productId: product.id,
          styleId,
          isPrimary: true,
          confidence: 1.0,
        });

        setSessionCount((prev) => prev + 1);

        // Brief delay to show selection before moving on
        setTimeout(() => {
          if (hasMoreProducts) {
            setCurrentIndex((prev) => prev + 1);
          } else {
            // Refetch queue or show completion
            refetch();
          }
          setSelectedStyleId(null);
          setIsTransitioning(false);
        }, 300);
      } catch (error) {
        console.error('Failed to assign style:', error);
        setSelectedStyleId(null);
        setIsTransitioning(false);
      }
    },
    [product, assignStyle, hasMoreProducts, isTransitioning, refetch]
  );

  const handleSkip = useCallback(() => {
    if (isTransitioning) return;

    setIsTransitioning(true);
    setTimeout(() => {
      if (hasMoreProducts) {
        setCurrentIndex((prev) => prev + 1);
      }
      setIsTransitioning(false);
    }, 200);
  }, [hasMoreProducts, isTransitioning]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        router.push('/teaching');
      }
      if (e.key === 's' || e.key === 'S') {
        handleSkip();
      }
      // Number keys 1-9 for quick style selection
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9 && styles && (styles as { id: string }[]).length >= num) {
        handleStyleSelect((styles as { id: string }[])[num - 1].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router, handleSkip, handleStyleSelect, styles]);

  const isLoading = queueLoading || stylesLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-patina-charcoal flex items-center justify-center">
        <div className="text-white text-center">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p>Loading teaching session...</p>
        </div>
      </div>
    );
  }

  if (!queueItems || queueItems.length === 0) {
    return (
      <div className="min-h-screen bg-patina-charcoal flex items-center justify-center">
        <div className="text-center text-white">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h2 className="text-2xl font-serif mb-2">All Caught Up!</h2>
          <p className="text-white/70 mb-6">No products waiting for quick tags.</p>
          <Link
            href="/teaching"
            className="px-6 py-3 bg-white text-patina-charcoal rounded-lg hover:bg-patina-off-white transition-colors"
          >
            Back to Teaching Studio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-patina-charcoal">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-10 bg-patina-charcoal/90 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/teaching" className="text-white/70 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Link>

          <div className="text-center">
            <p className="text-sm text-white/50">Quick Tags</p>
            <p className="text-white font-medium">
              {currentIndex + 1} / {queueItems.length}
            </p>
          </div>

          <div className="text-right">
            <p className="text-sm text-white/50">Session</p>
            <p className="text-white font-medium">{sessionCount} tagged</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-white/10">
          <div
            className="h-full bg-amber-500 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / queueItems.length) * 100}%` }}
          />
        </div>
      </header>

      {/* Main content */}
      <main className="pt-24 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Product display */}
          {product && (
            <div
              className={`transition-all duration-300 ${
                isTransitioning ? 'opacity-50 scale-95' : 'opacity-100 scale-100'
              }`}
            >
              {/* Image */}
              <div className="relative aspect-square max-w-md mx-auto mb-6 rounded-xl overflow-hidden bg-white">
                {product.images?.[0] ? (
                  <Image
                    src={product.images[0]}
                    alt={product.name}
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, 400px"
                    priority
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-patina-clay-beige">
                    <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                )}
              </div>

              {/* Product info */}
              <div className="text-center mb-8">
                <h2 className="text-xl font-medium text-white mb-1">{product.name}</h2>
                {product.price_retail && (
                  <p className="text-white/60">{formatPrice(product.price_retail)}</p>
                )}
              </div>

              {/* Style buttons */}
              <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mb-6">
                {(((styles ?? []) as unknown as { id: string; name: string; color_hex: string | null }[])).map((style, index) => (
                  <button
                    key={style.id}
                    onClick={() => handleStyleSelect(style.id)}
                    disabled={isTransitioning}
                    className={`relative py-4 px-3 rounded-lg text-center transition-all ${
                      selectedStyleId === style.id
                        ? 'bg-green-500 text-white scale-105'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    } disabled:opacity-50`}
                  >
                    {/* Keyboard shortcut hint */}
                    {index < 9 && (
                      <span className="absolute top-1 left-2 text-xs text-white/40">
                        {index + 1}
                      </span>
                    )}

                    {/* Color indicator */}
                    {style.color_hex && (
                      <div
                        className="w-4 h-4 rounded-full mx-auto mb-2"
                        style={{ backgroundColor: style.color_hex }}
                      />
                    )}

                    <span className="text-sm font-medium">{style.name}</span>
                  </button>
                ))}
              </div>

              {/* Skip button */}
              <div className="text-center">
                <button
                  onClick={handleSkip}
                  disabled={isTransitioning}
                  className="text-white/50 hover:text-white transition-colors text-sm"
                >
                  Skip (S) →
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Keyboard hints */}
      <footer className="fixed bottom-4 left-0 right-0 text-center">
        <div className="inline-flex gap-4 text-xs text-white/40">
          <span>1-9: Select style</span>
          <span>S: Skip</span>
          <span>Esc: Exit</span>
        </div>
      </footer>
    </div>
  );
}
