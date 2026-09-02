# First Flight · W0 — integration

Written by **S9 (integration steward)**, 2026-09-02. Nothing in this file authorises a production
write; W0 carries no Kody-run step that this integration adds.

| | |
|---|---|
| Worktree | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-integration` |
| Branch | `first-flight/integration` |
| Base | `main` = **`a4d665ad7`** (`docs(capture-launch): CWS 0.3.0 store frames …`) |
| **Integration tip** | **`0ef84ae1732393894e50f43dfc32e4ada6c87ef9`** |
| `git status --porcelain` at tip (unsandboxed) | **empty** |
| `IOS_GATE_UDID` | `8ED58095-6FFA-4411-B715-73C98805C874` (`ff-w0-l01`) |

`Secrets.swift` was copied in at mode `600` and is ignored (`git status --porcelain` on that path is
empty). `.writer.lock.d` was taken at start and released at report.

> **The base moved.** `steward.md` §1 records the W0 base as `3b7916db1`. `main` has since advanced to
> `a4d665ad7` — one commit, `docs(capture-launch)`, from the peer session in the main checkout, touching
> only `artifacts/capture-launch-2026-08-29/`. The brief says branch from `main`, so the integration
> branch carries it. It shares no path with any W0 lane and produced no conflict.

---

## 1. Merge log

Four lanes, `--no-ff`, in the charter order **L0.2 → L0.3 → L0.1 → L0.7**. `first-flight/w0-l02b` was
**not** merged — it goes to `main` on its own (it is a designer-portal fix that gates 00555's apply, per
**D8**, and Fable merges it).

| # | Merge commit | Lane branch (tip) | Result |
|---|---|---|---|
| 1 | `06f5bd291` | `first-flight/w0-l02` (`8a519f271`) | clean — 9 files, +1597/−192 |
| 2 | `a2d364500` | `first-flight/w0-l03` (`56b6ade32`) | clean — 8 files, +3594/−1 |
| 3 | `acef37f56` | `first-flight/w0-l01` (`299d2a73b`) | clean — 24 files, +903/−118 |
| 4 | `0ef84ae17` | `first-flight/w0-l07` (`c1c86e9bb`) | **1 conflict**, resolved (§2) |

Subjects are `chore(first-flight): integrate …` — husky rejects `merge:` subjects.

### On merging L0.2 with a review that read `blocking: 1`

The review-state snapshot handed to this steward records **one** blocking finding against L0.2 — the
migration's own §a2 headline claim being wrong "one column over". That blocker is **`RL02-18`**, and it
is closed on the branch by two commits that post-date the review:

```
c66206523 fix(db): close the profiles.role self-elevation the sibling UPDATE policy left open (A3-04, RL02-18)
8a519f271 docs(db): probe 9f must read BOTH of profiles' UPDATE policies (RL02-18)
```

`l02-notes.md` §N10 states the closure in the lane's own words: *"00555 now pins the **role** on that leg
(`WITH CHECK … AND role = 'homeowner'`), which is the blocker … it closes **role self-elevation**, which
it now genuinely does on both UPDATE legs."* The brief's explicit merge order names L0.2 first, which is
consistent with the fix round having landed after the snapshot was taken. Merged on that reading and
recorded here so the reasoning is auditable rather than assumed.

---

## 2. The one conflict, and how it was resolved

**`supabase/config.toml`**, `[db.seed].sql_paths` — L0.3 and L0.7 each insert one seed file into the same
line.

- L0.3 adds `'./seed/catalog/first-flight-catalog.sql'` **after** `products.sql`.
- L0.7 adds `'./seed/first-flight-client-fixture.sql'` **after** `project_documents_tasks.sql`.

**Resolved as the union, each entry at its own lane's position.** Neither lane's ordering intent is
altered: the catalogue loads with the product seeds, the client fixture loads after the project/document
seeds it depends on. The resolved line, verbatim from the tip:

```
sql_paths = ['./seed/00-legacy-grants.sql', './seed/dev-accounts.sql', './seed/organizations.sql', './seed/vendors.sql', './seed/products.sql', './seed/catalog/first-flight-catalog.sql', './seed/designer-clients.sql', './seed/leads_room_scans.sql', './seed/client-rooms.sql', './seed/proposals.sql', './seed/proposal-captures.sql', './seed/decisions.sql', './seed/invoices.sql', './seed/schedule.sql', './seed/schedule-extremes.sql', './seed/project_documents_tasks.sql', './seed/first-flight-client-fixture.sql', './seed/paint_colors_seed.sql', './seed/procurement_workspace_dev.sql', './seed/procurement_receiving_dev.sql', './seed/procurement_notifications_dev.sql', './seed/aesthete_demo.sql', './seed/agent-tasks-dev.sql', './seed/fulfillment-vendor-profiles.sql', './seed/fulfillment-catalog-dev.sql', './seed/direct-orders-dev.sql', './seed/cloudflare-phase1-staging.sql', './seed/99-local-edge-settings.sql']
```

L0.7's second hunk — the same insertion into `[remotes.staging.db.seed].sql_paths` — auto-merged and was
left as the lane wrote it.

**The resolution is proven at runtime, not by reading.** `pnpm supabase:reset` loaded both files in the
merged order:

```
Seeding data from supabase/seed/products.sql...
Seeding data from supabase/seed/catalog/first-flight-catalog.sql...
…
Seeding data from supabase/seed/project_documents_tasks.sql...
Seeding data from supabase/seed/first-flight-client-fixture.sql...
```

### One observation, not a change

L0.3 adds the catalogue seed to the **local** array only, not to `[remotes.staging.db.seed].sql_paths`,
while L0.7 adds its fixture to **both**. The block's own DERIVATION RULE says staging = local minus
`00-legacy-grants.sql` minus `99-local-edge-settings.sql` plus `cloudflare-phase1-staging.sql`, so the
catalogue's absence is a divergence from that comment. It is a **lane decision, left untouched** — the
catalogue's non-local write is a Kody-run production seed (**D2**), not a staging reset — and it is
recorded here rather than silently "fixed" during a conflict resolution. Fable's call if it wants the
staging array to match.

---

## 3. Integration gate — every result at its level

All *compile-green* / *suite-green* on the merged tip `0ef84ae17`. No device claim is made anywhere in
this file; `archive` is **not** on this list — it is R1 Step 2, on Kody's machine.

| Gate | rc | Evidence |
|---|---|---|
| `pnpm install` | **0** | `Done in 30.6s` (husky prepare + 3 prisma generates) |
| `ios-gate.sh build` (attempt 1) | 65 | **expected** — the fresh-worktree `GitCommit.swift` cost (`A2-08`) |
| `ios-gate.sh build` (attempt 2) | **0** | `** BUILD SUCCEEDED **` |
| `ios-gate.sh release` | **0** | `** BUILD SUCCEEDED **` |
| `ios-gate.sh unit` (whole `PatinaTests`) | **0** | `✔ Test run with 1552 tests in 170 suites passed after 4.956 seconds.` → `** TEST SUCCEEDED **` |
| `ios-gate.sh lint-delta main` | **0** | `✓ lint-delta: no new warnings in touched files` |
| `pnpm supabase:reset` | **0** | `Finished supabase db reset on branch main.` / `Reset local database.` |
| `bash scripts/run-sql-tests.sh` | **0** | `total 147 · green 126 · expected-fail 21 · unexpected-fail 0 · effective-green 147/147` |
| `pnpm type-check` | **0** | `Tasks: 30 successful, 30 total` |
| `build-catalog.py --check` (fixture) | **0** | see §3.4 — the literal charter line is `--profile release` and cannot pass on a fixture (`RL03-08`) |

### 3.1 `build` — the first attempt fails by design

Attempt 1 exits 65 on `AppConfiguration.swift` reading `GitCommit.sha` before the `Stamp Git SHA` phase
has written the gitignored `Patina/Generated/GitCommit.swift`. Attempt 2:

```
** BUILD SUCCEEDED **
```

and `apps/mobile/Patina/Patina/Generated/GitCommit.swift` (185 B) then exists, ignored. Exactly the
pattern `steward.md` §6 documents.

### 3.2 `unit` — 1552 tests, 170 suites, and every new lane suite present

```
✔ Test run with 1552 tests in 170 suites passed after 4.956 seconds.
** TEST SUCCEEDED **
```

The six suites the two iOS-touching lanes added all ran and passed on the merged tip:

```
✔ Suite ScanSharingContractTests passed after 0.657 seconds.     (L0.2)
✔ Suite ReleaseConfigurationTests passed after 0.679 seconds.    (L0.1)
✔ Suite PrivacyManifestTests passed after 0.680 seconds.         (L0.1)
✔ Suite AnalyticsKillSwitchTests passed after 2.992 seconds.     (L0.1)
✔ Suite PermissionStringTests passed after 0.679 seconds.        (L0.1)
✔ Suite FeatureFlagsDefaultTests passed after 2.874 seconds.     (L0.1 · D1a)
```

That `ScanSharingContractTests` ran at all is the thing worth noting: L0.2 added the file and L0.1
rewrote `project.pbxproj` in the very next merge. The suite executing proves the two lanes' changes did
not cancel each other out.

Nineteen log lines match `failed`; **all nineteen are test names** (`"a failed deferral is not reported
as a failed choice"`, etc.), every one on a `✔ … passed` line. Zero real failures.

