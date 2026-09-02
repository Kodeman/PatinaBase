# First Flight · W0 · L0.4 — every `?` help door, and what to do with it

Lane: **L0.4**. Written 2026-09-02. Findings: `C5-02` (all six doors open on "No help articles yet"),
`A3-09` (20 of 36 `ios-app/*` surface keys have no document), and the diagnosis half of `R-10`.

Read under **D1**: `house-first` is ON, so every door below is judged on the four-tab root —
Today · Spaces · Pieces · Studio — and every one of them is reachable there.

**Nothing in this file was executed against production.** The Sanity reads are GROQ; the code changes
are integration notes at `build/waves/w1/l1-c-notes.md` and `build/waves/w1/l1-b-notes.md`.

---

## 1. What the panel actually asks Sanity for

`HelpPanelSheet` populates itself from `SanityHelpClient.fetchArticles(forSurfaceKey:)`
(`HelpPanelSheet.swift:196-219`), which builds this query
(`SanityHelpClient.swift:294-315`, verified by reading the file):

```groq
*[_type == "helpContent" && contentType == "helpArticle"
  && (surfaceKey == $sk || string::startsWith($sk, surfaceKey + "/"))]
| order(length(surfaceKey) desc) [0...20] {
  "_id": _id, surfaceKey,
  "title": helpArticleContent.title,
  "summary": helpArticleContent.oneSentenceAnswer
}
```

So a door is populated when a **published `helpContent` document with `contentType == "helpArticle"`**
exists at the door's surface key **or at any ancestor path of it**. `persona` is not part of this
query — the persona trap in PROGRAM.md step 7 applies to the single-document path, not to the panel.

### The count, per key, read from production

`mcp__claude_ai_Sanity__query_documents`, project `kv3qrinl`, dataset `production`, perspective `raw`,
2026-09-02:

```
count(*[_type=="helpContent"])                                          → 246
count(*[_type=="helpContent" && contentType=="helpArticle"])            →  41
count(*[_type=="helpContent" && contentType=="helpArticle"
        && surfaceKey match "ios-app*"])                                →   0
count(*[_id in path("drafts.**")])                                      →   0
```

All 41 `helpArticle` documents live under `designer-portal/document/*` (38) and
`client-portal/guide/*` (3). **Not one is under `ios-app`, and none is an ancestor of an `ios-app`
key**, so the prefix clause cannot rescue any door.

And the same query run **against the live HTTP API, per door**, with the `+` bug corrected so the
request returns 200 rather than 400 (see §3):

| surface key | HTTP | `result` |
|---|---|---|
| `ios-app/home` | 200 | `[]` |
| `ios-app/product-detail` | 200 | `[]` |
| `ios-app/profile` | 200 | `[]` |
| `ios-app/rooms` | 200 | `[]` |
| `ios-app/qr-auth` | 200 | `[]` |
| `ios-app/companion` | 200 | `[]` |

**Six doors, zero articles.** `C5-02` reproduces exactly as written.

The 16 `ios-app/*` documents that *do* exist are 3 `coachmark` (the tour — see `sanity-tour-copy.md`),
2 `tooltip` and 11 `fieldHelper`. None of them can ever satisfy the panel's query.

---

## 2. The six doors

Each row: the `?` control the tester taps, the sheet it opens, the surface key it queries, and the W1
lane that owns the file per PROGRAM.md §3's globs and residue table.

### D1 — Today (the first tab)

| | |
|---|---|
| `?` control | `Patina/Features/Home/Views/DailyGreetingHeader.swift:114-126` — `questionmark.circle`, id `DailyRoomView.HelpButton`; rendered only `if let onHelpTap` |
| bound at | `Patina/Features/Home/Views/DailyRoomView.swift:255` — `onHelpTap: { isHelpPanelPresented = true }` |
| sheet | `Patina/Features/Home/Views/DailyRoomView.swift:188-191` — `.helpPanel(surfaceKey: SurfaceKeys.IOSApp.Home.root)` |
| surface key | `ios-app/home` → **0 articles** |
| reachable on the bar root | **Yes** — Today is tab 1 (`PatinaTab.swift:27`); this is the first screen a tester sees |
| owner | `Features/Home/**` → **L1-C** |
| **recommendation** | **Hide.** One-word change at `:255` (`onHelpTap: nil`); the header already guards on nil, so no second file is touched. |

### D2 — Piece detail (pushed from Pieces, Today and Spaces)

