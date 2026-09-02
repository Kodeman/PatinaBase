# 00 — Steward (S0): environment for the iOS TestFlight-polish AUDIT

Run 2026-09-01, ~15:37–16:05 local, from the **main checkout** `/Users/kody/Code/patina-merged`.
Read-only with respect to code, git and production. No `supabase db reset`. No production writes.

---

## 1. Repo state

| | |
|---|---|
| main tip | **`d7287c3f8`** — `feat(onboarding-fixes): merge integration lane — admin verify-email + dead-route fixes, …, migrations 00551-00554` |
| `Secrets.swift` | **present** — `apps/mobile/Patina/Patina/App/Configuration/Secrets.swift` (1.1 KB, 10 Jul). Contents never printed. |
| SHA stamped into the build | `GitCommit.sha = "d7287c3f+"` |

⚠ The trailing `+` on the stamped SHA means the working tree was dirty at build time. The **only**
dirty path under `apps/mobile/Patina` is
`Patina.xcodeproj/xcuserdata/kody.xcuserdatad/xcschemes/xcschememanagement.plist` — Xcode per-user
scheme ordering, zero app-code impact. **The binary is `d7287c3f8` app code.** If a walker sees
`d7287c3f+` in an in-app build/version string, that is expected and is not a finding.

---

## 2. Local stack — all four checks PASS

The stack was **already running but degraded** when I arrived: `supabase status` reported
`Stopped services: [supabase_edge_runtime_supabase supabase_pooler_supabase]` and
`/functions/v1/` answered **503**.

**Fix applied — the cheap one, not the full recipe.** Provenance was already correct
(`EDGE_FUNCTIONS_MANAGEMENT_FOLDER=/Users/kody/Code/patina-merged/supabase/functions`, i.e. *not* the
dead-worktree fault that `ios-daily-return-2026-08-26/research/04-stack-restart.md` documents), and
the container's last log lines were normal request-serving, not a boot error — it had simply
`Exited (255)` 11 hours earlier. So a single `docker start supabase_edge_runtime_supabase` was enough;
**no `pnpm supabase:stop`/`start` cycle was needed**, and no data was touched.

Final probe results:

| Check | Command | Result |
|---|---|---|
| PostgREST | `curl /rest/v1/ -H "apikey: <local anon>"` | **200** |
| Edge functions (root) | `curl /functions/v1/` | **404** (was 503 — 404 is the router answering) |
| Edge function (real) | `POST /functions/v1/morning-brief` + anon Bearer | **200** |
| Edge function (real) | `POST /functions/v1/companion-context` | **401** (function answering; anon token rejected) |
| Edge function (real) | `POST /functions/v1/create-checkout-session` | **400** (function answering; empty body) |
| GoTrue | `curl /auth/v1/health` | **200** |
| Mailpit | `curl :54324/api/v1/messages` | **200** |
| Seeded accounts | `psql … auth.users where email in (…)` | **both present** — `client@patina.dev`, `james.okafor@example.com` |

The 200/401/400 triple matches the known-good "after" table in `04-stack-restart.md` §3(b) exactly.

Also confirmed reachable for lane P and deep-link work:
`https://bkvcixdmuyejfzcijpdg.supabase.co/auth/v1/health` → **401** (reachable; 401 is the
no-apikey answer, not a connection failure) · `https://client.patina.cloud/.well-known/apple-app-site-association` → **200**.

`client@patina.dev` = `a0000000-0000-0000-0000-000000000005`.

### Residual local-environment faults (NOT app defects — do not report as findings)
Carried forward from `04-stack-restart.md` §5, still true:
1. `STRIPE_SECRET_KEY` on the local edge runtime is a 32-char placeholder → **Stripe Checkout cannot
   open locally**. The *environment* limit is not a finding; **how the app presents that failure is**.
