import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// POST /api/admin/fulfillment/vendors/create — the Vendor Directory's "Add
// vendor" affordance (I15, BOH-DECISIONS.md). Until this route, the
// Directory was list/edit-only: VendorDirectoryTable (S4, spec §7) links
// straight to the profile editor, but nothing ever created a vendors row —
// Kody hit this minutes into the first prod order walk against an empty
// public.vendors table (local dev never surfaced it; the dev seed corpus
// pre-populates vendors). Calls fulfillment_create_vendor (00371), the only
// writer of public.vendors from BOH code. Returns the new vendor id so the
// caller can route straight to /fulfillment/vendors/[vendorId] — creation
// intentionally does NOT also write a vendor_profiles row; the profile
// editor's own upsert (fulfillment_update_vendor_profile, 00353) does that
// when the operator saves it.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const actor = auth.user.email ?? auth.user.id;

  let body: { name?: string; website?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const name = (body.name ?? '').trim();
  if (!name) return badRequest('name is required');

  try {
    const { data, error } = await db.rpc('fulfillment_create_vendor', {
      p_name: name,
      p_website: body.website?.trim() || undefined,
      p_notes: body.notes?.trim() || undefined,
      p_actor: actor,
    });
    if (error) {
      // fulfillment_create_vendor raises a plain 'already exists' message for
      // a case-insensitive duplicate name — surface it as a 400, not a 500
      // (same downgrade idiom as leah-reviews/[id]/rule/route.ts).
      if (/already exists/i.test(error.message ?? '')) return badRequest(error.message);
      throw error;
    }
    return NextResponse.json({ data: { vendorId: data as string } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to create vendor');
  }
}
