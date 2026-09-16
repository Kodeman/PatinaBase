# Construction re-read, round 3

Two seats — CS1 (GC/PM) and CS4 (electrical sub owner) — re-walking `specimens/people-room-1440.html`
and `specimens/people-room-390.html` after `review/fix-log-r2.md`, against `panel/ux/ux-5-leah-walk.md`'s
six tasks and `synthesis/direction.md` §6. Every claim is grep- or read-verified against the two current
HTML files (mtimes 11 Sep 08:57, i.e. after both builders' round-2 fixes) or the twelve PNGs in `shots/`;
line numbers cite `people-room-1440.html` unless marked 390.

Gate facts, re-verified independently:

```
grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled'   → 0, 0 (both files)
grep -c U+2019 (curly apostrophe)                              → 0, 0
grep -n 'Remove'                                                → no hits, either file
tail -1 (both files)                                            → <!-- specimen-complete -->
grep -c invoice / grep -c rolodex                               → 0, 0 (both, both terms)
shots/people-room-console.json                                  → 12 captures, 0 errors, 0 warnings,
                                                                    horizontalOverflow:false on all 12
wc -c                                                            → 88150 (1440), 90236 (390)
```

---

## 1. Prior findings (fix-log-r2.md): fixed or still open

| ID | R2 verdict | R3 status | Evidence |
|---|---|---|---|
| CR2-1 (vitals literal disagreed 1440 vs 390) | fixed 1440, not fixed 390 ("no edit made") | **now fixed, both widths** | `people-room-1440.html:1071` and `people-room-390.html:1038` both compute the tally live off `onNow` (`.filter(consent/reach checks)`); `grep -n vitalsRest` returns 0 hits in either file — the hardcoded literal is gone |
| CR2-3 (Claire Bissett / Stonehaven unreachable) | fixed | **fixed in 1440 only; still broken in 390 — see CR3-9** | 1440 `DIR_PEOPLE` (`:628`) and `DIR_FIRMS` (`:629`) both carry the row/firm; 390 `DIR_PEOPLE` (`:658`) carries `'F-20'` but `DIR_FIRMS` (`:660`) is `['marrow','northgate','tcdrywall']` — Stonehaven absent, and no button anywhere in `people-room-390.html` carries `data-open-company="stonehaven"` |
| CR2-5 (no act sets/confirms authority) | fixed | **fixed, both widths — but the 390 implementation introduces a new defect, see CR3-8** | Person card "Edit the authority" band + Add-sheet "Authority" region exist in both files (`1440:836-841,1197-1199`; `390:1148-1153`, person-card band verified on the person-1440/390 plates) |
| CR2-6 (inert kind picker) | fixed | **confirmed fixed, both widths** | 1440: `KIND_SOURCE`/`sheetFor()`/`.js-kind` (`:1118-1130`, `:1401`); 390: `ADD_EXAMPLE`/`addSheetFor()`/`data-kind-pick` wired at `:1338-1343` (`group.getAttribute('data-narrow') === 'add-kind'` → `addKind = picked; paint('state-add')`) — both re-render the whole Add sheet on pick |
| CR2-4 / CR-13 (no invoice/CO screen for Task 2's second acceptance clause) | not fixed, returned | **confirmed still open** | `grep -c invoice` → 0, 0 both files; no change since r2 |
| CR-6 / CR2-2 (no rolodex/travel-list bring-forward pane for Task 5) | not fixed, returned | **confirmed still open** | `grep -c rolodex` → 0, 0 both files; no change since r2 |
| CR2-11 (firm-level "Not on file" not painted as blocking) | not fixed, flagged for a ruling | **confirmed still open, both widths** | Document-ROW level is correctly overridden to `word--blocked` when it blocks (1440 `docCells()` `stops` at `:889`; 390 `docWord()` at `:606-611`, both added in r2 for CR-14). Neither file extends this to the firm-level rollup word: 1440's `wordEl(c.paper)` at `:678` and 390's `word(c.paper)` at `:710`/`:936` still resolve `'Not on file'` through the plain `TONE`/`WORD_PIGMENT` map → `'dormant'`, with no equivalent "blocks" check. Great Northern Bank and CPED Inspections (`gnbank`, `cped`, both `"paper": "Not on file"`, both carrying a `documents` array with `"blocks"`) print in the same faint ink as an unremarkable "nothing on file yet" |
| CR2-7 ("licence" British spelling) | not addressed | **confirmed still open, both widths** | `grep -o "licen[sc]e"` → 6 hits 1440, 4 hits 390, all "licence", 0 "license" (`1440:352,361,746,747,919,923`) |
| CR2-8 (duplicate-identity nudge names no cards, dead "Compare & merge" button) | not addressed | **confirmed still open, both widths** | `people-room-1440.html:706-708`, `people-room-390.html:734-735`: "These two cards share a phone. Compare them?" / `<button class="act act--secondary">Compare &amp; merge</button>` — no card names, no `data-*` target, no click handler for this button in either file's event-delegation block |
| CR2-9 (no schedule-authority example) | not addressed | **confirmed still open, both widths** | Full dump of every `"authority": "..."` string in both files: money, CO, site, key, draw, inspection, fee — no mention of schedule/slip/date in any of the 14 distinct authority strings |
| CR2-10 ("Holds a key" ambiguous: homeowner's own house vs. Ngozi's site role) | not addressed | **confirmed still open, both widths** | `ACCESS_WORDS`/engagement rows for F-04, F-05, F-06 all resolve to "Holds a key."; the dedicated site access card still names only Ngozi Eze as key holder, with no cross-reference distinguishing the homeowners' fact from the site-access fact |

---

## 2. CS1 and CS4's top 5 asks — tracked where, stated how (re-verified this round)

| # | Ask (CS1 / CS4 wording) | Tracked on the face? | State (hash) | Builder/sub phrasing? |
|---|---|---|---|---|
| 1 | Compliance document with expiry on the firm: COI, W-9, license, per-draw waiver (CS1-1, CS4-1) | Yes, on the document-row level. Company card "Paper" table: Type/Number/Issuer/Expires/State/Held by/Blocks, e.g. "COI, general liability · GL-9021-18 · Lakes Casualty · 31 Mar 2026 · LAPSED · The studio · Site access, payment, draw." **But the firm-level rollup word for a company with an unfiled document (Great Northern Bank, CPED Inspections) still reads passive/dormant, not blocking — CR2-11, still open.** Per-draw waiver is a link-out only ("Draw 1 waiver ledger, in the money book"), consistent with P2 phasing | `#state-company` (`renderCompany()`, both widths) | Mostly yes; "licence" spelling still reads wrong to a Minneapolis audience (CR2-7) |
| 2 | Authority set: money limit, CO, schedule, site access, key (CS1-2, CS4-3) | Partially, now with a real act. Person card "Edit the authority" inline band and Add-sheet "Authority" region both let a studio member confirm or write an authority sentence. **Schedule is still absent from the vocabulary entirely** (CR2-9) | `#state-person`, `#state-add`, `#state-roster` | Yes for money/CO/site/key ("Signs money to $2,500.", "Prices change orders.", "Controls the gate."); schedule untested |
| 3 | Contact rule: primary, never, route-through (CS1-3, CS4-2/5) | Yes. Frank Bauer: "Do not contact directly. Write Rosa Delgado instead." on person card, Directory row, Roster row, company card crew line. Ray Thao: "Never text. Office phone or the 311 portal only." | `#state-person`, `#state-directory`, `#state-roster`, `#state-company` | Yes — exact phrasing a builder or sub would use |
| 4 | Phone-scoped consent shown truthfully, carried forward (CS1-4, CS4-6) | Yes. Pete Rusk shows "OPTED OUT" (not "Not asked") plus "Opted out by text, 3 December 2025, on the Lindqvist kitchen." Dana Kowalski: consent carried forward with the originating job named | `#state-directory`, `#state-person`, `#state-roster` | Yes |
| 5 | Relationship stage + `warranty_until` + link lifetime tied to the job (CS1-5/8/23, CS4-15/17) | Yes. Company card: "warranty through 21 Nov 2026." Person card access grant: "Ends with the job, 13 August 2027. Renews when they use it." Roster stage pills: Awarded / On the job / Bidding / Off the job | `#state-company`, `#state-person`, `#state-roster` | Yes, matches PR-d's ruled language |

Also re-confirmed unchanged: role-at-firm/paperwork contact (Northgate's crew line, `#state-company`), `contracted_through` (Dana's seat, `#state-person`), typed phone kind (Mobile · preferred · verified, `#state-person`), and the "Inspectors" narrow chip now present on the roster (`#state-roster`, both widths) answering CS1-5/CS4-11's kind-vocabulary ask.

---

## 3. Leah's six tasks — acceptance, state, act count (re-walked on the current files)

| Task | Acceptance | Met? | State | Acts counted |
|---|---|---|---|---|
| 1. Add Dana text-only | A rule every add/send/edit honors, ≤2 clicks | **Met** | `#state-add` (Contact rule field, prefilled) | 1 field filled once; rule then reads on 4 downstream faces with no re-entry |
| 2. Give Adaeze the app; note Chidi signs $2,500 | Login + authority as two facts, visible on the invoice/CO screen that needs it | **Not met — blocking**, same root cause as r2 (CR-13/CR2-4), plus a new correctness defect specific to 390 (CR3-8) | `#state-add` (kind "a household member"), `#state-person` (Seats region) | Authority: 1 click ("Confirm from the agreement" on 1440's household-member sheet, since Chidi's fixture engagement carries "Signs money to $2,500."). Invoice/CO surface: 0 faces exist to show it on, either width |
| 3. Site access, one screen | Key holder, gate control, hours, who-was-told, from one screen | **Met** | `#state-access` | 1 click from the nav bar |
| 4. Do-not-contact Frank; route to Rosa | Every attempted contact + future pick shows "write Rosa instead" | **Met** | `#state-person`, `#state-directory`, `#state-roster`, `#state-company` | 0 additional clicks once the row is open, on all 4 surfaces, both widths |
| 5. Bring 3 Lindqvist subs + Stonehaven's rep onto Okonkwo | Each arrives with consent, doc status, one history line; never old pricing | **Not met — blocking, and worse on 390** | none available | **1440**: 0 acts reach a bring-forward/travel-list pane (still CR-6); Claire Bissett's card is reachable in 2 clicks (Directory → her row) and Stonehaven's firm card in 2 clicks (Directory → Firms → Stonehaven), but nothing on either card is a "bring forward" act. **390**: same 0 for the travel-list pane, **and 0 clicks reach Stonehaven's company card at all** — see CR3-9 |
| 6. Everyone by role, this week | Narrows to on-site-this-week, excludes unopened/closed windows | **Met** | `#state-roster` | 1 click to open (already banded this-week/later/bidding/done) + 1 click on a role pill (now 11 role/kind chips including "Inspectors") |

---

## 4. Facts on a face a GC or sub would read as wrong, naive, or unusable

| Finding | Severity | Confidence | Evidence |
|---|---|---|---|
| **CR3-1** (carried, = CR-6/CR2-2). No rolodex picker or bring-forward travel-list pane exists on either width; Leah's Task 5 is unbuildable at any click count | Blocking | High | `grep -c rolodex` → 0, 0 both files. Needs Kody's ruling per fix-log-r2's own note — a seventh state is foreclosed by SPEC §4 |
| **CR3-2** (carried, = CR-13/CR2-4). No invoice or change-order screen exists; Task 2's own acceptance clause ("visible on the invoice or CO that needs it") cannot be satisfied | Blocking | High | `grep -c invoice` → 0, 0 both files. Needs Kody's ruling; SPEC §4 fixes the state list at six |
| **CR3-3** (carried, = CR2-11). A firm whose paper is "Not on file" (Great Northern Bank, CPED Inspections — both real lender/inspector examples in the fixture, both carrying documents with a non-empty `blocks` array) prints its rollup word in the same dormant/faint style as an unremarkable firm with nothing to say, on the Directory firm row, the roster row's held-clause derivation, and the person row's company suffix. A GC skimming the Directory cannot tell "nothing filed and nothing at stake" from "nothing filed and the draw is held" without opening the card | Major | High | `grep -n "'Not on file': 'dormant'"` (`1440:576`; `390:596`); `wordEl(c.paper)`/`word(c.paper)` calls at `1440:678`; `390:710,936` carry no override, unlike the document-row-level `stops`/`docWord()` fix that already exists for the same word |
| **CR3-4** (carried, = CR2-7). "MN BC contractor licence," "MN electrical contractor licence," "holds the trade licence" — British spelling, on a Minneapolis document a Minnesota GC or electrician would read as a typo (MN DLI issues "licenses") | Minor | High | `grep -o "licen[sc]e"`: 6/4 hits, all "licence," 0 "license," both files |
| **CR3-5** (carried, = CR2-8). "These two cards share a phone. Compare them?" names no cards; its "Compare & merge" button has no target or handler in either file's click-delegation code | Minor | Medium | `people-room-1440.html:706-708`; `people-room-390.html:734-735` |
| **CR3-6** (carried, = CR2-9). The authority vocabulary explicitly claimed by CS1-2/CS4-3 includes "schedule" (who may propose/accept a slip) alongside money, CO, site, and key — no engagement in the fixture demonstrates a schedule-authority sentence, so the ask is untested on the face | Minor | Medium | Full dump of the 14 distinct `"authority": "..."` strings in both files — money, CO, site, key, draw, inspection, fee; none mention schedule/date/slip |
| **CR3-7** (carried, = CR2-10). Three homeowners/receivers ("Holds a key.") read identically to the site access card's one designated key holder (Ngozi Eze); a GC skimming person cards has no cue that "holds a key to their own house" and "is the studio's site contact for keys" are different facts | Minor | Low | `ACCESS_WORDS`/engagement rows for F-04, F-05, F-06 (all `"access": "key"`) vs. the site access card naming only Ngozi Eze |
| **CR3-8 — new.** On `people-room-390.html`, the Add sheet's "Authority" region always shows the copy "The agreement set this. Confirm it, or write a different one." and the act "Confirm from the agreement," regardless of whether an agreement actually set anything. In the SPEC-tested default state (kind "a sub," Joe Wozniak — a brand-new hire with no engagement and no agreement anywhere in the fixture), the field is pre-filled "No authority on this job." and the sheet still asserts "The agreement set this," inviting the studio member to "confirm" a fact that was never set by any agreement. `people-room-1440.html`'s equivalent, for the identical Joe Wozniak default state, correctly shows an empty field, "Nothing defaulted from the agreement.," and the act "Record the authority" — no false provenance claim. Verified against the current `shots/people-room-state-add-390.png` plate (text: "AUTHORITY ON THIS JOB" / blank-looking box reading "No authority on this job." / "The agreement set this. Confirm it, or write a different one." / "CONFIRM FROM THE AGREEMENT") vs. `shots/people-room-state-add-1440.png` (empty box / "Nothing defaulted from the agreement." / "RECORD THE AUTHORITY"). A GC or PM reading the 390 face would believe the studio's agreement with a framer they have not even hired yet already fixed his authority at zero — a fabricated fact, and precisely the "wrong-signer" failure mode CS1's finding #2 and CS4's story #1 both warn against (an authority claim with no real source) | Blocking | High | `people-room-390.html:1148-1151` (`addSheetFor()`'s hardcoded copy, unconditional on `sheet.authority`'s provenance) vs. `people-room-1440.html:1195-1199` (`(a.authority ? 'Defaulted...' : 'Nothing defaulted...')`, `(a.authority ? 'Confirm...' : 'Record...')`); `shots/people-room-state-add-390.png`, `shots/people-room-state-add-1440.png` |
| **CR3-9 — new.** `people-room-390.html`'s Directory `DIR_FIRMS` array (`:660`) is `['marrow', 'northgate', 'tcdrywall']` — three firms — while `people-room-1440.html`'s `DIR_FIRMS` (`:629`) is four: `['marrow', 'northgate', 'tcdrywall', 'stonehaven']`. Stonehaven Tile Gallery's company card is therefore unreachable from the 390 Directory: no "Firms" row exists for it, and no other element in the 390 file carries `data-open-company="stonehaven"` (`grep -n stonehaven people-room-390.html` returns only the raw fixture rows at `:367` and `:399`, and one unrelated `"closed"` note at `:493` — never a button or link). Claire Bissett's person row (F-20) is present and openable on both widths (round-2's CR2-3 fix), but on 390 a studio member who opens her card and reads "Stonehaven Tile Gallery" has no click path to the firm's own paper table, crew list, or job history — the exact vendor-rep dead end the fixture was built to demonstrate for Leah's Task 5, now present on one width and not the other. Confirmed visually: `shots/people-room-state-directory-390.png` lists three firm rows (Marrow & Sons, Northgate Electric, Twin Cities Drywall & Plaster) where `shots/people-room-state-directory-1440.png` lists four, the fourth being Stonehaven | Blocking | High | `people-room-390.html:660`; `grep -n stonehaven people-room-390.html` (2 data hits, 0 anchor/button hits); `shots/people-room-state-directory-390.png` vs. `shots/people-room-state-directory-1440.png` |
| **CR3-10 — new.** The Add sheet's per-kind example person differs by width for the same named kind: `'a maker'` resolves to Claire Bissett/Stonehaven Tile Gallery on 1440 (`KIND_SOURCE`, `:1119`) but to Owen Ashby/Ashgrove Millwork on 390 (`ADD_EXAMPLE`, `:1092`); `'someone else'` resolves to Ray Thao/CPED Inspections on 1440 but to Carol Nystrom/Great Northern Bank on 390. Both builders independently invented a kind→fixture-person mapping without a shared source, so the same labelled state shows different people depending on viewport — not individually wrong (both are legitimate fixture rows with real rules and authority), but a contradiction between the two decks of the same screen that a reviewer switching widths would trip over | Minor | Medium | `people-room-1440.html:1118-1121` vs. `people-room-390.html:1088-1096` |
| **CR3-11 — new.** The Add sheet's "Authority" region sits in a different position in the field order between widths: after Contact rule, just before Consent, on 1440 (`:1183-1191`); immediately after Trade, before Channels and Contact rule, on 390 (`:1148-1153`). Neither position is specified by SPEC.md §5.5 (which predates this region), so this is not a SPEC violation, but the same screen's regions appear in a different order depending on viewport rather than only reflowing — a builder comparing the two decks side by side would read it as two different screens, not one responsive one | Minor | Medium | `people-room-1440.html:1178-1191`; `people-room-390.html:1140-1153` |
| **CR3-12 — new.** On the person card, the "Edit the authority" act sits after the authority-adjacent site facts on 1440 (date range → No authority/authority sentence → Escorted on site → Contracted through → Hidden from the client → Edit the authority) but immediately after the authority sentence, before the site facts, on 390 (date range → authority sentence → Edit the authority → Escorted on site → Contracted through → Hidden from the client). Same content, different act placement between widths | Minor | Low | `shots/people-room-state-person-1440.png` vs. `shots/people-room-state-person-390.png` (Dana Kowalski's "Seats on projects" region) |

---

## 5. Trade- or homeowner-facing writing surfaces

**None found, on either width — re-confirmed against the current files, including every field added this round.**

```
grep -n "<input\|<textarea\|contenteditable" people-room-1440.html
  → f-authority-edit (person card, studio-only inline band)
  → f-* Add-sheet fields incl. f-authority (studio-only)
  → f-consent checkboxes ×2 branches (studio-only Add sheet)
  → f-told (Site access "Log who was told," studio-only)
grep -n "<input\|<textarea\|contenteditable" people-room-390.html
  → same shape: Add-sheet fields (incl. the new f-authority), f-consent, f-told
```

Every one of these sits inside a studio-only screen (Add sheet, person card's authority-edit band, site access card's notice log). The site access card states this explicitly on both widths: "Studio only. This card never reaches a client page." No upload door, no field-link write act, and no rolodex-side trade input exist anywhere (`grep -n upload` → 0 hits both files), consistent with PR-a's ruling to park the trade-side compliance-upload door. The new Authority-editing surfaces added this round (person card's inline band, Add sheet's Authority region) are likewise studio-only — no trade or homeowner path reaches either.

---

## Summary

Round 2's fixes mostly hold: CR2-1's cross-width vitals contradiction is now genuinely resolved, and CR2-6's kind picker is interactive on both widths with independent, working implementations. But those two independent implementations are exactly where round 3 found new problems — the two builders diverged on facts (CR3-10, CR3-11, CR3-12, all minor) and, in one case, on correctness (CR3-8, blocking: 390's Authority region asserts a false "the agreement set this" provenance for a person with no agreement) and completeness (CR3-9, blocking: 390 dropped Stonehaven from `DIR_FIRMS`, re-breaking half of round 2's own CR2-3 fix on one width only). Every carried-forward item that was returned to Kody for a ruling (CR3-1/CR-6, CR3-2/CR-13, CR3-3/CR2-11) remains exactly as returned, unre-litigated. No writing surface reaches a trade or homeowner on either width, including the new authority-editing surfaces.

Findings this round: 12 total — 4 blocking (CR3-1, CR3-2, CR3-8, CR3-9), 1 major (CR3-3), 7 minor (CR3-4 through CR3-7, CR3-10 through CR3-12).
