# US-33 specimens: build spec and gate

**14 October 2026 · SQ-960, seat 10 (Mockups).** Mockups for the responsiveness review: skeletons for six rooms in
the recommended loading direction, the alternate for the Desk and the Document, the navigation rule, action-feedback
strips for P6–P9 with a scrubbable timeline, and before/after waterfalls for P1 and P2. Inputs:
`../synthesis/plan.md` (§2 scorecard, §4 loading direction, §5 action grammar, §6 PQ rulings),
`../synthesis/pairings.md`, `../review/d1-loading.md` and `../review/d1-sketches/`, `../review/d2-feedback.md` and
`../review/d2-sketches/`. Pattern copied from `artifacts/designer-portal-uplift-2026-10-09/specimens/`.

Specimens are **static illustrations**. They prove nothing about time. Every time printed on them is either measured
(with its `baseline/` file) or an estimate marked **EST**. No product code is written here.

## 1. Files

| File | What it holds |
|---|---|
| `skeletons-q.html` | Q, Quiet paper, with arrival C: Desk, Document, People, Library, build room, Room view at 1440 and 390, light and dark; plus the Document at 4 s (slow) |
| `skeletons-x.html` | X, Expressive: Desk and Document at 1440 and 390, light and dark; plus the Document at 3 s with its toast |
| `nav-progress.html` | Q's navigation rule on P2: start, route stroke, data stroke, complete, failure; plus a live run |
| `action-strips.html` | P6 tick, P7 phase advance, P8 add a room, P9 send, a payment, a folio image removal with Undo; each with a scrubber |
| `waterfalls.html` | P1 and P2 before and after, from the baseline and the plan's track estimates |
| `index.html` | Links to the five files |
| `build.mjs` | Writes every file above and this SPEC from one source. Edit there, then `node build.mjs` |
| `check.mjs` | The gate (§7) |

## 2. Frame table

`check.mjs` reads this table. Every row is one frame: id, file, what it shows, and the canon departures it uses (§3).
65 frames.

