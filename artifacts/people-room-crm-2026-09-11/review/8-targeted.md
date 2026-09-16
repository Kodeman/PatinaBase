# Targeted review, round 8

Files: `specimens/people-room-1440.html` (97,560 bytes), `specimens/people-room-390.html` (103,851 bytes), against `specimens/SPEC.md` §4, §5.1 #17, §7, §8, §10, after `review/fix-log-r7.md`. `review/7-combined.md` and `rulings.md` §3 (R-A..R-Z, settled) read first.

Render tool: Chromium hit the documented Mach-port bootstrap error under the default sandbox (`Check failed: kr == KERN_SUCCESS. bootstrap_check_in ... Permission denied (1100)`), reproduced once on both files, then every render/Playwright command in this round ran with the sandbox disabled.

All evidence below comes from fresh Playwright runs against the files on disk this round, not from trusting `fix-log-r7.md`'s own claims.

---

## 1. R7-1 and CR2-8/CR3-5/CR4-2, re-verified independently

### R7-1 — 390's state bar dropped from the Tab sequence on first hash navigation

**FIXED. Verified independently, not by trusting the fix log.**

Root cause per `fix-log-r7.md`: 390's state `<section>` ids were literally `id="state-directory"` etc., identical to the hash tokens, so Chromium's fragment-focus behavior moved the Tab starting point past the state bar. R-Z's fix: rename to `id="face-*"` with a hash→id lookup.

Evidence, this round:

```
$ grep -c 'id="state-' specimens/people-room-390.html
0
$ node -e "… ids equal to a state-* token …"
specimens/people-room-1440.html total ids: 26 bad matches: []
specimens/people-room-390.html total ids: 22 bad matches: []
```

Fresh-context Tab walk, all seven states, both widths (14 of 14), first three Tab stops:

```
width  state             1st         2nd            3rd
1440   state-directory   DIRECTORY   PERSON CARD    COMPANY CARD
1440   state-person      DIRECTORY   PERSON CARD    COMPANY CARD
1440   state-company     DIRECTORY   PERSON CARD    COMPANY CARD
1440   state-roster      DIRECTORY   PERSON CARD    COMPANY CARD
1440   state-pick        DIRECTORY   PERSON CARD    COMPANY CARD
1440   state-add         DIRECTORY   PERSON CARD    COMPANY CARD
1440   state-access      DIRECTORY   PERSON CARD    COMPANY CARD
390    state-directory   DIRECTORY   PERSON CARD    COMPANY CARD
390    state-person      DIRECTORY   PERSON CARD    COMPANY CARD
390    state-company     DIRECTORY   PERSON CARD    COMPANY CARD
390    state-roster      DIRECTORY   PERSON CARD    COMPANY CARD
390    state-pick        DIRECTORY   PERSON CARD    COMPANY CARD
390    state-add          DIRECTORY   PERSON CARD    COMPANY CARD
390    state-access       DIRECTORY   PERSON CARD    COMPANY CARD
```

Click-sequence check (click each bar button, confirm the *next* Tab reaches the *next* bar button), both widths:

```
Directory → next Tab: PERSON CARD ✓
Person card → next Tab: COMPANY CARD ✓
Company card → next Tab: PROJECT ROSTER ✓
Project roster → next Tab: BRING FORWARD ✓
Bring forward → next Tab: ADD SHEET ✓
Add sheet → next Tab: SITE ACCESS ✓
Site access → next Tab: first control on the face (tel: link at 1440; the "who to call first" line at 390) ✓
```
Identical at both widths. Status: **FIXED**, high confidence, independently reproduced with fresh browser contexts per hash (avoiding the same-document hash-change trap `fix-log-r7.md` itself calls out).

### CR2-8/CR3-5/CR4-2 — "Compare & merge" inert button

**FIXED — by removal, per R-Y.**

```
$ grep -n "Compare & merge\|Compare them?" specimens/people-room-1440.html specimens/people-room-390.html
(no matches, exit 1)
```

