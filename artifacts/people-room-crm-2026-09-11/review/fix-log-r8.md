---

## Round 8 — R-AA and R-AB (orchestrator rulings, 2026-09-11)

Scope: SPEC §7 gains rule 13; R-AA and R-AB appended to `rulings.md` §3; C37 and C38 appended to `synthesis/direction.md` §3.9; the Directory seat line becomes a live open-person door in both specimens.

### What changed

| File | Change |
|---|---|
| `specimens/SPEC.md` | §7 gains rule 13 per R-AB: one row naming the twelve write-acts verbatim (Edit the rule, Revoke, Send a text, Record a document, Chase the renewal, Text, Copy field link, Show to client, Close this seat, Add four to the roster, Add to the roster, Save this note), stating they are deliberately inert, stay enabled and focusable beside their consequence sentences, and carry no `aria-disabled` and no caveat on the face |
| `rulings.md` §3 | R-AA and R-AB appended after R-Z |
| `synthesis/direction.md` §3.9 | C37 (Directory seat lines that do not open → R-AA) and C38 (enabled acts that write nothing → R-AB) appended after C36 |
| `specimens/people-room-1440.html` | One line, `dirPersonRow()`: `button.seat-row` gains `data-person="<p.id>"`, so the existing `[data-person]` click delegation opens that person's card. Markup, classes and text otherwise unchanged |
| `specimens/people-room-390.html` | `dirPersonRow()`: `<li class="seat" tabindex="0">…</li>` becomes `<li><button type="button" class="seat" data-open-person="<pid>">…</button></li>`, served by the existing `[data-open-person]` delegation. `.seat` gains the button chrome reset `.linkline` already uses — `display: block; width: 100%; margin: 0; border: 0; background: transparent; text-align: left; cursor: pointer; color: var(--ink); font-family: var(--font-body); font-size: 16px; line-height: 1.55` — keeping its `padding: 12px 0` and `border-top: 1px solid var(--hairline)`. `.seat:focus-visible` and the `forced-colors` `.seat:focus-visible` rule keep applying, now to the button. No `tabindex` attribute remains in either file |

The `<ul class="seats">` keeps `<li>` children in both files; the button is the `<li>`'s only child, matching the 1440 file's existing `<li><button class="seat-row">` construction.

### Seat-line activation — Playwright, `#state-directory`, both files

Method: fresh navigation before every activation; every person row's seats disclosure opened first (both files: 12 disclosures, 5 open by default, 7 clicked open, 11 seat buttons — the twelfth Directory person, Claire Bissett F-20, carries no engagement and so no seat line). Each seat button activated by mouse click, then, in a second pass, by focus + <kbd>Enter</kbd>. After each activation the visible face, the hash, the person card's `h2.card-name` and the `role="status"` text were read; then the state bar's "Directory" button was clicked and the visible face re-read.

