# TestFlight build 4 — "The Decision, Delivered"

Cut 2026-09-06 from `main` at **`43804dba0`** (`feat(approvals): merge w3-integration — the habit:
the Record of Decision, the successor thread, she sets the pace, the decision spread`), which carries
all three waves of the client approval experience.

Built from a dedicated worktree, **not** the main checkout: `main`'s `project.pbxproj` carries an
uncommitted local modification that is not this program's, and an archive must not pick it up.

| | |
|---|---|
| Worktree | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-tf` (branch `approvals/build-4`, retired at close) |
| Version | `MARKETING_VERSION 1.0`, `CURRENT_PROJECT_VERSION 4` — one line in `apps/mobile/Patina/Config/Version.xcconfig`, resolved identically by the app and the widget appex |
| Version commit | `31497b33d` `chore(ios): build 4 for TestFlight — the approval ceremony` |
| Merge to `main` | `e127de3ae` `chore(ios): merge build-4 version bump` (`--no-ff`; `main` had moved to `919db240e` during the build, so a fast-forward was no longer possible) |
| **ASC build id** | **`f48dd9b8-be03-4ea9-b508-35e6bef3f455`** |
| **processingState** | **`VALID`**, `expired false`, `minOsVersion 26.0`, `usesNonExemptEncryption false` |
| **IPA sha256** | **`f63623ebd6d493c6a85327318070782cfae554e6b3f73a56e145ac9033a874ea`** |
| IPA | 20,106,225 bytes, `.build/export-4/Patina.ipa` |
| Uploaded | `2026-09-06T00:25:38-07:00`; expires `2026-12-04` |

## The chain, as run

### 1 · Release gate

`IOS_GATE_UDID=973D1724-90BF-4A0A-B02D-481D561547B3 apps/mobile/Patina/scripts/ios-gate.sh release`
→ `** BUILD SUCCEEDED **`, exit 0.

**One thing worth recording for the next fresh worktree.** The first run of this tier failed
(exit 65) on `error: cannot find 'GitCommit' in scope` at `AppConfiguration.swift:77`.
`Patina/Generated/GitCommit.swift` is gitignored and written by the "Stamp Git SHA" run-script
phase; `git worktree add` therefore does not bring it, and Patina's target uses a
`PBXFileSystemSynchronizedRootGroup` whose file list is enumerated when the project loads — so on
the very first build in a new worktree the file does not exist yet, is not in the compile sources,
and the symbol is missing. That same build's script phase then wrote it, and the re-run was clean
with no source or project change. This is a first-build-in-a-fresh-worktree artifact, not a defect
in the tree.

### 2 · Archive

`xcodebuild archive -scheme Patina -configuration Release -destination 'generic/platform=iOS'
-allowProvisioningUpdates` → `** ARCHIVE SUCCEEDED **`, 02:21:35 → 02:23:49 (≈2m14s).

Read before exporting:

```
"CFBundleShortVersionString" => "1.0"
"CFBundleVersion" => "4"          (Patina.app)
"CFBundleVersion" => "4"          (PatinaWidget.appex)
"ITSAppUsesNonExemptEncryption" => false
"MinimumOSVersion" => "26.0"
```

`PrivacyInfo.xcprivacy` present at both `Patina.app/PrivacyInfo.xcprivacy` and
`Patina.app/PlugIns/PatinaWidget.appex/PrivacyInfo.xcprivacy` (ITMS-91053 is evaluated per binary).
dSYMs: `Patina.app.dSYM`, `PatinaDesignKit.framework.dSYM`, `PatinaWidget.appex.dSYM`.

### 3 · Export

The plain `-allowProvisioningUpdates` form fails `No Accounts` in a non-interactive shell (W0 block I,
run 1), so this went straight to the ASC API-key form with
`-authenticationKeyPath ~/.blitz/asc-agent/AuthKey_BlitzKey.p8` and its key/issuer ids.

`** EXPORT SUCCEEDED **`, 02:24:04 → 02:24:17 (≈13s), into `.build/export-4/`.
`DistributionSummary.plist` names the existing `iOS Team Store Provisioning Profile:
cloud.patina.app` and `…app.widget`; `Packaging.log` has **zero** "creating"/"registering" lines —
nothing new was minted.

`codesign -dv` on the exported app: `Identifier=cloud.patina.app`, `TeamIdentifier=VP22LXHT7L`,
`Format=app bundle with Mach-O thin (arm64)`, signed `Sep 6, 2026 at 2:24:15 AM`.

Entitlements — the check that exists only here, because the archive is signed with a *development*
profile and the export must re-sign with an App Store one:

```
Patina.app            application-identifier => VP22LXHT7L.cloud.patina.app
                      aps-environment       => production
                      application-groups    => [group.cloud.patina.app]
                      get-task-allow        => false

PatinaWidget.appex    application-identifier => VP22LXHT7L.cloud.patina.app.widget
                      application-groups     => [group.cloud.patina.app]
                      (no aps-environment key — 0 matches)
