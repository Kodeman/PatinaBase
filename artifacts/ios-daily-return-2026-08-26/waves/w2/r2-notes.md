# W2 · lane R2 — integration notes (the Record UI)

Written by the R2 implementer, re-dispatched after the first attempt died on a server error before
its first commit. Everything below is either a change **outside** the brief's owned-file map, a
deviation from the brief's literal text, or a fact the integration steward or Fable needs.

**Branch** `daily-return/w2-r2`, rebased onto `daily-return/integration` @ `59b389293` (so this lane
sits on top of lane D's migrations, R1's data layer and R3's deletions). 13 commits.

---

## 1. Files touched outside R2's owned set — each named, with why

`steward.md` §7 gives R2 `Features/Home/Views/**`, `Features/Home/ViewModels/**`,
`Features/Home/Models/TodayExperience.swift`, `Core/Network/EditorialStoriesAPIClient.swift`, plus
§8a's top-band carry-over. These five sit outside that:

| File | Change | Why it had to happen here |
|---|---|---|
| `Core/Network/ProductAPIClient.swift` | **new** `fetchProducts(ids:)` — `id=in.(…)` over `products`, `select=*,vendors!products_vendor_id_fkey(…)`, **no `deleted_at` filter** | The brief authorises exactly this ("ProductAPIClient is unowned by every W2 lane, so make that one addition"). It is the only read that can feed the record's withdrawn row: `get_recommendations` filters a withdrawn product out by construction (r1-notes §1). The `deleted_at` decode itself already landed at integration (`ba99cef76`) |
| `Core/Network/ProjectsAPIClient.swift` | **new** `RemoteProjectRoom` + `listProjectRooms(projectIds:)` | `steward.md` §5d: the client-scoped RLS policy on `project_rooms` exists and filters correctly; "if R2's rail cannot read rooms, the cause is … no fetch path in `Core/Network/ProjectsAPIClient.swift` … R2 raises it as an integration note rather than asking for a policy." This is that note, and the fetch path. **No migration was needed or written.** Proven live: the rail draws Ruth's `Dining Room` and `Living Room` (shot `w2-r2-03`) |
| `Features/Home/Models/HouseRecord.swift` (R1's) | `title(for:)` / `detail(for:)` rewritten for MJ-5; `firstName(of:)` added; the NEEDS YOU extension made internal so a ruled string is pinned by a test that calls it | The brief hands R2 the MJ-5 copy ruling, and the string is produced in the builder. Doing it in the card would have put copy in two places. R1's lane is closed, so no collision is possible |
| `Features/Profile/ViewModels/StudioQueueBuilder.swift` (R1's) | `static let untitledDecisionTitle = "A project choice is ready"`, used where the literal was | MJ-5 needs to tell a decision that carries a real question from one that does not. The placeholder was a bare literal; naming it is the whole change |
| `PatinaTests/MoneyAndStudioCopyTests.swift` | two assertions re-pointed from `moneyScreenTopBand()` to `.patinaScreen(` / `.patinaTopBand()` | The §8a fold deletes the modifier those tests asserted on. Same guarantee, new owner |

Also, inside the owned set but worth naming: **`TodayActiveRoomCard` and `TodayRoomArtwork` were
deleted** from `Features/Home/Views/TodayModules.swift`. The recomposed home does not mount them —
one active room is now one card on `YOUR HOUSE` — and nothing else in the app or the tests referenced
them (`grep` before and after). Leaving them would have been dead code created by this lane.

## 2. Deviations from the brief's literal text

1. **The invoice row reads `$4,250.00 · due Sep 1`, not the mock's `$4,250.00 · Sep 1`.** The brief's
   DELIVER item 1 enumerates the states as "overdue / by <date> / **$4,250.00 · due Sep 1**", and it
   is the later instruction; `b-M1.sheet.html` says "copy as drawn". Flagged rather than silently
   picking one. One word, one string (`HouseRecordRowPresentation`).
2. **The header word "Today".** `steward.md` §9.5 says it stays; the mock replaces it with the
   greeting. Both are honoured: the header **prints** `Good evening.` (M1) and **is named** "Today"
   for VoiceOver (`.accessibilityLabel("Today")` on the title block), which is what C4/B-7 (c)
   actually rules — the home's canonical name is "Today", not that the literal must be on screen.
   Pinned by `HomeHeaderTests.theHeaderKeepsTheCanonicalName`.
3. **The long-gap header is `YOU WERE LAST HERE ON THE 13TH`**, in the card's own mono line, rather
   than B §1's sentence-cased "You were last here on the 12th." One header line, one style; no day
   count either way. Sim-verified (shot 09).
4. **`See all →` routes to the Studio (`.profile`)** for both halves. B §2 does not name a
   destination; the Studio is where the same items are itemised, and the counts already agree
   (SP-16). If Fable wants NEEDS YOU → `.decisionList` instead, it is one line.
5. **No `Saved` summary row.** M2 draws one at discovering; the brief's DELIVER list does not, and
   the lane did not invent it. `HomeComposition` has no `.savedSummary` block — adding it later is
   one case and one `if`.
6. **The story card carries no date chip.** M1 block 5 draws `AUG 25 · 4 MIN` where the permanent
   unread dot was; SP-18 already fixed the dot, and the brief's item 7 asks only for the demotion,
   the ordering and the real dot. The publish date is not on `DailyStory` (`Core/Models/`, unowned),
   so adding it is a second lane's file. **Open, small.**
7. **The blocks are laid out by explicit guards (`blocks.contains(.record)`) in B §2's order**, not
   by iterating `HomeComposition.blocks(for:)`. A `ForEach` over an enum in SwiftUI would have cost a
   type-erased builder for no gain; the rule is still the single source of truth, and
   `HomeMountTests.everyBlockIsMountedThroughTheRule` fails if any block stops reading it.
8. **`EngagementTierState.unknown` is treated as `.discovering` for composition only.** While the two
   services are in flight the screen asserts nothing: the snapshot it already painted stands, and the
   truthful empties wait for a real answer rather than appearing and vanishing.
9. **Tests were written beside their implementation, not strictly red-first**, for the tasks whose
   assertions are exact strings (T1, T6–T10). T2, T3, T5 and T12 each had a genuine red run recorded
   (`/tmp/claude/r2-t2.log`, `r2-t3.log`, `r2-t5b.log`) before the fix.

## 3. Two facts the next lane and W6 should have

- **The App Group container IS honoured on this simulator.** R1's §7 recorded the fallback as
  load-bearing (empty entitlements on the integration branch's ad-hoc `.app`). On `dr-w2-r2`, running
  the lane's own build, both artefacts landed in the shared container:
  `…/data/Containers/Shared/AppGroup/6E95EB57-…/house-record.json` and
  `…/Library/Preferences/group.cloud.patina.app.plist` (holding `patina.house.lastSeenAt`). So the
  snapshot and the visit stamp both travel the App Group path here. This is still **not** a device
  claim, and the fallback stays.
- **`markSeen` is wired in `DailyRoomView`, not `ContentView`** (which this lane did not touch), and
  it is stamped inside `RecordRefresh.run` *after* the build — `RecordRefreshOrderTests` asserts the
  sequence `paintedSnapshot → built → saved → stamped` and that the store still reads the OLD visit
  while the build closure runs.

## 4. Open, for Fable

1. **MJ-5's exact wording.** The ruling is implemented as "`<first name> asked about <decision
   title>.`", which on the walk's data reads `Leah asked about Dining chairs - Shaker Oak vs Windsor
   Elm.` — the decision's own title verbatim, hyphen and all, because inventing prose around it would
   be the app writing the designer's words. If that reads badly to Kody, the fix is the decision's
   title in the database, not the app.
2. **Item 2 above** — `· due Sep 1` vs the mock's `· Sep 1`.
3. **The seat's line repeats the Next Move at engaged.** Both read "You're matched with Leah
   Hartwell" (shot 06): the seat takes the lead's stage sentence and so does the Next Move. Truthful,
   but the same sentence twice on one screen. Worth a ruling; at activeProject they differ.
4. **`Leah added two pieces to the proposal.` still has no producer** (r1-notes §10) and
   `Your dining table shipped.` waits on W4's fulfillment rail. The card draws what exists.
5. **The Companion orb overlaps the house block at XXL** (shot 08). Pre-existing: W1b ruling 1 leaves
   the orb yielding on the flag-off root and retires the Hearth in W3. Not touched.

## 5. What R2 did NOT touch

`ContentView.swift` (the `markSeen` wiring lives in `DailyRoomView`, per the brief's "ONLY if it
cannot live in DailyRoomView"), `CompanionSafeArea.swift`, `Features/Companion/**`,
`StudioHubView.swift`, `Core/State/**`, `Core/Models/**`, `RoomsAPIClient.swift`,
`RosterAPIClient.swift`, any migration, any seed. `ProposalDetailView.swift` was edited **only** at
the `.moneyScreenTopBand()` line (§8a's `:39`); R3's `statusIcon(for:justSigned:)` at `:83` is
untouched and did not conflict.

`AttentionCountTests.everyConsumerReadsTheOneHint` (steward §9.1) is green: `DailyRoomView.swift`
still lives at that exact path and still reads `badges.studioHint`. `DailyRoomFeedMappingTests`
(§9.2) is green and unmodified.