2. `aesthete-embed-worker` logs `inference_unconfigured`; `aesthete-dna-draft` logs `parked_no_api_key`.
3. `psql` prints a harmless `collation version mismatch` WARNING on every connection.
4. The `[inbucket]` config section warns as deprecated on every CLI invocation.

---

## 3. Clone table

Review simulator `973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro, iOS 26.5) was
**shut down and never erased**. It is the clone source and is otherwise untouched.

| Lane | udid | State | Backend | Purpose |
|---|---|---|---|---|
| **A** | `8A11B31F-FD18-4751-976F-0999EFD8B0CA` | **fresh** (erased + keychain reset) | local | first-run / flags-OFF walk |
| **B** | `2B711913-9121-4E89-8E80-809AE8F34C2A` | **fresh** (erased + keychain reset) | local | flags-ON walk |
| **C** | `670DE752-BA1B-40C1-899E-57B50D5743B5` | **signed in as `client@patina.dev`** (not erased; session established by S0 — see §5) | local | signed-in / returning-user walk |
| **P** | `BD8D6AC8-BA6C-484B-B819-6E671FA72D8D` | **fresh** (erased + keychain reset) | **Strata PRODUCTION** | prod-readiness walk |

All four are **Booted** with a real window in Simulator.app (verified via
`osascript … get name of every window` → `tfp-A – iOS 26.5, tfp-P – iOS 26.5, tfp-C – iOS 26.5, tfp-B – iOS 26.5`).
Headless boots swallow synthetic input; these are not headless.

All four have the app installed and **no Patina process running** — the walker owns the first launch.

Device settings applied to every clone:
`xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4`
and `xcrun simctl ui <udid> appearance light`.

⚠ `simctl status_bar override` does **not** survive an erase/uninstall cycle cleanly in all cases —
re-apply it after any mid-walk reset (it is in the reset recipe below).

---

## 4. Build — ONE signed build, shared by all four lanes

```
xcodebuild build \
  -project /Users/kody/Code/patina-merged/apps/mobile/Patina/Patina.xcodeproj \
  -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=8A11B31F-FD18-4751-976F-0999EFD8B0CA' \
  -derivedDataPath /Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/.build/DerivedData
