# W1 · L1-E — notes out

Every change this lane needs in another lane's file, with the exact final text. Full reasoning for
every row lives in `build/waves/w1/l1-e-copy-deck.md` — this file mirrors what was appended to each
target lane's own `<lane>-notes.md` (§7 of `PROGRAM.md`: "the notes I will send" is a numbered task in
the sender's own list, carrying exact final text, and the same content also lands in the target's
file). Nothing here is a hope — each section below was appended verbatim to the file named.

---

## → `build/waves/w1/l1-a-notes.md`

`A-52`, `A-79`, `A-101`, `A-06`, `C5-20`, `C5-10`'s five L1-A-owned rows, and `B-23` (a one-line note,
no deck row — its own fix line already names the exact replacement). Full text: see
`l1-a-notes.md`'s new `## From L1-E (Copy)` section.

**File-overlap flag for the steward:** `Features/Companion/Services/CompanionActionRows.swift` is
touched by both this note (`A-52`, lines 32-34 and 205-224) and the `l1-c-notes.md` note below
(`A-60`/`C-22`, lines 36-54) — different, non-overlapping line ranges in the same file. Not a textual
conflict, but worth the steward's eyes at merge (L1-C merges before L1-A per D14, so L1-A's worktree
should rebase onto the integrated `CompanionActionRows.swift` before touching its own lines).

## → `build/waves/w1/l1-b-notes.md`

`C4-09` (`ScanUploadProgressView.swift` — the `ScanUploadFailureCopy` contract, modelled on
`OrderFailureCopy.swift`), `C5-16` (`SavedItem.resolvedMakerName` + three call sites), `C5-09`/`C5-10`
(`ItemActionMenu.swift`'s five rows), `RoomsAPIError`'s `LocalizedError` conformance (`C4-08`'s second
half — L1-E already fixed the call site that reads it), and `ScanReviewView.swift:128`'s missing
period (`C5-11`). Full text: see `l1-b-notes.md`'s new `## From L1-E (Copy)` section.

## → `build/waves/w1/l1-c-notes.md`

`A-60`/`C-22` (`CompanionActionRows.swift`'s two rows, done together — see the deck's reasoning for why
"Your studio" moves from `studioRow` to `profileRow`), `ProfileView.swift:148` ("MORE", not "YOUR
STUDIO" — reasoning in the deck), `C-30` (pluralised stat label), `C-38` (drop the rationale line),
`B-20` (fixed CTA label), `C5-05`'s structural note (no string — flagged so L1-C is not waiting on a
word that isn't coming). Full text: see `l1-c-notes.md`'s new `## From L1-E (Copy)` section.

## → `build/waves/w1/l1-d-notes.md` (new file — none existed before this note)

One proactive row, no W1 finding id: `PatinaDesignKit/Components/PatinaEmptyState.swift`'s `#Preview`
default text, flagged against D2's "still curating" fallback and `C5-09`'s noun (never "Products").
Optional — not gating any W1 exit criterion. Full text: see the new `l1-d-notes.md`.

---

## Not sent — recorded and why

- `A3-28` — its migration-fix half is reverted by ruling B2 v3; its OAuth-mislabel half is closed by
  L1-A's own `A3-07` (not this deck's row); its vocabulary half has no live user-facing string. Full
  reasoning in the deck's "Not applied this wave" table. No note needed because there is no code for
  any lane to change.
- `C5-14` — L1-D's own finding; L1-E supplies no string (a formatter-selection problem, not wording).
- L0.1's seven permission strings — reviewed in the deck, held as a W2 carry-forward per
  `build/waves/w1/steward.md` §5.6 (`A2-12`'s deck row is explicitly not a W1 apply target). No note
  sent this wave; the reviewed text is preserved in the deck for whoever opens the W2 row.
- The tour's "Studio" wording (L0.4) — already correct in `FirstLaunchTour.swift`'s binary fallback;
  the remaining drift is Sanity's current production content, a Kody-run CMS publish, not a code note.
