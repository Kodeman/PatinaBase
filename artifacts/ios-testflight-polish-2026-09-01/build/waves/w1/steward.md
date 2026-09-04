# First Flight · W1 — steward bootstrap

Written by S0 (steward) on 2026-09-02. Every lane reads this file **after** `PROGRAM.md` and
`rulings-2026-09-02.md`, and **before** writing its task list.

Nothing in this file authorises a production write. Every prod step in W1 is a Kody-run line that a
lane **writes into its report** — never runs.

**Reading order for a W1 lane.** `rulings-2026-09-02.md` → `PROGRAM.md` §3 W1 (your lane) + §7 + §11 →
`findings-by-lane.md` **(the authoritative finding list — §3's per-lane tables are stale, §11.6)** →
`findings.json` for the full rows → this file → every `build/waves/w1/<your-lane>-notes.md`.

---

## 1. Base

| | |
|---|---|
| Base sha | **`ba83aa67fc9b4e12fdd0626d3390760bdee3dee3`** (`ba83aa67f`) |
| Subject | `feat(first-flight): merge W0 — Release compiles, TestFlight config, 00555 anon lockdown, 00557 scan-upload RPC, catalogue pipeline, client fixture, runbook` |
| Branch | `main`, equal to `origin/main` after `git fetch origin` (both `ba83aa67f`) |
| In-progress rebase / merge in the main checkout | **none** (`.git/rebase-merge`, `.git/rebase-apply`, `.git/MERGE_HEAD` all absent) |

`git fetch origin` needs `dangerouslyDisableSandbox: true` — sandboxed it fails
`Disconnected from UNKNOWN port 65535 / fatal: Could not read from remote repository`, which is the
sandbox denying the ssh transport, not a credentials problem.

Peer sessions may be live in the main checkout `/Users/kody/Code/patina-merged` — one has already
applied a migration to the shared local database (§4). **No lane runs git there.** The only commands
this program aims at the main checkout are `git worktree add`, `git fetch` and `git log`. Before any
git command:

```bash
git rev-parse --show-toplevel     # must print YOUR worktree path, never /Users/kody/Code/patina-merged
```

---

## 2. Worktrees

All seven were created from `main` at the base sha above, each on its own branch.

| Lane | Worktree path | Branch |
|---|---|---|
| **L1-A** Welcome, sign-in, onboarding | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1a` | `first-flight/w1-l1a` |
| **L1-B** Data, persistence, resilience | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1b` | `first-flight/w1-l1b` |
| **L1-C** Layout, Companion, Dynamic Type | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1c` | `first-flight/w1-l1c` |
| **L1-D** Tokens, dark mode, contrast, iconography | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1d` | `first-flight/w1-l1d` |
| **L1-E** Copy | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1e` | `first-flight/w1-l1e` |
| **L1-F** Notifications, messaging, widget, deep links | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1f` | `first-flight/w1-l1f` |
| **L1-X** Backend — `L07-01` (SQL only, no Swift) | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1x` | `first-flight/w1-l1x` |

`git worktree list` (verbatim):

```
/Users/kody/Code/patina-merged                                      ba83aa67f [main]
/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1a     ba83aa67f [first-flight/w1-l1a]
/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1b     ba83aa67f [first-flight/w1-l1b]
/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1c     ba83aa67f [first-flight/w1-l1c]
/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1d     ba83aa67f [first-flight/w1-l1d]
/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1e     ba83aa67f [first-flight/w1-l1e]
/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1f     ba83aa67f [first-flight/w1-l1f]
/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1x     ba83aa67f [first-flight/w1-l1x]
/Users/kody/Code/patina-merged/.codex/worktrees/agent-tester-notes  c00d4d05c [tester-notes/build]
```

`agent-tester-notes` is **another program's** worktree — it was registered when W1 bootstrapped and had
been de-registered by a peer session twenty minutes later, leaving the directory behind.
`.codex/worktrees/agent-admin-studios` is a second stray directory, registered to nothing. **Nobody in
W1 touches either**, and neither is swept: `scripts/repo-gc.sh` is the steward's at wave close, dry-run
first, and only over `agent-ff-w1-*`. Expect `git worktree list` to differ from the block above — peer
sessions add and remove rows in this repo while W1 runs.

### `Secrets.swift`

Copied into **l1a, l1b, l1c, l1d, l1e, l1f** at
`apps/mobile/Patina/Patina/App/Configuration/Secrets.swift` (1121 B, mode `600`).
`git status --porcelain` is **empty** in all seven worktrees — the file is covered by `.gitignore:53`.
**Never commit it.** **l1x has no `Secrets.swift`** and does not need one: it is the SQL/edge-function
lane and compiles no Swift.

### JS bootstrap (done)

| Worktree | `pnpm install` |
|---|---|
| **l1x** | **exit 0**, `Done in 32.4s`; husky prepared, Prisma clients generated for media/orders/projects |

No other worktree was `pnpm install`ed — the six iOS lanes need no JS toolchain. A lane that discovers
it does runs `pnpm install` **in its own worktree** (unsandboxed), never a borrowed `node_modules`.

### Lane hygiene

- `mkdir .writer.lock.d` at the top of your worktree when you start; `rmdir` it in your report.
  One writer per worktree. A replacement writer only after the lock owner is proven dead.
- **Pathspec commits only.** `git add -A` is banned — the main checkout lists thirty-odd untracked
  directories and worktrees inherit `.gitignore`, not judgement.
- Conventional Commits. Husky rejects `merge:` subjects — the steward uses
  `chore(first-flight): integrate …`.
- No push from a lane subagent.
- Run `git status --porcelain` **unsandboxed**. Sandboxed, git cannot stat the repo's `.env*` files and
  prints `Operation not permitted` for eight of them — that is the sandbox, not a dirty tree.

---

## 3. Simulator clones

The protected review device **`973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro)** was shut down for
the clone, cloned six times, and **rebooted** — it is `Booted` again and belongs to nobody in W1.

| Lane | Clone name | UDID |
|---|---|---|
| **L1-A** | `ff-w1-l1a` | **`A969A3BD-FBCF-4E80-B70A-0D9983828717`** |
| **L1-B** | `ff-w1-l1b` | **`1D595108-E73C-47D6-A832-184C082386E4`** |
| **L1-C** | `ff-w1-l1c` | **`82831284-4F33-4B4A-ADB2-5F7104DB4EA1`** |
| **L1-D** | `ff-w1-l1d` | **`FF762E1A-F261-4C23-AFB9-CDDEE9B82B8D`** |
| **L1-E** | `ff-w1-l1e` | **`2AF6D0CA-91AB-446E-AFA3-4C126AD5827B`** |
| **L1-F** | `ff-w1-l1f` | **`F72FA33F-EA98-493B-8B6B-98BE3F7BFD81`** |

**L1-X has no clone** — it compiles no Swift and drives no simulator. If L1-X needs to prove an app-side
consequence, it asks the steward; it does not borrow a lane's device.

State applied to all six, in order, each `rc=0`: `simctl erase` (while shut down) → `simctl boot` →
`simctl keychain <udid> reset` → `simctl status_bar <udid> override --time 9:41 --batteryState charged
--batteryLevel 100 --wifiBars 3 --cellularBars 4` → `simctl ui <udid> appearance light` (read back as
`light` on all six). `xcrun simctl io <udid> screenshot` succeeded on all six —
`shots/steward/w1-ff-w1-l1<a…f>.png`, 72 KB each. They render.

All six have a real Simulator.app **window**, 456 × 972 pt:

```
'ff-w1-l1f' {'X': 420.0, 'Height': 972.0, 'Y': 101.0, 'Width': 456.0}
'ff-w1-l1e' {'X': 391.0, 'Height': 972.0, 'Y':  72.0, 'Width': 456.0}
'ff-w1-l1d' {'X': 362.0, 'Height': 972.0, 'Y':  87.0, 'Width': 456.0}
'ff-w1-l1c' {'X': 333.0, 'Height': 972.0, 'Y':  58.0, 'Width': 456.0}
'ff-w1-l1b' {'X': 304.0, 'Height': 972.0, 'Y':  94.0, 'Width': 456.0}
'ff-w1-l1a' {'X': 275.0, 'Height': 972.0, 'Y':  65.0, 'Width': 456.0}
```

They are **not** headless.

> **Window check — use Quartz, not osascript.** Re-confirmed this wave:
> `osascript -e 'tell application "Simulator" to get name of every window'` fails
> `execution error: Simulator got an error: Can't get every window. (-1728)`, rc 1 — Simulator's
> AppleScript dictionary has no `window`. The System Events route returns `0` with rc 0 even when
> windows exist (no Accessibility grant, and it fails *silently*). The check that tells the truth:
>
> ```bash
> python3 -c "
> import Quartz
> wl = Quartz.CGWindowListCopyWindowInfo(
>     Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements,
>     Quartz.kCGNullWindowID)
> for w in wl:
>     if 'Simulator' in str(w.get('kCGWindowOwnerName','')):
>         print(repr(w.get('kCGWindowName','')), dict(w.get('kCGWindowBounds')))
> "
> ```
>
> Also: `open -a Simulator --args -CurrentDeviceUDID <udid>` is a **no-op when Simulator.app is already
> running** — and it was (the iPad below is booted). Boot with `xcrun simctl boot <udid>`, then a bare
> `open -a Simulator` to attach the windows, then verify with the snippet above.

### Devices nobody in W1 touches

| Device | UDID | Why |
|---|---|---|
| iPhone 17 Pro (review device) | `973D1724-90BF-4A0A-B02D-481D561547B3` | The program's protected walk device. Booted again after the clone. **Never erase it.** |
| iPad Pro 11-inch (M5) | `7C8C092C-7AD4-453C-9CC6-40E0931260AC` | Booted, another session's. D4 makes the app iPhone-only anyway. |
| iPhone 17 Pro Max | `EDF8B28E-32F2-4DD1-944E-25E3C8538770` | Not ours. |
| `Coach-iPhone-A/B/C`, `Coach-Watch-*` | — | Another program's. |

### The rules that make the clones worth having

1. **One clone per lane, never shared.** Two agents on one clone manufacture defects — the gap round
   produced "the app is crashing" and a phantom sign-in wall, both caused by another lane's
   `simctl terminate` (`RBSProcessExitStatus | domain:frontboard(10) code:force-quit`).
2. **Explicit udid on every call. Never `booted`.** Eight devices are booted on this machine right now.
   `ios-gate.sh` no longer scrapes `head -1` (L0.1 shipped the fix — §6), but every hand-written
   `simctl` and `xcodebuild` line still needs the udid spelled out.
3. **Never `CODE_SIGNING_ALLOWED=NO` for anything a walker drives.** Correct for `ios-gate.sh build`,
   `unit`, `ui` and `release`; never correct for an install a human or an agent will drive.
4. **Never `--uitesting` for a walk** (resets auth every launch, disables PostHog).
5. **Repeat the launch arguments on every launch.** `NSArgumentDomain` is volatile. W1's line is
   `-DeploymentTarget local` and **nothing else** (§8, the D1a note). An argument-less launch is a
   **production** launch against Strata.
6. **Screenshots only via `xcrun simctl io <udid> screenshot`.** Never desktop `screencapture` — the
   desktop is Kody's.
7. **`describe_screen` over `scan_ui`.** An empty `scan_ui` is never proof a control is missing.
8. **Fresh-install state** is `terminate` → `uninstall` → `simctl keychain <udid> reset` → `install` →
   re-apply the status-bar override. The keychain survives an uninstall.
9. **HID preflight before trusting any input:** `describe_screen` → tap a known control → screenshot →
   confirm the screen changed. Headless-booted simulators swallow synthetic input while screenshots look
   healthy.

---

## 4. Local stack

`supabase status` from `/Users/kody/Code/patina-merged` (unsandboxed) — **up, not reset**.

| Check | Result |
|---|---|
| `supabase status` | rc 0. `Stopped services: [supabase_pooler_supabase]` (pooler only — unused by this program) |
| Edge runtime container | `supabase_edge_runtime_supabase` — **Up 3 hours**. No `docker start` was needed |
| Seeded `client@patina.dev` | present in `auth.users` |
| Seeded `designer@patina.dev` | present in `auth.users` |
| Seeded `james.okafor@example.com` | present in `auth.users` |
| **Repo** migration head (`supabase/migrations/`) | **`00557_increment_scan_upload_attempt.sql`** |
| **Local DB** migration head (`supabase_migrations.schema_migrations`) | **`00558` — `feedback_bug_reports_github`** |
| 00555 / 00557 objects present locally | yes — `list_vendor_profiles`, `search_shareable_designers`, `increment_scan_upload_attempt` all in `pg_proc` (3/3) |

Local endpoints: DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres` · API
`http://127.0.0.1:54321` · Studio `http://127.0.0.1:54323` · Mailpit `http://127.0.0.1:54324`.

### ⚠ The local database is AHEAD of this branch

`00558_feedback_bug_reports_github` is applied to the local DB and **its file exists in no first-flight
worktree and not on `main`** — a peer session minted it. Two consequences:

1. **Nobody in W1 runs `pnpm supabase:reset`.** A reset replays only what is in *this* branch's
   `supabase/migrations/`, which would silently drop the peer's 00558 out from under them. The wave's
   only reset is the steward's, at integration, and only if the wave carries a migration (it does —
   L1-X's). A lane that finds the database in an unexpected state **asks the steward**.
2. **L1-X mints `00559`.** `00558` is taken by that session; per the brief it is also promised, so the
   next free number for this program is **00559**. Re-check immediately before minting:
   `ls supabase/migrations/*.sql | sort -V | tail -5` **and** `supabase migration list` — other programs
   mint in this band.

### The W0 first-flight client fixture — present

`supabase/seed/first-flight-client-fixture.sql` is wired into **both** `sql_paths` arrays in
`supabase/config.toml` (lines 60 and 88) and its rows are live in the local DB:

| Fixture row | id | State read back |
|---|---|---|
| Project | `b0000000-0000-0000-0000-0000000000d1` | `Aspen Loft Refresh`, `client_id = a0000000-…-0005` |
| Comms thread | `c0ff0000-0000-0000-0000-000000000001` | exists, on that project, **3 messages** |
| Document — openable | `d0c00000-…-0001` | `client_visible = t`, path `…d1/service-agreement-aspen-loft.pdf` |
| Document — dead path | `d0c00000-…-0002` | `client_visible = t`, path `…d1/floor-plan-living-dining.dwg` |
| Document — no path | `d0c00000-…-0003` | `client_visible = t`, `storage_path = NULL` |
| Sent proposal | `b0000000-0000-0000-0000-000000000002` | `status = sent`, **`client_visibility_tier = milestone`** |
| Decisions | — | `pending 3`, `responded 1`, `draft 1`, `expired 1` |
| Open invoice | `INV-2026-0142` | `status = sent` |