```

`** BUILD SUCCEEDED **` on the **first** run (no GitCommit.swift retry needed).
**No `CODE_SIGNING_ALLOWED=NO`.**

| | |
|---|---|
| **app_path** | `/Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/.build/DerivedData/Build/Products/Debug-iphonesimulator/Patina.app` |
| build log | `/Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/.build/xcodebuild.log` |
| bundle id / version | `cloud.patina.app` · `CFBundleShortVersionString 1.0` · `CFBundleVersion 1` |
| bundle size | 69 MB (Debug, simulator, unthinned) |
| embedded extension | `PlugIns/PatinaWidget.appex` present and validated |

### Compiler warnings: **236 unique** (389 raw `warning:` lines), all in the `Patina` target

Breakdown of the 236 unique source warnings:

| Kind | Count |
|---|---|
| Swift 6 concurrency (`…this is an error in the Swift 6 language mode`) | **112** |
| Deprecations | **32** — incl. **19** × supabase-swift `Direct access to database is deprecated, use SupabaseClient.from(_:)/rpc(_:params:)/schema(_:)`, 6 × internal `use monoLabel (13pt)` |
| Remaining main-actor isolation warnings not carrying the Swift-6 sentence | ~92 |

Two non-source build warnings: the `SwiftLint` run-script phase declares no outputs (runs every
build), and the `Stamp Git SHA` phase is not dependency-analysed (by design).

Full deduplicated list: `grep -oE '^/[^ ]+:[0-9]+:[0-9]+: warning: .*' <build log> | sort -u`.

### ⚠ Entitlements — the brief's assertion does not hold literally; substance verified another way

The brief says *"codesign -d --entitlements :- <Patina.app>/Patina must mention application-identifier"*.
**On an iOS-Simulator build under Xcode 26 it does not, and that is correct behaviour, not a fault.**
What I actually saw:

```
$ codesign -dv .../Patina.app/Patina
Identifier=cloud.patina.app   Signature=adhoc   TeamIdentifier=not set
$ codesign -d --entitlements :- .../Patina.app/Patina
<plist version="1.0"><dict></dict></plist>          # EMPTY
```

Xcode emits **two** entitlement blobs for a simulator destination
(`PROVISIONING_PROFILE_REQUIRED=NO`): an empty `Patina.app.xcent` used by the ad-hoc `codesign`, and
`Patina.app-Simulated.xcent` which is linked into the Mach-O as `__TEXT,__entitlements` — that is the
one the simulator runtime reads. **That section carries the real entitlements:**

```
application-identifier                     VP22LXHT7L.cloud.patina.app
aps-environment                            development
com.apple.developer.applesignin            [Default]
com.apple.developer.associated-domains     [applinks:client.patina.cloud]
com.apple.security.application-groups      [group.cloud.patina.app]
```

Two independent confirmations that entitlements are live, i.e. that simulator rule 1
(never install a `CODE_SIGNING_ALLOWED=NO` build) is satisfied:

1. The clone keychains contain items scoped to the access group `VP22LXHT7L.cloud.patina.app`.
2. **Empirical**: lane C signed in, then `terminate` + relaunch → **still signed in** (§5). A
   stripped-entitlement build cannot persist a session at all.

**Verification command for future stewards** (the brief's one-liner will always look like a failure here):

```
python3 -c "
import subprocess,re
o=subprocess.run(['otool','-X','-s','__TEXT','__entitlements','<APP>/Patina'],capture_output=True,text=True).stdout
w=[m.group(1).split() for m in map(lambda l:re.match(r'^[0-9a-f]{16}\t(.*)$',l),o.splitlines()) if m]
print(b''.join(bytes.fromhex(x)[::-1] for g in w for x in g).decode('utf-8','replace'))"
```

---

## 5. HID preflight — **all four clones PASS**

Method per lane: launch → `describe_screen` → tap a real control by its scanned frame centre →
screenshot before and after → Read both → confirm the screen changed.

| Lane | Launched with | Control tapped | Before → After | Shots |
|---|---|---|---|---|
| **A** | `-DeploymentTarget local` | `auth.welcome.guestButton` @ (201, 578) | Welcome home → **"Every room tells a story"** guest onboarding | `shots/steward/a-preflight-{before,after}.png` |
| **B** | `-DeploymentTarget local` | `auth.welcome.guestButton` @ (201, 578) | Welcome home → **"Every room tells a story"** | `shots/steward/b-preflight-{before,after}.png` |
| **C** | `-DeploymentTarget local` | `auth.welcome.passwordButton` @ (201, 626) | Welcome home → **"Sign In / Welcome back to Patina"** sheet | `shots/steward/c-preflight-{before,after}.png` |
| **P** | *(no arguments = Strata prod)* | `auth.welcome.guestButton` @ (201, 578) | Welcome home → **"Every room tells a story"** | `shots/steward/p-preflight-{before,after}.png` |

Synthetic input lands on all four. After the preflight, A/B/P were reset (§7) and C's app was terminated.

### ⚠ Lane C did NOT inherit a working session — S0 established one

The brief assumed tfp-C would inherit a signed-in `client@patina.dev` session from the review
simulator. **It did not.** On first launch C showed the same Welcome screen as the erased clones, and
`docker logs supabase_kong_supabase | grep "Patina/1"` showed **zero** requests — the app made no
network call at all, i.e. it had no session to restore and was not failing a refresh.

The inherited state was otherwise intact, which rules out a cloning fault:

* C's app **data container dates from 28 Aug** and carries prior signed-in UserDefaults —
  `hasCompletedOnboarding = true`, `hasSeenThreshold = true`, `roomCount = 1`,
  `local_store_owner_user_id = A0000000-0000-0000-0000-000000000005` (= `client@patina.dev`),
  `patina.companion.coaching.phase = "learning"`, `patina.push.hasPromptedAfterFirstSubmission = true`.
* C's keychain db came across and holds `VP22LXHT7L.cloud.patina.app` access-group items.

So the clone worked; the **stored Supabase session had simply gone stale** (the review sim was last
driven ~09:44 today). This is an environment fact, **not an app finding** — do not file it as one.

**S0 restored the lane** by signing in through the app's own password path with the brief's local
seeded credentials (`client@patina.dev` / `password123`) — a local-only action, no production contact.
Proof it worked, from Kong:

```
GET  /rest/v1/rooms?…&user_id=eq.a0000000-0000-0000-0000-000000000005      200
GET  /rest/v1/client_designer_roster?…&client_id=eq.a0000000-…-005          200
POST /rest/v1/rpc/get_recommendations                                       200 (8127 B)
POST /functions/v1/companion-context                                        200 (230 B)
POST /rest/v1/profile_presence?on_conflict=user_id                          201
```

`shots/steward/c-session.png` shows the signed-in Daily Return home: *"Good afternoon."*,
"SINCE YOU WERE LAST HERE · FRI, AUG 28", invoice due $4,250.00, Leah Hartwell / Aspen Loft Refresh,
Guest Bedroom + Dining Room cards, notification badge 3, Studio badge 5.

**The session persists across relaunch** — `shots/steward/c-session-persist.png` was taken after a
`terminate` + fresh `launch` and shows the same signed-in home. Lane C is ready.

⚠ Signing in raised the iOS system **"Save Password?"** sheet. I dismissed it with *Not Now*. It comes
from the Passwords daemon, **not** from Patina, so it is invisible to `scan_ui`/`describe_screen` — tap
it by computed screenshot coordinates if it reappears. Do not file it as an app finding.

---

## 6. Exact launch command per lane

Repeat the launch arguments on **every** launch, including relaunches — `NSArgumentDomain` is volatile.

```bash
# A — local backend, all flags OFF (first-run / TestFlight-parity walk)
xcrun simctl launch 8A11B31F-FD18-4751-976F-0999EFD8B0CA cloud.patina.app -DeploymentTarget local

