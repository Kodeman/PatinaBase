'use client';

/**
 * What happened to an email after the studio pressed send (00591).
 *
 * The read is a plain batched SELECT over `notification_log` rather than an
 * RPC: 00591's SELECT policies are REF-scoped — a row is visible to whoever
 * can already see the invoice / proposal / invitation / review it points at —
 * so the designer's own JWT answers this one, unlike the addressee-scoped
 * invitation read in use-client-invitation-status.ts.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Database, Tables } from '../database.types';

const getSupabase = () => createBrowserClient();

export type EmailDeliveryRefType =
  | 'invoice'
  | 'proposal'
  | 'client_invitation'
  | 'client_review';

export type EmailDeliveryState =
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'delayed'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'suppressed';

export type EmailDeliveryStatus = Database['public']['Enums']['notification_status'];

/** The columns this read selects — a narrow slice of the notification_log row. */
export type EmailDeliveryRow = Pick<
  Tables<'notification_log'>,
  | 'id'
  | 'ref_id'
  | 'recipient'
  | 'status'
  | 'sent_at'
  | 'delivered_at'
  | 'bounced_at'
  | 'bounce_type'
  | 'bounce_reason'
  | 'delayed_at'
  | 'last_event'
  | 'last_event_at'
  | 'created_at'
>;

export interface EmailDelivery {
  logId: string;
  refId: string;
  recipient: string | null;
  state: EmailDeliveryState;
  /** The raw enum, kept so a caller can tell `clicked` from `opened`. */
  status: EmailDeliveryStatus;
  sentAt: string | null;
  deliveredAt: string | null;
  bouncedAt: string | null;
  bounceType: string | null;
  bounceReason: string | null;
  delayedAt: string | null;
  lastEvent: string | null;
  lastEventAt: string | null;
  createdAt: string;
}

export const EMAIL_DELIVERY_SELECT =
  'id, ref_id, recipient, status, sent_at, delivered_at, bounced_at, bounce_type, bounce_reason, delayed_at, last_event, last_event_at, created_at';

/**
 * The provider's status column, read as one word a studio would use.
 *
 * `sent` + a delayed_at and no delivered_at is the provider still retrying:
 * the send left Patina, nothing has landed, and the retry is the only thing
 * that separates it from a plain `sent`.
 */
export function deriveEmailDeliveryState(
  row: Pick<EmailDeliveryRow, 'status' | 'delayed_at' | 'delivered_at'>,
): EmailDeliveryState {
  switch (row.status) {
    case 'bounced':
      return 'bounced';
    case 'complained':
      return 'complained';
    case 'failed':
      return 'failed';
    case 'suppressed':
      return 'suppressed';
    case 'opened':
    case 'clicked':
      return 'opened';
    case 'delivered':
      return 'delivered';
    case 'sent':
      return row.delayed_at && !row.delivered_at ? 'delayed' : 'sent';
    case 'queued':
    case 'sending':
    case 'unconfirmed':
    default:
      return 'sending';
  }
}

export const emailDeliveryKeys = {
  all: ['email-delivery'] as const,
  list: (refType: EmailDeliveryRefType, ids: string[]) =>
    ['email-delivery', refType, [...ids].sort().join(',')] as const,
};

function toEmailDelivery(row: EmailDeliveryRow): EmailDelivery {
  return {
    logId: row.id,
    refId: row.ref_id as string,
    recipient: row.recipient,
    state: deriveEmailDeliveryState(row),
    status: row.status,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    bouncedAt: row.bounced_at,
    bounceType: row.bounce_type,
    bounceReason: row.bounce_reason,
    delayedAt: row.delayed_at,
    lastEvent: row.last_event,
    lastEventAt: row.last_event_at,
    createdAt: row.created_at,
  };
}

/** States that can still move on their own, so the read is worth repeating. */
const IN_MOTION: ReadonlySet<EmailDeliveryState> = new Set<EmailDeliveryState>([
  'sending',
  'sent',
  'delayed',
]);

const POLL_MS = 30_000;
const POLL_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Poll only while something is still in motion AND recent. A send that has sat
 * at `sent` for three days is not going to move because we asked again.
 */
export function shouldPollEmailDelivery(
  byRef: Record<string, EmailDelivery> | undefined,
  now: number = Date.now(),
): boolean {
  if (!byRef) return false;
  return Object.values(byRef).some((d) => {
    if (!IN_MOTION.has(d.state)) return false;
    const created = Date.parse(d.createdAt);
    return Number.isFinite(created) && now - created < POLL_WINDOW_MS;
  });
}

/**
 * The latest email per referenced record. `byRef` is keyed by `ref_id`, so a
 * row-level surface can read one id out of a page-level batch.
 */
export function useEmailDelivery(refType: EmailDeliveryRefType, refIds: string[]) {
  const ids = refIds ?? [];
  const query = useQuery({
    queryKey: emailDeliveryKeys.list(refType, ids),
    enabled: ids.length > 0,
    staleTime: 15_000,
    refetchIntervalInBackground: false,
    refetchInterval: (q): number | false =>
      shouldPollEmailDelivery(
        (q as { state?: { data?: Record<string, EmailDelivery> } })?.state?.data,
      )
        ? POLL_MS
        : false,
    queryFn: async (): Promise<Record<string, EmailDelivery>> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('notification_log')
        .select(EMAIL_DELIVERY_SELECT)
        .eq('channel', 'email')
        .eq('ref_type', refType)
        .in('ref_id', ids)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const byRef: Record<string, EmailDelivery> = {};
      // Rows arrive newest-first, so the first sighting of a ref_id is its
      // latest email; later ones are its history and are dropped.
      for (const row of (data ?? []) as unknown as EmailDeliveryRow[]) {
        if (!row.ref_id || byRef[row.ref_id]) continue;
        byRef[row.ref_id] = toEmailDelivery(row);
      }
      return byRef;
    },
  });

  return { ...query, byRef: (query.data ?? {}) as Record<string, EmailDelivery> };
}
