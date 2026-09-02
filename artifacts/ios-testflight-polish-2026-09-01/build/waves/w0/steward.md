# First Flight · W0 — steward bootstrap

Written by S0 (steward) on 2026-09-02. Every lane reads this file **after** `PROGRAM.md` and
`rulings-2026-09-02.md`, and **before** writing its task list.

Nothing in this file authorises a production write. Every prod step in W0 is a Kody-run line.

---

## 1. Base

| | |
|---|---|
| Base sha | **`3b7916db1a601ce2877cb9f879fb2ea12f3d98ee`** |
| Subject | `docs(ios): First Flight — TestFlight-polish audit and program plan` |
| Branch | `main`, equal to `origin/main` after `git fetch origin` (both at `3b7916db1`) |
| In-progress rebase / merge in the main checkout | **none** (`ls .git \| grep -iE 'rebase\|MERGE_HEAD'` → empty) |

A peer session (**patina-repo-cleanup**) may be live in the main checkout
`/Users/kody/Code/patina-merged`. **No lane runs git there.** The only commands this program aims at the
main checkout are `git worktree add`, `git fetch` and `git log`. Before any git command, confirm where
you are:

```bash
git rev-parse --show-toplevel     # must print YOUR worktree path, never /Users/kody/Code/patina-merged
```

---

## 2. Worktrees

All five were created from `main` at the base sha above, each on its own branch.

| Lane | Worktree path | Branch |
|---|---|---|
| **L0.1** Build & configuration | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l01` | `first-flight/w0-l01` |
| **L0.2** Production backend | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02` | `first-flight/w0-l02` |
| **L0.2b** The Document's read paths | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02b` | `first-flight/w0-l02b` |
| **L0.3** The room is not empty | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l03` | `first-flight/w0-l03` |
| **L0.7** Daily-surfaces coverage walk | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l07` | `first-flight/w0-l07` |

`git worktree list` (verbatim):

```
/Users/kody/Code/patina-merged                                    3b7916db1 [main]
/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l01   3b7916db1 [first-flight/w0-l01]
/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02   3b7916db1 [first-flight/w0-l02]
/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02b  3b7916db1 [first-flight/w0-l02b]
/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l03   3b7916db1 [first-flight/w0-l03]
/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l07   3b7916db1 [first-flight/w0-l07]
```

### `Secrets.swift`

Copied into **l01, l02, l07** at
`apps/mobile/Patina/Patina/App/Configuration/Secrets.swift` (1.1 KB, mode `600`).
`git status --porcelain` on that path is **empty** in all three — it is covered by `.gitignore:53`.
**Never commit it.** l02b and l03 are not iOS lanes and do not have it.

### JS bootstrap (done)

| Worktree | `pnpm install` | `pnpm turbo build` |
|---|---|---|
| **l02b** | exit 0 | `@patina/types`, `@patina/utils`, `@patina/api-routes`, `@patina/help-system` built (6 tasks successful over the full designer-portal dependency closure) |
| **l02** | exit 0 | `@patina/types`, `@patina/utils` built (2 tasks successful) |

**`@patina/supabase` has no `build` script** — it is consumed as TypeScript source
(`"main": "./src/index.ts"`, `exports` all point at `src/`). `pnpm turbo build --filter=@patina/supabase`
therefore builds only its *dependencies* and prints `Tasks: 2 successful`. That is the correct,
complete result — **not** a silent skip to worry about. Turbo does silently skip workspaces lacking the
script (`patina-verification`), which is why the counts are recorded here.

Verified dists in **l02b**: `packages/types/dist` (127 files), `packages/utils/dist` (71),
`packages/api-routes/dist` (7), `packages/help-system/dist` (6). `catalog-ui`, `email`, `notifications`,
`shared` and `supabase` have no build script and no dist by design.

l01, l03 and l07 were **not** `pnpm install`ed — they need no JS toolchain for their lanes. A lane that
discovers it does needs `pnpm install` in its own worktree (unsandboxed), not a borrowed `node_modules`.

### Lane hygiene

- `mkdir .writer.lock.d` at the top of your worktree when you start; `rmdir` it in your report.
  One writer per worktree. A replacement writer only after the lock owner is proven dead.
- **Pathspec commits only.** `git add -A` is banned — `git status` in this repo lists thirty-odd
  untracked directories.
- Conventional Commits. Husky rejects `merge:` subjects — the steward uses
  `chore(first-flight): integrate …`.
- No push from a lane subagent.

---

## 3. Simulator clones

