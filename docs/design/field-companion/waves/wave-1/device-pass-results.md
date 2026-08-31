# Field Companion — Waves 1 + 2 device pass · results

**Run** 2026-08-25, on `695addb5f` (Waves 1+2 merged).
**Device** Kody's Phone, iPhone 17 Pro Max (`iPhone18,2`), **iOS 27.0** (`24A5424a`), LiDAR, USB, Developer Mode on.
**Build** signed Debug, team `VP22LXHT7L`, bundle `cloud.patina.field`, real mode (physical device ⇒ `runsRealServices`).
**Toolchain** Xcode **27.0** (`27A5194q`) via `DEVELOPER_DIR=/Applications/Xcode-beta.app/...` — see §1.
**Worktree** `.claude/worktrees/field-companion-devpass` (build only; nothing committed).

Claim ladder per `patina-ios-verification`: **compile-green < sim-verified < device-verified.**
An assertion not personally observed is **NOT EXERCISED**. It is never written PASS.

---

## 1. Two blockers cleared, and what actually caused the second

Waves 1 and 2 both died at *"the developer disk image could not be mounted"* — both phones were
paired **wifi-only**. Moving to **USB** cleared that: the signed Debug build, install and launch all
succeeded, and the app is running on the phone.

UI automation then failed six more times with `Timed out while enabling automation mode`. That was
**not** Kody's UI Automation toggle, not the lock screen, and not a wedged daemon (it survived a
full reboot). The cause was a **toolchain/OS mismatch**:

| | Version |
|---|---|
| Phone | iOS **27.0** (`24A5424a`) |
| `xcode-select` default | Xcode **26.6** — only iOS SDK **26.5** installed |
| Also present, unused | `/Applications/Xcode-beta.app` = Xcode **27.0**, iOS SDK **27.0** |

Corroborated twice per run by `DVTDeviceOperation: Encountered a build number "" that is
incompatible with DVTBuildVersion` — Xcode 26.6 cannot parse this OS build. Building, installing and
launching are backwards-compatible and worked; XCTest's automation-mode handshake is a newer
host↔device contract and did not.

**Fix, no download needed:** run every device command under Xcode 27, and override WDA's deployment
target (its project targets iOS 13.0, which Xcode 27 rejects — minimum 15.0):

```
export DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer
xcodebuild build-for-testing -project .../WebDriverAgent.xcodeproj -scheme WebDriverAgentRunner \
  -destination 'generic/platform=iOS' -derivedDataPath /Users/kody/.blitz-iphone-mcp/wda-build \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=VP22LXHT7L IPHONEOS_DEPLOYMENT_TARGET=15.0
```

WDA then came up (`ServerURLHere->http://192.168.1.69:8100`) and blitz attached. `sudo xcode-select`
was never needed — `DEVELOPER_DIR` sufficed for both my commands and the MCP server's.

⚠ **Operational note for anyone repeating this:** WDA binds to the phone's **WiFi** address, so
enabling **airplane mode severs automation**. It is recoverable (restart WDA, re-attach), but any
offline assertion has to be planned around it.

### Build-input defect found before the run

`Secrets.xcconfig` **does not exist in the repo**, and `Secrets.swift` ships
`postHogAPIKey: String? = nil`. With those inputs `AppConfiguration.postHogAPIKey` resolves empty,
`PostHogCaptureAnalytics.isEnabled` returns false, and **every analytics call is a silent no-op** —
steps 35/36 and W2-5 would have read as failures caused by configuration, not code.

Corrected in the worktree only (gitignored, uncommitted) by writing `Secrets.xcconfig` with the
project key already used by `apps/mobile/Patina` and the portals; verified it reached the binary
(`PlistBuddy -c "Print :POSTHOG_API_KEY"` → `phc_D6Rf…`).

⚠ **This is a live gap, not a worktree artifact.** Any device or TestFlight build cut from the repo
as it stands today ships with analytics disabled. FC-R14 built the xcconfig route precisely so the
key survives an archive — but the file carrying the key is absent.

---

## 2. Results

### Wave 2

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Four real objects → four different categories, each badged as a read, no invented material | **PARTIAL** | The reader demonstrably **reads a real frame**: pointed at a wooden floor/desk it returned category **`Table`**, badged **GUESS**, with `MATERIAL —` (nothing invented). Shot: `device-pass-shots/C3-card-guess-table.png`. The category also survived to the server (`category = "table"`, §2 step 34). **Four distinct objects still needs Kody** — I cannot aim the phone. The "all four come back `seating`" failure mode is partly de-risked (it did not return `seating`). |
| 2 | Wall defect → no category recorded; S3 recommends Inbox | **PARTIAL** | **S3 renders on device** — the screen Wave 2 called "app-side SwiftUI, unreachable under C1", so never before exercised at any level. For a capture carrying an unconfirmed guess it badges **"Inbox — finish later" RECOMMENDED**, with Library unbadged. Shot: `S3-destination.png`. **The wall-defect half (no category at all) needs Kody.** |
| 3 | Four pills — PHOTO · TAG · MEASURE · SCAN — no VOICE; swipe cycle never lands on a fifth | **PASS** | Mode row read on device: exactly four, no VOICE. Swiped four times: PHOTO → TAG → MEASURE → SCAN → **PHOTO**, a complete wrap with no fifth state. Shots: `pills-s1..s4`. |
| 4 | Live Activity starts, updates and ends across the widened `ContentState` | **NOT EXERCISED** | Needs a sustained sync with something queued; the offline path is compromised by §3. |
| 5 | Reference-capture cover renders + `screen.F1.context` reaches PostHog | **PASS**, with caveat | Render: `W2-5-F1-context.png` — live camera, headline *"Photos & notes for this room."*, body *"These reach the studio as soon as you have signal — they're notes, not a scan."*, Photo + Done controls. Telemetry: `$screen` / `screen.F1.context` at `2026-08-25T14:02:31.726Z`, `$os_version 27.0`. ⚠ Caveat: reached via the `-CaptureScreen F1.context` harness, and the eyebrow *"THIS IPHONE CAN'T MEASURE A ROOM."* is **static** (`Text(...)`, unconditional) — so the **organic no-LiDAR trigger is unproven**; that needs a genuinely LiDAR-less device. |

### Wave 1

