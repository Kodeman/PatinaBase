# W2 · lane R1 — record data · adversarial review

Reviewer: separate context, read-only. Nothing built, nothing committed, nothing run against a
simulator. Evidence below is `git diff main...HEAD` on
`.codex/worktrees/agent-dr-w2-r1`, the files at that tip, and the four source documents
(`build-plan.md` §W2 + Global constraints, `direction-b.md` §1/§2/§3/§11, `synthesis.md` §5,
`build-plan-critique.md` M4/M13/M16/M21/M22), the M1/M2/M6d mock fragments and their screen sheets,
and `waves/w1b/integration.md`.

**Shape of the branch.** 7 commits on `e9da02569`, 13 files, +2090 −5, no upstream
(`git rev-parse --abbrev-ref --symbolic-full-name @{u}` → *no upstream configured*), `.writer.lock.d`
absent (released). Every commit is Conventional Commits with a scoped pathspec — I checked each
commit's `--stat` individually and no commit reaches a file its subject does not describe. All 13
paths sit inside R1's owned set per `steward.md` §7, with one edge case (minor 12). Nothing in
`Features/Home/Views/**`, `ContentView.swift`, `Companion/**`, `ProductAPIClient.swift`, `supabase/**`.

**What is genuinely good, so the findings read in proportion.** The honesty rules are enforced by
tests rather than asserted in prose: `aRowWithNoDateDoesNotDraw`, `aStoryWithNoPublishDateDrawsNothing`,
`aSavedPieceWithNoProductRowDrawsNothing`, `onTheFirstRunNothingIsNew`, `bothHalvesEmptyMakeAnEmptyRecord`
are all real tests that fail without the code. The repriced row's banned-string sweep
(`"was "`, `"%"`, `"left"`, `"hurry"`, `"only"`) is exactly the C5 discipline B §2 asks for. Three
deviations were declared before the first commit and each is a repo fact, not a convenience:
`profiles` really has no `studio_name`, `client_decisions.designer_id` really FKs `auth.users`, and
`list_client_proposals()` really cannot take a PostgREST embed. The App Group fallback is argued from
an observed empty `codesign -d --entitlements`, not from defensive politeness, and no device claim is
made. `StudioQueueBuilder.build` and its row ids are untouched and pinned.

---

## BLOCKING

### BL-1 · MOVED rows draw with dates outside the window the card advertises, and a test asserts the opposite
`HouseRecord.swift` — `build(...)`'s filter exempts `.matchedDesigner` and `.savedPieceRepriced` from
`window.contains(row.date)`. R1's own **passing** test proves the consequence:
`HouseRecordSavedPieceTests.aSavedPieceThatDroppedInPriceDrawsBothNumbers` builds with
`lastSeen: 2026-08-20T12:00`, `now: 2026-08-27T12:00`, and a lamp `savedAt: 2026-08-18T12:00`. The
record's `window.start` is `min(startOfDay(Aug 27) − 7d, lastSeen)` = **Aug 20 00:00**; the row's
`date` is **Aug 18 12:00**. The row draws.

R2 renders M1's header `SINCE YOU WERE LAST HERE · THU, AUG 20` from `window` / `lastSeenAt`
(`b-M1.html`, `b-M1.sheet.html`). A row dated two days before that header, under that header, is the
card contradicting itself on the wave's headline screen — a C5 failure, not a styling one.

Three compounding problems, all in R1's file:
1. `HouseRecordBuilderTests.everyRowCarriesARealDate` asserts
   `#expect(record.window.contains(row.date))` **for every moved row**. The implementation does not
   hold that property. The test passes only because its fixture (matched Aug 24, story Aug 25) happens
   to sit inside. It is a green test standing over a false claim.
2. `HouseRecordRow` carries **no signal** distinguishing a standing condition from a dated event, so
   R2 must re-hardcode the same two `Kind`s to render them differently — the seam R1 otherwise kept
   clean.
3. `matchedDesigner` is exempt from the window but **not from the cap**. `moved` is sorted newest-first
   and truncated at 3, so a matched request from three weeks ago is silently evicted by three newer
   rows. B §1's "a matched request stays on the record until it resolves" — the decay this program
   exists to remove — is therefore not actually guaranteed.

