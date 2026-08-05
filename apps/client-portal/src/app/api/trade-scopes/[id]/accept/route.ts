import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient, createServiceClient } from '@patina/supabase/server';
import { resolveClientIp } from '@/lib/utils/client-ip';

type CommercialNotificationState = 'delivered' | 'pending_retry' | 'not_requested';

/**
 * accept_trade_scope_with_trusted_ip (via _accept_trade_scope_authorized,
 * 00423) raises with an explicit ERRCODE for its two known refusal classes —
 * 'insufficient_privilege' (42501) when the caller is not this scope's
 * client, and 'check_violation' (23514) when the scope has not reached
 * substantially_complete (a race against the bundle preflight above, since
 * that check and this RPC call are not atomic). Everything else is a genuine
 * unknown. The client renders `error` directly as an alert (see
 * useAcceptTradeScope / client-selections.tsx), so this must never forward a
 * raw Postgres message.
 */
function mapAcceptFailure(error: { code?: string; message?: string } | null): {
  status: number;
  error: string;
} {
  if (error?.code === '42501') {
    return { status: 403, error: "This trade scope can't be accepted from your account." };
  }
  if (error?.code === '23514') {
    return {
      status: 409,
      error: "This work isn't marked complete yet — check back once your designer updates it.",
    };
  }
  return { status: 500, error: "We couldn't accept this work right now. Please try again in a moment." };
}

async function notifyTradeScopeAccepted(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  documentId: string
): Promise<CommercialNotificationState> {
  try {
    const { data, error } = await supabase.functions.invoke('commercial-document-notify', {
      body: { documentId, transition: 'trade_scope_accepted' },
    });
    if (error || data?.ok !== true) {
      console.warn('commercial notification pending retry', {
        documentId,
        transition: 'trade_scope_accepted',
        error: error?.message ?? data?.error ?? 'unconfirmed',
      });
      return 'pending_retry';
    }
    return 'delivered';
  } catch (error) {
    console.warn('commercial notification pending retry', {
      documentId,
      transition: 'trade_scope_accepted',
      error: error instanceof Error ? error.message : 'transport_error',
    });
    return 'pending_retry';
  }
}

/**
 * Client-only "accept the finished work" act on a trade scope — the one
 * client-initiated write the trade rail has beyond signing. Mirrors the sign
 * route's kind-preflight discipline: resolve kind AND progress from the same
 * database-owned get_client_commercial_document_bundle allowlist first, fail
 * closed to 404/409 before ever constructing a service-role client. Only a
 * trusted, server-mediated client_ip may reach accept_trade_scope_with_trusted_ip.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const clientIp = resolveClientIp(request.headers);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createServerClient()) as any;

  // Resolve kind AND progress from the client-safe bundle. The browser
  // cannot be trusted to assert either — a client posting this route against
  // a non-trade document, or a trade scope that has not yet reached
  // substantially_complete, must never reach the privileged RPC below.
  const { data: commercialBundle, error: commercialLookupError } = await supabase.rpc(
    'get_client_commercial_document_bundle',
    { p_proposal_id: id }
  );
  const commercialDocument = commercialBundle?.document;
  const documentKind =
    commercialDocument?.kind ?? commercialDocument?.document_kind ?? commercialDocument?.documentKind;

  if (commercialLookupError || !commercialDocument || documentKind !== 'trade_scope') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const tradeScope = commercialBundle?.tradeScope ?? commercialBundle?.trade_scope;
  const progressState: unknown = tradeScope?.progress?.state ?? tradeScope?.progress?.status;

  // 'accepted' is allowed through as an idempotent retry — the RPC itself
  // owns whether a repeat call is a safe no-op or an error; this route only
  // ever blocks an attempt that has not yet reached substantially_complete.
  if (progressState !== 'substantially_complete' && progressState !== 'accepted') {
    return NextResponse.json({ error: 'not_acceptable' }, { status: 409 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commercialService = createServiceClient() as any;
  const { data: acceptResult, error: acceptError } = await commercialService.rpc(
    'accept_trade_scope_with_trusted_ip',
    {
      p_proposal_id: id,
      p_signed_name: signedByName,
      p_client_id: user.id,
      p_signed_ip: clientIp,
    }
  );
  if (acceptError) {
    const { status, error } = mapAcceptFailure(acceptError);
    return NextResponse.json({ error }, { status });
  }

  const resultProgressState =
    acceptResult?.progress_state ?? acceptResult?.progressState ?? 'accepted';
  const notificationDelivery = await notifyTradeScopeAccepted(supabase, id);

  return NextResponse.json({
    ok: true,
    progressState: resultProgressState,
    acceptedAt: acceptResult?.accepted_at ?? acceptResult?.acceptedAt ?? null,
    notificationDelivery: { state: notificationDelivery },
  });
}