### 3.3 The database half — reset owner

`steward.md` §4 sequences L0.2 → L0.3 → L0.7 as reset owners. All three lanes are done, so this steward
took ownership. **RESET START 2026-09-02T16:30:50Z · RESET FINISH 2026-09-02T16:31:44Z**, against the
local stack only (`project_id = "supabase"`, `postgresql://…@127.0.0.1:54322`).

Migration head after reset — **00555 and 00557 replay clean from the tree**:

```
00557
00555
00554
00553
```

`00556` is a **deliberate gap**: L0.2 renumbered `increment_scan_upload_attempt` off 00556 onto 00557
(`5d491eff7`). The three new SQL objects exist locally: `increment_scan_upload_attempt`,
`list_vendor_profiles`, `search_shareable_designers`.

The whole suite, then the `KNOWN_FAILURES.md` diff the charter asks for:

```
total:             147
green:             126
expected-fail:      21  (documented in supabase/tests/KNOWN_FAILURES.md)
unexpected-fail:     0
effective-green:   147 / 147
```

Machine diff of the observed expected-fail set against the file's parseable entries:

```
KNOWN_FAILURES entries: 21
expected-fail observed: 21
listed but NOT failing today:  (none)
failing today but NOT listed:  (none)     ← a name here would be a STOP
```

