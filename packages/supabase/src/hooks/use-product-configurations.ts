import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApproveProductConfigurationInput,
  CreateCustomCommissionRevisionInput,
  CustomCommissionRevision,
  EvaluateProductConfigurationInput,
  PlaceProductConfigurationInput,
  PrepareConfigurationQuoteRequestInput,
  PreparedConfigurationQuoteRequest,
  ProductConfigurationDefinition,
  ProductConfigurationEvaluation,
  ProductConfigurationMutationResult,
  PromoteConfigurationToLibraryInput,
  SavedProductConfiguration,
  SaveProductConfigurationInput,
  TransitionCustomCommissionRevisionInput,
  UpsertProductConfigurationDefinitionInput,
} from '@patina/types';
import { createBrowserClient } from '../client';

// RPC results are intentionally camelCase domain contracts. Generated database
// types describe snake_case rows, so this one boundary casts the PostgREST
// client rather than leaking database shapes into portal components.
const getSupabase = () => createBrowserClient() as any;

export const productConfigurationKeys = {
  all: ['product-configurations'] as const,
  definition: (productId: string) =>
    ['product-configurations', 'definition', productId] as const,
  saved: (productId: string, projectId?: string) =>
    ['product-configurations', 'saved', productId, projectId ?? null] as const,
  savedPrefix: (productId: string) =>
    ['product-configurations', 'saved', productId] as const,
  detail: (configurationId: string) =>
    ['product-configurations', 'detail', configurationId] as const,
  customRevisions: (configurationId: string) =>
    ['product-configurations', 'custom-revisions', configurationId] as const,
};

function throwOnError<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

export function useProductConfigurationDefinition(productId?: string | null) {
  return useQuery<ProductConfigurationDefinition>({
    queryKey: productConfigurationKeys.definition(productId ?? ''),
    enabled: Boolean(productId),
    queryFn: async () =>
      throwOnError<ProductConfigurationDefinition>(
        await getSupabase().rpc('get_product_configuration_schema', {
          p_product_id: productId,
        }),
      ),
  });
}

export function useSavedProductConfigurations(
  productId?: string | null,
  projectId?: string | null,
) {
  return useQuery<SavedProductConfiguration[]>({
    queryKey: productConfigurationKeys.saved(productId ?? '', projectId ?? undefined),
    enabled: Boolean(productId),
    queryFn: async () =>
      throwOnError<SavedProductConfiguration[]>(
        await getSupabase().rpc('list_product_configurations', {
          p_product_id: productId,
          p_project_id: projectId ?? null,
        }),
      ),
  });
}

export function useUpsertProductConfigurationDefinition(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (input: UpsertProductConfigurationDefinitionInput) =>
      throwOnError<ProductConfigurationDefinition>(
        await getSupabase().rpc('upsert_product_configuration_schema', {
          p_product_id: productId,
          p_input: input,
          p_expected_revision: input.expectedRevision ?? null,
        }),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productConfigurationKeys.definition(productId) }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);
    },
  });
}

export function useEvaluateProductConfiguration() {
  return useMutation({
    retry: false,
    mutationFn: async (input: EvaluateProductConfigurationInput) =>
      throwOnError<ProductConfigurationEvaluation>(
        await getSupabase().rpc('evaluate_product_configuration', {
          p_product_id: input.productId,
          p_variant_id: input.variantId ?? null,
          p_option_value_ids: input.optionValueIds,
          p_components: input.components,
        }),
      ),
  });
}

export function useSaveProductConfiguration() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (input: SaveProductConfigurationInput) =>
      throwOnError<ProductConfigurationMutationResult>(
        await getSupabase().rpc('save_product_configuration', { p_input: input }),
      ),
    onSuccess: async (result: ProductConfigurationMutationResult) => {
      const configuration = result.configuration;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: productConfigurationKeys.savedPrefix(configuration.productId),
        }),
        queryClient.invalidateQueries({
          queryKey: productConfigurationKeys.detail(configuration.id),
        }),
        ...(result.customRevision
          ? [
              queryClient.invalidateQueries({
                queryKey: productConfigurationKeys.customRevisions(
                  result.customRevision.configurationId,
                ),
              }),
            ]
          : []),
      ]);
    },
  });
}

export function useApproveProductConfiguration() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (input: ApproveProductConfigurationInput) =>
      throwOnError<SavedProductConfiguration>(
        await getSupabase().rpc('approve_product_configuration', {
          p_configuration_id: input.configurationId,
          p_expected_version: input.expectedVersion ?? null,
        }),
      ),
    onSuccess: async (configuration: SavedProductConfiguration) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productConfigurationKeys.detail(configuration.id) }),
        queryClient.invalidateQueries({
          queryKey: productConfigurationKeys.savedPrefix(configuration.productId),
        }),
      ]);
    },
  });
}

