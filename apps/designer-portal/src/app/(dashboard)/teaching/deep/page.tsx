'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  useTeachingQueue,
  useSubmitTeaching,
} from '@patina/supabase';
import type { SpectrumValues, ProductTeachingInput } from '@patina/types';
import { StyleAttributionPanel } from '@/components/teaching/StyleAttributionPanel';
import { ClientMatchingPanel } from '@/components/teaching/ClientMatchingPanel';

// Queue item shape - types are approximate until db types are regenerated
interface QueueItem {
  id: string;
  product: {
    id: string;
    name: string;
    images: string[];
    price_retail: number | null;
    description: string | null;
  } | null;
  priority: string;
}

type Step = 'styles' | 'clients' | 'review';

const STEPS: { id: Step; label: string }[] = [
  { id: 'styles', label: 'Style' },
  { id: 'clients', label: 'Clients' },
  { id: 'review', label: 'Review' },
];

export default function DeepAnalysisPage() {
  const router = useRouter();
  const { data: queue, isLoading, refetch } = useTeachingQueue({
    status: ['pending'],
    requiresDeepAnalysis: true,
    limit: 10,
  });
  const submitTeaching = useSubmitTeaching();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentStep, setCurrentStep] = useState<Step>('styles');
  const [sessionCount, setSessionCount] = useState(0);

  // Teaching form state
  const [primaryStyleId, setPrimaryStyleId] = useState<string | null>(null);
  const [secondaryStyleId, setSecondaryStyleId] = useState<string | null>(null);
  const [spectrumValues, setSpectrumValues] = useState<Partial<SpectrumValues>>({});
  const [idealClientIds, setIdealClientIds] = useState<string[]>([]);
  const [avoidanceClientIds, setAvoidanceClientIds] = useState<string[]>([]);
  const [appealSignalIds, setAppealSignalIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  const queueItems = queue as QueueItem[] | undefined;
  const currentItem = queueItems?.[currentIndex];
  const product = currentItem?.product;
  const hasMoreProducts = currentIndex < (queueItems?.length ?? 0) - 1;

  const resetForm = () => {
    setPrimaryStyleId(null);
    setSecondaryStyleId(null);
    setSpectrumValues({});
    setIdealClientIds([]);
    setAvoidanceClientIds([]);
    setAppealSignalIds([]);
    setNotes('');
    setCurrentStep('styles');
  };

  const formatPrice = (cents: number | null) => {
    if (!cents) return null;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const canProceedFromStyles = primaryStyleId !== null;
  const canSubmit = primaryStyleId !== null;

  const handleNext = () => {
    const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentStepIndex + 1].id);
    }
  };

  const handleBack = () => {
    const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);
    if (currentStepIndex > 0) {
      setCurrentStep(STEPS[currentStepIndex - 1].id);
    }
  };

  const handleSubmit = async () => {
    if (!product || !canSubmit) return;

    const teaching: ProductTeachingInput = {
      primaryStyleId: primaryStyleId!,
      secondaryStyleId: secondaryStyleId || undefined,
      spectrum: Object.keys(spectrumValues).length > 0 ? spectrumValues : undefined,
      idealClientIds: idealClientIds.length > 0 ? idealClientIds : undefined,
      avoidanceClientIds: avoidanceClientIds.length > 0 ? avoidanceClientIds : undefined,
      appealSignalIds: appealSignalIds.length > 0 ? appealSignalIds : undefined,
      notes: notes.trim() || undefined,
    };

    try {
      await submitTeaching.mutateAsync({
        productId: product.id,
        teaching,
      });

      setSessionCount((prev) => prev + 1);

      if (hasMoreProducts) {
        setCurrentIndex((prev) => prev + 1);
        resetForm();
      } else {
        refetch();
        resetForm();
      }
    } catch (error) {
      console.error('Failed to submit teaching:', error);
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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-patina-clay-beige border-t-patina-mocha-brown rounded-full animate-spin mx-auto mb-4" />
          <p className="text-patina-mocha-brown">Loading teaching session...</p>
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
          <h2 className="text-2xl font-serif text-patina-charcoal mb-2">Queue Empty</h2>
          <p className="text-patina-mocha-brown mb-6">
            No products requiring deep analysis right now.
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

  const stepIndex = STEPS.findIndex((s) => s.id === currentStep);

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

          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => setCurrentStep(step.id)}
                  className={`px-3 py-1 text-sm rounded-full transition-colors ${
                    currentStep === step.id
                      ? 'bg-patina-mocha-brown text-white'
                      : index < stepIndex
                      ? 'bg-green-100 text-green-700'
                      : 'bg-patina-clay-beige/30 text-patina-mocha-brown'
                  }`}
                >
                  {step.label}
                </button>
                {index < STEPS.length - 1 && (
                  <div className="w-8 h-px bg-patina-clay-beige mx-1" />
                )}
              </div>
            ))}
          </div>

          <div className="text-right">
            <p className="text-sm text-patina-mocha-brown/70">Session: {sessionCount} complete</p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Product info */}
          {product && (
            <div className="lg:sticky lg:top-24 self-start">
              <div className="bg-white rounded-lg border border-patina-clay-beige/30 overflow-hidden">
                {/* Image */}
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

                {/* Info */}
                <div className="p-4">
                  <h2 className="text-lg font-medium text-patina-charcoal mb-1">{product.name}</h2>
                  {product.price_retail && (
                    <p className="text-patina-mocha-brown">{formatPrice(product.price_retail)}</p>
                  )}
                  {product.description && (
                    <p className="text-sm text-patina-mocha-brown/70 mt-2 line-clamp-3">
                      {product.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Queue position */}
              <p className="text-sm text-patina-mocha-brown/70 mt-4 text-center">
                Product {currentIndex + 1} of {queueItems.length} in queue
              </p>
            </div>
          )}

          {/* Right: Teaching form */}
          <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
            {/* Styles step */}
            {currentStep === 'styles' && (
              <StyleAttributionPanel
                primaryStyleId={primaryStyleId}
                secondaryStyleId={secondaryStyleId}
                spectrumValues={spectrumValues}
                onPrimaryChange={setPrimaryStyleId}
                onSecondaryChange={setSecondaryStyleId}
                onSpectrumChange={setSpectrumValues}
                showSpectrum={true}
              />
            )}

            {/* Clients step */}
            {currentStep === 'clients' && (
              <ClientMatchingPanel
                idealClientIds={idealClientIds}
                avoidanceClientIds={avoidanceClientIds}
                appealSignalIds={appealSignalIds}
                onIdealClientsChange={setIdealClientIds}
                onAvoidanceClientsChange={setAvoidanceClientIds}
                onAppealSignalsChange={setAppealSignalIds}
              />
            )}

            {/* Review step */}
            {currentStep === 'review' && (
              <div className="space-y-6">
                <h3 className="font-medium text-patina-charcoal">Review & Submit</h3>

                <div className="space-y-4">
                  <div className="p-4 bg-patina-off-white/50 rounded-lg">
                    <p className="text-sm font-medium text-patina-charcoal mb-2">Style Classification</p>
                    <p className="text-sm text-patina-mocha-brown">
                      Primary: {primaryStyleId ? 'Selected' : 'Not set'}
                      {secondaryStyleId && ' | Secondary: Selected'}
                    </p>
                    <p className="text-xs text-patina-mocha-brown/70 mt-1">
                      {Object.values(spectrumValues).filter((v) => v !== null).length} spectrum dimensions set
                    </p>
                  </div>

                  <div className="p-4 bg-patina-off-white/50 rounded-lg">
                    <p className="text-sm font-medium text-patina-charcoal mb-2">Client Matching</p>
                    <p className="text-sm text-patina-mocha-brown">
                      {idealClientIds.length} ideal clients | {avoidanceClientIds.length} to avoid
                    </p>
                    <p className="text-xs text-patina-mocha-brown/70 mt-1">
                      {appealSignalIds.length} appeal signals selected
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-patina-charcoal mb-2">
                      Additional Notes (optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any additional observations about this product..."
                      rows={3}
                      className="w-full px-3 py-2 border border-patina-clay-beige/50 rounded-lg focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown resize-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-patina-clay-beige/30">
              <div>
                {stepIndex > 0 ? (
                  <button
                    onClick={handleBack}
                    className="px-4 py-2 text-patina-mocha-brown hover:text-patina-charcoal transition-colors"
                  >
                    ← Back
                  </button>
                ) : (
                  <button
                    onClick={handleSkip}
                    className="px-4 py-2 text-patina-mocha-brown/70 hover:text-patina-mocha-brown transition-colors text-sm"
                  >
                    Skip product
                  </button>
                )}
              </div>

              <div className="flex gap-3">
                {currentStep === 'review' ? (
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit || submitTeaching.isPending}
                    className="px-6 py-2 bg-patina-mocha-brown text-white rounded-lg hover:bg-patina-charcoal transition-colors disabled:opacity-50"
                  >
                    {submitTeaching.isPending ? 'Submitting...' : 'Submit Teaching'}
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    disabled={currentStep === 'styles' && !canProceedFromStyles}
                    className="px-6 py-2 bg-patina-mocha-brown text-white rounded-lg hover:bg-patina-charcoal transition-colors disabled:opacity-50"
                  >
                    Continue →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
