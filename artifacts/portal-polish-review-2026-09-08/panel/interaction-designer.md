# Interaction design — panel report

Slug: `interaction-designer`. Lens: what a user does first, second, and when
something goes wrong. Findings were written cold (before §7–8) and are marked
**new** / **known** / **touches** afterwards.

Thesis. The proposal is right that Patina's actions are hard to find and that
the decision moment needs a stated consequence — right about the *client*
portal's approval copy, wrong about the *Desk*, where board-first costs the
designer with 16 jobs and 1 overdue the only thing she came for. The current
portals already hold a more defensible terminal act than anything in the deck
(`HoldAction`, typed name, dated consent line) — they simply don't *show* it.

---

## Findings

### Affordance

```
IX01 | P1 | high | current | The client portal's terminal acts must be pressed and held for 900ms, and no sighted pointer user is ever told so — the sentence "Press and hold to accept the finished work." is sr-only, and the visible "or press and hold Enter" hint renders only when focus arrived by keyboard | scored-action.tsx:601-612 (`keyboardHint && …`, `<span id={saidId} className="sr-only">`); HOLD_MS = 900 (:288) | Draw a persistent DM-Mono hold caption beside the word for pointer users too, and let a short click ink the rule ~15% then rest with "Hold to accept." — new
IX02 | P1 | high | current | The wall gate's accept act renders at full primary ink (#2C2926, sampled) while the name field is empty and the code intends it disabled — visually identical to an available action | shots/current/client-local-dev-phone.png (pixel sample of "ACCEPT THE FINISHED WORK" = 44,41,38, same as the gate title); wall-gate.tsx:279 `disabled={!signatureIsComplete(signedName)}` | Give unarmed a real rest state: drop both scores to a single 1px hairline at 30% and hold the word at --text-faint — new
IX03 | P1 | high | current | `.da-tertiary` carries no rule at rest (`transform: scaleX(0)`) and no ink pool — a tertiary action is typographically identical to metadata until hovered, and on touch there is no hover at all | globals.css:690-701; visible as unmarked "PRINT" (doorstep) and "ASK FOR A CHANGE" (mat) beside marked siblings — shots/current/client-local-dev-desktop.png, client-local-dev-multi.png | Give tertiary a rest rule at 1px / 22% that thickens on hover, or reveal it unconditionally under `@media (hover: none)` — touches: I107 (still a rule, never a box)
IX04 | P1 | high | current | Every roster job name is a link whose underline is `decoration-transparent` and only paints on row hover/focus-within — so on a phone the Desk's 16 primary destinations carry no interactive mark | desk-roster.tsx:110; globals.css:409-428 (`.row-wash-score::after { transform: scaleX(0) }`) | Paint the name's rule at rest in `--doc-rail-stock` and let hover raise it to clay — new
IX06 | P2 | high | current | All 16 roster acts are `variant="secondary"` — one 1px score at 28% opacity — so the roster has no primary anywhere, and at the fixture every act reads the identical words "OPEN THE JOB" | desk-roster.tsx:137,148; globals.css:677-680 (`rgba(44,41,38,0.28)`) | Promote the single overdue row's act to `primary` and let `line.act.label` carry the verb the need actually wants ("Respond by Sep 2") — new
IX07 | P1 | high | current | Focus is `outline: none` replaced by a 14px `‸` caret at `left:1px` in `--color-quiet-ink` — a keyboard user tabbing 16 rows tracks a pale mark in the control's left gutter rather than a ring | globals.css:840-861 | Keep the caret and add a 2px clay outline at 2px offset on `:focus-visible`; the proposal's 3px/4px olive ring is the right idea, wrong pigment — touches: I107
IX08 | P2 | high | both | Disabled is opacity-only on both sides: current `disabled:opacity-50` on 12px mono; proposal `.primary:disabled,.secondary:disabled` collapse to one identical grey box, so a disabled primary and a disabled secondary become the same object and lose their role | document-action.tsx:53 BASE_CLASS; proposal CSS `.primary:disabled,.secondary:disabled{background:#e2ddd5;color:#625a50;border:1px solid #a79d91}` | Disabled should keep role: primary stays filled at low chroma, secondary keeps its outline — new
IX10 | P1 | high | current | Three unrelated action grammars ship in one product: scored ink (Desk, Threshold), a filled charcoal button + selectable radio rows + underlined text link (invoice), and outlined glyph pills (client verdicts) | shots/current/invoice-open-desktop.png ("Pay $9,130.00"); document-schedule-boards-1-client-verdicts-desktop.png (✓ APPROVE / ✗ FLAG / ✎ NOTE) | Pick one three-tier scale and assign tiers by consequence, not by page — new
IX11 | P1 | high | current | On the verdict list a green "● APPROVED" state chip sits in the same row, same shape and near-identical size as the "✓ APPROVE" act chip; the act stays enabled after approval | shots/current/document-schedule-boards-1-client-verdicts-desktop.png | Replace the state chip with a dated body-ink sentence and remove the act once taken — touches: VISION.md:73 (badges, red/green status)
IX12 | P1 | high | proposal | The proposed house page carries no letterbox, no balance and no due date, so its single filled primary is "Review the table selection" — on Nora's real house, where an invoice is open, the deck's one visible primary points away from the only obligation with a date on it | slide-06-1440.png (no money region anywhere on the frame); compare shots/current/client-local-dev-desktop.png doorstep "$4,060 · due 11 September" | The filled tier must be reserved for the page's actual obligation; a review is a secondary — touches: R137
IX26 | P2 | high | proposal | "Ready for your hand" gives three sibling rows three different affordance tiers — outlined `Review`, underlined `Open detail`, underlined `View` — with no stated rule for the promotion | slide-08-1440.png | One tier per list; promote by position or a leading mark, not by button style — new
IX23 | P2 | med | proposal | `.text-btn` shares the whole `.primary` box model (min-height 44px, 11/19px padding, 600 weight, 6px radius) and differs from `.secondary` by a single 1px border, so tiers 2 and 3 are nearly the same physical object | proposal CSS `.primary,.secondary,.text-btn{…padding:11px 19px;border-radius:6px;font-weight:600;font-size:14px}` | Drop `.text-btn` to 400 weight and zero horizontal padding so it reads as text — new
IX38 | P2 | high | current | Within one region, sibling acts of equal weight are marked inconsistently: "OPEN THE LETTERBOX" scored, "PRINT" unmarked; "LEAVE THE HOUSE" scored, "ASK FOR A CHANGE" unmarked | shots/current/client-local-dev-desktop.png (doorstep); client-local-dev-multi.png (mat) | Fixed by IX03; audit every tertiary placed beside a secondary — new
```

### The decision moment

```
IX09 | P1 | high | current | Gesture weight does not track consequence: paying $9,125 is one click on a filled button, while accepting $2,980 of finished work requires a typed full name plus a 900ms hold | invoice-open-desktop.png ("Pay $9,130.00"); wall-gate.tsx:258-284 | Rank the gestures — money leaving the account deserves at least the confirmation the wall gets — new
IX42 | P1 | high | current | The wall/door gate never states what acceptance does. The proposal's single best contribution is the sentence sitting at the button: "Approval records this selection and finish. It does not charge you or place an order." The current gate says only "Type your full name to accept" | slide-07-1440.png vs shots/current/client-local-dev-desktop.png gate crop; wall-gate.tsx:286-294 | Print a one-line consequence sentence above every gate act, naming the draw it releases — new
IX13 | P1 | high | proposal | Approving hides `#selectionDetails` outright, so the receipt replaces the spec, the line items and the allowance with three lines. What the client approved becomes less legible the moment she approves it, and the receipt carries no name, no reference and no way back to the terms | slide-07-1440-state-receipt.png; JS `approve.onclick=()=>{…#selectionDetails.hidden=true…}` | Keep the line items beneath the receipt, stamped and dated; a record that shrinks is not a record — new
IX45 | P2 | high | current | At the gate, the signature input's rule and the accept act's scored rule are two nearly identical horizontal lines side by side doing opposite jobs; and the label "TYPE YOUR FULL NAME" and helper "Type your full name to accept." say the same thing twice | shots/current/client-local-dev-desktop.png gate crop; signature-line.tsx:77-101 | Stack the act under the rule (as the phone layout already does), and let the helper carry the consequence instead of repeating the label — new
IX14 | P2 | high | proposal | After the receipt the finish swatches are set `disabled` in JS but keep their full visual treatment, including the selected outline on Smoked oak — inert controls that still look live | slide-07-1440-state-receipt.png; JS `[data-finish].forEach(b=>b.disabled=true)` | Render approved finishes as a static stamped line, not as buttons — new
IX15 | P2 | high | proposal | The consent checkbox — the gate on the whole approval — is 22×22px, half the 44px minimum the same slide asserts. (The `<label>` wrapper does enlarge the effective target, so this is a visual-target contradiction, not a tap failure) | proposal CSS `.consent input{width:22px;height:22px}` vs slide-10 "44px minimum target" | 24px box inside a 44px row, with a visible focus ring specimen — new
IX16 | P2 | high | proposal | "Continue to approval" moves focus straight onto the consent checkbox, skipping the "Approve Smoked oak? · $2,400 all-in" heading — a screen-reader user reaches the consent without hearing what or how much | JS `#reviewApprove.onclick=…consent.focus()` | Focus the panel heading (tabIndex -1); the checkbox is the next stop — new
IX17 | P2 | high | proposal | Changing the finish while the confirm panel is open silently closes it and clears consent, with nothing written to any `role=status` region | JS `[data-finish]` handler: `consent.checked=false;approve.disabled=true;confirmPanel.hidden=true` | Announce "Selection changed — confirm again" in the existing feedback line — new
IX32 | P1 | med | proposal | "Request a change" — the client's only alternative to approving — resolves to one static sentence in a `role=status` line. No composer, no recipient, no confirmation of delivery. The textarea specimen on slide 12 is never wired to it | slide-07-1440.png; JS `#requestChange.onclick` writes `#changeFeedback` only | Specify the change path as a real instrument: composer, named recipient, and a dated entry in the record — new
IX44 | P3 | med | proposal | The receipt container is itself `role="status"` and contains an interactive control ("Reset this demo"), which puts a focusable element inside a live region | proposal markup `<div class="receipt" id="approvalReceipt" hidden role="status">…<button>` | Put `role=status` on an inner text node only — new
```

**Verdict on the two gates.** At the moment of choosing, the proposal is
clearer: consequence sentence, disabled-until-consent, allowance line. If
disputed, the current gate wins decisively — typed full name
(`autoComplete="name"`), a date fixed once, a `SIGNATURE_NOTICE`, and a
per-instrument consent line drift-tested against the signing API, varying by
document kind ("Sign authorization" / "Sign and authorize" / "Sign and
accept") — `consent-copy.ts:29-58`. A comprehension checkbox records that
someone understood; a typed name records *who*. Keep both by separating
tiers: a **selection** (reversible, checkbox or hold, receipt) and an
**authorization** (typed name, consent line, notice, permanent entry). The
proposal collapses them upward; the current portal collapses them downward —
one-tap verdict pills give a $9,000 sofa the same gesture as dismissing a
note.

### Feedback and state

```
IX24 | P2 | high | proposal | In the failure panel the recovery act "Try again" is the weakest tier on the page (`.text-btn`), and the panel border is #9b865f/#79603a — a brown that appears in no token sheet, adjacent to the declared material ochre #A47836 | slide-11-1440.png; proposal CSS `.warning{border:1px solid #9b865f;border-left:4px solid #79603a}` | Recovery is the primary of its panel; and warning must not share a hue family with "this is a wood finish" — touches: R126 (colour at three sites), DECISIONS.md:10717
IX30 | P2 | high | proposal | Coverage gaps: no section- or page-level loading state anywhere (only a button-level "Saving selection…"), no long-content specimen, no overflow/many-rooms specimen, no partial-failure state, no offline state | slides 10, 11, 12 | Add a skeleton specimen and a long-roster specimen before build — new
IX31 | P2 | high | proposal | The forms slide specifies a text field and a textarea and omits every control the flows actually turn on: checkbox (the approval gate), radio (the invoice's three payment methods), select, and currency | slide-12-1440.png vs invoice-open-desktop.png | Specimen the consent checkbox and the payment radio at minimum — new
IX37 | P2 | high | current | An empty letterbox still draws a letter standing in the slot; the caption below reads "Nothing in the letterbox." The drawing contradicts the sentence | shots/current/client-local-dev-multi.png | Draw the empty slot empty, or draw nothing — new (letterbox.tsx:38-40 states empty draws as empty; the render disagrees)
IX41 | P2 | high | current | Rooms with nothing in them render as bare bordered rectangles with the room name in 9px mono inside — precisely the "anonymous empty rectangle" the proposal's slide 11 warns against | shots/current/client-local-dev-desktop.png (Hall, Stair) | Adopt the proposal's empty-room copy: room name, the next real step, no rectangle — new
IX43 | P3 | high | current | Each tracking row prints its state twice: a boxed "IN PRODUCTION" stamp at the right and the same words under the micro-spine. At 390 the stamp box takes ~100px of a 390px column | shots/current/client-local-dev-phone.png crop | Drop the spine's repeat of the stamp word at narrow widths — new
IX33 | P3 | med | proposal | "Mark update as seen" is an outlined secondary in the milestone panel — the only act there — with no stated consequence. A homeowner will read it as required; whether the studio sees it is unspecified | slide-11-1440.png | Either state what it does for the studio, or make it a text-tier dismissal — new
IX47 | P2 | high | current | Three money figures share the doorstep without reconciliation: "$11,100 agreed," "$4,060 · due 11 September," and per-piece prices ($8,120, $2,980) that don't sum to either | shots/current/client-local-dev-desktop.png | One sentence tying agreed / paid / owed together — new
IX39 | P2 | high | current | Hierarchy inversion at the money region: "The house stands at $11,100 agreed" is a ~19px Playfair head; "$4,060 · due 11 September" — the figure with an obligation and a date — is ~12px DM Mono beneath it | shots/current/client-local-dev-desktop.png doorstep crop | The number that requires an act outranks the number that doesn't — touches: R126
IX48 | P3 | high | — | `shots/current/client-path-b-desktop.png` is 393×1400, not a desktop capture; the Path B door gate and its consent checkbox cannot be read from it | file dimensions | Re-capture at 1440 before the synthesis relies on Path B — new
```

Where each is silent: **the proposal** shows no loading, long content,
offline, partial failure, post-payment state, "approval withdrawn," or
multi-decision page (its house has exactly one). **The current portals**
cover empty, loading, error and focus-return in code (`DocumentAction`'s
`loading`/`aria-busy`/`restoreFocusRef`; `wall-gate.tsx:301-307` refusal
under `role="alert"`; `DeskRoster`'s italic empty line) but draw every one of
them in the same 12px quiet mono as the resting state.

### Motion

```
IX35 | P3 | high | current | The Desk plays a 320ms settle with a 60ms stagger capped at row 7 on every page load — the one motion on either surface that no action triggered. At 16 rows, rows 8–16 land together after the first seven have staggered, which reads as a hitch | globals.css:430-449 | Keep it for a first visit, drop it on return — touches: R15 (all motion interaction-triggered)
IX36 | P3 | med | current | Control feedback runs long against the proposal's own band: the ink flood is 260ms (press 200ms), the tertiary's rule reveals over 300ms, versus the proposal's 120–180ms for control feedback | globals.css:605, 695, 812; slide-11 caption | Bring the tertiary reveal to 150ms; the 70ms press-in is right and should stay — new
IX05 | P2 | high | current | The Desk's best wayfinding sentence — "One thing is overdue — Vandersteen." — is a plain `<p>`. The one urgent thing is named and not clickable | desk-roster.tsx:171-173 | Make the job name in that sentence the link to the job — new
IX40 | P1 | high | current | The doorstep announces "Finished work waits for your acceptance" and the gate that answers it sits ~1,400px further down, past the plan key, a room band and an elevation, with no jump | shots/current/client-local-dev-desktop.png (headline y≈290, gate y≈1500 of 4392) | Make the doorstep sentence an anchor to its gate — new
```

The proposal is calmer on paper (120–180ms, a 1px lift, no loops); the
current grammar is more legible in the hand (the ink knows where it was
touched; the press drops the word 1px). Motion earns its place in one spot
neither design uses it: **moving the reader to the act she was just told
about** — a scroll-to-gate on the doorstep sentence.

### Desk under real load

```
IX25 | P1 | high | proposal | The board block plus "Ready for your hand" occupies ~460px above the roster head. With Leah's 16 jobs and 1 overdue, the overdue line moves below the fold behind a board she has already seen; the deck's own audit says the live Desk holds 43 | slide-08-1440.png; slide-08-390.png (~1,450px before the first roster row) | Put the board strip below the roster, where RecentBoardsStrip already lives — touches: VISION.md:50 (never optimize the studio surface for engagement)
IX27 | P2 | high | proposal | Stage grouping is replaced by a flat list with a stage column. Seven coloured stage plates let an eye jump to "Direction · 3" in one saccade; a repeated word in column two at 43 rows does not | slide-08-1440.png vs desk-final-desk-1440.png | Keep the plates; adopt the proposal's thumbnails inside them — touches: R126
IX28 | P2 | high | proposal | "Find a project" is a two-step, pointer-first, page-local filter over visible roster rows, replacing a global ⌘K that also reaches Library, Ledgers and People | JS `#findDemo.onclick=…#projectSearch.hidden=false`; compare desk-final-desk-1440.png "FIND ANYTHING ⌘K" | Keep ⌘K global; add the inline filter as an addition, not a replacement — new
IX29 | P2 | high | proposal | The density toggle hides thumbnails (`.roster.compact img{display:none}`) — so the image-forward thesis and the density need are resolved by a control the user must find, and the choice does not persist. It also does not compact the 460px board block | slide-08-1440-state-compact.png; proposal CSS | Persist the choice per user; default to compact above ~12 jobs — new
IX18 | P2 | high | proposal | The density toggle sets `aria-pressed=true` while flipping its own label to "Comfortable rows," so assistive tech announces "Comfortable rows, pressed" when compact is on | JS `#densityToggle` handler | Keep one label ("Compact rows") and let `aria-pressed` carry the state — new
IX34 | P3 | med | proposal | The landmark row (Your rooms / What changed / Selection & allowance) sits at the foot of the house page, after everything it points at | slide-06-1440.png | Place it under the doorstep sentence — touches: R135
```

### Forms and mobile

```
IX19 | P1 | high | proposal | At 390 the client decision runs ~1,750 CSS px: finish swatches at ~480, "Continue to approval" at ~1,490, and the confirm panel opens *below* that. Four scroll segments to approve, with nothing sticky | slide-07-390.png (780×3518 @2x) | Adopt the mechanism the client portal already has: `HoldAction`'s `mobile_dock` presentation keeps the act on the bottom edge while its paper is on screen — new
IX20 | P2 | high | proposal | On mobile the finish swatches come ~1,000px before the price table, so the client chooses the finish before seeing what the selection totals | slide-07-390.png | Move the money summary above the swatches at narrow widths — new
IX21 | P2 | high | proposal | Ochre #A47836 is declared as the material accent (finish swatches, material sheets) and a near-neighbour brown is used for the failure panel and the invalid date field — the same hue family means "this is oak" and "this went wrong" | slide-05-1440.png tokens; slide-11/12 `.warning` and `aria-invalid` specimens | Separate the two; material keeps ochre, failure takes ink weight and a hairline — touches: R126, DECISIONS.md:10717
IX22 | P3 | high | proposal | `.primary` carries `box-shadow: 0 2px 3px #2c29261a`, a fourth elevation not in the declared Record/Object/Sheet triad and below the deck's own stated levels | proposal CSS `.primary{…box-shadow:0 2px 3px #2c29261a}` | Either declare it or drop it — touches: D4 (`CLAUDE.md:21`), `eslint.config.mjs:83-101`
IX46 | P3 | high | current | "Ask for a change" appears four times on one house page — once per room band plus once on the mat — at identical weight, so none of them reads as the page's change path | shots/current/client-local-dev-desktop.png | One change act on the mat; per-room becomes a quieter inline mark — new
```

Also **known** from §8 and confirmed in the shots: the dark circular "N"
tester widget sits over the client page's lower left in both captures and is
recorded as overlapping the letterbox balance line at ≤600px
(`waves/w2/gates.md:434-438`).

---

## What the proposal gets right

- **The consequence sentence at the button** — "Approval records this
  selection and finish. It does not charge you or place an order." One line,
  and it does more for a homeowner's trust than any visual change in the deck.
- **Focus management in the prototype** — open → consent; cancel → trigger;
  approve → reset; reset → trigger. Better than most shipped flows.
- **Reserved feedback space** (`.feedback{min-height:28px}`): a status line
  never shifts the layout under a pointer.
- **Every feedback string is a `role="status"` region, never a toast** —
  which lands, without saying so, exactly where R51 already stands.
- **`Approve selection · $2,400`** — the amount inside the label; the
  invoice's own "Pay $9,130.00" pattern, correctly generalised.
- **"Nothing needs you today"** — "No invented urgency, random
  recommendations or artificial progress" is the right instinct, well written.
- **A focus ring at 3px / 4px offset**, and a reduced-motion rule that
  preserves state changes.
- **Naming that the finish samples are not colour-accurate**, at the moment
  of choosing.

## What's already excellent in the current portals

- **`HoldAction`** — the best-considered terminal act in either design:
  900ms, keyboard hold parity so nobody gets a shorter path to a terminal
  decision, scroll cancels, early release is a silent cancel not a failure,
  reduced motion stills the fill but keeps the wait, and a `mobile_dock`
  presentation so a long paper cannot bury the act.
- **`consent-copy.ts`** — per-instrument consent lines and act labels, drift
  tested against the signing API. This is "defensible if disputed."
- **"One thing is overdue — Vandersteen."** One sentence above 16 rows,
  naming the only thing that matters. The proposal has no replacement.
- **The stage plates** — seven pigments, 11px white mono, count included:
  the fastest scan device on either surface at real load.
- **Absence is silence** — and the doorstep withholding its sentence until
  every query answers prevents the worst thing a client page can do: show an
  ask, then take it away.
- **`data-never-dim` on the letterbox** — money owed is structurally exempt
  from any dimming pass. A safeguard, not a style.
- **The invoice's payment rows** — three methods, each priced in full, each
  fee explained, the button carrying the total. The proposal improves nothing
  here.
- **`restoreFocusRef` on every action**, and accessible names carrying the
  job ("Open the job — Sarah Chen") so 16 identical labels don't collapse.

## Top 5 changes for polish & professionalism

**1 — Arm the act: make the hold visible and the unarmed state legible.**
*Where:* `apps/client-portal/src/components/threshold/instruments/scored-action.tsx`
(`HoldAction`), consumed by `wall-gate.tsx` and `door-gate.tsx`.
*What:* render the hold sentence for pointer users too — a DM-Mono 11px line
in `--text-faint` under the word, "Press and hold to accept" — and on a short
click, ink the rule to ~15% and rest there rather than doing nothing.
*States:* unarmed = single 1px hairline at 22%, word at `--text-faint`, no
pool; armed = the current two scores; holding = the existing left-to-right
inset; loading = "Accepting"; refused = the existing `role="alert"` line.
*Why:* today a client types her name, clicks once, and the page does nothing
and says nothing. `touches: I107` (adds a rest mark to an unscored tier —
still a rule, never a box).

**2 — Score what is currently unscored at rest, and unbind hover on touch.**
*Where:* `globals.css` `.da-tertiary` (both portals) and `.row-wash-score`.
*What:* `.da-tertiary .da-label::before` gets `transform: scaleX(1)` at
`height:1px; background: rgba(44,41,38,.22)`, rising to full quiet ink on
hover; `.row-wash-score::after` paints at rest in `--doc-rail-stock` and
raises to clay on hover; wrap both rest rules in `@media (hover: none)` if a
pointer-only reveal must be preserved on desktop.
*States:* rest / hover / focus-visible / disabled / touch.
*Why:* on a phone the Desk and the mat currently present zero visible
interactive marks — every affordance is hover-gated. `touches: I107`

**3 — One consequence sentence at every terminal act, on both sides.**
*Where:* `wall-gate.tsx`, `door-gate.tsx`, the invoice's pay panel, and the
verdict list.
*What:* a 15px body-ink line directly above the act, naming what the act does
and what it does not do — accept: "Accepting releases the deposit draw of
$2,980 to Marta Voss. It does not close the project or change the balance."
Pay: "This charges the card you choose now." Verdict: "Approving records your
choice. Your designer orders separately."
*States:* the sentence is present in every state including disabled; after
the act it becomes the dated record line.
*Why:* it is the proposal's strongest idea and costs one paragraph per gate.
`touches: R135` (the refusal/consequence voice), `R137`

**4 — Give the doorstep and the overdue line their acts.**
*Where:* `desk-roster.tsx:171-173` and `apps/client-portal/.../doorstep.tsx`.
*What:* the job name inside "One thing is overdue — Vandersteen." becomes the
link to that job, scored as tertiary; the doorstep sentence "Finished work
waits for your acceptance." gets a scored jump to its gate ("go to the gate"),
and the money line is re-ranked so the owed figure sits at the Playfair size
and the agreed figure drops to mono.
*States:* no gate → the sentence stays plain; multiple gates → the jump goes
to the first.
*Why:* both surfaces name the one urgent thing and then make the reader hunt
for it — the gate is ~1,400px below the sentence that announces it.
`touches: R126` (money hierarchy)

**5 — Retire the second and third action grammars.**
*Where:* the client verdict list (`✓ APPROVE / ✗ FLAG / ✎ NOTE` pills, green
and red state chips) and the invoice's charcoal `Button`.
*What:* one three-tier scale across both portals — scored ink for everything
that opens or navigates; a filled act *only* where money moves or a paper is
signed, in charcoal (not the proposal's new olive, which no token in the repo
declares); state expressed as a dated body-ink sentence, never a chip.
*States:* rest / hover / focus / disabled / loading / taken (the act is
replaced by its record, not left enabled beside it).
*Why:* a homeowner currently meets three different products in one project —
and sees "APPROVED ✓APPROVE" in one row. `touches: VISION.md:73` (badges,
red/green status), `I107`, `R126`
