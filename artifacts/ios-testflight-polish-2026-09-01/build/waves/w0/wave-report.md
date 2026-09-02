# First Flight · W0 — wave report

**Closed 2026-09-02.** Eight lanes, one integration steward, one closer. Integration tip
**`0ef84ae1732393894e50f43dfc32e4ada6c87ef9`** on `first-flight/integration`, base `main` = `a4d665ad7`.
**No agent made a production write of any kind in this wave** — no `psql`, no Supabase MCP write, no
`asc`, no Sanity write, no PostHog change, no `wrangler`, no `deploy-portal.sh`, no `functions deploy`,
no `db push`.

---

## What landed, per lane

| Lane | Landed | Commits |
|---|---|---|
| **L0.1** Build & configuration | `-configuration Release` compiles — **exit 65 → exit 0**, the criterion W1's exit and the integration gate depend on. Build number moved to `Config/Version.xcconfig` at **3** (app **and** appex), iPhone-only, 26.0 floor, `ITSAppUsesNonExemptEncryption`, privacy manifests for both binaries, one source for the seven permission strings, a real AccentColor and launch ground, a working analytics kill switch, error-tracking capture, `house-first` defaulting ON (**D1a**), `ExportOptions.plist`, and `release` + `archive` tiers on `ios-gate.sh` with `IOS_GATE_UDID` now **required**. | 12, tip `299d2a73b` → merge `acef37f56` |
| **L0.2** Production backend | **00555** (anon read closed on `profiles` and `notification_preferences`; `vendors` split into a public face and a trade file by column grant; `profiles.role` self-elevation closed on **both** UPDATE policies; seven `FOR ALL / TO PUBLIC / auth.uid() IS NULL` policies dropped; four helper functions) and **00557** `increment_scan_upload_attempt` (**D13**) — both drafted, both replaying clean locally. Plus the demo-account seed, the probe script and the apply runbook. | tip `8a519f271` → merge `06f5bd291` |
| **L0.2b** The Document's read paths | `getUser()` guards on `GET /api/catalog/vendors` and `/[id]`, `select('*')` replaced by named columns on both, and the comms vendor picker moved onto `list_vendor_profiles`. **Not in the integration branch** — it merges to `main` on its own (**D8**) and gates 00555. | `ffdee7273`, `57f9e1ce8`, `fc82db841` on `first-flight/w0-l02b` |
| **L0.3** The room is not empty | The whole content pipeline: manifest checker, image uploader, production SQL emitter, a six-row fixture, an editorial fixture and eleven SQL test cases. Proven end to end **locally**. | tip `56b6ade32` → merge `a2d364500` |
| **L0.4** Help & tour content | Four Sanity documents identified by `_id` and revision, the replacement copy, both publish routes and five read-only probes. **No Sanity write was made.** | docs only, in `build/waves/w0/` |
| **L0.5** App Store Connect | The runbook, the captured before-state, the beta description, the beta review notes and What to Test for build 1 — plus four traps found by re-checking every command against the installed binary. | docs only, in `build/waves/w0/` |
| **L0.6** PostHog | Dashboard-only. Its steps and the contradiction it must resolve are runbook Block **H**. | — |
| **L0.7** Coverage walk | Walked the six surfaces the audit never reached, on the four-tab root, as a signed-in `activeProject` client. Closed the seed gap that made documents and message threads unreachable. **Eleven findings filed** (`L07-01`…`L07-11`) and placed by this closer. | tip `c1c86e9bb` → merge `0ef84ae17` |
| **Closer** | `findings.json` 629 → **640**; `findings-by-lane.md` regenerated; `PROGRAM.md` §1 numbers amended and **§11** added; the single ordered `KODY-RUNBOOK.md`; **V7** in `docs/vision/VISION-DECISIONS.md`. | this commit set |

---

## Gates

| Gate | Result |
|---|---|
| `pnpm install` | **0** — `Done in 30.6s` |
| `ios-gate.sh build` | **0** on the second attempt (the fresh-worktree `GitCommit.swift` cost, `A2-08`) |
| `ios-gate.sh release` | **0** — `** BUILD SUCCEEDED **` |
| `ios-gate.sh unit` (whole `PatinaTests`) | **0** — **1552 tests / 170 suites passed** in 4.956 s, all six new lane suites among them |
| `ios-gate.sh lint-delta main` | **0** — no new warnings in touched files |
| `pnpm supabase:reset` | **0**; migration head `00557 / 00555 / 00554 / 00553` (00556 is a deliberate gap) |
| `bash scripts/run-sql-tests.sh` | **0** — `147/147 effective-green`; the expected-fail set matches `KNOWN_FAILURES.md` **exactly** (21 = 21, none new, none silently green) |
| `pnpm type-check` | **0** — 30/30 |
| L0.2b's own gates | `@patina/supabase` 959 tests · vendors jest 7/7 · **full designer-portal jest 498 suites / 5948 tests** · `type-check` 30/30 |
| `ios-gate.sh archive` | **NOT RUN** — it is R1 Step 2 / runbook Block I, on Kody's machine. Archive-green is not claimed anywhere |

Every claim above is **compile-green** or **suite-green**. Product-inspection claims from the merged
tip's own Release artifact: `CFBundleVersion 3` on app and appex, `MinimumOSVersion 26.0`,
`UIDeviceFamily [1]`, `ITSAppUsesNonExemptEncryption false`, both `PrivacyInfo.xcprivacy` files, the
appex under `PlugIns/`. **`aps-environment`, the widget on a Home Screen and real cold-launch time
remain device claims** and close only in R1.

---

## Kody-run pending — all of it, in one file

**[`build/waves/w0/KODY-RUNBOOK.md`](KODY-RUNBOOK.md)**, ten blocks A → J, placeholder-free, each with
what it proves, the exact commands, a read-only probe and a rollback where one exists.

**A → B is the only hard ordering** (**D8**): merge and deploy L0.2b, *then* apply 00555. Applying first
converts a live leak into a live outage on `app.patina.cloud`, and VISION ranks The Document above the
app. Everything else is parallel; **G** waits only on **D**.

Two blocks carried a decision that had to be made **before** the command ran. **Both are now ruled —
see the fix-round sections at the foot of this file. Neither is a gate any more, and neither needs an
edit before its block runs.** The originals, for the record:

1. **B2 — `handle_new_user`'s `homeowner` fallback.** After 00555, designer-portal self-signups are
   written `role = 'homeowner'` and then labelled `client` in every comms thread. Three options, one
   ruling line to fill in. Every account created between the apply and a fix carries the wrong role.
   → **Ruled three times; `B2 v3` is the one in force** and it supersedes v1 and v2 wherever they still
   appear on this page. **The trigger does not move at all** — it is 00313 verbatim, so every signup
   with no explicit hint still lands `designer` and the portals are unchanged. `profiles.role` is a
   LABEL; authority is `user_roles` or `profiles.is_designer`. The client relabel happens in the two
   places that know the answer: the iOS app self-downgrades its own row after an Apple/Google sign-in
   (permitted by a new one-way ratchet on the own-row `UPDATE` policy — W1 · L1-A, contract in
   `waves/w1/l1-a-notes.md`), and `client-invite`'s accept handler writes `homeowner` as `service_role`
   (runbook **A10**, with a one-time backfill at **B7b**). Full statement and reasoning: "Fix round 3"
   below, and runbook **B2**.
2. **D2 — the demo proposal's `client_visibility_tier`.** `demo-account.sql:187` says `'milestone'`, so
   the tester opens an $18,500 proposal with five line names and no money (`L07-07`). It is **one-way**:
   `guard_proposal_copy_immutability` forbids changing that column on a non-draft proposal, and the row
   is inserted as `sent`. One word on one line, before the seed, or never.
   → **Ruled: `'full'`.** Already in `demo-account.sql`.

---

## Blocked

