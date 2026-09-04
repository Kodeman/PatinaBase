# First Flight · W1 — THE KODY RUNBOOK

**Every command on this page is a production write or a production read. No agent ran any of it, and
no agent may.** Assembled by the **W1 closer** on 2026-09-03 from all seven W1 lanes, the three
acceptance walks and the two fix rounds. Three blocks, **K → M**, in the order they must run.

W0's runbook (`build/waves/w0/KODY-RUNBOOK.md`, blocks **A–J**) is unchanged and still stands. This
file **continues its lettering** rather than restarting it, so a block letter names one thing across
the whole program. W1 produced **no** new App Store Connect step and **no** new PostHog step — those
remain W0 §G and §H, and the two that are still owed are listed in §M4.

**No angle bracket appears in any command on this page.** Every value is either a literal or a
variable assigned at the top of its own block, and every block's variables are re-assignable on their
own — you can start at any block without having run the ones before it, except where a block says
otherwise. (The 2026-08-26 placeholder incident is why: a command handed over with a placeholder in
it gets run with the placeholder in it.)

---

## The order, and what actually gates what

| Block | What it does | Gated by | Reversible? |
|---|---|---|---|
| **K** | Apply the **proposal-signing** migration (L1-X, `L07-01`) and re-probe | W0 **B** and **C** (00555 and 00557 already on Strata) · **and a repo renumber first — see K1** | partly — K6 |
| **L** | Apply **00562** (`notification_log`: the addressed user may mark their own rows read) | nothing; **B** may run before or after | yes — L5 |
| **M** | Read-only verification, and the list of what W0 still owes build 1 | K and L | n/a — reads only |

**K and L are independent of each other.** Both are independent of the archive. Neither blocks the
other, and neither blocks R1 Step 2.

**Which one actually blocks build 1?** **L does.** Without 00562 a tester's notification bell can
never reach zero: the app's PATCH answers `200` with an empty array, the feed clears optimistically
and the next fetch reverts it. That was walked on glass three times. **K's liveness is unknown** and
K2 is the read-only probe that decides it — if Leah belongs to one active studio, `L07-01` is latent
for round one and K is a scheduled repair rather than a build-1 blocker.

---

## Block K — the proposal-signing migration (`L07-01`)

**What it proves.** That a client can sign a proposal when their designer belongs to more than one
active studio. Today the `projects` BEFORE INSERT guard cannot resolve an unambiguous studio, the
activation fails `studio_id_not_designer_studio`, and the sheet tells the client
*"We couldn't record your signature. Nothing has been signed."* — which is true, and is the server,
not the app.

### K0 — variables

```bash
export REPO=/Users/kody/Code/patina-merged
export APPLY_LOG="$REPO/artifacts/ios-testflight-polish-2026-09-01/build/waves/w1/apply-log"
mkdir -p "$APPLY_LOG"
# STRATA_DB_URL is the same connection string 00555 and 00557 went in on.
# Assign it in this shell; do not paste it into a file.
export STRATA_DB_URL="PASTE_THE_STRATA_CONNECTION_STRING_HERE"
```

Set `STRATA_DB_URL` before anything else in this block, and confirm it points where you think:

```bash
psql "$STRATA_DB_URL" -X -At -c "select current_database(), current_user, inet_server_addr();"
```

### K1 — ⚠ THE RENUMBER, WHICH IS A REPO STEP AND MUST HAPPEN FIRST

`first-flight/w1-integration` carries **`supabase/migrations/00559_proposal_signing_multi_studio.sql`**.
`main` already carries a **different** `00559` — `00559_first_document_opened.sql` — from a peer
session, plus `00560_invite_handoff_note.sql` and `00561_onboarding_drip_state_triggers.sql`.

**00562 is free on `main`. 00559 is not.** Before the branch meets `main`, L1-X's file is renumbered
to the next free number, **00563**, together with its RLS test and this block's step numbers:

```
supabase/migrations/00559_proposal_signing_multi_studio.sql
  → supabase/migrations/00563_proposal_signing_multi_studio.sql
supabase/tests/rls/00559_proposal_signing_multi_studio.test.sql
  → supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql
```

That is a code change on the branch, not a production write, and it belongs to whoever lands W1 on
`main`. **This block reads the number off disk rather than assuming it**, so it is correct either way:

```bash
cd "$REPO"
ls supabase/migrations/*proposal_signing_multi_studio.sql
# EXACTLY ONE line. If it prints two, or none, stop and fix the branch first.
export MIG=$(ls supabase/migrations/*proposal_signing_multi_studio.sql)
export MIG_VERSION=$(basename "$MIG" | cut -c1-5)
export MIG_NAME=$(basename "$MIG" .sql | cut -c7-)
echo "$MIG"; echo "$MIG_VERSION"; echo "$MIG_NAME"
# want e.g.  supabase/migrations/00563_proposal_signing_multi_studio.sql
#            00563
#            proposal_signing_multi_studio
```

