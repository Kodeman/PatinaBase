-- ═══════════════════════════════════════════════════════════════════════════
-- people_crm_dev.sql — the Okonkwo fixture, as data
--
-- artifacts/people-room-crm-2026-09-11/briefing/fixture.md §2 and §4, seeded
-- for designer@patina.dev's studio (Local Dev Studio,
-- b0000000-0000-0000-0000-000000000001, seed/organizations.sql). Two jobs: the
-- live Okonkwo residence and the closed 2025 Lindqvist kitchen that the
-- bring-forward picker travels back to.
--
-- WHAT THE COUNTS ARE, AND WHY
--   28 PERSON cards = fixture §2's 27 tabulated rows (F-01 … F-27) plus Ben
--   Ostrom, the Lindqvist GC owner from §4, who has to be a card for the
--   bring-forward to have anything to pick. F-28 is NOT a 28th person — the
--   fixture says so in its own row: it is Erin Sato's SECOND SEAT, on the
--   Lindqvist warranty file, which is the whole point of one identity with
--   many seats. (§1's own arithmetic reaches 28 from Okonkwo alone by counting
--   "4 vendors (5 people)" while tabulating four vendor people; the fifth is
--   never named, so this seed carries Ben Ostrom as the 28th instead of
--   inventing one.)
--
--   21 FIRM cards = the 18 Okonkwo firms that have people (Marrow & Sons …
--   City of Minneapolis CPED Inspections), plus Rivera Finishes and Granite
--   North — both named as Okonkwo roster rows in direction §3.4's Bidding and
--   Done bands — plus Ostrom Builders from §4. Hartwell Studio is NOT a firm
--   card: a studio does not keep itself in its own rolodex. The Okonkwo
--   household and "Adaeze's sister" are not firms either (E3 and a private
--   individual). So: people_directory returns 28 + 21 = 49 rows of
--   role='contact' for this studio, told apart by meta.entity_kind (PR-g's
--   mixed list). Rivera Finishes is the deliberate omission from §4's "not
--   shared" pair only in the sense that it IS seeded and its sibling
--   countertop fabricator Granite North is too; nothing from §4 is dropped.
--
-- CONSENT LIVES ON THE RECORD, NOT ON THE SEAT (R-AY). Every seat here is
-- born at the column default `not_asked` and studio_channel_consent carries
-- the truth: Pete Rusk opted out by text on the Lindqvist thread (F-12), Joe
-- Wozniak is invited and has not answered (F-18), and five numbers are
-- granted — Ngozi, Erin, Luis, Dana, Amara — which is exactly R-F's "5
-- reachable by text". Seeding the frozen columns instead would teach the
-- shape the program just retired, and 00594's freeze trigger would refuse the
-- next edit anyway.
--
-- PHONES are direction C12's derivation: a person is (612) 555-01NN where NN
-- is their F-nn row number (Ben Ostrom takes 0128); a firm's office line is
-- (612) 555-02NN where NN is its index in the list below. Emails are
-- <first>@<firm-slug>.com. Both are invented and traceable, so a specimen and
-- the database agree byte for byte.
--
-- Depends on dev-accounts.sql and organizations.sql, so it is ordered after
-- them in supabase/config.toml [db.seed].sql_paths.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Two jobs ─────────────────────────────────────────────────────────────────
INSERT INTO public.projects (
  id, name, designer_id, studio_id, status, created_by, client_visibility_tier,
  site_address, start_date, target_end_date, completed_at,
  total_amount_cents, created_at, updated_at
) VALUES
  ('d0e00000-0000-0000-0000-00000000000a', 'Okonkwo residence',
   'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001',
   'active', 'a0000000-0000-0000-0000-000000000004', 'full',
   '4412 Fremont Ave S, Minneapolis MN 55409', '2026-10-12', '2027-08-13', NULL,
   140000000, '2026-08-01T12:00:00Z', now()),
  ('d0e00000-0000-0000-0000-00000000000b', 'Lindqvist kitchen',
   'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001',
   'completed', 'a0000000-0000-0000-0000-000000000004', 'full',
   '2118 Kenwood Pkwy, Minneapolis MN 55405', '2025-05-05', '2025-10-15',
   '2025-11-21T17:00:00Z',
   18600000, '2025-03-14T12:00:00Z', '2025-11-21T17:00:00Z')
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      status = EXCLUDED.status,
      studio_id = EXCLUDED.studio_id,
      site_address = EXCLUDED.site_address,
      completed_at = EXCLUDED.completed_at;

-- ── The client book ──────────────────────────────────────────────────────────
-- PR-c: the household holds the members and the change-order threshold; every
-- member who acts on the job gets a SEAT carrying the authority grant. The
-- household OBJECT (client_households) is P2, so Adaeze's designer_clients row
-- stands for the household here and Chidi is a client_rep seat.
INSERT INTO public.designer_clients (
  id, designer_id, client_name, client_email, client_phone, status,
  location, source, first_project_at, last_contacted_at, created_at, updated_at
) VALUES
  ('d0e80000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000004',
   'The Okonkwo household', 'adaeze@okonkwo-household.com', '(612) 555-0104',
   'active', 'Minneapolis MN', 'referral', '2026-08-01', '2026-10-16',
   '2026-08-01T12:00:00Z', now()),
  ('d0e80000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000004',
   'Karin Lindqvist', 'karin@lindqvist-household.com', '(612) 555-0190',
   'completed', 'Minneapolis MN', 'referral', '2025-03-14', '2026-01-08',
   '2025-03-14T12:00:00Z', '2026-01-08T12:00:00Z')
ON CONFLICT (id) DO UPDATE
  SET client_name = EXCLUDED.client_name, status = EXCLUDED.status;

-- ═══════════════════════════════════════════════════════════════════════════
-- 21 firm cards
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.studio_contacts (
  id, organization_id, entity_kind, contact_kind, company_name, legal_name,
  company_kind, trades, email, phone, created_by, notes, created_at, updated_at
) VALUES
  ('d0e20000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','company','gc',
   'Marrow & Sons','Marrow & Sons Construction LLC','gc','{}','office@marrow-and-sons.com','(612) 555-0201',
   'a0000000-0000-0000-0000-000000000004','Repeat GC, two prior jobs. Holds the construction contract under the studio''s direction.','2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','company','architect',
   'Beck + Rowe Architects','Beck + Rowe Architects PA','architect','{}','office@beck-rowe-architects.com','(612) 555-0202',
   'a0000000-0000-0000-0000-000000000004','Architect of record. Stamps drawings, answers RFIs.','2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000001','company','sub',
   'Northgate Electric','Northgate Electric Inc','sub','{electrical}','office@northgate-electric.com','(612) 555-0203',
   'a0000000-0000-0000-0000-000000000004','Owner-operator. Repeat sub, 2025 Lindqvist.','2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000001','company','sub',
   'Rusk Mechanical','Rusk Mechanical LLC','sub','{plumbing}','office@rusk-mechanical.com','(612) 555-0204',
   'a0000000-0000-0000-0000-000000000004','Repeat sub, 2025 Lindqvist.','2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000005','b0000000-0000-0000-0000-000000000001','company','workroom',
   'Halvorsen Cabinet Works','Halvorsen Cabinet Works LLC','workroom','{cabinetry}','office@halvorsen-cabinet-works.com','(612) 555-0205',
   'a0000000-0000-0000-0000-000000000004','Email only. No cell for work.','2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000006','b0000000-0000-0000-0000-000000000001','company','sub',
   'Twin Cities Drywall & Plaster','Twin Cities Drywall & Plaster Co','sub','{drywall}','office@twin-cities-drywall-plaster.com','(612) 555-0206',
   'a0000000-0000-0000-0000-000000000004','Email Rosa. The owner does not take calls.','2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000007','b0000000-0000-0000-0000-000000000001','company','sub',
   'Lakeshore Painting Co.','Lakeshore Painting Company','sub','{paint}','office@lakeshore-painting.com','(612) 555-0207',
   'a0000000-0000-0000-0000-000000000004',NULL,'2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000008','b0000000-0000-0000-0000-000000000001','company','sub',
   'Boreal HVAC','Boreal HVAC Inc','sub','{hvac}','office@boreal-hvac.com','(612) 555-0208',
   'a0000000-0000-0000-0000-000000000004','Office dispatch by phone.','2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000009','b0000000-0000-0000-0000-000000000001','company','sub',
   'Cedar & Iron Framing','Cedar & Iron Framing LLC','sub','{carpentry_framing}','office@cedar-and-iron-framing.com','(612) 555-0209',
   'a0000000-0000-0000-0000-000000000004',NULL,'2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000010','b0000000-0000-0000-0000-000000000001','company','sub',
   'Radon Solutions North','Radon Solutions North LLC','sub','{}','office@radon-solutions-north.com','(612) 555-0210',
   'a0000000-0000-0000-0000-000000000004','Radon mitigation — outside FieldTrade''s vocabulary today (G-13). Addition slab, Feb 2027.','2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000011','b0000000-0000-0000-0000-000000000001','company','showroom',
   'Stonehaven Tile Gallery','Stonehaven Tile Gallery LLC','showroom','{tile}','orders@stonehaven-tile-gallery.com','(612) 555-0211',
   'a0000000-0000-0000-0000-000000000004','Same vendor as 2025 Lindqvist. Saved twice — by Leah in 2025 and by Priya in 2026.','2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000012','b0000000-0000-0000-0000-000000000001','company','supplier',
   'Waterline Supply','Waterline Supply Co','supplier','{plumbing}','orders@waterline-supply.com','(612) 555-0212',
   'a0000000-0000-0000-0000-000000000004',NULL,'2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000013','b0000000-0000-0000-0000-000000000001','company','supplier',
   'Lumen & Co.','Lumen and Company','supplier','{}','orders@lumen-and-co.com','(612) 555-0213',
   'a0000000-0000-0000-0000-000000000004',NULL,'2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000014','b0000000-0000-0000-0000-000000000001','company','maker',
   'Ashgrove Millwork','Ashgrove Millwork LLC','maker','{}','orders@ashgrove-millwork.com','(612) 555-0214',
   'a0000000-0000-0000-0000-000000000004','Orders through Patina. Install-day COI still pending — deliberately NOT recorded, so the card reads on its W-9 alone.','2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000015','b0000000-0000-0000-0000-000000000001','company','stager',
   'Kestrel Staging','Kestrel Staging LLC','stager','{}','office@kestrel-staging.com','(612) 555-0215',
   'a0000000-0000-0000-0000-000000000004',NULL,'2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000016','b0000000-0000-0000-0000-000000000001','company','photography',
   'Jonah Feld Photography','Jonah Feld Photography LLC','photography','{}','office@jonah-feld-photography.com','(612) 555-0216',
   'a0000000-0000-0000-0000-000000000004',NULL,'2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000017','b0000000-0000-0000-0000-000000000001','company','lender',
   'Great Northern Bank','Great Northern Bank NA','lender','{}','construction@great-northern-bank.com','(612) 555-0217',
   'a0000000-0000-0000-0000-000000000004','Construction loan, 40%. Holds NO paper for the studio (C13/R-A): a lender never owed the studio a COI.','2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000018','b0000000-0000-0000-0000-000000000001','company','authority',
   'City of Minneapolis, CPED Inspections','City of Minneapolis','authority','{}','inspections@minneapolismn.gov','(612) 555-0218',
   'a0000000-0000-0000-0000-000000000004','AHJ. Scheduled through the 311 portal. Holds NO paper for the studio (C13/R-A).','2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000019','b0000000-0000-0000-0000-000000000001','company','sub',
   'Rivera Finishes','Rivera Finishes LLC','sub','{paint}','office@rivera-finishes.com','(612) 555-0219',
   'a0000000-0000-0000-0000-000000000004','Asked to bid the paint scope 28 Sep 2026, due 5 Oct. No response (direction §3.4 Bidding band). Bid FIELDS are P2.','2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000020','b0000000-0000-0000-0000-000000000001','company','supplier',
   'Granite North','Granite North Inc','supplier','{}','office@granite-north.com','(612) 555-0220',
   'a0000000-0000-0000-0000-000000000004','Countertop fabrication. Off the job 2 Oct 2026 — the slab program went to Stonehaven (direction §3.4 Done band).','2026-08-01T12:00:00Z',now()),
  ('d0e20000-0000-0000-0000-000000000021','b0000000-0000-0000-0000-000000000001','company','gc',
   'Ostrom Builders','Ostrom Builders LLC','gc','{}','office@ostrom-builders.com','(612) 555-0221',
   'a0000000-0000-0000-0000-000000000004','GC on the 2025 Lindqvist kitchen. Not on Okonkwo — bring-forward question 6.','2025-03-14T12:00:00Z',now())
