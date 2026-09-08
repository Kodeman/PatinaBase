import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { StudioLicenseAttestation } from '@patina/types';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// STUDIO LICENSE ATTESTATION — "The Agreement, Composed" Wave 3, P10 / R10
// (table `studio_license_attestations`)
//
// A studio's SELF-ATTESTED credential. Patina stores it and NEVER verifies
// it: there is no registry lookup, no state-board call, no expiry cron, and
// no "verified" mark anywhere in the product. R10 is the whole rule, and the
// card that writes this row says so in words the studio reads.
//
// What the row gates is one thing: selecting the `patina.design_build`
// template. The gate is held in three places and only the last two are
// load-bearing — `materialize_agreement_template` and
// `send_commercial_document` both call
// `studio_has_live_license_attestation`. The UI's disabled template is a
// courtesy on top, derived from this hook so the two cannot disagree.
//
// Shaped exactly like useStudioAgreementDefaults / useStudioBillingSettings
// (00428, 00575): every ACTIVE member reads, only an owner or admin writes
// (RLS). Unlike those two an ABSENT row is not a set of defaults — it is the
// honest answer "this studio has attested nothing", so the read returns null
// rather than inventing a shape.
// ═══════════════════════════════════════════════════════════════════════════

/** The snake_case row shape as `studio_license_attestations` stores it. */
export interface StudioLicenseAttestationRow {
  studio_id: string;
  credential_type: string;
  credential_number: string;
  state: string;
  expires_on: string;
  attested_by: string | null;
  attested_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const studioLicenseAttestationKeys = {
  all: ['studio-license-attestation'] as const,
  detail: (studioId: string) => ['studio-license-attestation', studioId] as const,
};

export function mapStudioLicenseAttestation(
  row: StudioLicenseAttestationRow
): StudioLicenseAttestation {
  return {
    studioId: row.studio_id,
    credentialType: row.credential_type,
    credentialNumber: row.credential_number,
    state: row.state,
    expiresOn: row.expires_on,
    attestedBy: row.attested_by ?? null,
    attestedAt: row.attested_at ?? null,
  };
}

/**
 * Is this attestation live TODAY?
 *
 * The same question `studio_has_live_license_attestation` answers in SQL
 * (`expires_on > current_date`), asked here so the picker's disabled state and
 * the database's refusal cannot disagree. Compared as calendar dates, not as
 * instants: `expires_on` is a `date`, and turning it into a timestamp at UTC
 * midnight would expire a Wisconsin studio's credential most of a day early.
 */
export function licenseAttestationIsLive(
  attestation: StudioLicenseAttestation | null | undefined,
  today: Date = new Date()
): boolean {
  if (!attestation?.expiresOn) return false;
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
  return attestation.expiresOn > stamp;
}

/**
 * The studio's attestation, or null when it has never made one — which is
 * every studio until an owner or admin fills in the Licensing card.
 *
 * A read that ERRORS also answers null, for `useStudioAgreementDefaults`'s
 * reason: the migration lands on Strata on its own schedule and the portals
 * deploy on theirs, and in the window between, the relation does not exist
 * yet while Account → Studio must still render its other cards. "Nothing
 * attested" is the fail-closed answer in both cases — it locks the template
 * rather than opening it.
 */
export function useStudioLicenseAttestation(studioId: string | null | undefined) {
  return useQuery({
    queryKey: studioLicenseAttestationKeys.detail(studioId as string),
    queryFn: async (): Promise<StudioLicenseAttestation | null> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_license_attestations')
        .select('*')
        .eq('studio_id', studioId)
        .maybeSingle();
      if (error) return null;
      const row = data as StudioLicenseAttestationRow | null;
      return row ? mapStudioLicenseAttestation(row) : null;
    },
    enabled: !!studioId,
  });
}

export interface SaveStudioLicenseAttestationInput {
  studioId: string;
  credentialType: string;
  credentialNumber: string;
  /** Two upper-case letters — the DB CHECKs `^[A-Z]{2}$`. */
  state: string;
  /** ISO calendar date, `YYYY-MM-DD`. */
  expiresOn: string;
  attestedBy: string;
}

/**
 * Upserts the attestation on the `studio_id` primary key. RLS admits only an
 * owner or admin, and a plain member's write THROWS rather than reaching no
 * rows — an insert violates the policy (42501), an update matches nothing and
 * `.select().single()` turns that into PGRST116. Either way the card shows
 * its refusal.
 *
 * `attestedBy` is required, not optional: an attestation is a STATEMENT
 * somebody made, and a row that cannot say who made it is not an attestation.
 * `attested_at` is the column's own `now()` default, re-stamped here so a
 * re-attestation carries the date it was actually re-made.
 */
export function useSaveStudioLicenseAttestation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      studioId,
      credentialType,
      credentialNumber,
      state,
      expiresOn,
      attestedBy,
    }: SaveStudioLicenseAttestationInput): Promise<StudioLicenseAttestation> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_license_attestations')
        .upsert(
          {
            studio_id: studioId,
            credential_type: credentialType.trim(),
            credential_number: credentialNumber.trim(),
            state: state.trim().toUpperCase(),
            expires_on: expiresOn,
            attested_by: attestedBy,
            attested_at: new Date().toISOString(),
          },
          { onConflict: 'studio_id' }
        )
        .select()
        .single();
      if (error) throw error;
      return mapStudioLicenseAttestation(data as StudioLicenseAttestationRow);
    },
    onSuccess: (_data, { studioId }) => {
      queryClient.invalidateQueries({
        queryKey: studioLicenseAttestationKeys.detail(studioId),
      });
    },
  });
}
