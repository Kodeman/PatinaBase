# W0 · L0.2 — integration notes out

Written by the L0.2 agent, 2026-09-02, on branch `first-flight/w0-l02`.
Each note names its receiving lane, the exact file and line, and the **final text** to apply — the
receiving lane pastes it as a numbered task in its own list rather than re-deriving it.

**Notes addressed TO this lane: none.** `build/waves/w0/` carried only `steward.md` when this lane
started; `l01-notes.md`, `l02b-notes.md`, `l03-notes.md` and `l07-notes.md` were all re-read at the top
of the fix round and none carries a note addressed to L0.2.

| # | To | Subject |
|---|---|---|
| **N1** | L0.2b | The two RPC signatures 00555 ships |
| **N2** | L1-B | `A3-18`, the exact 24-column product select |
| **N3a** | L1-A | `AppleSignInRoleTests` asserts the server's answer, not a client write |
| **N3b** | **Kody, via Fable** | ⚠ **A GATE ON THE APPLY** — the designer-portal self-signup role flip |
| **N4a/b/c** | Fable | Two non-cosmetic degradations · a dead predicate leg · a probe that could not fail |
| **N5** | Steward | `ScanSharingContractTests` is compile-green only and needs a clone |
| **N5b** | Steward + Fable | `searchDesigners` has **no caller** — say the RPC swap's value at that level |
| **N6** | W0 closer | `build/waves/w0/` is untracked and this lane cannot commit it |
| **N7** | Steward, and every lane minting SQL | The migration band moved: this lane is **00557** |
| **N8** | Steward + the `admin-studios` session | This lane's resets removed `00556` from the shared local stack |
| **N9** | **W0 closer — priority raised** | Commit `build/waves/w0/` **before** Kody runs the apply, not at wave close |
| **N10** | Fable | Two profile-write legs 00555 deliberately does **not** close |

**Added in fix round 1:** N5, N6, N7, and the gate status on N3b.
**Added in fix round 2 (2026-09-02):** N5b, N8, N9, N10 — and **N4b is rewritten**: the dead leg is no
longer an open question, it was removed.

---

## N1 → **L0.2b** — the two RPC signatures 00555 ships

L0.2b's `useVendorProfiles` fix calls an RPC this lane wrote. These are the shapes as they exist in
`supabase/migrations/00555_ios_round_one_security.sql`, verified against a fresh local stack
(`pnpm supabase:reset`, 2026-09-02) and against the regenerated
`packages/supabase/src/database.types.ts`, which now names both.

```
public.list_vendor_profiles()
  RETURNS TABLE (id uuid, full_name text, avatar_url text)
  LANGUAGE sql · STABLE · SECURITY DEFINER · SET search_path TO 'public'
  REVOKE EXECUTE FROM PUBLIC, anon;  GRANT EXECUTE TO authenticated;
  Returns every profile with role = 'vendor', ordered by full_name.
  NO query parameter and NO limit — deliberately: the caller is a picker over a
  small curated set, and adding pagination would change the hook's contract as
  well as its source.

public.search_shareable_designers(p_query text)
  RETURNS TABLE (id uuid, display_name text, business_name text, avatar_url text)
  LANGUAGE sql · STABLE · SECURITY DEFINER · SET search_path TO 'public'
  REVOKE EXECUTE FROM PUBLIC, anon;  GRANT EXECUTE TO authenticated;
  Two-character minimum, LIMIT 20, ILIKE on name columns only — never on email,
  so it cannot confirm whether an address has an account.
```

The generated TypeScript for the one L0.2b calls:

```ts
list_vendor_profiles: {
  Args: never
  Returns: {
    avatar_url: string
    full_name: string
    id: string
  }[]
}
```

So the hook body becomes — note there is no second argument, because `Args: never`:

```ts
const { data, error } = await supabase.rpc('list_vendor_profiles');
if (error) throw error;
return (data ?? []) as VendorProfile[];
```

**Keep the `if (error) throw`.** The migration's head-of-file block is explicit that after 00555 the
old `.from('profiles')` read does not degrade to an empty array — it throws `42501 permission denied
for table profiles`. With the RPC it can no longer throw that, and swallowing errors here would hide
a real 404 if the migration has not been applied yet.