ON CONFLICT (id) DO UPDATE
  SET company_name = EXCLUDED.company_name,
      legal_name   = EXCLUDED.legal_name,
      company_kind = EXCLUDED.company_kind,
      trades       = EXCLUDED.trades,
      notes        = EXCLUDED.notes;

-- Firm facts that make the money book and the paperwork chase work.
UPDATE public.studio_contacts SET
  w9_on_file_at = '2025-04-01', tax_id_last4 = '4417',
  remit_to = 'Marrow & Sons Construction LLC, PO Box 4417, Minneapolis MN 55408',
  retainage_bps = 1000
WHERE id = 'd0e20000-0000-0000-0000-000000000001';
UPDATE public.studio_contacts SET w9_on_file_at = '2025-04-14', retainage_bps = 1000
WHERE id IN ('d0e20000-0000-0000-0000-000000000003','d0e20000-0000-0000-0000-000000000004',
             'd0e20000-0000-0000-0000-000000000005','d0e20000-0000-0000-0000-000000000006',
             'd0e20000-0000-0000-0000-000000000007','d0e20000-0000-0000-0000-000000000008',
             'd0e20000-0000-0000-0000-000000000009','d0e20000-0000-0000-0000-000000000010');
UPDATE public.studio_contacts SET w9_on_file_at = '2025-02-02'
WHERE id IN ('d0e20000-0000-0000-0000-000000000011','d0e20000-0000-0000-0000-000000000012',
             'd0e20000-0000-0000-0000-000000000013','d0e20000-0000-0000-0000-000000000014',
             'd0e20000-0000-0000-0000-000000000015','d0e20000-0000-0000-0000-000000000016',
             'd0e20000-0000-0000-0000-000000000020','d0e20000-0000-0000-0000-000000000021');
-- Warranty on the closed job runs to 2026-11-21 (fixture §4).
UPDATE public.studio_contacts SET warranty_until = '2026-11-21'
WHERE id = 'd0e20000-0000-0000-0000-000000000021';

-- ═══════════════════════════════════════════════════════════════════════════
-- 28 person cards. company_id is the DERIVED legacy pointer (R-AI): writing it
-- opens the matching studio_person_affiliations row through
-- sync_person_affiliation_from_pointer(), so the crew list can see them.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.studio_contacts (
  id, organization_id, entity_kind, contact_kind, full_name, company_id,
  email, phone, profile_id, specialties, is_sole_proprietor, notes,
  created_by, created_at, updated_at
) VALUES
  ('d0e10000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','person','studio','Leah Hartwell',NULL,
   'designer@patina.dev','(612) 555-0101','a0000000-0000-0000-0000-000000000004','{}',false,
   'Principal. Approves fee changes and design scope.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','person','studio','Priya Natarajan',NULL,
   'priya@hartwellstudio.com','(612) 555-0102',NULL,'{}',false,
   'Lead designer of record. Runs RFIs, submittals, selections. No local login in this seed.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000001','person','studio','Dale Whitcomb',NULL,
   'dale@hartwellstudio.com','(612) 555-0103',NULL,'{}',false,
   'Bookkeeper, two days a week. Posts invoices, assembles draw packages. Prepares, does not approve.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000001','person','client','Adaeze Okonkwo',NULL,
   'adaeze@okonkwo-household.com','(612) 555-0104',NULL,'{}',false,
   'Homeowner. Decides finishes and selections. iOS app daily.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000005','b0000000-0000-0000-0000-000000000001','person','client','Chidi Okonkwo',NULL,
   'chidi@okonkwo-household.com','(612) 555-0105',NULL,'{}',false,
   'Homeowner. Signs money. Email first; phone for anything over $2,500.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000006','b0000000-0000-0000-0000-000000000001','person','receiver','Ngozi Eze',NULL,
   NULL,'(612) 555-0106',NULL,'{}',false,
   'Adaeze''s sister. Holds a key, receives deliveries, lets trades in. Text only — never opens email.','a0000000-0000-0000-0000-000000000004','2026-10-10T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000007','b0000000-0000-0000-0000-000000000001','person','gc','Tom Marrow','d0e20000-0000-0000-0000-000000000001',
   'tom@marrow-and-sons.com','(612) 555-0107',NULL,'{}',false,
   'GC owner. Signs subcontracts, prices the cost side of change orders. Texts only from Erin.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000008','b0000000-0000-0000-0000-000000000001','person','gc','Erin Sato','d0e20000-0000-0000-0000-000000000001',
   'erin@marrow-and-sons.com','(612) 555-0108',NULL,'{}',false,
   'GC project manager. RFIs, submittals, draw requests, schedule. Opens the field link weekly.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000009','b0000000-0000-0000-0000-000000000001','person','gc','Luis Ochoa','d0e20000-0000-0000-0000-000000000001',
   NULL,'(612) 555-0109',NULL,'{}',false,
   'Superintendent. Daily site, punch list, inspection scheduling. Text and phone only.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000010','b0000000-0000-0000-0000-000000000001','person','architect','Sam Rowe','d0e20000-0000-0000-0000-000000000002',
   'sam@beck-rowe-architects.com','(612) 555-0110',NULL,'{}',false,
   'Architect of record. Email only; phone for emergencies. Never texted.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000011','b0000000-0000-0000-0000-000000000001','person','sub','Dana Kowalski','d0e20000-0000-0000-0000-000000000003',
   'dana@northgate-electric.com','(612) 555-0111',NULL,'{}',true,
   'Electrical, owner-operator. Text only — the email address exists and is unread. Repeat sub, 2025 Lindqvist.','a0000000-0000-0000-0000-000000000004','2025-04-20T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000012','b0000000-0000-0000-0000-000000000001','person','sub','Pete Rusk','d0e20000-0000-0000-0000-000000000004',
   NULL,'(612) 555-0112',NULL,'{}',true,
   'Plumbing owner. Text only. Replied STOP on the Lindqvist thread after close — see the consent record.','a0000000-0000-0000-0000-000000000004','2025-04-20T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000013','b0000000-0000-0000-0000-000000000001','person','sub','Ingrid Halvorsen','d0e20000-0000-0000-0000-000000000005',
   'ingrid@halvorsen-cabinet-works.com','(612) 555-0113',NULL,'{}',true,
   'Cabinetry install owner. Email only; no cell for work. Repeat sub, 2025 Lindqvist.','a0000000-0000-0000-0000-000000000004','2025-04-20T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000014','b0000000-0000-0000-0000-000000000001','person','sub','Rosa Delgado','d0e20000-0000-0000-0000-000000000006',
   'rosa@twin-cities-drywall-plaster.com','(612) 555-0114',NULL,'{}',false,
   'Office manager — the contact the firm wants used. Email and the office phone.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000015','b0000000-0000-0000-0000-000000000001','person','sub','Frank Bauer','d0e20000-0000-0000-0000-000000000006',
   'frank@twin-cities-drywall-plaster.com','(612) 555-0115',NULL,'{}',false,
   'Owner. Signs the subcontract. DO NOT CONTACT DIRECTLY, by his own request — the rule routes to Rosa Delgado.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000016','b0000000-0000-0000-0000-000000000001','person','sub','Amara Osei','d0e20000-0000-0000-0000-000000000007',
   'amara@lakeshore-painting.com','(612) 555-0116',NULL,'{}',true,
   'Painting owner. Holds a Patina account from a 2026 job with another studio; profile_id is still unlinkable (G-5).','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000017','b0000000-0000-0000-0000-000000000001','person','sub','Jim Lindgren','d0e20000-0000-0000-0000-000000000008',
   'jim@boreal-hvac.com','(612) 555-0117',NULL,'{}',false,
   'HVAC project manager. Email only; office dispatch by phone.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000018','b0000000-0000-0000-0000-000000000001','person','sub','Joe Wozniak','d0e20000-0000-0000-0000-000000000009',
   NULL,'(612) 555-0118',NULL,'{}',false,
   'Framing foreman. Text only. Invited 13 Oct 2026, no YES yet.','a0000000-0000-0000-0000-000000000004','2026-10-13T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000019','b0000000-0000-0000-0000-000000000001','person','sub','Kelly Marsh','d0e20000-0000-0000-0000-000000000010',
   'kelly@radon-solutions-north.com','(612) 555-0119',NULL,'{}',true,
   'Radon mitigation, addition slab. Email and phone.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000020','b0000000-0000-0000-0000-000000000001','person','vendor','Claire Bissett','d0e20000-0000-0000-0000-000000000011',
   'claire@stonehaven-tile-gallery.com','(612) 555-0120',NULL,'{tile_stone}',false,
   'Tile showroom rep. Quotes, samples, lead times. Same rep as 2025 Lindqvist.','a0000000-0000-0000-0000-000000000004','2025-04-20T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000021','b0000000-0000-0000-0000-000000000001','person','vendor','Marcus Hale','d0e20000-0000-0000-0000-000000000012',
   'marcus@waterline-supply.com','(612) 555-0121',NULL,'{plumbing_fixtures}',false,
   'Plumbing fixtures rep. Email. No seat on the job — a rep, not a party.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000022','b0000000-0000-0000-0000-000000000001','person','vendor','Sofia Ferraro','d0e20000-0000-0000-0000-000000000013',
   'sofia@lumen-and-co.com','(612) 555-0122',NULL,'{lighting}',false,
   'Lighting rep. Email; text for stock checks. No seat on the job.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000023','b0000000-0000-0000-0000-000000000001','person','maker','Owen Ashby','d0e20000-0000-0000-0000-000000000014',
   'owen@ashgrove-millwork.com','(612) 555-0123',NULL,'{millwork_fabrication}',false,
   'Custom millwork maker on Patina — kitchen island and built-ins. Orders through Patina.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000024','b0000000-0000-0000-0000-000000000001','person','stager','Nadia Brooks','d0e20000-0000-0000-0000-000000000015',
   'nadia@kestrel-staging.com','(612) 555-0124',NULL,'{}',false,
   'Stager for the completion photos. Email and text.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000025','b0000000-0000-0000-0000-000000000001','person','photographer','Jonah Feld','d0e20000-0000-0000-0000-000000000016',
   'jonah@jonah-feld-photography.com','(612) 555-0125',NULL,'{}',true,
   'Completion photographer. Email. One day on site.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000026','b0000000-0000-0000-0000-000000000001','person','inspector','Carol Nyström','d0e20000-0000-0000-0000-000000000017',
   'carol@great-northern-bank.com','(612) 555-0126',NULL,'{}',false,
   'Lender''s draw inspector. Certifies percent complete before each draw. Never texted. No PartyKind fits an inspector, so the seat is `other` (G-13).','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000027','b0000000-0000-0000-0000-000000000001','person','inspector','Ray Thao','d0e20000-0000-0000-0000-000000000018',
   'ray@minneapolismn.gov','(612) 555-0127',NULL,'{}',false,
   'Building inspector (AHJ). Framing, insulation, final. NEVER texted; scheduled through the 311 portal.','a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z',now()),
  ('d0e10000-0000-0000-0000-000000000028','b0000000-0000-0000-0000-000000000001','person','gc','Ben Ostrom','d0e20000-0000-0000-0000-000000000021',
   'ben@ostrom-builders.com','(612) 555-0128',NULL,'{}',false,
   'GC owner on the 2025 Lindqvist kitchen. Email and text; consent granted May 2025.','a0000000-0000-0000-0000-000000000004','2025-03-14T12:00:00Z',now())
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      company_id = EXCLUDED.company_id,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      notes = EXCLUDED.notes,
      is_sole_proprietor = EXCLUDED.is_sole_proprietor;

