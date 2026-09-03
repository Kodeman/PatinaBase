-- ═══════════════════════════════════════════════════════════════════════════
-- 00560 — Owner's handoff note on the workspace invite (L8)
--
-- Adds one optional free-text column to public.organization_members: a line
-- an owner/admin can write on the invite modal ("A line for her first day"),
-- carried on the invited row, and rendered once as a margin note on the
-- new hire's Desk (`MarginNote noteKey="hire-handoff"`) — "— From {owner
-- first name}: {handoff_note}".
--
-- There is no `invitations` table — an invite IS an organization_members row
-- with status='invited' (workspace-member-invite/index.ts). handoff_note
-- therefore lives directly on organization_members, written at the same
-- upsert that already sets job_title/staff_role on invite (00416/call-sheet
-- pattern) and carried forward unchanged through invited -> active.
--
-- NO NEW RLS: the co-member SELECT policy "Active members can view
-- co-members" (00322, re-scoped TO authenticated on top of 00321's
-- is_active_org_member(organization_id) predicate) already exposes every
-- column of an active co-member's own organization_members row — including
-- this new one — to any other active member of the same organization. The
-- Desk only ever reads a signed-in member's OWN row's handoff_note, which
-- the existing own-row policy (00021) and the co-member policy both already
-- cover. No table is new, no policy needs to change.
--
-- ADDITIVE: one nullable column + a length guard. No GRANT/REVOKE (existing
-- table privileges already cover it) → no legacy-grants regen needed.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS handoff_note text
    CHECK (char_length(handoff_note) <= 280);
