# iOS 27 program — the next wave
### W1a + W2 (first half): Field repair, the shared-direction contract, and the push rail's server half

Assembled 2026-09-24 by Fable, the planner of record, from two independent drafts (Fable's
`W1A-01..14`, Astra's `NW-01..15`) and the two adversarial reviews each wrote of the other. The
Fable draft is the spine (its lane shape survived both reviews); Astra's draft supplied six
grafts that are recorded in §11. Every file:line anchor below was re-opened on `main` at
`f1d8837f5` before it was kept; every review finding was re-verified against the file it cites
before it was accepted or rejected.

**Revision 2 (2026-09-24).** An independent Astra fact-check of revision 1 returned twenty
findings and two readbacks. Each was re-opened against the cited code; §12 records the
disposition of every one. The structural consequences: three tickets added (W1A-00, W1A-14,
NI-05), the NI-01 audience contract and the NI-02 clearing semantics rewritten, W1A-06's fix
moved to the call sites, W1A-05's compile-time-constant alternative removed, and the
project-generation rule restated so it is compatible with the gate every Field ticket runs.

This plan is **local only**. Every ticket lands in a worktree and stops at a pinned ref. The
prod mutations it produces (00668, 00669, 00670 if Q1 is ruled, `apns-send`,
`companion-message`) and any App Store Connect upload are named in §7 and wait on Kody's
in-session go.

---

## 0. The standing decisions this wave is built on

Unchanged from DELIVERY-PLAN §0/§7, restated because three of them decide tickets here:

- **No feature flags, anywhere.** Both apps are pre-release on TestFlight. Permission prompts,
  consent gates, auth state, `@available` checks and test-injection seams are not flags. A
  compile-time Boolean that dormant-disables finished functionality **is** a flag. **Field
  still reads one** — `"field-companion-voice"` at four sites (§5, W1A-05). That is a standing
  violation, not a design; it gets a ticket and a ruling.
- **Take the breaking changes now** — but pre-release is not permission to destroy a tester's
  unsynced captures. `PieceMigrationCarry.swift` is the precedent: a lossless carry stage, not a
  drop.
- **Field project physics.** `generate_project.rb:29` `rm_rf`s and regenerates the tracked
  `Capture.xcodeproj`; every new Swift file under `Capture/` or `CaptureKit/` changes the
  pbxproj. **Every tier of `capture-gate.sh` regenerates the project before it builds**
  (`capture-gate.sh:76-79` `generate()`, called at `:88`, `:99`, `:114`), so worktree-local
  regeneration during verification is not only allowed, it is unavoidable. What is
  single-owner is the **committed** `Capture.xcodeproj/project.pbxproj` and any target-graph
  edit to `generate_project.rb`: those are written by T1 alone, in the integration worktree,
  at wave close (W1A-12). Every other Field executor treats `Capture.xcodeproj/` as
  build output — it never enters their `git commit --only` pathspec. No ticket runs
  `generate_project.rb`, `capture-gate.sh`, `capture-shots.sh` or `archive-testflight.sh` in
  the main checkout — each Field ticket works in its own worktree with its own simulator clone
  exported as `CAPTURE_SIM_UDID`, deleted afterwards. Patina's synced root groups make file
  adds free there.
- **Lane cap.** Two Field lanes, two Patina lanes, one non-iOS lane. Local Postgres is shared:
  the DB tickets run one at a time, one reset each.
- **Sidequest mechanics.** `commit` fails with ENOBUFS in this repo, `submit` is unwinnable,
  and the `add` validator rejects any shell variable in a verify string
  (`execute/sidequest-upstream-defects.md` §1, §2, §4). Consequences for this plan: every
  `verify` below is variable-free (the simulator UDID is *exported in the shell* before the
  gate runs, never written into the string); executors deliver by `git commit --only -- <in-scope
  paths>` in their worktree, pin `refs/sidequest/SQ-<n>`, try `submit` once, then release as
  `technical_blocker` with the SHA.

---

## 1. Scope, and why this wave

### 1.1 What is already done (verified on `main`)

| Wave | Landed | Evidence |
|---|---|---|
| W0 | Gates, contracts, lexicon table | `execute/W0-DISPATCH.md`, `execute/contracts/`, `execute/lexicon.{md,json}` |
| W1 Field freeze | SQ-194..199, 205, 210, 211 | `3ede4cccf` (SQ-199 lexicon sweep), `3ff67dbdf` (SQ-198 schema V2 Specimen→Piece with carry stage) |
| T4 Patina | SQ-200, 201, 206 | on `main` |
| T6 non-iOS | 00660, 00661, 00664–00667 on Strata; `project-ffe-document-extract`, `spec-pdf`, `spec-book-render` deployed | `aaaa3f664` (SQ-203 server half, 00664), `f1d8837f5` (SQ-214, 00667) |
| Portal | SQ-207, SQ-213 | `1b8b3d0f6` |

The D8 rename is complete on the user-visible surface: no `"…specimen…"` string literal
remains under `Capture/` or `CaptureKit/` except frozen raw values (`CaptureScreenID.swift:26,
:28`, `CaptureLifecycle.swift:15`, `CaptureSyncAttributes.swift:49`, two `@AppStorage` keys) and
the carry stage's log lines. What SQ-199 left is **copy**, not nouns: eight sites now read
"Add to piece", "a multi-shot piece", "Piece \(id) not found in the local store." — literal
substitutions nobody has approved (`lexicon.md:204-240`; nine `needsRuling: true` rows in
`lexicon.json`).

### 1.2 What this wave is

DELIVERY-PLAN §4 names W1a as "the remaining Phase 0 items, now safe to parallelise" and W2 as
"the three value paths". This wave takes **all of W1a** and the part of W2 that has no
unresolved dependency on Kody's hands (a provisioned push capability, a working `asc`, an
X-06 ruling):

1. **Field repair (W1a, both Field lanes).** Reach Settings/Account/QR-approve/photo-import in
   Release; wire `hardwareEntry` from the device's actual capability; feed `SmartGuessSheet`
   the observations it discards; the measured contrast failures; delete the last remote flag;
   bump the payload schema.
2. **The shared-direction contract (W2 T4, Patina-1).** The projection T4 must cache does not
   exist as a ruled record (DELIVERY-PLAN §5). This wave writes the proposal and, only once
   Kody rules it, `PatinaSchemaV2` — with the server's typed revocation answer (NI-05) built
   against the same ruling, so the purge D4 demands has something to fire on.
3. **D5 acceptance (W2 T7, Patina-2).** The three flags are deleted (SQ-200/201/206); nobody
   has yet judged house-first / house-widget / direct-orders as a tester will meet them. The
   order sheet needs an injection seam first (W1A-14) or the acceptance cannot drive it.
4. **The push rail's server half (W2 X-04, non-iOS).** `device_push_tokens` gets an `app`
   column and `apns-send` a per-app topic and audience — deployed and backward-compatible
   *before* any Field build that registers a token exists. The Field client half waits (§8).
5. **Owed follow-ups folded in:** SQ-198's F6 server projection of `confirmations`/`proposals`
   plus the `schemaVersion` 4 bump; `companion-message`'s model pin; the SQ-199 copy ruling
   packaged for Kody.

### 1.3 What this wave is not

Not W3 (camera-to-Document), not W3b (Live Activity — one Field lane for 20 lane-days that this
wave cannot spare), not W4, not W5. Not a TestFlight distribution: §7 names the upload owed and
what must be true first.

---

## 2. Lanes and the critical path

```
Field-1   W1A-00 release tiers (T1, S) ─► W1A-01 reach Release (T2, L) ─► W1A-07 T7 accept (M)
          ─► W1A-12 T1 integrate (M)
Field-2   W1A-03 hardwareEntry (S) ─► W1A-04 SmartGuess inputs (M) ─► W1A-05 flag → consent (M, RULING)
          ─► W1A-06 contrast pins (S) ─► W1A-02 camera-denied seam (S) ─► W1A-08 schemaVersion 4 (S)
Patina-1  W1A-09 CONTRACT-C proposal (T4, M) ─► [Kody rules X-06] ─► W1A-10 PatinaSchemaV2 (T4, L)
Patina-2  W1A-14 OrderSheet injection (T4, S) ─► W1A-11 T7 D5 acceptance (M) ─► W1A-13 token carries app (T4, S)
non-iOS   NI-01 00668 push app column + apns-send (T6, M) ─► NI-02 00669 F6 projection (T6, M)
          ─► NI-03 companion model resolver (T6, S) ─► [Kody rules X-06] ─► NI-05 00670 typed review answer (T6, S)
          NI-04 lexicon copy ruling packet (T5, S, lane-less)
```

**Critical path** is Field-1: the Release tiers come first because W1A-01's tests run under
them; reachability is the largest single ticket (L); T7 cannot judge Release navigation until
it lands; and T1's committed pbxproj regeneration waits for every Field ticket on both lanes —
W1A-12 is the wave's last commit. Roughly 12 lane-days on Field-1, 10 on Field-2, 8 on
Patina-1 (of which 5 are gated on the X-06 ruling), 6 on Patina-2, 9 on non-iOS (of which 2
are gated on X-06). **~45 lane-days; ~12 calendar days with five lanes** if X-06 is ruled by
day 3.

Two things sit on the critical path that are not tickets: the **X-06 ruling** (blocks W1A-10
and NI-05) and the **flag ruling** (blocks W1A-05, and therefore the Field-2 tail). Both are
§10 questions with a recommended answer; each can be ruled in one line.

---

## 3. The ticket table

