-- ═══════════════════════════════════════════════════════════════════════════
-- 00207 — R28 Track 2.1: the vendor pane's linkage columns (additive, D7)
--
-- 1. vendors.trade_account_email / trade_portal_url — AUDIT FINDING: the
--    shipped Orders-ledger vendor directory (orders-ledger.tsx) already
--    renders both fields, but no migration ever defined them — they read
--    undefined on every row ("No terms on file"). Defined here so the
--    directory and the new vendor pane tell the truth.
--
-- 2. vendors.contact_profile_id — the comms handshake: vendor COMPANIES
--    (vendors table, procurement) and vendor PROFILES (profiles.role =
--    'vendor', comms participants) had no linkage. The vendor pane's thread
--    resolves through this column: vendor_brief threads whose vendor-side
--    participant is the company's contact profile. Nullable — a vendor
--    without a comms profile simply has no thread yet.
-- ═══════════════════════════════════════════════════════════════════════════

alter table vendors
  add column if not exists trade_account_email text,
  add column if not exists trade_portal_url   text,
  add column if not exists contact_profile_id uuid references profiles(id) on delete set null;

comment on column vendors.trade_account_email is
  'The studio''s trade-account address at this vendor (shown in the Orders book directory; po-send hint).';
comment on column vendors.trade_portal_url is
  'Vendor trade-portal URL (Orders book directory link).';
comment on column vendors.contact_profile_id is
  'R28: the vendor company''s comms profile (profiles.role=vendor). The vendor pane''s thread = vendor_brief threads with this profile as the vendor participant. NULL = no comms handshake yet.';

create index if not exists idx_vendors_contact_profile
  on vendors(contact_profile_id)
  where contact_profile_id is not null;
