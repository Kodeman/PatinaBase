import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  verifyAdmin,
  unauthorized,
  notFound,
  serverError,
} from '@/lib/admin-api';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { userId } = await params;
  if (!userId) return notFound('userId required');

  const { data: existing } = await supabase
    .from('profiles')
    .select('id, email_suppressed')
    .eq('id', userId)
    .maybeSingle();
  if (!existing) return notFound('user not found');

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      email_suppressed: false,
      email_suppressed_at: null,
      email_bounce_count: 0,
      email_complaint: false,
    } as never)
    .eq('id', userId);
  if (updateError) return serverError(updateError.message);

  // Best-effort audit log via notification_log (no dedicated audit table here).
  await supabase.from('notification_log').insert({
    user_id: userId,
    type: 'security_alert',
    channel: 'email',
    status: 'delivered',
    template_id: 'admin-unsuppress',
    metadata: {
      action: 'unsuppressed',
      actor: user.id,
      actor_email: user.email,
      at: new Date().toISOString(),
    },
  } as never);

  return NextResponse.json({ ok: true });
}