```

`aps-environment = production` is the one that would have silently cost the push round trip.
As in W0 runs 2 and 3, this machine's `codesign -d --entitlements :-` prints only an
"invalid entitlements blob" warning to stdout; writing to a file argument returns the real content,
which is what is quoted above.

### 4 · Upload

`asc builds upload --app 6762007888 --ipa … --wait` — the pure upload verb.
`publish testflight` was **not** used: it requires `--group` and would bundle steps this cut does
not want.

```
Uploading Patina.ipa (20106225 bytes) to App Store Connect...
Upload committed in App Store Connect.
Waiting for build 4 (1.0) to appear in App Store Connect...
Build f48dd9b8-be03-4ea9-b508-35e6bef3f455 discovered; waiting for processing...
```

Confirmed from ASC rather than the CLI's exit code — `asc builds list --app 6762007888 --paginate`:

| ID | Build | Version | Uploaded | Processing | Expired |
|---|---|---|---|---|---|
| `f48dd9b8-be03-4ea9-b508-35e6bef3f455` | **4** | 1.0 | 2026-09-06T00:25:38-07:00 | **VALID** | false |
| `c3e5b126-ad10-441f-9a73-ed55f06c1a8a` | 3 | 1.0 | 2026-09-04T13:39:26-07:00 | VALID | false |
| `9b61ad6c-49da-4356-bd7c-4b8bd8832bad` | 2 | 1.0 | 2026-05-12T15:34:03-07:00 | VALID | true |

No ITMS-91053 and no ITMS-90474 — the two that would have landed as `INVALID`.

### 5 · What to Test

An empty `en-US` localization pre-exists on a fresh build, so the verb is `update`, not `create`:
`asc builds test-notes update --build-id … --locale en-US --whats-new …`
(localization `f1eb65ab-6114-4260-b307-16c09d5adbca`).

Read back independently with `asc builds test-notes view`:

> This build is the approval ceremony.
>
> An approval from your designer now opens as an approval. Three acts sit side by side with equal
> weight — Approve, Return, Hold — and each says what it does before you touch it. Approve asks for
> your full legal name and then a press and hold; nothing is sent on a tap.
>
> Once answered, a decision carries a stamp in mocha: APPROVED, RETURNED, HELD, or SIGNED. A
> proposal you sign opens full screen — watch for the seal at the end of the act.
>
> On anything settled, an answered approval or a signed proposal, look for "Keep a copy" beside the
> mark. It builds a Record of Decision you can save or share.
>
> When your designer offers a choice rather than an ask, you get the decision spread: two plates
> side by side, three or more as a swipe. Tapping one only sets a leaning, and the held act names
> the option you chose. A typed name there is optional.
>
> Not ready to answer? "Remind me" holds the reminders — tomorrow morning, Sunday, when it is due,
> or not at all — and changes nothing about the answer. Settings carries the pace of everything else
> under Reminders: tell me right away, once a day, or once a week on Sunday.
>
> A push notification carries two acts on the lock screen: Open, and Ask a question.
>
> What to look for: nothing should read red or green — the marks are mocha and the palette stays
> warm. No number should stand where a word would do. And no screen should say gate, task, or
> overdue. If one of those words turns up anywhere, that is the bug.

1,505 characters, plain prose, no emoji. Every option name in it was read off the shipping Swift
rather than a design doc — the four snooze options from `SnoozeChoice.label`, the three cadences
from `ReminderCadence.label`, the three acts from `ProjectApprovalCopy.acts`, and the two
notification acts from `NotificationCategories`.

### 6 · The internal group

`asc testflight groups links view --group-id 71f90727-… --type builds` now returns build 4 alongside
3 and 2 — internal groups auto-attach, so nothing was added by hand.

`asc testflight distribution view --build-id f48dd9b8-…`:

| Auto Notify | Internal State | External State |
|---|---|---|
| true | **IN_BETA_TESTING** | READY_FOR_BETA_SUBMISSION |

`MiddleWest Client` (external, `2231934a-…`) still lists only build 3 — untouched.

## What was NOT done, deliberately

- **No beta review submission.** `asc testflight review submit` was not run. Build 4's external
  state is `READY_FOR_BETA_SUBMISSION` and stays there; Kody's call.
- **No App Store metadata change.** Nothing under versions, localizations, screenshots, pricing,
  or review details was written.
- **No external group added.** `MiddleWest Client` remains on build 3.
- **No device pass.** Nothing in this cut was walked on glass. The claim level for build 4 is
  **compile-green and processed-VALID** — every ceremony claim in What to Test rests on the wave
  walks (Simulator) and the merged test suites, not on a device. R1's eighteen-row device ledger is
  still owed and is unaffected by this build.
- **No push round trip proved.** `aps-environment = production` is confirmed in the signature;
  whether a push actually lands is a device row.
- **No git SHA in the binary.** By design: the "Stamp Git SHA" phase writes a real short SHA only
  under `Debug`; a `Release` archive gets `GitCommit.sha = ""`. Provenance for this build is this
  page plus the IPA sha256 above.

## Known, carried, and worth reading before invites go out

Both from the wave reports, neither closed by this build:

- **backend `M-R3-01`** — `decisionsMailedDirect` uses the whole digest window rather than a 24-hour
  floor, so an approval whose direct letter left early in a stretched window can be suppressed from
  a later summary. It under-sends; it never over-sends and never suppresses an overdue notice or a
  superseding edition.
- **iose `R3-M1`** — the "Don't remind me" confirmation promises an end condition nothing implements
  beyond the overdue notice. It goes quieter than the sentence claims, never louder.

Plus the five things W1 knew and could not close from a simulator, all still open and all listed in
`artifacts/ios-testflight-polish-2026-09-01/build/waves/w1/R1-READINESS.md` — most sharply
`W1-B-17` (the guest room list survives a sign-out) and the fact that **the widget has still never
been seen by anyone**.
