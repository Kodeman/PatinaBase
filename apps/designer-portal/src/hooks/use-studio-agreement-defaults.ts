"use client";

/**
 * Studio agreement defaults — what a new agreement starts from.
 *
 * Shaped exactly like `useStudioBillingSettings` (`@patina/supabase`,
 * `use-studio-billing.ts`), including its "an absent row reads as the
 * defaults" behaviour, so the Account card never has to special-case
 * "unconfigured". One row per organization; RLS is read = active member,
 * write = owner/admin (R3, migration 00575).
 *
 * App-local rather than in `@patina/supabase` for one reason: the designer
 * lane cannot touch `packages/**` while the backend lane is building the
 * matching table and its package hook concurrently. The query key here is the
 * frozen interface's key — `['studio-agreement-defaults', studioId]` — so the
 * two caches are the same cache, and the integration step is a one-line
 * import swap, not a behaviour change.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@patina/supabase";

const getSupabase = () => createBrowserClient() as any;

export interface StudioAgreementDefaultsRow {
  studio_id: string;
  rate_card: { roleName: string; hourlyRateCents: number; sortOrder: number }[];
  deposit_percent: number | null;
  cadence: "monthly" | "biweekly" | "milestone";
  retainer_credit_rule: "credited" | "non_refundable" | "replenishing";
  default_exclusions: string[];
  updated_by: string | null;
}

export function defaultStudioAgreementDefaults(
  studioId: string,
): StudioAgreementDefaultsRow {
  return {
    studio_id: studioId,
    rate_card: [],
    deposit_percent: null,
    cadence: "monthly",
    retainer_credit_rule: "credited",
    default_exclusions: [],
    updated_by: null,
  };
}

function mapRow(studioId: string, row: any): StudioAgreementDefaultsRow {
  const fallback = defaultStudioAgreementDefaults(studioId);
  if (!row) return fallback;
  const percent = Number(row.deposit_percent);
  return {
    studio_id: String(row.studio_id ?? studioId),
    rate_card: Array.isArray(row.rate_card)
      ? row.rate_card.flatMap((raw: any, index: number) =>
          raw && typeof raw === "object"
            ? [
                {
                  roleName:
                    typeof raw.roleName === "string" ? raw.roleName : "",
                  hourlyRateCents: Number.isFinite(Number(raw.hourlyRateCents))
                    ? Math.round(Number(raw.hourlyRateCents))
                    : 0,
                  sortOrder: Number.isFinite(Number(raw.sortOrder))
                    ? Number(raw.sortOrder)
                    : index,
                },
              ]
            : [],
        )
      : [],
    deposit_percent:
      row.deposit_percent === null || row.deposit_percent === undefined
        ? null
        : Number.isFinite(percent)
          ? percent
          : null,
    cadence:
      row.cadence === "biweekly" || row.cadence === "milestone"
        ? row.cadence
        : "monthly",
    retainer_credit_rule:
      row.retainer_credit_rule === "non_refundable" ||
      row.retainer_credit_rule === "replenishing"
        ? row.retainer_credit_rule
        : "credited",
    default_exclusions: Array.isArray(row.default_exclusions)
      ? row.default_exclusions
          .map((item: unknown) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : [],
    updated_by: typeof row.updated_by === "string" ? row.updated_by : null,
  };
}

/**
 * A studio's agreement defaults, or the Patina standard when it has never
 * saved any. A missing relation resolves to the standard too — 00575 lands on
 * Strata separately from this Worker, and the Account page must not break in
 * the window between.
 */
export function useStudioAgreementDefaults(
  studioId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["studio-agreement-defaults", studioId],
    queryFn: async (): Promise<StudioAgreementDefaultsRow> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("studio_agreement_defaults")
        .select("*")
        .eq("studio_id", studioId)
        .maybeSingle();
      if (error) return defaultStudioAgreementDefaults(studioId as string);
      return mapRow(studioId as string, data);
    },
    enabled: !!studioId,
  });
}

export interface UpdateStudioAgreementDefaultsInput {
  studioId: string;
  rateCard: { roleName: string; hourlyRateCents: number; sortOrder: number }[];
  depositPercent: number | null;
  cadence: "monthly" | "biweekly" | "milestone";
  retainerCreditRule: "credited" | "non_refundable" | "replenishing";
  defaultExclusions: string[];
}

/** Upserts on `studio_id`. RLS refuses a plain member (R3), so the card's
 *  `canManage` gate is the courtesy and the policy is the rule. */
export function useUpdateStudioAgreementDefaults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: UpdateStudioAgreementDefaultsInput,
    ): Promise<StudioAgreementDefaultsRow> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("studio_agreement_defaults")
        .upsert(
          {
            studio_id: input.studioId,
            rate_card: input.rateCard,
            deposit_percent: input.depositPercent,
            cadence: input.cadence,
            retainer_credit_rule: input.retainerCreditRule,
            default_exclusions: input.defaultExclusions,
          },
          { onConflict: "studio_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return mapRow(input.studioId, data);
    },
    onSuccess: (_row, input) => {
      queryClient.invalidateQueries({
        queryKey: ["studio-agreement-defaults", input.studioId],
      });
    },
  });
}
