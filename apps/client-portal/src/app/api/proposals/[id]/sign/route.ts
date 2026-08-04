import { NextRequest, NextResponse } from 'next/server';
import {
  getUser,
  createServerClient,
  createServiceClient,
} from '@patina/supabase/server';
import { COMMERCIAL_DOCUMENT_KINDS } from '@patina/types';
import { resolveClientIp } from '@/lib/utils/client-ip';
import { captureMoodBoardProposalActivated } from '@/lib/analytics/mood-board-server';

const COMMERCIAL_DOCUMENT_KIND_SET = new Set<string>(COMMERCIAL_DOCUMENT_KINDS);

type CommercialNotificationState = 'delivered' | 'pending_retry' | 'not_requested';

async function notifyCommercialTransition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  documentId: string,
  transition: 'client_signed' | 'furnishings_executed' | 'deposit_ready',
): Promise<CommercialNotificationState> {
  try {
    const { data, error } = await supabase.functions.invoke('commercial-document-notify', {
      body: { documentId, transition },
    });
    if (error || data?.ok !== true) {
      console.warn('commercial notification pending retry', {
        documentId,
        transition,
        error: error?.message ?? data?.error ?? 'unconfirmed',
      });
      return 'pending_retry';
    }
    return 'delivered';
  } catch (error) {
    console.warn('commercial notification pending retry', {
      documentId,
      transition,
      error: error instanceof Error ? error.message : 'transport_error',
    });
    return 'pending_retry';
  }
}

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

  // Resolve kind from a database-owned client allowlist. Never trust a browser
  // payload to select the legacy path, because that path also owns project
  // activation semantics that are forbidden for a client-only services act.
  const { data: commercialBundle, error: commercialLookupError } = await supabase.rpc(
    'get_client_commercial_document_bundle',
    { p_proposal_id: id },
  );
  const commercialDocument = commercialBundle?.document;
  const documentKind = commercialDocument?.kind ?? commercialDocument?.document_kind ??
    commercialDocument?.documentKind;

  // Kind selection controls which transaction may run, so absence, an RPC
  // error, or an unknown future value must never fall back to legacy project
  // activation. Legacy rows are returned explicitly as kind `legacy`.
  if (
    commercialLookupError ||
    !commercialDocument ||
    typeof documentKind !== 'string' ||
    !COMMERCIAL_DOCUMENT_KIND_SET.has(documentKind)
  ) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Keep the existing client-safe proposal preflight for expiry and hardened
  // legacy compatibility. Commercial kind still comes only from the dedicated
  // database allowlist above.
  const { data: bundle, error: fetchError } = await supabase.rpc(
    'get_client_proposal_bundle',
    { p_proposal_id: id },
  );
  const proposal = bundle?.proposal;

  if (fetchError || !proposal) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (documentKind !== 'legacy') {
    const commercialState = commercialDocument.commercialState ??
      commercialDocument.commercial_state ?? commercialDocument.state;
    const isRetryableFurnishingsExecution =
      documentKind === 'furnishings_authorization' && commercialState === 'executed';
    const isClientSignedServicesRetry =
      documentKind !== 'furnishings_authorization' && commercialState === 'client_signed';
    if (
      commercialState !== 'sent' &&
      !isRetryableFurnishingsExecution &&
      !isClientSignedServicesRetry
    ) {
      return NextResponse.json({ error: 'not_signable' }, { status: 409 });
    }

    // An executed FF&E retry repairs a lost response and does not create a new
    // signature. Every first execution remains time-boxed like legacy and
    // design-services signing.
    if (commercialState !== 'executed' && proposal.valid_until) {
      const expiresAt = new Date(proposal.valid_until).getTime();
      if (!Number.isNaN(expiresAt) && expiresAt < Date.now()) {
        return NextResponse.json({ error: 'proposal_expired' }, { status: 410 });
      }
    }

    if (documentKind === 'furnishings_authorization') {
      // FF&E execution writes immutable signature evidence, applies the named
      // lines, and creates the deposit handoff in one transaction. Only the
      // server-mediated variant may receive the edge-derived client IP.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const commercialService = createServiceClient() as any;
      const { data: executeResult, error: executeError } = await commercialService.rpc(
        'execute_furnishings_authorization_with_trusted_ip',
        {
          p_proposal_id: id,
          p_signed_name: signedByName,
          p_client_id: user.id,
          p_signed_ip: clientIp,
        },
      );
      if (executeError) {
        return NextResponse.json({ error: executeError.message || 'sign_failed' }, { status: 500 });
      }
      const newlyExecuted =
        executeResult?.newly_executed === true || executeResult?.newlyExecuted === true;
      const depositInvoiceId =
        executeResult?.deposit_invoice_id ?? executeResult?.depositInvoiceId ?? null;
      let executionNotification: CommercialNotificationState = 'not_requested';
      let depositNotification: CommercialNotificationState = 'not_requested';
      if (newlyExecuted) {
        executionNotification = await notifyCommercialTransition(
          supabase,
          id,
          'furnishings_executed',
        );
        if (depositInvoiceId) {
          depositNotification = await notifyCommercialTransition(supabase, id, 'deposit_ready');
        }
      }
      return NextResponse.json({
        ok: true,
        commercialState: 'executed',
        projectId: executeResult?.project_id ?? executeResult?.projectId ?? null,
        depositInvoiceId,
        newlyExecuted,
        notificationDelivery: {
          state: executionNotification === 'pending_retry' || depositNotification === 'pending_retry'
            ? 'pending_retry'
            : executionNotification,
          transitions: {
            furnishingsExecuted: executionNotification,
            depositReady: depositNotification,
          },
        },
      });
    }

    // A services agreement/addendum records the client's act only. The RPC
    // never activates or creates a project; that remains the studio's separate
    // countersignature transaction.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commercialService = createServiceClient() as any;
    const { data: signResult, error: signError } = await commercialService.rpc(
      'sign_design_services_agreement_with_trusted_ip',
      {
        p_proposal_id: id,
        p_signed_name: signedByName,
        p_client_id: user.id,
        p_signed_ip: clientIp,
      },
    );
    if (signError) {
      return NextResponse.json({ error: signError.message || 'sign_failed' }, { status: 500 });
    }

    const newlyClientSigned =
      signResult?.newly_client_signed === true || signResult?.newlyClientSigned === true;
    let notificationDelivery: CommercialNotificationState = 'not_requested';
    if (newlyClientSigned) {
      notificationDelivery = await notifyCommercialTransition(supabase, id, 'client_signed');
    }

    return NextResponse.json({
      ok: true,
      commercialState: signResult?.commercial_state ?? signResult?.commercialState ?? 'client_signed',
      newlyClientSigned,
      notificationDelivery: { state: notificationDelivery },
    });
  }

  // Legacy compatibility stays on the hardened proposal bundle/signature path.
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
  const { data: signResult, error: signError } = await service.rpc(
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

  // Only the transaction that created the durable signature may emit the
  // confirmation side effect. Accepted retries (including a sent→accepted
  // race that waited on the proposal lock) return `newly_signed=false`, so a
  // lost response or double submit cannot send duplicate client/designer mail.
  if (signResult?.newly_signed === true) {
    void supabase.functions
      .invoke('proposal-sign-confirmation', { body: { proposalId: id } })
      .catch(() => {
        // Silent — confirmation email failure should not block sign
      });
  }

  // Emit on fresh signatures and accepted repair/retry responses. The server
  // helper supplies a deterministic $insert_id, so a lost HTTP response can be
  // retried without either losing the denominator or double-counting it.
  const projectId = typeof signResult?.project_id === 'string'
    ? signResult.project_id
    : null;
  if (projectId) {
    try {
      const { count: boardCount, error: boardCountError } = await service
        .from('proposal_boards')
        .select('id', { count: 'exact', head: true })
        .eq('proposal_id', id)
        .eq('status', 'active');
      if (!boardCountError && typeof boardCount === 'number') {
        await captureMoodBoardProposalActivated({
          proposalId: id,
          projectId,
          boardCount,
        });
      }
    } catch {
      // Analytics is best effort; canonical signature/activation already
      // committed and must never be reported to the client as a failure.
    }
  }

  return NextResponse.json({ ok: true });
}
