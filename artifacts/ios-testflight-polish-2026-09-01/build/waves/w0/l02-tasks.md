# W0 · L0.2 — Production backend PREP (agent half) — task list

**Branch** `first-flight/w0-l02` · **Worktree**
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02`

**Round 2 (fix round, 2026-09-02).** Round 1 shipped six commits (`40baaf53e` … `c93cff358`). The
adversarial review returned **17 findings** — 1 blocker, 5 major, 11 minor. This file is rewritten for
the fix round; the round-1 task list is preserved in the branch history at `c93cff358`. Every task below
names the finding id it closes.

**Round 3 (second fix round, 2026-09-02).** Round 2 shipped four commits (`5d491eff7` …
`dc120844d`). The second adversarial review returned **8 findings** — 1 blocker (`RL02-18`, the role
pin is bypassable through a sibling policy) and 7 minor. Round 3's tasks are at the foot of this file,
under **"Round 3 — the second fix round"**; the round-2 tasks and gate evidence above are left intact
as the record of what they closed.

---

## The four standing lines (PROGRAM.md §7 step 2)

### 1. `IOS_GATE_UDID`

**This lane does not own a simulator clone.** The steward cut exactly two — `ff-w0-l01`
(`8ED58095-6FFA-4411-B715-73C98805C874`, L0.1's) and `ff-w0-l07`
(`BD0AC7E5-EF5E-4C64-85A7-825D0CEA7BE8`, L0.7's) — and Hard Rule 1 forbids sharing one. So there is no
`IOS_GATE_UDID` to export here and **no tier that takes a udid may be run by this lane**:
`ios-gate.sh unit`, `ui` and `all` are all out (they still scrape `head -1` until L0.1's change lands,
and would seize another lane's clone).

What this lane runs instead, and what it therefore may claim:

```bash
# compile-green only — a GENERIC destination, no udid, no clone
xcodebuild build \
  -project /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02/apps/mobile/Patina/Patina.xcodeproj \
  -scheme Patina -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02/apps/mobile/Patina/.build/DerivedData \
  CODE_SIGNING_ALLOWED=NO
```

`PatinaTests/ScanSharingContractTests` is **compile-green, not sim-verified**. Sim-verification of that
suite passes to the integration steward, who owns a clone. Said again in the report.

### 2. The VISION check

*Name any finding in my table whose fix would add or entrench something VISION §6 refuses (tab / zone /
dashboard UI, shadows, red/green status, badges, engagement optimisation, the "AI" label) and say why it
survives.*

**Answer: none, and the reason is structural.** This lane's whole surface is SQL, generated TypeScript
types, one Swift service method, and Kody-run runbooks. It renders nothing. `A3-04`, `A3-05` and `A3-15`
are a policy replacement, a grant revoke and an account mint — none of them can put a tab, a shadow, a
badge or a status colour on a screen. The nearest thing to a UI consequence is the *removal* of a leak
(`search_shareable_designers` returns four columns where the old query returned five, dropping `email`),
which subtracts from a surface rather than adding to it. The word "AI" appears nowhere in any string
this lane authors — checked over the migration, both test files, both runbooks and the Swift diff:

```bash
grep -rniE '\bA\.?I\.?\b|artificial intelligence|machine learning' \
  supabase/migrations/00555_ios_round_one_security.sql \
  supabase/migrations/00557_increment_scan_upload_attempt.sql \
  supabase/tests/rls/00555_ios_round_one_security.test.sql \
  supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql \
  apps/mobile/Patina/Patina/Services/Sharing/ScanSharingService.swift
# expect: no output
```

One VISION-adjacent judgement is escalated rather than decided (**N3b**, below): 00555 §a2(ii) changes
who a metadata-less signup becomes. That is a product question about identity, not a UI question, and it
goes to Kody as a gate on the apply (**RL02-03**).

### 3. The notes I must apply

Integration notes addressed to L0.2 by other lanes, as numbered tasks.

| From | Note | Where it lands |
|---|---|---|
| — | **None.** `build/waves/w0/l01-notes.md`, `l02b-notes.md`, `l03-notes.md` and `l07-notes.md` were re-read at the top of this fix round; none carries a note addressed to L0.2. | — |

The review findings themselves are the input to this round; they are the table below, not notes.

### 4. The notes I will send

Written in full, with exact final text, at `build/waves/w0/l02-notes.md`. Summary:

| # | To | Subject |
|---|---|---|
| N1 | **L0.2b** | The two RPC signatures 00555 ships (`search_shareable_designers`, `list_vendor_profiles`) |
| N2 | **L1-B** | The exact 24-column product select that replaces `*` (`A3-18`) |
| N3a | **L1-A** | `AppleSignInRoleTests` asserts `profiles.role` server-side, not the client write |
| **N3b** | **Kody, via Fable** | ⚠ **DECISION GATE ON THE APPLY**: 00555 §a2(ii) re-roles designer-portal self-signups to `homeowner`, and `comms_resolve_role`'s `ELSE` arm then labels them `client` in every thread. Ruling required **before** Step 3 of `KODY-RUNBOOK.md` (**RL02-03**) |
| N4a/b/c | **Fable** | The two non-cosmetic silent degradations · 00555's dead `client_profile_id` leg · the probe that could not fail |
| N5 | **Steward** | `PatinaTests/ScanSharingContractTests` is compile-green only; it needs a clone |
| N6 | **W0 closer** | `build/waves/w0/` is written into the **main checkout** and this lane cannot commit it (**RL02-10**) |
| N7 | **Steward, and every lane minting SQL** | Migration band moved: this lane is now **00557**, not 00556; 00558 is the next free number (**RL02-01**) |

---

## Global constraints this round inherits

- **No production writes of any kind.** No `psql` against Strata, no Supabase MCP `apply_migration` or
  write `execute_sql`, no `asc`, no Sanity write, no PostHog change, no `wrangler deploy`, no
  `supabase functions deploy`, no `supabase db push`. Every prod step is a **Kody-run line** written
  into `build/waves/w0/KODY-RUNBOOK.md` (Task 9) and repeated in the lane report's `kodyRun`.
- **Never a placeholder in a command.** Not `<angle brackets>`, not `PASTE_THIS`, not "the uuid from the
  query above". Variables are assigned at the top of the shell, by command substitution where the value
  comes from the database. (`feedback_deploy_placeholder_incident_2026_08_26`; **RL02-05**.)
- **Never run git in the main checkout.** `git rev-parse --show-toplevel` before every git command; it
  must print this worktree.
- **Pathspec commits only**, Conventional Commits, no push.
- **Markdown, SQL and shell files are written with Write/Edit, never a Bash heredoc** — the
  prod-mutation hook pattern-matches inside heredocs and aborts mid-file.
- `supabase` CLI, `docker` and `git worktree` need `dangerouslyDisableSandbox: true`.

---

## The gate that decides this lane

```bash
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02
pnpm supabase:reset                              # replays THIS worktree's migrations + seeds
bash scripts/run-sql-tests.sh 2>&1 | tee /tmp/ff-l02-sql-round2.log
```

Pass = **zero unexpected failures**, every EXPECTED-FAIL name already in
`supabase/tests/KNOWN_FAILURES.md`, nothing added to that file, and both of this lane's test files among
the passes. The tail is pasted into the report verbatim (**RL02-15**).

Secondary gates: `cd packages/supabase && pnpm type-check` (clean), and the `xcodebuild build` line
above, run **twice** (attempt 1 fails on the gitignored `GitCommit.swift` in a fresh worktree — expected,
`A2-08`).

### ⚠ Reset ownership, round 2

`pnpm supabase:reset` destroys the shared local database. The W0 sequence (steward §4) gave L0.2 the
first slot, and that slot is spent — L0.3 and L0.7 have both reset since. **Before resetting in this
round, re-check the peer locks** and wait rather than reset over a live lane:

```bash
for d in l01 l02 l02b l03 l07; do
  p="/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-$d/.writer.lock.d"
  if [ -d "$p" ]; then echo "LOCKED: $d"; else echo "free:   $d"; fi
