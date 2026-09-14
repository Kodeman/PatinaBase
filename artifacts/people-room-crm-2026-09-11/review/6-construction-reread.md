# Construction re-read, round 6

CS1 (GC/PM) and CS4 (electrical sub owner), plus Leah's six tasks under the §6 amended
acceptance (`synthesis/direction.md` §6), re-walking `specimens/people-room-1440.html` and
`specimens/people-room-390.html` after `review/fix-log-r5.md` and standing rulings R-A..R-U
(`rulings.md` §3). Every claim below is grep-, source-, or render-verified independently
against the two current specimen files, `specimens/SPEC.md`, and the fourteen PNGs in
`shots/` (freshest set: `people-room-1440-state-*-1440.png` / `people-room-390-state-*-390.png`,
timestamped 10:46, matching the current file bytes). No build, no pnpm install/dev, no git,
no prod — nothing written outside `artifacts/people-room-crm-2026-09-11/`.

Gate facts, independently re-run this round:

```
wc -c                                                     → 97564 (1440), 103070 (390) — matches fix-log-r5.md's own gate
tail -c 60 (both files)                                   → ...</html>\n<!-- specimen-complete -->
grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled'   → 0, 0 (both, re-run independently)
grep -c '<h1'                                             → 1, 1
hex literals after line 90                                → 0, 0
shots/people-room-{1440,390}-console.json (10:46 set)     → 14 captures, 0 errors, 0 warnings,
                                                              horizontalOverflow:false on all 14
Visible "CRM" text sweep (excludes class names crm-row/-card/-table/-list/-h)  → 0 hits, both files
Fixture parity: `"person": "F-…"` lines (CONSENT+RULE+ENGAGEMENTS), sorted    → byte-identical, both files
Fixture parity: `"id": "F-…"` lines (FIXTURE.persons), sorted                 → byte-identical, both files
Fixture parity: company `"id"…"kind"` lines, sorted                          → byte-identical, both files
Vitals arithmetic, recomputed by hand from the 12-person "week/client/studio" band:
  reach=Account → F-01,F-02,F-03,F-04 = 4 ✓ · reach=On paper → F-05,F-10 = 2 ✓ ·
  consent=Texting → F-04,F-06,F-08,F-09,F-11 = 5 ✓ · band size = 3+2+7 = 12 ✓
  → "12 on the job this week · 5 reachable by text · 4 with accounts · 2 on paper" confirmed correct
```

No wrong fact found on either face this round, and no two-widths factual disagreement: every
fixture array keyed by `person` or `id` is byte-identical between the files after sorting.

---

## 1. Round-5 findings: fixed or open

