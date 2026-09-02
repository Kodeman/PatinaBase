/**
 * The two column lists every `vendors` route selects by.
 *
 * They live here rather than beside one route because FOUR route files read the
 * table — `/api/catalog/vendors`, `/api/catalog/vendors/[id]`,
 * `/api/admin/catalog/vendors` and `/api/admin/catalog/vendors/[id]` — and the
 * review that produced them (RL02B-01, and RF-04 the day after) found the same
 * `select('*')` in each. One copy per file is one copy per file to widen by
 * accident; one copy shared is the thing the guard is actually protecting.
 *
 * PUBLIC FACE is exactly the column list migration 00555 grants `anon` on
 * public.vendors. DETAIL is that plus the thirteen trade columns 00555 revokes
 * from `anon` — trade_terms, notes, contact_info, preferred_contact,
 * orders_email, trade_account_email, trade_portal_url,
 * trade_account_established_at, default_payment_terms, nomination_status,
 * nominated_by, nominated_at, contact_profile_id. Anything reading DETAIL must
 * be behind a designer-or-admin gate.
 */

const PUBLIC_FACE = [
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
] as const;

/** The thirteen columns 00555 revokes from `anon`. Gate-only. */
export const VENDOR_TRADE_COLUMNS = [
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
] as const;

/** The maker's public face — no trade column. */
export const VENDOR_PUBLIC_FACE_COLUMNS = PUBLIC_FACE.join(', ');

/** Public face + the trade file. Designer/admin routes only. */
export const VENDOR_DETAIL_COLUMNS = [...PUBLIC_FACE, ...VENDOR_TRADE_COLUMNS].join(', ');
