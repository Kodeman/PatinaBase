/**
 * Product capture form - main form for capturing product details
 */

import type {
  ExtractedProductData,
  Project,
  StyleArchetype,
  UUID,
  VendorSummaryForCapture,
  VendorMatchConfidence,
  VendorCaptureInput,
} from '@patina/shared';

import { ImageCarousel } from './ImageCarousel';
import { ProjectSelector } from './ProjectSelector';
import { StyleChips } from './StyleChips';
import { ConfidenceIndicator } from './ConfidenceIndicator';
import { VendorCard } from './VendorCard';
import { VendorSelector } from './VendorSelector';
import { VendorInlineForm } from './VendorInlineForm';
import { TradePricing } from './TradePricing';
import { EditableDetails } from './EditableDetails';
import type { EditableDimensions } from './EditableDetails';
import type { ValidationResult } from '../lib/capture-validation';

interface ProductCaptureFormProps {
  extractedData: ExtractedProductData;
  userId: string | null;
  productName: string;
  setProductName: (name: string) => void;
  price: string;
  setPrice: (price: string) => void;
  selectedImageIndex: number;
  setSelectedImageIndex: (index: number) => void;
  selectedProjectId: UUID | null;
  setSelectedProjectId: (id: UUID | null) => void;
  isPersonalCatalog: boolean;
  setIsPersonalCatalog: (value: boolean) => void;
  selectedStyleIds: UUID[];
  onStyleToggle: (styleId: UUID) => void;
  note: string;
  setNote: (note: string) => void;
  projects: Project[];
  styles: StyleArchetype[];
  isLoadingData: boolean;
  setHasInteracted: (value: boolean) => void;
  // Manufacturer state
  manufacturer: VendorSummaryForCapture | null;
  setManufacturer: (vendor: VendorSummaryForCapture | null) => void;
  manufacturerConfidence: VendorMatchConfidence;
  setManufacturerConfidence: (confidence: VendorMatchConfidence) => void;
  showManufacturerSelector: boolean;
  setShowManufacturerSelector: (show: boolean) => void;
  showManufacturerForm: boolean;
  setShowManufacturerForm: (show: boolean) => void;
  // Retailer state
  retailer: VendorSummaryForCapture | null;
  setRetailer: (vendor: VendorSummaryForCapture | null) => void;
  retailerConfidence: VendorMatchConfidence;
  setRetailerConfidence: (confidence: VendorMatchConfidence) => void;
  showRetailerSelector: boolean;
  setShowRetailerSelector: (show: boolean) => void;
  showRetailerForm: boolean;
  setShowRetailerForm: (show: boolean) => void;
  // Vendor utilities
  vendorSuggestions: VendorSummaryForCapture[];
  createVendorInline: (data: VendorCaptureInput) => Promise<string | null>;
  searchVendors: (query: string) => Promise<VendorSummaryForCapture[]>;
  // Validation
  validation: ValidationResult | null;
  // Editable details
  editedDescription: string;
  setEditedDescription: (v: string) => void;
  editedMaterials: string[];
  setEditedMaterials: (v: string[]) => void;
  editedColors: string[];
  setEditedColors: (v: string[]) => void;
  editedFinish: string;
  setEditedFinish: (v: string) => void;
  editedDimensions: EditableDimensions;
  setEditedDimensions: (v: EditableDimensions) => void;
}