| # | Assertion | Result | Evidence |
|---|---|---|---|
| — | Signed Debug device build, signing ON | **PASS** | `Apple Development: Kody Kochaver (BD8AHP9A59)`, profile `iOS Team Provisioning Profile: cloud.patina.field`, `** BUILD SUCCEEDED **`. Not a `CODE_SIGNING_ALLOWED=NO` gate build. |
| — | Installs and launches on device | **PASS** | `devicectl install` + `process launch`; `Application Opened` in PostHog. |
| 23 | Shutter → card → placement → project → room → Done lands back on the **live camera with the card still visible**, showing the placed name | **PASS** | `step23-placed-card.png`. Landed on the live camera, card up, line now `Test Walker · Living`. Not S4, not S5, not a bare viewfinder. **Tap count: 7** (shutter, placement line, project dropdown, project, room dropdown, room, Done). |
| 24 | Card label updates without a manual refresh | **PASS** | Same shot — line changed from terracotta *"Not placed — tap to place"* to dark `Test Walker · Living` with no refresh. |
| 27 | Next capture in the session shows a non-terracotta label on ITS card without a second trip through S1 | **PASS** | `step27-inherited-placement.png` — second capture's card already read `Test Walker · Living` in dark ink. `stamped(onto:)` reaches the render path. |
| 28 | S1 from the deep-link harness / S2 / tray — none may show the "Done" primary | **PASS (2 of 3)** | **Tray** entry: buttons are `Choose destination` only, **no Done**. **Harness** (`-CaptureScreen S1.assign`): same, no Done. Contrast the **card** entry, which correctly *does* expose `Done` (`AXValue "1"`). `step28-tray-no-done.png`. **S2 not exercised** — it needs creating a project in prod, which I declined to do. |
| 29 | Tray footer reads "Place N" with unplaced records; tapping opens exactly ONE record; bulk routing must NOT have shipped | **PASS** | With 2 unplaced: footer read **"Place 2"** (`step29-tray-place2.png`). Tapping opened a **single** "Route this capture" form — no multi-select, no bulk UI. Also observed: with an **empty** session the footer reads *"Review this session"*, a third state the spec does not mention. |
| 30 | Airplane mode → banner within a second showing **OUTBOX depth**, not session count | **PASS** | `step30-offline-banner.png` — *"No signal · saving on device"* with the outbox chip reading **0**, while the session held several already-synced captures. Exactly the pre-fix failure mode the spec warns about (must not echo the session count). |
| 31 | Capture offline → restore signal → queue drains with no tap | **FAIL / confounded** | The offline-committed capture **never reached the server**, before or after signal returned. But I relaunched the app between commit and reconnect, and §3 shows a relaunch destroys queued work — so this is **not a clean read on the drain path**. Recorded as unresolved, not as a drain bug. **Still unresolved after §3a** — the store defect that confounded it is fixed by a fresh install, but the offline re-test could not be driven (see §3a, "OFFLINE capture"). |
| 34 | Placed captures carry `project_id` **AND** `project_room_id` on the **inbox** path | **PASS (1 capture, not 3)** | `9db77e46-436b-48c1-93e6-a3bf363717fc` — `status=inbox`, `project_id=a42e4fa4…`, `project_room_id=4238652e…`, `category="table"`. The Vision read carried through to the server. |
| 35 | PostHog from **the installed build**, `surface='field-ios'` | **PASS (partial)** | Device rows confirmed (`$device_model iPhone18,2`, `$os_version 27.0` — the simulator reports `arm64`/26.5, so the two are cleanly separable): `Application Opened`, `$identify`, `$set`, `sync.drain.done`, `$screen` (`C1.viewfinder`, `W1.work`, `F1.scan-setup`, `F1.context`), `$feature_flag_called`. **`voice.finish` / `capture.place_tapped` / `sync.reconnect_drain` not yet seen.** |
| 36 | `on_device` actually appears on `voice.finish` | **NOT EXERCISED** | No voice note recorded — needs Kody's voice. The parked "`on_device` is a dead property" finding is **neither confirmed nor cleared**. |
| 1, 2, 3–22, 25, 26, 32, 33, 37–42 | recorder, playback, upload/sync, honesty copy, §15.4 ladder | **NOT EXERCISED** | All require a human voice, a real call, AirPods/wired headset, or a forced failure injection. See `device-pass-kody-script.md`. |

---

## 3. ⚠ Unplanned finding — captures are not reaching any on-disk store

> **Resolved — read §3a for the root cause and the fresh-install re-test.** The observations below
> stand; the two inferences drawn from them (that rung 2 should have saved us, and that an empty
> session tray on relaunch proves data loss) were both wrong.

This was not on the checklist. It surfaced while chasing step 31 and it is the most consequential
thing found today.

**Observations, each independently checked:**

1. The App Group store `<group.cloud.patina.field>/Library/Application Support/default.store` holds
   **9 specimens, newest `2026-07-29 19:21:40`** — despite roughly eight captures taken today.
   Its `-wal` is **0 bytes**, dated 29 July. Copied with `-shm` and `-wal` together, so this is not a
   stale-snapshot artifact.
2. That store's `-shm` **was touched today at 12:26**, so the app *does* open the file — it just
   never writes to it.
3. That store still carries the **July schema**: `ZSPECIMEN` has `ZVOICEAUDIOFILENAME`,
   `ZVOICETRANSCRIPT`, `ZVOICEDURATIONSECONDS`, `ZVOICEPARTIALTRANSCRIPT` and **none** of
   `ZVOICEAUDIOSEGMENTSRAW` / `ZVOICETRANSCRIPTSOURCERAW` / `ZVOICEAUDIOREMOTEPATHSRAW` — all three
   of which are declared stored properties on `Specimen` in this build.
