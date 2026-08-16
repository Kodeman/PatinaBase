-- ═══════════════════════════════════════════════════════════════════════════
-- 00488 — Canonical studio authority: storage platform-admin rollback
--
-- This is phase one of the focused rollback.  It restores the exact nine
-- reserved-owner source policies and the narrow 00488 compatibility helpers
-- required by them.  The ordinary rollback must run second; it restores the
-- wider reviewed source helper bodies and removes canonical-only identities.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL standard_conforming_strings = on;
SET LOCAL quote_all_identifiers = off;

-- Exact source-or-final storage policy, helper profile/ACL, final snapshot
-- schema, and caller-state proof before the first persistent mutation.
-- @@GENERATED_STORAGE_ROLLBACK_PREFLIGHT@@

-- Platform execution can have a non-postgres current role.  Recreate these
-- public identities as postgres so owner and ACL grantor remain exact.
SET LOCAL ROLE postgres;

-- @@GENERATED_FINAL_COMPATIBILITY_HELPERS@@

-- @@GENERATED_FINAL_COMPATIBILITY_DCL@@

RESET ROLE;

-- @@GENERATED_SOURCE_STORAGE_POLICIES@@

-- Exact source storage fingerprints, compatibility helper profiles/ACLs, and
-- reverse-caller proof.  Canonical helpers intentionally remain until phase
-- two removes every ordinary caller.
-- @@GENERATED_STORAGE_ROLLBACK_POSTFLIGHT@@

COMMIT;
