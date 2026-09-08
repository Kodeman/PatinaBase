# Panel review — accessibility & inclusive design

**Lens:** WCAG 2.2 AA as the floor, real users as the test. Every ratio below
was computed from the actual hex values with a WCAG relative-luminance script,
not estimated. Fixtures: Nora Ellison / Cedar Lane Study; Leah Hartwell, 16
live jobs, 1 overdue (Desk judged at 16–43, not the proposal's 3).

## Computed contrast

**The proposal's three claimed ratios verify exactly.** Body `#2c2926` on
`#faf7f2` = **13.53**; muted `#65594e` on paper = **6.35**; `#fffdfa` on olive
`#394b38` = **9.24**. Nothing was rounded in their favour. That earns trust in
the rest of the sheet.

| Pair | Ratio | Verdict |
|---|---|---|
| PROPOSAL ink / paper · ink / sheet | 13.53 · 14.24 | pass |
| muted / paper · / sheet · / sage · / rail | 6.35 · 6.69 · 5.56 · 5.32 | pass |
| primary text / olive · / hover `#293e29` | 9.24 · 11.39 | pass |
| pill olive / sage `#e6eadf` | 7.69 | pass |
| focus ring olive / paper · rail · sage | 8.78 · 7.35 · 7.69 | pass (strong) |
| `.secondary` border `#8a8176` / paper · / rail on hover | 3.58 · **3.00** | at the line |
| `.material` border `#9a9082` / sheet | **3.09** | at the line |
| `.lens` group border `#b6aea2` / paper | **2.05** | **fail 1.4.11** |
| `.nav-btn` border `#d9d1c6` / sheet | **1.49** | **fail 1.4.11** |
| ochre `#a47836` / paper · / sheet | **3.69 · 3.89** | fails as text |
| `.warning` ground `#f3eee3` / sheet; its `#79603a` rule | 1.14; 5.12 | region invisible, rule OK |
| `.app-meta` `#5d5248` / `#ece7df` (11 px) | 6.17 | pass |
| disabled `#625a50` / `#e2ddd5` | 5.02 | pass (exempt anyway) |
| aria-invalid border `#79603a` / sheet | 5.83 | pass |
| CURRENT ink / off-white · doc-paper · rail | 13.53 · 13.87 · 11.32 | pass |
| CURRENT muted steps `#4E4339`/`#5A4E43`/`#65594E` on doc-paper | 9.22 · 7.73 · 6.51 | pass, three real steps |
| CURRENT clay-ink · golden-hour · terracotta · sage inks on paper | 5.61 · 5.32 · 5.28 · 5.27 | pass |
| CURRENT white on `--tab-brief … --tab-install` | 5.22 · 5.80 · 6.40 · 7.03 · 7.59 · 8.20 | pass, all six |
| CURRENT quiet-ink on every hover wash (composited) | 5.72–5.89 | pass — wash shifts ground only 1.11–1.14 |
| CURRENT `.da-secondary` resting score `rgba(44,41,38,.28)` on paper | **1.75** | **fail 1.4.11** |
| CURRENT mark dot clay `#C4A57B` vs terracotta `#D4A090` | **1.02** between states | colour-only |
| CURRENT `opacity-50` on a disabled/`aria-disabled` action | **2.21** | unreadable |

## Findings

### Proposal — colour & contrast

A01 | P3 | high | proposal | the three published ratios are honest to two decimals | computed 13.53 / 6.35 / 9.24 | keep the method; publish the on-wash and on-rail numbers too.
A02 | P2 | high | proposal | the `.lens` toggle group's only boundary is `#b6aea2` at 2.05:1 | index.html `.lens{border:1px solid #b6aea2}` | take the group border to `#8a8176` (3.58) or drop it and rely on the pressed fill.
A03 | P2 | high | proposal | the deck's own Prev/Next circles have a 1.49:1 border | `.nav-btn{border:1px solid var(--line)}` | `--line` is a hairline token, not a control token; give controls `#8a8176`.
A04 | P3 | high | proposal | `.secondary` and `.material` borders sit at 3.00–3.09:1 with zero margin, and `.secondary` *loses* contrast on its own hover (rail ground) | computed | move both to `#7f7669` (≈4.2:1) so hover never demotes.
A05 | P2 | high | proposal | ochre `#a47836` is 3.69:1 — the deck says "not a body-text color" but publishes no number, so it will become one | slide 5 token row | ship the token as `--ochre-mark` with a comment: fills, rules and ≥24 px marks only; never text.
A06 | P3 | high | proposal | the failure panel's ground is 1.14:1 against the sheet; the region reads only by its 4 px rule | `.warning{background:#f3eee3}` | keep the calm ink, deepen the ground to ≈`#efe6d4` or make the rule 6 px full-height.
A07 | P3 | med | proposal | `.app-meta` is the smallest text on every frame and carries "Fictional project & data" | 11 px, 6.17:1 | 12 px minimum for any provenance disclaimer.

### Proposal — type & legibility

A08 | P2 | high | proposal | the deck's body is **15 px** (`body{font:15px/1.55}`) while slide 12 states "Body copy remains 16px"; 16 px exists only in `.phone-content p` | CSS line 4 vs slide 12 | set the deck to 16/1.6 so the specimen and the spec agree.
A09 | P2 | high | proposal | there is no one type scale: `h3` is 26 px and is inline-overridden to 40, 33, 32, 30, 29, 27, 25, 24 and 23 px | nine `style="font-size:…"` on headings | publish four heading steps and delete every inline override.
A10 | P1 | high | proposal | the money-safety sentences are the smallest copy on the page — "Reviewing does not approve or place an order", "Review first. No order is placed.", "Illustrative all-in selection total" are all `.small` 12 px | slides 6, 7, 12 | any sentence that limits what an act does gets body size, minimum 15 px, adjacent to the button.
A11 | P3 | high | proposal | `.task button` is 12 px and `.job` 13 px (12 px ≤1000 px), under the deck's own "14 px control text" | CSS | raise both to 14 px.
A12 | P3 | high | proposal | 12 px sentence-case Inter metadata is a genuine legibility gain over the current 9–11.5 px uppercase tracked DM Mono | slide 5 scale | keep this; it is the proposal's strongest inclusive move.

### Proposal — targets & spacing

A13 | P3 | high | proposal | 44 px is real: `.primary/.secondary/.text-btn` and `.landmarks a` all carry `min-height:44px`, and a later rule corrects `.lens button` from 40 to 44 | CSS `.lens button{min-height:44px}` after the media queries | credit; state 44 in the token file so the correction is not accidental.
A14 | P3 | med | proposal | `.consent input` is 22 × 22 px, under SC 2.5.8's 24 px; the wrapping `<label>` rescues it in practice | `.consent input{width:22px;height:22px}` | 24 px.
A15 | P2 | high | proposal | `.swatch-dot` chips carry the material palette with no accessible name at all; "3 materials" appears only in a caption | 8 dots across slides 1, 6, 7, 8 | name each swatch (`role="img" aria-label="Natural oak"`) or print the three material names.

### Proposal — focus, keyboard, disabled

A16 | P1 | high | proposal | `#confirmApproval` uses the real `disabled` attribute, so a keyboard or screen-reader user never reaches the Approve button and is never told a reason | JS `consent.onchange=()=>approve.disabled=!consent.checked` | keep it focusable with `aria-disabled="true"` + `aria-describedby` pointing at "Tick the box to confirm", and on activation move focus to the checkbox.
A17 | P1 | high | proposal | after approval, focus lands on **"Reset this demo"** while an atomic `role="status"` receipt announces simultaneously — the first control after committing is the undo, and two announcements collide | `approve.onclick … #resetApproval.focus()` | move focus to the receipt heading (`tabindex="-1"`), keep a short separate `role="status"` sentence, put Reset last.
A18 | P1 | high | proposal | "Continue to approval" sends focus straight to the consent checkbox, skipping the h3 "Approve Natural oak?" and "$2,400 all-in" — consent is announced before the amount | `#reviewApprove.onclick … consent.focus()` | focus the panel heading instead.
A19 | P2 | high | proposal | changing a finish silently clears consent and closes the confirm panel | `[data-finish]` handler sets `consent.checked=false;confirmPanel.hidden=true` | announce it in a `role="status"`: "Finish changed to Smoked oak. Your confirmation was cleared."
A20 | P2 | high | proposal | the lens toggle swaps photo for plan and rewrites `#lensCaption`, but the caption is not a live region — the swap is silent to AT | `#lensCaption.textContent=…` | `role="status"` on the caption.
A21 | P2 | high | proposal | two navigation paths, two focus behaviours: arrow keys focus the destination heading, Prev/Next/select do not; and the keydown handler bails on `BUTTON`, so arrows are dead after one mouse click on Next | `showSlide(i,scroll,focusDestination)` | one behaviour; blur or re-target after button navigation.
A22 | P3 | med | proposal | `.deck-nav` is fixed at 70 px over `main{padding-bottom:78px}` — a focused control at the foot has 8 px against a 3 px ring at 4 px offset (SC 2.4.11) | CSS | `scroll-padding-bottom:90px` and raise the pad to 96 px.
A23 | P3 | high | proposal | the focus indicator is genuinely excellent — 3 px olive, 4 px offset, 8.78:1 on paper and never below 7.35 on any ground it lands on | `:focus-visible{outline:3px solid var(--olive);outline-offset:4px}` | adopt this verbatim.
A24 | P3 | med | proposal | `#findDemo` reveals the search field with no `aria-expanded`/`aria-controls` (mitigated by moving focus); `#compareToggle` does it correctly | JS | make them consistent.

### Proposal — semantics

A25 | P2 | high | proposal | no mockup has an `h1`: the client page's title "Your home, taking shape." and "Good morning, Leah." are both `h3` under the deck's `h2`, and slide 7 puts the product, the confirm panel and the receipt at one peer `h3` level | heading outline extracted from index.html | state the production heading contract separately from the deck's: `h1` = house/Desk title, `h2` = room or stage, `h3` = piece.
A26 | P2 | high | proposal | the Desk roster is `div.job` × N with no list or table semantics and three identically-named "Open" buttons; at the real 16–43 jobs a screen reader hears 43 unrelated "Open"s | slide 8 markup | `<ul>`/`<li>` (or a table for stage + state), and `aria-label="Open Alder House"` per row — the current portal already does exactly this.
A27 | P2 | med | proposal | `.receipt role="status"` is atomic and initially `hidden`; un-hiding announces heading + price + provenance + the "Reset this demo" label as one block | slide 7 | see A17.
A28 | P3 | high | proposal | literal `✓` in `.check-round`, in `.pill`, and in three feedback strings is announced as "check mark" | slides 7, 10, 11 | `aria-hidden="true"` on the glyph.
A29 | P3 | med | proposal | `ⓘ` opens the date error text and is spoken as "circled Latin small letter i" | `#dateError` | same.
A30 | P2 | high | proposal | the `.landmarks` row — the deck's answer to R135's headerless client page — links to `#room`, `#progress` and `#money`, **none of which exist in the document** | slide 6 | if landmarks are the wayfinding proposal, they must be real anchors with real targets; otherwise the proposal has not shown its own fix working.
A31 | P3 | high | proposal | the date specimen is the deck's one fully wired control: real `<label for>`, `aria-invalid`, `aria-describedby` to visible text, no colour-only error | slide 12 | make this the house pattern.
A32 | P3 | med | proposal | "Existing destinations retained" — Library / People / The Scans / Ledgers — are plain `<span>`s with no interactive affordance or focus order | `.studio-foot` | render them as links in the specimen.
A33 | P3 | low | proposal | `<h1>A home<br>taking shape.</h1>` and `Your home,<br>taking shape.` put `<br>` inside an accessible name; joining varies by engine | slides 1, 12 | use a styled span, not `<br>`.
A34 | P2 | high | proposal | the retry demo rewrites the failure panel's text to "Selection saved." while the panel keeps its warning border and rule | `#retryDemo` handler | success leaves the warning container; do not repaint a failure region as a success.
A35 | P2 | med | proposal | "Selection wasn't saved." is a `<strong>` with no `role="alert"`, no heading, no focus move, stacked between two unrelated panels | slide 11 | `role="alert"` on the panel and focus the retry control.

### Proposal — motion, imagery, colour-only meaning

A36 | P3 | high | proposal | reduced motion is handled completely — `transition/animation/scroll-behavior:none!important` plus the hover transform neutralized — and nothing autoplays | `@media(prefers-reduced-motion:reduce)` | keep.
A37 | P3 | high | proposal | image honesty is the deck's best work: every generated room is alt'd "Illustrative…"/"Generated concept…", roster thumbnails are `alt=""`, the plan SVG is `role="img"` labelled "…not to scale" | 15 `<img>` audited | adopt the alt convention as a rule.
A38 | P3 | med | proposal | `.loading-dot` declares no `animation`, so the loading specimen never spins; and `aria-busy="true"` on a button asks AT to *suppress* updates — the label swap is the real signal, with no completion announcement specified | slide 10 | specify: label swap + a `role="status"` completion sentence; drop `aria-busy` on the control.
A39 | P2 | high | proposal | colour-only meaning is otherwise well handled — `.status:before` is `currentColor` beside its word, `.pill`/`.material` carry text plus ✓, `.levels` are labelled | slide 10 caption "Text and symbols carry state; color is supplementary" | true, except A15.
A40 | P3 | med | proposal | the same `.status` component is olive on slide 6 and default ink on slide 12 | inline `style="color:var(--olive)"` on one instance only | one state colour.

### Proposal — reflow at 390

A41 | P2 | high | proposal | the deck's chapter `<select>` truncates at 390 ("Mobile & accessible for ⌄") | slide-12-390.png | let it wrap or shorten the titles.
A42 | P2 | high | proposal | at 390 "Every job · 3 shown in this prototype" wraps mid-phrase inside an `h3`, orphaning "prototype"; "Compact rows" wraps with its underline broken across two lines | slide-08-390.png | move the count out of the heading; `white-space:nowrap` on short text buttons.
A43 | P3 | med | proposal | `.app-meta` wraps to two lines with "data" hanging right-aligned | slide-06-390.png | stack it left-aligned under 700 px.
A44 | P3 | med | proposal | the three peer tasks in "Ready for your hand" get three different action treatments (boxed secondary, text-btn, text-btn) for no stated reason | slide-08-390.png | prominence must map to importance or all three match.

### Proposal — plain language

A45 | P2 | high | proposal | "Below allowance / $200" is ambiguous — below by $200, or $200 remains? | slide 7 line items | "$200 left of the $2,600 allowance."
A46 | P3 | high | proposal | "Reviewing does not approve or place an order" and "records my selection only. Purchasing is a separate step." are plainer for a first-time homeowner than the current "Finished work waits for your acceptance." | both surfaces | adopt the proposal's register for consequence sentences.
A47 | P3 | med | proposal | the deck brings its own untranslated metaphors — "Ready for your hand", "The room becomes the focal point", "Your room story starts here" | slides 8, 1, 11 | gloss each once.

### Current — designer portal (the Desk)

B01 | P1 | high | current | the roster's per-job action rests on `rgba(44,41,38,0.28)` = **1.75:1** — below SC 1.4.11 — so "OPEN THE JOB" reads as metadata until hover or focus, and on touch there is no hover | globals.css `.da-secondary .da-label::before`; desk-final-desk-390.png | take the resting score to `--color-aged-oak` `#8B7355` (4.20:1) at 1 px.
B02 | P2 | high | current | DocumentAction removes the focus outline (`.da-act:focus-visible{outline:none}`) and substitutes a 14 px `‸` at `left:1px` in quiet-ink (6.35:1) plus scores turning clay (2.18:1) | globals.css:840, 861–866 | the caret alone passes in isolation but is a single glyph on the left edge of a right-aligned control; add a 2 px quiet-ink outline as a fallback for the roster instance.
B03 | P1 | high | current | ⌘K is `role="dialog"` with **no `aria-modal`**, no `role="listbox"`/`role="option"`, no `aria-activedescendant`; arrow keys move a purely visual index | command-bar.tsx:1074–1095 | one of the Desk's three named acts is unusable with a screen reader.
B04 | P2 | high | current | the 7 px job mark dot encodes quiet vs urgent as clay vs terracotta — **1.02:1 between the two states**, 2.18 and 2.13 against paper | desk-roster.tsx:25–30, 96–107 | keep the dot as ornament and make the urgent row's terracotta sentence unconditional; or differentiate by shape (open ring vs filled).
B05 | P2 | high | current | no skip link and no in-page landmark nav exists in either portal (`grep "Skip to"` → nothing); with 16–43 jobs a keyboard user tabs every job link and every action to reach the Studio index | repo-wide grep | one visually-hidden "Skip the roster" link before `DeskRoster`.
B06 | P2 | high | current | the roster's accessible name is `${act.label} — ${line.name}`, and `line.name` is the job *type*: three consecutive rows announce "Open the job — Full Room" | desk-roster.tsx:136,147; desk-final-desk-390.png | include the client: "Open the job — Full Room, Sarah Chen".
B07 | P3 | high | current | `disabled:opacity-50` / `aria-disabled:opacity-50` puts quiet-ink at **2.21:1**, and `aria-disabled` controls stay focusable — a keyboard user reaches a word they cannot read | document-action.tsx:53 | use `--text-faint` at full opacity plus `aria-describedby` for the reason.
B08 | P3 | high | current | the six stage plates are white on `--tab-*` at **5.22–8.20:1** with the stage word inside the plate — colour is genuinely supplementary | globals.css:151–156 | protect.
B09 | P3 | high | current | three real muted steps (9.22 / 7.73 / 6.51 on doc-paper) and hover washes that shift the ground only 1.11–1.14:1, so the quietest ink never falls below 5.72:1 on any wash — with the ratios written into the CSS | globals.css:80–81,104,165–182 | this is stronger token discipline than the proposal's sheet, which publishes no on-wash numbers.
B10 | P2 | high | current | every action word on the Desk is 12 px uppercase DM Mono with tracking; the 44 px box is honest but the label is at the floor | document-action.tsx:53 | 13 px, or sentence case at 13 px.

### Current — client portal (the Threshold)

C01 | P1 | high | current | room-band footprint labels are `fontSize={11}` SVG **user units** in a `viewBox` 1000 wide — at 390 (≈358 px of content) they render at **3.9 px**; `plan-key.tsx` already solved exactly this with a documented "eleven-pixel floor" and a phone crop, and `room-band.tsx` never got it | room-band.tsx:53,70,230 vs plan-key.tsx:24–35; client-local-dev-phone.png | port the phone bump + crop from plan-key.
C02 | P1 | high | current | the tester-notes widget sits on the invoice line at 390, covering "September" in "Balance $4,060, due September 11" | client-local-dev-phone.png | a floating widget must never overlap money or a date — offset it, or hide it on the Threshold.
C03 | P2 | high | current | below 600 px the story pole's `<ol>` of phase names is `display:none` and the six replacement dots are `aria-hidden="true"`, with held/walked/ahead encoded only in fill and border colour — on a phone the phase list exists for nobody | story-pole.tsx:153–176, 179–180 | give the dots names, or keep a one-line "Installation · 5 of 7".
C04 | P2 | high | current | the doorstep sentence — the page's statement of what is owed, at 23–34 px — is a `<p>` inside `aria-live="polite"`, so heading navigation skips the most important line on the page | doorstep.tsx:81–90 | make it an `h2` (the `h1` is the project name) and keep the live region.
C05 | P2 | high | current | `HoldAction` renders the real `disabled` attribute, so the wall/door accept control leaves the tab order until a name is typed and its `aria-describedby` hint is unreachable from it | scored-action.tsx:521; wall-gate.tsx:280 | same fix as A16 — `aria-disabled` + describedby. The visible hint ("Type your full name to accept.") is already the right copy.
C06 | P2 | high | current | TrackingRow is the best accessibility work on either surface: an `sr-only` "stage — stop N of 6", the stamp and stop label `aria-hidden` so nothing is read twice, `alt=""` on the thumbnail, and a bordered placeholder for both a null URL and a 404 | tracking-row.tsx:66–70, 112–117, 148–150, 196–200 | protect verbatim.
C07 | P2 | high | current | visually, the same stage word is printed twice at **9 px** — spine label (0.16em) and rotated stamp (0.2em bold) — the smallest type on either portal, on the line that says where a homeowner's furniture is | tracking-row.tsx:187, 210 | print it once at 11 px; keep the stamp as a mark without the word, or raise the stamp to 11 px and drop the spine label.
C08 | P2 | med | current | the room-band SVG's name is "Section through Study, with two footprints on the floor" — it never names the pieces, and the good non-colour encoding (dashed = on its way, drawn = standing) is absent from the name | room-band.tsx:164–166 | "…: reading chair, standing; built-in shelving, still on its way."
C09 | P3 | med | current | the whole-row overlay button gives a large target and one clean name but blocks text selection — a homeowner cannot copy a piece name or a price | room-band.tsx:466–471 | leave the price outside the overlay.
C10 | P3 | med | current | at 390 the plan key's drawn label elides ("Built-in shelving, no…"); the full sentence survives in the key list beside it | client-local-dev-phone.png; plan-key.tsx | working as designed — but the elided form is the one at the mark.
C11 | P3 | high | current | `role="alert"`/`role="status"` used correctly and widely, `role="radiogroup"` with roving tabindex on the star rating, `aria-modal` dialogs with `tabIndex={-1}`, `aria-expanded`/`aria-controls` on every disclosure, `min-h-[44px]` rows throughout, `role="img"` + written labels on the letterbox and wall drawings | grep across `threshold/` | the current client portal is materially more accessible than the proposal's prototype; the proposal should be measured against it, not the other way round.
C12 | P2 | high | current | DM Mono uppercase at 10–11.5 px with 0.13–0.14em tracking carries every *label*: "PREPARED FOR NORA ELLISON", "THE LETTERBOX", "WHAT CHANGED SINCE YESTERDAY", "HATCHED", "OPEN", plus every action word | doorplate.tsx:69; letterbox.tsx:232; current-state.md §6 | contrast is fine (mocha 7.86, muted 6.35); size and case are not — uppercase removes word-shape, the cue low-vision and dyslexic readers lean on hardest, and tracked 11 px mono measures roughly like 8.5 px lowercase Inter.
C13 | P3 | low | current | uppercase tracking is **not** a screen-reader defect at these lengths — the claim sometimes made for it does not hold for short labels; the cost here is purely sighted legibility | expert judgment | do not justify the change on AT grounds.
C14 | P3 | med | current | `--color-error: #C77B6E` is declared in the client globals but forbidden by name | client globals.css:53 (per current-state.md §5) | delete the token or rename it to what it is.
C15 | P2 | high | both | **my floor for money, dates and names:** 15 px minimum, sentence case, ≥ 4.5:1, never inside an `aria-hidden` or colour-only mark. Today the Threshold sets the goods stage at 9 px, the plan-key labels at 3.9 px on a phone, and the proposal sets "no order is placed" at 12 px | computed above | one rule, both portals.

---

## After reading §7–8: new / known / touches

Marked only where it changes the reading. Everything not listed is **new**.

**Known:** **C02** — §8 item 3, "confirmed, high severity," fix had not
landed. But §8 item 5 records the widget "doesn't exist in the client portal
at all"; `client-local-dev-phone.png` shows it on the invoice line, so item
5's premise is stale — resolve that before item 3 is closed as N/A. **C14** —
§8 item 9 verbatim. **C03** is adjacent to §8 items 1/2/4 (story-pole gaps)
but **new**: those record what the pole prints; this records that below 600 px
it prints to nobody.

**Touches:**

- **B01, B02, C05, A16, top-5 #2 & #3** — `touches: I107`. Every fix keeps the
  bare-word-plus-score grammar and changes only the score's ink value, or the
  disabled *mechanism* (`aria-disabled`, not `disabled`). No box, border, fill.
- **B04** — `touches: VISION.md:73, R126`. Shape, not a second hue: no new
  colour, no red or green.
- **B05, top-5 #5** — `touches: D1` ("no persistent global nav inside a
  document"). A skip link is invisible until focused and gone on blur — not
  persistent nav. Flagged so reconciliation says so rather than pattern-matching.
- **A34, A35, and every `role="status"` I recommend** — `touches: R51`. None is
  a toast: `role="status"` here means a *stationary* sentence already on the
  page marked live — the device the Threshold already uses at
  `letterbox.tsx:238`, `settlement.tsx:198`, `road-orders.tsx:102`. Only a
  floating, timed, dismissible surface conflicts with R51.
- **A06, A34, A35** — `touches: DECISIONS.md:10717`. The proposal's failure
  panel already obeys it (`#79603a`, not red), so the fix is a deeper ground
  and a stronger rule, not colour.
- **C01, top-5 #1** — `touches: R107 / DECISIONS.md:3775`. Honest and legible
  compound badly: a lighter, dashed footprint labelled at 3.9 px is honest
  about its uncertainty and illegible about its subject. Raising the type is
  what lets R107's distinction be seen.
- **A45, A46, top-5 #4** — `touches: R137`. Keeping "records your selection"
  and "takes a payment" verbally distinct is R137's separation, in words.

**One finding formed only after §7:**

A48 | P2 | high | proposal | the proposal's depth system (`--lift` 8 px,
`--overlay` 20 px, "extend the current three-site shadow exception") is
CI-blocking-lint-forbidden on Document surfaces, and separately it is the
weakest possible affordance cue for the users I represent: a soft 10%-alpha
shadow is invisible at 200 % zoom, in high-contrast mode, on a low-quality
panel, and to anyone with reduced contrast sensitivity — the exact population
that most needs to know what is interactive | `eslint.config.mjs:83-101`;
`--lift:0 8px 24px #2c292610` | if depth ships, it must be redundant with a
non-shadow cue (a 1 px ≥3:1 border, or a ground shift ≥1.2:1) so the Record /
Object / Sheet distinction survives `forced-colors: active`. Neither portal nor
the proposal declares a `forced-colors` block anywhere. `touches: D4, R126,
eslint.config.mjs:83-101`

