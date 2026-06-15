-- ─────────────────────────────────────────────────────────────────────────────
-- The Document · Decision Composer (R55–R56) — local walk seed
--
-- A walkable project needs BOTH a client (so the margin "+ New" composer can
-- resolve designer_clients.id — the FK every client_decisions INSERT needs) AND
-- FF&E lines (so a blocking selection has a line to gate and light). Olsen Lake
-- House (designer@patina.dev) already carries 3 FF&E lines but no client; this
-- wires it to client@patina.dev (Leah's existing designer_clients row
-- a0bcbfc1-…), so the composer resolves and the create→publish→light→resolve
-- milestone is walkable end to end. Idempotent; LOCAL-DEV DEMO AID only.
-- ─────────────────────────────────────────────────────────────────────────────

update public.projects
   set client_id = 'a0000000-0000-0000-0000-000000000005'  -- client@patina.dev
 where id = 'b65803e7-53ec-4a64-a37c-0f824c921888'          -- Olsen Lake House
   and client_id is null;

-- Start the walk from a clean FF&E gate state (no stale blocks/links).
update public.project_ffe_items
   set blocked = false, blocked_by_decision_id = null
 where project_id = 'b65803e7-53ec-4a64-a37c-0f824c921888';