4. There is **no `.store` file anywhere in the app's own data container** (488-line listing, no match).
5. A capture committed while offline **did not survive a relaunch** and never synced.
6. Every relaunch produces an empty session tray and loses the remembered destination
   (the card's primary reverts from "Send to inbox" to "Choose destination").

**Inference — flagged as inference, not observation:** this is consistent with
`CaptureStore.resilient` falling through its ladder (App Group → Application Support → in-memory) to
the **in-memory terminal**, whose own log line reads *"Persisted storage unavailable — running with
an in-memory store; captures will not survive relaunch"*. Observation 3 gives a plausible trigger
(a July store that will not lightweight-migrate to the current schema).

**I could not isolate the root cause.** `os_log` does not bridge to `devicectl --console`, so the
three `log.error`/`log.warning`/`log.fault` lines that would name the failing rung were not
retrievable. What does not fit the simple story: fallback rung 2 (`ModelConfiguration()` in
Application Support) should create a fresh store needing no migration, and it evidently did not —
so the explanation is not merely "the July store won't migrate".

**Why this matters to the wave, concretely:**

- Captures reach the server only because the sync runs **within the same app session**. Anything
  queued when the app is killed is **lost** — observed once already.
- **Step 31 cannot be read cleanly** until this is resolved.
- **The voice-file assertions are built on sand.** Steps 1, 2, 16b, 41 all assert against
  `voice-<uuid>-NNN.m4a` in the App Group media dir. That directory —
  `<AppGroup>/CaptureMedia` — **does not exist on the device at all** right now. `mediaDirectory()`
  creates it lazily, and no voice note has been recorded yet, so this is not proof of a media
  defect; but it does mean nobody should assume those paths are healthy until a note is taken and
  the directory is confirmed to appear.

**Recommended next step:** get the three `CaptureStore.resilient` log lines off the device (Console.app
attached to the phone, or a temporary `print` alongside the `log.*` calls), which names the failing
rung immediately. Until then the persistence claim for this build is **unknown, trending broken**.

---

## 3a. ROOT CAUSE FOUND — and cleared by a fresh install (13:00, same day)

Second session, same device. `print` statements were added beside every `log.*` call in
`CaptureStore.resilient` (plus one at the App Group container resolution), the signed Debug was
rebuilt with the same flags, installed **over** the existing app, and launched with
`xcrun devicectl device process launch --console --terminate-existing`. The prints are **throwaway
and have been reverted**; the devpass worktree is clean at `695addb5f`.

### The rung prints, verbatim (install-over, July store still present)

```
[CaptureStore] entry: persistent=true appGroupID=group.cloud.patina.field
[CaptureStore] appgroup resolution: url=/private/var/mobile/Containers/Shared/AppGroup/7DA5F628-20A8-4CB9-A81B-1973B8E85C2D
[CaptureStore] rung 1: error: SwiftDataError(_error: SwiftData.SwiftDataError._Error.loadIssueModelContainer, _explanation: Optional("Unresolved Cocoa Error loading container"), _underlyingCocoaError: Optional(Foundation.CocoaError(_nsError: Error Domain=NSCocoaErrorDomain Code=134110 "An error occurred during persistent store migration." UserInfo={sourceURL=file:///private/var/mobile/Containers/Shared/AppGroup/7DA5F628-.../Library/Application%20Support/default.store, reason=Cannot migrate store in-place: Validation error missing attribute values on mandatory destination attribute, destinationURL=file:///.../default.store, NSUnderlyingError=0x10e787a20 {Error Domain=NSCocoaErrorDomain Code=134110 "An error occurred during persistent store migration." UserInfo={entity=ScanUploadRecord, attribute=retryCount, reason=Validation error missing attribute values on mandatory destination attribute}}}))) | localized=The operation couldn’t be completed. (SwiftData.SwiftDataError error 1.) | url=/private/var/mobile/Containers/Shared/AppGroup/7DA5F628-...
[CaptureStore] rung 2: error: SwiftDataError(... entity=ScanUploadRecord, attribute=retryCount, reason=Validation error missing attribute values on mandatory destination attribute ...)
[CaptureStore] rung 3: FALLING THROUGH TO IN-MEMORY — captures will not survive relaunch
```

CoreData's own annotation for both rungs names the same file:

```
CoreData: error:   sourceURL : file:///private/var/mobile/Containers/Shared/AppGroup/7DA5F628-.../Library/Application Support/default.store
CoreData: error:   destinationURL : file:///private/var/mobile/Containers/Shared/AppGroup/7DA5F628-.../Library/Application Support/default.store
```

### Root cause — two defects, stacked

1. **The migration failure.** SwiftData cannot lightweight-migrate the July store because
   `ScanUploadRecord.retryCount` is declared `public var retryCount: Int` — non-optional, **no
   default value in the declaration** (`CaptureKit/Domain/ScanUploadRecord.swift:39`). CoreData
   therefore emits a *mandatory destination attribute with no default*, and in-place migration of a
   store whose rows predate the column fails validation:
   `entity=ScanUploadRecord, attribute=retryCount, reason=Validation error missing attribute values
   on mandatory destination attribute`. Giving it a declaration default (`= 0`) — or an explicit
   `@Attribute` default / a versioned migration plan — is what closes this.

2. **Rung 2 is not a fallback at all.** `ModelConfiguration()` with no arguments defaults to
   `groupContainer: .automatic`, which resolves to the app's declared App Group. Both rung-1 and
   rung-2 errors carry the **identical** `sourceURL`/`destinationURL` — the App Group
   `default.store`. So the "default on-disk container in Application Support" rung re-opens the same
   poisoned file and fails identically, and the ladder always lands on in-memory. This is exactly the
   *"what does not fit the simple story"* left open in §3. Rung 2 must name an explicit app-container
   URL (`ModelConfiguration(url:)`) to be a real second chance.

### True fresh install — PASS

`xcrun devicectl device uninstall app … cloud.patina.field`, then a clean reinstall of the same build.
Uninstall wipes the App Group container, so the poisoned July store goes with it.

```
[CaptureStore] entry: persistent=true appGroupID=group.cloud.patina.field
[CaptureStore] appgroup resolution: url=/private/var/mobile/Containers/Shared/AppGroup/97F8748F-2011-4D95-98FC-E7BBB382FB07
[CaptureStore] rung 1: ok url=/private/var/mobile/Containers/Shared/AppGroup/97F8748F-.../Library/Application Support/default.store
```

| Assertion | Result | Evidence |
|---|---|---|
| Store opens on the App Group (rung 1) after a fresh install | **PASS** | rung-1 `ok` print above, on first launch and on every relaunch since |
| A store file exists with a fresh mtime and a **non-zero** WAL | **PASS** | `default.store` **136 KB**, mtime `8/25/26 12:52 PM`; `-wal` **479 KB** at 12:54; `-shm` 32 KB. Contrast §3: 0-byte WAL dated 29 July |
| One ONLINE photo capture → routed to Inbox → survives a relaunch | **PASS** | Capture taken on the live camera (C3 card: `Table`, GUESS), `Choose destination` → **Inbox** → S4 *"Parked in your inbox — 1 guess to confirm · 1 price to verify"*. Store pulled off the device **after** a `--terminate-existing` relaunch: `ZSPECIMEN` count **1**, `ZCATEGORYRAW=table`, `ZDESTINATIONRAW=inbox`, `ZSTATUSRAW=committed`, `ZREMOTEID=F8BE6759-91BF-4FF6-9F0C-1AF7380667D8`, `ZCAPTUREPHOTO` count 1 |
| The store now carries the **current** schema | **PASS** | `ZSPECIMEN` has `ZVOICEAUDIOSEGMENTSRAW`, `ZVOICETRANSCRIPTSOURCERAW`, `ZVOICEAUDIOREMOTEPATHSRAW` — all three absent from the July store (§3 obs. 3) |
| Server-side arrival | **PASS** | `field_captures` row `f8be6759-91bf-4ff6-9f0c-1af7380667d8`, `status=inbox`, `category=table`, `created_at 2026-08-25 17:54:02Z` (read-only SELECT on Strata). Matches `ZREMOTEID` exactly |

⚠ **The empty session tray on relaunch (§3 obs. 6) is NOT a persistence bug.** With a working store
the tray still reads *"Session tray, 0 captured"* after a relaunch while the specimen is provably on
disk — the tray is scoped to the current *capture session*, and a launch starts a new one. §3's
inference from that observation should be retired.

### OFFLINE capture — NOT EXERCISED (blocked; device left in Airplane Mode)

WDA's HTTP server does not merely lose its WiFi address in Airplane Mode — **it stops listening
entirely**. Verified from both sides: after toggling Airplane Mode via Control Center, WDA was
unreachable on `192.168.1.69:8100` *and* on a **usbmuxd USB tunnel** to the device's own loopback
`:8100` (`usbmux connect → Result Number 2`, connection refused). The USB tunnel itself was proven
working against WDA minutes earlier, so the transport is not the variable.

Restarting WDA offline is also impossible: `xcodebuild test-without-building` fails at the install
step with *"The application could not be launched because the Developer App Certificate is not
trusted"* — iOS cannot validate a development certificate without a network. Same refusal for a
direct `devicectl … process launch com.facebook.WebDriverAgentRunner.xctrunner`.

**Consequence: the airplane-mode leg is a one-way door.** Once Airplane Mode is on there is no
automated path back — no `devicectl` verb toggles radios, and every XCTest driver needs the network
it just removed. **A human must swipe Airplane Mode off before any further device automation.**

Two things follow for whoever picks this up:

- Plan the offline leg so the airplane-on toggle, the capture, the routing taps and the airplane-off
  toggle all ride in **one W3C `/actions` payload** (WDA executes the whole chain on-device inside a
  single request, so the HTTP response never has to arrive), or accept a human in the loop.
- A cheaper approximation that keeps automation alive: launch with
  `-CaptureSupabaseURL <unroutable>` so the sync fails while the radios stay up. That exercises
  outbox durability and drain-on-relaunch, but **not** `NWPathMonitor`, so it cannot settle the
  offline banner or step 30/31 as written.

### Voice-file assertions — still blocked

`<AppGroup>/CaptureMedia` **still does not exist** after a completed photo capture (full 8-entry
App Group listing: `Library/{Application Support,Caches,Preferences}` and nothing else). No voice
note was recorded — the C3 card exposes `Add detail` / `Choose destination` only, with no mic
control at the card level, and by the time the media directory could have been driven the device was
offline. Steps 1, 2, 16b, 36, 41 remain **NOT EXERCISED**, now for want of a voice note rather than
for want of a store.

### Device state left behind

- **Airplane Mode is ON.** Phone unlocked, Auto-Lock Never. Needs one human swipe.
- `cloud.patina.field` carries a **clean, uninstrumented** signed Debug build (rebuilt after the
  prints were reverted, installed 13:03). The upgrade install preserved the App Group data —
  `default.store` still 136 KB with the one synced specimen.
- ⚠ That freshly-installed binary **will not launch until the phone is back online** (same
  developer-certificate validation gate). Turning Airplane Mode off clears it.
- blitz's WebDriverAgent is **down** and must be re-run (`setup_device`, or the Xcode-27 command in
  §1) once the network is back.

---

## 4. Evidence channels — all four proven working

| Channel | Settles | Command |
|---|---|---|
| PostHog | every `voice.*`, `capture.*`, `sync.*`, `screen.*` assertion | `execute-sql` over `events` where `properties.surface = 'field-ios'` |
| App Group **file listing** | `voice-<uuid>-NNN.m4a` existence / absence / **size**; orphans; discard cleanup | `devicectl device info files --domain-type appGroupDataContainer --domain-identifier group.cloud.patina.field` |
| SwiftData store **copy** | specimen fields — *currently returns July data, see §3* | `devicectl device copy from --source "Library/Application Support/default.store"` (copy `-shm` and `-wal` too) |
| Supabase | steps 17–22, 34, 41's server half | SQL over `field_captures` + `capture-media` |

**Server-side baseline:** before this pass, `field_captures` held 8 rows, all `inbox`, newest
`2026-08-03`. This pass added exactly two: `69924b35…` (17:19:52Z) and `9db77e46…` (17:22:46Z).

### The one capability we do not have

`devicectl device copy from` refuses any path outside `Library`, `Documents`, `tmp`, and
`mediaDirectory()` puts media at `<AppGroup>/CaptureMedia` — the container **root**:

