# W2 · lane R1 — record data · task list

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w2-r1`, branch `daily-return/w2-r1`,
base `e9da02569`. Written before any code. Format: failing test → run → implement → run → pathspec commit.

---

## 0. PUBLISHED INTERFACES (R2 depends on these; frozen after task 1's commit)

```swift
// Features/Home/Models/HouseRecord.swift
struct HouseRecord: Codable, Equatable, Sendable {
    let needsYou: [HouseRecordRow]
    let moved: [HouseRecordRow]
    let window: DateInterval
    let lastSeenAt: Date?
    let hasMoreNeedsYou: Bool          // the rest behind "See all →"
    let hasMoreMoved: Bool
    var isEmpty: Bool                  // needsYou.isEmpty && moved.isEmpty
    static let empty: HouseRecord      // a zero-width window at .distantPast; draws nothing
}

struct HouseRecordRow: Identifiable, Codable, Equatable, Sendable {
    enum Kind: String, Codable, Sendable {
        case decisionAsked, proposalSent, invoiceDue, messageReceived, orderMoved,
             savedPieceRepriced, savedPieceWithdrawn, story, matchedDesigner
    }
    enum State: Codable, Equatable, Sendable {
        case none
        case overdue
        case due(Date)
        case amount(cents: Int, due: Date?)
        case new
    }
    let id: String
    let kind: Kind
    let title: String
    let detail: String?
    let date: Date
    let state: HouseRecordRow.State
    let isNew: Bool
    let route: AppRoute?
}

enum HouseRecordBuilder {
    @MainActor
    static func build(
        from badges: BadgeCountService,
        saved: [TableItemModel],
        products: [Product],
        story: RemoteEditorialStory?,     // ⚠ DEVIATION 1 — see below
        liveLead: DesignRequestStatus?,
        lastSeen: Date?,
        now: Date = Date(),
        previous: HouseRecord? = nil      // ⚠ DEVIATION 2 — defaulted, so the brief's
    ) -> HouseRecord                      //    call site compiles verbatim
}

// Core/Persistence/RecordSnapshotStore.swift
final class RecordSnapshotStore: Sendable {
    static let shared: RecordSnapshotStore
    init(appGroupIdentifier: String = "group.cloud.patina.app", fileManager: FileManager = .default)
    func save(_ record: HouseRecord)
    func load() -> HouseRecord?
    var usesAppGroupContainer: Bool { get }   // false ⇒ fell back to Application Support
}

// Core/Persistence/LastSeenStore.swift
struct LastSeenStore: Sendable {
    static let shared: LastSeenStore
    init(defaults: UserDefaults = .standard)
    var lastSeenAt: Date? { get }
    func markSeen(now: Date = Date())
}

