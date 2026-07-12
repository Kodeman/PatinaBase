-- ============================================================================
-- Agent OS — Mission Control dev seed (WP-1.1 Approval Inbox)
-- ============================================================================
--
-- Deterministic rows (id prefix 5eed0000-…) covering every Approval-Inbox
-- surface: all evidence-pack branches, all three confidence bands + a null,
-- both assignees (3 vendor_qualification cards for Leah with full leah_card
-- payloads), a backdated + flagged-stale row, a rejected row with feedback, a
-- parent/child lineage pair, and two job:* rows for the future Run Log (W1.D).
-- Statuses spread across queued / running / awaiting_review / done / failed.
--
-- Seeds run as superuser, so a direct INSERT of any status is fine — the
-- state-machine trigger enforce_agent_task_transition() is UPDATE-only. The
-- audit trigger fires on these INSERTs, so each row also lands an
-- agent_task_audit entry. Idempotent via ON CONFLICT (id) DO NOTHING. Marker:
-- source/id prefix 5eed0000 → cleanup: DELETE FROM agent_tasks WHERE id::text LIKE '5eed0000-%';
-- ============================================================================

-- ─── Batch A: everything except the child (which references the parent) ──────
INSERT INTO public.agent_tasks (
  id, task_type, status, priority, source, assignee, summary,
  payload, artifacts, confidence, review_state,
  created_at, awaiting_review_at, flagged_stale_at, completed_at,
  last_error, locked_by, locked_at, started_at, parent_task_id, attempts, max_attempts
) VALUES

-- 1 · data-change · awaiting · kody · HIGH (0.92 → sage)
('5eed0000-0000-0000-0000-000000000001','catalog_data_change','awaiting_review',2,'job:catalog','kody',
 'Normalize spec — Nordic Atelier · Fjord Lounge Chair',
 jsonb_build_object(
   'before', jsonb_build_object('width_in','30','depth_in','32','material','oak','price_cents',248000,'lead_time_weeks',10),
   'after',  jsonb_build_object('width_in','30','depth_in','34','material','white oak','price_cents',248000,'lead_time_weeks',12)
 ),
 '{}'::jsonb, 0.92, NULL,
 now() - interval '2 hours', now() - interval '2 hours', NULL, NULL,
 NULL, NULL, NULL, NULL, NULL, 1, 5),

-- 2 · vendor_qualification · awaiting · LEAH · HIGH (0.88 → sage) · full leah_card
('5eed0000-0000-0000-0000-000000000002','vendor_qualification','awaiting_review',2,'cowork:scout','leah',
 'Brand review — Aldercrest Woodworks',
 jsonb_build_object(
   'leah_card', jsonb_build_object(
     'images', jsonb_build_array('https://placehold.co/400x400/8B7355/FFF?text=1','https://placehold.co/400x400/C4A57B/FFF?text=2','https://placehold.co/400x400/5C4A3C/FFF?text=3'),
     'evidence', jsonb_build_array('Hand-joined white oak, no visible fasteners','Small-batch — 40 pieces/quarter','Finishes cured 21 days before ship'),
     'maker_story', 'A father-daughter shop in rural Vermont, milling storm-felled oak.'
   ),
   'sources', jsonb_build_array(
     jsonb_build_object('title','Aldercrest — About','url','https://example.com/aldercrest/about'),
     jsonb_build_object('title','Trade terms sheet','url','https://example.com/aldercrest/trade')
   ),
   'body_excerpt', 'Aldercrest qualifies on craft depth and trade readiness; brand fit pending Leah score.'
 ),
 '{}'::jsonb, 0.88, NULL,
 now() - interval '5 hours', now() - interval '5 hours', NULL, NULL,
 NULL, NULL, NULL, NULL, NULL, 1, 5),

