# Round 9 — targeted verification, after `fix-log-r8.md`

Files: `specimens/people-room-1440.html` (97,592 bytes), `specimens/people-room-390.html` (104,105 bytes). Rulings `rulings.md` §3 (R-A..R-AB) read first and treated as settled, not findings — R-AB in particular makes the twelve named write-acts (Edit the rule, Revoke, Send a text, Record a document, Chase the renewal, Text, Copy field link, Show to client, Close this seat, Add four to the roster, Add to the roster, Save this note) deliberately inert by ruling, so `review/8-targeted.md`'s R8-2 is not re-litigated here as a finding.

All evidence below comes from fresh Playwright runs against the files on disk this round, written independently of `fix-log-r8.md`'s own claims (not trusting the fix log). Chromium reproduced the documented Mach-port bootstrap error under the default sandbox on the first attempt of every render/Playwright command in this round; every command below ran with the sandbox disabled after that reproduction, per the task's own note.

---

## 1. R8-1 — Directory seat lines open the right person card, click and Enter, both widths

**FIXED. Independently re-verified**, not by trusting `fix-log-r8.md`.

Method: for each of the 11 Directory people who carry an engagement (F-04, F-05, F-07, F-08, F-09, F-11, F-18, F-12, F-14, F-15, F-27 — the twelfth Directory person with an engagement slot, Claire Bissett F-20, carries none and so renders no seat line), a fresh page load at `#state-directory`, the seat's own disclosure opened by its `aria-controls`/`data-disc` id (not a blanket toggle-all, which mis-fires because the disclose control is a true toggle — `aria-expanded` flips on every click, so re-clicking an already-open row's control would re-close it), then the seat control activated once by mouse click and once, on a fresh load, by focus + <kbd>Enter</kbd>.

1440 markup (`people-room-1440.html:684`): `<button type="button" class="seat-row" data-person="<pid>">`, delegated by the existing `[data-person]` click handler (`people-room-1440.html:1607-1608`).
390 markup (`people-room-390.html:784`): `<button type="button" class="seat" data-open-person="<pid>">`, delegated by `[data-open-person]` (`people-room-390.html:1510-1513`).

Result, all 44 activations (11 seats × click/Enter × 2 widths):

| Width | Mode | Seats tested | Landed on `#state-person` | `role="status"` = "Person card" | `h2.card-name` matched the seat's person | Console/page errors |
|---|---|---|---|---|---|---|
| 1440 | Click | 11/11 | 11/11 | 11/11 | 11/11 | 0 |
| 1440 | Enter | 11/11 | 11/11 | 11/11 | 11/11 | 0 |
| 390 | Click | 11/11 | 11/11 | 11/11 | 11/11 | 0 |
| 390 | Enter | 11/11 | 11/11 | 11/11 | 11/11 | 0 |

Per-seat card-name evidence (identical result for click and Enter, both widths):

```
F-04 -> Adaeze Okonkwo    F-08 -> Erin Sato       F-14 -> Rosa Delgado
F-05 -> Chidi Okonkwo     F-09 -> Luis Ochoa      F-15 -> Frank Bauer
F-07 -> Tom Marrow        F-11 -> Dana Kowalski   F-27 -> Ray Thao
F-18 -> Joe Wozniak       F-12 -> Pete Rusk
```

44/44 activations opened the correct card, at both widths, by both input modes. Zero page errors, zero console errors across all runs (verified with `page.on('pageerror')` / `page.on('console')` listeners attached before every navigation).

