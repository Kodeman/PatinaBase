# W5 ship report — Patina Field, the People room (P3 iOS)

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build` (branch `build/people-room-crm-2026-09-11`)
App: **Patina Field** — on-disk `apps/mobile/Capture`, bundle `cloud.patina.field`, scheme `field://`
Date: 2026-09-13

**Claim ladder, used strictly below: compile-green < sim-verified < device-verified.**

---

## 1. Gate — GREEN

`apps/mobile/Capture/scripts/capture-gate.sh all`, against the iPhone 17 Simulator. Full output:
`artifacts/people-room-crm-2026-09-11/build/w5-closeout/capture-gate-all.txt`

```
✔ build
✔ tests
✔ lint
✔ fc-r3 sweep (inbox)
✔ fc-r3 sweep (ai)
✔ principle-4 sweep
GATE EXIT: 0
```

The gate regenerates `Capture.xcodeproj` from the source tree first (`scripts/generate_project.rb`), so the
green covers the current file set, not a stale project.

**Sandbox note:** the first gate run failed with `CoreSimulatorService connection became invalid` /
`error: permissionDenied`. That was the agent sandbox denying CoreSimulator sockets and `~/Library`
DerivedData writes, not a code failure. Re-run with the sandbox disabled — green, as above. The failing
run's output was overwritten by the green one; the failure signature is recorded here.

## 2. Code state

Nothing new was written this pass. W5's three People-room screens and every review round (r1–r8) were
already committed on this branch before close-out:

| Commit | What |
|---|---|
| `395cd420a` | `feat(field): the People room on the designer's phone — roster, person, the way in` |
| `a19e548cb` | r1 — the record's consent word, the words VoiceOver was missing |
| `35ec452e4` | r2 — name the People room's five inputs for VoiceOver |
| `2b4d8afe4` | r3 — the link's real end date, the card's own change log, the job as the gate |
| `fd3175a52` | r4 — the job at the firm, R-Q's consent sentence on the real card |
| `d47575a1d` | r5 — keep the Companion off the People room |
| `514e3a535` | r6 — 44pt tap targets on five controls; stop the mock opening the wrong person |
| `b93e58297` | r7 — the site-access dead zone, the mint result screen's 44pt floor, dimmed disabled rows |

Round 8 (`w5-review-r8.md`) found no new blocking defect; its three carried-open items
(r2-3 raw E.164 in real mode, r2-5 `alarm_ref` unread, r7-3 seats on other projects) are
source-only/by-design and are listed in §6 below.

## 3. Simulator walk — sim-verified

iPhone 17 Simulator, explicit udid `C8850509-C7DC-43C5-9226-9446404EE98A`, mock mode
(`CaptureKitMocks` — the Simulator default), driven by `capture-run.sh PR1.roster` then the blitz-iphone
tools with that explicit udid. Screenshots in `build/w5-closeout/`:

| Step | Evidence | Level |
|---|---|---|
| PR1 roster renders, scoped to the active job | `w5-sim-01-roster.png` — "Okonkwo residence", R-U head line "Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026.", the ON THE JOB · THIS WEEK band, four seats with reach words and dialable numbers | **sim-verified** |
| `people.openSiteAccess` opens PR3 | tapped AX frame `{19.5, 223.83}, {363, 55.67}` → `w5-sim-02-site-access.png` | **sim-verified** |
| PR-r holds — Patina never carries the gate code | `w5-sim-02-site-access.png` prints "Lockbox, version 3. The code is held off Patina; ask Luis Ochoa." | **sim-verified** |
| PR-w holds — studio-only | same shot: "Studio only. This card never reaches a client page." | **sim-verified** |
| The call-first lines are full-width ≥44pt targets (R-X) | AX scan: `people.callFirst.F-09` — "Call Luis Ochoa, superintendent", frame `{20, 260.67}, {362, 44}` | **sim-verified** |
| Every roster phone line is its own ≥44pt target | AX scan: `people.tel.seat-F-04/-F-05/-F-02`, each `362 × 44` | **sim-verified** |

### The `tel:` tap — NOT verified at any level

Tapping `people.callFirst.F-09` at (201, 282) on the Simulator produced **no dialer prompt**
(`w5-sim-03-tel-tap-no-dialer-on-simulator.png` is byte-identical in content to the pre-tap screen).
That is expected: the iOS Simulator has no Phone app, so `tel:` never resolves. It is also exactly why
the task asked for the tap on hardware.

What IS established is **compile-green**, by source, not by run:
`FieldPhoneLine` builds the URL at `CaptureKit/CaptureKit/Work/FieldRosterRules.swift:133` —
`return URL(string: "tel:\(number)")` — and `SiteAccessScreen.swift:311-322` wraps the whole line in a
`Link` carrying `people.callFirst.<id>`.

