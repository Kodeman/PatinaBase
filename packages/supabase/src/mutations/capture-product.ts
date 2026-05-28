/**
 * `captureProduct` — the unified write path for the Patina capture pipeline.
 * Implements the contract from the engineering handoff §7.4 and is the
 * intended target for the Chrome extension, the mobile capture flow, and
 * the in-portal URL-paste path.
 *
 * What it does:
 *   1. Resolves a vendor (find-or-create, see `lib/vendors.ts`).
 *   2. Inserts a `products` row with `layer = 'personal'` and
 *      `owner_user_id` set, so the new RLS + CHECK constraints from
 *      migration 00152 pass without relying on the transitional
 *      normalize trigger.
 *   3. Optionally links the new product to a project room via the
 *      caller-supplied destination contract.
 *   4. Returns the new product id + the resolved vendor envelope.
 *
 * Analytics emission is intentionally NOT inside this function — the
 * hook in `hooks/use-capture-product.ts` fires `product.captured` so the
 * call works equally from queue drains, edge functions, and React UI.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '../client';
import type { Database } from '../database.types';
import { resolveVendor, type ResolvedVendor } from '../lib/vendors';

export interface CaptureProductDestination {
  type: 'personal' | 'project-room';
  projectId?: string;
  roomId?: string;
}

export interface CaptureProductInput {
  /** Display name. Optional — falls back to "Untitled Product". */
  name?: string | null;
  imageUrl?: string | null;
  images?: string[];
  sourceUrl?: string | null;
  /** Either price_retail cents directly, or a raw decimal string the caller hasn't parsed. */
  priceRetailCents?: number | null;
  description?: string | null;
  /** Vendor signals — both optional, see `resolveVendor`. */
  detectedVendorName?: string | null;
  ownerUserId: string;
  destination?: CaptureProductDestination;
  /**
   * Optional capture-source tag used by analytics. Not persisted on the
   * row itself; passed back in the result envelope so the calling hook
   * can attach it to the `product.captured` event.
   */
  captureSource?: 'chrome_extension' | 'mobile_photo' | 'url_paste' | 'manual';
}

export interface CaptureProductResult {
  productId: string;
  vendor: ResolvedVendor;
  /** Mirrors the input so the analytics hook doesn't have to thread it. */
  captureSource: CaptureProductInput['captureSource'];
  /** Set when destination.type === 'project-room' and link succeeded. */
  projectProductLinkId?: string;
}

/**
 * Single source of truth for capture-driven product inserts. RLS handles
 * visibility (only the owner sees the personal row); the constraint chain
 * in 00152 enforces shape.
 */
export async function captureProduct(
  input: CaptureProductInput,
  client: SupabaseClient<Database> = createBrowserClient(),
): Promise<CaptureProductResult> {
  if (!input.ownerUserId) {
    throw new Error('captureProduct: ownerUserId is required');
  }

  const vendor = await resolveVendor(
    { url: input.sourceUrl ?? undefined, name: input.detectedVendorName ?? undefined },
    client,
  );

  const images = input.images && input.images.length > 0
    ? input.images
    : input.imageUrl
      ? [input.imageUrl]
      : [];

  const insertPayload = {
    name: (input.name?.trim() || 'Untitled Product').slice(0, 255),
    description: input.description ?? null,
    source_url: input.sourceUrl ?? null,
    images,
    price_retail: input.priceRetailCents ?? null,
    vendor_id: vendor.id,
    captured_by: input.ownerUserId,
    captured_at: new Date().toISOString(),
    layer: 'personal' as const,
    owner_user_id: input.ownerUserId,
  };

  const { data: product, error: insertError } = await client
    .from('products')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`captureProduct: insert failed: ${insertError.message}`);
  }
  if (!product?.id) {
    throw new Error('captureProduct: insert returned no id');
  }

  let projectProductLinkId: string | undefined;

  // Destination routing. Project-room destinations attach the new product
  // to project_products. The room-level FFE-slot attachment is a separate
  // concern (apps/extension's FFESlotPicker handles it post-capture) — we
  // record the project-level link here and let downstream surfaces add
  // the slot link.
  if (input.destination?.type === 'project-room' && input.destination.projectId) {
    const { data: link, error: linkError } = await client
      .from('project_products')
      .insert({
        project_id: input.destination.projectId,
        product_id: product.id,
      })
      .select('id')
      .single();
    if (linkError) {
      // Insert link errors are non-fatal — the product captured, just not
      // attached. Surface a warning rather than rolling back.
      // eslint-disable-next-line no-console
      console.warn('captureProduct: project_products link failed', linkError);
    } else if (link?.id) {
      projectProductLinkId = link.id;
    }
  }

  return {
    productId: product.id,
    vendor,
    captureSource: input.captureSource,
    projectProductLinkId,
  };
}
