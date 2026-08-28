# W2 · lane D — backend task list (00537 + 00538)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w2-d`, branch `daily-return/w2-d`,
base `e9da02569`. Owned set (steward.md §7): `supabase/migrations/00537_*.sql`, `00538_*.sql`,
`supabase/tests/**`, `packages/supabase/src/database.types.ts`, `supabase/functions/delete-account/**`.
Lane D owns the local database for this wave.

Format: exact files → the interface neighbours rely on → failing assertion → run (red) → implement →
run (green) → pathspec commit.

---

## Facts established before writing anything (all against the live local stack, at 00536)

| # | Fact | Evidence |
|---|---|---|
| F1 | `rooms.budget_cents` does not exist; `profiles.last_seen_at` does not exist | `information_schema.columns` |
| F2 | `saved_items` carries no unique index (`saved_items_pkey`, `idx_saved_items_user/_room/_product/_created` only); `product_id` is **nullable**; table is empty in the seed (0 rows) | `pg_indexes`, `information_schema.columns`, `count(*)` |
| F3 | The client-scoped `project_rooms` SELECT policy EXISTS and filters correctly both ways — steward.md §5c proved 2 of 2 visible as `client@patina.dev`, 0 for a manufacturer, 0 for anon. **00537 writes no `project_rooms` policy** (steward §5d, plan W2 R2 row, critique M4) | steward.md §5 |
| F4 | Client identity on designer-owned rows references **`profiles(id)`**, not `auth.users`: `proposals.client_id` (SET NULL), `projects.client_id` (NO ACTION), `invoices.client_id` (SET NULL), `designer_clients.client_id` (CASCADE), `comms_threads.created_by` (SET NULL). Only `client_decisions.{selected_by, answered_by, designer_id}` reference `auth.users(id)` | `pg_constraint` |
| F5 | `guard_proposal_copy_immutability` raises on ANY `client_id` / `designer_client_id` change to a non-draft proposal with **no GUC escape hatch at all** — unlike `guard_proposal_authority`, which accepts `app.proposal_identity_id` | `pg_get_functiondef` |
| F6 | `set_document_client(kind, target, client)` requires `auth.uid()` = the owning designer AND refuses a non-draft proposal. A service-role purge (no JWT subject) can never call it | 00387:1092-1213 |
| F7 | GoTrue's **soft** delete (`DELETE /auth/v1/admin/users/<id>` with `{"should_soft_delete":true}`) obfuscates `auth.users.email` and `.phone`, empties `raw_user_meta_data`, nulls `encrypted_password`, empties `auth.identities.identity_data` and hashes `provider_id`, drops every session, stamps `deleted_at` — **and leaves the `public.profiles` row in place** | spike run 2026-08-27, output in `d-notes.md` §1 |

F4+F5+F6+F7 together settle 00538's shape: see §Task 3.

---

## Task 1 — `00537_house_on_today.sql`

**Files**
- new `supabase/migrations/00537_house_on_today.sql`
- new `supabase/tests/rooms/house_on_today_test.sql`

**Interface neighbours rely on**
- R1/R2 (iOS): `rooms.budget_cents integer` NULL-able; `profiles.last_seen_at timestamptz` NULL-able.
- lane A's save path (W1b, already merged): `saved_items` upserts stay legal — the two new indexes must
  not reject a legitimate second save of a *different* product, or a save of the same product into a
  *different* room.
- `packages/supabase/src/database.types.ts` gains both columns (Task 5).

**Content**
1. `ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS budget_cents integer;` + `COMMENT ON COLUMN`.
2. `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;` + `COMMENT ON COLUMN`.
3. De-duplicate `saved_items`, keeping the **earliest** row per key (`created_at ASC, id ASC` so the
   ordering is total), one pass for the `room_id IS NULL` key and one for the `room_id IS NOT NULL` key.
