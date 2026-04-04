'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProduct, useProductStyles, useProductSpectrum } from '@patina/supabase';
import {
  Breadcrumb,
  DetailRow,
  StyleTag,
  LoadingStrata,
  PortalButton,
  TeachPanel,
  SpectrumSlider,
  ImageGallery,
} from '@/components/portal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const fieldClass =
  'w-full rounded-[3px] border border-[var(--color-pearl)] bg-[var(--bg-surface)] px-3 py-2.5 font-body text-[0.85rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]';
const labelClass =
  'block font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1.5';

const allStyles = [
  'Warm Minimalist',
  'Organic Modern',
  'Midcentury Modern',
  'Scandinavian',
  'Japandi',
  'Moody Traditional',
  'Coastal Calm',
  'Bold Eclectic',
];

const lifestyleOptions = [
  'Values craft',
  'Entertains',
  'Has pets',
  'Has children',
  'Patient buyer',
  'Work from home',
];

const avoidanceOptions = [
  'Ultra-minimalist',
  'Budget under $2k',
  'Needs quick delivery',
  'High-maintenance allergic',
];

export default function TeachProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: product, isLoading } = useProduct(id) as { data: Any; isLoading: boolean };
  const { data: rawStyles } = useProductStyles(id) as { data: Any };
  const { data: spectrum } = useProductSpectrum(id) as { data: Any };

  // Teaching form state
  const [primaryStyle, setPrimaryStyle] = useState('');
  const [secondaryStyles, setSecondaryStyles] = useState<string[]>([]);
  const [spectrumValues, setSpectrumValues] = useState({
    warmth: 50,
    ornate: 50,
    formality: 50,
    timeless: 50,
    statement: 50,
    artisan: 50,
  });
  const [idealClient, setIdealClient] = useState('');
  const [lifestyleSignals, setLifestyleSignals] = useState<string[]>([]);
  const [avoidanceFlags, setAvoidanceFlags] = useState<string[]>([]);
  const [keyFeatures, setKeyFeatures] = useState('');
  const [bestContext, setBestContext] = useState('');
  const [avoidWhen, setAvoidWhen] = useState('');

  if (isLoading) return <LoadingStrata />;
  if (!product) {
    return <p className="type-body py-16 text-center text-[var(--text-muted)]">Product not found.</p>;
  }

  const images = product.images?.length
    ? product.images.map((img: Any) => ({ url: img.url, alt: img.alt }))
    : [{ url: '', alt: 'Product image' }];

  const price = product.base_price || product.price || 0;

  const toggleSecondaryStyle = (style: string) => {
    setSecondaryStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    );
  };

  const toggleLifestyle = (signal: string) => {
    setLifestyleSignals((prev) =>
      prev.includes(signal) ? prev.filter((s) => s !== signal) : [...prev, signal]
    );
  };

  const toggleAvoidance = (flag: string) => {
    setAvoidanceFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag]
    );
  };

  const updateSpectrum = (key: string) => (value: number) => {
    setSpectrumValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = (andNext: boolean) => {
    // TODO: save teaching data via API
    console.log('Save teaching:', { primaryStyle, secondaryStyles, spectrumValues, idealClient, lifestyleSignals, avoidanceFlags, keyFeatures, bestContext, avoidWhen });
    if (andNext) {
      // Navigate to next product in queue
      router.push('/portal/teaching');
    } else {
      router.push('/portal/teaching');
    }
  };

  return (
    <div className="pt-8">
      <Breadcrumb
        items={[
          { label: 'Products', href: '/portal/catalog' },
          { label: product.name, href: `/portal/catalog/${id}` },
          { label: 'Teach' },
        ]}
      />

      {/* Teaching Header */}
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="type-page-title mb-0.5" style={{ fontSize: '1.5rem' }}>
            Teach: {product.name}
          </h1>
          <span className="type-label-secondary">
            {[product.brand || product.vendor_name, product.maker_location, product.tier ? (product.tier === 'maker_piece' ? '★ Maker Piece' : product.tier === 'designers_pick' ? '✓ Pick' : '○ Sourced') : null, price ? `$${Number(price).toLocaleString()}` : null].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="type-meta-small mb-0.5">Queue</div>
            <span className="type-data-large" style={{ fontSize: '1.3rem' }}>
              4
            </span>
            <span className="ml-1 font-body text-[0.8rem] text-[var(--text-muted)]">remaining</span>
          </div>
          <div className="text-center">
            <div className="type-meta-small mb-0.5">Today&apos;s Impact</div>
            <span className="type-data-large" style={{ fontSize: '1.3rem' }}>
              12
            </span>
            <span className="ml-1 font-body text-[0.8rem] text-[var(--text-muted)]">products</span>
          </div>
        </div>
      </div>

      {/* Two-column Layout */}
      <div className="grid gap-10 md:grid-cols-2">
        {/* Left: Product Reference */}
        <div>
          <ImageGallery images={images} />

          <h3 className="type-item-name mb-3 mt-6 border-b border-[var(--border-subtle)] pb-2">
            Product Specs
          </h3>
          {product.dimensions && (
            <DetailRow
              label="Dimensions"
              value={`${product.dimensions.width}" × ${product.dimensions.depth}" × ${product.dimensions.height}"`}
            />
          )}
          {product.materials?.length > 0 && (
            <DetailRow label="Material" value={product.materials.join(', ')} />
          )}
          {product.finish && <DetailRow label="Finish" value={product.finish} />}
          {product.weight && (
            <DetailRow label="Weight" value={`${product.weight.value} ${product.weight.unit}`} />
          )}
        </div>

        {/* Right: Teaching Form */}
        <div className="space-y-6">
          {/* Style Classification */}
          <TeachPanel title="Style Classification" badge="Required">
            <div className="mb-4">
              <label className={labelClass}>Primary Style</label>
              <select className={fieldClass} value={primaryStyle} onChange={(e) => setPrimaryStyle(e.target.value)} style={{ appearance: 'none' }}>
                <option value="">Select primary style…</option>
                {allStyles.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className={labelClass}>Secondary Styles (optional)</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {allStyles.map((s) => (
                  <StyleTag
                    key={s}
                    label={s}
                    active={secondaryStyles.includes(s)}
                    onClick={() => toggleSecondaryStyle(s)}
                  />
                ))}
              </div>
            </div>

            <label className={labelClass}>Style Spectrum</label>
            <SpectrumSlider leftLabel="Cold" rightLabel="Warm" value={spectrumValues.warmth} onChange={updateSpectrum('warmth')} />
            <SpectrumSlider leftLabel="Minimal" rightLabel="Ornate" value={spectrumValues.ornate} onChange={updateSpectrum('ornate')} />
            <SpectrumSlider leftLabel="Casual" rightLabel="Formal" value={spectrumValues.formality} onChange={updateSpectrum('formality')} />
            <SpectrumSlider leftLabel="Trendy" rightLabel="Timeless" value={spectrumValues.timeless} onChange={updateSpectrum('timeless')} />
            <SpectrumSlider leftLabel="Subtle" rightLabel="Statement" value={spectrumValues.statement} onChange={updateSpectrum('statement')} />
            <SpectrumSlider leftLabel="Mass" rightLabel="Artisan" value={spectrumValues.artisan} onChange={updateSpectrum('artisan')} />
          </TeachPanel>

          {/* Client Matching */}
          <TeachPanel title="Client Matching" badge="Required">
            <div className="mb-3">
              <label className={labelClass}>Who would love this?</label>
              <textarea
                className={`${fieldClass} min-h-[60px] resize-y`}
                rows={2}
                value={idealClient}
                onChange={(e) => setIdealClient(e.target.value)}
                placeholder="Describe the ideal client for this piece…"
              />
            </div>

            <label className={labelClass}>Lifestyle Signals</label>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {lifestyleOptions.map((signal) => (
                <StyleTag
                  key={signal}
                  label={signal}
                  active={lifestyleSignals.includes(signal)}
                  onClick={() => toggleLifestyle(signal)}
                />
              ))}
            </div>

            <label className={labelClass}>Avoidance Flags</label>
            <div className="flex flex-wrap gap-1.5">
              {avoidanceOptions.map((flag) => (
                <StyleTag
                  key={flag}
                  label={flag}
                  variant="avoidance"
                  active={avoidanceFlags.includes(flag)}
                  onClick={() => toggleAvoidance(flag)}
                />
              ))}
            </div>
          </TeachPanel>

          {/* Designer Notes */}
          <TeachPanel title="Designer Notes" badge="Optional" badgeVariant="optional">
            <div className="mb-3">
              <label className={labelClass}>Key Features</label>
              <textarea
                className={`${fieldClass} min-h-[60px] resize-y`}
                rows={2}
                value={keyFeatures}
                onChange={(e) => setKeyFeatures(e.target.value)}
                placeholder="What stands out about this piece? What should other designers know?"
              />
            </div>
            <div className="mb-3">
              <label className={labelClass}>Best Context</label>
              <input className={fieldClass} value={bestContext} onChange={(e) => setBestContext(e.target.value)} placeholder="e.g. Living room or entry credenza. Needs 5' clear wall." />
            </div>
            <div>
              <label className={labelClass}>Avoid When</label>
              <input className={fieldClass} value={avoidWhen} onChange={(e) => setAvoidWhen(e.target.value)} placeholder="e.g. Too deep for narrow hallways." />
            </div>
          </TeachPanel>

          {/* Actions */}
          <div className="flex flex-wrap gap-2.5">
            <PortalButton
              variant="primary"
              className="bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)]"
              onClick={() => handleSave(true)}
            >
              Save & Next Product →
            </PortalButton>
            <PortalButton variant="secondary" onClick={() => handleSave(false)}>
              Save & Close
            </PortalButton>
            <PortalButton variant="ghost" onClick={() => router.push('/portal/teaching')}>
              Skip Product
            </PortalButton>
          </div>
        </div>
      </div>
    </div>
  );
}
