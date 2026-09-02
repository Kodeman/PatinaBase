import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { getAuthenticatedDesignerAdmin } from '@/lib/supabase-admin';
import { VENDOR_PUBLIC_FACE_COLUMNS } from '@/lib/vendor-columns';

// VENDOR_PUBLIC_FACE_COLUMNS is the column list migration 00555 grants `anon`
// on public.vendors. The trade file is served only by the detail route, behind
// the same guard. Both lists moved to @/lib/vendor-columns when RF-04 found the
// same `select('*')` still live on the two /api/admin/catalog/vendors routes:
// four route files reading one table want one column list, not four.

// GET /api/catalog/vendors - List vendors
//
// AUTHENTICATED IS NOT AUTHORIZED. A `getUser()` guard alone admits every
// signed-in account on the platform, and auth cookies are scoped to
// `.patina.cloud` — so a round-one homeowner signed in on the iOS app or the
// client portal carries a session this route would have accepted. The shell
// itself is gated (middleware.ts bounces a non-designer/admin to
// /unauthorized), but `/api/*` is explicitly passed through by that same
// middleware, so the gate has to be here.
//
// `getAuthenticatedDesignerAdmin` is the portal's existing answer to
// "designer or admin?" (src/lib/supabase-admin.ts, already used by
// POST /api/clients/invite): 401 with no session, 403 with a session that
// holds no designer- or admin-domain role, and it resolves the role through
// user_roles JOIN roles — the same query middleware.ts's
// userHasDesignerPortalRole runs. One definition of the role, two callers.
//
// The FLAT 403 is deliberate, and it is the sibling convention rather than a
// degraded public-face response: /api/clients/invite refuses the whole route,
// and no non-designer caller has any legitimate use for this endpoint — the
// only readers are designer-portal pages a homeowner cannot reach anyway. A
// partial 200 would also be the more fragile shape, since it puts a second
// column list in play and invites a later edit to widen it.
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedDesignerAdmin(request);
    if ('error' in auth) return auth.error;

    // The data read stays on the SESSION client, not the helper's service-role
    // adminClient: vendors RLS ("Authenticated users can read vendors") should
    // still apply to it. The helper's client is for the role lookup only.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();

    const { data, error } = await supabase
      .from('vendors')
      .select(VENDOR_PUBLIC_FACE_COLUMNS)
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ vendors: data ?? [] });
  } catch (error) {
    console.error('[API] GET /catalog/vendors error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
