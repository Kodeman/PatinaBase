# Construction re-read, round 5

CS1 (GC/PM) and CS4 (electrical sub owner), plus Leah's six tasks under the amended §6
acceptance (`synthesis/direction.md` §6), re-walking `specimens/people-room-1440.html` and
`specimens/people-room-390.html` after `review/fix-log-r4.md` and orchestrator rulings
R-F..R-L (R-A..R-E standing, per `rulings.md` §3). Every claim below is grep-, source- or
render-verified against the two current HTML files, `specimens/SPEC.md`, or the fourteen
PNGs in `shots/` (the freshest `people-room-1440-state-*-1440.png` /
`people-room-390-state-*-390.png` set, timestamped 09:58/10:00). Text-content claims are
additionally verified by rendering both files headless (Playwright, already vendored at
`/Users/kody/Code/patina-merged/node_modules/.pnpm/playwright@1.58.2/…`, the same engine
`tools/render.mjs` uses) and diffing `innerText` per state, and by live-clicking the
Bring-forward checkboxes and Put back at both widths. No build, no pnpm install/dev, no git,
no prod — nothing was written outside `artifacts/people-room-crm-2026-09-11/`.

Gate facts, re-verified independently:

```
wc -c                                                    → 97259 (1440), 99788 (390)
tail -c 60 (both files)                                  → ...</html>\n<!-- specimen-complete -->
grep -c 'box-shadow\|text-overflow\| disabled'            → 0, 0 (both)
grep -n ' disabled'                                       → 0 hits, both files
grep -n 'Remove'                                          → 0 hits, both files
shots/people-room-{1440,390}-console.json (freshest)      → 14 captures, 0 errors, 0 warnings,
                                                              horizontalOverflow:false on all 14
Live click test (Playwright, both widths)                 → pick checkbox: 4/5 → 5/5 selected;
                                                              Put back: → 0/5 — identical at both widths
SPEC.md:537 §5.4 #3 vitals literal                        → "12 on the job this week · 5 reachable
                                                              by text · 4 with accounts · 2 on paper"
                                                              (now matches both faces — R-F applied)
```

---

## 1. Prior findings (fix-log-r4.md / round 4, and rulings R-F..R-L): fixed or open

| ID | R4 status | R5 status | Evidence |
|---|---|---|---|
| R-F — SPEC §5.4 #3 vitals literal | Ruled, no build change needed | **Fixed** | `SPEC.md:537` now reads the true tally; both faces already printed it. Closes CR4-5 |
| R-G — stage off the person row, three word columns | Ruled; fix-log-r4 claims applied to 1440 only, 390 "read-only" | **Fixed at 1440. Not realized at 390 — new finding CR5-1 (Blocking)** | See §4 below |
| R-H — lender/inspector firm rows in `DIR_FIRMS` | Ruled | **Fixed, both widths** | `DIR_FIRMS` byte-identical in both files: `['marrow','northgate','tcdrywall','stonehaven','gnbank','cped']`; rendered text confirms both firms list under Everyone/Firms, wordless, both widths |
| R-I — bring-forward footer order | Ruled; fix-log-r4 says already correct at 1440 | **Fixed, both widths** | `renderPick()` in both files: act row (`Add four to the roster` / `Put back`) precedes the consequence `<p>`; live-clicked, both widths recompute identically |
| R-J — add-sheet authority wording | Ruled | **Fixed, both widths** | 1440 `:1355` and 390 `:1199` both read `'Defaulted from the agreement. Confirm it, or write a different one.'` for the non-empty branch, `'Nothing defaulted from the agreement.'` for the empty branch — byte-identical strings now |
| R-K — Paper region on every company card | Ruled; fix-log-r4 applied to 1440 | **Fixed, both widths** | 390 `:968-975`: doc-less firms now render `word('Not on file')` + act `Record a document`; lender/inspector branch still one line, no act |
| R-L — routed contact line (Frank Bauer → Rosa Delgado) | Ruled; fix-log-r4 applied to 1440 (3 surfaces), explicitly flags 390 as "owed" | **Fixed at 1440 (Directory, Call Sheet, company card). Still owed at 390 on 2 of 3 surfaces — new finding CR5-2 (Blocking)** | See §4 below |
| CR4-1 (licence spelling) | Open by design (fixture/SPEC-owner text) | **Still open, unchanged, correctly not actioned** | `grep -co "licen[sc]e"`: 6 (1440), 4 (390); 0 "license" either file |
| CR4-2 (dead "Compare & merge") | Open, needs a both-widths instruction | **Still open, unchanged** | `people-room-1440.html:752-753`; `people-room-390.html:541,765` — no card names, no target, no handler in either file |
| CR4-3 (no schedule-authority example) | Open, needs a fixture fact | **Still open, unchanged** | All 14 distinct `"authority": "…"` strings dumped from both files — none mention schedule/slip/date |
| CR4-4 (homeowner "Holds a key" vs. the one designated key holder) | Open, needs a fixture cue | **Still open, unchanged** | F-04/F-05/F-06 all read "Holds a key." with no cross-reference to Ngozi Eze on the site access card |
| CR4-5 (stale SPEC vitals literal) | Blocking, flagged for a ruling | **Fixed by R-F** | `SPEC.md:537` amended; no face change needed |
| CR4-6 (pick search-field label diverges by width) | Minor, new in R4 | **Fixed** | Both files now use `field('f-pick-search'/'f-rolodex', 'SEARCH THE ROLODEX', 'Lindqvist')` — identical label |
| CR4-7 (add-sheet authority note wording diverges by width) | Minor, new in R4 | **Fixed by R-J** | See R-J row above |
| CR4-8 (forced-colors checkbox fallback missing at 390) | Minor, new in R4 | **Fixed** | 390 `:292`: `.check input, .pick-box { appearance: auto; -webkit-appearance: auto; }` now present, covers the Bring-forward checkboxes too |

