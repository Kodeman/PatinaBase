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
  const capturedAt = new Date().toISOString();

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
    // capture_source / capture_provenance (migration 00232) — the extension
    // hadn't written these before; capture_provenance.captureOptions is a
    // free namespace (studioCustom is claimed by field-capture) carrying the
    // FULL scraped option lists so the Piece editor's suggestion seeder can
    // surface multi-value color/finish/material groups for human confirmation
    // (P2-8). The flat scalar writes above stay for back-compat.
    capture_source: 'web_extension' as const,
    capture_provenance: {
      captureOptions: {
        colors: extractedData.availableColors ?? [],
        finishes: extractedData.availableFinishes ?? [],
        materials: extractedData.materials ?? [],
        source: 'web_extension' as const,
        capturedAt,
      },
    },
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
    captured_at: capturedAt,
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

// ─── commit_proposal_capture RPC args (Phase 3 / C-A2, migration 00516) ────
//
// Replaces the old 3-insert sequence (products -> product_styles ->
// proposal_captures — still visible in git history / background.ts's
// pre-00516 queue-drain shape) with a single idempotent RPC call keyed on
// client_capture_id. Builds the RPC's camelCase JSONB payload envelope
// (documented on commit_proposal_capture in 00516) from the SAME inputs the
// old path used: a `buildProductInsertPayload` row (snake_case, DB-column
// shaped) plus the small raw_payload display snapshot `captureInput`
// already computes. clientCaptureId MUST be minted once at capture time and
// reused on every retry of the same logical capture — callers own that
// (the extension's offline queue item id already serves this purpose; the
// direct-save path mints a fresh one since it has no retry queue).
// ═══════════════════════════════════════════════════════════════════════════

export interface BuildCommitProposalCaptureArgsInput {
  clientCaptureId: string;
  product: ReturnType<typeof buildProductInsertPayload>;
  productStatus: 'draft' | 'published';
  styleIds: UUID[];
  proposalId: string | null;
  scopeRoomId: string | null;
  ffeCategorySlug: string | null;
  rawPayload: Record<string, unknown>;
  thumbnailUrl: string | null;
}

export interface CommitProposalCaptureRpcArgs {
  p_client_capture_id: string;
  p_payload: Record<string, unknown>;
  p_style_ids: UUID[];
  p_proposal_id: string | null;
  p_scope_room_id: string | null;
  p_ffe_category_slug: string | null;
}

export function buildCommitProposalCaptureArgs(
  input: BuildCommitProposalCaptureArgsInput
): CommitProposalCaptureRpcArgs {
  const { product } = input;
  return {
    p_client_capture_id: input.clientCaptureId,
    p_payload: {
      name: product.name,
      description: product.description,
      sourceUrl: product.source_url,
      images: product.images,
      priceRetailCents: product.price_retail,
      materials: product.materials,
      colors: product.colors,
      finish: product.finish,
      availableColors: product.available_colors,
      dimensions: product.dimensions,
      vendorId: product.vendor_id,
      retailerId: product.retailer_id,
      captureSource: product.capture_source,
      captureProvenance: product.capture_provenance,
      productStatus: input.productStatus,
      thumbnailUrl: input.thumbnailUrl,
      rawPayload: input.rawPayload,
    },
    p_style_ids: input.styleIds,
    p_proposal_id: input.proposalId,
    p_scope_room_id: input.scopeRoomId,
    p_ffe_category_slug: input.ffeCategorySlug,
  };
}

// ─── Decision + Decision Option Insert (PT-D-2-T5-1) ────────────────────────
//
// "Send as decision option" turns a captured product into a client decision.
// The portal does this via useCreateDecision() in @patina/supabase, but the
// extension can't call React Query hooks (different React tree, no shared
// query client — same constraint documented on FFESlotPicker). So we mirror
// its lifecycle RPC payload shape against the extension's Supabase client,
// adding the room/product linkage columns shipped in migration 00172:
//
//   • client_decisions.room_id           → scope the decision to a room
//   • client_decision_options.product_id → link the option to the catalog row
//
// designer_id is NOT set here — the set_decision_designer_id trigger (00064)
// derives it from designer_clients. status defaults to 'pending'; the checked
// create RPC owns the row, option, and required client notification atomically.
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