```
Access restricted: '.../Shared/AppGroup/<id>/CaptureMedia' is outside the allowed
container directories (Library, Documents, tmp).
```

So the `.m4a` files **cannot be pulled off the device**. Listing them (name, size, mtime) works;
copying them does not. Every `afinfo` assertion — AAC-LC, hardware sample rate, duration ±1 s,
durations summing to ~20 min (steps 1, 3, 8, 10b, 41) — must therefore be measured on the **synced
copy from the `capture-media` bucket** and labelled as such, never as "afinfo on the local segment".
The >20 KB size floor and all existence/absence assertions are unaffected — the listing reports size.

---

# §4 — iPhone 13 Pro (`00008110-001630212231801E`)

**Attempted** 2026-08-25, ~15:20–15:35 CDT. **Device** iPhone 13 Pro (`iPhone14,2`), iOS **26.6**
(`23G71`), LiDAR, Developer Mode **enabled**, paired.
**Toolchain** default Xcode **26.6** (`17F113`) — iOS 26.6 is inside its range, so **no
`DEVELOPER_DIR` override was needed** for this phone (contrast §1, which needed Xcode 27 for the
17 Pro Max on iOS 27.0).

## 4.0 Outcome — BLOCKED before any device step. The phone is not on the wire.

Every device-side assertion in this section is **NOT EXERCISED**. The blocker is not automation
mode, not the DDI, and not the toolchain: **no USB peripheral is attached to the Mac at all.**

Four independent reads, all taken after a settle window:

| Probe | Result |
|---|---|
| `xcrun xctrace list devices` | `iPhone (26.6) (00008110-001630212231801E)` listed under **`== Devices Offline ==`** — as is Kody's Phone |
| `xcrun devicectl list devices` | state **`unavailable`**; `ddiServicesAvailable: false`; `tunnelState: unavailable`; `lastConnectionDate 2026-08-25 16:34 UTC` (≈4 h stale at probe time 20:23 UTC) |
| `ioreg -rc IOUSBHostDevice` | **0** matches — no USB host device of any kind |
| `ioreg -l \| grep "USB Product Name"` / `system_profiler SPUSBDataType` | **empty**; the only `Product Name` anywhere in the IO registry is `Disk Image Driver for MacOS X` |

`xcodebuild` agrees: with `-destination 'platform=iOS,id=00008110-001630212231801E'` it returned
*"Unable to find a destination matching the provided destination specifier"*, and the 13 Pro was
**absent from the available-destinations list** while the (wifi) 17 Pro Max was present.

⚠ **`blitz list_devices` reports this phone as `connectionType: "usb"`. That field is not a live
probe** — it is read off the pairing record. The same call labels the Apple Watch *and every
Simulator* `"usb"`. It must not be used as evidence that a phone is connected; `xctrace list devices`
or `ioreg -rc IOUSBHostDevice` is the authoritative read.

One `xcrun devicectl device info details --device 00008110-…` call did return hardware detail
(serial `CRHHX7G3X1`). That was **cache, not a live session** — its capability list came back as only
`{default.user.credentials, tags, unpairdevice}`, the offline set, with no Install/Launch/Copy verbs.

### What a human has to do

1. **Plug the iPhone 13 Pro into the Mac with a cable** (a data cable — a charge-only cable presents
   nothing to the IO registry), **unlock it**, and accept **Trust This Computer** if prompted.
2. Confirm on the phone: **Settings → Privacy & Security → Developer → AUTOMATION → Enable UI
   Automation = ON**, and **Settings → Display & Brightness → Auto-Lock = Never**.
3. Leave the phone **unlocked** — the CoreDevice tunnel and the DDI will not mount against a locked
   device.

One command confirms it is ready; it must print the phone under `== Devices ==`, not `Offline`:

```
xcrun xctrace list devices | head -5
```

Nothing else is owed by a human. Everything else is staged (§4.1).

## 4.1 Staged and ready — the restart costs no build time

| Artefact | State |
|---|---|
| **OLD build** (`695addb5f`, pre-fix) | `** BUILD SUCCEEDED **` · `.claude/worktrees/field-companion-devpass-old/.build/dd/Build/Products/Debug-iphoneos/Capture.app` |
| **NEW build** (`5d40927a5`, fixed) | `** BUILD SUCCEEDED **` · `.claude/worktrees/field-companion-devpass/.build/dd/Build/Products/Debug-iphoneos/Capture.app` |
| Signing, both | `Identifier=cloud.patina.field`, `TeamIdentifier=VP22LXHT7L`, entitlement `VP22LXHT7L.cloud.patina.field`. Real signed Debug — **not** a `CODE_SIGNING_ALLOWED=NO` gate build |
| **Device already provisioned** | The embedded `iOS Team Provisioning Profile: cloud.patina.field` **already lists `00008110-001630212231801E`** among its 6 `ProvisionedDevices`. **No profile-registration wait on reconnect** — both builds install immediately |
| PostHog key, both | `PlistBuddy -c "Print :POSTHOG_API_KEY"` → `phc_D6Rf…` in **both** bundles. The §1 build-input defect is **closed for the new build in-repo** (`6a70b7074` commits the public project key into `BuildSettings.xcconfig`); the old build got it from a copied-in `Secrets.xcconfig` |
| Binary discriminator | `UIRequiresFullScreen` is `true` in the NEW `Info.plist` and **absent** in the OLD one (`fffe4908c`, ITMS-90474). This is a reliable way to confirm *which* build is installed without reading a version string |

Both worktrees are **clean at their commits**; nothing was committed or pushed.

## 4.2 Step 1 (migrate-in-place) — the design must change, and here is why

**The old→new schema is identical except for defaults.** `git diff 695addb5f 5d40927a5` over
`apps/mobile/Capture/CaptureKit/CaptureKit/Domain/` shows the fix adds **inline default values to
existing non-optional stored properties** and adds **no attribute and no entity**:
`ScanUploadRecord.retryCount: Int` → `= 0`, `Specimen.categoryRaw` → `= SpecimenCategory.unknown…`,
`CapturePhoto.width/height/isPrimary/…`, `SiteRequestOutboxRecord.*`, and so on.

**Consequence:** installing the OLD build first produces a store that *already carries every column
the NEW build declares*. Upgrading to the NEW build is therefore a **no-op migration that would pass
trivially** — it does **not** reproduce the July-29 failure, which required a store written *before*
`ScanUploadRecord.retryCount` existed. Run as written, step 1 proves **"install-over-existing keeps
data"** and nothing stronger. It should be recorded at exactly that strength.

The July-29 → current path was proven on the **Simulator only** (§3a proved the *failure* on-device;
the *fix* was not proven on-device).

**The strongest evidence that does exist today — sim-verified, run this session.**
`CaptureTests/CaptureStoreLadderTests` (15 tests, new in `5d40927a5`), on
`iPhone 17 Pro Simulator (26.5)`:

```
✔ Test everyMandatoryAttributeCarriesADefault() passed after 3.730 seconds.
✔ Test opensAStoreWrittenBeforeAnEntityExisted() passed after 3.730 seconds.
✔ Test theApplicationSupportRungIsNotTheAppGroupStore() passed after 3.730 seconds.
✔ Test resetsAnUnopenableStoreOnceAndComesBackEmpty() passed after 3.730 seconds.
✔ Test aLockedStoreIsLeftAloneAndReportedDeferred() passed after 3.730 seconds.
✔ Suite CaptureStoreLadderTests passed after 3.733 seconds.
✔ Test run with 15 tests in 1 suite passed after 3.734 seconds.
** TEST SUCCEEDED **
```

`everyMandatoryAttributeCarriesADefault` walks `CaptureStore.schema` and fails on any non-optional
attribute with a nil `defaultValue` — it is the standing guard against §3a's root cause recurring.
`theApplicationSupportRungIsNotTheAppGroupStore` closes §3a's second defect (rung 2 re-opening the
same poisoned file).

