# W2 · lane D — integration notes

Branch `daily-return/w2-d`, four commits on `e9da02569`. Nothing here is a request for another
lane's file except §5 (already made, flagged) — §§2-4 are decisions the steward or Fable may overrule.

| Commit | What |
|---|---|
| `75b7e4c21` | `00537_house_on_today.sql` + `supabase/tests/rooms/house_on_today_test.sql` |
| `5aa5e517b` | `00538_client_account_anonymize.sql` + rewritten `supabase/tests/auth/account_purge_test.sql` + regenerated `supabase/seed/00-legacy-grants.sql` |
| `95eca5c22` | `supabase/functions/delete-account/{index,handler,handler.test}.ts` |
| `983c066a3` | `packages/supabase/src/database.types.ts` |

---

## 1. The fact 00538 rests on: GoTrue's SOFT delete leaves `public.profiles` standing

Run against this stack on 2026-08-27, before a line of 00538 was written. Created a user through the
admin API, then deleted it with `should_soft_delete`:

```
$ curl -s -X DELETE "http://127.0.0.1:54321/auth/v1/admin/users/1e02066a-…" \
    -H "Authorization: Bearer <local service_role>" -d '{"should_soft_delete":true}'
{}

BEFORE  auth.users     email=softdelete-spike@test.invalid  phone=''  deleted_at=NULL
                       raw_user_meta_data={"full_name":"Spike Person","email_verified":true}
        auth.identities  1 row, identity_data carries the address
        public.profiles  email=softdelete-spike@test.invalid  display_name='Spike Person'

AFTER   auth.users     email=k3baI3FoJIPdfCVCJBNNHLKpR7KXBTW3OUwOLczHuGs
                       phone=1ivpOuBYBtx5Dp7   deleted_at=2026-08-27 22:02:16+00
                       raw_user_meta_data={}   encrypted_password=NULL
        auth.identities  1 row, identity_data={} , provider_id hashed
        auth.sessions    0
        public.profiles  ROW STILL PRESENT, untouched
```

The spike user was hard-deleted afterwards (`auth.users` 0 rows, `profiles` 0 rows) — nothing of it
survives in the local database, and the wave's `supabase db reset` ran after it in any case.

That is the whole of 00538's design: the login is destroyed and the address freed, the profile row
survives, so the profile **is** the tombstone and every designer-owned leg keeps naming it.

## 2. ⚠ Deviation from the brief's letter — no `set_document_client`, no re-point at all. Fable's call.

The brief said: *"re-point client identity on designer-owned rows (proposals, client_decisions,
invoices, projects, designer_clients roster) to the tombstone (respecting the authority guards — use
the sanctioned `set_document_client` path where the guards demand it)"*.

**00538 re-points nothing, and writes to none of those five tables.** Three verified facts:

- **(a) Every designer-owned leg already references `profiles(id)`** — `proposals.client_id`,
  `projects.client_id`, `invoices.client_id`, `designer_clients.client_id`,
  `comms_threads.created_by` (`pg_constraint`). Only `client_decisions.{selected_by, answered_by,
  designer_id}` reference `auth.users(id)`, whose row also survives a soft delete. With the profile
  alive, **the tombstone is already what they point at** — there is no other id to re-point *to*.
- **(b) The sanctioned path could not be used anyway.** `set_document_client` (00387:1092-1213)
  requires `auth.uid()` to be the owning designer and refuses a non-draft proposal. A service-role
  purge has no JWT subject and closes accounts that carry sent proposals.
- **(c) Writing the leg by hand is impossible on a non-draft proposal.**
  `guard_proposal_copy_immutability` raises on ANY `client_id`/`designer_client_id` change once
  `status <> 'draft'` and — unlike `guard_proposal_authority`, which honours
  `app.proposal_identity_id` — offers **no authority GUC at all**. 00536 could only get past it by
  `ALTER TABLE … DISABLE TRIGGER` on five tables, which takes ACCESS EXCLUSIVE and stalls those
  tables portal-wide for every designer for the length of one homeowner's closure (review M-D5).

So the outcome ruling 2 names is delivered — the designer's proposal, project, invoice, roster row
**and decision with both options** survive and still name the client — and the write the brief
described is not needed to deliver it. The maintenance-window hazard is **removed**, not mitigated:
`grep -c 'DISABLE TRIGGER' 00538_*.sql` → 0.

If Fable wants an explicit re-point to a *separate* tombstone profile instead, it costs: a new
`auth.users` shell per closure (a tombstone profile cannot exist without one — `profiles.id
REFERENCES auth.users(id)`), the trigger-disabling back, and the ACCESS EXCLUSIVE window back. That
is the trade; lane D took the cheaper side and is flagging it rather than burying it.

