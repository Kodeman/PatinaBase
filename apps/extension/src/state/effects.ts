/**
 * Save effects — the 5 capture paths, moved verbatim from the legacy panel's
 * handlers and re-pointed at the draft/routing slices via the draftTo*
 * adapters. The payload assembly is pulled into pure, tested helpers; the thin
 * Supabase I/O preserves the exact insert sequences (status values, side
 * tables, the decision RPC) so the save-flow contract is unchanged.
 */
import type { User } from '@supabase/supabase-js';
import type { VendorCaptureInput } from '@patina/shared';
import { supabase } from '../lib/supabase';
import {
  buildProductInsertPayload,
  buildVendorInsertPayload,
  buildVendorCertifications,
  buildCapturePayload,
  buildDecisionInsertPayload,
  buildDecisionOptionInsertPayload,
  type BuildCapturePayloadInput,
  type BuildDecisionPayloadInput,
  type BuildDecisionOptionPayloadInput,
} from '../lib/payloads';
import { draftToProductPayload } from './draft';
import { extensionEvents } from '../lib/analytics';
import { addRecent, type RecentCapture } from '../lib/recent-captures';
import type { DraftSlice, RoutingSlice } from './types';
import { placeProductInProject, type PlacementOutcome, type PlacementV2Request, type SpecBookPlacementRoute } from '../lib/spec-book-placement';

type ProductStatus = 'published' | 'draft';

// ─── Pure payload helpers (unit-tested) ───────────────────────────────────────

function selectedImageUrls(draft: DraftSlice): string[] {
  return draft.images.selected.map((i) => draft.images.all[i]?.url).filter((u): u is string => !!u);
}

function priceCents(draft: DraftSlice): number | null {
  const p = draft.fields.price.value;
  return p ? Math.round(parseFloat(p) * 100) : null;
}

function resolvedName(draft: DraftSlice): string {
  return draft.fields.name.value || draft.raw.productName || 'Untitled Product';
}

/** A products insert row at the requested status (library=published, inbox=draft). */
export function productRow(draft: DraftSlice, userId: string, status: ProductStatus) {
  return {
    ...buildProductInsertPayload(draftToProductPayload(draft, userId)),
    status,
  };
}

export function captureInput(
  draft: DraftSlice,
  routing: RoutingSlice,
  designerId: string,
  productId: string
): BuildCapturePayloadInput {
  const images = selectedImageUrls(draft);
  return {
    designerId,
    productId,
    proposalId: routing.proposalId,
    scopeRoomId: routing.scopeRoomId,
    ffeCategorySlug: routing.ffeCategorySlug,
    sourceUrl: draft.sourceUrl,
    rawPayload: {
      name: draft.fields.name.value || draft.raw.productName || null,
      description: draft.fields.description.value || null,
      price_retail_cents: priceCents(draft),
      vendor: draft.manufacturer.vendor?.name ? { name: draft.manufacturer.vendor.name } : null,
      retailer: draft.retailer.vendor?.name ? { name: draft.retailer.vendor.name } : null,
      note: draft.note || null,
      confidence: draft.confidence,
    },
    thumbnailUrl: images[0] ?? null,
  };
}

export function decisionInput(draft: DraftSlice, routing: RoutingSlice): BuildDecisionPayloadInput {
  return {
    designerClientId: routing.decision.designerClientId ?? '',
    projectId: routing.decision.projectId,
    roomId: routing.decision.roomId,
    title: routing.decision.title.trim() || `Approve: ${resolvedName(draft)}`,
    context: draft.note || null,
    dueDate: null,
    status: 'pending',
  };
}

export function decisionOptionInput(
  draft: DraftSlice,
  decisionId: string,
  productId: string
): BuildDecisionOptionPayloadInput {
  const images = selectedImageUrls(draft);
  return {
    decisionId,
    name: resolvedName(draft),
    imageUrl: images[0] ?? null,
    designerNote: draft.note || null,
    productId,
    priceCents: priceCents(draft),
  };
}

function styleInserts(productId: string, styleIds: string[], userId: string) {
  return styleIds.map((styleId, index) => ({
    product_id: productId,
    style_id: styleId,
    confidence: 1.0,
    is_primary: index === 0,
    source: 'manual',
    assigned_by: userId,
  }));
}

function captureAnalytics(draft: DraftSlice, method: 'new' | 'update') {
  extensionEvents.productCapture({
    hasImages: draft.images.all.length > 0,
    hasPrice: !!draft.fields.price.value,
    confidence: draft.confidence,
    captureMethod: method,
  });
}

function recordRecent(draft: DraftSlice, productId: string, target: RecentCapture['target']) {
  void addRecent({
    productId,
    name: resolvedName(draft),
    thumbnail: selectedImageUrls(draft)[0] ?? null,
    capturedAt: new Date().toISOString(),
    target,
  });
}