*Confidence: high (arithmetic, from R1's own fixtures).*
*Direction, not a prescription:* either mark the exempt rows on the type (`isStandingCondition`) so
R2 can draw them outside the dated group and exempt them from the cap, or widen `window.start` to
cover whatever the builder chose to admit so the header stays true. Fix `everyRowCarriesARealDate`
to assert what the code does, per lane.

### BL-2 · Neither discovering row can reach a screen, and the second half of the fix is unowned in W2
`build-plan-critique.md` **M22** is the reason this row is in R1's lane at all, and the plan's own
disposition line says *"M22 taken (W2 R1/R2 explicit)"*. What landed:

- `savedPieceWithdrawn` — built and tested, **unfed**. `Product.deletedAt` decodes, but
  `ProductAPIClient.toProduct()` maps an intermediate `RawProductWithVendor` that does not carry
  `deleted_at`, so `Product.deletedAt` is always nil on the live path. R1 states this plainly and
  supplies the exact two-hunk diff (`r1-notes.md` §1) — correct behaviour for a lane that does not own
  the file.
- `savedPieceRepriced` — also unreachable, for a second reason nobody has picked up: nothing anywhere
  calls `build(products:)` with the saved pieces' products, and `get_recommendations` filters withdrawn
  rows out by construction.

The blocking part is **ownership**, not R1's code. `ProductAPIClient.swift` appears in **no lane's
owned set** in `steward.md` §7 for W2 — it is neither R1's, R2's, R3's nor D's, and it is not on the
"Unowned in W2" list either. So the hop R1 documented has no assignee, and W2's acceptance line
*"Walt/Maya see true rows or nothing"* resolves to "nothing" for both discovering rows unless the
steward assigns it. Verified: `grep -rn "price_cents_at_save\|priceCentsAtSave"` over
`apps/mobile/Patina/Patina/` returns four **write** sites and zero reads, and no code path constructs
`TableItemModel` from a `saved_items` fetch — so the mirror W1b landed (`integration.md` §81,
commit `4e3ce89fc`) is write-only.

*Confidence: high.* Needs a steward assignment before integration, plus R2 taking the `products:`
fetch. R1 rework: none required.

### BL-3 · `LastSeenStore` writes to `UserDefaults.standard`, and its own comment says the widget reads it
`LastSeenStore.swift`:

```swift
/// The key the widget and any later mirror read. Changing it resets every
/// installed app's idea of "new", so it is a contract, not a detail.
static let key = "patina.house.lastSeenAt"
…
init(defaults: UserDefaults = .standard)
```

`UserDefaults.standard` is **not** shared with an extension. W6's widget (Q8, a named wave of this
program) will read `UserDefaults(suiteName: "group.cloud.patina.app")` and find nothing there, no
matter what the key is. The sibling store in the same commit range — `RecordSnapshotStore` — *does*
take the App Group container, and R1 added the entitlement in this wave precisely so W6 can share
state. The two stores disagree, and the comment states a contract the code does not implement.

The fix is one line (`UserDefaults(suiteName:) ?? .standard`, with the same honest fallback shape
`RecordSnapshotStore` already uses and the same `usesAppGroupContainer`-style reporting) and it is
cheaper now than after the key is in the field — changing it later, as the comment itself says,
"resets every installed app's idea of new".

*Confidence: high.*

---

## MAJOR

### MJ-1 · `resolveDesignerName`'s decisions branch is missing the sentinel guard its two siblings have
`HouseRecord.swift`:

```swift
if let name = badges.projects.compactMap({ $0.designer?.displayName }).first,
   name != "your designer" { return name }                      // guarded
if let name = badges.pendingDecisions
    .compactMap({ $0.project?.designer?.displayName }).first { return name }   // NOT guarded
if let name = badges.payableInvoices.compactMap({ $0.designer?.displayName }).first,
   name != "your designer" { return name }                      // guarded
```

