-- ═══════════════════════════════════════════════════════════════════════════
-- 00220 — coordination notifications coverage (Track 5)  ·  NO-OP / DOCUMENTATION
--
-- Intent: confirm the existing decision notify + overdue path already covers the
-- new coordination kinds, and document WHY this migration adds no schema.
--
-- AUDIT (00173 + 00174 read in full before writing this):
--
--   · notify_decision_required / notify_decision_overdue / notify_decision_resolved
--     / notify_decision_updated (00173/00174) all operate on client_decisions by
--     id, joining designer_clients to address the CLIENT (required/overdue/updated)
--     or the DESIGNER (resolved). NONE of them filter on coordination_kind,
--     decision_kind, or decision_type — so every Track-5 item (selection, rfi,
--     submittal, signoff, punch) is already a first-class citizen of the notify
--     RPCs the moment it exists as a client_decisions row. No new kind is needed.
--
--   · The overdue cron (00174 (b)) re-points expire-decisions-daily at the
--     expire-decisions edge function, which fires decision_overdue for EVERY
--     lapsed-but-pending client_decisions row (then expires past the grace). It,
--     too, is coordination-kind agnostic — it scans pending decisions by due_date,
--     so an overdue RFI / Submittal / Sign-off / Punch is reminded exactly like an
--     overdue Selection. No new cron source is required.
--
--   · The resolved-email trigger (00174 (a)) fires on the pending→responded edge
--     for ANY client_decisions row. resolve_coordination_item (00218) drives every
--     coordination resolve through that same edge (status → 'responded'), so the
--     designer's resolved email + in-app row fire for coordination resolves too,
--     with no addition here.
--
-- WHY NO ADDITIVE SCHEMA:
--   The recipient model in v1 is correct as-is. GC / vendor courts are TRACKED,
--   LOGIN-LESS parties (R46) — the designer records their moves — so the
--   notification recipients that matter are exactly the two the existing path
--   already addresses: the client (when the ball is in their court) and the
--   designer (when an item resolves or needs her hand). A party with no login has
--   no notification inbox to write to. The day a party gains a login
--   (project_parties.profile_id set), routing a court-specific nudge to that
--   profile is a v2 concern (a new addressee in notify_decision_*), not a schema
--   change — and it rides the same decision_notifications table + partial unique
--   idempotency index already in place.
--
-- The "keep it moving" acts (nudge / extend / reassign — slice G) reuse the
-- existing reminder machinery: a nudge calls the decision-reminders path
-- (in-app + email, idempotent); an extend writes due_date (the overdue cron
-- naturally re-arms); a reassign writes court / court_party_id (a domain write,
-- not a notification kind). All are covered by 00173/00174 + 00213's columns.
--
-- CONCLUSION: this migration is an intentional NO-OP. It exists to (a) keep the
-- Track-5 migration set contiguous (00212–00220) and (b) record the coverage
-- proof above so a future reader does not "fix" a non-gap by forking a parallel
-- coordination_notifications table. Additive by definition (D7): it changes
-- nothing.
--
-- (If a later ruling DOES require coordination-specific notification kinds, add
--  them HERE additively — `ALTER TYPE decision_notification_kind ADD VALUE IF NOT
--  EXISTS …` + new SECURITY DEFINER notify_* RPCs mirroring 00174 — without
--  touching the existing kinds or the partial unique index.)
-- ═══════════════════════════════════════════════════════════════════════════

-- Intentionally no DDL. The existing decision notification + overdue-cron path
-- (00173/00174) already covers every coordination_kind. See the header for the
-- coverage proof.

DO $$
BEGIN
  RAISE NOTICE
    '00220: coordination notifications are covered by the existing decision '
    'notify/overdue path (00173/00174) — no additive schema. See header.';
END $$;