// Features/Profile/ViewModels/StudioQueueBuilder.swift  (added, grouped rows untouched)
struct StudioQueueItemRow: Identifiable, Sendable {
    enum Kind: String, Sendable { case decision, proposal, invoice }
    let id: String; let kind: Kind; let entityId: String
    let title: String; let detail: String?
    let askedAt: Date?; let dueAt: Date?; let amountCents: Int?
    let designerName: String?; let route: AppRoute
}
extension StudioQueueBuilder {
    @MainActor static func itemizedAwaitingRows(
        decisions: [RemoteClientDecision], proposals: [RemoteProposal],
        invoices: [RemoteInvoice], designerFallback: String?, now: Date
    ) -> [StudioQueueItemRow]
}
```

### Deviations from the brief's literal names, decided before task 1 and NOT changed after

| # | Brief says | Repo truth | What R1 does |
|---|---|---|---|
| 1 | `story: EditorialStory?` | no type named `EditorialStory` exists; the row type is `RemoteEditorialStory` (`Core/Network/EditorialStoriesAPIClient.swift:18`) | parameter label stays `story:`, type is `RemoteEditorialStory?` |
| 2 | six-hour suppression "keeps the previous window anchor" with no previous-record parameter | reading `RecordSnapshotStore.shared` inside the builder would make it untestable | trailing `previous: HouseRecord? = nil`; the brief's call site is unchanged |
| 3 | `designer:profiles!<fk>(display_name, studio_name)` on Decisions/**Proposals**/Projects | `profiles` has **no `studio_name`** (verified: `information_schema.columns` → `display_name`, `full_name`, `business_name`); `client_decisions.designer_id` FKs **`auth.users`**, not `profiles`, so no direct embed exists; proposals arrive from the SECURITY DEFINER RPC `list_client_proposals()` returning `jsonb`, which **cannot take a PostgREST embed at all** | Decisions embed **through** `projects` (`project:projects(name,designer:profiles!projects_designer_id_fkey(...))`); Projects embed directly; Proposals get the name from the record's resolver chain, and the RPC widening is filed as an integration note for lane D. Columns selected are `id,display_name,full_name,business_name` — the house pattern already in `InvoicesAPIClient.swift:192` |
| 4 | `saved_items.price_cents_at_save ≠ current price` "00535 column" | the repriced row is composed **client-side** over the saved list; `TableItemModel.priceInCents` is the price at save on device | repriced = `TableItemModel.priceInCents` vs `Product.priceCents`; both numbers printed, no strike-through, no countdown |

### Facts established against the repo/DB before writing (so nobody re-derives them)

- FK names, from `pg_constraint`: `projects_designer_id_fkey`, `proposals_designer_id_fkey`, `invoices_designer_id_fkey`. `client_decisions` has **no** FK to `public.profiles`.
- `profiles` RLS: `Profiles are viewable by everyone` (SELECT, `true`) — the embeds resolve for a client.
- `Product` has no `deletedAt`; `ProductAPIClient.fetchProduct` already selects `*`, so `deleted_at`
  is on the wire and only the decode is missing. `Core/Network/ProductAPIClient.swift` is **not R1's file** —
  the decode hop is an integration note.
- `AppRoute` (`App/Coordinators/Coordinator.swift:52`) is `Hashable`, **not `Codable`**, and is not R1's
  file → `HouseRecordRow` encodes `route` through a private `RouteToken` in R1's own file.
- Swift Testing (`import Testing`, `@testable import Patina`), `@MainActor struct` suites, `#expect`.
- `Patina/` is a `PBXFileSystemSynchronizedRootGroup` — new files need no pbxproj edit.

---

## Task 1 — LastSeenStore + the App Group entitlement

**Files:** `Patina/Core/Persistence/LastSeenStore.swift` (new), `Patina/Patina.entitlements`,
`PatinaTests/HouseRecordStoreTests.swift` (new).

**Failing test first** (`HouseRecordStoreTests`):
- `lastSeenIsNilBeforeTheFirstOpen` — a fresh `UserDefaults(suiteName:)` → `lastSeenAt == nil`.
- `markSeenWritesTheCanonicalKey` — `markSeen(now: t)` → `lastSeenAt` within 1 s of `t`, and the raw
  key read back is exactly `"patina.house.lastSeenAt"`.
- `theEntitlementCarriesTheAppGroup` — reads `Patina/Patina.entitlements` off `#filePath` and
  `#expect(source.contains("group.cloud.patina.app"))` plus
  `#expect(source.contains("com.apple.security.application-groups"))`. (Same source-reading shape
  `AttentionCountTests.everyConsumerReadsTheOneHint` already uses.)

**Run:** `xcodebuild test … -only-testing:PatinaTests/HouseRecordStoreTests` → red.

**Implement:** `LastSeenStore` as above, `Date` stored as `timeIntervalSince1970` under the one key,
mirroring `StoryReadStore`'s UserDefaults convention. Add the `com.apple.security.application-groups`
array to `Patina.entitlements` beside the three existing keys.

