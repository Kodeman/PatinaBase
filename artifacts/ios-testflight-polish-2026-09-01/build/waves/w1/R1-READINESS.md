# First Flight · R1 — build 1 readiness

**KODY-RUN RELEASE.** The archive, the export, the upload and the device pass happen on Kody's machine
with his signing identity. An agent may run every read-only `asc … list` / `view` afterwards, and
drives the device **only** with Kody's phone connected and Kody watching.

Written by the **W1 closer** on **2026-09-03**. This is PROGRAM.md §4 with today's values filled in,
the four ids resolved from `build/waves/w0/asc-runbook.md`, the two path corrections W0 and W1 turned
up, and the W1 evidence recorded against every device row. **No angle bracket appears in any command
on this page**; every value is a literal or a variable assigned at the top of its own step.

---

## Step 0 — what must be true before you start

| | | |
|---|---|---|
| ☐ | **W1 is merged to `main`** and you are archiving from a `main` checkout | `first-flight/w1-integration` tip `08397a7d21441baee0c0ea634f75e68fd410f2d8`. It has **no remote**; Fable merges it |
| ☑ | **The 00559 renumber is settled** | Done on the branch by the W1 steward. `main` holds a different `00559`, plus `00560` and `00561`; L1-X's file is now **`00563_proposal_signing_multi_studio.sql`** with its RLS test at `supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql`. `00562` was free and is unchanged. `KODY-RUNBOOK-W1.md` §K1 |
| ☐ | **W0 blocks A–J are done** | `build/waves/w0/KODY-RUNBOOK.md`. §D (the demo account) gates Step 5's review notes; §G gates Steps 1, 5 and 7; §H is the flag payload |
| ☐ | **W1 block L is done** | `KODY-RUNBOOK-W1.md` §L — 00562. Without it the notification bell can never reach zero for a tester, and `D-07` will fail on a real device |
| ☐ | **The lane worktrees and simulator clones are retired** | six `ff-w1-l1*` clones plus three `ff-w1-walk-*`; `scripts/repo-gc.sh` sweeps stragglers |

### The values, once

```bash
export REPO=/Users/kody/Code/patina-merged
export ASC=~/.blitz/bin/asc
export APP=6762007888
export TEAM=VP22LXHT7L
export INTERNAL=71f90727-fc35-4499-824a-3794c06095de   # "Internal Patina" — Kody + Leah
export EXTERNAL=2231934a-d514-4f96-aae1-1745561f9353   # "MiddleWest Client" — stays empty until Step 7
export ARCHIVE="$REPO/apps/mobile/Patina/.build/archives/Patina.xcarchive"
export EXPORT="$REPO/apps/mobile/Patina/.build/export"
export IOS_GATE_UDID=973D1724-90BF-4A0A-B02D-481D561547B3   # unused by archive; set for the session
```

**Version at cut: `MARKETING_VERSION 1.0`, `CURRENT_PROJECT_VERSION 3`** — identical on the `Patina`
and `PatinaWidget` targets, or the widget trips ITMS-90473. ASC already holds build **"2"**, uploaded
2026-05-12 and now expired (`A2-01`).

**Two `asc` traps, both found by re-checking every command against the installed binary
(`build/waves/w0/asc-runbook.md` §0):**

1. A boolean flag is either bare or `=`-joined. **Never `--flag true`** — the value after a space is
   ignored *and* the stray word ends flag parsing, so every flag after it is silently dropped and the
   command still exits 0.
2. Run `asc` **outside** any agent sandbox: inside it every call dies with
   `tls: failed to verify certificate: x509: OSStatus -26276`.

---

## Step 1 — Pre-flight (read-only; an agent may run this)

```bash
cd "$REPO"
git log --oneline -1
grep -n 'CURRENT_PROJECT_VERSION\|MARKETING_VERSION' apps/mobile/Patina/Config/Version.xcconfig
ls supabase/migrations/*.sql | sort | tail -6
$ASC builds list --app $APP --paginate
$ASC testflight review view --app $APP
$ASC testflight app-localizations list --app $APP
```

Want: the integrated `main` tip; `MARKETING_VERSION = 1.0` and `CURRENT_PROJECT_VERSION = 3`;
`00555`, `00557`, `00562` and the renumbered `00563` all present in the listing; a `builds list` whose
highest existing number is **strictly less than 3**; a populated `betaAppReviewDetails`; and
`app-localizations` total 1.

---

## Step 2 — Archive · **the first Kody-only gate**

W1 exited on `ios-gate.sh release` green. `archive` is here, and only here, because it needs an
authenticated Xcode account, `-allowProvisioningUpdates` network round trips to App Store Connect and
a distribution keychain that can raise a prompt.

- [ ] `ios-gate.sh archive` exits 0 with automatic signing

