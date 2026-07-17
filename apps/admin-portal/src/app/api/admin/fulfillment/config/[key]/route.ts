import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// POST /api/admin/fulfillment/config/[key] — write a fulfillment_config row
// via fulfillment_update_config (00353, spec §10; events config.updated).
// Body: { value }. `value` is the FULL jsonb value for the key (the RPC does
// a plain overwrite, not a per-field patch — the config editor's
// setFieldValue in @patina/fulfillment builds the complete updated object
// client-side before calling this).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const actor = auth.user.email ?? auth.user.id;
  const { key } = await params;

  let body: { value?: unknown };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (!body.value || typeof body.value !== 'object') return badRequest('value must be a JSON object');

  try {
    const { error } = await db.rpc('fulfillment_update_config', {
      p_key: key,
      // jsonb param — the generated Database type's Json union rejects a
      // plain `object`-typed value even though this is exactly what the RPC
      // (00353) expects; same cast idiom as supabase-admin.ts's audit-log
      // jsonb params.
      p_value: body.value as never,
      p_actor: actor,
    });
    if (error) throw error;
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to update config');
  }
}
