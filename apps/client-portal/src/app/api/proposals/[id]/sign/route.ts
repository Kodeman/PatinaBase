import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient, createServiceClient } from '@patina/supabase/server';
import { COMMERCIAL_DOCUMENT_KINDS } from '@patina/types';
import { resolveClientIp } from '@/lib/utils/client-ip';

const COMMERCIAL_DOCUMENT_KIND_SET = new Set<string>(COMMERCIAL_DOCUMENT_KINDS);

type CommercialNotificationState = 'delivered' | 'pending_retry' | 'not_requested';

async function notifyCommercialTransition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  documentId: string,
  transition: 'client_signed' | 'furnishings_executed' | 'trade_scope_executed' | 'deposit_ready'
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    signedByName?: unknown;
  };
  const signedByName = typeof body.signedByName === 'string' ? body.signedByName.trim() : '';
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
    {
      p_proposal_id: id,
    }
  );
  const commercialDocument = commercialBundle?.document;
  const documentKind =
    commercialDocument?.kind ?? commercialDocument?.document_kind ?? commercialDocument?.documentKind;

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
  const { data: bundle, error: fetchError } = await supabase.rpc('get_client_proposal_bundle', { p_proposal_id: id });
  const proposal = bundle?.proposal;

  if (fetchError || !proposal) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (documentKind !== 'legacy') {
    const commercialState =
      commercialDocument.commercialState ?? commercialDocument.commercial_state ?? commercialDocument.state;
    const isRetryableFurnishingsExecution =
      documentKind === 'furnishings_authorization' && commercialState === 'executed';
    const isRetryableTradeScopeExecution =
      documentKind === 'trade_scope' && commercialState === 'executed';
    const isClientSignedServicesRetry =
      documentKind !== 'furnishings_authorization' &&
      documentKind !== 'trade_scope' &&
      commercialState === 'client_signed';
    if (
      commercialState !== 'sent' &&
      !isRetryableFurnishingsExecution &&
      !isRetryableTradeScopeExecution &&
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
        }
      );
      if (executeError) {
        return NextResponse.json({ error: executeError.message || 'sign_failed' }, { status: 500 });
      }
      const newlyExecuted = executeResult?.newly_executed === true || executeResult?.newlyExecuted === true;
      const depositInvoiceId = executeResult?.deposit_invoice_id ?? executeResult?.depositInvoiceId ?? null;
      let executionNotification: CommercialNotificationState = 'not_requested';
      let depositNotification: CommercialNotificationState = 'not_requested';
      const executedState = executeResult?.commercial_state ?? executeResult?.commercialState ?? 'executed';
      if (executedState === 'executed') {
        executionNotification = await notifyCommercialTransition(supabase, id, 'furnishings_executed');
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
          state:
            executionNotification === 'pending_retry' || depositNotification === 'pending_retry'
              ? 'pending_retry'
              : executionNotification,
          transitions: {
            furnishingsExecuted: executionNotification,
            depositReady: depositNotification,
          },
        },
      });
    }

    if (documentKind === 'trade_scope') {
      // Trade scope execution is the same one-act sent→executed shape as
      // furnishings: it writes immutable signature evidence, applies the
      // sections/draws, and auto-issues the deposit draw invoice in one
      // transaction. Only the server-mediated variant may receive the
      // edge-derived client IP.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const commercialService = createServiceClient() as any;
      const { data: executeResult, error: executeError } = await commercialService.rpc(
        'execute_trade_scope_with_trusted_ip',
        {
          p_proposal_id: id,
          p_signed_name: signedByName,
          p_client_id: user.id,
          p_signed_ip: clientIp,
        }
      );
      if (executeError) {
        return NextResponse.json({ error: executeError.message || 'sign_failed' }, { status: 500 });
      }
      const newlyExecuted = executeResult?.newly_executed === true || executeResult?.newlyExecuted === true;
      const depositInvoiceId = executeResult?.deposit_invoice_id ?? executeResult?.depositInvoiceId ?? null;
      let executionNotification: CommercialNotificationState = 'not_requested';
      let depositNotification: CommercialNotificationState = 'not_requested';
      const executedState = executeResult?.commercial_state ?? executeResult?.commercialState ?? 'executed';
      if (executedState === 'executed') {
        executionNotification = await notifyCommercialTransition(supabase, id, 'trade_scope_executed');
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
          state:
            executionNotification === 'pending_retry' || depositNotification === 'pending_retry'
              ? 'pending_retry'
              : executionNotification,
          transitions: {
            tradeScopeExecuted: executionNotification,
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
      }
    );
    if (signError) {
      return NextResponse.json({ error: signError.message || 'sign_failed' }, { status: 500 });
    }

    const newlyClientSigned = signResult?.newly_client_signed === true || signResult?.newlyClientSigned === true;
    const signedState = signResult?.commercial_state ?? signResult?.commercialState ?? 'client_signed';
    let notificationDelivery: CommercialNotificationState = 'not_requested';
    if (signedState === 'client_signed') {
      notificationDelivery = await notifyCommercialTransition(supabase, id, 'client_signed');
    }

    return NextResponse.json({
      ok: true,
      commercialState: signedState,
      newlyClientSigned,
      notificationDelivery: { state: notificationDelivery },
    });
  }

  // Legacy proposals no longer support client signing — the format is
  // retired in favor of the design services agreement flow. Pre-migration,
  // the RPC lookup above still raises for legacy rows and the 404 path
  // above fires first, so this only executes once the migration lands.
  if (documentKind === 'legacy') {
    return NextResponse.json({ error: 'legacy_signing_retired' }, { status: 410 });
  }

  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}
