import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  verifyAdmin,
  unauthorized,
  notFound,
  serverError,
} from '@/lib/admin-api';
import { retryDlqEntry } from '@/lib/dlq-retry';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = getServiceClient();
  const admin = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!admin) return unauthorized();

  const { id } = await params;
  if (!id) return notFound('id required');

  const result = await retryDlqEntry(supabase, id, admin.id, admin.email ?? null);
  if (result.kind === 'not_found') return notFound('failed entry not found');
  if (result.kind === 'error') return serverError(result.message);
  if (result.kind === 'dispatch_failed') {
    return NextResponse.json(
      { ok: false, id, error: result.message },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, id, ...result.data });
}