`RemoteDesignerRef.displayName` returns the literal string `"your designer"` when all three name
columns are null/empty. On the decisions branch that sentinel is returned **as the designer's name**,
and `subject(_:)` (`name ?? "Your designer"`) then passes it straight through. Failure: a `profiles`
row with null `display_name`, `full_name` and `business_name` produces
`"your designer asked you to choose."` and `"your designer sent you a message."` — a sentence
beginning in lower case on the first viewport of the app. The same input on the projects or invoices
path correctly yields `"Your designer …"`, which is what `withNoDesignerTheRowsSayYourDesigner` pins.
The asymmetry is unambiguous; only its reachability (an all-null profiles row) is uncertain.
*Severity major, confidence high on the defect, medium on the frequency.*

Root cause worth fixing once: two spellings of one fallback in one lane — `"your designer"` (the
`RemoteDesignerRef` sentinel) and `"Your designer"` (the copy). A non-string sentinel (`displayName`
returning `String?`) removes the whole class.

### MJ-2 · `listProjects` / `fetchProject` moved from `select=*` to an embed, on a query nothing can afford to lose
`ProjectsAPIClient.swift` now sends
`*,designer:profiles!projects_designer_id_fkey(id,display_name,full_name,business_name)` on both the
list and the by-id read. If PostgREST cannot resolve that relationship, the request 400s and the whole
row list goes with it — taking `BadgeCountService.projects`, engagement-tier resolution,
`DesignerRelationshipResolver` (W1a fed it `liveLead`, but the archived-project predicate reads
projects), the Studio hub and project detail down together. Before this change the query could not
fail this way.

Evidence for it working is **local only**: R1's live probe was against local PostgREST with the
service-role key. The constraint name is verified in local `pg_constraint`; Strata is not the same
database (`project_prod_svc_schema_shape_divergence_2026_08_18` is the standing reminder), and
PostgREST's schema cache can lag a migration. `profiles` RLS is the softer half — an unreadable
`profiles` returns a null embed, not an error — so the hard risk is the constraint name and the cache.

*Severity major, confidence medium.* Either the steward runs the two selects read-only against Strata
before merge and records the HTTP 200, or the client retries once with the bare `select=*` on a 400 so
a naming surprise degrades to "no designer name" instead of "no projects". The same argument applies to
`decisionSelect`, at lower blast radius.

### MJ-3 · The repriced row is dated by the reader's own action, which B §2 rejects outright
B §2 closes with: *"Rejected outright: any row on the record generated by the reader's own action
dressed as an event."* B §3 makes the same distinction for the room getting fuller — *"shown as dated
state, never as 'news'."*

`savedPieceRows` sets `date: item.savedAt`. The consequences, in order of how much they cost:
1. MOVED is sorted by `date`, so repriced rows sort by **when the person saved the piece**, not by
   anything that moved.
2. `isNew` is `date > lastSeen`, so a genuine price change on a piece saved before the last visit can
   **never** carry the `new` tick — which is exactly the tick M2 draws on it (`Aug 24 · new`).
3. In the narrow case where the save postdates the last visit, the row can carry `· new` on the
   strength of the reader's own save.

