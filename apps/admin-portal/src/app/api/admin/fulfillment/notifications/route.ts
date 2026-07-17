import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import type { FulfillmentClientNotificationDTO } from '@patina/fulfillment';

// GET /api/admin/fulfillment/notifications?orderId=… — the note drawer's
// history read (S4, spec §6): every channel's row for an order, newest
// first, so the drawer can find an existing unsent draft for the current
// transition rather than minting a duplicate, and show past sends. S3's ack
// flow will also read this once it points its ack-drafted notes here.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;

  const orderId = request.nextUrl.searchParams.get('orderId');
  if (!orderId) return badRequest('orderId query param is required');

  try {
    const { data, error } = await db
      .from('fulfillment_client_notifications')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const rows: FulfillmentClientNotificationDTO[] = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      orderId: r.order_id as string,
      transition: r.transition as string,
      channel: r.channel as 'email' | 'push',
      templateKey: r.template_key as string,
      draftedBody: (r.drafted_body as string | null) ?? null,
      sentBody: (r.sent_body as string | null) ?? null,
      editDiff: (r.edit_diff as { original: string; sent: string } | null) ?? null,
      sentAt: (r.sent_at as string | null) ?? null,
      resendMessageId: (r.resend_message_id as string | null) ?? null,
      skippedReason: (r.skipped_reason as string | null) ?? null,
      createdAt: r.created_at as string,
    }));

    return NextResponse.json({ data: rows });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load client notifications');
  }
}