-- The three designated people per firm (00592's R-AP columns), set AFTER both
-- kinds of card exist so the guard can see them.
UPDATE public.studio_contacts SET
  paperwork_contact_person_id = 'd0e10000-0000-0000-0000-000000000008',
  signer_person_id            = 'd0e10000-0000-0000-0000-000000000007',
  site_contact_person_id      = 'd0e10000-0000-0000-0000-000000000009'
WHERE id = 'd0e20000-0000-0000-0000-000000000001';
-- F-14/F-15: Rosa chases and forwards, Frank signs. The whole point of PR-b.
UPDATE public.studio_contacts SET
  paperwork_contact_person_id = 'd0e10000-0000-0000-0000-000000000014',
  signer_person_id            = 'd0e10000-0000-0000-0000-000000000015',
  site_contact_person_id      = 'd0e10000-0000-0000-0000-000000000014'
WHERE id = 'd0e20000-0000-0000-0000-000000000006';
UPDATE public.studio_contacts SET
  paperwork_contact_person_id = 'd0e10000-0000-0000-0000-000000000011',
  signer_person_id            = 'd0e10000-0000-0000-0000-000000000011',
  site_contact_person_id      = 'd0e10000-0000-0000-0000-000000000011'
WHERE id = 'd0e20000-0000-0000-0000-000000000003';
UPDATE public.studio_contacts SET
  paperwork_contact_person_id = 'd0e10000-0000-0000-0000-000000000017',
  site_contact_person_id      = 'd0e10000-0000-0000-0000-000000000017'
WHERE id = 'd0e20000-0000-0000-0000-000000000008';

-- Affiliation facts the pointer trigger cannot know (role at the firm, who
-- chases paper, who signs, who holds the personal licence).
UPDATE public.studio_person_affiliations a SET
  role_at_firm = v.role, is_paperwork_contact = v.paper,
  is_signer = v.signer, holds_trade_license = v.license, from_date = v.from_date
FROM (VALUES
  ('d0e10000-0000-0000-0000-000000000007'::uuid,'owner',          false,true, false,'2024-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000008'::uuid,'pm',             true, false,false,'2024-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000009'::uuid,'superintendent', false,false,false,'2024-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000010'::uuid,'owner',          true, true, true, '2020-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000011'::uuid,'owner',          true, true, true, '2019-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000012'::uuid,'owner',          true, true, true, '2018-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000013'::uuid,'owner',          true, true, false,'2017-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000014'::uuid,'office_manager', true, false,false,'2021-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000015'::uuid,'owner',          false,true, false,'2005-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000016'::uuid,'owner',          true, true, false,'2022-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000017'::uuid,'pm',             true, false,false,'2023-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000018'::uuid,'foreman',        false,false,false,'2025-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000019'::uuid,'owner',          true, true, true, '2021-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000020'::uuid,'rep',            false,false,false,'2019-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000021'::uuid,'rep',            false,false,false,'2022-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000022'::uuid,'rep',            false,false,false,'2022-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000023'::uuid,'owner',          true, true, false,'2023-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000024'::uuid,'owner',          true, true, false,'2024-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000025'::uuid,'owner',          true, true, false,'2020-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000026'::uuid,'rep',            false,false,false,'2024-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000027'::uuid,'crew',           false,false,false,'2015-01-01'::date),
  ('d0e10000-0000-0000-0000-000000000028'::uuid,'owner',          true, true, true, '2015-01-01'::date)
) AS v(person_id, role, paper, signer, license, from_date)
WHERE a.person_id = v.person_id AND a.to_date IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Typed channels (E6). value is normalised on write by
-- normalize_studio_contact_channel() — phones to E.164, emails lowercased.
-- sms_capable is false on every office line: an office line must never be
-- offered an SMS invite (CS4-7).
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.studio_contact_channels
  (owner_type, owner_id, channel_kind, value, label, sms_capable, verified, verified_at, preferred, status, created_by)
VALUES
  -- people, mobile, text works
  ('person','d0e10000-0000-0000-0000-000000000006','mobile','(612) 555-0106','cell',true,true,'2026-10-10T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000008','mobile','(612) 555-0108','cell',true,true,'2026-10-08T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000009','mobile','(612) 555-0109','cell',true,true,'2026-10-12T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000011','mobile','(612) 555-0111','cell',true,true,'2025-05-02T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000012','mobile','(612) 555-0112','cell',true,true,'2025-05-02T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000016','mobile','(612) 555-0116','cell',true,true,'2026-10-14T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000018','mobile','(612) 555-0118','cell',true,false,NULL,true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000022','mobile','(612) 555-0122','cell — stock checks',true,false,NULL,false,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000024','mobile','(612) 555-0124','cell',true,false,NULL,true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000028','mobile','(612) 555-0128','cell',true,true,'2025-05-06T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004'),
  -- people, mobile, not a texting relationship
  ('person','d0e10000-0000-0000-0000-000000000001','mobile','(612) 555-0101','cell',false,true,'2026-08-01T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000002','mobile','(612) 555-0102','cell',false,true,'2026-08-01T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000004','mobile','(612) 555-0104','cell',false,true,'2026-08-01T12:00:00Z',false,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000005','mobile','(612) 555-0105','cell — call over $2,500',false,true,'2026-08-01T12:00:00Z',false,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000007','mobile','(612) 555-0107','cell',false,true,'2026-08-01T12:00:00Z',false,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000010','mobile','(612) 555-0110','cell — emergencies only',false,true,'2026-08-01T12:00:00Z',false,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000019','mobile','(612) 555-0119','cell',false,false,NULL,true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000023','mobile','(612) 555-0123','cell',false,true,'2026-08-01T12:00:00Z',false,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000026','mobile','(612) 555-0126','cell',false,true,'2026-08-01T12:00:00Z',false,'active','a0000000-0000-0000-0000-000000000004'),
  -- people reachable only on a firm line
  ('person','d0e10000-0000-0000-0000-000000000003','office','(612) 555-0103','studio desk',false,true,'2026-08-01T12:00:00Z',false,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000013','office','(612) 555-0113','shop line',false,true,'2025-05-01T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000014','office','(612) 555-0114','office',false,true,'2026-08-01T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000015','office','(612) 555-0115','office — do not use',false,false,NULL,false,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000017','office','(612) 555-0117','office',false,true,'2026-08-01T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000020','office','(612) 555-0120','showroom',false,true,'2025-04-20T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000021','office','(612) 555-0121','order desk',false,true,'2026-08-01T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000025','office','(612) 555-0125','studio',false,true,'2026-08-01T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004'),
  ('person','d0e10000-0000-0000-0000-000000000027','office','(612) 555-0127','CPED desk',false,true,'2026-08-01T12:00:00Z',false,'active','a0000000-0000-0000-0000-000000000004'),
  -- F-27 is reachable no other way (CS4-7)
  ('person','d0e10000-0000-0000-0000-000000000027','portal_311','minneapolis-311','inspection scheduling portal',false,true,'2026-10-06T12:00:00Z',true,'active','a0000000-0000-0000-0000-000000000004')
ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

-- Personal email addresses, from the cards. Dana's is `dead`: it exists and is
-- unread, which is exactly the fact the status column was added for (CS6-10).
INSERT INTO public.studio_contact_channels
  (owner_type, owner_id, channel_kind, value, label, sms_capable, verified, preferred, status, status_at, created_by)
SELECT 'person', sc.id, 'email', sc.email, NULL, false,
       sc.id <> 'd0e10000-0000-0000-0000-000000000011',
       sc.id NOT IN ('d0e10000-0000-0000-0000-000000000011',
                     'd0e10000-0000-0000-0000-000000000015'),
       CASE WHEN sc.id = 'd0e10000-0000-0000-0000-000000000011' THEN 'dead' ELSE 'active' END,
       CASE WHEN sc.id = 'd0e10000-0000-0000-0000-000000000011' THEN '2026-04-02T12:00:00Z'::timestamptz END,
       'a0000000-0000-0000-0000-000000000004'
FROM public.studio_contacts sc
WHERE sc.id::text LIKE 'd0e10000-%' AND sc.email IS NOT NULL
ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

-- Firm lines: the office number and the general address for every firm, plus
-- Boreal's dispatch line and the address Marrow's bookkeeper pays from.
INSERT INTO public.studio_contact_channels
  (owner_type, owner_id, channel_kind, value, label, sms_capable, verified, preferred, status, created_by)
SELECT 'company', sc.id, 'office', sc.phone, 'office', false, true, true, 'active',
       'a0000000-0000-0000-0000-000000000004'
FROM public.studio_contacts sc
WHERE sc.id::text LIKE 'd0e20000-%' AND sc.phone IS NOT NULL
ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

INSERT INTO public.studio_contact_channels
  (owner_type, owner_id, channel_kind, value, label, sms_capable, verified, preferred, status, created_by)
SELECT 'company', sc.id, 'email', sc.email, 'general', false, true, true, 'active',
       'a0000000-0000-0000-0000-000000000004'
FROM public.studio_contacts sc
WHERE sc.id::text LIKE 'd0e20000-%' AND sc.email IS NOT NULL
ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

INSERT INTO public.studio_contact_channels
  (owner_type, owner_id, channel_kind, value, label, sms_capable, verified, preferred, status, created_by)
VALUES
  ('company','d0e20000-0000-0000-0000-000000000008','dispatch','(612) 555-0308','dispatch',false,true,false,'active','a0000000-0000-0000-0000-000000000004'),
  ('company','d0e20000-0000-0000-0000-000000000001','ap_email','ap@marrow-and-sons.com','accounts payable',false,true,false,'active','a0000000-0000-0000-0000-000000000004')
ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Contact rules (E7). The fixture's five recorded rules, including the two the
-- brief names: F-14/F-15's route-through and F-27's never-text.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.studio_contact_rules
  (subject_type, subject_id, channels_allowed, channels_forbidden,
   route_to_person_id, contact_hours, escalation_by_class, reason, set_by, set_at)
VALUES
  -- F-15 Frank Bauer takes no direct contact, by his own request; the firm
  -- wants Rosa used. The rule outranks the designation (C7): Frank is still
  -- the signer, and no channel of his is ever printed.
  ('person','d0e10000-0000-0000-0000-000000000015','{}',
   '{mobile,office,dispatch,after_hours,email,ap_email,sms}',
   'd0e10000-0000-0000-0000-000000000014', NULL, '{}',
   'No direct contact, at his request. Write Rosa Delgado; she forwards what he has to sign.',
   'a0000000-0000-0000-0000-000000000004','2026-08-14T12:00:00Z'),
  -- F-27 Ray Thao: NEVER text an AHJ inspector.
  ('person','d0e10000-0000-0000-0000-000000000027','{office,email,portal_311}','{sms}',
   NULL, 'Weekdays 08:00 to 16:00.', '{}',
   'Building inspector. Never text. Inspections are scheduled through the 311 portal.',
   'a0000000-0000-0000-0000-000000000004','2026-10-06T12:00:00Z'),
  -- F-10 Sam Rowe: email only, phone for emergencies, never texted.
  ('person','d0e10000-0000-0000-0000-000000000010','{email,mobile}','{sms}',
   NULL, NULL, '{}',
   'Email only. Phone for emergencies. Never texted.',
   'a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z'),
  -- F-13 Ingrid Halvorsen: email only; no cell for work.
  ('person','d0e10000-0000-0000-0000-000000000013','{email,office}','{sms,mobile}',
   NULL, NULL, '{}',
   'Email only. No cell for work — the shop line is the voice door.',
   'a0000000-0000-0000-0000-000000000004','2025-05-01T12:00:00Z'),
  -- F-26 Carol Nyström: never texted.
  ('person','d0e10000-0000-0000-0000-000000000026','{email,mobile}','{sms}',
   NULL, NULL, '{}',
   'Lender''s inspector. Email and phone; never texted.',
   'a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z'),
  -- F-05 Chidi Okonkwo: a phone call over $2,500 (CS5-21).
  ('person','d0e10000-0000-0000-0000-000000000005','{email,mobile}','{}',
   NULL, NULL, '{"co": "mobile", "draw": "mobile"}',
   'Email first. Call for anything over $2,500 — a change order or a draw.',
   'a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z')
ON CONFLICT (subject_type, subject_id) DO UPDATE
  SET channels_allowed   = EXCLUDED.channels_allowed,
      channels_forbidden = EXCLUDED.channels_forbidden,
      route_to_person_id = EXCLUDED.route_to_person_id,
      contact_hours      = EXCLUDED.contact_hours,
      escalation_by_class= EXCLUDED.escalation_by_class,
      reason             = EXCLUDED.reason;

-- ═══════════════════════════════════════════════════════════════════════════
-- Consent RECORDS (E8) — the only place an SMS verdict lives (R-AY).
-- Five granted numbers, which is R-F's "5 reachable by text"; one invited and
-- unanswered; one refusal the recipient made himself.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.studio_channel_consent
  (organization_id, channel_kind, channel_value, status,
   consented_at, source, evidence, recorded_at, disclosure_version, recorded_by,
   opt_out_at, opt_out_source, opt_out_evidence, opt_out_recorded_at,
   refusal_unanswered, origin_project_id)
VALUES
  -- F-06 Ngozi Eze — kickoff form
  ('b0000000-0000-0000-0000-000000000001','sms','+16125550106','granted',
   '2026-10-10T15:00:00Z','written','Kickoff form, signed on site 10 Oct 2026.',
   '2026-10-10T15:00:00Z','2026-05-v1','a0000000-0000-0000-0000-000000000004',
   NULL,NULL,NULL,NULL,false,'d0e00000-0000-0000-0000-00000000000a'),
  -- F-08 Erin Sato — written
  ('b0000000-0000-0000-0000-000000000001','sms','+16125550108','granted',
   '2026-10-08T15:00:00Z','written','Signed subcontract exhibit, 8 Oct 2026.',
   '2026-10-08T15:00:00Z','2026-05-v1','a0000000-0000-0000-0000-000000000004',
   NULL,NULL,NULL,NULL,false,'d0e00000-0000-0000-0000-00000000000a'),
  -- F-09 Luis Ochoa — verbal at the site kickoff
  ('b0000000-0000-0000-0000-000000000001','sms','+16125550109','granted',
   '2026-10-12T16:00:00Z','verbal','Said yes at the site kickoff. Recorded by Priya Natarajan.',
   '2026-10-12T16:00:00Z','2026-05-v1','a0000000-0000-0000-0000-000000000004',
   NULL,NULL,NULL,NULL,false,'d0e00000-0000-0000-0000-00000000000a'),
  -- F-11 Dana Kowalski — granted on the LINDQVIST job and carried by the phone
  ('b0000000-0000-0000-0000-000000000001','sms','+16125550111','granted',
   '2025-05-02T14:00:00Z','written','Signed trade agreement exhibit, 2 May 2025.',
   '2025-05-02T14:00:00Z','2025-01-v1','a0000000-0000-0000-0000-000000000004',
   NULL,NULL,NULL,NULL,false,'d0e00000-0000-0000-0000-00000000000b'),
  -- F-16 Amara Osei — web form
  ('b0000000-0000-0000-0000-000000000001','sms','+16125550116','granted',
   '2026-10-14T18:00:00Z','web_form','Opted in on the trade onboarding form, 14 Oct 2026.',
   '2026-10-14T18:00:00Z','2026-05-v1','a0000000-0000-0000-0000-000000000004',
   NULL,NULL,NULL,NULL,false,'d0e00000-0000-0000-0000-00000000000a'),
  -- F-18 Joe Wozniak — invited, no YES yet
  ('b0000000-0000-0000-0000-000000000001','sms','+16125550118','pending',
   NULL,'verbal','Asked at the site kickoff and sent the opt-in text, 13 Oct 2026. No YES yet.',
   '2026-10-13T17:00:00Z','2026-05-v1','a0000000-0000-0000-0000-000000000004',
   NULL,NULL,NULL,NULL,false,'d0e00000-0000-0000-0000-00000000000a'),
  -- F-12 Pete Rusk — he replied STOP himself, on the Lindqvist thread, after
  -- close. refusal_unanswered is FALSE because this refusal IS the
  -- recipient's own answer; only a fold's inherited refusal raises that flag.
  ('b0000000-0000-0000-0000-000000000001','sms','+16125550112','opted_out',
   '2025-05-02T14:00:00Z','written','Signed trade agreement exhibit, 2 May 2025.',
   '2025-05-02T14:00:00Z','2025-01-v1','a0000000-0000-0000-0000-000000000004',
   '2025-12-03T21:00:00Z','inbound_sms','Replied STOP on the Lindqvist thread, 3 Dec 2025.',
   '2025-12-03T21:00:00Z',false,'d0e00000-0000-0000-0000-00000000000b')
ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE
  SET status = EXCLUDED.status,
      consented_at = EXCLUDED.consented_at,
      source = EXCLUDED.source,
      evidence = EXCLUDED.evidence,
      opt_out_at = EXCLUDED.opt_out_at,
      opt_out_source = EXCLUDED.opt_out_source,
      opt_out_evidence = EXCLUDED.opt_out_evidence,
      refusal_unanswered = EXCLUDED.refusal_unanswered,
      origin_project_id = EXCLUDED.origin_project_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- Compliance documents (E10). The brief's two named facts are here: Northgate
-- Electric's general liability LAPSED 31 Mar 2026 (F-11), and Marrow & Sons
-- current to 31 Mar 2027 (F-07). Lakeshore Painting's is CURRENT_DATE + 23 on
-- purpose, so `lapses_soon` — the one paper word that needs a moving date —
-- is always demonstrated. Great Northern Bank and CPED hold NO documents:
-- a lender and an AHJ never owed the studio paper (C13 / R-A), and
-- not_on_file is a different fact from lapsed.
-- Ashgrove Millwork's install-day COI is deliberately absent: the fixture says
-- it is pending, and a row with no expiry would read `current`.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, doc_label, number,
   issuer, issued_on, expires_on, blocks, held_by, verified_by, verified_at,
   created_by, created_at)
VALUES
  -- Marrow & Sons (F-07): CURRENT
  ('d0e50000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000001',
   'coi_gl',NULL,'GL-4417-26','Northern Mutual Casualty','2026-03-31','2027-03-31',
   '{site_access,payment}','studio','a0000000-0000-0000-0000-000000000004','2026-08-04','a0000000-0000-0000-0000-000000000004','2026-08-04T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000001',
   'w9',NULL,NULL,'Marrow & Sons Construction LLC','2025-04-01',NULL,
   '{payment}','studio','a0000000-0000-0000-0000-000000000004','2025-04-02','a0000000-0000-0000-0000-000000000004','2025-04-02T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000001',
   'license',NULL,'BC-661204','MN Dept of Labor and Industry','2026-01-01','2027-12-31',
   '{}','studio','a0000000-0000-0000-0000-000000000004','2026-08-04','a0000000-0000-0000-0000-000000000004','2026-08-04T12:00:00Z'),
  -- Beck + Rowe (F-10)
  ('d0e50000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000002',
   'coi_gl','Professional liability','PL-88231','Architects Mutual','2026-06-01','2027-06-01',
   '{}','studio','a0000000-0000-0000-0000-000000000004','2026-08-04','a0000000-0000-0000-0000-000000000004','2026-08-04T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000005','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000002',
   'license',NULL,'AR-24118','MN Board of AELSLAGID','2025-07-01','2027-06-30',
   '{}','studio','a0000000-0000-0000-0000-000000000004','2026-08-04','a0000000-0000-0000-0000-000000000004','2026-08-04T12:00:00Z'),
  -- Northgate Electric (F-11): LAPSED, and it holds site access and the draw
  ('d0e50000-0000-0000-0000-000000000006','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000003',
   'coi_gl',NULL,'GL-22907-25','Lakes Regional Insurance','2025-03-31','2026-03-31',
   '{site_access,draw}','studio','a0000000-0000-0000-0000-000000000004','2025-04-14','a0000000-0000-0000-0000-000000000004','2025-04-14T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000007','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000003',
   'w9',NULL,NULL,'Northgate Electric Inc','2025-04-14',NULL,
   '{payment}','studio','a0000000-0000-0000-0000-000000000004','2025-04-14','a0000000-0000-0000-0000-000000000004','2025-04-14T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000008','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000003',
   'license',NULL,'EA-009182','MN Dept of Labor and Industry','2025-01-01','2027-12-31',
   '{}','studio','a0000000-0000-0000-0000-000000000004','2025-04-14','a0000000-0000-0000-0000-000000000004','2025-04-14T12:00:00Z'),
  -- Rusk Mechanical (F-12)
  ('d0e50000-0000-0000-0000-000000000009','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000004',
   'coi_gl',NULL,'GL-31118-26','Lakes Regional Insurance','2026-01-15','2027-01-15',
   '{site_access,draw}','studio','a0000000-0000-0000-0000-000000000004','2026-08-04','a0000000-0000-0000-0000-000000000004','2026-08-04T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000010','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000004',
   'w9',NULL,NULL,'Rusk Mechanical LLC','2025-04-14',NULL,'{payment}','studio',
   'a0000000-0000-0000-0000-000000000004','2025-04-14','a0000000-0000-0000-0000-000000000004','2025-04-14T12:00:00Z'),
  -- Halvorsen (F-13)
  ('d0e50000-0000-0000-0000-000000000011','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000005',
   'coi_gl',NULL,'GL-71220-26','Lakes Regional Insurance','2026-06-30','2027-06-30',
   '{site_access}','studio','a0000000-0000-0000-0000-000000000004','2026-08-04','a0000000-0000-0000-0000-000000000004','2026-08-04T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000012','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000005',
   'w9',NULL,NULL,'Halvorsen Cabinet Works LLC','2025-04-14',NULL,'{payment}','studio',
   'a0000000-0000-0000-0000-000000000004','2025-04-14','a0000000-0000-0000-0000-000000000004','2025-04-14T12:00:00Z'),
  -- Twin Cities Drywall (F-14/F-15)
  ('d0e50000-0000-0000-0000-000000000013','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000006',
   'coi_gl',NULL,'GL-55031-26','Northern Mutual Casualty','2026-05-31','2027-05-31',
   '{site_access,draw}','studio','a0000000-0000-0000-0000-000000000004','2026-08-04','a0000000-0000-0000-0000-000000000004','2026-08-04T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000014','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000006',
   'w9',NULL,NULL,'Twin Cities Drywall & Plaster Co','2025-04-14',NULL,'{payment}','studio',
   'a0000000-0000-0000-0000-000000000004','2025-04-14','a0000000-0000-0000-0000-000000000004','2025-04-14T12:00:00Z'),
  -- Lakeshore Painting (F-16): LAPSES SOON, always
  ('d0e50000-0000-0000-0000-000000000015','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000007',
   'coi_gl',NULL,'GL-41155-25','Lakes Regional Insurance',(CURRENT_DATE - 342),(CURRENT_DATE + 23),
   '{site_access,draw}','studio','a0000000-0000-0000-0000-000000000004','2026-08-04','a0000000-0000-0000-0000-000000000004','2026-08-04T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000016','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000007',
   'w9',NULL,NULL,'Lakeshore Painting Company','2025-04-14',NULL,'{payment}','studio',
   'a0000000-0000-0000-0000-000000000004','2025-04-14','a0000000-0000-0000-0000-000000000004','2025-04-14T12:00:00Z'),
  -- Boreal HVAC (F-17)
  ('d0e50000-0000-0000-0000-000000000017','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000008',
   'coi_gl',NULL,'GL-22811-26','Northern Mutual Casualty','2026-02-28','2027-02-28',
   '{site_access,draw}','studio','a0000000-0000-0000-0000-000000000004','2026-08-04','a0000000-0000-0000-0000-000000000004','2026-08-04T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000018','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000008',
   'bond',NULL,'MB-5511','MN Dept of Labor and Industry','2026-01-01','2027-12-31',
   '{}','studio','a0000000-0000-0000-0000-000000000004','2026-08-04','a0000000-0000-0000-0000-000000000004','2026-08-04T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000019','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000008',
   'w9',NULL,NULL,'Boreal HVAC Inc','2025-04-14',NULL,'{payment}','studio',
   'a0000000-0000-0000-0000-000000000004','2025-04-14','a0000000-0000-0000-0000-000000000004','2025-04-14T12:00:00Z'),
  -- Cedar & Iron (F-18)
  ('d0e50000-0000-0000-0000-000000000020','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000009',
   'coi_gl',NULL,'GL-99304-26','Lakes Regional Insurance','2026-09-30','2027-09-30',
   '{site_access,draw}','studio','a0000000-0000-0000-0000-000000000004','2026-10-01','a0000000-0000-0000-0000-000000000004','2026-10-01T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000021','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000009',
   'w9',NULL,NULL,'Cedar & Iron Framing LLC','2025-04-14',NULL,'{payment}','studio',
   'a0000000-0000-0000-0000-000000000004','2025-04-14','a0000000-0000-0000-0000-000000000004','2025-04-14T12:00:00Z'),
  -- Radon Solutions North (F-19)
  ('d0e50000-0000-0000-0000-000000000022','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000010',
   'coi_gl',NULL,'GL-83117-26','Lakes Regional Insurance','2026-08-31','2027-08-31',
   '{site_access}','studio','a0000000-0000-0000-0000-000000000004','2026-09-01','a0000000-0000-0000-0000-000000000004','2026-09-01T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000023','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000010',
   'license','MDH radon mitigation','RMEC-1180','Minnesota Dept of Health','2026-01-01','2027-12-31',
   '{}','studio','a0000000-0000-0000-0000-000000000004','2026-09-01','a0000000-0000-0000-0000-000000000004','2026-09-01T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000024','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000010',
   'w9',NULL,NULL,'Radon Solutions North LLC','2025-04-14',NULL,'{payment}','studio',
   'a0000000-0000-0000-0000-000000000004','2025-04-14','a0000000-0000-0000-0000-000000000004','2025-04-14T12:00:00Z'),
  -- Stonehaven (F-20): a W-9 for the 1099 and a resale certificate
  ('d0e50000-0000-0000-0000-000000000025','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000011',
   'w9',NULL,NULL,'Stonehaven Tile Gallery LLC','2025-02-02',NULL,'{payment}','studio',
   'a0000000-0000-0000-0000-000000000004','2025-02-03','a0000000-0000-0000-0000-000000000004','2025-02-03T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000026','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000011',
   'other_named','Resale certificate','ST3-2025-8814','MN Dept of Revenue','2025-02-02',NULL,
   '{}','studio','a0000000-0000-0000-0000-000000000004','2025-02-03','a0000000-0000-0000-0000-000000000004','2025-02-03T12:00:00Z'),
  -- Waterline, Lumen, Ashgrove, Kestrel, Jonah Feld, Granite North, Ostrom
  ('d0e50000-0000-0000-0000-000000000027','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000012',
   'w9',NULL,NULL,'Waterline Supply Co','2025-02-02',NULL,'{payment}','studio',NULL,NULL,'a0000000-0000-0000-0000-000000000004','2025-02-02T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000028','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000013',
   'w9',NULL,NULL,'Lumen and Company','2025-02-02',NULL,'{payment}','studio',NULL,NULL,'a0000000-0000-0000-0000-000000000004','2025-02-02T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000029','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000014',
   'w9',NULL,NULL,'Ashgrove Millwork LLC','2025-02-02',NULL,'{payment}','studio',
   'a0000000-0000-0000-0000-000000000004','2025-02-03','a0000000-0000-0000-0000-000000000004','2025-02-03T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000030','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000015',
   'coi_gl',NULL,'GL-10318-26','Northern Mutual Casualty','2026-10-31','2027-10-31',
   '{site_access}','studio','a0000000-0000-0000-0000-000000000004','2026-08-04','a0000000-0000-0000-0000-000000000004','2026-08-04T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000031','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000015',
   'w9',NULL,NULL,'Kestrel Staging LLC','2025-02-02',NULL,'{payment}','studio',NULL,NULL,'a0000000-0000-0000-0000-000000000004','2025-02-02T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000032','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000016',
   'w9',NULL,NULL,'Jonah Feld Photography LLC','2025-02-02',NULL,'{payment}','studio',NULL,NULL,'a0000000-0000-0000-0000-000000000004','2025-02-02T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000033','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000020',
   'w9',NULL,NULL,'Granite North Inc','2025-02-02',NULL,'{payment}','studio',NULL,NULL,'a0000000-0000-0000-0000-000000000004','2025-02-02T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000034','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000021',
   'coi_gl',NULL,'GL-12319-25','Lakes Regional Insurance','2024-12-31','2025-12-31',
   '{site_access,draw}','studio','a0000000-0000-0000-0000-000000000004','2025-03-14','a0000000-0000-0000-0000-000000000004','2025-03-14T12:00:00Z'),
  ('d0e50000-0000-0000-0000-000000000035','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000021',
   'w9',NULL,NULL,'Ostrom Builders LLC','2025-02-02',NULL,'{payment}','studio',
   'a0000000-0000-0000-0000-000000000004','2025-03-14','a0000000-0000-0000-0000-000000000004','2025-03-14T12:00:00Z'),
  -- A PERSON-held paper, held by the GC: F-09's OSHA 30 card (CS2-21, CS3 AA-4)
  ('d0e50000-0000-0000-0000-000000000036','b0000000-0000-0000-0000-000000000001','person','d0e10000-0000-0000-0000-000000000009',
   'other_named','OSHA 30 card','OSHA30-778102','OSHA outreach trainer','2024-05-01','2029-05-01',
   '{site_access}','gc','a0000000-0000-0000-0000-000000000004','2026-08-04','a0000000-0000-0000-0000-000000000004','2026-08-04T12:00:00Z')
ON CONFLICT (id) DO UPDATE
  SET expires_on = EXCLUDED.expires_on,
      blocks     = EXCLUDED.blocks,
      held_by    = EXCLUDED.held_by,
      verified_at= EXCLUDED.verified_at;

-- ═══════════════════════════════════════════════════════════════════════════
-- The Okonkwo roster (E5). Windows are direction §3.4's own bands. Every seat
-- is born at sms_consent_status `not_asked`: the RECORD carries consent
-- (R-AY), and the frozen columns are read by nothing.
--
-- F-26 and F-27 land on party_kind `other` because PartyKind still has no
-- inspector or lender (G-13). PR-f widens the vocabulary; that is not this
-- wave, and the seed records the current, honest shape.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, company_name, email, phone, trade,
   studio_contact_id, company_id, stage, on_site_from, on_site_to,
   site_access_mode, contracted_through, show_to_client, off_job_at,
   off_job_reason, created_by, created_at, updated_at)