`display_name` in `search_shareable_designers` is `COALESCE(NULLIF(btrim(display_name),''), full_name)`,
so it is never blank when either column is populated — but it **is** nullable when both are, so treat
it as optional on the TypeScript side too.

---

## N2 → **L1-B** — `A3-18`, the 24-column product select

The finding is filed against L0.2 but the edit is in a file L1-B owns:
`apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:113`. **L0.2 does not touch it.**

Today the select is `*`, which pulls two 768-dimension embedding vectors on every row — about 20.7 KB
per row, roughly 90% of the payload, for columns no screen reads. This is the exact replacement list.
Keep the vendors embed **exactly as it is**: 00555 §(c) grants `anon` a column allowlist on `vendors`
that includes `id`, `name`, `made_in` and `brand_story` precisely so this embed keeps resolving
through the base-table FK. Changing the embed to a view breaks it — that is why 00555 used column
grants and not a `vendor_cards` view.

```swift
static let productSelect =
    "id,name,slug,description,price,sale_price,currency,category,subcategory,"
    + "images,primary_image_url,dimensions,materials,colors,finish,lead_time_days,"
    + "in_stock,is_active,vendor_id,layer,owner_user_id,created_at,updated_at,"
    + "photo_verified_at"
    + ",vendors!products_vendor_id_fkey(name,made_in,brand_story)"
```

**Before pasting it, run this against the local stack and reconcile the two lists** — the column set
has moved twice in this band (00533 `piece_detail_contract`, 00535 `saved_items_price_snapshot`), and a
name that has drifted turns the whole read into a 400:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q -c \
  "SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='products'
      AND data_type <> 'USER-DEFINED'
    ORDER BY ordinal_position;"
```

The two columns to leave out are the vector ones (`udt_name = 'vector'`); everything else the app
actually decodes should be in the list.

---

## N3 → **L1-A**, and a ruling for **Fable**

### N3a — `AppleSignInRoleTests` asserts the server's answer, not a client write

00555 §a2 does two things that change what L1-A has to test.

1. `"Users can update own profile"` now carries a `WITH CHECK` that pins `profiles.role` to its current
   value. An authenticated caller can no longer raise their own role. Verified locally: case 7c of
   `supabase/tests/rls/00555_ios_round_one_security.test.sql` attempts `homeowner → designer` as the
   row's own owner and the role does not move.
2. `handle_new_user`'s fallback moved from `'designer'` to `'homeowner'`, so a metadata-less sign-up —
   which is exactly what Apple's is, because `supabase-swift`'s `signInWithIdToken` has no `data:`
   parameter — now lands as a homeowner **on the server**.

So `A3-07`'s remedy is no longer "the app writes `role: homeowner` after Apple sign-in". That write
would now be *refused* by the new `WITH CHECK` if it ever tried to change the value, and it is
unnecessary because the server already did it. **L1-A keeps a display-name write only**, and
`AppleSignInRoleTests` asserts the resulting `profiles.role`, not the client-side call.

The behavioural guard already exists server-side, in case 11 of the same test file: a metadata-less
`auth.users` insert produces `profiles.role = 'homeowner'`; an explicit `{"role":"homeowner"}` hint is
honoured; a forged `{"role":"super_admin"}` hint is ignored and falls through to `homeowner`.

### N3b — the designer-portal self-signup consequence — **A GATE ON THE APPLY, not a note**

> **Status, 2026-09-02 (fix round).** Round 1 flagged this and moved on, which left it escalated but
> **ungated**: no test, no probe, no line in the apply sequence — while **D8** puts 00555 on Strata on
> day 2, against VISION's surface #1. It is now **Step 0b of
> [`KODY-RUNBOOK.md`](KODY-RUNBOOK.md)**, with the three options written out and a ruling line that
> must be filled in before Step 3 runs. **The apply cannot proceed with this open.**
>
> It cannot be undone after the fact for the accounts it touches: every portal self-signup created
> between the apply and a fix carries the wrong role string.

Flagging rather than deciding, because it is a product call and it lands on VISION's surface #1.

`apps/designer-portal/src/app/auth/signup/page.tsx:147-157` calls `supabase.auth.signUp` with
`options.data = { name, company, phone }` and **no role**. Under 00313 that fell through to
`'designer'`; under 00555 it falls through to `'homeowner'`. A designer who signs up on the portal
therefore lands with `profiles.role = 'homeowner'`.

What that does **not** break: `public.user_roles` is the authoritative role table and this same trigger
still writes `'app_user'` there unchanged, and `profiles.is_designer` is synced from `user_roles` by
00290's trigger. Designer *authority* is unaffected.

What it does change is the three places that branch on the `profiles.role` **string**: 00050's
designer-onboarding automation (`account_created where role='designer'`), 00103/00104's comms
participant-role derivation, and 00038's funnel views.

The comms one is the visible one, and it is worth stating exactly rather than in the abstract.
`public.comms_resolve_role` (`00103_comms_rpcs.sql:37-42`) is

```sql
CASE WHEN p.role = 'admin'    THEN 'admin'
     WHEN p.role = 'designer' THEN 'designer'
     WHEN p.role = 'vendor'   THEN 'vendor'
     ELSE 'client'
