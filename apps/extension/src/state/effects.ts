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
  buildCommitProposalCaptureArgs,
  buildDecisionInsertPayload,
  buildDecisionOptionInsertPayload,
  withCaptureNote,
  type BuildCapturePayloadInput,
  type BuildDecisionPayloadInput,
  type BuildDecisionOptionPayloadInput,
} from '../lib/payloads';
import { draftToProductPayload } from './draft';
import { extensionEvents } from '../lib/analytics';
import { addRecent, type RecentCapture } from '../lib/recent-captures';
import type { DraftSlice, RoutingSlice, CommitKind } from './types';
import {
  placeProductInProject,
  type PlacementOutcome,
  type PlacementV2Request,
  type SpecBookPlacementRoute,
} from '../lib/spec-book-placement';

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
    ...buildProductInsertPayload({
      ...draftToProductPayload(draft, userId),
      note: draft.note,
    }),
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

/** The commit-target kinds `product.captured` reports as `destination` (CL W3-E10). */
export type CaptureDestination =
  | 'library'
  | 'project_inbox'
  | 'fill_slot'
  | 'create_line'
  | 'inbox'
  | 'decision'
  | 'update';

function sourceDomain(draft: DraftSlice): string | undefined {
  try {
    return new URL(draft.sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function captureAnalytics(
  draft: DraftSlice,
  method: 'new' | 'update',
  destination: CaptureDestination,
  captureTimeMs?: number
) {
  extensionEvents.productCapture({
    hasImages: draft.images.all.length > 0,
    hasPrice: !!draft.fields.price.value,
    confidence: draft.confidence,
    captureMethod: method,
    domain: sourceDomain(draft),
    destination,
    captureTimeMs,
  });
}

/** `destination` for a save that lands in the library, honoring an active project placement route. */
function libraryDestination(routing: RoutingSlice): CaptureDestination {
  const route = routing.specBookPlacement;
  return route && route.kind !== 'library' ? route.kind : 'library';
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

async function runProjectPlacement(
  productId: string,
  route: SpecBookPlacementRoute,
  draft: DraftSlice,
  reusedProduct: boolean,
  duplicateMode: PlacementV2Request['duplicateMode']
): Promise<PlacementOutcome> {
  extensionEvents.specBookPlacementAttempted({
    routeKind: route.kind,
    reusedProduct,
  });
  try {
    const outcome = await placeProductInProject(productId, route, placementSource(draft), {
      duplicateMode,
    });
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
  duplicateMode: PlacementV2Request['duplicateMode']
): Promise<{ productId: string; placementOutcome: PlacementOutcome | null }> {
  const route = routing.specBookPlacement;
  if (!route || route.kind === 'library') return { productId, placementOutcome: null };
  const placementOutcome = await runProjectPlacement(productId, route, draft, false, duplicateMode);
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
  const placementOutcome = await runProjectPlacement(productId, route, draft, true, 'reuse');
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
  captureTimeMs?: number
): Promise<{ productId: string; placementOutcome: PlacementOutcome | null }> {
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
  captureAnalytics(draft, 'new', libraryDestination(routing), captureTimeMs);
  const placementOutcome =
    routing.specBookPlacement && routing.specBookPlacement.kind !== 'library'
      ? await runProjectPlacement(
          product.id,
          routing.specBookPlacement,
          draft,
          false,
          duplicateMode
        )
      : null;
  recordRecent(draft, product.id, 'library');
  return { productId: product.id, placementOutcome };
}

/**
 * "Send to inbox" — a single idempotent commit_proposal_capture RPC call
 * (Phase 3 / C-A2, migration 00516) replacing the old 3-insert sequence
 * (products -> product_styles -> proposal_captures). client_capture_id is
 * minted fresh here since this is a direct save with no retry path — a
 * failure throws to the caller.
 *
 * NOT behind the `capture-producer-idempotency` PostHog flag that gates the
 * designer-portal's AddFromUrl path: the extension has no established
 * feature-flag runtime for this — background.ts's MV3 service-worker
 * context has no `window`/`localStorage`, which posthog-js (this app's only
 * PostHog client) requires. This direct save is now the extension's only
 * capture producer and ships new-path-only.
 */
export async function saveToInbox(
  draft: DraftSlice,
  routing: RoutingSlice,
  user: User,
  captureTimeMs?: number
): Promise<string> {
  const clientCaptureId = crypto.randomUUID();
  const product = productRow(draft, user.id, 'draft');
  const { rawPayload, thumbnailUrl } = captureInput(draft, routing, user.id, '');

  // Generated RPC types intentionally lag the in-progress capture-producer
  // migration (00516) — same pattern as the create_client_decision call
  // below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    'commit_proposal_capture',
    buildCommitProposalCaptureArgs({
      clientCaptureId,
      product,
      productStatus: 'draft',
      styleIds: draft.styleIds,
      proposalId: routing.proposalId,
      scopeRoomId: routing.scopeRoomId,
      ffeCategorySlug: routing.ffeCategorySlug,
      rawPayload,
      thumbnailUrl,
    })
  );
  if (error) throw error;
  const productId = data?.product_id as string | undefined;
  if (!productId) throw new Error('Failed to create product');

  recordRecent(draft, productId, 'inbox');
  captureAnalytics(draft, 'new', 'inbox', captureTimeMs);
  return productId;
}

/** "Send as decision option" — product + one atomic decision lifecycle RPC. */
export async function saveAsDecision(
  draft: DraftSlice,
  routing: RoutingSlice,
  user: User,
  captureTimeMs?: number
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
    decisionOptionInput(draft, decisionId, product.id)
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
  const { data: decision, error: decErr } = await (supabase as any).rpc('create_client_decision', {
    p_decision_id: decisionId,
    p_payload: decisionPayload,
    p_options: [optionPayload],
    p_blocked_ffe_item_ids: [],
    p_blocked_task_ids: [],
  });
  if (decErr) throw decErr;
  if (!decision) throw new Error('Failed to create decision');
  recordRecent(draft, product.id, 'decision');
  captureAnalytics(draft, 'new', 'decision', captureTimeMs);
  return product.id;
}

/** Update an existing (duplicate) product in place. */
export async function updateExisting(
  existingId: string,
  draft: DraftSlice,
  routing: RoutingSlice,
  user: User,
  captureTimeMs?: number
): Promise<{ productId: string; placementOutcome: PlacementOutcome | null }> {
  const full = productRow(draft, user.id, 'published');
  // The capture note lives in capture_provenance.note (CL-R1 / c), not on a
  // dedicated column — read the existing row's capture_provenance first so
  // the update only touches the note key and preserves whatever else (e.g.
  // captureOptions from the original capture) already lives there.
  const { data: existingProduct } = await supabase
    .from('products')
    .select('capture_provenance')
    .eq('id', existingId)
    .single();
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
      sku: full.sku,
      capture_provenance: withCaptureNote(
        existingProduct?.capture_provenance as Record<string, unknown> | null | undefined,
        draft.note
      ),
      updated_at: new Date().toISOString(),
    })
    .eq('id', existingId);
  if (error) throw error;

  const placementOutcome =
    routing.specBookPlacement && routing.specBookPlacement.kind !== 'library'
      ? await runProjectPlacement(existingId, routing.specBookPlacement, draft, true, 'reuse')
      : null;
  if (draft.styleIds.length) {
    await supabase.from('product_styles').delete().eq('product_id', existingId);
    await supabase.from('product_styles').insert(styleInserts(existingId, draft.styleIds, user.id));
  }
  recordRecent(draft, existingId, 'update');
  captureAnalytics(draft, 'update', 'update', captureTimeMs);
  return { productId: existingId, placementOutcome };
}

/** Vendor-mode save — vendors. */
export async function saveVendor(vendorData: VendorCaptureInput, _user: User): Promise<void> {
  const { error } = await supabase
    .from('vendors')
    .insert(buildVendorInsertPayload(vendorData))
    .select('id')
    .single();
  if (error) throw error;

  extensionEvents.vendorCapture({
    hasLogo: !!vendorData.logoUrl,
    hasContactInfo: !!(vendorData.contactEmail || vendorData.contactPhone),
  });
}

// ─── Commit orchestration (shared by CommitBar and the R5 retry) ─────────────

/** Re-exported for existing importers — canonical definition now lives on io.lastCommitKind's type. */
export type { CommitKind };

export interface RunCommitContext {
  draft: DraftSlice;
  routing: RoutingSlice;
  user: User;
  /** Id of the exact-URL duplicate match, when one is showing (dedup.match?.id). */
  dedupMatchId: string | null;
  /** io.pendingPlacementProductId — a Product already created, only its project placement failed. */
  pendingPlacementProductId: string | null;
  duplicateMode: PlacementV2Request['duplicateMode'];
  captureTimeMs?: number;
}

/**
 * Runs the requested commit kind. Extracted from CommitBar's inline branching
 * so the R5 error screen's Retry can re-run the exact same commit without
 * duplicating the branch order (the pending-placement retry always takes
 * priority over `kind`, matching CommitBar's own precedence).
 */
export async function runCommit(
  kind: CommitKind,
  ctx: RunCommitContext
): Promise<{ productId: string; placementOutcome: PlacementOutcome | null }> {
  const {
    draft,
    routing,
    user,
    dedupMatchId,
    pendingPlacementProductId,
    duplicateMode,
    captureTimeMs,
  } = ctx;
  const hasProjectPlacement =
    !!routing.specBookPlacement && routing.specBookPlacement.kind !== 'library';
  if (pendingPlacementProductId && hasProjectPlacement) {
    return retrySpecBookPlacement(pendingPlacementProductId, draft, routing, duplicateMode);
  }
  if (kind === 'reuse') {
    if (!dedupMatchId) throw new Error('No matched product to reuse.');
    return reuseProductForSpecBookPlacement(dedupMatchId, draft, routing);
  }
  if (kind === 'library') {
    return saveToLibrary(draft, routing, user, duplicateMode, captureTimeMs);
  }
  if (kind === 'update') {
    if (!dedupMatchId) throw new Error('No matched product to update.');
    return updateExisting(dedupMatchId, draft, routing, user, captureTimeMs);
  }
  const productId = await saveToInbox(draft, routing, user, captureTimeMs);
  return { productId, placementOutcome: null };
}

/**
 * Reconstructs "the same commit target" for a Retry from R5. Prefers
 * io.lastCommitKind — the kind SAVE_START was actually dispatched with —
 * since state alone can't tell "declined the merge, saved as new" from
 * "updated": both leave dedup.match set (CL W3-E10 F2). Falls back to
 * deriving from routing/dedup only for a state with no lastCommitKind yet
 * (shouldn't happen from a real SAVE_START, but keeps this total).
 */
export function deriveRetryKind(
  routing: RoutingSlice,
  hasDedupMatch: boolean,
  pendingPlacementProductId: string | null,
  lastCommitKind?: CommitKind | null
): CommitKind {
  if (lastCommitKind) return lastCommitKind;
  const hasProjectPlacement =
    !!routing.specBookPlacement && routing.specBookPlacement.kind !== 'library';
  if (pendingPlacementProductId && hasProjectPlacement) return 'reuse';
  if (routing.commitTarget === 'inbox') return 'inbox';
  if (hasDedupMatch) return hasProjectPlacement ? 'reuse' : 'update';
  return 'library';
}

// ─── Save-error classification (CommitBar's catch + the R5 retry's catch) ────

/** Formats a thrown value into a short human message (PostgREST/Supabase error shapes included). */
export function formatSaveError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const x = e as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    const m = x.message || x.details || x.hint || JSON.stringify(e);
    return x.code ? `[${x.code}] ${m}` : m;
  }
  return 'Save failed';
}