VALUES
  ('d0e30000-0000-0000-0000-000000000004','d0e00000-0000-0000-0000-00000000000a','client','Adaeze Okonkwo','Okonkwo household','adaeze@okonkwo-household.com','(612) 555-0104',NULL,
   'd0e10000-0000-0000-0000-000000000004',NULL,'active',NULL,NULL,'open','owner',true,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z','2026-08-01T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000005','d0e00000-0000-0000-0000-00000000000a','client_rep','Chidi Okonkwo','Okonkwo household','chidi@okonkwo-household.com','(612) 555-0105',NULL,
   'd0e10000-0000-0000-0000-000000000005',NULL,'active',NULL,NULL,'open','owner',true,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z','2026-08-01T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000006','d0e00000-0000-0000-0000-00000000000a','receiver','Ngozi Eze',NULL,NULL,'(612) 555-0106',NULL,
   'd0e10000-0000-0000-0000-000000000006',NULL,'active','2026-10-12','2027-09-30','key','owner',true,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-10-10T12:00:00Z','2026-10-10T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000007','d0e00000-0000-0000-0000-00000000000a','gc','Tom Marrow','Marrow & Sons','tom@marrow-and-sons.com','(612) 555-0107',NULL,
   'd0e10000-0000-0000-0000-000000000007','d0e20000-0000-0000-0000-000000000001','active','2026-10-12','2027-08-13','open','studio',true,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z','2026-08-01T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000008','d0e00000-0000-0000-0000-00000000000a','gc','Erin Sato','Marrow & Sons','erin@marrow-and-sons.com','(612) 555-0108',NULL,
   'd0e10000-0000-0000-0000-000000000008','d0e20000-0000-0000-0000-000000000001','active','2026-10-12','2027-08-13','open','studio',true,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z','2026-10-19T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000009','d0e00000-0000-0000-0000-00000000000a','gc','Luis Ochoa','Marrow & Sons',NULL,'(612) 555-0109',NULL,
   'd0e10000-0000-0000-0000-000000000009','d0e20000-0000-0000-0000-000000000001','active','2026-10-12','2027-08-13','open','studio',true,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z','2026-08-01T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000010','d0e00000-0000-0000-0000-00000000000a','architect','Sam Rowe','Beck + Rowe Architects','sam@beck-rowe-architects.com','(612) 555-0110',NULL,
   'd0e10000-0000-0000-0000-000000000010','d0e20000-0000-0000-0000-000000000002','active','2026-08-01','2027-08-13','escorted','owner',false,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z','2026-08-01T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000011','d0e00000-0000-0000-0000-00000000000a','sub','Dana Kowalski','Northgate Electric','dana@northgate-electric.com','(612) 555-0111','electrical',
   'd0e10000-0000-0000-0000-000000000011','d0e20000-0000-0000-0000-000000000003','active','2026-10-19','2027-06-30','escorted','studio',true,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-10-12T12:00:00Z','2026-10-19T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000012','d0e00000-0000-0000-0000-00000000000a','sub','Pete Rusk','Rusk Mechanical',NULL,'(612) 555-0112','plumbing',
   'd0e10000-0000-0000-0000-000000000012','d0e20000-0000-0000-0000-000000000004','awarded','2026-11-09','2027-05-31','escorted','studio',false,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000013','d0e00000-0000-0000-0000-00000000000a','sub','Ingrid Halvorsen','Halvorsen Cabinet Works','ingrid@halvorsen-cabinet-works.com','(612) 555-0113','cabinetry',
   'd0e10000-0000-0000-0000-000000000013','d0e20000-0000-0000-0000-000000000005','awarded','2027-04-05','2027-06-15','escorted','studio',false,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000014','d0e00000-0000-0000-0000-00000000000a','sub','Rosa Delgado','Twin Cities Drywall & Plaster','rosa@twin-cities-drywall-plaster.com','(612) 555-0114','drywall',
   'd0e10000-0000-0000-0000-000000000014','d0e20000-0000-0000-0000-000000000006','awarded','2027-01-11','2027-03-15','escorted','studio',false,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000015','d0e00000-0000-0000-0000-00000000000a','sub','Frank Bauer','Twin Cities Drywall & Plaster','frank@twin-cities-drywall-plaster.com','(612) 555-0115','drywall',
   'd0e10000-0000-0000-0000-000000000015','d0e20000-0000-0000-0000-000000000006','awarded','2027-01-11','2027-03-15','escorted','studio',false,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000016','d0e00000-0000-0000-0000-00000000000a','sub','Amara Osei','Lakeshore Painting Co.','amara@lakeshore-painting.com','(612) 555-0116','paint',
   'd0e10000-0000-0000-0000-000000000016','d0e20000-0000-0000-0000-000000000007','awarded','2027-05-04','2027-07-15','escorted','studio',false,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-10-14T12:00:00Z','2026-10-14T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000017','d0e00000-0000-0000-0000-00000000000a','sub','Jim Lindgren','Boreal HVAC','jim@boreal-hvac.com','(612) 555-0117','hvac',
   'd0e10000-0000-0000-0000-000000000017','d0e20000-0000-0000-0000-000000000008','awarded','2027-02-01','2027-06-30','escorted','studio',false,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000018','d0e00000-0000-0000-0000-00000000000a','sub','Joe Wozniak','Cedar & Iron Framing',NULL,'(612) 555-0118','carpentry_framing',
   'd0e10000-0000-0000-0000-000000000018','d0e20000-0000-0000-0000-000000000009','active','2026-10-19','2026-11-20','escorted','studio',true,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-10-13T12:00:00Z','2026-10-19T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000019','d0e00000-0000-0000-0000-00000000000a','sub','Kelly Marsh','Radon Solutions North','kelly@radon-solutions-north.com','(612) 555-0119',NULL,
   'd0e10000-0000-0000-0000-000000000019','d0e20000-0000-0000-0000-000000000010','awarded','2027-02-01','2027-02-19','escorted','studio',false,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000020','d0e00000-0000-0000-0000-00000000000a','vendor','Claire Bissett','Stonehaven Tile Gallery','claire@stonehaven-tile-gallery.com','(612) 555-0120',NULL,
   'd0e10000-0000-0000-0000-000000000020','d0e20000-0000-0000-0000-000000000011','active',NULL,NULL,NULL,'studio',false,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-08-14T12:00:00Z','2026-08-14T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000023','d0e00000-0000-0000-0000-00000000000a','vendor','Owen Ashby','Ashgrove Millwork','owen@ashgrove-millwork.com','(612) 555-0123',NULL,
   'd0e10000-0000-0000-0000-000000000023','d0e20000-0000-0000-0000-000000000014','active','2027-06-21','2027-06-25','escorted','studio',false,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000024','d0e00000-0000-0000-0000-00000000000a','stager','Nadia Brooks','Kestrel Staging','nadia@kestrel-staging.com','(612) 555-0124',NULL,
   'd0e10000-0000-0000-0000-000000000024','d0e20000-0000-0000-0000-000000000015','awarded','2027-08-16','2027-08-27','escorted','studio',false,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000025','d0e00000-0000-0000-0000-00000000000a','photographer','Jonah Feld','Jonah Feld Photography','jonah@jonah-feld-photography.com','(612) 555-0125',NULL,
   'd0e10000-0000-0000-0000-000000000025','d0e20000-0000-0000-0000-000000000016','awarded','2027-09-13','2027-09-13','escorted','studio',false,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000026','d0e00000-0000-0000-0000-00000000000a','other','Carol Nyström','Great Northern Bank','carol@great-northern-bank.com','(612) 555-0126',NULL,
   'd0e10000-0000-0000-0000-000000000026','d0e20000-0000-0000-0000-000000000017','active','2026-10-12','2027-08-13','escorted','owner',false,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-08-01T12:00:00Z','2026-08-01T12:00:00Z'),
  ('d0e30000-0000-0000-0000-000000000027','d0e00000-0000-0000-0000-00000000000a','other','Ray Thao','City of Minneapolis, CPED Inspections','ray@minneapolismn.gov','(612) 555-0127',NULL,
   'd0e10000-0000-0000-0000-000000000027','d0e20000-0000-0000-0000-000000000018','active',NULL,NULL,'escorted',NULL,false,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-10-06T12:00:00Z','2026-10-06T12:00:00Z'),
  -- Two FIRM-ONLY seats: no person, so no rolodex person card stamps them.
  -- Rivera Finishes is direction §3.4's Bidding row (bid FIELDS are P2, so the
  -- stage carries the whole fact today) and the one seat in this fixture that
  -- exercises people_directory's uncarded-identity branch.
  ('d0e30000-0000-0000-0000-000000000091','d0e00000-0000-0000-0000-00000000000a','sub','Rivera Finishes','Rivera Finishes',
   'office@rivera-finishes.com','(612) 555-0219','paint',
   NULL,'d0e20000-0000-0000-0000-000000000019','no_response',NULL,NULL,NULL,'studio',false,NULL,NULL,'a0000000-0000-0000-0000-000000000004','2026-09-28T12:00:00Z','2026-10-05T12:00:00Z'),
  -- Granite North is §3.4's Done row: off the job, row retained (G-10), and
  -- deliberately left carrying company_name as TEXT with no card pointer, the
  -- pre-redesign shape the room is fixing.
  ('d0e30000-0000-0000-0000-000000000092','d0e00000-0000-0000-0000-00000000000a','vendor','Granite North','Granite North',
   'office@granite-north.com','(612) 555-0220',NULL,
   NULL,NULL,'off_job',NULL,NULL,NULL,'studio',false,'2026-10-02','Slab program went to Stonehaven.','a0000000-0000-0000-0000-000000000004','2026-08-20T12:00:00Z','2026-10-02T12:00:00Z')
ON CONFLICT (id) DO UPDATE
  SET stage = EXCLUDED.stage,
      on_site_from = EXCLUDED.on_site_from,
      on_site_to = EXCLUDED.on_site_to,
      site_access_mode = EXCLUDED.site_access_mode,
      contracted_through = EXCLUDED.contracted_through,
      company_id = EXCLUDED.company_id,
      off_job_at = EXCLUDED.off_job_at,
      off_job_reason = EXCLUDED.off_job_reason;

-- ═══════════════════════════════════════════════════════════════════════════
-- The closed Lindqvist kitchen (fixture §4). Warranty ran to 2026-11-21, so
-- every seat is `warranty` — 00624's backfill only touches rows it finds at
-- the column default, and a seed states its own stages.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, company_name, email, phone, trade,
   studio_contact_id, company_id, stage, on_site_from, on_site_to,
   warranty_until, warranty_contact_person_id, site_access_mode,
   contracted_through, show_to_client, created_by, created_at, updated_at)
