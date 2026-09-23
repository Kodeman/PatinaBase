import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@patina/supabase';

/**
 * The pilot terms published at /pilot-terms, and the acceptance recorded on the
 * designer-invite leg (P2b).
 *
 * The version string is what `profiles.pilot_terms_version` holds (00659). A
 * revision of the page is a new string here, not a schema change.
 */
export const PILOT_TERMS_VERSION = '2026-09-free-90';
export const PILOT_TERMS_PATH = '/pilot-terms';

/**
 * The instant the terms took effect. A profile older than this predates the
 * pilot and is never asked to accept it, which is what keeps every member of an
 * existing studio — Middle West's included — out of the step entirely.
 */
export const PILOT_TERMS_EFFECTIVE_FROM = '2026-09-23T00:00:00Z';

type PilotTermsClient = Pick<SupabaseClient<Database>, 'from'>;

/**
 * Whether this account should be shown the pilot-terms step before the desk.
 *
 * Two conditions, both required: nothing accepted yet, and a profile created on
 * or after the terms took effect.
 *
 * Age, not studio membership, is the test for "new". Membership cannot serve:
 * 00295's `provision_studio_on_designer` fires on any profile UPDATE that sets
 * is_designer true, and designer-invite sets it at invite time
 * (supabase/functions/designer-invite/index.ts:234-236), so an invited designer
 * already owns an active studio before she opens the email.
 *
 * Any failure resolves to `false`. This runs on the sign-in leg, and a DB blip
 * must let a designer through to her desk rather than stand in the doorway.
 */
export async function pilotTermsAcceptanceRequired(
  supabase: PilotTermsClient,
  userId: string,
): Promise<boolean> {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('created_at, pilot_terms_accepted_at')
      .eq('id', userId)
      .maybeSingle();
    if (error || !profile || profile.pilot_terms_accepted_at) return false;

    const createdAt = Date.parse(profile.created_at);
    const effectiveFrom = Date.parse(PILOT_TERMS_EFFECTIVE_FROM);
    return Number.isFinite(createdAt) && createdAt >= effectiveFrom;
  } catch {
    return false;
  }
}

/** Stamp the acceptance. Throws so the step can keep the designer on it. */
export async function recordPilotTermsAcceptance(
  supabase: PilotTermsClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      pilot_terms_accepted_at: new Date().toISOString(),
      pilot_terms_version: PILOT_TERMS_VERSION,
    })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}
