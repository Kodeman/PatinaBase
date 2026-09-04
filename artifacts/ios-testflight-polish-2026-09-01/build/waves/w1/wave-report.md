# First Flight · W1 — wave report

Written by the **W1 closer** on **2026-09-03**, from the seven lane task lists, the six lanes' review
rounds, `integration.md`, the three acceptance walks and their four re-walks, and two fix rounds.
Nothing in this file authorises a production write. Every Kody-run step W1 produced is collected, in
one order, in [`KODY-RUNBOOK-W1.md`](KODY-RUNBOOK-W1.md); the build-1 release chain is in
[`R1-READINESS.md`](R1-READINESS.md).

| | |
|---|---|
| **Integration branch** | `first-flight/w1-integration` |
| **Worktree** | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-integration` |
| **Base** | `ba83aa67fc9b4e12fdd0626d3390760bdee3dee3` (W0 close on `main`) |
| **Tip** | **`08397a7d21441baee0c0ea634f75e68fd410f2d8`** — clean tree, no writer lock, nothing pushed |
| **Commits** | 218 from the base, of which 178 are lane work, 7 are lane merges, 6 are steward integration commits and 12 are the two walk fix rounds |
| **Gate clone** | `ff-w1-gate` `089A3512-86D6-4415-8423-98D5625FCD5A` |
| **Walkers** | `ff-w1-walk-a` `4D075B9D-…`, `ff-w1-walk-b` `EDFCE6CF-…`, `ff-w1-walk-c` `75D265E3-…` |
| **Launch** | `xcrun simctl launch <udid> cloud.patina.app -DeploymentTarget local` — **no `-PatinaFlags`**, on every launch (D1a makes `house-first` the default) |
| **Production** | **untouched.** No `db push`, no `functions deploy`, no portal deploy, no `asc` write, no Sanity write, no PostHog change. The only database any agent wrote to is `127.0.0.1:54322` |

---

## 1. The headline

W1 was scheduled at **137 findings** across seven lanes. On the wave tip, **97 are closed and 40 are
open**, where *closed* means **review-closed and walk-verified on glass** — a lane's own coverage
table is not a close, and neither is a source pin. Two W0 rows (`C5-02`, `R-10`) closed too, because
PROGRAM.md §11.4 put their app-side halves in W1 code.

The forty open rows are not forty failures. **Zero rows in scope were walked and found still behaving
as their finding described** by the end of re-walk 2. Thirty-six are rows no walk could reach; two
were closed and then re-opened by the second fix round (`L07-05`, `GAP3-18`); one is `L07-01`, whose
migration is written and whose apply is Kody's; and one block of fourteen is a coverage gap the wave
made for itself (§6).

| | |
|---:|---|
| **137** | W1 findings scheduled |
| **97** | closed — review-verified **and** walked |
| **40** | open, each with its reason in `findings.json` (`openReason`) and grouped in §5 |
| **217** | adversarial-review findings raised across the six code lanes, in 14 review rounds |
| **49** | new findings the acceptance walks filed (`W1-A-*`, `W1-B-*`, `W1-C-*`, `W1-S-01`) |
| **29** | of those fixed and re-walked inside the wave; **1** withdrawn; **20** open in W2 |
| **2253** | tests in 245 suites on the tip, 4 known issues — up from 1552 at W0 close |
| **0** | production writes |

---

## 2. The tip, and its gates

Run by this closer on the tip `08397a7d2`, clean tree,
`IOS_GATE_UDID=089A3512-86D6-4415-8423-98D5625FCD5A`:

```
$ apps/mobile/Patina/scripts/ios-gate.sh unit
━ Test run with 2253 tests in 245 suites passed after 8.545 seconds with 4 known issues.
```

Log: `apps/mobile/Patina/.gatelogs/w1close-unit.log` in the integration worktree (line 48458).
**One honest caveat:** the log carries no `** TEST SUCCEEDED **` trailer, because after the summary
line `xcodebuild` hung retrying `com.apple.mobile.notification_proxy` against Kody's *locked physical
iPhone* (`The device is passcode protected`) and was killed. The test run itself completed; the
summary line is the evidence, and it names the four known issues individually.

**The four known issues, each honest and each named:**

| test | why it still records |
|---|---|
| `BrandVoiceLintTests` :168 `styleResponseModelIsClean` | the remaining hit is the enum **raw value** `case curatedMix = "curated_mix"`, which the copy deck rules must not be renamed. W2 · L1-E's call |
| `RoomLifecycleTests` :297 `theTodayRailFollowsALocalDelete` | note **O14**'s `LocalRoomSignal` observer, which L1-C **declined** — the note invited the decline |
| `MatchScoreResolverTests` :193 `theVerdictPillsGuardOnMatchVerdict` ×2 | `A-34` / `C-11`'s unscored-piece guard lives on an unmerged L1-C commit. Filed as **`W1-S-01`** (§8) |

Gates recorded by the integration steward and the two fixers, on the tips they were run against:

| tip | build | release | unit | lint-delta | type-check | supabase:reset + SQL |
|---|---|---|---|---|---|---|
| `d65c9b47b` (merge tip) | 0 | 0 | 2193 / 241 suites, 4 known | 0 | 30/30 | reset 0 · SQL **149/149 effective-green** (21 expected failures = exactly `KNOWN_FAILURES.md`) |
| `1e9372fb2` (fix round 1) | 0 | 0 | 2221 / 242 suites, 4 known | 0 | — | — |
| `08397a7d2` (fix round 2) | 0 | 0 | **2253 / 245 suites, 4 known** | 0 | — | 00562's RLS test green, 5 assertion groups |

⚠ **The fix rounds reused the steward's log filenames.** `.gatelogs/tip-unit.log` now reads 2221, not
the 2193 `integration.md` §5 recorded — round 1 overwrote it. Round 2 left no log on disk at all; its
2253 figure is the fixer's report, and it is the figure this closer reproduced above. The lesson is
one line for the next steward: **gate logs get the tip's sha in the filename.**

---

## 3. Per lane

Merge order was **D14**'s in full: **L1-C → L1-D → L1-B → L1-F → L1-X → L1-A → L1-E**, each merge
`--no-ff`, with `build` + `release` between merges. `L1-X` is the wave's only backend lane and was
inserted after L1-F.

> **Three lanes were merged below their branch tip, at a reviewed point.** That is recorded per lane
> below and again in §8, because the unmerged commits are not junk.

### L1-A — Welcome, sign-in, onboarding *(Opus)*

| | |
|---|---|
| Merge | `a04b2d99b`, second parent **`12a20aabe`** — the reviewed branch tip, verified with `git rev-parse` |
| Commits | 39 non-merge |
| Review | **56 findings** over four rounds (`RL1A-*` 21, `RL2A-*` 14, `RL3A-*` 17, `RL4A-*` 4). A fifth round re-derived all 21 round-one rows at `12a20aabe`, found every one already answered, and **wrote no commit** — the right outcome, recorded |
| Tests added | 17 suites: `AuthProviderVisibilityTests`, `AuthErrorRoutingTests`, `AuthStatusRegionTests`, `AuthFormAffordanceTests`, `AuthFailureCopyTests`, `AuthAndQuizCopyTests`, `SignInCodeNamingTests`, `OtpVerifyCoalescingTests`, `AppleSignInRoleTests`, `TestAccountLoginFallbackTests`, `GuestEscapeTests`, `OnboardingResumptionTests`, `QuizProgressTests`, `QuizIconographyTests`, `KeyboardDismissalTests`, `LegalLinkTests`, `DeleteAccountCopyTests` |
| Findings | **20 closed · 7 open** of 27 |
| Merge conflicts | four, all resolved on the charter's side: `AuthScreenView.swift` (L1-A's structure wins, L1-D's tokens re-applied inside it — task N16 exactly), `InvestmentPerspectiveView.swift` and `ScanFloorPlanPreviewView.swift` (L1-D owns the ramp), `SessionIsolationTests.swift` (additive on both sides, both kept) |

**Closed:** `A3-06` (Google is gone), `P-29` (measured to the third decimal in both directions),
`A-101`, `A-03`, `A-05`, `P-02`, `P-18`, `P-20`, `P-22`, `P-30`, `C1-30`, `C1-37`, `C3-06`, `C5-04`,
`C9-08`, `B-12`, `C1-14`, `B-21`, `B-13` (L1-C's file), `C3-03` (L1-D's file, closed by walk C's
`P-35` shot).

**Open, and why:** `A3-07` and `A3-16` need a real Apple Account and a real allow-listed pair — both
are R1 device rows (`D-02`, `D-04`). `C1-05` could not be observed: the repaired local stack answers
OTP in under 120 ms and the simulator's own *"Sign in to your Apple Account"* alert intercepts the
one row `AuthProviderRow.isBusy` actually drives. `A-13`, `A-21`, `C1-04`, `C1-28` all need the style
quiz, which no walk entered — because `A-05` passing means Skip genuinely skips it.

**Amendment owed and now made.** `PROGRAM.md` §11.6 and `findings-by-lane.md` recorded L1-A at
**27/27**. `A→S-7` ruled it **25/27 with two carried rows**; both carried rows (`C9-08`, and
`C2-21`/`GAP7B-09`'s acknowledgement half) were closed at integration by X29's checklist. The correct
line is **"25/27 at merge, both carried rows closed at integration, 20/27 walked."**

### L1-B — Data, persistence, resilience *(Opus)*

| | |
|---|---|
| Merge | `de1fa5196`, second parent `47bbffe3b` = the branch tip |
| Commits | 33 non-merge |
| Review | **51 findings** over three rounds (`RL1B-*` 21, `RL1B2-*` 18, `RL1B3-*` 12) |
| Tests added | 12 suites, incl. `LoadStateHonestyTests`, `RefreshableSurfacesTests`, `PersistenceMigrationTests`, `NetworkBudgetTests`, `TelemetryQueueBoundsTests`, `MatchScoreResolverTests`, `ProductSelectShapeTests`, `RoomLifecycleTests`, `ScanFallbackEntryTests`, `LaunchWatchdogTests`, `FrameCaptureContextTests`, `CopyDeckRowsTests` |
| Findings | **20 closed · 8 open** of 28 |

**Closed:** `R-01`, `R-02`, `R-03`, `R-05`, `B-03`, `B-04`, `B-15`, `C1-18`, `C1-19`, `C4-03`,
`C4-12`, `C4-16`, `C7-02`, `C7-17`, `A-34`, `C-11`, `A-81`, `GAP4-02`, `GAP4-03`, and `C2-06`
(L1-F's file). `R-01`, `R-02` and `R-03` needed two fix rounds and are the wave's best-evidenced
closes: an offline cold launch now keeps the record, the designer seat and a `Last updated …` line,
proven at t≈4 s, t≈35 s and after the fetch failed.

**Open:** six are not walkable at all from a client simulator — `C7-01` (needs a corrupt SwiftData
store), `A3-18` (payload shape), `C7-13` (telemetry queue), `C7-15` and `C7-05` (a real scan / LiDAR),
`GAP4-25` (Rescan needs a completed scan). Two were **closed and then re-opened by fix round 2**:
`L07-05` (the cold-launch Studio count now survives without its staleness line — `W1-B-16`) and
`GAP3-18` (the guest room list still shows the previous account's room — `W1-B-17`). Both are §5.2.

### L1-C — Layout, Companion, Dynamic Type *(Opus)*

| | |
|---|---|
| Merge | `d0d5c048c` — **first**, so its Companion bottom-inset change landed before every later conflict. Second parent **`117d547c8`**, a reviewed point **two commits below the branch tip** |
| Commits | 24 non-merge |
| Review | **19 findings** (`RL1C-*`) |
| Tests added | 10 suites: `DynamicTypeLayoutTests`, `DecisionSheetDetentTests`, `CompanionInsetTests`, `CoachMarkAnchorTests`, `TapTargetTests`, `SheetChromeTests`, `HelpDoorRemovalTests`, `GuestSignInDoorTests`, `RecommendationsFillTests`, `RefreshableRootsTests` |
| Findings | **26 closed · 2 open** of 28 — the wave's best lane |

**Closed:** every accessibility blocker (`GAP1B-01`, `GAP1B-02`), the sheet chrome group (`A-100`,
`C-23`, `A-99`, `C5-05`, `B-60`), the money-visibility pair (`B-28`, `GAP2-24`), the chrome group
(`A-89`, `A-45`, `B-27`), the help doors (`C-05`, `C-18`, `B-07`, `C5-02`), the tour (`B-09`,
`B-10`), and `C-06` — whose last surface, the Companion headline at AX3XL, closed in fix round 2 as
`W1-C-03`.

**Open:** `A1-14` (`DesignerConsultationView` sits behind "Get design help", which no walker opened)
and `GAP4-16` (the Reveal lives inside the style-quiz flow, which no walk entered). Both are the same
two doors §6 names.

### L1-D — Tokens, dark mode, contrast, iconography *(Opus)*

| | |
|---|---|
| Merge | `b8413ee29`, second parent **`2debcfc11`**, **two commits below the branch tip** (both paperwork) |
| Commits | 24 non-merge |
| Review | **40 findings** over four rounds (`RL1D-*` 22, `RL1D-R3-*` 18) |
| Tests added | 14 files, incl. `ContrastTests` + `PatinaContrast` (a real WCAG calculator, not a string pin), `DynamicTokenTests`, `TypographyAdoptionTests`, `BorderTokenAdoptionTests`, `SelectedStateTests`, `PrimaryButtonStyleTests`, `CompanionOrbAppearanceTests`, `HouseRecordRowInkTests`, `ImagePlaceholderTests`, `CurrencyFormattingTests`, `EditorialReadTimeTests`, `ChangedSurfaceShotTests` + `RenderPin` |
| Findings | **15 closed · 3 open** of 18 |

Walk C measured every claimed ratio on glass rather than reading the token file: the Companion mark
**11.15:1** in dark (was 1.15:1), the panel subtitle **5.71:1** (was 1.11:1), dark-mode meta ink
**7.48:1** (was 2.66), the filled primary **14.24:1** on three surfaces, the Apple button in dark
**21:1** label / **18.6:1** ground. `PatinaColors.pearl` has **0** production call sites outside its
two token files, and `.font(.custom(` has **0** in production code.

**Open:** `A3-01` (the local catalogue has 16 published pieces, so the honest empty state never
renders — the data half is **D2**'s), `A-11` and `A3-17` (the quiz iconography and the editorial
read-time, both behind doors no walk opened).

### L1-E — Copy *(Sonnet, Opus review)*

| | |
|---|---|
| Merge | `5657ab492`, second parent **`551c0f36f`** — *the SHA, not the branch tip*, which is **six commits behind** and two of those six are code |
| Commits | 34 non-merge |
| Review | **16 findings** (`RL1E-*`, `RL1E2-*`, `RL1E3-*`, `RL1E4-*`) |
| Tests added | 8 suites: `BrandVoiceLintTests`, `SentenceCaseTests`, `NounConsistencyTests`, `ErrorVoiceTests`, `GuestPromiseTests`, `PluralisationTests`, `GreetingWindowTests`, `ARPlacementFailureCopyTests` — plus `AppApostropheLintTests` in fix round 2 |
| Findings | **4 closed · 14 open** of 18 |
| Deck | `l1-e-copy-deck.md` **revision 5** (97 152 B), applied at `05e1ffaaa`; 34 rows resolve to a `.swift` file |

L1-E's deliverable is a **deck applied into other lanes' files**, and that shape is what produced the
wave's one real coverage gap: **no walker carried an L1-E table**, so fourteen of eighteen rows are
review-closed on source and were never read on a screen. See §6.

**Closed:** `A-06` — and it closed properly, not by deck row. Walk C counted the app target itself:
**282** double-quoted literals carry U+2019 between letters and **2** carry U+0027, and both of those
two are trailing comments. `AppApostropheLintTests.everyAppLiteralIsCurly` walks every `.swift` under
`Patina/` with a >300-file floor so an empty walk cannot pass. Also closed: `C5-09`, `C5-10` (walk A
read "Sign up", "Retake your style quiz", "Saved pieces: 0"), `C-30` (the Studio stat reads
**"1 ROOM"**, not "1 ROOMS").

**One thing the deck pass exposed that no note predicted.** L1-B's note S5 predicted seven
`BrandVoiceLintTests` unexpected passes at merge 6; with every lane on the tip it was **42 across six
suites** — each a `withKnownIssue` that stopped recording because the row it waited for landed. All
42 were unwrapped at `2b82b47c1`, so each is now a bar.

### L1-F — Notifications, messaging, widget, deep links *(Opus)*

| | |
|---|---|
| Merge | `52aa910ea`, second parent `acb4b3cbb` = the branch tip |
| Commits | 22 non-merge |
| Review | **35 findings** (`RL1F-*`) — the wave's largest single-lane review load |
| Tests added | 11 suites: `DeepLinkQueueTests`, `BadgeCountPersistenceTests`, `BadgeFreshnessTests`, `NotificationsLoadStateTests`, `PushAuthorizationCopyTests`, `SignOutResetTests`, `ThreadHeaderTests`, `WidgetProjectionTests`, `WidgetSnapshotOwnershipTests`, `WidgetFlagOffRenderingTests`, `LaunchWatchdogFallbackTests` |
| Findings | **12 closed · 5 open** of 17 |

**Closed:** `L07-02` (the composer is tappable on the four-tab root — a W1 blocker), `L07-03`,
`C2-07` (end to end through a **cold relaunch**, after 00562), `C2-21` and `GAP7B-09` (on the real
sign-out path and the typed-password path, twice), `C2-09`, `C4-04`, `C-13`, `C-14`, `C2-02`,
`B-16`, `GAP7B-05`.

**Open:** `A-63` and `A-80` (states a signed-in walk cannot produce), and **`GAP7B-02`, `GAP7B-03`,
`GAP7B-04` — all three are placed-widget claims and the springboard gallery could not be opened by
synthetic taps** (three attempts). The code matches the ruled fix in each case; the proof is R1's
device row **D-10**.

### L1-X / L0.2 — the wave's one backend row *(Opus)*

| | |
|---|---|
| Merge | `2beb09278`, second parent `0058771ec` = the branch tip |
| Commits | 2 non-merge |
| Tests added | `supabase/tests/rls/00559_proposal_signing_multi_studio.test.sql` — green, and 00559 is the applied head on the local stack |
| Findings | **0 closed · 1 open** of 1 |

`L07-01` is closed *at the level this lane can reach*: the migration is written, proven red→green in
a rolled-back local transaction, and its RLS test passes. It is **not** applied to Strata (Kody's,
runbook §K), the app path is unproven (it needs a designer in two active studios, which the fixture
does not create, and signing would have mutated the shared fixture), and **the file must be
renumbered before it meets `main`** (§8). L1-X's notes out are two "nothing owed" notes — the client
sends only `{p_proposal_id, p_signed_name}`, so no screen changes.

---

## 4. The walks, and the two fix rounds

Three walkers, one clone each, on the steward's signed build, launched with **no `-PatinaFlags`**.
Scope was split by lane: **A** took L1-A (27 rows), **B** took L1-B + L1-C + L1-X (61 rows including
four extra ids), **C** took L1-D + L1-F + five cross-lane ids (41 rows).

| round | tip | A | B | C |
|---|---|---|---|---|
| walk 1 | `d65c9b47b` | 19 of 27 walked, **0 FAIL**, 8 filed | 35 PASS / 9 FAIL / 8 blocked / 9 unreachable, 9 filed | 28 PASS / 4 FAIL / 9 unverified, 15 filed |
| **fix round 1** | → `1e9372fb2` | 5 commits: `2b4270d5c` `440a312ea` `72744cbd8` `ce9f602c5` `1e9372fb2` | | |
| re-walk 1 | `1e9372fb2` | 5 of 5 fixer rows PASS (4 binary-only, HID dead), 1 filed | every walk-1 FAIL re-verified: 8 PASS, `R-02` half, `B-10` partial; **`W1-B-02` withdrawn**; 6 filed | HID dead (Mac locked); `C2-21`/`GAP7B-09` PASS by `openurl`, `C2-07`/`C-06` unchanged |
| **fix round 2** | → `08397a7d2` | 7 commits: `fe0a63ee0` `4790ab8eb` `7c119e563` `ea4d9d321` `a9cb4ceb4` `3dbef7c0b` `08397a7d2` | | |
| re-walk 2 | `08397a7d2` | all 4 binary-only rows walked on glass; 4 code-verified rows walked; **`W1-A-03` closed**; 2 filed | `R-02`, `B-10`, `W1-B-01`, `-06`, `-07`, `-08`, `-10`, `-12`, `-13` all fixed; 3 filed | 4 walk-1 FAILs all PASS; 11 of 15 `W1-C-*` closed; 4 filed |

**Every walker proved which binary it was driving.** Walk B re-walk 2: the installed
`Patina.debug.dylib` sha256 `d70c1d00…` is byte-identical to the worktree product. Walk C re-walk 2:
the same hash, plus the dylib carries the string `08397a7d`. That matters because the 59 KB `Patina`
file in the bundle is only the launcher — grepping it returns nothing for *any* app string, a false
"the build is stale" signal walk C documented for the next walker.

**Walk-verified FAILs remaining at re-walk 2: none.** Every row that failed a walk and was in a
fixer's scope is now PASS on glass. What is left open is unreachable, re-opened by a fix, or Kody's.

### The evidence that could not have been obtained any other way

- **`P-29`** measured to the third decimal in both directions: after a failed code and Cancel, the
  root carried no banner and every control sat at its cold-launch *y* (`appleButton` 352.333,
  `emailButton` 413.583, `guestButton` 518.25, `passwordButton` 585, links 756); with a root-scoped
  Apple error the banner rendered in a **reserved** slot at y=309.17 and those same five values were
  unchanged. The 33 pt shift is gone.
- **`W1-A-04`**: Terms opens an in-app sheet and the device's **process list during the sheet is
  `Patina.app/Patina` only** — MobileSafari never launches.
- **`W1-A-06`**: `999999` typed ~30 s after a real code was issued, with the resend timer still
  reading 28 s, so expiry was arithmetically impossible — and the banner no longer claims it.
- **`C2-07`**: bell 3 → Mark all read → no badge → **still none after a cold relaunch**, i.e. after a
  fresh server fetch, with the six `notification_log` rows reading `0 unread, status opened`.
- **`B-10`** step 1: pixel-probed at x 2.7 pt — y 62→117 dimmed (180,178,175), **y 117.3→246
  un-dimmed** (246,243,238 → 238,235,229), y 246→ dimmed. Step 3's tab row read (238,235,230),
  byte-identical to the previous walk's frame, which is how the walker proved no regression.
- **`W1-C-01`**: proven with a real bearer token through PostgREST before and after 00562 — PATCH
  affects **0** rows before, **6** after, `0 unread` after, fixture restored to 6 unread.

### Fixture honesty

Every walker recorded what it changed on the shared local stack and restored it. Walk C set
`profiles.help_state` to `{}` to reach the tour and the app rewrote it on the next run; it marked the
notification feed read and restored it to `6 of 6 unread, delivered`. Walk B left
`client@patina.dev`'s `help_state` cleared and **said so** — the first-launch tour will replay for
that account on its next launch.

---

## 5. What is open, and why

### 5.1 Rows no walk could reach — 36

| reason | rows |
|---|---|
| **the style quiz was never entered** (because `A-05` passes: Skip skips) | `A-13`, `A-21`, `C1-04`, `C1-28`, `A-11`, `B-23`, `GAP4-16` |
| **"Get design help" was never opened** | `A1-14`, `C4-09`, `C5-11` |
| **needs a real device / LiDAR / a placed widget** | `C7-05`, `C7-15`, `GAP4-25`, `GAP7B-02`, `GAP7B-03`, `GAP7B-04`, `A3-07` |
| **invisible from the UI** | `C7-01`, `A3-18`, `C7-13` |
| **the fixture cannot produce the state** | `A3-01` (16 published pieces), `A-63` (guest feed), `A-80` (feed resolves too fast), `A3-16` (no allow-listed local pair), `C1-05` (sub-120 ms + a system alert), `A3-17` |
| **L1-E rows on surfaces no walk entered** | `A3-28`, `A-60`, `A-79`, `A-52`, `B-20`, `C-22`, `C-38`, `C4-08`, `C5-06`, `C5-16`, `C5-20` |

Seven of these have an R1 device row waiting for them: `A3-07`→**D-02**, `A3-16`→**D-04**,
`C7-15`/`C7-05`→**D-05**, `GAP7B-02/03/04`→**D-10**.

### 5.2 Rows the second fix round re-opened — 2

Both are the same shape: a fix landed, a walk confirmed it, and the *next* fix's mechanism undid part
of it on a path the earlier walk had not exercised.

- **`L07-05`** — `4790ab8eb` gave the cold launch a floor that carries the Studio count. The floor
  carries the count but not `lastLoadedAt`, so an offline **cold** launch prints *"5 things need your
  eye"* as current above *"We couldn't gather your Studio…"* with no staleness line anywhere in the
  tree. The **warm** shape still prints it. Mechanism filed as **`W1-B-16`**.
- **`GAP3-18`** — the same commit seeds `settledUserId` from `local_store_owner_user_id`, which makes
  a sign-out (`A → nil`) stop reading as a scope change. The guest Your Spaces then still lists the
  previous account's room, on a device whose guest Studio says *"Guest / Rooms: 0"*. Reproduced twice.
  On a shared phone it is a privacy leak. Mechanism filed as **`W1-B-17`**.

**Neither is a reason to hold build 1 on its own**, but `D-16` (airplane mode) and `D-17` (second
account) are the device rows that will meet them, and R1 should expect both.

### 5.3 The one backend row — 1

`L07-01`. Code done, apply owed, renumber owed. Runbook §K.

### 5.4 The one row that changed shape rather than closing — `W1-B-03`

The Approval decision's missing approve control is **fixed as a screen** — it now says *"There is
nothing to choose here yet — your designer has not added the options."* above the two acts that work
— and is **still open as a product gap**: a round-one tester cannot unblock Procurement, because
`apply_client_decision` takes a `p_selected_option_id` and raises `insufficient_privilege` unless
`coordination_kind = 'selection'`. It moved to **W2 · L0.2** as a backend row.

---

## 6. The coverage gaps this wave leaves

Four, stated plainly, because a thin section in a ledger reads exactly like a clean one.

1. **L1-E was never walked.** Fourteen of eighteen rows are review-closed on source and were not read
   on a screen. The cause is structural, not negligent: L1-E's deliverable is a deck applied into
   other lanes' files, so it had no surfaces of its own to hand a walker, and the three walk briefs
   were cut from the *other* lanes' coverage tables. **The fix for W2 is one line in the walk brief:
   a copy walker, or an L1-E column on every other walker's route.**
2. **The style quiz and "Get design help" are two closed doors** behind which ten rows sit. Both are
   reachable — the quiz with `--resetonboarding`, the design-help flow with one tap — and neither was
   on any route. W2's walk brief should name them.
3. **The placed widget has never been seen.** Three `GAP7B-*` rows and R1's `D-10` all rest on the
   springboard gallery, which synthetic taps cannot open. This is not new (the Daily Return's W6 hit
   it too) and it is now formally a device-only claim.
4. **PROGRAM.md §11.2's warning was right.** The corpus barely observed the four-tab root it now
   ships — only walk `B` of the original audit walked it. W1's three walkers were the first real look,
   and they filed 49 rows on it. Expect W2's four-tab surfaces to keep producing.

---

## 7. New findings filed — 49

Full text and evidence for each is in `findings.json`; the closed ones are also tabulated in
`findings-by-lane.md` § "W1 closure", and the twenty open ones sit in the W2 lane tables.

**29 closed inside the wave** (`W1-A-01`, `-03`, `-04`, `-05`, `-06`, `-07`, `-08`; `W1-B-01`, `-04`,
`-05`, `-06`, `-07`, `-08`, `-09`, `-10`, `-12`, `-13`; `W1-C-01`, `-02`, `-03`, `-04`, `-05`, `-06`,
`-08`, `-09`, `-12`, `-14`, `-15`) — plus **`W1-B-02` withdrawn**.

**20 open, all in W2:**

| id | sev | lane | what |
|---|---|---|---|
| `W1-B-16` | major | L1-B | a cold-launch failure prints a retained Studio count with no staleness line — re-opens `L07-05` |
| `W1-B-17` | major | L1-F | the guest room list survives a sign-out — re-opens `GAP3-18`; a privacy leak on a shared phone |
| `W1-B-18` | major | L1-C | at AX-XL the tour bubble clips its own content and offers **no Skip and no Next** — created by `W1-B-09`'s wrap fix |
| `W1-B-03` | major | L0.2 | a `signoff` decision has no approve path in `apply_client_decision` |
| `W1-A-02` | major | L2-G | all three walkers shared one database and one account; peer data reached a walker's screen |
| `W1-C-07` | minor | L1-A | a signed-in user is shown the signed-out intro, still offering "Sign in" |
| `W1-C-10` | minor | L1-C | `--resetonboarding` cannot replay the tour: it clears UserDefaults, the tour's state is in `profiles.help_state` |
| `W1-C-11` | minor | L1-B | a cold-launch request burst intermittently stalls **after** the socket connects; every request then times out at 30 s until relaunch |
| `W1-C-16` | minor | L1-B | a decision the client cannot read renders as a network error whose retry can never succeed |
| `W1-C-17` | minor | L1-C | the decision option CTA truncates to "Choo…" at AX3XL — the button that resolves the decision |
| `W1-B-11` | minor | L1-C | "MEMBER SINCE …" clips at both margins at AX-XL |
| `W1-A-11` | minor | L1-A | the consent sentence loses its "and" at accessibility sizes |
| `W1-S-01` | minor | L1-C | `A-34`/`C-11`'s unscored-piece guard is on an unmerged commit |
| `W1-A-09` | polish | L1-A | at AX-XL the consent line is below the fold (reachable — walked and scrolled) |
| `W1-A-10` | polish | L1-A | the marketing site's cookie banner renders inside the in-app legal sheet |
| `W1-B-14` | polish | L1-C | the tour's step-2 copy names a control its spotlight does not light |
| `W1-B-15` | polish | L1-C | the tour scrim leaves the top safe area un-dimmed — **open deliberately**, `.ignoresSafeArea()` was tried and reverted because it moves the cut-out out of the anchors' space |
| `W1-C-13` | polish | L1-C | tour step 2's popover is drawn over the tab bar |
| `W1-C-18` | polish | L1-C | the Browse header truncates rather than wrapping at AX3XL |
| `W1-C-19` | polish | L1-C | completing the tour does not record `completed` (PLAUSIBLE — a sign-out sat between the tap and the read) |

`W1-C-11` deserves one extra line: it was filed PLAUSIBLE and is no longer. It reproduces on a
**healthy** stack, the CFNetwork log names `client:data_stall @3.114s` on a connected socket, kong
logged nothing (it writes its access line on response), and the identical queries answer from the host
in 7 ms. Its worst face is a push notification tapped from a cold app landing on an error screen whose
retry does not recover — which is R1's **D-07** exactly. It still owes one deliberate airplane-mode
round trip on hardware.

---

## 8. What the wave carries forward

1. **Three lane branches are ahead of what was merged, and two carry code.**

   | branch | tip | ahead | what is on it |
   |---|---|---:|---|
   | `first-flight/w1-l1c` | `46752b646` | 2 | `da4068eb5` five deck apostrophes — **superseded**, applied by hand from the deck. **`46752b646` the `matchVerdict` guards + `UnscoredMatchPillTests`** — this is `W1-S-01`, and it is why `MatchScoreResolverTests` records two known issues |
   | `first-flight/w1-l1d` | `5c5893fc3` | 2 | paperwork only (`bb38980e7` untracks eight other lanes' files; `5c5893fc3` the round-4 task list) |
   | `first-flight/w1-l1e` | `36c525b7f` | 6 | **two are code** — `0720ff55a` *the brand-voice lint reads copy, not wire keys* and `97b14969f` *split the brand-voice scanner out of its suite file* — plus copy-deck **revision 6** and the round-6 notes |

   L1-E's revision 6 and its two code commits are the more consequential of the three: the integrated
   tip carries **revision 5** and a hand-applied equivalent of `0720ff55a` (`A→E-5`, in `2b82b47c1`).
   Whoever lands W1 on `main` should diff revision 6 against revision 5 before discarding the branch.

2. **The 00559 collision is now a three-way problem, and it must be settled before this branch meets
   `main`.** `main` carries `00559_first_document_opened.sql`, `00560_invite_handoff_note.sql` and
   `00561_onboarding_drip_state_triggers.sql` from a peer session. This branch carries
   `00559_proposal_signing_multi_studio.sql` (L1-X) and `00562_notification_log_owner_opened.sql`
   (fix round 2). **`00562` is free on `main`; `00559` is not.** L1-X's file must be renumbered —
   `00563` is the next free number — and its ledger row, its RLS test filename and the runbook step
   renumbered with it. `00562` needs no change.

3. **`PROGRAM.md` §11.6 / `findings-by-lane.md` said L1-A 27/27.** Corrected in §3 above and in
   PROGRAM.md §12.

4. **Nothing was pushed and nothing production was touched.** `first-flight/w1-integration` has no
   remote. The branch is Fable's to merge.

---

## 9. Kody-run items

Every one is in **[`KODY-RUNBOOK-W1.md`](KODY-RUNBOOK-W1.md)**, in the order it must run: **K** apply
`00559` (renumbered) after `00555`/`00557`, with its read-only probe before and after · **L** apply
`00562`, without which the notification bell can never clear for a real person · **M** the read-only
verification probes both blocks share. W0's runbook blocks **A–J** are unchanged and still gate
these; W1 produced no new PostHog and no new App Store Connect step — those stay at W0 §G and §H.

The release chain itself — archive, export, entitlement check, upload, What to Test, the internal
group — is **[`R1-READINESS.md`](R1-READINESS.md)**, pre-filled with today's values and build number
**3**.

---

## 10. The two outages this wave survived

### Outage 1 — the integration steward died mid-merge, and the resume made it worse

The first integration steward (**S9**) died on a network outage **after merge 4 and L1-X, and before
merges 5 and 6**. A later botched resume then added unreviewed commits to three lane branches and left
uncommitted edits behind in three worktrees.

**Lost:** merges 6 (L1-A) and 7 (L1-E) and the cross-lane note batch — none of which had run.
**Redone by S9b:** the two merges, including L1-A's four conflicts, resolved on the charter's side;
the seven cross-lane notes at `1773570b1` and `4bd4da83b`; the whole deck pass at `05e1ffaaa`; and the
42 unwrapped known issues at `2b82b47c1`.
**Discarded, not committed:** `git checkout --` on `CompanionCoachingModelTests.swift` and
`OrderHandoffTests.swift` (L1-B), `l1-e-copy-deck.md` (L1-E), and `MessagingViewModel.swift` +
`ThreadHeaderTests.swift` (L1-F) — dead agents acting on stale findings. Three `.writer.lock.d`
belonging to dead agents were broken. **The two `MessagingViewModel` edits among them were real deck
rows**, and they were re-applied properly, from the deck, in the integration worktree.
**The residue it left is §8.1**: three branches merged below their tip, because S9b's brief forbade
touching commits nobody had reviewed. That is the right call and it costs `A-34`/`C-11` their guard.

### Outage 2 — the Mac's boot volume filled and Docker wedged

During the session's first full unit run the boot volume filled (`Macintosh HD` out of space, visible
in `.gatelogs/merge6-unit-1.log`) and `com.docker.backend` stopped answering.

**Lost:** the local Supabase stack, and with it the wave's `supabase:reset` + SQL-suite gate.
**Redone:** `~/Library/Developer/Xcode/DerivedData` cleared, returning **109 GiB**; the wedged
`com.docker.backend` ignored SIGTERM and needed SIGKILL; Docker.app and `supabase start` came up
clean; then `pnpm supabase:reset` (27 seed files, including the W0 client fixture) and
`bash scripts/run-sql-tests.sh` → **149 total, 128 green, 21 expected failures, 0 unexpected,
149/149 effective-green**, with the 21 matching `KNOWN_FAILURES.md` exactly in both directions.

### And two harness faults, which are findings rather than outages

Both are filed, both are closed, and both cost coverage before they were:

- **`W1-A-08`** — the local kong gateway was `Exited (127)` for the whole start of the walk phase,
  mounting six email templates from a **retired worktree** that Docker had replaced with empty
  directories. `/auth/v1/settings` returned `000`. The Welcome screen renders **identically** with the
  backend down, so a walker can pass a Welcome check against a dead API and never know. Walk A found
  it, repaired it from the integration worktree, and it held (200, `Up 5 hours (healthy)`).
- **`W1-A-03`** — synthetic HID died on walker A's clone after a fresh-install sequence, and on
  walker C's when the Mac locked. Reads stayed healthy throughout (`describe_screen` returned full
  trees, `simctl io` returned correct frames) while **every tap returned a success string and changed
  nothing** — three verified byte-identical with `cmp -s`. Root cause, found at re-walk 2: a stale
  per-udid `idb shell` orphaned by the walker's own device reboots; recovery is two `kill`s against
  the walker's own udid. It cost walk A 8 of 27 rows on the first pass and cost walk C its entire
  first re-walk.

**The rule both of them earn, for §7's hard rules:** *a walker's preflight is a probe of the gateway
(`curl … /auth/v1/settings` must be `200`) and a tap that is proven to have landed (`cmp -s` against
the pre-tap frame), re-run after **every** fresh install and every device reboot — not once at session
start.* And `W1-A-02`'s: **one account per walker, not just one clone per walker.**

---

## 11. What this closer changed

| file | change |
|---|---|
| `build/findings.json` | `status`/`closedBy`/`closedCommit`/`closedOn`/`walkEvidence` on 97 closed W1 rows and 2 W0 rows; `status`/`openReason` on 40 open W1 rows; 49 new `W1-*` rows. 640 → **689** rows. Backup at `findings.json.bak4` |
| `build/findings-by-lane.md` | a **W1 status** column and a `_W1 close_` line on the seven W1 lane tables and on W0 · L0.4; the 20 open new rows in the W2 lane tables; all four totals tables and every `_count:` line regenerated from `findings.json`; a new § "W1 closure"; the header note amended |
| `build/PROGRAM.md` | § 12 appended |
| `build/waves/w1/wave-report.md` | this file |
| `build/waves/w1/KODY-RUNBOOK-W1.md` | new |
| `build/waves/w1/R1-READINESS.md` | new |

`build/assemble.py` was **not** re-run. It expands `{{TABLE:…}}` placeholders from `part-*.md` prose
files in a session scratchpad that no longer exists, and it would silently drop the new `_W1 close_`
lines (it keeps only `_count:` and `|` lines). The lane tables in `findings-by-lane.md` were
regenerated by a script that reproduces `assemble.py`'s conventions exactly — the same sort key
(severity, then tier, then id), the same truncation (title 110, `where` 95, `fix` 130, pipes escaped
first), the same `⇢lane` / `+mergedIds` id cell, and the same `_count:` line — verified byte-for-byte
against the pre-close file before the new column was switched on.