VALUES
  ('d0e40000-0000-0000-0000-000000000001','d0e00000-0000-0000-0000-00000000000b','client','Karin Lindqvist','Lindqvist household','karin@lindqvist-household.com','(612) 555-0190',NULL,
   NULL,NULL,'warranty',NULL,NULL,'2026-11-21',NULL,'open','owner',true,'a0000000-0000-0000-0000-000000000004','2025-03-14T12:00:00Z','2025-11-21T12:00:00Z'),
  ('d0e40000-0000-0000-0000-000000000028','d0e00000-0000-0000-0000-00000000000b','gc','Ben Ostrom','Ostrom Builders','ben@ostrom-builders.com','(612) 555-0128',NULL,
   'd0e10000-0000-0000-0000-000000000028','d0e20000-0000-0000-0000-000000000021','warranty','2025-05-05','2025-10-15','2026-11-21','d0e10000-0000-0000-0000-000000000028','open','studio',true,'a0000000-0000-0000-0000-000000000004','2025-03-14T12:00:00Z','2025-11-21T12:00:00Z'),
  -- F-28: Erin Sato's SECOND SEAT, on the warranty file. One identity, two
  -- seats, two jobs — the whole reason people_directory_seats exists.
  ('d0e40000-0000-0000-0000-000000000008','d0e00000-0000-0000-0000-00000000000b','gc','Erin Sato','Marrow & Sons','erin@marrow-and-sons.com','(612) 555-0108',NULL,
   'd0e10000-0000-0000-0000-000000000008','d0e20000-0000-0000-0000-000000000001','warranty','2025-05-05','2025-10-15','2026-11-21',NULL,'open','studio',false,'a0000000-0000-0000-0000-000000000004','2025-05-05T12:00:00Z','2025-11-21T12:00:00Z'),
  ('d0e40000-0000-0000-0000-000000000011','d0e00000-0000-0000-0000-00000000000b','sub','Dana Kowalski','Northgate Electric','dana@northgate-electric.com','(612) 555-0111','electrical',
   'd0e10000-0000-0000-0000-000000000011','d0e20000-0000-0000-0000-000000000003','warranty','2025-05-05','2025-10-15','2026-11-21','d0e10000-0000-0000-0000-000000000011','escorted','studio',false,'a0000000-0000-0000-0000-000000000004','2025-04-20T12:00:00Z','2025-11-21T12:00:00Z'),
  ('d0e40000-0000-0000-0000-000000000012','d0e00000-0000-0000-0000-00000000000b','sub','Pete Rusk','Rusk Mechanical',NULL,'(612) 555-0112','plumbing',
   'd0e10000-0000-0000-0000-000000000012','d0e20000-0000-0000-0000-000000000004','warranty','2025-05-05','2025-10-15','2026-11-21','d0e10000-0000-0000-0000-000000000012','escorted','studio',false,'a0000000-0000-0000-0000-000000000004','2025-04-20T12:00:00Z','2025-12-03T12:00:00Z'),
  ('d0e40000-0000-0000-0000-000000000013','d0e00000-0000-0000-0000-00000000000b','sub','Ingrid Halvorsen','Halvorsen Cabinet Works','ingrid@halvorsen-cabinet-works.com','(612) 555-0113','cabinetry',
   'd0e10000-0000-0000-0000-000000000013','d0e20000-0000-0000-0000-000000000005','warranty','2025-06-01','2025-09-30','2026-11-21',NULL,'escorted','studio',false,'a0000000-0000-0000-0000-000000000004','2025-04-20T12:00:00Z','2025-11-21T12:00:00Z'),
  ('d0e40000-0000-0000-0000-000000000020','d0e00000-0000-0000-0000-00000000000b','vendor','Claire Bissett','Stonehaven Tile Gallery','claire@stonehaven-tile-gallery.com','(612) 555-0120',NULL,
   'd0e10000-0000-0000-0000-000000000020','d0e20000-0000-0000-0000-000000000011','warranty',NULL,NULL,'2026-11-21',NULL,NULL,'studio',false,'a0000000-0000-0000-0000-000000000004','2025-04-20T12:00:00Z','2025-11-21T12:00:00Z')
