# 02 — Steward boot recipe (S1)

**Everything the three walk agents need is in this file. You should not have to re-derive anything.**

Written 2026-08-26. Simulator left **BOOTED**, app **installed, not launched** (clean first launch).

---

## 0. The one-paragraph version

The app is built and installed. It points at cloud **by default** — you MUST pass
`-DeploymentTarget local` on **every** `simctl launch`, because the override lives in
`NSArgumentDomain` and is **volatile** (it does not persist across launches). Taps, typing and
swipes all work through the **blitz MCP tools** — the July "taps don't deliver" trap does **not**
reproduce today. Sign in with **password** (`password123`); do not use the OTP path (local email
carries no 6-digit code — see §7). Local edge functions are **all 503** — that is an environment
fault, not an app defect (see §8).

---

## 1. Build provenance

| | |
|---|---|
| repo HEAD | `3cd84ecb3` |
| project | `/Users/kody/Code/patina-merged/apps/mobile/Patina/Patina.xcodeproj` |
| scheme / config | `Patina` / `Debug` |
| built .app | `/Users/kody/Code/patina-merged/artifacts/ios-daily-return-2026-08-26/.build/DerivedData/Build/Products/Debug-iphonesimulator/Patina.app` |
| bundle id | `cloud.patina.app` |
| build log | `/Users/kody/Code/patina-merged/artifacts/ios-daily-return-2026-08-26/.build/xcodebuild.log` (`** BUILD SUCCEEDED **`, exit 0) |
| signing | plain Debug simulator build. **No `CODE_SIGNING_ALLOWED=NO`** — entitlements intact, keychain healthy (July's securityd −34018 trap avoided) |
| device | iPhone 17 Pro · udid `973D1724-90BF-4A0A-B02D-481D561547B3` · iOS 26.5 |
| logical screen | **402 × 874 pt** (screenshots are 1206 × 2622 px @3×) |

Xcode-beta was **not** needed. The default toolchain built clean on the first attempt.

Build command (if you ever need to rebuild — unsandboxed):

```bash
xcodebuild build \
  -project /Users/kody/Code/patina-merged/apps/mobile/Patina/Patina.xcodeproj \
  -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=973D1724-90BF-4A0A-B02D-481D561547B3' \
  -derivedDataPath /Users/kody/Code/patina-merged/artifacts/ios-daily-return-2026-08-26/.build/DerivedData
```

---

## 2. Local stack

`supabase status` (unsandboxed, from `/Users/kody/Code/patina-merged`):

| | |
|---|---|
| API URL | `http://127.0.0.1:54321` |
| DB URL | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio | `http://127.0.0.1:54323` |
| Mail | **Mailpit** at `http://127.0.0.1:54324` — the `[inbucket]` config section is deprecated; the **Inbucket API shape 404s**, use the Mailpit API (§7) |
| anon key vs app | **matches** — the local-target literal hard-coded in `APIConfiguration.anonKey` (`.local` branch) is byte-identical to the `ANON_KEY` printed by `supabase status` |

`supabase_pooler_supabase` is stopped; nothing in this walk needs it.

---

## 3. How the app picks LOCAL vs cloud — and the proof it works

`Patina/Services/API/APIConfiguration.swift`:

```swift
public static var current: DeploymentTarget {
    if let override = UserDefaults.standard.string(forKey: "DeploymentTarget") {
        switch override {
        case "local": return .local
        default: return .cloud          // fails safe to CLOUD on any unknown value
        }
    }
    return .cloud                        // and the DEFAULT is CLOUD
}
```

`AppConfiguration.supabaseURL` / `.supabaseAnonKey` are thin forwards to `APIConfiguration`.
`AppEnvironment.current` is only `#if DEBUG` → `.debug`; it does **not** select the backend.
`Secrets.swift` exists (gitignored) and holds only the **cloud** Strata anon key + a PostHog key —
it plays no part in target selection.

**The override is the launch argument `-DeploymentTarget local`.** iOS folds launch arguments of
the form `-key value` into `UserDefaults`' `NSArgumentDomain`.

> ⚠ **NSArgumentDomain is volatile.** It applies to that launch only. Every single
> `simctl launch` — including every relaunch mid-walk — must repeat `-DeploymentTarget local`.
> Launch it once without the flag and the app silently talks to **Strata prod**.

> ⚠ Do **not** add `--uitesting`. It resets auth on every relaunch and makes feature flags fail
> closed.

### local_target_proof

With the app running under `-DeploymentTarget local`, local Kong logged the app's own requests
(note the `Patina/1 CFNetwork` user-agent and the `192.168.65.1` docker-gateway source, i.e. the
simulator reaching the host):

```
192.168.65.1 - - [26/Aug/2026:21:57:34 +0000] "GET /rest/v1/editorial_stories?select=*&order=sort_order.desc,published_at.desc&limit=1 HTTP/1.1" 200 1101 "-" "Patina/1 CFNetwork/3860.600.12 Darwin/25.5.0"
192.168.65.1 - - [26/Aug/2026:21:59:16 +0000] "GET /rest/v1/user_settings?select=user_id%2Cpush_notifications%2Cemail_notifications&user_id=eq.a0000000-0000-0000-0000-000000000005 HTTP/1.1" 406 131 "-" "Patina/1 CFNetwork/3860.600.12 Darwin/25.5.0"
```

The second line is post-sign-in and carries `client@patina.dev`'s **local** profile id
`a0000000-0000-0000-0000-000000000005` — a row that exists only in the local DB. Local target
proven both anonymous and authenticated.

Re-prove it yourself at any time:

```bash
docker logs supabase_kong_supabase --since 60s 2>&1 | grep "Patina/1" | tail
```

---

## 4. Launch, relaunch, reset

**launch_args** (the exact invocation — unsandboxed):

```bash
xcrun simctl launch 973D1724-90BF-4A0A-B02D-481D561547B3 cloud.patina.app -DeploymentTarget local
```

**Relaunch mid-walk** (device Home + cold start):

```bash
xcrun simctl terminate 973D1724-90BF-4A0A-B02D-481D561547B3 cloud.patina.app
xcrun simctl launch    973D1724-90BF-4A0A-B02D-481D561547B3 cloud.patina.app -DeploymentTarget local
```

There is no `simctl` Home-button verb; blitz has one —
`device_action{action:"button", params:{button:"HOME"}}` — but terminate+launch is what was
proven here.

**reset_recipe** — clean first launch (wipes the keychain session, guest flag, coach marks):

```bash
xcrun simctl terminate 973D1724-90BF-4A0A-B02D-481D561547B3 cloud.patina.app
xcrun simctl uninstall 973D1724-90BF-4A0A-B02D-481D561547B3 cloud.patina.app
xcrun simctl install   973D1724-90BF-4A0A-B02D-481D561547B3 /Users/kody/Code/patina-merged/artifacts/ios-daily-return-2026-08-26/.build/DerivedData/Build/Products/Debug-iphonesimulator/Patina.app
xcrun simctl status_bar 973D1724-90BF-4A0A-B02D-481D561547B3 override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4
xcrun simctl ui 973D1724-90BF-4A0A-B02D-481D561547B3 appearance light
# then launch with -DeploymentTarget local
```

**The status-bar override and the appearance do NOT survive a reinstall of the app but DO survive
app relaunch; they are per-device and were re-applied after the final reset.** Re-run both lines
after any `simctl erase`, and re-run the `appearance` line when switching the dark lane back.

Dark lane: `xcrun simctl ui 973D1724-90BF-4A0A-B02D-481D561547B3 appearance dark`
(then `light` to restore).

---

## 5. tap_method — **blitz**, calibrated

**Blitz taps deliver.** July's "blitz reads but taps don't land" trap did **not** reproduce.
Verified end to end: a blitz tap on `auth.welcome.guestButton` moved the app from the auth gate
(`s-01-first-launch.png`) to the guest Daily Room (`s-02-after-blitz-tap.png`).

Coordinates are **logical points in the 402 × 874 space** — exactly the `frame.x`/`frame.y` +
half the `width`/`height` that `scan_ui` returns. No scaling.

```
mcp__blitz-iphone__scan_ui        { udid: "973D1724-90BF-4A0A-B02D-481D561547B3", region: "full" }
mcp__blitz-iphone__scan_ui        { udid: "...", region: "full", query: "Sign in" }
mcp__blitz-iphone__describe_screen{ udid: "..." }                      # full tree incl. static text
mcp__blitz-iphone__device_action  { udid: "...", action: "tap",        params: {x: 201, y: 578} }
mcp__blitz-iphone__device_action  { udid: "...", action: "input-text", params: {text: "client@patina.dev"} }
mcp__blitz-iphone__device_action  { udid: "...", action: "swipe",      params: {fromX:201, fromY:700, toX:201, toY:300, duration:0.4} }
mcp__blitz-iphone__device_action  { udid: "...", action: "button",     params: {button: "HOME"} }
```

**Always pass the explicit `udid`. Never `"booted"`.**

The app's views carry stable `AXUniqueId`s (`auth.welcome.guestButton`, `auth.form.emailField`,
`DailyRoomView.BellButton`, `DailyRoomView.TodayNextMove`, `companion.intro.later`, …) — scan
first, tap the returned frame centre, never guess from a screenshot.

