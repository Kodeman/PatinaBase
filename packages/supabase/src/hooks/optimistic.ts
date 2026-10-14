/**
 * useOptimisticMutation: the one shape for optimistic ink on internal records
 * (US-34 N2; plan §3.2 N2 with triage R5, R6 and R7).
 *
 * - onMutate cancels each key's in-flight reads, then `apply`s the patch to
 *   each cached key.
 * - A failure re-applies only this write's `invert` to the CURRENT cache. It
 *   never restores a whole snapshot: in a shared list that would erase another
 *   row's write that settled in the meantime (R5).
 * - After every settlement the cache holds the scope's last server-confirmed
 *   value with only its still-pending patches re-applied. `invert` reads old
 *   fields from that confirmed value, never from this write's own snapshot,
 *   which carries the scope's earlier writes that had not landed yet.
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
  hashKey,
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
  /**
   * Pure patch of one cached key. Keys that are not cached are skipped. It
   * must be idempotent: after every settlement, the patches of the scope's
   * writes that are still pending are applied again.
   */
  apply: (current: TCache, variables: TVariables, key: QueryKey) => TCache;
  /**
   * Pure inverse of `apply` for this write's own row(s), run on the CURRENT
   * cache. `previous` is the scope's last confirmed value of the key: the
   * cache before the scope's first pending write, with each receipt merged
   * since. It is only for reading those rows' old fields: never return it
   * whole, and leave a field that a later write has since changed.
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

/**
 * Per QueryClient, per scope, per key hash: the key's last server-confirmed
 * value, with none of the scope's pending patches on it. Held only while a
 * write of the scope is pending.
 */
const confirmedByClient = new WeakMap<QueryClient, Map<string, Map<string, unknown>>>();

function confirmedFor(queryClient: QueryClient, scopeId: string): Map<string, unknown> {
  let scopes = confirmedByClient.get(queryClient);
  if (!scopes) confirmedByClient.set(queryClient, (scopes = new Map()));
  let confirmed = scopes.get(scopeId);
  if (!confirmed) scopes.set(scopeId, (confirmed = new Map()));
  return confirmed;
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

  /** The variables of the scope's other writes still awaiting a receipt, in click order. */
  const othersPending = (variables: TVariables): TVariables[] => {
    const scoped = queryClient
      .getMutationCache()
      .findAll({ mutationKey: optimisticMutationKey(scopeId), status: 'pending' })
      .sort((a, b) => a.state.submittedAt - b.state.submittedAt);
    const self = scoped.findIndex((m) => m.state.variables === variables);
    if (self >= 0) scoped.splice(self, 1);
    return scoped.map((m) => m.state.variables as TVariables);
  };
  const settle = (others: TVariables[]) => {
    if (others.length === 0) confirmedByClient.get(queryClient)?.delete(scopeId);
  };

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
      const confirmed = confirmedFor(queryClient, scopeId);
      const first = othersPending(variables).length === 0;
      const patched: OptimisticContext<TCache> = [];
      for (const key of keys) {
        const previous = queryClient.getQueryData<TCache>(key);
        if (previous === undefined) continue;
        const hash = hashKey(key);
        if (first || !confirmed.has(hash)) confirmed.set(hash, previous);
        queryClient.setQueryData<TCache>(key, apply(previous, variables, key));
        patched.push({ key, previous });
      }
      return patched;
    },
    onError: (error, variables, patched, context) => {
      const confirmed = confirmedFor(queryClient, scopeId);
      const others = othersPending(variables);
      for (const entry of patched ?? []) {
        const current = queryClient.getQueryData<TCache>(entry.key);
        if (current === undefined) continue;
        const hash = hashKey(entry.key);
        const previous = (confirmed.has(hash) ? confirmed.get(hash) : entry.previous) as TCache;
        let next = invert(current, variables, { key: entry.key, previous });
        for (const pending of others) next = apply(next, pending, entry.key);
        queryClient.setQueryData<TCache>(entry.key, next);
      }
      settle(others);
      return onError?.(error, variables, patched, context);
    },
    onSuccess: async (receipt, variables, patched, context) => {
      const confirmed = confirmedFor(queryClient, scopeId);
      if (merge) {
        const others = othersPending(variables);
        for (const key of keys) {
          const hash = hashKey(key);
          if (others.length > 0 && confirmed.has(hash)) {
            confirmed.set(hash, merge(confirmed.get(hash) as TCache, receipt, variables, key));
          }
          const current = queryClient.getQueryData<TCache>(key);
          if (current === undefined) continue;
          let next = merge(current, receipt, variables, key);
          for (const pending of others) next = apply(next, pending, key);
          queryClient.setQueryData<TCache>(key, next);
        }
        settle(others);
      } else {
        await Promise.all(
          keys.map((key) => queryClient.invalidateQueries({ queryKey: key, exact: true })),
        );
        // The refetch can land over the scope's other pending patches.
        const others = othersPending(variables);
        for (const key of keys) {
          const hash = hashKey(key);
          if (others.length > 0 && confirmed.has(hash)) {
            confirmed.set(hash, apply(confirmed.get(hash) as TCache, variables, key));
          }
          const current = queryClient.getQueryData<TCache>(key);
          if (current === undefined || others.length === 0) continue;
          let next: TCache = current;
          for (const pending of others) next = apply(next, pending, key);
          queryClient.setQueryData<TCache>(key, next);
        }
        settle(others);
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
 * pending-only at the call site. N15 gives swatch delete an Undo
 * (useRestoreSwatch) but the delete itself stays pending-only: the row reads
 * "Removing…" until the receipt, and with the flag off it has no Undo at all.
 * So useDeleteSwatch stays listed.
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
