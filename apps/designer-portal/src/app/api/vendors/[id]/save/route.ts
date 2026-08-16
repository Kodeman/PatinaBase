import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// POST   /api/vendors/[id]/save   — save (upsert) the vendor for this designer.
// DELETE /api/vendors/[id]/save   — unsave (remove) the vendor.
//
// VEN-02: saved_vendors(designer_id, vendor_id, notes) — shape from migration
// 00009. UNIQUE(designer_id, vendor_id), RLS scopes rows to designer_id =
// auth.uid(). POST body { notes?: string }.
//
// GET /api/vendors/[id]/save — has the current designer saved this vendor?
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet regenerated for saved_vendors
    const supabase: any = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id: vendorId } = await context.params;
    const studioId = request.nextUrl.searchParams.get('studioId');
    if (!studioId) {
      return NextResponse.json({ error: 'studioId is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('saved_vendors')
      .select('id, notes')
      .eq('studio_id', studioId)
      .eq('designer_id', user.id)
      .eq('vendor_id', vendorId)
      .maybeSingle();

    if (error) {
      console.error('[API] vendor saved-state error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      data: { saved: !!data, notes: data?.notes ?? null },
    });
  } catch (error) {
    console.error('[API] GET /vendors/[id]/save error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet regenerated for saved_vendors
    const supabase: any = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id: vendorId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const studioId = typeof body.studioId === 'string' ? body.studioId : '';
    if (!studioId) {
      return NextResponse.json({ error: 'studioId is required' }, { status: 400 });
    }
    const notes: string | null = body.notes ? String(body.notes) : null;

    const { data, error } = await supabase
      .from('saved_vendors')
      .upsert(
        { studio_id: studioId, designer_id: user.id, vendor_id: vendorId, notes },
        { onConflict: 'studio_id,designer_id,vendor_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('[API] vendor save error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: { saved: true, id: data?.id ?? null } });
  } catch (error) {
    console.error('[API] POST /vendors/[id]/save error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet regenerated for saved_vendors
    const supabase: any = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id: vendorId } = await context.params;
    const studioId = request.nextUrl.searchParams.get('studioId');
    if (!studioId) {
      return NextResponse.json({ error: 'studioId is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('saved_vendors')
      .delete()
      .eq('studio_id', studioId)
      .eq('designer_id', user.id)
      .eq('vendor_id', vendorId);

    if (error) {
      console.error('[API] vendor unsave error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: { saved: false } });
  } catch (error) {
    console.error('[API] DELETE /vendors/[id]/save error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