## What the proposal gets right

- **It published its contrast numbers and they are true** to the second decimal.
  Few outside decks survive that check.
- **The focus indicator is better than either portal's** — 3 px olive at 4 px
  offset, never below 7.35:1 on any ground it lands on. Adopt it verbatim.
- **Image honesty.** All fifteen images audited: generated rooms alt'd
  "Illustrative"/"Generated concept", roster thumbnails `alt=""`, the plan SVG
  named "…not to scale". No picture claims to be a real installation.
- **Sentence-case 12 px Inter metadata** instead of 9–11.5 px tracked uppercase
  mono — the largest readability gain on offer for a 45–65-year-old homeowner.
- **Colour is supplementary almost everywhere:** `.status`'s dot is
  `currentColor` beside its word, chips carry text plus a mark, the depth triad
  is labelled. Stated rule and code agree.
- **Reduced motion is complete** and nothing autoplays or loops.
- **The consequence copy is the plainest writing in this review.** "Reviewing
  does not approve or place an order." "No order placed. No payment taken."
- **44 px is honoured**, including a late correction pulling `.lens button` from
  40 to 44 — someone checked.
- **The date-field specimen** (`<label for>` + `aria-invalid` +
  `aria-describedby` + visible non-colour error) is a correct, copyable pattern.

