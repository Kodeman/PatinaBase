# Fix log, round 4

## `specimens/people-room-1440.html` (Builder A, the 1200 studio band at 1440)

Source of truth for this pass: the amended `specimens/SPEC.md` (§3, §4, §5.1–§5.7, §6, §8, §10),
orchestrator rulings R-F..R-L (R-A..R-E standing), and every round-4 finding in
`review/4-design.md`, `review/4-technical.md`, `review/4-construction-reread.md` that names this file.
`people-room-390.html` was opened read-only, for comparison only. Nothing was written outside
`artifacts/people-room-crm-2026-09-11/`.

### Items applied

| Ruling / finding | What changed in this file | Evidence |
|---|---|---|
| **R-F** (DR4-2 / CR4-5) — vitals literal | No change. The face already prints the recomputed tally, which is now SPEC §5.4 #3's own literal. Verified on the rendered roster: `12 on the job this week · 5 reachable by text · 4 with accounts · 2 on paper` | rendered `#state-roster` text |
| **R-G** (DR4-3, direction.md C1/C17, PR-p) — stage off the person row | `dirPersonRow()`'s word block dropped `(e ? wordEl(e.stage) : gap())`; the row now carries exactly three 108px `.word` columns, reach → consent → paper. The row grid needed no CSS change (`.row-words` is a 12px-gap flex of 108px `.word`/`.word-gap` cells; the identity block `flex: 1 1 320px` takes the freed 120px). Stage now prints **only** on the seat line beneath, and it prints there as a `.word` with its pigment (`wordEl(e.stage, 'word--inline')` appended to the seat row), matching 390's seat panel. `.seat-row` became a wrapping flex so the line and its word sit on one baseline. To make that seat line visible on the unclicked face — SPEC §5.1 #11 requires Ray Thao's seat line and its `Awarded` word to be readable there — the seat disclosures now default open for the same five rows 390 opens: `const DIR_OPEN = ['F-11','F-18','F-12','F-15','F-27']` (was `id === 'F-11'` alone). `aria-expanded` follows `DIR_OPEN`, so the disclosure contract is unchanged | DOM probe: every person row's `.row-words` has `children.length === 3` (12 of 12 rows); Dana's row reads `FIELD LINK / TEXTING / LAPSED` with the seat line `Okonkwo residence · sub · electrical · On the job · 12 Oct 2026 to 13 Aug 2027` + word `ON THE JOB` |
| **R-H** (DR4-1 / TR4-4) — lender and inspector firm rows | `DIR_FIRMS` is now `['marrow','northgate','tcdrywall','stonehaven','gnbank','cped']` (byte-identical to 390's). Both new rows go through the existing `dirFirmRow()` → `noPaperHeld()` suppression, so each prints its name, `firmSub()` and **two empty word cells**: no paper word, no payee marker (neither firm has a `designations.signer`) | `.firm-words` probe: `2:CURRENT/Signs: Tom Marrow · 2:LAPSED/Signs: Dana Kowalski · 2:CURRENT/Signs: Frank Bauer · 2:CURRENT · 2:(empty) · 2:(empty)`; rendered Firms list ends `Great Northern Bank / Lender · 1 on the crew · 1 open job` and `City of Minneapolis, CPED Inspections / Authority · 1 on the crew · 1 open job` |
| **R-I** (DR4-5 / DR4-6) — bring-forward footer | Confirmed already correct; kept unchanged. `renderPick()` pushes the act row (`Add four to the roster` terminal, then `Put back` secondary) and then the consequence paragraph. Checkboxes and `Put back` are live: a `change` delegate calls `pickUpdate()`, which recomputes the count line, the terminal label and the consequence sentence; `Put back` clears all five | live probe: ticking Ben Ostrom → `5 of 5 from the Lindqvist kitchen selected / Add five to the roster`; pressing Put back → `0 of 5 … / Add to the roster / aria-disabled=true` |
| **R-J** (DR4-7 / TR4-1) — add-sheet authority wording | The non-empty branch's note is now the ruled sentence: `Defaulted from the agreement. Confirm it, or write a different one.` (was `Defaulted from the agreement.`). The act on that branch was already `Confirm from the agreement`. The empty branch is untouched: `Nothing defaulted from the agreement.` / `Record the authority` | fresh load of `#state-add`: `[] | Nothing defaulted from the agreement. | Record the authority`; after clicking kind `a GC`: `Signs sub payments. Prices change orders. | Defaulted from the agreement. Confirm it, or write a different one. | Confirm from the agreement` |
| **R-K** (TR4-2) — Paper region on every company card | `renderCompany()`'s paper branch gained the missing `else`: a firm with no `documents` array now renders the Paper region with the word `Not on file` and one act, `Record a document`. The lender/inspector branch is unchanged — one line, `No paper is held for this firm.`, no table, no word, no act | click-through probe: Twin Cities Drywall & Plaster → `PAPER / NOT ON FILE / RECORD A DOCUMENT`; Great Northern Bank → `PAPER / No paper is held for this firm.` (no act); Northgate Electric's full table unchanged |
| **R-L** (TR4-2) — routed contact line | One channel-selection rule now serves every place a routed contact prints: `routeChannels(id)` takes the email if there is one, then the `Office` phone (falling back to any phone-shaped channel) wrapped in `tel()`, never a bare phone string; `routeWrite(id)` composes the line. `clausesFor()` carries the rule's `routeTo`, and `clauseHtml()` prints the routed line inside the same terracotta-ruled clause — so Frank Bauer's line now appears on the **Directory row** (§5.1 #10) and the **Call Sheet row** (§5.4 #12) as well as the company card, which was rewritten to call the same helper (its rendered text is unchanged) | all three faces print `Write Rosa Delgado · rosa@twincitiesdrywall.com · (612) 555-0114`, the phone as `<a class="tel" href="tel:+16125550114">` |
| DR4-4 (word order on Dana's bring-forward row) | No change — this file is already the reference order (`paper, reach, consent` → `LAPSED, FIELD LINK, TEXTING`), which is SPEC §5.7 #4a's order. The named fix is to 390 | `pickRow()` unchanged |
| TR4-3 / CR4-6 (search-field label, kind-switch `aria-label`) | Left as built (`SEARCH THE ROLODEX`, `What kind of person you are adding`). No ruling names a direction, and every round-4 ruling that does name one makes this file the reference; changing it here would risk the two files crossing past each other. Flagged for the orchestrator | — |
| CR4-8 (forced-colors checkbox fallback) | No change — this file already carries the rule the finding says is missing at 390 | `.check-line input, .pick-check input { appearance: auto; -webkit-appearance: auto; }` inside `@media (forced-colors: active)` |

### Deviations recorded

- **SPEC §5.1 #11 still asks for `Not on file` as Ray Thao's paper word.** Not built, deliberately: R-A (standing) and the amended §5.1 #18/#19 say a firm whose only people are inspectors or lenders prints **no** paper word and that "Not on file" must never appear for it. Ray Thao's row therefore shows `ON PAPER` and `NOT ASKED` with an empty third cell, at both widths. §5.1 #11's third value reads as text the SPEC owner did not re-cut when R-A landed.
- **Residual cross-width differences observed but not touched** (none of them a round-4 finding, none of them a disagreement about a fact — reported so the orchestrator can rule):
  - 390's Directory seat panel also prints the consent note (`Carried forward to the Okonkwo residence, 12 October 2026.` for Dana, `Recorded by Priya Natarajan at the site kickoff, 13 October 2026. No YES yet.` for Joe Wozniak). This file prints no consent sentence on the Directory at all; Pete Rusk's opt-out note prints as a row clause here and inside the panel there, so it appears exactly once on each face.
  - As of this writing 390's Frank Bauer Directory and roster rows do not yet carry the routed line R-L requires; that is the 390 builder's item.
  - Chip-row order at the head of the Directory (this file prints the Lens pair above the six narrows, 390 prints them below) and the seat-disclosure label (`1 seat` / `0 seats` here, `Seats` at 390). Neither is a SPEC string.
  - The company card's Paper table is a table here and a label-over-value stack at 390 — required by §6.2, not a divergence.

### Parity check — strings compared against `people-room-390.html` (read-only)

Compared by rendering both files at their own width and diffing the visible text of all seven states line by line.

| What | 1440 | 390 |
|---|---|---|
| Head count | `29 people · 22 firms` | same |
| Dana Kowalski, Directory | `FIELD LINK` `TEXTING` `LAPSED` + seat line `Okonkwo residence · sub · electrical · On the job · 12 Oct 2026 to 13 Aug 2027` + `ON THE JOB` | same three words, same seat line, same stage word |
| Ray Thao, Directory | `ON PAPER` `NOT ASKED` (no paper word) + `Okonkwo residence · inspector · code enforcement · Awarded · 16 Nov 2026 to 13 Aug 2027` + `AWARDED` | identical |
| Pete Rusk, Directory | `ON PAPER` `OPTED OUT` `CURRENT` + `Opted out by text, 3 December 2025, on the Lindqvist kitchen.` | identical words and note |
| Joe Wozniak, Directory | `FIELD LINK` `INVITED` `CURRENT` | identical |
| Frank Bauer, Directory | `Do not contact directly. Write Rosa Delgado instead.` + `Write Rosa Delgado · rosa@twincitiesdrywall.com · (612) 555-0114` | clause identical; routed line owed at 390 (R-L) |
| Firm rows | `Great Northern Bank / Lender · 1 on the crew · 1 open job` and `City of Minneapolis, CPED Inspections / Authority · 1 on the crew · 1 open job`, both wordless | identical, both wordless |
| Company card, Northgate Electric | `No paper is held for this firm.` never printed; full four-row table, `Site access, payment and the draw are held until a current certificate is on file.`, `Record a document` + `Chase the renewal` | identical facts |
| Company card, Twin Cities Drywall | `PAPER` / `NOT ON FILE` / `RECORD A DOCUMENT` | same word and act after R-K |
| Company card, Great Northern Bank | `PAPER` / `No paper is held for this firm.` / no act | identical |
| Add sheet, default | `Nothing defaulted from the agreement.` / `Record the authority` | identical |
| Add sheet, a GC | `Defaulted from the agreement. Confirm it, or write a different one.` / `Confirm from the agreement` | ruled wording, owed at 390 (R-J) |
| Bring forward | `4 of 5 from the Lindqvist kitchen selected`; `Add four to the roster` then `Put back`, consequence beneath: `Adds four seats to the Okonkwo residence. Pete Rusk arrives opted out of texting. Northgate Electric's insurance lapsed 31 Mar 2026.`; What travels / What stays behind lists | text-identical (0 lines differ either way); footer order owed at 390 (R-I) |
| Site access | all seven regions, `Studio only. This card never reaches a client page.`, no code digit | 0 lines differ either way |
| Call sheet vitals | `12 on the job this week · 5 reachable by text · 4 with accounts · 2 on paper` | identical |

Whole-face text diff (lower-cased, whitespace-normalised, set difference both ways):
`#state-add` 0/0 lines, `#state-access` 0/0, `#state-pick` 1/0 (the Call Sheet head line, which 390 renders inside its own sheet wrapper), `#state-person` 2/2 and `#state-company` 5/28 (table-vs-stack only), `#state-roster` 7/4 (unfold prose, plus the routed line this file now carries).

### Gate

```
$ node tools/render.mjs specimens/people-room-1440.html --out shots \
    --name people-room-1440 --widths 1440 \
    --hashes state-directory,state-person,state-company,state-roster,state-pick,state-add,state-access --console
✓ people-room-1440-state-directory-1440.png
✓ people-room-1440-state-person-1440.png
✓ people-room-1440-state-company-1440.png
✓ people-room-1440-state-roster-1440.png
✓ people-room-1440-state-pick-1440.png
✓ people-room-1440-state-add-1440.png
✓ people-room-1440-state-access-1440.png
Console log: people-room-1440-console.json (7 captures)

errors 0   warnings 0   horizontalOverflow false   captures 7
```

SPEC §10, item by item:

```
1  tail -1                                              → <!-- specimen-complete -->
2  grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled' → 0
   opacity 0 · eval( 0 · style.display 0
3  §5 acceptance walked on the rendered face, all seven states (one recorded deviation, §5.1 #11 above)
4  every name, firm and phone on the face is in §3's JSON
5  seven plates, 0 errors, 0 warnings, no horizontal overflow (1440/1440)
6  token block: diff vs _tokens-reference.css → the one appended `}` only
   class fragment: diff vs _people-style-fragment.html → byte-identical
   one <h1> · one role="status" · 0 hex literals after line 90
   external hosts: fonts.googleapis.com, fonts.gstatic.com only
```

File size: 97,259 bytes (was 96,079).
