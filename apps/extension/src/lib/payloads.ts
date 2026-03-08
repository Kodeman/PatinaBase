/**
 * Payload builders for Supabase inserts.
 *
 * Extracted from sidepanel.tsx so that the exact column sets
 * can be unit-tested against the database schema.
 */
import type {
  ExtractedProductData,
  VendorCaptureInput,
  UUID,
} from '@patina/shared';

// ─── Product Insert ────────────────────────────────────────────────────────

export interface BuildProductPayloadInput {
  productName: string;
  extractedData: ExtractedProductData;
  price: string;
  images: string[];
  vendorId: string | null;
  retailerId: string | null;
  userId: string;
}

export function buildProductInsertPayload(input: BuildProductPayloadInput) {
  const { productName, extractedData, price, images, vendorId, retailerId, userId } = input;

  return {
    name: productName || extractedData.productName || 'Untitled Product',
    description: extractedData.description || null,
    source_url: extractedData.url,
    images: images.slice(0, 10),
    price_retail: price ? Math.round(parseFloat(price) * 100) : null,
    materials: extractedData.materials || [],
    colors: extractedData.colors?.map(c => c.name) || null,
    finish: extractedData.finish?.name || null,
    available_colors: extractedData.availableColors || null,
    dimensions: extractedData.dimensions
      ? {
          width: extractedData.dimensions.width,
          height: extractedData.dimensions.height,
          depth: extractedData.dimensions.depth,
          seatHeight: extractedData.dimensions.seatHeight,
          seatDepth: extractedData.dimensions.seatDepth,
          seatWidth: extractedData.dimensions.seatWidth,
          armHeight: extractedData.dimensions.armHeight,
          backHeight: extractedData.dimensions.backHeight,
          legHeight: extractedData.dimensions.legHeight,
          clearance: extractedData.dimensions.clearance,
          unit: extractedData.dimensions.unit,
        }
      : null,
    vendor_id: vendorId,
    retailer_id: retailerId,
    captured_by: userId,
    captured_at: new Date().toISOString(),
  };
}

// ─── Vendor Insert ─────────────────────────────────────────────────────────

export function buildVendorInsertPayload(vendorData: VendorCaptureInput) {
  return {
    name: vendorData.name,
    website: vendorData.website,
    logo_url: vendorData.logoUrl || null,
    hero_image_url: vendorData.heroImageUrl || null,
    market_position: vendorData.marketPosition || null,
    production_model: vendorData.productionModel || null,
    primary_category: vendorData.primaryCategory || null,
    contact_info: {
      email: vendorData.contactEmail || null,
      phone: vendorData.contactPhone || null,
    },
    social_links: {
      instagram: vendorData.instagram || null,
      pinterest: vendorData.pinterest || null,
      facebook: vendorData.facebook || null,
    },
    founded_year: vendorData.foundedYear || null,
    headquarters_city: vendorData.headquartersCity || null,
    headquarters_state: vendorData.headquartersState || null,
    brand_story: vendorData.story || null,
    ownership: vendorData.ownershipType || null,
    made_in: vendorData.madeIn || null,
    notes: vendorData.notes || null,
  };
}

// ─── Vendor Certifications ─────────────────────────────────────────────────

export function buildVendorCertifications(
  vendorId: string,
  certifications: string[]
) {
  return certifications.map(cert => ({
    vendor_id: vendorId,
    certification_type: cert,
  }));
}

// ─── Product Styles ────────────────────────────────────────────────────────

export function buildProductStyleInserts(
  productId: string,
  styleIds: UUID[],
  userId: string
) {
  return styleIds.map((styleId, index) => ({
    product_id: productId,
    style_id: styleId,
    confidence: 1.0,
    is_primary: index === 0,
    source: 'manual',
    assigned_by: userId,
  }));
}