**Run:** green. **Commit:** `feat(ios): the app remembers when you were last here`
— `git commit -- apps/mobile/Patina/Patina/Core/Persistence/LastSeenStore.swift apps/mobile/Patina/Patina/Patina.entitlements apps/mobile/Patina/PatinaTests/HouseRecordStoreTests.swift`

---

## Task 2 — HouseRecord / HouseRecordRow models

**Files:** `Patina/Features/Home/Models/HouseRecord.swift` (new),
`PatinaTests/HouseRecordModelTests.swift` (new).

**Failing test first:**
- `anEmptyRecordIsEmpty` / `oneRowIsNotEmpty`.
- `everyStateRoundTripsThroughJSON` — `.none`, `.overdue`, `.due(d)`, `.amount(cents:due:)` with and
  without a due date, `.new`.
- `theRoutesTheRecordEmitsSurviveEncoding` — decisionDetail, proposalDetail, invoiceDetail,
  threadDetail, projectDetail, pieceDetail, designRequests(focusLeadId:) all encode and decode back
  to the same `AppRoute`; a row with `route == nil` stays nil.

**Implement:** the two structs, `State`'s synthesized Codable, and the private `RouteToken`
(`kind: String`, `id: String?`) with `init?(_ :AppRoute)` / `var route: AppRoute?` covering exactly
the seven cases the record emits — an unmapped route encodes as absent and decodes to nil rather
than throwing.

**Commit:** `feat(ios): the record's row model` — the two paths above.

---

## Task 3 — RecordSnapshotStore

**Files:** `Patina/Core/Persistence/RecordSnapshotStore.swift` (new),
`PatinaTests/HouseRecordStoreTests.swift` (extended).

**Failing test first:**
- `aSavedRecordLoadsBackIdentical` — a two-row record with a `.amount` state and a real window
  saves and loads `==`.
- `loadingBeforeAnythingIsSavedIsNil`.
- `anUnknownAppGroupFallsBackToTheAppContainer` — `RecordSnapshotStore(appGroupIdentifier: "group.does.not.exist.\(UUID())")`
  → `usesAppGroupContainer == false`, and save/load still round-trips. (M16 / steward §9.4: the
  Simulator may return nil for a real group too; the store must never crash.)
- `aCorruptSnapshotLoadsAsNil` — write garbage bytes at the store's path, `load()` returns nil.

**Implement:** container = `FileManager.containerURL(forSecurityApplicationGroupIdentifier:)`, else
`.applicationSupportDirectory`; file `house-record.json`; `JSONEncoder`/`Decoder` with
`.iso8601` dates; every failure logged via `PatinaLog` and swallowed. A comment states why the
fallback exists (entitlement + developer-portal capability; a real shared container is a device
claim this wave does not make).

**Commit:** `feat(ios): the record survives the app being closed`

---

## Task 4 — designer identity on the rows

**Files:** `Patina/Core/Network/DecisionsAPIClient.swift`,
`Patina/Core/Network/ProjectsAPIClient.swift`, `PatinaTests/HouseRecordDesignerTests.swift` (new).

**Failing test first:**
- `aDecisionCarriesItsDesignerThroughTheProject` — decode a `RemoteClientDecision` whose
  `project.designer` embed carries `display_name` → `designerDisplayName == "Leah Hartwell"`.
- `aDecisionWithNoProjectFallsBackToYourDesigner` — → `"your designer"`.
- `aProjectCarriesDesignerAndStudio` — `display_name` + `business_name` → name and `studioName`.
- `theDecisionSelectEmbedsTheDesignerOnce` / `theProjectSelectEmbedsTheDesignerOnce` — the select
  string contains `projects_designer_id_fkey` exactly once and still contains every column the
  existing decode needs (a guard against a select rewrite dropping a field).

