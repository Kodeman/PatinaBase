# W2 · lane R2 — adversarial review

Reviewer: separate context, read-only against
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w2-r2`
(`daily-return/w2-r2`, 13 commits on `daily-return/integration` @ `59b389293`, tip `6b96a87a9`).

Checked against: `source/build-plan.md` (Global constraints, W2), `source/rulings-2026-08-27.md`
(R1, Q4, Q7), `source/direction-b.md` §1/§2/§3/§11 + `mock/fragments/b-M1.html`,
`b-M1.sheet`, `b-M2.html`, `b-M2.sheet`, `b-M6d`, `source/synthesis.md` §5,
`waves/w2/steward.md` §5/§7/§8/§9, `waves/w2/integration.md` §7, `waves/w2/r1-notes.md`
§1/§3/§4/§5/§9/§10, `waves/w2/r1-tasks.md`, `waves/w2/r3-notes.md`,
`waves/w1b/rulings-fable.md`, `waves/w2/r2-tasks.md`, `waves/w2/r2-notes.md`.

---

## 0. Gate, verified independently

I re-ran the lane's own gate rather than taking the report's word for it.

```
$ xcodebuild test -project Patina.xcodeproj -scheme Patina \
    -destination 'id=0B472471-1E2E-4C04-825A-8668695264C1' \
    -only-testing:PatinaTests -derivedDataPath .build/dd
