import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  verifyAdmin,
  unauthorized,
  badRequest,
  serverError,
} from '@/lib/admin-api';
import { eraseUserData } from '@/lib/gdpr';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const supabase = getServiceClient();
  const admin = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!admin) return unauthorized();

  const { userId } = await context.params;
  if (!userId) {
    return badRequest('userId required');
  }

  let body: { confirmation?: string; reason?: string } = {};
  try {
    body = (await req.json()) as { confirmation?: string; reason?: string };
  } catch {
    return badRequest('invalid_json');
  }

  if (body.confirmation !== 'DELETE_MY_DATA') {
    return NextResponse.json(
      { error: 'confirmation_required', expected: 'DELETE_MY_DATA' },
      { status: 400 },
    );
  }

  try {
    const result = await eraseUserData(supabase, userId, {
      requestedByUserId: admin.id,
      reason: body.reason ?? null,
    });
    return NextResponse.json({ ok: true, erased_at: result.erased_at });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to erase data');
  }
}