The duplicate band at both widths now reads exactly the SPEC §5.1 #17 sentence:

```
"These two cards share a phone." Adaeze Okonkwo · Chidi Okonkwo
```

Click test, both names, both widths (fresh contexts):

| File | Name clicked | Hash after | `role="status"` | Card head after |
|---|---|---|---|---|
| 1440 | Adaeze Okonkwo | #state-person | Person card | Adaeze Okonkwo |
| 1440 | Chidi Okonkwo | #state-person | Person card | Chidi Okonkwo |
| 390 | Adaeze Okonkwo | #state-person | Person card | Adaeze Okonkwo |
| 390 | Chidi Okonkwo | #state-person | Person card | Chidi Okonkwo |

Each name opens its own card at both widths (item 3 of this round's brief). Status: **FIXED**, high confidence.

---

## 2. Grep: any element id equal to a state-* token

```
$ grep -c 'id="state-' specimens/people-room-1440.html specimens/people-room-390.html
people-room-1440.html:0
people-room-390.html:0
```

Full-attribute scan (not just the literal `id="state-` substring, in case of formatting variance):

```
1440 total ids: 26   bad matches (== a state-* token): []
390  total ids: 22   bad matches (== a state-* token): []
```

**Clean. Zero matches, both files.**

---

## 3. Playwright: all seven states, both widths — Tab order, act reachability, inert-control sweep

Method: fresh browser context per load (no same-document hash reuse), native viewport per width.

### 3a. Tab order and act reachability

Covered in §1 above (R7-1) — 14/14 fresh hash loads land the first Tab on Directory; the state-bar click sequence walks correctly at both widths. Separately, an act inventory (visible, non-bar `button`/`[role=button]`/`a[href]`, `el.offsetParent !== null`) per state:

```
                1440   390
state-directory  72     67
state-person     12     12
state-company    11     11
state-roster     72     96
state-pick        9      9
state-add        17     17
state-access     12     12
```

(390's directory/roster counts differ from 1440's because of the R-M plain-word-vs-bordered-word layout difference SPEC §6.2 names — not a finding.)

### 3b. Click every button, confirm a DOM or status change — findings

The one dynamic `aria-disabled` case in either file (`#pick-terminal`, "Add four to the roster" → "Add to the roster" when the pick count hits zero) correctly pairs `aria-disabled="true"` with `aria-describedby="pick-consequence"`, and that element is visible with real text at the time:

```
1440 {"ariaDisabled":"true","ariaDescribedby":"pick-consequence","descElVisible":true,"descElText":"Adds no seats to the Okonkwo residence."}
390  {"ariaDisabled":"true","ariaDescribedby":"pick-consequence","descElVisible":true,"descElText":"Adds no seats to the Okonkwo residence."}
```
No other `aria-disabled` occurrence exists in either file (`grep -n aria-disabled` shows only the CSS rule and this one dynamic setter, both files). **This part of §7 #4 passes.**

Every visible, enabled, non-`aria-disabled` act was clicked (deduplicated by accessible name per state, fresh page load per click, before/after compared on `body.innerHTML.length`, the `role="status"` text, and `location.hash`). Two distinct problems surfaced:

#### R8-1 — BLOCKING — 1440-only: five (of eleven) Directory "seat" lines are real, focusable, enabled `<button>`s that do nothing on click

1440's `dirPersonRow()` wraps each person's seat-line content in a live control:
```js
const seats = e ? '<li><button type="button" class="seat-row">' + esc(seatLine(e)) +
  wordEl(e.stage, 'word--inline') + '</button></li>' : '';
```
(`people-room-1440.html:684`) — a `<button>` with no `aria-disabled`, no `data-go`/`data-person`/`data-company`, and no `js-*` class the delegated click handler recognizes. It is reachable by Tab (confirmed part of the 72-act inventory and of round 7's own "71 focusable, 71 reached" count) and clicking it produces **no** change:

```
before {"html":145184,"status":"Directory","focus":"BODY"}
after  {"html":145184,"status":"Directory","focus":"BUTTON","focusText":"Okonkwo residence · sub · electrical · O"}
changed: false
```
(html length identical, status identical; the only effect is the button receiving focus, which any button does.) Eleven `.seat-row` buttons exist in the rendered DOM (every Directory person with an engagement); five are visible by default (F-11, F-18, F-12, F-15, F-27 — the `DIR_OPEN` set) and Tab-reachable on the plain `#state-directory` load; the other six become reachable the moment their row's "N seat(s)" disclosure is opened. All are equally inert.

**390 does not have this bug for the same content.** 390's equivalent line is a plain, non-interactive, focusable list item:
```js
out += '<li class="seat" tabindex="0">';
out += '<span class="seat-line">' + esc(seatLine(e)) + '</span>';
```
(`people-room-390.html:781-783`) — `tabindex="0"` but no `role="button"` and no button semantics, so it never promises an action it can't perform.

This is the exact fact pattern round 7 used to promote "Compare & merge" to blocking ("a real, focusable, enabled, non-`aria-disabled` button that does nothing on click"), it is new this round (no prior round's report names `.seat-row`), and it is a genuine cross-width inconsistency — 1440 over-promises interactivity that 390 correctly avoids for identical content. **Severity: BLOCKING. Confidence: HIGH** (empirically reproduced with an isolated, instrumentation-order-corrected click test).

#### R8-2 — a wider pattern of enabled, un-handled acts across both files (same acts, same behavior, both widths — not a cross-width disagreement)

The delegated click handler in both files recognizes only `[data-go]`, `.js-disclose`, `.js-save-authority`, `.js-authority`, `.js-putback`, `.js-kind`, `.js-pick`, `.js-lens`, `[data-company]`, `[data-person]` / `[data-open-person]`. The following acts carry none of those and are enabled (no `aria-disabled`) at both widths; clicking each produces zero `body.innerHTML` change and zero `role="status"` change:

| State | Act label | Where |
|---|---|---|
| `#state-person` | "Edit the rule" | Contact rule region |
| `#state-person` | "Revoke" | Access grants region |
| `#state-person` | "Send a text" | bottom of card |
| `#state-company` | "Record a document" | Paper region act row |
| `#state-company` | "Chase the renewal" | Paper region act row (`aria-describedby="chase-why"`, not `aria-disabled`) |
| `#state-roster` | "Text" | Dana Kowalski's unfolded seat |
| `#state-roster` | "Copy field link" | Dana Kowalski's unfolded seat |
| `#state-roster` | "Show to client" | Dana Kowalski's unfolded seat |
| `#state-roster` | "Close this seat" | Dana Kowalski's unfolded seat |
| `#state-pick` | "Add four to the roster" | act row, default (4-of-5-selected) state |
| `#state-add` | "Add to the roster" | terminal act |
| `#state-access` | "Save this note" | inside the "Log who was told" disclosure (only reachable after opening it — separately confirmed) |

Sample evidence (identical shape for every row above):
```
{"width":1440,"state":"state-person","text":"EDIT THE RULE", "ariaDisabled":null, "changed":false, "statusBefore":"Person card","statusAfter":"Person card"}
{"width":390, "state":"state-person","text":"EDIT THE RULE", "ariaDisabled":null, "changed":false, "statusBefore":"Person card","statusAfter":"Person card"}
```
(and equivalently for every other row in the table, both widths — 22 total click observations, all `changed:false`, all `err:null`, all reached without a Playwright timeout.)

**Judgment call, reported not resolved.** Under this round's own literal blocking rubric ("unreachable or inert act"), every row above is blocking, the same criterion round 7 used to promote Compare & Merge. But there is a real difference from the Compare & Merge case worth weighing at synthesis: these acts are not mystery buttons — most sit directly beneath a consequence sentence explaining what they represent ("This drafts a note to Northgate Electric's paperwork contact… Nothing is sent until you send it."; "Nothing sends until you send it." on Send a text), consistent with the product's own drafts-land-`awaiting_review` model (AGENTS.md: "No automated external sends"), and none of them were flagged as findings across six prior review rounds (only Compare & Merge was, and direction.md named that one specifically as a deferred phase-2 feature — these were not). One item, "Draw 1 waiver ledger, in the money book" (`#state-company`), is explicitly excluded from this list: SPEC §5.3 #7 itself calls it "a read-only line … as an inline act," so its inertness is spec'd, not a defect.

**Severity: reported as BLOCKING per this round's literal rubric (12 distinct act/state pairs, both widths). Confidence: HIGH that each is empirically inert; MEDIUM on whether the rubric should apply to this whole class the way it did to the single Compare & Merge case** — flagging for synthesis rather than silently downgrading.

---

## 4. Duplicate band — both names open the right card, both widths

Already detailed in §1; repeated here per the brief's explicit ask:

```
1440 Adaeze Okonkwo → #state-person, card-name "Adaeze Okonkwo"
1440 Chidi Okonkwo  → #state-person, card-name "Chidi Okonkwo"
390  Adaeze Okonkwo → #state-person, card-name "Adaeze Okonkwo"
390  Chidi Okonkwo  → #state-person, card-name "Chidi Okonkwo"
```
**Correct at both widths.**

---

## 5. SPEC §10 checks, both files (pasted)

```
$ tail -1 people-room-1440.html
<!-- specimen-complete -->
$ tail -1 people-room-390.html
<!-- specimen-complete -->

$ grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled' people-room-1440.html people-room-390.html
people-room-1440.html:0
people-room-390.html:0

$ wc -c people-room-1440.html people-room-390.html
   97560 people-room-1440.html
  103851 people-room-390.html
  201411 total

$ diff <(sed -n '11,90p' people-room-1440.html) _tokens-reference.css
80d79
< }
$ diff <(sed -n '11,90p' people-room-390.html) _tokens-reference.css
80d79
< }
   (both add exactly the one instructed closing brace, otherwise byte-identical)

$ diff <(sed -n '92,139p' people-room-1440.html) <(sed -n '9,56p' _people-style-fragment.html)
(exit 0 — byte-identical)
$ diff <(sed -n '92,139p' people-room-390.html) <(sed -n '9,56p' _people-style-fragment.html)
(exit 0 — byte-identical)
$ diff <(sed -n '92,139p' people-room-1440.html) <(sed -n '92,139p' people-room-390.html)
(exit 0 — byte-identical to each other too)

$ grep -oE '<h1[ >]' people-room-1440.html | wc -l; grep -oE '<h1[ >]' people-room-390.html | wc -l
1
1

$ grep -c 'role="status"' people-room-1440.html; grep -c 'role="status"' people-room-390.html
1
1

$ grep -c '<style' people-room-1440.html; grep -c '<script' people-room-1440.html
1
1
$ grep -c '<style' people-room-390.html; grep -c '<script' people-room-390.html
1
1

$ awk 'NR>90' people-room-1440.html | grep -coE '#[0-9A-Fa-f]{3,8}\b'
0
$ awk 'NR>90' people-room-390.html | grep -coE '#[0-9A-Fa-f]{3,8}\b'
0

$ grep -noE 'https?://[^"'"'"' )]+' people-room-1440.html
7:https://fonts.googleapis.com
8:https://fonts.gstatic.com
9:https://fonts.googleapis.com/css2?family=Playfair+Display:...&display=swap
$ grep -noE 'https?://[^"'"'"' )]+' people-room-390.html
(identical three lines)

$ grep -inE '\bAI\b|dashboard|wizard|badge|pill|chip|modal|toast|spinner|StatusDot' people-room-1440.html people-room-390.html
people-room-390.html:179:  /* ── Chips and lens words ─── */
(a CSS comment, never rendered; substring of "Chips" not the word "chip"; same low-confidence note as prior rounds, not counted)

$ grep -inE 'Lorem|sample|TBD' people-room-1440.html people-room-390.html
(0 matches, both files)

$ grep -E '[^-]\bdisabled\b' people-room-1440.html; echo "exit=$?"
exit=1
$ grep -E '[^-]\bdisabled\b' people-room-390.html; echo "exit=$?"
exit=1

$ grep -n "Compare & merge\|Compare them?" people-room-1440.html people-room-390.html; echo "exit=$?"
exit=1
```

Every §10 check passes on both files. Identical to round 7's own figures except the file sizes (both grew slightly from the R-Y/R-Z edits) and the new "Compare & merge" absence check.

---

## 6. Render, all seven states, both widths (console summaries pasted)

```
$ node tools/render.mjs specimens/people-room-1440.html --out review/r8-shots \
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

$ node tools/render.mjs specimens/people-room-390.html --out review/r8-shots \
    --name people-room-390 --widths 390 \
    --hashes state-directory,state-person,state-company,state-roster,state-pick,state-add,state-access --console
✓ people-room-390-state-directory-390.png
✓ people-room-390-state-person-390.png
✓ people-room-390-state-company-390.png
✓ people-room-390-state-roster-390.png
✓ people-room-390-state-pick-390.png
✓ people-room-390-state-add-390.png
✓ people-room-390-state-access-390.png
Console log: people-room-390-console.json (7 captures)
```

(First attempt at both, without disabling the sandbox, failed identically with the documented Mach-port bootstrap error, confirming the sandbox — not the specimen — was the cause; both succeeded once the sandbox was disabled.)

Console JSON, both files, all 14 captures:

```
1440: state-directory []/[]/false   state-person []/[]/false   state-company []/[]/false
      state-roster []/[]/false      state-pick []/[]/false     state-add []/[]/false
      state-access []/[]/false
390:  state-directory []/[]/false   state-person []/[]/false   state-company []/[]/false
      state-roster []/[]/false      state-pick []/[]/false     state-add []/[]/false
      state-access []/[]/false
(format: errors[]/warnings[]/horizontalOverflow)
```

Zero errors, zero warnings, zero overflow on all 14 captures, both files.

All fourteen plates viewed full-page. No clipping, truncation, or visual break found on any plate at either width. The duplicate band renders as the ruled sentence + two names at both widths (screenshot-confirmed, matching §1/§4 above). Company card's Paper table, Directory's word columns, the roster's bands and Dana's unfold, the pick screen's five rows, the add sheet's full field set and both authority branches, and the access card's six regions all match SPEC §5 content and §6 width treatment on sight.

---

## 7. Seven default states, cross-width innerText diff

Method note: a first pass diffing raw (CSS-rendered) `innerText` reported 66 "diffs" on `#state-directory`, every one of them a pure case artifact (`TEXTING` vs `Texting`) — the `.word` class's `text-transform: uppercase` applies at 1440 where these are bordered `.word` boxes, while 390 renders the same underlying text as plain inline words per the SPEC §6.2-named R-M layout difference (no `.word` box, no uppercase transform). Lower-casing both sides before the multiset diff (removing the CSS-transform artifact, not the fact) gives:

```
state-directory  1440:217  390:217  diffs:0
state-person     1440:70   390:71   diffs:1   (licensed "Channel" header repeat)
state-company    1440:77   390:98   diffs:21  (licensed table→stack header repeat)
state-roster     1440:291  390:291  diffs:0
state-pick       1440:70   390:70   diffs:0
state-add        1440:48   390:48   diffs:0
state-access     1440:35   390:35   diffs:0
```

Identical to round 7's own figures (`state-directory` now checked directly here and confirmed at 0; the other six match exactly). **No regression, and the two nonzero counts are exactly the previously-licensed table→label-stack artifact SPEC §6.2 names.**

---

## 8. Other round-7 findings, re-confirmed unchanged (not re-litigated, status only)

| ID | Status this round | Evidence |
|---|---|---|
| DR6-4 — Marrow & Sons crew order differs by width | **Still open**, unchanged. 1440's `crewOf(cid)` returns `FIXTURE.persons` filter order (Tom, Erin, Luis); 390's `crewOf(cid)` orders by `designations` (paperworkContact→signer→siteContact = Erin, Tom, Luis) | `people-room-1440.html:781`; `people-room-390.html:984-993` |
| DR6-5 — routed-contact clause names "Write Rosa Delgado" twice back to back | **Still open**, unchanged, both widths | `routeWrite()` unchanged in both files; visible on both Directory plates: "Do not contact directly. Write Rosa Delgado instead." then "Write Rosa Delgado · rosa@twincitiesdrywall.com · (612) 555-0114" |
| CR3-6/CR2-9/CR4-3 — no schedule-authority sentence in the fixture | **Still open**, no fixture field exists | unchanged |
| CR3-7/CR2-10/CR4-4 — "Holds a key" reads identically for the true key holder and access-tier grantees | **Still open**. `ACCESS_WORDS['key']` → literal `"Holds a key"` for F-04/F-05/F-06 alike | `people-room-1440.html:774` |
| CR2-7/CR3-4/CR4-1 — "licence" spelling | Informational only — matches SPEC's own literal fixture text (`grep -c licence`: 1440=5, 390=4), not a defect | unchanged |

---

## 9. Summary

```
clean: false

BLOCKING (2 open):
  R8-1  — NEW this round. 1440-only: 5 (of 11) Directory "seat" lines are real, focusable,
          enabled <button>s with no click handler — clicking produces zero DOM/status change.
          390 correctly renders the same content as a non-button, non-role focusable <li>.
          Cross-width behavioral inconsistency. High confidence.
  R8-2  — NEW this round, reported per this round's literal "inert act" rubric. 12 distinct
          act/state pairs, both widths, consistently un-handled (Edit the rule, Revoke, Send a
          text, Record a document, Chase the renewal, Text, Copy field link, Show to client,
          Close this seat, Add four to the roster [enabled state], Add to the roster, Save this
          note). High confidence each is empirically inert; medium confidence this deserves the
          same severity round 7 gave the single Compare & Merge case, since these carry
          consequence-sentence framing consistent with the product's drafts-land-awaiting_review
          model and were never flagged in six prior rounds. Flagged for synthesis judgment, not
          silently downgraded. ("Draw 1 waiver ledger, in the money book" excluded — SPEC §5.3 #7
          calls it read-only by name.)

MAJOR (0 open)

MINOR (4 open, all carried from round 7, none new):
  DR6-4  — Marrow & Sons crew order differs by width — high confidence
  DR6-5  — routed-contact clause names "Write Rosa Delgado" twice back to back, both widths — high confidence
  CR3-6/CR2-9/CR4-3 — no schedule-authority sentence in the fixture — high confidence, low actionability
  CR3-7/CR2-10/CR4-4 — "Holds a key" reads identically for the true key holder and two access-tier grantees — high confidence

INFORMATIONAL (not findings):
  CR2-7/CR3-4/CR4-1 — "licence" spelling matches SPEC's own literal text
  "Chips and lens words" CSS comment — never rendered

FIXED this round (verified independently, not by trusting the fix log):
  R7-1              — 390 state-bar Tab-sequence drop (R-Z) — fixed, re-verified all 7 states × both widths,
                       plus the click-sequence walk
  CR2-8/CR3-5/CR4-2 — "Compare & merge" inert act (R-Y) — fixed by removal; duplicate band's two
                       names verified to open their own cards at both widths
```

`clean` is **false**. R7-1 and the previously-carried Compare & Merge finding are both genuinely fixed and independently re-verified this round. Two new blocking findings surfaced under this round's own exhaustive click-every-button sweep (which no prior round ran): R8-1 (a clear, high-confidence, cross-width builder inconsistency) and R8-2 (a broader pattern reported at the same severity round 7 used for Compare & Merge, with an explicit note on the judgment call involved, per "report every finding, never filter"). Four minor items carry forward unchanged from round 7.
