/**
 * Compact inline form for creating a new vendor during capture
 * Includes Story and Credentials sections for capturing vendor essence
 */

import { useState } from 'react';
import type {
  ExtractedVendorData,
  VendorCaptureInput,
  ExtractedVendorStory,
  VendorCertification,
  OwnershipType,
  MarketPosition,
} from '@patina/shared/types';
import { OWNERSHIP_OPTIONS } from '@patina/shared/types';
import { CertificationChips } from './CertificationChips';

interface VendorInlineFormProps {
  initialData: Partial<ExtractedVendorData>;
  onSubmit: (vendor: VendorCaptureInput) => void;
  onSkip: () => void;
}

const MARKET_POSITIONS: { value: MarketPosition; label: string }[] = [
  { value: 'entry', label: 'Entry' },
  { value: 'mid', label: 'Mid' },
  { value: 'premium', label: 'Premium' },
  { value: 'luxury', label: 'Luxury' },
];

const CATEGORIES = [
  'Furniture',
  'Lighting',
  'Textiles',
  'Accessories',
  'Art',
  'Outdoor',
  'Kitchen & Bath',
  'Flooring',
  'Other',
];

// Collapsible section component
function CollapsibleSection({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-pearl rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-off-white hover:bg-pearl/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak">{title}</span>
          {badge && (
            <span className="px-1.5 py-0.5 font-mono text-[0.55rem] bg-sage/20 text-sage rounded-[3px]">
              {badge}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-aged-oak transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="p-3 space-y-3 bg-surface">{children}</div>}
    </div>
  );
}

// Text area with character counter
function StoryTextArea({
  label,
  value,
  onChange,
  placeholder,
  maxLength = 500,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength?: number;
}) {
  const charCount = value.length;
  const isNearLimit = charCount > maxLength * 0.8;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak">{label}</label>
        <span
          className={`font-mono text-[0.55rem] ${isNearLimit ? 'text-golden-hour' : 'text-aged-oak/50'}`}
        >
          {charCount}/{maxLength}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        placeholder={placeholder}
        rows={2}
        className="w-full px-2 py-1.5 text-[0.88rem] bg-surface border border-pearl rounded-[3px]
                   focus:border-clay focus:ring-1 focus:ring-clay
                   placeholder-aged-oak resize-none"
      />
    </div>
  );
}