export function usePromoteConfigurationToLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (input: PromoteConfigurationToLibraryInput) =>
      throwOnError<SavedProductConfiguration>(
        await getSupabase().rpc('promote_configuration_to_library', {
          p_configuration_id: input.configurationId,
          p_name: input.name ?? null,
        }),
      ),
    onSuccess: async (configuration: SavedProductConfiguration) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productConfigurationKeys.detail(configuration.id) }),
        queryClient.invalidateQueries({
          queryKey: productConfigurationKeys.savedPrefix(configuration.productId),
        }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);
    },
  });
}

export function useCustomCommissionRevisions(configurationId?: string | null) {
  return useQuery<CustomCommissionRevision[]>({
    queryKey: productConfigurationKeys.customRevisions(configurationId ?? ''),
    enabled: Boolean(configurationId),
    queryFn: async () =>
      throwOnError<CustomCommissionRevision[]>(
        await getSupabase().rpc('list_custom_commission_revisions', {
          p_configuration_id: configurationId,
        }),
      ),
  });
}

export function useCreateCustomCommissionRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (input: CreateCustomCommissionRevisionInput) =>
      throwOnError<CustomCommissionRevision>(
        await getSupabase().rpc('create_custom_commission_revision', {
          p_configuration_id: input.configurationId,
          p_input: {
            brief: input.brief,
            drawings: input.drawings ?? [],
            quote: input.quote ?? {},
            provenance: input.provenance ?? {},
          },
        }),
      ),
    onSuccess: async (revision: CustomCommissionRevision) => {
      await queryClient.invalidateQueries({
        queryKey: productConfigurationKeys.customRevisions(revision.configurationId),
      });
    },
  });
}

export function useTransitionCustomCommissionRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (input: TransitionCustomCommissionRevisionInput) =>
      throwOnError<CustomCommissionRevision>(
        await getSupabase().rpc('transition_custom_commission_revision', {
          p_revision_id: input.revisionId,
          p_target_status: input.targetStatus,
          p_note: input.note ?? null,
          p_input: {
            quote: input.quote,
            approval: input.approval,
          },
        }),
      ),
    onSuccess: async (revision: CustomCommissionRevision) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: productConfigurationKeys.customRevisions(revision.configurationId),
        }),
        queryClient.invalidateQueries({
          queryKey: productConfigurationKeys.savedPrefix(revision.productId),
        }),
        queryClient.invalidateQueries({ queryKey: ['vendor-quote-requests'] }),
      ]);
    },
  });
}

export function usePrepareConfigurationQuoteRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (input: PrepareConfigurationQuoteRequestInput) =>
      throwOnError<PreparedConfigurationQuoteRequest>(
        await getSupabase().rpc('prepare_configuration_quote_request', {
          p_configuration_id: input.configurationId,
          p_vendor_id: input.vendorId,
          p_scope: input.scope ?? null,
          p_timeline: input.timeline ?? null,
          p_message: input.message ?? null,
        }),
      ),
    onSuccess: async (request: PreparedConfigurationQuoteRequest) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['vendor-quote-requests'] }),
        queryClient.invalidateQueries({
          queryKey: productConfigurationKeys.detail(request.configurationId),
        }),
      ]);
    },
  });
}

export function usePlaceProductConfiguration() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (input: PlaceProductConfigurationInput) =>
      throwOnError<Record<string, unknown> & { productId: string }>(
        await getSupabase().rpc('place_product_configuration_in_project', {
          p_project_id: input.projectId,
          p_configuration_id: input.configurationId,
          p_room_id: input.roomId ?? null,
          p_slot_id: input.slotId ?? null,
          p_category: input.category ?? null,
          p_source: input.source ?? {},
        }),
      ),
    onSuccess: async (
      result: Record<string, unknown> & { productId: string },
      input: PlaceProductConfigurationInput,
    ) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project-ffe-items', input.projectId] }),
        queryClient.invalidateQueries({ queryKey: ['spec-books', 'workbench', input.projectId] }),
        queryClient.invalidateQueries({
          queryKey: productConfigurationKeys.detail(input.configurationId),
        }),
        queryClient.invalidateQueries({
          queryKey: productConfigurationKeys.customRevisions(input.configurationId),
        }),
        queryClient.invalidateQueries({
          queryKey: productConfigurationKeys.savedPrefix(result.productId),
        }),
      ]);
    },
  });
}
