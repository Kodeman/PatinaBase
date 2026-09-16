# Fix log, round 3

One section per specimen file. Rulings R-A..R-E from Fable, after review round 3.

---

## `specimens/people-room-1440.html` (Builder A, the 1200px studio band)

Applied: R-A, R-C, R-D. Nothing else touched. 88,150 -> 96,079 bytes.

| Item | What changed | Evidence |
|---|---|---|
| **R-A** — no paper word for Great Northern Bank and CPED Inspections (CR2-11 / CR3-3) | New `noPaperHeld(co)` derives the class from the fixture rather than a hand list: a firm every one of whose people sits in an engagement of kind `inspector` holds no compliance paper for the studio (`gnbank` via F-26, `cped` via F-27; Marrow/Northgate/Twin Cities all fail the test because their people are `gc`/`sub`). Four print sites now suppress the word: the Directory person row's company suffix (`(co && !noPaperHeld(co) ? wordEl(co.paper) : gap())`, the 108px column is kept so the four word columns stay aligned), the Directory firm row, the Call Sheet unfold's paper word, and the company card, whose Paper region for such a firm now prints one line — "No paper is held for this firm." — and no table and no state word. | Directory plate: Ray Thao's row now carries `ON PAPER` / `NOT ASKED` / `AWARDED` and an empty fourth column, where it previously carried `NOT ON FILE`. Company card, driven headless for each id: `gnbank paper-line=true \| notonfile=false \| table=false`, `cped paper-line=true \| notonfile=false \| table=false`. The word "Not on file" still appears exactly where it belongs — Northgate's workers-compensation document row on `#state-company`. |
| **R-D** — Dana Kowalski's seat window | Fixture line for F-11's engagement corrected in place to `"to": "2027-08-13"`, and the `seatTo()` override plus its comment deleted; both call sites (`seatLine()` for the Directory seat row, and the person card's Seats region) now print `e.to` straight from the fixture. | `grep -c seatTo` -> 0; `grep -c 2027-03-13` -> 0. The embedded `FIXTURE` object is now byte-identical to the amended SPEC §3 JSON block (checked by extracting both and comparing; `byte-identical: True`). Directory plate reads "Okonkwo residence · sub · electrical · On the job · 12 Oct 2026 to 13 Aug 2027"; person card reads "12 Oct 2026 to 13 Aug 2027". |
| **R-C** — the seventh state, `#state-pick` (CR3-1 / CR-6) | Added per SPEC §5.7: a "Bring forward" button in the state bar between Project roster and Add sheet (seven buttons, SPEC §4 order), a `face-pick` section, `renderPick()`, and `state-pick` entries in `STATES` / `NAMES` / `FACES` / `paint()` / the band-class switch, so hash, `hashchange`, `postMessage` and the bar all reach it. The face keeps the Okonkwo Call Sheet head and its site-access line above a DocSheet region — eyebrow "OKONKWO RESIDENCE", heading "From the rolodex" — holding a labelled search field valued "Lindqvist", the line "4 of 5 from the Lindqvist kitchen selected", five mini rows in SPEC order (Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett, Ben Ostrom) each with a square checkbox drawn with `appearance: none` and an ink fill (no tick glyph), the 34px circle, name, firm and trade, one history line and its words, and — beside the list at 1440 — the "What travels" / "What stays behind" pane. Terminal "Add four to the roster" with "Put back" beside it, the consequence sentence beneath. | `#state-pick` plate: `people-room-1440-state-pick-1440.png`. Headless walk of the seven states: every SPEC §5 acceptance string for `#state-pick` present, `role="status"` reads "Bring forward", one section visible, `overflow=false`. |
| R-C, live controls | The checkboxes are not decoration: a `change` listener recomputes the count line, the terminal label and the consequence sentence from the selection, and "Put back" clears them. At rest the face reads exactly the strings SPEC §5.7 #3/#6/#7 require. | After clicking "Put back": count `0 of 5 from the Lindqvist kitchen selected`, terminal `Add to the roster` (with `aria-disabled="true"`, never the `disabled` attribute), consequence `Adds no seats to the Okonkwo residence.` After re-ticking Dana: `1 of 5 ... selected` / `Add one to the roster` / `Adds one seat to the Okonkwo residence. Northgate Electric's insurance lapsed 31 Mar 2026.` |

### Render (SPEC §9)

```
node tools/render.mjs specimens/people-room-1440.html --out shots \
  --name people-room-1440 --widths 1440 \
  --hashes state-directory,state-person,state-company,state-roster,state-pick,state-add,state-access --console
```

Seven plates written, `people-room-1440-console.json` reports for every one of them
`"errors": []`, `"warnings": []`, `"horizontalOverflow": false`.

```
people-room-1440-state-directory-1440.png
people-room-1440-state-person-1440.png
people-room-1440-state-company-1440.png
people-room-1440-state-roster-1440.png
people-room-1440-state-pick-1440.png
people-room-1440-state-add-1440.png
people-room-1440-state-access-1440.png
```

### Gate (SPEC §10)

| Check | Result |
|---|---|
| Last line | `<!-- specimen-complete -->` |
| `grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled'` | `0` |
| §5 acceptance strings, all seven states | present — walked headless; the only "misses" my first pass reported on `#state-add` were `innerText` not carrying input values, confirmed present by reading the controls (`f-company="Cedar & Iron Framing"`, `f-trade="carpentry / framing"`, `f-mobile="(612) 555-0118"`, `f-rule="Text only. No working email."`, `f-evidence="Recorded by Priya at the site kickoff, 13 October 2026."`) |
| Names, firms, phones | all from §3; the picker's five people are F-11, F-12, F-13, F-20 and L-02 |
| Token block + class fragment | byte for byte as §2.1/§2.2 (diffed against SPEC; zero differing lines), plus the one appended brace |
| Hex literals outside the token block | none |
| External resources | the two font preconnects and the one Google Fonts stylesheet, nothing else |
| Curly apostrophes, tick glyph, schema words, "Remove" | 0 each |
| One `<h1>`, one `<style>`, one `<script>`, headings h1 → h2 → h3 | confirmed |

### Round-3 findings naming this file, and what became of them

| Finding | Disposition |
|---|---|
| CR3-1 (no bring-forward picker) | fixed here, per R-C |
| CR3-3 (paper word on lender/inspector firms) | fixed here, per R-A |
| CR3-2 (no invoice / change-order screen) | no build, per R-B; the acceptance clause moves to the money book |
| CR3-10 / DR-3 / TR3-4 (kind-picker examples diverge) | 1440's `KIND_SOURCE` is canonical per R-E — unchanged |
| DR-1, DR-2, DR-4, TR3-1, TR3-2, TR3-3, CR3-8, CR3-9 | all name `people-room-390.html`; 1440 is cited as the correct reference in each |
| CR3-4 ("licence" spelling) | not actioned: the strings are inside the SPEC §3 fixture, which §10 #6 requires verbatim. A fixture-level ruling, not a specimen edit |
| CR3-5 ("Compare & merge" names no cards, no handler) | not actioned: the band's sentence is a SPEC §5.1 #16 exact string, and no two people in §3 share a phone, so naming the two cards would invent a fact |
| CR3-6 (no schedule-authority sentence), CR3-7 (key-holder cue) | not actioned: both need a fixture fact §3 does not carry |
| CR3-11, CR3-12 (region/act order differs between widths) | not actioned here: no ruling names a canonical order, and R-E's pattern is 390 conforming to 1440 |

## specimens/people-room-390.html (Builder B, the 390 phone stacking)

Seven assigned items plus the round-3 findings that name this file. All applied in the file;
three carried findings returned as deviations because they name both widths and a one-sided
fix would re-open the cross-width divergence this round exists to close.

| Item | What changed | Where |
|---|---|---|
| **(1) DR-1 / CR3-8 / TR3-2** — Add sheet asserted a defaulted authority that never existed | The Authority region now branches on the real fact. `addSheetFor()` no longer substitutes the literal `'No authority on this job.'` when the source engagement's `authority` is empty; it returns `''`. `renderAdd()` prints, for the empty case, an empty `AUTHORITY ON THIS JOB` field, the note `Nothing defaulted from the agreement.` and the act `Record the authority`; only when a real authority string exists does it print `The agreement set this. Confirm it, or write a different one.` and `Confirm from the agreement`. Walked: default "a sub" (Joe Wozniak) → empty field + "Nothing defaulted…" + "Record the authority"; "someone else" (Ray Thao, `Passes or fails an inspection.`) → the confirm copy. | `addSheetFor()`, `renderAdd()` |
| **(2) DR-2 / CR3-9 / TR3-1** — Stonehaven Tile Gallery unreachable at 390 | `DIR_FIRMS` is now `['marrow', 'northgate', 'tcdrywall', 'stonehaven']`, matching `people-room-1440.html`. The Directory Firms list renders "Stonehaven Tile Gallery · Showroom · 1 on the crew · 2 open jobs · CURRENT"; clicking it opens the company card. Walked headlessly: `[data-open-company="stonehaven"]` → card name "Stonehaven Tile Gallery". | `DIR_FIRMS` |
| **(3) DR-3 / CR3-10 / R-E** — kind picker showed different people per width | `ADD_EXAMPLE` is now byte-equivalent to the 1440 `KIND_SOURCE`: a client → F-04, a household member → F-05, **a maker → F-20 Claire Bissett / Stonehaven Tile Gallery**, a GC → F-07, a receiver → F-06, **someone else → F-27 Ray Thao / City of Minneapolis, CPED Inspections**. **`an installer` is unmapped**, so it falls to a blank sheet reading "Nothing is added to the Okonkwo residence Call Sheet until you name someone." A new `ADD_FIRM` map (maker, GC, sub, installer, someone else) now gates the COMPANY and TRADE fields exactly as 1440's `KIND_FIRM` does, so "a household member" drops both at both widths. Consequence sentences follow 1440's template, including the " and records the authority above" clause. Walked all four divergent kinds; every one now matches 1440. | `ADD_EXAMPLE`, `ADD_FIRM`, `addSheetFor()`, `renderAdd()` |
| **(4) R-A** — no paper word for the lender and the inspector | New `holdsNoPaper(cid)` — a firm with no `documents` whose every fixture person sits in an `inspector` engagement — and `paperWord(cid)`, which returns nothing for such a firm. Applied at all three places the finding names: the Directory firm row (`dirFirmRow`), the person row's firm-derived word (`dirPersonRow`), and the company card's Paper region, which for those firms prints one line, "No paper is held for this firm.", with no table, no state word and no acts. Great Northern Bank and City of Minneapolis, CPED Inspections are the only two firms that qualify; Rivera Finishes and Granite North (no people) do not. Confirmed: `Not on file` no longer appears anywhere on the Directory face, and probing both company cards prints the one line and never "Not on file". | `holdsNoPaper()`, `paperWord()`, `dirPersonRow()`, `dirFirmRow()`, `renderCompany()` |
| **(5) R-D** — Dana Kowalski's seat window | The fixture row for F-11's engagement now reads `"to": "2027-08-13"`, per the corrected SPEC §3. `FACE.danaWindow` is deleted and `seatWindow()` is now plain `dshort(e.from) + ' to ' + dshort(e.to)` with no special case. The face still reads "12 Oct 2026 to 13 Aug 2027" on the Directory seat line and the person card, now derived rather than overridden. | fixture `engagements`, `FACE`, `seatWindow()` |
| **(6) R-C** — the seventh state, `#state-pick` | New `renderPick()` per SPEC §5.7: the Call Sheet head stays above; a region with the eyebrow "OKONKWO RESIDENCE" and the title "From the rolodex"; a labelled search field holding "Lindqvist"; the line "4 of 5 from the Lindqvist kitchen selected"; five mini rows in SPEC order (Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett, Ben Ostrom), each with a `.pick-box` checkbox drawn as an ink fill with no tick glyph, the 34px circle, name, firm and trade, a history line, and only the words §5.7 names; the "What travels" then "What stays behind" panes stacked after the list (390 rule §5.7 #9); the consequence sentence; the secondary act "Put back" and the terminal act "Add four to the roster". `state-pick` is wired into `STATES`, `STATE_NAMES`, `RENDER`, the `<section>` list and the state bar (now seven buttons, "Bring forward" between Project roster and Add sheet). `role="status"` announces "Bring forward". | `PICK_ROWS`, `pickRow()`, `renderPick()`, `.pick-box`/`.pick-name`, state bar, `STATES` |
| **(7) TR3-3** — two dead authority acts | Both perform now. Add sheet: the act carries `js-authority`; clicking rewrites `#authority-note` to "Authority recorded for this seat." and announces "Authority recorded." Person card: "Edit the authority" carries `data-disc`/`aria-expanded`/`aria-controls="authority-band"` and opens a real inline band (never a modal) with `AUTHORITY ON THIS JOB` and a `js-save-authority` act; saving writes the value onto `#seat-authority`, collapses the band, resets `aria-expanded`, and announces "Authority saved." Walked both end to end. | `renderPerson()`, `renderAdd()`, the click delegate |
| **(7) CR3-12** — person-card act order | "Edit the authority" now sits after the site facts (window → authority → Escorted on site → Contracted through → Hidden from the client → act), matching 1440's order. | `renderPerson()` |
| **(7) CR3-11** — Add sheet region order | The Authority region moved from "immediately after Trade" to "after Contact rule, before Consent", matching 1440. | `renderAdd()` |
| **(7) DR-4 (r3)** — W-9 expiry prose | `paperStack()` now uses 1440's template: `On file 14 Apr 2025`, not "No expiry, on file 14 Apr 2025". | `paperStack()` |
| **(7) DR-5 (carried)** — "Held by" hardcoded | Now reads the document: `d.heldBy === 'studio' ? 'The studio' : esc(d.heldBy)`, matching 1440's `docCells()`. | `paperStack()` |
| **(7) DR-6 (carried)** — orphan `<h2>The studio book</h2>` | Deleted. "People" and "Firms" are promoted from `<h3 class="t-head">` to `<h2 class="t-d3">`, matching 1440's `<h2 class="crm-h">` pair, so the Directory keeps a legal h1 → h2 order with no h3 orphan. | `renderDirectory()` |
| **(7) DR-7 (carried)** — `docWord()` rule diverged | Now `d.state !== 'Current' && d.blocks.length → blocked`, byte-equivalent to 1440's `docCells()` `stops` rule. No fixture document changes appearance; the two files now encode one rule. | `docWord()` |

### Returned, not fixed

| ID | Why |
|---|---|
| CR3-5 (= CR2-8) | "Compare & merge" names no cards and has no handler **in both files**. A one-sided fix would re-open exactly the cross-width divergence this round closes, and the copy it needs (which two cards, and what the act opens) is a panel ruling, not a build choice. Returned for a both-widths instruction. |
| CR3-4 (= CR2-7) | "licence" spelling lives inside SPEC §3's verbatim fixture JSON ("MN electrical contractor licence", "MN BC contractor licence"). §2/§3 require the fixture pasted verbatim; changing it is a SPEC-owner edit, and it must land in both files at once. |
| CR3-6, CR3-7 (carried) | Both ask for fixture additions (a schedule-authority sentence; a cue separating a homeowner's key from the studio's designated key holder). Fixture changes belong to the SPEC owner and must reach both widths together. |

### Deviations recorded

- **SPEC §5.1 #10 vs. R-A.** §5.1 #10 still lists `Not on file` among Ray Thao's row words. R-A rules that CPED Inspections prints no paper word anywhere, so that word is now absent from his row. R-A is treated as superseding §5.1 #10; the other three words (`On paper`, `Not asked`, `Awarded`) are unchanged.
- **The non-empty Authority note.** The orchestrator's ruling fixes the non-empty copy as "The agreement set this. Confirm it, or write a different one." `people-room-1440.html` currently prints "Defaulted from the agreement." for the same branch. The empty branch (the SPEC-tested default face) matches 1440 exactly. Flagged so the pair can be settled in one direction.
- **SPEC §5.7 #6 placement.** The consequence sentence is printed directly *above* the terminal act, as §5.5 #13 requires everywhere else in both files and as every other state in this file already does. §5.7 #6's "under the terminal act" is read as "belonging to", not "after".
- **SPEC §5.4 #3 vitals literal** (carried from round 1). The Call Sheet still prints the live tally "12 on the job this week · 5 reachable by text · 4 with accounts · 2 on paper", which is what §3's fixture supports, not §5.4 #3's "14 · 9 · 5 · 6".

### Gate

```
$ tail -1 specimens/people-room-390.html
<!-- specimen-complete -->
$ wc -c specimens/people-room-390.html
   97195
$ grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled' specimens/people-room-390.html
0
$ hex literals outside the pasted token block (lines 92+): 0
$ one <h1>; one [role="status"]; heading order legal in all seven states
```

Render, SPEC §9, sandbox disabled, `--name people-room-390`:

```
✓ people-room-390-state-directory-390.png
✓ people-room-390-state-person-390.png
✓ people-room-390-state-company-390.png
✓ people-room-390-state-roster-390.png
✓ people-room-390-state-pick-390.png
✓ people-room-390-state-add-390.png
✓ people-room-390-state-access-390.png
Console log: people-room-390-console.json (7 captures)
```

All seven captures: **0 errors, 0 warnings, `horizontalOverflow: false`.**
