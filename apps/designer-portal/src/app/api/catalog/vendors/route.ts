import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// The maker's public face. Identical to the column list migration 00555 grants
// `anon` on public.vendors — the trade file (trade_terms, notes, contact_info,
// preferred_contact, orders_email, trade_account_email, trade_portal_url,
// trade_account_established_at, default_payment_terms, nomination_status,
// nominated_by, nominated_at, contact_profile_id) is served only by the detail
// route, behind the same guard.
const VENDOR_PUBLIC_FACE_COLUMNS = [
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
].join(', ');

// GET /api/catalog/vendors - List vendors
export async function GET(_request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
