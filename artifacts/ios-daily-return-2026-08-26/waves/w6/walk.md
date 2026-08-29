# W6 — Acceptance walk

Walker (Sonnet) · review device **`973D1724-90BF-4A0A-B02D-481D561547B3`** (iPhone 17 Pro),
2026-08-28/29. Installed the already-built, already-signed product from the integration worktree's
own local derived-data path — the same binary `waves/w6/integration.md` gated, not a fresh build:

```
.codex/worktrees/agent-dr-w6-integration/apps/mobile/Patina/.build/dd/Build/Products/
  Debug-iphonesimulator/Patina.app   (carries PatinaWidget.appex in PlugIns/)
xcrun simctl install 973D1724-90BF-4A0A-B02D-481D561547B3 <path>   # exit 0
```

`-DeploymentTarget local` on every launch, as required. Account already signed in on this device
from the W5 walk (`client@patina.dev`), so no fresh sign-in was needed — the record's own screen
confirmed the identity throughout (Leah Hartwell / Aspen Loft Refresh, INV-2026-0142's $4,250.00
due Sep 2, the same MOVED rows W5/W6 integration recorded).

## ⚠ Gesture delivery failed mid-walk — governs several results below

The very first long-press (on the Patina Home Screen icon) worked and entered jiggle mode
(`Edit`/`Done` drawn, screenshot confirmed). The very next tap — on `Edit`, meant to reach the
widget-add menu — instead **exited** jiggle mode with no menu ever drawn, and from that point
**no further `mcp__blitz-iphone__device_action` call landed on the device**: not `tap` (tried on
five different UI targets across three screens: the Patina icon at three durations, an app-icon
plain tap, the `Daily Room`'s `See all` row, the `Your invoice is due` row, the notifications
bell), not `swipe`, not `button: HOME` after the first two. Every call returned a success string
(`"Tapped at (x, y)"`) and every following screenshot showed the screen unchanged. `simctl launch`
from the host (not a gesture) reliably foregrounded/backgrounded the app throughout, proving the
simulator itself stayed responsive — the failure is specifically blitz's WDA-backed input delivery
to this udid, not a frozen device. This is the same class of failure X1's own lane hit
independently on a sibling clone (`w6/x1-notes.md`, "long presses stopped delivering to
SpringBoard"), except broader here (plain taps too, not only long-presses).

Per the wave's rule ("if gestures stop delivering, stop and report — do not improvise with desktop
tooling"), no AppleScript or other desktop-tooling substitute was used. Retries: ~9 across ~15
minutes, spanning both flag states and both roots, before stopping. Where a gesture was required
and none landed, the item below is **BLOCKED**, with this paragraph as the reason.

**Substitute method used where it does not require an on-screen tap**: `xcrun simctl openurl
<udid> "patina://…"` invokes the exact same `DeepLinkHandler` code path a real widget tap or
Lock-Screen tap would (`.onOpenURL`, then `route(forWidgetLink:in:)`) — it is the OS's own
URL-scheme delivery mechanism, not a screen-capture or coordinate-clicking workaround, so it stays
inside the wave's evidence rules. It cannot substitute for adding the widget to a Home Screen or
Lock Screen, which needs the jiggle-mode gesture chain end to end.

## Items

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Install + launch `-DeploymentTarget local -PatinaFlags house-widget` | **PASS** | `simctl install` exit 0; `simctl launch` pid 52323; `shots/w6-01-flagon-launch-dailyroom.png` — Daily Room draws NEEDS YOU ×3 + MOVED ×2 + `See all`, Leah's seat, `YOUR HOUSE` rail. No tab bar (W2 root — correct, `house-first` not set) |
| 1b | Launch once with `house-first` too | **PASS** | `-PatinaFlags house-widget,house-first`; `shots/w6-04-flagon-housefirst-launch.png` — same content, now under the W3 root: tab bar `Today · Spaces · Pieces · Studio` + Companion slot |
| 2 | Open the app so a record saves | **PASS** | App Group container `11192F24-DF96-4E56-81A9-1759F1B189F1/` on this device holds both `house-record.json` and `widget-snapshot.json`, `widget-snapshot.json` timestamped to this session's launch (`refreshedAt: 2026-08-29T00:55:02Z`), not a leftover from an earlier wave |
| 3 | Add the small widget to the Home Screen (long-press → + → Patina) | **BLOCKED** | Gesture delivery failure, above. Jiggle mode was reached once; the widget-add menu was never reached before gestures stopped landing |
| 4 | Add the Lock Screen rectangular accessory, if the simulator allows | **BLOCKED** | Same cause — Lock Screen customization needs the identical long-press/jiggle chain via Control Center's lock-screen editor, unreachable for the same reason. Whether *this* simulator/runtime can present that editor at all was never established either way |
| 5 | Widget shows up to two MOVED rows with dates and the house line, no counts | **PASS at the data-contract level; BLOCKED as rendered pixels** | `widget-snapshot.json` (flag-on): `movedRows` = exactly the two MOVED rows (`Meadow Linen Sectional arrived.` / Aug 28, `A new story from the workshop.` / Aug 27), `houseLine: "Guest Bedroom"` (the rail's first card, matching the screen), `sinceDate` present (→ M6b's `SINCE THU` copy is reachable, per X1). `grep -ioE "needsYou\|badge\|count\|pending\|awaiting\|isNew"` over the file → **no match** — the honesty rule holds structurally on the artefact the widget would read. Cannot confirm the actual `.systemSmall` view draws this without the widget on a Home Screen (item 3) |
| 6 | Tap a row → the app opens on the row's route, on the right tab (both roots) | **PASS, via the substitute method** | `xcrun simctl openurl … "patina://record/order:fulfillment:f5000000-…-000000000001"` (the top MOVED row's id, from the snapshot): under `house-widget` only → `shots/w6-03-…house-widget-only.png`, Order-detail screen for "Meadow Linen Sectional", rail at **Delivered**, back chevron, no tab bar (W2 root has none — correct). Under `house-widget,house-first` → `shots/w6-05-…housefirst.png`, identical screen with the tab bar visible and **`Studio` bolded/selected** — the right tab per `RouteTabTable.tab(for: .orderDetail) == .studio`. Bonus check: the second MOVED row (`story:…`, no `route` in `house-record.json`) → `patina://record/story:…` correctly fell back to `.heroFrame` (Today) rather than dead-ending — `shots/w6-07-…fallback-heroframe.png` |
| 7 | Relaunch without `house-widget` → the widget shows the placeholder | **PASS at the data-contract level; BLOCKED as rendered pixels** | `-PatinaFlags none` relaunch; `widget-snapshot.json` re-written with `flagOn: false` (`shots/w6-06-flagoff-dailyroom.png` for the app screen). Per X1's decoder (`x1-notes.md` §1), `flagOn` false/absent draws the placeholder and never a row — verified on the file the widget would read, not on a rendered widget (item 3 blocks that) |
| 8 | Set the due-date reminder on INV-2026-0142 → the row shows the date → remove it | **BLOCKED** | Requires navigating to invoice detail and tapping the reminder affordance (`InvoiceReminderRow`) — no non-gesture path exists (no debug launch-arg deep-link hook in `PatinaApp.swift`/`AppDelegate.swift`; the custom URL scheme has no `invoice` host, only universal `https` links do, and those are not locally verifiable via `simctl openurl` without AASA). Gesture delivery failure above blocks this entirely |
| 9 | Dark + XXL on the widget, if the gallery renders them | **BLOCKED** | Same root cause — the widget gallery itself was never reached |
| — | Leave state: signed in as `client@patina.dev`, flags off, on the Daily Room | **PASS** | `-PatinaFlags none` launch; `shots/w6-08-leavestate-flagoff-client-daily-room.png` |

