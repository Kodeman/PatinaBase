import { supabase } from './supabase';

export const SPEC_BOOK_PLACEMENT_CONTEXT_KEY = 'patina_spec_book_placement_context_v1';

export type SpecBookPlacementRoute =
  | { kind: 'library' }
  | {
      kind: 'project_inbox';
      projectId: string;
      roomId: string | null;
    }
  | {
      kind: 'fill_slot';
      projectId: string;
      roomId: string;
      slotId: string;
    }
  | {
      kind: 'create_line';
      projectId: string;
      roomId: string;
      category: string;
    };

export interface SpecBookPlacementContext {
  projectId: string | null;
  roomId: string | null;
  /**
   * Sticky destination (CL-R1 / D5) — the last-chosen route kind, remembered
   * alongside project/room so a designer filling a room doesn't re-pick the
   * destination on every capture. Optional so contexts saved before this
   * field existed still load; a missing value falls back to the picker's
   * pre-existing default.
   */
  routeKind?: SpecBookPlacementRoute['kind'];
}

const ROUTE_KINDS: ReadonlySet<SpecBookPlacementRoute['kind']> = new Set([
  'library',
  'project_inbox',
  'fill_slot',
  'create_line',
]);

export interface PlacementSource {
  sourceUrl: string;
  captureKind: string;
  captureId?: string | null;
}

export interface PlacementRpcPayload {
  p_project_id: string;
  p_product_id: string;
  p_room_id: string | null;
  p_slot_id: string | null;
  p_category: string | null;
  p_source: {
    client: 'chrome_extension';
    surface: 'chrome_extension';
    route_kind: Exclude<SpecBookPlacementRoute['kind'], 'library'>;
    source_url: string;
    capture_kind: string;
    idempotencyKey: string;
    captureId?: string;
  };
}

/** The GA command envelope. The N-1 RPC below remains the Chrome transition
 * fallback, so installed extensions can continue to route to Unsorted until
 * the Web Store release is available. */
export interface PlacementV2Request {
  projectId: string;
  productId: string;
  roomId: string | null;
  assignmentScope: 'room' | 'unassigned';
  category: string | null;
  boardId: null;
  disposition: 'candidate';
  duplicateMode: 'reuse' | 'create' | 'hold';
  placeholderSelectionId: string | null;
  configurationId: null;
  roleConfigurationIdentity: null;
  idempotencyKey: string;
  source: 'chrome_extension';
}
export interface PlacementOutcome { outcome: 'created' | 'reused' | 'filled' | 'held'; selectionId: string | null; threadId: string | null; placementId: string | null; }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CATEGORY_LENGTH = 200;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

const resultUuid = (row: Record<string, unknown>, camel: string, snake: string): string | null | undefined => {
  const value = row[camel] ?? row[snake];
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
};

export function placementOutcome(value: unknown): PlacementOutcome | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const rawOutcome = row.outcome;
  if (rawOutcome !== 'created' && rawOutcome !== 'reused' && rawOutcome !== 'filled' && rawOutcome !== 'held') return null;
  const directSelectionId = resultUuid(row, 'selectionId', 'selection_id');
  const fallbackSelectionId = resultUuid(row, 'ffeItemId', 'ffe_item_id');
  const selectionId = directSelectionId === undefined ? fallbackSelectionId : directSelectionId;
  const threadId = resultUuid(row, 'threadId', 'thread_id');
  const placementId = resultUuid(row, 'placementId', 'placement_id');
  if (selectionId === null || threadId === null || placementId === null) return null;
  if (rawOutcome === 'held') {
    if (selectionId || threadId || placementId) return null;
    return { outcome: rawOutcome, selectionId: null, threadId: null, placementId: null };
  }
  if (!selectionId || !threadId) return null;
  return { outcome: rawOutcome, selectionId, threadId, placementId: placementId ?? null };
}

function categoryFor(route: Exclude<SpecBookPlacementRoute, { kind: 'library' }>): string | null {
  if (route.kind !== 'create_line') return null;
  const category = route.category.trim();
  if (!category || category.length > MAX_CATEGORY_LENGTH) throw new Error('Category must be 1–200 characters');
  return category;
}

// Four independent 32-bit streams keep the retry key compact while making a
// collision across bounded command identities vanishingly unlikely.
function stableHash(value: string): string {
  const hashes = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const primes = [0x01000193, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    for (let stream = 0; stream < hashes.length; stream += 1) {
      hashes[stream] = Math.imul(hashes[stream] ^ (code + stream), primes[stream]);
    }
  }
  return hashes.map((hash) => (hash >>> 0).toString(16).padStart(8, '0')).join('');
}

function placementIdempotencyKey(
  productId: string,
  route: Exclude<SpecBookPlacementRoute, { kind: 'library' }>,
  duplicateMode: PlacementV2Request['duplicateMode'],
): string {
  const identity = `chrome:${productId}:${route.projectId}:${route.kind}:${route.roomId ?? 'unassigned'}:${route.kind === 'fill_slot' ? route.slotId : categoryFor(route) ?? ''}:${duplicateMode}`;
  if (identity.length <= MAX_IDEMPOTENCY_KEY_LENGTH) return identity;
  const suffix = `:h:${stableHash(identity)}`;
  return `${identity.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH - suffix.length)}${suffix}`;
}

