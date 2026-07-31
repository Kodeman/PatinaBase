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
}

export interface PlacementSource {
  sourceUrl: string;
  captureKind: string;
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
  };
}

function isContext(value: unknown): value is SpecBookPlacementContext {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.projectId === null || typeof candidate.projectId === 'string') &&
    (candidate.roomId === null || typeof candidate.roomId === 'string')
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
  source: PlacementSource
): PlacementRpcPayload {
  return {
    p_project_id: route.projectId,
    p_product_id: productId,
    p_room_id: route.roomId,
    p_slot_id: route.kind === 'fill_slot' ? route.slotId : null,
    p_category: route.kind === 'create_line' ? route.category.trim() : null,
    p_source: {
      client: 'chrome_extension',
      surface: 'chrome_extension',
      route_kind: route.kind,
      source_url: source.sourceUrl,
      capture_kind: source.captureKind,
    },
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
  source: PlacementSource
): Promise<void> {
  if (route.kind === 'library') return;

  const { error } = await supabase.rpc(
    'place_product_in_project',
    placementRpcPayload(productId, route, source)
  );
  if (error) {
    throw new SpecBookPlacementError(errorMessage(error), productId, route);
  }
}
