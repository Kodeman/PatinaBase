# W1 · L1-B — integration notes

Notes addressed **to** L1-B. Each is a numbered task for L1-B's own task list, carrying exact final
text.

---

## From L0.4 (Help & tour content) — 2026-09-02

Two things: `R-10` (the Help sheet cannot tell *failed to load* from *nothing here*), and one of the
six `?` doors, the one that lives in a file L1-B's glob owns.

Background and the per-door evidence: `build/waves/w0/help-doors.md`.

> ⚠ **Ownership flag for the steward.** `SanityHelpClient.swift` and `HelpPanelSheet.swift` sit under
> `apps/mobile/Patina/Patina/Features/Help/**`, which PROGRAM.md §3 gives to **L1-C** ("tour +
> coach-mark layout"). `R-10` is routed **⇢L1-B** in L0.4's finding table, and this note follows the
> routing. Settle it before either lane opens its list; two lanes cannot write these two files. If the
> steward rules the glob wins, move Tasks B-L04-2 and B-L04-3 into L1-C's list unchanged.

---

### Task B-L04-1 — Spaces: remove the `?` door

Zero `helpArticle` documents exist under `ios-app/rooms` (or any ancestor of it) in production —
verified 2026-09-02 against the live API with the request the app builds: HTTP 200, `result: []`. The
door opens on *"No help articles yet"* every time. `C5-02`.

`apps/mobile/Patina/Patina/Features/Rooms/Views/YourSpacesView.swift:138-152` — delete:

```swift
            // Help-panel trigger — surfaces every help article for the
            // rooms gallery in a sheet.
            Button {
                isHelpPanelPresented = true
            } label: {
                Image(systemName: "questionmark.circle")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Help")
            .accessibilityHint("Opens the help panel for Your Spaces.")
            .accessibilityIdentifier("YourSpacesView.HelpButton")
```

**Keep** `Spacer()` at `:137` — it separates the title cluster from the "Add a room" control and the
header collapses without it. **Keep** the `.helpPanel(…)` modifier at `:114-117`, the
`isHelpPanelPresented` state, and every `HelpInfoIcon` in the file (`:71`, `:131`, `:158`, `:200`) —
those are the tooltip path, they have working inline fallbacks, and they are not part of `C5-02`.

W2 restores the button once `ios-app/rooms` has an article.

> Same conflict as noted in `l1-c-notes.md` Task C-L04-5: `Features/Rooms/**` is L1-B's glob, but
> L1-C's *"Notes this lane applies"* paragraph also names `YourSpacesView`. Whoever ends up holding
> the file takes this task with it.

---

### Task B-L04-2 — `R-10` root cause: a `+` the URL builder will not encode

**The article-list query is the only GROQ in the app containing a `+`, and
`URLComponents.queryItems` does not percent-encode it.** Sanity form-decodes `+` back to a space, the
query stops parsing, and every article fetch returns **HTTP 400** — on every surface, with or without
content. This is why the panel has never shown an article on any build.

Reproduced 2026-09-02. The URL was produced by compiling `buildArticleListURL`'s body verbatim in a
throwaway `swift` script (so the escaping is the app's, not a hand transcription) and curling it:

```
$ curl -sS -o /dev/null -w '%{http_code}' '<the URL the app builds, $sk="ios-app/home">'
400

{"error":{"description":"expected ')' following function arguments","end":122,
 "query":"*[_type == \"helpContent\" && contentType == \"helpArticle\" &&
   (surfaceKey == $sk || string::startsWith($sk, surfaceKey   \"/\"))] | …",
 "start":100,"type":"queryParseError"}}
```

Read the echoed query: `surfaceKey   "/"`. The `+` arrived as a space. Change that one character to
`%2B` in the same URL and nothing else, and it returns **200** with `{"result":[]}`.

**Fix** — `apps/mobile/Patina/Patina/Features/Help/Services/SanityHelpClient.swift:310-314`, replace:

```swift
        components.queryItems = [
            URLQueryItem(name: "query", value: query),
            URLQueryItem(name: "$sk", value: jsonStringLiteral(surfaceKey)),
        ]
        return components.url
```

with:

```swift
        components.queryItems = [
            URLQueryItem(name: "query", value: query),
            URLQueryItem(name: "$sk", value: jsonStringLiteral(surfaceKey)),
        ]
        // URLComponents leaves `+` unescaped; Sanity form-decodes it to a
        // space, which breaks `surfaceKey + "/"` in the GROQ and 400s.
        components.percentEncodedQuery = components.percentEncodedQuery?
            .replacingOccurrences(of: "+", with: "%2B")
        return components.url
```

The replacement is safe over the whole encoded query: at that point every remaining literal `+` is one
that must be escaped, and no percent-escape sequence contains a `+`.

`buildQueryURL` (`:405-427`) has the same latent hazard but no `+` in its query today; applying the
same two lines there is L1-B's call — this note does not ask for it.

**Test to add.** `PatinaTests/HelpPanelSheetTests.swift:172-180`
(`buildArticleListURL_percentEncodesQuotedSurfaceKey`) is the natural home. Add:

```swift
        #expect(raw.contains("surfaceKey%20%2B%20%22/%22"))
        #expect(raw.contains("surfaceKey + ") == false)
```

Note that `buildArticleListURL_includesProjectDatasetAndApiVersion` (`:138-169`) keeps passing
unchanged — it reads the query back through `URLComponents`, which decodes `%2B` to `+` again, so its
`#expect(query.contains("string::startsWith($sk, surfaceKey + \"/\")"))` still holds. The bug was
invisible to that test precisely because it asserts the decoded form; the new assertions read
`url.absoluteString`.

---

### Task B-L04-3 — `R-10` second half: failed-to-load must not read as nothing-here

`HelpPanelSheet` **already has the right two states**: `loadError` renders
`PatinaErrorState("Couldn't load help for this screen.")` with a retry (`:150-158`), and an empty
result renders `ContentUnavailableView("No help articles yet", … "Help content for this screen is on
the way. Pull down to dismiss.")` (`:159-165`). U29 built that split.

**It cannot fire.** `fetchArticles` swallows every transport and HTTP failure and returns `[]`
(`SanityHelpClient.swift:257-275`): non-2xx returns `[]` at `:264-265`, and the `catch` returns `[]` at
`:271-274`. `loadArticles`'s `catch` (`:213-222`) is reachable only from `InvalidSurfaceKeyError`. So a
400 lands in the *empty* branch — which is exactly what the tester saw in `R-10`'s app log at
`17:21:58.668`: an HTTP 400 rendered as "nothing here yet, and it's on the way."

**Fix.** Make `fetchArticles` signal failure and let the existing branch do its job:

1. Add an error type — `HelpArticleFetchError` (or reuse whatever L1-B is standardising on) with the
   two cases the client actually distinguishes: `transport(Error)` and `http(status: Int)`.
2. `:259-266` — keep the log, **drop the negative cache write**, and `throw .http(status:)` instead of
   returning `[]`.
3. `:270-275` — keep the log, **drop the negative cache write**, and `throw .transport(error)` instead
   of returning `[]`.
4. Leave `:267-269` alone: a successful decode that yields zero rows is a **genuine** empty and must
   still return `[]` and still cache.

Dropping the two negative cache writes matters: a 5-minute cached failure means the retry button in
`PatinaErrorState` does nothing for five minutes, which is worse than the bug.

`HelpPanelSheet.loadArticles` needs no change — its `catch` already sets `loadError = true`. Update its
comment at `:214-216`, which currently says *"Invalid surface keys (the only throwing path)"* and stops
being true.

**Tests that must change** — both currently pin the swallow as intended behaviour:

- `PatinaTests/HelpPanelSheetTests.swift:254-268` `fetchArticles_swallowsNetworkErrorAndReturnsEmpty`
  → rename to `fetchArticles_throwsOnNetworkError`, assert
  `await #expect(throws: HelpArticleFetchError.self) { … }`.
- `PatinaTests/HelpPanelSheetTests.swift:270-282` `fetchArticles_swallowsNon2xxAndReturnsEmpty`
  → rename to `fetchArticles_throwsOnNon2xx`, same shape.

Add one covering the distinction the finding is actually about: a stubbed 400 leaves
`HelpPanelSheet` in `loadError`, a stubbed 200 with `{"result":[]}` leaves it in the empty state.
`fetchArticles_returnsEmptyForEmptyArray` (`:217-228`) and `fetchArticles_returnsEmptyForNullResult`
(`:203-215`) stay green unchanged and are the guard on step 4 above.

**Copy.** The two strings above are already honest and are not on L1-E's deck. If L1-E rewrites either,
it applies here — do not invent replacements in this lane.

---

### Scope note: what round one actually exercises

With all six doors hidden (`l1-c-notes.md` Tasks C-L04-1…5 and Task B-L04-1 here), `HelpPanelSheet` is
**unreachable in build 1** and `fetchArticles` is dead code there. Tasks B-L04-2 and B-L04-3 are
therefore not gating a build-1 tester experience — they are the precondition for W2, where the six
`ios-app/*` root articles get authored and the doors come back. Do not drop them on that basis: an
unfixed `+` means every article authored in W2 renders as an empty panel, and the W2 authoring
would be debugged as a content problem.

### VISION check on these notes

Nothing here adds tab/zone/dashboard framing, a shadow, red/green status, a badge, an engagement
mechanic or the word "AI". Task B-L04-1 removes a control; B-L04-2 is wire-format correctness; B-L04-3
makes an error state reachable, which is the *opposite* of the "never lie to the reader" failure VISION
cares about — and the message it surfaces, *"Couldn't load help for this screen."*, prints no vendor or
server string to a homeowner.

---

## From L1-X (backend, `L07-01`) — 2026-09-02

**Nothing owed. No file change, no task, no rebuild.**

`L07-01` ("signing a proposal is impossible when the designer belongs to two active studios") is
closed entirely in SQL — `supabase/migrations/00559_proposal_signing_multi_studio.sql`, on branch
`first-flight/w1-l1x`. It changes one trigger body on `public.projects` and nothing else.

Why L1-B is not involved, checked rather than assumed: the client passes **no studio identifier**.
`apps/mobile/Patina/Patina/Services/API/ProposalsAPIClient.swift:405-418` sends exactly
`{p_proposal_id, p_signed_name}` to `sign_proposal`. The RPC signature is unchanged and so is its
response shape (`status`, `signed_at`, `project_id`, `accepted_at`, `newly_signed`), so
`ProposalSignError.map` and `ProposalSignSheet` need no edit. `L07-01`'s own `codeNote` agrees: "the
client copy is correct and the error mapping is deliberate … the client is told the truth".

One thing to expect on a walk: until Kody applies 00559 to Strata, signing a proposal on production
still prints *"We couldn't record your signature. Nothing has been signed."* whenever the designer is
in two active studios. That is the server, not this screen. Whether it is live for round one is a
Kody-run read-only probe (runbook J1; `build/waves/w1/l1x-notes.md` §3).

---

## From L1-E (Copy) — 2026-09-02

Five rows, exact final text. Full reasoning for each in `build/waves/w1/l1-e-copy-deck.md`.

### Task B-L1E-1 — `C4-09`, the scan-upload failure line

`Features/RoomScan/Shared/Components/ScanUploadProgressView.swift:57-63` currently prints
`package.lastError` raw (storage/Postgres text, written from `error.localizedDescription` in
`Services/Sync/RoomScanSyncService(+AdvancedBundle)`). Route through a new `ScanUploadFailureCopy`
mapping, modelled **exactly** on `Features/Purchase/OrderFailureCopy.swift` (L1-E's file — a typed
error → a fixed sentence, the raw detail logged in `#if DEBUG` and never interpolated). Minimum viable
mapping for the phases this pipeline actually throws:

- network/transport failure → `"Upload paused — check your connection. It'll pick up automatically."`
- storage/Postgres write failure → `"We couldn't finish uploading your scan. Try again from here."`
- anything unclassified → `"We couldn't finish uploading your scan. Try again from here."`

`package.lastError: String?` stays as the on-disk diagnostic column (unit-tested, logged) — only the
**view** stops printing it verbatim; render `ScanUploadFailureCopy.message(for: package)` instead.

### Task B-L1E-2 — `C4-08`'s second half, `RoomsAPIError`

`Core/Network/RoomsAPIClient.swift:415-419` — `RoomsAPIError` is a plain `Error` today, so any caller
that reads `.localizedDescription` prints Swift's default description (module name and all). L1-E has
already fixed the one call site that hit this (`ARPlacementViewModel.swift`); the finding's other ask
is to conform the type itself "so no other caller can repeat it":

```swift
extension RoomsAPIError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .notAuthenticated: return "Please sign in to continue."
        case .emptyResponse: return "We didn't get a response. Try again."
        case .http: return "Something went wrong. Try again." // never the status or body
        }
    }
}
```

### Task B-L1E-3 — `C5-16`, the `resolvedMakerName` guard

`Core/Models/SavedItem.swift` — new computed property, mirroring `ProductModel.swift:222-229` (no
`brand` field on `SavedItem`, so the guard is the vendor-string check only):

```swift
var resolvedMakerName: String? {
    let vendor = makerName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !vendor.isEmpty,
          vendor.caseInsensitiveCompare("Unknown Maker") != .orderedSame,
          vendor.caseInsensitiveCompare("Unknown") != .orderedSame else { return nil }
    return vendor
}
```

Three call sites, all drop the line/segment at `nil` instead of printing "UNKNOWN MAKER":

- `Features/Rooms/Components/RoomItemRow.swift:43` — `if let maker = item.resolvedMakerName { Text(maker) }`
- `Features/Rooms/Components/RoomItemRow.swift:89` (`rowAccessibilityLabel`) — append `"by \(maker)"`
  only `if let maker = item.resolvedMakerName`
- `Features/Rooms/Views/ItemActionMenu.swift:53` and `Features/Rooms/Views/MoveOrCopyItemSheet.swift:80`
  — `Text([item.resolvedMakerName, item.fullFormattedPrice].compactMap { $0 }.joined(separator: " · "))`

### Task B-L1E-4 — `C5-09`/`C5-10`, `ItemActionMenu.swift`'s five rows

`Features/Rooms/Views/ItemActionMenu.swift:30-34`:

- `:31` `"View Product Detail"` → `"See the piece"` (`C5-09` — the ProductDetailView class name printed
  as a button label; reuses the phrase `OrderPlacedView` already uses)
- `:30` `"View in AR"` — unchanged (AR is an acronym, not a casing violation)
- `:32` `"Move to Another Room"` → `"Move to another room"`
- `:33` `"Copy to Another Room"` → `"Copy to another room"`
- `:34` `"Remove from Room"` → `"Remove from room"`

### Task B-L1E-5 — `C5-11`, one headline period

`Features/RoomScan/Views/ScanReviewView.swift:128` — `Text("Something went wrong")` →
`Text("Something went wrong.")` (matches the app's one canonical bare-headline sentence; the line
below it, `loadError`, already carries real app copy and is unaffected).

### VISION check on this note

None of the five rows adds tab/zone/dashboard framing, a shadow, red/green status, a badge, an
engagement mechanic or the word "AI" — all five are error-message or label rewrites.

---

## From L1-C (Layout, Companion, Dynamic Type) — 2026-09-02

**No task. This is a rebase heads-up**, reproduced from `build/waves/w1/l1c-notes-out.md` §5. L1-C
merges first (D14), so everything below is already on the tip when L1-B rebases.

### `C9-04` — four one-line swaps in files L1-B owns

`C9-04` ("twenty hard-coded bottom clearances, none derived from `CompanionHearthMetrics`") is
L1-C's, and it is closed **centrally**: one modifier, `.companionBottomClearance()`, defined in
`Design/Components/CompanionSafeArea.swift` (L1-C's file). It reads `isHouseFirstRoot` from the
coordinator in the environment and applies
`CompanionHearthMetrics.pinnedFooterClearance(houseFirst:)` — the same seam
`MoneyScreenMetrics.bottomClearance` already uses, so there is no second constant.

Applying it means one line changes in each container that hosted a literal. **Four of them are in
L1-B's globs, and L1-C made the change:**

| file | was |
|---|---|
| `Features/Rooms/Views/CrossRoomView.swift:48` | `Spacer().frame(height: 120)` |
| `Features/Rooms/Views/RoomProjectView.swift:117` | `Spacer().frame(height: 100)` |
| `Features/Documents/DocumentListView.swift:22` | `.padding(.bottom, 120)` |
| `Features/Projects/Views/ProjectListView.swift:46` | `.padding(.bottom, 120)` |

Nothing else in those four files changed by `C9-04`. `PatinaTests/CompanionInsetTests` scans all of
`Patina/Features/**` and fails on any `.padding(.bottom, N)` or `Spacer().frame(height: N)` with
`N >= 90` — so if a rebase reintroduces one, that suite names the file.

**`Features/RoomScan/**` is excluded from the scan on purpose**: `reservesRootHearth(for: .scanFlow)`
is `false`, so its 110 / 120 / 180 / 190 pt paddings clear the Whisper Bar and the shutter, not the
Companion. They are untouched and must stay untouched.

**Not moved into `patinaScreen`.** The obvious central seam was the pushed-screen scaffold, and L1-C
did not use it, for two reasons L1-B will care about: `ThreadDetailView` applies `.patinaScreen` and
**L1-F is adding its own `pinnedFooterClearance` padding there for `L07-02`**, and the ten money
screens carry `MoneyScreenMetrics.bottomClearance(houseFirst:)`, which
`MoneyAndStudioCopyTests.moneyScreensShareOneChromeSource` pins by name. A scaffold-level inset would
double with both.

### Other L1-C changes in files L1-B's globs cover

- `Features/Rooms/Views/YourSpacesView.swift` — steward ruling **S-1** moved this file to L1-C.
  `B-L04-1` (the `?` door), `C-05` (the `+` control's sibling help icon removed, and distinct
  `accessibilityLabel:` values on the two survivors), `C9-04` and L1-B's own `.refreshable` note are
  all applied there.
- `Features/Rooms/Views/NewRoomSheet.swift` — `B-60`, a T0 in L1-C's table: one ground filling the
  detent, and SF Symbols (`camera.viewfinder`, `ruler`) in place of the `◎` glyph and the 📐 emoji.
  No W1 L1-B row touches this file (`C7-10` and `C3-23` are both W2).
- `Features/Rooms/Components/RoomTypePillRow.swift` — `C6-18`, carved to L1-C by name in §3: 44 pt
  chips, `.isSelected`, and a `ViewThatFits` row that scrolls when six chips no longer fit.
- `Features/Rooms/Views/RoomProjectView.swift:254` — L1-E deck row **C-L1E-5** (`B-20`), applied by
  L1-C because the deck addressed it here: `"Browse pieces for the \(room.name)"` →
  `"Browse pieces for this room"`.

### VISION check on this note

Nothing here adds tab/zone/dashboard framing, a shadow, red/green status, a badge, an engagement
mechanic or the word "AI" — it is a clearance seam, a removed control and a fixed label.

---

# From L1-A (Welcome, sign-in, onboarding) — 2026-09-02

### Task B-L1A-1 — `C1-04`: the quiz RPC's 30-second timeout

`Services/API/APIConfiguration.swift:147` is **L1-B's** file. `C1-04` is L1-A's row; the in-flight
state ("Reading your answers…", `StyleQuiz.SubmittingState`) is done, but the wait it covers is still
up to 30 s because `ProductAPIClient.processStyleQuiz` inherits
`APIConfiguration.requestTimeout = 30.0`.

The finding's fix line: *"drop the quiz RPC timeout to ~8s (the local result is already the
fallback)"* — `StyleQuizViewModel.submitQuiz` computes `computeLocalResult()` **before** the RPC and
keeps it on `catch`, so a timeout costs the server-side refinement and nothing else.

Add, beside `requestTimeout`:

```swift
    /// C1-04 — the style-quiz RPC has a local fallback already computed
    /// (`StyleQuizViewModel.computeLocalResult`), so a slow server must not
    /// hold the reader on the last question for the full request budget.
    public static let quizSubmissionTimeout: TimeInterval = 8.0
```

and in `Core/Network/ProductAPIClient.swift` (also L1-B's), `processStyleQuiz` sets
`request.timeoutInterval = APIConfiguration.quizSubmissionTimeout` — it currently sets none, so it
takes the session default.

### Task B-L1A-2 — `C9-08`: the five numeric fields outside the auth screen

L1-A shipped the shared modifier at
**`Patina/Utilities/ViewModifiers/KeyboardDismissal.swift`** (unowned residue, so no lane's glob is
crossed) and applied it to the six-digit sign-in code plus the auth form's scroll view. The remaining
five `.numberPad` / `.decimalPad` fields are all in L1-B's globs. A number pad has **no Return key**,
so each of these is a keyboard with no exit today:

| file:line | keyboard |
|---|---|
| `Features/Rooms/Views/RoomBudgetSheet.swift:61` | `.numberPad` |
| `Features/Rooms/Views/ManualRoomEntryView.swift:65` | `.numberPad` |
| `Features/Rooms/Views/ManualRoomEntryView.swift:133` | `.decimalPad` |
| `Features/Rooms/Views/RoomSettingsView.swift:193` | `.decimalPad` |
| `Features/RoomScan/Views/ScanFallbackEntryView.swift:173` | `.decimalPad` |

The change is one line per field, immediately after the `.keyboardType(...)`:

```swift
                .keyboardDoneToolbar()
```

and, on any of those screens whose form is inside a `ScrollView`, one line on the scroll view:

```swift
        .dismissKeyboardOnScroll()
```

`PatinaTests/KeyboardDismissalTests.swift` pins the modifier and the auth field; it deliberately does
**not** assert on L1-B's files, so this note is the only thing holding those five.

### Task B-L1A-3 — `C5-10`, from L1-E's copy deck, in L1-B's file

The deck files one `C5-10` row under *"L1-A applies"* that lands in
`Features/RoomScan/Shared/Components/PauseMenuView.swift:63-64`, which is **L1-B's** glob. L1-A did not
apply it. Exact final text, from the deck: `"Discard Scan"` → `"Discard scan"`, `"Keep Scanning"` →
`"Keep scanning"`.

### Note B-L1A-4 — `A-79`'s counts were read in the view, not on `LocalStoreClaim`

The deck's `A-79` row suggests adding `roomCount` / `pieceCount` to `LocalStoreClaim`
(`Core/Persistence/LocalStoreClaim.swift`) — **L1-B's** file. L1-A did **not** touch it. The two counts
are read in `Features/Collections/Views/LocalStoreClaimSheet.swift` instead, from the same
`ModelContext` and with the same two `fetchCount` calls `LocalStoreClaim.hasGuestWork` uses. The
rendered string is byte-identical to the deck's. If L1-B wants the counts hoisted onto
`LocalStoreClaim` later, `LocalStoreClaimSheet.title(rooms:pieces:)` is a static function that takes
them as arguments — no other change needed.

---

---

## From L1-F (notifications, messaging, widget, deep links) — 2026-09-02

Full text, with the other three notes this lane sent, is at `build/waves/w1/l1f-notes-out.md`.

## L1F→B-1 → **L1-B** · this lane is holding `AppCoordinator.swift` for your watchdog note

**Not an edit — a request.** PROGRAM.md §3 W1's contested-file table gives
`App/Coordinators/AppCoordinator.swift` to **L1-F** outright (four of its five W1 rows are the deep-link
queue) and routes `C1-18` / `C1-19`'s `.launching` watchdog here as an integration note *"carrying the
exact 5–8 s timeout and the fallback line"*. Steward §5.3 repeats it.

**No such note exists.** At the time L1-F wrote its task list and again before its final commit,
`build/waves/w1/` held `l1-a-notes.md`, `l1-b-notes.md`, `l1-c-notes.md` and `steward.md`; none mentions
L1-F, and there is no `l1-f-notes.md`. L1-F has **not** implemented the watchdog: the ruled deliverable
is L1-B's *exact* timeout and *exact* fallback sentence, and inventing either would defeat the
mechanism the wave runs on. `C1-19` is reported open in L1-F's report with that reason.

**What L1-F needs, to apply it in one commit:**

1. the timeout, as a number in the 5–8 s band, and where it should be a named constant;
2. the exact fallback sentence a homeowner reads when auth readiness never lands;
3. whether the fallback phase is `.auth` (the finding's fix line says so) and whether the sentence is
   surfaced through `AuthService.errorMessage`, through a new coordinator property, or through the
   `pendingLinkNotice`-shaped seam L1-F just added;
4. `C1-18`'s half — whether the splash floor drops to ~0.6 s unconditionally or to 0 when
   `isAuthStateReady` is already true.

**What is already there for it to land on.** `recomputePhase()` now has two named seams,
`applyLeavingPhase(from:to:)` and `applyArrivingPhase(_:)`, and a DEBUG-only `forcePhaseForTesting(_:)`
that drives both — so `LaunchWatchdogTests` can prove a transition without standing up
`AuthService`'s auth-state stream. `splashDeadlineTask` and `scheduleSplashDeadlineRecompute()` are
untouched.

**Merge order** puts L1-B at 3 and L1-F at 4, so a note written before L1-F's fix round lands in this
wave. After that it is a steward-applied patch on the integration tip.

**Two things L1-F changed in that file that L1-B should know about**, since `C1-18`/`C1-19` sit beside
them:

- `pendingDeepLink: URL?` is **gone**. It was one slot, filled only at `.launching`, drained only at
  `.main`. It is now `PendingLinkQueue` on `DeepLinkHandler` — bounded, persisted, drained through
  `AppCoordinator.attachDeepLinkDrain(_:)`.
- The `.main → .auth / .launching` transition now clears both roots' navigation stacks and replaces the
  widget's App-Group snapshot (`C2-06`, `B-16`). `SignOutResetTests` covers it.


---

# From L1-D (Tokens, dark mode, contrast, iconography) — 2026-09-02

Appended by L1-D. The full set, with the notes sent to the other lanes, is
`build/waves/w1/l1d-notes-out.md`. Each block below is a numbered task for this lane's own
task list, carrying exact final text.

Written by L1-D on 2026-09-02 from `first-flight/w1-l1d` (base `ba83aa67f`). Every note below is
**also appended verbatim** to its target lane's inbox — `l1-a-notes.md`, `l1-b-notes.md`,
`l1-c-notes.md`, `l1-f-notes.md` — because a note nobody schedules is not a plan.

**What L1-D shipped that these notes depend on.** All of it is on `first-flight/w1-l1d`, in
`PatinaDesignKit` and this lane's four `Patina/**` files, and all of it merges **second**
(D14: L1-C → **L1-D** → L1-B → L1-F → L1-A → L1-X → L1-E). So every token named below exists by the
time any other lane rebases.

| New API | What it is for |
|---|---|
| `PatinaColors.Border.hairline` | The quiet rule: card edges, list separators, the tab bar's top line. Light `#E5E2DD` (unchanged) / dark `#322E29`. Replaces `PatinaColors.pearl` wherever pearl was drawing a **border or divider** |
| `PatinaColors.Border.strong` | The rule a tester is meant to see: field outlines, unselected chip edges, an "inactive step" fill. Light `#C8C3BB` / dark `#524C45` |
| `PatinaColors.Border.onDark` | A hairline on a `Background.dark` object, where the page behind it is what it has to separate from. Static `#756B61`, 3.18:1 on the dark canvas |
| `PatinaColors.OnDark.primary` / `.secondary` / `.muted` | Ink for a surface that is dark in **both** appearances. Static — it does not flip. `#FAF7F2` / `#D8D2C8` / `#B7AE9F` |
| `PatinaColors.Scrim.chrome` | An opaque ground for a control drawn over a photograph. Static `#332F2B`; `OnDark.primary` on it is 12.42:1 whatever the photo |
| `PatinaColors.clayInk` (`#82612F`) | Interactive labels and filled accent surfaces that carry a light label. `Text.interactive`'s light side is now this: `clayDeep` was 3.54:1 |
| `PatinaColors.errorDeep` (`#9C4C3F`) | The destructive fill. `error` under `offWhite` is 3.03:1 |
| `PatinaTypography.voiceLead` · `voiceSmall` · `voiceCaption` · `bodySerif` · `h6` · `monoLarge` | The six ramp gaps the 44 remaining inline `.font(.custom(…))` sites were reaching past |

**Changed behaviour, so nobody is surprised at merge:**

- **`PatinaColors.Background.dark` is now adaptive** — light `charcoal` (unchanged) / dark `#524B44`.
  Seven surfaces read it: the Companion orb and panel, `AddedToRoomToast`, `DesignerConsultationView`'s
  hero, `RoomBudgetBar`, `WholeHomeCrossRoomBar`. In dark mode they were 1.15:1 against the page and
  had no body at all (`C-01`). Their light-mode look is byte-identical.
- **`PatinaButtonStyle.clay` now renders the `.primary` treatment** (`C-41`). The five call sites —
  `InvoiceDetailView:219`, `ProposalDetailView:165`, `ProposalSignSheet:69`, `DecisionDetailView:425`,
  `DecisionDeferSheet:59` — keep compiling and stop being tan. `.destructive` fills with `errorDeep`.
  `PatinaButtonStyle` also publishes `patinaFillColor`, `patinaLabelColor`, `patinaBorderColor` and
  `filledCases`.
- **`DarkPalette.textSecondary` and `textMuted` are raised** (`#DFD2C0`, `#C7B99F`) — `C-20`.
- **`PatinaAsyncImage` takes a `caption:`** and has three states, not two: `loading` (shimmering mark),
  `failed` (mark + "Tap to retry"), `missing` (mark + the caption, no retry). Passing `url: nil` now
  gives the *missing* state rather than the failure state.
- **`PatinaTests` now links `PatinaDesignKit`.** `apps/mobile/Patina/Patina.xcodeproj/project.pbxproj`
  gains one `XCSwiftPackageProductDependency` on the test target. Before this, a test referencing any
  kit symbol compiled and then failed to link (`Undefined symbols … PatinaDesignKit.PatinaColors…`),
  which is why `HomeHeaderTests` says the target "does not link PatinaDesignKit" and pins `TimeOfDay`
  through a source read. It does now. Steward ruling **S-5** assumed the link already existed; it did
  not, and this is the smaller of the two fixes it implies.

---

---

## D→B-1 · L1-B · `C5-14` — the ten money bypasses

Today's New This Week rail prints `fullFormattedPrice` → `$4,200`; the same piece one tap later prints
`formattedPrice` → `$4.2K`. `PatinaCurrency` is the app's one currency formatter and **publishes no
compact form on purpose** — a call site that wants `$4.2K` should find nothing to reach for. Six sites
hand-roll it and four more hand-roll a bare `"$\(dollars)"`.

| file:line | today | final |
|---|---|---|
| `Core/Models/ProductModel.swift:181-187` | the whole `formattedPrice` body | `PatinaCurrency.formatWholeDollars(cents: priceCents)` |
| `Core/Models/SavedItem.swift:78-84` | the whole `formattedPrice` body | `PatinaCurrency.formatWholeDollars(cents: priceCents)` |
| `Features/Rooms/Components/RoomBudgetBar.swift:68-74` | the `K` branch | `PatinaCurrency.formatWholeDollars(cents: cents)` |
| `Features/Rooms/Components/RoomGalleryCard.swift:148-154` | the `K` branch | `PatinaCurrency.formatWholeDollars(cents: cents)` |
| `Features/Rooms/Components/WholeHomeCrossRoomBar.swift:51-53` | `dollarString = "$\(String(format: "%.1f", Double(dollars) / 1000))K"` | `dollarString = PatinaCurrency.formatWholeDollars(cents: cents)` |
| `Features/Rooms/Views/CrossRoomView.swift:240` | `let dollarString = total >= 1000 ? String(format: "$%.1fK", Double(total) / 1000) : "$\(total)"` | `let dollarString = PatinaCurrency.formatWholeDollars(cents: total * 100)` |
| `Features/Projects/Views/ProjectListView.swift:229-231` | `private func formatPrice(_ cents: Int) -> String { let dollars = cents / 100; return "$\(dollars.formatted())" }` | `private func formatPrice(_ cents: Int) -> String { PatinaCurrency.formatWholeDollars(cents: cents) }` |
| `Features/Projects/Views/ProjectDetailView.swift:352-355` | same shape | same replacement |

Once `ProductModel.formattedPrice` and `SavedItem.formattedPrice` route through `PatinaCurrency` they
agree with `fullFormattedPrice`, and the two properties can collapse into one in W2 — **not in W1**,
because `fullFormattedPrice` has call sites in three other lanes' files.

Two more are L1-C's and reach that lane separately (`DailyStoryDetailView.swift:190` reads
`product.formattedPrice`, so it fixes itself; `DecisionDetailView.swift:285-288`).

`PatinaTests/CurrencyFormattingTests` carries a **ratchet** at today's six hand-rolled compact
formatters — it fails if the count climbs, and it drops to zero the wave these land.

---

---

## D→B-2 · L1-B · `C3-01` — the `pearl` hairline sites in L1-B's files

`PatinaColors.pearl` is a flat sRGB literal: 1.21:1 against the light canvas (the whisper it was drawn
to be) and **12.84:1** against the dark one, so every one of these is the brightest thing on the
screen in dark mode. `pearl` itself stays — a dozen call sites use it as light ink on a permanently
dark surface — and a **border** takes `Border.hairline` (a rule the eye should not notice) or
`Border.strong` (a rule it should).

**`Border.hairline`** — replace `PatinaColors.pearl` with `PatinaColors.Border.hairline` at:

```
Features/Collections/Views/CollectionsView.swift:111
Features/Documents/DocumentListView.swift:125
Features/Orders/Views/OrderDetailView.swift:226
Features/Projects/Views/ProjectDetailView.swift:240, 254, 304, 333
Features/Proposals/Views/ProposalDetailBlocks.swift:40
Features/Rooms/Components/RoomGalleryCard.swift:125
Features/Rooms/Views/CrossRoomView.swift:88, 122, 253
Features/Rooms/Views/ItemActionMenu.swift:21, 36
Features/Rooms/Views/MoveOrCopyItemSheet.swift:33
Features/Rooms/Views/NewRoomSheet.swift:17
Features/Rooms/Views/RoomProjectView.swift:237, 379
Features/RoomScan/Views/ScanDetailsSection.swift:44
Features/RoomScan/Views/ScanReviewView.swift:365, 449
Features/RoomScan/Views/ScanSavedConfirmationView.swift:140
```

**`Border.strong`** — an outline or an unselected edge a tester is meant to see:

```
Features/Projects/Views/ProjectDetailView.swift:144
Features/Projects/Views/ProjectListView.swift:126
Features/Rooms/Views/ManualRoomEntryView.swift:153
Features/Rooms/Views/MoveOrCopyItemSheet.swift:115      (the `: PatinaColors.pearl` arm only)
Features/Rooms/Views/RoomBudgetSheet.swift:74
Features/Rooms/Views/RoomProjectView.swift:307
Features/Rooms/Views/RoomSettingsView.swift:119, 171, 205, 264
Features/RoomScan/Views/CaptionEditorSheet.swift:40
Features/RoomScan/Views/ScanDetailsSection.swift:56
Features/RoomScan/Views/ScanFallbackEntryView.swift:118, 185, 259   (the `: PatinaColors.pearl` arms)
Features/RoomScan/Views/ScanReviewHeader.swift:38
Features/RoomScan/Views/ScanReviewView.swift:341, 476
Features/RoomScan/Views/HeroPickerSheet.swift:44
```

**`OnDark.secondary`** — these three are ink on a surface that is dark in both appearances, not a
border. `Background.dark` is adaptive as of L1-D's branch, and `pearl` on its dark value is still
readable, but the token that *says* what it is:

```
Features/Rooms/Components/RoomBudgetBar.swift:26            → PatinaColors.OnDark.secondary
Features/Rooms/Components/WholeHomeCrossRoomBar.swift:34    → PatinaColors.OnDark.secondary
Features/RoomScan/Shared/Components/PauseMenuView.swift:96  → foreground: Color = PatinaColors.OnDark.primary
```

and at `PauseMenuView.swift:80, 85` the two `PatinaColors.pearl.opacity(0.35 / 0.55)` become
`PatinaColors.OnDark.muted` and `PatinaColors.OnDark.secondary` — the opacities were doing the job a
ramp should do.

**`Features/Rooms/Views/ManualRoomEntryView.swift:43`** is `foregroundStyle(PatinaColors.pearl)` on a
`Background.dark` band → `PatinaColors.OnDark.secondary`.

---

---

## D→B-3 · L1-B · `C3-15` — the inline fonts in L1-B's files

Thirty-two sites. Two of them are **below the design system's own floor**: the token file deprecated
its 8 pt mono in favour of a 10 pt floor, and these two are 7 pt and 8 pt.

| file:line | today | final |
|---|---|---|
| `Features/Rooms/Views/RoomProjectView.swift:456` | `.font(.custom("DMMono-Regular", size: 7, relativeTo: .caption2))` | `.font(PatinaTypography.monoLabel)` |
| `Features/Rooms/Views/RoomSettingsView.swift:243` | `.font(.custom("DMMono-Regular", size: 8, relativeTo: .caption2))` | `.font(PatinaTypography.monoLabel)` |
| `Features/Rooms/Views/RoomProjectView.swift:193, 201` | Playfair Italic 13 / `.footnote` | `.font(PatinaTypography.voiceCaption)` |
| `Features/Rooms/Views/RoomProjectView.swift:252` | Playfair Regular 18 / `.title3` | `.font(PatinaTypography.h5)` |
| `Features/Rooms/Views/RoomProjectView.swift:453` | Playfair Medium 20 / `.title3` | `.font(PatinaTypography.h5)` |
| `Features/Rooms/Components/RoomBudgetBar.swift:29` | Playfair Medium 22 / `.title2` | `.font(PatinaTypography.h4)` |
| `Features/Rooms/Views/ManualRoomEntryView.swift:33, 67, 135` | Playfair Regular 16 / `.body` | `.font(PatinaTypography.bodySerif)` |
| `Features/RoomScan/Shared/Components/EdgeToastView.swift:60` | Playfair Medium 15 / `.subheadline` | `.font(PatinaTypography.h6)` |
| `Features/RoomScan/Shared/Components/EdgeToastView.swift:63` | Inter Regular 12 / `.caption` | `.font(PatinaTypography.caption)` |
| `Features/RoomScan/Shared/Components/PauseMenuView.swift:39` | Playfair Regular 28 / `.title` | `.font(PatinaTypography.displaySmall)` |
| `Features/RoomScan/Views/ScanDetailsSection.swift:33` | Inter Regular 13 / `.footnote` | `.font(PatinaTypography.uiSmall)` |
| `Features/RoomScan/Views/ScanDetailsSection.swift:37` | DMMono Regular 12 / `.caption` | `.font(PatinaTypography.mono)` |
| `Features/RoomScan/Views/ScanReviewHeader.swift:23` | Inter Regular 13 / `.footnote` | `.font(PatinaTypography.uiSmall)` |
| `Features/RoomScan/Views/ScanReviewHeader.swift:28` | Inter Regular 15 / `.subheadline` | `.font(PatinaTypography.uiAction)` |
| `Features/RoomScan/Views/SoftLandingView.swift:112` | Inter Regular 13 / `.footnote` | `.font(PatinaTypography.uiSmall)` |
| `Features/RoomScan/Views/ScanSavedConfirmationView.swift:52` | Playfair Italic 24 / `.title2` | `.font(PatinaTypography.patinaVoiceLarge)` |
| `Features/RoomScan/Views/ScanSavedConfirmationView.swift:63` | Inter Regular 13 / `.footnote` | `.font(PatinaTypography.uiSmall)` |
| `Features/RoomScan/Views/ScanSavedConfirmationView.swift:127` | Inter Regular 12 / `.caption` | `.font(PatinaTypography.caption)` |
| `Features/RoomScan/Views/ScanThresholdView.swift:119` | Playfair Italic 17 / `.body` | `.font(PatinaTypography.patinaVoice)` |
| `Features/RoomScan/Views/ScanWalkView.swift:200` | Playfair Italic 26 / `.title2` | `.font(PatinaTypography.voiceLead)` |
| `Features/RoomScan/Views/ScanReviewView.swift:133, 299, 378` | Inter Regular 13 / `.footnote` | `.font(PatinaTypography.uiSmall)` |
| `Features/RoomScan/Views/ScanReviewView.swift:139` | Inter Regular 12 / `.caption` | `.font(PatinaTypography.caption)` |
| `Features/RoomScan/Views/ScanReviewView.swift:360, 438` | Inter Medium 11 / 10 | `.font(PatinaTypography.captionSmall)` |
| `Features/RoomScan/Views/PhotoReorderSheet.swift:48` | Inter Regular 11 / `.caption2` | `.font(PatinaTypography.captionSmall)` |
| `Features/RoomScan/Views/ScanFallbackEntryView.swift:174` | Inter Regular 15 / `.subheadline` | `.font(PatinaTypography.uiAction)` |
| `Features/RoomScan/Views/ScanFallbackEntryView.swift:235` | DMMono Regular 14 / `.subheadline` | `.font(PatinaTypography.monoLarge)` |

`ios-gate.sh lint-delta` enforces the direction (`disallow_font_custom_in_features`), and
`PatinaTests/TypographyAdoptionTests.theInlineFontCountNeverClimbs` carries the app-wide ratchet.

---


---

## From L1-E (Copy) — round 2, 2026-09-02 (after the adversarial review of deck revision 1)

Full text, with the blocks sent to the other lanes, is at `build/waves/w1/l1e-notes-out.md`. Deck: `build/waves/w1/l1-e-copy-deck.md` **revision 2**.

### Task B-L1E-4 — `C5-09` · three sites in `Features/Rooms/**` the deck missed

`C5-09`'s `where` names eight sites; deck revision 1 covered one. Three of the remaining seven are
yours:

| file:line | today | final |
|---|---|---|
| `Features/Rooms/Views/CrossRoomView.swift:64` | `Text("All Items")` (screen title) | `Text("All pieces")` |
| `Features/Rooms/Views/CrossRoomView.swift:81` | `tabButton("All Items", .all)` | `tabButton("All pieces", .all)` |
| `Features/Rooms/Views/RoomProjectView.swift:212` | `Text("Your Items")` (section eyebrow) | `Text("Your pieces")` |

The sibling tabs `"By Category"` / `"By Maker"` are Title Case too, but that is `C5-10`'s casing
sweep, not `C5-09`'s noun collision — **leave them**; W2 has that row. Pinned by
`NounConsistencyTests.roomsSurfacesSayPieces`.

### Note B-L1E-5 — `B-20` was applied by L1-C in your file; do not apply it twice

`Features/Rooms/Views/RoomProjectView.swift:254` now reads
`cta(primary: "Browse pieces for this room")`. Deck revision 1 addressed `B-20` to L1-C, which was
wrong — `Features/Rooms/**` is yours (§5.3) and `RoomProjectView.swift` is not one of the string-
literal carve-outs. L1-C applied it anyway, as task `C-L1E-5`. The hunk is on
`first-flight/w1-l1c`; your `C5-09` edit above is at `:212`, a different line, so the two merge.
Flagged to the steward in L1-E's report.