ON CONFLICT (id) DO UPDATE
  SET stage = EXCLUDED.stage,
      on_site_from = EXCLUDED.on_site_from,
      on_site_to = EXCLUDED.on_site_to,
      warranty_until = EXCLUDED.warranty_until,
      company_id = EXCLUDED.company_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- Authority (E12). The fixture's plain sentences, written down at last:
-- "Adaeze decides finishes, Chidi signs money over $2,500" (G-15). The money
-- and draw_certify grants are the two PR-n narrows to an owner or admin; the
-- seed writes as postgres, so the policy is exercised by the SQL test, not
-- here.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.project_party_authority
  (id, engagement_id, scope, threshold_cents, prepares_only, copy_to,
   source_clause, granted_by, effective_from)
VALUES
  -- F-05 Chidi signs money. $2,500 = 250000 integer cents.
  ('d0e60000-0000-0000-0000-000000000001','d0e30000-0000-0000-0000-000000000005','money',250000,false,
   '{d0e30000-0000-0000-0000-000000000004}','Owner agreement, Exhibit B §4.2',
   'a0000000-0000-0000-0000-000000000004','2026-08-01'),
  ('d0e60000-0000-0000-0000-000000000002','d0e30000-0000-0000-0000-000000000005','change_order',250000,false,
   '{d0e30000-0000-0000-0000-000000000004}','Owner agreement, Exhibit B §4.2',
   'a0000000-0000-0000-0000-000000000004','2026-08-01'),
  ('d0e60000-0000-0000-0000-000000000003','d0e30000-0000-0000-0000-000000000005','draw_certify',NULL,false,
   '{}','Construction loan agreement §7.1','a0000000-0000-0000-0000-000000000004','2026-08-01'),
  -- F-04 Adaeze decides finishes.
  ('d0e60000-0000-0000-0000-000000000004','d0e30000-0000-0000-0000-000000000004','selections',NULL,false,
   '{d0e30000-0000-0000-0000-000000000005}','Owner agreement, Exhibit B §4.1',
   'a0000000-0000-0000-0000-000000000004','2026-08-01'),
  -- F-06 Ngozi holds a key. No money.
  ('d0e60000-0000-0000-0000-000000000005','d0e30000-0000-0000-0000-000000000006','key',NULL,false,
   '{}','Recorded at the site kickoff, 10 Oct 2026','a0000000-0000-0000-0000-000000000004','2026-10-10'),
  -- F-07 Tom Marrow pays his subs and prices the cost side.
  ('d0e60000-0000-0000-0000-000000000006','d0e30000-0000-0000-0000-000000000007','money',NULL,false,
   '{}','Construction contract §5','a0000000-0000-0000-0000-000000000004','2026-08-14'),
  ('d0e60000-0000-0000-0000-000000000007','d0e30000-0000-0000-0000-000000000007','change_order',NULL,false,
   '{}','Construction contract §9','a0000000-0000-0000-0000-000000000004','2026-08-14'),
  -- F-08 Erin PREPARES the change order; she does not sign it (CS3-4).
  ('d0e60000-0000-0000-0000-000000000008','d0e30000-0000-0000-0000-000000000008','change_order',NULL,true,
   '{d0e30000-0000-0000-0000-000000000007}','Construction contract §9',
   'a0000000-0000-0000-0000-000000000004','2026-08-14'),
  -- F-09 Luis controls site access.
  ('d0e60000-0000-0000-0000-000000000009','d0e30000-0000-0000-0000-000000000009','site_access',NULL,false,
   '{}','Construction contract §12','a0000000-0000-0000-0000-000000000004','2026-08-14'),
  -- F-10 Sam Rowe rules on design conformance, with no money.
  ('d0e60000-0000-0000-0000-00000000000a','d0e30000-0000-0000-0000-000000000010','change_order',NULL,false,
   '{}','Architect agreement, Exhibit A','a0000000-0000-0000-0000-000000000004','2026-08-01'),
  -- F-26 Carol releases the draw.
  ('d0e60000-0000-0000-0000-00000000000b','d0e30000-0000-0000-0000-000000000026','draw_certify',NULL,false,
   '{d0e30000-0000-0000-0000-000000000005}','Construction loan agreement §7.2',
   'a0000000-0000-0000-0000-000000000004','2026-10-12')