| | |
|---|---|
| `?` control | `Patina/Features/ProductDetail/Views/ProductDetailView.swift:333-340` — `floatingCircleButton(icon: "questionmark")`, id `ProductDetailView.HelpButton` |
| sheet | `Patina/Features/ProductDetail/Views/ProductDetailView.swift:162-170` — `case .help: HelpPanelSheet(surfaceKey: SurfaceKeys.IOSApp.ProductDetail.root)` |
| surface key | `ios-app/product-detail` → **0 articles** |
| reachable on the bar root | **Yes** — every piece card in Pieces pushes it |
| owner | `Features/ProductDetail/**` → **L1-C** |
| **recommendation** | **Hide** the button only. Keep the `case .help:` arm — `PatinaTests/ProductDetailRoomSaveTests.swift:229` asserts `source.contains("HelpPanelSheet(")` and removing the arm turns that test red. |

### D3 — Studio (the fourth tab)

| | |
|---|---|
| `?` control | `Patina/Features/Profile/Views/ProfileView.swift:40-56` — `questionmark.circle`, id `ProfileView.HelpButton` |
| sheet | `Patina/Features/Profile/Views/ProfileView.swift:182-185` — `.helpPanel(surfaceKey: SurfaceKeys.IOSApp.Profile.root)` |
| surface key | `ios-app/profile` → **0 articles** |
| reachable on the bar root | **Yes** — `StudioTabRoot` mounts `ProfileView` (`TabRoot.swift:78-81`) |
| owner | `Features/Profile/Views/ProfileView.swift` → **L1-C** (PROGRAM.md §3 residue table) |
| **recommendation** | **Hide.** Remove the whole `HStack` at `:37-56` — it exists only to hold this button, and leaving an empty `HStack` with `.padding(.horizontal, 24)` puts a 44 pt gap above the avatar. |

### D4 — Spaces (the second tab)

