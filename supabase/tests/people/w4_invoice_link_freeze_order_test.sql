-- ═══════════════════════════════════════════════════════════════════════════
-- W4 (P3) — 00636 §2's STATEMENT ORDER, replayed on a table that has rows
--
-- Migration under test: 00636 §2 ("The columns, the backfill, and the
-- freeze"), specifically the order of these three statements:
--
--     ALTER TABLE ... ALTER COLUMN token DROP NOT NULL;   -- widen
--     ALTER TABLE ... DROP CONSTRAINT chk_invoice_links_token;
--     UPDATE ... SET token = NULL WHERE token IS NOT NULL; -- then empty
--
-- The defect this guards (W4 r6 BLOCKING-1, ruling R-BX): the UPDATE stood
-- ABOVE the two ALTERs. 00574:73 declares `token text NOT NULL`, so on any
-- database HOLDING invoice_links rows that UPDATE raises 23514, the migration
-- transaction rolls back, and 00636/00637/00638 never land. Strata holds one
-- row per issued invoice; a local box holds none at that moment, because
-- `supabase db reset` replays migrations BEFORE seeds — so the UPDATE touches
-- 0 rows and every re-run of the gate is green. A green reset is exactly what
-- this defect produces, which is why the check cannot be a check of the
-- post-migration schema.
--
-- So this file does not read the real table at all. It builds a PROBE table
-- with the pre-00636 shape, puts ONE row in it, and replays §2 both ways: the
-- shipped order must land, and the old order must raise. The negative control
-- is what proves the positive assertion can fail.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/people/w4_invoice_link_freeze_order_test.sql
--
-- One transaction, ROLLBACKed. Touches nothing outside pg_temp.
--
-- If 00636 §2 changes, change the replay below with it: this file mirrors
-- those statements by hand, because a migration cannot be re-run on a box
-- where it has already been applied.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ─── the probe: invoice_links as 00574 left it, with a row in it ───────────
-- Shape-identical in the columns §2 touches — the NOT NULL token, the
-- 64-hex CHECK, the unique index on the plaintext — plus the two columns the
-- statements read (status, revoked_at, created_at) so the expiry backfill is
-- the real one rather than a simplified stand-in.
CREATE TEMP TABLE probe_invoice_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  CONSTRAINT probe_chk_token CHECK (token ~ '^[0-9a-f]{64}$')
) ON COMMIT DROP;
CREATE UNIQUE INDEX probe_uniq_invoice_links_token ON probe_invoice_links(token);

CREATE OR REPLACE FUNCTION pg_temp.seed_probe_link()
RETURNS VOID AS $$
BEGIN
  DELETE FROM probe_invoice_links;
  INSERT INTO probe_invoice_links (token, status)
  VALUES (encode(extensions.gen_random_bytes(32), 'hex'), 'active');
END;
$$ LANGUAGE plpgsql;

-- ─── 1. The order 00636 §2 ships: widen, then empty ───────────────────────
DO $$
DECLARE
  v_rows int;
BEGIN
  PERFORM pg_temp.seed_probe_link();
  SELECT count(*) INTO v_rows FROM probe_invoice_links;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: the probe must hold a row, or this file proves nothing (held %)', v_rows;
  END IF;

  BEGIN
    -- §2, statement for statement.
    ALTER TABLE probe_invoice_links
      ADD COLUMN IF NOT EXISTS token_hash text,
      ADD COLUMN IF NOT EXISTS expires_at timestamptz;

    UPDATE probe_invoice_links
       SET token_hash = public.invoice_link_token_hash(token)
     WHERE token_hash IS NULL
       AND token IS NOT NULL;

    UPDATE probe_invoice_links
       SET expires_at = CASE
             WHEN status = 'active' THEN now() + interval '30 days'
             ELSE COALESCE(revoked_at, created_at)
           END
     WHERE expires_at IS NULL;

    ALTER TABLE probe_invoice_links ALTER COLUMN token DROP NOT NULL;
    ALTER TABLE probe_invoice_links DROP CONSTRAINT probe_chk_token;

    UPDATE probe_invoice_links SET token = NULL WHERE token IS NOT NULL;

    ALTER TABLE probe_invoice_links
      ADD CONSTRAINT probe_chk_token_frozen CHECK (token IS NULL);
    ALTER TABLE probe_invoice_links
      ADD CONSTRAINT probe_chk_token_hash CHECK (token_hash ~ '^[0-9a-f]{64}$');
    ALTER TABLE probe_invoice_links ALTER COLUMN token_hash SET NOT NULL;
    DROP INDEX probe_uniq_invoice_links_token;
    CREATE UNIQUE INDEX probe_uniq_invoice_links_token_hash
      ON probe_invoice_links(token_hash);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: 00636 §2 must survive a populated table — % (%)', SQLERRM, SQLSTATE;
  END;

  IF EXISTS (SELECT 1 FROM probe_invoice_links WHERE token IS NOT NULL) THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: the freeze must actually empty the plaintext column';
  END IF;
  IF EXISTS (SELECT 1 FROM probe_invoice_links WHERE token_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: the hash the resolvers look up must be written before the plaintext goes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM probe_invoice_links WHERE expires_at > now() + interval '29 days') THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: a live link must keep its 30 days from the migration';
  END IF;

  RAISE NOTICE '1. 00636 §2 in shipped order lands on a populated table, hash and clock intact: passed';
END $$;

-- ─── 2. The negative control: the order that shipped to review ─────────────
-- Empty the column while it is still NOT NULL. If this does NOT raise, block 1
-- proves nothing — the assertion would pass whatever order the migration used.
DO $$
DECLARE
  v_old_order_landed boolean := false;
BEGIN
  DROP TABLE IF EXISTS probe_invoice_links_old;
  CREATE TEMP TABLE probe_invoice_links_old (
    id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token  text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    CONSTRAINT probe_old_chk_token CHECK (token ~ '^[0-9a-f]{64}$')
  ) ON COMMIT DROP;
  INSERT INTO probe_invoice_links_old (token)
  VALUES (encode(extensions.gen_random_bytes(32), 'hex'));

  BEGIN
    UPDATE probe_invoice_links_old SET token = NULL WHERE token IS NOT NULL;
    ALTER TABLE probe_invoice_links_old ALTER COLUMN token DROP NOT NULL;
    ALTER TABLE probe_invoice_links_old DROP CONSTRAINT probe_old_chk_token;
    v_old_order_landed := true;
  EXCEPTION WHEN not_null_violation THEN
    -- 23502 on the UPDATE: the failure Strata would have taken. (A CHECK
    -- evaluating to NULL passes, so chk_invoice_links_token is not what
    -- raises here — the column's own NOT NULL is.)
    NULL;
  END;

  IF v_old_order_landed THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL: nulling token under NOT NULL must raise — without this, block 1 cannot fail';
  END IF;

  RAISE NOTICE '2. the reviewed order still raises on a row, so block 1 is a real gate: passed';
END $$;

DO $$ BEGIN RAISE NOTICE 'W4 invoice-link freeze-order suite: all blocks passed'; END $$;

ROLLBACK;