export function VendorInlineForm({ initialData, onSubmit, onSkip }: VendorInlineFormProps) {
  // Core fields
  const [name, setName] = useState(initialData.name || '');
  const [website, setWebsite] = useState(initialData.website || '');
  const [marketPosition, setMarketPosition] = useState<MarketPosition | ''>('');
  const [category, setCategory] = useState('');

  // Story fields
  const [mission, setMission] = useState(initialData.story?.mission || '');
  const [philosophy, setPhilosophy] = useState(initialData.story?.philosophy || '');
  const [history, setHistory] = useState(initialData.story?.history || '');
  const [craftsmanship, setCraftsmanship] = useState(initialData.story?.craftsmanship || '');

  // Credentials fields
  const [certifications, setCertifications] = useState<VendorCertification[]>(
    initialData.certifications || []
  );
  const [ownershipType, setOwnershipType] = useState<OwnershipType | ''>(
    initialData.ownershipType || ''
  );
  const [madeIn, setMadeIn] = useState(initialData.madeIn || '');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValid = name.trim().length > 0 && website.trim().length > 0;

  // Count filled story sections
  const storyCount = [mission, philosophy, history, craftsmanship].filter(
    (s) => s.trim().length > 0
  ).length;
  const hasStoryData = storyCount > 0 || !!initialData.story;

  // Check if any credentials filled
  const credentialsCount = certifications.length + (ownershipType ? 1 : 0) + (madeIn ? 1 : 0);
  const hasCredentials = credentialsCount > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);

    // Build story object
    const story: ExtractedVendorStory = {
      mission: mission.trim() || null,
      philosophy: philosophy.trim() || null,
      history: history.trim() || null,
      craftsmanship: craftsmanship.trim() || null,
    };

    const vendorData: VendorCaptureInput = {
      // Core
      name: name.trim(),
      website: website.trim(),
      logoUrl: initialData.logoUrl || undefined,
      marketPosition: marketPosition || undefined,
      primaryCategory: category || undefined,
      contactEmail: initialData.contact?.email || undefined,
      contactPhone: initialData.contact?.phone || undefined,
      foundedYear: initialData.foundedYear || undefined,
      headquartersCity: initialData.headquarters || undefined,
      // Story
      story,
      // Credentials
      certifications: certifications.length > 0 ? certifications : undefined,
      ownershipType: ownershipType || undefined,
      madeIn: madeIn.trim() || undefined,
      // Visual
      heroImageUrl: initialData.heroImageUrl || undefined,
    };

    try {
      onSubmit(vendorData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-off-white rounded-md border border-pearl space-y-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-aged-oak" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <h4 className="font-display font-medium text-[1.1rem] text-charcoal">New Vendor</h4>
      </div>

      {/* Name & Website row */}
      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2">
        <div>
          <label className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vendor name"
            className="w-full px-2 py-1.5 text-[0.88rem] bg-surface border border-pearl rounded-[3px]
                     focus:border-clay focus:ring-1 focus:ring-clay
                     placeholder-aged-oak"
          />
        </div>
        <div>
          <label className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1">Website *</label>
          <input
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="www.example.com"
            className="w-full px-2 py-1.5 text-[0.88rem] bg-surface border border-pearl rounded-[3px]
                     focus:border-clay focus:ring-1 focus:ring-clay
                     placeholder-aged-oak"
          />
        </div>
      </div>

      {/* Market Position radio buttons */}
      <div>
        <label className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1.5">Market Position</label>
        <div className="grid grid-cols-2 gap-1 sm:flex sm:gap-1">
          {MARKET_POSITIONS.map((pos) => (
            <button
              key={pos.value}
              type="button"
              onClick={() => setMarketPosition(marketPosition === pos.value ? '' : pos.value)}
              className={`sm:flex-1 px-2 py-1.5 text-[0.78rem] font-medium rounded-[3px] transition-colors
                       ${marketPosition === pos.value
                         ? 'bg-charcoal text-off-white shadow-sm'
                         : 'bg-surface border border-pearl text-charcoal hover:border-clay'
                       }`}
            >
              {pos.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category dropdown */}
      <div>
        <label className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full px-2 py-1.5 text-[0.88rem] bg-surface border border-pearl rounded-[3px]
                   focus:border-clay focus:ring-1 focus:ring-clay
                   text-charcoal"
        >
          <option value="">Select category...</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Brand Story Section (Collapsible) */}
      <CollapsibleSection
        title="Brand Story"
        defaultOpen={hasStoryData}
        badge={storyCount > 0 ? `${storyCount}/4` : undefined}
      >
        <StoryTextArea
          label="Mission"
          value={mission}
          onChange={setMission}
          placeholder="What we do and why..."
        />
        <StoryTextArea
          label="Philosophy"
          value={philosophy}
          onChange={setPhilosophy}
          placeholder="How we approach design and craft..."
        />
        <StoryTextArea
          label="History"
          value={history}
          onChange={setHistory}
          placeholder="Our origin and journey..."
        />
        <StoryTextArea
          label="Craftsmanship"
          value={craftsmanship}
          onChange={setCraftsmanship}
          placeholder="How we make things..."
        />
      </CollapsibleSection>

      {/* Credentials Section (Collapsible) */}
      <CollapsibleSection
        title="Credentials"
        defaultOpen={hasCredentials}
        badge={credentialsCount > 0 ? `${credentialsCount}` : undefined}
      >
        {/* Certifications */}
        <div>
          <label className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1.5">Certifications</label>
          <CertificationChips
            selected={certifications}
            onChange={setCertifications}
            detected={initialData.certifications || []}
          />
        </div>

        {/* Ownership */}
        <div>
          <label className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1.5">Ownership</label>
          <div className="grid grid-cols-2 gap-1 sm:flex sm:gap-1">
            {OWNERSHIP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setOwnershipType(ownershipType === opt.value ? '' : opt.value)}
                className={`sm:flex-1 px-2 py-1.5 text-[0.78rem] font-medium rounded-[3px] transition-colors
                         ${ownershipType === opt.value
                           ? 'bg-charcoal text-off-white shadow-sm'
                           : 'bg-surface border border-pearl text-charcoal hover:border-clay'
                         }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Made In */}
        <div>
          <label className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1">Made In</label>
          <input
            type="text"
            value={madeIn}
            onChange={(e) => setMadeIn(e.target.value)}
            placeholder="USA, Italy, North Carolina..."
            className="w-full px-2 py-1.5 text-[0.88rem] bg-surface border border-pearl rounded-[3px]
                     focus:border-clay focus:ring-1 focus:ring-clay
                     placeholder-aged-oak"
          />
        </div>
      </CollapsibleSection>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          className={`flex-1 px-3 py-1.5 text-[0.85rem] font-medium rounded-[3px] transition-all
                   ${isValid && !isSubmitting
                     ? 'bg-charcoal text-off-white hover:bg-mocha shadow-sm'
                     : 'bg-pearl text-aged-oak cursor-not-allowed'
                   }`}
        >
          {isSubmitting ? 'Creating...' : 'Create & Link'}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={isSubmitting}
          className="px-3 py-1.5 text-[0.85rem] text-aged-oak hover:text-charcoal
                   transition-colors"
        >
          Skip
        </button>
      </div>
    </form>
  );
}