-- 3 · vendor_qualification · awaiting · LEAH · MEDIUM (0.74 → clay) · full leah_card
('5eed0000-0000-0000-0000-000000000003','vendor_qualification','awaiting_review',3,'cowork:scout','leah',
 'Brand review — Meridian Ceramics',
 jsonb_build_object(
   'leah_card', jsonb_build_object(
     'images', jsonb_build_array('https://placehold.co/400x400/A8B5A0/FFF?text=1','https://placehold.co/400x400/8B9CAD/FFF?text=2','https://placehold.co/400x400/D4A090/FFF?text=3'),
     'evidence', jsonb_build_array('Wheel-thrown stoneware, reactive glazes','Lead times 8–10 weeks','Wholesale minimums align with our tiers'),
     'maker_story', 'A one-woman studio in Santa Fe firing a wood kiln twice a season.'
   ),
   'sources', jsonb_build_array(jsonb_build_object('title','Meridian lookbook','url','https://example.com/meridian')),
   'body_excerpt', 'Strong craft, mid confidence on consistency at volume.'
 ),
 '{}'::jsonb, 0.74, NULL,
 now() - interval '6 hours', now() - interval '6 hours', NULL, NULL,
 NULL, NULL, NULL, NULL, NULL, 1, 5),

-- 4 · vendor_qualification · awaiting · LEAH · LOW (0.55 → terracotta) · full leah_card
('5eed0000-0000-0000-0000-000000000004','vendor_qualification','awaiting_review',3,'cowork:scout','leah',
 'Brand review — Bright Harbor Textiles',
 jsonb_build_object(
   'leah_card', jsonb_build_object(
     'images', jsonb_build_array('https://placehold.co/400x400/E8C547/000?text=1','https://placehold.co/400x400/C77B6E/FFF?text=2','https://placehold.co/400x400/8B7355/FFF?text=3'),
     'evidence', jsonb_build_array('Machine-loomed, some hand finishing','Broad catalog, less curated','Pricing at the low end of our band'),
     'maker_story', 'A growing mill in North Carolina expanding into trade.'
   ),
   'sources', jsonb_build_array(jsonb_build_object('title','Bright Harbor site','url','https://example.com/brightharbor')),
   'body_excerpt', 'Volume-ready but brand fit uncertain; low confidence pending Leah.'
 ),
 '{}'::jsonb, 0.55, NULL,
 now() - interval '7 hours', now() - interval '7 hours', NULL, NULL,
 NULL, NULL, NULL, NULL, NULL, 1, 5),

-- 5 · designer_scout_dossier · awaiting · kody · NULL confidence (→ em-dash) · research
('5eed0000-0000-0000-0000-000000000005','designer_scout_dossier','awaiting_review',3,'cowork:scout','kody',
 'Scout dossier — Priya Anand, AD100 rising',
 jsonb_build_object(
   'sources', jsonb_build_array(
     jsonb_build_object('title','Studio site','url','https://example.com/priya-anand'),
     jsonb_build_object('title','Instagram','url','https://example.com/priya/ig'),
     jsonb_build_object('title','ELLE Decor feature','url','https://example.com/elle/priya')
   ),
   'body_excerpt', 'LA-based, 6-person studio, warm-modernist projects in the $2–5M range. Strong custom-furnishing appetite; no current maker network.'
 ),
 '{}'::jsonb, NULL, NULL,
 now() - interval '9 hours', now() - interval '9 hours', NULL, NULL,
 NULL, NULL, NULL, NULL, NULL, 1, 5),

-- 6 · pin_draft · awaiting · kody · MEDIUM (0.61 → clay) · draft
('5eed0000-0000-0000-0000-000000000006','pin_draft','awaiting_review',4,'cowork:studio','kody',
 'Pin draft — "The unfussy oak chair"',
 jsonb_build_object(
   'draft', E'The Fjord Lounge Chair, in white oak.\n\nNo visible fasteners. Cushions in undyed Belgian linen. Made 40 at a time in Vermont.\n\nSave this for the reading nook you keep sketching.',
   'target_board', 'Living Rooms'
 ),
 '{}'::jsonb, 0.61, NULL,
 now() - interval '3 hours', now() - interval '3 hours', NULL, NULL,
 NULL, NULL, NULL, NULL, NULL, 1, 5),