| File | Seat (row → seat line's person) | Click → card opened | Enter → card opened | `role="status"` | Back via state bar |
|---|---|---|---|---|---|
| 1440 | F-04 Adaeze Okonkwo | Adaeze Okonkwo | Adaeze Okonkwo | Person card | face-directory |
| 1440 | F-05 Chidi Okonkwo | Chidi Okonkwo | Chidi Okonkwo | Person card | face-directory |
| 1440 | F-07 Tom Marrow | Tom Marrow | Tom Marrow | Person card | face-directory |
| 1440 | F-08 Erin Sato | Erin Sato | Erin Sato | Person card | face-directory |
| 1440 | F-09 Luis Ochoa | Luis Ochoa | Luis Ochoa | Person card | face-directory |
| 1440 | F-11 Dana Kowalski | Dana Kowalski | Dana Kowalski | Person card | face-directory |
| 1440 | F-18 Joe Wozniak | Joe Wozniak | Joe Wozniak | Person card | face-directory |
| 1440 | F-12 Pete Rusk | Pete Rusk | Pete Rusk | Person card | face-directory |
| 1440 | F-14 Rosa Delgado | Rosa Delgado | Rosa Delgado | Person card | face-directory |
| 1440 | F-15 Frank Bauer | Frank Bauer | Frank Bauer | Person card | face-directory |
| 1440 | F-27 Ray Thao | Ray Thao | Ray Thao | Person card | face-directory |
| 390 | F-04 Adaeze Okonkwo | Adaeze Okonkwo | Adaeze Okonkwo | Person card | face-directory |
| 390 | F-05 Chidi Okonkwo | Chidi Okonkwo | Chidi Okonkwo | Person card | face-directory |
| 390 | F-07 Tom Marrow | Tom Marrow | Tom Marrow | Person card | face-directory |
| 390 | F-08 Erin Sato | Erin Sato | Erin Sato | Person card | face-directory |
| 390 | F-09 Luis Ochoa | Luis Ochoa | Luis Ochoa | Person card | face-directory |
| 390 | F-11 Dana Kowalski | Dana Kowalski | Dana Kowalski | Person card | face-directory |
| 390 | F-18 Joe Wozniak | Joe Wozniak | Joe Wozniak | Person card | face-directory |
| 390 | F-12 Pete Rusk | Pete Rusk | Pete Rusk | Person card | face-directory |
| 390 | F-14 Rosa Delgado | Rosa Delgado | Rosa Delgado | Person card | face-directory |
| 390 | F-15 Frank Bauer | Frank Bauer | Frank Bauer | Person card | face-directory |
| 390 | F-27 Ray Thao | Ray Thao | Ray Thao | Person card | face-directory |

44 of 44 activations passed (11 seats × 2 modes × 2 files). Every one landed on `#state-person` with `face-person` the only visible face, the card's `h2.card-name` equal to the originating row's `.row-name`, and `role="status"` reading "Person card"; every return click on the state bar's "Directory" restored `face-directory` with `#state-directory` and status "Directory". Zero page errors and zero console errors or warnings across all 44 runs.

### Seat button shape, both files

| | 1440 | 390 |
|---|---|---|
| Seat controls in `#state-directory` | 11 | 11 |
| `data-person` / `data-open-person` ids | F-04, F-05, F-07, F-08, F-09, F-11, F-18, F-12, F-14, F-15, F-27 | identical, same order |
| `<ul class="seats">` child tags | `LI` only | `LI` only |
| Interactive descendants inside the seat button | 0 | 0 |
| `[tabindex]` attributes in the face | 0 | 0 |
| Computed box (first seat) | display flex, 674×46, padding 10px 0, border-top 1px solid, background transparent, text-align left, cursor pointer | display block, 308×106, padding 12px 0, border-top 1px solid, background transparent, text-align left, cursor pointer |
| `.seat-line` type | — (no `.seat-line` at 1440; the seat text sits directly in the button) | 14px/21px, unchanged |
| Horizontal overflow | none | none |

The 390 button reproduces the former `li.seat` box exactly: same 12px 0 padding, same 1px hairline top rule, transparent ground, full column width, left-aligned.

### R-AB acts — enabled, focusable, not marked disabled

All twelve act labels, counted over the painted faces of both files:

| Act | 1440 count | 390 count | `aria-disabled` | `disabled` | tabbable |
|---|---|---|---|---|---|
| Edit the rule | 1 | 1 | 0 | 0 | all |
| Revoke | 1 | 1 | 0 | 0 | all |
| Send a text | 1 | 1 | 0 | 0 | all |
| Record a document | 1 | 1 | 0 | 0 | all |
| Chase the renewal | 1 | 1 | 0 | 0 | all |
| Text | 6 | 6 | 0 | 0 | all |
| Copy field link | 6 | 6 | 0 | 0 | all |
| Show to client | 24 | 24 | 0 | 0 | all |
| Close this seat | 24 | 24 | 0 | 0 | all |
| Add four to the roster | 1 | 1 | 0 | 0 | all |
| Add to the roster | 1 | 1 | 0 | 0 | all |
| Save this note | 1 | 1 | 0 | 0 | all |

Counts agree at both widths. Zero `disabled` attributes anywhere in either document. This is the state SPEC §7 rule 13 now describes; R8-2 is settled, not a finding.

### Render, both widths

Both files re-rendered after the edits with `tools/render.mjs`, sandbox disabled, `--hashes state-directory,state-person,state-company,state-roster,state-pick,state-add,state-access`.

```
people-room-1440-console.json: 9 captures, 0 with errors, 0 with warnings, horizontalOverflow true×0 / false×9
people-room-390-console.json:  9 captures, 0 with errors, 0 with warnings, horizontalOverflow true×0 / false×9
```

7 light plates per file plus 2 dark plates = 9 captures each; all fourteen §9 light plate names present in `shots/`.

### SPEC §10

| # | Check | 1440 | 390 |
|---|---|---|---|
| 1 | Last line exactly `<!-- specimen-complete -->` | PASS (verified byte-for-byte, `...e t e space - - > \n`) | PASS (same) |
| 2 | `grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled'` = 0 | 0 PASS | 0 PASS |
| 3 | §5 acceptance strings on the face | 162 quoted strings pulled from §5; 147 found in the painted faces plus field values. The 15 unmatched are the same explainable classes as round 7 — attribute values (`group`, `status`, `true`, `tel:+16125550111`), the room head and state bar which sit outside the `face-*` sections (`The People Room`, `29 people · 22 firms`, `Narrow the book`, `Bring forward`), a template placeholder (`<Source> consent, <d Mon yyyy>, on the <project>.`), a forbidden-word reference (`Remove`), branch-conditional copy not on the open card (`No paper is held for this firm.`, and the add sheet's other authority branch `Defaulted from the agreement. Confirm it, or write a different one.` / `Confirm from the agreement`), and the two strings absent by ruling R-Y (`Compare & merge`, `Compare them?`) | same 147 found, same 15 unmatched — the two files' miss sets are now byte-identical (round 7's extra 390-only miss, `Text only. No working email.`, resolves once field `value` attributes are read as well as text) |
| 4 | Every name, firm and phone on the face is in §3's JSON | PASS — 24 distinct phone strings on the face, all inside the fixture's 28; no name-shaped token outside the fixture (the apparent outliers are `textContent` concatenations across adjacent elements, e.g. `Tom MarrowNENorthgate`, and all-caps field labels) | PASS — same 24 phones, same result |
| 5 | Render clean, fourteen names, zero errors, zero warnings, no overflow | PASS | PASS |
| 6 | §2.1 token block and §2.2 class fragment byte for byte | PASS (both blocks found verbatim) | PASS (both blocks found verbatim) |

### File facts

| File | Bytes | Last line |
|---|---|---|
| `specimens/people-room-1440.html` | 97,592 | `<!-- specimen-complete -->` |
| `specimens/people-room-390.html` | 104,105 | `<!-- specimen-complete -->` |

### Left standing, deliberately

- **1440 seat line prints a doubled separator when the trade is empty.** `seatLine()` at 1440 concatenates unconditionally, so F-04 and F-05 (client and household member, no trade) read `Okonkwo residence · client · · On the job · 1 Aug 2026 to 30 Sep 2027`. The 390 file's `seatLine()` builds the same line with `.filter(Boolean).join(' · ')` and prints `Okonkwo residence · client · On the job · …`. Pre-existing on both faces before this round; now it also sits inside the seat button's accessible name, so it is the one place the two widths' seat names still disagree (9 of 11 are byte-identical). Out of R-AA's scope — R-AA governs the element and its hook, not the seat line's composition — so it is flagged, not edited.
- Both files' seat text ends with the stage word and then repeats it in the `.word` element, so the accessible name ends `…to 30 Sep 2027On the job`. This is identical at both widths and predates the round; not touched.
- `people-room-390.html` still carries `.dupe .act { margin-top: 12px; }`, dead since R-Y removed the band's act. Carried forward from round 7, still unedited.
