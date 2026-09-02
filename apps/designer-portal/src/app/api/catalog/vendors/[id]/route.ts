import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { getAuthenticatedDesignerAdmin } from '@/lib/supabase-admin';
import { VENDOR_DETAIL_COLUMNS } from '@/lib/vendor-columns';

// VENDOR_DETAIL_COLUMNS is the maker's public face plus the trade file. A
// DESIGNER's vendor detail legitimately renders both; the 13 trade columns in
// it are exactly the ones migration 00555 revokes from `anon`, and they are
// served here only behind the designer/admin gate below. The list moved to
// @/lib/vendor-columns when RF-04 found the same `select('*')` still live on
// /api/admin/catalog/vendors/[id].

// GET /api/catalog/vendors/:id
//
// This is the route that actually serves the trade file, so the role gate
// matters more here than on the list. A `getUser()` guard alone admits every
// signed-in account on the platform, and auth cookies are scoped to
// `.patina.cloud` — a round-one homeowner signed in on the iOS app or the
// client portal carries a session that would have read `trade_terms`,
// `orders_email` and the rest. `/api/*` is passed straight through by
// middleware.ts, so the gate belongs here and nowhere else.
//
// Same helper, same flat 403 as the list route: `getAuthenticatedDesignerAdmin`
// (src/lib/supabase-admin.ts, already used by POST /api/clients/invite) is the
// portal's one definition of "designer or admin". A partial response that drops
// the 13 trade columns for a non-designer was the alternative and is not taken:
// the sibling convention is to refuse the route, this endpoint has no
// non-designer reader, and the narrower shape would leave a second column list
// for a later edit to widen.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[API] GET /catalog/vendors/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