### type_method

`device_action{action:"input-text"}` — **proven**. Tap the field first, then type. Verified: after
tapping `auth.form.emailField` and typing, `scan_ui` reported
`AXValue: "client@patina.dev"` on that field. It uses HID events, so it works whether or not the
software keyboard is up.

### swipe

`device_action{action:"swipe"}` delivers (drag from a high y to a low y to scroll the page down).
Verified on the Daily Room: the swipe dismissed the "Step 1 of 2" coach mark and revealed the
content beneath (`s-03-after-swipe.png`).

### AppleScript fallback (calibrated, in case blitz degrades)

Simulator window origin `(800, 117)`, size `456 × 972`. **Content inset = (+27, +71)** from the
window origin, so `screen = (winX + 27 + pt_x, winY + 71 + pt_y)`. Proven: a click computed this
way on `DailyRoomView.BellButton` (pt 280, 136 → screen 1107, 324) opened
"Notifications / Nothing yet" (`s-06-applescript-tap-test.png`).

Helper scripts (all executable, all take **logical points**):

| script | use |
|---|---|
| `shots/_geom.sh` | prints `WINX WINY 27 71` — **re-run if the Simulator window is moved** |
| `shots/_tap.sh <x_pt> <y_pt>` | AppleScript click |
| `shots/_shot.sh <name>` | `simctl` screenshot → `shots/<name>.png` (name without `.png`) |
| `shots/_type.sh "<text>"` | AppleScript keystroke into the frontmost Simulator window |
| `shots/_swipe.sh` | **not usable** — System Events cannot express a reliable drag. Use blitz `swipe`. The script says so and exits. |

