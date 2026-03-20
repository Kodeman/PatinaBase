import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// GET /api/admin/catalog/vendors - List vendors (admin)
export async function GET(_request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('vendors')
      .select('*')
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

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
      .select()
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