The protected review device **`973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro)** was shut down
for the clone, cloned twice, and **rebooted** — it is `Booted` again and belongs to nobody in W0.

| Lane | Clone name | UDID |
|---|---|---|
| **L0.1** | `ff-w0-l01` | **`8ED58095-6FFA-4411-B715-73C98805C874`** |
| **L0.7** | `ff-w0-l07` | **`BD0AC7E5-EF5E-4C64-85A7-825D0CEA7BE8`** |

State applied to both, in order: `simctl erase` (rc 0, while shut down) → `simctl boot` →
`simctl keychain <udid> reset` (rc 0) →
`simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4`
(rc 0) → `simctl ui <udid> appearance light` (rc 0; read back as `light`).
`xcrun simctl io <udid> screenshot` succeeded on both — they render.

Both have a real Simulator.app **window** (448 × 954 pt): confirmed by `CGWindowListCopyWindowInfo`,
titles `ff-w0-l01` and `ff-w0-l07`. They are **not** headless.

> **Window check — use Quartz, not System Events.** `tell application "Simulator" to get name of every
> window` fails `-1728` (Simulator's dictionary has no `window`), and the System Events route
> (`tell process "Simulator" to count windows`) returns **`0` with rc 0** on this machine even when
> windows exist — the harness has no Accessibility grant, and it fails *silently*. The check that tells
> the truth:
>
> ```bash
> python3 -c "
> import Quartz
> wl = Quartz.CGWindowListCopyWindowInfo(
>     Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements,
>     Quartz.kCGNullWindowID)
> for w in wl:
>     if 'Simulator' in str(w.get('kCGWindowOwnerName','')):
>         print(w.get('kCGWindowName',''), w.get('kCGWindowBounds'))
> "
> ```
>
> Also: `open -a Simulator --args -CurrentDeviceUDID <udid>` is a **no-op when Simulator.app is already
> running** — the args only take on a cold launch. Boot with `xcrun simctl boot <udid>` and verify the
> window with the snippet above.

### Devices nobody in W0 touches

| Device | UDID | Why |
|---|---|---|
| iPhone 17 Pro (review device) | `973D1724-90BF-4A0A-B02D-481D561547B3` | The program's protected walk device. Never erase it. |
| iPad Pro 11-inch (M5) | `7C8C092C-7AD4-453C-9CC6-40E0931260AC` | Booted, another session's. |
| `Coach-iPhone-A/B/C`, `Coach-Watch-*` | — | Another program's. |

### The rules that make the clones worth having

1. **One clone per lane, never shared.** Two agents on one clone manufacture defects — the gap round
   produced "the app is crashing" and a phantom sign-in wall, both caused by another lane's
   `simctl terminate` (`RBSProcessExitStatus | domain:frontboard(10) code:force-quit`).
2. **Explicit udid on every call. Never `booted`.** With four booted devices on this machine,
   `booted` is ambiguous and `ios-gate.sh`'s current `sim_destination()` — which scrapes
   `simctl list … | grep -iE 'iPhone (17|16|Air)' | head -1` — will seize the wrong one.
   **Until L0.1 lands the `IOS_GATE_UDID` requirement, no lane runs `ios-gate.sh unit`, `ui` or `all`.
   Only `build`, which takes a generic destination.**
3. **Never `CODE_SIGNING_ALLOWED=NO` for anything a walker drives.** It strips entitlements, the
   keychain rejects every call, sessions never persist and writes silently no-op. It is correct for
   `ios-gate.sh build` / `release` and for the compile checks below; it is never correct for an install
   a human or an agent will drive. L0.7 walks the **steward's signed Debug build**.
4. **Never `--uitesting` for a walk** (resets auth every launch, disables PostHog), and **repeat the
   launch arguments on every launch** — `NSArgumentDomain` is volatile, and an argument-less launch is a
   **production** launch against Strata.
5. **Screenshots only via `xcrun simctl io <udid> screenshot`** (or the blitz screenshot tool). Never
   desktop `screencapture` — the desktop is Kody's.
6. **`describe_screen` over `scan_ui`.** An empty `scan_ui` is never proof a control is missing.
7. **Fresh-install state** is `terminate` → `uninstall` → `simctl keychain <udid> reset` → `install` →
   re-apply the status-bar override. The keychain survives an uninstall.

---

## 4. Local stack

`supabase status` from `/Users/kody/Code/patina-merged` (unsandboxed) — up, not reset.

| Check | Result |
|---|---|
| `supabase status` | rc 0. `Stopped services: [supabase_pooler_supabase]` (pooler only — not used by this program) |
| Edge runtime container | `supabase_edge_runtime_supabase` — **Up 15 hours**. No `docker start` was needed |
| PostgREST root `GET /rest/v1/` (apikey: local anon) | **200** |
| PostgREST `GET /rest/v1/products?select=id&limit=1` | **200** |
| Functions root `GET /functions/v1/` | **404** (expected — the router has no root route) |
| Mailpit `GET http://127.0.0.1:54324` | **200** |
| GoTrue `GET /auth/v1/settings` | **200** |
| Seeded `client@patina.dev` | present in `auth.users`, `confirmed_at` non-null |
| Seeded `james.okafor@example.com` | present in `auth.users`, `confirmed_at` non-null |
| Local migration head | `00554` (`schema_migrations` top row) |
| Repo migration head | `supabase/migrations/00554_onboarding_review_fixes.sql` |
| `00555` / `00556` in `supabase/migrations/` | **neither exists** — both numbers are free; 00555 lives only as a draft under `build/migrations-draft/` |

