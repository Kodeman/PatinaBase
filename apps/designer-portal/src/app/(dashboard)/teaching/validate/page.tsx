'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  useValidationQueue,
  useProductStyles,
  useProductSpectrum,
  useSubmitValidation,
  useStyleArchetypes,
} from '@patina/supabase';
import type { ValidationVote, SpectrumValues } from '@patina/types';
import { StyleSpectrumSlider } from '@/components/teaching/StyleSpectrumSlider';

// Queue item shape
interface QueueItem {
  id: string;
  product_id: string;
  product: {
    id: string;
    name: string;
    images: string[];
    price_retail: number | null;
  } | null;
  status: string;
}

interface StyleAssignment {
  id: string;
  style_id: string;
  is_primary: boolean;
  confidence: number;
  style: {
    id: string;
    name: string;
    color_hex: string | null;
  } | null;
}

export default function ValidationPage() {
  const router = useRouter();
  const { data: queue, isLoading: queueLoading, refetch } = useValidationQueue();
  const { data: archetypes } = useStyleArchetypes();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [selectedVote, setSelectedVote] = useState<ValidationVote | null>(null);
  const [adjustments, setAdjustments] = useState<{
    primaryStyleId?: string;
    secondaryStyleId?: string;
    spectrum?: Partial<SpectrumValues>;
  }>({});
  const [flagReason, setFlagReason] = useState('');
  const [showAdjustPanel, setShowAdjustPanel] = useState(false);

  const submitValidation = useSubmitValidation();

  const queueItems = queue as QueueItem[] | undefined;
  const currentItem = queueItems?.[currentIndex];
  const product = currentItem?.product;
  const productId = product?.id;
  const hasMoreProducts = currentIndex < (queueItems?.length ?? 0) - 1;

  // Fetch existing teaching data for current product
  const { data: existingStyles } = useProductStyles(productId ?? '');
  const { data: existingSpectrum } = useProductSpectrum(productId ?? '');

  const primaryStyle = (existingStyles as StyleAssignment[] | undefined)?.find((s) => s.is_primary);
  const secondaryStyle = (existingStyles as StyleAssignment[] | undefined)?.find((s) => !s.is_primary);

  const formatPrice = (cents: number | null) => {
    if (!cents) return null;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const resetForm = useCallback(() => {
    setSelectedVote(null);
    setAdjustments({});
    setFlagReason('');
    setShowAdjustPanel(false);
  }, []);

  const handleVoteSelect = (vote: ValidationVote) => {
    setSelectedVote(vote);
    if (vote === 'adjust') {
      setShowAdjustPanel(true);
    } else {
      setShowAdjustPanel(false);
    }
    if (vote !== 'flag') {
      setFlagReason('');
    }
  };

  const handleSubmit = async () => {
    if (!productId || !selectedVote) return;

    try {
      await submitValidation.mutateAsync({
        productId,
        vote: selectedVote,
        adjustments: selectedVote === 'adjust' ? adjustments : undefined,
        flagReason: selectedVote === 'flag' ? flagReason : undefined,
      });

      setSessionCount((prev) => prev + 1);

      if (hasMoreProducts) {
        setCurrentIndex((prev) => prev + 1);
        resetForm();
      } else {
        refetch();
        resetForm();
        setCurrentIndex(0);
      }
    } catch (error) {
      console.error('Failed to submit validation:', error);
    }
  };

  const handleSkip = () => {
    if (hasMoreProducts) {
      setCurrentIndex((prev) => prev + 1);
      resetForm();
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        router.push('/teaching');
      }
      if (e.key === '1') handleVoteSelect('confirm');
      if (e.key === '2') handleVoteSelect('adjust');
      if (e.key === '3') handleVoteSelect('flag');
      if (e.key === 'Enter' && selectedVote && !showAdjustPanel) {
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router, selectedVote, showAdjustPanel]);

  const canSubmit =
    selectedVote === 'confirm' ||
    (selectedVote === 'adjust' && (adjustments.primaryStyleId || adjustments.spectrum)) ||
    (selectedVote === 'flag' && flagReason.trim().length > 0);

  if (queueLoading) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-patina-clay-beige border-t-patina-mocha-brown rounded-full animate-spin mx-auto mb-4" />
          <p className="text-patina-mocha-brown">Loading validation queue...</p>
        </div>
      </div>
    );
  }

  if (!queueItems || queueItems.length === 0) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <div className="text-center">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-green-500"
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
          <h2 className="text-2xl font-serif text-patina-charcoal mb-2">All Validated!</h2>
          <p className="text-patina-mocha-brown mb-6">
            No products waiting for validation right now.
          </p>
          <Link
            href="/teaching"
            className="px-6 py-3 bg-patina-mocha-brown text-white rounded-lg hover:bg-patina-charcoal transition-colors"
          >
            Back to Teaching Studio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-patina-off-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-patina-clay-beige/30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href="/teaching"
            className="text-patina-mocha-brown hover:text-patina-charcoal transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Link>

          <div className="text-center">
            <p className="text-sm text-patina-mocha-brown/70">Validation Mode</p>
            <p className="text-patina-charcoal font-medium">
              {currentIndex + 1} / {queueItems.length}
            </p>
          </div>

          <div className="text-right">
            <p className="text-sm text-patina-mocha-brown/70">Session</p>
            <p className="text-patina-charcoal font-medium">{sessionCount} validated</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-patina-clay-beige/30">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / queueItems.length) * 100}%` }}
          />
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {product && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Product + Current Classification */}
            <div className="space-y-6">
              {/* Product card */}
              <div className="bg-white rounded-lg border border-patina-clay-beige/30 overflow-hidden">
                <div className="relative aspect-square bg-patina-off-white">
                  {product.images?.[0] ? (
                    <Image
                      src={product.images[0]}
                      alt={product.name}
                      fill
                      className="object-contain"
                      sizes="(max-width: 1024px) 100vw, 50vw"
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
                <div className="p-4">
                  <h2 className="text-lg font-medium text-patina-charcoal">{product.name}</h2>
                  {product.price_retail && (
                    <p className="text-patina-mocha-brown">{formatPrice(product.price_retail)}</p>
                  )}
                </div>
              </div>

              {/* Current classification */}
              <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
                <h3 className="font-medium text-patina-charcoal mb-4">Current Classification</h3>

                {/* Styles */}
                <div className="mb-6">
                  <p className="text-sm text-patina-mocha-brown/70 mb-2">Assigned Styles</p>
                  <div className="flex flex-wrap gap-2">
                    {primaryStyle?.style && (
                      <span
                        className="px-3 py-1.5 rounded-full text-sm font-medium bg-patina-mocha-brown text-white"
                        style={primaryStyle.style.color_hex ? { backgroundColor: primaryStyle.style.color_hex } : undefined}
                      >
                        {primaryStyle.style.name}
                        <span className="ml-1 text-xs opacity-75">(Primary)</span>
                      </span>
                    )}
                    {secondaryStyle?.style && (
                      <span
                        className="px-3 py-1.5 rounded-full text-sm bg-patina-clay-beige/30 text-patina-charcoal"
                        style={secondaryStyle.style.color_hex ? { backgroundColor: `${secondaryStyle.style.color_hex}30` } : undefined}
                      >
                        {secondaryStyle.style.name}
                        <span className="ml-1 text-xs opacity-75">(Secondary)</span>
                      </span>
                    )}
                    {!primaryStyle && !secondaryStyle && (
                      <span className="text-patina-mocha-brown/50 text-sm">No styles assigned</span>
                    )}
                  </div>
                </div>

                {/* Spectrum preview */}
                {existingSpectrum && (
                  <div>
                    <p className="text-sm text-patina-mocha-brown/70 mb-2">Style Spectrum</p>
                    <div className="space-y-2 opacity-75">
                      {(['warmth', 'complexity', 'formality', 'timelessness', 'boldness', 'craftsmanship'] as const).map((dim) => {
                        const value = (existingSpectrum as Record<string, number | null>)[dim];
                        if (value === null || value === undefined) return null;

                        const position = ((value + 1) / 2) * 100;
                        return (
                          <div key={dim} className="flex items-center gap-2">
                            <span className="text-xs text-patina-mocha-brown w-24 capitalize">{dim}</span>
                            <div className="flex-1 h-2 bg-patina-clay-beige/30 rounded-full relative">
                              <div
                                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-patina-mocha-brown rounded-full"
                                style={{ left: `calc(${position}% - 6px)` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Validation form */}
            <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
              <h3 className="font-medium text-patina-charcoal mb-6">Your Validation</h3>

              {/* Vote options */}
              <div className="space-y-3 mb-6">
                <VoteOption
                  vote="confirm"
                  label="Confirm"
                  description="The classification looks correct"
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  }
                  color="green"
                  isSelected={selectedVote === 'confirm'}
                  onSelect={() => handleVoteSelect('confirm')}
                  shortcut="1"
                />

                <VoteOption
                  vote="adjust"
                  label="Adjust"
                  description="I have minor corrections"
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  }
                  color="amber"
                  isSelected={selectedVote === 'adjust'}
                  onSelect={() => handleVoteSelect('adjust')}
                  shortcut="2"
                />

                <VoteOption
                  vote="flag"
                  label="Flag for Review"
                  description="This needs expert attention"
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
                      />
                    </svg>
                  }
                  color="red"
                  isSelected={selectedVote === 'flag'}
                  onSelect={() => handleVoteSelect('flag')}
                  shortcut="3"
                />
              </div>

              {/* Adjustment panel */}
              {showAdjustPanel && (
                <div className="border-t border-patina-clay-beige/30 pt-6 mb-6">
                  <h4 className="text-sm font-medium text-patina-charcoal mb-4">Your Adjustments</h4>

                  {/* Style adjustment */}
                  <div className="mb-6">
                    <p className="text-xs text-patina-mocha-brown/70 mb-2">Suggested Primary Style</p>
                    <div className="flex flex-wrap gap-2">
                      {((archetypes ?? []) as unknown as Array<{ id: string; name: string; color_hex: string | null }>).map((style) => (
                        <button
                          key={style.id}
                          onClick={() => setAdjustments((prev) => ({ ...prev, primaryStyleId: style.id }))}
                          className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                            adjustments.primaryStyleId === style.id
                              ? 'bg-patina-mocha-brown text-white'
                              : 'bg-patina-clay-beige/30 text-patina-charcoal hover:bg-patina-clay-beige/50'
                          }`}
                        >
                          {style.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Spectrum adjustment */}
                  <div>
                    <p className="text-xs text-patina-mocha-brown/70 mb-2">Spectrum Adjustments (optional)</p>
                    <StyleSpectrumSlider
                      values={adjustments.spectrum || {}}
                      onChange={(spectrum) => setAdjustments((prev) => ({ ...prev, spectrum }))}
                      showDescriptions={false}
                    />
                  </div>
                </div>
              )}

              {/* Flag reason */}
              {selectedVote === 'flag' && (
                <div className="border-t border-patina-clay-beige/30 pt-6 mb-6">
                  <label className="block">
                    <span className="text-sm font-medium text-patina-charcoal">Reason for flagging *</span>
                    <textarea
                      value={flagReason}
                      onChange={(e) => setFlagReason(e.target.value)}
                      placeholder="Please explain why this product needs expert review..."
                      rows={3}
                      className="mt-2 w-full px-3 py-2 border border-patina-clay-beige/50 rounded-lg focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown resize-none"
                    />
                  </label>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-patina-clay-beige/30">
                <button
                  onClick={handleSkip}
                  className="text-patina-mocha-brown/70 hover:text-patina-mocha-brown transition-colors text-sm"
                >
                  Skip product
                </button>

                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitValidation.isPending}
                  className="px-6 py-2 bg-patina-mocha-brown text-white rounded-lg hover:bg-patina-charcoal transition-colors disabled:opacity-50"
                >
                  {submitValidation.isPending ? 'Submitting...' : 'Submit Validation'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Keyboard hints */}
      <footer className="fixed bottom-4 left-0 right-0 text-center">
        <div className="inline-flex gap-4 text-xs text-patina-mocha-brown/50 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full">
          <span>1: Confirm</span>
          <span>2: Adjust</span>
          <span>3: Flag</span>
          <span>Esc: Exit</span>
        </div>
      </footer>
    </div>
  );
}

interface VoteOptionProps {
  vote: ValidationVote;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: 'green' | 'amber' | 'red';
  isSelected: boolean;
  onSelect: () => void;
  shortcut: string;
}

function VoteOption({
  vote,
  label,
  description,
  icon,
  color,
  isSelected,
  onSelect,
  shortcut,
}: VoteOptionProps) {
  const colorClasses = {
    green: {
      selected: 'border-green-500 bg-green-50',
      icon: 'bg-green-500 text-white',
      hover: 'hover:border-green-300',
    },
    amber: {
      selected: 'border-amber-500 bg-amber-50',
      icon: 'bg-amber-500 text-white',
      hover: 'hover:border-amber-300',
    },
    red: {
      selected: 'border-red-500 bg-red-50',
      icon: 'bg-red-500 text-white',
      hover: 'hover:border-red-300',
    },
  };

  const classes = colorClasses[color];

  return (
    <button
      onClick={onSelect}
      className={`w-full p-4 rounded-lg border-2 transition-all flex items-center gap-4 text-left ${
        isSelected ? classes.selected : `border-patina-clay-beige/50 ${classes.hover}`
      }`}
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center ${
          isSelected ? classes.icon : 'bg-patina-clay-beige/30 text-patina-mocha-brown'
        }`}
      >
        {icon}
      </div>
      <div className="flex-1">
        <p className="font-medium text-patina-charcoal">{label}</p>
        <p className="text-sm text-patina-mocha-brown/70">{description}</p>
      </div>
      <span className="text-xs text-patina-mocha-brown/50 bg-patina-clay-beige/30 px-2 py-1 rounded">
        {shortcut}
      </span>
    </button>
  );
}
