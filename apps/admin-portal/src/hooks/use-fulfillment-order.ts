import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FulfillmentOrderDetailDTO } from '@patina/fulfillment';
import { fulfillmentService } from '@/services/fulfillment';
import { fulfillmentKeys } from './use-fulfillment-queue';

// The Order Workbench's data layer (S2, spec §5.2). Extends the S1
// fulfillmentKeys factory with `detail(orderId)` — never forks it — so the
// realtime channel (use-fulfillment-realtime.ts, which invalidates
// fulfillmentKeys.all on every fulfillment_events INSERT) refreshes the
// Workbench too, and a confirm/assign/move fired elsewhere re-figures this
// screen without a manual reload.
//
// The three mutations optimistically patch the cached detail (so the money
// strip re-figures in the same render) and snapshot-roll-back on error, then
// invalidate the root on settle to reconcile with the server's derived truth.

export function useFulfillmentOrder(orderId: string) {
  return useQuery({
    queryKey: fulfillmentKeys.detail(orderId),
    queryFn: () => fulfillmentService.getOrder(orderId),
    staleTime: 10_000,
    enabled: !!orderId,
  });
}

type Detail = FulfillmentOrderDetailDTO;

/** Assign (or reassign) a line's vendor + unit cost. Backs BOTH the unmapped-
 *  assign popover and the pre-confirm drag between proposed vendor groups. */
export function useAssignLine(orderId: string) {
  const qc = useQueryClient();
  const key = fulfillmentKeys.detail(orderId);

  return useMutation({
    mutationFn: (vars: { lineId: string; vendorId: string; unitCostCents: number }) =>
      fulfillmentService.assignLine(vars.lineId, {
        vendorId: vars.vendorId,
        unitCostCents: vars.unitCostCents,
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Detail>(key);
      if (prev) {
        const vendorName =
          prev.vendors.find((v) => v.vendorId === vars.vendorId)?.vendorName ?? null;
        qc.setQueryData<Detail>(key, {
          ...prev,
          lines: prev.lines.map((l) =>
            l.id === vars.lineId
              ? {
                  ...l,
                  vendorId: vars.vendorId,
                  vendorName,
                  unitCostCents: vars.unitCostCents,
                  mappingState: 'mapped',
                }
              : l,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
  });
}

/** Move a line's PO line into a different real PO (post-confirm reshuffle) —
 *  the drag when the split is already confirmed. Optimistically repoints the
 *  line and its PO membership so the cards + strip re-figure instantly. */
export function useMoveLine(orderId: string) {
  const qc = useQueryClient();
  const key = fulfillmentKeys.detail(orderId);

  return useMutation({
    mutationFn: (vars: { lineId: string; poId: string }) =>
      fulfillmentService.moveLine(orderId, { itemId: vars.lineId, poId: vars.poId }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Detail>(key);
      if (prev) {
        qc.setQueryData<Detail>(key, {
          ...prev,
          lines: prev.lines.map((l) =>
            l.id === vars.lineId ? { ...l, poId: vars.poId } : l,
          ),
          pos: prev.pos.map((p) => ({
            ...p,
            lineIds:
              p.id === vars.poId
                ? Array.from(new Set([...p.lineIds, vars.lineId]))
                : p.lineIds.filter((id) => id !== vars.lineId),
          })),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
  });
}

/** Confirm the split into real POs. The server RAISES (surfaced as a thrown
 *  Error) if any line is still unmapped; on success the root invalidation
 *  re-fetches the detail in its post-confirm shape. */
export function useConfirmSplit(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fulfillmentService.confirmSplit(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
  });
}
