# Combined design + technical review, round 7

Files: `specimens/people-room-1440.html` (97,564 bytes), `specimens/people-room-390.html` (103,338 bytes), against `specimens/SPEC.md` (§4, §5.1–§5.8, §6, §7, §8, §10) and `synthesis/direction.md` §3.8/§3.9. Prior rounds read first: `review/6-design.md`, `review/6-technical.md`, `review/fix-log-r6.md`, and `rulings.md` §3 (R-A..R-X, settled, not re-litigated).

Render tool: Chromium hits the Mach-port bootstrap error under the default Bash sandbox (`Check failed: kr == KERN_SUCCESS. bootstrap_check_in ... Permission denied (1100)`), reproduced once, then every render/Playwright command in this review ran with the sandbox disabled, per instruction.

All new evidence in this review comes from live Playwright renders/clicks/diffs against the files on disk, not from trusting prior reports.

## 0. Every round-6 finding, re-checked

| ID | Round-6 finding | Round-7 status | Evidence |
|---|---|---|---|
| DR6-1 / TR6-1 | 390's person card silently dropped the "Contact rule," "Access grants," "Seats on projects" regions (headers included) for any person lacking that fact, instead of 1440's explicit "No … on file." fallback | **Fixed.** `fix-log-r6.md`'s R-V applied the fallback branches. Re-verified independently: a fresh click-through of all 12 Directory persons at both widths (F-04, F-05, F-07, F-08, F-09, F-11, F-18, F-12, F-14, F-15, F-27, F-20) now shows 0 cross-width text differences per person except the two already-licensed table-header artifacts (F-14 and F-27's blank `Consent` column header, §6.2's own table→stack rule) — down from round 6's 2–4 differences on F-12/F-15/F-20/F-27. | Playwright click-through diff, this round (see §2 below) |
| DR6-2 | Company card crew-line: 1440 links only the name, 390 linked the whole descriptive sentence | **Fixed** via R-W. Re-verified: Northgate Electric's card at both widths now shows `<button … data-open-person/data-person>Dana Kowalski</button>` as the only interactive text, designations following as plain text | Screenshot crop, both `state-company` plates; DOM read confirms accessible name is "Dana Kowalski" only at both widths |
| DR6-3 | Site-access "who to call first" line: 1440 links only the digits, 390 links the whole line | **Not a finding — ruled.** R-X names this a deliberate mobile adaptation, in SPEC §6.2 itself ("At 390 that line is at least 44px tall … not a parity finding") | `rulings.md` R-X; `specimens/SPEC.md` §6.2 "Site access target" row |
| DR6-4 | Marrow & Sons crew order differs by width (1440: Tom Marrow, Erin Sato, Luis Ochoa; 390: Erin Sato, Tom Marrow, Luis Ochoa) | **Still open.** Not addressed by `fix-log-r6.md` (which covers only R-V and R-W). Re-confirmed live this round | See §3 below |
| DR6-5 | Routed-contact clause reads "…Write Rosa Delgado instead." immediately followed by "Write Rosa Delgado · …", naming her and the verb "Write" twice back to back | **Still open.** Not addressed by `fix-log-r6.md`. Re-confirmed live this round, identical at both widths | See §3 below |
| CR2-7/CR3-4/CR4-1 | "licence" British spelling | **Still present, correctly untouched** — it is the fixture/SPEC's own spelling (SPEC §5.3 #3 itself reads "MN electrical contractor licence"), not a builder defect | `grep -n licence` both files: fixture JSON + `licenceOf()`/`lic` helpers, both files |
| CR2-8/CR3-5/CR4-2 | "Compare & merge" band renders with no handler, click does nothing | **Still open — and reclassified.** Confirmed by a live click test: the button is focusable, enabled, `aria-disabled` absent, and clicking it produces zero DOM change and zero `role="status"` announcement at both widths. This round's own blocking definition ("unreachable or inert act") makes this **blocking**, not minor-and-parked as it read in round 6's carry-forward table | See §3 below |
| CR3-6/CR2-9/CR4-3 | No schedule-authority sentence in the fixture | **Still open.** No fixture field exists for it; unchanged | unchanged |
| CR3-7/CR2-10/CR4-4 | "Holds a key" reads identically for the one true key holder and two access-tier grantees | **Still open.** `ACCESS_WORDS['key']`/`accessWords('key')` return the literal "Holds a key" for F-04, F-05, and F-06 alike | `people-room-1440.html:774`, `:498-499,506`; same in 390 |

