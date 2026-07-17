import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fulfillmentShipmentsService, type CreateShipmentInput } from '@/services/fulfillment';
import { fulfillmentKeys } from './use-fulfillment-queue';

// The Shipment Board's data layer (S5, spec §5.4). Extends the shared
// fulfillmentKeys factory with a `shipments()` key — never forks it — so
// use-fulfillment-realtime.ts's invalidation of fulfillmentKeys.all on every
// fulfillment_events INSERT (shipment.created, shipment.pod_recorded, …)
// live-refreshes the board too. Mirrors use-fulfillment-vendors.ts /
// use-fulfillment-config.ts's `{domain}Keys` pattern.

export const shipmentKeys = {
  all: () => [...fulfillmentKeys.all, 'shipments'] as const,
};

export function useFulfillmentShipments() {
  return useQuery({
    queryKey: shipmentKeys.all(),
    queryFn: () => fulfillmentShipmentsService.listBoard(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

/** "Tracking (manual entry v1)" — creates the shipment for an acknowledged PO. */
export function useCreateShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateShipmentInput) => fulfillmentShipmentsService.createShipment(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
  });
}

/** Confirm the LTL/white_glove delivery appointment. May 501 today (schema
 *  gap I10) — callers surface `mutation.error` to the operator as-is. */
export function useConfirmAppointment(shipmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (confirmedAt?: string) =>
      fulfillmentShipmentsService.confirmAppointment(shipmentId, confirmedAt),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
  });
}

/** Upload proof of delivery — opens the inspection countdown. */
export function useUploadShipmentPod(shipmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => fulfillmentShipmentsService.uploadPod(shipmentId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
  });
}

/** Mark a shipment delivered without a POD (typically parcel). */
export function useDeliverShipment(shipmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fulfillmentShipmentsService.deliver(shipmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
  });
}

/** Record an operator-observed ETA change (R4.5) — the only caller of
 *  fulfillment_update_shipment_eta (00363), which shipped API-only (I11)
 *  until this landed: without it, current_eta could never move in
 *  production and the board's slip rendering was dead weight. */
export function useRecordEtaChange(shipmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { currentEta: string; reason: string }) =>
      fulfillmentShipmentsService.recordEtaChange(shipmentId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
  });
}
