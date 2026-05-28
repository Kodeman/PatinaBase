/**
 * Promotion / demotion mutations. Thin typed wrappers around the
 * `promote_to_studio` and `demote_to_personal` RPCs from migration
 * 00154. The RPCs are atomic (single transaction in the function body)
 * and write the promotion_audit_log row alongside the products UPDATE.
 *
 * The auth + active-use guardrails live server-side in the RPC; the
 * mutations here surface their thrown errors as caller-facing Errors
 * so the modal UI can render them next to the submit button.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '../client';
import type { Database, Json } from './../database.types';

/**
 * Payment terms enum value (matches `purchase_order_payment_pattern` from
 * migration 00148). Surfaced here so callers don't have to import it from
 * the procurement module.
 */
export type PaymentPattern = Database['public']['Enums']['purchase_order_payment_pattern'];

export interface PromoteToStudioInput {
  productId: string;
  studioId: string;
  /** Free-form JSON: `{ name, email, phone? }` typically. Validated server-side. */
  vendorContact: Json;
  paymentTerms: PaymentPattern;
  category: string;
  subcategory?: string;
  usageNotes: string;
  leadTimeWeeks: number;
}

/** Returns the promoted product id (same as input — IDs are stable across layer transitions). */
export async function promoteToStudio(
  input: PromoteToStudioInput,
  client: SupabaseClient<Database> = createBrowserClient(),
): Promise<string> {
  const { data, error } = await client.rpc('promote_to_studio', {
    p_product_id: input.productId,
    p_studio_id: input.studioId,
    p_vendor_contact: input.vendorContact,
    p_payment_terms: input.paymentTerms,
    p_category: input.category,
    p_usage_notes: input.usageNotes,
    p_lead_time_weeks: input.leadTimeWeeks,
    ...(input.subcategory ? { p_subcategory: input.subcategory } : {}),
  });

  if (error) {
    throw new Error(`promoteToStudio: ${error.message}`);
  }
  if (!data) {
    throw new Error('promoteToStudio: RPC returned no id');
  }
  return data;
}

export interface DemoteToPersonalInput {
  productId: string;
}

/**
 * Returns the demoted product id. The RPC raises if the product is in
 * active project use (PRD §6.5) — caller should surface a clear
 * "in-use" message rather than treating the error as transient.
 */
export async function demoteToPersonal(
  input: DemoteToPersonalInput,
  client: SupabaseClient<Database> = createBrowserClient(),
): Promise<string> {
  const { data, error } = await client.rpc('demote_to_personal', {
    p_product_id: input.productId,
  });

  if (error) {
    throw new Error(`demoteToPersonal: ${error.message}`);
  }
  if (!data) {
    throw new Error('demoteToPersonal: RPC returned no id');
  }
  return data;
}

/**
 * Helper for the 7-day undo window check. The modal layer reads
 * `promoted_at` from the product row and uses this to decide whether
 * the demotion needs explicit confirmation (after 7 days) or is a
 * silent undo (within 7 days). The same window is enforced server-side
 * by the RPC — this helper is purely UX shaping.
 */
export function isWithinUndoWindow(promotedAt: string | null | undefined): boolean {
  if (!promotedAt) return false;
  const promotedMs = new Date(promotedAt).getTime();
  if (Number.isNaN(promotedMs)) return false;
  return Date.now() - promotedMs < 7 * 24 * 60 * 60 * 1000;
}