function placementSource(draft: DraftSlice) {
  return {
    sourceUrl: draft.sourceUrl,
    captureKind: draft.captureKind,
  };
}

async function runPilotPlacement(
  productId: string,
  route: SpecBookPlacementRoute,
  draft: DraftSlice,
  reusedProduct: boolean,
  duplicateMode: PlacementV2Request['duplicateMode'],
): Promise<PlacementOutcome> {
  extensionEvents.specBookPlacementAttempted({
    routeKind: route.kind,
    reusedProduct,
  });
  try {
    const outcome = await placeProductInProject(productId, route, placementSource(draft), { duplicateMode });
    if (!outcome) throw new Error('Project placement returned no outcome');
    extensionEvents.specBookPlacementSucceeded({
      routeKind: route.kind,
      reusedProduct,
      outcome: outcome.outcome,
      selectionId: outcome.selectionId,
      placementId: outcome.placementId,
    });
    return outcome;
  } catch (error) {
    extensionEvents.specBookPlacementFailed({
      routeKind: route.kind,
      reusedProduct,
      retryable: true,
    });
    throw error;
  }
}

/**
 * Retry only the failed placement leg. The already-created Product id is
 * supplied by reducer state, so retry can never insert a duplicate Product.
 */
export async function retrySpecBookPlacement(
  productId: string,
  draft: DraftSlice,
  routing: RoutingSlice,
  duplicateMode: PlacementV2Request['duplicateMode'],
): Promise<{ productId: string; placementOutcome: PlacementOutcome | null }> {
  const route = routing.specBookPlacement;
  if (!route || route.kind === 'library') return { productId, placementOutcome: null };
  const placementOutcome = await runPilotPlacement(productId, route, draft, false, duplicateMode);
  recordRecent(draft, productId, 'library');
  return { productId, placementOutcome };
}

/** Reuse a matched Product master as a distinct project selection. */
export async function reuseProductForSpecBookPlacement(
  productId: string,
  draft: DraftSlice,
  routing: RoutingSlice
): Promise<{ productId: string; placementOutcome: PlacementOutcome | null }> {
  const route = routing.specBookPlacement;
  if (!route || route.kind === 'library') return { productId, placementOutcome: null };
  const placementOutcome = await runPilotPlacement(productId, route, draft, true, 'reuse');
  recordRecent(draft, productId, 'library');
  return { productId, placementOutcome };
}

// ─── Save effects (thin I/O) ──────────────────────────────────────────────────

/** "Save to library" — products(status='published') + optional project + styles. */
export async function saveToLibrary(
  draft: DraftSlice,
  routing: RoutingSlice,
  user: User,
  duplicateMode: PlacementV2Request['duplicateMode'],
): Promise<{ productId: string; placementOutcome: PlacementOutcome | null }> {
  const { data: product, error } = await supabase
    .from('products')
    .insert(productRow(draft, user.id, 'published'))
    .select('id')
    .single();
  if (error) throw error;
  if (!product) throw new Error('Failed to create product');

  if (routing.specBookPlacement === null && routing.destination.type === 'project-room') {
    await supabase.from('project_products').insert({
      project_id: routing.destination.projectId,
      product_id: product.id,
      notes: draft.note || null,
    });
  }
  if (draft.styleIds.length) {
    await supabase.from('product_styles').insert(styleInserts(product.id, draft.styleIds, user.id));
  }
  captureAnalytics(draft, 'new');
  const placementOutcome = routing.specBookPlacement && routing.specBookPlacement.kind !== 'library'
    ? await runPilotPlacement(product.id, routing.specBookPlacement, draft, false, duplicateMode)
    : null;
  recordRecent(draft, product.id, 'library');
  return { productId: product.id, placementOutcome };
}

/** "Send to inbox" — products(status='draft') + styles + proposal_captures. */
export async function saveToInbox(
  draft: DraftSlice,
  routing: RoutingSlice,
  user: User
): Promise<string> {
  const { data: product, error } = await supabase
    .from('products')
    .insert(productRow(draft, user.id, 'draft'))
    .select('id')
    .single();
  if (error) throw error;
  if (!product) throw new Error('Failed to create product');

  if (draft.styleIds.length) {
    await supabase.from('product_styles').insert(styleInserts(product.id, draft.styleIds, user.id));
  }
  const { error: capErr } = await supabase
    .from('proposal_captures')
    .insert(buildCapturePayload(captureInput(draft, routing, user.id, product.id)));
  if (capErr) throw capErr;

  recordRecent(draft, product.id, 'inbox');
  captureAnalytics(draft, 'new');
  return product.id;
}