done
```

Only `l02` (this lane) may be locked when the reset runs. Announce start and finish in the report.

---

## Task 1 — Renumber this lane's migration 00556 → 00557 (**RL02-01**, blocker)

**Why.** `00556_admin_studio_management.sql` already exists on `admin-studios/build` (commit
`d69e23f3f`, also at `origin/admin-studios/build`) **and is already applied to the shared local stack**.
Two files at one number means one of them is silently skipped. `ls supabase/migrations` inside a single
worktree cannot see a peer branch — that is why round 1 missed it.

**Step 1 — prove the collision and pick the free number, with a command that can actually see peers.**

```bash
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02
git rev-parse --show-toplevel
git worktree list
git log --all --diff-filter=A --format='' --name-only -- 'supabase/migrations/*.sql' \
  | grep -E '^supabase/migrations/005[4-9][0-9]' | sort -u
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q -tAc \
  "SELECT version || '|' || name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 3"
```

Expect `00556_admin_studio_management.sql` in the git list **and** `00556|admin_studio_management` as the
local head. Expect nothing at `00557`.

**Step 2 — rename both files.**

```bash
git mv supabase/migrations/00556_increment_scan_upload_attempt.sql \
       supabase/migrations/00557_increment_scan_upload_attempt.sql
git mv supabase/tests/rls/00556_increment_scan_upload_attempt.test.sql \
       supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql
```

**Step 3 — update every in-file reference** (Edit, not sed): the migration's banner line 2, its
band-recheck paragraph (replace the `ls | sort -V | tail -3` recipe with the `git log --all` +
`git worktree list` recipe, which is the one that can see a peer branch), its AFTER-APPLY block; the test
file's banner and its `-f` run line and its final `RAISE NOTICE`.

**Step 4 — regenerate the seed and re-run.**

```bash
python3 scripts/generate-legacy-grants.py
grep -n '00557_increment_scan_upload_attempt' supabase/seed/00-legacy-grants.sql
grep -c '00556_increment_scan_upload_attempt' supabase/seed/00-legacy-grants.sql   # expect 0
```

**Step 5 — commit.**

```
git add supabase/migrations/00557_increment_scan_upload_attempt.sql \
        supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql \
        supabase/seed/00-legacy-grants.sql
git commit -m "fix(db): renumber increment_scan_upload_attempt to 00557 — 00556 is taken by admin-studios"
```

---

## Task 2 — Delete the stale 00555 draft duplicates (**RL02-02**, major)

**Why.** `40baaf53e` is titled "move … into the tree" but copied. The draft at
`build/migrations-draft/00555_ios_round_one_security.sql` has since diverged by 207 lines and still
carries three things the tree copy fixed: no `handle_new_user` body (it tells the applier to "copy it
from the live definition at apply time"), the recursive inline `WITH CHECK` that this lane proved raises
`42P17`, and the vacuous `LIKE '%homeowner%'` assert. PROGRAM.md §3 L0.2 points readers at that folder.

**Step 1 — confirm the divergence, then remove.**

```bash
diff supabase/migrations/00555_ios_round_one_security.sql \
     artifacts/ios-testflight-polish-2026-09-01/build/migrations-draft/00555_ios_round_one_security.sql \
  | wc -l
git rm artifacts/ios-testflight-polish-2026-09-01/build/migrations-draft/00555_ios_round_one_security.sql \
       artifacts/ios-testflight-polish-2026-09-01/build/migrations-draft/00555_ios_round_one_security.test.sql
```

**Step 2 —** `00555_probes.md` **stays** (it is the live probe script). Edit a pointer block into its
head naming `supabase/migrations/00555_ios_round_one_security.sql` and
`supabase/tests/rls/00555_ios_round_one_security.test.sql` as the only copies, so a reader who lands in
`migrations-draft/` from PROGRAM.md is redirected rather than left with nothing.

**Step 3 — commit** (pathspecs, three files).

---

## Task 3 — Harden 00557: schema-qualify and pin `search_path` (**RL02-11**, minor)

**Why.** `UPDATE room_scans …` is unqualified and the function has no `SET search_path`. It is a faithful
mirror of 00082 (D13 asked for the mirror), so it is not a rule break — but the schema-qualification rule
exists because of the 00282 incident, where a bare name passed locally and failed on Strata with `42883`
under the push session's `search_path`, and Supabase's linter raises `function_search_path_mutable` on
it. Zero behaviour change; the function stays SECURITY INVOKER.

**Step 1 — make the test fail first.** Add to
`supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql` an assertion that the function's
`proconfig` pins `search_path` and that its body names `public.room_scans`. Run the file alone:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q -v ON_ERROR_STOP=1 \
  -f supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql
```

Expect the new assertion to fail (the function on the stack has neither).

**Step 2 — implement** in `00557_…sql`: `UPDATE public.room_scans` and `SET search_path TO 'public'`,
with a one-line comment naming the 00282 reason (a constraint the code cannot show). Re-run after the
reset in Task 8.

