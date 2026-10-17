/**
 * Trade pricing (US-37 #4, migration 00809): the one FF&E pricing writer,
 * line kinds, cost-change resolution, markup resets, the job's markup target
 * and sales tax, and the designer's default markups. Every write is a
 * SECURITY DEFINER RPC; the line writes invalidate the FF&E caches
 * (invalidateFfeCaches), the settings writes their own key.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DesignerPricingSettings,
  FfeCostChangeResolution,
  FfeLinePricing,
  FfeLinePricingField,
  FfePricedLineKind,
  ProjectPricingSettings,
  ResetProjectMarkupsResult,
  SetDesignerPricingSettingsRequest,
} from '@patina/types';
import { createBrowserClient } from '../client';
import { invalidateFfeCaches } from './use-procurement';

const getSupabase = () => createBrowserClient();

export const projectPricingKey = (projectId: string) => ['project-pricing', projectId] as const;

export const myPricingSettingsKey = ['my-pricing-settings'] as const;

interface LineInput {
  projectId: string;
  itemId: string;
}

export interface SetFfeLinePricingInput extends LineInput {
  field: FfeLinePricingField;
  /** Whole cents for prices, a whole number for quantity, any number ≥ -100 for markup; null clears retail. */
  value: number | null;
}

/** Sets one pricing field on a line (set_ffe_line_pricing). Refused once released or invoiced. */
export function useSetFfeLinePricing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, field, value }: SetFfeLinePricingInput): Promise<FfeLinePricing> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('set_ffe_line_pricing', {
        p_item_id: itemId,
        p_field: field,
        p_value: value,
      });
      if (error) throw error;
      return data as FfeLinePricing;
    },
    onSuccess: (_result, { projectId }) => invalidateFfeCaches(queryClient, projectId),
  });
}

export interface SetFfeLineKindInput extends LineInput {
  lineKind: FfePricedLineKind;
}

/** Sets a non-labor line's kind: goods, freight, delivery or install (set_ffe_line_kind). */
export function useSetFfeLineKind() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, lineKind }: SetFfeLineKindInput): Promise<FfeLinePricing> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('set_ffe_line_kind', {
        p_item_id: itemId,
        p_line_kind: lineKind,
      });
      if (error) throw error;
      return data as FfeLinePricing;
    },
    onSuccess: (_result, { projectId }) => invalidateFfeCaches(queryClient, projectId),
  });
}

export interface ResolveFfeCostChangeInput extends LineInput {
  resolution: FfeCostChangeResolution;
}

/** Settles a pending cost change: keep the client price, or keep the markup (resolve_ffe_cost_change). */
export function useResolveFfeCostChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, resolution }: ResolveFfeCostChangeInput): Promise<FfeLinePricing> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('resolve_ffe_cost_change', {
        p_item_id: itemId,
        p_resolution: resolution,
      });
      if (error) throw error;
      return data as FfeLinePricing;
    },
    onSuccess: (_result, { projectId }) => invalidateFfeCaches(queryClient, projectId),
  });
}

/** Puts a line back on its default markup (reset_ffe_line_markup). */
export function useResetFfeLineMarkup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId }: LineInput): Promise<FfeLinePricing> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('reset_ffe_line_markup', {
        p_item_id: itemId,
      });
      if (error) throw error;
      return data as FfeLinePricing;
    },
    onSuccess: (_result, { projectId }) => invalidateFfeCaches(queryClient, projectId),
  });
}

/** Puts every open line on the job back on its default markup (reset_project_markups). */
export function useResetProjectMarkups() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId }: { projectId: string }): Promise<ResetProjectMarkupsResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('reset_project_markups', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return data as ResetProjectMarkupsResult;
    },
    onSuccess: (_result, { projectId }) => invalidateFfeCaches(queryClient, projectId),
  });
}

interface ProjectPricingRow {
  project_id: string;
  markup_target_percent: number | null;
  sales_tax_rate: number | null;
  updated_at: string;
}

/** The job's markup target and sales tax (team-only). Unset reads as nulls. */
export function useProjectPricing(projectId: string) {
  return useQuery({
    queryKey: projectPricingKey(projectId),
    queryFn: async (): Promise<ProjectPricingSettings> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any)
        .from('project_pricing_settings')
        .select('project_id, markup_target_percent, sales_tax_rate, updated_at')
        .eq('project_id', projectId)
        .maybeSingle();
      if (error) throw error;
      const row = data as ProjectPricingRow | null;
      return {
        projectId,
        markupTargetPercent: row?.markup_target_percent ?? null,
        salesTaxRate: row?.sales_tax_rate ?? null,
        updatedAt: row?.updated_at ?? null,
      };
    },
    enabled: Boolean(projectId),
  });
}

export interface SetProjectPricingInput {
  projectId: string;
  /** null clears the target (the lead's default applies). */
  markupTargetPercent: number | null;
  /** A fraction, 0 to 1; null clears it. */
  salesTaxRate: number | null;
}

/** Sets the job's markup target and sales tax rate (set_project_pricing). Prices nothing. */
export function useSetProjectPricing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      markupTargetPercent,
      salesTaxRate,
    }: SetProjectPricingInput): Promise<ProjectPricingSettings> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('set_project_pricing', {
        p_project_id: projectId,
        p_markup_target_percent: markupTargetPercent,
        p_sales_tax_rate: salesTaxRate,
      });
      if (error) throw error;
      return data as ProjectPricingSettings;
    },
    onSuccess: (_result, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectPricingKey(projectId) });
      invalidateFfeCaches(queryClient, projectId);
    },
  });
}

/** The signed-in designer's default markups (get_my_pricing_settings). */
export function usePricingSettings() {
  return useQuery({
    queryKey: myPricingSettingsKey,
    queryFn: async (): Promise<DesignerPricingSettings> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('get_my_pricing_settings');
      if (error) throw error;
      return data as DesignerPricingSettings;
    },
  });
}

/** Sets the signed-in designer's default markups (set_my_pricing_settings). Prices nothing already placed. */
export function useSetPricingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: SetDesignerPricingSettingsRequest): Promise<DesignerPricingSettings> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('set_my_pricing_settings', {
        p_default_markup_percent: request.defaultMarkupPercent ?? null,
        p_freight_markup_percent: request.freightMarkupPercent ?? null,
        p_delivery_markup_percent: request.deliveryMarkupPercent ?? null,
        p_install_markup_percent: request.installMarkupPercent ?? null,
      });
      if (error) throw error;
      return data as DesignerPricingSettings;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: myPricingSettingsKey }),
  });
}