Local endpoints: DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres` · API `http://127.0.0.1:54321`
· Studio `http://127.0.0.1:54323` · Mailpit `http://127.0.0.1:54324`.

**Migration numbers are provisional.** Immediately before minting 00555 or 00556, re-run
`ls supabase/migrations/*.sql | sort -V | tail -5` and `supabase migration list`, and renumber on
collision — other programs mint in this band.

### ⚠ RESET OWNERSHIP SEQUENCE — W0

`pnpm supabase:reset` destroys the shared local database. Three lanes need it; **nobody else runs it**,
and the three run **in this order**, each announcing start and finish in its report:

1. **L0.2 first** — `pnpm supabase:reset` then the **whole** SQL suite
   (`bash scripts/run-sql-tests.sh`, diffed against `supabase/tests/KNOWN_FAILURES.md`; a **new** failure
   name is a stop, not a note). This is what 00555's own AFTER-APPLY block instructs.
2. **L0.3 second** — reset, then the local catalogue proof
   (`psql … -f supabase/tests/catalog/first_flight_catalog_test.sql`, then
   `python3 scripts/first-flight/build-catalog.py --check …`).
3. **L0.7 third** — the seed fix (the `activeProject` client fixture: ≥ 1 `sent` proposal, 1 decision
   awaiting the client, 1 open invoice, 1 `client_visible` document, 1 project, 1 order, 1 live thread)
   then reset, then the walk.

L0.1 and L0.2b never reset. A lane that finds the database in an unexpected state **asks the steward**;
it does not reset to fix it.

---

## 5. Owned-file map per lane

Verbatim from `PROGRAM.md` §3 W0, plus the rulings that change or extend each lane. **Every file in the
app belongs to exactly one lane per wave.** A change you want in another lane's file is an **integration
note** at `build/waves/w0/<lane>-notes.md` carrying the **exact final text** — the owner applies it as a
numbered task in its own list. An integration note nobody scheduled is not a plan.

---

### L0.1 — Build & configuration · *iOS · Opus*

```
apps/mobile/Patina/Patina.xcodeproj/project.pbxproj
apps/mobile/Patina/Config/Version.xcconfig            (new)
apps/mobile/Patina/Patina/Info.plist
apps/mobile/Patina/Patina/PrivacyInfo.xcprivacy        (new)
apps/mobile/Patina/PatinaWidget/PrivacyInfo.xcprivacy  (new — the appex needs its OWN, see below)
apps/mobile/Patina/Patina/Patina.entitlements
apps/mobile/Patina/PatinaWidget/Info.plist
apps/mobile/Patina/Patina/Assets.xcassets/**
apps/mobile/Patina/Patina/Features/Home/Views/AddToRoomSheet.swift          (the #Preview block only)
apps/mobile/Patina/Patina/Features/Home/Views/DailyStoryCard.swift          (the #Preview block only)
apps/mobile/Patina/Patina/Features/Home/Views/DailyStoryDetailView.swift    (the #Preview block only)
apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift (the #Preview block only)
apps/mobile/Patina/scripts/ios-gate.sh
apps/mobile/Patina/scripts/ExportOptions.plist         (new — see §4)
apps/mobile/Patina/Patina/App/Configuration/AppConfiguration.swift
apps/mobile/Patina/Patina/Services/Analytics/PostHogService.swift
apps/mobile/Patina/Patina/PatinaApp.swift              (the PostHog init guard only)
apps/mobile/Patina/.gitignore-adjacent: repo .gitignore lines 53, 57
```

**Rulings that add to this lane.**

- **D1a — `house-first` defaults ON.** L0.1 **also owns**:
  - `apps/mobile/Patina/Patina/Core/State/FeatureFlags.swift` — a per-flag default table:
    `house-first: true`, `direct-orders: false`, `house-widget: false`. `house-first` resolves **true**
    when PostHog has no answer (fresh install, no cached payload, no `-PatinaFlags` argument). A PostHog
    payload saying `false` still wins — it is the kill switch. `-PatinaFlags` stays authoritative in
    DEBUG. `--uitesting` stays all-off unless a flag is named. The other two flags keep the fail-closed
    default.
  - `apps/mobile/Patina/PatinaTests/FeatureFlagsDefaultTests.swift` (new) — pins all four cases:
    no-payload default, PostHog-`false` kill switch, `-PatinaFlags` override, `--uitesting`.
- **D4 — iPhone-only.** `TARGETED_DEVICE_FAMILY = 1` on **both** targets (closes `A2-03`, `C7-11`).
- **D6 — deployment target 26.0**, not 26.5 (closes `A2-13`).
- **D15 — the widget ships its own `PrivacyInfo.xcprivacy`.** ITMS-91053 is evaluated **per binary**;
  an app-only manifest still parks processing on `PatinaWidget.appex`. Both files ship, and both are
  asserted.