**The dialer prompt itself is unverified.** See §4.

## 4. Device pass — INSTALL-verified only; the walk did not happen

A physical iPhone **is** attached: **Kody's Phone, iPhone 17 Pro Max, UDID
`00008150-00016C8A21DA401C`** (wifi, Developer Mode on). A second, **iPhone 13 Pro, UDID
`00008110-001630212231801E`**, is also paired.

What succeeded:

- **Device build** — `xcodebuild build -configuration Debug -destination platform=iOS,id=00008150-…`
  with `-allowProvisioningUpdates` and the ASC API key → `** BUILD SUCCEEDED **`, signed
  "Apple Development: Kody Kochaver (BD8AHP9A59)", profile "iOS Team Provisioning Profile:
  cloud.patina.field".
- **Install on hardware** — `xcrun devicectl device install app --device 00008150-…` →
  `App installed: bundleID: cloud.patina.field`, installationURL
  `/private/var/containers/Bundle/Application/3D3724BD-1E11-4A62-A7A5-2ED6E0A577F4/Capture.app/`.

What blocked the walk — **both phones are locked, and I cannot unlock them**:

```
$ xcrun devicectl device process launch --terminate-existing --device 00008150-00016C8A21DA401C \
    cloud.patina.field -- -CaptureUseMocks -CaptureScreen PR1.roster
ERROR: The application failed to launch. (com.apple.dt.CoreDeviceError error 10002)
  The request was denied by service delegate (SBMainWorkspace) for reason: Locked
  ("Unable to launch cloud.patina.field because the device was not, or could not be, unlocked").
```

Attempted twice, ~5 minutes apart, same result. The iPhone 13 Pro fails one step earlier:

```
$ xcrun devicectl device install app --device 00008110-001630212231801E …
ERROR: The developer disk image could not be mounted on this device. (error 12040)
  The operation failed because the device was still locked. (error 10003)
```

Screen automation is also unavailable: blitz-iphone `setup_device 00008150-…` returns
`Error preparing setup instructions: No development team found. Sign in to Xcode with your Apple ID
first (Xcode -> Settings -> Accounts).` — WebDriverAgent cannot be built, so `scan_ui` /
`get_screenshot` / `device_action` cannot reach either phone even once unlocked.

**Therefore: nothing in W5 is device-verified. The highest claim for behaviour is sim-verified**, plus
`builds-and-installs-on-hardware` for the binary itself. `build/ios-w5-device/` was created and is empty
— no device screenshots exist.

## 5. TestFlight — uploaded

**The README's "App Store Connect app record — BLOCKED on Kody" section is STALE.** The record exists:

```
$ asc apps list --bundle-id cloud.patina.field
{"data":[{"type":"apps","id":"6805156812","attributes":{"name":"Patina Field",
  "bundleId":"cloud.patina.field","sku":"cloud.patina.field","primaryLocale":"en-US"}}],
  "meta":{"paging":{"total":1}}}
```

Preconditions, each checked before archiving:

| Precondition | Check | Result |
|---|---|---|
| ASC API key present under `~/.blitz` | `ls ~/.blitz/asc-agent` → `AuthKey_BlitzKey.p8`, `config.json`; `asc auth status` → credential "BlitzKey", isDefault true | **PASS** (names only; no key material read or printed) |
| ASC app record for `cloud.patina.field` | `asc apps list --bundle-id cloud.patina.field` → 1 result, app id `6805156812` | **PASS** |
| Signing certificate + profile | archive signed via `-allowProvisioningUpdates` + `-authenticationKey*`; export re-signed Distribution | **PASS** |
| Existing builds (for the bump) | `asc builds list --app 6805156812` → builds 2, 3, 4, all `VALID`; newest build 4 | **PASS** — bumped to **5** |

Chain run: `scripts/archive-testflight.sh --skip-regen --build-number 5 --app-id 6805156812`
(`--skip-regen` only because `capture-gate.sh` had just regenerated the project; no source changed
between). Full output: `build/w5-closeout/testflight-archive-upload.txt`.

- `** ARCHIVE SUCCEEDED **` → `PatinaField-20260913-005945.xcarchive` (101M)
- `** EXPORT SUCCEEDED **` → `Capture.ipa` (16M), method `app-store-connect`, team `VP22LXHT7L`
- IPA verified before upload: `CFBundleVersion 5`, `CFBundleShortVersionString 0.1`,
  `CFBundleIdentifier cloud.patina.field`,
  `Authority=Apple Distribution: Middle West Studio LLC (VP22LXHT7L)`, `TeamIdentifier=VP22LXHT7L`
- `Upload committed in App Store Connect.`

**Build number 5 (0.1). Processing state at close-out: see §5.1.**