export function ProductCaptureForm({
  extractedData,
  userId,
  productName,
  setProductName,
  price,
  setPrice,
  selectedImageIndex,
  setSelectedImageIndex,
  selectedProjectId,
  setSelectedProjectId,
  isPersonalCatalog,
  setIsPersonalCatalog,
  selectedStyleIds,
  onStyleToggle,
  note,
  setNote,
  projects,
  styles,
  isLoadingData,
  setHasInteracted,
  manufacturer,
  setManufacturer,
  manufacturerConfidence,
  setManufacturerConfidence,
  showManufacturerSelector,
  setShowManufacturerSelector,
  showManufacturerForm,
  setShowManufacturerForm,
  retailer,
  setRetailer,
  retailerConfidence,
  setRetailerConfidence,
  showRetailerSelector,
  setShowRetailerSelector,
  showRetailerForm,
  setShowRetailerForm,
  vendorSuggestions,
  createVendorInline,
  searchVendors,
  validation,
  editedDescription,
  setEditedDescription,
  editedMaterials,
  setEditedMaterials,
  editedColors,
  setEditedColors,
  editedFinish,
  setEditedFinish,
  editedDimensions,
  setEditedDimensions,
}: ProductCaptureFormProps) {
  const fieldError = (field: string) =>
    validation?.errors.find(e => e.field === field)?.message ?? null;

  const nameError = fieldError('productName');
  const priceError = fieldError('price');
  return (
    <>
      {/* Image carousel */}
      <ImageCarousel
        images={extractedData.images}
        selectedIndex={selectedImageIndex}
        onSelect={(index) => {
          setHasInteracted(true);
          setSelectedImageIndex(index);
        }}
      />

      {/* Product name */}
      <div>
        <label className="block text-sm font-medium text-patina-charcoal mb-1">
          Product Name
        </label>
        <input
          type="text"
          value={productName}
          onChange={(e) => {
            setHasInteracted(true);
            setProductName(e.target.value);
          }}
          placeholder="Enter product name"
          className={`w-full px-3 py-2 text-sm rounded-lg border outline-none ${
            nameError
              ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500'
              : 'border-patina-clay-beige/50 focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown'
          }`}
        />
        {nameError && (
          <p className="mt-1 text-xs text-red-600">{nameError}</p>
        )}
      </div>

      {/* Price and confidence */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-patina-charcoal mb-1">
            Price
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-patina-mocha-brown">$</span>
            <input
              type="text"
              value={price}
              onChange={(e) => {
                setHasInteracted(true);
                setPrice(e.target.value.replace(/[^0-9.]/g, ''));
              }}
              placeholder="0.00"
              className={`w-full pl-7 pr-3 py-2 text-sm rounded-lg border outline-none ${
                priceError
                  ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                  : 'border-patina-clay-beige/50 focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown'
              }`}
            />
          </div>
          {priceError && (
            <p className="mt-1 text-xs text-red-600">{priceError}</p>
          )}
        </div>
        <div className="flex items-end pb-2">
          <ConfidenceIndicator confidence={extractedData.confidence} size="sm" />
        </div>
      </div>

      {/* Trade pricing */}
      <TradePricing
        retailPriceCents={price ? Math.round(parseFloat(price) * 100) : null}
        vendorId={retailer?.id || manufacturer?.id || null}
        vendorName={retailer?.name || manufacturer?.name || ''}
        userId={userId}
      />

      {/* Editable details (description, materials, colors, finish, dimensions) */}
      <EditableDetails
        description={editedDescription}
        setDescription={setEditedDescription}
        materials={editedMaterials}
        setMaterials={setEditedMaterials}
        colors={editedColors}
        setColors={setEditedColors}
        finish={editedFinish}
        setFinish={setEditedFinish}
        dimensions={editedDimensions}
        setDimensions={setEditedDimensions}
        setHasInteracted={setHasInteracted}
      />

      {/* Manufacturer */}
      <div className="relative">
        <label className="block text-sm font-medium text-patina-charcoal mb-1">
          Manufacturer
        </label>
        {showManufacturerForm ? (
          <VendorInlineForm
            initialData={{
              name: extractedData.manufacturer || '',
              website: '',
            }}
            onSubmit={async (vendorData) => {
              const newId = await createVendorInline(vendorData);
              if (newId) {
                setManufacturer({
                  id: newId,
                  name: vendorData.name,
                  logoUrl: vendorData.logoUrl || null,
                  website: vendorData.website,
                  marketPosition: vendorData.marketPosition || null,
                  productionModel: vendorData.productionModel || null,
                  primaryCategory: vendorData.primaryCategory || null,
                  rating: null,
                  reviewCount: 0,
                });
                setManufacturerConfidence('exact');
              }
              setShowManufacturerForm(false);
            }}
            onSkip={() => {
              setShowManufacturerForm(false);
              setManufacturer(null);
            }}
          />
        ) : manufacturer ? (
          <VendorCard
            vendor={manufacturer}
            matchConfidence={manufacturerConfidence}
            onChangeClick={() => setShowManufacturerSelector(true)}
          />
        ) : (
          <div className="p-3 bg-patina-clay-beige/20 rounded-lg border border-patina-clay-beige/30">
            <p className="text-sm text-patina-mocha-brown">
              {extractedData.manufacturer ? `Detected: ${extractedData.manufacturer}` : 'No manufacturer detected'}
            </p>
            <button
              onClick={() => setShowManufacturerSelector(true)}
              className="mt-2 text-xs text-patina-mocha-brown hover:text-patina-charcoal underline"
            >
              + Link manufacturer
            </button>
          </div>
        )}
        {showManufacturerSelector && (
          <VendorSelector
            selectedVendor={manufacturer}
            suggestions={vendorSuggestions}
            onSearch={searchVendors}
            onSelect={(vendor) => {
              setManufacturer(vendor);
              setManufacturerConfidence('exact');
              setShowManufacturerSelector(false);
            }}
            onCreateNew={() => {
              setShowManufacturerSelector(false);
              setShowManufacturerForm(true);
            }}
            isOpen={showManufacturerSelector}
            onClose={() => setShowManufacturerSelector(false)}
          />
        )}
      </div>

      {/* Retailer */}
      <div className="relative">
        <label className="block text-sm font-medium text-patina-charcoal mb-1">
          Retailer <span className="text-patina-mocha-brown/50">(where captured)</span>
        </label>
        {showRetailerForm ? (
          <VendorInlineForm
            initialData={{
              name: '',
              website: new URL(extractedData.url).hostname,
            }}
            onSubmit={async (vendorData) => {
              const newId = await createVendorInline(vendorData);
              if (newId) {
                setRetailer({
                  id: newId,
                  name: vendorData.name,
                  logoUrl: vendorData.logoUrl || null,
                  website: vendorData.website,
                  marketPosition: vendorData.marketPosition || null,
                  productionModel: vendorData.productionModel || null,
                  primaryCategory: vendorData.primaryCategory || null,
                  rating: null,
                  reviewCount: 0,
                });
                setRetailerConfidence('exact');
              }
              setShowRetailerForm(false);
            }}
            onSkip={() => {
              setShowRetailerForm(false);
              setRetailer(null);
            }}
          />
        ) : retailer ? (
          <VendorCard
            vendor={retailer}
            matchConfidence={retailerConfidence}
            onChangeClick={() => setShowRetailerSelector(true)}
          />
        ) : (
          <div className="p-3 bg-patina-clay-beige/20 rounded-lg border border-patina-clay-beige/30">
            <p className="text-sm text-patina-mocha-brown">
              Captured from: {new URL(extractedData.url).hostname}
            </p>
            <button
              onClick={() => setShowRetailerSelector(true)}
              className="mt-2 text-xs text-patina-mocha-brown hover:text-patina-charcoal underline"
            >
              + Link retailer
            </button>
          </div>
        )}
        {showRetailerSelector && (
          <VendorSelector
            selectedVendor={retailer}
            suggestions={vendorSuggestions}
            onSearch={searchVendors}
            onSelect={(vendor) => {
              setRetailer(vendor);
              setRetailerConfidence('exact');
              setShowRetailerSelector(false);
            }}
            onCreateNew={() => {
              setShowRetailerSelector(false);
              setShowRetailerForm(true);
            }}
            isOpen={showRetailerSelector}
            onClose={() => setShowRetailerSelector(false)}
          />
        )}
      </div>

      {/* Project selector */}
      <div>
        <label className="block text-sm font-medium text-patina-charcoal mb-1">
          Project
        </label>
        <ProjectSelector
          projects={projects}
          selectedProjectId={selectedProjectId}
          isPersonalCatalog={isPersonalCatalog}
          onSelectProject={(id) => {
            setHasInteracted(true);
            setSelectedProjectId(id);
          }}
          onTogglePersonalCatalog={(value) => {
            setHasInteracted(true);
            setIsPersonalCatalog(value);
          }}
          isLoading={isLoadingData}
        />
      </div>

      {/* Quick note */}
      <div>
        <label className="block text-sm font-medium text-patina-charcoal mb-1">
          Quick Note <span className="text-patina-mocha-brown/50">(optional)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => {
            setHasInteracted(true);
            setNote(e.target.value.slice(0, 140));
          }}
          placeholder="Add a note..."
          rows={2}
          maxLength={140}
          className="w-full px-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                   focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none resize-none"
        />
        <p className="text-xs text-patina-mocha-brown/50 text-right">{note.length}/140</p>
      </div>

      {/* Style tags */}
      <div>
        <label className="block text-sm font-medium text-patina-charcoal mb-2">
          Style Tags <span className="text-patina-mocha-brown/50">(optional)</span>
        </label>
        <StyleChips
          styles={styles}
          selectedIds={selectedStyleIds}
          onToggle={onStyleToggle}
          isLoading={isLoadingData}
        />
      </div>

      {/* Validation warnings */}
      {validation && validation.warnings.length > 0 && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          {validation.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
              <svg className="w-3 h-3 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              {w.message}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