-- 7 · intake_error · awaiting · kody · NULL conf · parse_error + raw_header · P1
('5eed0000-0000-0000-0000-000000000007','intake_error','awaiting_review',1,'bridge:m365','kody',
 'Intake error — malformed header in Ops Inbox/vendor/',
 jsonb_build_object(
   'parse_error', 'Missing required header field: task_type (expected one of task_type/confidence/assignee/summary)',
   'raw_header', E'---\nconfidence: 0.7\nassignee: leah\nsummary: New maker — Coastal Forge\n---'
 ),
 '{}'::jsonb, NULL, NULL,
 now() - interval '1 hour', now() - interval '1 hour', NULL, NULL,
 'Header parse failed', NULL, NULL, NULL, NULL, 1, 5),

-- 8 · content · awaiting · kody · HIGH (0.90 → sage) · draft
('5eed0000-0000-0000-0000-000000000008','content','awaiting_review',4,'cowork:studio','kody',
 'Content draft — maker spotlight newsletter blurb',
 jsonb_build_object(
   'body', E'This month we met Aldercrest Woodworks, a father-daughter shop milling storm-felled oak into furniture that will outlive all of us.\n\nRead their story →',
   'channel', 'newsletter'
 ),
 '{}'::jsonb, 0.90, NULL,
 now() - interval '4 hours', now() - interval '4 hours', NULL, NULL,
 NULL, NULL, NULL, NULL, NULL, 1, 5),

-- 9 · default evidence · awaiting · kody · backdated 3d + FLAGGED STALE · MEDIUM (0.68 → clay)
('5eed0000-0000-0000-0000-000000000009','concierge_order_review','awaiting_review',2,'job:orders','kody',
 'Concierge order review — PO #10428 freight quote',
 jsonb_build_object(
   'po_number','10428','vendor','Nordic Atelier','freight_quote_cents',42000,'carrier','Sunbelt','note','Quote 18% over prior lane; confirm before booking.'
 ),
 '{}'::jsonb, 0.68, NULL,
 now() - interval '3 days', now() - interval '3 days', now() - interval '1 day', NULL,
 NULL, NULL, NULL, NULL, NULL, 1, 5),

-- 10 · rejected · kody · has review_state + payload.feedback
('5eed0000-0000-0000-0000-000000000010','vendor_qualification','rejected',3,'cowork:scout','kody',
 'Brand review — Fastline Furniture (rejected)',
 jsonb_build_object(
   'body_excerpt','Mass-market catalog, drop-ship model.',
   'feedback','Not a fit — contract/drop-ship maker, no craft story. Do not re-surface.'
 ),
 '{}'::jsonb, 0.40,
 jsonb_build_object('reviewer','admin@patina.dev','decision','rejected','note','Not a fit — contract/drop-ship maker, no craft story. Do not re-surface.','meta',NULL,'decided_at', now() - interval '1 day'),
 now() - interval '2 days', now() - interval '2 days', NULL, now() - interval '1 day',
 NULL, NULL, NULL, NULL, NULL, 1, 5),

-- 11 · PARENT · designer_scout_batch · done · kody
('5eed0000-0000-0000-0000-000000000011','designer_scout_batch','done',3,'job:scout','kody',
 'Scout batch — LA warm-modernist designers',
 jsonb_build_object('region','Los Angeles','query','warm modernist residential'),
 jsonb_build_object('dossiers_created', 4, 'cost_usd', 0.82, 'duration_ms', 41230),
 0.95, NULL,
 now() - interval '12 hours', NULL, NULL, now() - interval '11 hours',
 NULL, NULL, NULL, now() - interval '12 hours', NULL, 1, 5),