ON CONFLICT (id) DO UPDATE
  SET threshold_cents = EXCLUDED.threshold_cents,
      prepares_only   = EXCLUDED.prepares_only,
      copy_to         = EXCLUDED.copy_to,
      source_clause   = EXCLUDED.source_clause;

-- ═══════════════════════════════════════════════════════════════════════════
-- The site access card (E15). PR-r: the lockbox VERSION, never the code. There
-- is no gate_code column to put one in, and the card's own words say where the
-- code is held and who to ask.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.project_site_access_cards
  (id, project_id, lockbox_version, alarm_ref, key_holder_engagement_id,
   site_hours, site_notes, emergency_lines, receiver_instructions,
   changed_at, changed_by, told_refs, created_by, created_at)
VALUES
  ('d0e70000-0000-0000-0000-000000000001','d0e00000-0000-0000-0000-00000000000a',
   'Lockbox, version 3',
   'Sentry Alarm, account 88-4412',
   'd0e30000-0000-0000-0000-000000000006',
   'Weekdays 07:00 to 17:00. No Saturday work before 09:00.',
   'Dog in the rear yard on weekdays. Park on Fremont; stage in the detached garage.',
   '[{"label":"Superintendent","name":"Luis Ochoa","phone":"+16125550109"},
     {"label":"Owner","name":"Chidi Okonkwo","phone":"+16125550105"},
     {"label":"Architect","name":"Sam Rowe","phone":"+16125550110"},
     {"label":"Gas emergency","name":"CenterPoint Energy","phone":"+18002962261"},
     {"label":"Utility locate","name":"Gopher State One Call","phone":"+18002521166"},
     {"label":"Alarm company","name":"Sentry Alarm","phone":"+16125550777"}]'::jsonb,
   'Ngozi Eze receives deliveries, 09:00 to 15:00. Stage in the detached garage.',
   '2026-10-16T14:00:00Z','a0000000-0000-0000-0000-000000000004',
   '{d0e30000-0000-0000-0000-000000000009,d0e30000-0000-0000-0000-000000000006,d0e30000-0000-0000-0000-000000000018,d0e30000-0000-0000-0000-000000000011}',
   'a0000000-0000-0000-0000-000000000004','2026-10-12T12:00:00Z')