/** "Send as decision option" — product + one atomic decision lifecycle RPC. */
export async function saveAsDecision(
  draft: DraftSlice,
  routing: RoutingSlice,
  user: User
): Promise<string> {
  if (!routing.decision.designerClientId) {
    throw new Error('Select a client before sending as a decision.');
  }
  const { data: product, error } = await supabase
    .from('products')
    .insert(productRow(draft, user.id, 'published'))
    .select('id')
    .single();
  if (error) throw error;
  if (!product) throw new Error('Failed to create product');

  if (draft.styleIds.length) {
    await supabase.from('product_styles').insert(styleInserts(product.id, draft.styleIds, user.id));
  }
  const decisionId = crypto.randomUUID();
  const decisionInsert = buildDecisionInsertPayload(decisionInput(draft, routing));
  const decisionPayload = {
    designer_client_id: decisionInsert.designer_client_id,
    project_id: decisionInsert.project_id,
    room_id: decisionInsert.room_id,
    title: decisionInsert.title,
    context: decisionInsert.context,
    due_date: decisionInsert.due_date,
    decision_type: decisionInsert.decision_type,
    blocking_status: decisionInsert.blocking_status,
    status: decisionInsert.status,
  };
  const optionInsert = buildDecisionOptionInsertPayload(
    decisionOptionInput(draft, decisionId, product.id),
  );
  const optionPayload = {
    name: optionInsert.name,
    image_url: optionInsert.image_url,
    designer_note: optionInsert.designer_note,
    product_id: optionInsert.product_id,
    is_recommended: optionInsert.is_recommended,
    price: optionInsert.price,
    quantity: optionInsert.quantity,
    sort_order: optionInsert.sort_order,
  };
  // Generated RPC types intentionally lag the in-progress authority migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: decision, error: decErr } = await (supabase as any).rpc(
    'create_client_decision',
    {
      p_decision_id: decisionId,
      p_payload: decisionPayload,
      p_options: [optionPayload],
      p_blocked_ffe_item_ids: [],
      p_blocked_task_ids: [],
    },
  );
  if (decErr) throw decErr;
  if (!decision) throw new Error('Failed to create decision');
  recordRecent(draft, product.id, 'decision');
  captureAnalytics(draft, 'new');
  return product.id;
}

/** Update an existing (duplicate) product in place. */
export async function updateExisting(
  existingId: string,
  draft: DraftSlice,
  routing: RoutingSlice,
  user: User
): Promise<{ productId: string; placementOutcome: PlacementOutcome | null }> {
  const full = productRow(draft, user.id, 'published');
  const { error } = await supabase
    .from('products')
    .update({
      name: full.name,
      description: full.description,
      images: full.images,
      price_retail: full.price_retail,
      materials: full.materials,
      colors: full.colors,
      finish: full.finish,
      available_colors: full.available_colors,
      dimensions: full.dimensions,
      vendor_id: full.vendor_id,
      retailer_id: full.retailer_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existingId);
  if (error) throw error;

  if (routing.specBookPlacement === null && routing.destination.type === 'project-room') {
    const { data: assignment } = await supabase
      .from('project_products')
      .select('id')
      .eq('project_id', routing.destination.projectId)
      .eq('product_id', existingId)
      .single();
    if (!assignment) {
      await supabase.from('project_products').insert({
        project_id: routing.destination.projectId,
        product_id: existingId,
        notes: draft.note || null,
      });
    }
  }
  const placementOutcome = routing.specBookPlacement && routing.specBookPlacement.kind !== 'library'
    ? await runPilotPlacement(existingId, routing.specBookPlacement, draft, true, 'reuse')
    : null;
  if (draft.styleIds.length) {
    await supabase.from('product_styles').delete().eq('product_id', existingId);
    await supabase.from('product_styles').insert(styleInserts(existingId, draft.styleIds, user.id));
  }
  recordRecent(draft, existingId, 'update');
  captureAnalytics(draft, 'update');
  return { productId: existingId, placementOutcome };
}

/** Vendor-mode save — vendors + vendor_certifications. */
export async function saveVendor(vendorData: VendorCaptureInput, _user: User): Promise<void> {
  const { data: vendor, error } = await supabase
    .from('vendors')
    .insert(buildVendorInsertPayload(vendorData))
    .select('id')
    .single();
  if (error) throw error;

  if (vendor && vendorData.certifications && vendorData.certifications.length > 0) {
    await supabase
      .from('vendor_certifications')
      .insert(buildVendorCertifications(vendor.id, vendorData.certifications));
  }
  extensionEvents.vendorCapture({
    hasLogo: !!vendorData.logoUrl,
    hasContactInfo: !!(vendorData.contactEmail || vendorData.contactPhone),
  });
}