4. `CREATE UNIQUE INDEX IF NOT EXISTS saved_items_user_product_unroomed_key ON public.saved_items (user_id, product_id) WHERE room_id IS NULL;`
5. `CREATE UNIQUE INDEX IF NOT EXISTS saved_items_user_product_room_key ON public.saved_items (user_id, product_id, room_id) WHERE room_id IS NOT NULL;`
6. **No `project_rooms` policy** (F3), stated in the banner so the next reader does not re-open it.
7. No GRANT/REVOKE anywhere in the file ⇒ `scripts/generate-legacy-grants.py` is NOT re-run (assert that
   by inspection: `grep -c 'GRANT\|REVOKE' 00537` = 0).

**Failing assertions first** (`house_on_today_test.sql`, repo style — `BEGIN; … DO $$ ASSERT … $$; ROLLBACK;`
— the repo has no real pgTAP; every file under `supabase/tests` is a plain psql assert script):
- `rooms.budget_cents` exists, is `integer`, is nullable, and carries a comment.
- `profiles.last_seen_at` exists, is `timestamptz`, is nullable, and carries a comment.
- a second `INSERT` of the same `(user_id, product_id)` with `room_id IS NULL` raises `unique_violation`.
- a second `INSERT` of the same `(user_id, product_id, room_id)` raises `unique_violation`.
- the same `(user_id, product_id)` in **two different rooms** is ALLOWED (the two indexes must not
  collapse SP-11's "put it in a room" into one row per product).
- an unroomed save AND a roomed save of the same product coexist (the two partial indexes are disjoint).
- a save with `product_id IS NULL` twice is ALLOWED (NULLs are distinct in a btree unique — stated so a
  later reader does not treat it as a bug).
- de-duplication kept the EARLIEST row: fixture three duplicates with known `created_at`, re-run the
  migration's de-dup statement, assert the survivor is the oldest id.

**Run red** → `psql "$PGURL" -v ON_ERROR_STOP=1 -f supabase/tests/rooms/house_on_today_test.sql` fails
on the missing column.
**Implement** the migration. **Apply** `supabase db reset` (unsandboxed; lane D owns the DB).
**Run green** → same command passes.

**Commit** (pathspec): `feat(db): 00537 — the house on Today (room budget, last seen, one save per piece)`
covering `supabase/migrations/00537_house_on_today.sql supabase/tests/rooms/house_on_today_test.sql`.

---

## Task 2 — spike: prove the erasure design before writing 00538  *(done; recorded here because the
result is what Task 3 rests on)*

Ruling 2 wants three things at once: (a) the client's `profiles` PII replaced by a tombstone,
(b) the auth user detached/deleted, (c) designer-owned rows still naming that tombstone rather than
losing the client. Under 00536 those are contradictory: `profiles.id REFERENCES auth.users(id) ON DELETE
CASCADE` (00013:12), so a **hard** auth delete takes the tombstone with it, which is exactly why 00536
had to NULL every client leg — and NULLing a non-draft proposal's `client_id` has no sanctioned path
(F5, F6), which is why it disabled five tables' triggers under ACCESS EXCLUSIVE.

The spike asked whether GoTrue's **soft** delete is the missing detach. It is (F7). With the profile row
surviving, (c) is true by construction — every designer-owned leg already points at `profiles(id)`, which
IS the tombstone (F4) — so 00538 writes **nothing** to `proposals`, `projects`, `invoices`,
`client_decisions` or `designer_clients`, no guard fires, no trigger is disabled, and the
maintenance-window hazard (review M-D5) is gone rather than mitigated.

Deviation from the brief's letter, recorded in `d-notes.md` §2 for Fable: the brief says "re-point client
identity on designer-owned rows … to the tombstone … use the sanctioned `set_document_client` path where
the guards demand it". No re-point is required, and the sanctioned path is unavailable to a service-role
caller in any case (F6). The outcome the ruling names is delivered; the write is not needed to deliver it.

---

## Task 3 — `00538_client_account_anonymize.sql`

**Files**
- new `supabase/migrations/00538_client_account_anonymize.sql`
- rewritten `supabase/tests/auth/account_purge_test.sql`