ON CONFLICT (project_id) DO UPDATE
  SET lockbox_version = EXCLUDED.lockbox_version,
      alarm_ref = EXCLUDED.alarm_ref,
      key_holder_engagement_id = EXCLUDED.key_holder_engagement_id,
      site_hours = EXCLUDED.site_hours,
      site_notes = EXCLUDED.site_notes,
      emergency_lines = EXCLUDED.emergency_lines,
      receiver_instructions = EXCLUDED.receiver_instructions,
      changed_at = EXCLUDED.changed_at,
      told_refs = EXCLUDED.told_refs;

-- ═══════════════════════════════════════════════════════════════════════════
-- Field links, minted through the RPC so the expiry is the one PR-d ruled.
-- Erin Sato's Okonkwo window closes 2027-08-13, so her link ends 2027-08-14 —
-- not 90 days from today. Her LINDQVIST seat carries warranty_until
-- 2026-11-21 with an on_site_to of 2025-10-15, so the later of the two wins
-- (PR-l) and that link ends 2026-11-22.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_party uuid;
BEGIN
  FOREACH v_party IN ARRAY ARRAY[
    'd0e30000-0000-0000-0000-000000000008'::uuid,  -- F-08 Erin, Okonkwo
    'd0e30000-0000-0000-0000-000000000009'::uuid,  -- F-09 Luis, Okonkwo
    'd0e30000-0000-0000-0000-000000000011'::uuid,  -- F-11 Dana, Okonkwo
    'd0e30000-0000-0000-0000-000000000018'::uuid,  -- F-18 Joe, Okonkwo
    'd0e30000-0000-0000-0000-000000000006'::uuid,  -- F-06 Ngozi, Okonkwo
    'd0e40000-0000-0000-0000-000000000008'::uuid   -- F-28 Erin's second seat
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.field_link_tokens f
       WHERE f.party_id = v_party AND f.status = 'active'
    ) THEN
      PERFORM public.create_field_link(v_party);
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Saved twice, one vendor (fixture §4, bring-forward question 4). Stonehaven
-- is a rolodex FIRM card here rather than a `vendors` row, so nothing is
-- duplicated — which is the answer the redesign gives that question.
-- ═══════════════════════════════════════════════════════════════════════════
