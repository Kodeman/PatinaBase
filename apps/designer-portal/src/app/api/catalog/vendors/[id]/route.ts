import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// The maker's public face plus the trade file. A signed-in designer's vendor
// detail legitimately renders both; the 13 trade columns at the foot of this
// list are exactly the ones migration 00555 revokes from `anon`, and they are
// served here only behind the getUser() guard below.
const VENDOR_DETAIL_COLUMNS = [
  'id',
  'name',
  'website',
  'logo_url',
  'hero_image_url',
  'market_position',
  'production_model',
  'founded_year',
  'ownership',
  'headquarters_city',
  'headquarters_state',
  'parent_company_id',
  'primary_category',
  'secondary_categories',
  'designer_rating_avg',
  'review_count',
  'lead_times',
  'social_links',
  'brand_story',
  'made_in',
  'is_patina_catalog',
  'founding_circle',
  'created_at',
  'updated_at',
  'trade_terms',
  'notes',
  'contact_info',
  'preferred_contact',
  'orders_email',
  'trade_account_email',
  'trade_portal_url',
  'trade_account_established_at',
  'default_payment_terms',
  'nomination_status',
  'nominated_by',
  'nominated_at',
  'contact_profile_id',
].join(', ');

// GET /api/catalog/vendors/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