```bash
cd "$REPO"
apps/mobile/Patina/scripts/ios-gate.sh archive
```

which is, expanded:

```bash
xcodebuild archive \
  -project "$REPO/apps/mobile/Patina/Patina.xcodeproj" \
  -scheme Patina -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates
```

⚠ **One thing W1 learned that will bite here.** During W1's own gate runs `xcodebuild` repeatedly hung
after finishing, retrying `com.apple.mobile.notification_proxy` against a connected but **locked**
iPhone (`The device is passcode protected`). If `archive` appears to hang after the build succeeds,
unlock the phone or unplug it — the work is done and the process is stuck on a device it does not
need.

Then read the archive before exporting it:

```bash
plutil -p "$ARCHIVE/Products/Applications/Patina.app/Info.plist" | grep -E \
  'CFBundleVersion|CFBundleShortVersionString|MinimumOSVersion|UIDeviceFamily|ITSAppUsesNonExemptEncryption'
ls "$ARCHIVE/Products/Applications/Patina.app/PlugIns/"
plutil -p "$ARCHIVE/Products/Applications/Patina.app/PlugIns/PatinaWidget.appex/Info.plist" | grep CFBundleVersion
find "$ARCHIVE/Products/Applications/Patina.app" -name 'PrivacyInfo.xcprivacy'
ls "$ARCHIVE/dSYMs/"
```

Expect `CFBundleVersion 3` on **both** plists, `MinimumOSVersion 26.0` (**D6**), `UIDeviceFamily [1]`
(**D4**), `ITSAppUsesNonExemptEncryption false`, `PatinaWidget.appex` present, and a
`PrivacyInfo.xcprivacy` at **the app root and inside the appex** — ITMS-91053 is evaluated per binary.
All five were product-inspected green on the W0 merge tip.

---

## Step 3 — Export, and the entitlement check that exists only here

`apps/mobile/Patina/scripts/ExportOptions.plist` is L0.1's file and is already in the tree. Confirm it
before using it:

```bash
plutil -p "$REPO/apps/mobile/Patina/scripts/ExportOptions.plist"
# want: method app-store-connect · destination export · teamID VP22LXHT7L · signingStyle automatic
#       uploadSymbols true · stripSwiftSymbols true
#       manageAppVersionAndBuildNumber FALSE · generateAppStoreInformation false
```

`manageAppVersionAndBuildNumber` is **false** on purpose: the build number comes from
`Config/Version.xcconfig` and nothing else is allowed to move it.

```bash
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$REPO/apps/mobile/Patina/scripts/ExportOptions.plist" \
  -exportPath "$EXPORT" \
  -allowProvisioningUpdates
```

**The check that only exists here** (`G-12`, `A2-24`): the archive was signed with a *development*
profile, so it carries `aps-environment: development` and `get-task-allow = 1`. The export must have
re-signed with an App Store profile and rewritten both.

```bash
unzip -o -q "$EXPORT/Patina.ipa" -d "$EXPORT/unzipped"
codesign -d --entitlements :- "$EXPORT/unzipped/Payload/Patina.app" 2>/dev/null | \
  grep -E 'aps-environment|get-task-allow|application-identifier|application-groups'
# want: aps-environment = production · NO get-task-allow · VP22LXHT7L.cloud.patina.app
#       · group.cloud.patina.app
codesign -d --entitlements :- "$EXPORT/unzipped/Payload/Patina.app/PlugIns/PatinaWidget.appex" 2>/dev/null | \
  grep -E 'application-identifier|application-groups'
# want: VP22LXHT7L.cloud.patina.app.widget · group.cloud.patina.app · no aps-environment
```

**If `aps-environment` is still `development`, stop.** Push will register sandbox tokens and R1's push
round trip will silently never arrive. That is the moment to split the Debug/Release entitlements
files (`C9-20`) and re-archive.

> A note from W1's walker builds, so it is not mistaken for a defect: on a **simulator** build
> `codesign -d` reports `adhoc` / `TeamIdentifier=not set` and an empty entitlement dict. That is the
> simulator lie; `Patina.app-Simulated.xcent` carries the truth. It does **not** apply to this
> exported device build, where `codesign -d` is authoritative.

---

## Step 4 — Upload and processing

```bash
$ASC publish testflight \
  --app $APP \
  --ipa "$EXPORT/Patina.ipa" \
  --wait
```

Then confirm from ASC, not from the CLI's own exit code:

```bash
$ASC builds list --app $APP --paginate
# want a NEW row: version "3", processingState VALID, expired false,
#                 minOsVersion 26.0, usesNonExemptEncryption false
```

`processingState INVALID` here is where ITMS-91053 (missing privacy manifest, `A2-02`) and ITMS-90474
(iPad multitasking, `A2-03`) would land. Both are closed in W0 · L0.1; if one appears anyway, the
email names the exact code.

