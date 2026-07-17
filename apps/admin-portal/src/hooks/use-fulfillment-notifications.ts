import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FulfillmentClientNotificationDTO } from '@patina/fulfillment';
import { fulfillmentNotifyService, type DraftNoteInput, type SendNoteResult } from '@/services/fulfillment';
import { fulfillmentKeys } from './use-fulfillment-queue';

// The note-drawer's data layer (S4, spec §6). Nests under the S1
// fulfillmentKeys.all root (imported, not modified — use-fulfillment-queue.ts
// stays S1/S3's file) so use-fulfillment-realtime.ts's per-event invalidation
// refreshes notification history too, the same way it already covers the
// Workbench detail key.

export const notificationKeys = {
  forOrder: (orderId: string) => [...fulfillmentKeys.all, 'notifications', orderId] as const,
};

export function useOrderNotifications(orderId: string | null) {
  return useQuery({
    queryKey: notificationKeys.forOrder(orderId ?? ''),
    queryFn: () => fulfillmentNotifyService.listNotifications(orderId as string),
    enabled: !!orderId,
    staleTime: 5_000,
  });
}

/** Finds the most recent UNSENT email draft for a transition, if the drawer
 *  was already opened for this order/transition and hasn't been sent yet —
 *  so re-opening the drawer (or re-pressing `n`) doesn't mint a duplicate. */
export function findPendingDraft(
  notifications: FulfillmentClientNotificationDTO[] | undefined,
  transition: string,
): FulfillmentClientNotificationDTO | null {
  if (!notifications) return null;
  return (
    notifications.find((n) => n.channel === 'email' && n.transition === transition && !n.sentAt) ?? null
  );
}

export function useDraftClientNote(orderId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DraftNoteInput) => fulfillmentNotifyService.draftNote(input),
    onSuccess: () => {
      if (orderId) qc.invalidateQueries({ queryKey: notificationKeys.forOrder(orderId) });
    },
  });
}

export function useSendClientNote(orderId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { notificationId: string; editedBody?: string }) =>
      fulfillmentNotifyService.sendNote(vars.notificationId, vars.editedBody) as Promise<SendNoteResult>,
    onSuccess: () => {
      if (orderId) qc.invalidateQueries({ queryKey: notificationKeys.forOrder(orderId) });
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
  });
}
