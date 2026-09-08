# Re-review — `deck/index.html` ("Paper, Polished"), after the fix pass

**Target:** `deck/index.html`, 18 sheets, 1,943,610 bytes (1.85 MB).
**Reviewer:** fresh context. I did not build this deck, did not write the fix
log, and took no claim in it on trust. Every "fixed" below was re-derived from
the file, from a render I made myself, or from the cited source opened in the
repo.

**Method.** Read `review/01c-deck-technical.md` (T01–T11 + top five),
`review/01d-deck-content.md` (D01–D60, the "must not be changed" list, the
ranked top ten), `review/02-fix-log-deck.md` including its Pass 2, `SPEC.md`
§A and §B and §F in full, `synthesis.md`, `tools/README.md`. Rendered 53
captures myself into `$TMPDIR/deck-rereview/` — 18 hashes × {1440, 390}
viewport-only, 9 full-page at 1440 (sheets 5, 6, 8, 9, 11, 14–17), 6 dark
(1, 6, 9, 12, 14, 17), 2 reduced-motion (12, 14) — plus eight throwaway
Playwright probes in `$TMPDIR/dr/` for chrome geometry, glyph-box
intersection at every scroll position on every sheet, deep links, keyboard
nav, per-slide overflow, money/date type sizes, the three iframes' live
switchers, and a chrome-on/chrome-off pixel diff of all 36 rest positions.
Unescaped the three `srcdoc` payloads and SHA-1'd them against the specimen
files. Opened ten `file:line` citations and eighteen panel IDs in the repo.
Recomputed six contrast ratios from the hex values.

**Environment note.** Chromium dies inside the Bash sandbox exactly as
`tools/README.md` warns (`MachPortRendezvousServer: Permission denied`);
every render and probe here ran unsandboxed. `$TMPDIR` resolved to
`/tmp/claude-501`, so the captures are at `/tmp/claude-501/deck-rereview/`
and the probe crops at `/tmp/claude-501/dr/`.

---

## Verdict

**Needs one more pass.** Blocking: **R01, R02, R03, R04.**

The fix pass did real work and most of it holds. The invented `$7,040` is
gone and no money figure anywhere in the file is unsupported; the verdict is
printed twice, verbatim; the inner scroll panes are gone and sheets 9 and 17
print all their rows; the reveal system is deleted; the two broken citations
are repaired and correct; the three embeds are byte-identical to the current
specimens and fully live inside the deck; zero console errors, zero warnings,
zero per-slide overflow at both audited widths.

But the single biggest finding of the first review — fixed chrome over
content — is **not closed**. The chrome box's left edge sits 8px *inside* the
content column on every sheet at 1440, and I have full-resolution crops of
two sheets where it hides a character mid-sentence. And the fix that made
sheets 9 and 17 honest (deleting the panes) made every tall sheet
unreachable by keyboard, because the key handler that jumps sheets leaves no
key that scrolls within one. Both are small edits. Neither should ship
unfixed in a deck whose fourth lens is accessibility and whose sheet 7
charges another team for breaking its own system.

---

## 1 · The five P1s, checked

| # | P1 | Result |
|---|---|---|
| 1 | No invented money figure anywhere | **PASS.** |
| 2 | One-line verdict on the cover and on sheet 17 | **PASS.** |
| 3 | Sheets 9 and 17 have no inner scroll and are fully readable | **PASS on scroll, FAIL on "readable"** — see R02. |
| 4 | Fixed chrome never covers content on any sheet at 1440 or 390 | **FAIL at 1440** (R01). **PASS at 390 at rest**, unavoidable mid-scroll. |
| 5 | The deck's own money/dates/names ≥15px except letterhead running heads | **PARTIAL** — 18 strings still below the floor (R05). |

**P1-1 — money.** I extracted every `$` figure from the shell, per sheet:
sheet 1 `$4,060.00`; 4 `$9,130.00`; 6 `$4,060.00`, `$2,400`; 9 `$9,130.00`
×2, `$3,600.00`, `$14,880.00`, `$9,125.00`, `$4,060,`; 11 `$11,100.00` ×2,
`$4,060.00` ×3, `$0.00`, `$0`; 12 `$2,980.00` ×5, `$9,125.00` ×2,
`$9,130.00`, `$5.00`; 13 `$8,120.00`, `$11,100.00`, `$4,060.00`, `$4,060`;
14 `$4,060.00`, `$8,120.00`, `$2,980.00`, `$11,100.00`; 16 `$2,980.00`;
17 `$9,130.00`. Every one traces: `$11,100.00`, `$4,060.00`, `$0.00`,
`$8,120.00`, `$2,980.00`, `$2,100.00`, `$180.00`, `$2,280.00` are SPEC §B
fixture; `$9,125.00 / $9,130.00 / $5.00` are the shipped invoice and are
reconciled in one sentence on sheet 12; `$2,400` and the bare `$4,060` are
the proposal's and the screenshot's own strings, which sheet 13's cents rule
explicitly permits. Sheet 11's ledger reads **Agreed $11,100.00 / Paid $0.00
/ Owed $4,060.00** exactly as specified. Sheet 14's arithmetic
(`$8,120.00 + $2,980.00 = $11,100.00`) is correct. `grep -c '7,040'` = 0 and
`grep -c '9,120'` = 0 on the whole file, embeds included.