| ID | Title | Team | Lane | Size | Depends on | Verify |
|---|---|---|---|---|---|---|
| W1A-00 | `capture-gate.sh` gains `release` and `release-ui` tiers (Release-configuration build; `CaptureUITests` under Release) | T1 | Field-1 | S | — | `apps/mobile/Capture/scripts/capture-gate.sh release-ui` |
| W1A-01 | Reach Settings, Account, QR-approve and photo-import in a Release build | T2 | Field-1 | L | W1A-00 | `apps/mobile/Capture/scripts/capture-gate.sh all && apps/mobile/Capture/scripts/capture-gate.sh release-ui` |
| W1A-02 | Camera-denied → photo-import gets a test seam and a UI test | T3 | Field-2 | S | W1A-06 | `apps/mobile/Capture/scripts/capture-gate.sh all` |
| W1A-03 | Derive `hardwareEntry` from the device's Action Button capability; Ready copy tells the truth on both branches | T3 | Field-2 | S | — | `apps/mobile/Capture/scripts/capture-gate.sh all` |
| W1A-04 | `SmartGuessSheet` passes real OCR/code observations through a CaptureKit seam; displays only what persisted | T3 | Field-2 | M | W1A-03 | `apps/mobile/Capture/scripts/capture-gate.sh all` |
| W1A-05 | Delete Field's last remote flag; voice availability becomes explicit consent | T3 | Field-2 | M | W1A-04 · **Kody ruling Q2** | `apps/mobile/Capture/scripts/capture-gate.sh all` |
| W1A-06 | Contrast oracle for Field + the two measured dark-mode failures, fixed at the call sites | T5 | Field-2 | S | W1A-05 | `apps/mobile/Capture/scripts/capture-gate.sh all` |
| W1A-07 | T7 acceptance: Release reachability, onboarding truth, SmartGuess inputs on a physical device | T7 | Field-1 | M | W1A-01, W1A-03, W1A-04 | `apps/mobile/Capture/scripts/capture-gate.sh release-ui` |
| W1A-08 | `FieldCapturePayload.currentSchemaVersion = 4`; confirmations/proposals round-trip tests | T3 | Field-2 | S | W1A-02, NI-02 (contract only) | `apps/mobile/Capture/scripts/capture-gate.sh all` |
| W1A-09 | CONTRACT-C: the shared-direction record (proposal for X-06) | T4 | Patina-1 | M | — | `test -s artifacts/ios27-delivery-plan-2026-09-23/execute/contracts/CONTRACT-C-shared-direction.md` |
| W1A-10 | `PatinaSchemaV2`: cached direction, migration stage, purge on a typed `revoked` | T4 | Patina-1 | L | W1A-09, NI-05 (contract only) · **Kody ruling Q1** | `apps/mobile/Patina/scripts/ios-gate.sh all` |
| W1A-11 | T7 acceptance of D5: house-first, house-widget, direct-orders as a tester meets them | T7 | Patina-2 | M | W1A-14 | `apps/mobile/Patina/scripts/ios-gate.sh all && apps/mobile/Patina/scripts/ios-gate.sh ui` |
| W1A-12 | T1 integration: the committed pbxproj regeneration, build number past ASC, export-compliance key | T1 | Field-1 | M | every Field ticket · **Kody Q4** | `apps/mobile/Capture/scripts/capture-gate.sh all && apps/mobile/Capture/scripts/capture-gate.sh release-ui` |
| W1A-13 | Patina's token registration carries `app = cloud.patina.app` | T4 | Patina-2 | S | W1A-11, NI-01 (contract only) | `apps/mobile/Patina/scripts/ios-gate.sh all` |
| W1A-14 | `OrderSheet` takes an injected `OrderHandoff` and terms provider; `--uitesting` composition supplies the test doubles | T4 | Patina-2 | S | — | `apps/mobile/Patina/scripts/ios-gate.sh all && apps/mobile/Patina/scripts/ios-gate.sh ui` |
| NI-01 | 00668: `device_push_tokens.app` + per-app `apns-send` topic and a backward-compatible audience contract; rollback outside `migrations/` | T6 | non-iOS | M | — | `pnpm supabase:reset && scripts/run-sql-tests.sh -f notifications && deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/apns-send.test.ts` |
| NI-02 | 00669: project `confirmations`/`proposals` out of `raw_payload` by trigger (F6), with clearing on a changed payload | T6 | non-iOS | M | NI-01 (shared Postgres) | `pnpm supabase:reset && scripts/run-sql-tests.sh -f field && scripts/run-sql-tests.sh -f capture_enrichment` |
| NI-03 | `companion-message`: model pin moves to a side-effect-free resolver | T6 | non-iOS | S | NI-02 (lane order only) | `deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/companion-message-model.test.ts` |
| NI-04 | Lexicon copy packet: ten strings at eleven sites, one recommended sentence each | T5 | none | S | — | `test -s artifacts/ios27-delivery-plan-2026-09-23/execute/lexicon-copy-proposal.md` |
| NI-05 | 00670: `get_project_decision_review` answers `revoked \| not_found \| unauthorized` instead of `null` (CONTRACT-C's server half) | T6 | non-iOS | S | W1A-09, NI-03 (shared Postgres) · **Kody ruling Q1** | `pnpm supabase:reset && scripts/run-sql-tests.sh -f decisions` |

Verify-string rules (from §0): `capture-gate.sh` needs `CAPTURE_SIM_UDID` exported in the
executor's shell; `ios-gate.sh` needs `IOS_GATE_UDID`. `capture-gate.sh all` already runs
`build`, `test_`, `ui`, `lint`, the FC-R3 sweep (no "inbox"/"ai" in quoted strings) and the
Principle-4 sweep (no `suggestionConfidence` under `Capture/`) — Astra's draft listed `ui` as a
separate step; it is not. **`ios-gate.sh all` does not run `PatinaUITests`**
(`ios-gate.sh:218` — `all` is `build && test PatinaTests && lint-delta`; `ui` at `:214` is the
tier that does), so every Patina ticket that adds or relies on a UI test names `ui` beside
`all`. `capture-gate.sh` has **no Release tier today** (`build()`, `test_()`, `ui()` pass no
`-configuration`, so Xcode defaults to Debug); W1A-00 adds one, modelled on
`ios-gate.sh:106-113` `cmd_release`. NI-03's and NI-05's test files are ones the tickets create;
the runners exist (`deno test --config supabase/functions/deno.json`, `integration.yml:53`;
`scripts/run-sql-tests.sh`).

---

## 4. Field-1 — gate, reach, judge, integrate

### W1A-00 — `capture-gate.sh` gains `release` and `release-ui` tiers
*T1 Integrator (standing in for "Field Foundations", the script's single owner per
`research/11-collision-risk.md:549`) · S · coding.easy*

`capture-gate.sh` builds and tests in Debug only: `build()` (`:81-91`), `test_()` (`:93-102`)
and `ui()` (`:107-118`) pass no `-configuration`. `ios-gate.sh:106-113` already has
`cmd_release` (`-configuration Release`). Add two tiers to `capture-gate.sh`, both reading
`CAPTURE_SIM_UDID` through the existing `sim_destination()`:

- `release` — `xcodebuild build … -configuration Release` of the `Capture` scheme into the
  lane's simulator clone.
- `release-ui` — `xcodebuild test … -scheme Capture -only-testing:CaptureUITests
  -configuration Release`.

No pbxproj change, no `generate_project.rb` target-graph change (the tiers still call
`generate()` like the others). The `all` tier is unchanged so the other Field tickets' verify
strings keep their meaning. **Why this ticket exists:** without it, nothing in the Field gate
observes a Release build, and W1A-01's whole claim is "reachable in Release".

**What the tier can and cannot prove.** `verificationHarnessAllowed`
(`CaptureDeepLink.swift:251-257`) is `true` under `#if DEBUG` and otherwise
`!AppConfiguration.runsRealServices`; `runsRealServices` (`AppConfiguration.swift:101-107`)
returns `false` whenever `isUITest` is set. So a UI test, even in Release, runs with the
harness *allowed*. The tier therefore proves the **edges** (tests that reach each screen by
ordinary taps and never call the harness deep link) in a Release-compiled binary; it cannot
observe the harness refused. That observation is W1A-07's physical-device step, where
`runsRealServices` is `true` and the `capture://screen/…` link must do nothing.

**Files.** `apps/mobile/Capture/scripts/capture-gate.sh` only.

### W1A-01 — Reach Settings, Account, QR-approve and photo-import in a Release build
*T2 Navigation Registrar · L · coding.hard · high stakes (ships the debug harness if done wrong)*

**Behaviour.** In a Release build with no launch arguments, a signed-in designer can reach
`SettingsScreen`, `AccountScreen`, `QRScanScreen` and the photo-import path
(`ResilienceScreens.swift:80-135`) from the ordinary UI. Today those screens are registered
(`CaptureScreenID.swift:45-80`) and rendered by the verification harness, but the only edges
into them are deep links behind `verificationHarnessAllowed`
(`CaptureDeepLink.swift:46, :64, :251`).

**Decisions already made.**
- `verificationHarnessAllowed` is **not** loosened. It gates the 79-screen harness
  (`capture-shots.sh:51-75` `ALL_SCREENS`); widening it would ship the harness to TestFlight.
  New edges are ordinary SwiftUI navigation from the dashboard/root, not deep links.
- Screen ids are the full raw values (`screen.T1.settings`, not `T1.settings`) — the Fable draft
  had this wrong; the Astra review caught it and `CaptureScreenID.swift` confirms.
- The registrar owns `CaptureScreenID`, `CaptureDeepLink`, `RouteRegistry`, `CaptureNavigation`
  and `capture-shots.sh` (`research/11-collision-risk.md:542-565`). No other ticket this wave
  touches them.
- Photo-import's entry from the camera-denied notice is **W1A-02's** problem (the notice only
  renders for `AVFoundationCameraService`, `ViewfinderScreen.swift:185`). W1A-01 gives
  photo-import a reachable edge that does not depend on the camera being denied.
- No new screens; no new Swift files if avoidable (each one is a pbxproj change for W1A-12).
- **No workspace switch is claimed or tested.** `AccountScreen.swift:151-155` renders a
  `Picker` bound to `.constant(session.workspaceID ?? "")` with a single row and a "Manage in
  web app" button — the comment on `:150` says "No enumerate/switch-workspace seam". Reaching
  Account is the deliverable; switching workspaces is not a Field capability on `main`.

**Edge cases.** Signed-out: Account reachable, Settings reachable, QR-approve refuses with the
existing signed-out affordance. `capture-shots.sh` `EXCLUDED_SCREENS` (`:87-89`) unchanged.

**Tests.** A `CaptureUITests` case per screen that launches with **no** harness argument,
navigates by taps only (never through `capture://screen/…`) and asserts arrival by
accessibility identifier (the existing `PeopleRoomUITests.swift:20-25` launch shape). They run
under both `all` and W1A-00's `release-ui`. The FC-R3 and Principle-4 sweeps stay green.

**Files.** `apps/mobile/Capture/Capture/Features/Root/RootView.swift`,
`apps/mobile/Capture/Capture/App/DeepLinking/CaptureDeepLink.swift`,
`apps/mobile/Capture/Capture/Features/Settings/SettingsScreen.swift`,
`apps/mobile/Capture/Capture/Features/Account/AccountScreen.swift`,
`apps/mobile/Capture/Capture/Features/QRApprove/QRScanScreen.swift`,
`apps/mobile/Capture/Capture/Features/Resilience/ResilienceScreens.swift`,
`apps/mobile/Capture/CaptureUITests/`.

### W1A-07 — T7 acceptance: Release reachability, onboarding truth, SmartGuess inputs
*T7 Independent Acceptance · M · behavior-verification*

T7 judges; it never repairs. Two sessions, both in Release configuration:

1. **Simulator, in T7's own worktree clone:** `capture-gate.sh release-ui` (W1A-00) proves the
   W1A-01 edges compile and pass under Release. That is the verify string.
2. **Physical device, the one iOS 26 device available:** a Release build installed with **no
   launch arguments** — the only setup in which `runsRealServices` is `true`
   (`AppConfiguration.swift:101-107`) and therefore `verificationHarnessAllowed` is `false`
   (`CaptureDeepLink.swift:251-257`). T7 walks every W1A-01 edge by touch, then confirms a
   `capture://screen/T1.settings`-style link is refused (nothing routes) while the ordinary
   edge still arrives. Evidence is the device walk recorded as screenshots plus the refused
   deep link; a simulator run cannot stand in for this step because `isUITest` re-enables the
   harness.

Also on the device: the Ready screen on the device T7 has — the expectation is by
**capability, not tier**: a device *with* an Action Button (iPhone 15 Pro/Pro Max, every
iPhone 16 including 16e, iPhone Air, the 17 family) sees the Action Button branch and no
"without even unlocking" promise; a device *without* one (every iPhone 14 including 14 Pro,
iPhone 15/15 Plus) sees the non-Action-Button branch and no Control Center promise (W1A-03,
`research/12-work-inventory.md:105-109`, F-9 at `:1111-1116`). And a tag photo through
`SmartGuessSheet` where OCR returns a maker and a code returns a GTIN, confirming the sheet
shows exactly what `Piece` persisted (W1A-04). No workspace switch is walked (there is none —
`AccountScreen.swift:151-155`). Findings land as comments with a disposition column; anything
T7 cannot reproduce is recorded as such, not dropped.

### W1A-12 — T1 integration: the committed pbxproj regeneration, build number, export-compliance key
*T1 Integrator · M · coding.normal · high stakes (the only writer of the committed `Capture.xcodeproj`)*

Runs last. Merges every Field ref from both lanes into one integration worktree, runs
`generate_project.rb`, commits the regenerated `Capture.xcodeproj/project.pbxproj` with the
`Info.plist` edits, and runs `capture-gate.sh all` and `release-ui` on the merged tree.

**The single-writer rule, stated precisely.** Every Field executor regenerates the project in
their worktree every time they run the gate (`capture-gate.sh:76-79` — that is how the gate
works and it is fine). What no executor other than T1 does is *commit* `Capture.xcodeproj/`
or edit `generate_project.rb`'s target graph. Executors' `git commit --only` pathspecs exclude
`apps/mobile/Capture/Capture.xcodeproj`; a worktree whose generated pbxproj differs from the
committed one is the expected state at delivery, not a defect. T1's regeneration is the one
that lands; "once" means once *in history*, not once per machine.

Three edits ride with it, all previously owed:
- `generate_project.rb:100` `CURRENT_PROJECT_VERSION = '6'` collides with the live Field 0.1(6)
  on ASC (`W0-DISPATCH.md` §B-5). Set `'7'` — or higher if Kody reports a later high-water mark
  (Q4). `archive-testflight.sh:11-13` accepts `--build-number` for the archive day; the
  generated default must still be past ASC so a plain archive is never refused.
- `apps/mobile/Capture/Capture/Info.plist` gains `ITSAppUsesNonExemptEncryption` — the **value**
  is Kody's legal declaration (Q4), not an engineering fact; the ticket adds the key with the
  value he gives. (The Fable draft cited `Capture/Capture/Capture/Info.plist`; that path does
  not exist. `generate_project.rb:94` names `Capture/Info.plist`.)
- Confirm `.gitattributes` still marks the pbxproj `-merge -diff` (W0-09).

New Swift files this wave that the regeneration picks up: W1A-04's CaptureKit seam file and
its test, W1A-06's oracle and pin files under `CaptureTests`, any W1A-01/W1A-02 UI test files.
T1 checks the generated target membership for each against `generate_project.rb:141-202`
(`add_sources` globs per target root) before committing.

**Owed after this ticket, not part of it:** the archive and TestFlight upload (§7).

---

## 5. Field-2 — repair the evidence path

### W1A-03 — Derive `hardwareEntry` from the device's capability; the Ready screen tells the truth
*T3 · S · coding.easy*

`OnboardingFlowView.swift` never passes `hardwareEntry` or `onSetHardwareEntry` (grep finds
neither name in the file); `ReadyScreen.swift:18, :23` default to `.actionButton` and `{}`, so
every device is told to map an Action Button and the Set-up button is dead (DELIVERY-PLAN §8.1).

**Decisions already made.**
- **Pro/non-Pro is the wrong axis.** The Action Button ships on iPhone 15 Pro / Pro Max, every
  iPhone 16 (base, Plus, Pro, Pro Max, 16e), iPhone Air and the iPhone 17 family; it is absent
  from every iPhone 14 including 14 Pro, and from iPhone 15 / 15 Plus
  (`research/12-work-inventory.md:105-109`; F-9 at `:1111-1116` says "encode the device list,
  not a 'Pro' predicate"). Revision 1 of this plan had the Pro predicate; it would have shipped
  the bug the ticket exists to fix. Derive `hardwareEntry` through a `HardwareEntryPolicy`
  keyed on the machine identifier (`utsname` / `hw.machine`) with an explicit
  has-Action-Button list, behind an injectable probe so `HardwareEntryPolicyTests` covers a
  14 Pro (no), a base 16 (yes), a 15 (no) and an unknown future identifier (default: no
  promise) without any of those devices. `ReadyScreen.swift:17`'s header comment ("Pro devices
  teach the Action Button; others fall back to Control Center") is rewritten with the change.
- **The non-Action-Button branch's copy changes.** `ReadyScreen.swift:76` promises "Add the
  Capture control to Control Center and shoot in a single tap" and `:87` "Control Center →
  Capture", but **no `ControlWidget` or `AppIntent` exists anywhere under `apps/mobile/Capture`**.
  That control is W3b work. Until it exists the branch says what is true: open Patina Field
  from the Home Screen (or the Lock Screen camera hand-off if T3 finds one wired — it must not
  invent one).
- **The Action Button branch's copy changes too.** `ReadyScreen.swift:73` "Map the Action Button
  to Patina Field, and capture without even unlocking to the app" and `:91` "Capture without
  even unlocking to the app" promise a Lock Screen path that nothing implements: with no
  `AppIntent`/`ControlWidget`, the Action Button can only be assigned to *open the app*, which
  requires unlocking. The branch says: assign the Action Button to open Patina Field; it opens
  on the viewfinder. Nothing about unlocking.
- `onSetHardwareEntry` on the Action Button branch opens the Action Button settings deep link
  that already exists in the app if there is one; if there is none, the button explains where
  to set it and does not pretend.

**Files.** `apps/mobile/Capture/Capture/Features/Onboarding/OnboardingFlowView.swift`,
`apps/mobile/Capture/Capture/Features/Onboarding/ReadyScreen.swift`, a `HardwareEntryPolicy`
(in `CaptureKit/` so the test can link it), `apps/mobile/Capture/CaptureTests/HardwareEntryPolicyTests.swift`.

### W1A-04 — `SmartGuessSheet` passes real observations through a CaptureKit seam; displays only what persisted
*T3 · M · coding.normal*

`SmartGuessSheet.swift:210` calls `smartGuess.guess(image:ocr:codes:)` with `ocr: [], codes: []`
although `VisionTagOCRService` (`VisionTagOCRService.swift:16`) and `DataScannerCodeService`
(`DataScannerCodeService.swift:12`) exist and the `RecognitionServices.swift` protocols expose
both. The sheet then sets its displayed state at `:213-223` regardless of whether
`Piece.setValue(_:for:source:)` (`Piece+Accessors.swift:206-247`) accepted the write — so what
the designer sees can differ from what the store holds.

**The test-target constraint that shapes this ticket.** `CaptureTests` depends on `CaptureKit`
only (`generate_project.rb:174-180, :215`; `SmartGuessTests.swift:6-7` says so in its own
header: "CaptureTests links CaptureKit alone, and HeuristicSmartGuessService is app-side").
`SmartGuessSheet` is under `Capture/Features/Recognition/SmartGuess/` — the app target — so no
`CaptureTests` case can exercise it. Revision 1 asked for exactly that; it could not have run.

**Decisions already made.**
- **Move the orchestration into CaptureKit.** A new `SmartGuessApplication` (working name)
  under `CaptureKit/CaptureKit/Recognition/`: given the OCR service, the code service, the
  guess service, the frame and the session's scanned codes, it runs OCR on the frame, calls
  `guess(image:ocr:codes:)` with both populated, applies each suggestion through
  `Piece.setValue(_:for:source:)`, and returns a per-field result read back **from the
  `Piece`** — `applied(value)` or `notApplied(persistedValue)`. The sheet becomes a thin
  caller that renders that result. Heuristic vocabulary hints from
  `HeuristicSmartGuessService.swift:16` remain inferences: their `FieldSuggestion.source`
  stays `.smartGuess`. OCR-derived text is `.ocr`, code-derived is `.code` — the same sources
  `TagOCRSheet.swift:189-199` and `CodeScanSheet.swift:141-150` already use.
- If `setValue` refuses (a confirmed field is not overwritten by a suggestion — the SQ-198
  origin/confirmation split), the result carries the persisted value and the sheet marks the
  guess "not applied". The sheet never displays the local guess.
- Principle-4 sweep stands: no `suggestionConfidence` under `Capture/`.
- The new file is a pbxproj change; T1 picks it up in W1A-12 (§4). T3 does not commit
  `Capture.xcodeproj`.

**Tests.** A new `SmartGuessApplicationTests.swift` in `CaptureTests` (and the existing
`SmartGuessTests.swift` `:1-30` shape) with a mock OCR service returning a maker and a mock
code service returning a GTIN, asserting the guess service receives both, that the returned
result equals what the `Piece` holds, and that a confirmed field survives a conflicting guess
as `notApplied`. Mocks go in `CaptureKitMocks.swift`.

**Files.** `apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/SmartGuessApplication.swift`
(new), `apps/mobile/Capture/Capture/Features/Recognition/SmartGuess/SmartGuessSheet.swift`,
`apps/mobile/Capture/CaptureKitMocks/CaptureKitMocks.swift`,
`apps/mobile/Capture/CaptureTests/SmartGuessApplicationTests.swift` (new),
`apps/mobile/Capture/CaptureTests/SmartGuessTests.swift`. Not touched: `Piece+Accessors.swift`
(behaviour is correct; the sheet was wrong).

### W1A-05 — Delete Field's last remote flag; voice availability is explicit consent
*T3 · M · coding.normal · high stakes · **needs Kody's ruling (Q2)***

Four sites still read a live PostHog flag: `ViewfinderModel.swift:550`
(`featureFlags.isEnabled("field-companion-voice")`), `C6VoiceScreen.swift:82`,
`VoiceNoteSheet.swift:67`, `SiteScanContextCapture.swift:46`; the seam is
`CaptureKit/Analytics/CaptureFeatureFlags.swift` (`.allOff` in mock mode) fed by
`PostHogCaptureAnalytics.isFeatureEnabled` (`:62-65`). W0-DISPATCH §A was explicit that
`CaptureFeatureFlags` is "the one named place a feature reads a remote flag from" — deleting it
"must mean explicit consent semantics, never always-record". This is Kody's constraint 1
violated in the app that shipped, so the draft that missed it (Fable's) lost this point to
Astra's review.

**Behaviour after.** `micIsAvailable` and voice-note availability derive from (a) the
microphone/speech permission state and (b) `FieldAffirmationPolicy.recordingIsBlocked`
(`ViewfinderModel.swift:560` per the earlier read) — the affirmation gate that already asks
the designer whether recording is allowed on this site. No remote read. `CaptureFeatureFlags`,
`CaptureFeatureFlagsTests.swift`, `FeatureFlagSeamTests.swift` and the
`isFeatureEnabled` member on `CaptureAnalytics` are deleted; `CameraModeSeamTests.swift` is
retained if it tests something other than the flag (T3 reads it first).

**What Kody rules (Q2).** Two options, and only two, because a compile-time constant that
dormant-disables the finished voice path is a flag under §0:
- **(a) Voice is available to every tester**, gated by the microphone/speech permission and
  the site affirmation (recommended — it is the D6 Companion's input rail and the flag has no
  tester-facing meaning).
- **(b) Voice is removed outright** for now: the four call sites' voice paths, `C6VoiceScreen`,
  `VoiceNoteSheet` and the affirmation chip's voice entry are deleted from the build, and
  re-adding them is a W4 ticket. That is a removal, not a dormant toggle.

**Files.** The four call sites; the three further readers the file grep finds —
`Capture/Features/Recognition/RecognitionScreens.swift`,
`Capture/Features/SiteScan/SiteScanHostScreen.swift`,
`CaptureKit/CaptureKit/Analytics/CaptureAnalytics.swift` (the protocol member); plus
`CaptureFeatureFlags.swift`, `PostHogCaptureAnalytics.swift`, `AppContainer.swift:31-50,
:143-215` (composition), and the test files `CaptureTests/FeatureFlagSeamTests.swift`,
`CaptureTests/CaptureFeatureFlagsTests.swift`. Twelve files in all (the grep for
`field-companion-voice|isFeatureEnabled|featureFlags` under `Capture/`, `CaptureKit/`,
`CaptureTests/`, `CaptureKitMocks/` returns exactly these).

### W1A-06 — Contrast oracle for Field + the two measured failures, fixed at the call sites
*T5 · S · coding.easy*

`PatinaTests/PatinaContrast.swift:36-78` is a WCAG oracle; Field has none (`CaptureTests`
contains no contrast or `SourcePin` helper). Port it to `CaptureTests` alongside a
`SourcePin`-style `#filePath` reader (`PatinaTests/SourcePin.swift:13-58`).

**What actually fails, re-measured.** Both call sites draw `CaptureColor.ink`
(`FieldAffirmationChip.swift:21` on a `goldenHour` capsule at `:23`;
`OfflineQueueBanner.swift:49` on a `warning` capsule at `:52`). `CaptureColor.ink` is
`PatinaColors.Text.primary` (`CaptureColor.swift:50`), which is `charcoal` (`2C2926`) in light
and `DarkPalette.textPrimary` (`F2EDE6`) in dark (`PatinaColors.swift:220-222, :128`). The
fills are fixed hex (`goldenHour` `E8C547` at `:60`, `warning` `D4A574` at `:100`). So:

| Pair as drawn | Light | Dark |
|---|---|---|
| ink on `goldenHour` (chip) | `2C2926`/`E8C547` ≈ 8.6:1 pass | `F2EDE6`/`E8C547` ≈ 1.6:1 **fail** |
| ink on `warning` (pill) | `2C2926`/`D4A574` ≈ 6.5:1 pass | `F2EDE6`/`D4A574` ≈ 2.1:1 **fail** |

Revision 1's "`goldenHourInk` (`79651E`) on `goldenHour` at 3.39:1" is a real ratio of a pair
**nobody draws**: `goldenHourInk` (`PatinaColors.swift:66`) is used only as the light side of
`Text.goldenHour` (`:282-283`), for golden text on the page. Darkening it would fix neither
screen. The defect is a dynamic ink on a fixed fill.

**Decisions already made.**
- Pins are **per call site**, not per token (Astra's graft): the test pins the two pairs above
  in both appearances, from the `#filePath`-read source, so a later edit to either site
  re-measures.
- **Fix at the call sites, not in the palette.** Both labels use a fixed dark ink that does
  not flip with the appearance: `PatinaColors.charcoal` (`2C2926`) passes on both fills in
  both modes (8.6:1, 6.5:1). No PatinaDesignKit token changes, so no Patina gate run is
  needed and R5's baselines do not move. If T5 prefers a semantic name for "ink on a golden/
  warning fill", that is a **shared** token in
  `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift` (there is no
  Field-local `PatinaColors.swift`; `CaptureColor.swift:13` imports the shared kit, and
  `generate_project.rb:272-273` links it into both Field targets as `Patina.xcodeproj` does
  for Patina) — then `apps/mobile/Patina/scripts/ios-gate.sh all` must also pass, run in the
  Patina-2 slot after W1A-13 (budgeted at +1 lane-day, not in the §2 total; T5 says which
  path it took in the delivery note).
- `scripts/check-ios-tokens.sh` is Patina-scoped (`Patina/Features/`) and Integrator-owned;
  not touched.

**Files.** `apps/mobile/Capture/Capture/Features/Capture/FieldAffirmationChip.swift`,
`apps/mobile/Capture/Capture/Features/Resilience/OfflineQueueBanner.swift`,
`apps/mobile/Capture/CaptureTests/CaptureContrast.swift` (new),
`apps/mobile/Capture/CaptureTests/CaptureContrastPins.swift` (new),
`apps/mobile/Capture/CaptureTests/SourcePin.swift` (new, ported). Conditionally
`apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift`.

### W1A-02 — Camera-denied → photo-import test seam
*T3 · S · coding.easy*

The denied notice renders only when `model.camera as? AVFoundationCameraService` succeeds
(`ViewfinderScreen.swift:180-195`); simulator and tests inject `MockCameraService`, and the
`CameraService` protocol has no authorization member — so the denied → import path has never
been exercised by a test. Add an authorization-state member to the protocol (a test seam, not a
flag), make `MockCameraService` return it, and write the UI test that lands on photo-import from
the denied notice. W1A-01 supplies the edge; this ticket proves the denied entry to it.

### W1A-08 — `currentSchemaVersion = 4`; confirmations/proposals round-trip tests
*T3 · S · coding.easy*

`FieldCapturePayload.swift:60` `currentSchemaVersion = 3`; `:42` `confirmations:
[String: Confirmation]?`, `:45` `proposals: [String: String]?` ride `raw_payload`. The payload
builder is the type's own initializer — `FieldCapturePayload.swift:235`
`self.schemaVersion = Self.currentSchemaVersion` — so the bump is one constant and every
payload follows; `LocalCaptureSyncService.swift` does not write the version (revision 1's
`:235` anchor there was wrong — that line is `piece.applyTransferState(...)`). Once NI-02's
contract is written (the ticket needs only the contract, not the deployed migration), bump to
4 and extend `FieldCapturePayloadTests.swift` (`:70, :147, :234-242`) so a V4 payload encodes
both dictionaries **always, as JSON objects** — an empty dictionary is encoded as `{}`, never
omitted, because NI-02's clearing rule treats "key present and empty" as "clear" and "key
absent" as "this client does not speak the key" — a V3 payload still decodes, and
`CaptureStoreMigrationTests.swift` still passes.

---

## 6. Patina — the contract before the schema; judge D5

### W1A-09 — CONTRACT-C: the shared-direction record
*T4 · M · codebase-exploration (produces a contract, no app code)*

DELIVERY-PLAN §5: "there is no ruled shared-direction projection to cache."
`DecisionsAPIClient+ProjectApprovals.swift:116` `RemoteProjectApprovalReview` carries
`decisionId, projectId, artifactId, artifactVersion, artifactChecksum, disposition,
authorityRevision?`; `fetchProjectApprovalReview` (`:382-393`) returns `nil` on a `null` body, so
unauthorized, nonexistent and legacy are indistinguishable to the client; the list (`:402`)
returns `[]`. Server side, `00467:69-77` (`app_private.project_decision_review_for_actor`,
`:45`; exposed as `public.get_project_decision_review`, `:101`) returns NULL unless the actor is
a studio co-member or the snapshot's `decision_lead_id`; `00463:87-118` defines
`project_decision_authorities` and its per-decision snapshots with `authority_revision`.

**Deliverable.** `execute/contracts/CONTRACT-C-shared-direction.md`: the record (fields, the
revision that D4 pins, attachments and their checksums), reader authority (co-member or
decision lead, exactly `00467`), freshness (last-fetched timestamp shown), revocation (the
server's `null` becomes a typed `revoked | not_found | unauthorized` — the exact RPC shape,
which of the three each server condition maps to, and whether `revoked` needs new state or is
derivable from the snapshot's `authority_revision` moving — sized as **NI-05**, built this wave
once Q1 is ruled), and what "no offline approvals" means at the API boundary. Ends with the
one question Kody must answer (Q1) and a recommended answer.

### W1A-10 — `PatinaSchemaV2`: cached direction, migration stage, purge on a typed `revoked`
*T4 Patina schema owner · L · coding.hard · high stakes · **blocked on Q1***

`PatinaSchema.swift:24-51` is `PatinaSchemaV1` with nine models and
`PatinaMigrationPlan.stages = []` (`:50`). Add the cached-direction model per CONTRACT-C as
**V2 with a lightweight stage** — `PersistenceMigrationTests.swift:24-40` must assert the stage
exists and a V1 store opens.

**The existing wipe paths, and why neither is the purge.**
`LocalStoreReset.wipeUserScopedData` (`LocalStoreReset.swift:24`) has exactly two callers:
`AuthService.swift:431` (a different account signs in — the seam `LocalStoreOwnership.swift:9`
documents) and `AccountDeletionService.swift:111` (the account is deleted). Both wipe every
user-scoped model. (Revision 1 anchored this to `PersistenceController.swift:75-77, :90-92`;
those lines construct the `ModelContainer` and say nothing about wiping.) The purge D4 requires
is a third, narrower path that removes cached-direction rows only, and it fires on the typed
`revoked` answer NI-05's RPC returns. Its dependency on NI-05 is **contract-only** — the same
shape as W1A-08 on NI-02 and W1A-13 on NI-01: T4 builds against CONTRACT-C's RPC shape and
tests it through the injected decisions client; it does not need 00670 on Strata or even on
local Postgres. The new model's store is added to `SessionIsolationTests.swift:176-229` (which
lists participant *files*, `:257-271`) so the account-switch and account-deletion wipes are
proven to cover it — otherwise the isolation test passes vacuously.

Offline read is of the last **authorized** revision only; the last-fetched timestamp is
visible; every consequential action (approve, comment with effect) performs an online check
first and is refused offline with the existing copy pattern.

**Not in scope until Q1 is ruled:** nothing here is started. T4 works W1A-09 and W1A-14, and,
if Q1 is slow, takes W1A-13 off Patina-2.

### W1A-14 — `OrderSheet` takes an injected handoff and terms provider
*T4 · S · coding.normal*

`OrderSheet.swift:28` `@State private var handoff = OrderHandoff()` constructs the live
machine privately (`OrderHandoff.swift:117-123` defaults `dependencies` to `.live`, `:91`), and
`:56` fetches live terms through `DirectOrdersAPIClient.shared`. `OrderHandoff.Dependencies`
(`:85-89`) is a real seam — but nothing above the sheet can reach it, and `OrderSheet` has one
caller (`ProductDetailView.swift:214`). A UI test cannot inject anything. Revision 1's W1A-11
assumed it could.

**Change.** `OrderSheet` gains an initializer parameter for the `OrderHandoff` (defaulting to
`OrderHandoff()`) and a terms provider closure (defaulting to
`DirectOrdersAPIClient.shared.fetchTerms`). `ProductDetailView` passes them from a small
`PurchaseComposition` that, under `PatinaApp.isUITesting` (`PatinaApp.swift:25-26`, the
existing `--uitesting` launch argument — test DI, not a flag), returns a handoff whose
`Dependencies` are scripted doubles: `create` succeeds, `checkout` returns a URL, `poll`
answers settled only after N calls (configurable through a `UITEST_ORDER_POLL_SETTLES_AFTER`
environment value, following `UITEST_AUTH_EMAIL` at `:40-45`), `track` records. Live path
unchanged.

**Tests.** `PatinaUITests` gets one case that opens the sheet under `--uitesting` and asserts
the injected double was used (the scripted terms render). The existing `OrderHandoff` unit
tests are untouched.

**Files.** `apps/mobile/Patina/Patina/Features/Purchase/OrderSheet.swift`,
`apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift`,
`apps/mobile/Patina/Patina/Features/Purchase/PurchaseComposition.swift` (new; Patina's synced
groups make the add free), `apps/mobile/Patina/PatinaUITests/OrderSheetUITests.swift` (new).

### W1A-11 — T7 acceptance of D5
*T7 · M · behavior-verification · high stakes (direct-orders touches money)*

Judge, on a worktree simulator and the physical device, the three paths D5 enabled:
- **house-first**: cold launch lands on the house; signed-out lands on the placeholder.
- **house-widget**: `HouseWidgetProvider.swift:23-53` reads `widget-snapshot.json`
  (`HouseWidgetPayload.swift:71`), which carries MOVED rows only and excludes `needsYou` by
  design (`WidgetSnapshot.swift:7`); `house-record.json` (`RecordSnapshotStore.swift:25`) is the
  app's own Today snapshot. T7 asserts the widget never shows what is owed, shows the signed-out
  placeholder when `ownerId` is nil, and updates after a MOVED event. Note the `PatinaTests`
  target syncs `PatinaWidgetShared` and `PatinaTests` only (`Patina.xcodeproj/project.pbxproj:261-285`)
  — provider tests live against the payload store, not the provider.
- **direct-orders**: through W1A-14's injection, T7's UI tests script `OrderHandoff.Dependencies`
  and assert **a return from Checkout is not treated as payment proof**. The machine's own
  transitions are the oracle: `OrderHandoff.checkoutDismissed()` (`:180-183`) moves
  `.awaitingPayment → .confirming` and arms the poll; `startPolling` (`:214-235`) reaches
  `.placed` only when `dependencies.poll` returns a settled row, and `.unconfirmed` at the
  60-second deadline (`:227-233`). (Revision 1 cited `DirectOrdersAPIClient.swift:40-89` as the
  "polls first" evidence; those lines are `fetchTerms` and `createOrder` — the poll lives in
  `OrderHandoff`.) The sheet must show its "confirming" state until the scripted poll answers,
  and must show the unconfirmed copy when it never does. Astra's graft; the Fable draft's
  acceptance would have passed a sheet that celebrated on return.

**Verify tier.** `ios-gate.sh all` does not run `PatinaUITests` (`ios-gate.sh:218`); the
verify string names `ui` (`:214`) beside it. The physical-device walk of all three paths is
recorded as evidence in the delivery note (screenshots, and for direct-orders the sheet's
confirming state with Safari dismissed and no webhook yet). Findings are dispositions, never
repairs. Commercial review of direct-orders before an *external* tester group is Kody's
(W0-DISPATCH §B-8) and is restated in §7.

### W1A-13 — Patina's token registration carries `app`
*T4 · S · coding.easy*

`PushTokenService.swift:213` upserts `device_push_tokens` `onConflict: "token"` with no `app`.
Once NI-01's contract names the column, send `app: "cloud.patina.app"`. Until 00668 is on
Strata the column does not exist in prod — so this ticket is **local-only and must not be in a
distributed build before NI-01 is deployed**; W1A-12's archive note carries that ordering.
The 00668 default makes an old client that omits `app` still resolve to `cloud.patina.app`, so
the ordering is safety, not correctness.

---

## 7. Non-iOS — the push rail's server half, F6, the model pin, the copy packet, the typed review answer

The DB tickets run on the shared local Postgres **one at a time, one `pnpm supabase:reset`
each** (NI-01, then NI-02, then NI-05). Migration numbers are **provisional**: head is 00667
on `main` today. The ledger's reservation of 00662/00663 for this exact column
(`docs/engineering/migration-number-reservations.md:357-358` — "00662 `device_push_tokens_bundle`
… 00663 holds its revert") is stale: those numbers are below the head and 00664–00667 have
landed above them. Discipline rule 2 (`:293-297`) is **"re-check the head before every land"**
— query `list_migrations` immediately before applying, never trust a number reserved earlier —
so NI-01 draws the first free number above the applied head *at landing* (00668 if nothing
else lands first), edits the ledger's stale paragraph in the same commit per rule 5 (`:304-306`),
and NI-02 and NI-05 follow the same procedure for theirs. (Revision 1 cited `:288-305` as the
stale paragraph and read rule 2 as "draw above head"; the paragraph is at `:357` and rule 2 is
the re-check.)

### NI-01 — 00668: `device_push_tokens.app`; `apns-send` per-app topic and a backward-compatible audience
*T6 · M · coding.hard · high stakes (a live rail; misconfiguration is silent by design)*

Today `device_push_tokens` (`00335:23-31`) has `user_id, token UNIQUE, platform, environment`
and no app; `apns-send/index.ts:229` reads one `APNS_TOPIC`; `core.ts:9-19` `ApnsSendInput` is
`{ user_id?, tokens?, title, body, entity_type?, entity_id?, notification_log_id? }` — **there
is no event field**; the audience select is `token, environment` per user and one payload with
one badge fans to every token.

**What producers actually send.** Every caller on `main` sends `entity_type`/`entity_id`, not
an event name: the SQL callers (00330, 00331, 00334, 00534:201-205 via `p_entity_type`, 00569,
00572), `_shared/client-attention.ts:56`, `fulfillment-notify/core.ts:265`
(`'fulfillment_order'`), `time-nudges`, `fulfillment-stripe-recon`, and
`site-request-dispatch/index.ts:233-240`. All of them are Patina client pushes. No producer of
a Field-bound push exists yet (the D2 request-assignment rail is the deferred client-half
ticket, §8). Revision 1's "exhaustive event → app map, unmapped event is a compile error" would
have rejected or skipped every one of these.

**Decisions already made.**
- `ALTER TABLE ... ADD COLUMN app text NOT NULL DEFAULT 'cloud.patina.app' CHECK (app IN
  ('cloud.patina.app','cloud.patina.field'))`. The default **is** the backfill: every existing
  row is a Patina token, so no `UPDATE` runs and the prod read-back below is a `count(*) GROUP
  BY app` that must show only `cloud.patina.app`.
- `apns-send` reads `APNS_TOPIC_APP` and `APNS_TOPIC_FIELD` (falling back to `APNS_TOPIC` for
  the app so the deployed secret keeps working), selects `token, environment, app` per user, and
  sets the `apns-topic` header **per token from its row**. Explicit-token entries gain an
  optional `app` (default app) so the explicit path cannot regress to the wrong topic — Astra's
  graft; the Fable draft covered only the per-user path.
- **The audience contract, backward-compatible.** `ApnsSendInput` gains an optional
  `audience?: 'app' | 'field'`. When present, it selects tokens of that app only. When absent
  — every producer on `main` — the audience is **derived from `entity_type`** through a map in
  `core.ts`, `audienceFor(entityType: string | undefined): 'app' | 'field'`, whose known keys
  are the entity types the producers above send today (all → `'app'`) and whose default for an
  unknown or missing `entity_type` is `'app'` with a structured log line, never a skip or a
  400. Exhaustiveness is over the *known* union (`KnownEntityType`) so adding a producer with a
  new entity type is a type error in `core.ts`, while an unmapped value at runtime still
  delivers to the app. A future Field producer (D2 `request_assigned`) sends
  `audience: 'field'` explicitly; the test suite proves that path now so the client-half ticket
  needs no server change.
- The badge is per app: a Field token never receives Patina's badge count, and the
  `unreadInAppBadge` count (`index.ts:281`) is attached only to `'app'` deliveries.
- **Rollback lives outside `migrations/`**: `supabase/rollback/00668_device_push_tokens_app.sql`
  (a new directory; `supabase/migrations/_pending/` shows a non-applied subdirectory is the
  house precedent and nothing named `rollback` or `_revert` exists today). A revert *inside*
  `migrations/` would be applied by the next `db push` — the Fable draft had it there; Astra's
  review is right.
- No Field client change here; the Field half is deferred (§8) until the push capability is
  provisioned on `cloud.patina.field`.

**Tests.** `supabase/tests/notifications/` gets a SQL test for the CHECK and default;
`_tests/apns-send.test.ts` (`:1-40` shape) gets: per-app topic; explicit-token `app`; a
`client_attention`-shaped request with no `audience` and `entity_type` from 00534 selects app
tokens only; an unknown `entity_type` with no `audience` still selects app tokens and logs;
`audience: 'field'` selects Field tokens only and carries no badge; every existing fixture in
the file still passes unchanged (the backward-compatibility proof).

**Deploy owed (Kody's go):** `supabase db push` (00668), `supabase functions deploy apns-send`,
then the prod read-back — `select app, environment, count(*) from device_push_tokens group by
1,2` — and one real client push proving existing tokens still resolve. Secrets `APNS_TOPIC_APP`
/ `APNS_TOPIC_FIELD` set on Strata before the function deploy; the fallback keeps the rail up
if the secret step is late.

### NI-02 — 00669: project `confirmations` and `proposals` out of `raw_payload` (F6), with clearing
*T6 · M · coding.normal*

SQ-198 left the server unaware of the origin/confirmation split: `confirmations` and
`proposals` ride `raw_payload` and nothing reads them. `commit_field_capture` (00530) is a
**shared object** — `00532:18-29` records that two live authors already replace it and
"whichever lane lands second silently reverts the other", and projects the visit keys by a
`BEFORE INSERT OR UPDATE` trigger instead. 00669 does the same — but **not** with 00532's
never-clears policy, which is right for visit columns and wrong for these.

**Why never-clears is wrong here.** `00532:31-38`: "The trigger NEVER clears a value. Each
column takes the payload's value when the key is present AND parses, and keeps its existing
value otherwise." For a visit id that is correct — a later payload without the key means
"unchanged". For a *dictionary of confirmations* it is not: a designer confirms `maker`, syncs
(`confirmations = {"maker": …}`), then edits `maker` by hand — the Swift side now has no
confirmation for it, and on a V4 client the recommit's `confirmations` is `{}`. Under
never-clears the column keeps `{"maker": …}` and the server says a field is confirmed that the
device says is not. Revision 1 copied the visit policy verbatim; the fact-check is right.

**Decisions already made.**
- Two columns, `confirmations jsonb NOT NULL DEFAULT '{}'`, `proposals jsonb NOT NULL DEFAULT
  '{}'` — objects, because the Swift side is `[String: Confirmation]` / `[String: String]`
  (`FieldCapturePayload.swift:42, :45`). A `'[]'` default (the Fable draft) would break the
  first `->` lookup.
- **Projection with replace-on-changed-payload.** The trigger keeps 00532's early return —
  an UPDATE whose `raw_payload` `IS NOT DISTINCT FROM` the old one returns immediately
  (`00532:171-172`), so `route_field_capture` / `dismiss_field_capture` and every other
  unrelated UPDATE leave both columns intact. When `raw_payload` **has** changed (INSERT, or a
  real recommit), each column is decided from the new payload alone:
  - key present and `jsonb_typeof = 'object'` → the column **is replaced** with it, including
    by `{}` (that is the clear);
  - key present and any other type (array, string, number, null) → malformed: the column is
    **left alone** and the error is recorded in `raw_payload->'projection_errors'`, exactly
    00532's never-raises rule (`:40-`);
  - key absent → the client does not speak the key (a V3 payload): the column is left alone.
  W1A-08 makes a V4 client always encode both keys, so absent-vs-empty is unambiguous.
- **No blanket `UPDATE field_captures SET ...` backfill.** The 00233 guard trigger
  (`:206-261`) raises on UPDATE for stale routing (a project or room the designer no longer
  owns) and 00530's safe-harbor loop exists precisely because such rows exist; a backfill would
  hit them. Existing rows project on their next re-commit; the plan accepts that a row that
  never re-commits stays unprojected, and says so in the migration header.
- Recommit semantics unchanged: `ON CONFLICT ... WHERE status NOT IN ('saved','dismissed')`
  (00530) still decides whether a re-commit reaches the trigger at all.
- `schemaVersion` is not validated by the trigger (00530 `:448` coalesces it to 1; a V3 client
  and a V4 client both project). W1A-08 bumps the client constant against this contract.

**Tests.** `supabase/tests/field/field_capture_confirmations_test.sql`: V4 payload projects both
objects; V3 payload without the keys leaves `'{}'`; **confirmed → unconfirmed recommit** (a
first commit with `{"maker": …}`, a second commit of the same capture with `{}`) leaves the
column `'{}'`; a recommit that changes an unrelated payload key but carries the same
`confirmations` re-projects the same value; malformed `confirmations` (an array) records an
error, does not raise, and leaves the prior value; `dismiss_field_capture` after commit
preserves the projection. `field_capture_note_routing_test.sql` and
`capture_enrichment/target_type_visibility_test.sql` stay in `KNOWN_FAILURES.md:113, :115`
(the 00584 policy count) — not this ticket's to bump.

**Deploy owed:** `supabase db push` (00669) after 00668.

### NI-03 — `companion-message`: model pin in a side-effect-free resolver
*T6 · S · coding.easy*

`companion-message/index.ts:252` pins `"claude-sonnet-4-20250514"` inside the request body,
inside `serve()` (`:56`), which imports `std@0.168.0/http/server.ts` (`:4`) — untestable without
booting the server. Move the choice to `companion-message/model.ts` exporting `resolveModel(env)`
that reads `COMPANION_MODEL` with the current pin as the fallback, imported by `index.ts`; the
new `_tests/companion-message-model.test.ts` covers default and override. No behaviour change in
prod until the secret is set. **Deploy owed:** `supabase functions deploy companion-message`.
Model *selection* (which Claude) is Kody's (Q5) and is not made here.

### NI-04 — The lexicon copy packet
*T5 · S · codebase-exploration (produces a ruling packet)*

Ten strings at eleven sites (the lexicon's eight plus the three the sweep created or exposed):
`ViewfinderControls.swift:251` "Tap to capture, hold for a multi-shot piece";
`TagOCRSheet.swift:101` and `:154` "Add to piece"; `ResilienceScreens.swift:86` "Pull existing
shots into a piece"; `RootView.swift:221` "Review this piece"; `PieceSheetScreen.swift:38`
"Piece"; `PieceSheetScreen.swift:366` "That piece is no longer here." beside
`RouteSessionUI.swift:260` "This capture is no longer here" (two sentences, one meaning);
`LocalCaptureSyncService.swift:32` "Piece \(id) not found in the local store." (persisted into
`lastSyncError`, so rows written before the rename still show the old noun — the packet names
the one-line remap on read); `RootView.swift:223` "Review this session"; the SyncStatus notice
copy (`SyncStatusScreen.swift:103-162`, owed brand-voice review). One recommended sentence per
site in Patina's voice ("Designer-Taught Intelligence", never "AI"; no engineer-speak), written
into `execute/lexicon-copy-proposal.md` with the nine `needsRuling` rows of `lexicon.json`
cross-referenced. No Swift changes: the ruling comes back and a later XS ticket applies it.

### NI-05 — 00670: `get_project_decision_review` answers `revoked | not_found | unauthorized`
*T6 · S (M if CONTRACT-C needs new state) · coding.normal · **blocked on Q1***

`00467:69-77` returns NULL from `app_private.project_decision_review_for_actor` (`:45`) when
the decision is not `project_artifact_v1`, the actor is neither co-member nor decision lead, or
the row does not exist; `public.get_project_decision_review` (`:101`) passes that NULL through,
and the client (`DecisionsAPIClient+ProjectApprovals.swift:382-393`) cannot tell the three
apart. D4's purge on revocation needs the server to say *which*. Revision 1 deferred this to
"likely next wave" while W1A-10 depended on it at runtime; that was a dependency on a ticket
that did not exist. It exists now.

**Change.** A new RPC edition (name per CONTRACT-C — a second function, not an in-place
signature change to `get_project_decision_review`, whose callers on the portal side are not
this wave's) returning `{status: 'ok' | 'revoked' | 'not_found' | 'unauthorized', review: …}`.
Which server condition maps to `revoked` (the actor once had authority and the snapshot's
`authority_revision` has moved past the one they hold, or co-membership ended) versus
`unauthorized` (never had it) is CONTRACT-C's to define; T6 builds what it says. A SQL test
under `supabase/tests/decisions/` proves each status. Old RPC untouched; the Swift client's
switch to the new edition is inside W1A-10.

**Deploy owed:** `supabase db push` (00670), after 00669, only with W1A-10 in the same
distribution. If Q1 is not ruled inside the wave, this ticket and W1A-10 both stay unstarted.

---

## 8. Deferred, with reasons

| Item | Why not this wave |
|---|---|
| Field push registration (X-04 client half: token upsert with `app = cloud.patina.field`, `aps-environment` entitlement, the D2 producer sending `audience: 'field'`) | Push capability is not provisioned on `cloud.patina.field` (W0-DISPATCH §B-4) and `Capture.entitlements` has one writer per phase (`11-collision-risk.md`). NI-01 makes the server ready, including the explicit `audience` path; the client half opens the wave after Kody provisions the App ID. |
| SQ-203 Field consumer | 00664 is live server-side. **Native Field has no `capture_enrichment_runs` reader and no model-enrichment consumer at all** — the only "enrichment" under `Capture/` is on-device OCR/code/measure/voice (`PieceSheetScreen.swift:127-137`; grep for `capture_enrichment` under `Capture/` and `CaptureKit/` returns nothing). So the next-wave ticket is an **audit of what Field consumes** — whether the enrichment result reaches the designer through the Document, a push, or a Field read — not a new native feed. T3, next wave, S. |
| W3b Live Activity chain, the Control Center control, the `AppIntent` that would make the Action Button's "without unlocking" true | 20 lane-days on one Field lane; W1A-03 removes both false promises until they exist. |
| App Group URL on a signed device; `asc` CLI; the two `gh` CI commands; signing identity | Kody's hands (W0-DISPATCH §B-1..3, §B-7). |
| DELIVERY-PLAN §8.5 catalogue (1 product, 0 images) | Data, not code; owner is Kody/Leah. |
| The 00584 policy-count assertions (`KNOWN_FAILURES.md:113, :115`) | Await the FC-R8 per-studio ruling; bumping the count silently is what the assertion forbids. |
| A semantic "ink on golden/warning fill" token in PatinaDesignKit | W1A-06 fixes both sites with `charcoal`; a shared token is optional and, if T5 takes it, costs a Patina gate run (§5). |

---

## 9. Risks

1. **Both Field lanes converge on one committed pbxproj regeneration (W1A-12).** Every Field
   executor regenerates locally on every gate run (`capture-gate.sh:76-79`); the risk is not
   regeneration but a *committed* `Capture.xcodeproj` from any lane other than T1, which
   conflicts in a file marked `-merge`. Mitigation: executors' `git commit --only` pathspecs
   exclude `Capture.xcodeproj/`; the delivery note lists new Swift files so T1 can check target
   membership (`generate_project.rb:141-202`); W1A-01/-02 prefer editing existing files to
   adding new ones. New files this wave that are expected: W1A-03's policy + test, W1A-04's
   seam + test, W1A-06's three test files.
2. **NI-01 is a live-rail change with silent failure.** `apns-send` skips cleanly on missing
   config. The topic fallback, the derived-audience default of `'app'` and the prod read-back
   are the guard; the rollback file is the exit. It is still the highest-stakes deploy this
   wave, and it is deployed only on Kody's go.
3. **W1A-05 has a ruling in front of it and twelve files behind it.** If Q2 is slow, the
   Field-2 tail (W1A-06, -02, -08) slips a day; the lane can reorder to -06 → -02 → -08 → -05,
   at the cost of one more test-file touch.
4. **Simulator runtimes.** Local iOS 27 runtimes are unavailable; gates ran on 26.5. CI runs on
   `xcode-27` (`policy-quality.yml:97-153`) and creates its own iPhone 17 / iOS 27 clone per
   job. A ticket green locally on 26.5 can still fail on 27; T1 reads CI before W1A-12 merges.
5. **X-06 may not be ruled inside the wave.** Then W1A-10 and NI-05 do not start; Patina-1 ends
   at the contract and non-iOS at NI-03. That is the plan working, not failing: T4 does not
   write a schema for a record nobody has named (DELIVERY-PLAN §5).
6. **Shared Postgres.** NI-01, NI-02 and NI-05 each reset the local DB; no other session may be
   mid-migration. Re-check the head (`list_migrations`) immediately before each land per
   ledger rule 2; the numbers in this plan are provisional.
7. **The Release tier proves less than its name.** `isUITest` re-enables the harness
   (`AppConfiguration.swift:102`), so `release-ui` proves the edges in a Release binary, not
   the harness's absence. Only W1A-07's physical-device step observes the harness refused. If
   the device is unavailable that step is recorded as *not run*, and the wave does not claim
   Release reachability.
8. **NI-02's clearing rule depends on W1A-08 always encoding both keys.** If a V4 client omits
   an empty dictionary, the server cannot distinguish "cleared" from "not spoken" and falls
   back to leave-alone — the stale-confirmation bug returns silently. W1A-08's test for
   "empty encodes as `{}`" is the guard; T3 and T6 read each other's tests before either
   delivers.

---

## 10. Questions for Kody, each with a recommended answer

**Q1 — X-06, the shared-direction record (blocks W1A-10 and NI-05).** Is the offline-cached
direction *exactly* `RemoteProjectApprovalReview` (the frozen document-approval edition with
`artifactChecksum` and `authorityRevision`), or a broader "current direction" record with
attachments? **Recommended:** the approval edition, unchanged — it is the only record that
already has a revision, a checksum and reader authority (`00463`, `00467`), which is everything
D4 needs. W1A-09's contract is written against that answer; if you want broader, say what
attaches.

**Q2 — Field voice flag (blocks W1A-05).** Delete `"field-companion-voice"` and make voice
available to every tester behind the microphone/speech permission and the site affirmation?
Or delete it and remove the voice feature from the build until W4 re-adds it? (There is no
third option: a compile-time constant that keeps the finished voice path dormant is a flag
under the standing rule.) **Recommended:** available. The gate the designer meets is consent,
which is the constraint you set; a remote toggle adds nothing a tester can see.

**Q3 — The eleven copy sites (NI-04).** The packet gives one sentence per site. Rule the
packet, or say "Fable picks" and it becomes an XS ticket. **Recommended:** rule the three
that carry meaning (the two "no longer here" sentences → one; the persisted sync error; the
Ready screen's non-Action-Button line) and let the rest be the packet's recommendation.

**Q4 — Build number and export compliance (W1A-12).** Is 6 the true Field high-water mark on
ASC, and is `ITSAppUsesNonExemptEncryption` `false` for Field (as Patina declares at its
`Info.plist:5`)? **Recommended:** 7 and `false`, assuming Field ships no non-exempt encryption
beyond TLS — but that value is your declaration.

**Q5 — Companion model (NI-03).** Which model string goes in `COMPANION_MODEL` when the resolver
deploys? **Recommended:** leave the fallback (current behaviour) at deploy and set the secret in
a separate step so the two changes are distinguishable in `job_runs`/logs.

**Q6 — Deploy go.** When the wave's refs are merged, one line authorizes: 00668 → `apns-send`
(with the two topic secrets) → 00669 → `companion-message` → and, only if Q1 was ruled and
W1A-10 is in the same distribution, 00670. The TestFlight archive is a separate line and needs
Q4 plus a working `asc` or the `destination: upload` fallback.

---

### Rulings (Kody, 2026-09-24)

- **Q1 → broader record.** The cached direction is the approval edition *plus* what attaches to it. W1A-09 now proposes the attachment set (which artifacts, their checksums, size bounds, how each is revoked) with a recommendation. Kody confirms the attachment list when the contract lands. W1A-10 and NI-05 start only after that confirmation, and NI-05 is sized M.
- **Q2 → available to all.** W1A-05 deletes `field-companion-voice`. Voice is gated only by microphone/speech permission and the site affirmation.
- **Q3 → Fable picks.** NI-04 is an XS ticket: the packet's recommendations apply. Kody reads the three meaning-bearing strings at review.
- **Q4 → Kody checks ASC.** The true high-water mark is above 6, and Kody will supply the number. Encryption stays `false` (not ruled otherwise). W1A-12 waits on the number.
- **Q5 → fallback at deploy** (the recommended default under "file + dispatch").
- **Q6 → not yet.** Tickets are filed and dispatched. Every deploy still waits for Kody's separate go.

- **CONTRACT-C attachments → confirmed as listed (Kody, 2026-09-25).** A1 is the spec-book PDF, A2 the issued plan sheets (all or nothing, 200 MiB or less), and A3 the frozen budget totals, inline. Device ceiling 500 MiB. Kody also accepted the contract's two corrections (`revoked` is proven by possession; "never had authority" returns `not_found`). The signing edge function is filed as NI-06. An independent Astra review of CONTRACT-C gates W1A-10, NI-05 and NI-06.

## 11. Record of what the cross-review changed

**Spine.** Fable's draft: its five-lane shape, W1A ids and "contract before schema" ordering
survived Astra's review; Astra's draft put PatinaSchemaV2 in the first Patina slot with X-06
unruled, which DELIVERY-PLAN §5 forbids. Rejected on that ground.

**Grafted from Astra (each re-verified in the cited file).**
1. Rollback outside `migrations/` (NI-01) — a revert inside `migrations/` is applied by the next
   push; nothing named `rollback`/`_revert` exists, `_pending/` is the precedent.
2. Explicit-token path carries `app` (NI-01) — `core.ts:14` accepts explicit tokens; Fable's draft
   only covered the per-user select.
3. Per-event audience (NI-01) — reshaped in revision 2 into the entity-type-derived,
   backward-compatible contract (§12 #2).
4. Truthful Ready copy (W1A-03) — no `ControlWidget`/`AppIntent` exists under `apps/mobile/Capture`.
5. Per-call-site contrast pins (W1A-06) — `CaptureColor.ink` is dynamic; token-level ratios are
   meaningless.
6. "A return from Checkout is not payment proof" (W1A-11) — the poll lives in `OrderHandoff`
   (`:180-183`, `:214-235`); the acceptance must assert the sheet waits.
7. The Field flag ticket (W1A-05) — Fable's draft did not list the four `"field-companion-voice"`
   sites; they are live.
8. `'{}'` not `'[]'` defaults (NI-02) — `FieldCapturePayload.swift:42, :45` are dictionaries.
9. `PushTokenService.swift` path corrected to `Patina/Services/API/` (Astra's own draft had
   `Core/Network/`; both drafts were wrong once).

**Corrected in Fable's draft after Astra's review.** `Capture/Capture/Capture/Info.plist` →
`apps/mobile/Capture/Capture/Info.plist` (`generate_project.rb:94`);
`apps/mobile/Patina/scripts/check-ios-tokens.sh` → repo `scripts/check-ios-tokens.sh` (and it is
Patina-scoped, so dropped from Field tickets); suffix-only screen ids → full raw values; the
"read record" anchor `:412-429` (a write method) → `:116-160`; a blanket `UPDATE` backfill in
00669 dropped for the 00233 guard reason; `ui` listed as a separate gate step dropped because
`capture-gate.sh all` already runs it.

**Rejected from Astra's draft, with why.**
- *Two Patina lanes both on schema work (NW-06/NW-07)* — violates §5 ordering and the lane cap
  on T4's single schema owner.
- *A `sidequest verify` capture step in each ticket* — no such subcommand exists
  (`sidequest-upstream-defects.md` §2); replaced by the §0 delivery workaround.
- *Verify strings with `$CAPTURE_SIM_UDID` inline (NW-01..05)* — the `add` validator rejects
  them (§4 of the defects doc); the UDID is exported in the shell instead.
- *Bumping the 00584 policy-count assertions to 9 (NW-13)* — the assertion's own message asks
  for a ruling; `KNOWN_FAILURES.md:113, :115` records that deliberately.
- *Field push registration in this wave (NW-10)* — capability not provisioned; entitlements have
  a phase owner. Deferred, not rejected on merit.
- *Migration 00662/00663 reuse* — the ledger's reserved-unused pair is stale text (`:357-358`);
  rule 2 is "re-check the head before every land", so the numbers are drawn at landing.
- *`Capture/Capture/Capture/Info.plist`* appeared in Astra's review as Fable's error, correctly;
  Astra's proposed replacement `Capture/Resources/Info.plist` is also wrong. The real path is above.

**Rejected from Fable's own draft after re-reading.** `warningInk` "already exists" — it does
not (`CaptureColor.swift` has no `warningInk`); and, after the fact-check, neither `warningInk`
nor a darker `goldenHourInk` would fix the sites that fail (§5 W1A-06). `LocalStoreReset`
"purges on revocation" — it runs on account switch (`AuthService.swift:431`) and account
deletion (`AccountDeletionService.swift:111`); W1A-10 adds a narrower path.

---

## 12. Fact-check disposition

Twenty findings from the Astra fact-check of revision 1, each re-opened against the cited
code before disposition. **19 fixed, 1 fixed with a correction to the finding's own evidence
(#6). None rebutted.**

**HIGH**
1. **W1A-12 single-regeneration vs. the gate — FIXED.** `capture-gate.sh:76-79` `generate()` runs in `build()`/`test_()`/`ui()` (`:88`, `:99`, `:114`); every Field ticket regenerates locally. §0 and W1A-12 now say worktree-local generation is expected, only the *committed* pbxproj and `generate_project.rb` target graph are T1's, and "once" means once in history. Executors exclude `Capture.xcodeproj/` from `git commit --only`.
2. **NI-01 event map vs. what producers send — FIXED.** `core.ts:9-19` `ApnsSendInput` has no event field; all eleven producers send `entity_type` (e.g. `00534:205`, `site-request-dispatch/index.ts:237`, `fulfillment-notify/core.ts:265`). Contract rewritten: optional `audience?: 'app'|'field'`; absent → derived from `entity_type` with default `'app'` + log, never a reject/skip; `audience: 'field'` is the explicit path a future D2 producer uses; backward-compatibility tests added.
3. **NI-02 never-clears keeps stale confirmations — FIXED.** `00532:31-38` is the visit policy; copied verbatim it leaves `{"maker": …}` after a real recommit with `{}`. Now: unchanged `raw_payload` → early return (unrelated updates untouched); changed payload → object key replaces the column (including `{}`), non-object → error recorded and left alone, absent → left alone (V3). Confirmed → unconfirmed recommit test added; W1A-08 must always encode both keys (risk 8).
4. **W1A-10 depends on a deferred RPC — FIXED.** NI-05 (00670, T6, S) added: a new RPC edition returning `ok|revoked|not_found|unauthorized` on `00467:45/:101`, gated on Q1 like W1A-10. W1A-10's dependency is contract-only, tested through the injected client. Non-iOS lane +2 gated lane-days.
5. **W1A-03 Pro/non-Pro is the wrong axis — FIXED.** `research/12-work-inventory.md:105-109` and F-9 `:1111-1116`: 14 Pro has no Action Button, base 16/16 Plus/16e/Air/17 do. Ticket now encodes a machine-identifier list behind an injectable probe with four test cases; W1A-07's expectation is by capability, not tier.
6. **W1A-06 `goldenHourInk` fixes neither site — FIXED, and the pairs re-measured.** `FieldAffirmationChip.swift:21-23` and `OfflineQueueBanner.swift:49-52` draw `CaptureColor.ink` = `Text.primary` (`charcoal` light / `F2EDE6` dark, `PatinaColors.swift:220-222, :128`) on fixed `E8C547`/`D4A574`. Dark mode ≈ 1.6:1 and ≈ 2.1:1; light passes. `79651E` is drawn nowhere near these sites (`Text.goldenHour`, `:282-283`). Fix is a fixed `charcoal` ink at both call sites (8.6:1, 6.5:1); no palette change required.
7. **W1A-11 has no injection point — FIXED.** `OrderSheet.swift:28` constructs `OrderHandoff()` privately; `:56` calls `DirectOrdersAPIClient.shared`. W1A-14 (T4, S) added ahead of W1A-11 on Patina-2: injected handoff + terms provider, composed under the existing `--uitesting` argument (`PatinaApp.swift:25-26`). Patina-2 4 → 6 lane-days.
8. **W1A-11 verifier never runs Patina UI tests — FIXED.** `ios-gate.sh:218` `all` = build + `PatinaTests` + lint-delta; `:214` `ui` runs `PatinaUITests`. W1A-11 and W1A-14 verify strings name `ui` beside `all`; physical-device evidence is kept.
9. **Field gate never observes Release — FIXED.** `capture-gate.sh` passes no `-configuration`; W1A-00 (T1, S) adds `release`/`release-ui` tiers modelled on `ios-gate.sh:106-113`. W1A-01/-07/-12 verify under `release-ui`. Stated honestly: `isUITest` forces `runsRealServices` false (`AppConfiguration.swift:102`), so the tier proves the edges, and only W1A-07's no-argument device install observes the harness refused (`CaptureDeepLink.swift:251-257`). Field-1 +1 lane-day.
10. **W1A-04 `SmartGuessTests` cannot reach the sheet — FIXED.** `generate_project.rb:174-180, :215` (`tests.add_dependency(kit)`) and `SmartGuessTests.swift:6-7` confirm CaptureTests links CaptureKit alone. Ticket now moves input-collection + persist-readback into a CaptureKit `SmartGuessApplication`; the sheet renders its result; tests target the seam.
11. **W1A-05 / Q2 compile-time hard-disable is a flag — FIXED.** The constant option is removed from the ticket and Q2; the options are voice behind permission + affirmation, or removal of the voice feature from the build. §0 now states the compile-time-constant rule explicitly.

**MEDIUM**
12. **W1A-05 missing files — FIXED.** The grep for `field-companion-voice|isFeatureEnabled|featureFlags` returns twelve files; `RecognitionScreens.swift`, `SiteScanHostScreen.swift`, `CaptureAnalytics.swift` added and the full list stated.
13. **No Field-local `PatinaColors.swift` — FIXED.** The only one is `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift`; `CaptureColor.swift:13` imports the shared kit. Named; the ticket no longer edits it by default.
14. **Shared palette needs the Patina gate — FIXED.** `generate_project.rb:272-273` and `Patina.xcodeproj` both link PatinaDesignKit. W1A-06's default path touches no shared token; the optional semantic-token path requires `ios-gate.sh all` in the Patina-2 slot (+1 lane-day, stated).
15. **Action Button "without even unlocking" — FIXED.** `ReadyScreen.swift:73, :91` promise a Lock Screen path no `AppIntent`/`ControlWidget` implements; W1A-03 rewrites that branch too, and W1A-07 checks both branches.

**LOW**
16. **W1A-01 stale "unreachable" claim — FIXED.** Dropped. Piece sheet is presented from `ViewfinderModel.swift:394, :453`, `ResilienceScreens.swift:288`, the four recognition sheets; session from `ViewfinderModel.swift:257`, `WorkDashboardScreen.swift:80`.
17. **W1A-08 `schemaVersion` anchor — FIXED.** The builder is `FieldCapturePayload.swift:235` (`self.schemaVersion = Self.currentSchemaVersion`); `LocalCaptureSyncService.swift:235` is `applyTransferState`. Corrected.
18. **W1A-10 wipe anchors — FIXED.** `PersistenceController.swift:75-77, :90-92` construct the `ModelContainer`. The callers are `AuthService.swift:431` (account switch) and `AccountDeletionService.swift:111` (account deletion); both named, isolation test covers both.
19. **W1A-11 poll anchor — FIXED.** `DirectOrdersAPIClient.swift:40-89` is `fetchTerms`/`createOrder`; the transitions are `OrderHandoff.swift:180-183` (`checkoutDismissed` → `.confirming`) and `:214-235` (`startPolling` → `.placed`/`.unconfirmed`). Corrected.
20. **NI-01 ledger citation and rule 2 — FIXED.** The stale 00662/00663 paragraph is at `migration-number-reservations.md:357-358`, not `:288-305`; rule 2 (`:293-297`) is "re-check the head before every land", not "draw above head". §7 rewritten; all three migration numbers marked provisional and drawn at landing.

**Readbacks from the Astra drafter — both applied.**
- SQ-203 deferred row now states native Field has no `capture_enrichment_runs` / model-enrichment reader (only on-device OCR/code/measure/voice, `PieceSheetScreen.swift:127-137`); the next-wave ticket is an audit of what Field consumes, not a new feed.
- `AccountScreen.swift:151-155` is a `.constant` single-row picker plus "Manage in web app"; W1A-01 and W1A-07 now say explicitly that no workspace switch is claimed or tested.