## What this walk does and does not prove

**Proven, with evidence:** the app saves the widget's data source on open; that source is
structurally honest (no `needsYou`, no count, no badge, no "new" flag reachable, per grep, matching
Q8/C5/B§4); the house line and up to two dated MOVED rows are the only content in it; the
`flagOn` mirror flips correctly with the launch flag; the deep-link resolution a widget tap would
trigger (`route(forWidgetLink:in:)`) correctly reaches the row's real destination and lands on the
correct tab under both the W2 and W3 roots, and correctly falls back to Today for a row with no
route rather than dead-ending.

**Not proven this walk, and why:** the widget as rendered pixels on a Home Screen or Lock Screen
(gesture delivery failed before the gallery was ever reached); the invoice reminder end to end
(same cause); dark/XXL widget-gallery variants (same cause). These are the same class of gap
`waves/w6/integration.md` §5 already named as unclosed ("No device claim is made… a real widget
rendering on a Home Screen or Lock Screen" was not verified there either, for a different reason —
this walk's blocker is tooling, not a code defect). Nothing here contradicts or supersedes X1's own
sim-verified/compile-green claims for the widget's drawing code and the deep-link table
(`PatinaTests`, `HouseWidgetPayloadTests`) — this walk adds one more independent proof of the
deep-link table (item 6) on top of those, and narrows what remains genuinely unverified to: the
widget gallery add flow itself, dark/XXL rendering, and the invoice reminder UI — all of which need
either a working gesture-input path back to this simulator or a physical device.

## Claim level

**Item 2, 6: sim-verified** (item 6 via the OS's own URL-scheme delivery, not a screen tap).
**Item 5, 7: data-contract verified, not pixel-verified.** **Items 3, 4, 8, 9: unverified —
BLOCKED, tooling failure, not a product finding.** No device claim anywhere in this walk, matching
the wave's own stated scope.

## Data written by this walk, disclosed

- No new `auth.users`/`profiles`/`comms_*` rows — no sign-up, no message sent (nothing in this walk
  reached a screen with a send affordance).
- `widget-snapshot.json` was rewritten several times by ordinary app launches (each carries the
  same real data, differing only in `refreshedAt` and `flagOn`); `house-record.json` was not
  touched by this walk beyond being read.
- No secret value was read, printed, or written.

## Leave state

Signed in as `client@patina.dev`, flags off, on the Daily Room — `shots/w6-08-leavestate-flagoff-client-daily-room.png`.

## Worktrees / simulators — untouched by this walker

Per role, this walker made no git writes and did not retire any worktree or simulator clone.
Everything `integration.md` §7 listed as "still standing" (`agent-dr-w6-{x1,x2,x3,integration}`,
`dr-w6-{x1,x2,x3,int}`) is untouched. The review device `973D1724-…` had the integration `.app`
installed over whatever was there before (no uninstall step was needed or taken) and is left in the
state described above.

---

## walk 2 — X3

Walker (Sonnet), 2026-08-28/29, same review device **`973D1724-90BF-4A0A-B02D-481D561547B3`**.
Scope: the W6 session-isolation items X3 shipped in `integration.md` §9 (X3 landed as
`9a8af5d28`, tip `f48e11d20`, 17 commits ahead of `main`) — the item(s) walk 1 did not cover
because X3 had not yet landed when walk 1 ran. Keeping walk 1's verdicts unchanged above; this
section adds X3's items only. All gestures via `mcp__blitz-iphone__device_action` (explicit udid);
all evidence via `xcrun simctl io <udid> screenshot`; no desktop capture at any point.

Installed the same signed product `integration.md` §9.4 gated, from the integration worktree's own
`ddapp` derived-data path (a plain `build`, not the test action's product):

```
.codex/worktrees/agent-dr-w6-integration/apps/mobile/Patina/.build/ddapp/Build/Products/
  Debug-iphonesimulator/Patina.app
xcrun simctl install 973D1724-90BF-4A0A-B02D-481D561547B3 <path>   # exit 0
xcrun simctl launch  973D1724-90BF-4A0A-B02D-481D561547B3 cloud.patina.app -DeploymentTarget local
```

**Deviation, disclosed:** the fresh `simctl install` reset the app container — the device came up
at the Welcome/Sign In screen rather than walk 1's left-behind signed-in state (`w6-09`). Session
state (GoTrue-backed) does not survive a container reset; this is expected and not a defect. Signed
back in as `client@patina.dev` / `password123` via the ordinary email/password form (`w6-10`) to
re-establish the baseline before running the script.

### Items

| # | Item | Result | Evidence |
|---|---|---|---|
| 10 | Sign in `client@patina.dev` → Today matches the pre-existing baseline | **PASS** | `w6-10-client-today-before-switch.png` — NEEDS YOU ×3 (invoice `$4,250.00` due Sep 2 · Leah's proposal by Sep 11 · the Dining chairs decision), MOVED ×2, seat `Leah Hartwell, Aspen Loft Refresh` — identical to `integration.md` §9.5's recorded content |
| 11 | Settings → Sign Out | **PASS** | Scrolled Studio → Settings (`SettingsView.SignOutButton` reachable, SP-20 confirmed live) → confirm → back at Sign In (`w6-11-signed-out.png`) |
| 12 | Sign in `james.okafor@example.com` / `password123` | **PASS** | `w6-12-james-signed-in.png` — "Save Password?" sheet dismissed (Not Now); James's own Today draws underneath: `Awaiting you 0`, `In progress 0 — You're matched with Leah Hartwell — No active projects yet.` |
| 13 | Today/Studio/Companion carry James's data only — no `"Aspen Loft"`, `"Birch Hollow"`, `"Marrow"` | **PASS** | `scan_ui` full-tree dumps of James's Today (`DailyRoomView.HouseRecord` = `"Nothing needs you right now."` / `"Leah Hartwell picked up your request. Aug 28."` / the story; seat = `"Leah Hartwell, Leah Hartwell · Designer matched"`) and Studio (`w6-13-james-studio.png` — 0 rooms, 0 saved, "Nothing needs your attention right now.") — none of the three forbidden strings appear anywhere in either accessibility tree or screenshot |
| 14 | Ask Leah to source this (from a piece, as James) → lands in James's own thread, no error | **PASS** | Relaunched with `-PatinaFlags house-first` (`w6-14-james-housefirst.png`) to reach the Pieces tab (the flag-off root has no piece browse from Today); opened **Live-Edge Coffee Table** ($2,100, Heritage Lumber — a different piece than walk 1 used, since the originally-referenced piece was off-screen; functionally equivalent), tapped `Ask Leah to source this` → sheet pre-filled `"Can we use the Live-Edge Coffee Table?"` → Send → button state flips to `Sent`, caption `"Leah has the piece and the price."`, no error sheet (`w6-15-james-ask-leah-sent.png`) |
| 14b | psql confirms | **PASS** | `comms_messages` row `9dc34da3-…` on `thread_id 85016582-cf6e-4489-9734-c3613906a5fc` (James's pre-existing direct thread, no `project_id` — correct for a lead-only relationship), body `"Can we use the Live-Edge Coffee Table?\n\nLive-Edge Coffee Table · $2,100.00 · Heritage Lumber"`, `created_at 2026-08-29 03:33:10` — a new message in the existing thread, not a new thread row |
| 15 | Settings → Sign Out (James) → sign in `client@patina.dev` | **PASS** | Same reachable path (`SettingsView.SignOutButton` → confirm → Sign In form → `client@patina.dev` / `password123`) → `w6-16-client-back-signed-in.png` — Client User, `5 things need your eye`, `Decisions` overdue Aug 24, `Invoice $4,250.00 remaining` — the account's own data, undisturbed by James's session in between |
| 16 | The Ask thread from a piece (as client) lands on the project carrying the open NEEDS YOU items | **PASS** | Still under `-PatinaFlags house-first` from step 14's relaunch; opened **Oak Reading Chair** ($1,550, Nordic Atelier) from Pieces, `Ask Leah to source this` → `"Can we use the Oak Reading Chair?"` → Send → `Sent` / `"Leah has the piece and the price."` (`w6-17-client-ask-leah-sent.png`) |
| 16b | psql confirms | **PASS** | New `comms_messages` row on `thread_id 32fdec87-a6a6-42a0-a21e-55edf587246b`, which `comms_threads` carries `project_id = b0000000-…-d1` = **`Aspen Loft Refresh`** — the same project the seat names and every NEEDS YOU row belongs to (the invoice, the proposal, the Dining-chairs decision). Confirms `x3-review.md` MJ-1/the project rule holds live, not just in `DesignerProjectRuleTests`: the Ask thread does **not** land on `Birch Hollow` (the `.first`-by-`updated_at` project W5's walk hit), it lands on the urgent one |
| 17 | From the Studio tab, background (another app) then relaunch → `widget-snapshot.json`'s `refreshedAt` advanced | **PASS** | On the **Studio** tab (not Today) — `w6-18-studio-foreground-refresh.png` confirms the tab still selected after the round trip. `xcrun simctl launch … com.apple.mobilesafari` (backgrounds Patina) → `xcrun simctl launch … cloud.patina.app` (same pid `2188` — a real foreground, not a fresh process) → `widget-snapshot.json`'s `refreshedAt` advanced **`2026-08-29T03:36:04Z` → `2026-08-29T03:39:03Z`** (mtime `22:36:04` → `22:39:03` local) while Studio, not Today, was on screen. Confirms `integration.md` §9.2 / X3's `RecordForeground` fix: the rebuild now fires from the app root (`PatinaApp`'s `scenePhase`), not only from `DailyRoomView`'s hook |
| — | Leave state: signed in as `client@patina.dev`, flags off, on the Daily Room | **PASS** | Relaunched `-PatinaFlags none` → W2 root (no tab bar, floating Companion orb, `Studio 5` pill), the Record draws the same NEEDS YOU/MOVED content, Leah's seat with Message — `w6-19-leavestate-flagoff-client-daily-room.png` |

No item in this pass required the tap-only gesture path that failed in walk 1 (item 3/4/8/9's
Home-Screen widget gallery and the invoice-reminder affordance are not part of X3's brief), so
nothing here needed the `simctl openurl` substitute or a BLOCKED-HARNESS mark — every `device_action`
call in this pass landed and every `describe_after` reflected the expected post-tap state.

### What this pass proves, on top of walk 1

**Proven, with evidence (app + psql, not just unit tests):** the in-process A→B→A account switch
shows no cross-account leakage on the surfaces this walk can reach without the blocked gesture path
(Today, Studio, the Ask-designer flow) — James's Today/Studio never render `"Aspen Loft"`,
`"Birch Hollow"`, or `"Marrow"`, and returning to `client@patina.dev` shows the account's own five
items intact; Sign Out is reachable from both accounts (SP-20); an Ask-designer send from a lead-only
relationship (James) lands in that person's own direct thread with no project, and from a
project-holding relationship (the client) lands on the project actually carrying the open NEEDS YOU
items — matching the seat, not `.first`-by-`updated_at`; the widget's data source now refreshes on a
foreground from a non-Today tab, closing the gap `integration.md` §6.2 named.

**Consistent with, not itself proof of, MJ-1's sub-task-hop window:** this walk's account switches
went through Settings → Sign Out → the ordinary Sign In form each time, not the in-process
`patina://auth/callback` deep-link hand-off `x3-fix-log.md`'s MJ-4 evidence used — so it exercises
the same `AuthService.applySession` seam but does not by itself distinguish "reset ran before the
first paint" from "reset ran a task hop after." That distinction stays where `x3-review.md` and
`x3-fix-log.md` left it: `theSessionMovesInOnePlace` (unit-verified) plus `x3-fix-log.md`'s own
sim pass (`w6-x3f-03` through `-06`, the deep-link hand-off).

### Claim level

**Items 10–17: sim-verified**, including two psql-confirmed server-side facts (14b, 16b). No device
claim. Nothing here supersedes or contradicts walk 1's verdicts on items 1–9 — those stand as
recorded above.

### Data written by this walk, disclosed

- Two new `comms_messages` rows, both in **pre-existing** threads (no new `comms_threads` row):
  James's `"Can we use the Live-Edge Coffee Table?"` on `85016582-…`; the client's `"Can we use the
  Oak Reading Chair?"` on `32fdec87-…` (`Aspen Loft Refresh`).
- No new `auth.users`/`profiles` rows — both accounts pre-existed. No deletions, no purges.
- `widget-snapshot.json` and `house-record.json` were rewritten several times by ordinary
  sign-in/sign-out/foreground cycles (same real data each time, differing in `refreshedAt`/`flagOn`).
- No secret value was read, printed, or written.

### Leave state

Signed in as `client@patina.dev`, flags off, on the Daily Room —
`w6-19-leavestate-flagoff-client-daily-room.png`.

### Worktrees / simulators — untouched by this walker (walk 2)

No git writes. No worktree or simulator clone retired. The review device `973D1724-…` had the same
`ddapp` build reinstalled over whatever was there (no separate uninstall step) and is left in the
leave state above.