**P1-2 — verdict.** Present on sheet 1 under the subtitle and at the head of
sheet 17, byte-identical, both in `.t-d2`: *"The diagnosis is right. The
prescription is mostly wrong for these two users. Keep its geometry; change
its pigment — five principles, three specimens."* Its clauses come from
`synthesis.md:36` and `synthesis.md:81`.

**P1-3 — no inner scroll.** `.pane` is gone from the stylesheet. Sheet 9
prints all nineteen `<tr>` rows (I counted them in the DOM: 19 + head) and
runs 2,220px at 1440 / 5,225px at 390. Sheet 17 prints all twenty rows plus
ten rulings, 2,797px / 6,258px. Nothing is behind an inner vertical scroll.
See R02 for why "fully readable" still fails.

**P1-4 — chrome.** Measured, not inferred. At 1440 `#chrome` occupies
x 1262→1416, y 815.5→882; `.inner` (max-width 1100) ends at x 1270. The box
therefore overlaps the content column by **8px on every sheet**. A
chrome-on / chrome-off pixel diff of all 18 rest positions shows ink covered
on sheets 1, 2, 4, 6, 9, 12, 17 (7–9px each — the sheets' own hairline
rules) and on 14, 15, 16 (64px each — the specimen frames' right border).
A glyph-rectangle sweep at every 250px of scroll on every sheet found four
positions where real characters are covered; two of them are visible at
full resolution (R01). At 390 the docked strip is y 0→41 and `.slide`
padding-top is 48px: **zero ink covered at rest on all 18 sheets**, which is
the claim the fix log makes and it holds.

**P1-5 — the 15px floor.** The money block itself obeys it: the announced
`$4,060.00` at 26px, the ledger figures and the invoice date at 15px, the
record's parties and timestamp at 15px, the consequence sentence at 15px,
the cover date at 15px. Eighteen other money/date strings do not — R05.

---

## 2 · Fix-log claims, verified one by one

### Rulings 1–13

| # | Claim | Result |
|---|---|---|
| 1 | Current specimens re-embedded; sheets 12–13 rebuilt to §F | **Confirmed.** SHA-1 of each unescaped `srcdoc` equals the specimen file byte for byte: `4c8d540f2208` / `3b8856fef90b` / `02b6317a5150`, 349,537 / 41,378 / 38,375 bytes. Sheet 12 carries the §F C terminal label (Inter 500 / 16px / sentence case / tabular), the §F D `.act--inline` tier, and the §F E pressed states on both a scored act and a chip pair; sheet 13 carries the §F B 15px money step and the §F C terminal step. No `--rail` strokes (§F A); chrome is `--paper-doc`/`--paper` with a hairline, no charcoal (§F F); stage-plate values not lifted in dark (§F J). |
| 2 | D01 — delete the invented `$7,040` | **Confirmed.** |
| 3 | D27 — verdict printed twice | **Confirmed.** |
| 4 | D28 — no `max-height` panes | **Confirmed** for the scroll; see R02. Cue accuracy: correct on 17 of 18 sheets; false on the cover at 1440 (R06). |
| 5 | Chrome occlusion | **NOT FIXED at 1440** (R01). Fixed at 390 at rest. The deep-link re-positioning on `load` / `fonts.ready` / 400ms works: `#slide-9` and `#slide-18` land with the sheet top at viewport y = 0 at both widths, title top at 48px (1440) and 77px (390), clear of the 41px strip. |
| 6 | D36 — the 15px floor | **PARTIAL** (R05). The exception is stated on sheets 11 and 13 as claimed. |
| 7 | D37 — a "when" on every caption | **Confirmed**, all 16 figcaptions carry a capture date. |
| 8 | D39 — honest spacing | **Confirmed.** Every block value in the stylesheet is 0/6/12/24/48/72 or a stated exception (`.act` 4/6/10 and 13/22 padding, the chip's 10/14, the stamp's 6/10/4, `.slide` 48/112 and 48/88, `#deck` scroll-padding 44). Sheet 13 restates the rule. |
| 9 | Numbers — `$8,120.00`, sheet 9 row 1 | **Confirmed.** `$8,120.00` matches SPEC §B and 01d's own D19 correction; `grep -c '9,120'` = 0. Row 1's rewrite is honest about which figure is photographed. |
| 10 | Citations | **Confirmed, both.** `room-band.tsx:134` is `if (feet.length === 0) {`, `:145` the `<rect>`, `:146` the `<text fontSize={FOOT_TYPE}>`, `:157` the closing `</svg>` — the empty-room branch exactly. `DECISIONS.md:3775` is the "**Confidence renders honestly**" paragraph inside R107, which opens at `:3765`; the deck names it correctly. `apps/designer-portal/eslint.config.mjs:83-101` is the `no-restricted-syntax` block whose messages read "D4/R3: no shadow-* utilities on Document surfaces". |
| 11 | Motion removed | **Confirmed.** No `.seen`, no `IntersectionObserver`, no reveal transition. Pixel diff of the reduced-motion capture against the normal capture: **delta = 0** on sheets 12 and 14. |
| 12 | Title kept | **Confirmed.** `<title>Paper, Polished</title>`. |
| 13 | The rest of both top tens | See below. |

### The declines

- **D38 (frames cut before what they argue) — partly declined. Decline
  accepted.** I verified the mitigation: sheet 14's 720px frame does open
  through "What you owe · $4,060.00" and the reconciling sentence (confirmed
  in the dark 1440 capture); sheets 15 and 16 each carry a second 1440 plate
  showing exactly what their annotations claim, and each frame caption says
  the frame opens at the top and scrolls. The reasoning about
  `allow-same-origin` vs D52 is sound. **But the mitigation introduced R04**
  — the two 390 fallback plates' alt text describes content the crops do not
  contain.
- **D41 (two-column sheets end bottom-ragged) — declined. Decline accepted.**
  Letterboxing two different aspect ratios onto a common ground is worse than
  the rag, and padding a column to match its neighbour is the dead space
  sheet 7 charges at VC-24. Now that every sheet flows past the viewport by
  design, the rag no longer reads as truncation. VC-23's charge survives, but
  the remedy offered was worse than the defect.
- **D47 (the announced figure in Playfair) — declined. Decline accepted**,
  and 01d agrees with the decline in its own text ("SPEC §A3 sanctions
  Playfair for the single announced figure, so this is a sheet question, not
  a deck defect"). §F B is explicit and all three specimens do it that way.
- **D09's back-port — deferred. Accepted, and now larger** — see R16, a
  second back-port is owed.
- **D44's second half (the overflow gate is structurally blind) — declined as
  a render-tool change. Decline partially rejected.** The blindness is caused
  by the deck's own `body { overflow-x: hidden }` and `#deck { overflow-x:
  hidden }`, so "horizontalOverflow: false on 53 captures" proves nothing
  about this file. I closed the gap myself by measuring each `.slide`'s
  `scrollWidth` against its own `clientWidth`: **zero overflow at 1440 and
  390** — so no defect was actually hidden at the audited widths. At 320px
  two sheets do overflow and are silently clipped (R13).
- **T08 / T09 — n/a, informational. Accepted**, with a note at R18.
- **T10 (keep the `data-theme` dark guards) — declined. Decline accepted.**
  Correct call for a file that may be hosted somewhere that stamps a theme.

### The "must not be changed" list

Honoured in full, with two notes.

1. Token block, seven-step scale, three tiers — **verbatim against §A1 and
   §A3**, plus the §F B money step and §F C terminal step. Every value
   matches; no stray hex outside `:root`, the `.quoted-tokens` block and the
   pre-cleared `#1F1D1A`.
2. Sheet 4's credit list — intact and still before sheet 5. It is now **7
   entries, not 8**; the eighth (the Desk diagnosis, `IA-17`) was promoted
   into the new numbered table, so nothing was lost (R19).
3. Sheet 7's framing sentence — **unchanged, verbatim**.
4. Sheet 9's opening and all nineteen rows — **intact**. One new sentence was
   added to it and it is wrong (R03).
5. The verified numbers — **all still printed unrounded, and all still
   recompute exactly**: `#2C2926` on `#FAF7F2` = **13.53**; `#4E4339` on
   `#FCFAF6` = **9.22**; `#5A4E43` = **7.73**; `#65594E` = **6.51**;
   `#8B7355` on paper = **4.20**; `#7C5E30` on paper = **5.61**. 1.75:1,
   3.9px, 5.22–8.20:1, 1.11–1.14:1, 8.78 and 7.35 all still present and
   unrounded.
6. The twelve verified `file:line` cites — **10 re-opened, all 10 hold**:
   `story-pole.tsx:88-89` (the `phases`/`sections` props), `:153-176` (the
   `aria-hidden` dot rail with `max-[600px]:flex`), `:233`;
   `doorstep.tsx:83-90` (the sentence `<p>`); `command-bar.tsx:1074-1095`
   (`role="dialog"`, no `aria-modal`); `wall-gate.tsx:279`
   (`disabled={!signatureIsComplete(signedName)}`);
   `scored-action.tsx:601-612` (the keyboard-only visible hint beside the
   `sr-only` "Press and hold to…") and `:288` (`HOLD_MS = 900`);
   `tracking-row.tsx:187` and `:210` (both `text-[9px]`);
   `mat.tsx:16-18` ("Leave the house" is REQUIRED); `plan-key.tsx:24-35`
   (THE ELEVEN-PIXEL FLOOR); `room-band.tsx:53,70,230`
   (`DRAW_W = 1000`, `FOOT_TYPE = 11`, `fontSize={FOOT_TYPE}`);
   `desk-roster.tsx:110` (`decoration-transparent`).
   Panel IDs — **18 spot-checked, all 18 trace** to real findings with
   accurate paraphrase: IX39, BE-38, IX47, IA-20, A30, BE-03, B08, B09, C06,
   VC-69, VC-49, VC-50, N5, A31, VC-14, BE-14, IA-05, IA-46. Ruling IDs also
   trace: **I107** = `DECISIONS.md:6584` "The Scored Ink: DocumentAction
   sheds its box"; R126, R135, R137, R51 all exist as headings; **D4** is
   confirmed by the eslint rule's own message; **D1** traces through
   `panel/accessibility-inclusive-designer.md:165` and `synthesis.md:346`;
   `VISION.md:50` is the never-optimize-for-engagement line (dwell timer) and
   `VISION.md:73` is the no-dashboard line (facets). All correct.
7. Dark, `forced-colors`, reduced motion, skip link, 44px act targets, no
   shadows/pills/checks/truncation — **all intact**. `grep -c` = 0 for
   `box-shadow`, `text-overflow`, `✓`, `7,040`, `9,120` on the whole file
   including the embeds. One exception at R12: the deck's *own* nav buttons
   are 30×30 / 28×28.
8. The 390 fallback-plate mechanism — **kept**, crops re-cut from the
   12:57–12:58 renders, meta strip at the top edge. Alt text is the problem,
   not the mechanism (R04).
9. The title — **kept**.

---

## 3 · Findings

`ID | severity | confidence | sheet | claim | evidence | fix`

**R01 | high | high | every sheet, 1440 | The fixed chrome still overlaps the
content column, and still hides characters.** The fix log states "the single
fixed box sits entirely in the right margin, clear of the 1100px content
column, on every sheet" and "no character is behind chrome anywhere". Both
are false. `#chrome` is `right: clamp(12px,2vw,24px)` → left edge at
x = 1262; `.inner` is `max-width: 1100px` centred → right edge at x = 1270.
The box therefore sits **8px inside the content column on all 18 sheets**. |
Measured `getBoundingClientRect()` on both. Chrome-on/chrome-off pixel diff
at all 18 rest positions: ink covered on sheets 1, 2, 4, 6, 9, 12, 17 (7–9px
— the sheets' own `.entry`/`table.sheet` hairlines cut by the box) and on
14, 15, 16 (64px — the specimen frames' 1px right border). A glyph-rectangle
sweep at every 250px of scroll found four positions with real character
overlap; two opened at 3× device scale show it plainly:
`/tmp/claude-501/dr/sheet14mid.png` — sheet 14 at scroll 17280 reads
"…what it lacks i▮" with the `s` of "is" behind the box;
`/tmp/claude-501/dr/sheet15mid.png` — sheet 15 at scroll 19375 reads
"…not charcoa▮". Since every sheet but two is taller than the viewport,
mid-scroll is a normal reading state, not an edge case. | Push the box fully
into the margin, e.g. `right: max(clamp(12px,2vw,24px), calc((100% -
1100px)/2 - 24px))`, or drop `#hint` and `#counter` so the box is narrower
than 154px, or give it a `--paper` ground with no border so it stops cutting
the sheet's own rules. Re-verify with a glyph-rect sweep, not with rest-only
corner crops — rest-only inspection is exactly what missed this.

**R02 | high | high | 9, 17 and 16 of 18 sheets | Making the sheets tall made
them unreadable by keyboard.** `#deck` is the scrolling element and carries
`tabindex="-1"`, so it is never in the tab order. The `keydown` handler
intercepts ArrowRight/ArrowLeft/PageDown/PageUp/Space/Shift+Space/Home/End
and each one jumps a whole sheet. ArrowDown/ArrowUp are not handled, and
with focus on `<body>` (the state after any deep link or page load) they
scroll nothing, because the document itself does not scroll. So a
keyboard-only reader who lands on sheet 17 sees the first 900px of 2,797px
(the first 844px of 6,258px at 390) and has no key that reaches the rest:
every Decline row, every ruling. | Measured: deep-linked `#slide-17` at
1440, three ArrowDown presses with focus on body → `deck.scrollTop`
unchanged at 22154. After `deck.focus()` the same three presses move it to
22274, so the mechanism works — it is only unreachable. Tab order from
`#slide-18` is `#prev` → `#next` → body → `.skip`; `#deck` never receives
focus. Before the fix pass the content sat in a `max-height` pane, so this
is a regression introduced by ruling 4. It also fails WCAG 2.1.1 for a
scrollable region. | Handle `ArrowDown`/`ArrowUp` (and ideally
`PageDown`/`Space`) by scrolling `deck` one viewport within the current
sheet and only advancing at the sheet's end; or give `#deck`
`tabindex="0"` with an accessible name and focus it on load. Six lines.

**R03 | medium | high | 4 vs 9 | The two sheets contradict each other about
the five confirmed diagnoses, and neither is right.** Sheet 4: "All five are
ours to fix, and all five are on sheet 9." Sheet 9: "Four of the five
diagnoses on sheet 4 are rows here." | Sheet 4's five diagnoses are (1)
`RecentBoardsStrip` after the roster, (2) no consequence at the wall gate,
(3) placeholder FF&E imagery, (4) empty rooms as rectangles, (5) the
under-weighted, hover-gated terminal act. Reading all nineteen sheet-9 rows:
(3) is row 1, (4) is row 2, (5) is rows 6 and 7. **Diagnoses 1 and 2 have no
row on sheet 9 at all.** So it is three of five, across four rows. 01d's own
D06 says the same thing — "rows 1, 2, 6 and 7 of sheet 9" — and counts rows,
not diagnoses. A reader who counts, and this deck invites counting, finds the
contradiction in a minute. | Sheet 4: "Three of the five are rows on sheet 9
(rows 1, 2, 6 and 7); the other two are what sheets 12 and 15 answer."
Sheet 9: match the same count.

**R04 | medium | high | 15, 16 | Two fallback plates carry alt text
describing content the image does not contain — on the deck whose principle
four is honest imagery and whose sheet 4 credits the proposal for honest alt
text.** Sheet 15's alt claims the plate shows "a roster head reading EVERY
JOB, 43 LIVE, 1 OVERDUE with the facets Only what needs me and By person …
and the first stage plate". Sheet 16's alt claims "two finish chips, and a
money table reading Piece $2,100.00, Delivery $180.00, Total $2,280.00". |
I decoded the embedded base64 plates (both 390×860, matching their declared
attributes) and opened them. Sheet 15's plate ends at "Showing all 43 jobs ·
grouped by stage." — the roster head, both facets and the `BRIEF · 8` plate
sit at y ≈ 865–990 of `shots/specimens/designer-desk-43jobs-390.png`, 5–130px
below the crop. Sheet 16's plate ends at the drawn coffee table's caption;
the chips and the money table are further down
`shots/specimens/decision-moment-390.png` (2,900px tall). Sheet 14's alt, by
contrast, is accurate in every clause — I checked it the same way. | Rewrite
the two alts to what the crops actually show, or raise the two crops to
include what the alts claim (990px for sheet 15).

**R05 | medium | high | 1, 4, 9, 11, 12, 13, 14, 16, 17 | D36 is half
discharged: 18 money and date strings still print below the deck's own 15px
floor, outside the stated exception.** Sheet 13 states the exception as
"Running heads and plate captions are metadata at 11 and 12px; everything
else that names money, a date or a party sits at 15px or above." `.t-body-sm`
is neither a running head nor a plate caption. | Computed font sizes on every
text node containing a money figure or a long-form date, excluding
`figcaption`: **cover** "Homeowner, Cedar Lane Study, $4,060.00 due in four
days" at 14px — the deck's own charge against the shipped doorstep (BE-38),
reproduced on its own cover; **sheet 11**, on the sheet that states the
floor, "…Local Dev Studio · 3 September 2026" and "One date style, '11
September 2026'…" both at 14px; **sheets 9, 12, 13, 14, 16** money in
`.t-body-sm` at 14px (`$3,600.00`, `$14,880.00`, `$9,125.00`, `$9,130.00`,
`$8,120.00`, `$2,980.00`, `$4,060.00`); **sheets 4, 9, 17** `<code>Pay
$9,130.00</code>` at 12.88px. The money block proper is clean — the announced
figure at 26px, the ledger at 15px, both record dates at 15px, the
consequence sentence at 15px, the cover date at 15px. | Either raise these
strings, or state the third exception the deck actually holds: a figure
quoted inside an evidence annotation keeps the annotation's size. Say it once
on sheet 13, beside the existing two exceptions. The cover instance should be
raised regardless — it is the deck's first money figure.

**R06 | low | high | 1 (1440) | The cover says "This sheet continues below."
and nothing does.** | Measured last-content bottom vs viewport at every rest
position, both widths: the cover's final element (the colophon) ends at
y = 883 in a 900px viewport, so the whole sheet is on screen; the 996px sheet
height is the 112px bottom padding. Every other cue in the deck is accurate,
and sheets 3 and 10 correctly suppress theirs at ≥761px via `.fits-wide`. |
Add `fits-wide` to the cover, or gate the cue on measured content height
rather than on sheet height.

**R07 | low | high | fix log Pass 2 | "Copied verbatim … unreformatted" is
not accurate.** | Diffed the deck's 14-rule block against
`client-house.html:255-268`. Every declaration is identical; every rule was
reformatted from `.act--inline{…}` to `.act--inline { … }`. No rendering
consequence — but the Pass 2 note asserts byte-identity with a "do not
reformat" comment sitting above reformatted code. I separately confirmed the
underlying claim: `client-house.html` and `designer-desk.html` carry the same
14 rules, and `decision-moment.html` carries those 14 plus `.chips`,
`.chips__note` and a `forced-colors` `.act--inline` rule. |
Reformat back, or soften the comment.

**R08 | low | high | fix log | Two other claims overreach.** (a) "The single
fixed box sits entirely in the right margin, clear of the 1100px content
column, on every sheet" — false by 8px on every sheet (R01). (b) "`#hint`
folded into the single `#chrome` box, dismissed permanently on the first
navigation" — `dismissHint()` is called only from `go()`, so it fires on key
and button navigation but never on wheel or trackpad scrolling. | Measured:
after wheel-scrolling from the cover to sheet 2, `#hint` is still
`display: block`. | Call `dismissHint()` from the scroll listener too, and
correct the log.

**R09 | low | high | 7, 11 | Two `width`/`height` attributes do not match
their images, and the "at size" plate is not at size.** | Decoded all 16
embedded plates: 14 match their declared dimensions exactly. The enlarged
"Solid oak table" thumbnail is **288×288 declared as 240×240**, and
`figure.plate.narrow img { max-width: 168px }` renders it at 168px under a
caption reading "The enlarged product preview, **at size**". The shipped
doorstep plate on sheet 11 is **930×330 declared as 930×290**, a wrong
aspect-ratio hint. | Correct the two attribute pairs; either raise
`.narrow`'s cap to 288px or drop "at size" from the caption.

**R10 | low | medium | 9 | "a 9px room name" does not reconcile with the code
the same row cites.** Row 2 reads "Empty rooms render as outlined ~370×25px
rectangles holding a 9px room name" and cites `room-band.tsx:134-157`. |
That branch renders `<text fontSize={FOOT_TYPE}>` with `FOOT_TYPE = 11`
(`:70`) in a `viewBox` 1000 units wide (`DRAW_W`, `:53`). At the ~370px
rendered band width the label is 11 × 370/1000 ≈ **4.1px**, not 9px — the
same arithmetic the deck itself performs correctly two rows later for the
3.9px footprint labels. The figure is inherited verbatim from `IX41` and
`synthesis.md:27`, so the deck is faithful to its source; the source looks
wrong. | Re-measure off `client-local-dev-desktop.png`, or drop the pixel
figure and keep "a tiny room name" as VC-45 has it.

**R11 | low | high | 1, 6 | "due in four days" against a dateline of 8
September and a due date of 11 September.** Three days, not four; the deck
prints "due 11 September 2026" from an "8 September 2026" cover in the same
breath. | Inherited from `synthesis.md:7` and
`panel/nora-homeowner.md:30`. 2026-09-08 is a Tuesday, as SPEC §B says. |
"due in three days" in both places, and back-port.

**R12 | low | high | chrome | The deck's own controls are below the target
floor it publishes.** `.navbtn` is 30×30px at 1440 and 28×28px below 761px,
while `.act` and `.chip` are 44px and sheet 4 credits the proposal because
"44px targets are real, including a late correction pulling `.lens button`
from 40 to 44 — someone checked." | Measured. Passes WCAG 2.5.8 (24px
minimum) but not the deck's own rule. | 44×44, or say why deck chrome is
exempt.

**R13 | low | high | 12, 17 at 320px | Real horizontal overflow, silently
clipped.** | I measured each `.slide`'s `scrollWidth` against its own
`clientWidth` — the test 01d's D44 asked for and the fix log declined:
**zero overflow at 1440 and at 390**, so nothing is hidden at the audited
widths. At 320px sheet 12 overflows by 38px (the terminal act's
`white-space: nowrap` label "Accept the finished work · $2,980.00") and
sheet 17 by 33px (`apps/designer-portal/eslint.config.mjs:83-101` and
`docs/design/the-document/DECISIONS.md:3775` in `<code>`). `body {
overflow-x: hidden }` hides all of it, and the render tool's document-level
check can never see it. The deck's principle five says "Wrap, never
truncate." | `overflow-wrap: anywhere` on `code`; let `.act--terminal .label`
wrap below 380px.

**R14 | low | medium | chrome | Two live regions announce on every move, one
of them on every scroll tick.** `#counter` carries `aria-live="polite"
aria-atomic="true"` and `#deck-status` is `role="status"`. `setCurrent()`
runs from the passive scroll listener as well as from `go()`, so a screen
reader user free-scrolling sheet 17's 6,258px hears a running sheet count. |
Read from the markup and the script. | Drop the counter's live region; keep
`#deck-status`, which already announces "First sheet" / "Last sheet"
correctly (verified).

**R15 | info | high | 17 | `R107` is a duplicated heading in the source
ledger.** `docs/design/the-document/DECISIONS.md` carries `### R107 · The
Room View…` at :3765 and `### R107 · The fidelity ladder` at :8044. The
deck's citation is correct and its line number disambiguates — worth knowing
that the ID alone does not.

**R16 | info | high | synthesis | Two back-ports are owed, not one.** D09's
semicolon, and — new — the deck's corrected reading of `DECISIONS.md:3775`.
`synthesis.md:342-343` describes that line as "photographs only for installed
work; the label floor on drawn geometry"; the line is R107's "confidence
renders honestly" paragraph about parametric re-rendering. The deck is right
and the synthesis is not.

**R17 | info | high | 8 | The "keep" IDs run out of order and in two
grammars** — `VC (keep 1)`, `VC (keep 2) · IA`, `IA-03 · L1`, `B08`,
`IA (keep 4)`, `IX (keep 3)`, `VC (keep 5) · BE` — which is a small remnant
of the charge D21/D22 made. Cosmetic.

**R18 | info | high | 14–16 | `loading="lazy"` on the three `srcdoc` frames
is markup that states a behaviour the file does not have.** All three
documents are live at first paint — measured, three child frames present on
load at sheet 14 before any scroll. T08's "honest markup" reason is thin, but
it costs nothing and hurts nothing.

**R19 | info | high | 4 | The credit list is 7 entries where 01d's
must-not-change list protects 8.** Nothing was lost: the eighth (the Desk
diagnosis) became row 1 of the new numbered table, which is what D06 asked
for. Recorded so a later reader does not score it as a breach.

**R20 | low | medium | 4 | D02's replacement citation is better but still not
exact.** Row 1 now reads `IA-17 · L2`. `L2` is "Proposed Desk buries the full
roster under a hero photo + task card, demoed at 3 jobs" — a finding about
the *proposal*, not evidence that `RecentBoardsStrip` sits after the shipped
roster, which is `IA-17` alone. 01d's own remedy offered `IA-17` alone as the
first option. | `panel/leah-studio-principal.md` L1, L2. | Cite `IA-17`
alone on that row, and keep `L2` where sheet 5 already uses it correctly.

---

## 4 · Technical gate

| Check | Result |
|---|---|
| Console errors / warnings | **0 / 0** across my 53 captures (36 viewport, 9 full-page, 6 dark, 2 reduced-motion) and across every Playwright probe, including all three iframes. |
| Horizontal overflow | Document level: **false** on all 53. Per-slide `scrollWidth` vs own box: **zero at 1440 and 390** (I ran the test D44 asked for). 320px: two sheets overflow (R13). |
| Full-page renders | `--full` returns 1440×900 images identical to the viewport captures, exactly as the fix log says, because `#deck` is the scrolling element and the document is `100dvh`. Whole-sheet inspection was done instead by scripted scroll stepping and element measurement. |
| Dark mode | 1, 6, 9, 12, 14, 17 all render correctly. Terminal act inverts to a light fill with dark text; pressed chip takes `--rail`, unpressed takes paper; `--clay-ink` lifts; stage-plate values held at their light values per §F J; the sheet-14 iframe follows the OS preference into its own document and matches the surrounding deck. |
| Reduced motion | 12 and 14: **pixel delta 0** against the normal captures. The reveal system is genuinely gone. |
| Keyboard nav | ArrowRight/Left, PageDown/Up, Space/Shift+Space, Home/End each move exactly one sheet or to the ends; `#counter` and `#progress` track correctly; `#deck-status` writes "First sheet" / "Last sheet" at the ends; `#hint` dismisses on the first key or button press. **Within a sheet: no key scrolls (R02).** |
| Deep links | `#slide-9` and `#slide-18` land with the sheet top at viewport y = 0 at **both** widths, with the title at 48px (1440) and 77px (390) — clear of the 41px top strip. The `load` / `fonts.ready` / 400ms re-run works as claimed. |
| External requests | `fonts.googleapis.com` and `fonts.gstatic.com` only, at both widths. No other host. |
| `srcdoc` fidelity | All three byte-identical to the current specimens (SHA-1 verified). All three live inside the deck: I clicked a state switcher in each via `frame()` — specimen 1 Default→Quiet day, specimen 2 16 jobs→43 jobs, specimen 3 Default→Noted — and `aria-pressed` toggled correctly in each, with zero console errors. |
| `grep -c` | `box-shadow` 0, `text-overflow` 0, `✓` 0, `7,040` 0, `9,120` 0 — on the whole file, embeds included. Also `IX-[0-9]` 0 and `font-size: 10px` 0. |
| File size | **1,943,610 bytes (1.85 MB)** — matches the Pass 2 figure exactly. |
| Structure | 18 `.slide` sections, one `<h1>`, seventeen `<h2>`, no skipped levels, 16 figures each with a figcaption naming a real file, 13 `<img>` with descriptive alt (two of which overstate — R04), no duplicate ids, `lang="en"`, skip link present, `forced-colors` block intact. |

---

## 5 · Reading it once as Kody — sheets 1, 4, 5, 6, 10, 17, 18

It delivers the verdict: the cover hands me one sentence before anything else
asks me to read a table, and sheet 17 hands me the same sentence again above
the twenty rows that spend it — I know what the panel thinks before I know
why. It delivers the five principles: sheet 10 names them and now says what
each one actually requires in a line under the name, so I can rule on them
without assembling them from three later sheets, and sheets 5 and 6 have
already told me what the alternative costs Leah (her morning scan) and Nora
(the only obligation with a date on it) in terms I recognise from my own two
portals. It delivers the three specimens: they are running, not pictured — I
clicked "43 jobs" inside the sheet and watched the roster hold, which is the
one thing a deck usually cannot prove. It delivers the decision: sheet 18
names me as the person who rules, names `docs/vision/VISION-DECISIONS.md` as
where the ruling goes, names the first slice as one PR with no new tokens,
and tells me a no on any principle stops the specimen that proves it — so I
know both what I am deciding and what it costs to decide it. What I would
still want before this is published is the eight pixels of chrome off the
right edge of the text, a key that scrolls inside sheet 17, and sheets 4 and
9 agreeing on a number — because this deck's whole argument is that a system
should not break its own rules, and those three are the only places left
where it does.

---

## Verdict

**Needs one more pass.**

**Blocking: R01, R02, R03, R04.** All four are under an hour's work
together: a `right:` calculation, an ArrowDown/ArrowUp branch, one sentence
on each of sheets 4 and 9, and two rewritten alt attributes.

**Fix in the same pass if the sheets are open:** R05 (raise the cover's
money figure at minimum, and state the third exception), R06, R08, R09,
R11, R13, R20.

**Not blocking, record only:** R07, R10, R12, R14, R15, R16, R17, R18, R19.

Everything else in the fix log is confirmed. The money is clean, the verdict
is present twice, the panes are gone, the citations hold, the numbers
recompute, the embeds are current and live, the reveal system is deleted, and
the deck is 1.85 MB with zero console errors and zero per-slide overflow at
both audited widths.
