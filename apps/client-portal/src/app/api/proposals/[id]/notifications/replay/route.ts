import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@patina/supabase/server';

type ClientNotificationTransition =
  | 'client_signed'
  | 'furnishings_executed'
  | 'deposit_ready';

type DeliveryState = 'delivered' | 'pending_retry';

const SERVICES_KINDS = new Set(['design_services', 'service_addendum']);

function value(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
}

function record(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function replayableTransitions(bundle: unknown): ClientNotificationTransition[] {
  const root = record(bundle);
  const document = record(root.document);
  const kind = value(document, 'kind', 'documentKind', 'document_kind');
  const state = value(document, 'state', 'commercialState', 'commercial_state');

  if (
    typeof kind === 'string' &&
    SERVICES_KINDS.has(kind) &&
    (state === 'client_signed' || state === 'executed')
  ) {
    return ['client_signed'];
  }

  if (kind !== 'furnishings_authorization' || state !== 'executed') return [];

  const transitions: ClientNotificationTransition[] = [
    'furnishings_executed',
  ];
  const furnishings = record(root.furnishings);
  const depositInvoiceId = value(
    furnishings,
    'depositInvoiceId',
    'deposit_invoice_id',
  );
  const required = Number(
    value(furnishings, 'depositRequiredCents', 'deposit_required_cents'),
  );
  const paid = Number(
    value(furnishings, 'depositPaidCents', 'deposit_paid_cents'),
  );
  const hasOutstandingDeposit =
    typeof depositInvoiceId === 'string' &&
    depositInvoiceId.length > 0 &&
    (!Number.isFinite(required) || !Number.isFinite(paid) || paid < required);
  if (hasOutstandingDeposit) transitions.push('deposit_ready');
  return transitions;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = (await createServerClient()) as any;
  const { data: bundle, error } = await supabase.rpc(
    'get_client_commercial_document_bundle',
    { p_proposal_id: id },
  );
  if (error || !bundle) {
    return NextResponse.json({ error: 'document_not_found' }, { status: 404 });
  }

  const transitions = replayableTransitions(bundle);
  if (transitions.length === 0) {
    return NextResponse.json(
      { error: 'notification_replay_not_available' },
      { status: 409 },
    );
  }

  const deliveryByTransition: Record<string, DeliveryState> = {};
  for (const transition of transitions) {
    try {
      const delivery = await supabase.functions.invoke(
        'commercial-document-notify',
        { body: { documentId: id, transition } },
      );
      deliveryByTransition[transition] =
        !delivery.error && delivery.data?.ok === true
          ? 'delivered'
          : 'pending_retry';
    } catch {
      deliveryByTransition[transition] = 'pending_retry';
    }
  }

  const deliveryState = Object.values(deliveryByTransition).includes(
    'pending_retry',
  )
    ? 'pending_retry'
    : 'delivered';

  return NextResponse.json({
    ok: true,
    notificationDelivery: {
      state: deliveryState,
      transitions: deliveryByTransition,
    },
  });
}