## What is already excellent in the current portals

- **TrackingRow's screen-reader contract** (C06): one `sr-only` sentence,
  everything decorative hidden, no double-reading, a designed placeholder for
  both null and 404 images. Best work on either surface.
- **The six stage plates** (B08): 5.22–8.20:1 white-on-pigment with the stage
  word *inside* the plate, so colour is decoration.
- **Three real muted steps, and washes with published ratios** (B09): every wash
  shifts the ground only 1.11–1.14:1, so the quietest ink never falls below
  5.72:1 anywhere. The proposal's sheet gives no equivalent guarantee.
- **`plan-key.tsx`'s "eleven-pixel floor"** — a documented minimum *rendered*
  type size for SVG lettering, enforced by a phone crop. More rigorous than
  anything in the proposal.
- **The roster's per-row accessible name** — the exact thing the proposal's Desk
  mockup lacks.
- **Threshold ARIA breadth** (C11): correct `alert`/`status`, a roving-tabindex
  radiogroup, `aria-modal` dialogs, `aria-describedby` reasons on hold gates,
  44 px rows, written labels on every decorative SVG.
- **The story pole's deliberate refusal of a live region** — a considered
  decision, documented in the code, not an omission.
- **Never a broken-image glyph:** null and failed URLs draw the same quiet block.