---

## Step 5 — What to Test, and the internal group

**Path correction.** PROGRAM.md §4 names `build/waves/r1/what-to-test-build1.md`. That directory does
not exist. The text is written and lives at
**`artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/what-to-test-build-1.md`** (W0 · L0.5).

**Read it once before posting it**, because W1 changed two of its claims:

- Item 9 tells the tester to add the **medium** widget and says tapping a line opens that line. That is
  **D5**, it is in the code (`.systemMedium` in `supportedFamilies`, a `Link` per medium row), and
  **no walk has ever seen a placed widget** — three attempts, the springboard gallery will not open to
  synthetic taps. It is honest to ask for it; know that `D-10` is its first real look.
- The "already known" list says help articles exist for a few screens and *"where there is no article,
  we have taken the ? away rather than open an empty page"*. **W1 made that true** — `C5-02` and
  `R-10` are closed, the six `?` doors print a local fallback and never reach Sanity. What is **not**
  yet true is the tour: production Sanity still serves retired tour copy and overrides the correct
  in-app text (`A4-01`, `C5-01`, W0 runbook §F). Either publish §F first, or the tester's first
  three coach marks describe a UI that no longer exists.

```bash
# the build id, with no placeholder and no eyeballing
BUILD=$($ASC builds info --app $APP --latest --platform IOS --version 1.0 \
          --exclude-expired --output json | jq -r '.data.id')
echo "$BUILD"    # print it, and sanity-check it against `builds list` before using it

# What to Test — the selector flag is --build-id
$ASC builds test-notes create --build-id "$BUILD" --locale en-US \
  --whats-new "$(cat "$REPO/artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/what-to-test-build-1.md")"

# add the build to the internal group — this lives under `builds`, not `testflight groups`
$ASC builds add-groups --build-id "$BUILD" --group "$INTERNAL"
```

There is **no** `asc testflight groups add-build` and **no** `asc testflight submit`; the first draft
of this runbook invented both. `Internal Patina` skips Beta App Review entirely, which is the point:
the whole chain — install, sign-in, push, links — is proved on an internal build before Apple ever
sees it (`A2-18`). `builds add-groups` takes `--submit --confirm` to submit for beta review in the
same call; **do not** pass them here. The external submission is Step 7, after the device pass.

---

## Step 6 — The device pass, with W1's evidence against every row

**Device:** Kody's iPhone 17 Pro Max. **Toolchain:** `DEVELOPER_DIR=/Applications/Xcode-beta.app` (the
phone is on an iOS 27 seed). If automation is used, the WebDriverAgent target must be **15.0**.
Airplane Mode via automation is **one-way** — turn it on last, or turn it off by hand.
**Install from TestFlight**, not from Xcode: the point is to test the artifact Apple processed.

Evidence to `artifacts/ios-testflight-polish-2026-09-01/shots/r1/`, ledger to
`build/waves/r1/device-pass.md`. Every row is reported at **device-verified**; a row that cannot run is
reported as **blocked**, with the decision it waits on — never as passed.

The full text of each row is PROGRAM.md §4 Step 6. What follows is what **W1 changed** about each, so
nobody re-proves what is proved or assumes what is not.