D4 and D6 are **ruled yes** — the lane no longer stops on `A2-03` / `C7-11` / `A2-13` awaiting a call.

**The two mechanics only an archive would catch.**

1. **`Config/Version.xcconfig` does not move the build number on its own.** Xcode resolves target-level
   settings *above* xcconfig values, and `CURRENT_PROJECT_VERSION = 1` is set in **all eight**
   configurations. Three steps, in order: (a) **delete** `CURRENT_PROJECT_VERSION` and
   `MARKETING_VERSION` from all eight (`Patina` Debug/Release, `PatinaWidget` Debug/Release, and the
   project-level pair for each); (b) set `baseConfigurationReference` to `Config/Version.xcconfig` on
   **every** configuration of **both** targets — not just Release; (c) assert the **resolved** value in
   `ReleaseConfigurationTests` on a Debug simulator run, so a mis-wire fails in seconds rather than
   after a 20-minute archive.
2. **The widget's own privacy manifest** — see D15 above.

**Tests this lane must add.** `PatinaTests/ReleaseConfigurationTests.swift` ·
`PatinaTests/PrivacyManifestTests.swift` (two assertions — app root *and*
`PlugIns/PatinaWidget.appex/PrivacyInfo.xcprivacy`) · `PatinaTests/AnalyticsKillSwitchTests.swift` ·
`PatinaTests/PermissionStringTests.swift` (new if absent) · **plus D1a's
`PatinaTests/FeatureFlagsDefaultTests.swift`**.

**`ios-gate.sh` changes this lane owns** (they unblock every other lane's gate): `IOS_GATE_UDID`
**required** for the `unit` and `ui` tiers (`sim_destination()` errors and exits 2 when unset, never
scrapes `head -1`); a per-worktree `-derivedDataPath "$PROJECT_DIR/.build/DerivedData"` on **every**
xcodebuild invocation; new `release` and `archive` tiers. **`all` stays `build + unit + lint-delta`** —
`release` is wired in explicitly beside it, not folded into it (L2-G measures the whole-module Release
compile cost in W2). `archive` is on neither: it is R1 Step 2, on Kody's machine.

**Integration notes out of this lane.** A2-12's seven final permission sentences → L1-E (the build
settings win, so L0.1 pastes the wording L1-E returns). A2-10 / A2-14 / A2-22 create asset-catalogue
tokens L1-D consumes — **L0.1 owns `Assets.xcassets` in W0; L1-D does not edit it.** A2-15/A2-16's
PostHog project-and-flag half is L0.6's.

**This lane's archive is Kody's, not the agent's.** The agent reports `release` green and hands over.

---

### L0.2 — Production backend · **KODY-RUN** · *an agent prepares and probes* · Opus

```
supabase/migrations/00555_ios_round_one_security.sql        (drafted: build/migrations-draft/)
supabase/tests/rls/00555_ios_round_one_security.test.sql    (drafted: build/migrations-draft/)
supabase/migrations/00556_increment_scan_upload_attempt.sql (new, if D13 says keep the call)
supabase/seed/00-legacy-grants.sql                          (regenerated, never hand-edited)
packages/supabase/src/database.types.ts                     (regenerated)
apps/mobile/Patina/Patina/Services/Sharing/ScanSharingService.swift  (the searchDesigners follow-up)
```

Everything under `apps/designer-portal/**` and `packages/supabase/src/hooks/**` belongs to **L0.2b**,
not here. L0.2 writes the SQL those follow-ups call (`search_shareable_designers`,
`list_vendor_profiles`); L0.2b wires the callers.

**Rulings that add to this lane.**

- **D13 — write `increment_scan_upload_attempt` as `00556`**, mirroring `mark_scan_upload_complete`'s
  shape and grants. The conditional in the glob list above is now unconditional: **00556 is written.**
  (The re-probe already confirmed it is the one object genuinely missing on Strata.)
- **D7 + D11 — the demo account.** L0.2 additionally **writes**
  `build/waves/w0/demo-account.sql` — a **Kody-run** script that mints a clean, purpose-built client
  account as the demo / walk identity, proposed `firstflight@patina.cloud` (**no mailbox needed** — the
  code is the Vault `test_login_code`), with a real-looking house: one project with a live designer, one
  decision awaiting the client, one sent proposal, one open invoice, one document, one thread. It also
  drafts the **Vault allow-list update** (allow-listed emails only, fail-closed) that the app-side
  `test-account-login` fallback reads. The app half of D7/D11 is **W1 · L1-A**
  (`AuthService.verifyOtp`), not this lane. `tester@patina.cloud` is retired from the app's story, and
  **`A3-15` needs no W1 row** — the new account closes it.
- **DM-1 — 00555 ships as drafted**: anon read closed, self-elevation closed, tightened legs. The
  `profile_private` PII split is a **W2** migration, not W0; counterparty column visibility is accepted
  for round one.
