-- ═══════════════════════════════════════════════════════════════════════════
-- 00228 — add_application_status_enum_values: complete the lifecycle vocab
--
-- 00071 created enum application_review_status AS ENUM
--   ('new','in_review','approved','rejected','archived')
-- but 00073/00074 then wrote CHECK constraints — and the admin portal drives
-- transitions — using 'pending','waitlisted','onboarding','active', which were
-- NEVER added to the enum. Result on the live DB:
--   • column default 'new' fails the 00074 CHECK (23514) → every marketing-site
--     application insert 500s,
--   • admin onboard/decision routes that set 'pending'/'onboarding'/'active'
--     fail with 22P02 (invalid enum value).
-- This migration adds the four missing values so the enum matches the CHECK and
-- the admin lifecycle. The default repoint + backfill is split into 00229
-- because a newly added enum value cannot be USED in the same transaction.
-- Idempotent (ADD VALUE IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE application_review_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE application_review_status ADD VALUE IF NOT EXISTS 'waitlisted';
ALTER TYPE application_review_status ADD VALUE IF NOT EXISTS 'onboarding';
ALTER TYPE application_review_status ADD VALUE IF NOT EXISTS 'active';
