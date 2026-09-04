# First Flight · W1 — integration

Written by **S9b**, the resumed integration steward, on **2026-09-03**. The first S9 died on a network
outage after merge 4 + L1-X and before merges 5 and 6; a later botched resume added unreviewed commits
to three lane branches and left dirty edits behind. This file is the whole record of the integration,
including the first S9's merges, so nobody has to reconstruct it from `git log` twice.

| | |
|---|---|
| **Integration branch** | `first-flight/w1-integration` |
| **Worktree** | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-integration` |
| **Base** | `ba83aa67fc9b4e12fdd0626d3390760bdee3dee3` (W0 close, `main`) |
| **Tip** | **`d65c9b47ba2c9a1ece9b86050821ea88b36b86fd`** |
| **Walker product** | `…/agent-ff-w1-integration/apps/mobile/Patina/.build/DerivedData/Build/Products/Debug-iphonesimulator/Patina.app` |

---

## 1. Housekeeping, before anything was merged

- `.writer.lock.d` in the integration worktree belonged to the dead first S9. Removed; a fresh one taken.
- **`agent-ff-w1-l1b`** — `git checkout --` on `PatinaTests/CompanionCoachingModelTests.swift` and
  `PatinaTests/OrderHandoffTests.swift`; `.writer.lock.d` removed.
- **`agent-ff-w1-l1e`** — `git checkout --` on `build/waves/w1/l1-e-copy-deck.md`; `.writer.lock.d` removed.
- **`agent-ff-w1-l1f`** — `git checkout --` on `Features/Messaging/ViewModels/MessagingViewModel.swift`
  and `PatinaTests/ThreadHeaderTests.swift`; `.writer.lock.d` removed.
- All three worktrees verified clean afterwards (`git status --porcelain -uno` empty).

Those edits came from dead agents acting on stale findings and were **not** committed. The two
`MessagingViewModel` changes among them were real deck rows, and they are applied properly in §4
below, from the deck, in the integration worktree.

---

## 2. The merge log

Every merge is `--no-ff`. Merges 1–5 (L1-C … L1-X) were the first S9's; merges 6 and 7 are this
session's. **Note the second-parent column**: three lanes were merged at a *reviewed point*, not at
their branch tip, and that distinction is load-bearing (§7).

| # | Merge commit | Lane | Second parent = what was actually merged | Branch tip today |
|---|---|---|---|---|
| 1 | `d0d5c048c` | L1-C | `117d547c8` *test(ios): the C-06 pins name the mechanism that shipped* | `46752b646` (2 commits ahead) |
| 2 | `b8413ee29` | L1-D | `2debcfc11` *style(ios): split the shot suite's body under the 50-line ceiling* | `5c5893fc3` (ahead) |
| 3 | `de1fa5196` | L1-B | `47bbffe3b` *style(ios): the manual-entry gate's locals pass identifier_name* | `47bbffe3b` (= tip) |
| 4 | `52aa910ea` | L1-F | `acb4b3cbb` *fix(ios-nav): the return route belongs to the account it was opened in* | `acb4b3cbb` (= tip) |
| 5 | `2beb09278` | L1-X | `0058771ec` *fix(proposals): resolve the activation studio from the proposal (00559)* | `0058771ec` (= tip) |
| — | `9a1025f44` | — | the first S9's note batch (three edits: `RefreshableSurfacesTests`, `AccountIsolationTests`, `ThreadDetailView`'s `Border.hairline`) | — |
| **6** | **`a04b2d99b`** | **L1-A** | **`12a20aabe`** — the reviewed **branch tip**, verified with `git rev-parse first-flight/w1-l1a` | `12a20aabe` (= tip) |
| **7** | **`5657ab492`** | **L1-E** | **`551c0f36f`** *docs(first-flight): copy deck revision 5* — **the SHA, not the branch tip** | `36c525b7f` (6 unreviewed commits ahead) |

### Merge 6 · L1-A — four conflicts, resolved on the charter's side

| file | resolution |
|---|---|
| `Features/Authentication/Views/AuthScreenView.swift` | L1-A's structure wins (the inline divider + guest button become the `divider` / `guestButton` properties it extracted); L1-D's token substitution is re-applied *inside* it. This is L1-A task **N16** exactly. |
| `Features/StyleConversation/Views/InvestmentPerspectiveView.swift` | Both lanes made the same PT-1-1 swap off `.font(.custom(…))`. L1-D's tokens win — `h5Regular` (the original was PlayfairDisplay-**Regular**; `h5` is Medium) and `monoLabel` (the 10 pt label floor). L1-D owns the ramp. |
| `Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift` | Same, `monoLabel` ×2. |
| `PatinaTests/SessionIsolationTests.swift` | Additive on both sides — HEAD's `LocalStoreRecovery` row and L1-A's `AuthProviderCatalog` / `OnboardingCompletion` rows. **Both kept.** |

In the same commit, the two merge-time ratchets L1-A wrote for merge 5:

- **`D→A-8` / task N15** — `AuthScreenView`'s two `PatinaColors.pearl` strokes → `PatinaColors.Border.strong`.
  `BorderTokenAdoptionTests.pearlHasNoCallSitesOutsideTheTokenFile` is a bar at **zero**, and
  `AuthErrorRoutingTests.thePearlStrokesAreRatchetedToZero` flips from `<= 2` to `== 0` the moment
  `PatinaColors.Border` is on the tip. App-wide `PatinaColors.pearl` outside `Tokens/PatinaColors.swift`
  and `Tokens/PatinaGradients.swift` is now **0**.
- **`L1F→A-2` / X29 leg 2** — `ContentView.swift`'s `.auth` case passes
  `pendingLinkNotice: coordinator.pendingLinkNotice`; `AuthSheet.swift` passes `nil` with the note's own
  reason (a link held while the modal is up is acknowledged by the sheet dismissing into the
  destination). `AuthErrorRoutingTests.theHeldLinkNoticeIsWiredWhenTheCoordinatorCanSupplyIt` stops
  being inert and requires both call sites.

**Merge 6's acceptance criterion (`A→S-7`) is met.** Fable ruled L1-A merges at **25/27 with two
carried rows**; both carried rows — `C9-08` and `C2-21`/`GAP7B-09`'s acknowledgement half — are closed
on this tip by X29's checklist (§3), and both of their tests are green **with their dependencies
present**. `PROGRAM.md` §11.6 and `findings-by-lane.md` still say 27/27; that is the closer's
amendment to make, and `A→S-7` is its referent.

### Merge 7 · L1-E — one conflict

`build/waves/w1/l1-e-copy-deck.md`, add/add: L1-D's paperwork commit `771016eaf` had carried the deck's
**first** revision (35 004 B) into the integration branch, and `551c0f36f` brings **revision 5**
(97 152 B). Resolved to revision 5 — the deck owner's later text, and a superset: every finding id in
the first revision appears in it (`comm -23` over both id sets is empty).

---

## 3. Cross-lane notes applied at merge time

`9a1025f44` (the first S9) applied three. These are the rest — every note addressed to the steward, or
to a lane that has now merged, that nobody had applied. Commit
**`1773570b1`** *fix(first-flight): apply the merge-time notes the lanes addressed to merges 3-6* and
**`4bd4da83b`** *the last two cross-lane notes*.

| note | finding | what landed |
|---|---|---|
| **`B-L1A-2`** | `C9-08` | `.keyboardDoneToolbar()` on all five `.numberPad`/`.decimalPad` fields in L1-B's four files (`RoomBudgetSheet:61`, `ManualRoomEntryView:70,147`, `RoomSettingsView:198`, `ScanFallbackEntryView:185`), plus `.dismissKeyboardOnScroll()` on the three whose form is a `ScrollView`. `KeyboardDismissalTests.everyBareNumericFieldIsOneOfTheFiveKnownOpenSites` goes from a four-file allowance to **the empty set** — the direction its own doc comment calls "the signal that `C9-08` may finally read closed". |
| **`L1F→C-1` / `C-2`** | `C2-07` | `DailyRoomView:282` reads `BadgeCountService.shared.unreadNotificationCount` instead of a second `NotificationsViewModel`'s filter. |
| **`L1F→B-5`** | `RL1F-25` | `StudioQueueBuilder:33` and `:392` read the same service. This was the **third** count — the Studio row said "6 unread updates" (the raw table 00534 double-writes) while the bell said 3 and the feed said 0. |
| **`L1F→C-3`** | `RL1F-21` | `RecordRefresh:95` → `snapshots.save(record, owner: sessionUserId)`, so a sign-in cannot push an unowned widget payload. |
| **`O12`** | `L07-05` | `StudioHubView` renders `viewModel.stalenessLine`. |
| **`O5`** | `C4-03` | `YourSpacesView` draws `PatinaErrorState` when the list is empty **and** `RoomSyncCoordinator.lastLoadFailed` — before the "No rooms yet" branch, as the note requires. |
| **`O7` / `C-L1B-4`** | `R-02`, `A-81` | `DailyGreetingHeader` takes `unreadCountIsKnown` and says **nothing** rather than "No unread notifications" about a query that never answered. `DailyRoomView` passes `BadgeCountService.shared.hasLoaded` — the same service the count comes from. |

Every tripwire those notes said to delete on landing is deleted, not waived:
`BadgeFreshnessTests.owed` is now empty, and `WidgetSnapshotOwnershipTests.theRebuildNamesItsSession`,
`LoadStateHonestyTests` (both cases) and `AttentionCountTests` (both cases) are unwrapped and are bars.

### One thing the merge exposed that no note predicted

`SelectedStateTests.noLightLabelRidesOnTheRawAccent` was **red on the tip** — `FirstLaunchTour.swift:906`
(the tour's Next/Done CTA) and `NewRoomSheet.swift:68` (the option glyph) both pair `PatinaColors.offWhite`
with a raw `PatinaColors.clay` fill, which `C3-05` measured at 2.33:1. Both are new code L1-C wrote,
merged first, so L1-D's suite arrived after them and neither was on its deferred list. Closed with
L1-D's own substitution (`Interactive.active` + `Text.inverse`), and the three *deferred* ceilings
(`AuthenticationView`, `StyleQuizView`, `RoomTypePillRow`) are set to **0**, which is what that suite's
own comment promised for the integration tip.

---

## 4. The E deck pass

Every row of `l1-e-copy-deck.md` **revision 5** was checked by grepping its today-string against the
file the row names, in the merged tree — 34 rows resolve to a `.swift` file. Rows already applied by
their owning lane are recorded as such; the ones nobody had applied are below. Commit
**`05e1ffaaa`** *fix(ios): apply the W1 copy deck (L1-E)*. **String literals only; no logic.**

| deck line | id | file | today → final |
|---|---|---|---|
| L207 | `C5-10` | `ProfileView.swift:148` | `"Retake Style Quiz"` → `"Retake your style quiz"` — the deck itself marks this **"Still open"** |
| L206 | `C5-09` | `ProfileView.swift:222` | `.accessibilityLabel("Saved items: …")` → `"Saved pieces: …"` — the deck's other **"Still open"** row |
| L205 | `C5-10` | `SettingsView.swift:229,231` | `.alert("Sign Out"` → `"Sign out?"`, `Button("Sign Out")` → `"Sign out"`, **plus** the `AccountActionsTests` pin the deck says to move in the same commit |
| L208 | `A-52` | `CompanionActionRows.swift:38` | `"See what's on Patina"` → `"See what’s on Patina"` (`E4-L1C-1`'s byte) |
| L228 | `A-06` | `CompanionActionRows.swift:73,88` | `"What's been billed"`, `"What's due"` → U+2019 (`E4-L1C-2`) |
| L217 | `A-06` | `HomeStoryRetryRow.swift:24,31` | `"Today's story couldn't load"`, `"Let's try that again"` → U+2019 |
| L234 | `A-06` | `DesignerConsultationView.swift:25` | `They'll` → `They’ll` (`E5-L1C-1`) |
| L261 | `A-06` | `MessagingViewModel.swift:413` | `sendFailureLine` → U+2019 (`E4-L1F-1`) |
| L262 | `A-06` | `MessagingViewModel.swift:75,331` | `"Couldn't load conversations"` → `"We couldn’t load your messages. Try again."`; `"Couldn't load messages"` → `"We couldn’t load this conversation. Try again."` |

Three pins that read those literals moved with them: `CompanionActionMatrixTests`, `ThreadHeaderTests`
and `StudioDoorTests`.

**Rows the grep flagged and the file cleared, recorded so nobody re-checks them:** `A-101` ×2
(`AccountDeletionService` — the today-string survives only in a comment, and the final body is a
multi-line `+` concatenation), `C5-10` ×2 (`AuthenticationView:139` is a comment quoting the Title Case
it replaced), `C4-09` (`ScanUploadProgressView` — the strings live in `ScanUploadFailureCopy.swift`,
which exists), `RL1E2-19` (`NamedAesthetic:82` already reads `"Collected"`), `C5-11`
(`DesignServicesService:286`), `C5-10` (`CollectionsView`), `C5-16`, `C5-09` (`ItemActionMenu`),
`A-60`/`C-22`, `C-30`.

**One row is superseded, not applied:** `A-06` on `LocalStoreRecoveryNotice.swift:20-25`. L1-B rewrote
that screen's copy entirely (`"We had to start this phone’s copy over"` + a new body) and the
replacement already types U+2019, so the deck's sentence no longer exists to fix.

### The pins the deck pass unwrapped

Commit **`2b82b47c1`** *test(first-flight): the copy deck's pins come off their known issues at merge 6*.
L1-B's note **S5** predicted seven `BrandVoiceLintTests` unexpected passes; with every lane on the tip it
was **42 across six suites** — `BrandVoiceLintTests`, `SentenceCaseTests`, `NounConsistencyTests`,
`GuestPromiseTests`, `ErrorVoiceTests`, `PluralisationTests`. Each was a `withKnownIssue` that stopped
recording because the row it waited for landed. All unwrapped, so each is now a bar.

**`A→E-5`, applied.** `BrandVoiceLintTests.lint` walked every string literal, so
`QuizOption(key: "eclectic_curated")` and `key: "curated_comfort"` were linted as copy — both carry
`"curated"`, which is on `bannedWords` — while the same file's own `styleQuizWireKeysAreUnchanged`
*requires* those keys to stay. Two pins in direct conflict, exactly as L1-A described. `copyLiterals(in:)`
drops literals that are the value of a `key:` argument (`wireArgumentLabels = ["key"]` — one label wide,
so a banned word in a `label:` still fails), and both `styleQuizIsClean` and `styleQuizLabelsAreRenamed`
come off their wrappers.

`SentenceCaseTests.authSheetIsSentenceCase` now reads `SourceScan.code(in:)` rather than raw source: its
wrapper had been masking `AuthenticationView:139`, a **comment**, not a violation.

### The four known issues that remain, each honest

| test | why it still records |
|---|---|
| `BrandVoiceLintTests.styleResponseModelIsClean` | the remaining hit is the enum **raw value** `case curatedMix = "curated_mix"`, which the deck rules must not be renamed and which `wireArgumentLabels` cannot reach because it is not an argument. W2 · L1-E's call. |
| `RoomLifecycleTests.theTodayRailFollowsALocalDelete` | note **O14**'s `LocalRoomSignal` observer, which L1-C **declined** ("stays in S6", as the note invites). |
| `MatchScoreResolverTests."the verdict pills guard on matchVerdict"` ×2 | `A-34` / `C-11`. See §7 — the guards live in an **unreviewed, unmerged** L1-C commit. |

---

## 5. Gates on the tip `d65c9b47b`

Run with `IOS_GATE_UDID=089A3512-86D6-4415-8423-98D5625FCD5A` (the gate clone), on a clean tree.

```
BUILD rc=0        ** BUILD SUCCEEDED **
RELEASE rc=0      ** BUILD SUCCEEDED **
UNIT rc=0         ━ Test run with 2193 tests in 241 suites passed after 7.244 seconds with 4 known issues.
LINT-DELTA rc=0   ✓ lint-delta: no new warnings in touched files
TYPECHECK rc=0     Tasks:    30 successful, 30 total
```

`OrderHandoffTests` did not flake in any of the three full unit runs this session.

`lint-delta main` was red once, on two warnings this session introduced, and commit **`d65c9b47b`**
closes both: O12's staleness row had pushed `StudioHubView`'s struct body to 302 lines against a
300-line `type_body_length` ceiling (the row is now a small `private struct StudioHubStalenessLine`
beside the screen), and `A→E-5`'s regex capture had named its `Range` `r`.

Logs: `.gatelogs/tip-{build,release,unit,lintdelta,typecheck}.log` in the integration worktree.

### The local stack, reset and the SQL suite

`build/waves/w1/stack-reset-notice.md` was written first, as the wave requires. **The Docker daemon had
to be recovered before the reset could run** — it stopped answering after the boot volume filled up
during this session's first unit run (`Macintosh HD` out of space in `.gatelogs/merge6-unit-1.log`).
Clearing `~/Library/Developer/Xcode/DerivedData` returned 109 GiB; the wedged `com.docker.backend`
ignored SIGTERM and needed SIGKILL, after which Docker.app and `supabase start` came up clean.

```
pnpm supabase:reset          rc=0   Reset local database.  (27 seed files replayed,
                                     including supabase/seed/first-flight-client-fixture.sql)
schema_migrations head       00559, 00558, 00557, 00556, 00555
bash scripts/run-sql-tests.sh   rc=0
    total:             149
    green:             128
    expected-fail:      21  (documented in supabase/tests/KNOWN_FAILURES.md)
    unexpected-fail:     0
    effective-green:   149 / 149
```

The 21 expected failures are **exactly** the 21 live entries in `KNOWN_FAILURES.md` — the set difference
is empty in both directions. **L1-X's own test is green:**
`PASS supabase/tests/rls/00559_proposal_signing_multi_studio.test.sql`, and 00559 is in the applied head.

> ⚠ **Migration-number collision, for whoever lands this.** The main checkout's working tree carries
> **`00559_first_document_opened.sql`** — a different peer session's file at the same number as L1-X's
> `00559_proposal_signing_multi_studio.sql`. The reset above replayed **this branch's** 00559. One of
> the two has to be renumbered before either lands on `main`.
>
> ✅ **SETTLED 2026-09-03 by the pre-merge steward.** `main` won the number. L1-X's file and its RLS
> test were renumbered to **`00563_proposal_signing_multi_studio.sql`** /
> `supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql` before `main` was merged in.
> Every `00559` in this section is the pre-renumber record and is left as it was measured; the file
> on disk today is `00563`. `00562` was free on `main` and is unchanged. The one in-body comment
> that names the migration number moved too, so the `set_project_studio_id()` body hash pinned by
> `supabase/tests/edge_api/public_sd_hardening_contract_test.sql` and by `KODY-RUNBOOK-W1.md` §K5 is
> now `b81c185e313072b20ab573858ce9a8e1506d927bcb39a586568c1b2ddccaadb0`.

---

## 6. Simulators

The protected review device `973D1724-90BF-4A0A-B02D-481D561547B3` was already shut down; it was cloned
four times and **rebooted**, and is `Booted` again. Each clone: `erase` (shut down) → `boot` →
`keychain reset` → `status_bar override --time 9:41 --batteryState charged --batteryLevel 100
--wifiBars 3 --cellularBars 4` → `ui appearance light` (read back as `light` on all four). All four have
a real Simulator.app window at 456 × 972 pt, confirmed with the Quartz snippet — **not headless**.

| role | name | udid | app installed |
|---|---|---|---|
| gates | `ff-w1-gate` | `089A3512-86D6-4415-8423-98D5625FCD5A` | — (gate tiers only) |
| walker A | `ff-w1-walk-a` | `4D075B9D-6CD6-4878-8E93-3B2AF8932067` | yes |
| walker B | `ff-w1-walk-b` | `EDFCE6CF-F87A-48D4-AF32-E1A3D8B0AEF5` | yes |
| walker C | `ff-w1-walk-c` | `75D265E3-AC2F-426D-9820-DB21B27DCDD4` | yes |

The six lane clones (`ff-w1-l1a` … `ff-w1-l1f`) are untouched and belong to nobody now.

### The walker build

```bash
xcodebuild build \
  -project …/agent-ff-w1-integration/apps/mobile/Patina/Patina.xcodeproj \
  -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=089A3512-86D6-4415-8423-98D5625FCD5A' \
  -derivedDataPath …/agent-ff-w1-integration/apps/mobile/Patina/.build/DerivedData
# ** BUILD SUCCEEDED **   (no CODE_SIGNING_ALLOWED=NO)
```

Product: `…/Build/Products/Debug-iphonesimulator/Patina.app`, with `PlugIns/PatinaWidget.appex` and
`PrivacyInfo.xcprivacy` inside it. `codesign -d` reports `adhoc` / `TeamIdentifier=not set` and an empty
entitlement dict — **that is the simulator lie steward.md §6 documents**. `Patina.app-Simulated.xcent`
tells the truth and is intact on this build:

```
"application-identifier" => "VP22LXHT7L.cloud.patina.app"
"aps-environment" => "development"
"com.apple.developer.applesignin" => [ 0 => "Default" ]
"com.apple.developer.associated-domains" => [ 0 => "applinks:client.patina.cloud" ]
"com.apple.security.application-groups" => [ 0 => "group.cloud.patina.app" ]
```

Installed on all three walkers and launched once on each with
`xcrun simctl launch <udid> cloud.patina.app -DeploymentTarget local` (**no `-PatinaFlags`** — D1a makes
`house-first` the default). All three render the Welcome screen: Apple + email only (D3 drops Google),
"Look around first", sentence-case CTAs, the legal footer.
Shots: `shots/w1-integration/walk-{a,b,c}-welcome.png`. The app was terminated afterwards so each walker
starts cold.

---

## 7. What the wave carries forward — read this before calling W1 done

1. **Three lanes were merged below their branch tip, and the unmerged commits are not junk.**
   `first-flight/w1-l1c` carries two: `da4068eb5` (five deck apostrophes — *superseded*, this session
   applied the same rows by hand from the deck) and **`46752b646` *fix(ios): an unscored piece wears no
   match verdict (A-34, C-11)***, which adds the `matchVerdict` guards to `ProductDetailView` and
   `RecommendationsView` **and** the `UnscoredMatchPillTests` suite. Neither is on the tip.
   **Consequence: `A-34` / `C-11` are OPEN on this tip** — both views still draw `product.matchLabel`
   unconditionally, so a piece opened by id with `matchScore: 0` still shows a green capsule reading
   "Not scored yet". `MatchScoreResolverTests`' two known issues are that, honestly recorded. It was not
   applied here because the brief forbids touching those unreviewed commits; it needs a review round,
   not a steward's hand.
   `first-flight/w1-l1d` (`5c5893fc3`) and `first-flight/w1-l1e` (`36c525b7f`, six commits) are likewise
   ahead of what was merged.
2. **`PROGRAM.md` §11.6 / `findings-by-lane.md` record L1-A at 27/27.** `A→S-7` rules it **25/27**; both
   carried rows are now closed on the tip, so the correct amendment is "25/27 at merge, both carried
   rows closed at integration". The closer owns that edit.
3. **`SettingsView` still ships one Title-Case string the deck does not name** — nothing; the alert was
   the last one and it is applied. Recorded so the next reader does not go looking.
4. **The 00559 collision** in §5 — **settled 2026-09-03**: L1-X's file is now `00563`, the peer's
   `00559` on `main` is untouched, and `main` has been merged into this branch.
5. **Nothing was pushed and nothing production was touched.** No `db push`, no `functions deploy`, no
   portal deploy, no remote write of any kind. The only database this session wrote to is
   `127.0.0.1:54322`.