**Step 3 — commit.**

---

## Task 4 — 00555 test: the two policies with no behavioural coverage (**RL02-06**, major)

**Why.** `profiles_select_admin` and `profiles_select_agent_reader` are asserted by **name only**
(line 691), while the file header claims section 2 covers "admin". Both are load-bearing: the migration's
own comment names `profiles_select_admin` as what keeps `use-audit-logs.ts:108`,
`use-onboarding.ts:208/:242` and `use-insights.ts:97` alive on the browser client, and
`profiles_select_agent_reader` is the entire Agent-OS read path. Either is the kind of upstream RLS that
changes under someone else's migration and blanks the admin portal with a green suite.

**Step 1 — failing test.** New section `2k` and `2l`:

- `2k` — a fixture user holding a `user_roles` row against a `roles` row with `domain = 'admin'`
  (looked up by domain, never a hard-coded seeded uuid) reads Mal's unrelated profile as `authenticated`
  and gets **1**.
- `2l` — `SET LOCAL ROLE agent_reader` reads a profile and gets **1**.

Both fail today because the fixtures do not exist. Run the file alone; watch them fail.

**Step 2 — add the fixtures** (an `auth.users` + `profiles` pair for the admin, and the `user_roles` row)
and re-run: both pass.

**Step 3 — correct the header** so its "Covers" list names admin and agent_reader as *behavioural* cases
rather than implying section 2 already had them.

**Step 4 — commit.**

---

## Task 5 — 00555 test: `list_vendor_profiles`, the anon products⋈vendors embed, and the wildcard floor

Three review findings, one file, one commit.

**5a — `list_vendor_profiles()` has zero coverage (RL02-07, minor).** It is the RPC L0.2b's FF-01c swaps
onto, and the reason D8 orders the portal deploy ahead of the apply. A cross-lane contract with no
behavioural test is the one that breaks quietly. Add beside section 8: a vendor-role profile fixture;
then as an authenticated fixture user `SELECT count(*)` returns that row, the returned column list is
exactly `id, full_name, avatar_url`, and anon executing it raises `insufficient_privilege`.

**5b — no test joins products to vendors as anon (RL02-13, minor).** The entire rationale for choosing
column grants over a `vendor_cards` view is that `ProductAPIClient`'s
`*,vendors!products_vendor_id_fkey(name,made_in,brand_story)` embed resolves through the base-table FK,
and that a broken embed reproduces `A3-01` (`withholdingUnresolvedMakers` drops every product). Section 5
asserts the columns individually and never joins the two tables. Add a `layer='catalog'` product fixture
pointing at the section-5 vendor, and under `assume_anon`:
`SELECT count(*) FROM public.products p JOIN public.vendors v ON v.id = p.vendor_id WHERE p.id = <fixture>`
returns **1**. That turns prod probe 4 into a pre-apply gate.

**5c — a wildcard defeats the two-character floor (RL02-14, minor).** `p_query` is a parameter so this is
not injection, but `%` and `_` are wildcards *inside* the pattern: `'%a'` is two characters and matches
every name containing `a` — precisely what the floor exists to prevent. `LIMIT 20` caps it and the
returned columns carry no email, so the impact is small; the floor should still mean what it says.
Migration change: escape the metacharacters before interpolation. Test case `8h`: `'%a'` returns **0**.

**Step order:** write `8h`, `5e`, and the `list_vendor_profiles` cases → run the file → watch `8h` fail
and the others fail on missing fixtures → add fixtures + the migration's escaping → re-run → commit.

---

## Task 6 — 00555 comment: correct the "share picker goes silently empty" framing (**RL02-16**, minor)

**Why.** `grep -rn --include="*.swift" "searchDesigners\|getRecentDesigners" apps/mobile/` returns only
`ScanSharingService.swift` and the new `ScanSharingContractTests.swift`. **No view in either iOS app
calls it.** The swap is still correct and still required — 00555 does break the old query, and the old
query did hand any signed-in client every designer's email, which is reason enough — but nothing
user-visible was at risk and nothing user-visible changed. REQUIRED CODE FOLLOW-UP 1 says "the
share-with-a-designer picker goes silently empty", which would send Fable to schedule a walker against a
screen that does not exist.

Rewrite that paragraph so the **email leak** is the recorded justification and the picker is described as
what it is: an unwired service API. Same correction in the lane report and in `l02-notes.md`.

**Commit** with the migration pathspec.

---

## Task 7 — `00555_probes.md`: section numbers, and the two colliding `/tmp` files (**RL02-17**, minor)

**Why.** PROGRAM.md §3 L0.2's exit criteria say "Probes 1-5 and 9b/9d/9f return the after values", where
9b is the PUBLIC/FOR ALL policy sweep, 9d the vendors column allowlist and 9f the UPDATE `WITH CHECK`.
The probes file's own `9b` is `list_vendor_profiles`, its `9c` is role self-elevation, the policy sweep
is `§10` and the vendors allowlist is inside `§3` — so a Kody following the exit-criteria wording lands
on the wrong section. Separately, `§9` writes `/tmp/p9b.json` while `§9b` writes `/tmp/p9d.json`: two
sections, crossed filenames.

**Fix.** Add an exit-criteria cross-reference table at the head of the file mapping each name PROGRAM.md
uses onto this file's heading, renumber the three SQL probes to the `9b` / `9d` / `9f` names the exit
criteria actually cite, and give each `curl` a `/tmp` filename that matches its own section. The
canonical checklist also goes into `KODY-RUNBOOK.md` (Task 9) naming headings, not bare numbers.

**Commit.**

---

## Task 8 — Run the gate, capture the output (**RL02-15**, minor)

**Why.** PROGRAM.md's claim rule is "report every claim at its level with command output, never a
paraphrase", and this is the claim that decides whether the migration is correct. Round 1 asserted the
suite green with no captured log, and it can no longer be reproduced from that report.

**Step 1** — re-check the peer locks (above). **Step 2** — announce the reset. **Step 3**:

```bash
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02
pnpm supabase:reset
bash scripts/run-sql-tests.sh 2>&1 | tee /tmp/ff-l02-sql-round2.log
tail -20 /tmp/ff-l02-sql-round2.log
grep -E '^(PASS|FAIL|EXPECTED-FAIL) ' /tmp/ff-l02-sql-round2.log | grep -E '0055[57]'
```

