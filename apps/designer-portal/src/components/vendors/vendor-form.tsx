'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@patina/supabase';
import { cn } from '@/lib/utils';
import type { MarketPosition, ProductionModel, OwnershipType } from '@patina/types';

interface VendorFormData {
  name: string;
  website: string;
  logoUrl: string;
  marketPosition: MarketPosition | '';
  productionModel: ProductionModel | '';
  foundedYear: string;
  ownership: OwnershipType | '';
  headquartersCity: string;
  headquartersState: string;
  primaryCategory: string;
  tradeTerms: string;
  notes: string;
}

interface VendorFormProps {
  mode: 'create' | 'edit';
  initialData?: Partial<VendorFormData> & { id?: string };
  onSuccess?: (vendorId: string) => void;
  onCancel?: () => void;
}

const INITIAL_FORM_DATA: VendorFormData = {
  name: '',
  website: '',
  logoUrl: '',
  marketPosition: '',
  productionModel: '',
  foundedYear: '',
  ownership: '',
  headquartersCity: '',
  headquartersState: '',
  primaryCategory: '',
  tradeTerms: '',
  notes: '',
};

const MARKET_POSITIONS: { value: MarketPosition; label: string }[] = [
  { value: 'entry', label: 'Entry' },
  { value: 'mid', label: 'Mid-Range' },
  { value: 'premium', label: 'Premium' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'ultra-luxury', label: 'Ultra-Luxury' },
];

const PRODUCTION_MODELS: { value: ProductionModel; label: string }[] = [
  { value: 'stock', label: 'In-Stock / Quick Ship' },
  { value: 'mto', label: 'Made to Order' },
  { value: 'custom', label: 'Full Custom' },
  { value: 'mixed', label: 'Mixed (Stock + MTO)' },
];

const OWNERSHIP_TYPES: { value: OwnershipType; label: string }[] = [
  { value: 'family', label: 'Family-Owned' },
  { value: 'private', label: 'Private' },
  { value: 'pe-backed', label: 'PE-Backed' },
  { value: 'public', label: 'Public' },
];

const CATEGORIES = [
  'Seating',
  'Tables',
  'Storage',
  'Lighting',
  'Outdoor',
  'Bedroom',
  'Textiles',
  'Accessories',
  'Rugs',
  'Art',
  'Kitchen & Bath',
  'Office',
];