**Implement:** one shared `RemoteDesignerRef` (`id, display_name, full_name, business_name`,
`displayName` → `"your designer"`, `studioName` → `business_name`) declared in `DecisionsAPIClient.swift`;
`decisionSelect` gains `designer:profiles!projects_designer_id_fkey(...)` **inside** the existing
`project:projects(name, …)` embed; `RemoteDecisionProjectRef` gains `designer`;
`listProjects`/`fetchProject` move from `select=*` to
`select=*,designer:profiles!projects_designer_id_fkey(...)` and `RemoteProject` gains an optional
`designer`. No existing field is removed.

**Commit:** `feat(ios): the record names the designer who acted`

---

## Task 5 — StudioQueueBuilder's flat itemized rows

**Files:** `Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift`,
`PatinaTests/StudioQueueItemRowTests.swift` (new).

**Failing test first:**
- `twoDecisionsBecomeTwoRowsNotOneCard` — the grouped `build` still returns one `awaiting.decisions`
  row while `itemizedAwaitingRows` returns two, each with its own `entityId`, `askedAt` and
  `.decisionDetail` route.
- `anInvoiceRowCarriesItsBalanceAndDueDate`.
- `aProposalRowCarriesItsReviewByDate`.
- `theGroupedStudioRowsAreUnchanged` — `build(...)` over the same input produces the same section
  row ids as before the change (pins the Studio hub against regression).

**Implement:** `StudioQueueItemRow` + `itemizedAwaitingRows` as published. Same predicates as the
grouped rows (`!isResolved`, `isAwaitingSignature(now:)`, `isPayable`) so the two variants cannot
disagree. `build` is not touched.

**Commit:** `feat(ios): the studio queue can speak one item at a time`

---

## Task 6 — HouseRecordBuilder: window, order, caps, "new", suppression

**Files:** `Patina/Features/Home/Models/HouseRecord.swift`,
`PatinaTests/HouseRecordBuilderTests.swift` (new).

