# W2 — fix log, round 14

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, from HEAD `7ef47ff98` ("fix(people-room): W2 round-13
findings"). **One** finding assigned — `CR14-1`. Nothing else was touched: none of the carried
findings (CR14-2 … CR14-45), no migration, no seed, no package under `packages/`, no prod surface,
no server started.

---

## CR14-1 · MAJOR · the Call Sheet roster row spoke the column-head vocabulary

**What was wrong.** CR13-3's fix landed in `seatLineParts` (`people/seat-line.tsx`) and in the
person card's Past seats, but the Call Sheet row composes its meta line somewhere else —
`use-call-sheet-roster.ts:89` handed `callSheetProjection` the *column-head* labels:

```ts
kindLabel: (kind) => getPartyKindLabel(kind) || (kind ?? ''),   // PARTY_KIND_LABELS
tradeLabel: rosterTradeLabel,                                    // Title Case
```

which `metaOf` (`lib/document/roster-derivation.ts:603-604`) joined and `roster-row.tsx:366`
printed. So one seat on the Okonkwo sheet — `client_rep` / Chidi Okonkwo, written by an Add-sheet
door that calls him **"a household member"** — read **"Client Rep"** on the Call Sheet while the
Directory seat line and the person card read "household member"; and Dana Kowalski read
**"Subcontractor · Electrical"** against the Directory's "sub · electrical".

The seed carries both seats on the very project the sheet is built for:

```
$ psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c \
  "select party_kind, trade, display_name from project_parties pp
     join projects p on p.id=pp.project_id where p.name ilike '%Okonkwo%' order by 1,3;"
 client_rep |            | Chidi Okonkwo
 sub        | electrical | Dana Kowalski
 vendor     |            | Claire Bissett        ← every vendor seat is trade-less in the seed
 …  (24 rows)
```

**What changed.** One file, `apps/designer-portal/src/components/document/roster/use-call-sheet-roster.ts`:

```ts
import { seatKindWord } from '../people/seat-line';
…
labels: {
  kindLabel: seatKindWord,
  tradeLabel: (kind, trade) => rosterTradeLabel(kind, trade).toLowerCase(),
  teamMeta,
},
```

`getPartyKindLabel` is no longer imported there (`getStaffRoleLabel` still is, for `teamMeta`).
`metaOf`, `callSheetRowFromSeat`, `callSheetProjection` and `roster-row.tsx` are untouched — the
vocabulary is injected, so the one composition serves both the Call Sheet and the open document's
project-team region.

**Why `tradeLabel` is not literally `seatTradeWord`.** `seatTradeWord` is
`getFieldTradeLabel(trade).toLowerCase()`, and `getFieldTradeLabel` returns the raw column value for
anything outside `FIELD_TRADE_LABELS` (`packages/types/src/field-config.ts:110-113`). A `vendor`
seat's `trade` is a **specialty**, which only `rosterTradeLabel` reads
(`party-mini-row.tsx:41-49` → `getVendorSpecialtyLabel`). Passing `seatTradeWord` straight through
would have printed a schema word — "stone_fabricator" — on the sheet. For every non-vendor kind
`rosterTradeLabel(kind, trade).toLowerCase()` is character-for-character `seatTradeWord(trade)`; for
a vendor it is the specialty in the same lower case. One vocabulary, no new schema word.

`PARTY_KIND_LABELS` was left exactly where the finding says it belongs: the picker's filter chips
(`rolodex-picker.tsx:386,507`) and the party sheet's Kind row (`party-profile-sheet.tsx:330`).
`rolodex-picker.test.tsx:138,140,147` still assert "Subcontractor" / "General Contractor" on those
chips and still pass.

**Evidence — negative control.** The new test, run against the file at HEAD `7ef47ff98`
(`git stash push` on the one file, test kept):

```
✕ prints the seat words, not the column heads (CR14-1)
  Expected substring: "household member"
  Received string: "… Client sideCOChidi OkonkwoClient RepOn paper… DKDana Kowalski
                    Subcontractor · ElectricalOn paper… ESErin SatoGeneral ContractorOn paper…"
Tests: 1 failed
```

and with the fix restored, the same render:

```
… COChidi Okonkwohousehold member … DKDana Kowalskisub · electrical … ESErin SatoGC …
```

One new test in
`apps/designer-portal/src/components/document/roster/__tests__/project-roster-surfaces.test.tsx`
— "prints the seat words, not the column heads (CR14-1)" — mounts three seats (`client_rep`, `sub`
+ `electrical`, `gc`) through `expectMatchingSurfaces`, so the assertion is made against BOTH the
Call Sheet and the project-team region, and asserts "household member" / "sub · electrical" / "GC"
present and "Client Rep" / "Subcontractor" / "Electrical" / "General Contractor" absent.

No existing jest test asserted the old Call Sheet meta words: `call-sheet-derivation.test.ts:42-43`
injects its own stub labels (kind upper-cased, trade passed through), and
`project-roster-surfaces.test.tsx:220`'s `not.toContain('General Contractor')` was already a
negative. Nothing needed rewriting.

---

## Gates, at the end of the round

```
$ cd apps/designer-portal && npx tsc --noEmit
DESIGNER_TC_EXIT=0

$ cd apps/designer-portal && npx jest
Test Suites: 585 passed, 585 total
Tests:       7528 passed, 7528 total      (7527 → 7528: the one new test)
Snapshots:   1 passed, 1 total
Time:        24.678 s
FULL_JEST_EXIT=0

$ cd apps/designer-portal && npx eslint \
    src/components/document/roster/use-call-sheet-roster.ts \
    src/components/document/roster/__tests__/project-roster-surfaces.test.tsx
ESLINT_EXIT=0        (no output)
```

`packages/supabase` type-check and the admin-portal build were **not** run and are not owed: this
round touched no file under `packages/`.

---

## Two things this round deliberately did NOT do — for the panel

1. **The case is still the Call Sheet's own.** `roster-row.tsx:78-79`'s `META` class carries
   `uppercase`, so the fixed words render "HOUSEHOLD MEMBER" and "SUB · ELECTRICAL" on the sheet
   while the Directory's `t-meta` line renders them lower. CR14-1 names the *vocabulary*
   ("the second half matters more than the case"), and the finding's fix instruction is about the
   labels only, so the class was left alone. If the panel wants one case as well as one word, that
   is a one-line change to `META` and a separate finding.
2. **`seatTradeWord` itself is still not vendor-aware.** The Directory seat line
   (`seatLineParts` → `seatTradeWord`) would print a raw specialty code for a vendor seat that
   carries a `trade`. No such row exists in the seed (all three vendor seats are trade-less), so it
   is latent, and it lives on the Directory, not on the Call Sheet — out of CR14-1's scope.