**The walk fixture is intact.** No lane needs to re-seed it.

> ⚠ **`client_visibility_tier = 'milestone'` on the seeded proposal.** This is the *local* twin of the
> production trap in `PROGRAM.md` §11.5(2): `get_client_proposal_bundle` nulls every per-line price on
> that tier (`L07-07`). A lane that sees a proposal with five line items and **no money** on the local
> stack is looking at the fixture, not a bug it introduced. `L07-07` is a **W2** row; do not fix it here.

---

## 5. Owned-file map per lane

Verbatim from `PROGRAM.md` §3 W1, plus the four contested-file assignments, the residue table, and the
steward rulings §5.9 records. **Every file in the app belongs to exactly one lane per wave.** A change
you want in another lane's file is an **integration note** at `build/waves/w1/<lane>-notes.md` carrying
the **exact final text** — the owner applies it as a numbered task in its own list. An integration note
that no owner scheduled is not a plan, it is a hope.

### 5.0 The four contested files, each with one owner (verbatim, PROGRAM.md §3 W1)

| File | Findings on it | Owner | The other lanes' route |
|---|---|---|---|
| `Features/Home/Views/DailyRoomView.swift` | `C4-12`, `R-03` (L1-B) · `A4-07` (L1-C) · `C5-06` (L1-E) · `C2-07` (L1-F) | **L1-C** (it is the app's biggest layout surface and L1-C rewrites its header for `C-06`/`GAP1B-03`) | integration notes, applied by L1-C: L1-B's `.refreshable`, L1-E's greeting strings, L1-F's badge binding |
| `App/Coordinators/AppCoordinator.swift` | `C1-18`, `C1-19` (L1-B) · `C2-21`, `GAP7B-09`, `C2-06` (L1-F) | **L1-F** (four of five rows are the deep-link queue, which is the harder change) | L1-B's `.launching` watchdog arrives as a note with the exact 5–8 s timeout and the fallback line |
| `Services/API/APIConfiguration.swift` | `C1-04` (L1-A) · `C4-16` (L1-B) | **L1-B** (it owns `Core/Network/**` and the timeout budgets) | L1-A's quiz-RPC timeout drop (30 s → ~8 s) is a note |
| `Features/Recommendations/Views/RecommendationsView.swift` | `C4-12` (L1-B) · `A1-04`, `R-06` (L1-C) | **L1-C** (two of three rows are layout; `R-06` is the root fill) | L1-B's `.refreshable` is a note |

> Note on that table's third row: `A4-07` and `A1-04` were **struck from W1 by the D1 re-tier** (§11.2)
> and now sit in W2. The file assignments stand; the rows are not W1 work.

### 5.1 The residue — files with W1 findings and no lane (verbatim, PROGRAM.md §3 W1)

| Path | Why it had no owner | Assigned to |
|---|---|---|
| `Features/Splash/**` | `C1-18`/`C1-19` resolve here as well as to `AppCoordinator` | **L1-B** (the watchdog's other half) |
| `Core/Models/**` | `C7-02` (`BoardModel` not in the schema) | **L1-B** |
| `Features/Walk/**` | `C7-05` (a `CIContext` per hero frame, on the main actor) | **L1-B** |
| `Features/Profile/Views/ProfileView.swift` | `C4-12` (pull-to-refresh) and `R-03`'s sibling | **L1-C** (it already owns `StudioHubView.swift`, the other half of the same screen) |
| `Features/ARPlacement/**`, `Services/DesignServices/**`, `Features/DesignServices/DesignRequestFlowView+Steps.swift` | `C4-08`, `C4-09`, `C5-11` — all three are error **strings** | **L1-E**, and they are the reason L1-E's deck has an *apply* owner: L1-C for the DesignServices views, L1-B for the upload-phase mapping |
| `Features/QRAuth/**` | 2 findings, none in W0/W1 — and R1's **D-06** exercises it on Kody's phone | **L1-A** (it is the auth seam; `C1-14`'s "hide the QR row for guests" already reaches into it). A W1 acceptance step walks the scanner on the simulator so D-06 is not the first time anyone opens it. |
| `Features/Proposals/**`, `Features/Invoices/**`, `Features/Money/**`, `Features/Documents/**`, `Features/Projects/**` | 8 findings across all 629; the audit never walked them (**L0.7**) | **L1-B** for load-state honesty, **L1-C** for layout and chrome, **L1-E** for wording — placed by Fable when L0.7's findings come back, before W1 opens |
| `Features/Purchase/**`, `Features/Orders/**`, `Features/Budget/**`, `Features/Conversation/**`, `Features/Collections/Views/**` beyond the schema side | **No lane, no W1 work.** `direct-orders` is off for round one (D1) and these carry no T0 row. | — (W2/W3) |

**The last two rows are now settled, not deferred** — see §5.9 rulings **S-3** and **S-4**.

---

### 5.2 L1-A — Welcome, sign-in, onboarding · *Opus* · **27 findings**

Owned globs, verbatim:

```
apps/mobile/Patina/Patina/Features/Authentication/**
  EXCEPT Views/SignInWithAppleButton.swift             → L1-D (C3-03, P-35: the colour-scheme switch)
apps/mobile/Patina/Patina/Features/Onboarding/**
apps/mobile/Patina/Patina/Features/FirstLaunch/**
apps/mobile/Patina/Patina/Features/StyleQuiz/**
apps/mobile/Patina/Patina/Features/StyleConversation/**
apps/mobile/Patina/Patina/Features/StyleReveal/**
  EXCEPT Views/RevealView.swift                        → L1-D (C3-15 PlayfairDisplay-Light, GAP4-16 ⇧D12)
apps/mobile/Patina/Patina/Services/Auth/**
apps/mobile/Patina/Patina/Features/Account/**
apps/mobile/Patina/Patina/Features/QRAuth/**           (the auth seam; C1-14 reaches into it)
apps/mobile/Patina/Patina/ContentView.swift            (the .auth phase cases only)
```

**Not this lane, despite appearances:** `Features/Settings/Views/SettingsView.swift` (`C1-14`'s other
half) is **L1-C**'s — send the guest Account row as an integration note with the exact final copy.
`Services/API/APIConfiguration.swift` (`C1-04`'s quiz-RPC timeout) is **L1-B**'s — same route.

**Notes addressed to this lane, already written:**

- `build/waves/w1/l1-a-notes.md` — the **A3-07 self-downgrade contract** (ruling B2 v3(c)): after a
  successful `signInWithIdToken` (Apple) or `signInWithOAuth` (Google), and **only** those two paths,
  PATCH the app's own `profiles` row to `role = "homeowner"`. Five rules the reviewer will check; the
  ratchet in 00555 §a2(i-a) is what makes it safe. **Not blocked on 00555** — the pre-00555 policy
  permits the PATCH too.
- **The QR help-door removal**, exact final text, lives in `build/waves/w1/l1-c-notes.md` under
  *"The QR block, exact final text, for L1-A"* — `Features/QRAuth/Views/QRScannerView.swift:59-77`,
  delete the `?` trigger, keep `Spacer()` at `:78`, keep `.helpPanel(…)` at `:102-105`. **L1-A applies
  it as a numbered task**; the scanner must still open (R1 device row **D-06**). This block was never
  copied into `l1-a-notes.md` — read it where it lives.

Tests to add: `AuthProviderVisibilityTests` · `AuthErrorRoutingTests` · `TestAccountLoginFallbackTests`
· `AppleSignInRoleTests` · `GuestEscapeTests` · `OnboardingResumptionTests` · extend
`AuthSheetPresentationTests` (exists) · `LegalLinkTests`.

Gate lines (verbatim, with this lane's udid substituted):

```bash
export IOS_GATE_UDID=A969A3BD-FBCF-4E80-B70A-0D9983828717
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=A969A3BD-FBCF-4E80-B70A-0D9983828717' -only-testing:PatinaTests
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=A969A3BD-FBCF-4E80-B70A-0D9983828717' \
  -only-testing:PatinaTests/AuthProviderVisibilityTests \
  -only-testing:PatinaTests/TestAccountLoginFallbackTests \
  -only-testing:PatinaTests/GuestEscapeTests
```

Exit criteria: PROGRAM.md §3 · L1-A, unchanged, with two amendments — **D3** takes Google off the
Welcome screen (so `A3-06` closes by removal, not by enabling the provider), and **D7/D11** retire
`tester@patina.cloud` in favour of `firstflight@patina.cloud`, so the criterion reads *the demo
account's email + its Vault `test_login_code` signs in **in the app***.

---

### 5.3 L1-B — Data, persistence, resilience · *Opus* · **28 findings**

Owned globs, verbatim:

```
apps/mobile/Patina/Patina/Core/Persistence/**          EXCEPT WidgetSnapshot.swift,
                                                       RecordSnapshotStore.swift → L1-F
apps/mobile/Patina/Patina/Core/Network/**              EXCEPT EditorialStoriesAPIClient.swift → L1-D (A3-17)
apps/mobile/Patina/Patina/Core/Models/**
apps/mobile/Patina/Patina/Core/State/**                EXCEPT FeatureFlags.swift → L1-F (GAP7B-02)
apps/mobile/Patina/Patina/Services/Analytics/**
apps/mobile/Patina/Patina/Services/Sync/**
apps/mobile/Patina/Patina/Services/API/APIConfiguration.swift
apps/mobile/Patina/Patina/Features/Collections/**      (schema side)
apps/mobile/Patina/Patina/Features/RoomScan/**         (fallback flow, incl. GAP4-02/03/25 ⇧D12)
apps/mobile/Patina/Patina/Features/Walk/**             (C7-05)
apps/mobile/Patina/Patina/Features/Splash/**           (C1-18/C1-19, the watchdog's other half)
apps/mobile/Patina/Patina/Features/Rooms/**            (room lifecycle)
  EXCEPT Components/RoomTypePillRow.swift              → L1-C (C6-18)
  EXCEPT the string literals in Components/RoomItemRow.swift, Views/ItemActionMenu.swift,
         Views/MoveOrCopyItemSheet.swift               → L1-E's deck, applied HERE (C5-16)
```

**Steward additions (§5.9):** `EXCEPT Views/YourSpacesView.swift → L1-C` (ruling **S-1**), plus
`Features/Help/Services/SanityHelpClient.swift`, `Features/Help/Views/HelpPanelSheet.swift` and
`PatinaTests/HelpPanelSheetTests.swift` (ruling **S-2**), plus `Features/Profile/ViewModels/**`,
`Features/Proposals/**`, `Features/Documents/**`, `Features/Projects/**`, `Features/Money/**` and
`Features/Orders/Views/OrderDetailView.swift` (ruling **S-3**).

**Not this lane:** `AppCoordinator.swift` is **L1-F**'s — `C1-18`/`C1-19`'s `.launching` watchdog goes
to L1-F as an integration note carrying the exact 5–8 s timeout and the fallback sentence.
`DailyRoomView.swift`, `RecommendationsView.swift`, `ProfileView.swift`, `YourSpacesView.swift` and
`Invoices/Views/**` are **L1-C**'s — `C4-12`/`R-03`'s `.refreshable` goes there as notes naming the
exact work each root's and each detail's `.task` does.

**Notes addressed to this lane, already written:** `build/waves/w1/l1-b-notes.md` — three tasks from
L0.4. Under ruling **S-1**, `Task B-L04-1` (the Spaces `?` door) **moves to L1-C unchanged**; Tasks
**B-L04-2** (`R-10`: the `+` in the GROQ URL that `URLComponents` will not encode → HTTP 400 on every
help fetch) and **B-L04-3** (`R-10`: make `fetchArticles` throw so the existing `loadError` branch can
fire, and drop the two negative cache writes) **stay with L1-B** under ruling **S-2**.

Tests to add: `PersistenceMigrationTests` · `LoadStateHonestyTests` · `NetworkBudgetTests` ·
`LaunchWatchdogTests` · `TelemetryQueueBoundsTests` · `ProductSelectShapeTests` · extend
`ProductDecodingTests` (exists) · `MatchScoreResolverTests` · `RoomLifecycleTests` ·
`AttentionCountTests` · `RefreshableSurfacesTests` · **plus the two ⇧D12 suites**
`ScanFallbackEntryTests` and `AccountIsolationTests`.

Gate lines: as §5.2, with `IOS_GATE_UDID=1D595108-E73C-47D6-A832-184C082386E4`, and the focused trio
`-only-testing:PatinaTests/PersistenceMigrationTests -only-testing:PatinaTests/LoadStateHonestyTests
-only-testing:PatinaTests/ProductSelectShapeTests`.

Exit criteria: PROGRAM.md §3 · L1-B, unchanged. **The stack-stopped half of it is the one place W1
touches the shared local database** — stop it with `supabase stop`, prove the error states, then
`supabase start`. **Never `supabase:reset`** (§4).

---

### 5.4 L1-C — Layout, Companion, Dynamic Type · *Opus · merges first* · **28 findings**

Owned globs, verbatim:

```
apps/mobile/Patina/Patina/Design/**
  EXCEPT Components/TierPill.swift                     → L1-D (C3-05, a clay-filled control)
  EXCEPT Components/CompanionSafeArea.swift            → shared with L1-F for C9-05; L1-C owns the
                                                         file, L1-F sends `.threadDetail` as a note
apps/mobile/Patina/Patina/Features/Companion/**
apps/mobile/Patina/Patina/Features/Home/**             (the whole tree, layout AND DailyRoomView.swift)
apps/mobile/Patina/Patina/Features/Decisions/**
apps/mobile/Patina/Patina/Features/Help/**             (tour + coach-mark layout)
apps/mobile/Patina/Patina/Features/Settings/**
apps/mobile/Patina/Patina/Features/ProductDetail/**    (chrome)
apps/mobile/Patina/Patina/Features/Navigation/**
apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift
apps/mobile/Patina/Patina/Features/Profile/Views/StudioHubView.swift
apps/mobile/Patina/Patina/Features/Profile/Views/ProfileView.swift
apps/mobile/Patina/Patina/Features/DesignServices/DesignerConsultationView.swift
apps/mobile/Patina/Patina/Features/Rooms/Components/RoomTypePillRow.swift   (C6-18)
```

**Steward amendments (§5.9):** `Features/Help/**` **EXCEPT** `Services/SanityHelpClient.swift` and
`Views/HelpPanelSheet.swift` → L1-B (ruling **S-2**); **plus**
`Features/Rooms/Views/YourSpacesView.swift` (ruling **S-1**) and `Features/Invoices/**` (ruling
**S-3**).

**Notes this lane applies** (each a numbered task, not a hope): L1-B's `.refreshable` on
`DailyRoomView`, `ProfileView`, `YourSpacesView` and `RecommendationsView` (`C4-12`, `R-03`) **and** on
the Studio detail screens in `Features/Invoices/Views/**` (`C4-12`); L1-E's greeting strings on
`DailyRoomView` (`C5-06`) and its Help Center row copy on `SettingsView` (`C5-05`); L1-A's guest
sign-in row on `SettingsView` (`C1-14`, `B-13`); **L0.4's Tasks C-L04-1…C-L04-4** in
`l1-c-notes.md` (hide the Today, Companion, Piece-detail and Studio `?` doors) **and Task B-L04-1**
from `l1-b-notes.md`, moved here by ruling **S-1** (hide the Spaces `?` door — it is the same header
`C-05` is about).

`C9-05` (`.threadDetail` in `yieldsToPinnedFooter`) **left W1** in the D1 re-tier and is a W2 row, so
L1-F sends L1-C **no** `CompanionSafeArea.swift` note this wave. `L07-02` — the W1 blocker on the same
screen — is a `.padding(.bottom, CompanionHearthMetrics.pinnedFooterClearance(houseFirst:))` **read** of
that API inside L1-F's own `ThreadDetailView.swift`, not an edit of L1-C's file.

Tests to add: `CompanionInsetTests` (the keystone) · `DecisionSheetDetentTests` ·
`DynamicTypeLayoutTests` · `TapTargetTests` · `SheetChromeTests` · `CoachMarkAnchorTests` · extend
`FirstLaunchTourTests` (exists) · `RecommendationsFillTests`.

Gate lines: as §5.2, with `IOS_GATE_UDID=82831284-4F33-4B4A-ADB2-5F7104DB4EA1`, and the focused trio
`-only-testing:PatinaTests/CompanionInsetTests -only-testing:PatinaTests/DecisionSheetDetentTests
-only-testing:PatinaTests/TapTargetTests`. Plus **its own walk before it merges** (exit criteria).

> ⚠ **PROGRAM.md §3 · L1-C's "Every W1 fix in this lane is demonstrated with the flags OFF" paragraph is
> superseded by D1/D1a and must be inverted.** It was written when round one shipped flags-off. It does
> not: `house-first` is ON for every tester and is the **default** with no PostHog answer. So `B-28`,
> `C-05`, `C-27` and `C-11` are demonstrated on the **four-tab root**, which is where their evidence was
> taken in the first place, and the re-framing to "the Companion dock" / "flags-off routes" in that
> paragraph is **dropped**. The screenshot loop in the exit criteria stays exactly as written **except**
> the launch line, which becomes `xcrun simctl launch $U cloud.patina.app -DeploymentTarget local`
> (no `-PatinaFlags`). See §8.

---

### 5.5 L1-D — Tokens, dark mode, contrast, iconography · *Opus* · **18 findings**

Owned globs, verbatim:

```
apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/**      ← the tokens live HERE
apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/**
apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Support/**
apps/mobile/Patina/Patina/Design/Components/TierPill.swift          (C3-05)
apps/mobile/Patina/Patina/Features/Shared/**                        (ProductCard, CurrencyFormatting)
apps/mobile/Patina/Patina/Features/Authentication/Views/SignInWithAppleButton.swift   (C3-03, P-35)
apps/mobile/Patina/Patina/Features/StyleReveal/Views/RevealView.swift                 (C3-15, GAP4-16)
apps/mobile/Patina/Patina/Core/Network/EditorialStoriesAPIClient.swift                (A3-17)
# plus, by integration note, the exact colour/font literals inside files other lanes own —
# the C3 ledger enumerates all 89 `pearl` sites, all 46 inline `.font(.custom(...))` sites,
# and the ~15 `clay`-filled selection controls.
```

`apps/mobile/Patina/Patina/Design/Tokens/**` **does not exist** and is not this lane's — the rest of
`Design/**` is **L1-C**'s. `apps/mobile/PatinaDesignKit/Package.swift` is **L1-D**'s (it is the only
lane with a reason to touch it — see the gate ruling below).

> ⚠ **`swift test --package-path apps/mobile/PatinaDesignKit` cannot pass, and the reason is not the
> missing test target.** Two facts, both verified this session:
>
> 1. `PatinaDesignKit` has **no `Tests/` directory and no `.testTarget`** in `Package.swift`.
> 2. The package declares `platforms: [.iOS("17.6")]` and its sources `import UIKit`. `swift test`
>    builds for the **host** (macOS), so it fails before it reaches any test:
>
>    ```
>    /Users/kody/Code/patina-merged/apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Support/HapticManager.swift:8:8:
>    error: no such module 'UIKit'
>    ```
>
> **Steward ruling S-5:** `PatinaDesignKitTests/ContrastTests.swift` and
> `PatinaDesignKitTests/DynamicTokenTests.swift` are written into **`apps/mobile/Patina/PatinaTests/`**
> (as `ContrastTests.swift` and `DynamicTokenTests.swift`), which compiles for the iOS Simulator and
> already links `PatinaDesignKit`. The `swift test --package-path …` gate line is **struck** and the
> coverage moves under the existing `-only-testing:PatinaTests` line. Fable may overrule; nothing else
> in the lane changes if it does.

Tests to add: `ContrastTests` · `DynamicTokenTests` (both in `PatinaTests`, per S-5) ·
`TypographyAdoptionTests` · `CurrencyFormattingTests` · `CompanionOrbAppearanceTests` ·
`ImagePlaceholderTests` · `PrimaryButtonStyleTests`.

Gate lines:

```bash
export IOS_GATE_UDID=FF762E1A-F261-4C23-AFB9-CDDEE9B82B8D
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=FF762E1A-F261-4C23-AFB9-CDDEE9B82B8D' -only-testing:PatinaTests
apps/mobile/Patina/scripts/ios-gate.sh lint-delta
```

`lint-delta` is named because `disallow_font_custom_in_features` (the PT-1-1 custom rule) has 48 hits
today and this lane drives it toward zero; a lane that *adds* one must not pass. `swiftlint lint`
(full) still cannot pass — 396 `identifier_name` errors, L2-G's W2 job.

Exit criteria: PROGRAM.md §3 · L1-D, unchanged, reading "the contrast test suite" as the two suites
S-5 relocates.

---

### 5.6 L1-E — Copy · *Sonnet, reviewed by Opus* · **18 findings** · merges last

**Ownership rule (verbatim, PROGRAM.md §3):**

> **L1-E's deliverable is `build/waves/w1/l1-e-copy-deck.md`** — one row per change:
> `finding id · file:line · the string today · the exact final string · owning lane`.
> Fable and an Opus reviewer sign it off as a whole, before any lane applies it.
> **Each owning lane then applies its own rows inside its own worktree, as numbered tasks in its own
> task list**, and its exit criteria says the rows are applied. L1-E edits, in its own worktree, only
> the three files it owns outright (below) and any file no other W1 lane owns.

Owned globs, verbatim:

```
# files it owns outright, and edits itself
apps/mobile/Patina/Patina/Features/Purchase/OrderFailureCopy.swift
apps/mobile/Patina/Patina/Design/Components/PatinaErrorState.swift
apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift
apps/mobile/Patina/Patina/Features/ARPlacement/**            (C4-08 — no other W1 lane owns it)
apps/mobile/Patina/Patina/Services/DesignServices/**         (C5-11 — likewise)
apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView+Steps.swift  (C4-09)

# everything else goes through the deck. Rows by owning lane, from this lane's table:
#   L1-A  A-52, A-79, C5-20, A-06        (Companion guest copy, claim sheet, onboarding)
#   L1-B  C4-09's upload-phase mapping, C5-16's resolvedMakerName guard
#   L1-C  A-60, C-22, C-30, C-38, C5-05, C5-06, B-20   (tour, Studio nouns, greeting, Settings)
#   L1-D  C5-14                                        (the money formatter's output strings)
#   L1-F  (none in W1)
#   L0.1  A2-12's seven permission sentences — the build settings win, so L0.1 pastes them
```

> Two carve-outs the deck must respect, because the file's owner changed:
> `TimeOfDay.swift` is L1-E's **despite** sitting under `PatinaDesignKit/Tokens/**` (L1-D's glob) —
> `C5-06` is a string change, and PROGRAM names it here. `PatinaErrorState.swift` is L1-E's **despite**
> sitting under `Design/**` (L1-C's glob). Both are named-file exceptions, exactly as written.
> `L0.1` is closed — its deck row (`A2-12`) is a **W2** carry-forward, not a W1 apply target; L1-E
> records it as such rather than sending it into a wave with no L0.1 lane.

Tests to add: `ErrorVoiceTests` · `NounConsistencyTests` · `BrandVoiceLintTests` ·
`GreetingWindowTests` · `PluralisationTests` · `SentenceCaseTests` · `GuestPromiseTests`.
Inventory: `research/C5-strings.txt` (303 KB).

Gate lines: as §5.2, with `IOS_GATE_UDID=2AF6D0CA-91AB-446E-AFA3-4C126AD5827B`, and the focused trio
`-only-testing:PatinaTests/ErrorVoiceTests -only-testing:PatinaTests/NounConsistencyTests
-only-testing:PatinaTests/BrandVoiceLintTests`.

Exit criteria: PROGRAM.md §3 · L1-E, unchanged. **The deck is signed off before day 5** or the owning
lanes cannot apply it inside their own waves — that date, not the merge, is this lane's real deadline.

---

### 5.7 L1-F — Notifications, messaging, widget, deep links · *Opus* · **17 findings**

Owned globs, verbatim:

```
apps/mobile/Patina/Patina/Features/Notifications/**
apps/mobile/Patina/Patina/Services/Notifications/**
apps/mobile/Patina/Patina/Services/API/PushTokenService.swift
apps/mobile/Patina/Patina/Services/Badges/**
apps/mobile/Patina/Patina/Features/Messaging/**
apps/mobile/Patina/PatinaWidget/**                     (except PrivacyInfo.xcprivacy → L0.1)
apps/mobile/Patina/PatinaWidgetShared/**
apps/mobile/Patina/Patina/App/DeepLinking/**
apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift   ← the WHOLE file, not a slice
apps/mobile/Patina/Patina/Core/State/FeatureFlags.swift           (GAP7B-02's mirror)
apps/mobile/Patina/Patina/Core/Persistence/WidgetSnapshot.swift
apps/mobile/Patina/Patina/Core/Persistence/RecordSnapshotStore.swift
```

`PatinaWidget/PrivacyInfo.xcprivacy` is **L0.1's and L0.1 is closed** — it shipped in W0 (D15, both
manifests present in the product). L1-F does not edit it; if the widget's data use changes, that is an
integration note to Fable.

⚠ **`FeatureFlags.swift` carries D1a.** L0.1 shipped the per-flag default table
(`house-first: true`, the other two `false`), the PostHog-`false` kill switch and
`PatinaTests/FeatureFlagsDefaultTests.swift` (five cases, all green on the W0 tip). `GAP7B-02` is the
**mirror**'s half. **Do not touch the default table** — `defaultTableIsPinned` and
`freshInstallTurnsHouseFirstOn` will catch it, and D1a is the ruling the whole wave's walk rests on.

Tests to add: `DeepLinkQueueTests` (the keystone) · `WidgetProjectionTests` ·
`WidgetSnapshotOwnershipTests` · `WidgetFlagOffRenderingTests` · `BadgeFreshnessTests` (carry its
VISION ruling into the task list verbatim) · `PushAuthorizationCopyTests` · `ThreadHeaderTests` ·
`NotificationsLoadStateTests`.

Gate lines: as §5.2, with `IOS_GATE_UDID=F72FA33F-EA98-493B-8B6B-98BE3F7BFD81`, and the focused trio
`-only-testing:PatinaTests/DeepLinkQueueTests -only-testing:PatinaTests/WidgetProjectionTests
-only-testing:PatinaTests/WidgetSnapshotOwnershipTests`.

Exit criteria: PROGRAM.md §3 · L1-F's eight-run cold-link protocol, **8 of 8**, with the launch line
amended to drop `-PatinaFlags` (§8):

```bash
U=F72FA33F-EA98-493B-8B6B-98BE3F7BFD81
for i in $(seq 1 8); do
  xcrun simctl terminate $U cloud.patina.app || true
  xcrun simctl launch    $U cloud.patina.app -DeploymentTarget local
  sleep 0.25
  xcrun simctl openurl   $U https://client.patina.cloud/proposals/b0000000-0000-0000-0000-000000000002
  sleep 6
  xcrun simctl io $U screenshot artifacts/ios-testflight-polish-2026-09-01/shots/w1-f/coldlink-$i.png
done
```

**The universal-link entitlement is real on the simulator build** — §6 records
`com.apple.developer.associated-domains = applinks:client.patina.cloud` and
`com.apple.security.application-groups = group.cloud.patina.app` in the built product's simulated
entitlements. A simulator run is still not a device claim (Hard Rule 13); the widget on a Home Screen,
APNs delivery and a link opened from Mail are **R1** rows.

---

### 5.8 L1-X — Backend · **1 finding** (`L07-01`) · *Opus*

The W1 lane `PROGRAM.md` §11.6 says is owed ("a new L0.2 sub-section is owed for `L07-01`, or it must be
routed into an existing lane"). It is this lane. **No Swift, no simulator, no clone.**

Owned globs:

```
supabase/migrations/**        ← mints 00559 (see §4; 00558 is taken by a peer session)
supabase/tests/**
supabase/functions/**
```

`L07-01` (T0 · blocker): *signing a proposal fails `studio_id_not_designer_studio` when the designer
belongs to two active studios.* `where`:
`supabase/migrations/00511_public_sd_hardening.sql:2418-2440` (the `projects` BEFORE INSERT guard).
`fix`: give the activation an unambiguous studio — carry `designer_clients → studio` onto the proposal
and pass it to the projects insert. Full row in `findings.json`; the walk that found it, with the
counterfactual proven in both directions, is `build/waves/w0/l0.7-coverage-walk.md` §3.

**This lane prepares; Kody applies.** Deliverables: the migration file, a matching
`supabase/tests/rls/00559_*.test.sql` (or the suite's convention for a non-RLS case), a local proof, and
a **Kody-run block written into the report** in `KODY-RUNBOOK.md`'s shape — never executed.

**Liveness is unknown and is a Kody-run read-only probe** (runbook §J1): if Leah belongs to one active
studio, `L07-01` is latent for round one; if two or more, it blocks build 1 for her studio. L1-X states
which, and does not probe production itself.

Local proof, without a reset (§4): apply **only this file** to the local DB and run the SQL suite,
diffing against `supabase/tests/KNOWN_FAILURES.md` — **a new failure name is a stop, not a note**:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -v ON_ERROR_STOP=1 -f supabase/migrations/00559_<slug>.sql
bash scripts/run-sql-tests.sh
```

`pnpm supabase:reset` is the **steward's** at integration, not this lane's.

---

### 5.9 Steward rulings on the five files two lanes could both have written

Each was flagged in a W0 note or falls out of the residue table. Each now has exactly one owner.

| # | File(s) | Ruled to | Why |
|---|---|---|---|
| **S-1** | `Features/Rooms/Views/YourSpacesView.swift` | **L1-C** (carved out of L1-B's `Features/Rooms/**`) | Three of the four changes it needs are L1-C's — `C-05` (the four `?` controls on that header), `C9-04` (`YourSpacesView.swift:97`, one of the twenty hard-coded clearances) and the `.refreshable` L1-C's *"Notes this lane applies"* paragraph already schedules. L0.4's **Task B-L04-1** deletes the `?` door at `:138-152` — the *same header* `C-05` is about, so it cannot sit in another lane. **`l1-b-notes.md` Task B-L04-1 moves to L1-C's list unchanged**, exactly as both note files provide for. Spaces is also a **tab root** under D1: layout critical path. |
| **S-2** | `Features/Help/Services/SanityHelpClient.swift`, `Features/Help/Views/HelpPanelSheet.swift`, `PatinaTests/HelpPanelSheetTests.swift` | **L1-B** (carved out of L1-C's `Features/Help/**`) | PROGRAM.md §3 · L1-B's own integration notes already say *"`R-10`'s malformed GROQ … lives in the Help fetch and is L1-B's"*. The concern decides the lane: a URL-encoding bug and a *failed-to-load vs nothing-here* split are wire format and load-state honesty, which is this lane's entire charter (`LoadStateHonestyTests`). L1-C keeps the rest of `Features/Help/**` — `FirstLaunchTour*`, `HelpInfoIcon`, `HelpTooltip`, `SurfaceKeys`, `Models/**` — which is the "tour + coach-mark layout" its glob was written for. If `C-23` (one sheet chrome everywhere) needs a change **inside** `HelpPanelSheet.swift`, that is an L1-C → L1-B note. In practice it will not: with all six `?` doors hidden, `HelpPanelSheet` is unreachable in build 1. |
| **S-3** | `Features/Proposals/**`, `Features/Documents/**`, `Features/Projects/**`, `Features/Money/**`, `Features/Profile/ViewModels/**`, `Features/Orders/Views/OrderDetailView.swift` → **L1-B** · `Features/Invoices/**` → **L1-C** | as shown | The residue table left these "placed by Fable when L0.7's findings come back". They are back (§11.3) and they resolve cleanly by row: **L1-B** carries `R-05` (proposal detail's 65–185 s blank), `C4-03`'s third state on `OrderDetailView.swift:41`, and `L07-05` (`StudioHubViewModel` renders stale counts as current) — all load-state. **L1-C** carries every W1 row on the invoice screen: `B-28` (Pay pushed behind the tab bar), `GAP2-24` (Pay one point below the fold), `A-89` (the floating Back button). L1-B's `.refreshable` on the invoice detail is a note to L1-C, the same route `DailyRoomView` takes. `Features/Purchase/**`, `Features/Budget/**`, `Features/Conversation/**` and the rest of `Features/Orders/**` stay **no lane, no W1 work**. |
| **S-4** | `Design/Components/CompanionSafeArea.swift` | **L1-C**, and **L1-F sends no note this wave** | `C9-05` — the only reason L1-F would have edited it — **left W1** in the D1 re-tier (§11.2) and is a W2 row. `L07-02`, the W1 blocker on the same screen, only *reads* `CompanionHearthMetrics.pinnedFooterClearance(houseFirst:)` from inside L1-F's own `ThreadDetailView.swift`. Recorded so neither lane waits on the other. |
| **S-5** | `apps/mobile/PatinaDesignKit` test target | **struck**; the two suites move to `apps/mobile/Patina/PatinaTests/` | `swift test --package-path apps/mobile/PatinaDesignKit` fails on the host with `error: no such module 'UIKit'` — the package is iOS-only and has no test target at all. Evidence and the replacement gate line are in §5.5. |

---

## 6. The exact `xcodebuild build` line, per iOS worktree

Each iOS worktree compiles into **its own** DerivedData. Six lanes sharing one tree produce transient
failures the Daily Return already paid for. `.build/` is gitignored. `ios-gate.sh` now passes
`-derivedDataPath "$PROJECT_DIR/.build/DerivedData"` on **every** invocation (L0.1's change is on the
base sha), so the gate and these hand lines agree.

```bash
# substitute <KEY> = l1a | l1b | l1c | l1d | l1e | l1f   and   <UDID> = that lane's clone
xcodebuild build \
  -project /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-<KEY>/apps/mobile/Patina/Patina.xcodeproj \
  -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=<UDID>' \
  -derivedDataPath /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-<KEY>/apps/mobile/Patina/.build/DerivedData
```

`xcodebuild` needs `dangerouslyDisableSandbox: true`.

**No `CODE_SIGNING_ALLOWED=NO` on that line** — it is the line that produces the build a walker installs.
Use the flag only inside `ios-gate.sh build` / `unit` / `release`, which already pass it.

### ⚠ The first `xcodebuild` in a fresh worktree fails on `GitCommit.swift` — run it twice

`apps/mobile/Patina/Patina/Generated/GitCommit.swift` is gitignored (`.gitignore:57`) and written by the
`Stamp Git SHA` run-script phase. A fresh worktree has no `Patina/Generated/` at all, so the first build
fails on the missing file and the second succeeds. **Run the build a second time before reporting a
compile failure**; investigate only if attempt 2 also fails. (`A2-08`; still open — L0.1 closed 14 of
its 18 rows and this was not one of them.)

**Sim-verified by the steward in `l1c` on 2026-09-02**, the exact line above, twice back to back:

```
=== ATTEMPT 1 ===
** BUILD FAILED **
The following build commands failed:
  SwiftCompile normal arm64 Compiling AppConfiguration.swift, Secrets.swift, AppCoordinator.swift, …
  SwiftCompile normal arm64 …/Patina/App/Configuration/AppConfiguration.swift
  Building project Patina with scheme Patina and configuration Debug
(3 failures)
=== ATTEMPT 2 ===
** BUILD SUCCEEDED **
```

After attempt 2, `Patina/Generated/GitCommit.swift` exists (185 B) and `git status --porcelain` in the
worktree is **empty**. **`main` builds.** The five other iOS lanes each pay the same first-build cost
once.

### The product is a real signed simulator build — and `codesign` will lie to you about it

The warm-up product is
`…/agent-ff-w1-l1c/apps/mobile/Patina/.build/DerivedData/Build/Products/Debug-iphonesimulator/Patina.app`,
with `PlugIns/PatinaWidget.appex` and `PrivacyInfo.xcprivacy` inside it. It is **safe to install on a
clone and drive** (no `CODE_SIGNING_ALLOWED=NO`).

> `codesign -dv --entitlements :- <the .app>` prints `<dict></dict>` and
> `Signature=adhoc, TeamIdentifier=not set`. **That is not a stripped build.** iOS Simulator products
> carry their entitlements in a *simulated* blob. The file that tells the truth is in Intermediates:
>
> ```bash
> plutil -p …/.build/DerivedData/Build/Intermediates.noindex/Patina.build/Debug-iphonesimulator/Patina.build/Patina.app-Simulated.xcent
> ```
>
> which on this build reads:
>
> ```
> "application-identifier" => "VP22LXHT7L.cloud.patina.app"
> "aps-environment" => "development"
> "com.apple.developer.applesignin" => [ 0 => "Default" ]
> "com.apple.developer.associated-domains" => [ 0 => "applinks:client.patina.cloud" ]
> "com.apple.security.application-groups" => [ 0 => "group.cloud.patina.app" ]
> ```
>
> Apple Sign-In, universal links and the App Group are all present. **Check `-Simulated.xcent`, never
> `codesign -d`,** before concluding a simulator build lost its entitlements.

### `IOS_GATE_UDID`

L0.1's change **landed** and is on the base sha: `sim_destination()` errors and exits **2** when
`IOS_GATE_UDID` is unset, and never scrapes `head -1`. So `ios-gate.sh unit`, `ui` and `all` are safe
this wave — with the variable exported. Every lane's task list carries its own line as a standing
export:

```bash
export IOS_GATE_UDID=A969A3BD-FBCF-4E80-B70A-0D9983828717   # L1-A
export IOS_GATE_UDID=1D595108-E73C-47D6-A832-184C082386E4   # L1-B
export IOS_GATE_UDID=82831284-4F33-4B4A-ADB2-5F7104DB4EA1   # L1-C
export IOS_GATE_UDID=FF762E1A-F261-4C23-AFB9-CDDEE9B82B8D   # L1-D
export IOS_GATE_UDID=2AF6D0CA-91AB-446E-AFA3-4C126AD5827B   # L1-E
export IOS_GATE_UDID=F72FA33F-EA98-493B-8B6B-98BE3F7BFD81   # L1-F
```

Tiers, from the script's own header: `build` · `unit` · `ui` · `release` · `archive` (**Kody's machine
only — never a steward or lane command**) · `lint` · `lint-delta [BASE]` · `all` (= `build + unit +
lint-delta`). `release` is deliberately **not** inside `all`; wire it beside it.

---

## 7. Merge order, and the E deck pass

**L1-C → L1-D → L1-B → L1-F → L1-A → L1-X, then L1-E.**

This is **D14**'s order for the six iOS lanes with the backend lane inserted before the copy pass.

| # | Lane | Why here |
|---|---|---|
| 1 | **L1-C** | The Companion bottom-inset change touches every scrollable screen; every later conflict would otherwise be a layout conflict |
| 2 | **L1-D** | The token sweep is the other whole-app change |
| 3 | **L1-B** | Data and load-state, on top of settled layout and tokens |
| 4 | **L1-F** | Routing and the widget; takes L1-B's watchdog note into `AppCoordinator.swift` |
| 5 | **L1-A** | Auth and onboarding; smallest blast radius on shared files |
| 6 | **L1-X** | SQL and edge functions only — **cannot conflict with any Swift merge**, and lands before the wave's `supabase:reset` + SQL-suite run |
| 7 | **L1-E** | **Last.** Its deliverable is a deck applied into other lanes' files; it rebases onto everything and re-runs its seven suites to prove the deck actually landed. A deck row no lane applied fails `NounConsistencyTests` or `ErrorVoiceTests` and comes back as a fix round |

`ios-gate.sh build` **+** `release` runs on the integration tip **after every merge, before the next one
starts** — a conflict found at merge 7 that was introduced at merge 2 costs the wave a day. On the final
tip: `ios-gate.sh all` + `release` + `lint-delta`, then `pnpm supabase:reset` +
`bash scripts/run-sql-tests.sh` diffed against `supabase/tests/KNOWN_FAILURES.md` (the wave carries
L1-X's migration).

**`archive` is not a steward command.** It is R1 Step 2, on Kody's machine.

**The reset caveat.** The integration reset will drop the peer session's `00558` from the local DB (§4).
The steward announces it before running, and it happens **once**, at integration — never in a lane.

---

## 8. The D1a note — launch **without** `-PatinaFlags`

**Every W1 launch line is `-DeploymentTarget local` and nothing else.** No `-PatinaFlags`. That is the
shipping condition, and it produces the **four-tab root** (Today · Spaces · Pieces · Studio, the hoisted
tour, the Studio door).

Source-verified on the base sha:

- `Core/State/FeatureFlags.swift` carries a per-flag default table —
  `.houseFirst: true`, `direct-orders` and `house-widget` `false` — resolved by
  `defaultValue(for:)` when PostHog has no answer (fresh install, no cached payload, no launch
  argument). A PostHog payload saying `false` still wins: it is the kill switch.
- `ContentView.mainContent` branches once on `coordinator.isHouseFirstRoot` → `HouseFirstRoot()`,
  else the legacy root. The root is chosen **once at launch**; a payload landing late cannot swap it
  under a session in someone's hands.
- `PatinaTests/FeatureFlagsDefaultTests.swift` pins five cases, including
  `freshInstallTurnsHouseFirstOn`, `postHogFalseIsTheKillSwitch` and `defaultTableIsPinned`.

**`-PatinaFlags` is authoritative for EVERY flag, not additive** (`launchArgumentOverridesTheDefault`
asserts exactly this). So `-PatinaFlags house-first` would *also* force `direct-orders` and
`house-widget` off explicitly, and any `-PatinaFlags` list that omits `house-first` turns the four-tab
root **off**. Passing it at all replaces the mechanism under test. Don't.

**Two consequences for the wave, both of which override PROGRAM.md §3 as written:**

1. **PROGRAM.md §3 · "W1 exits when" item 4** — *"one walker per surface has walked the review simulator
   with **flags off**"* — is superseded. The walk is on the **default root**, which is flags-**on** for
   `house-first`. Everything else in that item stands: the steward's **signed** Debug build, the
   **local** stack with 00555 applied locally, and a script that names **Room Settings**, the **Today
   designer-seat card** and the **message-thread composer** explicitly (`GAP7-06`/`A-108`, which no
   finding id covers).
2. **The corpus barely observed this root** (§11.2). `B` is the only ledger walk of the four-tab root;
   `GAP1`/`GAP2`/`GAP3`/`GAP6` launched with no flags argument on the *old* build where that meant
   flags-off, `GAP7` with `house-widget` only, and `C`/`A`/`P`/`R` flags-off. **Treat a thin four-tab
   section in the ledgers as a coverage gap, not a clean bill.** A lane that cannot find evidence for a
   row on the shipping root re-observes it on its own clone.

Sign-in on the local stack: `client@patina.dev` / `password123` (W0's L0.7 walk).

---

## 9. Hard rules for every W1 lane

1. **No production writes of any kind.** No `psql` against Strata, no Supabase MCP `apply_migration` /
   `execute_sql` write, no `asc`, no Sanity write, no PostHog change, no `wrangler deploy`, no
   `supabase functions deploy`, no `supabase db push`. **Every prod step is a Kody-run line you WRITE
   into your report.** The Bash prod-mutation hook does **not** cover Supabase MCP writes; the
   discipline, not the hook, is what stops you.
2. **Never send a cross-session message.** No `SendMessage` to another session or agent. Report to your
   dispatcher; you do not speak for the session.
3. **Never run git in the main checkout** `/Users/kody/Code/patina-merged`. Verify with
   `git rev-parse --show-toplevel` before every git command.
4. **Pathspec commits only** — never `git add -A`. Conventional Commits. No push from a lane subagent.
5. ### ⚠ Write markdown, SQL and shell files with the Write/Edit tools — NEVER via a Bash heredoc.
   The prod-mutation hook **pattern-matches command strings inside heredocs** and aborts the whole
   command. A runbook block or a migration is full of `psql`, `supabase db push`, `wrangler deploy` and
   `asc` lines — writing it through `cat <<'EOF'` will be killed mid-file and can leave a truncated file
   behind. This applies to every `.md`, `.sql` and `.sh` you author.
6. **`xcodebuild`, `xcrun simctl`, `docker`, the `supabase` CLI, `git worktree` and `git fetch` need
   `dangerouslyDisableSandbox: true`.** So does `git status` if you want a truthful answer (§2).
   Everything else runs sandboxed by default.
7. **Explicit simulator udid on every call. Never `booted`.** One clone per agent, never shared.
8. **Never `CODE_SIGNING_ALLOWED=NO` for anything a walker drives**; never `--uitesting` for a walk.
9. **Screenshots only via `xcrun simctl io <udid> screenshot`.** Never desktop `screencapture`.
10. **`describe_screen` over `scan_ui`.** An empty `scan_ui` is never proof a control is missing.
11. **Repeat the launch arguments on every relaunch** — `-DeploymentTarget local`, and **no
    `-PatinaFlags`** (§8). An argument-less launch is a **production** launch.
12. **Wait after a layout change.** ≥ 250 ms after any layout-changing action, 1 s after navigation,
    never batch taps across a layout change. If a tap does not land after three attempts with settle,
    record it as a finding or a coverage gap and move on. Never loop.
13. **iOS system dialogs are invisible to the automation tools.** Tap them by screenshot coordinates:
    logical points = pixel ÷ 3 (screenshots are 1206 × 2622 px = 402 × 874 pt).
14. **Report every claim at its level** — *compile-green* / *sim-verified* / *device-verified* / *not
    verified* — **with the command output, never a paraphrase.** A green simulator run is not a device
    claim. Universal links from Mail, App Groups on glass, APNs delivery, Apple Pay, LiDAR/AR, the widget
    on a Home Screen and real cold-launch time are **device claims**, closed only in R1.
15. **Deliver exactly what the lane asks** — no unrequested features, refactors or abstractions.
    Comments only for constraints the code cannot show.
16. **Every lane runs the VISION check** as a line in its task list: *name any finding in my table whose
    fix would add or entrench something VISION §6 refuses (tab / zone / dashboard UI, shadows, red/green
    status, badges, engagement optimisation, the "AI" label) and say why it survives.* A fix that cannot
    answer becomes an integration note to Fable, not a commit. **D1/V7:** the tab bar is a logged, dated
    exception for the iOS app (surface #2); The Document (surface #1) still may not have one. L1-F's
    `C2-07` ruling — one count of *what needs you*, on the bell and the app icon, and nowhere else — is
    already made and is carried into its task list verbatim.
17. **Copy rules.** Zero occurrences of "AI", "A.I.", "artificial intelligence", "machine learning" in
    anything a tester reads. Brand voice per `.claude/skills/patina-brand-voice/SKILL.md` — no
    "journey", no "curated", no "elevated", no "bespoke" unless literally custom. Never print a vendor or
    server error string to a homeowner.
18. **`swiftlint lint` cannot pass.** Use `lint-delta` only, until L2-G resolves the 396
    `identifier_name` errors in W2.
19. **`pipefail` grep-probe trap.** `printf <big> | grep -q …` false-FAILs on SIGPIPE under
    `set -euo pipefail`. Use a `case`-glob contains test in probe scripts, not `grep -q` on a large
    stream.

### Task-list shape (PROGRAM.md §7)

Task list **first**, at `build/waves/w1/<lane>-tasks.md`, in the superpowers `writing-plans` format,
carrying four standing lines before its first task: the `IOS_GATE_UDID` export · the **VISION check** ·
**the notes I must apply** (every integration note addressed to this lane, as numbered tasks, including
its rows from L1-E's copy deck) · **the notes I will send** (every change this lane wants in another
lane's file, with the exact final text). Then tests first. Then the whole `PatinaTests` tier on the
lane's own clone. Pathspec commits. Notes at `build/waves/w1/<lane>-notes.md`.

---

## 10. What is stale in PROGRAM.md §3, and what wins

`findings-by-lane.md` and `findings.json` are the **live** values; §3's per-lane tables were deliberately
not rewritten (§11.6). W1 counts, authoritative:

| Lane | W1 findings | §3's stale number |
|---|---:|---:|
| **L1-X** (§3 calls it L0.2) | **1** | — |
| L1-A | 27 | 27 |
| L1-B | **28** | 27 |
| L1-C | **28** | 35 |
| L1-D | 18 | 18 |
| L1-E | 18 | 18 |
| L1-F | **17** | 16 |
| **Total** | **137** | 141 |

blocker **14** · major **119** · minor 4 · polish 0.

- **L1-C**: strike `A1-03`, `A1-04`, `A4-07`, `A-88`, `A-64`, `C-03`, `C-28` — all seven are
  flags-off-only and left for W2 with their tier held.
- **L1-B**: add `L07-05`.
- **L1-F**: strike `C9-05`; add `L07-02` (blocker) and `L07-03`.
- **L1-C's "flags OFF" acceptance paragraph** is superseded by D1/D1a (§5.4, §8).
- **"W1 exits when" item 4's "flags off"** is superseded by D1a (§8).
- The rulings file wins over PROGRAM.md wherever they differ. `l1-a-notes.md` records **B2 v3** as the
  standing ruling on `handle_new_user`: it is 00313 verbatim, and B2 v1/v2 are superseded wherever they
  appear.

---

## 11. Retirement (steward, at wave close)

```bash
git -C /Users/kody/Code/patina-merged worktree remove .codex/worktrees/agent-ff-w1-<key>
git -C /Users/kody/Code/patina-merged branch -d first-flight/w1-<key>
xcrun simctl delete ff-w1-l1a ff-w1-l1b ff-w1-l1c ff-w1-l1d ff-w1-l1e ff-w1-l1f
```

`scripts/repo-gc.sh` (dry-run first) sweeps stragglers — **read its dry-run output before acting**: the
tree already carries `.codex/worktrees/agent-tester-notes` and `.codex/worktrees/agent-admin-studios`
from other programs, and neither is this wave's to remove. The review device
`973D1724-90BF-4A0A-B02D-481D561547B3` is **never** deleted or erased. The iPad, the iPhone 17 Pro Max
and the `Coach-*` simulators belong to other programs — leave them alone.


---

## From L1-A — fix round (2026-09-02)

Full text, with the notes sent to the other lanes, is `build/waves/w1/l1a-notes-out-round2.md`.

### Note S-L1A-1 — `OrderHandoffTests` is red under the full parallel run and green in isolation

`RL1A-08`. Reproduced on this lane's clone (`A969A3BD-…`) at round-one's tip:

```
xcodebuild test … -only-testing:PatinaTests
  → EXIT=65, "✘ Test run with 1657 tests in 183 suites failed … with 4 issues"
     PatinaTests/OrderHandoffTests.swift:247  order_checkout_returned["outcome"] → nil, want "unconfirmed"
     PatinaTests/OrderHandoffTests.swift:135  order_failed["reason"] → nil, want "poll_timeout"
     PatinaTests/OrderHandoffTests.swift:346  (×2)

xcodebuild test … -only-testing:PatinaTests/OrderHandoffTests
  → "✔ Suite OrderHandoffTests passed after 0.090 seconds", 15/15, ** TEST SUCCEEDED **
```

`PatinaTests/OrderHandoffTests.swift` is **not** in `git diff main...HEAD --name-only` for this branch,
so this is a load-sensitive polling test rather than an L1-A regression — but PROGRAM.md §3 makes the
whole `PatinaTests` tier this lane's gate, and it is red as written. The two timeout assertions want a
clock the test controls. Scored to **L2-G**; recorded here so the same red does not surprise the
integration tip.

It did not reproduce on this fix round's runs. Treat it as intermittent, not fixed.

### Note S-L1A-2 — `Features/Collections/Views/LocalStoreClaimSheet.swift` has no W1 owner

`RL1A-12`. PROGRAM.md §3's residue table reads *"Features/Collections/Views/** beyond the schema side
— No lane, no W1 work … (W2/W3)"*, and the file is not in L1-A's glob list. L1-A edited it anyway,
because `l1-e-copy-deck.md` files `A-79` under **"L1-A applies"** and names that exact file. The edit
is recorded in round one's note `E-L1A-1` and in commit `b42183480`.

The honest assignment is **L1-A** — the deck routed it there and the change is applied and tested. It
needs a line in the amended glob table either way, so the steward's merge does not meet an unowned
file at conflict time.


---

## From L1-C — fix round (2026-09-02) · two things the merge has to carry

Full text: `l1c-notes-out.md` §§11–12.

**1. Three `C9-04` one-line swaps in files with no lane.** All three are a hard-coded bottom padding
replaced by `.companionBottomClearance()`, and all three are named in `C9-04`'s own `where`:

| file | line | owner |
|---|---|---|
| `Features/Collections/Views/CollectionsView.swift` | `:188`, `:291` | **no lane** — §3's residue table says "No lane, no W1 work" |
| `Features/DesignServices/DesignRequestStatusView.swift` | `:126` | unassigned |
| `Features/DesignServices/MatchIntroductionView.swift` | `:70` | unassigned |

Nothing is asked; this is so a lane that later claims one of these globs is not surprised by a diff it
did not make. (`l1c-notes-out.md` §5 and §6 already sent the other five swaps to L1-B and L1-F.)

**2. Eleven integration notes L1-C could not apply, each with the lane that must own it after merge.**
L1-C merges **first** and owns every one of these files, so if the steward does not route them, no
later lane can reach them. Every one needs a symbol that does not exist on `ba83aa67f` — verified
absent by grep on the branch tip; the table with the specific symbol per row is `l1c-tasks.md` §3.

| note | finding | owner after merge |
|---|---|---|
| `L1F→C-1` | `C2-07` — the bell's one count, `DailyRoomView.swift` | **L1-F** |
| `C-L1B-1` (third half) | `R-03` — the staleness sentence on Today | **L1-B** |
| `C-L1B-3` | `C4-03` — Your Spaces' failed-fetch state | **L1-B** |
| `C-L1B-4` | `R-02` / `A-81` — `unreadCountIsKnown` on the bell | **L1-B** |
| `D→C-1` … `D→C-7` | `C-02`, `C-01`, `A-36`/`C-27`/`B-18`, `A3-01`, `A3-17`, `C3-01`, `C3-15`/`C3-05` | **L1-D** |

`D→C-8` (`C-20`'s body half) was the one exception — pure layout, no kit symbol — and **is applied** on
`first-flight/w1-l1c`. `D→C-9` and `D→C-10` are records, not edits.


---

# From L1-B — round 2 (fix round, 2026-09-02)

Written after the adversarial review of L1-B round one (`RL1B-01`…`RL1B-21`) and after applying every note addressed to L1-B. Full text, including what L1-B applied from your notes, is at `build/waves/w1/l1b-notes-out.md`.

## S1 → steward · the three ledger rows, and the exact text that replaces them

**Finding.** `RL1B-03` (review, major). Round 1 wrote three cross-lane pins as
`withKnownIssue(…, isIntermittent: true)`. An intermittent known issue passes whether or not the
expectation fails, so those three rows could not detect an unapplied note — which is precisely
PROGRAM.md §3's *"an integration note that no owner scheduled is not a plan, it is a hope"*.

**Done on this branch:** `isIntermittent` is dropped from all three
(`PatinaTests/RefreshableSurfacesTests.swift:111,129`, `PatinaTests/AccountIsolationTests.swift:253`).
They stay green here, where the notes are genuinely open, and go **red as an unrecorded known issue**
the moment the owning lane's change is in the tree.

**Owed to you:** merge order is L1-C (1) → L1-D (2) → **L1-B (3)** → L1-F (4). L1-C's `.refreshable`
work is already in the tree at merge 3, so `theTabRootsRefresh` and the `DecisionDetailView` half of
`theRemainingDetailsRefresh` will fail **at merge 3**, and `AccountIsolationTests`'s `C2-06` row plus
`ThreadDetailView` at **merge 4**. That failure is the signal, not a regression. Replace each block
as below and re-run.

`PatinaTests/RefreshableSurfacesTests.swift` — `theTabRootsRefresh(path:)`:

```swift
    func theTabRootsRefresh(path: String) throws {
        #expect(try hasRefreshable(path), "\(path) owes .refreshable (l1b-notes-out.md O3)")
    }
```

`PatinaTests/RefreshableSurfacesTests.swift` — `theRemainingDetailsRefresh(path:)`:

```swift
    func theRemainingDetailsRefresh(path: String) throws {
        #expect(try hasRefreshable(path), "\(path) owes .refreshable (l1b-notes-out.md O4 / O8)")
    }
```

`PatinaTests/AccountIsolationTests.swift` — `theSignOutClearsThePreviousAccountsNavigationStack()`:

```swift
    @Test
    func theSignOutClearsThePreviousAccountsNavigationStack() throws {
        let source = try SourcePin.read("Patina/App/Coordinators/AppCoordinator.swift")
        let transition = try #require(
            source.components(separatedBy: "public func beginSplashTransition(").last?
                .components(separatedBy: "\n    }").first
        )
        #expect(transition.contains("navigationPath = NavigationPath()"))
    }
```

Delete the `/// isIntermittent…` sentences from each doc comment as you go — they describe a mechanism
that is no longer there.

**If a row does not go red at its merge, the note was not applied.** That is the whole point of the
tripwire: read it as a finding, not as a flaky test.

---

---

## S2 → steward · two paths L1-B edited that its glob does not plainly cover

**Finding.** `RL1B-14` (review, minor). §7's rule is *"every file in the app belongs to exactly one
lane per wave"*, and both of these were assumed rather than ruled. Both changes are one line; the ask
is a recorded ruling in §5.9, or a note re-route.

| path | the edit | the argument |
|---|---|---|
| `apps/mobile/Patina/Patina/PatinaApp.swift` | one modifier line, `.localStoreRecoveryNotice()`, on the root `ContentView()` | In **no lane's glob at all**. `C7-01`'s notice is L1-B's (`Core/Persistence/**`) and a one-time recovery screen has to mount at the root or a recovered launch that never reaches a particular screen never sees it. Precedent: L1-A treated `Patina/Utilities/**` the same way. Pinned by `PersistenceMigrationTests.theNoticeIsMountedAtTheRoot`. |
| `apps/mobile/Patina/Patina/Features/Collections/Views/CollectionsView.swift:145-167` | `C4-03`'s third state — a `.failed` branch distinct from the empty one | L1-B's glob reads `Features/Collections/**  (schema side)`, and the residue table separately calls `Features/Collections/Views/**` *"beyond the schema side"* → no lane. But `C4-03` **is** L1-B's finding and the loading/empty/failed split is load-state honesty, this lane's charter. Pinned by `LoadStateHonestyTests.theSavedScreenHasAnErrorBranchDistinctFromItsEmptyOne`. |

Neither path is touched by any other lane's task list as far as L1-B can see, so the merge is not at
risk either way — this is about the ledger being true.

---

---

## S3 → steward · three integration notes that have no owner after merge 3

**Finding.** `RL1B-05` (review, major). Three notes addressed to L1-B name files inside L1-B's globs
and **cannot be applied on this branch** — every token and modifier they depend on exists only on
another lane's branch. L1-B's task list records them OPEN and defers them to *"a rebase-time apply on
the integration tip"*, but **no lane's task list owns that apply**, and §7 makes the steward's job
merge + gate, not applying notes. Left as is, L1-D reports `C3-01`/`C3-15` closed and L1-A reports
`C9-08` closed while ~77 literal sites and 5 exit-less number pads in L1-B's files stay unfixed — and
`TypographyAdoptionTests.theInlineFontCountNeverClimbs` is a ratchet, so it will not notice.

| note | finding | what | why it cannot land here | when it can |
|---|---|---|---|---|
| `l1-b-notes.md` **D→B-2** | `C3-01` | 45 `pearl` hairline sites in L1-B's files | `Border.hairline`, `Border.strong`, `OnDark.*` exist only on `first-flight/w1-l1d` | **after merge 2** (L1-D) |
| `l1-b-notes.md` **D→B-3** | `C3-15` | 32 inline `.custom(...)` fonts in L1-B's files | `voiceLead`, `monoLabel`, `bodySerif`, `h6`, `monoLarge` exist only on `first-flight/w1-l1d` | **after merge 2** (L1-D) |
| `l1-b-notes.md` **B-L1A-2** | `C9-08` | `.keyboardDoneToolbar()` on five `.numberPad`/`.decimalPad` fields | `Patina/Utilities/ViewModifiers/KeyboardDismissal.swift` exists only on `first-flight/w1-l1a` | **after merge 5** (L1-A) |

Two ways to close it, both fine, one of them has to be chosen and written down:

1. **A named task on the integration tip** — "apply `l1-b-notes.md` D→B-2, D→B-3 after merge 3; apply
   B-L1A-2 after merge 5", with the two note tables as the checklist and
   `TypographyAdoptionTests` + `KeyboardDismissalTests` re-run after each.
2. **A short L1-B fix round rebased onto the integration tip** after merge 2 for the two token
   sweeps, and after merge 5 for the number pads.

Either way, `C3-01`, `C3-15` and `C9-08` should **not** read as closed in L1-D's and L1-A's coverage
tables until the L1-B halves are in.


---

## S4 → steward · `PatinaTests/OrderHandoffTests.swift` has no owner and it is the tier's flake

**Finding.** `RL1B-01`, root-caused. The blocker's mechanism was `RoomStore.init` opening the app's
on-disk store on the main actor; that is fixed (`PersistenceController.isSharedContext`). What the
fix revealed is that the *detector* is fragile on its own account, and it belongs to nobody.

`OrderHandoffTests.waitFor` polls a `@MainActor` condition on a **3-second wall-clock budget**. The
condition can only become true when the main actor is free, and every `@MainActor` test in the other
180 suites is time this poll cannot use. Measured on this clone, same branch, same commit:

| run | tests | wall | result |
|---|---|---|---|
| 1 | 1671 | 4.87 s | passed |
| 2 | 1671 | 4.81 s | passed |
| 3 | 1673 | 8.00 s | **failed** — `OrderHandoffTests` ×4 |
| 4 (after halving this lane's added main-actor work) | 1672 | 5.20 s | passed |
| 5 | 1672 | 6.56 s | **failed** — `OrderHandoffTests` ×2 |
| 6 | 1672 | 5.36 s | passed |

Two runs of the identical tree, one red. That is a coin toss on a gate, and it will get worse: every
lane is adding suites this wave.

**Applied on `first-flight/w1-l1b`**, one line, at `OrderHandoffTests.swift:345`:

```swift
        timeout: Duration = .seconds(20),
```

…with a comment saying why. Nothing else in the file changes, no assertion changes, and no call site
passes an explicit `timeout:`. A settled condition still returns on the first pass, so the only cost
is the wait before a genuine failure is reported.

**Owed to you: the ruling.** `Features/Purchase/**` is *"no lane, no W1 work"* in the residue table,
and `PatinaTests/OrderHandoffTests.swift` is in no lane's glob. L1-B edited it because the failing
gate line was L1-B's own and the failure was in this file. Record it in §5.9 — either to L1-B for
this wave, or as a steward-owned test-infra change — and tell any lane whose own new suites push the
tier further that the ceiling is now 20 s, not 3.

**And the bigger half, which is yours to rule on, not L1-B's to fix quietly.**
`OrderHandoffTests` is not the only wall-clock poller in the tier. On a heavily loaded run — same
tree, same commit, **56.6 s** total instead of the usual 5–6 s — a *different* one went red:

```
✘ Test introGate_freshUser_pollsUntilTourResolves() recorded an issue at
  CompanionCoachingModelTests.swift:384:9: Expectation failed: (result → false) == true
✘ Test run with 1672 tests in 181 suites failed after 56.574 seconds
```

Same shape, different suite, and also in no lane's glob. The tier now has at least two suites whose
green depends on how busy the machine is, and every lane is adding suites this wave. L1-B has raised
the one the review named and has **not** touched `CompanionCoachingModelTests` — that is a second
unowned file and the ruling should cover both, rather than each lane widening whichever budget
happened to redden its own gate.

The durable version, for W2: a poller that yields until a condition holds should not carry a
wall-clock budget at all — the test's own `withTimeLimit` (or the suite's) is the right ceiling, and
`Issue.record("condition never became true")` at a fixed wall time is measuring the CI box.

---

# From L1-D — fix round 3 (2026-09-03)

Full text: `l1d-notes-out-round4.md`.

## To the steward — `D→X-2`: one of L1-D's four gate lines cannot run (`RL1D-R3-07`)

PROGRAM.md §3 gives this lane four gate lines. The third is:

```bash
swift test --package-path apps/mobile/PatinaDesignKit
```

Run at the branch tip:

```
apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Support/HapticManager.swift:8:8:
  error: no such module 'UIKit'
error: fatalError
(exit 1)
```

Pre-existing: `git show main:apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Support/HapticManager.swift`
has the same `import UIKit`, and `ls apps/mobile/PatinaDesignKit` shows only
`Package.swift` and `Sources/` — **there has never been a Tests target**. So
PROGRAM.md's two `PatinaDesignKitTests/*.swift` entries had nowhere to go;
`ContrastTests.swift` and `DynamicTokenTests.swift` are in `PatinaTests/` and run
under `ios-gate.sh unit`. Neither fact was written down before this note.

**Do not read this line as a signal at any merge.** It is red on `main` and red on
every lane branch.

---

## To the steward — `D→X-3`: two suites are a pre-existing timing flake (`RL1D-R3-15`)

`ios-gate.sh unit` on this branch has failed with 2, 6, 7 and 12 issues on
identical code. The failures are confined to:

- `PatinaTests/OrderHandoffTests` — `waitFor(timeout: .seconds(3))` at
  `OrderHandoffTests.swift:337-347`
- `PatinaTests/CompanionCoachingModelTests` — `introGate_freshUser_pollsUntilTourResolves`

Re-run alone on the same clone, both pass:

```
xcodebuild test … -only-testing:PatinaTests/OrderHandoffTests \
                  -only-testing:PatinaTests/CompanionCoachingModelTests
✔ ** TEST SUCCEEDED **
```

`git diff --name-only main...HEAD` touches neither suite nor
`Features/Purchase/OrderHandoff.swift` nor `Services/Analytics`.
`Features/Purchase/**` is residue (group B above), so this lane did not take the
one-line fix. **D14 runs a gate between every merge**, so the steward meets this
five more times tonight. Either take `timeout: Duration = .seconds(10)` on
`OrderHandoffTests.swift:338` as an explicit decision, or put both suites on a
named known-flake list the steward reads before calling a merge red.

---

## To the steward — the conflict table, re-measured at the branch tip (`RL1D-R3-02`)

Measured with
`git merge-tree --write-tree --messages HEAD first-flight/w1-<lane>` at
`first-flight/w1-l1d`'s tip, this round. **Fifteen conflicts, not eleven.** The
four the previous notes had no row for are marked ✱ — two of them are where
`C-01`'s and `C-02`'s fixes live, so a "take theirs" silently reverts a finding.

| # | lane | file | resolution |
|---|---|---|---|
| 1 | l1a | `Features/Authentication/Views/AuthScreenView.swift` | Take **L1-A's** structure. Then apply `D→A-2`'s two rows: both `.stroke(PatinaColors.pearl, lineWidth: 1.5)` → `PatinaColors.Border.strong`. |
| 2 | l1a | `Features/StyleConversation/Views/InvestmentPerspectiveView.swift` | Take **L1-A's** structure; re-apply `.fill(PatinaColors.pearl)` → `.fill(PatinaColors.Border.hairline)` at the divider. |
| 3 | l1a | `Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift` | Take **L1-A's** structure; re-apply the `.font(.custom(` → `PatinaTypography` promotions (`C3-15`). |
| 4 | l1b | `Features/RoomScan/Views/ScanFallbackEntryView.swift` | Take **L1-B's** structure; re-apply `pearl` → `Border.hairline`. |
| 5 | l1b | `Features/Rooms/Components/RoomBudgetBar.swift` | Take **L1-B's** structure; re-apply BOTH — `Background.dark` for the bar and `PatinaCurrency.formatWholeDollars` for the two figures (`C5-14`). The compact `$2.4K` renders from here; `CurrencyFormattingTests` fails if it comes back. |
| 6 | l1b | `Features/Rooms/Components/RoomGalleryCard.swift` | Take **L1-B's** structure; re-apply `pearl` → `Border.hairline`. |
| 7 | l1b | `Features/Rooms/Components/WholeHomeCrossRoomBar.swift` | Take **L1-B's** structure; re-apply `Background.dark` + `clayInk`. |
| 8 | l1b | `Features/Rooms/Views/CrossRoomView.swift` | Take **L1-B's** structure; re-apply `pearl` → `Border.hairline`. |
| 9 ✱ | l1b | `PatinaTests/RoomBudgetTests.swift` | **Union, not either side.** L1-D added assertions that the bar's two figures are `PatinaCurrency` output; L1-B's edits are about the bar's data. Both sets of `@Test`s must survive — a "take theirs" drops `C5-14`'s pin on the one surface that rendered `$2.4K` live. |
| 10 ✱ | l1c | `Features/Companion/Components/CompanionHearthView.swift` | **Union.** L1-C changes the panel's layout/inset; L1-D changes (a) `Text.inverse` → `OnDark.*` on the status line — that is `C-02`, 1.11:1 — and (b) adds the `Border.onDark` hairline on the shell — that is `C-01`. Taking L1-C's side reverts both. `CompanionOrbAppearanceTests.thePanelSubtitleUsesOnDarkInk` and `.theCompanionSurfacesDrawTheirEdge` fail if it happens. |
| 11 ✱ | l1c | `Features/Companion/Views/CompanionOverlay.swift` | **Union.** L1-C changes the overlay's bottom inset; L1-D changes the State-5 pill's tint off a hard-coded `charcoal.opacity` (`C-01`) and the suggested-action tile off raw `clay` (`C3-05`). `everyCompanionDiscIsAdaptive` fails if L1-C's side wins. |
| 12 | l1c | `Features/Home/Views/DailyGreetingHeader.swift` | Take **L1-C's** structure; re-apply `clayInk` on the two capsules. |
| 13 | l1c | `Features/ProductDetail/Views/ProductDetailView.swift` | Take **L1-C's** structure; re-apply `PatinaAsyncImage` (`A-36`). The `floatingCircleButton` scrim (`C-27`) lives in `ProductDetailBlocks.swift`, which does **not** conflict. |
| 14 | l1c | `Features/Rooms/Components/RoomTypePillRow.swift` | Take **L1-C's** structure — L1-C merges first and rewrote it for `C6-18`. Then apply `D→C-6` and `D→C-7`: selected fill `Interactive.active` + label `Text.inverse`; unselected stroke `Border.strong`. `SelectedStateTests` carries a deferred allowance of 1 for this file and it must go to 0 here. |
| 15 ✱ | l1c | `Features/Home/Views/HouseRecordCard.swift` | **Union, and read it.** New at this tip: L1-D restructured `HouseRecordRowView` so a route-less row is not a disabled `Button` — that is `C-20`'s rendered 4.27:1, and it is a *structural* change, not a token swap, so none of the three greps would notice it going missing. L1-C's side is the card's layout. `HouseRecordRowInkTests` (a rasterised assertion) and `theCardDoesNotDisableItsRows` both fail if `.disabled(row.route == nil)` comes back. |

`l1e` and `l1f` conflict with nothing at this tip. Re-measured at the final tip
after the fix round's commits; `HouseRecordCard.swift` is new since round three.

**The three bars are not enough on their own.** `pearl = 0`, `Font.custom = 0`
outside the token file, and `compact money = 0` catch a lost substitution. They do
**not** catch a lost `Border.onDark` edge, a lost `OnDark` status line, or a lost
`Interactive.active` fill — those are additions, not removals. Rows 9, 10, 11, 14 and 15 need reading, not greping —
and row 15 is a control-flow change no grep can see at all.


---

# From L1-A — fix round 3, 2026-09-03 · the round-three notes, delivered

`l1a-notes-out-round3.md` line 4 said "Every block below is also appended to its target's inbox,
verbatim", and task **X32** step 2 said the same. It was true for `l1-e-notes.md` (A→E-1/2/3) and
`l1-c-notes.md` (A→C-1) and **false for these five**: A→S-1 … A→S-4 and A→F-1 existed only in
L1-A's own outbox, so `RL2A-01`/`05`/`06`/`11`'s corrections and the 2 s launch-path trade reached
nobody. Reported as `RL3A-04` (major) and repaired here. The blocks below are verbatim.

There is no separate Fable inbox in `build/`, so **A→F-1 is filed here too** — the steward is the
reader Fable has in this wave. It is also carried in L1-A's fix-round-3 lane report.

## To the steward — Note A→S-1 · `RL2A-01`, `Note D-L1A-4` is misaddressed and half-stale

`l1-a-notes.md` `D→A-7` and the round-two `Note D-L1A-4` route eight `pearl` rows **to L1-D**, which
merges **second** while L1-A merges **fifth** (D14). The target lane cannot apply them. Worse, the
table sends a resolver hunting for rows that no longer exist:

- **Five of the eight arrive already fixed.** `OnboardingFlowView`, `StyleQuizView.exitButton`,
  `StyleResultView`, `StylePillButton`, `PriorityView`, `InvestmentPerspectiveView` are already zero
  on `first-flight/w1-l1d`.
- **Two need hand-work, and they are L1-A's own.** `AuthScreenView.swift` `guestButton` (~:252) and
  `AuthProviderRow` (~:417), both `.stroke(PatinaColors.pearl, lineWidth: 1.5)`, both **added by
  this branch** — they did not exist on the base sha.

`BorderTokenAdoptionTests.pearlHasNoCallSitesOutsideTheTokenFile` is a **bar at zero**, not a
ratchet, so merge 5 reds on those two lines unless somebody applies them.

**Owned, with a name on it.** They are now `l1a-tasks.md` **X29**, a numbered L1-A exit task run in
this worktree after the tip carries merges 1–4 and before merge 5 is pushed, and
`AuthErrorRoutingTests.theRebaseTokenSitesAreEnumerated` reads that checklist out of the plan so it
cannot silently shrink. Please re-address `Note D-L1A-4` to X29 rather than to L1-D.

## To the steward — Note A→S-2 · `RL2A-05`, `B-L1A-2` has an owner now

§S3 lists `l1-b-notes.md` **B-L1A-2** (`.keyboardDoneToolbar()` on five `.numberPad`/`.decimalPad`
fields in L1-B's files) as applicable "after merge 5 (L1-A)" and then says "one of them has to be
chosen and written down". It is chosen: **option 1**, and the owner is **L1-A**, in X29. The five
sites are `RoomBudgetSheet.swift:61`, `ManualRoomEntryView.swift:65,133`,
`RoomSettingsView.swift:193`, `ScanFallbackEntryView.swift:173`.

Until it runs, **`C9-08` reads OPEN in L1-A's coverage table**, not closed — §S3 asked for exactly
that and this round has made the correction. `.keyboardDoneToolbar()` is applied at one site today
(`AuthenticationView+Panels.swift:152`, the T0 half), plus `.dismissKeyboardOnScroll()` at
`AuthenticationView.swift:54`.

X29 also extends `KeyboardDismissalTests` to a **bar** — every `.numberPad`/`.decimalPad` in the
tree carries the modifier — so the five cannot be lost again.

## To the steward — Note A→S-3 · `RL2A-06`, the `pendingLinkNotice` call site

`AuthScreenView` accepts `pendingLinkNotice` and `AuthStatusSlot` renders it at second precedence
(`AuthErrorRoutingTests.theNoticeYieldsToAnError`), but nothing passes it: `ContentView.swift:57-62`
and `AuthSheet.swift:68-74` supply only `errorMessage:` and `isLoading:`. `AppCoordinator.pendingLinkNotice`
lives on `first-flight/w1-l1f`, which merges **fourth** — so L1-A, merging fifth, is the only lane
that can wire it. It is in **X29** with the exact line, plus a call-site pin, and
`C2-21`/`GAP7B-09`'s acknowledgement half **reads OPEN against L1-A** until it lands.

## To the steward — Note A→S-4 · `RL2A-11`, a ruling is wanted, not a revert

Two changed files sit outside L1-A's globs. Nothing to revert — both edits are defensible and both
are already recorded — but the same argument should not have to be had twice:

| file | why | recorded at |
|---|---|---|
| `Features/Collections/Views/LocalStoreClaimSheet.swift` | `l1-e-copy-deck.md` files `A-79` under **"L1-A applies"** and names the file; the residue table says `Features/Collections/Views/**` has "No lane, no W1 work" | `steward.md` §S-L1A-2, `l1-a-notes.md` Note A-L1E-13 |
| `Patina/Utilities/ViewModifiers/KeyboardDismissal.swift` (new) | `Utilities/**` is in no lane's glob; a shared modifier `C9-08` needs has to live somewhere | this lane called it unowned residue; **L1-B then cited it as precedent** for its own `PatinaApp.swift` line |

**Two asks:** (1) rule once, in `steward.md`, on where a shared modifier a W1 lane needs may live —
L1-B has already had to re-argue it; (2) give `Features/Collections/Views/**` an owner in the
residue table rather than leaving it "no lane" while two lanes edit it.

The carve-outs held: `SignInWithAppleButton.swift` and `RevealView.swift` are absent from
`git diff main...HEAD --name-only`.

---

## To Fable — Note A→F-1 · `RL2A-14`, the 2 s on the launch path

`establishSession` awaits `OnboardingCompletion.resolve(userId:)` **before** publishing the session,
and the listener calls it before `markAuthStateReady()`. The serial ordering is deliberate and
recorded: resolving from the auth-state listener instead put it ~130 ms late, and `ContentView`
animates phase changes over 0.5 s, so it was a **visible cross-fade through the intro carousel**,
not a dropped frame.

The worst case is `OnboardingCompletion.serverReadBudget` = 2 s, paid only when the device flag is
false and the account is not in the device record — a fresh install whose session is restored, and
every first sign-in on a new phone. That is inside L1-B's 8 s `LaunchWatchdog.stallDeadline`.

**No change made.** Two new cases pin it instead: `theServerReadBudgetIsTwoSeconds` (the constant
cannot move by accident) and `aHangingReadIsAbandoned` (the budget is a ceiling, measured — a read
that never returns does not stall the launch and nothing is flipped on its word). If Fable would
rather publish the session first and resolve on a detached task, the 130 ms cross-fade comes back;
that trade is Fable's, and it is now a one-line change with a test either side of it.


---

# From L1-A — fix round 3, 2026-09-03 · this round's own two notes

## To the steward — Note A→S-5 · the copy deck names four files no L1-A glob covers

`l1-e-copy-deck.md` § **"L1-A applies"** carries twenty-one rows. Seventeen name files inside L1-A's
globs and **all seventeen are applied on this branch**. Four name files that are in **no L1-A glob**,
and this lane has deliberately not touched them:

| deck row | file | whose glob it is |
|---|---|---|
| `A-52` (`.askAboutPiece` hint) | `Features/Companion/Services/CompanionActionRows.swift:220-223` | `Features/Companion/**` — **L1-C**'s (it owns `CompanionHearthView`, `CompanionOverlay`, the bottom inset) |
| `A-52` (`homeRow` hint) | `Features/Companion/Services/CompanionActionRows.swift:32-34` | same |
| `A-52` (`guestInviteView` message) | `Features/Notifications/Views/NotificationFeedView.swift:193` | `Features/Notifications/**` — **L1-F**'s (the badge/queue lane) |
| `C5-10` (`Discard Scan` / `Keep Scanning`) | `Features/RoomScan/Shared/Components/PauseMenuView.swift:63-64` | `Features/RoomScan/**` — **L1-B**'s |

Both of the `CompanionActionRows` rows also need `isAuthenticated` threaded through
`pieceActRow(_:isAuthenticated:)` and `homeRow()` — a signature change in a file this lane does not
own, applied blind, two merges after the owner has already merged.

**The ask:** route these four rows to the three owning lanes in the deck itself (or rule that L1-A
applies them at the X29 rebase, in which case say so and they go on X29's checklist). They are
written out in full in **A→E-4** below so whoever applies them has the exact final text.

---

## To the steward — Note A→S-6 · `RL3A-06`, the acceptance criterion for merge 5

L1-A closes **25 of its 27** rows. Two read **OPEN**, by design, and both are `X29`'s — the rebase
task that runs in this worktree after merges 1–4 and before merge 5 is pushed:

| finding | what is still open | what closes it |
|---|---|---|
| `C9-08` | four of the five `.numberPad`/`.decimalPad` files have no `.keyboardDoneToolbar()` (`RoomBudgetSheet`, `ManualRoomEntryView` ×2, `RoomSettingsView`, `ScanFallbackEntryView` — all L1-B's) | `l1-b-notes.md` **B-L1A-2**, applied at X29 |
| `C2-21` / `GAP7B-09` (acknowledgement half) | `AuthScreenView` accepts `pendingLinkNotice` and renders it; nothing passes it, because `AppCoordinator.pendingLinkNotice` is L1-F's and merges fourth | the two call-site lines in `ContentView.swift` and `AuthSheet.swift`, applied at X29 |

**The ask:** make merge 5's acceptance criterion name both rows explicitly, so the steward can refuse
the merge if they are still open. Both are now enforced by tests rather than by prose (`RL3A-03`):

- `KeyboardDismissalTests.everyBareNumericFieldIsOneOfTheFiveKnownOpenSites` — a tree-wide walk. It
  reds when a sixth bare field appears **and** when one of the four named files is fixed and the list
  is not updated. That second direction is the signal that `C9-08` may read closed.
- `AuthErrorRoutingTests.theHeldLinkNoticeIsWiredWhenTheCoordinatorCanSupplyIt` — inert while
  `AppCoordinator` has no `pendingLinkNotice`; the moment L1-F's property is on the tip it requires
  both call sites to pass it.
- `AuthErrorRoutingTests.thePearlStrokesAreRatchetedToZero` — the `D→A-7` swap. `<= 2` while
  `PatinaColors.Border` is absent from `PatinaDesignKit`; **exactly 0** the moment it is present.

`PROGRAM.md` §11.6 and `findings-by-lane.md` currently record L1-A at 27/27. **That is not yet true.**
Either accept the deferral and record **25/27 with two carried rows**, or require the rebase before
this branch is called done — Fable's call, but the number should say what is so either way.

---

---

# From L1-B — round 3 (fix round 2, 2026-09-03)

After the second adversarial review of L1-B (`RL1B2-01`…`RL1B2-18`). Full text at
`build/waves/w1/l1b-notes-out.md` §S5 and §S6.

## S5 → steward · seven `BrandVoiceLintTests` pins go red as *unexpected passes* at merge 6

`RL1B2-01` (blocker) — fixed on `first-flight/w1-l1b`. L1-E's round-3 and round-4 notes
(`l1-b-notes.md` E3-L1B-1 … E3-L1B-5, E4-L1B-1) were unapplied; they are applied now, verbatim.

`BrandVoiceLintTests.swift` on `first-flight/w1-l1e` wraps its pins for files other lanes own in
`pinDirtyToday(_:row:)` — a `withKnownIssue` that is **not** `isIntermittent`. Those wrappers were
written against this branch's state *before* this round. Now that the rows are applied, each becomes
an unexpected pass the moment L1-B is in the tree — and since L1-E merges last, that is **merge 6**.

| test | file it pins |
|---|---|
| `moneyFailureCopyApostrophesAreCurly` | `Features/Money/MoneyFailureCopy.swift` |
| `scanReviewApostrophesAreCurly` | `Features/RoomScan/Views/ScanReviewView.swift` |
| `scanWalkApostrophesAreCurly` | `Features/RoomScan/Views/ScanWalkView.swift` |
| `styleResponseModelApostrophesAreCurly` | `Features/RoomScan/Shared/Models/StyleResponseModel.swift` |
| `scanUploadFailureCopyApostrophesAreCurly` | `Features/RoomScan/Shared/Components/ScanUploadFailureCopy.swift` |
| `localStoreRecoveryNoticeApostrophesAreCurly` | `Core/Persistence/LocalStoreRecoveryNotice.swift` |
| `styleResponseModelIsClean` / `namedAestheticIsClean` | the two `"Curated"` display-name tables |

**Fix: one line each** — swap `pinDirtyToday(path, row: …)` for `pinCleanToday(path)`. A red here
means the deck landed.

**The eighth pin is the opposite case and needs no action.**
`roomsAPIClientApostrophesAreCurly` is `pinCleanToday` — unwrapped — and its own doc comment says
`first-flight/w1-l1b` adds `"We didn't get a response."` with U+0027 and that this pin exists to catch
it at the deck pass. It did. `Core/Network/RoomsAPIClient.swift:430` now reads
`"We didn’t get a response. Try again."` and that pin stays green through merge 6.

## S6 → steward · the cross-lane halves whose owner has already merged, and five unowned files

`RL1B2-04`, `-05`, `-06`, `-07`, `-08`, `-13`. **This supersedes S3** (same question, three of these
rows, no ruling yet) and folds in **S2** and **S4** so there is one table.

§5's rule: *"an integration note that no owner scheduled is not a plan, it is a hope."* Every row
below is a note whose owner **cannot** schedule it — the symbol arrives after that lane's merge, or
that lane has already merged. None is a disagreement about the change; the text is written and the
mechanism agreed. The missing thing is a recorded decision about **where the apply happens**.

### The applies, in merge order

| after merge | note | finding | file | what | re-run |
|---|---|---|---|---|---|
| **1** (L1-C) | `l1b-notes-out.md` **O11** | `A-34`, `C-11` | `ProductDetailView.swift:413`, `RecommendationsView.swift:381` | guard the verdict pill with `product.hasMatchScore` | `MatchScoreResolverTests` |
| **1** (L1-C) | **O12** | `L07-05` | `Features/Profile/Views/StudioHubView.swift` | render `viewModel.stalenessLine` | `LoadStateHonestyTests` |
| **1** (L1-C) | **O7** | `R-02`, `A-81` | `Features/Home/Views/DailyGreetingHeader.swift` | the bell must not assert "No unread notifications" over a count nobody fetched | `AttentionCountTests` |
| **3** (L1-B) | **O14** | `B-03` | `Features/Home/Views/DailyRoomView.swift` | the `LocalRoomSignal` observer (appended to `l1-c-notes.md`) | `RoomLifecycleTests` |
| **4** (L1-F) | `l1-b-notes.md` **L1F→B-5** | `RL1F-25` | `StudioQueueBuilder.swift:33,392` | `BadgeCountService.shared.unreadNotificationCount`, then delete the `StudioQueueBuilder.swift` entry from `BadgeFreshnessTests.owed` | `BadgeFreshnessTests`, `AttentionCountTests` |
| **5** (L1-A) | `l1-b-notes.md` **B-L1A-2** | `C9-08` | five `.numberPad`/`.decimalPad` fields in L1-B's files | `.keyboardDoneToolbar()` | `KeyboardDismissalTests` |

Two ways to close it — **one has to be chosen and written into §5.9**:

1. **Named tasks on the integration tip**, this table as the checklist, the named suite re-run after
   each.
2. **A short L1-B fix round rebased onto the tip**, after merge 1 and after merge 5.

Until the halves land, `A-81`, `L07-05`, `C9-08`, `C2-07` and the pill half of `A-34`/`C-11` should
**not** read as closed in any lane's coverage table. L1-B's own table marks them open.

**S3's `C3-01`/`C3-15` rows are withdrawn — they need no apply task.** `l1-b-notes.md` *From L1-D —
round 3* says L1-D applied every routed-out call-site swap in its own branch, and that checks out:
`git show first-flight/w1-l1d:…/Features/RoomScan/Views/ScanFallbackEntryView.swift` has zero
`pearl` and zero `.custom(` — `Border.strong` at `:118,:185,:259`, `PatinaTypography.bodySmall` at
`:174`, `monoLarge` at `:235`. What those two rows need is the **merge-3 conflict resolved by L1-D's
own rule** (*take L1-B's structure, re-apply L1-D's substitution*), and L1-D's three bars —
`BorderTokenAdoptionTests.pearlHasNoCallSitesOutsideTheTokenFile`,
`TypographyAdoptionTests.zeroInlineFontCustom`, `CurrencyFormattingTests.compactFormatterCeiling` —
name any line lost in it. They are bars, not ratchets: `ios-gate.sh unit` after merge 3 answers.

`C9-08` is the genuine one. `grep -c keyboardDoneToolbar` over `first-flight/w1-l1a`'s copies of
`RoomBudgetSheet.swift`, `ManualRoomEntryView.swift`, `RoomSettingsView.swift` and
`ScanFallbackEntryView.swift` returns **0, 0, 0, 0** — nobody has applied `B-L1A-2` anywhere.

> **The user-visible one.** Until **O11** lands, a piece opened by id draws a verdict pill reading
> **"Not scored yet"**: `ProductAPIClient.fetchProduct` correctly maps `matchScore: 0`
> (`quality_score` is not a match), `matchLabel` bands `0` to that sentence, and `hasMatchScore` has
> no consumer because the guard is in L1-C's file. The alternative is a pill reading a flat 50% on a
> piece the grid just scored 73, which is `C-11` itself (review `RL1B2-08`).

### The five files L1-B edited that no glob covers

`RL1B2-13`. All five changes are correct and minimal; §5.9 stops at S-5 and none of them is ruled.

| file | why L1-B touched it | previously raised as |
|---|---|---|
| `Patina/PatinaApp.swift` | one modifier line — `.localStoreRecoveryNotice()` for `C7-01` | S2 |
| `Features/Collections/Views/CollectionsView.swift` | `C4-03`'s three states, and E3-L1B-4's noun | S2 |
| `PatinaTests/OrderHandoffTests.swift` | `waitFor`'s 3 s wall-clock budget → 20 s (`RL1B-01`) | S4 |
| `PatinaTests/RoomBudgetTests.swift` | three currency expectations rewritten for `C5-14` | **not previously raised** |
| `PatinaTests/SessionIsolationTests.swift` | participant count 11 → 13, two new `SessionScoped` entries | **not previously raised** |

S4's second ask stands: the ruling should also cover `CompanionCoachingModelTests.swift`, a second
wall-clock poller L1-B deliberately did not touch.

**Tell the wave the ceiling moved:** `OrderHandoffTests.waitFor` is now 20 s, not 3 s.

### The merge-3 conflict list

`RL1B2-14`. `git merge-tree --write-tree --name-only <lane> first-flight/w1-l1b`, run on
`first-flight/w1-l1b` against all five other lanes: **`w1-l1c` none · `w1-l1d` six · `w1-l1f` none ·
`w1-l1a` one · `w1-l1e` none.** Nineteen files are touched by both L1-B and L1-D; thirteen
auto-merge. The six-plus-one, with the rule that resolves each, are in `l1b-notes-out.md` under
*"The merge-3 conflict list"*. The one that is not a take-both:
`PatinaTests/RoomBudgetTests.swift` — **L1-B's currency expectations win** where they disagree, and
`PatinaTests/SessionIsolationTests.swift` (vs L1-A) — **take the union of the `SessionScoped` entries
and set the count literal to the resulting number**; the literal is a guard, not a fact.

---

# From L1-B — round 4 (fix round 3, 2026-09-03)

Full text: `build/waves/w1/l1b-notes-out.md`, round-4 section.

## Note S7 → steward · §S6 corrected in place; two things still want a §5.9 line

`RL1B3-03` and `RL1B3-08`. Both are corrections to `l1b-notes-out.md`, made **in place** in that file
(the diff shows them), so §S6 is now accurate rather than restated here.

1. **§S6's applies table gained O5** — `C4-03`'s Spaces half (`Features/Rooms/Views/YourSpacesView.swift`,
   the error branch for `RoomSyncCoordinator.shared.lastLoadFailed`). It was the one row missing, and
   Spaces is the surface `C4-03`'s own `where` names first. Sim-confirmed on the round-3 tree: Your
   Spaces drew a bare `Text("No rooms yet")` with no error branch in the file at all.

2. **Your own routing is folded in, so ownership and scheduling read as one decision.** The table
   above under *"From L1-C — fix round"* already assigns `C-L1B-1` (Today's staleness sentence),
   `C-L1B-3` (**= O5**) and `C-L1B-4` (**= O7**) to **L1-B after merge**. So *who* is settled and the
   only open question in §S6 is *where*. **L1-B's recommendation is option 2** — a short L1-B fix
   round rebased onto the tip after merge 1, and a second after merge 5. Three of the four merge-1
   rows are already L1-B's by your ruling, the tripwires live in L1-B's suites, and the two suites
   they name are L1-B's.

3. **Every unapplied cross-lane half is now a test, not a hope.** Four new `withKnownIssue` tripwires
   on `first-flight/w1-l1b`, none `isIntermittent`: `LoadStateHonestyTests.theSpacesErrorBranchIsStillOwed`
   (O5), `.theStudioHubStalenessLineIsStillOwed` (O12),
   `AttentionCountTests.theBellStillOwesItsKnownFlag` (O7), and
   `MatchScoreResolverTests.theVerdictPillsAreStillUnguarded` ×2 (O11). Each goes **red** the moment
   its note lands — which is the signal to delete the block — and green while it is genuinely owed.
   With the five that already existed the tier now carries **fifteen** known issues, every one a named
   cross-lane debt.

4. **The unowned-file table is seven rows, not five** (`RL1B3-08`). Added:
   `PatinaTests/DecisionConsentValidationTests.swift` and `PatinaTests/InvoicesMoneyRailTests.swift`.
   Both are the test files for globs **S-3** gives L1-C; both edits are forced (E3-L1B-2's glyph swap
   on `MoneyFailureCopy`, and `C5-14` retiring the compact currency form), and
   `git diff --name-only main...first-flight/w1-l1c` lists **neither**, so there is no merge risk —
   only an unrecorded edit. **The §5.9 ruling should cover all seven**, plus
   `CompanionCoachingModelTests.swift` (S4's standing ask, still open).

**One more for the ceiling record**, since a lane adding main-actor suites spends it:
`OrderHandoffTests.waitFor` is 20 s, not 3 s — unchanged from round 3, restated because §5.9 has not
recorded it yet.

---

# From L1-A — fix round 5 (2026-09-03)

## To the steward — Note `A→S-7` · a fresh boot no longer clears the two timing suites

`D→X-3` and L1-B's `waitFor` note both stand; this adds the measurement that changes what the
steward can conclude from a red `unit` line.

L1-A's fix round 4 recorded the flake as **warm-simulator only** — `Z5`'s run 4 was
`shutdown` + `boot`, then 1713 tests / 188 suites / **0 issues** in 5.011 s — and left the wave with
"boot the clone fresh and it goes green." **That is no longer true.** This round, on the same clone
and the same commit `12a20aabe`, with the boot done first:

| run | conditions | tier wall time | result |
|---|---|---|---|
| 1 | fresh `shutdown`+`boot`, `load avg 892`, six concurrent `xcodebuild`s | **98.9 s** | **7 issues** — `OrderHandoffTests` ×6, `CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves` ×1 |
| 2 | the two suites alone, same clone, immediately after | **0.109 s** | 36 tests, **passed** |
| 3 | whole tier again, `load avg ~500` | 10.1 s | **4 issues** — `OrderHandoffTests` only |

Run 2 is the proof: 0.109 s alone against 34–45 s per test inside the parallel run. The variable is
machine load from the other five lanes' gates, not simulator warmth, so **a fresh boot is not a
remedy the steward can rely on at D14's between-merge gates** — those run while other lanes are
still compiling.

Two consequences for the merge sequence, neither of them L1-A's to take:

1. L1-B's `waitFor(timeout: .seconds(20))` lives on `first-flight/w1-l1b` only. It is absent from
   `first-flight/w1-l1a` **deliberately** — `PatinaTests/OrderHandoffTests.swift` is residue in no
   lane's glob, and a second lane editing the same line buys the steward a conflict in a file
   neither lane owns for a fix that is already coming. Once L1-B is on the tip, the tier's red
   should shrink to `CompanionCoachingModelTests`, which nobody has raised.
2. Until §5.9 rules, a red `unit` line naming **only** `OrderHandoffTests` or
   `CompanionCoachingModelTests` should be re-run with
   `-only-testing:PatinaTests/OrderHandoffTests -only-testing:PatinaTests/CompanionCoachingModelTests`
   before it is called a merge blocker. `git diff main...HEAD --name-only` over both suites and
   `Features/Purchase/OrderHandoff.swift` is empty on this branch.

L1-A's own three gate lines — `build`, `release`, `lint-delta main` — are green at `12a20aabe`, and
1713 − 36 = 1677 tests in 186 suites are green in the same run that recorded the four issues.

---

---

## From L1-C — fix round 2 (2026-09-03) · six rows the merge must route

The first fix round (through `117d547c8`) was completed on 2026-09-02 but never reported; this round
re-verified it line by line and then worked the thirteen further note blocks that arrived in
`l1-c-notes.md` between then and now (the file grew 1,038 → 1,813 lines). Two landed as code; the
rest cannot compile on this lane's base.

**L1-C merges first (D14) and owns every file below.** If these are not routed, no later lane can
reach them.

| at merge | lane | file | the edit |
|---|---|---|---|
| 2 | L1-D | `Features/Rooms/Components/RoomTypePillRow.swift` | `D→C-12`'s three token lines — `:75` ink, `:82` fill, `:86` stroke (offsets moved; the file was rewritten again for `RL1C-05`) |
| 2 | L1-D | `Features/Companion/Components/CompanionHearthView.swift`, `Features/Companion/Views/CompanionOverlay.swift` | `D→C-13` — **union** merge, not "take L1-C's structure" |
| 3 | L1-B | `Features/Profile/Views/StudioHubView.swift` | `O12` (`L07-05`) — render `viewModel.stalenessLine` |
| 3 | L1-B | `Features/Home/Views/DailyRoomView.swift` | `O14` (`B-03`) — the `LocalRoomSignal` observer. L1-C has taken the note's own offer to leave it in `l1b-notes-out.md` §S6 |
| 3 | L1-B | `Features/ProductDetail/Views/ProductDetailView.swift`, `Features/Recommendations/Views/RecommendationsView.swift` | re-point three `product.matchScore > 0` guards at `product.hasMatchScore` (a rename; `UnscoredMatchPillTests` goes red on it by design) |
| 4 | L1-F | `Features/Home/Views/DailyRoomView.swift:282`, `Features/Home/ViewModels/RecordRefresh.swift` | the bell's one count (`C2-07`) and `save(record, owner: sessionUserId)` (`RL1F-21`) |

Two new test files this round, both in `PatinaTests/`, both source pins with no fixtures:
`CurlyApostropheTests.swift` (L1-E's five copy rows, held for the five merges before L1-E lands —
safe to delete at merge 6) and `UnscoredMatchPillTests.swift` (`A-34`/`C-11`).

---

---

# From the W1 walk fix round 1 (2026-09-03) · three harness rules the walks earned

Walkers A, B and C each lost coverage to the same three environment failures, and all three are
silent: the app looks right while the thing under it is dead. They are **steward rules**, not product
defects, and they belong in a walker's preflight rather than in `findings.json`.

## `W1-A-08` — probe the gateway before the first launch, and after any worktree retirement

The local API gateway was **down for the whole start of the wave**. `supabase_kong_supabase` was
`Exited (127)`, and `docker start` said why:

```
error mounting ".../.codex/worktrees/agent-tester-notes/supabase/templates/confirmation.html"
to rootfs at "/home/kong/templates/email/confirmation.html": not a directory
```

The container had been created from the **retired `agent-tester-notes` worktree**. When that
worktree's files went, Docker recreated the six bind-mount sources as empty **directories**, and kong
cannot mount a directory onto a file. Walkers A, B and C each found and repaired it independently,
which is three walkers paying for one fact.

Why it costs coverage rather than announcing itself: `-DeploymentTarget local` points the app at
`:54321`, and **the Welcome screen renders identically with the backend down** — `RL1A-06`'s
`target == .local` clause puts Apple in the provider stack regardless of what
`GET /auth/v1/settings` says. A walker can complete a "successful" Welcome pass against a dead API
and never know.

**The rule.** Every walker's first command, before any launch:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:54321/auth/v1/settings   # must be 200
```

Anything but `200` and the walk does not start. And when a worktree is retired, kong is recreated
from the **current** checkout (`npx supabase stop && npx supabase start` from the main checkout)
before the next wave — a stack whose `com.supabase.cli.workdir` points at a directory that no longer
exists is a wave-wide outage waiting for its first walker.

Verified on this fix round at 17:0x CDT: `gateway=200`, and `docker ps` shows
`supabase_kong_supabase Up (healthy)` alongside `supabase_db_supabase` and
`supabase_edge_runtime_supabase`.

## `W1-A-02` — one account per walker, or serialise the signed-in legs

All three walkers drove one Supabase at `127.0.0.1:54321` **and one `client@patina.dev` account**.
Walker A watched walker B's fixture appear mid-walk — "Walk B Test Room. 120 sq ft" in a rail that
had shown Guest Bedroom / Dining Room / Living Room 23 minutes earlier, confirmed in SQL:

```
Walk B Test Room|2026-09-03 20:23:59.615512+00
Guest Bedroom   |2026-09-03 20:00:43.215171+00
```

This is Hard Rule 1's failure mode moved from the simulator to the database, and it has the same
consequence: **every room-count, roster, badge-count and "your house" observation any W1 walker made
is unreliable**, in both directions — a room that appeared, and a room that vanished.

**The rule.** Mint one account per walker for the wave (the W0 fixture script already takes an
email), or serialise the signed-in legs so only one walker is authenticated at a time. Until one of
those is in place, a walk report must say which of its rows depend on fixture state.

## `W1-A-03` — re-run the HID preflight after every fresh-install sequence

Synthetic HID died on walker A's clone (`4D075B9D…`) **immediately after**
`terminate → uninstall → keychain reset → install`, and survived no recovery: not relaunch, not
terminate + relaunch, not `shutdown` + `boot` + relaunch (a real Simulator.app window confirmed
present), not a full `erase` + `boot` + keychain reset + install + relaunch. `describe_screen`
degraded from a full tree to a single empty node while `simctl io screenshot` kept returning correct
frames — so the screen looks right while nothing lands. It cost 8 of 27 rows.

**The rule.** The HID preflight runs at session start **and again after every fresh-install
sequence**. A walker that reinstalls mid-walk and does not re-preflight has no basis for any row
after the reinstall, and must say so rather than record them.

## One harness fact the round confirmed, and one it corrected

- **The Studio hub barely scrolls under synthetic input** (walker A §4). Re-measured on
  `ff-w1-walk-b`: five flicks from `(200, 700)` moved the content 0 pt. Not a product defect — a
  finger scrolls it fine — but it is why `A-101`, `B-12`, `C1-14` and the Settings row at y≈2267 are
  code-verified rather than walked.
- **The swipe that does work** starts on non-button content with a short duration:
  `fromX 200, fromY 545 → 145, duration 120, delta 400` moved the hub from its top to
  "Money & documents" in six strokes, where six flicks from `(200, 700)` — which start on a card
  Button — moved nothing. Worth a walker's first try before Hard Rule 10 is invoked.