## Top 5 changes for polish & professionalism

**1. One legibility floor for money, dates and names — 15 px, sentence case,
≥ 4.5:1.** Where: `tracking-row.tsx:187,210` (9 px → print the stage once at
11 px), `room-band.tsx:70` (port plan-key's phone bump: `FOOT_TYPE` 11 → 17
units with a cropped viewBox so the divisor cannot exceed what 17 units carries
at an 11 px rendered floor), `doorplate.tsx:69` and `letterbox.tsx:232`
(11 px uppercase → 12 px sentence case, tracking 0.13em → 0.02em), and slides
6/7/12 of the proposal (`.small` 12 px → 15 px for any sentence that limits an
act). States: unchanged. Why: today a homeowner on a 390 phone reads her
furniture's location at 3.9 px and "no order is placed" at 12 px.
`touches: R126 (type discipline)`

**2. Give every action a resting affordance that meets 3:1.** Where:
`globals.css .da-secondary .da-label::before` — `rgba(44,41,38,0.28)`
(**1.75:1**) → `--color-aged-oak` `#8B7355` (**4.20:1**) at 1 px; same for any
tertiary that rests unscored. Why: on a touch device there is no hover, so the
Desk's per-job action is currently indistinguishable from metadata
(desk-final-desk-390.png). Keeps the scored-ink grammar; changes only the ink.
`touches: I107, D4`

