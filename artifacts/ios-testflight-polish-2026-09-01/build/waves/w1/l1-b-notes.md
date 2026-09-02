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
