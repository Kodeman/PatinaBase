# W3 · lane N2 — notes for the other lanes and the steward

Written by N2 after its gate, 2026-08-27. Branch `daily-return/w3-n2`, cut from N1's tip
`b101f5009`. Everything below is something N2 found or did that reaches outside its own task list.

---

## 1. For the steward — the one edit N2 made inside N1's file

`Features/Navigation/HouseFirstRoot.swift`, commit `f74f52ff4`, **`root(for:)` only**:
`.spaces`/`.pieces`/`.studio` now name `SpacesTabRoot()` / `PiecesTabRoot()` / `StudioTabRoot()`,
and the `studioRoot` shim is deleted. `n1-notes.md` §1c asked for exactly this ("when your wrapper
lands, that shim should come out; ping N1/the steward rather than editing it yourself") — N1 had
already reported and its worktree is not live, so N2 made the edit rather than stranding the
wrappers. Nothing else in the file moved: neither dispatcher, the bar, the Companion slot, the
mount order, the `mounted` set, nor the two `onChange` handlers. `git show f74f52ff4 --stat` is one
file, +5 −16.

`HouseFirstRootTests` and `TabRootTitleTests` both stay green; the latter now pins that the shim is
gone, so it cannot silently return.

## 2. ⚠ For whoever owns `Features/Rooms/**` — the Spaces tab root has no title at zero rooms

`YourSpacesView` branches on `rooms.isEmpty`: the populated branch draws the `Your Spaces` header,
the `emptyState` branch draws only "No rooms yet". As a *pushed* screen that was fine — the chrome
sat under a back chevron the reader had just used. As the **Spaces tab root at zero rooms** it means
the canonical name is nowhere on glass (`shots/w3-n2-05-spaces-tab-root-no-chevron.png`).

`SpacesTabRoot` sets `.navigationTitle(PatinaTab.spaces.canonicalName)`, so the value exists — but
`.patinaScreen` hides the system bar, so nothing draws it. Two honest fixes, both one line and both
in a file **no W3 lane owns**:

```swift
// YourSpacesView.swift — hoist the header above the isEmpty branch, OR:
// give emptyState the same `header` the populated branch has
```

N2 did not take it: `Features/Rooms/**` is outside this lane's file set, `HomeHeaderTests` and the
rooms suites move with it, and the empty state's copy is a product decision. **This needs a name.**

## 3. ⚠ For N1 / the steward — `PatinaTabBar` collides at Dynamic Type XXL

`shots/w3-n2-09-pieces-saved-row-dark-xxl-flagon.png`: at `accessibility-extra-extra-large` the four
labels render as `TodaySpac…PiecesStudio` — `Spaces` truncates mid-word and every label touches its
neighbour with no gap. The bar is `PatinaTabBar.swift`, N1's file and explicitly not N2's to edit
(n1-notes §1d). The rest of the Pieces surface holds at XXL: the `Saved` row keeps its title, its
right-aligned meta and its chevron on one line, and the chip row scrolls with SP-02's fade.

## 4. For N3 — nothing here blocks you, and one thing helps

`.table` and `.emergence(pieceId: nil)` are unchanged in `RouteTabTable`, so every Companion row
that names them keeps working: verified live on the flag-off root, where the panel's
`Saved, 1 saved piece` and `Your recommendations` rows both resolved
(`shots/w3-n2-08-…`). `handleIntent` was not touched. The Companion `.minimal` orb still draws over
the bar and over the Pieces grid — n1-notes §2a's three-step fix is still yours and still unmade.

## 5. For Fable — three dispositions N2 took rather than blocking

**5a. `p_category` was already sent; the missing half was that nothing depended on it.**
The brief describes `p_category` as "the parameter nobody sends". At N2's base it *was* sent —
W1b's SP-02 added `RecommendationsViewModel.category(forFilter:)` and
`ProductAPIClient.fetchRecommendations` writes `params["p_category"] = category.rawValue`. What SP-02
did not do is stop filtering again on the client: `filteredProducts` was
`products.filter { $0.category.displayName == activeFilter }`. N2 removed that second pass, because
it can only subtract rows the RPC deliberately returned — the server compares
`p.category = p_category` exactly (00244:1016), while the client re-derives its enum through
`ProductCategory(normalizing:)`, which folds vocabulary it does not name onto `.decor`. Proven live
rather than argued: `match_events` row 72 carries `context->>'category' = 'lighting'` with one
result, against the same session's unfiltered rows with `category` NULL and ten.

**5b. The chip vocabulary is five words, and M9's mock draws `RUGS`.**
M9's chip row reads ``ALL`` ``SEATING`` ``TABLES`` ``LIGHTING`` ``RUGS`` `…`. The app's chips are
`All` `Seating` `Tables` `Lighting` `Storage`, driven by `ProductCategory`
(`seating`/`tables`/`lighting`/`storage`/`decor`/`textiles`). **N2 changed neither.** Adding `Rugs`
means a new enum case *and* a matching `products.category` vocabulary in the database — the RPC's
filter is an exact string match, so a `rugs` chip against a catalogue that stores rugs as `textiles`
or `decor` would return an empty grid under a chip that stays selected. That is a data question, not
a client one. `Decor` and `Textiles` also exist in the enum with no chip. Left as-is and named here.

**5c. M9's two analytics events are not built.** The M9 sheet lists
`browse_category_selected {category}` · `saved_opened` · `saved_note_edited`. None is in the brief's
deliverables or its named tests, and N2 did not add them rather than widen scope unasked. The two
call sites are obvious when someone wants them (`applyActiveFilter`, and the `SavedDoorRow` action).
`saved_note_edited` has no surface at all — M9b's per-row note (`saved_items.note`, F197/F170) is
**not built**; the pushed Saved screen is the existing `CollectionsView`, whose rows carry no date,
room or note. M9b was not in N2's deliverable list either. Both are open.

## 6. What N2 did NOT verify

- **Dark mode beyond one frame.** One dark + XXL capture of the Pieces root
  (`w3-n2-09`). No dark pass over Saved, Spaces or Studio.
- **Signed-in tiers.** Every walk above is the **guest** tier. `client@patina.dev` and
  `james.okafor@example.com` were not exercised, so the Saved row was never seen with a
  server-side `saved_items` count arriving from `seedSavedState`'s remote half — only with locally
  saved rows. The remote half is compile-green and unit-covered, not sim-verified.
- **The guest session does not survive a relaunch.** Every `simctl launch` returned to the auth
  wall and the onboarding had to be re-walked; the locally saved piece *did* survive
  (`Saved, 1 saved piece` in the Companion after the flag-off relaunch). Noted as an observation,
  not investigated — it is SP-06 territory.
- **Nothing device-verified.** Simulator only, as the whole wave is.
