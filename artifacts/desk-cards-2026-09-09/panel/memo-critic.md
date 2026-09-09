# Memo — Accessibility & design-system critic (adversarial lens)

All ratios are computed sRGB WCAG 2.x, not estimated. ✗ = under 4.5:1 body; ✗✗ = under 3:1 large/non-text.

| ink | `--paper` #FAF7F2 | `--paper-doc` #FCFAF6 | `--rail` #E8E3DB |
|---|---|---|---|
| ink #2C2926 | 13.53 | 13.87 | 11.32 |
| muted #4E4339 | 8.99 | 9.22 | 7.52 |
| subtle #5A4E43 | 7.54 | 7.73 | 6.31 |
| faint #65594E | 6.35 | 6.51 | 5.32 |
| mocha #5C4A3C | 7.86 | 8.06 | 6.58 |
| clay-ink #7C5E30 | 5.61 | 5.75 | 4.70 |
| golden-ink #79651E | 5.32 | 5.45 | 4.45 ✗ |
| terracotta-ink #9C5340 | 5.28 | 5.41 | 4.41 ✗ |
| sage-ink #5F6B57 | 5.27 | 5.40 | 4.41 ✗ |
| oak #8B7355 | 4.20 ✗ | 4.30 ✗ | 3.51 ✗ |
| dusty-blue #8B9CAD | 2.64 ✗✗ | 2.70 | 2.20 |
| clay #C4A57B | 2.18 ✗✗ | 2.23 | 1.82 |
| terracotta #D4A090 | 2.13 ✗✗ | 2.18 | 1.78 |
| sage #A8B5A0 | 2.01 ✗✗ | 2.06 | 1.68 |
| golden #E8C547 | 1.57 ✗✗ | 1.61 | 1.31 |
| hairline #E8E3DB | 1.20 ✗✗ | 1.23 | — |

Stage plates, white label: brief 5.22 · discovery 5.80 · direction 6.40 · proposal 7.03 · project 7.59 · install/care 8.20. All pass at any size — the healthiest thing in the palette. **Oak fails as text** (4.20) and is legal only as a score/underline. **Every material pigment fails as text and as a graphical object.**

## 1. Findings on the screenshot's card

**F1 — The card's boundary is invisible. HIGH.** Hairline on paper = **1.20:1**; "strong" `rgba(44,41,38,.14)` composites to #DDDAD5 = **1.30:1**; paper-doc on paper = **1.025:1**. A card is a component boundary where a row is not, so 1.4.11 attaches to it. Nothing in the palette clears 3:1 — ink at α.52 (#8F8C88, 3.13:1) would, and that is a new token, which is banned. D4 forbids the shadow that would rescue it. **A card grid cannot be given a perceivable edge with the tokens that exist.** Structural, not cosmetic.