END
```

so a portal self-signup designer is not merely *not* labelled `designer` — they are labelled
**`client`** in every thread they join, because `client` is the `ELSE` arm. Read off the migration on
the local stack, 2026-09-02.

Mitigating fact: real designers arrive by studio invite, which runs as `service_role` and sets the role
explicitly. The self-signup page is the path in question.

Three options, ascending cost, none taken here:
- **accept** — self-signup designers are re-roled by the invite/admin path anyway;
- **one line in the portal** — add `role: 'designer'` to that `options.data`. Cheap, but note it makes
  the role client-assertable again, which is the shape 00313's SECURITY comment deliberately refuses;
- **a small follow-up migration** — a `designer_signup` metadata flag the trigger maps server-side.

---

## N4 → **Fable** — three things from 00555 that are not this lane's to fix

### N4a — the two non-cosmetic silent degradations

`PROGRAM.md` §L0.2 says the nine degradations become a tracked W3 list **opened at apply time**, and
that the two which are not cosmetic are "flagged to Kody in the apply report, not left in the list".
Apply time is a Kody-run moment this lane has not reached, so the list is not opened; the two are
flagged here instead.

1. **`public.project_unbilled_time`** — a SECURITY INVOKER view that **INNER JOINs** `profiles` on
   `te.user_id`. Every other degradation is a LEFT JOIN that nulls a name; this one **loses the row**.
   After 00555 a time entry whose author the caller cannot see silently disappears, and the view
   **understates unbilled time**. That is a number a studio bills from.
2. **`apps/designer-portal/src/hooks/use-commercial-documents.ts:1290`** —
   `acceptance_recorded_by_profile:profiles!acceptance_recorded_by(full_name)`. Covered while the
   recorder is a studio co-member; null once they leave. It is an **audit** field, so the null is worse
   than cosmetic — it silently erases who recorded an acceptance.

### N4b — 00555's `client_profile_id` leg is dead, and so is the index it justifies

Found while writing `demo-account.sql`, by running it: `projects.client_profile_id` has FK
`fk_projects_client_profile` pointing at **`public.client_profiles`**, not `public.profiles`. So in
`can_view_profile`'s project leg —

```sql
WHERE (SELECT auth.uid()) IN (pr.designer_id, pr.client_id, pr.lead_designer_id, pr.created_by, pr.client_profile_id)
  AND p_profile_id       IN (pr.designer_id, pr.client_id, pr.lead_designer_id, pr.created_by, pr.client_profile_id)