### K2 — the read-only probe that decides whether this is urgent

Run it in the **Strata SQL editor** (Supabase dashboard, project `bkvcixdmuyejfzcijpdg`, SQL Editor)
or with `psql`. It reads three tables and writes nothing. It is unchanged from
`build/waves/w0/l07-notes.md` §3 and `build/waves/w1/l1x-notes.md` §3, repeated here so this block is
complete.

```bash
psql "$STRATA_DB_URL" -X -c "
SELECT p.email,
       count(DISTINCT om.organization_id) AS active_design_studios,
       string_agg(DISTINCT o.name, ' | ' ORDER BY o.name) AS studios
FROM public.profiles AS p
JOIN public.organization_members AS om ON om.user_id = p.id
JOIN public.organizations AS o ON o.id = om.organization_id
WHERE om.status = 'active'
  AND om.role <> 'guest'
  AND o.type = 'design_studio'
  AND o.status = 'active'
  AND p.id IN (SELECT DISTINCT designer_id FROM public.proposals WHERE status = 'sent')
GROUP BY p.email
ORDER BY active_design_studios DESC, p.email;
" | tee "$APPLY_LOG/k2-studio-probe-before.txt"
```

**How to read it.** Any row with `active_design_studios >= 2` is a designer whose clients cannot sign
a proposal today. **If Leah's row reads `1`**, `L07-01` is latent for round one: apply K when
convenient, and nothing in build 1 is blocked. **If it reads `2` or more**, it blocks build 1 for that
studio — apply K before the invites go out, or name the defect in What to Test.

A second read-only probe worth running in the same session, because the migration also stops leaving
`studio_id` NULL. It says how many rows the ambiguity has already stranded:

```bash
psql "$STRATA_DB_URL" -X -c "
SELECT count(*) AS projects_without_studio,
       count(*) FILTER (WHERE proposal_id IS NOT NULL) AS from_proposal_activation
FROM public.projects
WHERE studio_id IS NULL;
" | tee "$APPLY_LOG/k2-null-studio-before.txt"
```

The migration does **not** backfill those rows; it only stops new ones being created. A backfill would
be a separate, deliberate migration.

### K3 — confirm the band, before touching anything

```bash
psql "$STRATA_DB_URL" -X -At -c "
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('00555','00556','00557','00558','00559','00560','00561','00562','00563')
ORDER BY version;"
```

Want **`00555` and `00557` present** (W0 blocks B and C) and **`$MIG_VERSION` absent**. If `00555` or
`00557` is missing, stop: run W0's blocks B and C first. If `$MIG_VERSION` is already present, this
block has been run — go to K5.

### K4 — read the live object BEFORE, so the apply can be proved by the object and not the ledger

```bash
psql "$STRATA_DB_URL" -X -At -c "
SELECT encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex')
FROM pg_proc WHERE oid='public.set_project_studio_id()'::regprocedure;" \
  | tee "$APPLY_LOG/k4-prosrc-before.txt"
# expect 8113ca8a0b99edcce6220e97983ddf1f71576d099f5e3311044c571027929a02   (00511's body)
```

### K5 — apply the one file, with `psql`, never `supabase db push`

`supabase db push` would drag every pending file in the band. This applies one file, in the
transaction the file opens itself, and then writes the ledger row so a later `db push` does not
replay it.

```bash
cd "$REPO"
psql "$STRATA_DB_URL" -X -v ON_ERROR_STOP=1 -f "$MIG" \
  | tee "$APPLY_LOG/k5-apply.txt"

# prove it by the object, not the ledger
psql "$STRATA_DB_URL" -X -At -c "
SELECT encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex')
FROM pg_proc WHERE oid='public.set_project_studio_id()'::regprocedure;" \
  | tee "$APPLY_LOG/k5-prosrc-after.txt"
# expect 8aca199be7f059b37c7b0148d39a4b38e0a725f77cb0aa4e939730712ca050f8

# ledger row
psql "$STRATA_DB_URL" -X -v ON_ERROR_STOP=1 -c \
  "INSERT INTO supabase_migrations.schema_migrations (version, name)
   VALUES ('$MIG_VERSION','$MIG_NAME') ON CONFLICT (version) DO NOTHING;"
```

### K6 — rollback

The migration replaces one function body. Reverting means restoring 00511's body, which is not a
one-liner and is **not** worth improvising at a keyboard: the file's own header carries the original,
and the hash in K4 tells you whether you are looking at the right one. If K5's `psql` exits non-zero
the file's own `BEGIN`/`COMMIT` has already rolled the whole thing back and nothing changed — read
the error and stop. Do not re-run K5 against a half-applied state; there is no such state.