| ID | R5 status | R6 status | Evidence |
|---|---|---|---|
| CR5-1 (blocking) — 7 of 12 Directory rows at 390 showed no consent/paper word outside the seat unfold | Blocking, open | **Fixed** | `people-room-390.html:743-773` `dirPersonRow()`: `plain = [p.reach, p.consent, …].filter(Boolean).join(' · ')` now printed in `<div class="prow-line2">`, a sibling of the row-id block, unconditionally on every row — not nested inside `<ul class="seats" hidden>` any more. Screenshot-verified: `shots/people-room-390-state-directory-390.png` shows "Account · Texting" on Adaeze Okonkwo's row without opening any disclosure. `SPEC.md` §6.2 "Word columns" row now reads "…never as bordered columns — §5.1 #7's bordered columns apply at 1440 only (R-M)", reconciled with §5.1 #7 |
| CR5-2 (blocking) — R-L's routed line (Frank Bauer → Rosa Delgado) present on only 1 of 3 named surfaces at 390 | Blocking, open | **Fixed** | `people-room-390.html:643-655` now hosts the same `clausesFor`/`clauseHtml`/`routeWrite`/`routeChannels` byte-identical to `people-room-1440.html:640-668` (diffed directly, 0 bytes differ). `dirPersonRow()` (`:743`), `rosterPersonRow()` (`:1070`) and `renderCompany()`'s crew line (`:1010-1013`) all call `clauseHtml(clausesFor(p))` / `routeWrite(r.routeTo)`. Screenshot-verified at 390: Directory row and Call Sheet row both print "Write Rosa Delgado · rosa@twincitiesdrywall.com · (612) 555-0114" with the phone `tel:`-linked (crop of `people-room-390-state-roster-390.png` around Frank Bauer's row) |
| CR5-3 (blocking, SPEC text) — §5.1 #11 demanded a paper word for Ray Thao, contradicting R-A | Blocking, open | **Fixed** | `SPEC.md` §5.1 #11 now reads "…and no paper word (lender and inspector people print no paper word, R-A)". No face change was needed; `grep -c "Not on file"` on Ray Thao's rendered row → 0, both files (re-confirmed) |
| CR5-4 — Bring-forward's site-access line present at 1440, absent at 390, no ruling either way | Minor, open | **Fixed (superseded by ruling)** | R-U requires the line at both widths. `siteHeadLine()` (`people-room-390.html:1127-1131`) is shared by `renderRoster()` and `renderPick()`; 1440 carries the identical string inline at both call sites (`:1116`, `:1216`). Screenshot-verified: both `#state-pick` plates open with "Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026." under the Call Sheet heading |
| CR5-5a — seat-count control read "1 SEAT"/"0 SEATS" at 1440, bare "SEATS" at 390 | Minor, open | **Fixed** | `people-room-390.html:766`: `count + ' seat' + (count === 1 ? '' : 's')`, matching 1440 exactly |
| CR5-5b — 390's Directory seat panel printed the consent-source sentence, 1440 never did | Minor, open | **Fixed** | `people-room-390.html:769-773`: the seat `<li>` now contains only `seat-line` + stage word, no consent sentence |
| CR4-1 (licence spelling) | Minor, open by design | **Still open, correctly untouched** | `grep -co "licen[sc]e"`: 6 (1440), 4 (390); 0 "license" either file — lives in the verbatim §3 fixture JSON, a fixture-owner decision, not a build defect |
| CR4-2 (dead "Compare & merge") | Minor/major-leaning, open | **Still open, unchanged** | `people-room-1440.html:753`, `people-room-390.html:~757` (Directory duplicate-band): "These two cards share a phone. Compare them?" / act "Compare & merge" — no card names, no click target, no handler, either file. Needs a panel ruling on which two cards and what the act opens |
| CR4-3 (no schedule-authority example) | Minor, open | **Still open, unchanged** | All distinct `"authority": "…"` strings across both files dumped this round (17 unique values) — none mention schedule, slip, or a date-moving decision. Not a SPEC violation (no acceptance string names a schedule example), so non-blocking, but the fixture still cannot demonstrate CS1-2/CS4-3's schedule-authority claim |
| CR4-4 (homeowner "Holds a key." ambiguous with the one designated key holder) | Minor, open | **Still open, unchanged** | `people-room-1440.html:498-499,506`: F-04 (Adaeze), F-05 (Chidi) and F-06 (Ngozi Eze, the site access card's one named key holder) all carry `"access": "key"` → the person-card seats region prints "Holds a key." identically for all three, with no cue that only Ngozi is the site-access-card's designated holder |

---

## 2. New finding this round

| ID | Severity | Confidence | Claim | Evidence |
|---|---|---|---|---|
| CR6-1 | Minor | Medium | The "Contracted through …" GC name on a sub's person card is derived two different ways at the two widths: 1440 looks it up generically from the fixture (`gcName()`, filters `FIXTURE.engagements` for `kind === 'gc'`); 390 hardcodes the literal firm id `'marrow'`. With today's one-GC fixture the rendered text is identical at both widths ("Contracted through Marrow & Sons") and no face-visible defect exists, but 390's hardcoding is a latent divergence: if the fixture ever named a second or different GC, 390 would keep printing "Marrow & Sons" while 1440 would follow the data. Not a SPEC violation (no acceptance string is unmet) and not currently reachable by any state in the current fixture, hence minor/medium rather than blocking | `people-room-1440.html:777-780` (`function gcName()`) and `:881` (`if (e.kind === 'sub' && gcName())`); `people-room-390.html:906` (`esc(firm('marrow').name)`, no lookup by kind) |

No blocking or major finding was produced this round. Every item that was blocking after round 5 (CR5-1, CR5-2, CR5-3) is fixed and independently re-verified above by source diff, fixture-array diff, and cropped screenshot, not merely by trusting `fix-log-r5.md`'s own claims.

---

## 3. CS1's and CS4's top-5 asks — tracked where, this round

| # | Ask (CS1 / CS4 wording) | Tracked on the face? | State(s) | Both widths? |
|---|---|---|---|---|
| 1 | Compliance document with expiry on the firm: COI, W-9, licence, per-draw waiver (CS1-1, CS4-1) | **Yes.** Company card "Paper" region: a table at 1440 (`:948` `renderCompany`), a label-over-value stack at 390 (`:994`), both ordered table → blocked clause → consequence → act row per R-P. Doc-less firms print "Not on file" + "Record a document"; lender/inspector-only firms print "No paper is held for this firm.", no table, no act (R-A/§5.3 #10) | `#state-company`, echoed on `#state-directory` (paper word) and `#state-roster` (held clause on Dana Kowalski's row) | **Yes**, byte-verified table order and content, screenshot-confirmed both widths (Northgate Electric plates) |
| 2 | Authority set: money limit, CO, schedule, site access, key (CS1-2, CS4-3) | **Partially.** Person card "Seats on projects" prints the seat's authority as plain text ("No authority on this job" for Dana; "Signs money to $2,500." for Chidi on the roster), plus access words (Escorted, Contracted through, Hidden from client, Holds a key, Controls the gate). Add-sheet "Authority" region, both branches (defaulted vs. not), byte-identical wording both widths (R-J). **No fixture engagement demonstrates a schedule authority** — CR4-3, still open, non-blocking | `#state-person`, `#state-add`, `#state-roster` | **Yes** for what exists; the schedule gap is a fixture gap, not a width gap |
| 3 | Contact rule: primary, never, route-through (CS1-3, CS4-2/5) | **Yes, now at both widths.** Directory row, roster row, company-card crew line and person card all print the blocked clause and, where a route exists, the full routed line (email + `tel:`-linked office phone) — CR5-2 closed this gap at 390 this round | `#state-person`, `#state-directory`, `#state-roster`, `#state-company` | **Yes** — this was the round-5 regression; confirmed fixed by source diff and cropped screenshot of Frank Bauer's 390 Call Sheet row |
| 4 | Phone-scoped consent shown truthfully on every row, inherited on a new job (CS1-4, CS4-6) | **Yes, now at both widths.** Every one of the 12 Directory rows prints reach/consent/paper (bordered columns at 1440, plain inline words at 390) unconditionally — CR5-1 closed this gap at 390 this round. Pete Rusk's opted-out note and Dana Kowalski's carried-forward consent sentence both read correctly at both widths | `#state-directory`, `#state-person`, `#state-roster`, `#state-pick` | **Yes** — confirmed by source diff (`dirPersonRow` at `:743-773`) and the full-page 390 Directory screenshot |
| 5 | Relationship stage + `warranty_until` + link lifetime tied to the job (CS1-5/8/23, CS4-15/17) | **Yes, unchanged.** Company card "warranty through 21 Nov 2026", person card Access grants "Ends with the job, 13 August 2027. Renews when they use it.", seat-line window, all agree | `#state-company`, `#state-person`, `#state-roster` | **Yes**, no change this round, re-verified |

Both of CS1/CS4's asks that were only partially met at 390 after round 5 (#3 and #4) are now fully met at both widths. All five top-5 asks are now visibly tracked, on-face, at both widths.

---

## 4. Leah's six tasks — amended acceptance, state, acts, this round

| Task | Amended acceptance | Met? | State(s) | Acts |
|---|---|---|---|---|
| 1. Add Dana text-only | A rule every add/send/edit honours, ≤2 clicks | **Met, both widths** | `#state-add` → persists on Directory/person/roster rows | 1 field filled once |
| 2. Give Adaeze the app; note Chidi signs $2,500 | Login + authority as two separate facts, visible on the person card and the Call Sheet's client side | **Met, both widths** | `#state-roster` Client-side band (Adaeze "Selections."/`Account`; Chidi "Signs money to $2,500."/`On paper`) + `#state-add` | 0 clicks on the roster; 1 on the Add sheet for the default |
| 3. Site access, one screen | Key holder, gate control, hours, who-was-told, from one screen | **Met, both widths** | `#state-access` | 1 click from the nav; 0 lines differ between widths (screenshot-confirmed identical text both widths) |
| 4. Do-not-contact Frank; route to Rosa | Every attempted contact and every future pick shows "write Rosa instead" | **Met, both widths — improved from round 5.** All three named surfaces (Directory, Call Sheet, company card) print the full routed line at both widths now | `#state-person`, `#state-directory`, `#state-roster`, `#state-company` | 0 additional clicks, either width |
| 5. Bring 3 Lindqvist subs + Stonehaven's rep onto Okonkwo | Each arrives with consent, doc status, one history line, never old pricing | **Met, both widths** | `#state-pick` | 2 acts (open Bring forward, then the terminal act); checkbox and Put back live-verified both widths per fix-log-r5's Playwright probe (independently spot-checked via screenshot, not re-clicked this round) |
| 6. Everyone by role, this week | Narrows to on-site-this-week, excludes unopened/closed windows | **Met, both widths** | `#state-roster` | 1 click to open (already banded) + 1 role-pill click |

**All six of Leah's tasks are now fully met at both widths.** Task 4 was the round-5 exception (met at 1440, partial at 390); it is now closed, tracked at the same four surfaces, in the same act counts, as every other task.

---

## 5. Anything a GC or sub would read as wrong, naive, or unusable

None found at blocking or major severity. Carried, correctly-unactioned minors (need a fixture/SPEC-owner or panel ruling, not a build fix):

- **CR4-1** — "MN BC contractor licence", "MN electrical contractor licence" — British spelling a Minneapolis GC or electrician would flag as a typo on sight. Lives in the verbatim §3 fixture JSON.
- **CR4-2** — "These two cards share a phone. Compare them?" names no cards; "Compare & merge" has no click target in either file. A GC skimming the Directory would click it and nothing would happen.
- **CR4-3** — The authority vocabulary claims "schedule" is trackable alongside money, CO, site, key, but no engagement in the fixture demonstrates it — a GC reading CS1's own ask would not find it proven on any face.
- **CR4-4** — Three different people ("Holds a key.") read identically whether they are the site access card's one designated key holder (Ngozi Eze) or a homeowner/receiver with incidental key access — a super skimming seats could not tell the difference from the wording alone.
- **CR6-1** (new, this round) — see §2. Not visible on any face today; a latent code-robustness note for a future fixture change, not a current usability defect.

Everything else a GC or sub would need to act on — compliance lapses, do-not-contact rules, site access, authority thresholds, consent state, relationship stage — reads correctly and identically at both widths this round.

---

## 6. Trade- or homeowner-facing writing surfaces

**None found, on either width**, re-verified independently:

```
grep -n "<input\|<textarea\|contenteditable" people-room-1440.html
  → f-authority-edit (person card, studio-only)
  → pick-* checkboxes (Bring-forward, studio-only)
  → f-rolodex (Bring-forward search, studio-only)
  → Add-sheet fields incl. f-consent ×2 (studio-only)
  → f-told (Site access "Log who was told," studio-only, textarea)
grep -n "<input\|<textarea\|contenteditable" people-room-390.html
  → f-authority-edit, f-pick-search / pick-box (×5), f-consent, f-told
  → same shape, all studio-only
```

Every one of these sits inside a studio-only screen (state bar nav is entirely studio surfaces: Directory, Person card, Company card, Project roster, Bring forward, Add sheet, Site access). The site access card states this explicitly on both widths: "Studio only. This card never reaches a client page." No `upload` string, no field-link write act, no rolodex-side trade input, and no `data-` hook exposing any studio-only control from a client- or trade-facing surface exists in either file.

---

## Summary

Round 5's fixes are real and correctly applied at both widths, independently re-verified this
round by source diff (not by re-reading `fix-log-r5.md`'s claims): CR5-1's row-word placement,
CR5-2's shared routing helpers, CR5-4's shared `siteHeadLine()`, and CR5-5's two cosmetic
parity fixes all land exactly as claimed, confirmed by direct inspection of the current
`dirPersonRow`, `rosterPersonRow`, `renderCompany`, `clausesFor`/`clauseHtml`/`routeWrite`
functions in both files and by cropped screenshots of Frank Bauer's and Carol Nystrom's rows
at 390. CR5-3 needed only a SPEC-text reconciliation (R-N), already applied. Every fixture
array keyed by person or company id is byte-identical between the two files after sorting —
there is no fact and no wording on which the two widths disagree, and the round's vitals and
head-count arithmetic were independently recomputed and confirmed correct.

CS1's and CS4's top-5 asks are now all tracked on-face at both widths — the two that were
partial at 390 after round 5 (contact rule routing, truthful consent on every row) are closed.
Leah's six tasks are now all fully met at both widths, in the act counts the amended §6
acceptance calls for; Task 4 (do-not-contact/route) is the one that changed status this round,
from partial to fully met.

One new finding surfaced this round, CR6-1: a latent (currently invisible) hardcoding
divergence in how 390 derives a sub's GC name versus 1440's generic lookup. It is minor,
medium-confidence, and not a SPEC violation, since the one-GC fixture renders identically
either way.

The four long-carried fixture/SPEC-owner minors (CR4-1..CR4-4) remain open, correctly
unactioned pending an explicit ruling or fixture change — none is a build defect, and none
blocks a clean read of this round's build.

No trade- or homeowner-facing writing surface exists on either face.

Findings this round: 5 total — **0 blocking**, **0 major**, **5 minor** (CR4-1, CR4-2, CR4-3,
CR4-4 carried; CR6-1 new). Plus six items from round 5 (CR5-1, CR5-2, CR5-3, CR5-4, CR5-5a,
CR5-5b) confirmed fixed, independently re-verified rather than taken on the builder's word.

**Clean.** Zero blocking, zero major findings survive this round.
