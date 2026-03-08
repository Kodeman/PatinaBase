/**
 * Full vendor capture form for vendor mode
 * Used when capturing vendor/brand information from their website
 */

import { useState, useEffect } from 'react';
import type {
  ExtractedVendorData,
  VendorCaptureInput,
  ExtractedVendorStory,
  VendorCertification,
  OwnershipType,
  MarketPosition,
  ProductionModel,
} from '@patina/shared/types';
import { OWNERSHIP_OPTIONS } from '@patina/shared/types';
import { CertificationChips } from './CertificationChips';

interface VendorCaptureFormProps {
  extractedVendorData: ExtractedVendorData | null;
  currentUrl: string;
  onSave: (vendor: VendorCaptureInput) => Promise<void>;
  isSaving: boolean;
  saveSuccess: boolean;
}

const MARKET_POSITIONS: { value: MarketPosition; label: string; description: string }[] = [
  { value: 'entry', label: 'Entry', description: 'Budget-friendly, accessible' },
  { value: 'mid', label: 'Mid', description: 'Balance of quality & value' },
  { value: 'premium', label: 'Premium', description: 'Higher quality, designer' },
  { value: 'luxury', label: 'Luxury', description: 'Top tier, exclusive' },
];

const PRODUCTION_MODELS: { value: ProductionModel; label: string; description: string }[] = [
  { value: 'stock', label: 'Stock', description: 'Ready to ship' },
  { value: 'mto', label: 'Made to Order', description: '4-12 week lead time' },
  { value: 'custom', label: 'Custom', description: 'Bespoke, made for you' },
  { value: 'mixed', label: 'Mixed', description: 'Combination' },
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
  'Rugs',
  'Wallcoverings',
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
    <div className="border border-patina-clay-beige/30 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-patina-soft-cream/50 hover:bg-patina-soft-cream transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-patina-charcoal">{title}</span>
          {badge && (
            <span className="px-1.5 py-0.5 text-[10px] bg-patina-sage-green/20 text-patina-sage-green rounded-full">
              {badge}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-patina-mocha-brown transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="p-3 space-y-3 bg-white">{children}</div>}
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
        <label className="text-xs text-patina-mocha-brown">{label}</label>
        <span
          className={`text-[10px] ${isNearLimit ? 'text-amber-600' : 'text-patina-mocha-brown/50'}`}
        >
          {charCount}/{maxLength}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 text-sm bg-white border border-patina-clay-beige/50 rounded-lg
                   focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown
                   placeholder-patina-mocha-brown/40 resize-none outline-none"
      />
    </div>
  );
}