```

— the `client_profile_id` term compares a `profiles.id` against a `client_profiles.id`. Two disjoint
uuid spaces, so it can never match.

It is **harmless**: a leg that never fires cannot widen access, and the other four terms carry the leg.
But it is dead code in a security predicate, and `CREATE INDEX idx_projects_client_profile ON
public.projects (client_profile_id)`, which the same migration adds to support it, indexes a column
nothing in the predicate can use.

**Resolved in fix round 2 — this note is now a record, not a request.** The reviewer's point stood: a
dead term in a security predicate plus an index nothing can use is not something to ship and rule on
afterwards. Both are removed (`d556fd00a`). The reasoning is now a comment on the surviving leg:

- `client_profiles.id` is its own `gen_random_uuid()` primary key with a **separate** `user_id` column
  FK'd to `auth.users`, so it is structurally a different uuid space from `profiles.id` — not merely
  empty today. Verified on the local stack (`\d public.client_profiles`).
- `projects.client_id` is FK'd to `profiles(id)` and already carries the client side, so the removal
  loses no relationship.
- `idx_fulfillment_orders_designer_profile` **stays**: `fulfillment_orders.designer_profile_id` really
  is FK'd to `profiles`, so that leg is live and the index earns the `ACCESS EXCLUSIVE` lock it takes
  during the apply. That lock is now named in `KODY-RUNBOOK.md` Step 3 rather than discovered mid-apply.

Neither `CREATE INDEX` was in PROGRAM.md §3 L0.2's outline; one is now gone and the other is documented.

### N4c — `00555_probes.md` §9c-ii could not fail; corrected

The draft probe was `pg_get_functiondef(...) LIKE '%homeowner%'`, and 00313's body already contains the
literal `'homeowner'` twice — the CASE arm that honours an explicit client hint, and its SECURITY
comment. It returned `true` on the **unfixed** function, so it certified a step it could not see.

Changed in place to `LIKE '%COALESCE(v_role, ''homeowner'')%'`, which reads the fallback expression
itself. The same vacuous shape was in the migration's own `ASSERT` and in the test file; both are fixed
on the branch, and the test now also carries a behavioural case (section 11) that no text match can
fake.

---

## N5 → **Steward** — `ScanSharingContractTests` is compile-green only, and needs a clone

`apps/mobile/Patina/PatinaTests/ScanSharingContractTests.swift` (added on this branch at `c93cff358`)
is proven to **compile** — `xcodebuild build-for-testing` returns `** TEST BUILD SUCCEEDED **`, and
before the implementation the same command failed with exactly the seven expected errors, so the suite
was red first. It has **never been executed on a simulator by this lane.**

The reason is Hard Rule 1, not an oversight: the steward cut exactly two clones (`ff-w0-l01` for L0.1,
`ff-w0-l07` for L0.7) and this lane owns neither. Running `ios-gate.sh unit` here would scrape
`head -1` and seize one of them, which is the failure mode that manufactured two phantom defects in the
gap round.

**Please run, on the integration tip, on a clone this lane is allowed to have:**

```bash
export IOS_GATE_UDID=<the integration clone's udid>
xcodebuild test \
  -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination "platform=iOS Simulator,id=$IOS_GATE_UDID" \
  -only-testing:PatinaTests/ScanSharingContractTests