### Screenshots

```bash
xcrun simctl io 973D1724-90BF-4A0A-B02D-481D561547B3 screenshot /Users/kody/Code/patina-merged/artifacts/ios-daily-return-2026-08-26/shots/<lane>-<NN>-<slug>.png
```

or `shots/_shot.sh <lane>-<NN>-<slug>`. **Always `Read` the PNG afterwards to confirm it rendered
what you think it did** before moving on. `xcrun simctl io … screenshot` prints a harmless
`Note: No display specified…` line — ignore it.

---

## 6. Walk accounts (local DB, seeded — do not create data)

Password for **every** seeded account below: **`password123`**
(`supabase/seed/dev-accounts.sql`, `supabase/seed/leads_room_scans.sql`).

### (a) activeProject tier — **`client@patina.dev`**

`a0000000-0000-0000-0000-000000000005` · "Client User" · role `homeowner` · email confirmed.

| | |
|---|---|
| projects | 3 — **Aspen Loft Refresh** (`active`, 2 project_rooms, 3 project_tasks), **Marrow & Vale Residence** (`active`), **Birch Hollow** (`completed`) — all `client_visibility_tier = milestone` |
| proposals | 4 — "Sample accepted proposal" (`accepted`, $100,000.00), "Aspen Loft — Living Room Refresh" (`sent`, $18,500.00), 2 × `draft` |
| **signed proposals** | **0** — there is no signed proposal in this local DB for any client |
| invoices | **0** |
| rooms / room_scans / saved_items / companion_conversations | **0** each |
| decisions | Today surfaces "**2 decisions need your eye**" / "**2 PROJECT DECISIONS WAITING**" |

Post-sign-in Today for this account reads: `WEDNESDAY · AUG 26` / `Today`, Next Move = "**Review a
project decision** — 2 decisions need your eye." (`s-05-signed-in-client.png`).

### (b) engaged tier — **`james.okafor@example.com`**

`28fd9d2c-4961-446b-afec-b2084ba0a647` · "James Okafor" · role `homeowner` · email confirmed.
Lead `c0c863fd-673d-407f-91a9-80e3d1c35b93`, status **`accepted`**, **claimed** (designer_id set),
1 `lead_room_scans` row, created 2026-08-18. **No project, no proposal, no invoice.** This is the
best "matched but not yet a project" account.

Other engaged homeowners if you need variety (all claimed, 1 scan each, `password123`):
`marcus.wright@example.com` (`viewed`), `elena.ruiz@example.com` (`contacted`),
`sarah.chen@example.com` / `lily.tanaka@example.com` / `david.nielsen@example.com` (`new`).
`arrival-arc-b-…@e2e.patina.test` is `accepted`/claimed but has no scan.

### Guest lane

Tap **"Look around first"** (`auth.welcome.guestButton`) on the gate.
⚠ **Guest state does NOT survive a relaunch** — after any terminate+launch you land back on the
auth gate (`s-04-relaunch-guest-persist.png` shows the gate again). Re-tap it each time.

---

## 7. Sign-in methods, and how to sign in