export function VendorCaptureForm({
  extractedVendorData,
  currentUrl,
  onSave,
  isSaving,
  saveSuccess,
}: VendorCaptureFormProps) {
  // Core identity fields
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');

  // Business details
  const [marketPosition, setMarketPosition] = useState<MarketPosition | ''>('');
  const [productionModel, setProductionModel] = useState<ProductionModel | ''>('');
  const [category, setCategory] = useState('');
  const [foundedYear, setFoundedYear] = useState('');
  const [headquartersCity, setHeadquartersCity] = useState('');
  const [headquartersState, setHeadquartersState] = useState('');

  // Contact & social
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [pinterest, setPinterest] = useState('');
  const [facebook, setFacebook] = useState('');

  // Story fields
  const [mission, setMission] = useState('');
  const [philosophy, setPhilosophy] = useState('');
  const [history, setHistory] = useState('');
  const [craftsmanship, setCraftsmanship] = useState('');

  // Credentials
  const [certifications, setCertifications] = useState<VendorCertification[]>([]);
  const [ownershipType, setOwnershipType] = useState<OwnershipType | ''>('');
  const [madeIn, setMadeIn] = useState('');

  // Notes
  const [notes, setNotes] = useState('');

  // Pre-fill from extracted data
  useEffect(() => {
    if (extractedVendorData) {
      setName(extractedVendorData.name || '');
      setWebsite(extractedVendorData.website || '');
      setLogoUrl(extractedVendorData.logoUrl || '');
      setHeroImageUrl(extractedVendorData.heroImageUrl || '');
      setContactEmail(extractedVendorData.contact?.email || '');
      setContactPhone(extractedVendorData.contact?.phone || '');
      setInstagram(extractedVendorData.socialLinks?.instagram || '');
      setPinterest(extractedVendorData.socialLinks?.pinterest || '');
      setFacebook(extractedVendorData.socialLinks?.facebook || '');
      setFoundedYear(extractedVendorData.foundedYear?.toString() || '');
      if (extractedVendorData.headquarters) {
        const parts = extractedVendorData.headquarters.split(',').map(s => s.trim());
        if (parts.length >= 1) setHeadquartersCity(parts[0]);
        if (parts.length >= 2) setHeadquartersState(parts[1]);
      }
      setMission(extractedVendorData.story?.mission || '');
      setPhilosophy(extractedVendorData.story?.philosophy || '');
      setHistory(extractedVendorData.story?.history || '');
      setCraftsmanship(extractedVendorData.story?.craftsmanship || '');
      setCertifications(extractedVendorData.certifications || []);
      setOwnershipType(extractedVendorData.ownershipType || '');
      setMadeIn(extractedVendorData.madeIn || '');
    } else {
      // Extract website from current URL
      try {
        const hostname = new URL(currentUrl).hostname.replace(/^www\./, '');
        setWebsite(hostname);
      } catch {
        // Invalid URL
      }
    }
  }, [extractedVendorData, currentUrl]);

  const isValid = name.trim().length > 0 && website.trim().length > 0;

  // Count filled story sections
  const storyCount = [mission, philosophy, history, craftsmanship].filter(
    (s) => s.trim().length > 0
  ).length;

  // Count credentials
  const credentialsCount = certifications.length + (ownershipType ? 1 : 0) + (madeIn ? 1 : 0);

  // Count contact fields
  const contactCount = [contactEmail, contactPhone, instagram, pinterest, facebook].filter(
    (s) => s.trim().length > 0
  ).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSaving) return;

    const story: ExtractedVendorStory = {
      mission: mission.trim() || null,
      philosophy: philosophy.trim() || null,
      history: history.trim() || null,
      craftsmanship: craftsmanship.trim() || null,
    };

    const vendorData: VendorCaptureInput = {
      name: name.trim(),
      website: website.trim(),
      logoUrl: logoUrl.trim() || undefined,
      heroImageUrl: heroImageUrl.trim() || undefined,
      marketPosition: marketPosition || undefined,
      productionModel: productionModel || undefined,
      primaryCategory: category || undefined,
      contactEmail: contactEmail.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      instagram: instagram.trim() || undefined,
      pinterest: pinterest.trim() || undefined,
      facebook: facebook.trim() || undefined,
      foundedYear: foundedYear ? parseInt(foundedYear) : undefined,
      headquartersCity: headquartersCity.trim() || undefined,
      headquartersState: headquartersState.trim() || undefined,
      story,
      certifications: certifications.length > 0 ? certifications : undefined,
      ownershipType: ownershipType || undefined,
      madeIn: madeIn.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    await onSave(vendorData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header info */}
      <div className="p-3 bg-patina-clay-beige/10 rounded-lg border border-patina-clay-beige/30">
        <p className="text-xs text-patina-mocha-brown">
          Capturing vendor information from this website. Fill in what you know - you can always update later.
        </p>
      </div>

      {/* Core Identity */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-patina-charcoal flex items-center gap-2">
          <svg className="w-4 h-4 text-patina-mocha-brown" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Core Identity
        </h3>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-patina-charcoal mb-1">
            Vendor Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter vendor name"
            className="w-full px-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                     focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none"
          />
        </div>

        {/* Website */}
        <div>
          <label className="block text-sm font-medium text-patina-charcoal mb-1">
            Website <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="www.example.com"
            className="w-full px-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                     focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none"
          />
        </div>

        {/* Logo URL */}
        <div>
          <label className="block text-sm font-medium text-patina-charcoal mb-1">
            Logo URL <span className="text-patina-mocha-brown/50">(optional)</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                       focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none"
            />
            {logoUrl && (
              <div className="w-10 h-10 rounded border border-patina-clay-beige/50 overflow-hidden">
                <img src={logoUrl} alt="Logo preview" className="w-full h-full object-contain" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Business Details */}
      <CollapsibleSection title="Business Details" defaultOpen={true}>
        {/* Market Position */}
        <div>
          <label className="block text-sm font-medium text-patina-charcoal mb-2">Market Position</label>
          <div className="grid grid-cols-2 gap-2">
            {MARKET_POSITIONS.map((pos) => (
              <button
                key={pos.value}
                type="button"
                onClick={() => setMarketPosition(marketPosition === pos.value ? '' : pos.value)}
                className={`px-3 py-2 text-left rounded-lg border transition-colors
                         ${marketPosition === pos.value
                           ? 'bg-patina-mocha-brown text-white border-patina-mocha-brown shadow-patina-sm'
                           : 'bg-white border-patina-clay-beige/50 text-patina-charcoal hover:border-patina-mocha-brown'
                         }`}
              >
                <span className="text-sm font-medium">{pos.label}</span>
                <p className={`text-xs mt-0.5 ${marketPosition === pos.value ? 'text-white/80' : 'text-patina-mocha-brown/60'}`}>
                  {pos.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Production Model */}
        <div>
          <label className="block text-sm font-medium text-patina-charcoal mb-2">Production Model</label>
          <div className="grid grid-cols-2 gap-2">
            {PRODUCTION_MODELS.map((model) => (
              <button
                key={model.value}
                type="button"
                onClick={() => setProductionModel(productionModel === model.value ? '' : model.value)}
                className={`px-3 py-2 text-left rounded-lg border transition-colors
                         ${productionModel === model.value
                           ? 'bg-patina-mocha-brown text-white border-patina-mocha-brown shadow-patina-sm'
                           : 'bg-white border-patina-clay-beige/50 text-patina-charcoal hover:border-patina-mocha-brown'
                         }`}
              >
                <span className="text-sm font-medium">{model.label}</span>
                <p className={`text-xs mt-0.5 ${productionModel === model.value ? 'text-white/80' : 'text-patina-mocha-brown/60'}`}>
                  {model.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-patina-charcoal mb-1">Primary Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-patina-clay-beige/50 rounded-lg
                     focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown
                     text-patina-charcoal outline-none"
          >
            <option value="">Select category...</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Founded Year & Headquarters */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-patina-mocha-brown mb-1">Founded</label>
            <input
              type="text"
              value={foundedYear}
              onChange={(e) => setFoundedYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="1985"
              className="w-full px-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                       focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-patina-mocha-brown mb-1">City</label>
            <input
              type="text"
              value={headquartersCity}
              onChange={(e) => setHeadquartersCity(e.target.value)}
              placeholder="New York"
              className="w-full px-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                       focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-patina-mocha-brown mb-1">State</label>
            <input
              type="text"
              value={headquartersState}
              onChange={(e) => setHeadquartersState(e.target.value)}
              placeholder="NY"
              className="w-full px-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                       focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Brand Story */}
      <CollapsibleSection
        title="Brand Story"
        defaultOpen={storyCount > 0}
        badge={storyCount > 0 ? `${storyCount}/4` : undefined}
      >
        <StoryTextArea
          label="Mission"
          value={mission}
          onChange={setMission}
          placeholder="What they do and why..."
        />
        <StoryTextArea
          label="Philosophy"
          value={philosophy}
          onChange={setPhilosophy}
          placeholder="How they approach design and craft..."
        />
        <StoryTextArea
          label="History"
          value={history}
          onChange={setHistory}
          placeholder="Their origin and journey..."
        />
        <StoryTextArea
          label="Craftsmanship"
          value={craftsmanship}
          onChange={setCraftsmanship}
          placeholder="How they make things..."
        />
      </CollapsibleSection>

      {/* Contact & Social */}
      <CollapsibleSection
        title="Contact & Social"
        defaultOpen={contactCount > 0}
        badge={contactCount > 0 ? `${contactCount}` : undefined}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-patina-mocha-brown mb-1">Email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="contact@..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                       focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-patina-mocha-brown mb-1">Phone</label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="(555) 555-5555"
              className="w-full px-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                       focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-patina-mocha-brown mb-1">Instagram</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-patina-mocha-brown/50 text-sm">@</span>
            <input
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value.replace(/^@/, ''))}
              placeholder="username"
              className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                       focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-patina-mocha-brown mb-1">Pinterest</label>
            <input
              type="text"
              value={pinterest}
              onChange={(e) => setPinterest(e.target.value)}
              placeholder="pinterest.com/..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                       focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-patina-mocha-brown mb-1">Facebook</label>
            <input
              type="text"
              value={facebook}
              onChange={(e) => setFacebook(e.target.value)}
              placeholder="facebook.com/..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                       focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Credentials */}
      <CollapsibleSection
        title="Credentials"
        defaultOpen={credentialsCount > 0}
        badge={credentialsCount > 0 ? `${credentialsCount}` : undefined}
      >
        {/* Certifications */}
        <div>
          <label className="block text-sm font-medium text-patina-charcoal mb-2">Certifications</label>
          <CertificationChips
            selected={certifications}
            onChange={setCertifications}
            detected={extractedVendorData?.certifications || []}
          />
        </div>

        {/* Ownership */}
        <div>
          <label className="block text-sm font-medium text-patina-charcoal mb-2">Ownership</label>
          <div className="grid grid-cols-2 gap-2">
            {OWNERSHIP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setOwnershipType(ownershipType === opt.value ? '' : opt.value)}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors
                         ${ownershipType === opt.value
                           ? 'bg-patina-mocha-brown text-white border-patina-mocha-brown shadow-patina-sm'
                           : 'bg-white border-patina-clay-beige/50 text-patina-charcoal hover:border-patina-mocha-brown'
                         }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Made In */}
        <div>
          <label className="block text-sm font-medium text-patina-charcoal mb-1">Made In</label>
          <input
            type="text"
            value={madeIn}
            onChange={(e) => setMadeIn(e.target.value)}
            placeholder="USA, Italy, North Carolina..."
            className="w-full px-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                     focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none"
          />
        </div>
      </CollapsibleSection>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-patina-charcoal mb-1">
          Notes <span className="text-patina-mocha-brown/50">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 500))}
          placeholder="Any additional notes about this vendor..."
          rows={3}
          maxLength={500}
          className="w-full px-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                   focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none resize-none"
        />
        <p className="text-xs text-patina-mocha-brown/50 text-right">{notes.length}/500</p>
      </div>

      {/* Validation message */}
      {!isValid && (
        <p className="text-xs text-amber-600">
          Name and website are required to save.
        </p>
      )}
    </form>
  );
}
