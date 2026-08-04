import { NextResponse } from 'next/server';
import { createServerClient, getUser } from '@patina/supabase/server';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; checkpointId: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { checkpointId } = await params;
  // The authenticated-session RPC owns project membership, current-version,
  // and idempotency checks. The browser cannot provide an override reason or
  // turn this planning acknowledgement into purchasing authority.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createServerClient()) as any;
  const { data, error } = await supabase.rpc('acknowledge_budget_checkpoint', {
    p_checkpoint_id: checkpointId,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message || 'acknowledgement_failed' },
      { status: 409 },
    );
  }

  return NextResponse.json({
    checkpointId: data?.checkpoint_id ?? data?.checkpointId ?? checkpointId,
    status: data?.status ?? data?.state ?? 'acknowledged',
    acknowledgedAt: data?.acknowledged_at ?? data?.acknowledgedAt ?? null,
    newlyAcknowledged: data?.newly_acknowledged ?? data?.newlyAcknowledged ?? false,
  });
}