| row | W1 state going in |
|---|---|
| **D-01** cold launch time | `C1-18` closed on a simulator only, and explicitly *unmeasured with instruments*. **This row is the only real number.** The 2.131 s figure in the charter is a Debug simulator build |
| **D-02** Sign in with Apple → homeowner | `A3-07` **open** — a simulator has no Apple Account, so no walk could touch it. The role check is this row's whole job |
| **D-03** email code from a real inbox | The in-app half is closed and heavily walked (`P-20`, `P-22`, `C1-37`, `P-30`, `P-25`, `W1-A-06`). What is unproven is the **inbox**: the Strata template's `{{ .Token }}` patch is asserted from memory |
| **D-04** the demo credential | `A3-16` **open** — no allow-listed pair exists locally. Walk A probed the server leg: a non-allow-listed pair returns `403 invalid_credentials`, so it fails closed. Needs W0 §D first |
| **D-05** LiDAR scan → upload → server row | `C7-05`, `C7-15`, `GAP4-25` all **open, not walkable**. The typed-room path is closed and walked (`GAP4-02`, `GAP4-03`, `B-03`, `B-04`, `W1-B-06`) |
| **D-06** QR approval with Face ID | Not reached by any W1 walk. `Features/QRAuth/**` is L1-A's and carries 2 findings in the whole corpus |
| **D-07** push round trip | Blocked on **D9**. ⚠ **read `W1-C-11` before running this**: a cold-launch request burst intermittently stalls after the socket connects and every request then times out at 30 s until relaunch. Its worst face is *exactly* this row — a push tapped from a cold app landing on an error screen whose retry does not recover. This row is also where `C2-07` gets its production proof: mark all read, then **cold-relaunch** and look at the bell |
| **D-08** universal link from Mail, signed in | `C2-02` closed (partial), `W1-C-12` closed — one spelling across AASA, the route table and the portal. `/piece/` singular opens the app; `/pieces/` opens Safari, which is now honest because nothing writes that URL |
| **D-09** universal link, signed out | `C2-21` and `GAP7B-09` both **closed on the real path**, twice, on the typed-password route. This row is the device confirmation, not the first look |
| **D-10** the widget on the Home Screen | `GAP7B-02`, `GAP7B-03`, `GAP7B-04` all **open** — three attempts, the springboard gallery will not open to synthetic taps. **This is the widget's first sighting anywhere.** With `house-widget` OFF, which is the TestFlight first-launch state |
| **D-11** App Group on device | `B-16` closed on the simulator (the snapshot is rewritten and `house-record.json` deleted at sign-out); the shared container on glass is this row |
| **D-12** Apple Pay / invoice payment | `B-28` and `GAP2-24` both **closed and walked** — the failure panel is un-clipped with two recovery actions, and `Pay $4,250.00` is a pinned footer visible at rest. Blocked on **D10** for a live key |
| **D-13** dark mode | Every claimed ratio was **measured on glass** by walk C (§3 · L1-D). The orb is 11.15:1 in dark. This row is hardware confirmation |
| **D-14** largest Dynamic Type | `GAP1B-01`, `GAP1B-02`, `GAP1B-03`, `P-34`, `C-06` all closed and walked at AX-XL **and** AX3XL. ⚠ **five open rows will show up here**: `W1-B-18` (the tour bubble offers no Skip and no Next at AX-XL), `W1-C-17` ("Choo…"), `W1-B-11` ("MEMBER SINCE" clipped), `W1-C-18` ("Browse pie…"), `W1-A-09` (the consent line below the fold — reachable by scrolling, proven) |
| **D-15** VoiceOver on the first screen and the decision sheet | `C-18`/`W1-B-05` closed — "About Today" is a reachable 44×44 `AXButton` again. Tap targets measured at 44 pt across Welcome (`GAP1B-08`) and the chip row (`C6-18`) |
| **D-16** airplane mode | `R-01`, `R-02`, `R-03`, `C4-03`, `C4-12`, `C1-19` closed and walked offline. ⚠ **expect `W1-B-16`**: an offline **cold** launch prints a retained Studio count with no staleness line. And this is where `W1-C-11`'s deliberate radio round trip belongs |
| **D-17** second launch, second account | `B-15`, `C2-06`, `GAP3-18` were all walked green at re-walk 1 — and then ⚠ **`GAP3-18` re-opened at re-walk 2 as `W1-B-17`**: the guest Your Spaces still lists the previous account's room after a sign-out, on a device whose guest Studio says "Rooms: 0". Reproduced twice. **Expect this row to fail on that sub-claim**, and it is a privacy leak on a shared phone |
| **D-18** delete account | `A-101` closed and **walked on glass** — the alert names the account, the server data, what is retained and now "indefinitely". Run it on a throwaway account; walk A opened the alert and cancelled |

---

## Step 7 — Beta App Review, then the external group

```bash
# submit for beta app review — the subcommand is `testflight review submit`,
# it takes --build-id, and --confirm is required
$ASC testflight review submit --build-id "$BUILD" --confirm

# on approval, add the external group (again: `builds add-groups`)
$ASC builds add-groups --build-id "$BUILD" --group "$EXTERNAL"
```

`MiddleWest Client` stays empty until the review passes (`A2-18`). Leah's clients are invited only
after the internal chain is proved and the device pass is clean.

**R1 exits when:** a build with `processingState VALID` is installable from TestFlight, the device-pass
ledger has a line for all eighteen rows, and every row is either passed at device level or explicitly
blocked on a named decision.

---

## What R1 will meet, in one list

Five things W1 knows about and cannot close from a simulator. None of them is a reason not to cut the
build; all five are reasons to read the ledger before the invites go out.

1. **`W1-B-17` / `GAP3-18`** — the guest room list survives a sign-out. `D-17` will meet it.
2. **`W1-B-16` / `L07-05`** — an offline cold launch prints a stale Studio count as current. `D-16`.
3. **`W1-C-11`** — the cold-launch stall. `D-07` and `D-16`.
4. **`W1-B-18`** — no Skip and no Next in the tour at accessibility sizes. `D-14`.
5. **The widget has never been seen by anyone.** `D-10` is its first look, and What to Test asks
   testers to place it.

And two that are W0's, not W1's, and still gate rows: **§D** (the demo account → `D-04`) and **§F**
(the Sanity tour bodies → the first three coach marks a tester sees).
