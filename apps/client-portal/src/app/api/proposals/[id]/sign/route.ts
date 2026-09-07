import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient, createServiceClient } from '@patina/supabase/server';
import { COMMERCIAL_DOCUMENT_KINDS } from '@patina/types';
import { resolveClientIp } from '@/lib/utils/client-ip';

const COMMERCIAL_DOCUMENT_KIND_SET = new Set<string>(COMMERCIAL_DOCUMENT_KINDS);

/* ── WHICH KINDS SIGN THROUGH THE SERVICES RPC (Wave 3, P9) ──────────────────
   A POSITIVE list, and the reason it exists is a defect this wave found in
   its own route.

   The allowlist above is derived from `COMMERCIAL_DOCUMENT_KINDS`, so the
   moment `design_build` was appended to that array in `@patina/types` this
   route began ADMITTING a turnkey signature — while the routing below was a
   `furnishings → trade_scope → else` chain, so the new kind fell into the
   `else` and would have been signed as a plain design-services agreement:
   no design-build validation, no deposit offer, and an HTTP 200 identical to
   the correct one. A closed set that omits a kind fails closed and is found
   in the first walk; a double-negative default fails OPEN and is not.

   So the fall-through is retired. Every kind that signs through
   `sign_design_services_agreement_with_trusted_ip` is named here, and a kind
   this build does not know refuses rather than borrowing another kind's
   transaction. `design_build` takes the same RPC — a turnkey prime is
   countersigned exactly as a services agreement is — and then makes the
   SEPARATE deposit call below.
   ────────────────────────────────────────────────────────────────────────── */
const SERVICES_SIGNING_KINDS = new Set<string>([
  'design_services',
  'service_addendum',
  'design_build',
]);

type CommercialNotificationState = 'delivered' | 'pending_retry' | 'not_requested';

/**
 * P13 / R15 — what the door may offer once the signature is already recorded.
 * `payPath` is a plain link to the shipped payer surface
 * (`app/pay/[token]/page.tsx`); Wave 3 mints no Checkout session and holds no
 * Stripe key. Null whenever the offer could not be made, for any reason.
 */
interface DepositOffer {
  invoiceId: string;
  amountCents: number;
  label: string;
  payPath: string;
}

function offerRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/* ── THE OFFER IS A SECOND CALL, AND IT MAY FAIL (D-W3-2, R15) ───────────────
   "Offer after signature; never gate" is made STRUCTURAL here rather than
   careful. The signature transaction has already committed by the time this
   runs: `sign_design_services_agreement_with_trusted_ip` returned, the
   `commercial_document_signatures` row exists, and `commercial_state` is
   `client_signed`. Minting the deposit invoice is a separate, independently
   failable RPC — so a billing failure has nothing left to roll back.

   Every failure shape returns `null`, and `null` renders NOTHING on the door
   (deposit-offer.tsx): no error, no retry prompt, no "payment unavailable".
   The signature stands alone and the studio can still send the invoice. The
   detail stays in the server log, where it is useful.
   ────────────────────────────────────────────────────────────────────────── */
async function offerDepositDraw(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any,
  proposalId: string,
): Promise<DepositOffer | null> {
  try {
    const { data, error } = await service.rpc('issue_agreement_draw_invoice', {
      p_proposal_id: proposalId,
      p_draw_key: 'deposit',
    });
    if (error) {
      console.warn('design build deposit offer unavailable', {
        proposalId,
        error: error.message ?? 'unconfirmed',
      });
      return null;
    }
    const row = offerRecord(data);
    const invoiceId = row.invoiceId ?? row.invoice_id;
    const payToken = row.payToken ?? row.pay_token;
    // The invoice bills the NET of the draw — retainage is withheld, not
    // billed — so the figure the offer names is the net one. `amountCents` is
    // read only as the alias a future payload might use for the same number.
    const amount = row.netCents ?? row.net_cents ?? row.amountCents ?? row.amount_cents;
    const label = row.label;
    if (
      typeof invoiceId !== 'string' || invoiceId.length === 0 ||
      typeof payToken !== 'string' || payToken.length === 0 ||
      typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0
    ) {
      return null;
    }
    return {
      invoiceId,
      amountCents: amount,
      label: typeof label === 'string' && label.length > 0 ? label : 'Deposit',
      payPath: `/pay/${encodeURIComponent(payToken)}`,
    };
  } catch (error) {
    console.warn('design build deposit offer unavailable', {
      proposalId,
      error: error instanceof Error ? error.message : 'transport_error',
    });
    return null;
  }
}

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

/**
 * The attachments a composed agreement requires the client to acknowledge,
 * read off the bundle the database just answered with — never off the browser
 * payload. Both key spellings, because the bundle RPC's jsonb is read raw
 * here rather than through the portal's DTO adapter.
 */