## 3. ⚠ A thread the client started is deleted even when the designer is in it. Fable's call.

Ruling 2 lists "threads the client started" among the client-owned artefacts to delete, and 00538
does exactly that: `DELETE FROM public.comms_threads WHERE created_by = p_user_id`, cascading its
participants and messages. **That destroys the designer's copy of that conversation**, which sits
oddly beside ruling 2's own headline ("never cascade designer-owned records"). 00536 handled it the
other way — reassigning `created_by` to a remaining participant and deleting only a thread with
nobody left.

Both behaviours are one predicate apart. The narrower rule would be:

```sql
-- delete only the threads nobody else is left in
DELETE FROM public.comms_threads t
 WHERE t.created_by = p_user_id
   AND NOT EXISTS (SELECT 1 FROM public.comms_thread_participants p
                    WHERE p.thread_id = t.id AND p.profile_id <> p_user_id AND p.left_at IS NULL);
```

`account_purge_test.sql` asserts the ruling-2 behaviour as shipped (a shared thread the client
started IS deleted; a thread the **designer** started survives with both participants). Say the word
and it inverts in one commit.

Related and deliberate: `comms_thread_participants` is **not** swept. Removing the leaver from a
thread the designer started would fire `comms_participants_cardinality` (a deferred constraint
trigger) and rewrite her conversation; the participant row now names the tombstone instead.

## 4. ⚠ For Kody — `designer_clients.client_name` / `.client_email` are not scrubbed

