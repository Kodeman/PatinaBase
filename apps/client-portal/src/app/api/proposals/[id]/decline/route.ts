import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@patina/supabase/server';
import { COMMERCIAL_DOCUMENT_KINDS } from '@patina/types';

const COMMERCIAL_DOCUMENT_KIND_SET = new Set<string>(COMMERCIAL_DOCUMENT_KINDS);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  const reason = typeof body.reason === 'string' && body.reason.trim().length > 0 ? body.reason.trim() : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createServerClient()) as any;

  // Resolve kind from the same database-owned client allowlist the sign
  // route preflights with. Legacy rows keep their existing decline path —
  // ProposalDeclineDialog calling decline_proposal directly — so an absent
  // bundle, an RPC error, or the explicit 'legacy' kind must never reach the
  // decline call below. Only the commercial vocabulary needs this route.
  const { data: commercialBundle, error: commercialLookupError } = await supabase.rpc(
    'get_client_commercial_document_bundle',
    { p_proposal_id: id }
  );
  const commercialDocument = commercialBundle?.document;
  const documentKind =
    commercialDocument?.kind ?? commercialDocument?.document_kind ?? commercialDocument?.documentKind;

  if (
    commercialLookupError ||
    !commercialDocument ||
    typeof documentKind !== 'string' ||
    !COMMERCIAL_DOCUMENT_KIND_SET.has(documentKind) ||
    documentKind === 'legacy'
  ) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // decline_proposal (00387/00390/00412) is granted to `authenticated` only —
  // REVOKEd from service_role — and reads auth.uid() from the caller's own
  // session to authorize the actor, so this must run on the user-session
  // client. A service-role client would fail with insufficient_privilege.
  const { data, error } = await supabase.rpc('decline_proposal', {
    p_proposal_id: id,
    p_reason: reason,
  });

  if (error) {
    const status =
      error.code === '42501' ? 403 :
      error.code === '23514' ? 409 :
      error.code === 'P0002' ? 404 :
      500;
    return NextResponse.json({ error: error.message || 'decline_failed' }, { status });
  }

  return NextResponse.json({
    ok: true,
    id: data?.id ?? id,
    status: data?.status ?? 'declined',
    declinedAt: data?.declined_at ?? null,
  });
}
