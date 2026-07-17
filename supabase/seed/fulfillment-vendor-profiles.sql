-- fulfillment-vendor-profiles.sql — BOH (S0, task C1) dev seed.
--
-- 6 vendor_profiles over EXISTING seeded vendor UUIDs (supabase/seed/vendors.sql),
-- covering all three transmission_types (email/portal/csv) crossed with varied
-- payment_terms (prepay/fifty_fifty/net_30), with realistic protocol fields
-- (lead times, change windows, blind_ship mix, claims/inspection windows, two
-- per-vendor commission_rate overrides diverging from the 0.16 config default).
--
-- vendor_profiles is a writer-guarded BOH table (app.fulfillment_writer GUC,
-- 00350) — set_config('migration', ...) is session-local so it's safe to run
-- inline in a seed script without wrapping the whole file in a transaction.
SELECT set_config('app.fulfillment_writer', 'migration', false);

INSERT INTO public.vendor_profiles
  (vendor_id, transmission_type, po_email, portal_url, csv_column_spec,
   payment_terms, deposit_pct, lead_time_days, change_window_days, blind_ship,
   claims_window_days, inspection_window_days, freight_arrangement, commission_rate)
VALUES
  -- Room & Board — email, net_30, standard commission (default rate, no override)
  ('11111111-1111-1111-1111-111111111101', 'email', 'po@roomandboard.example', NULL, NULL,
   'net_30', NULL, 21, 3, true,
   14, '{"parcel":5,"ltl":3,"white_glove":3}'::jsonb, 'vendor_arranged', 0.16),
  -- Mitchell Gold + Bob Williams — email, fifty_fifty deposit, standard commission
  ('11111111-1111-1111-1111-111111111102', 'email', 'orders@mgbw.example', NULL, NULL,
   'fifty_fifty', 50, 70, 5, true,
   10, '{"parcel":5,"ltl":3,"white_glove":3}'::jsonb, 'vendor_arranged', 0.16),
  -- Lee Industries — portal, net_30, no blind ship, commission OVERRIDE (0.18)
  ('11111111-1111-1111-1111-111111111103', 'portal', NULL, 'https://portal.leeindustries.example', NULL,
   'net_30', NULL, 56, 7, false,
   14, '{"parcel":5,"ltl":3}'::jsonb, 'patina_arranged', 0.18),
  -- Holly Hunt — portal, full prepay, long lead times, commission OVERRIDE (0.20)
  ('11111111-1111-1111-1111-111111111111', 'portal', NULL, 'https://trade.hollyhunt.example', NULL,
   'prepay', 100, 90, 7, true,
   7, '{"white_glove":3}'::jsonb, 'vendor_arranged', 0.20),
  -- Blu Dot — csv, net_30, short lead time, standard commission
  ('11111111-1111-1111-1111-111111111118', 'csv', NULL, NULL,
   '{"columns":["sku","qty","ship_to","side_mark"]}'::jsonb,
   'net_30', NULL, 10, 3, false,
   30, '{"parcel":5}'::jsonb, 'vendor_arranged', 0.15),
  -- Article — csv, full prepay (DTC model), quickest turnaround, standard commission
  ('11111111-1111-1111-1111-111111111120', 'csv', NULL, NULL,
   '{"columns":["item","quantity","address"]}'::jsonb,
   'prepay', 100, 7, 2, false,
   30, '{"parcel":5}'::jsonb, 'vendor_arranged', 0.15)
ON CONFLICT (vendor_id) DO NOTHING;