| Frame | File | Shows | Departures |
|---|---|---|---|
| `frame-q-desk-1440-light` | `skeletons-q.html` | Desk · Q, Quiet paper · 1440 · light | nav-rule breath |
| `frame-q-desk-1440-dark` | `skeletons-q.html` | Desk · Q, Quiet paper · 1440 · dark | nav-rule breath |
| `frame-q-desk-390-light` | `skeletons-q.html` | Desk · Q, Quiet paper · 390 · light | nav-rule breath |
| `frame-q-desk-390-dark` | `skeletons-q.html` | Desk · Q, Quiet paper · 390 · dark | nav-rule breath |
| `frame-q-doc-1440-light` | `skeletons-q.html` | Document · Q, Quiet paper · 1440 · light | nav-rule breath arrival-c |
| `frame-q-doc-1440-dark` | `skeletons-q.html` | Document · Q, Quiet paper · 1440 · dark | nav-rule breath arrival-c |
| `frame-q-doc-390-light` | `skeletons-q.html` | Document · Q, Quiet paper · 390 · light | nav-rule breath arrival-c |
| `frame-q-doc-390-dark` | `skeletons-q.html` | Document · Q, Quiet paper · 390 · dark | nav-rule breath arrival-c |
| `frame-q-people-1440-light` | `skeletons-q.html` | People · Q, Quiet paper · 1440 · light | nav-rule breath |
| `frame-q-people-1440-dark` | `skeletons-q.html` | People · Q, Quiet paper · 1440 · dark | nav-rule breath |
| `frame-q-people-390-light` | `skeletons-q.html` | People · Q, Quiet paper · 390 · light | nav-rule breath |
| `frame-q-people-390-dark` | `skeletons-q.html` | People · Q, Quiet paper · 390 · dark | nav-rule breath |
| `frame-q-library-1440-light` | `skeletons-q.html` | Library · Q, Quiet paper · 1440 · light | nav-rule breath |
| `frame-q-library-1440-dark` | `skeletons-q.html` | Library · Q, Quiet paper · 1440 · dark | nav-rule breath |
| `frame-q-library-390-light` | `skeletons-q.html` | Library · Q, Quiet paper · 390 · light | nav-rule breath |
| `frame-q-library-390-dark` | `skeletons-q.html` | Library · Q, Quiet paper · 390 · dark | nav-rule breath |
| `frame-q-pieces-1440-light` | `skeletons-q.html` | Build room · Q, Quiet paper · 1440 · light | nav-rule breath |
| `frame-q-pieces-1440-dark` | `skeletons-q.html` | Build room · Q, Quiet paper · 1440 · dark | nav-rule breath |
| `frame-q-pieces-390-light` | `skeletons-q.html` | Build room · Q, Quiet paper · 390 · light | nav-rule breath |
| `frame-q-pieces-390-dark` | `skeletons-q.html` | Build room · Q, Quiet paper · 390 · dark | nav-rule breath |
| `frame-q-room-1440-light` | `skeletons-q.html` | Room view · Q, Quiet paper · 1440 · light | nav-rule breath |
| `frame-q-room-1440-dark` | `skeletons-q.html` | Room view · Q, Quiet paper · 1440 · dark | nav-rule breath |
| `frame-q-room-390-light` | `skeletons-q.html` | Room view · Q, Quiet paper · 390 · light | nav-rule breath |
| `frame-q-room-390-dark` | `skeletons-q.html` | Room view · Q, Quiet paper · 390 · dark | nav-rule breath |
| `frame-q-doc-slow-1440-light` | `skeletons-q.html` | Document · Q · slow at 4 s · 1440 · light | nav-rule breath arrival-c slow-line |
| `frame-q-doc-slow-1440-dark` | `skeletons-q.html` | Document · Q · slow at 4 s · 1440 · dark | nav-rule breath arrival-c slow-line |
| `frame-x-desk-1440-light` | `skeletons-x.html` | Desk · X, Expressive · 1440 · light | shimmer glow-bar |
| `frame-x-desk-1440-dark` | `skeletons-x.html` | Desk · X, Expressive · 1440 · dark | shimmer glow-bar |
| `frame-x-desk-390-light` | `skeletons-x.html` | Desk · X, Expressive · 390 · light | shimmer glow-bar |
| `frame-x-desk-390-dark` | `skeletons-x.html` | Desk · X, Expressive · 390 · dark | shimmer glow-bar |
| `frame-x-doc-1440-light` | `skeletons-x.html` | Document · X, Expressive · 1440 · light | shimmer glow-bar |
| `frame-x-doc-1440-dark` | `skeletons-x.html` | Document · X, Expressive · 1440 · dark | shimmer glow-bar |
| `frame-x-doc-390-light` | `skeletons-x.html` | Document · X, Expressive · 390 · light | shimmer glow-bar |
| `frame-x-doc-390-dark` | `skeletons-x.html` | Document · X, Expressive · 390 · dark | shimmer glow-bar |
| `frame-x-doc-slow-1440-light` | `skeletons-x.html` | Document · X · slow at 3 s · 1440 · light | shimmer glow-bar toast shadow |
| `frame-x-doc-slow-1440-dark` | `skeletons-x.html` | Document · X · slow at 3 s · 1440 · dark | shimmer glow-bar toast shadow |
| `frame-nav-start-1440-light` | `nav-progress.html` | Navigation rule · Start · 300 ms · 1440 · light | nav-rule |
| `frame-nav-start-1440-dark` | `nav-progress.html` | Navigation rule · Start · 300 ms · 1440 · dark | nav-rule |
| `frame-nav-start-390-light` | `nav-progress.html` | Navigation rule · Start · 300 ms · 390 · light | nav-rule |
| `frame-nav-start-390-dark` | `nav-progress.html` | Navigation rule · Start · 300 ms · 390 · dark | nav-rule |
| `frame-nav-route-1440-light` | `nav-progress.html` | Navigation rule · Progress · route stroke · 1440 · light | nav-rule |
| `frame-nav-route-1440-dark` | `nav-progress.html` | Navigation rule · Progress · route stroke · 1440 · dark | nav-rule |
| `frame-nav-route-390-light` | `nav-progress.html` | Navigation rule · Progress · route stroke · 390 · light | nav-rule |
| `frame-nav-route-390-dark` | `nav-progress.html` | Navigation rule · Progress · route stroke · 390 · dark | nav-rule |
| `frame-nav-data-1440-light` | `nav-progress.html` | Navigation rule · Progress · data stroke · 1440 · light | nav-rule breath arrival-c |
| `frame-nav-data-1440-dark` | `nav-progress.html` | Navigation rule · Progress · data stroke · 1440 · dark | nav-rule breath arrival-c |
| `frame-nav-data-390-light` | `nav-progress.html` | Navigation rule · Progress · data stroke · 390 · light | nav-rule breath arrival-c |
| `frame-nav-data-390-dark` | `nav-progress.html` | Navigation rule · Progress · data stroke · 390 · dark | nav-rule breath arrival-c |
| `frame-nav-complete-1440-light` | `nav-progress.html` | Navigation rule · Complete · 1440 · light | nav-rule |
| `frame-nav-complete-1440-dark` | `nav-progress.html` | Navigation rule · Complete · 1440 · dark | nav-rule |
| `frame-nav-complete-390-light` | `nav-progress.html` | Navigation rule · Complete · 390 · light | nav-rule |
| `frame-nav-complete-390-dark` | `nav-progress.html` | Navigation rule · Complete · 390 · dark | nav-rule |
| `frame-nav-fail-1440-light` | `nav-progress.html` | Navigation rule · Failure · 1440 · light | nav-rule inline-failure |
| `frame-nav-fail-1440-dark` | `nav-progress.html` | Navigation rule · Failure · 1440 · dark | nav-rule inline-failure |
| `frame-nav-fail-390-light` | `nav-progress.html` | Navigation rule · Failure · 390 · light | nav-rule inline-failure |
| `frame-nav-fail-390-dark` | `nav-progress.html` | Navigation rule · Failure · 390 · dark | nav-rule inline-failure |
| `frame-nav-live` | `nav-progress.html` | Navigation rule · live | nav-rule breath arrival-c inline-failure |
| `frame-strip-p6` | `action-strips.html` | P6 · Tick a task | optimistic pending-word inline-failure |
| `frame-strip-p7` | `action-strips.html` | P7 · Advance a phase | still-working inline-failure |
| `frame-strip-p8` | `action-strips.html` | P8 · Add a room | optimistic pending-word inline-failure |
| `frame-strip-p9` | `action-strips.html` | P9 · Send the Holloway reminder | still-working inline-failure |
| `frame-strip-pay` | `action-strips.html` | Record the Holloway payment | still-working inline-failure |
| `frame-strip-undo` | `action-strips.html` | Remove a folio image (after PQ14) | still-working inline-failure undo |
| `frame-wf-p1` | `waterfalls.html` | P1 sign-in → Desk · before / after | none |
| `frame-wf-p2` | `waterfalls.html` | P2 Desk → Document · before / after | none |