- **D8 — 00555 goes to Strata on day 2, not day 1**, after L0.2b's follow-ups merge **and** the designer
  portal is redeployed.

> ### ⚠ KODY-RUN LANE
> Every mutation is a production write. An agent may draft the SQL, write the tests, run the read-only
> probes and read the advisors. An agent may **not** apply. **The Bash prod-mutation hook does NOT cover
> Supabase MCP writes** — `mcp__claude_ai_Supabase__apply_migration` will *not* be stopped by the guard
> rail, so it needs the same explicit ship request a `psql` apply does. Do not call it.
>
> `L0.3`'s acceptance probe `select count(*) > 0 from get_recommendations(null, null, 20, 0)` is **not
> read-only** — it writes a `match_events` row and can insert a `client_style_profiles` row. An agent
> does not run it against production.

**Step 0 of Kody's apply is not SQL.** `git log --oneline -1 -- apps/designer-portal packages/supabase/src/hooks`
must show L0.2b's follow-ups merged, **and** `wrangler deployments list --name patina-designer-portal`
must show a deployment newer than that commit. If either is false, **stop** — applying now returns 500s
on `app.patina.cloud/api/catalog/vendors` and a 42501 error state on every comms screen listing vendors.

**The nine silent degradations** 00555 creates are **not** this lane's to fix — they are a tracked W3
list at `build/waves/w3/00555-degradations.md`, opened by this lane at apply time, one line per site with
a verdict (cosmetic / audit-relevant / row-losing). The two that are **not** cosmetic —
`project_unbilled_time` (an INNER JOIN on `profiles`, so it *loses rows* and understates unbilled time)
and `use-commercial-documents.ts:1290` (an **audit** field) — are flagged to Kody in the apply report,
not left in the list.

---

### L0.2b — The Document's read paths · *agent lane · Opus · **ships before 00555***

```
apps/designer-portal/src/app/api/catalog/vendors/route.ts
apps/designer-portal/src/app/api/catalog/vendors/[id]/route.ts
packages/supabase/src/hooks/use-comms.ts          (useVendorProfiles only — lines 1060-1065)
```

No other file under `apps/designer-portal/**` or `packages/supabase/**` is in this program at all. A
change this lane wants outside those three files is an integration note to Fable and a separate
decision, **not a commit**.

**Findings it closes: none** — and that is the point. These three sites surfaced in 00555's own
adversarial review and appear in no finding id. They are recorded as `FF-01a/b/c` in
`build/waves/w0/l0.2b-tasks.md`.

- **FF-01a** `api/catalog/vendors/route.ts:5-13` — add a `getUser()` guard returning 401, **and** replace
  `.select('*')` with the named public-face columns the page renders. **The guard is required whether or
  not 00555 ever lands — the leak is live today** (the middleware passes `/api/*` through, so all 13
  trade columns are readable by anyone who curls it).
- **FF-01b** `api/catalog/vendors/[id]/route.ts:5-18` — same guard, same column naming. The detail route
  renders trade fields for a signed-in designer: keep them **behind the guard**, do not remove them.
- **FF-01c** `packages/supabase/src/hooks/use-comms.ts:1060-1065` — swap the `.from('profiles')`
  directory read for `.rpc('list_vendor_profiles')` (L0.2 ships the SECURITY DEFINER RPC inside 00555:
  returns `id, full_name, avatar_url` for `role = 'vendor'`, `REVOKE EXECUTE … FROM PUBLIC, anon`,
  `GRANT … TO authenticated`). **Keep the `if (error) throw`** — with the RPC it can no longer throw
  42501. Unfixed, this hook does *not* return `[]`; it **throws** `permission denied for table profiles`
  and every screen calling it shows an error state.