# B — local backend, the three flags ON
xcrun simctl launch 2B711913-9121-4E89-8E80-809AE8F34C2A cloud.patina.app \
  -DeploymentTarget local -PatinaFlags house-first,direct-orders,house-widget

# C — signed in as client@patina.dev. BOTH variants are in scope for this lane:
xcrun simctl launch 670DE752-BA1B-40C1-899E-57B50D5743B5 cloud.patina.app -DeploymentTarget local
xcrun simctl launch 670DE752-BA1B-40C1-899E-57B50D5743B5 cloud.patina.app \
  -DeploymentTarget local -PatinaFlags house-first,direct-orders,house-widget

# P — NO arguments == Strata PRODUCTION. Do not create data.
xcrun simctl launch BD8D6AC8-BA6C-484B-B819-6E671FA72D8D cloud.patina.app
```

Relaunch = `xcrun simctl terminate <udid> cloud.patina.app` then the `launch` line above.
**Never pass `--uitesting`** (resets auth every launch, disables PostHog).

---

## 7. Reset recipe (mid-walk, to clean first-launch state)

Verified working on A this session: after this sequence A came back to the Welcome screen
(`shots/steward/a-after-reset.png`). The simulator keychain survives an uninstall, so the
`keychain reset` line is mandatory — skipping it leaves a session behind.

```bash
U=<udid>
APP=/Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/.build/DerivedData/Build/Products/Debug-iphonesimulator/Patina.app
xcrun simctl terminate $U cloud.patina.app || true
xcrun simctl uninstall $U cloud.patina.app
xcrun simctl keychain  $U reset
xcrun simctl install   $U "$APP"
xcrun simctl status_bar $U override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4
xcrun simctl ui $U appearance light
```

Do **not** run this on lane C unless you intend to destroy its session (re-establish it by signing in
with `client@patina.dev` / `password123`). `--resetonboarding` resets onboarding flags only.

---

## 8. What a walker must know that differs from the brief

1. **`scan_ui` is unreliable on these clones — `describe_screen` is not.** An unqueried
   `scan_ui {region:"full"}` returned `[]` on the Welcome screen of lane A while `describe_screen`
   returned the full 14-node tree with every `AXUniqueId`. On B and P even a *queried* `scan_ui`
   returned `[]` for a control that `describe_screen` showed as present and enabled at
   `{{27.25, 552.25}, {347.5, 51.5}}`. **Never conclude a control is missing from an empty
   `scan_ui`** — that would manufacture a fake defect. Confirm with `describe_screen` first, and only
   then treat absence as real.
2. **The brief's entitlements one-liner will look like a failure.** See §4 — `codesign -d --entitlements`
   returns an empty dict for every simulator build. The build IS correctly signed; use the
   `__TEXT,__entitlements` decode instead.
3. **Lane C's session was created by S0, not inherited** (§5). Its UserDefaults still carry 28-Aug
   history (`roomCount = 1`, companion phase `learning`, onboarding + threshold seen), so C is a
   *returning* user, not a fresh one — which is what the lane is for, but it means C will skip
   first-run surfaces.
4. **The stamped build SHA reads `d7287c3f+`**, with a `+`, from a dirty Xcode user-scheme file only (§1).
5. **iOS system dialogs are invisible to the blitz tools** (the "Save Password?" sheet, permission
   prompts). They live in another process. Tap them by screenshot coordinates:
   logical points = pixel / 3 (screenshots are 1206×2622 px = 402×874 pt).
6. **Biometry is not enrolled** on these clones — the app log shows
   `canEvaluatePolicy … Error … "No identities are enrolled."` and `biometryType: 2` (Face ID
   hardware present, no face enrolled). If a walk needs Face ID, enrol it first
   (`xcrun simctl spawn <udid> notifyutil -s com.apple.BiometricKit.enrollmentChanged 1`, or
   Simulator ▸ Features ▸ Face ID ▸ Enrolled) rather than filing "Face ID does nothing".
7. **PostHog reaches out on launch** — `us-assets.i.posthog.com/array/…/config` and
   `us.i.posthog.com/flags` are contacted from lane A/B/C too (local backend does not stub PostHog).
   Flags still resolve OFF on first launch because the cache is empty.
8. **Kong request log** for local lanes:
   `docker logs supabase_kong_supabase --since 60s 2>&1 | grep "Patina/1"`. Lane P produces **no**
   Kong lines by design — it talks to Strata.
9. **Screenshots**: `xcrun simctl io <udid> screenshot <path>` or `mcp__blitz-iphone__get_screenshot`
   only. Never desktop `screencapture`. Read every PNG after taking it.
10. All `xcrun simctl`, `xcodebuild`, `docker` and `osascript` calls need `dangerouslyDisableSandbox: true`.
    Write temp files under the program folder, never `/tmp/claude/...`.

---

## 9. Evidence index

```
artifacts/ios-testflight-polish-2026-09-01/
  .build/xcodebuild.log                      full build log (BUILD SUCCEEDED, 236 unique warnings)
  .build/DerivedData/Build/Products/Debug-iphonesimulator/Patina.app     app_path
  shots/steward/a-preflight-before.png       A: Welcome home
  shots/steward/a-preflight-after.png        A: guest onboarding — tap landed
  shots/steward/a-after-reset.png            A: back to Welcome after the reset recipe
  shots/steward/b-preflight-before.png       B: Welcome home
  shots/steward/b-preflight-after.png        B: guest onboarding — tap landed
  shots/steward/b-now.png                    B: welcome screen at scan_ui-empty moment
  shots/steward/c-preflight-before.png       C: Welcome home (session NOT inherited)
  shots/steward/c-preflight-after.png        C: Sign In sheet — tap landed
  shots/steward/c-session.png                C: signed in, Daily Return home
  shots/steward/c-session-persist.png        C: still signed in after terminate + relaunch
  shots/steward/p-preflight-before.png       P: Welcome home (Strata production)
  shots/steward/p-preflight-after.png        P: guest onboarding — tap landed
  shots/steward/p-now.png                    P: welcome screen at scan_ui-empty moment