R1 argues the date honestly (`r1-notes.md` §5: nothing on the wire says *when* a price moved) and that
argument is correct — but the honest conclusion from it is that the row cannot be a **dated** MOVED
row at all yet, not that the save date should stand in for the change date. Cf. BL-1, which is the same
defect seen from the window's side.
*Severity major, confidence high on the mechanism, medium on the ruling (this may be Kody's or Fable's
call, not R1's).*

### MJ-4 · The record's NEEDS YOU can silently under-count the Studio's "Awaiting you", with no `See all →` to explain it
`needsYouRows` drops any item whose `askedAt` is nil (`guard let asked = item.askedAt else { return nil }`)
— honest per `aRowWithNoDateDoesNotDraw`. But `hasMoreNeedsYou` is computed over the **surviving** rows,
so a client with four waiting things, one of them dateless, sees W1a's Studio control print `4`, the
record draw 3 rows, and **no** `See all →`. The two surfaces disagree and the card offers no way to
reconcile them. W1a's whole point was one counting predicate for every attention surface.
*Severity major, confidence high.* Cheapest fix: compute `hasMore` against the pre-filter count.

### MJ-5 · The row copy is not the mock's copy, and the deviation is undeclared
`b-M1.sheet.html` says **Copy | as drawn, verbatim**. The mock, B §1's day-in-the-life and the W2
acceptance line all use the designer's **first** name and the decision's own subject:

| Mock / spec | R1 produces |
|---|---|
| `Leah asked about the rug colour.` | `Leah Hartwell asked you to choose.` + detail `Rug color — Natural vs Sand` |
| `Leah sent a proposal to review.` | `Leah Hartwell sent a proposal to review.` |
| `Your invoice is due.` | `Your invoice is due.` ✓ |
| `Leah Hartwell picked up your request.` | ✓ verbatim |
| `The Brass Arc Floor Lamp you saved is $100 less than when you saved it.` | ✓ verbatim |
| `A new story from the workshop.` | ✓ verbatim |

Using the full display name is a **defensible** choice — first-name extraction from `display_name`
guesses at a naming convention and breaks entirely when the fallback is `business_name`. The finding is
not that R1 chose wrong; it is that a deliberate departure from a "verbatim" instruction on the wave's
headline copy is not in `r1-notes.md` §4's deviations table, so Fable would have had to find it in a
diff. `r1-notes.md` §4 lists four deviations and this is a fifth.
*Severity major (process + copy), confidence high.*

### MJ-6 · `matchedDesigner` is dated by `leads.updated_at`, a proxy for the event it names
`matchedDesignerRow` uses `let picked = lead.updatedAt ?? lead.createdAt` and titles the row
`"… picked up your request."`. `updated_at` moves on **any** write to the lead row, not on the moment a
designer claimed it. C5's rule is a real event with **its** real date. A closer real date exists on the
same object: `DesignRequestStatus.introduction` carries `createdAt` and `offeredAt`
(`DesignRequestStatusService.swift:233,237`), and the ceremony is created when the designer picks up.
*Severity major, confidence medium.* At minimum name the substitution in the notes; better, prefer
`introduction?.createdAt ?? introduction?.offeredAt ?? updatedAt`.

---

## MINOR

1. **The delta in the repriced title is rounded while the detail is exact.**
   `PatinaCurrency.formatWholeDollars` sets `maximumFractionDigits = 0`. Saved $990.49 → now $890.00
   prints title `"… is $100 less …"` over detail `"Saved at $990.49 · now $890.00"` — the stated figure
   does not equal the arithmetic of the two printed figures. Worse at the bottom: a 50¢ move yields
   `"… is $0 less than when you saved it."` (half-even rounding), a row that says nothing happened.
   The only guard is `savedPrice != product.priceCents`. *Confidence high; a minimum-delta guard and
   `format(cents:)` fix both.*

2. **`HouseRecordRow.State.new` is declared and never emitted.** `isNew: Bool` is the only newness
   signal the builder produces. Two representations of one concept, one of them dead, on a type R2 is
   consuming as a frozen interface. *High.*

3. **The window is up to eight days, not "a rolling seven days."**
   `defaultWindowStart` = `startOfDay(now) − 7d`, so at 23:00 the window reaches back 7 days 23 hours.
   The test written for it is loose enough to accept that
   (`#expect(record.window.start >= now.addingTimeInterval(-8 * 86_400))`) where `r1-tasks.md` task 6
   promised "`window.start` is `now − 7 d`". The test accommodates the implementation rather than
   pinning the spec. *High.*

4. **The six-hour suppression slides indefinitely.** `window.end` is set to `now` on every build and
   `suppressing` is measured from `previous.window.end`, so a person opening the app every five hours
   holds the same anchor for as long as they keep doing it. Arguably the intent ("the record does not
   empty out between opens"), but it is not what "six-hour suppression" says and it is untested at more
   than two builds. *Medium.*

5. **`State.overdue` / `.due` are resolved at build time and then persisted.** The `State` doc comment
   says *"the caller decides when it turns red … because only it knows `now`"* — but `.overdue` is
   already decided inside the builder, and `RecordSnapshotStore` writes it to disk. First paint from a
   two-day-old snapshot can print `by Sep 8` on a date already past, until the refresh lands. `.amount`
   correctly carries its due date and leaves the decision to R2; `.overdue`/`.due` do not. *Medium.*

6. **`matchedDesigner`'s exemption does not survive the cap.** Folded into BL-1 above; listed here so it
   is not lost if BL-1 is resolved narrowly.

7. **`messageRows` attributes every unread thread to the record-wide designer.** A message from a studio
   associate, an admin, or any non-designer counterpart is captioned `"Leah Hartwell sent you a
   message."`. R1 names this in a code comment but not in `r1-notes.md`, so it is not in front of the
   reviewer or the walker. *Medium.*

8. **M1's second MOVED row has no source and is nowhere declared cut.** `Your dining table shipped.`
   is honestly deferred (`Kind.orderMoved`, no producer, W4 — documented in the enum). `Leah added two
   pieces to the proposal.` has no `Kind`, no source and no mention in the notes. *High.*

9. **`RecordSnapshotStore.init` gained a third parameter not in the published interface.**
   `fallbackDirectory: URL? = nil` is used only by the tests. It is defaulted so R2's call site compiles,
   but `r1-notes.md` §4's "also added, and safe for R2 to ignore" list does not include it while it does
   list six other additions. *High.*

10. **`decisionSelect` widened from `private static` to `static` for a test.** Acceptable inside one
    module; noted because it is production API surface widened for test reach. *High.*

11. **`RecordSnapshotStore.save`/`load` are unsynchronized on a `Sendable` class.** Two concurrent saves
    race; `.atomic` writes mean the loser is a whole stale record rather than a torn file, so the blast
    radius is small. No `@MainActor`, no lock, no queue. *Medium.*

12. **`ProductModel.swift` sits at the edge of R1's ownership rule.** `steward.md` §7 grants R1
    `P/Core/Models/**` for "any new row model; existing files there are R1's only where R1 adds the row
    type" — R1 added a *field* to an existing type. No other W2 lane touches the file, so there is no
    conflict, but the steward should ratify it rather than discover it at merge. *Medium.*

13. **The report's per-commit test counts do not match the files.** The designer commit claims 6 tests;
    `HouseRecordDesignerTests.swift` carries 8 `@Test`. The studio commit claims 7; `StudioQueueItemRowTests.swift`
    carries 6. Claimed total 61, actual `@Test` count across the five new files is 62 (7 suite structs,
    which matches). Immaterial to the work; material to a report that otherwise earns its trust. *High.*

14. **TDD order broke on the last two tasks.** `r1-tasks.md` task 7 planned one commit
    (`feat(ios): a saved piece that changed price or left the catalogue`); what landed is
    `39698f36f` (`Product.deletedAt`, **no test in the commit**) followed by `004eaacd1` carrying its
    tests. The lane's own format is "failing test → run → implement → run → commit". *High.*

15. **Two `swiftlint:disable:this function_parameter_count` suppressions were added**
    (`HouseRecordBuilder.build`, `RemoteProject.init`). `lint-delta` is steward-only, so these will not
    show as deltas at integration; flagged so the steward sees them deliberately rather than not at all.
    *High.*

16. **A spec contradiction R1 resolved silently, correctly.** B §2's *guest* bullet 2 puts "`New this
    week`'s count" **in** the record; B §2's *discovering* paragraph says
    *"`Three pieces joined Patina this week.` lives under NEW THIS WEEK, **not in the record**"*. R1
    followed the explicit rule and emits no such row. Right call — but R2 owns the guest composition and
    should be told the conflict was ruled, not left to re-derive it. *Medium.*

---

## Checks that came back clean

- **Every row comes from a real event with a real date** — enforced, with three tests that fail without
  it. The two exceptions are BL-1/MJ-3 above, both declared by R1 rather than hidden.
- **"new" is derived from `LastSeenStore` and never fabricated** — `markingNew(against:)` is the only
  producer, `guard let lastSeen else { return self }` makes a first run produce nothing new, and
  `onTheFirstRunNothingIsNew` pins it.
- **Nothing counts days at the person** — no day-count arithmetic anywhere in the builder or either
  store. `TableItemModel.daysSinceSaved` exists in the codebase and is not read.
- **Empties are empty arrays; the builder never pads** — `bothHalvesEmptyMakeAnEmptyRecord`,
  `theEmptyHalvesAreIndependent`. Tier-branching of whether to draw them is left to R2, which is the
  correct seam; the builder is tier-agnostic and `HouseRecord` carries no tier, so R2 supplies it from
  `EngagementTier` as it already must.
- **App Group handled when nil** — fallback chain group → injected → Application Support → tmp,
  `usesAppGroupContainer` reports which, `anUnknownAppGroupFallsBackToTheAppContainer` and
  `aCorruptSnapshotLoadsAsNil` pin the two failure modes. M16 satisfied for W2's half; the entitlement
  is in `Patina.entitlements` and `CODE_SIGN_ENTITLEMENTS` was already set at
  `project.pbxproj:505,553` (pre-existing — R1 did not touch the pbxproj, and its report does not claim to).
  No device claim made.
- **Snapshot painted first** — R1's half (`load()`) exists; the call site is R2's and is written up in
  `r1-notes.md` §3 with the ordering trap (`markSeen` AFTER the build) called out. Correct.
- **Interfaces match what was published** — `HouseRecord`, `HouseRecordRow` + nine `Kind`s + five
  `State`s, `HouseRecordBuilder.build(from:saved:products:story:liveLead:lastSeen:now:previous:)`,
  `RecordSnapshotStore.shared.save/load` + `fileURL`/`usesAppGroupContainer`,
  `LastSeenStore.shared.lastSeenAt/markSeen(now:)`, `StudioQueueItemRow` +
  `itemizedAwaitingRows(decisions:proposals:invoices:designerFallback:now:)` — all present with the
  published names and shapes. One undeclared additive parameter (minor 9). `StudioQueueBuilder` is
  `@MainActor` at the enum, so `itemizedAwaitingRows` is MainActor-isolated as published.
- **Existing suites** — `AttentionCountTests.everyConsumerReadsTheOneHint` scans exactly
  `StudioHubView.swift`, `CompanionOverlay.swift`, `DailyRoomView.swift`; R1 touched none of the three.
  `StudioQueueItemRowTests.theGroupedStudioRowsAreUnchanged` pins `build()`'s section row ids and
  `attentionSummary.awaitingCount`. `RemoteProject` gained an explicit init with `designer` defaulted so
  existing construction sites needed no edit. No test was weakened or deleted anywhere in the diff
  (`git diff main...HEAD` shows −5 lines total, all in `ProductModel.swift` and the two selects).
- **Per-tier composition** — NEEDS YOU ascending by asked date, MOVED newest first, ≤3 each,
  `hasMore*` flags, and the M1 fixture reproduces the mock's exact NEEDS YOU order (decision Aug 22 →
  proposal Aug 24 → invoice Aug 25). The synthesis graft "draw nothing when nothing moved at
  guest/discovering" is honoured by producing empty arrays and delegating the draw decision.
- **VoiceOver / dark / XXL** — no view code in this lane; not applicable and not claimed.
- **Tests are real** — 62 `@Test` across 7 suites, all reading behaviour rather than restating the
  implementation, with JSON-decoded fixtures on the wire shapes. Two exceptions worth naming:
  `everyRowCarriesARealDate` asserts a property the code does not hold (BL-1), and
  `theWindowIsSevenRollingDaysWhenYouWereHereYesterday` is looser than the plan it implements (minor 3).
- **Gate output** — not re-run by this review (read-only brief). The claimed `** BUILD SUCCEEDED **`
  and `869 tests in 102 suites passed` are taken as reported; the 61-vs-62 discrepancy in minor 13 is
  the only number I could check independently.

## Unverifiable from here, stated as such

The live PostgREST probes (HTTP 200 on both new selects, the `"designer": {"display_name": "Leah
Hartwell"…}` payload), the `pg_constraint` FK names, the `information_schema.columns` result for
`profiles`, the `pg_get_functiondef` reading of `list_client_proposals()`, the empty
`codesign -d --entitlements` dict, and the simulator install are all R1's evidence, not mine. Each is
internally consistent with what the code does, and MJ-2 is the one place where "local, not Strata"
changes the risk enough to matter.