**Ordering.** This lane's PR merges to `main` **on its own**, ahead of the first-flight integration
branch — it is a designer-portal fix, not an iOS one, and it must not wait for W1. **D8**: 00555 is not
clear to apply until this has merged *and* `./infra/deploy-portal.sh designer` has run (Kody's) and
`wrangler deployments list --name patina-designer-portal` shows a newer bottom row (**oldest-first — read
the BOTTOM row**).

---

### L0.3 — The room is not empty · **KODY + LEAH** · *an agent builds the pipeline; the prod write is Kody-run*

```
supabase/seed/catalog/first-flight-catalog.sql       (new — the generated seed)
scripts/first-flight/build-catalog.py                (new — the pipeline: CSV/sheet → rows + images)
scripts/first-flight/upload-catalog-images.py        (new)
scripts/first-flight/build-spectrums.py              (new — the DNA rows; see "the decisive column")
supabase/seed/products.sql                           (local mirror, so a fresh stack matches prod)
artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/catalog-manifest.csv  (Leah's input)
```

**Rulings that bind this lane.**

- **D2 — the manifest template goes to Leah on day 1.** She supplies **≥ 30 Patina-grade pieces this
  week**; the agent proves the pipeline locally by **day 2**; Kody runs the production seed. **If the
  manifest is not in hand by end of day 6, L0.3 calls the fallback** — build 1 ships the honest "still
  curating" state (L1-B's `PatinaEmptyState` work), and round one centres on the Studio surfaces. The
  call must be made **by end of day 6** so L1-B has time.
- The **"decisive column"** (the spectrum rows) is a **day 2** task, not a day 6 discovery.

**Honesty numbers the seed must produce** (`layer='catalog' AND status='published'`):
`publishable ≥ 30` · `imageless 0` · `makerless 0` · `categories 6` · `new_this_week ≥ 3`.

**The acceptance probe is Kody-run and it WRITES.** `select count(*) > 0 from get_recommendations(null,
null, 20, 0)` inserts a `match_events` row and can insert a `client_style_profiles` row. Kody runs it
twice — once anonymous, once as the **D11 demo account** with a completed quiz — and records the four
`match_events` ids in the apply report as deliberate test rows. **The agent's pre-check is the five
honesty counts plus the spectrum count, and those are genuinely read-only; they run first.**

**Integration notes.** `A-36`, `C-27`, `B-18` (missing-image rendering) are **L1-D's** and are needed
whether or not the catalogue lands — a designed placeholder is the hedge. `A3-21`/`A3-22` carry
`alsoTouches: L1-B` (`ProductCategory(normalizing:)` already absorbs `chair`/`sofa`). `A-96` is filed in
W2/L1-D but is really this lane's output.

---

### L0.7 — The daily-surfaces coverage walk · *agent lane · Sonnet, Opus reviews* · **files findings, fixes nothing**

**Owned files: none.** It writes evidence only:

```
artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/l0.7-coverage-walk.md
artifacts/ios-testflight-polish-2026-09-01/shots/w0-l0.7/**
```

**Findings it closes: zero. It *produces* them.** Fable tiers what comes back and places it into a W1
lane (blocker or major on a G5 surface) or W2.

**First task is the seed gap.** `GAP2.md`'s "documents NOT REACHABLE with the seeded client" is a *seed*
gap, not a product finding. The seed must carry at least one `sent` proposal, one decision awaiting the
client, one open invoice, one `client_visible` document, one project, one order and one live message
thread. Fix the seed, then walk. (Reset ownership: L0.7 resets **third** — see §4.)

**The walk, signed in as a seeded `activeProject` client on the local stack**, seven steps, each with a
screenshot and a written verdict:

1. Proposal detail → signing (read totals, line items, terms; sign; check `content_size large` **and**
   `accessibility-extra-large`; does the state change land without a manual refresh?).
2. Decision detail → approve **and** → defer. Both paths, both sheets, both text sizes. (The two sheets
   themselves are `GAP1B-01`/`GAP1B-02`, already W1 blockers; this walk covers the *screen* around them.)
3. Message send — compose, send, confirm arrival. Then send with the local stack **stopped** and read
   what the app says (`C4-04` says: nothing at all).
4. Documents — the list, a document, and one that fails to open.
5. Projects and orders — project detail (`C4-05` records six of seven reads as `try?`, so a half-failed
   load renders as a half-empty screen) and one order.
6. Invoices — the detail, the Pay path to its failure state, and a refresh that fails while rows are on
   screen (`C4-13`).
7. Each of 1–6 again with the stack **stopped**, then restarted — the three-state honesty check G5a
   asserts, on the surfaces L1-B's table does not name.

Every defect gets an id (`L07-NN`), a `where` at file:line, evidence, and a **proposed** tier. Routing of
what it finds: `Features/Decisions/**`, `Features/Home/**`, `Features/Settings/**` → **L1-C** ·
`Features/Messaging/**` → **L1-F** · load-state honesty → **L1-B** · wording → **L1-E**.

> ### ⚠ Open question for Fable — the flag state of this walk
> `PROGRAM.md` §3 W0 · L0.7 says the walk runs **"flags OFF"**. **D1** makes `house-first` ON for every
> tester and the four-tab root the shipped product, and **D1a** makes it the *first-launch default* —
> but D1a is implemented in **L0.1**, which will not have merged when L0.7 walks on day 1. Both readings
> are defensible (walk what ships vs. walk what today's binary does), and the choice changes which root
> the seven steps are reached through. **L0.7 must not decide this alone** — it asks Fable before step 1
> and records the answer at the top of `l0.7-coverage-walk.md`. If the answer is "walk the shipped
> root", the launch argument is `-PatinaFlags house-first` on **every** launch (`NSArgumentDomain` is
> volatile — an argument-less launch is a **production** launch).

---

## 6. The exact `xcodebuild build` line, per iOS worktree

Each iOS worktree compiles into **its own** DerivedData. Six lanes sharing one tree produce transient
failures the Daily Return already paid for. `.build/` is already gitignored.

**L0.1**

```bash
xcodebuild build \
  -project /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l01/apps/mobile/Patina/Patina.xcodeproj \
  -scheme Patina -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l01/apps/mobile/Patina/.build/DerivedData \
  CODE_SIGNING_ALLOWED=NO
```

**L0.2** (it owns `ScanSharingService.swift`, so it compiles the app)

```bash
xcodebuild build \
  -project /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02/apps/mobile/Patina/Patina.xcodeproj \
  -scheme Patina -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02/apps/mobile/Patina/.build/DerivedData \
  CODE_SIGNING_ALLOWED=NO
```

**L0.7**

```bash
xcodebuild build \
  -project /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l07/apps/mobile/Patina/Patina.xcodeproj \
  -scheme Patina -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l07/apps/mobile/Patina/.build/DerivedData \
  CODE_SIGNING_ALLOWED=NO
```

`xcodebuild` needs `dangerouslyDisableSandbox: true`.

`apps/mobile/Patina/scripts/ios-gate.sh build` runs the same compile **without** `-derivedDataPath`
until L0.1's change lands — so until then, prefer the explicit lines above for anything concurrent.

### ⚠ The first `xcodebuild` in a fresh worktree fails on `GitCommit.swift` — run it twice

`apps/mobile/Patina/Patina/Generated/GitCommit.swift` is **gitignored** (`.gitignore:57`) and is written
by the project's `Stamp Git SHA` run-script phase. A fresh worktree has **no `Patina/Generated/`
directory at all**, so the first build fails on the missing file and the second succeeds. **This is
expected. Run the build a second time before reporting a compile failure**, and only investigate if
attempt 2 also fails. (`A2-08`; L0.1 fixes it.)

**Sim-verified by the steward on l01, 2026-09-02**, running the exact line above twice back to back:

```
=== ATTEMPT 1 ===
** BUILD FAILED **
The following build commands failed:
  SwiftCompile normal x86_64 Compiling AppConfiguration.swift, Secrets.swift, AppCoordinator.swift, …
  SwiftCompile normal x86_64 …/Patina/App/Configuration/AppConfiguration.swift
  Building project Patina with scheme Patina and configuration Debug
(3 failures)
=== ATTEMPT 2 ===
** BUILD SUCCEEDED **
```

`AppConfiguration.swift:77` reads `GitCommit.sha`, and the `Stamp Git SHA` phase has not produced the
file when Sources first compiles. After attempt 2, `Patina/Generated/GitCommit.swift` exists (185 B) and
`git status --porcelain` in the worktree is **empty** — it is ignored, like `Secrets.swift`.
(Both are `l01`-only facts about the *pattern*; l02 and l07 will each pay the same first-build cost
once.)

> ⚠ **The l01 DerivedData now holds a `CODE_SIGNING_ALLOWED=NO` product.** That warm-up build wrote
> `…/agent-ff-w0-l01/apps/mobile/Patina/.build/DerivedData/Build/Products/Debug-iphonesimulator/Patina.app`
> with entitlements stripped. **Never install it on a simulator anyone drives** — the keychain rejects
> every call, sessions never persist and writes silently no-op. It is a compile artifact only. A walk
> installs the steward's **signed** Debug build, built without that flag.

Run `git status --porcelain` in a worktree **unsandboxed**. Sandboxed, git cannot stat the repo's
`.env*` files and prints `Operation not permitted` for eight of them — that is the sandbox, not a dirty
tree. All five W0 worktrees were verified clean unsandboxed at bootstrap.

### `IOS_GATE_UDID`

Every lane's task list carries this as a standing line, exported for the whole session:

```bash
export IOS_GATE_UDID=8ED58095-6FFA-4411-B715-73C98805C874   # L0.1
export IOS_GATE_UDID=BD0AC7E5-EF5E-4C64-85A7-825D0CEA7BE8   # L0.7
```

Until L0.1 makes it required, `ios-gate.sh unit` / `ui` / `all` **still scrape `head -1`** and can seize
another lane's clone or the protected review device. **Do not run those tiers before L0.1's change
lands.** `ios-gate.sh build` is safe now (generic destination). `swiftlint lint` cannot pass — use
`lint-delta` only, until L2-G resolves the 396 `identifier_name` errors in W2.

---

## 7. Hard rules for every W0 lane

1. **No production writes of any kind.** No `psql` against Strata, no Supabase MCP `apply_migration` /
   `execute_sql` write, no `asc`, no Sanity write, no PostHog change, no `wrangler deploy`, no
   `supabase functions deploy`, no `supabase db push`. **Every prod step is a Kody-run line you WRITE
   into your report** — into `build/waves/w0/KODY-RUNBOOK.md`, with no placeholder in any command.
   The Bash prod-mutation hook does **not** cover Supabase MCP writes; the discipline, not the hook, is
   what stops you.
2. **Never run git in the main checkout** `/Users/kody/Code/patina-merged`. A peer session may be live
   there. Verify with `git rev-parse --show-toplevel` before every git command.
3. **Pathspec commits only** — never `git add -A`. Conventional Commits. No push from a lane subagent.
4. ### ⚠ Write markdown and runbook files with the Write/Edit tools — NEVER via a Bash heredoc.
   The prod-mutation hook **pattern-matches command strings inside heredocs** and aborts the whole
   command. A runbook is full of `psql`, `supabase db push`, `wrangler deploy` and `asc` lines — writing
   it through `cat <<'EOF'` will be killed mid-file and can leave a truncated file behind. This applies
   to every `.md`, `.sql` and `.sh` you author. Use `Write` / `Edit`.
5. **`xcodebuild`, `xcrun simctl`, `docker`, the `supabase` CLI and `git worktree` need
   `dangerouslyDisableSandbox: true`** (the sandbox denies the `.env*` files a checkout writes and the
   Unix sockets these tools use). Everything else runs sandboxed by default.
6. **Explicit simulator udid on every call. Never `booted`.**
7. **Never `CODE_SIGNING_ALLOWED=NO` for anything a walker drives.**
8. **Screenshots only via `xcrun simctl io <udid> screenshot`.** Never desktop `screencapture`.
9. **Report every claim at its level** — *compile-green* / *sim-verified* / *device-verified* / *not
   verified* — **with the command output, never a paraphrase**. A green simulator run is not a device
   claim. Universal links from Mail, App Groups on glass, APNs delivery, Apple Pay, LiDAR/AR, the widget
   on a Home Screen and real cold-launch time are **device claims**, closed only in R1.
10. **Deliver exactly what the lane asks** — no unrequested features, refactors or abstractions.
    Comments only for constraints the code cannot show.
11. **Every lane runs the VISION check** as a line in its task list: *name any finding in my table whose
    fix would add or entrench something VISION §6 refuses (tab / zone / dashboard UI, shadows, red/green
    status, badges, engagement optimisation, the "AI" label) and say why it survives.* A fix that cannot
    answer becomes an integration note to Fable, not a commit. **Note D1/V7:** the tab bar is now a
    logged, dated exception for the iOS app (surface #2) — The Document (surface #1) still may not have
    one. The W0 closer writes **V7** into `docs/vision/VISION-DECISIONS.md`, append-only, dated today,
    referencing `rulings-2026-09-02.md`, committed with `build/waves/w0/`.
12. **Copy rules.** Zero occurrences of "AI", "A.I.", "artificial intelligence", "machine learning" in
    anything a tester reads. Brand voice per `.claude/skills/patina-brand-voice/SKILL.md` — no
    "journey", no "curated", no "elevated", no "bespoke" unless literally custom. Never print a vendor or
    server error string to a homeowner.
13. **`pipefail` grep-probe trap.** `printf <big> | grep -q …` false-FAILs on SIGPIPE under
    `set -euo pipefail`. Use a `case`-glob contains test in probe scripts, not `grep -q` on a large
    stream.

---

## 8. W0 sequence (from PROGRAM.md §3, as amended by D8)

1. **Day 1.** L0.3's content request goes to Leah (longest pole). L0.1 starts with `A2-07`'s throwaway
   archive dry run. L0.2 drafts and re-probes. **L0.2b starts immediately — it gates L0.2's apply.**
   L0.7 walks.
2. **Day 2.** L0.2b's three follow-ups merge and the designer portal is **redeployed**. Only then is
   00555 clear.
3. **Day 2–3.** Kody applies 00555 (**D8**), then the L0.2b regression walk, then the read-only probes.
   L0.4 / L0.5 / L0.6 run in parallel and gate nothing.
4. **End of day 3.** W0 exit criteria. L0.3 continues into W1 and is called on day 6 (**D2**).

**The rule the sequence encodes:** *The Document never breaks to unblock the app.* 00555 is urgent —
but "urgent" is two days of ordering, not a same-day apply that returns 500s on `app.patina.cloud`.

**W0 exits when:** `ios-gate.sh release` is green and Kody's archive dry run has succeeded (L0.1) ·
L0.2b's three follow-ups are merged and the designer portal redeployed · 00555 is applied and probes 1–5
return the "after" values, with the portal regression walk clean (L0.2 + L0.2b) · the catalogue probe
returns true **or** D2's fallback is called (L0.3) · the three tour bodies are published and every
doorless `?` is hidden (L0.4) · `testflight review view` returns populated attributes (L0.5) · the three
flags read 0% (L0.6) · the coverage walk has run and its findings are placed (L0.7).

---

## 9. Retirement (steward, at wave close)

```bash
git -C /Users/kody/Code/patina-merged worktree remove .codex/worktrees/agent-ff-w0-<key>
git -C /Users/kody/Code/patina-merged branch -d first-flight/w0-<key>
xcrun simctl delete ff-w0-l01 ff-w0-l07
```

`scripts/repo-gc.sh` (dry-run first) sweeps stragglers. The review device
`973D1724-90BF-4A0A-B02D-481D561547B3` is **never** deleted or erased.
