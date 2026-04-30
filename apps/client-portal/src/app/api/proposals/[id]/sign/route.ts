import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@patina/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { signedByName?: unknown };
  const signedByName = typeof body.signedByName === 'string' ? body.signedByName.trim() : '';
  if (signedByName.length < 2) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }

  const clientIp =
    request.headers.get('x-client-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createServerClient()) as any;

  const { data: proposal, error: fetchError } = await supabase
    .from('proposals')
    .select('id, status, client_id, designer_id')
    .eq('id', id)
    .single();

  if (fetchError || !proposal) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (proposal.client_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (proposal.status !== 'sent' && proposal.status !== 'viewed') {
    return NextResponse.json({ error: 'not_signable' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('proposals')
    .update({
      status: 'accepted',
      signed_at: now,
      signed_by_name: signedByName,
      signed_ip: clientIp,
      accepted_at: now,
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from('proposal_engagement').insert({
    proposal_id: id,
    viewer_id: user.id,
    event_type: 'signed',
    metadata: { signed_by_name: signedByName, signed_ip: clientIp },
  });

  // Fire confirmation email (best-effort — does not block sign success)
  void supabase.functions
    .invoke('proposal-sign-confirmation', { body: { proposalId: id } })
    .catch(() => {
      // Silent — confirmation email failure should not block sign
    });

  return NextResponse.json({ ok: true });
}
