'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  useClaimNextProduct,
  useProductSpectrum,
  useSaveSpectrum,
  useProductDnaDraft,
  resolveSpectrumPrefill,
  summarizeDraftFacts,
} from '@patina/supabase';
import { Button } from '@/components/ui/controls';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { SpectrumSlider } from '@/components/portal/spectrum-slider';
import { useToast } from '@/components/portal/toast-provider';
import { EngineFirstReadNote } from '../_components/engine-first-read';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function DeepAnalysisPage() {
  // useClaimNextProduct is a MUTATION (claiming a product is a write). Trigger it
  // once on mount to atomically claim the next-in-queue deep-analysis product for
  // the current designer; the claimed queue row (with joined product) is the
  // mutation result.
  const claim = useClaimNextProduct('deep_analysis');
  const { mutate: claimNext } = claim;
  useEffect(() => {
    claimNext();
  }, [claimNext]);
  const product = claim.data as Any;
  const isLoading = claim.isPending;
  const productId = product?.product_id || product?.id;
  const { data: spectrum } = useProductSpectrum(productId) as { data: Any };
  // §5.2 canonical-else-draft: when no designer-confirmed spectrum row exists,
  // prefill the sliders from the Engine's newest draft — quietly marked below.
  const { data: dnaDraft } = useProductDnaDraft(productId);
  const saveSpectrum = useSaveSpectrum();
  const { toast } = useToast();

  // Sliders are 0..100; the DB stores -1..1. Seed initial slider values from
  // the canonical spectrum when it exists, else the draft (-1..1 → 0..100).
  const [spectrumValues, setSpectrumValues] = useState({
    warmth: 50,
    ornate: 50,
    formality: 50,
    timeless: 50,
    statement: 50,
    artisan: 50,
  });
  const touchedRef = useRef(false);

  const prefill = resolveSpectrumPrefill(spectrum ?? null, dnaDraft?.draft ?? null);

  useEffect(() => {
    // Never fight the designer: once they move a slider, data arrivals stop
    // reseeding the form.
    if (touchedRef.current) return;
    if (prefill.source === 'none') return;
    const toSlider = (v: number | null | undefined) =>
      v == null ? 50 : Math.round((v + 1) * 50);
    setSpectrumValues({
      warmth: toSlider(prefill.values.warmth),
      ornate: toSlider(prefill.values.complexity),
      formality: toSlider(prefill.values.formality),
      timeless: toSlider(prefill.values.timelessness),
      statement: toSlider(prefill.values.boldness),
      artisan: toSlider(prefill.values.craftsmanship),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spectrum, dnaDraft]);

  const updateSpectrum = (key: string) => (value: number) => {
    touchedRef.current = true;
    setSpectrumValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (!productId) return;
    // slider 0..100 → db -1..1, mirroring the load mapping above.
    const toDb = (slider: number) => (slider - 50) / 50;
    saveSpectrum.mutate(
      {
        productId,
        spectrum: {
          warmth: toDb(spectrumValues.warmth),
          complexity: toDb(spectrumValues.ornate),
          formality: toDb(spectrumValues.formality),
          timelessness: toDb(spectrumValues.timeless),
          boldness: toDb(spectrumValues.statement),
          craftsmanship: toDb(spectrumValues.artisan),
        },
      },
      {
        onSuccess: () => toast('Analysis saved.', 'success'),
        onError: (err: Any) => toast(err?.message || 'Failed to save analysis.', 'error'),
      }
    );
  };

  if (isLoading) return <LoadingStrata />;

  return (
    <div className="pt-8">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/teaching">← Teaching</Link>
        </Button>
      </div>

      <h1 className="type-section-head mb-6">Deep Analysis</h1>

      {product ? (
        <div>
          <span className="type-item-name">{product.product?.name || product.name || 'Product'}</span>
          {product.product?.description && (
            <p className="type-body mt-2 mb-6 max-w-[640px]">{product.product.description}</p>
          )}

          <div className="mt-4 max-w-[480px]">
            {prefill.source === 'draft' && (
              <EngineFirstReadNote facts={summarizeDraftFacts(dnaDraft?.draft)} />
            )}
            <SpectrumSlider leftLabel="Cold" rightLabel="Warm" value={spectrumValues.warmth} onChange={updateSpectrum('warmth')} />
            <SpectrumSlider leftLabel="Minimal" rightLabel="Ornate" value={spectrumValues.ornate} onChange={updateSpectrum('ornate')} />
            <SpectrumSlider leftLabel="Casual" rightLabel="Formal" value={spectrumValues.formality} onChange={updateSpectrum('formality')} />
            <SpectrumSlider leftLabel="Trendy" rightLabel="Timeless" value={spectrumValues.timeless} onChange={updateSpectrum('timeless')} />
            <SpectrumSlider leftLabel="Subtle" rightLabel="Statement" value={spectrumValues.statement} onChange={updateSpectrum('statement')} />
            <SpectrumSlider leftLabel="Mass" rightLabel="Artisan" value={spectrumValues.artisan} onChange={updateSpectrum('artisan')} />
          </div>

          <div className="mt-6">
            <Button variant="primary" onClick={handleSave} disabled={saveSpectrum.isPending || !productId}>
              {saveSpectrum.isPending ? 'Saving...' : 'Save Analysis'}
            </Button>
          </div>
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
          No products in queue for deep analysis. Check back soon.
        </p>
      )}
    </div>
  );
}