**3. Replace every `disabled` gate with `aria-disabled` + a named reason.**
Where: `scored-action.tsx:521` (`HoldAction`), `wall-gate.tsx:280`,
`door-gate.tsx:850`, and the proposal's `#confirmApproval`. Spec: keep the
control focusable, `aria-disabled="true"`, `aria-describedby` → the existing
visible hint id, and on activation move focus to the unmet input and announce
"Type your full name to accept" in a `role="status"`. States: unmet, met,
loading (`aria-busy` on a wrapper, not the control), error. Why: a keyboard or
screen-reader user currently cannot find the accept button at all, and money and
signatures sit behind it. `touches: I107`

**4. Fix the approval sequence's focus and announcement order.** Where: the
proposal's slide 7 JS, and the pattern it will become. Spec: "Continue to
approval" focuses the confirm panel's heading (`tabindex="-1"`, "Approve Natural
oak? — Round oak coffee table, $2,400 all-in"), not the checkbox; confirming
focuses the receipt heading and announces one short `role="status"` sentence
("Selection recorded: Natural oak, $2,400"); Reset moves to the end of the
panel; changing a finish announces "Finish changed. Your confirmation was
cleared." Why: today the amount is announced *after* consent is given, and the
first control after committing is the undo. `touches: R137`

**5. Make the Desk survivable by keyboard at 43 jobs, and the ⌘K palette usable
at all.** Where: `desk/page.tsx` — a visually-hidden "Skip the roster" link
before `DeskRoster` (`sr-only focus:not-sr-only`, 44 px, 2 px quiet-ink ring);
`desk-roster.tsx:136,147` — include the client name in the action's
`aria-label`; `command-bar.tsx:1074–1095` — add `aria-modal="true"`,
`role="listbox"` on the results with `role="option"` + `aria-selected` per row
and `aria-activedescendant` on the input, and a `role="status"` result count.
Why: three consecutive rows currently announce "Open the job — Full Room", and
"Find anything" — one of the Desk's three named acts — announces nothing at all
as the highlight moves. `touches: R95, D4`
