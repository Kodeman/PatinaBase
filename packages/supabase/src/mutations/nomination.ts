/**
 * Vendor nomination mutations. The state-machine itself lives in
 * migration 00158 — these mutations only handle the initial INSERT
 * (designer-side submission). Status transitions are admin-only and
 * route through the admin portal's internal tool (S3.5).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '../client';
import type { Database, Json } from '../database.types';

export type NominationStatus =
  | 'submitted'
  | 'under_review'
  | 'contacted'
  | 'onboarding'
  | 'live'
  | 'declined';

export interface NominateVendorInput {
  vendorId: string;
  studioId: string;
  /** `{ name, email }` typically — JSON for forward-compat. */
  manufacturerContact: Json;
  recommendationNote: string;
  fitSignals?: string[];
  /** Renomination of a previously-declined vendor (PRD §6.7). */
  previousNominationId?: string;
}

export interface NominateVendorResult {
  nominationId: string;
}

/**
 * Designer-side INSERT into `vendor_nominations`. The
 * `vendor_nominations_insert` RLS policy from migration 00152 gates this
 * to studio owners (role='owner'); auth.uid() must equal
 * nominated_by_user_id. The after-insert trigger from migration 00158
 * denormalizes the new 'submitted' status onto `vendors.nomination_status`.
 */
export async function nominateVendor(
  input: NominateVendorInput,
  client: SupabaseClient<Database> = createBrowserClient(),
): Promise<NominateVendorResult> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw new Error('nominateVendor: unauthenticated');
  }

  if (!input.recommendationNote.trim()) {
    throw new Error('nominateVendor: recommendation_note is required');
  }

  const { data, error } = await client
    .from('vendor_nominations')
    .insert({
      vendor_id: input.vendorId,
      studio_id: input.studioId,
      nominated_by_user_id: user.id,
      manufacturer_contact: input.manufacturerContact,
      recommendation_note: input.recommendationNote.trim(),
      fit_signals: input.fitSignals ?? null,
      previous_nomination_id: input.previousNominationId ?? null,
      status: 'submitted',
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`nominateVendor: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error('nominateVendor: insert returned no id');
  }
  return { nominationId: data.id };
}
