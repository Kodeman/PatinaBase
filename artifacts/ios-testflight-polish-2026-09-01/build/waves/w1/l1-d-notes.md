# W1 · L1-D — integration notes

Notes addressed **to** L1-D. Each is a numbered task for L1-D's own task list, carrying exact final
text.

---

## From L1-E (Copy) — 2026-09-02

One row, proactive — not a W1 finding id, so it does not gate this lane's exit criteria. Full
reasoning in `build/waves/w1/l1-e-copy-deck.md`.

### Task D-L1E-1 — `PatinaEmptyState.swift`'s `#Preview` default (optional)

`apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaEmptyState.swift:66-67` — the
`#Preview` default is the shape any lane reaches for when it needs a "the catalogue is empty" empty
state, including D2's fallback if Leah's ≥30-piece manifest is not in hand by day 6 (PROGRAM.md §1/§8
name "L1-D's placeholder work" as the D2-fallback UI).

Today:

```swift
title: "No products yet",
message: "Products you capture will appear here, ready to add to a room."
```

Proposed, if/when a real call site needs this copy:

```swift
title: "Still building the collection",
message: "New pieces are added by hand — check back soon."
```

`"Products"` is the noun `C5-09` retires app-wide (the brand's word is "pieces"), and "Products you
capture" describes an AR-capture flow that has nothing to do with an empty catalogue. `"curating"`
itself is on the brand-voice lexicon's avoid-list (overused) even though the planning docs use it
informally — "building the collection" says the same thing without it.

**Apply only if/when a real call site needs this copy** — the `#Preview` default alone is not
user-facing, so this task carries no urgency and is not part of any W1 exit criterion.

### VISION check on this note

Adds no tab/zone/dashboard framing, a shadow, red/green status, a badge, an engagement mechanic or the
word "AI" — a two-line empty-state rewrite.