No prior finding is misreported as fixed here that the files contradict.

## 1. SPEC §10 checks, both files (pasted)

```
$ tail -1 people-room-1440.html
<!-- specimen-complete -->
$ tail -1 people-room-390.html
<!-- specimen-complete -->

$ grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled' people-room-1440.html people-room-390.html
people-room-1440.html:0
people-room-390.html:0

$ wc -c people-room-1440.html people-room-390.html
   97564 people-room-1440.html
  103338 people-room-390.html
  200902 total

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
(the only hit — a CSS comment, never rendered; substring of "Chips" not the word "chip"; §8 #4's ban is "anywhere on a face", and no face shows this comment. Not counted as a finding; noted for completeness at the same low-confidence tier round 6 gave `ADD_EXAMPLE`)

$ grep -inE 'Lorem|sample|TBD' people-room-1440.html people-room-390.html
(0 matches, both files)

$ grep -E '[^-]\bdisabled\b' people-room-1440.html; echo "exit=$?"
exit=1
$ grep -E '[^-]\bdisabled\b' people-room-390.html; echo "exit=$?"
exit=1
```

Every §10 check passes on both files.

## 2. Render, all seven states, both widths (console summaries pasted)

```
$ node tools/render.mjs specimens/people-room-1440.html --out review/r7-shots \
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

$ node tools/render.mjs specimens/people-room-390.html --out review/r7-shots \
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

Console JSON summary, both files, all 14 captures:

```
1440: state-directory []/[]/False   state-person []/[]/False   state-company []/[]/False
      state-roster []/[]/False      state-pick []/[]/False     state-add []/[]/False
      state-access []/[]/False
390:  state-directory []/[]/False   state-person []/[]/False   state-company []/[]/False
      state-roster []/[]/False      state-pick []/[]/False     state-add []/[]/False
      state-access []/[]/False
(format: errors[]/warnings[]/horizontalOverflow)
```

Zero errors, zero warnings, zero overflow on all 14 required captures, both files.

All fourteen plates viewed full-page (`review/r7-shots/people-room-{1440,390}-state-*.png`). Content, layout and word-treatment matched SPEC §5.1–§5.7 and §6 on every plate: Directory row grammar (bordered word columns at 1440, inline triplet at 390 per R-M), Dana Kowalski's person/company cards, the roster's bands and Dana's unfold, the pick screen's five rows and act row, the add sheet's full field set and both authority branches, and the access card's six regions in order. No clipping, truncation, or visual break found on any plate. (Full per-plate detail matches round 6's Part C spot checks, independently reproduced.)

## 3. Click-through: every person (12) and every company (6) card, both widths, innerText diff

Method: Playwright, native viewport per width, click each Directory-reachable row from `#state-directory`, dump `document.body.innerText`, tokenize on newline/tab/middle-dot, diff as multisets (a reordering never counts as a difference).

```
=== PERSONS ===
F-04 1440:39  390:39  diffs:0
F-05 1440:33  390:33  diffs:0
F-07 1440:34  390:34  diffs:0
F-08 1440:50  390:51  diffs:1   390-only:["channel"]              (licensed, §6.2 table→stack header repeat)
F-09 1440:36  390:36  diffs:0
F-11 1440:70  390:71  diffs:1   390-only:["channel"]              (licensed)
F-18 1440:47  390:47  diffs:0
F-12 1440:42  390:42  diffs:0
F-14 1440:43  390:43  diffs:2   1440-only:["consent"] 390-only:["channel"]   (licensed — blank Consent column, §6.2)
F-15 1440:39  390:39  diffs:0
F-27 1440:43  390:44  diffs:3   1440-only:["consent"] 390-only:["channel","channel"]  (licensed)
F-20 1440:27  390:27  diffs:0

=== FIRMS ===
marrow      1440:72  390:86  diffs:14  (licensed table-header repeat, 7 headers × 2 extra docs)
northgate   1440:77  390:98  diffs:21  (licensed, 7 headers × 3 extra docs)
tcdrywall   1440:40  390:40  diffs:0
stonehaven  1440:24  390:24  diffs:0
gnbank      1440:28  390:28  diffs:0
cped        1440:28  390:28  diffs:0

Console errors during the full click-through: 1440 [] · 390 []
```