The set matches **exactly** — no new failure name, and no listed file silently gone green. (The file's
prose says "22 residuals"; its machine-readable list carries 21. A stale narrative count, not a missing
failure.)

The three new SQL test files all ran and passed:

```
PASS  supabase/tests/catalog/first_flight_catalog_test.sql
PASS  supabase/tests/rls/00555_ios_round_one_security.test.sql
PASS  supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql
```

### 3.4 The catalogue checker — the charter's literal line cannot pass yet

The command as written in the brief:

```bash
python3 scripts/first-flight/build-catalog.py --check .../waves/w0/catalog-fixture.csv
```

**exits 1**, with:

```
error: …/catalog-fixture.csv: 6 rows, below the round-one floor of 30
…: 1 error(s) — nothing emitted
```

This is **not a regression and not a merge defect**. `--profile` defaults to `release`, which enforces
**D2**'s ≥ 30-row floor; `catalog-fixture.csv` is a deliberate 6-row fixture covering the six
`ProductCategory` values. L0.3's own review already recorded this as **`RL03-08`** — *"the charter's
third gate line cannot pass on the template … the day-1..day-5 form is `--check --profile fixture …
catalog-fixture.csv`, and the charter's line becomes runnable at D2's manifest hand-off."*

The runnable form, and the lane's own gate line including the editorial manifest, both **exit 0**:

```
$ … --check <fixture> --profile fixture
…/catalog-fixture.csv: 6 rows · 6 categories (decor, lighting, seating, storage, tables, textiles) · 5 makers · 3 published inside 7 days · 6 with a spectrum
rc=0

$ … --check <fixture> --profile fixture --editorial <editorial-fixture>
…/catalog-fixture.csv: 6 rows · 6 categories … · 5 makers · 3 published inside 7 days · 6 with a spectrum
…/editorial-fixture.csv: 3 editorial story/stories · read minutes 1/1/1 (derived at 200 wpm, never read from the manifest)
rc=0
```

**The release-profile line stays failing on purpose** and becomes the real gate the day Leah's ≥ 30-piece
manifest lands (**D2**, end of day 6). It is not something to fix in the pipeline.

### 3.5 Release product shape, read off the merged tip's own artifact

Not a gate line, but the cheapest possible confirmation that L0.1's configuration work survived three
later merges. Read from
`.build/DerivedData/Build/Products/Release-iphoneos/Patina.app`:

| Claim | Value | Finding |
|---|---|---|
| App `CFBundleVersion` / `CFBundleShortVersionString` | `3` / `1.0` | `A2-01` |
| Widget appex `CFBundleVersion` / short | `3` / `1.0` — **identical to the app** | `A2-01` (ITMS mismatch) |
| `UIDeviceFamily` | `[1]` — iPhone only | `A2-03`, `C7-11`, **D4** |
| `MinimumOSVersion` | `26.0` | `A2-13`, **D6** |
| `ITSAppUsesNonExemptEncryption` | `false` | `A2-06` |
| Privacy manifests | `Patina.app/PrivacyInfo.xcprivacy` **and** `PlugIns/PatinaWidget.appex/PrivacyInfo.xcprivacy` | `A2-02`, **D15** |
| Widget embedded | `PlugIns/PatinaWidget.appex` | G1 precondition |

These are **compile-green / product-inspection** claims. `aps-environment`, the widget on a Home Screen,
and real cold-launch time remain **device claims**, closed only in R1.

---

## 4. What this integration does NOT cover

1. **`first-flight/w0-l02b` is not in this branch.** Per **D8** it merges to `main` on its own, ahead of
   the integration branch, and the designer portal is redeployed before 00555 is applied. Anyone reading
   the integration tip for the FF-01a/b/c guards will not find them here — that is correct.
2. **No production write of any kind was made.** 00555 and 00557 are applied to the **local** stack only,
   by `pnpm supabase:reset`. Strata is untouched; the apply path stays `KODY-RUNBOOK.md`.
3. **`archive` was not run** and is not a steward command (§2's integration-gate list says so
   explicitly). It needs an authenticated Xcode account, ASC network round trips and a distribution
   keychain that can prompt.
4. **No walk.** The charter's integration gate ends with "one walker per surface, one clone per walker, on
   the steward's signed Debug build". This steward built only `CODE_SIGNING_ALLOWED=NO` products — a
   compile artifact, never installable for a walk. The signed Debug build and the walkers are the next
   step, not part of this log.
5. **`ios-gate.sh all` was not run as a single command.** Its three tiers were run individually
   (`build`, `unit`, `lint-delta main`) and all three are green above; `all` is exactly
   `build + unit + lint-delta`.

---

## 5. Retirement — not done, deliberately

The five W0 lane worktrees, their branches and the two simulator clones are **still live**. Retirement
(`steward.md` §9) belongs at wave close, after Fable merges `first-flight/integration` to `main`, and
`ff-w0-l01` is still the `IOS_GATE_UDID` any re-run of these gates would use. `git worktree list` at
report time shows six worktrees plus the main checkout, no strays — `lint-delta`'s temporary detached
base worktree was created and removed cleanly inside the run.
