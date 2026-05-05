import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  verifyAdmin,
  unauthorized,
  badRequest,
} from '@/lib/admin-api';
import { retryDlqEntry } from '@/lib/dlq-retry';

const MAX_BULK = 50;

export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const admin = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!admin) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('invalid json');
  }

  const ids = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return badRequest('ids[] required');
  }
  if (ids.length > MAX_BULK) {
    return badRequest(`max ${MAX_BULK} ids per request`);
  }
  if (!ids.every((v) => typeof v === 'string')) {
    return badRequest('ids must be strings');
  }

  const results: Array<{
    id: string;
    ok: boolean;
    error?: string;
    provider_id?: string | null;
    notification_id?: string | null;
  }> = [];

  for (const id of ids as string[]) {
    const outcome = await retryDlqEntry(
      supabase,
      id,
      admin.id,
      admin.email ?? null,
    );
    if (outcome.kind === 'success') {
      results.push({
        id,
        ok: true,
        provider_id: outcome.data.provider_id,
        notification_id: outcome.data.notification_id,
      });
    } else if (outcome.kind === 'not_found') {
      results.push({ id, ok: false, error: 'not_found' });
    } else if (outcome.kind === 'dispatch_failed') {
      results.push({ id, ok: false, error: outcome.message });
    } else {
      results.push({ id, ok: false, error: outcome.message });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  });
}