| | |
|---|---|
| `?` control | `Patina/Features/Rooms/Views/YourSpacesView.swift:138-152` — `questionmark.circle`, id `YourSpacesView.HelpButton` |
| sheet | `Patina/Features/Rooms/Views/YourSpacesView.swift:114-117` — `.helpPanel(surfaceKey: SurfaceKeys.IOSApp.Rooms.root)` |
| surface key | `ios-app/rooms` → **0 articles** |
| reachable on the bar root | **Yes** — `SpacesTabRoot` mounts `YourSpacesView` (`TabRoot.swift:54-58`) |
| owner | ⚠ **contested** — `Features/Rooms/**` is **L1-B**'s glob, but L1-C's *"Notes this lane applies"* names `YourSpacesView` as a file L1-C edits (L1-B's `.refreshable`, `C4-12`/`R-03`). Steward call. Written into **`l1-b-notes.md`** (the glob wins) and cross-referenced from `l1-c-notes.md`. |
| **recommendation** | **Hide** the button at `:138-152`. Leave the `Spacer()` at `:137` — it separates the title cluster from the "Add a room" control and the layout needs it. |

### D5 — QR sign-in

| | |
|---|---|
| `?` control | `Patina/Features/QRAuth/Views/QRScannerView.swift:59-77` — `questionmark`, id `QRScannerView.HelpButton` |
| sheet | `Patina/Features/QRAuth/Views/QRScannerView.swift:102-105` — `.helpPanel(surfaceKey: SurfaceKeys.IOSApp.QRAuth.root)` |
| surface key | `ios-app/qr-auth` → **0 articles** |
| reachable on the bar root | **Yes** — Studio → Settings (`SettingsView.swift:75`), Account (`AccountView.swift:165`), the Companion (`CompanionOverlay.swift:678`) and the `field://` deep link (`DeepLinkHandler.swift:176`) all set `presentedSheet = .qr` |
| owner | `Features/QRAuth/**` → **L1-A** (PROGRAM.md §3 residue table: *"it is the auth seam"*) |
| **recommendation** | **Hide** the button at `:59-77`. `Spacer()` at `:78` then `closeButton` keeps ✕ hard right — the row still reads correctly with the leading control gone. R1's **D-06** exercises this scanner on Kody's phone, so it must still open, and it does. |

### D6 — the Companion panel

| | |
|---|---|
| `?` control | `Patina/Features/Companion/Components/CompanionHearthView.swift:409-416` — `headerButton(systemName: "questionmark", identifier: "companion.help")`, rendered only `if onHelp != nil` |
| bound at | `Patina/Features/Companion/Views/CompanionOverlay.swift:360-366` — `onHelp: { collapseToButton(); … presented = .help }` |
| sheet | `Patina/Features/Companion/Views/CompanionOverlay.swift:567-577` — `case .help: HelpPanelSheet(surfaceKey: SurfaceKeys.IOSApp.Companion.root)` |
| surface key | `ios-app/companion` → **0 articles** |
| reachable on the bar root | **Yes** — the Companion mounts on both roots (`HouseFirstRoot.swift:59`, `ContentView.swift:197`); its door on the bar root is the fifth-slot Strata mark |
| owner | `Features/Companion/**` → **L1-C** |
| **recommendation** | **Hide.** One-word change: `onHelp: nil` at `:360`. The hearth already guards on nil, so no second file is touched. Keep the `case .help:` arm — `PatinaTests/CompanionSheetDriverTests.swift:77` asserts `source.contains("HelpPanelSheet(")`. |

---

## 3. Why "hide" and not "author", for all six

Authoring is not expensive — the panel renders `title` + `oneSentenceAnswer` inline and nothing else
(`HelpPanelSheet.swift:167-190`; the row *is* the article, because the portable-text renderer is still
a stub: `HelpArticleStubView` prints *"Full article view is coming soon."*). Six one-sentence articles
is an afternoon.

**Authoring still does not work in build 1, because the request itself is malformed.** The article
query is the only GROQ in the app containing a `+`, and `URLComponents.queryItems` does not
percent-encode `+`. Sanity form-decodes it back to a space, the query stops parsing, and the panel gets
an HTTP 400 — on *every* surface, with or without content.

Reproduced 2026-09-02 against the exact URL the app builds. The URL was generated by compiling
`buildArticleListURL`'s body verbatim in a throwaway `swift` script, then curled:

```
$ curl -sS -o /dev/null -w '%{http_code}' '<the URL the app builds>'
400

{"error":{"description":"expected ')' following function arguments","end":122,
 "query":"*[_type == \"helpContent\" && contentType == \"helpArticle\" &&
  (surfaceKey == $sk || string::startsWith($sk, surfaceKey   \"/\"))] | …",
 "start":100,"type":"queryParseError"}}
```

Note the echoed query: `surfaceKey   "/"` — the `+` arrived as a space. With the single character
percent-encoded as `%2B` and nothing else changed, the same URL returns **200** with
`"result":[]`. That is `R-10`'s root cause, and it is routed to **L1-B** at
`build/waves/w1/l1-b-notes.md`.

So the decision is:

- **Round one: hide all six doors.** This is the only choice that is true whether or not `R-10` lands
  in W1. Authoring six articles and shipping them behind a 400 gives the tester the identical
  "No help articles yet" screen, with a day spent.
- **W2: author, then unhide** — gated on `R-10`'s fix, one `helpArticle` per door
  (`ios-app/home`, `/product-detail`, `/profile`, `/rooms`, `/qr-auth`, `/companion`), title plus one
  sentence each. `A3-09`'s other 14 missing child keys stay missing: the panel's prefix clause means a
  root article covers every child screen, so 6 documents cover all 36 keys.

### The side effect worth stating plainly

With all six doors hidden, `HelpPanelSheet` is unreachable in build 1 and `fetchArticles` is dead code
there. `R-10`'s *user-visible* half therefore cannot fire in build 1 — but its fix is still W1 work,
because it is the precondition for W2's authoring, and because the panel has demonstrably **never**
worked on any platform build. Do not let "the door is hidden" become a reason to drop it.

---

## 4. What is NOT a door, and is fine

The small inline `HelpInfoIcon` / `HelpTooltip` affordances are a different path: they fetch a single
document with `contentType == "tooltip"` (`HelpTooltip.swift:188-191`) and fall back to an inline
Swift string on a miss. They are **not** in `C5-02` and are **not** hidden.

Eleven of the thirteen non-coachmark `ios-app/*` documents are `contentType: "fieldHelper"`, which a
tooltip fetch can never match — the content type is a fixed query parameter and the fallback chain
walks only the surface-key parent (`SanityHelpClient.swift:373-390`). Those eleven are invisible in
build 1 even though every one of them reads
`PLACEHOLDER pending Leah review — explain <thing>.`

**One is not invisible.** `ios-app/home/match-pill` is `contentType: "tooltip"`, it is live, and
`ProductDetailView.swift:409-411` mounts it beside the price — so the placeholder string renders to a
tester on the piece screen. That is `L04-N1`, filed and fixed as a content edit in
`sanity-tour-copy.md` §4 and `sanity-publish-steps.md`. The dormant twin
`ios-app/home/tier-pill` has no call site and is recommended for unpublish.
