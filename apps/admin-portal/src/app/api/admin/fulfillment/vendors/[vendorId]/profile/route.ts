import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// POST /api/admin/fulfillment/vendors/[vendorId]/profile — write the vendor's
// protocol sheet via fulfillment_update_vendor_profile (00353, R1.6). Body is
// the RPC's jsonb patch shape directly (built client-side by
// @patina/fulfillment's buildVendorProfilePatch — see that file's header for
// the RPC's COALESCE-on-conflict caveat: this can create or overwrite fields,
// not clear a previously-set one back to null).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ vendorId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const actor = auth.user.email ?? auth.user.id;
  const { vendorId } = await params;

  let patch: Record<string, unknown>;
  try {
    patch = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (!patch || typeof patch !== 'object') return badRequest('Body must be a JSON object patch');

  try {
    const { error } = await db.rpc('fulfillment_update_vendor_profile', {
      p_vendor_id: vendorId,
      // jsonb param — see config/[key]/route.ts's identical cast comment.
      p_patch: patch as never,
      p_actor: actor,
    });
    if (error) throw error;
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to update vendor profile');
  }
}