Note on methodology: an initial pass read `role="status"` immediately after `click()`/`Enter` resolved and saw stale text ("Directory", or, at 390, "Unfolded" — the disclosure's own `say('Unfolded')` from opening it) on a handful of rows. This was a harness race, not a page defect: `goto()`/`location.hash = state` updates `location.hash` synchronously but the `hashchange` listener that calls `announce(NAMES[state])` (1440) / `say(STATE_NAMES[h.state])` (390) runs on the next task, after the click handler returns. Waiting for the status text itself to settle to "Person card" (not just for the hash to change) before reading it removed the raciness; the table above uses that corrected method. This is documented here so the discrepancy in interim output isn't mistaken for a real inconsistency.

## 2. Element ids equal to a `state-*` token

```
$ grep -c 'id="state-' specimens/people-room-1440.html specimens/people-room-390.html
specimens/people-room-390.html:0
specimens/people-room-1440.html:0
```

Full attribute scan (not just the literal substring):

```
people-room-1440.html total ids: 30, bad matches (== a state-* token): []
people-room-390.html  total ids: 27, bad matches (== a state-* token): []
```

**Clean, both files.** (Total id counts are higher than round 8's 26/22 because this round's fresh render/interaction passes leave more dynamically-created panel ids in the captured DOM snapshot at the moment of scanning; the count that matters — bad matches — is 0 in both, as in round 8.)

## 3. Tab order, all seven states, both widths — first Tab lands on the state bar's Directory button

Fresh browser context per (width, hash) pair, 14 loads total:

```
1440 state-directory -> BUTTON "Directory"   1440 state-add     -> BUTTON "Directory"
1440 state-person    -> BUTTON "Directory"   1440 state-access  -> BUTTON "Directory"
1440 state-company   -> BUTTON "Directory"   390  state-directory -> BUTTON "Directory"
1440 state-roster    -> BUTTON "Directory"   390  state-person    -> BUTTON "Directory"
1440 state-pick      -> BUTTON "Directory"   390  state-company   -> BUTTON "Directory"
                                              390  state-roster    -> BUTTON "Directory"
                                              390  state-pick      -> BUTTON "Directory"
                                              390  state-add       -> BUTTON "Directory"
                                              390  state-access    -> BUTTON "Directory"
```

14/14 loads: the first Tab stop is `<button class="act act--tertiary">Directory</button>` in the state bar. Zero page/console errors on any of the 14 loads.

Full state-bar Tab sequence from a `#state-directory` load, both widths, first 7 stops all match the bar order exactly:

```
1440: Directory, Person card, Company card, Project roster, Bring forward, Add sheet, Site access, [MINE — first face control]
390:  Directory, Person card, Company card, Project roster, Bring forward, Add sheet, Site access, [Everyone — first face control]
```

This reconfirms R7-1/R-Z (the `id="face-<state>"` fix, unrelated to this round's edit) is still holding — consistent with, and independently reproduced without relying on, `review/8-targeted.md` §1.

## 4. SPEC §10 checks, both files

```
$ tail -1 people-room-1440.html; tail -1 people-room-390.html
<!-- specimen-complete -->
<!-- specimen-complete -->

$ grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled' people-room-1440.html people-room-390.html
people-room-1440.html:0
people-room-390.html:0

$ wc -c people-room-1440.html people-room-390.html
   97592 people-room-1440.html
  104105 people-room-390.html

$ grep -E '[^-]\bdisabled\b' people-room-1440.html; echo exit=$?
exit=1
$ grep -E '[^-]\bdisabled\b' people-room-390.html; echo exit=$?
exit=1

$ grep -n "Compare & merge\|Compare them?" people-room-1440.html people-room-390.html; echo exit=$?
exit=1
```

**Check 1 (last line) and check 2 (forbidden patterns): PASS, both files.**

**Check 6 (token block + class fragment byte for byte):** re-diffed independently against `_tokens-reference.css` and `_people-style-fragment.html`.

```
$ diff <(sed -n '11,90p' people-room-1440.html) _tokens-reference.css
80d79
< }
$ diff <(sed -n '11,90p' people-room-390.html) _tokens-reference.css
80d79
< }
```
Both files add exactly the one instructed closing brace, otherwise byte-identical to the reference — matches §2's "plus the one appended `}`" instruction.

```
$ diff <(sed -n '92,139p' people-room-1440.html) <(sed -n '9,56p' _people-style-fragment.html); echo exit=$?
exit=0
$ diff <(sed -n '92,139p' people-room-390.html) <(sed -n '9,56p' _people-style-fragment.html); echo exit=$?
exit=0
$ diff <(sed -n '92,139p' people-room-1440.html) <(sed -n '92,139p' people-room-390.html); echo exit=$?
exit=0
```
Byte-identical to the reference fragment and to each other. **PASS, both files.**

**Check 4 (every name, firm, phone on the face is in §3's JSON):** fixture parsed from SPEC §3 (29 persons, 22 companies, 28 distinct phone strings anywhere in the JSON). Combined `innerText` + form-control `value`s across all seven states, both widths:

```
1440: 24 distinct phone strings on the face+field-values, 0 outside the fixture's 28
390:  24 distinct phone strings on the face+field-values, 0 outside the fixture's 28
```

Two-or-three-capitalized-word phrase scan (candidate name/firm strings), both files: 102 candidates, both files' "unexplained" sets (i.e. not a fixture name, not a fixture firm, not a substring match of either) are byte-identical between widths and consist entirely of UI chrome — state-bar labels, region sub-heads, status words, and address fragments (`PERSON CARD`, `SEATS ON PROJECTS`, `WHO WAS TOLD`, `Fremont Ave`, `Minneapolis MN`, etc.) — never a stray person or firm name. **PASS, both files, no name/firm/phone on either face falls outside the fixture.**

**Check 3 (every §5 acceptance string appears, spelled exactly):** 175 double-quoted candidate strings extracted from SPEC §5 (a coarser, non-deduplicated extraction than round 8's 162 — this round's method keeps every literal occurrence, including the three illustrative examples under §5.8's shared-sentence rules). Checked case-sensitively against combined `innerText` + form values, both files:

```
1440: 62 misses (of 175)
390:  55 misses (of 175)
```

Every miss falls into one of five explainable classes, confirmed by direct inspection, none of which is a content gap:

1. **Attribute values, not visible text** — `group`, `true`, `status` (from `role="group"`, `aria-pressed="true"`, `role="status"`), `tel:+16125550111` (an `href`, not `innerText`).
2. **CSS-uppercase-transform artifacts** — region sub-heads (`Reach & access`, `Channels`, `Access grants`, `Seats on projects`, `Past seats`, `Paper`, `History`, `Crew & designations`, `Payee`, `Jobs`, `Studio side`, `Client side`, `On the job · this week`, `On the job · later`, `Bidding`, `Done`, `Who to call first`, `The way in`, `Key holder`, `Hours`, `Receiving`, `Who was told`) and several act labels (`Edit the rule`, `Revoke`, `Send a text`, `Record a document`, `Chase the renewal`, `Close this seat`, `Log who was told`, `Confirm from the agreement`, `Record the authority`, `Put back`, `What travels`, `What stays behind`) render through a small-caps/uppercase CSS transform; `innerText` returns the rendered case, so a literal-case `includes()` check misses them even though the words are correctly on the face (confirmed visually on every rendered plate in §6 below).
3. **Settled-absent by ruling (R-Y)** — `Compare & merge`, `Compare them?`: correctly absent per the duplicate-band ruling, not a defect.
4. **Branch-conditional text not on the open branch** — `No paper is held for this firm.`, `Not on file` (the alternate Paper-region branch for a lender/inspector-only firm, not Northgate Electric, which is the one open on this fixture's `#state-company`), `Defaulted from the agreement. Confirm it, or write a different one.` (the other authority branch, not Joe Wozniak's own `#state-add` branch), `Remove` (deliberately never present, per §5.4 #14 — its absence is the acceptance criterion, not a miss).
5. **SPEC's own abbreviated-date shorthand vs. the specimen's full-month rendering** — `<Source> consent, <d Mon yyyy>, on the <project>.` is a literal template pattern, never meant to render verbatim; `Verbal consent, 13 Oct 2026, on the Okonkwo residence.` and `Opted out by text, 3 Dec 2025, on the Lindqvist kitchen.` are SPEC §5.8's own shorthand examples — the rendered face spells the month in full ("13 October 2026", "3 December 2025", confirmed on the round-8 and this round's own Directory plate screenshots for Pete Rusk's row).

**The 7-item difference between the two files' miss sets is itself explained and expected:** `Lapsed`, `Texting`, `On paper` (×4), `Not asked` miss only at 1440. At 1440 these are `.word` chips rendered with a CSS uppercase transform (`LAPSED`, `TEXTING`, `ON PAPER`); at 390, per ruling R-M, the same words render as **plain inline text with natural case** (no border, no uppercase) — so they match this round's case-sensitive check at 390 but not at 1440. This is the same R-M-licensed plain-vs-bordered-word difference SPEC §6.2 names, independently reproduced by this round's own diff rather than assumed from the fix log.

**PASS, both files** — every miss is one of the five explainable classes above; no unexplained content gap on either face.

## 5. Render, both widths — console summaries pasted

```
$ node tools/render.mjs specimens/people-room-1440.html --out review/9-shots --name people-room-1440 \
    --widths 1440 --hashes state-directory,state-person,state-company,state-roster,state-pick,state-add,state-access --console
✓ people-room-1440-state-directory-1440.png
✓ people-room-1440-state-person-1440.png
✓ people-room-1440-state-company-1440.png
✓ people-room-1440-state-roster-1440.png
✓ people-room-1440-state-pick-1440.png
✓ people-room-1440-state-add-1440.png
✓ people-room-1440-state-access-1440.png
Console log: people-room-1440-console.json (7 captures)

$ node tools/render.mjs specimens/people-room-390.html --out review/9-shots --name people-room-390 \
    --widths 390 --hashes state-directory,state-person,state-company,state-roster,state-pick,state-add,state-access --console
✓ people-room-390-state-directory-390.png
✓ people-room-390-state-person-390.png
✓ people-room-390-state-company-390.png
✓ people-room-390-state-roster-390.png
✓ people-room-390-state-pick-390.png
✓ people-room-390-state-add-390.png
✓ people-room-390-state-access-390.png
Console log: people-room-390-console.json (7 captures)
```

(Both commands failed identically on the first attempt with the documented Mach-port bootstrap error under the default sandbox; both succeeded once the sandbox was disabled, matching the task's own note.)

Console JSON, both files, all 14 captures:

```
1440: state-directory errors:0 warnings:0 overflow:false   state-add     errors:0 warnings:0 overflow:false
      state-person    errors:0 warnings:0 overflow:false   state-access  errors:0 warnings:0 overflow:false
      state-company   errors:0 warnings:0 overflow:false
      state-roster    errors:0 warnings:0 overflow:false
      state-pick      errors:0 warnings:0 overflow:false
390:  state-directory errors:0 warnings:0 overflow:false   state-add     errors:0 warnings:0 overflow:false
      state-person    errors:0 warnings:0 overflow:false   state-access  errors:0 warnings:0 overflow:false
      state-company   errors:0 warnings:0 overflow:false
      state-roster    errors:0 warnings:0 overflow:false
      state-pick      errors:0 warnings:0 overflow:false
```

**Zero errors, zero warnings, zero horizontal overflow, all 14 captures, both files.**

All 14 plates (`review/9-shots/*.png`) viewed full-page. No clipping, truncation, overlap, or visual break found on any plate at either width:

- **1440**: Directory (duplicate band + 12 people + 6 firm rows), Person card (Dana Kowalski, all regions with sub-heads), Company card (Northgate Electric, Paper table → clause → consequence → acts, in R-P order), Project roster (Studio/Client/this-week/later/Bidding/Done bands, Dana's row unfolded), Bring forward (5 mini rows + "What travels"/"What stays behind" pane beside the list), Add sheet (all fields, both authority-branch text visible for this fixture's branch), Site access (all six regions).
- **390**: same seven states, single-column stack, table→label-stack conversions on Person/Company cards as documented, pick pane below the list rather than beside it, add-sheet fields full width — all per §6.2's named width rules, nothing clipped or overlapping at 390's narrow column.

## 6. Seven default states, cross-width `innerText` diff

Method: fresh navigation per (width, state), whitespace-tokenized and lower-cased, multiset diff (this round's own independent method, not `review/8-targeted.md`'s line-count method — the two methods necessarily produce different raw totals, but converge on the same conclusion below).

```
state-directory  1440:530 tokens  390:551 tokens  diff: 21 tokens, all "·" (51 vs 72 occurrences) — R-M plain-word-vs-bordered-word separator difference
state-person     1440:267 tokens  390:268 tokens  diff: 1 token, "channel" (1 vs 2) — licensed table-header-vs-per-row-label repeat (2 channels at 390 = 2 "Channel" labels; 1 table header at 1440)
state-company    1440:218 tokens  390:242 tokens  diff: 24 tokens, "type"/"number"/"issuer"/"expires"/"state"/"held"/"by"/"blocks" (1 vs 4 each) — licensed table-header-vs-per-row-label repeat (4 paper rows at 390 = 4 label sets; 1 table header row at 1440)
state-roster     1440:732 tokens  390:732 tokens  diff: 0
state-pick       1440:230 tokens  390:230 tokens  diff: 0
state-add        1440:149 tokens  390:149 tokens  diff: 0
state-access     1440:170 tokens  390:170 tokens  diff: 0
```

Four of seven states are token-for-token identical across widths. The three non-zero states differ **only** in the exact table→stack and plain-word/bordered-word transformations SPEC §6.2 licenses (and that round 8's own §7 independently identified as "the licensed table→label-stack artifact" and "the R-M layout difference") — no foreign word, no missing fact, no cross-width content drift. **No regression; matches round 8's own conclusion, reached here by an independent method.**

## 7. Carried-forward minor findings (from round 8, out of this round's scope, status only — not re-litigated)

Not touched by `fix-log-r8.md` (which scoped to R-AA/R-AB only) and confirmed still present, spot-checked this round:

| ID | Status | Evidence |
|---|---|---|
| DR6-4 — Marrow & Sons crew order differs by width | Still open, unchanged | 1440 `crewOf()` (`:781`) returns `FIXTURE.persons` filter order; 390 `crewOf()` (`:986-993`) orders by `designations` (paperworkContact→signer→siteContact) |
| DR6-5 — routed-contact clause names "Write Rosa Delgado" twice back to back | Still open, unchanged, both widths | `routeWrite()`-driven clause text unchanged in both files' fixture data (`"text": "Do not contact directly. Write Rosa Delgado instead."` at `people-room-1440.html:478` / `people-room-390.html:464`, followed by the "Write Rosa Delgado · …" line) |
| CR3-6/CR2-9/CR4-3 — no schedule-authority sentence in the fixture | Still open, no fixture field exists | unchanged |
| CR3-7/CR2-10/CR4-4 — "Holds a key" reads identically for the true key holder and access-tier grantees | Still open | `ACCESS_WORDS['key']` → literal `"Holds a key"` for F-04/F-05/F-06 alike, both files (`people-room-1440.html:774`, `people-room-390.html:737`) |

These are unruled (not covered by R-A..R-AB) and were not in this round's brief to fix; carried forward for the record only.

## 8. Summary

```
clean: true

BLOCKING (0 open):
  R8-1 — FIXED, independently re-verified. 44/44 activations (11 seats × click/Enter × 2 widths)
         open the correct person card, land on #state-person, announce "Person card", zero errors.
  R8-2 — NOT a finding this round. Settled by ruling R-AB (rulings.md §3): the twelve named
         write-acts are deliberately inert by design, stay enabled/focusable beside their
         consequence sentences, carry no aria-disabled and no caveat. SPEC §7 rule 13 states
         this (confirmed present, both files, both files' act counts match: Edit the rule 1/1,
         Revoke 1/1, Send a text 1/1, Record a document 1/1, Chase the renewal 1/1, Text 6/6,
         Copy field link 6/6, Show to client 24/24, Close this seat 24/24, Add four to the
         roster 1/1, Add to the roster 1/1, Save this note 1/1 — all enabled, zero disabled,
         zero aria-disabled, at both widths).

MAJOR (0 open)

MINOR (4 open, all carried from round 8, none new, none in this round's scope):
  DR6-4, DR6-5, CR3-6/CR2-9/CR4-3, CR3-7/CR2-10/CR4-4 — see §7 above.

FIXED this round (verified independently):
  R8-1 — Directory seat lines, both widths, click and Enter, all 11 people with an engagement.
```

`clean` is **true**: zero OPEN blocking and zero OPEN major findings. R8-1 is fixed and independently reconfirmed against fresh Playwright runs, not the fix log's own account. R8-2 is not carried as a finding — it is exactly the behavior ruling R-AB settles, and SPEC §7 rule 13 correctly documents it. Element ids, Tab order (all seven states, both widths), SPEC §10 (all checks, both files), a clean fourteen-plate render (zero errors, zero warnings, zero overflow, no visual break on any plate), and the cross-width innerText diff (zero unexplained drift on any of the seven default states) all pass. Four unruled minor findings carry forward unchanged from round 8, out of this round's scope.