⚠ The suite's own comment concedes the gap and it is worth quoting, because it is the honest limit
of this evidence: the property-level case is guarded by the invariant test *"rather than by a
fixture here"*, because two `@Model` types cannot share a SwiftData entity name in one process, and
was *"verified out-of-band instead"*. **A decisive proof is still available without the phone** and
should be the next move if this stays blocked: write a store with a **two-process** harness — process
A links the OLD `CaptureKit` and saves a `ScanUploadRecord`; process B opens that same file under the
NEW `CaptureStore.schema` — which reproduces NSCocoaErrorDomain 134110 before the fix and migrates
in place after it. That is the real regression fixture the fix currently lacks.

## 4.3 Step 2 (voice media dir) — NOT EXERCISED, with a clean zero baseline recorded

Not driveable without the phone. The server-side baseline was taken read-only so the evidence is
unambiguous whenever it runs:

- `select count(*), max(created_at) from public.field_captures` → **11 rows**, newest
  `2026-08-25 17:54:02.030477+00` (the §3a capture from the 17 Pro Max).
- `capture-media` bucket → **9 objects**, newest `2026-08-25 17:54:01.721475+00`, and **every one is
  an image** (`image/heic` ×2, `image/jpeg` ×7). **There is no `voice-*.m4a` object in the bucket at
  all.** So the first such object to appear is unambiguously from this pass.

`<AppGroup>/CaptureMedia` remains unverified on this device (the app has never been installed on it).

## 4.4 Assertion tally for this device

| Bucket | Count | Result |
|---|---|---|
| Wave 1 + Wave 2 assertions driven on the 13 Pro | **0** | **NOT EXERCISED** — no device connection |
| Store-ladder invariants | 15 | **PASS, sim-verified** (`iPhone 17 Pro Simulator (26.5)`) |
| Build/sign/provision pre-flight | 5 | **PASS** (§4.1) |
| Server baseline | 2 | recorded (§4.3) |

Claim level reached on this device, per `patina-ios-verification`: **compile-green** for both builds,
**sim-verified** for the store ladder, **device-verified nowhere.**

## 4.5 Human script for this phone

`docs/design/field-companion/waves/wave-1/device-pass-kody-script-13pro.md` — supersedes
`device-pass-kody-script.md` **for the 13 Pro only** (that file stays correct for the 17 Pro Max,
against which it was confirmed).

It differs from the 17 Pro Max script in four ways that matter:

- **A new mandatory block A** — reconnecting the phone — because that is the whole reason this
  attempt produced nothing.
- **Nothing is struck out on the grounds of "already driven."** Zero assertions were pre-cleared on
  this hardware, so blocks B–I are shorter only where the finding is device-independent.
- **The old script's §3 warning is removed.** It told Kody *"captures are not being written to disk —
  do not force-quit"*. That is **stale**: the store bug is fixed in `5d40927a5`, and block B now
  tests the fix rather than working around the bug.
- **The offline leg moved to the end and is human-toggled**, per §3a's one-way-door finding.


---

# §5 — iPhone 17 Pro Max, second session (install-over-existing proof)

**Run** 2026-08-25, ~15:40–15:52 CDT. **Device** Kody's Phone, iPhone 17 Pro Max (`iPhone18,2`),
iOS **27.0**, LiDAR, **USB**, Developer Mode on, unlocked.
**Toolchain** `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer` (Xcode **27**) on every
`xcodebuild`/`devicectl`/WDA command, WDA with `IPHONEOS_DEPLOYMENT_TARGET=15.0`.
**Build installed** the fixed `5d40927a5`, signed Debug, team `VP22LXHT7L` — the `generic/platform=iOS`
bundle staged in §4.1. No rebuild was needed: a generic device build is destination-agnostic and the
profile already covers this phone.

## 5.0 Two connection lessons worth keeping

1. **`xcrun xctrace list devices` reported this phone under `== Devices Offline ==` the entire
   session — including while it was demonstrably installing, launching and being driven.** It is
   **not** a reliable liveness probe for an iOS 27 device. `xcrun devicectl list devices` under
   Xcode 27 correctly read `available (paired)` with the full capability set (Install / Launch /
   Transfer Files / Uninstall). **Trust `devicectl`, not `xctrace`.** (§4.0 used `xctrace` as one of
   four probes; for the 13 Pro the verdict still stands, because `ioreg` independently showed **no
   USB device at all**. Here `ioreg` showed the phone, serial `0000815000016C8A21DA401C`.)
2. **WDA's "Timed out while enabling automation mode" is flaky, not necessarily a config fault.**
   It failed on the first `test-without-building` attempt and **succeeded on an immediate retry with
   byte-identical flags** (`ServerURLHere->http://192.168.1.69:8100`). §1 attributed six such
   failures to the Xcode 26.6/iOS 27 mismatch and that fix was real, but a single failure under the
   *correct* toolchain should be **retried once** before anyone concludes a toggle is wrong. The
   cached WDA was already the Xcode-27 build (`DTXcode 2700`, `WebDriverAgentRunner_iphoneos27.0-arm64.xctestrun`).

## 5.1 Step 1 — install-over-existing: **PASS**, proven four independent ways

⚠ **Say plainly what this is and is not.** This is the **install-over-existing** proof. It is **not**
the July-29 path. §4.2 established from the source diff that `695addb5f` → `5d40927a5` adds **only
inline default values** to existing properties — no new attribute, no new entity — and this session
**confirmed that on-device**: the pre-install store, written by the *pre-fix* build, already carried
`ZRETRYCOUNT` on `ZSCANUPLOADRECORD` **and** all three new voice columns
(`ZVOICEAUDIOSEGMENTSRAW`, `ZVOICETRANSCRIPTSOURCERAW`, `ZVOICEAUDIOREMOTEPATHSRAW`). So the upgrade
was a migration with nothing to migrate. The July-29 → current path remains **Simulator-only**.

**Baseline, pulled off the device before installing** (`devicectl device copy from`, App Group domain):

```
ZSPECIMEN count = 1
F8BE6759-91BF-4FF6-9F0C-1AF7380667D8 | table | inbox | committed
ZCAPTUREPHOTO count = 1
```

App Group before install — 8 entries, `default.store` **136 KB @ 12:52 PM**, `-wal` **479 KB @ 12:54**,
`-shm` 32 KB, and **no `CaptureMedia` directory**.

| # | Assertion | Result | Evidence |
|---|---|---|---|
| 1 | Install-over-existing succeeds | **PASS** | `App installed: bundleID cloud.patina.field`, new `installationURL` bundle UUID `90E8FD8F-…` |
| 2 | **No reset** — the store was not set aside | **PASS** | App Group listing after install is **still exactly 8 entries**, with **no set-aside generation**. The fix's reset path renames the whole sqlite trio aside (`settingStoreFilesAsideTakesTheWholeSqliteTrio`); nothing was renamed. `default.store` is still **136 KB with its original 12:52 PM mtime** |
| 3 | The store was opened by the new build, **on the App Group** | **PASS** | `default.store-shm` mtime advanced to **3:45 PM** — the App Group file is the one the app touched. Rung 2 would have written a *different* URL in the app container (`theApplicationSupportRungIsNotTheAppGroupStore`) |
| 4 | **The capture survived** | **PASS** | Store re-pulled after the install: `ZSPECIMEN` count **1**, `F8BE6759-91BF-4FF6-9F0C-1AF7380667D8 | table | inbox | committed`, `ZCAPTUREPHOTO` count **1** — byte-for-byte the baseline |
| 5 | **No `u1.sync.in-memory-warning`** on the sync screen | **PASS** | U1 driven via the `-CaptureScreen U1.sync` harness and the **full element tree read**: `screen.U1.sync` renders "Everything's confirmed", a `Verified` image, `Retry all` (disabled) and `Done`. **The identifier `u1.sync.in-memory-warning` is absent from the tree.** So `openReport.losesWorkOnRelaunch == false` ⇒ `persistence != .inMemoryFallback`. Shot: `device-pass-shots/s5-U1-no-inmemory-warning.png` |
| 6 | Neither store-health event fired | **PASS** | PostHog, `properties.surface = 'field-ios'`, after 20:35Z: **no `store.reset_incompatible`, no `store.in_memory_fallback`**. The project taxonomy has **never seen** the `persistence` or `failures` properties those events carry. This is a meaningful negative because analytics was provably live in the same sessions — three `Application Opened` rows at `20:43:08`, `20:45:13`, `20:48:27` (`iPhone18,2`, `27.0`) matching the three launches |