## 3. Canon departures

The design canon is waived for US-33 (contract), so a frame may depart from it, but every departure is named on the
frame as `data-departures` and maps to a founder question in `plan.md` §6. The marker class is how `check.mjs` knows a
frame uses it: a frame lists a departure **if and only if** its markup carries the marker class. A frame with none says
`none`.

| Token | Marker class | PQ | What |
|---|---|---|---|
| `nav-rule` | `.nav-rule` | PQ4 | Q's 1 px ink rule at 40% on the top edge of the paper, shown from 300 ms |
| `breath` | `.breathe` | PQ5 | Placeholders breathe on R15 (3 s, opacity 1 → 0.62); still under reduced motion |
| `arrival-c` | `.arrival-c` | PQ3 | Arrival option C: the skeleton is the arrival; the job title is set at first paint |
| `slow-line` | `.slow-line` | PQ7 | Words only when slow (4 s), stalled (10 s) or failed; the prose loading lines retire |
| `pending-word` | `.pending-word` | PQ8 | "saving…" in the row meta from 400 ms, held at least 500 ms |
| `still-working` | `.still-working` | PQ16 | The 8 s line on a pending-only act ("Still working.", "Still sending.") |
| `optimistic` | `.optimistic` | PQ9 | Ink shows the new value before the receipt (internal acts only, never §5.2) |
| `inline-failure` | `.inline-fail` | PQ11 | An R83 inline line with a 44 px Try again, instead of the red global toast |
| `undo` | `.undo-row` | PQ14 | An in-flow Undo where a restore path exists |
| `shimmer` | `.shimmer` | PQ13 | X: a highlight sweeps the blocks every 1.4 s |
| `glow-bar` | `.glow-bar` | PQ13 | X: a 2 px clay bar at the top of the viewport with an 8 px glow |
| `toast` | `.toast` | PQ13 | X: a slow or failure toast in the corner |
| `shadow` | `.shadow` | PQ13 | Any drop shadow (D4 says depth never comes from shadows) |