**F2 — The 7px mark fails 1.4.11 in shipped code. HIGH.** `desk-roster.tsx:27-30` draws it from `--color-terracotta` (#D4A090, **2.13:1**) and `--color-dusty-blue` (**2.64:1**) — the *material* members of the pigment pairs. Swap to `--color-terracotta-ink` (5.28) and `--color-mocha` (7.86): existing tokens, no new site.

**F3 — The focus ring fails 1.4.11/2.4.11 in shipped code. HIGH.** `globals.css:1002` is `outline: 2px solid var(--color-clay)` = **2.18:1**. SPEC says clay-ink (5.61:1); line 34 even carries the comment `5.75:1 paper`. The right value was computed and the wrong token wired. 15 cards = 30 focus stops all indicated at 2.18:1.

**F4 — Colour-only status is survivable in the roster, not in the card. HIGH.** The roster mark is `aria-hidden` beside a redundant state sentence, so 1.4.1 holds. The screenshot adds a **stage strip** ("Presented / Approved / In Production / Installed") whose position is conveyed by tint alone — a straight 1.4.1 failure, and at 4 segments in a 395px card a 1.4.11 failure too.

**F5 — 3 columns is arithmetically impossible at 390px. HIGH.** 390 − 48 padding − 48 gutters ÷ 3 = **98px** card, ~58px of text. "Kochaver Residence" in Playfair 20 cannot wrap into that; it overflows or truncates, and truncation is banned. One column below 640px is the only legal layout.

**F6 — "Client:" is a dead label. MED-HIGH.** "1 · Client: Kody" spends a line on a colon-label plus an ordinal with no referent; screen readers read the punctuation as pause noise. Code's existing grammar carries more in fewer characters.

**F7 — "15 projects" is an engagement metric. MED.** A scoreboard of the studio's own volume, which VISION refuses. The live day-line ("Six things are overdue — Walker … and 3 more") is a *call*, not a *count*.

**F8 — Day counters are ambiguous and shrill. MED-HIGH.** "Sample, chosen 43 days" has no tense and no direction; 15 cards each showing a two-digit count reads as a pressure display. Code anchors to a date ("oldest due 3 Sep") — more useful, less shrill.

**F9 — Zero forced-colors support in the portal. HIGH.** `grep -rl "forced-colors" src/` returns **no files** (20 handle reduced-motion, 119 handle focus-visible — a specific gap, not neglect). In High Contrast the mark, a `background-color` on an empty span, vanishes; hairlines repaint to `CanvasText` at full strength, turning a quiet grid into a hard wireframe.

**F10 — Card-as-link-containing-button is unresolved. HIGH.** If the box is the link, the act inside is unreachable or a nested-interactive 4.1.2 violation.

**F11 — 45 jobs costs ~3× the scroll. MED.** ~44px per roster line vs ~150px per card: 45 jobs ≈ 6,750px against ≈2,000px, and stage grouping dissolves into a wall.

## 2. Recommendation — content, order, type

Five elements; DOM order **is** the screen-reader order:

1. **Mark** — 7px, `aria-hidden`, terracotta-ink or mocha (F2). Decorative; never the sole carrier.
2. **Name** — `<a>`, Playfair 20/500, `--text-primary`, oak score on hover/focus. `/doc/{engagement_id}`.
3. **Owner** — Inter 14, `--text-subtle` (7.54). Grammar `{Client} · {current_phase}` — "Nora Ellison · Concept Development". No "Client:", no ordinal.
4. **Pulse** — Inter 14, `--text-muted` (8.99); urgent clause only in terracotta-ink (5.28). Date-anchored, verb-first: "1 decision overdue — oldest due 3 Sep" · "Opened 3× — last 7 Sep, no signature yet" · "Nothing needs your hand". Never a bare day count.
5. **Act** — DM Mono 13 uppercase, secondary tier, 44px target, `aria-label="{label} — {name}"` (as the roster already does; 15 cards otherwise yield 15 identical "Open the job").

**Stage** = one plate, white label on stage pigment, DM Mono 11 uppercase. 5.22–8.20:1, text equivalent built in, survives forced-colors as a real background+color pair. Drop the 4-segment strip, the count line, "Client:", the ordinal.

## 3. Shape

**Geometry.** One column <640px (342px card); two 640–1023; three ≥1024 (395px at 1280). 24px gutters, 20px padding, 2px radius. `align-items: start`, never fixed height — wrap-never-truncate then holds at every breakpoint, name wrapping to three lines before anything clips.

**Ground/edges.** `--paper-doc` face on `--paper` with a 1px hairline. Because that edge cannot reach 3:1, **the card must not be a component whose identity depends on its box**: the box groups, the text carries everything. Stage plate as a flat tab flush to the top-left edge — no shadow, no asymmetric radius (the retired folder card's `0 8px 8px 8px` read as chrome).

**Link pattern — link on the name, not a stretched pseudo-element.** Justification: a stretched link makes the accessible name either the whole text run or a duplicated `aria-label`; the act must then escape the positioning context, where one careless `position: relative` makes it unclickable; it kills selection of the project name, which designers copy into email; and at 390px the act sits directly under the pulse, so overlap risk peaks exactly where the layout is tightest. Instead the card takes `:hover`/`:focus-within` and paints the name's oak score from anywhere in the box — it *reads* live without *being* a target. Two clean targets per card, name then act, no nesting.

**Focus/press/motion.** `outline: 2px solid var(--color-clay-ink)`, 2px offset (fixes F3), plus `outline-color: Highlight` under forced-colors; never `outline: none`. Press = the oak score thickening 1px→2px — no transform, no lift (D4). All transitions behind `motion-reduce:transition-none`; the `desk-settle` stagger must not run across 15 cards under reduced motion. Add the portal's first `@media (forced-colors: active)`: give the mark `border: 3.5px solid currentColor` so a background-only dot survives, plate labels to `ButtonText`/`ButtonFace`, hairlines held at 1px.

## 4. Collisions with the recorded rules

| Rule | Collision | Severity | What the card must do |
|---|---|---|---|
| "never a card" (2026-08-26) | Direct, total | **Critical** | Only Kody lifts this. Amend explicitly — "one line per job in the roster; the Desk grid may be cards" — don't leave it contradicted in silence. |
| D4 zero shadows | Cards want elevation; F1 shows no compliant flat substitute | **High** | Honor D4, accept a decorative edge. Do **not** reach for `--elevation-sheet` — scoped to margin chips, ledger sheet, drawer. |
| "no new token" | Only route to a 3:1 edge is a new grey (~#8F8C88) | **High** | Amend to add one boundary token, or accept F1's framing. I recommend the latter. |
| "no dashboard UI" | 3-col grid + count line + 4-segment strip + day counters | **High** | Drop count line and strip; keep the plate. |
| "no badges" | The stage plate is badge-shaped | **Medium** | It predates the card and is on the roster already; a stage *label* is permissible, a numeric badge is not. |
| "no red-green" | Not violated — pigments are earth-toned | **None** | Keep terracotta-ink/mocha; never a green tick or red dot. |
| "no engagement optimization" | "15 projects", 15 day-counters | **High** | Remove both (F7, F8). |
| D1 strict focus | 15 cards are 15 competing foci | **Medium** | Keep stage grouping so the eye lands on one plate at a time. |

## 5. The one risk for Kody to rule on

**F1 is the ruling.** A card is a box, and this palette has no box edge a low-vision user can see — 1.20:1 hairline, 1.30:1 strong, 1.025:1 paper-doc-on-paper — and D4 forbids the shadow that would rescue it. Three ways out: **(a)** amend "no new token" and add one boundary grey at ~3.1:1 (#8F8C88) used only as a card edge; **(b)** accept the decorative edge — the box groups, the text carries everything, nothing depends on seeing the border (my recommendation, and what §3 is built on); **(c)** give the card a `--rail` ground, which is 1.20:1 and therefore no better. (a) and (b) are both defensible; (c) is not. Rule before anyone writes CSS — the whole shape hangs off it.

Not a ruling, but urgent: **F2 and F3 are live defects in shipped production code** — the roster's mark at 2.13:1 and every focus ring in the designer portal at 2.18:1 instead of the spec'd 5.61:1. Both are one-token swaps to values that already exist, and both should be fixed whether or not cards ship.