✔ Test run with 942 tests in 115 suites passed after 2.575 seconds.
** TEST SUCCEEDED **
```

Matches the report's claim exactly (942 / 115). `AttentionCountTests`,
`CompanionActionMatrixTests`, `DailyRoomFeedMappingTests`, `MoneyAndStudioCopyTests`,
`FirstLaunchTourTests` and every `HouseRecord*` suite are in that green tier.

Working tree clean for `apps/ artifacts/ supabase/ packages/` (`git status --porcelain` empty
apart from sandbox `Operation not permitted` lines on `.env*`, which are the sandbox and not dirt).
`.writer.lock.d` is gone. Thirteen Conventional-Commit subjects, every commit pathspec-scoped
under `apps/mobile/Patina/**` — no `git add -A` footprint, nothing pushed, main checkout read-only.

**Contract compliance, item by item — all confirmed:**

| Contract | Where | Verdict |
|---|---|---|
| `isStandingCondition` → no date, no `· new` (r1-notes §9.1) | `HouseRecordRowPresentation.make` guard, first branch | ✅ pinned by `standingConditionDrawsNoDate`, incl. the a11y label |
| `State.new` never drawn as a second newness signal (§9.2) | `case .none, .new:` collapses to the date | ✅ pinned |
| `markSeen` **after** the build (§3) | `RecordRefresh.run` steps `paintedSnapshot → built → saved → stamped` | ✅ pinned by sequence *and* by reading `lastSeen.lastSeenAt` inside the build closure |
| Snapshot-first paint | `DailyRoomViewModel.paintRecordSnapshot()` on `load()`, plus `RecordRefresh`'s own first paint | ✅ |
| Products by id, withdrawn included (§1) | `ProductAPIClient.fetchProducts(ids:)`, `id=in.(…)`, `select=*,vendors!…`, no `deleted_at` filter; `RawProductWithVendor.deleted_at` → `toProduct()` | ✅ |
| No row invented for the two unbuilt mock rows (§10) | nothing produces `Leah added two pieces…` / `Your dining table shipped.` | ✅ (shots 03/05 show neither) |
| Honesty per tier: empty record draws **nothing** at guest/discovering | `HomeComposition.recordDraws` = `!record.isEmpty \|\| (isSignedIn && tier >= .engaged)` | ✅ shot 01 (guest: no card at all), shot 09 (engaged: both empties draw) |
| `NEW THIS WEEK` ≥3 or nothing, never padded | `NewThisWeek.rows` returns `[]` below the floor; four tests incl. a future timestamp and a nil one | ✅ |
| Empty-queue Next Move names `current_phase` (synthesis §5) | `TodayExperience.projectMove`, blank/nil phase falls through so `PhaseDisplay`'s "Discovery" default is never reachable | ✅ good defensive read |
| Story ordered `published_at desc, sort_order desc` | `EditorialStoriesAPIClient.fetchCandidates` | ✅ (no NULL-first hazard: RLS already excludes `published_at IS NULL`) |
| Card weight follows content | `recordWeight` / `storyWeight`, story wired through `DailyStoryCard(height:)` | ✅ |
| `badges.studioHint` still in `DailyRoomView.swift` at that exact path (steward §9.1) | line 446 | ✅ suite green |
| Top-band fold, zero residual `.moneyScreenTopBand` | `grep -rn moneyScreenTopBand apps/mobile/Patina` → **0 hits**; all 8 former pushed call sites carry `.patinaScreen(`, all 3 sheets carry `.patinaTopBand()` | ✅ |
| `ProposalDetailView.swift` seam (steward §8) | R2 touched `:39` only; R3's `statusIcon` region untouched | ✅ |
| Q4 hygiene not re-litigated | `TodayActiveRoomCard`/`TodayRoomArtwork` deleted as dead code this lane created; `AddToRoomSheet` untouched | ✅ |
| Edits outside the owned map | five, each declared in `r2-notes` §1; two of them are the brief's named exceptions | ✅ — but note the brief's second named exception was **`ContentView` markSeen**, and R2 correctly did *not* need it |

---

## 1. BLOCKING

### B-1 · The Record snapshot and the visit stamp outlive the account — the previous client's money and designer paint on the next one's Today
**Severity: blocking · Confidence: high (mechanism read end to end; not sim-reproduced)**

`LocalStoreReset.wipeUserScopedData()` (`Core/Persistence/LocalStoreReset.swift:24-45`) is the
auth-boundary wipe — `AuthService.swift:185` calls it when a *different* real account signs in. It
deletes eight `@Model` types, clears `RoomSelectionStore` and removes `Application Support/Scans/`.
It does **not** touch:

- `house-record.json` in the App Group container (`RecordSnapshotStore`), and
- `patina.house.lastSeenAt` in the `group.cloud.patina.app` defaults suite (`LastSeenStore`).

`grep -rn RecordSnapshotStore Patina/` outside its own file returns exactly two consumers, both
R2's: `DailyRoomViewModel.paintRecordSnapshot():321` and `RecordRefresh.run`. Neither is
account-scoped; both guard only on `AuthService.shared.isAuthenticated`.

The failure, concretely: client A signs out, client B signs in on the same device (or B relaunches
after A used the phone). `DailyRoomView` → `viewModel.load()` → `paintRecordSnapshot()` → `load()`
returns **A's** record → Today paints A's `NEEDS YOU` rows — *"Your invoice is due. / $4,250.00 ·
due Sep 1"*, *"Leah Hartwell sent a proposal to review."* — under a header naming A's last visit,
and holds them for the whole `refreshRecord()` window (`await storyTask?.value`, a SwiftData fetch,
a `products?id=in.(…)` round trip). On a cold launch that is seconds, every launch, until the
rebuild lands. The same file also survives `AccountDeletionService` (`:88` calls the same wipe),
so a deleted account's record stays on disk — adjacent to the Apple 5.1.1(v) work W1b did.

The wave has an explicit plank for exactly this class (SP-06, "account-scoped local store; the leak
to later accounts is not kept"), and the Record is **unflagged**, so there is no flag to hide behind.

Where the fix goes is a scoping question for Fable, not R2's alone — `RecordSnapshotStore` and
`LastSeenStore` are R1's files and `LocalStoreReset` is unowned in W2 — but R2 owns the only paint
path, and the cheapest correct guard is in R2's own file: stamp the snapshot with the user id it
was built for and refuse to paint one that does not match the live session. The durable fix is two
lines in `LocalStoreReset.wipeUserScopedData()` (delete the file, remove the defaults key).

---

## 2. MAJOR

### MJ-A · MJ-5's first-name form fires on a studio name — "Hartwell asked about …"
**Severity: major · Confidence: high (code path read; no test covers it)**

`HouseRecordBuilder.title(for:)` (`HouseRecord.swift:374-386`) takes the first-name form whenever
`item.designerName` is non-empty and the decision has a real title. Its own comment claims the
guard: *"the titled form is used only where a name was actually resolved… 'Your asked about …' is
the failure the first name alone would produce."*

But `item.designerName` is `decision.project?.designer?.displayName`
(`StudioQueueBuilder.swift:91`), and `RemoteDesignerRef.displayName`
(`DecisionsAPIClient.swift:57-62`) is `display_name ?? full_name ?? business_name`. A designer
profile carrying only a `business_name` — the exact case R1 named in `r1-notes` §4 when it refused
to guess (*"breaks outright when the fallback is `business_name` ('Hartwell Studio asked…' →
'Hartwell asked…')"*) — yields `firstName(of: "Hartwell Studio")` = `"Hartwell"`, and the row reads:

> **Hartwell asked about Rug color — Natural vs Sand.**

A studio addressed by half its name, on the most prominent row of the app's front screen. This is
brand voice (C6) and it is also just wrong.

The test suite does not catch it: `aStudioNameIsItsOwnFirstName` asserts
`firstName(of: "Hartwell") == "Hartwell"` — a name that is already one word — and never exercises
a two-word studio name. The fallback branch is reachable and untested.

The fix is in R2's own edit: the decision on which form to use must come from *which field
resolved*, not from whether the string is non-empty. `RemoteDesignerRef` already exposes
`studioName` (`business_name` only) beside `displayName`; a `designerIsPerson` flag carried on
`StudioQueueItemRow`, or the first-name form gated on `display_name`/`full_name` having been the
source, closes it. Add the `"Hartwell Studio"` case to `HouseRecordDecisionCopyTests`.

### MJ-B · M2's discovering house block is not built — the rail card stands in, and no local room ever prints its budget or its dated state line
**Severity: major · Confidence: high**

`b-M2.html` / `b-M2.sheet` block 3 is a **full-width 180 pt `RoomHeroCard`** carrying four lines:

> `Living Room` / `18 × 14 ft · 252 sq ft` / `3 saved pieces · budget $9,000` /
> `You added the Brass Arc Floor Lamp on Tuesday`

B §2's discovering paragraph names the same thing (*"Block 3 shows the room the person made, with
its real numbers and its own dated state line"*), and B §3 gives the room's own line as
`$2,400 in saved pieces · budget $9,000` from `RoomModel.budgetCents`. M2's screen sheet lists
`RoomHeroCard` (**new**) as a component of its own.

What ships is the 240 × 150 `YourHouseRail` card at every tier, whose local-room meta is
`HouseRoomCard.card(for: RoomModel)` = `formattedArea · N saved pieces` and nothing else
(`YourHouseRail.swift:63-75`). The budget the person typed is never printed, and no dated state
line exists anywhere in the lane. The `Saved` summary row from M2 block 5 is also absent — R2
declared *that* half (`r2-notes` §2.5) but not this one.

Three ruled elements of the discovering home (hero card, room budget, dated state line) are
therefore missing without a note. Fable's call whether they land here or in W3; they should be on
the ledger either way.

### MJ-C · The lane's two new controls are 36 pt tall, under SP-19's ruled 44 pt
**Severity: major · Confidence: high**

- `YourDesignerSeat.messageButton` — `.frame(minHeight: 36)` (`YourDesignerSeat.swift`)
- `DailyGreetingHeader.studioControl` — `.frame(minHeight: 36)` (`DailyGreetingHeader.swift`)

SP-19 (W1b lane C) is *"44 pt targets"*, and both are primary actions on the screen every session
opens on. The record rows are `minHeight: 56` and the rail cards are 150 pt, so the rest of the
lane is clean — these two are the exceptions, and both replaced something the wave was explicitly
told to fix (the bare monogram, and the seat's brand-new Message affordance). Two `minHeight`
values.

---

## 3. MINOR

1. **`.patinaTopBand()` now applies to 26 screens, not the 8 the ruling enumerated.**
   `PatinaScreenChrome` applies the band unconditionally, and `grep -rln '\.patinaScreen('` returns
   26 files — `RoomProjectView`, `ThreadDetailView`, `StyleResultView`, `RecommendationsView`,
   `ProfileView`, `CollectionsView`, `NotificationFeedView`, `DocumentListView`, `YourSpacesView`
   and nine more that never carried a band. This is what ruling 1 asked for (*"one pattern, one
   owner"*) and the inset is `height: 0`, so it costs no layout — but it paints
   `Background.primary` opaquely over the top safe area on 18 screens nobody re-shot, and any
   screen whose ground is `Background.secondary` or whose hero bleeds under the status bar will
   show a seam. Ask the walker for three shots (`RoomProjectView`, `ThreadDetailView`,
   `RecommendationsView`) before merge. *Confidence: high on the blast radius, medium on whether
   any screen looks wrong.*

2. **The report overstates `TopBandFoldTests`.** The return says *"TopBandFoldTests pins that no
   file under `Patina/` contains `moneyScreenTopBand`"*, and `r2-tasks` T12 promised the same. The
   test iterates a **hard-coded list of 12 files** (`TopBandFoldTests.files`). The fold is complete
   today — my own repo-wide grep returns zero hits — but the guard is narrower than claimed and a
   thirteenth file could reintroduce the modifier greenly. One `FileManager.enumerator` over
   `Patina/` closes it. *Confidence: high.*

3. **`today_record_shown` drops `days_since_last_seen`.** `b-M1.sheet`'s Interactions row is
   `today_record_shown {needs_count, moved_count, days_since_last_seen}`; `HouseRecordCard.onAppear`
   captures the first two only. The value is in hand (`record.lastSeenAt` + `now`) and is the one
   property that answers whether the return surface is working. `today_record_line_tapped {kind}`,
   `today_record_empty_shown {half}`, `designer_card_message_tapped`, `house_room_opened`,
   `house_add_room_tapped {method}` and `piece_card_tapped` are all present and correct.
   *Confidence: high.*

4. **Every record date is formatted by a locale-free `DateFormatter`.** `HouseRecordDates.short` /
   `weekdayAndDay` / `weekday` each build a `DateFormatter`, set `dateFormat`, and set neither
   `locale` nor `timeZone`. Month and weekday names follow the device locale, so the ruled strings
   (`asked Aug 22`, `Nothing moved since Thursday.`) and the tests that assert them are
   device-locale-dependent. `headerLine` also accepts a `calendar` and then hands the formatting to
   functions that ignore it — `HouseRecordCardTests` passes a Gregorian calendar that never reaches
   the formatter. `Locale(identifier: "en_US_POSIX")` on all three, and thread the calendar's
   `timeZone`. *Confidence: high.*

5. **The long-gap header is ambiguous past a month.** `headerLine` prints
   `"You were last here on the \(ordinalDay(lastSeenAt))"` for any gap `> 7` days. At 14 days that
   is B §1's ruled line. At three months it reads `YOU WERE LAST HERE ON THE 13TH` and implies this
   month. B §1's own framing is *"after two weeks away"*; past a month the line needs the month too
   (or nothing). Declared as a style deviation in `r2-notes` §2.3, but the >30-day case was not.
   *Confidence: high.*

6. **`See all →` is drawn per half, mid-card.** M1 draws one footer link after both eyebrow groups
   (`b-M1.html:95`, `.rec__more` with a `border-top`, below the MOVED rows). The implementation
   puts it inside each half, so on shot `w2-r2-03` an amber `See all →` sits between the third
   NEEDS YOU row and the `MOVED` eyebrow and reads as a divider rather than a footer. B §2 says
   only *"`See all →` when there are more"*; per-half is defensible, but it is a visible departure
   from the mock and it was not declared. *Confidence: high (visible in shots 03 and 05).*

7. **`refreshProjectRooms` keeps stale rooms on failure.** The `catch` logs and returns without
   clearing, where `refreshNewThisWeek` sets `[]` and `fetchSavedPieceProducts` returns `[]`. After
   a sign-out/sign-in or a project ending, a failed read leaves the previous rooms on YOUR HOUSE.
   Small, and adjacent to B-1. *Confidence: high.*

8. **A guest is shown a `Studio` control.** `DailyGreetingHeader` always draws it (shot 01: `Studio`
   with no count) and `onStudioTap` routes to `.profile`. B §2's guest list has no such control and
   M1 removes the monogram because *"Profile lives in the Studio tab"* — which does not exist until
   W3. Not wrong, but a guest has no studio, and this is the one header affordance a guest can tap
   into a signed-in surface. *Confidence: medium — arguably intentional.*

9. **`Add a room` on the rail silently drops the scan act.** `YourHouseRail.addRoomCard` calls
   `onAddRoom()`, which `DailyRoomView` wires to `addRoom(.typeTheDimensions)`. Once a person has
   one room, `Scan it` is unreachable from Today — the two-act block only exists in the empty case.
   `house_add_room_tapped {method}` will therefore report `typeTheDimensions` for 100% of rail taps.
   *Confidence: high.*

10. **`fetchProducts(ids:)` is unbounded and unchunked.** Every saved product id goes into one
    `id=in.(…)` query string. A person with a few hundred saved pieces produces a URL past what
    PostgREST/Cloudflare will accept, and the failure costs both discovering rows silently. Chunk at
    ~100, or cap. *Confidence: medium (no such account exists today).*

11. **`StudioQueueBuilder`'s doc comment was orphaned.** The new `untitledDecisionTitle` was
    inserted between `itemizedAwaitingRows`'s doc comment and the function, so the comment about
    row ordering and `designerFallback` now documents a string constant and the function has none.
    Cosmetic; one line-move. *Confidence: high.*

12. **`HomeMountTests.theRecordIsUnflagged` will redden in W3.** It asserts
    `!source.contains("FeatureFlags")` over the whole of `DailyRoomView.swift`. W3 mounts the tab
    bar and the Companion slot off `FeatureFlags.shared.isOn(.houseFirst)` and may well touch this
    file. The thing worth pinning is that `HouseRecordCard(` is not inside a flag branch, not that
    the string is absent from the file. *Confidence: medium.*

13. **The story date chip's stated blocker is weaker than the note claims.** `r2-notes` §2.6 says
    the publish date *"is not on `DailyStory` (`Core/Models/`, unowned)"*. True — but
    `RemoteEditorialStory.publishedAt` is already decoded
    (`EditorialStoriesAPIClient.swift:31,45`, an R2-owned file) and R2 already retains the raw row
    on the view model as `todayStoryRow` for exactly this reason. `DailyStoryCard(date:)` is an
    R2-owned parameter away; `Core/Models` need never be touched. M1 block 5's `AUG 25 · 4 MIN` is
    a small, cheap, in-scope item. *Confidence: high.*

14. **A large share of the new tests are source-text pins, not behaviour.** `TopBandFoldTests`,
    `HomeMountTests`, `HomeHeaderTests` (two of three), `StoryOrderTests` (two of three) all assert
    on `SourcePin.read(...).contains("…")`. They follow the house precedent
    (`AttentionCountTests.everyConsumerReadsTheOneHint`) and they do catch the regressions they
    name, but they would pass over a view that renders nothing. The genuinely behavioural suites —
    `HouseRecordCardTests`, `RecordRefreshOrderTests`, `NewThisWeekTests`, `YourHouseRailTests`,
    `DesignerSeatTests`, `HomeCompositionTests` — are strong, and the honesty rules all live in
    those. Named so the ratio is on record, not as a request to change anything. *Confidence: high.*

15. **The engaged screen prints "You're matched with Leah Hartwell" three times, not twice.** Shot
    09: the Next Move's detail, the seat's meta line, and the Companion pill under the orb all carry
    the same sentence. `r2-notes` §4.3 names two of the three. Same ruling, wider than reported.
    *Confidence: high.*

---

## 4. Declared deviations I checked and accept as R2 framed them

- **`$4,250.00 · due Sep 1` over the mock's `· Sep 1`** — B §2's activeProject paragraph enumerates
  the states as *"`overdue`, `by Sep 8`, `$4,250.00 · due Sep 1`"*. R2 followed the later, more
  specific instruction. Fable's word, but the right default.
- **The header prints the greeting and is *named* "Today" for VoiceOver** — steward §9.5 and M1 are
  in direct conflict; `.accessibilityLabel("Today")` on the title block honours C4's actual claim
  (canonical *name*) while drawing what the mock drew. Pinned by a test. Sound resolution.
- **Blocks laid out by `blocks.contains(.x)` guards rather than by iterating `blocks(for:)`** —
  `HomeMountTests` fails if any block stops reading the rule, and the ordering is pinned separately
  by `activeProjectOrder`. Acceptable; the ordering assertion is the load-bearing half and it exists.
- **`EngagementTierState.unknown` treated as `.discovering` for composition** — the conservative
  choice: the truthful empties wait for a real answer instead of flashing.
- **Tests written beside the implementation for T1 and T6–T10** — honestly disclosed, with three
  real red-run logs cited for T2/T3/T5/T12. Not a finding, just noted.
- **App Group honoured on `dr-w2-r2`** (`r2-notes` §3) — contradicts R1 §7's observation on a
  different `.app`. Correctly framed as sim-only with the fallback retained. Useful for W6.
- **`Leah added two pieces to the proposal.` / `Your dining table shipped.` unbuilt** — the card
  draws what exists; nothing fabricated. Exactly right (C5).

---

## 5. What is good, and worth keeping as it is

- `HouseRecordRowPresentation` is the right seam: every honesty rule (standing conditions, `.new`,
  red-only-for-late-money, the tick) is a pure function returning a value, tested without a
  renderer, and the view has no second opinion. The `spoken(...)` label composition is careful —
  it drops the date *and* the "New since your last visit" clause on a standing condition, which is
  the failure mode a sighted-only check would have missed.
- `RecordRefresh` turning "snapshot → build → save → stamp" into a returned `[Step]` makes r1-notes
  §3's ordering a fact a test holds rather than a comment. `theOrderIsSnapshotBuildSaveStamp`
  additionally reads `lastSeen.lastSeenAt` *inside* the build closure — that is the assertion that
  actually proves the bug cannot come back.
- `NewThisWeek.rows` returning `[]` below the floor (rather than the caller deciding) makes padding
  structurally impossible, and the tests cover the three ways a row can fake newness: stale, absent
  timestamp, future timestamp.
- `HouseRoomCard.meta(for:)` treating `budget_cents = 0` as "not set" rather than "$0" is precisely
  C5, and the walk proves it: shot 03's `Dining Room` / `Living Room` print their names alone
  because the seed carries no figures, instead of two invented zeroes.
- `TodayExperience.projectMove` refusing a blank/whitespace phase so `PhaseDisplay`'s
  "Discovery"-for-anything-unknown default is unreachable — a trap spotted and closed, with the
  reason written in the test.
- The top-band fold is complete and correctly split: pushed screens through `.patinaScreen(…)`,
  the three sheets through `.patinaTopBand()` with the reason (no coordinator chevron on a sheet)
  written down.
- The sim evidence is real and covers what it claims: three tiers × light/dark, XXL at two tiers,
  and a manipulated-last-seen shot that actually exercises the long-gap header and the `· NEW` ticks
  together. Nine shots, all present under `shots/`.

---

## 6. Recommendation

**Fix B-1 and MJ-A before merge; MJ-B and MJ-C are Fable's call on scope.**

- **B-1** is the only one I would hold the merge for: the Record is unflagged, and the failure puts
  one client's invoice figure and designer name on another client's home screen on every cold
  launch after an account switch. The mitigation inside R2's file (refuse a snapshot whose user id
  does not match the session) is small; the durable fix in `LocalStoreReset` is two lines and
  belongs to whoever owns that file this wave.
- **MJ-A** is one guard and one test, entirely inside a file R2 already edited.
- **MJ-B** (M2's `RoomHeroCard`, the local room's budget, the dated state line, and the `Saved`
  summary row) is a coherent block of discovering-tier work that could reasonably slip to W3 — but
  it should slip on a ruling, not by omission.
- **MJ-C** is two `minHeight` values.
- The fifteen minors can ride into a fix round or the ledger at Fable's discretion; #2 (the
  overstated test claim) and #3 (`days_since_last_seen`) are the two I would take now, being one
  line each.
