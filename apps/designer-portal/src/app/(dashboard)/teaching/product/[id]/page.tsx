'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  useProduct,
  useProductStyles,
  useProductSpectrum,
  useSubmitTeaching,
} from '@patina/supabase';
import type { SpectrumValues, ProductTeachingInput } from '@patina/types';
import { StyleAttributionPanel } from '@/components/teaching/StyleAttributionPanel';
import { ClientMatchingPanel } from '@/components/teaching/ClientMatchingPanel';

interface ProductData {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  price_retail: number | null;
  source_url: string | null;
  vendor?: { id: string; name: string } | null;
}

interface ExistingStyle {
  style_id: string;
  is_primary: boolean;
  confidence: number | null;
}

type Step = 'styles' | 'clients' | 'review';

const STEPS: { id: Step; label: string }[] = [
  { id: 'styles', label: 'Style' },
  { id: 'clients', label: 'Clients' },
  { id: 'review', label: 'Review' },
];

export default function ProductTeachingPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const { data: rawProduct, isLoading: productLoading, error: productError } = useProduct(productId);
  const { data: existingStyles } = useProductStyles(productId);
  const { data: existingSpectrum } = useProductSpectrum(productId);
  const submitTeaching = useSubmitTeaching();

  const product = rawProduct as unknown as ProductData | undefined;
  const styles = (existingStyles ?? []) as unknown as ExistingStyle[];
  const spectrum = existingSpectrum as unknown as Partial<SpectrumValues> | null;

  const [currentStep, setCurrentStep] = useState<Step>('styles');

  // Pre-populate form with existing data
  const existingPrimary = styles.find((s) => s.is_primary)?.style_id ?? null;
  const existingSecondary = styles.find((s) => !s.is_primary)?.style_id ?? null;

  // Teaching form state
  const [primaryStyleId, setPrimaryStyleId] = useState<string | null>(null);
  const [secondaryStyleId, setSecondaryStyleId] = useState<string | null>(null);
  const [spectrumValues, setSpectrumValues] = useState<Partial<SpectrumValues>>({});
  const [idealClientIds, setIdealClientIds] = useState<string[]>([]);
  const [avoidanceClientIds, setAvoidanceClientIds] = useState<string[]>([]);
  const [appealSignalIds, setAppealSignalIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize form with existing data when loaded
  useEffect(() => {
    if (existingPrimary && primaryStyleId === null) {
      setPrimaryStyleId(existingPrimary);
    }
    if (existingSecondary && secondaryStyleId === null) {
      setSecondaryStyleId(existingSecondary);
    }
    if (spectrum && Object.keys(spectrumValues).length === 0) {
      setSpectrumValues(spectrum);
    }
  }, [existingPrimary, existingSecondary, spectrum, primaryStyleId, secondaryStyleId, spectrumValues]);

  // Track changes
  useEffect(() => {
    const styleChanged = primaryStyleId !== existingPrimary || secondaryStyleId !== existingSecondary;
    const spectrumChanged = Object.keys(spectrumValues).length > 0;
    const clientsChanged = idealClientIds.length > 0 || avoidanceClientIds.length > 0;
    const signalsChanged = appealSignalIds.length > 0;
    const notesChanged = notes.trim().length > 0;

    setHasChanges(styleChanged || spectrumChanged || clientsChanged || signalsChanged || notesChanged);
  }, [primaryStyleId, secondaryStyleId, spectrumValues, idealClientIds, avoidanceClientIds, appealSignalIds, notes, existingPrimary, existingSecondary]);

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

      // Navigate back to product detail
      router.push(`/products/${productId}`);
    } catch (error) {
      console.error('Failed to submit teaching:', error);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        router.back();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  if (productLoading) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-patina-clay-beige border-t-patina-mocha-brown rounded-full animate-spin mx-auto mb-4" />
          <p className="text-patina-mocha-brown">Loading product...</p>
        </div>
      </div>
    );
  }

  if (productError || !product) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <div className="text-center">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h2 className="text-2xl font-serif text-patina-charcoal mb-2">Product Not Found</h2>
          <p className="text-patina-mocha-brown mb-6">
            The product you&apos;re trying to teach doesn&apos;t exist.
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
  const hasExistingTeaching = styles.length > 0;

  return (
    <div className="min-h-screen bg-patina-off-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-patina-clay-beige/30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="text-patina-mocha-brown hover:text-patina-charcoal transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">Back</span>
          </button>

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
            {hasExistingTeaching && (
              <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                Previously taught
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Product info */}
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
                    unoptimized
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
                {product.vendor && (
                  <p className="text-sm text-patina-mocha-brown mb-2">by {product.vendor.name}</p>
                )}
                {product.price_retail && (
                  <p className="text-patina-mocha-brown">{formatPrice(product.price_retail)}</p>
                )}
                {product.description && (
                  <p className="text-sm text-patina-mocha-brown/70 mt-3 line-clamp-3">
                    {product.description}
                  </p>
                )}

                {/* Source link */}
                {product.source_url && (
                  <a
                    href={product.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-1 text-sm text-patina-mocha-brown hover:text-patina-charcoal"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    View original
                  </a>
                )}
              </div>
            </div>

            {/* Quick links */}
            <div className="mt-4 flex gap-3">
              <Link
                href={`/products/${productId}`}
                className="flex-1 py-2 px-4 border border-patina-clay-beige rounded-lg text-center text-sm text-patina-mocha-brown hover:bg-patina-clay-beige/20 transition-colors"
              >
                View Product
              </Link>
              <Link
                href="/teaching"
                className="flex-1 py-2 px-4 border border-patina-clay-beige rounded-lg text-center text-sm text-patina-mocha-brown hover:bg-patina-clay-beige/20 transition-colors"
              >
                Teaching Studio
              </Link>
            </div>
          </div>

          {/* Right: Teaching form */}
          <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
            {/* Update notice */}
            {hasExistingTeaching && (
              <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  This product has existing teaching data. Your changes will update the current classification.
                </p>
              </div>
            )}

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
                      {Object.values(spectrumValues).filter((v) => v !== null && v !== undefined).length} spectrum dimensions set
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

                  {/* Changes summary */}
                  {hasChanges && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-800">
                        You have unsaved changes that will be submitted.
                      </p>
                    </div>
                  )}
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
                    onClick={() => router.back()}
                    className="px-4 py-2 text-patina-mocha-brown/70 hover:text-patina-mocha-brown transition-colors text-sm"
                  >
                    Cancel
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
                    {submitTeaching.isPending ? 'Submitting...' : hasExistingTeaching ? 'Update Teaching' : 'Submit Teaching'}
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

      {/* Keyboard hints */}
      <footer className="fixed bottom-4 left-0 right-0 text-center pointer-events-none">
        <div className="inline-flex gap-4 text-xs text-patina-mocha-brown/40 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full">
          <span>Esc: Go back</span>
        </div>
      </footer>
    </div>
  );
}
