import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { StudioAgreementDefaults } from '@patina/types';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// STUDIO AGREEMENT DEFAULTS — "The Agreement, Composed" Wave 1 (migration
// 00575, table `studio_agreement_defaults`)
//
// One row per studio (organizations.id), edited from the designer portal's
// Account → Studio surface. `materialize_standard_parts` reads them
// server-side when it seeds a new agreement's nine standard parts; these
// hooks are for the settings surface itself.
//
// Shaped exactly like useStudioBillingSettings (00428): every ACTIVE member
// reads, only an owner or admin writes (RLS), and an absent row reads as the
// Patina standard rather than as null, so no form has to special-case
// "unconfigured".
// ═══════════════════════════════════════════════════════════════════════════

/** The snake_case row shape as `studio_agreement_defaults` stores it. */
export interface StudioAgreementDefaultsRow {
  studio_id: string;
  rate_card: { roleName: string; hourlyRateCents: number; sortOrder: number }[] | null;
  deposit_percent: number | null;
  cadence: StudioAgreementDefaults['cadence'];
  retainer_credit_rule: StudioAgreementDefaults['retainerCreditRule'];
  default_exclusions: string[] | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const studioAgreementDefaultsKeys = {
  all: ['studio-agreement-defaults'] as const,
  detail: (studioId: string) => ['studio-agreement-defaults', studioId] as const,
};

/** The Patina standard, which is what a studio that has never visited the
 *  Agreement defaults card is on. Kept in step with 00575's column defaults
 *  and with materialize_standard_parts' own fallbacks. */
export function defaultStudioAgreementDefaults(studioId: string): StudioAgreementDefaults {
  return {
    studioId,
    rateCard: [],
    depositPercent: null,
    cadence: 'monthly',
    retainerCreditRule: 'credited',
    defaultExclusions: [],
    updatedBy: null,
    updatedAt: null,
  };
}

function mapStudioAgreementDefaults(row: StudioAgreementDefaultsRow): StudioAgreementDefaults {
  return {
    studioId: row.studio_id,
    rateCard: row.rate_card ?? [],
    depositPercent: row.deposit_percent ?? null,
    cadence: row.cadence,
    retainerCreditRule: row.retainer_credit_rule,
    defaultExclusions: row.default_exclusions ?? [],
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * A studio's agreement defaults. No row yet — the common case, before anyone
 * has opened the card — reads as the Patina standard rather than null.
 *
 * So does a read that ERRORS. 00575 lands on Strata on its own schedule and
 * the portals deploy on theirs; in the window between, the relation does not
 * exist yet and the Account page must still render its other cards. A studio
 * that has never set a default and a studio whose table is not there yet are
 * the same thing to every reader of this hook: the Patina standard.
 */
export function useStudioAgreementDefaults(studioId: string | null | undefined) {
  return useQuery({
    queryKey: studioAgreementDefaultsKeys.detail(studioId as string),
    queryFn: async (): Promise<StudioAgreementDefaults> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_agreement_defaults')
        .select('*')
        .eq('studio_id', studioId)
        .maybeSingle();
      if (error) return defaultStudioAgreementDefaults(studioId as string);
      const row = data as StudioAgreementDefaultsRow | null;
      return row
        ? mapStudioAgreementDefaults(row)
        : defaultStudioAgreementDefaults(studioId as string);
    },
    enabled: !!studioId,
  });
}

export interface UpdateStudioAgreementDefaultsInput {
  studioId: string;
  rateCard: StudioAgreementDefaults['rateCard'];
  depositPercent: number | null;
  cadence: StudioAgreementDefaults['cadence'];
  retainerCreditRule: StudioAgreementDefaults['retainerCreditRule'];
  defaultExclusions: string[];
  updatedBy?: string | null;
}

/**
 * Upserts a studio's agreement defaults on the `studio_id` primary key. RLS
 * admits only an owner or admin (00575, R3), and a plain member's write THROWS
 * rather than reaching no rows: an insert violates the policy (42501) and an
 * update matches nothing, which `.select().single()` turns into PGRST116.
 * Either way the mutation rejects and the card shows its error.
 *
 * `updatedBy` is the caller's own user id (DR7). The column is NULL with no
 * default and no trigger, so a write that omits it makes "who last changed the
 * studio's defaults" permanently unanswerable.
 */
export function useUpdateStudioAgreementDefaults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      studioId,
      rateCard,
      depositPercent,
      cadence,
      retainerCreditRule,
      defaultExclusions,
      updatedBy,
    }: UpdateStudioAgreementDefaultsInput): Promise<StudioAgreementDefaults> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_agreement_defaults')
        .upsert(
          {
            studio_id: studioId,
            rate_card: rateCard,
            deposit_percent: depositPercent,
            cadence,
            retainer_credit_rule: retainerCreditRule,
            default_exclusions: defaultExclusions,
            updated_by: updatedBy ?? null,
          },
          { onConflict: 'studio_id' }
        )
        .select()
        .single();
      if (error) throw error;
      return mapStudioAgreementDefaults(data as StudioAgreementDefaultsRow);
    },
    onSuccess: (_data, { studioId }) => {
      queryClient.invalidateQueries({
        queryKey: studioAgreementDefaultsKeys.detail(studioId),
      });
    },
  });
}