### 5.1 Processing state

```
$ asc builds info --build-id 23a23b88-5ac3-484a-bb94-e38f6e6e8ea2
{'version': '5', 'processingState': 'VALID', 'usesNonExemptEncryption': None,
 'expired': None, 'minOsVersion': '18.0', 'buildAudienceType': None,
 'uploadedDate': '2026-09-12T23:02:34-07:00'}
```

| | |
|---|---|
| App | Patina Field, `cloud.patina.field`, ASC app id `6805156812` |
| Build | **5** (marketing version 0.1) |
| Build id | `23a23b88-5ac3-484a-bb94-e38f6e6e8ea2` |
| Processing state | **VALID** — processing finished, the build is on TestFlight |
| Minimum iOS | 18.0 |
| Distributed to testers | **No.** `buildAudienceType` is null and no group was assigned — assigning testers is an external send, which this program does not do automatically. See §6.4. |
| Export compliance | **Not declared.** `usesNonExemptEncryption` is null. See §6.3. |

A build sitting at VALID with no group is uploaded and processed but not yet in any tester's TestFlight
app. That last step is Kody's.

## 6. Kody's steps — what is his, not mine

1. **Unlock a phone and re-walk on hardware.** Everything below `device-verified` in §3 stays there until
   someone walks it on an unlocked device. The binary is already installed on Kody's Phone
   (`00008150-00016C8A21DA401C`); relaunch it with:
   `xcrun devicectl device process launch --terminate-existing --device 00008150-00016C8A21DA401C cloud.patina.field -- -CaptureUseMocks -CaptureScreen PR1.roster`
   Walk: roster → "Open the site access card" → tap "Call Luis Ochoa, superintendent" and confirm iOS
   raises the dialer prompt. That is the one claim this pass could not make.
2. **Sign Xcode into an Apple ID** (Xcode → Settings → Accounts) if device automation is wanted — without
   a development team, blitz-iphone cannot build WebDriverAgent, so no agent can screenshot or drive
   either phone.
3. **Export compliance on build 5.** First-time-per-build prompt in App Store Connect. Patina Field uses
   standard encryption only (HTTPS, no custom crypto) — answer accordingly, or set
   `ITSAppUsesNonExemptEncryption` in `generate_project.rb` to stop the prompt recurring.
4. **Assign build 5 to a tester group.** Two groups already exist on the app:
   `Middle West` (internal, id `d4aaaca3-4d0a-41e4-a942-de4b3b184525`) and
   `MiddleWest Studio` (id `72b14f9a-2059-4dec-ad82-90a052d2bced`).
   `asc builds add-groups --build-id <BUILD_ID> --group d4aaaca3-4d0a-41e4-a942-de4b3b184525`
   (this program does no automated external send, so no tester is invited by an agent).
5. **"What to Test" note**, if the testers should be told what changed:
   `asc builds test-notes create --build-id <BUILD_ID> --locale en-US --whats-new "…"`.
6. **Privacy nutrition labels** — not required for a TestFlight *upload*, required before any App Store
   release (`asc-privacy-nutrition-labels` skill). Not touched here.
7. **Fix the stale README.** `apps/mobile/Capture/README.md` § "App Store Connect app record — BLOCKED on
   Kody" asserts no app record exists. It does (`6805156812`). Left unedited this pass because W5's
   pathspec is source + artifacts and another wave is live in the worktree; worth a one-line correction.

## 7. Carried-open findings (r8, unchanged — not regressions, not fixed here)

| # | Finding | Level | Why it stands |
|---|---|---|---|
| r2-3 | Real-mode phone lines print raw E.164 | compile-green / source-only | `PeopleRoomWire.swift:73-74` sets `phoneDisplay: phoneE164`; mock fixtures are pre-formatted so the Simulator never shows it. Needs a real-mode run to see. |
| r2-5 | `project_site_access_cards.alarm_ref` never read or shown | compile-green | `SupabasePeopleRoomService.swift:253-256` omits it from the select list |
| r7-3 | A person card lists that person's seats on OTHER projects | by design, flagged | `fetchSeats(personID:)` filters on `person_id` only; `FieldPersonSeatLine`'s doc comment says "on this job or another (read-only here)". Awaiting a ruling, not a defect. |
| r8-1 | `FieldSiteAccessRules.looksLikeACode` can false-positive on compound free text | source-only, medium confidence | Withholds a legitimate fact rather than leaking a code — fails safe, in PR-r's direction |

## 8. What this pass did NOT do

- No prod DB write. No Strata call of any kind beyond App Store Connect.
- No local DB reset, no `supabase` command.
- No pnpm build, no `apps/designer-portal` or `packages/` file touched (W2 is live in this worktree).
- No Swift source changed — the gate ran against the tree as r8 left it.
