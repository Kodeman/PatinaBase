import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@patina/supabase/client';
import { eraseUserData, bearerToken } from '@/lib/gdpr';

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { confirmation?: string; reason?: string } = {};
  try {
    body = (await req.json()) as { confirmation?: string; reason?: string };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (body.confirmation !== 'DELETE_MY_DATA') {
    return NextResponse.json(
      { error: 'confirmation_required', expected: 'DELETE_MY_DATA' },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();
  const { data: userData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await eraseUserData(adminClient, userData.user.id, {
      requestedByUserId: userData.user.id,
      reason: body.reason ?? null,
    });
    return NextResponse.json({ ok: true, erased_at: result.erased_at });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to erase data' },
      { status: 500 },
    );
  }
}