### K7 — after the apply, the same probe again

Re-run **K2** unchanged, into `k7-studio-probe-after.txt`. **The count itself will not change** —
00559/00563 does not move anyone between studios; it makes the count irrelevant to signing. The real
confirmation is behavioural and belongs to the device pass: **have a tester sign the demo proposal and
watch the sheet reach the signed state.** A real signature on production is not a probe, so that is a
walk step, and it is R1 §6's row.

---

## Block L — 00562, without which the notification bell can never clear

**What it proves.** That a signed-in person can mark their own notifications read. `notification_log`
(00041) has exactly one UPDATE policy — *"Service role can update notification logs"*,
`USING (auth.uid() IS NULL)` — so a signed-in user matches **no** UPDATE policy at all. The app's
PATCH answers `200` with an empty array: zero rows affected. On glass: "Mark all read" clears every
dot, the bell still badges 3, and re-opening the feed shows the unread rows back.

This was proven twice on the local stack with a real bearer token (PATCH affects **0** rows before,
**6** after) and walked end to end after the fix, including through a **cold relaunch** — i.e. after a
fresh server fetch, not an optimistic UI.

### L0 — variables

```bash
export REPO=/Users/kody/Code/patina-merged
export APPLY_LOG="$REPO/artifacts/ios-testflight-polish-2026-09-01/build/waves/w1/apply-log"
mkdir -p "$APPLY_LOG"
export STRATA_DB_URL="PASTE_THE_STRATA_CONNECTION_STRING_HERE"
export MIG562="$REPO/supabase/migrations/00562_notification_log_owner_opened.sql"
ls -l "$MIG562"
```

`00562` does **not** collide with anything on `main` (which stops at `00561`), so unlike Block K there
is nothing to renumber.

### L1 — record what the policy set looks like BEFORE

```bash
psql "$STRATA_DB_URL" -X -c "
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.notification_log'::regclass
ORDER BY polcmd, polname;" | tee "$APPLY_LOG/l1-policies-before.txt"

psql "$STRATA_DB_URL" -X -c "
SELECT grantee, privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='notification_log'
  AND grantee='authenticated' AND privilege_type='UPDATE'
ORDER BY column_name;" | tee "$APPLY_LOG/l1-colgrants-before.txt"
```

Expect **one** UPDATE policy (the service-role one) and, in the second query, either nothing or a
table-wide grant. Both files are what L5's rollback compares against.

### L2 — confirm the ledger

```bash
psql "$STRATA_DB_URL" -X -At -c "
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('00555','00557','00562') ORDER BY version;"
```

`00562` must be **absent**. `00555`/`00557` are not strictly required for this one, but if they are
missing you are further behind than you think — check W0's blocks B and C.

### L3 — apply

```bash
cd "$REPO"
psql "$STRATA_DB_URL" -X -v ON_ERROR_STOP=1 -f "$MIG562" | tee "$APPLY_LOG/l3-apply.txt"

psql "$STRATA_DB_URL" -X -v ON_ERROR_STOP=1 -c \
  "INSERT INTO supabase_migrations.schema_migrations (version, name)
   VALUES ('00562','notification_log_owner_opened') ON CONFLICT (version) DO NOTHING;"
```

### L4 — prove it by the objects

```bash
psql "$STRATA_DB_URL" -X -c "
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.notification_log'::regclass
ORDER BY polcmd, polname;" | tee "$APPLY_LOG/l4-policies-after.txt"
# want a NEW row: 'Users can mark own notifications opened', cmd w (UPDATE),
#   using auth.uid() = user_id AND channel IN ('in_app','push')

psql "$STRATA_DB_URL" -X -c "
SELECT grantee, privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='notification_log'
  AND grantee='authenticated' AND privilege_type='UPDATE'
ORDER BY column_name;" | tee "$APPLY_LOG/l4-colgrants-after.txt"
# want EXACTLY three rows: clicked_at, opened_at, status — and no table-wide UPDATE grant.
```

The column ceiling is the half that is easy to skip and expensive to skip: without it the new policy
would also let a person rewrite their own row's `type`, `metadata` (which carries `deep_link`),
`error` and `retry_count`. Column grants are enforced by PostgREST, so a PATCH naming any other column
now fails `42501` instead of succeeding quietly.

### L5 — rollback

The migration's own header carries it, and it is two lines:

```bash
psql "$STRATA_DB_URL" -X -v ON_ERROR_STOP=1 -c \
  'DROP POLICY "Users can mark own notifications opened" ON public.notification_log;'
psql "$STRATA_DB_URL" -X -v ON_ERROR_STOP=1 -c \
  'GRANT UPDATE ON public.notification_log TO authenticated;'
psql "$STRATA_DB_URL" -X -v ON_ERROR_STOP=1 -c \
  "DELETE FROM supabase_migrations.schema_migrations WHERE version = '00562';"
```

