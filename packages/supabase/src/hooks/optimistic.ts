/**
 * useOptimisticMutation: the one shape for optimistic ink on internal records
 * (US-34 N2; plan §3.2 N2 with triage R5, R6 and R7).
 *
 * - onMutate cancels each key's in-flight reads, then `apply`s the patch to
 *   each cached key.
 * - A failure re-applies only this write's `invert` to the CURRENT cache. It
 *   never restores a whole snapshot: in a shared list that would erase another
 *   row's write that settled in the meantime (R5).
 * - A write must return its changed row(s) or an exact count. Zero rows is a
 *   failure and takes the rollback path (R6).
 * - The mutation stays pending until its receipt is merged into the cache, or
 *   until the reconciling refetch has landed. Never at the bare write (M1b, R7).
 * - The TanStack `scope.id` is `scopeId`, fixed where the mutation is built.
 *
 * Only `honesty: 'internal'` exists. Sends, money, deletes without Undo and
 * server-decided outcomes stay pending-only (plan §5.2; see NEVER_OPTIMISTIC).
 */
import {
  useMutation,
  useMutationState,
  useQueryClient,
  type MutationKey,
  type QueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';

/**
 * What a write returns to prove what it changed: the changed row
 * (`.select().maybeSingle()`), the changed rows (`.select()`), or an exact
 * count (`{ count: 'exact' }`). `null`, `[]` and `0` all mean zero rows.
 */
export type OptimisticReceipt = object | number | null;

/** Thrown when a write's receipt shows that no row changed (R6). */
export class ZeroRowReceiptError extends Error {
  constructor() {
    super('The write changed no rows.');
    this.name = 'ZeroRowReceiptError';
  }
}

/** Per key this write patched: its cached value just before `apply`. */
export type OptimisticContext<TCache> = Array<{ key: QueryKey; previous: TCache }>;

export interface UseOptimisticMutationOptions<
  TVariables,
  TReceipt extends OptimisticReceipt,
  TCache = unknown,
> extends Omit<
    UseMutationOptions<NonNullable<TReceipt>, Error, TVariables, OptimisticContext<TCache>>,
    'mutationFn' | 'mutationKey' | 'onMutate' | 'scope'
  > {
  /** The write. Returns the changed row(s) or an exact count; zero rows rolls back. */
  mutationFn: (variables: TVariables) => Promise<TReceipt>;
  /** Pure patch of one cached key. Keys that are not cached are skipped. */
  apply: (current: TCache, variables: TVariables, key: QueryKey) => TCache;
  /**
   * Pure inverse of `apply` for this write's own row(s), run on the CURRENT
   * cache. `previous` is only for reading those rows' old fields: never return
   * it whole, and leave a field that a later write has since changed.
   */
  invert: (
    current: TCache,
    variables: TVariables,
    patched: { key: QueryKey; previous: TCache },
  ) => TCache;
  /** Exact cache keys the write patches, fixed where the mutation is built. */
  keys: readonly QueryKey[];
  /**
   * Merges the receipt into one cached key. Without it, the write stays
   * pending until a refetch of `keys` lands.
   */
  merge?: (
    current: TCache,
    receipt: NonNullable<TReceipt>,
    variables: TVariables,
    key: QueryKey,
  ) => TCache;
  /** TanStack mutation scope: one per row, or one per shared list to serialize every write to it. */
  scopeId: string;
  honesty: 'internal';
}

export function optimisticMutationKey(scopeId: string): MutationKey {
  return ['optimistic', scopeId];
}

function changedRows(receipt: unknown): number {
  if (Array.isArray(receipt)) return receipt.length;
  if (typeof receipt === 'number') return receipt;
  return receipt == null ? 0 : 1;
}

/** The useMutation options behind useOptimisticMutation. */
export function optimisticMutationOptions<
  TVariables,
  TReceipt extends OptimisticReceipt,
  TCache = unknown,
>(
  queryClient: QueryClient,
  options: UseOptimisticMutationOptions<TVariables, TReceipt, TCache>,
): UseMutationOptions<NonNullable<TReceipt>, Error, TVariables, OptimisticContext<TCache>> {
  const { mutationFn, apply, invert, keys, merge, scopeId, honesty, onSuccess, onError, ...rest } =
    options;
  if (honesty !== 'internal') {
    throw new Error(
      `useOptimisticMutation only takes honesty: 'internal' (got ${String(honesty)}). Sends, money, deletes without Undo and server-decided outcomes stay pending-only.`,
    );
  }

  return {
    ...rest,
    mutationKey: optimisticMutationKey(scopeId),
    scope: { id: scopeId },
    mutationFn: async (variables) => {
      const receipt = await mutationFn(variables);
      if (!(changedRows(receipt) >= 1)) throw new ZeroRowReceiptError();
      return receipt as NonNullable<TReceipt>;
    },
    onMutate: async (variables) => {
      await Promise.all(
        keys.map((key) => queryClient.cancelQueries({ queryKey: key, exact: true })),
      );
      const patched: OptimisticContext<TCache> = [];
      for (const key of keys) {
        const previous = queryClient.getQueryData<TCache>(key);
        if (previous === undefined) continue;
        queryClient.setQueryData<TCache>(key, apply(previous, variables, key));
        patched.push({ key, previous });
      }
      return patched;
    },
    onError: (error, variables, patched, context) => {
      for (const entry of patched ?? []) {
        const current = queryClient.getQueryData<TCache>(entry.key);
        if (current === undefined) continue;
        queryClient.setQueryData<TCache>(entry.key, invert(current, variables, entry));
      }
      return onError?.(error, variables, patched, context);
    },
    onSuccess: async (receipt, variables, patched, context) => {
      if (merge) {
        for (const key of keys) {
          const current = queryClient.getQueryData<TCache>(key);
          if (current === undefined) continue;
          queryClient.setQueryData<TCache>(key, merge(current, receipt, variables, key));
        }
      } else {
        await Promise.all(
          keys.map((key) => queryClient.invalidateQueries({ queryKey: key, exact: true })),
        );
      }
      return onSuccess?.(receipt, variables, patched, context);
    },
  };
}

/**
 * Optimistic write for an internal record. `pending` holds the variables of
 * every write of this scope still awaiting its receipt, one entry per
 * mutation, so each concurrent create or tick keeps its own pending state.
 */
export function useOptimisticMutation<
  TVariables,
  TReceipt extends OptimisticReceipt,
  TCache = unknown,
>(
  options: UseOptimisticMutationOptions<TVariables, TReceipt, TCache>,
): UseMutationResult<NonNullable<TReceipt>, Error, TVariables, OptimisticContext<TCache>> & {
  pending: TVariables[];
} {
  const queryClient = useQueryClient();
  const mutation = useMutation(optimisticMutationOptions(queryClient, options));
  const pending = useMutationState({
    filters: { mutationKey: optimisticMutationKey(options.scopeId), status: 'pending' },
    select: (m) => m.state.variables as TVariables,
  });
  return { ...mutation, pending };
}

/**
 * Hooks that must never call useOptimisticMutation (plan §5.2 plus the SQ-965
 * send/money inventory). A test greps their bodies. Folio image remove has no
 * hook of its own: it goes through the generic usePieceField, so F15c holds it
 * pending-only at the call site. useDeleteSwatch leaves this list only when
 * N15 gives it an Undo.
 */
export const NEVER_OPTIMISTIC = [
  // External sends
  'useSendOutboundDrafts',
  'useSendInvoice',
  'useChaseInvoice',
  'useCreatePlanIssue',
  'useCreatePlanTransmittal',
  'useReissuePlanTransmittalLink',
  'useSendPartySms',
  'useSendTradeAgreement',
  'useSendProposal',
  'useRetryProposalSend',
  'useSendScopeChangeRequest',
  'useSendProjectNote',
  'useSendDecisionReminder',
  'useSendClientMessage',
  'useSendCampaign',
  'useSendCompanionMessage',
  'useSendPurchaseOrder',
  'useSendBackPurchaseOrder',
  'useSendProcurementDraft',
  'useSendAmendment',
  'useSendServiceAgreement',
  'useReleaseForAuthorization',
  'useSendFurnishingsAuthorization',
  'useSendTradeScope',
  'useSendTradeRfq',
  // Money
  'useIssueInvoice',
  'useRecordPayment',
  'useVoidInvoice',
  'useAddInvoiceBillingLines',
  'useUpsertLineItems',
  'useDeleteLineItem',
  'useSetFfeLineCommercials',
  'useRecordVendorPayment',
  'useLogPaymentPaid',
  'useVoidVendorPayment',
  'useReleasePurchaseOrder',
  'useStopTimer',
  'useCreatePaymentIntent',
  'useConfirmPayment',
  'useIssueTradeDrawInvoice',
  'useGenerateMilestoneInvoice',
  // Deletes without Undo
  'useDiscardOutboundDraft',
  'useRemoveExclusion',
  'useRemoveGate',
  'useDeleteSwatch',
  // Server-decided outcomes
  'useUpdateProjectPhaseStatus',
  'usePlaceInDocument',
  'usePlaceProductInProjectV2',
  'usePromoteToStudio',
  'usePromoteBatchToStudio',
  'useHoldInstallWindow',
  'useAddScheduleMilestone',
  'useUpdateScheduleMilestone',
  'useSetProjectStatus',
] as const;