export type SaveErrorClass = 'offline' | 'auth' | 'server';

/** The message text off either an Error or a plain thrown object (postgrest-js throws plain objects). */
function errorMessageText(e: unknown): string | undefined {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && typeof (e as Record<string, unknown>).message === 'string') {
    return (e as Record<string, unknown>).message as string;
  }
  return undefined;
}

/**
 * Classifies a save-path error into offline / expired-session / everything
 * else, per the R5 routing rules (CL W3-E10). All three classes render on
 * R5 — see CommitBar's catch.
 */
export function classifySaveError(e: unknown): {
  errorClass: SaveErrorClass;
  message: string;
} {
  const msgText = errorMessageText(e);
  const offline =
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    (typeof msgText === 'string' &&
      /failed to fetch|networkerror|network request failed|load failed/i.test(msgText));
  if (offline) {
    return {
      errorClass: 'offline',
      message: "You're offline — your draft is kept. Retry when you're back.",
    };
  }
  const obj = e && typeof e === 'object' ? (e as Record<string, unknown>) : null;
  const code = obj?.code;
  const status = obj?.status;
  const msg = obj?.message;
  const authExpired =
    code === 'PGRST301' ||
    status === 401 ||
    (typeof msg === 'string' && /jwt/i.test(msg) && /expired/i.test(msg));
  if (authExpired) {
    return {
      errorClass: 'auth',
      message: 'Your session expired — sign in to finish saving.',
    };
  }
  return { errorClass: 'server', message: formatSaveError(e) };
}