function requiredAttachmentKeys(bundle: unknown): string[] {
  const parts = (bundle as { parts?: unknown } | null)?.parts;
  if (!Array.isArray(parts)) return [];
  return parts.flatMap((item) => {
    const part = (item ?? {}) as Record<string, unknown>;
    if (part.kind !== 'attachment') return [];
    const payload = (part.payload ?? {}) as Record<string, unknown>;
    if (payload.acknowledgeRequired !== true && payload.acknowledge_required !== true) return [];
    const key = part.partKey ?? part.part_key;
    return typeof key === 'string' && key.length > 0 ? [key] : [];
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    signedByName?: unknown;
    attachmentsAcknowledged?: unknown;
  };
  const signedByName = typeof body.signedByName === 'string' ? body.signedByName.trim() : '';
  if (signedByName.length < 2) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }
  const claimedAcknowledgments = Array.isArray(body.attachmentsAcknowledged)
    ? body.attachmentsAcknowledged.filter(
        (key): key is string => typeof key === 'string' && key.length > 0,
      )
    : [];

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
    // Read off the same positive list the routing below uses, so the retry
    // window and the transaction it retries can never disagree about which
    // kinds are services kinds. It used to be the double negative
    // `!== furnishings && !== trade_scope`, which admitted `design_build` by
    // accident rather than by decision — the admission is correct (a turnkey
    // prime IS retried the same way) and is now made on purpose.
    const isClientSignedServicesRetry =
      SERVICES_SIGNING_KINDS.has(documentKind) && commercialState === 'client_signed';
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
        // The token, never the database's own sentence (`W1-02`). The door
        // renders an unmapped refusal verbatim, so a raw Postgres message
        // reached the client as the reason her signature did not take — a
        // bare UUID and the words "access denied" on a legally consequential
        // act. The detail stays here, in the server log, where it is useful.
        console.error('furnishings execution failed', { proposalId: id, error: executeError.message });
        return NextResponse.json({ error: 'sign_failed' }, { status: 500 });
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
        // The token, never the database's own sentence (`W1-02`).
        console.error('trade scope execution failed', { proposalId: id, error: executeError.message });
        return NextResponse.json({ error: 'sign_failed' }, { status: 500 });
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

    // Every remaining signable kind is named, never inferred. See
    // SERVICES_SIGNING_KINDS above: the `else` this replaced would have signed
    // a design-build prime as a design-services agreement and answered 200.
    if (!SERVICES_SIGNING_KINDS.has(documentKind)) {
      return NextResponse.json({ error: 'not_signable' }, { status: 409 });
    }

    // WAVE 2, P6 — WHAT SHE CONSENTED TO IS THE DATABASE'S ANSWER, NOT THE
    // BROWSER'S. The sentence recorded against the signature is
    // `compose_agreement_consent`'s, read off the bundle above; a client that
    // could choose its own consent sentence could sign one agreement and file
    // the record of another.
    //
    // The acknowledgments are the browser's, but only as a claim: every key is
    // checked against the attachments the bundle carries, unknown keys are
    // dropped without comment, and an agreement whose required attachment is
    // unticked is simply not signable yet. That refusal reuses `not_signable`
    // — the door already speaks it, and REFUSAL_TOKENS is pinned by the drift
    // guard against this file, so a new token would be a second edit in two
    // places for a state the client already reads correctly.
    const required = requiredAttachmentKeys(commercialBundle);
    const acknowledged = required.filter((key) => claimedAcknowledgments.includes(key));
    if (acknowledged.length !== required.length) {
      return NextResponse.json({ error: 'not_signable' }, { status: 409 });
    }

    // A services agreement/addendum records the client's act only. The RPC
    // never activates or creates a project; that remains the studio's separate
    // countersignature transaction.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commercialService = createServiceClient() as any;

    // DEPLOY ORDER IS NOT A PROMISE. `p_consent` is the fifth argument the
    // Wave 2 migration adds; PostgREST resolves an RPC by the argument NAMES
    // it is sent, so a portal that sends `p_consent` to a database that has
    // not been migrated yet cannot find the function at all and answers
    // `sign_failed` for EVERY services signature — composed or not.
    //
    // So the wider call is made only when there is something to record: a
    // bundle the database itself calls composed, an agreement carrying
    // acknowledgments, or a sentence `compose_agreement_consent` composed. An
    // un-composed agreement — which is every agreement today, and every
    // agreement with either flag off — keeps taking the four-argument call it
    // has always taken, and signs whichever way round the two deploys land.
    const composedBundle =
      commercialBundle?.composed === true ||
      commercialDocument?.composed === true ||
      (Array.isArray(commercialBundle?.parts) && commercialBundle.parts.length > 0);
    const consentSentence =
      commercialBundle?.consentSentence ?? commercialBundle?.consent_sentence ?? null;
    const signArgs: Record<string, unknown> = {
      p_proposal_id: id,
      p_signed_name: signedByName,
      p_client_id: user.id,
      p_signed_ip: clientIp,
    };
    if (composedBundle || required.length > 0 || consentSentence !== null) {
      signArgs.p_consent = {
        consentSentence,
        attachmentsAcknowledged: acknowledged,
      };
    }

    const { data: signResult, error: signError } = await commercialService.rpc(
      'sign_design_services_agreement_with_trusted_ip',
      signArgs
    );
    if (signError) {
      // The token, never the database's own sentence (`W1-02`).
      console.error('design services signing failed', { proposalId: id, error: signError.message });
      return NextResponse.json({ error: 'sign_failed' }, { status: 500 });
    }

    const newlyClientSigned = signResult?.newly_client_signed === true || signResult?.newlyClientSigned === true;
    const signedState = signResult?.commercial_state ?? signResult?.commercialState ?? 'client_signed';
    let notificationDelivery: CommercialNotificationState = 'not_requested';
    if (signedState === 'client_signed') {
      notificationDelivery = await notifyCommercialTransition(supabase, id, 'client_signed');
    }

    // P13 — SIGN, THEN OFFER. The signature is already recorded above; this
    // is the separate, failable call, and its failure is `depositOffer: null`
    // rather than a refused signature. No `deposit_ready` notice is sent: the
    // design-build deposit reaches the client on the door, in the same act,
    // and an email would be a second, contradictory notice
    // (commercial-document-notify/policy.ts leaves the kind out of that
    // branch on purpose).
    const depositOffer =
      documentKind === 'design_build' && signedState === 'client_signed'
        ? await offerDepositDraw(commercialService, id)
        : null;

    return NextResponse.json({
      ok: true,
      commercialState: signedState,
      newlyClientSigned,
      notificationDelivery: { state: notificationDelivery },
      depositOffer,
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
