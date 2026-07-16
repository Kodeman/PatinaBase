-- ═══════════════════════════════════════════════════════════════════════════
-- 00328 — Arrival Arc linkage backfill (data-only, idempotent)
--
-- Program: Arrival Arc (Wave 1). Rulings: DECISIONS.md R106 + I62–I66.
--
-- Repairs the relationship spine that 00327's document_state v11 now reads, for
-- rows that predate the linkage columns. Every statement is guarded by an
-- IS NULL / status precondition so this migration is safe to re-run and safe on
-- an empty local database (each UPDATE simply matches zero rows).
--
-- No schema change, no grants — data only. Additive in spirit (D7): it only
-- fills columns that were NULL; it never overwrites a value a human already set.
-- ═══════════════════════════════════════════════════════════════════════════

-- (1) Backfill projects.client_id from the activating proposal.
-- A project minted before the client leg was carried can be missing client_id;
-- its proposal (project_id back-link) holds the truth. Only touch NULL rows.
update projects p
   set client_id = pr.client_id
  from proposals pr
 where p.client_id is null
   and pr.project_id = p.id
   and pr.client_id is not null;

-- (2) Backfill designer_clients.lead_id from the accepted lead for the pair.
-- The accept flow links the relationship to the lead going forward; older
-- relationships have lead_id NULL. Match on the (designer, homeowner) pair for
-- accepted leads only. GUARD: dc.client_id IS NOT NULL — otherwise the join key
-- `l.homeowner_id = dc.client_id` would be NULL = NULL (never true) and, worse,
-- a NULL client_id must never be used as a homeowner match key. No-login
-- households (client_id NULL) are intentionally left unlinked here.
update designer_clients dc
   set lead_id = l.id
  from leads l
 where dc.lead_id is null
   and l.designer_id = dc.designer_id
   and l.homeowner_id = dc.client_id
   and dc.client_id is not null
   and l.status = 'accepted';

-- (3) Hand-verified Elena repair (I62). Elena is a no-login household: the
-- proposal and the designer_clients row both carry client_id NULL, so the
-- automatic pair-based backfill in (2) cannot reach her. Link the exact rows
-- by id (verified during Phase-0 audit). Guarded by IS NULL so a re-run is a
-- no-op, and safe on local (the proposal id does not exist there → 0 rows).
update proposals
   set designer_client_id = '5eed0104-2026-4707-8104-000000000104'
 where id = 'f9970369-b7da-4c03-9892-386e6a82d37e'
   and designer_client_id is null;

-- ── Deliberately NOT repaired ───────────────────────────────────────────────
-- The two prod orphan projects 5eed0005 / 5eed0006 are NOT repaired here. Their
-- client linkage is unrecoverable from data alone (no activating proposal
-- carries a client_id, no accepted lead matches the pair) — repairing them
-- requires manual designer input, which is owed to Kody. Leaving them NULL is
-- correct: document_state degrades them to the 'Client' / 'New client' literal
-- rather than mislabeling them. (DECISIONS.md I62.)
-- ═══════════════════════════════════════════════════════════════════════════