The gate (`AuthScreenView`) offers, verbatim: **"Sign in with Apple"**, **"Continue with Google"**,
**"Continue with email"**, **"Look around first →"**, **"Have a password? Sign in"**.

`AuthService` implements: password (`signIn`), email OTP / magic link (`sendMagicLink` +
`verifyOtp`), Apple, Google.

### ✅ Use password. It is proven.

1. tap `auth.welcome.passwordButton` ("Have a password? Sign in") → the sheet with
   `auth.form.emailField`, `auth.form.passwordField`, `auth.form.primaryButton` ("Sign In")
2. tap `auth.form.emailField`, `input-text` the address
3. tap `auth.form.passwordField`, `input-text` `password123`
4. tap `auth.form.primaryButton`

> ⚠ **Immediately after a successful sign-in iOS throws a system "Save Password?" sheet**
> ("Securely store your password so it's filled automatically the next time you need it.")
> over the Daily Room — see `s-05-signed-in-client.png`. It is **not** an app screen and must not
> be logged as a defect. Dismiss it with **"Not Now"** at logical point **(127, 546)**, then take
> your real screenshot. Take it before your first content shot or it will photobomb the walk.

Apple and Google sign-in are not usable on this simulator.

### ⚠ OTP / magic link — do NOT plan a walk around it

`POST /auth/v1/otp` succeeds (`200`) and Mailpit receives the mail, but the local template
("Your sign-in link") contains **only a `token=` link — no 6-digit code**:

```
Sign in ( http://127.0.0.1:54321/auth/v1/verify?token=bf1d…5c0678b&type=magiclink&redirect_to=http://127.0.0.1:3000 )
```

That `token` is the `auth.one_time_tokens.token_hash`; the plaintext 6-digit code the app's
"Enter code instead" panel wants is never emailed and is not recoverable from the DB. The link
also redirects to `localhost:3000` (the web portal), not into the app. **The in-app OTP entry
path cannot be completed from the local stack** — record that as an environment limitation if the
walk touches it, not as an app bug.

Mail commands, if you need them anyway (Mailpit, **not** Inbucket):

```bash
# latest message (headers)
curl -s "http://127.0.0.1:54324/api/v1/messages?limit=1"

# full body of the latest message + any 6-digit code / token
ID=$(curl -s "http://127.0.0.1:54324/api/v1/messages?limit=1" | python3 -c "import sys,json;print(json.load(sys.stdin)['messages'][0]['ID'])")
curl -s "http://127.0.0.1:54324/api/v1/message/$ID" | python3 -c "
import sys,json,re
d=json.load(sys.stdin); t=(d.get('Text') or '')+' '+(d.get('HTML') or '')
print('CODES:', re.findall(r'\b\d{6}\b', t))
print('TOKEN:', re.findall(r'token=([A-Za-z0-9_-]+)', t)[:1])
print(d.get('Text','')[:400])"
```

---

## 8. Known-bad local environment (pre-existing — do NOT report these as app defects)

1. **Every Supabase edge function returns 503 locally.** The edge runtime fails to boot any
   worker: `worker boot error: failed to bootstrap runtime: failed to determine entrypoint`
   / `InvalidWorkerCreation`. Confirmed for `companion-context`, `companion-message`,
   `morning-brief`, `apns-send` — i.e. all of them, not one bad function.
   **Consequence for the walk: anything Companion-backed is dead.** The app retries
   `POST /functions/v1/companion-context` aggressively (≈10 calls in 15 s after sign-in) and will
   show empty/failed Companion state. Log the *UX of the failure* if you like, but attribute the
   cause to the local runtime.
2. `GET /rest/v1/user_settings?…` and `GET /rest/v1/notification_preferences?…` return **406** for
   `client@patina.dev` — no row exists and the client asks for a single object. Cosmetic; may
   surface as default settings.
3. `pg_net` cron traffic to `/functions/v1/*` is constantly 503 in the Kong log for the same
   reason. Filter with `grep "Patina/1"` to see only the app.

---

## 9. State the simulator was left in

- iPhone 17 Pro `973D1724-90BF-4A0A-B02D-481D561547B3` — **Booted**, Simulator.app open
- `Patina.app` (`cloud.patina.app`) **installed**, container
  `…/Devices/973D1724…/data/Containers/Bundle/Application/70138E78-23AA-421C-9504-D8A45F17E7BB/Patina.app`
- **uninstall+install already done → the app has never been launched since; the next launch is a
  clean first launch.** It is *not* running.
- status bar overridden to 9:41 / charged / 100% / wifi 3 / cellular 4; appearance **light**
- First thing you should run:
  `xcrun simctl launch 973D1724-90BF-4A0A-B02D-481D561547B3 cloud.patina.app -DeploymentTarget local`