**Failing test first** (fixtures decoded from JSON, `BadgeCountService.makeForTests()` + `apply(…)`):
1. `needsYouIsOrderedByTheDateItWasAsked` — three items asked Aug 18/20/22 → ascending.
2. `movedIsNewestFirst`.
3. `atMostThreeRowsPerEyebrowAndTheRestSetHasMore` — 5 needs-you items → 3 rows, `hasMoreNeedsYou`.
4. `bothHalvesEmptyMakeAnEmptyRecord` — no badge rows, no saved pieces, no story, no lead →
   `needsYou == []`, `moved == []`, `isEmpty` (the tier decision of whether to *draw* the empty line
   is R2's; the builder invents nothing — C5).
5. `theEmptyHalvesAreIndependent` — needs-you rows with no moved rows → `moved == []` and
   `!isEmpty`.
6. `theWindowIsSevenRollingDaysWhenYouWereHereYesterday` — lastSeen −1 d → `window.start` is
   `now − 7 d`, and a moved event 9 days old does not draw.
7. `twoWeeksAwayWidensTheWindowToTheLastVisit` — lastSeen −14 d → `window.start == lastSeen`, and a
   moved event 10 days old **draws**.
8. `onTheFirstRunNothingIsNew` — `lastSeen == nil` → every row `isNew == false`.
9. `theSecondOpenOfTheDayKeepsTheRowsAndTheirDates` — build at 07:40 with lastSeen Thu, then build
   at 12:30 with lastSeen = 07:40 and `previous:` the first record → identical row ids, identical
   row `date`s, identical `isNew` flags, identical `window.start`.
10. `aRebuildMoreThanSixHoursLaterTakesTheNewAnchor` — same but 7 h later → `window.start` moves and
    `lastSeenAt` is the newer one.
11. `everyRowCarriesARealDate` — no row's `date` is `.distantPast`/`now`-substituted.

**Implement:**
- NEEDS YOU from `StudioQueueItemRow`s: `decisionAsked` (date = `created_at`; state `.overdue` when
  `due_date` is before today, else `.due(dueDate)`, else `.none`), `proposalSent`
  (date = `sent_at ?? created_at`; state `.due(valid_until)`), `invoiceDue`
  (date = `sent_at ?? issue_date ?? created_at`; state `.amount(cents: balanceCents, due: dueDate)`).
  **NEEDS YOU is not window-filtered** — an open obligation does not age out of view (B §1
  "nothing decays"); only MOVED is.
- MOVED, window-filtered, newest first: `matchedDesigner` from `liveLead` when a designer is on it
  (copy: `"<name> picked up your request."`), `messageReceived` from unread thread summaries with a
  counterpart message, `story` from `story.publishedAt`, plus task 7's two rows.
- Copy, brand voice, no invented figures: `"<designer> asked you to choose."` / `detail` = the
  decision's own title; `"<designer> sent a proposal to review."` / proposal title;
  `"Your invoice is due."` / invoice number; `"A new story from the workshop."` / story title.
  Designer name precedence: the row's own embed → `liveLead.designerName` → the project embed →
  `"your designer"`.
- `window`: `end = now`; `start = min(startOfDay(now) − 7 d, lastSeen)`; under suppression the
  previous `start` and `lastSeenAt` are kept.
- `isNew`: `row.date > effectiveLastSeen`, and `false` throughout when it is nil.

**Commit:** `feat(ios): the record of what moved while you were away`

---

## Task 7 — the discovering rows

**Files:** `Patina/Features/Home/Models/HouseRecord.swift`, `Patina/Core/Models/ProductModel.swift`,
`PatinaTests/HouseRecordBuilderTests.swift` (extended).

**Failing test first:**
- `aSavedPieceThatDroppedInPriceDrawsBothNumbers` — saved at 99000, now 89000 →
  title `"The Brass Arc Floor Lamp you saved is $100 less than when you saved it."`,
  detail `"Saved at $990.00 · now $890.00"`, and **neither** the string `"was"` nor `"%"` nor any
  countdown appears.
- `aSavedPieceThatWentUpSaysMore`.
- `anUnchangedPriceDrawsNoRow`.
- `aWithdrawnSavedPieceDrawsOnItsDeletionDate` — `Product.deletedAt` inside the window → one
  `savedPieceWithdrawn` row dated `deletedAt`; a product with `deletedAt == nil` draws nothing.
- `aSavedPieceWithNoProductRowDrawsNothing` — the honest silence when the fetch didn't supply it.
- `productDecodesDeletedAt` (in `ProductDecodingTests`? **no** — kept in this suite so R1 does not
  edit lane-A's suite): a `Product` JSON carrying `deleted_at` decodes it.

**Implement:** `Product` gains `let deletedAt: Date?` — `CodingKeys` case `deletedAt = "deleted_at"`,
decoded through the existing `Product.timestamp`, memberwise-init parameter **defaulted to nil** so
every existing construction site compiles unchanged. Builder matches `saved` → `products` by
`productId == product.id`.

**Commit:** `feat(ios): a saved piece that changed price or left the catalogue`

---

## Task 8 — gate + integration notes

- `./apps/mobile/Patina/scripts/ios-gate.sh build` (twice if the first fails on the generated
  `GitCommit.swift`).
- `xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug
  -destination 'platform=iOS Simulator,id=2F0E2EF1-1D2F-484C-A4F0-C327122B6DF6'
  -derivedDataPath /Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w2-r1/.build/dd
  -only-testing:PatinaTests CODE_SIGNING_ALLOWED=NO` — the **whole tier** must pass.
- A signed build (no `CODE_SIGNING_ALLOWED=NO`) into `.build/dd-signed`; record the `.app` path.
- `waves/w2/r1-notes.md`: the ProductAPIClient `deleted_at` decode hop, the `list_client_proposals`
  designer widening for lane D, the `LastSeenStore.markSeen` call site on `scenePhase → .active`
  (R2/ContentView), and the two published deviations.
- No `ios-gate.sh all`, no `lint-delta` — steward-only.