Not departures, and not drawn as any: the pearl placeholder bar (SectionLoadingLine's material today), "Completing…"
and "Sending" (today's verbs), and today's red global toast where it appears in a Today row as evidence
(class `.today-toast`, never `.toast`). F13 in Fix now ships pearl bars with no breath; breath is N10, behind
`loading-register`.

## 4. Tokens, fonts and the dark set

- **Light** values are the real tokens in `apps/designer-portal/src/app/globals.css` (lines 10-47, 64-121), under the
  house-sheet short names: `--paper` #FAF7F2 · `--paper-doc` #FCFAF6 · `--rail` #E8E3DB · `--lift` #FFFFFF · `--ink` #2C2926 · `--ink-muted` #4E4339 · `--ink-subtle` #5A4E43 · `--ink-faint` #65594E · `--clay-ink` #7C5E30 · `--terracotta-ink` #9C5340 · `--sage-ink` #5F6B57 · `--bar` #2C2926 · `--bar-ink` #FAF7F2 · `--clay` #C4A57B · `--pearl` #E5E2DD · `--rail-ph` rgba(44, 41, 38, .11) · `--warm` #EEE6DB · `--shine` rgba(255, 255, 255, .75) · `--hair` rgba(44, 41, 38, .10) · `--edge` rgba(44, 41, 38, .18) · `--card-edge` #8F8C88 · `--rule-strong` #2C2926 · `--press-in` rgba(196, 165, 123, .14).
- **Dark** values are the house-sheet companions recorded in `docs/design/house-sheet/SPEC.md` §A1 and
  `globals.css:2209-2216`. The portal paints no dark paper set today (`globals.css:56`), so the dark frames preview the
  documented set; they change nothing. Three dark values are not documented and are this seat's choice, used only as
  fills, never as text: `--pearl` and `--rail-ph` (ink at 12%) and `--warm` (#3A3530): `--paper` #2A2622 · `--paper-doc` #26221E · `--rail` #3A3530 · `--lift` #1C1A17 · `--ink` #F2EDE6 · `--ink-muted` #D6CEC4 · `--ink-subtle` #C7BEB3 · `--ink-faint` #B8AEA2 · `--clay-ink` #D8B98A · `--terracotta-ink` #E2A895 · `--sage-ink` #AFC0A6 · `--bar` #1C1A17 · `--bar-ink` #F2EDE6 · `--clay` #B39572 · `--pearl` rgba(242, 237, 230, .12) · `--rail-ph` rgba(242, 237, 230, .12) · `--warm` #3A3530 · `--shine` rgba(242, 237, 230, .10) · `--hair` rgba(242, 237, 230, .14) · `--edge` rgba(242, 237, 230, .22) · `--card-edge` #77736E · `--rule-strong` #F2EDE6 · `--press-in` rgba(216, 185, 138, .14).
- **Fonts**: Inter (`--font-inter`) and Playfair Display (`--font-heading`) as `app/font-config.ts` loads them through
  `next/font/google`; DM Mono for meta, as the portal's typography uses it. The specimens load the same three from
  Google Fonts.
- **Charts** (`waterfalls.html`) use one hue in two steps: measured `#7C5E30` and EST `#C4A57B` in light, `#D8B98A` and
  `#8B7355` in dark. Both pairs pass the dataviz ordinal validator (single hue, monotone lightness, the light end clears
  2:1 on the surface). Row labels carry identity; colour only separates measured from EST, and the legend and the
  "EST" suffix say it in words.

## 5. Contrast pairs

Every text colour in the specimens is one of these tokens, printed on one of these grounds. `check.mjs` computes each
pair from the token values in every HTML file, in light and in dark, and requires at least **4.5:1**. On the rail, the
terracotta and sage inks never print (R126). Placeholder bars, rules and chart marks are not text.

| Text | Ground |
|---|---|
| `--ink` | `--paper` |
| `--ink` | `--paper-doc` |
| `--ink` | `--rail` |
| `--ink` | `--lift` |
| `--ink-muted` | `--paper` |
| `--ink-muted` | `--paper-doc` |
| `--ink-muted` | `--rail` |
| `--ink-muted` | `--lift` |
| `--ink-subtle` | `--paper` |
| `--ink-subtle` | `--paper-doc` |
| `--ink-subtle` | `--rail` |
| `--ink-subtle` | `--lift` |
| `--ink-faint` | `--paper` |
| `--ink-faint` | `--paper-doc` |
| `--ink-faint` | `--rail` |
| `--ink-faint` | `--lift` |
| `--clay-ink` | `--paper` |
| `--clay-ink` | `--paper-doc` |
| `--clay-ink` | `--rail` |
| `--clay-ink` | `--lift` |
| `--terracotta-ink` | `--paper` |
| `--terracotta-ink` | `--paper-doc` |
| `--terracotta-ink` | `--lift` |
| `--sage-ink` | `--paper` |
| `--sage-ink` | `--paper-doc` |
| `--sage-ink` | `--lift` |
| `--bar-ink` | `--bar` |
| `--paper` | `--ink` |
| `--paper` | `--ink-muted` |
| `--paper` | `--terracotta-ink` |

## 6. Fixture: Leah's studio [illustrative]

These names are the US-24 fixture (`artifacts/designer-portal-uplift-2026-10-09/specimens/SPEC.md` §3). They are
invented; no real client, maker or company appears, and none may be added.

- **Hartwell Studio.** Owner Leah Hartwell; the hire, Jordan Reyes. Copy refers to either by name or as "they", never
  with a gendered pronoun.
- **Holloway Den** for Nora and Sam Holloway: INV-2026-0721, $3,800, 14 days overdue; PO-HD-0412 to Fenmoor Joinery,
  sent 30 Sep. This is the Document opened in P2, the job of the P6 task and P8 room, the P9 reminder and the payment.
- **The Desk's other lines:** Ines Calder (a new inquiry), Pell Court Dining (deposit in, $9,200), Linden Place Living
  Room, Thornfield, Garnet Hill.
- **New for these specimens, equally invented:** the Holloway Den task "Confirm sofa fabric", the room
  "Sunroom", the phases "Concept" and "Refinement", and the spine section names.

## 7. Loading and feedback rules drawn

- **Thresholds** (PQ8): placeholders at 150 ms, navigation rule at 300 ms, pending word at 400 ms held at least 500 ms,
  slow at 4 s, still working at 8 s, stall at 10 s. The skeleton frames are drawn at about 200 ms.
- **Q** (plan §4): pearl bars inside the real line boxes, breathing on R15; the rule is 1 px of ink at 40% on the top
  edge of the paper, never the browser chrome; failure stops it in terracotta-ink at 1.5 px; it never fakes
  completion. Arrival C sets the job title at first paint and hides nothing.
- **X** (alternate): warm blocks with one shared shimmer; a 2 px clay bar with an 8 px glow; a toast at 3 s. No success
  toast, ever.
- **Honesty** (not waived): H1–H4 from `d1-loading.md` §2; every loading region has `aria-busy="true"` and an `sr-only`
  sentence; errors are `role="alert"`, slow lines `role="status"`. Only plain links are drawn as real in a skeleton.
- **Feedback** (plan §5.1 stages S0–S5): optimistic only for internal acts (P6, P8). Pending-only for P7, P9, the
  payment, and the removal (§5.2). P9's failure keeps the outcomes `act-draft.tsx:38-40` already distinguishes: a
  definite refusal reads "Not sent." with Try again; an unconfirmed call reads "We couldn't confirm this went out — check
  the thread before sending again." with no resend. The payment never reads "paid" before the receipt.
  Undo appears only where a restore path exists (PQ14).
- **Scrubber** stage rule: S0 before 50 ms; optimistic acts show S1 until 400 ms, then S2 until
  max(server, 900 ms), so the word holds at least 500 ms; pending-only acts hold S1 and show S2 only from 8 s; then S3
  or S4 by the outcome; S5 600 ms after the settle when "Undo pressed" is chosen. Server times are 250 ms, 800 ms
  (prod p50 243 ms, p90 803 ms) and 9 s.

## 8. Build rules

1. **Self-contained HTML.** Inline CSS and JS. Nothing is fetched except Google Fonts.
2. **Frames.** Each frame is one `<section class="frame" data-frame="…" data-departures="…">` between
   `<!-- frame:id -->` and `<!-- /frame:id -->`. Skeleton and navigation frames carry their own `data-theme`; the
   strips and waterfalls follow the page theme.
3. **The hash shows one frame.** `#frame-…` shows only that frame at 1:1 with no page chrome. `&nobar` hides the
   caption and note; `&dark` or `&light` sets the page theme. With no hash every frame shows, scaled, with a sticky bar
   of `data-go` buttons. Pages listen to `hashchange`.
4. **No horizontal scroll** in any single 390 frame at a 390 viewport.
5. **Targets.** Every real control and every drawn target (`.act`, `.lnk`, `.tgt`) carries `.t44`
   (`min-height` and `min-width` 44px). A drawn target that shows today's undersized row carries `data-today`
   instead, as evidence.
6. **Motion.** Any animation or transition sits under one `@media (prefers-reduced-motion: reduce)` rule that sets both
   to none. Scripts that animate check `prefers-reduced-motion` and step instead.
7. **Copy.** No gendered pronouns; "Designer-Taught Intelligence", never the two-letter abbreviation.
8. **Sentinel.** The last non-empty line of every HTML file is `<!-- SPECIMEN COMPLETE -->`.

## 9. Gate

```
node artifacts/portal-responsiveness-2026-10-14/specimens/check.mjs
```

It exits 0 when every check passes and 1 otherwise, naming each failure:

- every file on disk matches what `build.mjs` writes (so this SPEC and the HTML cannot drift);
- every frame id in §2 exists once, in the file §2 names, and no file has a frame §2 does not list;
- each frame's `data-departures` equals §2's list, uses only §3 tokens, and matches the marker classes in its markup;
- every interactive element (`button`, `a`, `input`, `select`, `summary`, `tabindex="0"`) and every drawn target
  carries `.t44`, and `.t44` declares min-height and min-width of at least 44px;
- every file with an animation or transition has the reduced-motion rule that removes both, and every script that calls
  `requestAnimationFrame` checks `prefers-reduced-motion`;
- every §5 pair is at least 4.5:1 in light and in dark, in every file, and every `color:` in the CSS is a §5 text token
  (or inherit, currentColor, transparent);
- the sentinel, no fetch outside Google Fonts, no gendered pronoun, no two-letter abbreviation for intelligence.

**Render check** (outside the gate, evidence kept under the ticket's verification folder, never in the repo): every
single 390 frame at a 390 viewport has `scrollWidth` ≤ 390, and no page logs a console error.