| What | On what | Consequence |
|---|---|---|
| **L0.3's production seed** | **Leah's ≥ 30-piece manifest and photographs** (**D2**) | Runbook **J2**. Not in hand by end of day 6 → L0.3 calls the fallback and build 1 ships the honest "still curating" state; the pipeline waits, it does not expire |
| **`L07-01`'s liveness** | a read-only production probe nobody has run (runbook **J1**) | If Leah belongs to **two or more** active studios, **no client of hers can sign a proposal** and What to Test item 4 must come out. If one, it is latent and schedules into W1 normally |
| **L0.5 §G3 (testers) and the beta review notes** | Block **D** minting `firstflight@patina.cloud` | The credential published to Apple does not work until D runs |
| **A2-07 / A2-23 / A2-24 / G-12** | Kody's archive and export (Block **I**) | `ios-gate.sh release` proves the compile, **not** the archive. Four of L0.1's eighteen rows are *pending*, not closed — a reader reconciling the wave should not read 18/18 |
| **`aps-environment = production`** | the same export | Until I4, push registers sandbox tokens and R1's device row **D-07** silently never arrives |

---

## Two contradictions this wave surfaced, both still open

1. **PostHog's "0% rollout" undoes D1.** PostHog returns a false-evaluating flag *with the value false*
   rather than omitting it, and **D1a** makes a `false` payload the kill switch — so a 0% `house-first`
   turns the four-tab root **off on every tester's second launch**. Runbook **H1** sets `house-first` to
   **100% / everyone / active** and leaves `direct-orders` and `house-widget` at 0%; the kill switch is
   then still one click. PROGRAM.md §3 · L0.6 step 2 is superseded on this point and left in place so the
   change is visible. *The code side is verified in the branch; the PostHog side is reasoned, not
   observed — **H4** is the probe, and H4 has a known hole (the resolution log line is `#if DEBUG`).*
2. **Two W1 blockers came out of L0.7's walk**, on surfaces the audit never looked at: `L07-02` (on the
   shipped root the message composer is under the tab bar and **cannot be tapped** — a round-one client
   cannot reply to their designer) and `L07-01` (proposal signing). **G5b passes only because they are
   scheduled into W1 or named in What to Test** — §8's slip rule, read literally.

---

## Findings, after this wave

`findings.json` **640** rows — 629 + L0.7's eleven. Wave totals
**W0 34 · W1 137 · W2 365 · W3 100 · closed 4**. Two changes moved them: ruling **D1**'s re-tier of
twelve rows against the shipped four-tab root (`retier-D1.md` — eight flags-off-only rows out of W1,
four flags-on-only minors up from W3), and the eleven new rows. Ten of the eleven keep the walker's
proposed tier; **`L07-05` alone was promoted** (T1 → T0/W1), because its own fix line says to land it in
the same wave as `R-03`, which is T0/W1. `PROGRAM.md` §1's tables are amended with the prior value beside
each changed number; **§3's and §5's per-lane tables were not rewritten**, and §11.6 lists every line in
them that is now stale.

**One evidence note W1 must carry:** the corpus barely observed the root it now ships. Only lane `B`
walked the four-tab root; every other lane launched flags-off or with `house-widget` only. W1's walkers
launch without `-PatinaFlags` per **D1a** and will be the first real look at it — a thin four-tab section
in the ledgers is a **coverage gap, not a clean bill**.

---

## The integration tip, and what to do with it

```
first-flight/integration   0ef84ae1732393894e50f43dfc32e4ada6c87ef9
base                       main = a4d665ad7
merges                     06f5bd291 (L0.2) → a2d364500 (L0.3) → acef37f56 (L0.1) → 0ef84ae17 (L0.7)
one conflict               supabase/config.toml [db.seed].sql_paths — resolved as the union,
                           proven at runtime by a reset that loaded both lanes' seed files
```

Plus this closer's two commits on the same branch: the W0 wave record (`build/waves/w0/`, the amended
`build/` files) and **V7** in `docs/vision/VISION-DECISIONS.md`.

**Three things Fable should know before merging to `main`:**

1. **`first-flight/w0-l02b` is deliberately not in this branch.** It goes to `main` on its own, ahead of
   the integration merge (**D8**), and the designer portal is redeployed before 00555 is applied. Anyone
   looking for the `FF-01a/b/c` guards on the integration tip will not find them — that is correct.
2. **`docs/vision/VISION-DECISIONS.md` was untracked in the main checkout.** This closer added it to
   `first-flight/integration` and made the main checkout's working copy byte-identical, so the merge
   should be clean — but if git refuses with *"untracked working tree files would be overwritten"*, the
   two copies are the same file and the working copy is the one to move aside.
3. **W0's worktrees, branches and simulator clones are still live** and were not retired. Retirement
   belongs after the merge (`steward.md` §9); `scripts/repo-gc.sh` sweeps stragglers. `ff-w0-l01`'s clone
   `8ED58095-6FFA-4411-B715-73C98805C874` is the udid any re-run of these gates would use.

**Two things deliberately left out of the wave-record commit, and why:**

- **`build/migrations-draft/00555_ios_round_one_security.sql` (and its `.test.sql`) are STALE and were
  not committed.** L0.2 moved the real file to `supabase/migrations/` and then changed it there in the
  `RL02-18` fix rounds; the draft is the earlier text. Committing it would put two different 00555s on
  one branch. `PROGRAM.md` §"Global constraints" still points at the draft path — §11.4 now carries the
  correction, and the runbook names `supabase/migrations/` throughout. `migrations-draft/00555_probes.md`
  **is** tracked, is current, and is unchanged.
- **`shots/w0-l0.7/` (46 screenshots, 14 MB) was not committed** — the closer's brief scoped the commit
  to `build/waves/w0/` and the changed `build/` files. Every `L07-*` row's `shots` array points into that
  directory, so until someone commits it the evidence lives only in the main checkout. Compress before
  committing if it goes in (`sips -Z` / pngquant — the repo already carries 138 MB of PNGs).

---

## Fix round (2026-09-02)

Adversarial review of the closed wave returned five findings and two open rulings. Both rulings are
**now made**, and four of the five findings are fixed; the fifth is accepted with its consequence
recorded. Nothing here was a production write.

### The commits

| # | Branch | Commit | What |
|---|---|---|---|
| 1 | `first-flight/integration` | `8372655a8` | `fix(db): pin profiles.is_designer on both UPDATE policies, and decide the signup default by provider (RL02-24, ruling B2)` |
| 2 | `first-flight/integration` | `3aec1d162` | `feat(first-flight): require a quality_score on every release-profile catalogue row (RL03-19)` |
| 3 | `first-flight/integration` | `de2c3800d` | `fix(ios): emit the flag-resolution line in Release builds, at notice level (RL01-02)` |
| 4 | `first-flight/integration` | *this commit* | `docs(first-flight): rule B2 and D2-demo in the runbook, and record the fix round` |
| 5 | `first-flight/w0-l02b` | `f921f46f4` | `fix(portal): authorize the vendors routes, not just authenticate them (RL02B-01)` |

Commits 1 and 2 each cover one finding but touch files the other does not; commits 1 and 4 are split
by file rather than by finding, because `00555_ios_round_one_security.sql` and its test carry both
`RL02-24` and ruling **B2** in the same section and cannot be separated by pathspec.

### The two rulings, decided