-- 13 · job:* FAILED with last_error (Run Log, W1.D) — exhausted-retries job WITH
--      prior groom lineage: payload.groom_requeued_at shows queue-groom already
--      requeued it once (~1 day ago) and it parked failed again, so groom will
--      NOT touch it again (keeps this row out of groom's eligible set and keeps
--      groom_test.sql's global-count assertions honest on a seeded dev DB).
('5eed0000-0000-0000-0000-000000000013','job:catalog_normalize','failed',3,'job:catalog',NULL,
 'Catalog normalize — Meridian feed',
 jsonb_build_object('feed_id','meridian-2026-07','rows', 214,
                    'groom_requeued_at', (now() - interval '1 day')::text),
 jsonb_build_object('rows_committed', 0),
 NULL, NULL,
 now() - interval '8 hours', NULL, NULL, now() - interval '7 hours',
 'Upstream feed 502 after 5 attempts', NULL, NULL, now() - interval '8 hours', NULL, 5, 5),

-- 14 · job:* DONE with artifacts {cost_usd, duration_ms} (Run Log, W1.D)
('5eed0000-0000-0000-0000-000000000014','job:morning_brief','done',3,'job:brief',NULL,
 'Morning brief — 2026-07-12',
 jsonb_build_object('brief_date','2026-07-12'),
 jsonb_build_object('cost_usd', 0.11, 'duration_ms', 8420, 'sections', 5),
 NULL, NULL,
 now() - interval '20 hours', NULL, NULL, now() - interval '20 hours',
 NULL, NULL, NULL, now() - interval '20 hours', NULL, 1, 5),

-- 15 · queued (not in inbox; exercises stats + queued status)
('5eed0000-0000-0000-0000-000000000015','vendor_qualification','queued',3,'cowork:scout',NULL,
 'Qualify — Coastal Forge (queued)',
 jsonb_build_object('vendor_name','Coastal Forge'),
 '{}'::jsonb, NULL, NULL,
 now() - interval '30 minutes', NULL, NULL, NULL,
 NULL, NULL, NULL, NULL, NULL, 0, 5),

-- 16 · running (locked by a worker; exercises running status)
('5eed0000-0000-0000-0000-000000000016','catalog_data_change','running',3,'job:catalog',NULL,
 'Normalize spec — Meridian · Wheel Bowl set',
 jsonb_build_object('before', jsonb_build_object('price_cents',9800), 'after', jsonb_build_object('price_cents',10400)),
 '{}'::jsonb, NULL, NULL,
 now() - interval '4 minutes', NULL, NULL, NULL,
 NULL, 'worker-catalog-1', now() - interval '4 minutes', now() - interval '4 minutes', NULL, 1, 5)

ON CONFLICT (id) DO NOTHING;

-- ─── Batch B: the child, referencing parent 5eed…011 ─────────────────────────
INSERT INTO public.agent_tasks (
  id, task_type, status, priority, source, assignee, summary,
  payload, artifacts, confidence, review_state,
  created_at, awaiting_review_at, flagged_stale_at, completed_at,
  last_error, locked_by, locked_at, started_at, parent_task_id, attempts, max_attempts
) VALUES
-- 12 · CHILD of 011 · designer_scout_dossier · awaiting · kody · MEDIUM (0.83 → clay)
('5eed0000-0000-0000-0000-000000000012','designer_scout_dossier','awaiting_review',3,'job:scout','kody',
 'Scout dossier — Marcus Reed (from LA batch)',
 jsonb_build_object(
   'sources', jsonb_build_array(
     jsonb_build_object('title','Studio site','url','https://example.com/marcus-reed'),
     jsonb_build_object('title','Dwell profile','url','https://example.com/dwell/marcus')
   ),
   'body_excerpt', 'Venice-based solo designer, warm minimalism, 3–4 residential projects/yr. High custom appetite.'
 ),
 '{}'::jsonb, 0.83, NULL,
 now() - interval '11 hours', now() - interval '11 hours', NULL, NULL,
 NULL, NULL, NULL, NULL, '5eed0000-0000-0000-0000-000000000011', 1, 5)
ON CONFLICT (id) DO NOTHING;