Rung 1 opened cleanly, nothing was reset, and the existing capture survived the upgrade.

## 5.2 ⚠ New finding — the install-over **signed the account out** and emptied App Group preferences

Not on the checklist, and it is the reason steps 2 and 3 could not run.

| When | `Library/Preferences/group.cloud.patina.field.plist` |
|---|---|
| **Before** my install (listed 15:40) | **235 bytes**, mtime `1:03 PM` — i.e. §3a's signed-in state still on disk |
| **After** the install + first launch | **42 bytes**, mtime `3:43 PM` |
| Read back (`plutil -p`) | **`{}` — empty** |

The app now opens on the **signed-out onboarding screen** ("Capture in the room." / *Get started* /
*I already have an account*) — `device-pass-shots/s5-signed-out-onboarding.png`.
`SupabaseSessionService` stores session state in exactly this App Group `UserDefaults` suite
(`Capture/Services/Session/SupabaseSessionService.swift:92`).

**Two hypotheses, and I cannot separate them with the evidence I have:**

- **(a) The upgrade install cleared it.** The temporal association is tight — present at 1:03 PM,
  emptied at 3:43 PM, which is the install/first-launch minute.
- **(b) The refresh token expired.** §3a left this phone in **Airplane Mode** for roughly 2.5 hours;
  a session-restore failure on the first online launch would legitimately clear the stored session.

**This is recorded as an open question, not as a regression.** It matters either way: if (a), then
every designer updating Field is signed out by the update, which is a real upgrade-experience defect
worth a ruling. **What would have settled it — and what the next person should do first — is to copy
the prefs plist *contents* off the device before installing, not just list its size.** I captured the
size but not the contents, which is the one gap in this session's evidence.

⚠ **The store is unaffected** — §5.1 proves the capture and the SwiftData store survived intact. This
is a session/preferences observation only.

## 5.3 Step 2 (voice media dir) — **NOT EXERCISED**, blocked by §5.2

`<AppGroup>/CaptureMedia` still does not exist. The voice sheet could not be reached:

- `-CaptureScreen N4.voice` **falls through to the onboarding screen** — the N4 harness hop needs the
  signed-in capture context.
- `-CaptureScreen C1.viewfinder` does the same, so the "take a capture, then Add detail → Voice"
  route is closed too.
- `-CaptureScreen U1.sync` **does** render signed-out, which is how §5.1 assertion 5 was settled. The
  harness is therefore **selectively** behind the auth gate — useful to know, and not documented
  anywhere before now.

**Server baseline re-confirmed and unchanged this session:** `field_captures` **11 rows**;
`capture-media` **9 objects, none of them audio** — still **zero `.m4a` in the bucket**.

**To unblock:** the app has to be signed back in on the phone. That is a magic-link/OTP round trip
against Kody's real production account, so it is his call and his credentials — I did not attempt it.
Once signed in, step 2 is ~5 minutes of driving and needs no human voice (ambient audio is fine).

## 5.4 Step 3 — remaining Wave 1 + Wave 2 assertions

Every still-open autonomous assertion routes through the signed-in capture flow, so all of them are
blocked by §5.2 rather than by anything about the assertions themselves:

| Assertion | Blocked on |
|---|---|
| W2-1 four objects, W2-2 wall defect | Kody aiming the phone (unchanged) **and** sign-in |
| W2-4 Live Activity across the widened `ContentState` | a sustained sync with queued work — needs sign-in |
| Step 31 offline drain (still unresolved from §3, §3a) | sign-in; then the one-`/actions`-payload or `-CaptureSupabaseURL <unroutable>` route |
| Step 36 `on_device` on `voice.finish` | a voice note — sign-in |
| Steps 1, 2, 3–22, 25, 26, 32, 33, 37–42 | a human (unchanged) |

**The offline leg was deliberately not attempted**, per the §3a one-way-door finding and the standing
instruction never to leave the phone in Airplane Mode.

## 5.5 Assertion tally, this session

| Bucket | Count | Result |
|---|---|---|
| Step 1 install-over-existing sub-assertions | 6 | **PASS** (§5.1) |
| Step 2 voice media dir | 1 | **NOT EXERCISED** (§5.3) |
| Remaining Wave 1 / Wave 2 autonomous assertions | 5 groups | **NOT EXERCISED** (§5.4) |
| New findings | 3 | §5.0 ×2 (xctrace unreliable, WDA retry), §5.2 (sign-out) |

Claim level reached this session: **device-verified** for the install-over-existing store proof;
everything else unchanged from §2/§3a.

## 5.6 Device state left behind

- **Airplane Mode is OFF**; phone online, unlocked, on USB. (The Capture launch validating its
  developer certificate is itself proof the radios are up.)
- `cloud.patina.field` carries the **fixed `5d40927a5`** signed Debug build, **signed out**, its
  App Group store intact (136 KB, 1 specimen, 1 photo).
- **WDA is running** (`http://192.168.1.69:8100`), blitz attached; viewer at
  `http://localhost:5150?udid=00008150-00016C8A21DA401C`.
- Nothing committed, nothing pushed. Both worktrees clean at their commits.

---

## §5 continued — signed-in session (16:15–16:35 CDT)

Kody signed in. Same device, same fixed build, WDA still attached.

## 5.7 The §5.2 sign-out question — **RESOLVED. Not a regression.**

Prefs plist contents captured while signed in (the evidence §5.2 said was missing). It holds
**three keys and no auth token**:

```
"capture.session-context.v1"                                     (265-byte blob)
"session.activeWorkspaceID.74056c2a-866d-42b0-9e2a-d473c2484316"
"session.activeWorkspaceName.74056c2a-866d-42b0-9e2a-d473c2484316"
```

Two facts settle it:

1. **The auth session was never in this plist.** `SupabaseClientProvider` comments and branches
   confirm physical devices use *"supabase-swift's default (Keychain) local storage"*; only the
   Simulator gets a `SimulatorAuthStorage()` backed by `UserDefaults`. So the plist emptying could
   not have signed anyone out.
2. **The 235 → 42 byte shrink is an intentional migration.** `SupabaseSessionService.init` runs
   `defaults.removeObject(forKey: Keys.legacyActiveWorkspaceID)` / `…legacyActiveWorkspaceName`
   **unconditionally on every construction** (lines 99–100). Those legacy keys are the *unsuffixed*
   `session.activeWorkspaceID` / `session.activeWorkspaceName` that the older build wrote. The new
   build deletes them by design and rewrites per-user suffixed keys after hydration.

**Hypothesis (a) — "the upgrade install cleared the session" — is disproven.** The residual
explanation is (b): the refresh token expired while the phone sat in Airplane Mode for ~2.5 hours.

Corroborated independently later in the session: launching with `-CaptureSupabaseURL http://127.0.0.1:9`
dropped the app to onboarding, and **relaunching against the real URL came back signed in with no
re-authentication** — proving the Keychain token survives launches that cannot reach the server.

⚠ **Correction to §5.2: do not treat "the update signs designers out" as an open defect.** It is not
one. The §5.2 table stands as observation; its hypothesis (a) is retired.

## 5.8 🔴 ROOT CAUSE — the voice recorder is gated behind a PostHog flag **that does not exist**

This is the finding of the session and it retires a whole family of "not exercised" rows.

`VoiceNoteSheet.task` (line 71):

```swift
analytics.screen("N4.voice")
guard flags.isEnabled("field-companion-voice") else {
    manualFallback = true
    return
}
if authorized == nil { … await voice.requestAuthorization() … }
```