**Ruling B2 — `handle_new_user`'s default role is decided by the identity provider.**
Apple → `homeowner` (the iOS app is Patina's only Apple sign-in surface); everything else keeps the
pre-00555 `designer` default; an explicit `role` hint in `raw_user_meta_data` still wins as today.
The draft's flat `COALESCE(v_role, 'homeowner')` fixed the Apple path and would have broken the
designer portal's own self-signup — which sends no role — writing every new portal designer as a
homeowner and having `comms_resolve_role` (00103:37-42) label them `client` in every thread.

`raw_app_meta_data` is written by GoTrue at the same INSERT that fires the trigger — `signupNewUser`
sets `{"provider": …, "providers": […]}` on the user model before `tx.Create`, the same pair every row
in `supabase/seed/dev-accounts.sql` carries — and a client cannot forge it. **Both** legs are read:
`provider` is the deprecated half of the pair and an account that links a second identity accumulates
names in `providers` while `provider` keeps the first. `jsonb_exists()` is used rather than the `?`
operator so no driver that rewrites `?` as a bind placeholder can mangle the line. Runbook **B2** is
rewritten as RULED and is no longer a gate; test §11 is five behaviour cases over real `auth.users`
inserts, and §10's catalog assertion now matches on `raw_app_meta_data`, which appears nowhere in
00313 and so cannot pass over a skipped graft.

**Ruling D2-demo — the demo proposal ships at `client_visibility_tier = 'full'`.**
The vocabulary is three values (`00084:35`, `00141:28`), and `get_client_proposal_bundle`
(`00390:1622-1700`) reads them as: `curated` collapses `items` to `[]`; `milestone` renders the items
but forces `unit_sell_price`, `line_total_cents`, `vendor_name`, `budget_min/max_cents`, `brand`,
`source_url` and `price_retail` to NULL; `full` carries the money. `total_amount` is on the header and
shows on every tier, which is exactly why `milestone` read as a bug — an $18,500 header over five line
names with blank prices (`L07-07`). `demo-account.sql:187` now says `'full'`; nothing else in that file
changed, including the `projects` row's own `'milestone'`, which governs a different surface. Runbook
**D2** is rewritten as RULED with no edit left for Kody to make before D6.

### The findings

| id | Verdict | What changed |
|---|---|---|
| **RL02-24** (blocker) | **fixed** | `profiles.is_designer` was client-writable and it is the column designer authority actually reads — `claim_design_request` / `open_design_requests` (00286), `accept_design_request` (00330), `design_request_submit` (00285), `_can_manage_configurable_product`, and 00555's own `search_shareable_designers`. `role` is a label; pinning it alone closed the label and left the door. New `public.current_profile_is_designer()` (SQL, STABLE, SECURITY DEFINER, `search_path` pinned, REVOKE FROM PUBLIC/anon, GRANT TO authenticated — the inline-subquery form recurses 42P17 exactly as the role pin did); `"Users can update own profile"` WITH CHECK gains `AND is_designer IS NOT DISTINCT FROM public.current_profile_is_designer()`; `"Designers can update their client profiles"` gains `AND is_designer IS NOT TRUE`; the migration's DO block ASSERTs that **both** `with_check` expressions name the column. Test case **7f/7f2/7f3/7f4** mirrors 7c/7e. |
| **RL02B-01** | **fixed** | Both vendors routes authenticated but did not authorize. Cookies are scoped to `.patina.cloud`, so a round-one homeowner signed in on the iOS app or the client portal held a session both routes accepted — and the detail route handed them the 13 trade columns. Both now go through `getAuthenticatedDesignerAdmin` (`src/lib/supabase-admin.ts`), the portal's existing helper, already used by `POST /api/clients/invite`. |
| **RL01-02** | **fixed** | The flag-resolution line is emitted unconditionally at `PatinaLog.ui.notice` instead of inside `#if DEBUG`, so runbook **H4**'s two-launch probe can read it from a TestFlight build over Console. |
| **RL03-19** | **fixed** | A release-profile floor: **100%** of manifest rows carry a `quality_score`, with the matching non-null assertion as catalogue test case **7c**. |
| **RL02B-02** | **already covered — no change** | The 00555 test's §8b already carries all three assertions: 8b-i authenticated *can* execute `list_vendor_profiles`, 8b-iv anon **cannot** (behavioural, `insufficient_privilege`), 8b-iii the return shape is exactly `id,full_name,avatar_url` read off `pg_proc.proargnames` — so no email column can appear. Commit `9df391ce1`'s claim stands. Verified by running the file, not by reading it. |
| **RL01-01** | **accepted as shipped** | Debug builds keep PostHog off (that is A2-15's whole point; the alternative — a Debug build reporting into the production project — is the defect). The consequence is carried as a fact in the walker's brief, not as a code change: runbook **H3** already says a Debug walk reads `onboarding_walk_first` as false and that this is expected. Recorded in `l01-notes.md` N3. |

### Why RL02-24 was a blocker and not a tidy-up

Reproduced over HTTP on a fresh local stack, as the seeded homeowner `client@patina.dev`
(`a0000000-0000-0000-0000-000000000005`, `role = homeowner`, `is_designer = f`):

```
PATCH /rest/v1/profiles?id=eq.<self>  {"is_designer":true}
  → HTTP 403 {"code":"42501","message":"new row violates row-level security policy for table \"profiles\""}

POST  /rest/v1/designer_clients {designer_id: self, client_id: self, status: active}
  → HTTP 201                                    (still self-servable — W2, tracked)
PATCH /rest/v1/profiles?id=eq.<self>  {"is_designer":true}
  → HTTP 403 42501                              (the sibling policy no longer ORs around the pin)
PATCH /rest/v1/profiles?id=eq.<self>  {"role":"designer"}
  → HTTP 403 42501

SELECT id, role, is_designer FROM profiles WHERE id = <self>
  → homeowner | f                               (unchanged)

PATCH /rest/v1/profiles?id=eq.<self>  {"display_name":"Client User"}
  → HTTP 200                                    (the owner's own write still lands — no 42P17)
```

Before the fix the second PATCH would have returned 200 and the caller would have been in the
design-request pool with `role` still reading `homeowner`. No client-side write of `is_designer`
breaks: a grep over `apps/`, `packages/` and `supabase/functions/` finds the column only in reads, a
Swift `CodingKey` and comments — the two writers (`designer-invite`, `workspace-member-invite`) are
`service_role`, and 00290's `fc_sync_is_designer_from_role` trigger is SECURITY DEFINER owned by
`postgres`.

### Gates, re-run on `first-flight/integration`

| Gate | Result |
|---|---|
| `pnpm supabase:reset` | **0** |
| `bash scripts/run-sql-tests.sh` | **0** — `total: 147 · green: 126 · expected-fail: 21 · unexpected-fail: 0 · effective-green: 147 / 147`. Every expected-fail name is in `KNOWN_FAILURES.md`; none new, none silently green |
| `python3 scripts/generate-legacy-grants.py` | **0** — the seed changed (the new helper's REVOKE/GRANT) and is committed. Without it the helper is anon-executable on a fresh stack, which is how test 7g caught it |
| `ios-gate.sh build` | **0** — `** BUILD SUCCEEDED **` |
| `ios-gate.sh release` | **0** — `** BUILD SUCCEEDED **` |
| `ios-gate.sh unit` | **0** — `✔ Test run with 1552 tests in 170 suites passed after 4.831 seconds.` |
| `ios-gate.sh lint-delta main` | **0** — `✓ lint-delta: no new warnings in touched files` |

`IOS_GATE_UDID` was a private clone (`ff-w0-fix`, `39584FDC-2784-4E10-BD5E-AF3CB1A57685`), taken from
the protected review device and deleted afterwards; `973D1724-90BF-4A0A-B02D-481D561547B3` was rebooted.

### Gates, re-run on `first-flight/w0-l02b`

| Gate | Result |
|---|---|
| `pnpm --filter designer-portal test -- src/app/api/catalog/vendors` | **0** — 11 passed / 11 total (was 7) |
| `pnpm --filter designer-portal build` | **0** — `✓ Compiled successfully in 18.4s` |
| `pnpm type-check` | **0** — 30/30 |

### Documents amended

`KODY-RUNBOOK.md` (B2 and D2 rewritten as RULED; the B-block ordering table and B5's precondition no
longer name B2 as a gate; probe **9f** now reads `pins_role` / `pins_is_designer` off both policies and
says why; **H4** replaces the "known hole" paragraph with how to read the line off a TestFlight device),
`demo-account.sql` (the tier, and the reasoning beside it), `l01-notes.md` (N3 gains the RL01-02 fix and
the RL01-01 acceptance), `migrations-draft/00555_probes.md` (§9f-i now checks `is_designer` on both
policies; §9f-ii matched the old flat fallback and would have returned **false** against the shipped
function — corrected to the provider branch), `catalog-manifest-README.md` (the fifth whole-file rule).

---

## Fix round 2 (2026-09-02)

A second adversarial pass over the fix round returned eight findings — three blockers, one major, four
minors. **All eight are addressed.** Two of them say the first fix round was wrong rather than
incomplete, and both are worth reading before the next security migration is written.

Nothing here was a production write: no `psql`, no Supabase MCP write, no `asc`, no Sanity write, no
PostHog change, no `wrangler`, no `deploy-portal.sh`, no `functions deploy`, no `db push`.

### The commits

| # | Branch | Commit | Findings | What |
|---|---|---|---|---|
| 1 | `first-flight/w0-l02b` | `f0b464f66` | RF-04, RF-07, RF-08 | `fix(portal): gate the admin vendors routes too, and tell a role refusal from a role outage` |
| 2 | `first-flight/integration` | `8b330c8fc` | RF-01, RF-02, RF-05, RF-06 | `fix(db): pin the sibling policy to the OLD row, close the roster mint, and point ruling B2's allowlist the right way` |
| 3 | `first-flight/integration` | `ed0bbfb13` | RF-03 | `docs(first-flight): correct RL03-19's stated reason — quality_score gates the TIER, not the order` |
| 4 | `first-flight/integration` | *this commit* | — | `docs(first-flight): record fix round 2 in the runbook, the probes and the wave report` |

Commit 2 is one commit for four findings because all four live in
`00555_ios_round_one_security.sql` and its test and cannot be separated by pathspec. Row 4 says
*this commit* rather than a sha for the obvious reason — a commit cannot carry its own hash.

### The two findings that say the first round was WRONG

**RF-01 (blocker) — the `is_designer` pin was one-directional, and the roster row was self-servable.**
Fix round 1 gave `"Designers can update their client profiles"` a `WITH CHECK` pinned to the LITERALS
`role = 'homeowner' AND is_designer IS NOT TRUE`, and wrote in the migration that a manufactured roster
row reaching a stranger's non-role columns was "W2, tracked, not smuggled in here". Both halves were
wrong. A **demotion satisfies those literals by construction**, so any authenticated account could
roster a real designer and then rewrite them. Reproduced over HTTP on a fresh local stack as the seeded
homeowner `client@patina.dev`: `POST /rest/v1/designer_clients {designer_id: self, client_id: <Leah>}`
→ 201, `PATCH /rest/v1/profiles?id=eq.<Leah> {"role":"homeowner","is_designer":false}` → 204,
`PATCH … {"display_name":"PWNED","full_name":"PWNED"}` → 204. `designer | t | Leah Hartwell` became
`homeowner | f | PWNED`. That strips the exact authority the rest of §(a2) defends
(`search_shareable_designers`, `open_design_requests`, `claim`/`accept_design_request`) and corrupts the
name every surface renders.

Closed in two places, because one would have been the same mistake again:

- **The pin now reads the OLD row.** The two column predicates are in the policy's `USING` as well as
  its `WITH CHECK`. An `UPDATE` policy's `USING` sees the old tuple — there is no `OLD` in a
  `WITH CHECK`, which is why the owner policy needed a SECURITY DEFINER helper and this one does not:
  the target row is not the caller's own, so the old value is right there. A designer, admin or vendor
  on somebody's roster is now not a row this policy can select at all, in either direction.
- **The mint is closed.** `public.designer_clients` gains two RESTRICTIVE policies,
  `designer_clients_writer_is_designer` (INSERT) and `designer_clients_updater_is_designer` (UPDATE).
  Both of the table's permissive write policies are satisfied by `designer_id = auth.uid()` — 00014's
  `FOR ALL / TO PUBLIC / USING (auth.uid() = designer_id)` with no `WITH CHECK`, and 00316's
  `is_studio_comember(designer_id)`, whose **first branch is `p_owner = auth.uid()`**. Editing either
  one would have left the other as an OR-branch; a restrictive policy ANDs onto the OR of the whole
  permissive set and survives a third being added later. The predicate reads BOTH designer signals
  (`current_profile_is_designer() IS TRUE OR current_profile_role() IN ('designer','admin','super_admin')`)
  because they legitimately disagree: 00290's trigger sets `is_designer` off a **designer-domain**
  `user_roles` grant, and `handle_new_user` gives every signup `app_user` — so a designer who
  self-signed-up on the portal has `role = 'designer'` with `is_designer` still false until an invite
  or an admin grant lands, and an `is_designer`-only test would have locked them out of their own Add
  Client flow.

New test case **7h** runs the cross-account direction, which no case in the suite did; **7e0** asserts
the mint is refused; **7e/7f2** keep their old coverage by planting the roster row out of band, so they
still test the profiles policies rather than re-testing 7e0.

**RF-02 (blocker) — ruling B2's allowlist pointed at the privileged value.** The first cut read
`WHEN provider = 'apple' THEN 'homeowner' … ELSE 'designer'`.
`AuthService.signInWithGoogle` (`:399-421`, wired at `ContentView.swift:48`, `AuthSheet.swift:59`,
`AuthViewModel.swift:314`) sits on the same Welcome screen and calls `signInWithOAuth`, which carries no
`data:` parameter — so a Google sign-up is exactly as metadata-less as an Apple one and fell through to
`designer`. That is A3-07 verbatim, on the button beside the one the ruling was written for. Ruling D3
removes the Google button in W1, but a trigger default must not depend on a client-side button being
absent, and an `ELSE 'designer'` hands the same bug to every provider added after this file.

**Ruling B2 is therefore restated, not reversed: the allowlist names the provider that KEEPS the
privileged value.** An email/password signup — the designer portal's own signup page, and the only
surface that is — keeps `designer`; every other provider, and any row whose `raw_app_meta_data` is
missing or unrecognised, lands `homeowner`; an explicit `homeowner` hint still wins. The `email` branch
requires the `provider` scalar to read `email` **and** no other name to appear in the `providers` array,
so a linked identity does not inherit the default. Test §11 grows from five cases to eight: **11f**
Google → homeowner and **11g** no `raw_app_meta_data` → homeowner are the two rows that passed silently
as designer before, and **11h** covers email + google linked. §10's catalog assertion now also requires
`ELSE 'homeowner'` and rejects `ELSE 'designer'` — the graft-only version passed on the wrong direction.

The client portal's invite-accept form (`AcceptInviteForm.tsx:64`) also signs up over email with no role
hint and so also lands `designer` here. That is unchanged from every migration since 00013 and is
corrected immediately afterwards by `/api/auth/invite/accept` as `service_role`. Stated in the migration
rather than left for the next reviewer to rediscover; it is on the W2 list, not this round's.

### The rest

| id | Verdict | What changed |
|---|---|---|
| **RF-04** (blocker) | **fixed** | The same defect RL02B-01 closed was still open one directory over: `/api/admin/catalog/vendors` and `.../[id]`, five handlers, all `createServerClient()` + `getUser()` + `select('*')` on the same table, in the same portal whose middleware returns early on `isApiRoute`. The write verbs were worse than the read — `Authenticated users can insert vendors` is a permissive INSERT policy for `authenticated`. All five now go through `getAuthenticatedDesignerAdmin`; GET is designer-or-admin, POST/PATCH/DELETE are **admin-domain only**. `select('*')` is gone from every read and both write returns. The two column lists moved to `src/lib/vendor-columns.ts` — four route files read this table, and one copy per file is one copy per file to widen by accident. |
| **RF-03** (major) | **fixed** | RL03-19's stated reason was false and it was printed to a human in four places. `get_recommendations`' only `ORDER BY` is `m.rank` from `get_aesthete_matches`, and `quality_score` appears **nowhere** in that function's matching logic (read off 00244 and 00533) — its sole use is the tier label `WHEN COALESCE(p.quality_score, 0) >= 80 THEN 'designer_selection'`. So "an unscored piece sorts below every scored one" was wrong; "can never reach designer_selection tier" was right. The floor stands on the tier argument alone. All four sites rewritten: `MIN_SCORED_SHARE`'s comment, the checker's error string, `catalog-manifest-README.md` (both the column row and the whole-file-rules paragraph Leah works from), and catalogue test case 7c. |
| **RF-05** (minor) | **fixed** | `profiles`' INSERT leg pinned neither column, and `profiles.role`'s DEFAULT is `'designer'` — so an INSERT with role omitted lands a designer, and `is_designer = true` was insertable outright. `"Users can insert own profile"` gains `role IS NOT DISTINCT FROM 'homeowner' AND is_designer IS NOT TRUE`; 00017's `"Designers can create homeowner profiles"` gains the `is_designer` half and is re-scoped `TO authenticated` (it would otherwise OR around the first). Cases **6e/6f** cover both, against **real `auth.users` rows whose trigger-made profiles row is deleted first** — a fabricated uuid is stopped by `profiles_id_fkey` and the case would have passed with the policy doing nothing. Reachability is still narrow (a live `auth.users` row with no `profiles` row) and the migration says so. |
| **RF-06** (minor) | **fixed** | The new guards matched the helper's NAME, not the pin: all four were `ILIKE '%is_designer%'`, which the substring inside `current_profile_is_designer()` satisfies on its own — `AND public.current_profile_is_designer() IS NOT NULL`, which pins nothing, would have passed every one. Now matched on the comparison: `is_designer IS NOT DISTINCT FROM` on the owner policy, `is_designer IS NOT TRUE` on the sibling, plus a new guard that the sibling's `USING` reads the old row. **One thing the fix taught:** Postgres DEPARSES `a IS NOT DISTINCT FROM b` as `NOT (a IS DISTINCT FROM b)`, so the first attempt at this guard failed the migration's own ASSERT on apply — which is the guard working. Both spellings are accepted, with the source one kept so the line still reads as the pin it checks. |
| **RF-07** (minor) | **fixed** | `getAuthenticatedDesignerAdmin` discarded the role query's error, so a transient DB failure produced `data = null` and a flat 403 "Forbidden: designer or admin role required" for a real designer — while `middleware.ts`, which fails OPEN in the same situation, admitted the same person to the shell. The route stays fail-closed; a lookup failure (and a `createAdminClient()` throw on a missing key) is now a logged **503 "Role check unavailable"**, so nobody chases their permissions during an outage. The `SUPABASE_SERVICE_ROLE_KEY` half is real: it is **not** in `apps/designer-portal/wrangler.jsonc` (grep confirms 0 hits), so it can only be a Worker secret — **runbook A3b** checks `wrangler secret list` before the deploy, because without it all four vendors routes 503 to everybody. |
| **RF-08** (minor) | **fixed** | Two case names said "a signed-in caller", which is precisely what RL02B-01 stopped serving, and they passed only through the `beforeEach` role default. Both now say "a designer caller" and set the role mock themselves. The mock also **applies** its `.in('roles.domain', …)` filter instead of echoing its rows — without that it reported the new admin-only gate working while it did nothing; three cases went red when the filter was added and are green on the real predicate. |

### The HTTP proof, re-run

On a freshly reset local stack, as `client@patina.dev` (`a0000000-…-005`, `homeowner`,
`is_designer = f`), victim `a0000000-…-004` (`designer`, `is_designer = t`, `Leah Hartwell`):

```
PATCH /rest/v1/profiles?id=eq.<self>   {"is_designer":true}
  → 403 42501  new row violates row-level security policy for table "profiles"

POST  /rest/v1/designer_clients {designer_id: self, client_id: <Leah>}
  → 403 42501  … violates row-level security policy "designer_clients_writer_is_designer"
POST  /rest/v1/designer_clients {designer_id: self, client_id: self}
  → 403 42501  same policy                       (RF-01's primitive, both directions)

PATCH /rest/v1/profiles?id=eq.<Leah>   {"role":"homeowner","is_designer":false}
  → 200 []     no row selectable — the USING pin, not a refusal
PATCH /rest/v1/profiles?id=eq.<Leah>   {"display_name":"PWNED","full_name":"PWNED"}
  → 200 []

SELECT role, is_designer, display_name FROM profiles WHERE id = <Leah>
  → designer | t | Leah Hartwell                  (unchanged)
SELECT count(*) FROM designer_clients WHERE designer_id = <self>
  → 0                                             (nothing minted)

PATCH /rest/v1/profiles?id=eq.<self>   {"display_name":"Client User"}
  → 200        the owner's own write still lands — no 42P17
```

The two demotion PATCHes answer **200 `[]`** rather than 403, and that is the correct shape: the
policy's `USING` no longer selects the row, so the statement matches nothing. A 403 would mean the row
was selected and the check refused it.

**The legitimate designer paths still work**, probed as `designer@patina.dev` on the same stack:
`POST /rest/v1/designer_clients` → **201**, `PATCH /rest/v1/designer_clients` → **204**,
`PATCH /rest/v1/profiles` on their rostered homeowner client's `display_name` → **204** and the value
lands, while `PATCH {"is_designer":true}` on that same client → **403 42501**.

### Gates, re-run on `first-flight/integration`

| Gate | Result |
|---|---|
| `pnpm supabase:reset` | **0** — head `00557 / 00555 / 00554 / 00553` |
| `bash scripts/run-sql-tests.sh` | **0** — `total: 147 · green: 126 · expected-fail: 21 · unexpected-fail: 0 · effective-green: 147 / 147`. Every expected-fail name is in `KNOWN_FAILURES.md`; none new, none silently green |
| `python3 scripts/generate-legacy-grants.py` | **0** — `baseline + 2092 replayed statements`; **the seed did NOT change** and is not in this commit set. Fix round 2 adds policies only, no GRANT or REVOKE |
| `python3 scripts/first-flight/build-catalog.py --check catalog-fixture.csv --profile fixture` | **0** — `6 rows · 6 categories · 5 makers · 3 published inside 7 days · 6 with a spectrum`. On `--profile release` the only error is the 30-row floor, so the RL03-19 score floor still passes the fixture |
| `ios-gate.sh build` | **0** — `** BUILD SUCCEEDED **` |
| `ios-gate.sh release` | **0** — `** BUILD SUCCEEDED **` |
| `ios-gate.sh unit` | **0** — `✔ Test run with 1552 tests in 170 suites passed after 4.659 seconds.` |
| `ios-gate.sh lint-delta main` | **0** — `✓ lint-delta: no new warnings in touched files` |

### Gates, re-run on `first-flight/w0-l02b`

| Gate | Result |
|---|---|
| `pnpm --filter designer-portal test -- src/app/api/catalog/vendors` | **0** — **25 passed / 25** (was 11) |
| full `pnpm --filter designer-portal test` | **0** — **498 suites / 5966 tests**. The first run reported one suite failed with `signal=SIGSEGV` in a jest worker and **zero failed tests**; that suite passes alone and the whole suite passes on re-run — a worker crash, not a regression |
| `pnpm --filter designer-portal build` | **0** — `✓ Compiled successfully in 20.6s` |
| `pnpm type-check` | **0** — 30/30 |

`IOS_GATE_UDID` was a private clone (`ff-w0-fix2`, `BB5F8D32-C1C0-4FFB-9B7C-075DF72D3836`) taken from
the protected review device and deleted afterwards; `973D1724-90BF-4A0A-B02D-481D561547B3` was rebooted.

### Documents amended in fix round 2

`KODY-RUNBOOK.md` — Block A's "what it proves" now names **four** routes; **A2**'s pre-deploy grep
covers all four files and checks for a surviving `select('*')`; **A3b** is new (the
`SUPABASE_SERVICE_ROLE_KEY` Worker-secret precondition, and what a missing one looks like: 503, not
403); **A6** gains the three admin-route probes including the POST; **A9** no longer says the guard
authenticates but does not authorize, and says what closed it and when; **B2** is restated with the
email allowlist, the Google reasoning and the eight §11 cases; **B7**'s probe no longer matches
`ILIKE '%is_designer%'`, gains the `using_pins_old_row` column and the `designer_clients` restrictive
check, and carries the measured local shape of both; the advisors note now says **five** new functions.
`migrations-draft/00555_probes.md` — §9f rewritten (old-row pin, comparison-matching, the deparse note),
**§9f-ia** added for the restrictive policies, §9f-ii inverted with its third correction dated.
`catalog-manifest-README.md` — the `quality_score` row and the whole-file-rules paragraph now say what
the score actually decides. `00555_ios_round_one_security.sql`'s AFTER-APPLY block says **FIVE** new
functions.

### One thing this round did NOT do, stated rather than implied

`/api/admin/catalog/products`, `/api/admin/catalog/products/[id]` (+ `publish`/`unpublish`) and
`/api/admin/catalog/categories`, `/api/admin/catalog/categories/[id]` carry the **same shape** as the
vendors routes did — `createServerClient()` + `getUser()` and nothing else — and were not in RF-04's
scope. They are not the trade-file leak (no equivalent column split exists on those tables), but the
authorization gap is identical and their write verbs are just as open. **This is a W2 row, filed here
so it is not rediscovered as a surprise.**

---

## Fix round 3 (2026-09-02)

A third adversarial pass returned twelve findings — **one blocker (RF2-01), one major (RF2-02), ten
minors** — and Fable issued **ruling B2 v3**, which reverses the direction fix rounds 1 and 2 took on
`handle_new_user`. **All twelve are addressed.** This round is unusual in the same way round 2 was, only
more so: **it deletes work the two previous rounds added**, and the reason is worth reading before the
next security migration is written anywhere in this repo.

Nothing here was a production write: no `psql` against Strata, no Supabase MCP write, no `asc`, no
Sanity write, no PostHog change, no `wrangler`, no `deploy-portal.sh`, no `functions deploy`, no
`db push`. The only edge-function change is to the file in the tree; **deploying it is a Kody-run step
(runbook A10)**.

### RULING B2 v3 (Fable, 2026-09-02) — recorded verbatim

> **(a)** `profiles.role` is a **LABEL**, never an authorization input. `handle_new_user` keeps the
> pre-00555 default (`'designer'` for any signup without an explicit role hint — portals unchanged,
> Apple/Google on the portals unchanged); an explicit `'homeowner'` hint still wins.
>
> **(b)** Authority comes only from `user_roles` (`roles.domain IN ('designer','admin')`) or
> `profiles.is_designer`, which are written only by `service_role` / SECURITY DEFINER paths. Every
> policy or function this migration adds that decides authority predicates on those two, never on
> `profiles.role`.
>
> **(c)** The own-row `profiles` `UPDATE` policy allows `role` to change **ONLY** to `'homeowner'` (a
> self-downgrade; never upward) and `is_designer` only to `false`; the iOS app performs that
> self-downgrade after Apple/Google sign-in (that is W1 · L1-A's A3-07 fix).
>
> **(d)** The `client-invite` edge function's accept path sets `profiles.role = 'homeowner'` for the
> accepting user as `service_role` (RF2-02) — `supabase/functions/client-invite/index.ts`
> `handleAccept`; a Kody-run deploy step in Block A, and already-accepted clients need a one-time
> backfill.
>
> **(e)** The sibling policy `"Designers can update their client profiles"` treats
> `role IN ('homeowner','client')` as the client vocabulary in `USING` and `WITH CHECK` (RF2-06), with
> a W2 note that the `'client'` / `'homeowner'` split must be reconciled.

It supersedes B2 v1 and B2 v2 **in the migration, in the runbook and on this page**, and is recorded
verbatim in all three.

### The commits

| # | Branch | Commit | Findings | What |
|---|---|---|---|---|
| 1 | `first-flight/integration` | `70f002bc0` | RF2-01, RF2-06 … RF2-11, B2 v3(a)(b)(c)(e) | `fix(db): drop the profiles.role authority leg, ratchet the own-row pin, and revert handle_new_user to 00313` |
| 2 | `first-flight/integration` | `3d9770574` | RF2-02, B2 v3(d) | `fix(edge): label the accepting user a homeowner in client-invite's accept path` |
| 3 | `first-flight/integration` | *this commit* | RF2-03, RF2-04, RF2-05, RF2-12 | `docs(first-flight): record ruling B2 v3 and fix round 3 across the runbook, the probes, the wave report and the W1 note` |

Commit 1 is one commit for eight findings because all eight live in
`00555_ios_round_one_security.sql`, its test and the regenerated grants seed, and cannot be separated by
pathspec. Row 3 says *this commit* for the obvious reason — a commit cannot carry its own hash.

### The finding that says the last two rounds were WRONG

**RF2-01 (blocker) — the roster-mint policy read `profiles.role`, and `handle_new_user` hands that
label to everyone.**

Fix round 2 closed the roster mint with two RESTRICTIVE policies on `public.designer_clients`, and gave
them this predicate:

```sql
public.current_profile_is_designer() IS TRUE
OR public.current_profile_role() IN ('designer', 'admin', 'super_admin')
```

The stated reason for the second leg was that a designer who self-signs up on the portal carries
`profiles.role = 'designer'` with `is_designer` still false until an invite or an admin grant lands, so
an `is_designer`-only test would lock them out of their own Add Client flow. That reason is true and the
conclusion was still wrong, because `handle_new_user` gives **every** email/password signup that same
label — which fix round 2 itself had just finished arguing, one section away, when it wrote B2 v2. The
leg therefore read: *anyone who can complete a signup form may mint a roster row.* That row is the
primitive behind the entire profile-takeover chain (a) spends three sections closing: it admits the
caller to `"Designers can update their client profiles"` on `profiles`, to `can_view_profile`'s roster
leg, and to every predicate in the schema that resolves a relationship through `designer_clients`. Fix
round 2 restored the vulnerability inside the policy written to close it.

Reproduced over HTTP on a freshly-reset local stack, against a **real** signup made through
`POST /auth/v1/signup` — not a hand-seeded row:

```
POST /auth/v1/signup {email: ff-r3-selfsignup-…@patina.test, password: …}
  → profiles: role=designer | is_designer=f | designer/admin grant=f
```

**The fix:** both policies now read only the two authority signals ruling B2 v3(b) names —

```sql
public.current_profile_is_designer() IS TRUE
OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = (SELECT auth.uid())
              AND r.domain IN ('designer','admin'))
```

`domain` rather than a name list, because names change and domains do not (`independent_designer`,
`studio_admin`, `studio_designer`, `studio_owner` are the designer domain; `ml_operator`,
`quality_control`, `super_admin`, `support_agent` the admin one). The `user_roles` leg is not redundant
with `is_designer` even though 00290's trigger syncs one from the other: that trigger is
`AFTER INSERT ON user_roles`, so a grant written before 00290 or while the trigger was dropped leaves
`is_designer` false on a real designer. The `EXISTS` is inline rather than a helper, exactly as
`profiles_select_admin`'s is — evaluated as the invoker, over the caller's own rows, nothing new to
grant.

**And the "locked-out self-signup designer" was never a hard case.** That account is refused by
`claim_design_request` (00286), `accept_design_request` (00330), `design_request_submit` (00285) and
`search_shareable_designers` — every one of which reads `is_designer`. Admitting it *here and nowhere
else* would have been the inconsistency, not the fix.

New behaviour cases: **7j** (the self-signup shape refused, INSERT and UPDATE directions) and **7k** —
which is the half a refusal-only suite cannot cover: a real designer mints a roster row (7k1), renames
a rostered client (7k2/7k3), still cannot promote them (7k4), and an **admin-domain grant holder with
`is_designer` false** succeeds through the `user_roles` leg alone (7k5).

### The ruling that reverses fix rounds 1 and 2

**RF2-02 (major) — `handle_new_user` should not have been touched at all.**

Round 1 flipped `COALESCE(v_role,'designer')` to `'homeowner'`; round 2 replaced it with a `CASE` on
`raw_app_meta_data->>'provider'`, allowlisting `email` to `designer`. **v3 reverts to 00313 verbatim.**

The smaller problem with v2 was the one round 2 already caught in its own first cut — an allowlist
pointed at the privileged value hands `designer` to every provider it does not name. The larger problem
is the shape: **which button somebody tapped is not which kind of account they are.** A designer can
sign in with Apple. A client can sign up with an email and a password — the client portal's own
invite-accept form does exactly that (`AcceptInviteForm.tsx:64`), a fact round 2 wrote down, filed as
"on the W2 list", and then built a trigger default on top of anyway. v2 would have written a wrong
label for both, silently, at the one moment the row is created and nobody is watching.

**And the label was never the boundary.** Nothing in the schema grants authority from `profiles.role`.
That is what makes RF2-01 and RF2-02 the same finding wearing two hats: round 2 simultaneously treated
`role` as too dangerous to let a user write and as trustworthy enough to gate the roster mint on. Both
cannot be true. v3 picks the first: `role` is a label, and it is corrected where the answer is known —

- **the iOS app**, after an Apple/Google sign-in, self-downgrades its own row (ruling (c)). The own-row
  `UPDATE` policy is now a one-way **ratchet** — `role` may become `'homeowner'`, `is_designer` may
  become `false`, never upward. Contract written out for W1 · L1-A in
  `build/waves/w1/l1-a-notes.md`; cases 7i–7i5.
- **`client-invite`'s accept handler** (ruling (d)), as `service_role`, for a client who arrives
  through an invitation. Deploy step **A10**; one-time backfill **B7b**; case 11i.

§11 of the test file is rewritten: 11a (Apple) and 11b (portal email) now **both** assert `designer`,
which is the assertion that flipped, and 11e–11h prove there is no provider logic left to get wrong.

**One implementation note that is not cosmetic.** Ruling (c) states the pin as
`role IN (current_profile_role(), 'homeowner')`. It is implemented as
`role IS NOT DISTINCT FROM current_profile_role() OR role = 'homeowner'`, because `profiles.is_designer`
is **nullable** and `NULL IN (NULL, false)` evaluates to `NULL`, which a `WITH CHECK` treats as a
refusal — a legacy row with `is_designer` NULL could not have written its own `display_name`. Same
semantics, NULL-safe.

### The rest

| id | Verdict | What changed |
|---|---|---|
| **RF2-03** (minor) | **fixed** | Ruling B2 v3 recorded **verbatim** in the migration banner, runbook **B2** and this page, with an explicit "supersedes v1/v2" line in each and a what-changed table in the runbook. Every comment in the migration that still explains v1 or v2 is kept as HISTORY and labelled as such. |
| **RF2-04** (minor) | **fixed** | Runbook **B9** had no rollback for anything fix rounds 1–2 added. It now carries `DROP POLICY IF EXISTS` for both restrictive `designer_clients` policies (with a warning to prefer granting the account a designer role over reopening the mint) and for both `profiles` INSERT legs — each `DROP` paired with its `CREATE` in one statement, because dropping one INSERT policy and not the other leaves the survivor as an OR-branch around the pin you were removing. It also states which changes have **no** rollback and why. |
| **RF2-05** (minor) | **fixed** | New **B7a**, two read-only audits that run *before* B5's apply, because RF2-01 narrows who may write `designer_clients` and nothing said who that costs on production. Audit 1 groups every roster owner by `role` / `is_designer` / grant with a five-row reading table naming the one shape that loses the write (`designer` + `is_designer f` + no grant — the self-signup). Audit 2 counts orphan roster rows, because audit 1 joins `profiles` and a row whose `designer_id` has no profile would be invisible to it; `client_without_profile` is expected non-zero (Add Client before the client has an account) and is explained rather than left to alarm. |
| **RF2-06** (minor) | **fixed** | The sibling policy's `role = 'homeowner'` was too narrow. `profiles.role` has **no CHECK constraint**; `comms_resolve_role` (00103:37-42) treats every non-admin/designer/vendor role as a client; `public.roles` carries a `client` row in the `consumer` domain; and this migration's own fixture uses it (`Cleo`, `role='client'`, Dana's rostered client). A designer whose client row said `'client'` could not rename that client **at all** — the policy selected no row and the `PATCH` answered `200 []`. Both clauses now read `role IN ('homeowner','client')`, with the split itself filed as a W2 reconciliation. Case **7k2** is the regression guard, and it starts by asserting Cleo is still labelled `'client'` so a fixture edit cannot silently retire the coverage. |
| **RF2-07** (minor) | **fixed** | `"Users can insert own profile"` pinned `role IS NOT DISTINCT FROM 'homeowner'`. Under B2 v3(a) that is the same category error: it forced the policy to guess which label a row was entitled to, and it guessed wrong for a designer re-creating a lost profiles row. The leg is now `auth.uid() = id AND is_designer IS NOT TRUE` — the authority column only. Case **6f** is **inverted**: the own-row INSERT with `role` omitted must now LAND with the column default. 00017's INSERT sibling keeps its own `role = 'homeowner'` literal (its contract, not an authority check) plus the `is_designer` pin, and a new ASSERT proves the own-row leg did not quietly keep a role pin. |
| **RF2-08** (minor) | **fixed, and the verification found a real reader** | The brief said to revoke `anon` on `designer_clients` *after verifying no anon reader exists*. A grep over `apps/`, `packages/` and `supabase/functions/` found none — and that was the wrong place to look. `storage.objects` carries `"Designers manage discovery folio objects"` (00224:165), whose `USING` reads `designer_clients`, and **Postgres checks the ACL of every table named in a relation's policy set at executor init, BEFORE filtering those policies by role.** The policy is `TO authenticated`; the check is not. Revoking SELECT made every **anon** read of `storage.objects` raise `42501` and took two unrelated suites red (`storage/project_documents_caller_binding_test.sql`, `mood_boards/share_security_test.sql`). Final shape: `REVOKE ALL PRIVILEGES … FROM anon` then `GRANT SELECT … TO anon`. The write half — the roster-mint primitive, reachable with the key in the iOS binary — is gone; the SELECT satisfies a permission check and returns **zero rows**, because RLS admits anon only through 00014's `auth.uid() = designer_id` and `auth.uid()` is NULL. New case **8c** asserts all of it, including 8c5, which reads `storage.objects` as anon so that **00555's own suite** catches this rather than two suites in other directories. |
| **RF2-09** (minor) | **fixed** | `REVOKE TRUNCATE, REFERENCES ON public.profiles FROM authenticated`. `GRANT SELECT, INSERT, UPDATE` is additive and did not clear what the pre-flip creation default handed out (the full `arwdDxtm`). **RLS does not constrain TRUNCATE** — a grantee empties the table in one statement, every policy above it notwithstanding. `TRIGGER` and `MAINTAIN` are deliberately left: not reachable through PostgREST, and clearing them would be a change this migration cannot test. |
| **RF2-10** (minor) | **fixed** | `REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon`. A SECURITY DEFINER function in the PostgREST-exposed `public` schema with a `PUBLIC` EXECUTE grant. A direct call raises `0A000` (it is a trigger function), so this is exposed surface with no caller rather than a live hole — and a trigger needs no EXECUTE to fire, which is why the revoke is safe. Same hygiene 00290 applied to `fc_sync_is_designer_from_role`. |
| **RF2-11** (minor) | **fixed** | All five new functions moved from `SET search_path TO 'public'` to `SET search_path = public, pg_temp`, naming `pg_temp` explicitly instead of leaving it implicitly at the front of the path where a caller-created temp object can shadow a schema one. `handle_new_user` keeps 00313's spelling — B2 v3(a) says verbatim, and the graft guard checks the body. The §10 assertion was updated to match and now covers `list_vendor_profiles` too, which it had been missing. |
| **RF2-12** (minor) | **fixed** | Runbook **B8** step 3 asked Kody to screenshot "the comms vendor picker". There is no such screen — `useVendorProfiles` has no UI consumer, which **A3 and A6 of the same runbook already say**. The step is removed (B8 is now four items: vendors catalogue, vendor detail, People directory, roster/team avatars), with the grep that would prove a lane has wired it up since, and a note that `list_vendor_profiles` still ships and is covered by probe §9a. A walk step aimed at a screen that does not exist is worse than a missing one: it cannot pass, so it gets marked done without being done. |

### Two things this round checked and deliberately did NOT change

- **`list_vendor_profiles`' `p.role = 'vendor'`** looks like a B2 v3(b) violation and is not. It selects
  a **directory**, not an authority — the caller-side predicate is `auth.uid() IS NOT NULL`. There is no
  `is_designer` analogue for vendors and no vendor domain in `public.roles`. And the label is not
  self-servable after this migration: a client may write `role` only to `'homeowner'`, and the INSERT
  legs either omit it or pin `'homeowner'`, so `'vendor'` reaches a row only through `service_role`.
- **`can_view_profile`'s legs.** Every one is a relationship term — roster, project, proposal, invoice,
  engaged lead, direct order, live scan share, live thread, studio/org co-membership. None reads
  `profiles.role`, and none should: "do these two people know each other" is never a question about a
  label. The reasoning is recorded in the function's header so the next reviewer does not re-derive it.

### The HTTP attack matrix, re-run

Freshly reset local stack. Actors: a **real** `POST /auth/v1/signup` account
(`role=designer`, `is_designer=f`, no designer/admin grant — the shape RF2-01 was about),
`client@patina.dev` (`homeowner`), and `designer@patina.dev` (Leah — `designer`, `is_designer=t`,
two grants). All calls are PostgREST with a password-grant JWT.

```
1. self-signup — the roster mint MUST be refused
   POST /rest/v1/designer_clients {designer_id: self, client_id: <Leah>}   403  42501 "…violates row-level security policy \"designer_cl…"
   POST /rest/v1/designer_clients {designer_id: self, client_id: self}     403  42501  same policy
   rows minted by that account                                             0

2. a seeded designer — the roster mint MUST be allowed
   POST  /rest/v1/designer_clients {designer_id: Leah, client_id: <new>}   201
   PATCH /rest/v1/designer_clients (re-point)                              204

3. own role UPGRADE — MUST be refused
   PATCH /rest/v1/profiles?id=eq.<self> {"role":"designer"}                403  42501
   PATCH /rest/v1/profiles?id=eq.<self> {"is_designer":true}               403  42501
   client after                                                            homeowner | false

4. own DOWNGRADE — MUST be allowed (ruling B2 v3(c), the A3-07 fix)
   self-signup before                                                      designer
   PATCH /rest/v1/profiles?id=eq.<self> {"role":"homeowner"}               204
   PATCH … the same call again (the app runs it every sign-in)             204   idempotent
   self-signup after                                                       homeowner
   PATCH /rest/v1/profiles?id=eq.<self> {"role":"designer"}   (climb back) 403  42501
   self-signup final                                                       homeowner
   PATCH /rest/v1/profiles?id=eq.<self> {"display_name":…}                 204   no 42P17

5. CROSS-ACCOUNT demote / rename of a real designer — MUST be refused
   Leah before                                                             designer | true | Leah Hartwell
   POST  /rest/v1/designer_clients {designer_id: client, client_id: Leah}  403  42501
   PATCH /rest/v1/profiles?id=eq.<Leah> {"role":"homeowner",
                                         "is_designer":false}              200  []      ← no row selectable
   PATCH /rest/v1/profiles?id=eq.<Leah> {"display_name":"PWNED"}           200  []
   Leah after                                                              designer | true | Leah Hartwell
   rows minted by the client                                               0

6. a designer edits their ROSTERED client — MUST be allowed
   PATCH /rest/v1/profiles?id=eq.<client> {"display_name":"Client User R3b"}
                                                                           200  [{"id":"a0000000-…-005","display_name":"Client User R3b"}]
   PATCH /rest/v1/profiles?id=eq.<client> {"is_designer":true}             403  42501   still cannot promote

7. anon
   GET  /rest/v1/profiles?select=id                                        401  42501
   GET  /rest/v1/designer_clients?select=id                                200  []      ← grant kept, RLS empty (RF2-08)
   POST /rest/v1/designer_clients                                          401  42501
```

The two refusals in (5) answer **`200 []`** rather than `403`, and that is the correct shape: the
policy's `USING` no longer selects the row, so the statement matches nothing. A `403` would mean the row
was selected and the check refused it. (6)'s `200` carries the row, which is the contrast that makes
(5)'s emptiness mean something — a policy that refuses everything passes every case in (1), (3) and (5)
and would still be broken.

### Gates, re-run on `first-flight/integration`

| Gate | Result |
|---|---|
| `pnpm supabase:reset` | **0** — 511 migrations, head `00557`; marker probe confirms the loaded 00555 is this branch's (`designer_clients_writer_is_designer` reads `user_roles` → `true`) |
| `bash scripts/run-sql-tests.sh` | **0** — `total: 147 · green: 126 · expected-fail: 21 · unexpected-fail: 0 · effective-green: 147 / 147`. All 21 expected-fail names are in `KNOWN_FAILURES.md`; none new, none listed-and-silently-green. `PASS supabase/tests/rls/00555_ios_round_one_security.test.sql` and `PASS …/00557_increment_scan_upload_attempt.test.sql` |
| `python3 scripts/generate-legacy-grants.py` | **0** — `baseline + 2097 replayed statements`; the seed **DID** change this round (+30 lines, 5 new statements: the `profiles` TRUNCATE/REFERENCES revoke, the `designer_clients` revoke + two grants, and the `handle_new_user` EXECUTE revoke) and is committed |
| HTTP attack matrix (above) | **0** — six behaviours, all as specified |
| `deno check --config supabase/functions/deno.json supabase/functions/client-invite/index.ts` | **0** — `Check … client-invite/index.ts`. No `deno.lock` written at the repo root |
| deno test for `client-invite` | **n/a — the function has no test file.** Per the brief, the constraint is recorded as a comment at the write instead: own id only, after the invitation is validated and marked accepted, and never fatal |
| `npx prettier --check supabase/functions/client-invite/index.ts` | **advisory warn, pre-existing.** The husky pre-commit hook reports formatting drift on this file and says so is advisory locally. The drift is NOT from this round: the same check fails on `HEAD~1`'s copy of the file, before any change here. Left alone rather than reformatted, so the diff stays the behaviour change |

No iOS gate was run and no Swift file was touched.

### One trap this round paid for, worth carrying forward

**The local Supabase stack is shared across worktrees, and `supabase db reset` installs the migrations
of whichever checkout runs it.** Three of this round's runs were destroyed mid-flight by a concurrent
`supabase stop --no-backup && supabase start` from another agent's worktree — once crashing the DB
during 00555's apply (`SqlError: Connection error`), once leaving the ledger at 97 rows / head `00099`
while a foreign reset replayed, and once producing a suite run against a half-restored database whose
failures (`public.project_parties does not exist`) had nothing to do with any change here. **A red suite
on a shared stack is not evidence until you have checked who else is holding it.** The gate row above
was taken after messaging the other session and re-verifying both the ledger head **and** a
content marker proving the loaded 00555 was this branch's file — a ledger row alone would not have
caught a peer's older copy of the same migration number.

### Documents amended in fix round 3

`00555_ios_round_one_security.sql` — ruling B2 v3 verbatim in the banner with a what-changed list;
`handle_new_user` reverted to 00313 with its own guard rewritten to read the `COALESCE`; the two
restrictive `designer_clients` policies re-predicated; the own-row `UPDATE` policy turned into a
ratchet; the sibling given the two-string vocabulary; the own-row `INSERT` leg un-pinned on `role`;
four new REVOKE/GRANT statements; `search_path = public, pg_temp` on all five helpers; the
`search_shareable_designers` and `list_vendor_profiles` and `can_view_profile` verdicts recorded; the
verification block rewritten to match; a client-invite entry in REQUIRED CODE FOLLOW-UPS and in AFTER
APPLY.
`00555_ios_round_one_security.test.sql` — §11 rewritten (11a/11b flipped), §11i added, 7i–7i5, 7j, 7k,
8c and 6f/6f2 added or inverted, the `Sig` fixture and its two guards added, §10's ACL block extended.
`client-invite/index.ts` — the accept-path relabel, with the constraint comment standing in for the
absent test file.
`KODY-RUNBOOK.md` — **A10** (deploy `client-invite`) new; the block table updated; **B2** replaced with
v3 and a v2→v3 diff table; **B7a** (two pre-apply audits) and **B7b** (the one-time backfill) new;
B7's §9f row and measured shapes rebuilt around `ratchet_floor`, `using_client_vocab`,
`reads_user_roles` and `reads_profile_role`, with three new one-line ACL checks; **B8** step 3 removed;
**B9** given the missing rollbacks.
`00555_probes.md` — §9f rewritten end to end, §9f-ia extended with the role/user_roles columns, §9f-ib
and §9f-iii new, §9f-ii inverted with its fourth correction dated; the exit-criteria row updated.
`PROGRAM.md` §11.4 — L0.2 is no longer "one ruling BLOCKS it".
`waves/w1/l1-a-notes.md` — **new**, the W1 · L1-A contract for the self-downgrade: the exact call, five
rules, the per-sign-in behaviour table, the accepted consequence for a designer signing into the client
app, and a device-free verification recipe.