**Interface neighbours rely on**
- `public.purge_client_account(uuid) RETURNS uuid` — unchanged signature and return, so
  `delete-account`'s `purge()` gateway and `client_account_purges` journal keep working.
- `public.mark_client_account_purge_complete(uuid)` — unchanged.
- `client_account_purges` — unchanged shape; `detached` gains delete counts alongside the detach arrays.
- `delete-account` changes only in the **auth** step (Task 4).

**Content** — `CREATE OR REPLACE FUNCTION public.purge_client_account(p_user_id uuid) RETURNS uuid`,
SECURITY DEFINER, `SET search_path = public, pg_temp`, REVOKE PUBLIC/anon/authenticated, GRANT
service_role. Lineage banner `00536 → 00538`. Body:
1. NULL id → `check_violation` (kept verbatim from 00536).
2. **The designer refusal, kept verbatim** from 00536 (`profiles.is_designer` OR owns
   `projects`/`proposals`/`designer_clients` as designer) → `insufficient_privilege`.
3. Tombstone the PII on `public.profiles` for `p_user_id`: `display_name := 'Former client'`,
   and NULL on `email, full_name, avatar_url, phone, city, state, zip, bio, website, business_name,
   posthog_distinct_id, extension_user_id, ios_device_id, original_source, original_utm, help_state,
   stripe_customer_id, last_active_at, last_seen_at, availability_status`; `sms_opt_in := false`;
   `behavioral_tracking_opt_out := true`. `role`/`is_designer` untouched (they are not PII and the
   designer's row must still read as a homeowner relationship).
4. Delete the client-owned artefacts. The four the ruling names explicitly — `rooms`, `room_scans`,
   `saved_items`, and `comms_threads WHERE created_by = p_user_id` — plus the rest of the set that
   **used to vanish** through `auth.users → profiles → …` when the delete was hard, expressed as a
   generic sweep over every `ON DELETE CASCADE` FK pointing at `profiles(id)`/`auth.users(id)` whose
   column holds `p_user_id`, minus a stated deny list:
   - `public.profiles` itself (it is the tombstone),
   - `public.designer_clients` (the roster row is what keeps `client_decisions` alive — ruling 2's own
     complaint, d-notes §6(c) of W1b),
   - `public.consent_records`, `public.consent_audit_log`, `public.data_export_requests`,
     `public.account_deletion_requests` (the erasure paper trail; deleting the evidence of consent and
     of the deletion request is the one thing an erasure must not do).
   Every table and row count goes into the journal, so the sweep is auditable rather than magic.
5. Journal one `client_account_purges` row: `user_id`, `email := NULL` (an erasure ledger does not
   retain the address it erased — 00536 stored it), `detached` = `{tombstoned_profile, deleted:{<table>:n}}`.
   Return its id.
6. No `ALTER TABLE … DISABLE TRIGGER` anywhere in the file — assert that by inspection.

**Failing assertions first** — rewrite `supabase/tests/auth/account_purge_test.sql` over the same
fixtures it already builds (designer + client + studio + roster + project + **non-draft** proposal +
responded decision with two options + issued invoice + shared thread + solo thread + saved item), and
assert ruling 2 rather than 00536's behaviour:
- grant posture unchanged (service_role only) — kept.
- the designer refusal, and that nothing moved on the way to refusing — kept.
- `purge_client_account(client)` returns a journal id.
- **the designer's records survive AND still name the client**: proposal `client_id` = the client,
  `designer_client_id` unchanged; project `client_id` = the client; invoice `client_id` = the client and
  `studio_id` unchanged; the roster row still there.
- **the decision survives** with its two options — the assertion 00536's test had to write the other way
  round, and the reason ruling 2 exists.
- **the client's PII is gone**: `profiles.display_name = 'Former client'`, `email/full_name/phone/
  avatar_url/city/state/zip IS NULL`.
- **the client's artefacts are gone**: `saved_items`, `rooms`, `room_scans`, `notification_log`,
  `device_push_tokens` = 0 rows for the client; the solo thread deleted; **the thread the client started
  and shared with the designer is deleted too** (ruling 2 puts "threads the client started" on the
  client-owned side — flagged in `d-notes.md` §3 because it does destroy the designer's copy of that
  conversation, and a narrower rule is one predicate away).
- **no trigger was disabled**: every user trigger on the five tables is enabled, and the
  `ENABLE ALWAYS` fixture is still `'A'` — kept from 00536's test, because the new function must pass it
  trivially rather than by restoring what it broke.
- the journal row exists, carries `deleted` counts, holds **no email**, and stays `auth_deleted_at IS NULL`
  until `mark_client_account_purge_complete` closes it; the ledger is unreadable to `authenticated`/`anon`.
- a **second** `purge_client_account` call on the same id succeeds and is a no-op (the edge function may
  retry after a failed auth step).

**Run red** (00538 not yet applied) → the survival assertions fail against 00536's function.
**Implement** → `supabase db reset` → **run green**.

**Commit**: `feat(db): 00538 — an erasure anonymizes the client and leaves the designer's record whole`
covering `supabase/migrations/00538_client_account_anonymize.sql supabase/tests/auth/account_purge_test.sql`.

---

## Task 4 — `delete-account`: soft delete, because the tombstone must survive it

**Files** — `supabase/functions/delete-account/index.ts`, `handler.ts`, `handler.test.ts`.

**Interface** — the wire contract does **not** change: same five response shapes
(`200 {ok,userId}` · `401 unauthorized` · `403 designer_account` · `405 method_not_allowed` ·
`500 designer_check_failed|purge_failed` · `500 {auth_delete_failed, purgeRef}`), so lane C's SP-20 copy
(W1b d-notes §3) needs no change. The gateway gains one thing: `deleteAuthUser` must perform a **soft**
delete. `admin.auth.admin.deleteUser(userId, true)`.

**Failing test first** — in `handler.test.ts`, a case asserting the gateway is asked for a soft delete
(`deleteAuthUser` spy records the `soft` argument, and the happy path asserts `soft === true`); the
`DeleteAccountGateway.deleteAuthUser` signature becomes `(userId: string, soft: boolean)`.
**Run red** → `deno test supabase/functions/delete-account/handler.test.ts` fails.
**Implement** → handler passes `true`; `index.ts` calls `deleteUser(userId, true)` and its header comment
is rewritten to say what actually happens now (the profile survives as a tombstone; the client-owned rows
are deleted by the purge, not by a cascade).
**Run green** → `deno test` passes.

**Commit**: `fix(edge): delete-account closes the login and leaves the tombstone standing`
covering `supabase/functions/delete-account/`.

---

## Task 5 — gates, types, renumber check

1. `supabase db reset` (unsandboxed) — clean replay through 00538.
2. `scripts/run-sql-tests.sh` — full suite; report pass/fail counts and confirm no NEW unexpected failure
   against the pre-change baseline (capture the baseline BEFORE Task 1 lands so the comparison is real).
3. `deno test supabase/functions/delete-account/` — all cases.
4. `pnpm db:generate` then `git diff --stat packages/supabase/src/database.types.ts` — expect
   `rooms.budget_cents` and `profiles.last_seen_at` to appear; commit the regenerated file.
5. `ls -1 supabase/migrations | tail -5` — re-check for a 00537/00538 collision against the tip; renumber
   the file AND its banner if the number moved.
6. Write `waves/w2/d-notes.md` (file · exact diff · why) for every cross-lane item.

**Commit**: `chore(db): regenerate database.types.ts for 00537` covering
`packages/supabase/src/database.types.ts`.

---

## Not in this lane

- No `project_rooms` policy (F3).
- No client-portal, no iOS, no seed changes: `saved_items` is empty in the seed (F2), so the de-dup has
  nothing to fix there, and no W2 gate needs new seed rows.
- W5's migration keeps its reserved **00539** (rulings-fable #2).
