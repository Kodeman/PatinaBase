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
    // Three-layer catalog (migration 00152). Captures always land in the
    // personal library — owner_user_id is the authoritative owner; the
    // legacy captured_by stays for historical attribution. The DB trigger
    // (products_normalize_layer_defaults) is a safety net; we set the
    // fields explicitly so the row passes products_personal_requires_owner
    // even when the trigger is later removed.
    layer: 'personal' as const,
    owner_user_id: userId,
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

// ─── Proposal Capture Insert (Wave 2) ──────────────────────────────────────
//
// Builds a row matching the public.proposal_captures schema introduced by
// migration 00130. Status is derived from how complete the targeting is:
//   - all of proposal/room/category set → 'assigned'
//   - otherwise                          → 'inbox'
// Validation against the column set lives in the unit tests.
// ═══════════════════════════════════════════════════════════════════════════

export interface BuildCapturePayloadInput {
  designerId: string;
  /** Optional: the products.id for the captured product (or null when
   *  the capture is a stub that needs a draft promotion in the portal). */
  productId: string | null;
  proposalId: string | null;
  scopeRoomId: string | null;
  ffeCategorySlug: string | null;
  sourceUrl: string;
  rawPayload: Record<string, unknown>;
  thumbnailUrl: string | null;
}

export type ProposalCaptureSaveStatus = 'inbox' | 'assigned';

export function deriveCaptureStatus(input: {
  proposalId: string | null;
  scopeRoomId: string | null;
  ffeCategorySlug: string | null;
}): ProposalCaptureSaveStatus {
  if (input.proposalId && input.scopeRoomId && input.ffeCategorySlug) {
    return 'assigned';
  }
  return 'inbox';
}

export function buildCapturePayload(input: BuildCapturePayloadInput) {
  const status = deriveCaptureStatus({
    proposalId: input.proposalId,
    scopeRoomId: input.scopeRoomId,
    ffeCategorySlug: input.ffeCategorySlug,
  });

  return {
    designer_id: input.designerId,
    product_id: input.productId,
    proposal_id: input.proposalId,
    scope_room_id: input.scopeRoomId,
    ffe_category_slug: input.ffeCategorySlug,
    source_url: input.sourceUrl,
    raw_payload: input.rawPayload,
    thumbnail_url: input.thumbnailUrl,
    status,
  };
}

// ─── Decision + Decision Option Insert (PT-D-2-T5-1) ────────────────────────
//
// "Send as decision option" turns a captured product into a client decision.
// The portal does this via useCreateDecision() in @patina/supabase, but the
// extension can't call React Query hooks (different React tree, no shared
// query client — same constraint documented on FFESlotPicker). So we mirror
// that hook's INSERT shape directly against the extension's Supabase client,
// adding the room/product linkage columns shipped in migration 00172:
//
//   • client_decisions.room_id           → scope the decision to a room
//   • client_decision_options.product_id → link the option to the catalog row
//
// designer_id is NOT set here — the set_decision_designer_id trigger (00064)
// derives it from designer_clients. status defaults to 'pending' so the
// decision is sent immediately and the client gets notified (the caller fires
// notify_decision_required after the insert, matching useCreateDecision).
// ═══════════════════════════════════════════════════════════════════════════

export interface BuildDecisionPayloadInput {
  /** Required FK → designer_clients(id). The decision's owning relationship. */
  designerClientId: string;
  /** Optional FK → projects(id). */
  projectId: string | null;
  /** Optional FK → project_rooms(id) (migration 00172). */
  roomId: string | null;
  title: string;
  context: string | null;
  /** ISO string or null. */
  dueDate: string | null;
  /** 'draft' keeps it unsent (sent_at null); 'pending' sends it immediately. */
  status?: 'draft' | 'pending';
}

export function buildDecisionInsertPayload(input: BuildDecisionPayloadInput) {
  const status = input.status ?? 'pending';

  return {
    designer_client_id: input.designerClientId,
    project_id: input.projectId,
    room_id: input.roomId,
    title: input.title,
    context: input.context,
    due_date: input.dueDate,
    decision_type: 'product' as const,
    blocking_status: 'non_blocking' as const,
    status,
    sent_at: status === 'draft' ? null : new Date().toISOString(),
  };
}

export interface BuildDecisionOptionPayloadInput {
  decisionId: string;
  name: string;
  imageUrl: string | null;
  designerNote: string | null;
  /** FK → products(id) (migration 00172). The captured product. */
  productId: string | null;
  /** Retail price in cents, or null. */
  priceCents: number | null;
}

export function buildDecisionOptionInsertPayload(
  input: BuildDecisionOptionPayloadInput
) {
  return {
    decision_id: input.decisionId,
    name: input.name,
    image_url: input.imageUrl,
    designer_note: input.designerNote,
    product_id: input.productId,
    is_recommended: true,
    price: input.priceCents,
    quantity: 1,
    sort_order: 0,
  };
}
