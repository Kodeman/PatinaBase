import { NextRequest, NextResponse } from 'next/server';
import {
  getUser,
  createServerClient,
  createServiceClient,
} from '@patina/supabase/server';
import { resolveClientIp } from '@/lib/utils/client-ip';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    signedByName?: unknown;
  };
  const signedByName =
    typeof body.signedByName === 'string' ? body.signedByName.trim() : '';
  if (signedByName.length < 2) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }

  const clientIp = resolveClientIp(request.headers);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createServerClient()) as any;

  const { data: bundle, error: fetchError } = await supabase.rpc(
    'get_client_proposal_bundle',
    { p_proposal_id: id },
  );
  const proposal = bundle?.proposal;

  if (fetchError || !proposal) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (
    proposal.status !== 'sent' &&
    proposal.status !== 'viewed' &&
    proposal.status !== 'accepted'
  ) {
    return NextResponse.json({ error: 'not_signable' }, { status: 409 });
  }

  // Authoritative expiry enforcement: a proposal past its valid_until cannot
  // be signed even if the status hasn't been flipped to "expired" yet. An
  // already-accepted retry is a project-link repair, not a new acceptance.
  if (proposal.status !== 'accepted' && proposal.valid_until) {
    const expiresAt = new Date(proposal.valid_until).getTime();
    if (!Number.isNaN(expiresAt) && expiresAt < Date.now()) {
      return NextResponse.json({ error: 'proposal_expired' }, { status: 410 });
    }
  }

  // Authoritative sign: the authenticated session proves the caller first;
  // only then does a service-role client pass that exact user id plus the
  // edge-derived IP to the private trusted-evidence RPC. The shared database
  // core re-checks ownership / status / expiry, owns activation and its start
  // date, and can safely repair an accepted proposal whose project is missing.
  // Browser callers never receive authority over signed_ip, activation, or
  // schedule anchoring.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any;
  const { error: signError } = await service.rpc(
    'sign_proposal_with_trusted_ip',
    {
      p_proposal_id: id,
      p_signed_name: signedByName,
      p_client_id: user.id,
      p_signed_ip: clientIp,
    },
  );

  if (signError) {
    return NextResponse.json(
      { error: signError.message || 'sign_failed' },
      { status: 500 }
    );
  }

  // CARRY-FORWARD: the signing RPC does NOT send the confirmation email — fire
  // it here, best-effort (does not block sign success).
  void supabase.functions
    .invoke('proposal-sign-confirmation', { body: { proposalId: id } })
    .catch(() => {
      // Silent — confirmation email failure should not block sign
    });

  return NextResponse.json({ ok: true });
}