The flag check runs **before** microphone authorization is ever requested, and
`CaptureFeatureFlags` is **fail-closed by design** (its header: *"FAIL-CLOSED throughout: anything
that cannot answer answers `false`"*).

**`field-companion-voice` has never been created in PostHog.**

| Evidence | Result |
|---|---|
| Flag evaluations on device today | `$feature_flag_called`, flag `field-companion-voice`, **3 calls**, latest `2026-08-25T21:24:35Z` (the moment the sheet opened) — `$feature_flag_response` = **`null`** |
| Flag definitions in the project | `SELECT key … FROM system.feature_flags` matching `%field%`/`%companion%`/`%voice%` → **zero rows** |
| All flags that exist (9 total) | `single-pane`, `call-sheet`, `room-file`, `arrival-arc`, `schedule-spine`, `studio-workspaces`, `design-request-pool`, `the-document-pilot`, `procurement-workspace-pilot`. **No `field-companion-voice`.** (Also no `worktable` — noted in passing, out of scope) |

**Observed consequence, driven end-to-end:** capture → Add detail → **Voice** opens the N4 sheet
already in the **typed editor**, reading *"Voice capture isn't available here. Type the context and
rep details."* — with **no mic control and no permission prompt**.
Shot: `device-pass-shots/s5-N4-voice-flag-fallback.png`.

Two independent confirmations that this is the flag and not a permission problem:

- **Patina Field does not appear in Settings → Privacy & Security → Microphone at all.** The full
  alphabetical list runs `… OneDrive · PlushCare · Shazam …` — no Patina entry. An app appears there
  only once it has *requested* the permission, so the app has never asked. Consistent with the flag
  short-circuiting before `requestAuthorization()`.
- The built `Info.plist` **does** carry `NSMicrophoneUsageDescription` (*"Used to record a quick voice
  note about a piece."*) and `NSSpeechRecognitionUsageDescription`, so this is not a missing-plist-key
  defect either.

**There is no local override.** `CaptureFeatureFlags` reads only the `CaptureAnalytics.isFeatureEnabled`
seam; `AppConfiguration` has no `-CaptureFlag`-style launch argument.

### What this means for the whole programme

- **`<AppGroup>/CaptureMedia` has never existed on any device across three sessions because no voice
  note can be recorded on any build.** That mystery is closed.
- **Spec steps 1, 2, 3–22, 16b, 25, 26, 32, 33, 36, 37–42 — every voice assertion, and Kody script
  blocks C, D, E, F and G — were never runnable by anyone**, on device or Simulator. They are not
  "not yet attempted"; they were **unreachable**.
- **Wave 1's headline recorder work has never been exercised at the device level, and could not have
  been.** Any claim resting on it should be read accordingly.

**To unblock:** create the `field-companion-voice` flag in PostHog and enable it for Kody's user.
**I did not do this** — it is a mutation to production analytics and needs Kody's say-so. It is the
single cheapest action available and it unblocks roughly 25 assertions.

## 5.9 What *was* driven this session — all PASS

| # | Assertion | Result | Evidence |
|---|---|---|---|
| a | C1 mode row: exactly four pills, no VOICE | **PASS** (re-confirmed on fixed build) | `photo mode` (AXValue 1) · `tag mode` · `measure mode` · `scan mode`. No fifth, no VOICE |
| b | Shutter → C3 card with a real Vision read | **PASS** | Card: category **Table**, badged GUESS, `MATERIAL —` (nothing invented), `Not placed — tap to place` in terracotta |
| c | **A second, different category off a second real frame** | **PASS** | Aimed at a fabric bag → category **`textile`**, distinct from `table`. Two real frames, two distinct categories. W2-1's "all four come back the same" failure mode is further de-risked — **four distinct objects still needs Kody** |
| d | S3 destination screen, Inbox RECOMMENDED | **PASS** | `screen.S3.destination` — *"Where should this go?"*; **Inbox — finish later** carries `Recommended`; **Library — clean & complete** unbadged |
| e | S4 confirmation copy | **PASS** | *"Parked in your inbox — 1 guess to confirm · 1 price to verify"*, then *"Confirm the material, verify the trade price, then promote it to the library."* |
| f | Capture → route → **sync to server** end-to-end on the fixed build | **PASS** | New row `bb79c432-1e75-45de-97d1-752c497117ce`, `status=inbox`, `category=textile`, `created_at 2026-08-25 21:30:08Z`. `capture-media` **9 → 10** objects |
| g | Empty-session tray third state | **PASS** (re-confirmed) | After relaunch: *"Nothing captured yet / Captures from this visit gather here"*, footer **"Review this session"** — the session-scoped behaviour, not data loss |
| h | **The fixed build actively WRITES to the App Group store** | **PASS** | `default.store-wal` grew **479 KB → 1 MB** (mtime 4:30 PM). Not merely opening the file — writing to it |
| i | Store durability across the whole session | **PASS** | Final pull: **3 specimens, 3 photos** — `F8BE6759…` table/inbox/committed (**the pre-upgrade capture, still there**), an unrouted `table`/**undecided**/**draft**, and `BB79C432…` textile/inbox/committed |

Row (i) is worth reading twice: an **unrouted draft persists to disk as `undecided`/`draft`**. That is
outbox durability's precondition holding on real hardware.

## 5.10 The `-CaptureSupabaseURL <unroutable>` workaround does **not** work as documented

§3a proposed it as the cheap substitute for the airplane-mode leg. **It does not survive contact.**

Launched with `-CaptureSupabaseURL http://127.0.0.1:9`: the app **drops straight to the signed-out
onboarding screen**, because the session cannot be validated against an unreachable server. There is
no capture flow behind that, so it cannot exercise outbox durability or drain-on-relaunch at all.

⚠ **Retire that suggestion from §3a.** Step 31 therefore remains **unresolved after three sessions**,
and the only routes left are (a) a human toggling Airplane Mode with the phone in hand, or (b) a
single W3C `/actions` payload carrying airplane-on → capture → route → airplane-off inside one
request. **I did not attempt (b)** — a failure mid-payload strands the phone offline with no automated
recovery, and the standing instruction is never to leave it in Airplane Mode.

`<AppGroup>/CaptureMedia` **still does not exist after three photo captures**, which also means
**photos do not live there** — worth confirming before anyone assumes voice files will.

## 5.11 Tally and device state

| Bucket | Count | Result |
|---|---|---|
| Step 1 install-over-existing | 6 | **PASS** (§5.1) |
| Driven this session | 9 | **PASS** (§5.9) |
| Step 2 voice media dir | 1 | **BLOCKED — flag never created** (§5.8) |
| Voice assertion family (steps 1, 2, 16b, 36, 41 + script blocks C–G) | ~25 | **UNREACHABLE on every build** (§5.8) |
| Step 31 offline drain | 1 | **unresolved, 3rd session** (§5.10) |
| W2-1 four objects / W2-2 wall defect | 2 | needs Kody aiming; 2 of 4 categories now shown distinct |
| W2-4 Live Activity | 1 | **NOT EXERCISED** |
| New findings | 3 | §5.7 (sign-out resolved), §5.8 (flag), §5.10 (workaround retired) |

**Device left:** online, unlocked, Airplane Mode **off**, **signed in**, fixed build installed, store
holding 3 specimens / 3 photos. WDA running on `:8100`, blitz attached. Nothing committed or pushed.

---

# §6 — Voice unblocked: the recorder works end to end

**Run** 2026-08-25, 16:44–16:52 CDT. Same 17 Pro Max, same fixed `5d40927a5` build, Xcode 27 toolchain.
Kody created the `field-companion-voice` flag (PostHog id 845875, `email_domain ∈ {kochaver.com,
middlewest.studio}` @100%).

## 6.0 The flag reaches the device — confirmed

Two kill-and-relaunch cycles, then the N4 sheet. PostHog, from the device:

```
$feature_flag_called | 2026-08-25T21:46:40.759Z | field-companion-voice | response = true
```

The PostHog SDK's on-device flag cache corroborates it —
`Library/Application Support/cloud.patina.field/phc_D6Rf…/posthog.enabledFeatureFlags` and
`posthog.flags` were both rewritten at **4:45 PM**, i.e. the relaunch, not a stale copy.

⚠ **One relaunch was enough** — the flag was already `true` on the first post-creation open. The
"kill twice" contingency was not needed.

**The sheet changed completely.** Where §5.8 showed the typed editor, it now opens on
**"◉ HOLD TO TALK"** with a live mic and *"Your words appear here as you speak…"*. Shot:
`device-pass-shots/s6-N4-recorder-live-transcript.png`.

⚠ **No microphone permission prompt ever appeared**, and the recorder worked on the first hold. So
the mic was already authorised, and §5.8's inference — that Patina Field's absence from Settings →
Privacy & Security → Microphone meant it had never asked — was **wrong about the cause though right
about the flag.** The app's absence from that list is unexplained; the recording itself is not in
doubt. Not chased further.

## 6.1 Step 2 — the voice media path: **PASS, end to end**

Three takes were recorded (a 1.5 s stab, an accidental take when WDA died mid-session, and a clean
**11 s** hold). Each take supersedes the last in the sheet; the third was attached and saved.

| # | Assertion | Result | Evidence |
|---|---|---|---|
| 1 | The recorder records and transcribes on device | **PASS** | Sheet advanced to `TAKE READY` with transcript **"Hello this is me"**. A 1.5 s stab produced the honest *"We couldn't make out the words — the audio is here."* variant instead |
| 2 | The file is named `voice-<uuid>-000.m4a` | **PASS** | `ZVOICEAUDIOFILENAME` = **`voice-ba88acc2-3840-4d53-a9c1-53f62336a24c-000.m4a`** — exactly the predicted shape, segment index `000` |
| 3 | Duration recorded | **PASS** | `ZVOICEDURATIONSECONDS` = **10.9121509790421** for an 11 s hold |
| 4 | Transcript source is on-device | **PASS** | `ZVOICETRANSCRIPTSOURCERAW` = **`device`**. Corroborated by `Library/Caches/com.apple.speech.localspeechrecognition` appearing at 4:47 PM |
| 5 | Sync produces the **first** `.m4a` object in `capture-media` | **PASS** | `74056c2a-…/d05e8647-…/voice-ba88acc2-3840-4d53-a9c1-53f62336a24c-000.m4a`, **101,777 bytes**, `audio/x-m4a`, `2026-08-25 21:49:55.823Z`. Path shape `capture-media/<uid>/<token>/voice-….m4a` as specified. Baseline was **0** `.m4a` objects |
| 6 | The remote path is written back to the specimen | **PASS** | `ZVOICEAUDIOREMOTEPATHSRAW` populated (377-byte bplist) after sync; `ZREMOTEID` assigned `3A4DF24C…`, `ZSTATUSRAW=committed`, `ZDESTINATIONRAW=inbox` |
| 7 | Server row | **PASS** | `field_captures` `3a4df24c-e8c2-43e0-80b8-5fccefb64498`, `status=inbox`, `category=textile`, `21:49:56.021Z` |

### 6.1a `afinfo` on the bucket copy — **PASS** (format fully settled)

The bucket copy **was** obtainable read-only, via the already-linked CLI —
`supabase storage cp "ss:///capture-media/…/voice-….m4a" <local> --experimental`. No secret handling
was required and nothing was written.

```
File type ID:   m4af
Data format:     1 ch,  48000 Hz, aac
estimated duration: 10.100000 sec
audio bytes: 40337
bit rate: 31778 bits per second
audio data file offset: 61440
Channel layout: Mono
```

| Spec assertion | Result |
|---|---|
| AAC-LC | **PASS** — `aac`, mono |
| Hardware sample rate | **PASS** — **48000 Hz** |
| Duration ±1 s | **PASS** — `afinfo` 10.10 s vs the store's 10.91 s; **0.81 s** apart |
| 32 kbps | **PASS / confirmed as designed** — **31,778 bps** |

🔴 **New finding — the ">20 KB floor" test in the spec is unsound.** This file is **101,777 bytes**
of which only **40,337 are audio**: the AAC data begins at byte offset **61,440**. A recording that
captured *nothing* would still clear a 20 KB threshold on container header alone. Steps 1, 3, 8, 10b
and 41 use that floor to separate "wrote audio" from "merely opened a file" — **it cannot do that.**
Use `afinfo`'s `audio bytes` on the synced copy instead, which is now a proven channel.

## 6.2 🔴 Correction — `<AppGroup>/CaptureMedia` **does exist**; devicectl simply cannot see it

§3a, §4 and §5 all recorded that `CaptureMedia` "does not exist on the device", inferred from an
8-entry App Group listing. **That inference was wrong**, and it misled three sessions.

`CaptureStore.mediaDirectory()` (CaptureStore.swift:775) resolves to
`containerURL(forSecurityApplicationGroupIdentifier:)` + `"CaptureMedia"` — the **container root**,
a sibling of `Library`, not a child of it. And `devicectl device info files --domain-type
appGroupDataContainer` **only enumerates `Library`, `Documents` and `tmp`**. A root-level directory
is invisible to it.

The file demonstrably existed: it was written, read back, and uploaded intact at 101,777 bytes.

⚠ **Correct §4's evidence-channel table.** It claimed *"Listing them (name, size, mtime) works;
copying them does not."* **Neither works.** For media under `mediaDirectory()`, devicectl offers no
listing and no copy. This also explains why photos synced fine while "CaptureMedia didn't exist" —
they were always there.

**The working channels for voice-file evidence are:** the SwiftData store (`ZVOICEAUDIOFILENAME`,
duration, source, remote paths), the `capture-media` bucket listing, and `afinfo` on a CLI-downloaded
copy. All three are now proven.

## 6.3 Step 36 — `on_device` is **not** a dead property: **PASS**

The parked finding from §2 ("neither confirmed nor cleared") is **cleared**. From the device:

```
voice.start  21:47:01.360Z            transcribing = True
voice.finish 21:47:02.880Z  reason=manual  segments=1  on_device=True
voice.start  21:47:22.611Z            transcribing = True
voice.finish 21:47:25.048Z  reason=manual  segments=1  on_device=True
voice.start  21:48:07.228Z            transcribing = True
voice.finish 21:48:18.282Z  reason=manual  segments=1  on_device=True
```

| Assertion | Result |
|---|---|
| `voice.finish` carries `on_device` | **PASS** — present, `True`, on all three |
| `voice.finish` carries `segments` | **PASS** — `1` on all three (all takes < 50 s, so no rotation — correct) |
| `voice.finish` carries `reason` | **PASS** — `manual` |
| `voice.start` carries `transcribing` | **PASS** — `True` |

Also seen this session: `capture`, `sync.route`, `capture.route_queued`, `sync.drain.done` ×2.

## 6.4 Still not exercised, and honestly why

| Assertion | Status | Reason |
|---|---|---|
| Discard leaves no orphan file | **NOT EXERCISED** | Three takes fired `voice.finish`; one file uploaded. Whether the other two were cleaned up **cannot be checked** — §6.2 means there is no listing channel for `CaptureMedia`. Needs an in-app assertion or a debug listing, not a device probe |
| Segment **rotation** (50 s boundary) | **NOT EXERCISED** | Every take was < 50 s (`segments=1`). Needs a >70 s hold — script blocks D/E/G |
| W2-4 sync Live Activity | **NOT EXERCISED** | Needs a sustained sync with work queued; the drains here completed in ~2 s in the foreground, where no Live Activity shows. Not driven, not guessed |
| Step 31 offline drain | **unresolved, 3rd session** | See §5.10 — needs a human toggling Airplane Mode |
| W2-1 four objects / W2-2 wall defect | needs Kody | Two distinct categories now shown (`table`, `textile`); four objects and the wall defect still need aiming |
| Interruptions, AirPods, wired headset, speech-off | needs Kody | Real calls and real hardware |

## 6.5 Tally

| Bucket | Count | Result |
|---|---|---|
| Voice media path (step 2) | 7 | **PASS** (§6.1) |
| `afinfo` format assertions | 4 | **PASS** (§6.1a) |
| `voice.*` telemetry incl. step 36 `on_device` | 4 | **PASS** (§6.3) |
| Flag reaches device | 1 | **PASS** (§6.0) |
| Corrections to earlier sessions | 2 | §6.1a (20 KB floor unsound), §6.2 (CaptureMedia exists) |
| Still not exercised | 6 groups | §6.4 |

Claim level: **device-verified** for the entire voice write/sync/format path and its telemetry.

**Device left:** online, unlocked, Airplane Mode off, signed in, 4 specimens on disk, WDA running on
`:8100`. Nothing committed or pushed.
