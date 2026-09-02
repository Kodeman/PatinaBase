import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { getAuthenticatedDesignerAdmin } from '@/lib/supabase-admin';
import { VENDOR_DETAIL_COLUMNS } from '@/lib/vendor-columns';

// RF-04. RL02B-01 closed the same defect one directory over and left this pair
// standing: both handlers below were `createServerClient()` + `getUser()` +
// `.select('*')` on `vendors`, and middleware.ts returns early on `isApiRoute`,
// so `/api/*` is never role-gated by the shell. Confirmed empirically on a local
// stack: a password-grant session for the seeded homeowner reading
// /rest/v1/vendors?select=* returns 200 with the whole row — `vendors` RLS is
// "Authenticated users can read vendors USING (true)", and 00555's column
// revoke targets `anon` only. So a round-one homeowner's `.patina.cloud` cookie
// read the trade file here exactly as it did on /api/catalog/vendors.
//
// POST is worse than the read: "Authenticated users can insert vendors" is a
// permissive INSERT policy for `authenticated`, so a homeowner session could
// create vendor rows.
//
// GET is designer-or-admin (a designer's vendor detail legitimately renders the
// trade file). POST is ADMIN-ONLY: writing the catalogue is staff work, and the
// designer-facing nomination flow has its own route.

// GET /api/admin/catalog/vendors - List vendors (admin)
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedDesignerAdmin(request);
    if ('error' in auth) return auth.error;

    // The data read stays on the SESSION client, not the helper's service-role
    // adminClient: vendors RLS should still apply to it. The helper's client is
    // for the role lookup only.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();

    const { data, error } = await supabase
      .from('vendors')
      .select(VENDOR_DETAIL_COLUMNS)
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ vendors: data ?? [] });
  } catch (error) {
    console.error('[API] GET /admin/catalog/vendors error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/catalog/vendors - Create vendor (admin)
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedDesignerAdmin(request, { domains: ['admin'] });
    if ('error' in auth) return auth.error;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();

    const body = await request.json();

    const { data, error } = await supabase
      .from('vendors')
      .insert({
        name: body.name,
        trade_name: body.tradeName || body.trade_name || null,
        website: body.website || null,
        logo_url: body.logoUrl || body.logo_url || null,
        description: body.description || null,
        contact_email: body.contactEmail || body.contact_email || null,
      })
      .select(VENDOR_DETAIL_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[API] POST /admin/catalog/vendors error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