function isContext(value: unknown): value is SpecBookPlacementContext {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.projectId === null || typeof candidate.projectId === 'string') &&
    (candidate.roomId === null || typeof candidate.roomId === 'string') &&
    (candidate.routeKind === undefined ||
      (typeof candidate.routeKind === 'string' &&
        ROUTE_KINDS.has(candidate.routeKind as SpecBookPlacementRoute['kind'])))
  );
}

export async function loadSpecBookPlacementContext(): Promise<SpecBookPlacementContext> {
  try {
    const result = await chrome.storage.local.get(SPEC_BOOK_PLACEMENT_CONTEXT_KEY);
    const stored = result?.[SPEC_BOOK_PLACEMENT_CONTEXT_KEY];
    return isContext(stored) ? stored : { projectId: null, roomId: null };
  } catch {
    return { projectId: null, roomId: null };
  }
}

export async function saveSpecBookPlacementContext(
  context: SpecBookPlacementContext
): Promise<void> {
  try {
    await chrome.storage.local.set({
      [SPEC_BOOK_PLACEMENT_CONTEXT_KEY]: context,
    });
  } catch {
    // Routing remains usable for this capture even when persistence is denied.
  }
}

export function placementRpcPayload(
  productId: string,
  route: Exclude<SpecBookPlacementRoute, { kind: 'library' }>,
  source: PlacementSource,
  duplicateMode: PlacementV2Request['duplicateMode'],
): PlacementRpcPayload {
  const idempotencyKey = placementIdempotencyKey(productId, route, duplicateMode);
  return {
    p_project_id: route.projectId,
    p_product_id: productId,
    p_room_id: route.roomId,
    p_slot_id: route.kind === 'fill_slot' ? route.slotId : null,
    p_category: categoryFor(route),
    p_source: {
      client: 'chrome_extension',
      surface: 'chrome_extension',
      route_kind: route.kind,
      source_url: source.sourceUrl,
      capture_kind: source.captureKind,
      idempotencyKey,
      ...(source.captureId ? { captureId: source.captureId } : {}),
    },
  };
}

export function placementV2Request(
  productId: string,
  route: Exclude<SpecBookPlacementRoute, { kind: 'library' }>,
  source: PlacementSource,
  duplicateMode: PlacementV2Request['duplicateMode'],
): PlacementV2Request {
  return {
    projectId: route.projectId,
    productId,
    roomId: route.roomId,
    assignmentScope: route.roomId ? 'room' : 'unassigned',
    category: categoryFor(route),
    boardId: null,
    duplicateMode,
    disposition: 'candidate',
    placeholderSelectionId: route.kind === 'fill_slot' ? route.slotId : null,
    configurationId: null,
    roleConfigurationIdentity: null,
    // Product + destination make retries stable without persisting a mutable
    // request body in the extension.
    idempotencyKey: placementIdempotencyKey(productId, route, duplicateMode),
    source: 'chrome_extension',
  };
}

export class SpecBookPlacementError extends Error {
  constructor(
    message: string,
    readonly productId: string,
    readonly route: Exclude<SpecBookPlacementRoute, { kind: 'library' }>
  ) {
    super(message);
    this.name = 'SpecBookPlacementError';
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const value = error as {
      message?: string;
      details?: string;
      hint?: string;
    };
    return (
      value.message || value.details || value.hint || 'Could not place the product in the project'
    );
  }
  return 'Could not place the product in the project';
}

/**
 * The sole extension write path into the live project schedule.
 *
 * The Product row is deliberately created/reused before this call. A failed
 * placement therefore leaves the Product durable and throws its id + selected
 * route so the UI can retry the RPC without inserting a duplicate Product.
 */
export async function placeProductInProject(
  productId: string,
  route: SpecBookPlacementRoute,
  source: PlacementSource,
  options: { duplicateMode: PlacementV2Request['duplicateMode'] },
): Promise<PlacementOutcome | null> {
  if (route.kind === 'library') return null;

  const v2 = await supabase.rpc('place_product_in_project_v2', {
    p_request: placementV2Request(productId, route, source, options.duplicateMode),
  });
  // N-1 extension compatibility only: databases before the GA migration do
  // not know v2. Any authorization/domain error is surfaced, never retried by
  // writing through a weaker path.
  const fallback = v2.error?.code === '42883' || v2.error?.code === 'PGRST202';
  const legacy = fallback ? await supabase.rpc('place_product_in_project', placementRpcPayload(productId, route, source, options.duplicateMode)) : null;
  const error = fallback ? legacy?.error : v2.error;
  if (error) {
    throw new SpecBookPlacementError(errorMessage(error), productId, route);
  }
  const outcome = placementOutcome(fallback ? legacy?.data : v2.data);
  if (!outcome) throw new SpecBookPlacementError('Project placement returned an invalid outcome', productId, route);
  return outcome;
}
