import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ExceptionListRow,
  ExceptionCaseFileDTO,
  ConsequencePreview,
} from '@patina/fulfillment';
import { fulfillmentExceptionsService, type ResolveInput } from '@/services/fulfillment';
import { fulfillmentKeys } from './use-fulfillment-queue';

// The Exception Desk's data layer (S7, spec §5.5). Extends the fulfillmentKeys
// factory (never forks it) so use-fulfillment-realtime.ts refreshes the desk on
// every fulfillment_events INSERT — an exception opened from the queue's `x`,
// evidence added via a client link, or a Leah ruling all re-figure live.

export function useFulfillmentExceptions() {
  return useQuery({
    queryKey: fulfillmentKeys.exceptions(),
    queryFn: () => fulfillmentExceptionsService.list(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useExceptionCaseFile(exceptionId: string) {
  return useQuery({
    queryKey: fulfillmentKeys.exception(exceptionId),
    queryFn: () => fulfillmentExceptionsService.getCaseFile(exceptionId),
    staleTime: 10_000,
    enabled: !!exceptionId,
  });
}

/** Open a new exception (the queue's `x` key + workbench/shipment affordances). */
export function useOpenException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      type: string;
      orderId?: string;
      orderItemId?: string;
      poId?: string;
      shipmentId?: string;
    }) => fulfillmentExceptionsService.open(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
  });
}

/** Preview a resolution path's ledger consequence WITHOUT committing (preview
 *  == posted). Returns the would-be lines for the mono block. */
export function usePreviewResolution(exceptionId: string) {
  return useMutation<ConsequencePreview & Record<string, unknown>, Error, Omit<ResolveInput, 'preview'>>({
    mutationFn: (input) =>
      fulfillmentExceptionsService.resolve(exceptionId, { ...input, preview: true }),
  });
}

/** Commit a resolution — the SAME derivation the preview showed, now posted. */
export function useResolveException(exceptionId: string) {
  const qc = useQueryClient();
  return useMutation<ConsequencePreview & Record<string, unknown>, Error, Omit<ResolveInput, 'preview'>>({
    mutationFn: (input) =>
      fulfillmentExceptionsService.resolve(exceptionId, { ...input, preview: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
  });
}

/** Mint a tokenized client evidence-upload link (~72h). */
export function useMintEvidenceLink(exceptionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fulfillmentExceptionsService.mintEvidenceLink(exceptionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.exception(exceptionId) });
    },
  });
}

export type { ExceptionListRow, ExceptionCaseFileDTO };