Ruling 2 scopes the tombstone to `profiles`. The roster row — which 00538 deliberately keeps alive,
because it is what holds `client_decisions` up — carries the designer's own copy of the person's
name and email address, beside her private CRM fields (`notes`, `nickname`, `satisfaction_score`,
`tags`, …, per 00536's banner). After a closure the designer's screens will read "Former client" from
`profiles` in some places and the person's real name from `designer_clients` in others.

That is a retention question, not a lane decision: erasing a person's identity from a designer's CRM
is a different policy from erasing it from Patina's own profile. Named here so it is chosen rather
than defaulted.

## 5. Steward — one file edited outside the W2 owned map

**`supabase/seed/00-legacy-grants.sql`** (in `5aa5e517b`). `steward.md` §7 grants lane D
`supabase/migrations/00537_*`, `00538_*`, `supabase/tests/**`, `database.types.ts` and
`delete-account/**`; the generated ACL seed is not on that list (it was lane D's in W1b). 00538
restates 00536's `REVOKE`/`GRANT` on `purge_client_account`, and `scripts/generate-legacy-grants.py`
reads those lines, so leaving the seed unregenerated makes it stale by construction. The change is
mechanical and append-only — twelve lines, two `DO $g$` blocks, both naming
`public.purge_client_account(uuid)` with exactly the posture 00536 already set:

```diff
+-- 00538_client_account_anonymize.sql
+DO $g$ BEGIN
+  REVOKE ALL ON FUNCTION public.purge_client_account(uuid) FROM PUBLIC, anon, authenticated;
+EXCEPTION WHEN undefined_function OR undefined_table OR undefined_object OR undefined_column THEN NULL;
+END $g$;
+
+-- 00538_client_account_anonymize.sql
+DO $g$ BEGIN
+  GRANT EXECUTE ON FUNCTION public.purge_client_account(uuid) TO service_role;
+EXCEPTION WHEN undefined_function OR undefined_table OR undefined_object OR undefined_column THEN NULL;
+END $g$;
```

No other lane touches `supabase/`, so there is no collision. Revert it if you would rather regenerate
at integration.

## 6. R1 / R2 — what is now on the database, and what is not

- **`rooms.budget_cents integer`, nullable.** Money is integer cents. NULL means she has not set one,
  and the rail then says nothing rather than inventing a figure. `Database["public"]["Tables"]["rooms"]["Row"].budget_cents`.
- **`profiles.last_seen_at timestamptz`, nullable, and nothing writes it.** It exists for a later
  server-side surface. The Record's "new" tick stays `LastSeenStore` on the device (C5) — do not
  read this column for it and do not start writing it in W2.
- **`project_rooms` is settled and closed.** No policy was written (steward §5d; critique M4). If the
  house rail comes back empty for Ruth, the cause is the client fetch path or the seed, never RLS —
  the steward's own run showed 2 of 2 rows visible to `client@patina.dev` and 0 to everyone else.
  `public.rooms` remains **empty in the seed** (0 rows), so the rail's local-rooms half draws nothing
  until a room is typed.
- **`saved_items` now enforces one save per piece.** Two partial unique indexes:
  `(user_id, product_id) WHERE room_id IS NULL` and `(user_id, product_id, room_id) WHERE room_id IS
  NOT NULL`. Consequences for any save path: a repeat save of the same piece now returns a
  `23505 unique_violation` rather than writing a second row, so an insert that used to be
  fire-and-forget wants `ON CONFLICT DO NOTHING` (or must treat 23505 as success). The same piece in
  two different rooms is still legal, and so is the same piece both unroomed and in a room; a save
  with `product_id IS NULL` is unconstrained. Nothing in W2's iOS lanes writes `saved_items`, so this
  is a note, not a task.

## 7. Lane C — the `delete-account` wire contract did NOT change

Same six responses (`200 {ok,userId}`, `401 unauthorized`, `403 designer_account`,
`405 method_not_allowed`, `500 designer_check_failed`, `500 purge_failed`,
`500 {auth_delete_failed, purgeRef}`). SP-20's copy from W1b d-notes §3 stands as written, including
the `auth_delete_failed` wording ("we started closing your account but couldn't finish"), which is
still accurate: the anonymization commits before the auth detach and they cannot be one transaction.

What changed is inside: `DeleteAccountGateway.deleteAuthUser(userId, soft)` and the handler always
passes `true`. One new deno case pins it.

**Still true and still lane A's:** `LocalStoreReset` must wipe the on-device store on success.

## 8. What 00537 and 00538 deliberately do not do

- No `project_rooms` policy (§6).
- No seed change: `saved_items` is empty in the seed, so the de-duplication has nothing to repair
  there, and no W2 gate needs new rows.
- No write to `auth.*` from SQL. The auth-side scrub is GoTrue's, through the admin API — a vendor
  contract verified by the §1 spike rather than reimplemented in Postgres.
- No `client_account_purges` shape change; `mark_client_account_purge_complete` is untouched from
  00536. The purge now reuses an open journal row on a retry (a second call returns the same id) and
  writes **no email** into the ledger.
- W5's migration keeps its reserved **00539** (rulings-fable #2).

## 9. Gate output

```
$ supabase db reset                                    → "Reset local database." (clean replay through 00538)
$ ./scripts/run-sql-tests.sh
  total: 132 · green: 110 · expected-fail: 22 · unexpected-fail: 0
  PASS supabase/tests/auth/account_purge_test.sql
  PASS supabase/tests/rooms/house_on_today_test.sql
  PASS supabase/tests/rls/saved_items_snapshot_test.sql
  PASS supabase/tests/rls/designer_clients_client_read_test.sql
  (baseline before this lane's work: total 131 · green 109 · expected-fail 22 · unexpected-fail 0)
$ deno test --config supabase/functions/deno.json supabase/functions/delete-account/handler.test.ts
  ok | 12 passed | 0 failed
$ deno check --config supabase/functions/deno.json supabase/functions/delete-account/index.ts
  Check … (clean)
$ pnpm db:generate; git diff --stat packages/supabase/src/database.types.ts
  1 file changed, 6 insertions(+)      ← rooms.budget_cents, profiles.last_seen_at (Row/Insert/Update)
$ ls -1 supabase/migrations | tail -3  → 00537_house_on_today.sql  00538_client_account_anonymize.sql  _pending
$ git log --oneline -1 main            → e9da02569  (tip migration 00536 — no collision)
```

---

## 10. Fix round against `d-review.md` (commit `b096364ce`)

Full answer, with red→green evidence and the two rebuttals, in
[`d-fix-log.md`](./d-fix-log.md). In short:

- **D-1 (MAJOR) fixed.** A retry of `purge_client_account` reused the open journal row but wrote its
  own empty tally *over* the standing one, discarding the record of what the first pass deleted —
  on the exact recovery path `delete-account/handler.ts` documents. The UPDATE branch now **merges**:
  per-table counts summed, deleted thread ids unioned, prior keys carried through. The test's retry
  case now inspects `detached->'deleted'` after the retry; before the fix it failed with
  `the room count reads <absent>`.
- **D-2 (thread deletion) and D-3 (no re-point) rebutted, not changed** — D-2 because 00538
  transcribes ruling 2's own clause and inverting it is Fable's or Kody's call (the one-predicate
  diff is written out and ready); D-3 because `set_document_client` refuses a service-role purge on
  four independent counts, now quoted verbatim from `00387:1092-1142` — the gap the reviewer named
  as un-re-verified.
- **D-4 confirmed against the live database** (`designer_clients.client_name` / `.client_email` both
  present, both untouched) — still Kody's retention question. **D-5** unchanged.

Gate after the fix: `supabase db reset` clean · SQL suite **132 total / 110 green / 22 expected-fail
/ 0 unexpected** · `deno test` **12 passed, 0 failed** · `database.types.ts` untouched (a function
body changed, not a table shape).