```

---

## 10. Teardown (S9, 2026-09-01)

### Local stack — left running
`docker ps` showed `supabase_kong_supabase Up 16 hours (healthy)` — never paused, no `docker unpause` needed.
`supabase status` after teardown: API `http://127.0.0.1:54321`, DB `:54322`, Studio `:54323`, Mailpit `:54324` all serving. `supabase_pooler_supabase` reported stopped (its pre-audit state; not touched). Stack left running per instruction.

### Simulator clones deleted
All shut down then deleted with `xcrun simctl shutdown <udid>` + `xcrun simctl delete <udid>`. All 8 succeeded; `xcrun simctl list devices | grep -c 'tfp-'` now returns **0**.

| Device | UDID | Source |
|---|---|---|
| tfp-A | 8A11B31F-FD18-4751-976F-0999EFD8B0CA | lane clone (assigned) |
| tfp-B | 2B711913-9121-4E89-8E80-809AE8F34C2A | lane clone (assigned) |
| tfp-C | 670DE752-BA1B-40C1-899E-57B50D5743B5 | lane clone (assigned) |
| tfp-P | BD8D6AC8-BA6C-484B-B819-6E671FA72D8D | lane clone (assigned) |
| tfp-GAP2 | FD94BFFD-6BF0-4A76-B3C9-FE7CD8F3A7F3 | leftover, self-created by a gap lane |
| tfp-GAP3 | B507B498-7E78-46D2-B885-E24E569DEEC4 | leftover, self-created by a gap lane |
| tfp-GAP4 | 6D836431-49CA-4BC6-B508-527021313A86 | leftover, self-created by a gap lane |
| tfp-GAP6own | 7B1C6975-CF68-424C-AD9A-BA5FB1BE072E | leftover, self-created by a gap lane |