**Step 4** — diff every EXPECTED-FAIL name against `supabase/tests/KNOWN_FAILURES.md`. A **new** name is
a stop, not a note. Nothing is added to that file.

**Step 5** — `packages/supabase` type-check, and the `xcodebuild build` line twice.

**Step 6** — paste all four tails verbatim into the report.

---

## Task 9 — Write `build/waves/w0/KODY-RUNBOOK.md` (**RL02-04**, major)

**Why.** `rulings-2026-09-02.md:30` ("Every prod mutation is a Kody-run step in
`build/waves/w0/KODY-RUNBOOK.md`"), `steward.md` §7 rule 1 and `l01-notes.md` all route production
through that file, and `ls build/waves/w0/` shows it **does not exist**. The demo-account half of this
lane got a runbook; the 00555/00557 apply chain — the highest-risk step in W0 — exists only as prose in
PROGRAM.md §3.

**Contents, every command a literal:**

1. **Step 0 — the deploy gate (not SQL).** `git log --oneline -1 -- apps/designer-portal packages/supabase/src/hooks`
   shows L0.2b merged, **and** `wrangler deployments list --name patina-designer-portal` shows a newer
   bottom row (oldest-first — read the **bottom** row). Either false → **stop**.
2. **Step 0b — the ruling gate (RL02-03).** Named, blocking, with the three options spelled out. The
   apply cannot proceed with N3b open.
3. **Step 1 — re-check the migration band** with the `git log --all` + `git worktree list` recipe, not
   `ls` in one worktree, and **again immediately before the apply**.
4. **Step 2 — prove it locally first:** `pnpm supabase:reset` + the whole SQL suite vs
   `KNOWN_FAILURES.md`.
5. **Step 3 — apply the two files, one at a time**, `-v ON_ERROR_STOP=1`, then the two
   `schema_migrations` INSERTs. Never `supabase db push` (it drags every migration Strata lacks).
6. **Step 4 — regenerate:** `generate-legacy-grants.py`, `pnpm db:generate`.
7. **Step 5 — probes**, naming `00555_probes.md`'s headings.
8. **Step 6 — advisors**: `security_definer_view` ERROR count must hold at **21**.
9. **Step 7 — the portal walk** (half of G3), then open `build/waves/w3/00555-degradations.md`.
10. **Rollback**, with the warning that it re-opens the exposure.
11. **What Kody is being told, in one line each**: the two non-cosmetic degradations
    (`project_unbilled_time` loses rows; `use-commercial-documents.ts:1290` is an audit field), and
    **RL02-12** — `can_view_profile` is EXECUTEable by every authenticated user in the PostgREST-exposed
    `public` schema, so it is a relationship oracle. DM-1 ruled on the anon read and the PII split; it did
    not rule on this. Nothing needs to change to ship (Postgres checks policy-function EXECUTE at
    executor-init, so the grant is required), but it goes in the apply report, not only in a SQL comment,
    and the helper moves to a non-exposed schema in the W2 `profile_private` migration.

---

## Task 10 — `demo-account.md` and `demo-account.sql` (**RL02-05**, **RL02-08**, **RL02-09**)

**10a — the three placeholders (RL02-05, major).** Step 3 carries
`WHERE m.user_id = 'PASTE_THE_PROFILE_ID_FROM_THE_QUERY_ABOVE'`,
`export DESIGNER_PROFILE_ID="the uuid from the first query"` and
`export STUDIO_ID="the uuid from the second query"`; Step 7a carries
`"code":"THE_VALUE_OF_app.settings.test_login_code"`. All four are against PROGRAM.md §2's build gate
("never a placeholder in a command") and against this lane's own Global Constraints. All four are
avoidable with command substitution, each followed by an echo of the resolved value (or its length, for
the secret) so a wrong match is caught **before** Step 5 writes.

**10b — Step 7a expects the wrong key (RL02-08, minor).** The function returns
`json({ token_hash: result.tokenHash })` (`supabase/functions/test-account-login/lib.ts:256`);
`hashed_token` is only GoTrue's internal property name at `index.ts:130`. As written, a correct success
reads as a failure. (The rate-limit numbers in the same step — 20/IP, 300 global, 15 min — are correct.)

**10c — V5 always prints `f` (RL02-09, minor).** Kody runs the file over `$STRATA_DB_URL` as `postgres`,
where `auth.uid()` is NULL, so `can_view_profile`'s `(SELECT auth.uid()) IS NOT NULL` guard returns false
unconditionally. A verification block that cannot pass invites a false alarm at the one moment production
has just been written. Wrap V5 in the same `set_config` / `SET LOCAL ROLE authenticated` / `RESET`
sequence Step 7b already uses, so it answers truthfully — both directions.

---

## Task 11 — `l02-notes.md`, and who commits `build/waves/w0/` (**RL02-10**, minor)

`demo-account.sql`, `demo-account.md`, `l02-notes.md` and this file live in the **main checkout**
(`/Users/kody/Code/patina-merged/artifacts/…/build/waves/w0/`), which this lane is correctly forbidden
from running git in. Round 1's task list said Task 7 Step 5 and Task 8 Step 2 would end in
`git add … && git commit`; those commits could not have happened and did not.

PROGRAM.md §7 step 7 makes committing `build/waves/<wave>/` **Fable's** job, so the outcome is correct —
the task list was wrong. This file now says so, and **N6** tells the closer explicitly, because until
then the deliverables are untracked and exposed to `scripts/repo-gc.sh` or a stray clean.

**And the closer needs `git add -f`.** `.gitignore:7` is a blanket `build/` rule:

```
$ git check-ignore -v artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/KODY-RUNBOOK.md
.gitignore:7:build/     artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/KODY-RUNBOOK.md
```

A plain `git add` of that directory warns and stages **nothing**. N6 carries the working command and a
`git status --porcelain` line to confirm the files actually staged.

Rewrite `l02-notes.md` with N1–N7 in final text, N3b marked as a **decision gate on the apply**, and N7
carrying the new migration number.

---

---

## Gate evidence — fix round, 2026-09-02 (**RL02-15**)

Round 1 asserted the suite green with no captured output and it could not be reproduced. This is the
output, verbatim.

**Reset announced and finished.** Peer locks were re-checked immediately before: only `l02` was held.
`pnpm supabase:reset` from this worktree, then:

```
================ summary ================
total:             146
green:              125
expected-fail:      21  (documented in supabase/tests/KNOWN_FAILURES.md)
unexpected-fail:    0
effective-green:    146 / 146  (green + expected-fail)
===========================================
```

Both of this lane's files among the passes:

```
PASS   supabase/tests/rls/00555_ios_round_one_security.test.sql            1s
PASS   supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql     0s
```

The stop condition — a failure name not already allowlisted — did not fire:

```
actual expected-fail files: 21
allowlist entries:          22
=== any actual expected-fail NOT in the allowlist? ===
-> 0 new names
=== allowlisted files that actually PASSED (safe direction) ===
supabase/tests/edge_api/public_acl_exception_registry.sql
```

`git status --porcelain -- supabase/tests/KNOWN_FAILURES.md` is empty — **nothing was added to the
allowlist to make this pass.**

The reset applied both migrations from this worktree's tree:

```
00557|increment_scan_upload_attempt
00555|ios_round_one_security
00554|onboarding_review_fixes
```

and all five functions exist: `can_view_profile`, `current_profile_role`,
`increment_scan_upload_attempt`, `list_vendor_profiles`, `search_shareable_designers`.

> ⚠ **Side effect worth naming.** A reset replays *this worktree's* migrations, and this worktree does
> not carry `00556_admin_studio_management.sql` (it is on `admin-studios/build`). That migration was on
> the shared local stack before this reset and is not after —
> `SELECT count(*) … WHERE version='00556'` now returns `0`. Expected, not a defect, but the
> admin-studios session will need its own reset or re-apply.

**Secondary gates.**

```
cd packages/supabase && pnpm type-check   →  tsc --noEmit, no output, rc=0

xcodebuild build … -destination 'generic/platform=iOS Simulator' … CODE_SIGNING_ALLOWED=NO
  === ATTEMPT 1 ===  ** BUILD SUCCEEDED **
  === ATTEMPT 2 ===  ** BUILD SUCCEEDED **
  (GitCommit.swift already generated by round 1's build, so A2-08's first-build
   failure did not recur in this worktree)

xcodebuild build-for-testing …        →  ** TEST BUILD SUCCEEDED **
```

**Negative checks — proof the new cases are load-bearing, not decoration.** Each applies 00555 inside a
transaction, breaks one thing, runs the test file, and rolls back:

| Break | Result |
|---|---|
| `DROP POLICY profiles_select_admin` | `ERROR: FAIL 2k: an admin-domain role holder must read an unrelated profile, got 0` |
| `DROP POLICY profiles_select_agent_reader` | `ERROR: FAIL 2l: agent_reader must read a profile, got 0` |
| `DROP POLICY products_catalog_select_anon` | `ERROR: FAIL 5e: anon cannot join products to vendors — the iOS product embed is broken, got 0` |
| the 00082-shaped 00557 function (unqualified, unpinned) | `ERROR: FAIL 5a: increment_scan_upload_attempt does not pin search_path` |

The wildcard fix was measured directly rather than asserted: pattern for `%a` is `%\%a%`,
`'Dana' ILIKE that ESCAPE '\'` → **`f`**, `'Dana' ILIKE '%Da%'` → **`t`**, `'%a x' ILIKE that` → **`t`**.

**The claim level, said plainly.** Everything above is *local* or *compile-green*.
`PatinaTests/ScanSharingContractTests` has never run on a simulator — this lane owns no clone (N5).
Nothing on this branch has touched Strata.

---

## Findings this lane closes (unchanged from round 1)

| id | tier/sev | title |
|---|---|---|
| `A3-04` | T0/blocker | All 24 production profiles readable by the anon key |
| `A3-05` | T0/blocker | anon holds ALL on `notification_preferences` |
| `A3-15` | T0/major | the demo account's notification feed is designer-portal messages |

Plus **D13** (`increment_scan_upload_attempt`, now 00557) and **D7/D11** (the demo account).

---
---

# Round 3 — the second fix round (2026-09-02)

Eight findings: `RL02-18` (blocker) and `RL02-19` … `RL02-25` (minor). The lane owns the same file set
as round 2; nothing new is claimed.

## The four standing lines, re-answered for round 3

### 1. `IOS_GATE_UDID`

**Unchanged and still not applicable — this lane owns no simulator clone.** The steward cut two
(`ff-w0-l01` `8ED58095-6FFA-4411-B715-73C98805C874`, `ff-w0-l07`
`BD0AC7E5-EF5E-4C64-85A7-825D0CEA7BE8`) and Hard Rule 1 forbids sharing one, so `ios-gate.sh unit`,
`ui` and `all` stay out of this lane and the iOS claim level stays **compile-green**:

```bash
xcodebuild build \
  -project /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02/apps/mobile/Patina/Patina.xcodeproj \
  -scheme Patina -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02/apps/mobile/Patina/.build/DerivedData \
  CODE_SIGNING_ALLOWED=NO
```

Round 3 touches exactly one Swift line group — a doc comment (`RL02-21`) — so the build is a
regression check, not a claim of new behaviour.

### 2. The VISION check

*Name any finding in my table whose fix would add or entrench something VISION §6 refuses.*

**Answer: none.** Round 3's eight findings are a policy WITH CHECK, a dropped index, a dead predicate
term, four documentation corrections and one test case. Nothing renders. `RL02-18`'s fix *removes* a
privilege path; `RL02-20`'s *removes* a term and an index; `RL02-21` corrects a sentence that overstated
a user-visible consequence, which is the VISION-adjacent one and it resolves toward saying less, not
more. The `grep` for the "AI" label is re-run over the round-3 diff in the gate section.

### 3. The notes I must apply

| From | Note | Where it lands |
|---|---|---|
| — | **None.** `l01-notes.md`, `l02b-notes.md`, `l03-notes.md` and `l07-notes.md` re-read at the head of round 3; no note is addressed to L0.2. | — |

The eight review findings are the input to this round.

### 4. The notes I will send

Round 2's N1–N7 stand. Round 3 **adds three** and **rewrites one**, with exact final text in
`build/waves/w0/l02-notes.md`:

| # | To | Subject |
|---|---|---|
| **N4b** (rewritten) | **Fable** | The dead `client_profile_id` leg is no longer an open question — round 3 **removed** it and the index cut for it (`RL02-20`). The note becomes a record, not a request. |
| **N5b** (rewrites N5's claim) | **Steward + Fable** | `ScanSharingService.searchDesigners` has **no caller** in either iOS app. The RPC swap's value is that a future caller cannot reintroduce the email leak — not that a live picker is kept alive (`RL02-21`). |
| **N8** (new) | **Steward, and the `admin-studios` session** | This lane's resets removed `00556_admin_studio_management` from the shared local stack (`RL02-24`). |
| **N9** (new) | **W0 closer — priority raised** | `build/waves/w0/` must be committed with `git add -f` **before** Kody runs `KODY-RUNBOOK.md` Step 3, not at wave close (`RL02-25`). |
| **N10** (new) | **Fable** | Two profile-write legs 00555 deliberately does **not** close, named so they are not mistaken for oversights (`RL02-18` residue). |

---

## Task 1 — `RL02-18` (blocker): the role pin is bypassable through a sibling policy

**The defect, reproduced before anything was changed.** `public.profiles` carries a *second* permissive
UPDATE policy, `"Designers can update their client profiles"` (00017:19) — `FOR UPDATE`, `TO PUBLIC`,
`USING (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM designer_clients dc WHERE dc.client_id =
profiles.id AND dc.designer_id = auth.uid()))`, and **no `WITH CHECK`**. Postgres ORs the permissive
`WITH CHECK`s for an UPDATE, and a NULL `WITH CHECK` reuses that policy's `USING`, so a new row need
satisfy only *one* of them and 00555's role pin is simply skipped. `designer_clients` is
self-INSERTable: `"Designers can manage their clients"` (00014:110) is `FOR ALL` / `TO PUBLIC` /
`USING (auth.uid() = designer_id)` with no `WITH CHECK`, and `authenticated` holds `INSERT`.

Reproduced on the local stack with 00555 applied, as the seeded `client@patina.dev`
(`a0000000-0000-0000-0000-000000000005`, `role='homeowner'`), in a rolled-back transaction:

```
STEP1 RESULT | blocked: new row violates row-level security policy for table "profiles"
STEP2 RESULT | self-roster INSERT SUCCEEDED
STEP3 RESULT | UPDATE SUCCEEDED
ROLE AFTER ROSTER ATTEMPT | designer
```

**1a — failing test first.** Extend case 7c in
`supabase/tests/rls/00555_ios_round_one_security.test.sql` with the two-step vector: as Mal
(`a0000000-0000-4000-8000-000000000003`, a homeowner), insert `designer_clients(designer_id = self,
client_id = self)`, retry the elevation, assert `role` unchanged; and assert the sibling policy has a
non-NULL `polwithcheck`.

**1b — run it, and watch it fail.** Apply 00555 into a transaction, run the test file, expect
`FAIL 7e`.

**1c — implement.** In `supabase/migrations/00555_ios_round_one_security.sql`, immediately after the
`"Users can update own profile"` policy, re-create the sibling with the check its own intent already
implies — the same shape its INSERT sibling `"Designers can create homeowner profiles"` has carried
since 00017:

```sql
DROP POLICY IF EXISTS "Designers can update their client profiles" ON public.profiles;
CREATE POLICY "Designers can update their client profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.designer_clients dc
                       WHERE dc.client_id = profiles.id
                         AND dc.designer_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.designer_clients dc
                       WHERE dc.client_id = profiles.id
                         AND dc.designer_id = (SELECT auth.uid()))
              AND role = 'homeowner');
```

**Why this and not a trigger.** The review offered a `BEFORE UPDATE` trigger as the durable
alternative. It is rejected with a reason: `service_role` bypasses RLS but **not** triggers, and
neither do the SECURITY DEFINER functions that legitimately set `profiles.role` on the invite and
onboarding rails (00551–00554 moved that rail three days ago). A trigger would have to enumerate every
legitimate writer correctly on the first try, in a Kody-run production apply, with no staging rehearsal
— for a hole that a five-line policy closes exactly. `auth.role()` is `'authenticated'` inside a
SECURITY DEFINER function called by a signed-in user, so the exemption the trigger needs cannot be
written from the JWT alone.

**Why not a RESTRICTIVE policy.** Also rejected, and for the reason the review itself gives: a
restrictive policy comparing `role` to `current_profile_role()` compares the target row's new role to
the **caller's** role and would deny every legitimate designer edit of a client profile.

**1d — the migration must fail rather than half-apply.** Add to 00555's own `DO $$` verification block
the assertion that the sibling now carries a `WITH CHECK`, beside the one already there for
`"Users can update own profile"`.

**1e — run the whole file green, then re-run the reproduction** and confirm step 3 now blocks.

**1f — commit** `supabase/migrations/00555_ios_round_one_security.sql`
`supabase/tests/rls/00555_ios_round_one_security.test.sql` with an explicit pathspec.

**What this fix does NOT close, said plainly (note N10).** Two legs stay open by design, because the
charter's outline for this migration flags them rather than fixing them (PROGRAM.md §3 L0.2, the "NOT
dropped, recommendation only" block):

1. `designer_clients` remains self-INSERTable with an **arbitrary `client_id`**, so any authenticated
   user can still manufacture a roster row against any profile and edit that profile's non-role columns.
   The fix above pins the role; it does not close the write. Closing it means a `WITH CHECK` on
   `"Designers can manage their clients"` — another table, another migration's policy, and a live
   designer-portal Add Client flow. **W2.**
2. `"Users can insert own profile"` carries no role constraint, so a user with **no** profiles row could
   insert one with any role. `handle_new_user()` is SECURITY DEFINER and creates the row at signup, and
   00555 revokes `DELETE` on `profiles` from `authenticated`, so there is no path to an id with no row.
   Recorded, not fixed — PROGRAM.md's outline pins that policy's text verbatim.

---

## Task 2 — `RL02-23` (minor): 00557's anon case is asserted, not demonstrated

The migration justifies granting `anon` EXECUTE *behaviourally* — SECURITY INVOKER, so an anon caller
runs with `auth.uid() = NULL`, `user_id = NULL` is never true, and the UPDATE matches zero rows. The
test proves only that the grant exists.

**2a — failing test first.** Add case 3b to
`supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql`: assume `anon`, call
`increment_scan_upload_attempt` on the fixture scan, assert `upload_attempt_count` unchanged.

**2b — run, expect green immediately** (the property already holds — this case is the *guard*, and its
load-bearingness is proved by the negative check in 2c, not by an initial red).

**2c — negative check.** Re-apply 00557 inside a transaction with `SECURITY DEFINER` substituted for
the invoker default, run the file, and confirm the new case fails. That is the refactor this case
exists to catch, and the existing `prosecdef` assertion only catches it while nobody edits it.

**2d — commit** `supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql`.

---

## Task 3 — `RL02-20` (minor): a dead predicate term, and an index built for it

Verified on the local stack:

```
projects | fk_projects_client_profile | FOREIGN KEY (client_profile_id) REFERENCES client_profiles(id)
```

and `client_profiles.id` is its own `gen_random_uuid()` primary key with a **separate** `user_id`
column FK'd to `auth.users` — a uuid space disjoint from `profiles.id`. So
`p_profile_id IN (…, pr.client_profile_id)` in `can_view_profile`'s project leg can never match, and
`idx_projects_client_profile` indexes a column that predicate can never use. `projects.client_id` is
FK'd to `profiles(id)` and already carries the client side, so removing the term loses no relationship.

Round 2 escalated this as note N4b for Fable rather than fixing it. Round 3 **fixes it** — dead code in
a security predicate plus an index nothing can use is not a thing to ship and then rule on — and the
note becomes a record.

**3a** — remove `pr.client_profile_id` from both `IN` lists in the project leg.
**3b** — remove `CREATE INDEX … idx_projects_client_profile`. Keep
`idx_fulfillment_orders_designer_profile`: `fulfillment_orders.designer_profile_id` **is** FK'd to
`profiles`, so that leg is live and the index earns its lock.
**3c** — the remaining index is created non-`CONCURRENTLY` inside the migration's single transaction and
takes an `ACCESS EXCLUSIVE` lock on `fulfillment_orders` for the apply. Harmless at production's row
counts; it belongs in the runbook's what-to-expect rather than being discovered mid-apply, so add it
there.
**3d** — run the whole SQL suite; commit the migration and the runbook.

---

## Task 4 — `RL02-19` (minor): stale object counts, in the migration and in the runbook Kody follows

00555 creates **four** functions — `can_view_profile`, `current_profile_role`,
`search_shareable_designers`, `list_vendor_profiles` — and **no view** (`profile_cards` was cut).

Three strings say otherwise:

| File | Line | Says | Should say |
|---|---|---|---|
| `supabase/migrations/00555_ios_round_one_security.sql` | AFTER APPLY block | "a new view, two new functions" | four new functions, no view |
| `build/waves/w0/KODY-RUNBOOK.md` | 15 | "three helper functions (`can_view_profile`, `search_shareable_designers`, `list_vendor_profiles`)" | four, naming `current_profile_role` |
| `build/waves/w0/KODY-RUNBOOK.md` | 291 | "00555's three new functions are SECURITY DEFINER" | four |

`current_profile_role` is the one the UPDATE policy cannot work without — 00555's own assertion is
*"authenticated cannot execute current_profile_role — the UPDATE policy denies every write"* — and a
reader auditing the apply against the runbook would not know to look for it. Fix all three.

---

## Task 5 — `RL02-21` (minor): the stated user-visible consequence does not exist

```bash
grep -rn 'searchDesigners\|getRecentDesigners' apps/mobile --include='*.swift' | grep -v '/.build/'
```

returns only the declarations, the contract test and this lane's own comments. **No view, view model or
coordinator calls either method**, in Patina or in Capture. The RPC swap is still exactly what the
charter asked for and the email leak is still real — but "the share-with-a-designer picker goes silently
empty" describes a picker that does not exist.

**5a** — rewrite the doc comment at `ScanSharingService.swift:383-389` to say what is true: the method
has no caller today; the RPC is here so a future caller cannot reintroduce the email leak.
**5b** — record the same correction in `l02-notes.md` as **N5b**, and say it at that level in the lane
report.
**5c** — `xcodebuild build` (twice, `A2-08`) and commit the Swift file.

Whether an unreferenced public API is worth keeping is Fable's call, not this lane's; N5b puts it in
front of Fable rather than deciding it.

---

## Task 6 — `RL02-22` (minor): two placeholders survived inside commands

The lane's own rule (this file, round 2, "Global constraints") forbids them.

| File | Line | Placeholder | Fix |
|---|---|---|---|
| `build/waves/w0/demo-account.sql` | 31 | `-v designer_profile_id=THE_UUID -v studio_id=THE_OTHER_UUID` | point at `demo-account.md` Step 5, which already carries the literal `$DESIGNER_PROFILE_ID` / `$STUDIO_ID` form |
| `build/migrations-draft/00555_probes.md` | ~52-58 | `<anon key from supabase status>`, `<seeded email>`, `<seeded password>` | **already fixed on the branch** — see below |

The PROD recipe's `<code>` is a mailbox OTP and genuinely unavoidable; the file already explains why.
**Left alone.**

### ⚠ The probes half of `RL02-22` was a false positive, and the reason is worth more than the finding

`00555_probes.md` exists **twice**: tracked at
`artifacts/ios-testflight-polish-2026-09-01/build/migrations-draft/00555_probes.md` (round 2 committed
it at `df2f0e138`), and as an **untracked, stale duplicate at the same path in the main checkout**,
last written before round 2. The tracked file has carried the placeholder-free recipe since round 2:

```bash
export LOCAL_ANON="$(supabase status -o env | grep -m1 '^ANON_KEY=' | cut -d= -f2- | tr -d '"')"
  -d '{"email":"client@patina.dev","password":"password123"}' \
```

The review read the stale copy — its `:52-58` are the old placeholders, and its section headings are
`§9c`/`§12` where the tracked file's are `§9f`/`§9b`/`§9d`. **This round made the same mistake before
catching it**: the first edits of this task went into the stale copy, and one of them "corrected"
`KODY-RUNBOOK.md`'s cross-reference table to point at the stale numbering. Both were reverted; the real
edits are on the tracked file (`8a519f271`).

Two lasting actions, because a duplicate that misleads a reviewer will mislead Kody during an apply:

1. The stale main-checkout copy was overwritten with the tracked file, so the two now agree
   byte-for-byte (`diff -q` clean). Copying a file is not a git operation and does not break the
   never-run-git-in-the-main-checkout rule.
2. `KODY-RUNBOOK.md`'s probe table now says, in the file Kody reads: **read `00555_probes.md` from the
   repo tree on this branch**, and names the heading numbers that tell the two copies apart.

This is the same class of hazard as `RL02-25` (N9) — the Kody-facing deliverables live outside version
control, so nothing stops a stale twin from being the one someone reads.

---

## Task 7 — `RL02-24` (minor): this lane's reset dropped a peer branch's migration

`pnpm supabase:reset` replays *this worktree's* `supabase/migrations/`, which does not carry
`00556_admin_studio_management.sql` (it lives on `admin-studios/build`). That migration was on the
shared local stack before round 2's reset and is not after. Round 2 recorded it in this task list;
round 3 raises it to a note that reaches the people it lands on — the `admin-studios` session, which is
outside this program, and the steward, whose §4 sequence hands the next resets to L0.3 and L0.7 from
trees that also lack 00556. **N8**, plus a `kodyRun` line.

---

## Task 8 — `RL02-25` (minor): the Kody-facing deliverables are untracked

`KODY-RUNBOOK.md` (18 KB), `demo-account.sql` (20 KB) and `demo-account.md` (15 KB) are the actual
output of a KODY-RUN lane and exist only as untracked files in the **main checkout**. They are not in
`git diff main...HEAD`, and `build/waves/` is gitignored, so a plain `git add` refuses.

This lane **cannot** fix it: PROGRAM.md §7 step 7 makes committing `build/waves/<wave>/` the closer's
job, and the files are outside this worktree, where this lane may not run git. Round 2 filed it as N6.
Round 3 raises the priority — the runbook Kody follows during a production apply is under no version
control, and `scripts/repo-gc.sh` sweeps untracked strays. **N9**: commit `build/waves/w0/` with an
explicit `git add -f` pathspec **before** Kody runs Step 3, not at wave close. Repeated as a `kodyRun`
line so it cannot be lost in a notes file that is itself untracked.

---

## Task 9 — Run the gate, capture the tails

Same gate as round 2, same reset discipline. **Re-check the peer locks first** and wait rather than
reset over a live lane:

```bash
for d in l01 l02 l02b l03 l07; do
  p="/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-$d/.writer.lock.d"
  if [ -d "$p" ]; then echo "LOCKED: $d"; else echo "free:   $d"; fi
done
```

```bash
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02
pnpm supabase:reset
bash scripts/run-sql-tests.sh 2>&1 | tee /tmp/ff-l02-sql-round3.log
```

Pass = zero unexpected failures, every expected-fail name already in
`supabase/tests/KNOWN_FAILURES.md`, nothing added to that file, and both of this lane's files among the
passes. Plus `cd packages/supabase && pnpm type-check`, and the `xcodebuild build` line twice.

---

## Gate evidence — round 3, 2026-09-02

**Peer locks re-checked before the reset.** Only this lane held one; `agent-admin-studios` held none
either.

```
free:   l01
LOCKED: l02
free:   l02b
free:   l03
free:   l07
```

**Reset announced, run at 10:56:53, `Finished supabase db reset on branch main.`** Then the whole
suite:

```
================ summary ================
total:             146
green:              125
expected-fail:      21  (documented in supabase/tests/KNOWN_FAILURES.md)
unexpected-fail:    0
effective-green:    146 / 146  (green + expected-fail)
===========================================
```

Both of this lane's files among the passes:

```
PASS   supabase/tests/rls/00555_ios_round_one_security.test.sql            0s
PASS   supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql     0s
```

The stop condition (a failure name not already allowlisted) did not fire, with the diff captured:

```
actual expected-fail files: 21
allowlist entries:          22
=== any actual expected-fail NOT in the allowlist? ===
-> 0 new names
=== allowlisted files that actually PASSED (safe direction) ===
supabase/tests/edge_api/public_acl_exception_registry.sql
```

`git status --porcelain -- supabase/tests/KNOWN_FAILURES.md` empty — nothing added to the allowlist.

**Post-reset object state**, from this worktree's tree:

```
00557|increment_scan_upload_attempt        can_view_profile
00555|ios_round_one_security               current_profile_role
00554|onboarding_review_fixes              increment_scan_upload_attempt
                                           list_vendor_profiles
                                           search_shareable_designers

profile_cards=0
idx_fulfillment_orders_designer_profile    (idx_projects_client_profile: gone)
```

**The blocker, re-run against the freshly reset stack** (not a rolled-back graft — the real applied
state), as the seeded homeowner `client@patina.dev`:

```
STEP1 RESULT | blocked: new row violates row-level security policy for table "profiles"
STEP2 RESULT | self-roster INSERT SUCCEEDED
STEP3 RESULT | blocked: new row violates row-level security policy for table "profiles"
ROLE AFTER ROSTER ATTEMPT | homeowner
```

Before the fix, the same three steps read `blocked / SUCCEEDED / SUCCEEDED` and `… | designer`.
The legitimate leg still works — a designer's non-role edit through the roster policy updates 1 row.

**Probe 9c-i** returns two rows, both with a non-null `with_check`:

```
Users can update own profile               | ((( SELECT auth.uid()) = id) AND (NOT (role IS DISTINCT FROM current_profile_role())))
Designers can update their client profiles | ((EXISTS ( SELECT 1 FROM designer_clients dc
                                           |    WHERE ((dc.client_id = profiles.id) AND (dc.designer_id = ( SELECT auth.uid()))))) AND (role = 'homeowner'::text))
```

**Case 3b's load-bearingness, measured in isolation against four function variants** (rolled back):

```
variant A  shipped shape (INVOKER + owner gate)       -> case 3b PASSES (counter still 3)
variant B  owner gate removed, still INVOKER          -> case 3b PASSES (counter still 3)
variant C  SECURITY DEFINER, owner gate kept          -> case 3b PASSES (counter still 3)
variant D  SECURITY DEFINER *and* owner gate removed  -> case 3b FAILS: counter advanced to 4
```

**Secondary gates.**

```
cd packages/supabase && pnpm type-check   ->  tsc --noEmit, no output, rc=0

xcodebuild build … 'generic/platform=iOS Simulator' … CODE_SIGNING_ALLOWED=NO
  === ATTEMPT 1 ===  ** BUILD SUCCEEDED **
  === ATTEMPT 2 ===  ** BUILD SUCCEEDED **

xcodebuild build-for-testing …           ->  ** TEST BUILD SUCCEEDED **

VISION "AI"-label grep over the five files this lane authors -> no output
git status --porcelain                                       -> empty
git diff --stat packages/supabase/src/database.types.ts      -> empty (no signature changed)
```

**The claim level, said plainly.** Everything above is *local* or *compile-green*.
`PatinaTests/ScanSharingContractTests` has still never run on a simulator — this lane owns no clone
(N5). Nothing on this branch has touched Strata.

### The `USER_JWT` recipe was run, not just written

`RL02-22`'s replacement for the placeholder recipe in `00555_probes.md` was executed verbatim against
the local stack and returned a 776-character ES256 access token, so the file now carries a command that
works rather than three blanks.
