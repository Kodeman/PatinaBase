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

Two blocks carry a decision that must be made **before** the command runs:

1. **B2 — `handle_new_user`'s `homeowner` fallback.** After 00555, designer-portal self-signups are
   written `role = 'homeowner'` and then labelled `client` in every comms thread. Three options, one
   ruling line to fill in. Every account created between the apply and a fix carries the wrong role.
2. **D2 — the demo proposal's `client_visibility_tier`.** `demo-account.sql:187` says `'milestone'`, so
   the tester opens an $18,500 proposal with five line names and no money (`L07-07`). It is **one-way**:
   `guard_proposal_copy_immutability` forbids changing that column on a non-draft proposal, and the row
   is inserted as `sent`. One word on one line, before the seed, or never.

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
