import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// POST /api/admin/fulfillment/notifications/[id]/send — send a drafted client
// note (S4, spec §6). Body: { editedBody? }. Unedited (or edited_body absent /
// whitespace-identical to the draft) sends the fast path with no edit_diff;
// any real text change stamps `edit_diff: {original, sent}` (00353's dual-
// phase RPC via fulfillment-notify's `send` action). Always dispatches the
// push leg alongside email — see fulfillment-notify/core.ts's header for why
// this never throws on a per-channel send failure.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const actor = auth.user.email ?? auth.user.id;
  const { id } = await params;

  let body: { editedBody?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (body.editedBody != null && typeof body.editedBody !== 'string') {
    return badRequest('editedBody must be a string');
  }

  try {
    const { data, error } = await db.functions.invoke('fulfillment-notify', {
      body: {
        action: 'send',
        notification_id: id,
        edited_body: body.editedBody,
        actor,
      },
    });
    if (error) throw error;
    if (data && (data as { success?: boolean }).success === false) {
      throw new Error((data as { error?: string }).error ?? 'fulfillment-notify send failed');
    }

    return NextResponse.json({ data });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to send client note');
  }
}