export function VendorForm({
  mode,
  initialData,
  onSuccess,
  onCancel,
}: VendorFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<VendorFormData>(() => ({
    ...INITIAL_FORM_DATA,
    ...initialData,
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof VendorFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(initialData?.logoUrl || null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = createBrowserClient();

  // Validate form
  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof VendorFormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Vendor name is required';
    }

    if (formData.website && formData.website.trim()) {
      try {
        new URL(formData.website);
      } catch {
        newErrors.website = 'Please enter a valid URL';
      }
    }

    if (formData.foundedYear) {
      const year = parseInt(formData.foundedYear, 10);
      if (isNaN(year) || year < 1800 || year > new Date().getFullYear()) {
        newErrors.foundedYear = 'Please enter a valid year';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle logo upload
  const handleLogoUpload = async (file: File) => {
    setIsUploadingLogo(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('vendor-logos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Logo upload error:', error);
        setErrors((prev) => ({ ...prev, logoUrl: 'Failed to upload logo' }));
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('vendor-logos')
        .getPublicUrl(data.path);

      setFormData((prev) => ({ ...prev, logoUrl: publicUrlData.publicUrl }));
      setLogoPreview(publicUrlData.publicUrl);
    } catch (err) {
      console.error('Logo upload error:', err);
      setErrors((prev) => ({ ...prev, logoUrl: 'Failed to upload logo' }));
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Show preview immediately
      setLogoPreview(URL.createObjectURL(file));
      handleLogoUpload(file);
    }
    e.target.value = '';
  };

  const removeLogo = () => {
    setFormData((prev) => ({ ...prev, logoUrl: '' }));
    setLogoPreview(null);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      // Build the vendor data
      const vendorData = {
        name: formData.name.trim(),
        website: formData.website.trim() || null,
        logo_url: formData.logoUrl || null,
        market_position: formData.marketPosition || null,
        production_model: formData.productionModel || null,
        founded_year: formData.foundedYear ? parseInt(formData.foundedYear, 10) : null,
        ownership: formData.ownership || null,
        headquarters_city: formData.headquartersCity.trim() || null,
        headquarters_state: formData.headquartersState.trim() || null,
        primary_category: formData.primaryCategory || null,
        trade_terms: formData.tradeTerms.trim() || null,
        notes: formData.notes.trim() || null,
      };

      if (mode === 'create') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from('vendors')
          .insert(vendorData)
          .select()
          .single();

        if (error) throw error;

        const vendorId = (data as { id: string }).id;
        if (onSuccess) {
          onSuccess(vendorId);
        } else {
          router.push(`/vendors/${vendorId}`);
        }
      } else if (initialData?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('vendors')
          .update(vendorData)
          .eq('id', initialData.id);

        if (error) throw error;

        if (onSuccess) {
          onSuccess(initialData.id);
        } else {
          router.push(`/vendors/${initialData.id}`);
        }
      }
    } catch (error) {
      console.error('Failed to save vendor:', error);
      setErrors({ name: 'Failed to save vendor. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Basic Information */}
      <section className="space-y-4">
        <h3 className="font-display text-lg font-semibold text-patina-charcoal">
          Basic Information
        </h3>

        {/* Logo */}
        <div>
          <label className="block text-sm font-medium text-patina-charcoal mb-2">
            Logo
          </label>
          <div className="flex items-start gap-4">
            {logoPreview ? (
              <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-patina-clay-beige/30">
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="w-full h-full object-cover"
                />
                {isUploadingLogo && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                    <div className="animate-spin w-5 h-5 border-2 border-patina-mocha-brown border-t-transparent rounded-full" />
                  </div>
                )}
                {!isUploadingLogo && (
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="absolute top-1 right-1 p-1 bg-white rounded-full shadow hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-20 h-20 border-2 border-dashed border-patina-clay-beige/50 rounded-lg flex flex-col items-center justify-center text-patina-clay-beige hover:border-patina-mocha-brown hover:text-patina-mocha-brown transition-colors"
              >
                <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs">Upload</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            {errors.logoUrl && <p className="text-sm text-red-600">{errors.logoUrl}</p>}
          </div>
        </div>

        {/* Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-patina-charcoal mb-1">
            Vendor Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            className={cn(
              'w-full px-4 py-3 border rounded-lg transition-colors',
              'focus:outline-none focus:ring-1 focus:ring-patina-mocha-brown focus:border-patina-mocha-brown',
              errors.name ? 'border-red-300' : 'border-patina-clay-beige/50'
            )}
            placeholder="e.g., Restoration Hardware"
          />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
        </div>

        {/* Website */}
        <div>
          <label htmlFor="website" className="block text-sm font-medium text-patina-charcoal mb-1">
            Website
          </label>
          <input
            id="website"
            type="url"
            value={formData.website}
            onChange={(e) => setFormData((prev) => ({ ...prev, website: e.target.value }))}
            className={cn(
              'w-full px-4 py-3 border rounded-lg transition-colors',
              'focus:outline-none focus:ring-1 focus:ring-patina-mocha-brown focus:border-patina-mocha-brown',
              errors.website ? 'border-red-300' : 'border-patina-clay-beige/50'
            )}
            placeholder="https://www.example.com"
          />
          {errors.website && <p className="mt-1 text-sm text-red-600">{errors.website}</p>}
        </div>

        {/* Primary Category */}
        <div>
          <label htmlFor="primaryCategory" className="block text-sm font-medium text-patina-charcoal mb-1">
            Primary Category
          </label>
          <select
            id="primaryCategory"
            value={formData.primaryCategory}
            onChange={(e) => setFormData((prev) => ({ ...prev, primaryCategory: e.target.value }))}
            className="w-full px-4 py-3 border border-patina-clay-beige/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-patina-mocha-brown focus:border-patina-mocha-brown bg-white"
          >
            <option value="">Select a category</option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Business Details */}
      <section className="space-y-4">
        <h3 className="font-display text-lg font-semibold text-patina-charcoal">
          Business Details
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Market Position */}
          <div>
            <label htmlFor="marketPosition" className="block text-sm font-medium text-patina-charcoal mb-1">
              Market Position
            </label>
            <select
              id="marketPosition"
              value={formData.marketPosition}
              onChange={(e) => setFormData((prev) => ({ ...prev, marketPosition: e.target.value as MarketPosition | '' }))}
              className="w-full px-4 py-3 border border-patina-clay-beige/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-patina-mocha-brown focus:border-patina-mocha-brown bg-white"
            >
              <option value="">Select market position</option>
              {MARKET_POSITIONS.map((pos) => (
                <option key={pos.value} value={pos.value}>
                  {pos.label}
                </option>
              ))}
            </select>
          </div>

          {/* Production Model */}
          <div>
            <label htmlFor="productionModel" className="block text-sm font-medium text-patina-charcoal mb-1">
              Production Model
            </label>
            <select
              id="productionModel"
              value={formData.productionModel}
              onChange={(e) => setFormData((prev) => ({ ...prev, productionModel: e.target.value as ProductionModel | '' }))}
              className="w-full px-4 py-3 border border-patina-clay-beige/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-patina-mocha-brown focus:border-patina-mocha-brown bg-white"
            >
              <option value="">Select production model</option>
              {PRODUCTION_MODELS.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
          </div>

          {/* Founded Year */}
          <div>
            <label htmlFor="foundedYear" className="block text-sm font-medium text-patina-charcoal mb-1">
              Founded Year
            </label>
            <input
              id="foundedYear"
              type="number"
              min="1800"
              max={new Date().getFullYear()}
              value={formData.foundedYear}
              onChange={(e) => setFormData((prev) => ({ ...prev, foundedYear: e.target.value }))}
              className={cn(
                'w-full px-4 py-3 border rounded-lg transition-colors',
                'focus:outline-none focus:ring-1 focus:ring-patina-mocha-brown focus:border-patina-mocha-brown',
                errors.foundedYear ? 'border-red-300' : 'border-patina-clay-beige/50'
              )}
              placeholder="e.g., 1998"
            />
            {errors.foundedYear && <p className="mt-1 text-sm text-red-600">{errors.foundedYear}</p>}
          </div>

          {/* Ownership */}
          <div>
            <label htmlFor="ownership" className="block text-sm font-medium text-patina-charcoal mb-1">
              Ownership Type
            </label>
            <select
              id="ownership"
              value={formData.ownership}
              onChange={(e) => setFormData((prev) => ({ ...prev, ownership: e.target.value as OwnershipType | '' }))}
              className="w-full px-4 py-3 border border-patina-clay-beige/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-patina-mocha-brown focus:border-patina-mocha-brown bg-white"
            >
              <option value="">Select ownership type</option>
              {OWNERSHIP_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Location */}
      <section className="space-y-4">
        <h3 className="font-display text-lg font-semibold text-patina-charcoal">
          Headquarters Location
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="headquartersCity" className="block text-sm font-medium text-patina-charcoal mb-1">
              City
            </label>
            <input
              id="headquartersCity"
              type="text"
              value={formData.headquartersCity}
              onChange={(e) => setFormData((prev) => ({ ...prev, headquartersCity: e.target.value }))}
              className="w-full px-4 py-3 border border-patina-clay-beige/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-patina-mocha-brown focus:border-patina-mocha-brown"
              placeholder="e.g., High Point"
            />
          </div>

          <div>
            <label htmlFor="headquartersState" className="block text-sm font-medium text-patina-charcoal mb-1">
              State / Region
            </label>
            <input
              id="headquartersState"
              type="text"
              value={formData.headquartersState}
              onChange={(e) => setFormData((prev) => ({ ...prev, headquartersState: e.target.value }))}
              className="w-full px-4 py-3 border border-patina-clay-beige/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-patina-mocha-brown focus:border-patina-mocha-brown"
              placeholder="e.g., North Carolina"
            />
          </div>
        </div>
      </section>

      {/* Additional Info */}
      <section className="space-y-4">
        <h3 className="font-display text-lg font-semibold text-patina-charcoal">
          Additional Information
        </h3>

        {/* Trade Terms */}
        <div>
          <label htmlFor="tradeTerms" className="block text-sm font-medium text-patina-charcoal mb-1">
            Trade Terms
          </label>
          <textarea
            id="tradeTerms"
            value={formData.tradeTerms}
            onChange={(e) => setFormData((prev) => ({ ...prev, tradeTerms: e.target.value }))}
            rows={3}
            className="w-full px-4 py-3 border border-patina-clay-beige/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-patina-mocha-brown focus:border-patina-mocha-brown"
            placeholder="Information about trade pricing, application requirements, etc."
          />
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-patina-charcoal mb-1">
            Notes
          </label>
          <textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
            rows={2}
            className="w-full px-4 py-3 border border-patina-clay-beige/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-patina-mocha-brown focus:border-patina-mocha-brown"
            placeholder="Any additional notes about this vendor..."
          />
        </div>
      </section>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-patina-clay-beige/20">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 text-patina-charcoal hover:bg-patina-off-white rounded-lg transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || isUploadingLogo}
          className={cn(
            'px-6 py-3 rounded-lg font-medium transition-colors',
            'bg-patina-charcoal text-white hover:bg-patina-mocha-brown',
            (isSubmitting || isUploadingLogo) && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isSubmitting ? 'Saving...' : mode === 'create' ? 'Add Vendor' : 'Update Vendor'}
        </button>
      </div>
    </form>
  );
}