Every person and firm card is now content-identical across widths except the licensed table→label-stack header-repeat class SPEC §6.2 itself authorizes (a table header prints once at 1440, once per document at 390). This directly confirms R-V's fix (DR6-1/TR6-1) is real and holds for all twelve people, not only the four spot-checked in round 6.

**One non-layout difference the multiset diff cannot show — token reordering — was found by reading the raw text directly:**

Marrow & Sons' "Crew & designations" region lists the same three people in a different order at each width:

```
1440: Tom Marrow · owner, signer · signer
      Erin Sato · project manager · paperwork contact
      Luis Ochoa · superintendent · site contact

390:  Erin Sato · project manager · paperwork contact
      Tom Marrow · owner, signer · signer
      Luis Ochoa · superintendent · site contact
```

This is **DR6-4, still open** — 1440's `crewOf()` returns fixture order; 390's `crewOf()` (fix-log-r6.md's own D2 area of the file) builds the list from `designations` first. Same underlying facts, different reading order for the same firm at each width.

## 4. Seven default states, cross-width innerText diff

```
state-directory  1440:216  390:216  diffs:0
state-person     1440:70   390:71   diffs:1   (licensed "Channel" header repeat)
state-company    1440:77   390:98   diffs:21  (licensed table-header repeat)
state-roster     1440:291  390:291  diffs:0
state-pick       1440:70   390:70   diffs:0
state-add        1440:48   390:48   diffs:0
state-access     1440:35   390:35   diffs:0
```

Identical to round 6's own figures — no regression, and the two remaining diff counts are exactly the licensed table→stack artifact.

## 5. Keyboard: Tab through `#state-directory` and `#state-pick`, both widths

**1440 — clean.** Loading `#state-directory` and pressing Tab from the top reaches, in DOM order: all 7 state-bar buttons (Directory → Site access), the MINE/STUDIO lens toggle, all 6 "Narrow the book" chips, the 8 trade chips, "Compare & merge," then every Directory row's open-button/`tel:`/seats-disclosure triplet in order, then the 6 firm rows — 71 focusable elements, 71 reached by Tab, 12 of 12 `tel:` links reached. `#state-pick` similarly reaches all 15 focusable elements (7 state-bar buttons, the search field, 5 checkboxes, "Add four to the roster," "Put back") with none `aria-disabled`.

**390 — a new blocking defect, R7-1.** Loading `#state-directory` and pressing Tab from the top skips the entire state bar — Tab's first stop is "Everyone," not "Directory." Only 64 of the section's 71 focusable elements are reached (the missing 7 are exactly the state bar's 7 buttons: Directory, Person card, Company card, Project roster, Bring forward, Add sheet, Site access). `#state-pick` shows the identical shape: 8 of 15 reached (search field, 5 checkboxes, "Add four to the roster," "Put back" — everything genuinely inside the pick screen is fine and none is `aria-disabled`), but again the 7 state-bar buttons are gone from the tab sequence.

**Root cause, isolated and confirmed:** 390's state `<section>` elements carry `id="state-directory"`, `id="state-person"`, etc. — identical strings to the URL hash tokens (`specimens/people-room-390.html:327-333`), because 390's switch loop reads `document.getElementById(s).hidden = (s !== h.state)` for `s` in `STATES` (`:1477`) and two more direct `getElementById('state-roster')` / `getElementById('head-count')`-adjacent calls (`:1445, :1480`) — the ids are load-bearing for the switcher itself. 1440's sections instead carry a *different* id family, `id="face-directory"` etc. (`specimens/people-room-1440.html:346-352`), mapped from the hash via a lookup object (`:1455-1456` and following) that never equals the hash text.

Whenever a navigation's URL fragment exactly matches an element's `id`, Chromium moves the page's sequential focus-navigation starting point to that element (this is the browser's normal "scroll to the fragment target" behavior extending to focus, not a bug in the test tool) — even though the target itself has no `tabindex` and is never focused visibly. Everything before that element in DOM order — here, the state bar, which is the first thing in the document — permanently drops out of the Tab sequence. Isolated with four direct tests:

```
390, no hash              → first 3 Tabs: Directory, Person card, Company card   (bar reachable)
390, #state-directory     → first 3 Tabs: Everyone, Clients, Crew                 (bar NOT reachable)
390, #state-directoryX    → first 3 Tabs: Directory, Person card, Company card   (bar reachable — non-matching hash, no id collision)
390, #nobar,state-directory → first 3 Tabs: Everyone, Clients, Crew              (bar NOT reachable — same id collision)
```

And it reproduces identically on **every one of the seven states**, because every state's hash token is by construction identical to that state's section id:

```
390 first-Tab-target per state, loaded via its own hash:
state-directory → "Everyone"                        (expected "Directory")
state-person    → "(612) 555-0111"                   (expected "Directory")
state-company   → "Dana Kowalski"                    (expected "Directory")
state-roster    → "Open the site access card"        (expected "Directory")
state-pick      → "" (first pick checkbox)            (expected "Directory")
state-add       → "a client"                          (expected "Directory")
state-access    → "Luis Ochoa, superintendent, (6…"   (expected "Directory")

1440 first-Tab-target per state, loaded via its own hash: "Directory" — all seven, correctly
```

It is not limited to a fresh page load either — it reproduces on ordinary in-app navigation. Loading 390 with no hash (bar reachable), then **clicking** the "Person card" state-bar button with the mouse (a completely normal interaction — the click handler runs `location.hash = 'state-person'`), leaves the very next Tab landing on the phone number inside the person card, not on "Company card" as it should (and does, at 1440, under the identical test). Setting `location.hash` from script triggers the same fragment/focus behavior as a real anchor navigation. In other words: at 390, the *first* state change of any session — whether the page opens on a hash or a person clicks any state-bar button — permanently removes the seven-button state bar from the Tab sequence for the rest of that page's life.

This is squarely this round's own blocking definition ("unreachable … act") and a cross-width disagreement (1440 has no such defect under any of the same tests): SPEC §7 #1 requires "every act is reachable by Tab in reading order," and the state bar's seven buttons are `.act .act--tertiary` acts. It is invisible on the plates (nothing looks different — the buttons are still visibly present, still mouse-clickable) and invisible to every innerText-based check in this and prior rounds, which is why six rounds of review missed it; it only shows up under an actual Tab-key walk starting from a hash-loaded or hash-navigated page, exactly what this round's task asked for.

**Fix direction:** give 390's state sections ids that don't collide with the hash tokens — the same pattern 1440 already uses (`id="face-directory"` etc., with a small hash→id lookup table) — and update the three `getElementById` call sites (`:1445, :1477, :1480`) accordingly. Keeping the ids but adding `tabindex="-1"` to each section does not fix this; the browser resets the focus-navigation start point to the element even without a tabindex.

## 6. Summary

```
clean: false

BLOCKING (2 open):
  R7-1   — 390 only: the state bar's seven acts drop out of the Tab sequence on the very first
           hash navigation (including every default plate's own load, and the first in-app
           click of any state-bar button) — new this round, high confidence
  CR2-8/CR3-5/CR4-2 — "Compare & merge" is a real, focusable, enabled, non-aria-disabled button
           that does nothing on click, at both widths — carried since round 2, now scored under
           this round's own "inert act" blocking definition, high confidence

MAJOR (0 open)

MINOR (5 open, all carried, none new besides the two above):
  DR6-4  — Marrow & Sons crew order differs by width (Tom/Erin/Luis vs Erin/Tom/Luis) — high confidence
  DR6-5  — routed-contact clause names "Write Rosa Delgado" twice back to back, both widths — high confidence
  CR3-6/CR2-9/CR4-3 — no schedule-authority sentence in the fixture — high confidence, low actionability (no fixture field)
  CR3-7/CR2-10/CR4-4 — "Holds a key" reads identically for the true key holder and two access-tier grantees — high confidence
  CR2-7/CR3-4/CR4-1 — "licence" spelling — informational only; matches SPEC's own literal text, not a defect

FIXED this round (verified independently, not by trusting the fix log):
  DR6-1 / TR6-1 — 390 person-card fallback regions (R-V) — fixed, re-verified on all 12 people
  DR6-2 — company crew-line link scope (R-W) — fixed, re-verified
  DR6-3 — reclassified, not a finding (R-X names it a deliberate mobile adaptation)
```

`clean` is **false**. Two blocking findings stand open: one genuinely new (R7-1, a keyboard-navigation defect specific to 390 that no prior round's method could have surfaced, since every prior check was content/visual, never an actual Tab-key walk from a hash-loaded page) and one carried forward from round 2 that this round's own stricter blocking definition ("unreachable or inert act") now correctly scores as blocking rather than parked-minor (the Compare & Merge button). Round 6's own fixes (R-V, R-W) hold up completely under independent re-verification across all eighteen Directory-reachable cards, not just the four spot-checked before. Five minor items remain open and unchanged, none newly introduced this round.
