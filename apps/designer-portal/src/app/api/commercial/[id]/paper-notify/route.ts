import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@patina/supabase/server';

// POST /api/commercial/[id]/paper-notify
//
// Fires the client-facing "recorded on paper" notification after a designer
// records an executed-on-paper act via one of the paper RPCs (countersign's
// paper leg, execute_furnishings_authorization_on_paper, execute_trade_
// scope_on_paper, record_paper_trade_acceptance — see 00425's EXECUTED-ON-
// PAPER CONTRACT). The caller's own studio session cannot invoke
// commercial-document-notify directly for most of these transitions:
// furnishings_executed and trade_scope_executed live only in that function's
// CLIENT_TRANSITIONS set (policy.ts), so a studio-authenticated call would
// 403 (actor_not_allowed) even though the studio IS the legitimate actor for
// a paper act. createServiceClient() sidesteps that correctly — the fn's
// actorRole 'service' passes every transition — but only AFTER this route
// re-establishes, from the caller's own session, that the caller is a studio
// comember of the document's OWNING DESIGNER.
//
// That check is EXPLICIT (is_studio_comember, RPC'd as the caller) rather
// than inferred from a proposal row coming back non-null. `proposals` RLS
// returns the row to BOTH a studio comember of the designer AND the
// document's own client (the client needs to read their own proposal
// elsewhere) — a bare existence check cannot tell the two apart, and the
// client would otherwise sail straight through to the service invoke below,
// which bypasses commercial-document-notify's actor policy entirely. A miss
// — wrong caller (including the document's own client), wrong id, or a
// genuinely absent document — is indistinguishable on purpose: 404 either
// way, never 403.
//
// channel and hasScan are never taken from the request body. Both are
// derived here, via service reads, from the same evidence the fn itself
// re-derives (commercial-document-notify/index.ts carries the matching
// guard so a caller that skips this route entirely — e.g. a replay — still
// renders correctly): the client's own commercial_document_signatures row
// for the executed-family and money transitions, and trade_scope_terms.
// accepted_on_paper / acceptance_scan_document_id for trade_scope_accepted,
// which has no signature row of its own (acceptance is not a signature,
// 00425). A transition whose evidence does not actually show a paper act
// 400s rather than telling a client something happened on paper that never
// did.
//
// Body: { transition, channel?: 'paper', eventId?: string }. 'channel' is
// accepted for shape-symmetry with the fn's contract but is otherwise
// ignored — the route always computes its own from evidence.
//
// client_signed is never reachable here: it has no paper analog on the
// studio side (recording the paper client signature triggers countersign,
// which itself fires 'executed'). trade_scope_accepted IS reachable — the
// ruling that used to suppress it for paper was overturned: a paper
// acceptance now sends the client a paper-variant notice of its own
// (core.ts), so the studio recording one needs this route exactly like the
// three execution acts do.
const EXECUTED_FAMILY = new Set(['executed', 'furnishings_executed', 'trade_scope_executed']);
const MONEY_TRANSITIONS = new Set(['deposit_ready', 'trade_draw_ready']);
const ACCEPTANCE_TRANSITIONS = new Set(['trade_scope_accepted']);
const ALLOWED_TRANSITIONS = new Set<string>([
  ...EXECUTED_FAMILY,
  ...MONEY_TRANSITIONS,
  ...ACCEPTANCE_TRANSITIONS,
]);
// Every allowed transition except the acceptance leg traces its paper-ness
// back to the client's own commercial_document_signatures row. core.ts only
// reads hasScan/scanNote for the executed-family and the acceptance leg —
// never for the money transitions — so hasScan is only worth including in
// the outgoing payload for those.
const SIGNATURE_EVIDENCED_TRANSITIONS = new Set([...EXECUTED_FAMILY, ...MONEY_TRANSITIONS]);
const HAS_SCAN_TRANSITIONS = new Set([...EXECUTED_FAMILY, ...ACCEPTANCE_TRANSITIONS]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = (await createServerClient()) as any;
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const transition = typeof body?.transition === 'string' ? body.transition : '';
  const channel = body?.channel;
  const eventId = typeof body?.eventId === 'string' ? body.eventId : undefined;

  if (!ALLOWED_TRANSITIONS.has(transition)) {
    return NextResponse.json({ error: 'invalid_transition' }, { status: 400 });
  }
  if (channel !== undefined && channel !== 'paper') {
    return NextResponse.json({ error: 'invalid_channel' }, { status: 400 });
  }

  // Authorize with the CALLER's own session: resolve the row first (RLS lets
  // both the document's client and a studio comember of its designer read
  // it), then require studio co-membership explicitly. A miss — wrong
  // caller, wrong id, or a genuinely absent document — is indistinguishable
  // on purpose: 404 either way, never 403.
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, designer_id')
    .eq('id', id)
    .maybeSingle();
  if (!proposal) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const { data: isComember } = await supabase.rpc('is_studio_comember', {
    p_owner: proposal.designer_id,
  });
  if (!isComember) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // From here on, evidence reads run through the service client — the
  // signature/terms metadata this route judges paper-ness from is what
  // decides whether the client is told this happened on paper at all, so it
  // is read the same authoritative way the fn itself will re-derive it.
  const service = createServiceClient() as any;
  let evidencedOnPaper = false;
  let hasScan = false;
  if (ACCEPTANCE_TRANSITIONS.has(transition)) {
    const { data: terms } = await service
      .from('trade_scope_terms')
      .select('accepted_on_paper, acceptance_scan_document_id')
      .eq('proposal_id', id)
      .maybeSingle();
    evidencedOnPaper = (terms as any)?.accepted_on_paper === true;
    hasScan = evidencedOnPaper && Boolean((terms as any)?.acceptance_scan_document_id);
  } else if (SIGNATURE_EVIDENCED_TRANSITIONS.has(transition)) {
    const { data: clientSignature } = await service
      .from('commercial_document_signatures')
      .select('metadata')
      .eq('proposal_id', id)
      .eq('party_role', 'client')
      .maybeSingle();
    const metadata = (clientSignature as any)?.metadata ?? null;
    evidencedOnPaper = metadata?.executedOnPaper === true;
    hasScan = evidencedOnPaper && Boolean(metadata?.paperScanDocumentId);
  }

  if (!evidencedOnPaper) {
    return NextResponse.json({ error: 'not_recorded_on_paper' }, { status: 400 });
  }

  const { data, error } = await service.functions.invoke('commercial-document-notify', {
    body: {
      documentId: id,
      transition,
      channel: 'paper',
      ...(eventId ? { eventId } : {}),
      ...(HAS_SCAN_TRANSITIONS.has(transition) ? { hasScan } : {}),
    },
  });

  if (error || data?.ok !== true) {
    return NextResponse.json({ error: data?.error ?? error?.message ?? 'notify_failed' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, results: data.results });
}