Four `tfp-GAP*` clones beyond the four assigned lane devices were found booted and were swept under the "any device whose name starts with tfp-" rule.

### Booted now
- **iPhone 17 Pro `973D1724-90BF-4A0A-B02D-481D561547B3`** — the review simulator, re-booted (`xcrun simctl boot`). NOT launched, NOT erased. `cloud.patina.app` still installed; bundle at `…/Devices/973D1724…/data/Containers/Bundle/Application/9E123435-0B3B-44C3-91EB-8F6190661806/Patina.app`. Restored to its pre-audit state.
- **iPad Pro 11-inch (M5) `7C8C092C-7AD4-453C-9CC6-40E0931260AC`** — found booted, left booted and untouched. Not a `tfp-` clone and not in the teardown list, so out of scope for this sweep; flagging it in case a lane booted it and it should be shut down separately.

No `Coach-*` device was touched.

### Disk
- `artifacts/ios-testflight-polish-2026-09-01/.build` — **4.0 GB** (`du -sh`), dominated by `DerivedData`.
- Program folder total — **4.5 GB**, so ~500 MB is ledgers plus `shots/`.
- Left in place: `.build/DerivedData/Build/Products/Debug-iphonesimulator/Patina.app` is the signed Debug build the walks installed, and the evidence index above still points into `.build/xcodebuild.log`. Delete `.build/` once the audit is signed off to reclaim the 4 GB.
