# W1 · L1-D — notes out, fix round 4

Branch: `first-flight/w1-l1d`. Each note below is also appended to the target
lane's inbox in the main checkout with the same text.

---

## `D5→E-1` → **L1-E** · `E4-L1D-1` is applied, and two more files went with it

Thank you for measuring it rather than reporting it — the add/add was real.

```
$ git merge-tree --write-tree HEAD first-flight/w1-l1e     # before
CONFLICT (add/add): Merge conflict in
  artifacts/ios-testflight-polish-2026-09-01/build/waves/w1/l1-e-copy-deck.md

$ git merge-tree --write-tree HEAD first-flight/w1-l1e     # after bb38980e7
clean
```

`bb38980e7` untracks **eight** files, not six. The six you named:
`l1-a-notes.md`, `l1-b-notes.md`, `l1-c-notes.md`, `l1-e-notes.md`,
`l1-f-notes.md`, `l1-e-copy-deck.md`. Two more went with them for the same
reason, each with its own measurement:

| file | measurement |
|---|---|
| `steward.md` | frozen at **1321** lines; the live copy is **1635**. A merge into the main checkout would either refuse on the untracked difference or replace the steward's own record with a snapshot 314 lines behind it. |
| `l1-d-notes.md` | this lane's inbox, but written by every other lane. The frozen copy predates `E4-L1D-1` itself — it does not contain the note this commit answers. |

Six paperwork files remain on the branch, all authored by this lane
(`l1d-tasks*.md`, `l1d-notes-out*.md`) plus `shots/w1-l1d*/`. Every one was
checksummed against the live main-checkout copy before the commit and is
byte-identical, so none of them can conflict either.

The content is not lost. It lives in the main checkout and on each owning lane's
branch; whoever commits the W1 paperwork set should commit it whole, once, rather
than in six lanes' fragments.

**No amend was needed** — a follow-up commit removes the paths from the branch
tip, which is what the merge reads.

---

## `D5→E-2` → **L1-E** · the deck's `L1-D applies` block, row by row, at the tip

Revision 4 of `l1-e-copy-deck.md` is on `first-flight/w1-l1e`; the main-checkout
copy is still revision 1, so this was read from your branch. Its three L1-D rows:

| row | state on `first-flight/w1-l1d` |
|---|---|
| `C5-09` · `PatinaEmptyState.swift` `#Preview` default | **applied.** `title: "Still building the collection"`, `message: "New pieces are added by hand — check back soon."` — verbatim. |
| `C5-09` · `PatinaEmptyStateContent.stillChoosingPieces` | **unchanged, as ratified.** `title: "Nothing here yet"`, `message: "Your designer is still choosing pieces for you. This fills in as they do."` — byte-identical to the deck's final column. |
| `C5-14` · the money formatter's output | no string to apply; the formatter selection is closed (`compactFormatterCeiling = 0`). |

One row outside that block needs saying, because getting it wrong costs merge 6 a
conflict: **`C5-06` · `TimeOfDay.swift:29-41`** sits under *your* section
(`### L1-E applies — its own worktree, its own files`), and
`git show first-flight/w1-l1e:…/TimeOfDay.swift` shows the three-greeting
collapse already applied there. `TimeOfDay.swift` is inside `PatinaDesignKit/**`,
which is L1-D's glob — so on the glob alone this lane would have taken it.
**It deliberately has not**, and the file is untouched on this branch. Do not
expect a second copy of that edit at merge 2.

The deck's string inventory also lists `EditorialStoriesAPIClient` and
`PatinaTextField` as two-string L1-D files with no W1 finding, held for **W2**.
Neither has a string change on this branch. Agreed as deferred.

---

## `D5→X-1` → **the steward** · the merge-2 conflict set, re-measured after `bb38980e7`

Round three's fifteen-row table (`l1d-notes-out-round4.md`, §"the conflict table")
**still holds exactly**, and the paperwork conflict on top of it is now gone:

```
first-flight/w1-l1a   3 conflicts
first-flight/w1-l1b   6 conflicts
first-flight/w1-l1c   6 conflicts
first-flight/w1-l1e   clean
first-flight/w1-l1f   clean
```

Same fifteen files, same resolutions — the table is current, use it as written.

Under **D14** (L1-C → **L1-D** → L1-B → L1-F → L1-A → L1-E) only the six L1-C rows
are merge 2's work; rows 1–3 (l1a) and 4–9 (l1b) belong to lanes that rebase onto
the tip after this one. The four rows marked ✱ in that table — `RoomBudgetTests`,
`CompanionHearthView`, `CompanionOverlay`, `HouseRecordCard` — are **unions, not
either side**, and `HouseRecordCard` is a control-flow change no grep can see.

`D→X-2` (the `swift test --package-path apps/mobile/PatinaDesignKit` gate line is
red on `main` and on every lane branch — there has never been a Tests target) and
`D→X-3` (the `OrderHandoffTests` / `CompanionCoachingModelTests` timing flake)
both stand unchanged. Neither is a signal at any merge.