Every prior finding is disposed of except the two the corresponding ruling explicitly targeted for a fix (R-G, R-L) — both landed on `people-room-1440.html` only. `fix-log-r4.md` itself is explicit about this: it opened `people-room-390.html` "read-only, for comparison only," and its own "Deviations recorded" section says outright that 390's routed line (R-L) and 390's stage/word-column change (implied by R-G) are "the 390 builder's item." No 390 fix log exists for round 4. Those two items are the round's headline findings below (CR5-1, CR5-2), not fresh regressions — they are the carried-forward, never-closed half of R-G and R-L.

Also newly surfaced this round, not a round-4 carry: **CR5-3**, a stale SPEC literal analogous to CR4-5/R-F (Ray Thao's "Not on file" text in §5.1 #11, never corrected after R-A), which `fix-log-r4.md`'s own "Deviations recorded" section flagged but which round 4's review did not give a CR number. See §4.

---

## 2. CS1 and CS4's top-5 asks — tracked where, this round

| # | Ask (CS1 / CS4 wording) | Tracked on the face? | State(s) | This round's change |
|---|---|---|---|---|
| 1 | Compliance document with expiry on the firm: COI, W-9, license, per-draw waiver (CS1-1, CS4-1) | **Yes, both widths, unchanged.** Company card "Paper" region (table at 1440, label-stack at 390, §6.2); doc-less firms now print `Not on file` + `Record a document` (R-K, both widths) | `#state-company`, `#state-directory`, `#state-roster` | No regression; R-K closed the last gap on this ask at 390 too |
| 2 | Authority set: money limit, CO, schedule, site access, key (CS1-2, CS4-3) | Partially, both widths, unchanged. Person card "Edit the authority" band and Add-sheet "Authority" region are real acts, correct provenance wording now identical both widths (R-J). **Schedule remains absent from the authority vocabulary** — CR4-3, still open | `#state-person`, `#state-add`, `#state-roster` | R-J closed the wording divergence; the fixture gap (schedule) is unchanged |
| 3 | Contact rule: primary, never, route-through (CS1-3, CS4-2/5) | **Yes at 1440 on all three named surfaces (Directory row, Call Sheet row, company card). At 390, the rule *sentence* ("Do not contact directly…") is present on all three, but the routed *contact detail* (Rosa's email + tel: link) prints only on the company card** — CR5-2 | `#state-person`, `#state-directory`, `#state-roster`, `#state-company` | **Regressed relative to what R-L required**: this ask is only fully met at 1440 this round |
| 4 | Phone-scoped consent shown truthfully on every row, inherited on a new job (CS1-4, CS4-6) | **Yes at 1440: every one of the 12 Directory rows prints its consent word directly on the row.** **At 390, 7 of 12 rows (Adaeze, Chidi, Tom Marrow, Erin Sato, Luis Ochoa, Rosa Delgado, Claire Bissett) print no consent word anywhere on the page until "Seats" is opened** — CR5-1. Pete Rusk's opt-out note still reads correctly everywhere he already appears (unchanged, both widths) | `#state-directory`, `#state-person`, `#state-roster`, `#state-pick` | **This ask fails its own literal wording ("on every row") at 390** — new this round |
| 5 | Relationship stage + `warranty_until` + link lifetime tied to the job (CS1-5/8/23, CS4-15/17) | **Yes, both widths, unchanged.** Company card warranty date, person-card grant "Ends with the job," seat-line window all agree (R-D, standing) | `#state-company`, `#state-person`, `#state-roster` | No change |

Two of CS1/CS4's five ranked asks (#3 and #4) are now met in full only at 1440. Both regressions trace to the same fact: `fix-log-r4.md` fixed `people-room-1440.html` against R-G and R-L and left `people-room-390.html` untouched, and no round-4 fix log for 390 exists to close the gap.

---

## 3. Leah's six tasks — amended acceptance, state, act count, this round

| Task | Amended acceptance | Met? | State(s) | Acts | Note |
|---|---|---|---|---|---|
| 1. Add Dana text-only | A rule every add/send/edit honours, ≤2 clicks | **Met, both widths** | `#state-add` → persists on Dana's Directory/person/roster rows | 1 field filled once | Dana is one of the 5 rows 390 opens by default (`DIR_OPEN`), so CR5-1 does not hide her words |
| 2. Give Adaeze the app; note Chidi signs $2,500 | R-B: login + authority as two separate facts, visible on the person card and the Call Sheet's client side | **Met, both widths** | `#state-roster` Client-side band (Adaeze "Selections."/`Account`; Chidi "Signs money to $2,500."/`On paper`) + `#state-add` | 0 clicks on the roster; 1 on the Add sheet to see the default | Verified by direct text extraction at both widths — both print "Signs money to $2,500." on Chidi's roster row |
| 3. Site access, one screen | Key holder, gate control, hours, who-was-told, from one screen | **Met, both widths** | `#state-access` | 1 click from the nav | 0 lines differ between widths (confirmed by whole-state diff) |
| 4. Do-not-contact Frank; route to Rosa | Every attempted contact and every future pick shows "write Rosa instead" | **Met at 1440. Partially met at 390** — the "do not contact, write Rosa" *sentence* shows on all three surfaces (Directory, roster, company card), but the *routed contact detail* SPEC names verbatim (§5.1 #10, §5.4 #12: Rosa's email and `tel:`-linked office phone) shows only on 390's company card | `#state-person`, `#state-directory`, `#state-roster`, `#state-company` | 0 additional clicks at 1440; at 390 a GC reading the Directory or Call Sheet sees only "write Rosa instead" with no way to actually write her without a third navigation to the company card | CR5-2 |
| 5. Bring 3 Lindqvist subs + Stonehaven's rep onto Okonkwo | Each arrives with consent, doc status, one history line, never old pricing | **Met, both widths** | `#state-pick` | 2 acts (open Bring forward, then the terminal act) | Live-clicked at both widths: checkbox toggle and Put back recompute the count, terminal label and consequence sentence identically |
| 6. Everyone by role, this week | Narrows to on-site-this-week, excludes unopened/closed windows | **Met, both widths** | `#state-roster` | 1 click to open (already banded) + 1 role-pill click | Bands ("On the job · this week", "· later", "Bidding", "Done") present and worded identically at both widths |

Five of six tasks are fully met at both widths. Task 4 is the exception: it is met at 1440 and only partially met at 390, for the same root cause as CS1/CS4 ask #3 above (CR5-2).

---

## 4. Facts on a face a GC or sub would read as wrong, naive, or unusable

| Finding | Severity | Confidence | Evidence |
|---|---|---|---|
| **CR5-1 — new.** At 390, 7 of the 12 Directory person rows (Adaeze Okonkwo, Chidi Okonkwo, Tom Marrow, Erin Sato, Luis Ochoa, Rosa Delgado, Claire Bissett) show **only the reach word** on the row; the consent and paper words do not appear anywhere on the rendered page for these people, because `dirPersonRow()`'s three-word block (`words = [word(p.reach), word(p.consent), f ? paperWord(p.company) : '']`) is written *inside* the `<ul class="seats" … hidden>` panel, and `DIR_OPEN` (`['F-11','F-18','F-12','F-15','F-27']`) opens only 5 of the 12 rows by default. `people-room-1440.html`'s equivalent `dirPersonRow()` places its `.row-words` div as a sibling of, not nested inside, the seats disclosure, so all 12 rows print all three columns unconditionally. Verified by rendering both files and diffing `innerText`: 1440's Adaeze row reads "ACCOUNT / TEXTING"; 390's reads only "Account" (no "Texting" anywhere on the page for her). This is a direct violation of SPEC §5.1 #7 ("a person row carries exactly three bordered `.word` columns — reach, consent, paper") at 390, and it defeats CS1/CS4 top-5 ask #4 ("consent shown truthfully on every row") for the majority of 390's rows. Root cause: §6.2's pre-existing "Word columns" rule ("The four bordered word columns do not appear on a row at 390 … consent, stage and paper appear inside the unfold") still names *stage* as one of the three deferred words — language written for the pre-R-G model, never reconciled with R-G's amendment to §5.1/§6.1. The two builders each correctly followed a different, now-contradictory part of SPEC. Recommend a ruling in the pattern of R-D/R-F, amending §6.2 to match §5.1 #7, and a rebuild of 390's `dirPersonRow()` to print the three columns unconditionally | **Blocking** | High | `people-room-390.html:697` (`words = […].filter(Boolean).join('')`, printed only inside the `<li class="seat">`); `people-room-390.html:709-712` (`<ul class="seats" … hidden>` unless `DIR_OPEN`); `people-room-1440.html:701-707` (`.row-words` is a sibling of `.seats`, unconditional); `SPEC.md` §5.1 #7 vs. §6.2 "Word columns" row; innerText diff, both files, `#state-directory` |
| **CR5-2 — new.** R-L's routed-contact line for Frank Bauer → Rosa Delgado is implemented at 390 on exactly one of the three surfaces R-L (and SPEC §5.1 #10 / §5.4 #12) name. `routedLine(to)` is defined once (`people-room-390.html:591`) and called once, inside `renderCompany()`'s crew list (`:959`). `dirPersonRow()` (`:708`) and `rosterPersonRow()` (`:1030`) both print only `r.text` — "Do not contact directly. Write Rosa Delgado instead." — with no follow-up line. `people-room-1440.html` prints the full routed line ("Write Rosa Delgado · rosa@twincitiesdrywall.com · (612) 555-0114", the phone `tel:`-linked) on all three surfaces via one shared helper (`clauseHtml(clausesFor(p))` calling `routeWrite()`, defined `:640-668`), confirmed by direct extraction of `#face-directory` and `#face-roster`. SPEC §5.1 #10 requires this string verbatim on the Directory row; §5.4 #12 requires it verbatim on the Call Sheet row, explicitly cross-referencing #10's rule ("the same routed-contact rule as §5.1 #10"). Both requirements are unmet at 390. This directly weakens Leah's Task 4: a GC skimming the 390 Directory or Call Sheet sees the instruction to write Rosa but not her address or number, and must make a third navigation (to the company card) to actually act on it | **Blocking** | High | `people-room-390.html:591,708,959,1030`; `people-room-1440.html:640-668,703,1058`; `SPEC.md` §5.1 #10, §5.4 #12; extracted `#face-roster`(1440)/`#state-roster`(390) text around "Frank Bauer" |
| **CR5-3 — new, but a carried self-reported deviation from `fix-log-r4.md`'s "Deviations recorded" section, not previously given a CR number.** SPEC §5.1 #11 still requires Ray Thao's Directory row to show "the row's three word columns — reach `On paper`, consent `Not asked`, paper `Not on file`," but neither file prints any paper word for Ray Thao — both correctly suppress it under the standing ruling R-A ("No paper word for lender or inspector firms") and R-H/§5.1 #18. This is the same shape of defect R-F just closed for the vitals literal (CR4-5): a SPEC acceptance string that is mechanically unsatisfiable without contradicting a binding ruling, unresolved since it was first noticed by the round-4 builder. Recommend the same disposition: amend §5.1 #11 to drop the "paper `Not on file`" clause for Ray Thao, matching R-A/§5.1 #18's own rule that an inspector/lender-only firm's row carries no paper word at all | **Blocking (mechanical, SPEC-text)** | High | `SPEC.md:489` (§5.1 #11) vs. `SPEC.md:496` (§5.1 #18) and standing ruling R-A; `grep -c "Not on file"` on either rendered Ray Thao row → 0, both files; `fix-log-r4.md`'s own "Deviations recorded" section names this exact conflict without a ruling closing it |
| **CR5-4 — new.** `#state-pick` at 1440 opens with a sentence not named anywhere in SPEC §5.7's acceptance table: "Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026." (`people-room-1440.html:1213`), textually identical to the Call Sheet's own site-access summary line (`:1114`) — apparently carried over when `renderPick()` was built from `renderRoster()`. `people-room-390.html`'s `renderPick()` (`:1256`) has no equivalent line anywhere in the Bring-forward state. Not a forbidden string, and SPEC §5.7 #2 only requires the Call Sheet's head to "remain visible behind/above" without specifying this sentence, so this is not a clean SPEC violation either way — but the two widths show materially different content on the same screen's opening line, and no ruling has named which is correct | Minor | Medium | `people-room-1440.html:1213`; `people-room-390.html:1256-1264` (no matching line); `SPEC.md` §5.7 #1-#9 (no line names this sentence) |
| **CR5-5 — carried, unnumbered in round 4, unchanged this round.** Two small Directory cosmetics differ by width with no SPEC string governing either: (a) the seat-count control reads "1 SEAT"/"0 SEATS" at 1440 vs. a bare "SEATS" with no count at 390; (b) 390's Directory prints Dana's and Joe's consent-source sentences ("Carried forward to the Okonkwo residence, 12 October 2026." / "Recorded by Priya Natarajan at the site kickoff, 13 October 2026. No YES yet.") inside the seat panel, which 1440's Directory never shows (1440 reserves those sentences for the person card and roster unfold). `fix-log-r4.md`'s own "Deviations recorded" section names both and states "Neither is a SPEC string," so neither is a rule violation — flagged only because no ruling has settled either direction and a reviewer comparing the two faces side by side will notice | Minor | Low | `people-room-1440.html` Adaeze row → "1 SEAT"; `people-room-390.html` same row → "SEATS"; `people-room-390.html` Dana/Joe seat panels contain the two consent sentences, absent from `people-room-1440.html`'s Directory |
| CR4-1 (carried, unchanged). "MN BC contractor licence," "MN electrical contractor licence," "holds the trade licence" — British spelling a Minneapolis GC or electrician would flag as a typo | Minor | High | `grep -co "licen[sc]e"`: 6 (1440), 4 (390); 0 "license" either file — lives in SPEC §3's verbatim fixture JSON |
| CR4-2 (carried, unchanged). "These two cards share a phone. Compare them?" names no cards; "Compare & merge" has no click target or handler in either file | Minor | Medium | `people-room-1440.html:752-753`; `people-room-390.html:541,765` |
| CR4-3 (carried, unchanged). The authority vocabulary (CS1-2/CS4-3) claims "schedule" alongside money, CO, site, key — no engagement in the fixture demonstrates it | Minor | Medium | All 14 distinct `"authority"` strings across both files dumped; none mention schedule/slip/date |
| CR4-4 (carried, unchanged). Three homeowners/receivers "Holds a key." read identically to the site access card's one designated key holder (Ngozi Eze); no cue distinguishes the two senses of "holds a key" | Minor | Low | F-04/F-05/F-06 engagement rows vs. the site access card naming only Ngozi Eze |

No wrong fact was found on either face this round: every date, phone, firm affiliation, authority figure and consent state checked (Dana's window, Chidi's $2,500 threshold, the 29/22 header count, the vitals arithmetic, Frank/Rosa/Northgate/TC-Drywall affiliations, Great Northern Bank/CPED's wordless rows) is internally correct and — where both faces render it at all — cross-width consistent. Every finding this round is either a still-open item both prior rounds already correctly declined to fix without a fixture/SPEC-owner move (CR4-1..CR4-4), a stale SPEC literal not yet given a correcting ruling (CR5-3, the same shape R-F just resolved for CR4-5), or a completeness gap where a ruling (R-G, R-L) was applied to one file and never carried to the other (CR5-1, CR5-2) — plus one small new cross-width copy difference on a screen with no governing SPEC line either way (CR5-4) and one carried, SPEC-silent cosmetic pair (CR5-5).

---

## 5. Trade- or homeowner-facing writing surfaces

**None found, on either width.**

```
grep -n "<input\|<textarea\|contenteditable" people-room-1440.html
  → f-authority-edit (person card, studio-only)
  → pick-* checkboxes (Bring-forward, studio-only)
  → f-rolodex (Bring-forward search, studio-only)
  → Add-sheet fields incl. f-authority, f-consent ×2 (studio-only)
  → f-told (Site access "Log who was told," studio-only, textarea)
grep -n "<input\|<textarea\|contenteditable" people-room-390.html
  → f-authority-edit, f-pick-search / pick-box (×5), f-consent, f-told
  → same shape, all studio-only
```

Every writing surface in both files sits inside a studio-only screen: the Add sheet, the person card's authority-edit band, the site access card's notice log, and the Bring-forward picker's search field and checkboxes. The site access card still states this explicitly on both widths ("Studio only. This card never reaches a client page."). `grep -n upload` → 0 hits both files; no field-link write act, no rolodex-side trade input, no `data-` hook exposing `#state-pick` or any studio-only control from a client- or trade-facing surface exists in either file.

---

## Summary

Round 4's rulings (R-F through R-L) are fully applied at `people-room-1440.html` and fully closed there — R-F retired CR4-5, R-J retired CR4-7, R-K and R-H are byte-confirmed at both widths, R-I was already correct, and the two round-4-only new findings (CR4-6, CR4-8) are fixed at both widths. But `fix-log-r4.md` only ever touched `people-room-1440.html` — it opened `people-room-390.html` "read-only, for comparison only" and named the gaps this leaves in its own "Deviations recorded" section. This round's two blocking findings, CR5-1 and CR5-2, are exactly those named gaps, now walked against SPEC's explicit acceptance strings and Leah's/CS1's/CS4's actual asks rather than left as a builder's aside: R-G's three-word-column row is real at 1440 and absent for most people at 390 (SPEC §5.1 #7 violated, CS1/CS4 top-5 ask #4 unmet at 390), and R-L's routed-contact line is real on all three named surfaces at 1440 and present on only one of three at 390 (SPEC §5.1 #10 and §5.4 #12 violated, Leah's Task 4 only partly met at 390). A third blocking item, CR5-3, is a stale SPEC literal (Ray Thao's §5.1 #11 "Not on file") that has needed the same kind of correcting ruling R-F just gave CR4-5, since before round 4, and still hasn't received one. One new minor cross-width copy divergence (CR5-4, the Bring-forward screen's stray site-access sentence) and one carried, SPEC-silent cosmetic pair (CR5-5) round out the list, alongside the four long-carried, correctly-untouched fixture/SPEC-owner minors (CR4-1..CR4-4).

Findings this round: 8 total — **3 blocking** (CR5-1, CR5-2, CR5-3), **0 major**, **5 minor** (CR5-4, CR5-5, CR4-1 through CR4-4 carried).

**Not clean** — three blocking items (CR5-1, CR5-2, CR5-3) prevent a clean verdict. CR5-1 and CR5-2 are completeness gaps (a ruling applied to one file, not the other) rather than newly introduced defects, and both are mechanically fixable by porting the already-correct 1440 logic (`.row-words` placement; `clauseHtml`/`routeWrite`) into the 390 functions named above. CR5-3 needs an orchestrator ruling, not a build fix, in the same pattern R-F already set for the sibling case.