```

It is a pure decoding/constant test — no network, no Supabase, no fixtures — so it should pass or fail
deterministically.

---

## N5b → **the steward, and Fable** — `searchDesigners` has no caller; say so at that level

**Correcting this lane's own earlier claim.** PROGRAM.md §3 L0.2's follow-up table, the migration's
`REQUIRED CODE FOLLOW-UPS` block and (until `cd381dd76`) this lane's own doc comment all said that
without the RPC swap *"the share-with-a-designer picker goes silently empty"*. There is no such picker:

```bash
grep -rn 'searchDesigners\|getRecentDesigners' apps/mobile --include='*.swift' | grep -v '/.build/'
```

returns only the two declarations, `PatinaTests/ScanSharingContractTests.swift:32`, and this lane's
comments. **No view, view model or coordinator calls either method — in Patina or in Capture.**

Nothing about the change is wrong: the old body was `.from("profiles")` free-text over every
`is_designer = true` row and it selected `email`, so it was a real leak, and 00555 makes that query
answer nothing regardless. What is wrong is the stated consequence. The accurate statement, now in the
code and in this lane's report, is: **the value is that a future caller cannot reintroduce the email
leak, not that a live picker is being kept alive.**

Two things follow, neither decided here:

1. **Fable** — an unreferenced `public` API with a contract test is a judgement call. Keep it (the
   share flow is a known future surface) or delete both methods with `DesignerSearchResult`. This lane
   changed a comment, not the API.
2. **Steward** — N5's request to run `ScanSharingContractTests` on a clone stands, but its priority is
   lower than N5 implied: nothing user-facing regresses if it is deferred to the integration tip.

---

## N6 → **the W0 closer** — `build/waves/w0/` is untracked, and this lane cannot commit it

Every file this lane wrote for humans — `l02-tasks.md`, `l02-notes.md` (this file), `demo-account.sql`,
`demo-account.md` and **`KODY-RUNBOOK.md`** — lives in the **main checkout** at
`/Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/`, which is
the shared path every lane reads. This lane is forbidden from running git there (a peer session may be
live in that checkout), so none of it is on the branch.

`PROGRAM.md` §7 step 7 makes committing `build/waves/<wave>/` **Fable's** job, so the outcome is
correct — but round 1's task list wrongly said this lane would commit them, and until someone does they
are exposed to `scripts/repo-gc.sh` or a stray clean. The corrected statement is in `l02-tasks.md`
Task 11.

**`-f` is required, and this is not optional pedantry.** `.gitignore:7` is a blanket `build/` rule, so
**every new file under `artifacts/…/build/` is ignored**:

```
$ git check-ignore -v artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/KODY-RUNBOOK.md
.gitignore:7:build/     artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/KODY-RUNBOOK.md
```

A plain `git add <that directory>` prints `The following paths are ignored by one of your .gitignore
files` and **adds nothing**. The files already tracked under `build/` (PROGRAM.md, the probes file) were
forced in at some point; every file this wave produced needs the same.

**Please commit, with explicit pathspecs and `-f`:**

```bash
git add -f artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/
git status --porcelain -- artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/   # confirm they staged
git commit -m "docs(first-flight): W0 wave artifacts"
```

Check the middle line actually lists the files before committing — `-f` is the difference between this
landing and silently not landing.

`KODY-RUNBOOK.md` is the one that matters most: three documents (`rulings-2026-09-02.md:30`,
`steward.md` §7 rule 1, and `l01-notes.md`) route every production mutation through it, and it did not
exist until this fix round.

---

## N7 → **the steward, and every lane minting SQL** — the migration band moved

This lane's second migration was minted as **00556** and is now **00557**
(`supabase/migrations/00557_increment_scan_upload_attempt.sql`, plus
`supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql`).

`00556` is taken by `00556_admin_studio_management.sql`, commit `d69e23f3f` on `admin-studios/build`
(also at `origin/admin-studios/build`), and it is **already applied to the shared local stack** —
`SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1`
returned `00556|admin_studio_management`. Two files at one number means one is silently skipped.

**The check that catches this, and the one that does not.** Round 1 used
`ls supabase/migrations/*.sql | sort -V | tail -5` inside this worktree, which **cannot see a peer
branch** and reported 00556 free. The check that can:

```bash
git fetch origin
git log --all --diff-filter=A --format='' --name-only -- 'supabase/migrations/*.sql' \
  | grep -E '^supabase/migrations/005[4-9][0-9]' | sort -u
git worktree list
psql "$STRATA_DB_URL" -X -q -tAc \
  "SELECT version || '|' || name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5"
```

As of 2026-09-02 that leaves **00558 as the next free number**. Anyone minting in this band should run
the three commands above rather than listing one directory, and re-run them immediately before an
apply — this is `patina-parallel-work`'s migration-collision rule, and this branch is the worked
example of what happens without it.

---

## N8 → **the steward, and the `admin-studios` session** — `00556` is gone from the shared local stack

`pnpm supabase:reset` replays **the resetting worktree's** `supabase/migrations/` directory. This
worktree does not carry `00556_admin_studio_management.sql` — it lives on `admin-studios/build`
(`d69e23f3f`) — so this lane's resets dropped it. The ledger now reads:

```
00557|increment_scan_upload_attempt
00555|ios_round_one_security
00554|onboarding_review_fixes
00553|invite_expiry_sweep
00552|notification_log_status_sent
00551|test_login_rate_limit
```

`00556` is not in it, and neither are its objects.

This was expected and is not a defect — but the consequence lands on a session **outside this program**,
whose local stack silently no longer has its own tables. Two actions:

1. **Steward** — carry this into the wave handoff, not only into a lane task list. Per `steward.md` §4
   the remaining W0 reset owners are **L0.3** then **L0.7**, and both reset from trees that also lack
   00556, so the situation persists for the rest of the wave.
2. **Whoever resumes `agent-admin-studios`** — re-apply 00556 from that worktree, or reset from it:

```bash
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-admin-studios
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -X -q -v ON_ERROR_STOP=1 -f supabase/migrations/00556_admin_studio_management.sql
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -c \
  "INSERT INTO supabase_migrations.schema_migrations (version, name)
   VALUES ('00556','admin_studio_management') ON CONFLICT DO NOTHING;"
```

Nothing on Strata is affected — 00556 is a local-stack question only, and this lane never touched prod.

---

## N9 → **the W0 closer** — N6, with the priority raised: commit `build/waves/w0/` BEFORE the apply

N6 established the mechanics: `build/waves/w0/` is written into the **main checkout**, the directory is
gitignored, this lane may not run git there, and PROGRAM.md §7 step 7 makes committing it the closer's
job. This note changes only **when**.

`KODY-RUNBOOK.md` (18 KB), `demo-account.sql` (20 KB) and `demo-account.md` (15 KB) are the whole output
of a KODY-RUN lane. None of them appears in `git diff main...HEAD`; `git ls-tree --name-only main
artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/` is empty. So today:

- a reviewer given only the branch sees the SQL and none of the apply discipline; and
- the runbook Kody will follow **during a production apply** is under no version control, where an
  accidental edit or a `scripts/repo-gc.sh` sweep loses it with no trace.

**Do this before Kody runs `KODY-RUNBOOK.md` Step 3, not at wave close** (`-f` because the path is
gitignored, explicit pathspec because `git add -A` is banned):

```bash
cd /Users/kody/Code/patina-merged
git add -f artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/
git commit -m "docs(first-flight): commit W0 wave files — runbooks, task lists and notes"
```

(`00555_probes.md` needs no line here — it is **already tracked**, and this lane's fix round committed
it on the branch at `8a519f271`.)

**And the reason this is not bookkeeping.** The same hazard already produced a false review finding.
`00555_probes.md` existed twice — tracked on the branch, and as an untracked, pre-round-2 duplicate at
the same path in the main checkout. The reviewer read the duplicate and filed `RL02-22` against
placeholders that had been gone since round 2; this lane then edited the duplicate before noticing, and
briefly "corrected" `KODY-RUNBOOK.md` to match the duplicate's stale section numbering. Both were
reverted, and the stale copy was overwritten from the branch so the two now agree byte-for-byte.

A stale twin that fooled a reviewer with a checkout in front of them will fool Kody mid-apply. The
runbook now names the heading numbers that tell the copies apart and says to read the tracked one — but
the durable fix is that the wave files stop being untracked, which is what this note asks for.

---

## N10 → **Fable** — two profile-write legs 00555 deliberately does NOT close

Named so they are read as decisions rather than mistaken for oversights when someone audits the
migration against the blocker it closes (`RL02-18`).

**1. `designer_clients` is still self-INSERTable with an arbitrary `client_id`.** Its policy is
`"Designers can manage their clients"` — `FOR ALL`, `TO PUBLIC`, `USING (auth.uid() = designer_id)`,
**no `WITH CHECK`** (00014:110) — and `has_table_privilege('authenticated','public.designer_clients',
'INSERT')` is `t`. For an INSERT a NULL `WITH CHECK` falls back to the `USING`, so any authenticated
user can manufacture a roster row naming themselves as the designer and anyone at all as the client, and
then edit that client's profile through `"Designers can update their client profiles"`.

00555 now pins the **role** on that leg (`WITH CHECK … AND role = 'homeowner'`), which is the blocker.
It does **not** close the write itself. Doing that means a `WITH CHECK` on another table's policy,
minted by a different migration, in front of a live designer-portal Add Client flow — **W2**, and it
belongs with the `profile_private` PII split DM-1 already put there. PROGRAM.md §3 L0.2's outline takes
the same line on this family: it flags `"Designers can create homeowner profiles"` and leaves it
untouched.

**2. `"Users can insert own profile"` carries no role constraint.** A user with **no** `profiles` row
could insert one naming any role. There is no path to that state today — `handle_new_user()` is SECURITY
DEFINER and creates the row at signup, and 00555 revokes `DELETE` on `profiles` from `authenticated`, so
a signed-in caller cannot remove their own row and re-create it. Recorded rather than fixed, because
PROGRAM.md's outline pins that policy's text verbatim.

Both are read-consistent with what the migration's own header claims: it closes **role
self-elevation**, which it now genuinely does on both UPDATE legs.