Rolling back restores the pre-W1 behaviour: the bell never clears. Do it only if the policy is
implicated in something worse.

### L6 — ⚠ the half this migration deliberately does NOT close, and it is still owed

The pre-existing *"Service role can update notification logs"* policy is `USING (auth.uid() IS NULL)`,
which is **TRUE under the anon key** — so the anon key can still rewrite any user's notification rows.
`00555` §CAVEAT saw it, called it **HIGH**, and deferred it deliberately, because `notification_log`
sits on the live email/cron rail that `00552`/`00553`/`00554` had just moved and the fix wanted a
migration that could be verified against that rail. **That is still true and still owed.** It is a
different change from this one and it was not folded in. It is a W2 · L0.2 row.

---

## Block M — read-only verification, and what is still owed

Nothing in this block writes. Run it after K and L.

### M0 — variables

```bash
export STRATA_DB_URL="PASTE_THE_STRATA_CONNECTION_STRING_HERE"
```

### M1 — the migration band, in one look

```bash
psql "$STRATA_DB_URL" -X -c "
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version >= '00550' ORDER BY version;"
```

### M2 — the two objects W1 added

```bash
psql "$STRATA_DB_URL" -X -At -c "
SELECT count(*) FROM pg_policy
WHERE polrelid='public.notification_log'::regclass
  AND polname='Users can mark own notifications opened';"
# want 1

psql "$STRATA_DB_URL" -X -At -c "
SELECT encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex')
FROM pg_proc WHERE oid='public.set_project_studio_id()'::regprocedure;"
# want 8aca199be7f059b37c7b0148d39a4b38e0a725f77cb0aa4e939730712ca050f8 after Block K
```

### M3 — the behavioural checks, which are walk steps and not SQL

Three, and each belongs to the device pass rather than to a query:

1. **The bell reaches zero and stays there.** Open the notification feed on a TestFlight build, tap
   *Mark all read*, leave the tab and come back, then **cold-relaunch the app** and look at the bell.
   That last step is the one that matters — it is the only one that proves the server agreed. This is
   `C2-07` and it maps to R1's `D-07`.
2. **A proposal signs.** Have a tester sign the demo proposal and watch the sheet reach the signed
   state. That is Block K's real confirmation (K7).
3. **The invoice pays.** Unchanged from W0 §E1 / R1 `D-12`.

### M4 — what W0 still owes build 1, unchanged by W1

W1 produced no new App Store Connect and no new PostHog step. These are W0's, and they are still open
at W1 close:

| W0 block | what | why W1 cares |
|---|---|---|
| **§D** | mint `firstflight@patina.cloud` + the Vault allow-list | `A3-16` is open in W1 precisely because no allow-listed pair exists to walk. It is R1's `D-04` |
| **§E1** | confirm the live Stripe key on Strata (**D10**) | R1's `D-12`; W1 closed `B-28` and `GAP2-24`, which are the screens that failure lands on |
| **§E2** | confirm the APNs env (**D9**) | R1's `D-07`; and `W1-C-11`'s worst face is a push tapped from a cold app |
| **§F** | publish the three tour bodies in Sanity | **W1 changed this one's shape.** `C5-02` and `R-10` are now **closed in the app** — the six `?` doors no longer reach Sanity, they print a local fallback. What is still wrong is `A4-01`/`C5-01`: production Sanity serves *retired tour copy* and **overrides** the correct in-app text. So §F is no longer "the help doors are empty"; it is "the tour is telling testers about a UI that no longer exists" |
| **§G** | the two ASC writes, the testers, the age rating, the name | R1 Steps 1, 5 and 7 |
| **§H** | the three PostHog flags — **`house-first` at 100% / everyone / active**, the other two at 0% / active | §11.5's contradiction: a 0% `house-first` arrives as an *answer*, the kill-switch clause fires, and every tester loses the four-tab root on their **second** launch. W1's three walkers all ran with no flags argument and saw the bar, which is D1a working — but that is the *default*, not the payload |
| **§J2** | the catalogue seed, the day Leah's manifest lands | `A3-01` is open in W1 because the local catalogue has 16 pieces and the honest empty state never renders. **D2**'s end-of-day-6 call still stands |

---

## What W1 did not do, stated plainly

- No `supabase db push`, no `supabase functions deploy`, no `wrangler deploy`, no `asc` write, no
  Sanity write, no PostHog change, no `execute_sql` against Strata.
- No agent applied `00559`/`00563` or `00562` anywhere but `127.0.0.1:54322`.
- `first-flight/w1-integration` has **no remote** and nothing was pushed.
