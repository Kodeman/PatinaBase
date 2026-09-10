# SPEC — three specimens, one system

Three standalone HTML pages, built in isolation, that must look like one
system. Read **§A The house sheet** in full before writing anything; then
build only your own specimen section (§C, §D or §E).

Amended after review 01 — see §F. Where the body and §F disagree, §F wins.

Deliverables, in this directory:

| File | Specimen |
|---|---|
| `client-house.html` | 1 — The house page, polished |
| `designer-desk.html` | 2 — The Desk at real load |
| `decision-moment.html` | 3 — Two acts, two weights |

Each is a single self-contained file: one `<style>` block, one `<script>`
block, inline SVG. No build step, no framework, no external requests except
the three Google Fonts families named below.

---

# §A The house sheet

## A1. Tokens

Paste this block verbatim. Do not add tokens — with the single exception
recorded as R144 (`--card-edge`, below, named `--color-card-edge` in the
portal), which was ruled into the sheet rather than added to a surface. Do
not use a hex literal anywhere else in the file.

```css
:root {
  color-scheme: light dark;

  /* — paper, three stocks — */
  --paper:            #FAF7F2;  /* the ground */
  --paper-doc:        #FCFAF6;  /* a document laid on the ground */
  --rail:             #E8E3DB;  /* the rail / deeper sheet */

  /* — ink — */
  --ink:              #2C2926;  /* 13.53:1 on paper */
  --ink-muted:        #4E4339;  /* 9.22:1 on paper-doc */
  --ink-subtle:       #5A4E43;  /* 7.73:1 */
  --ink-faint:        #65594E;  /* 6.51:1 — also the disabled ink */
  --ink-paper:        #FAF7F2;  /* ink ON charcoal */

  /* — hairlines — */
  --hairline:         #E8E3DB;
  --hairline-strong:  rgba(44, 41, 38, .14);

  /* — the rest rule pigment (4.20:1 on paper) — */
  --oak:              #8B7355;

  /* — the one boundary grey (R144). A component boundary answers to 1.4.11's
       3:1, which no hairline reaches. Claim cards ONLY. — */
  --card-edge:        #8F8C88;  /* 3.21:1 on paper-doc · 3.13:1 on paper */

  /* — state pigments: material value / paper ink — */
  --clay:             #C4A57B;   --clay-ink:      #7C5E30;
  --golden:           #E8C547;   --golden-ink:    #79651E;
  --terracotta:       #D4A090;   --terracotta-ink:#9C5340;
  --sage:             #A8B5A0;   --sage-ink:      #5F6B57;

  /* — the seven stage plates (white label 5.22–8.20:1) — */
  --tab-brief:     #497093;
  --tab-discovery: #307063;
  --tab-direction: #366A3A;
  --tab-proposal:  #575D1D;
  --tab-project:   #6D4E24;
  --tab-install:   #823832;
  --tab-care:      #823832;   /* Care has no pigment of its own */

  /* — the one depth token. Permitted on a temporary sheet ONLY.
       None of the three specimens uses it. — */
  --elevation-sheet: 0 1px 2px rgba(44, 41, 38, .08);

  /* — rhythm — */
  --module: 24px;
  --radius-hair: 2px;
  --radius-box:  3px;

  /* — motion — */
  --press-in:  70ms;
  --press-out: 240ms;
  --ease: cubic-bezier(.22, 1, .36, 1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --paper:           #2A2622;
    --paper-doc:       #26221E;
    --rail:            #3A3530;
    --ink:             #F2EDE6;
    --ink-muted:       #D6CEC4;
    --ink-subtle:      #C7BEB3;
    --ink-faint:       #B8AEA2;
    --ink-paper:       #2A2622;
    --hairline:        rgba(242, 237, 230, .14);
    --hairline-strong: rgba(242, 237, 230, .22);
    --oak:             #B39572;
    --card-edge:       #77736E;  /* 3.19:1 on the dark ground */
    --clay-ink:        #D8B98A;
    --golden-ink:      #E0C963;
    --terracotta-ink:  #E2A895;
    --sage-ink:        #AFC0A6;
    /* dark mode keeps the light plate values (amended §F-J) */
  }
}
```

Dark rules: pigments keep their hue and lift lightness; the terminal act
inverts (see A5). `body { background: var(--paper); color: var(--ink); }`
explicitly — never a transparent body.

## A2. Fonts

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

```css
--font-display: 'Playfair Display', Georgia, 'Times New Roman', serif;
--font-body:    'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-meta:    'DM Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace;
```

Real weights only — the families above ship 400/500/600 as real faces. Never
synthesise a bold by asking for a weight not loaded.

## A3. The type scale — seven steps, named classes

| Class | Family | Size / line | Weight | Tracking | Case | Use |
|---|---|---|---|---|---|---|
| `.t-d1` | display | 34px / 1.15 | 500 | 0 | sentence | page title (house name, greeting) |
| `.t-d2` | display | 26px / 1.20 | 500 | 0 | sentence | section head, the announced money figure |
| `.t-d3` | display | 20px / 1.30 | 500 | 0 | sentence | room name, job name, piece name |
| `.t-body` | body | 16px / 1.55 | 400 | 0 | sentence | prose, consequence sentences, state sentences |
| `.t-body-sm` | body | 14px / 1.50 | 400 | 0 | sentence | roster state sentence, dense prose |
| `.t-meta` | meta | 12px / 1.50 | 400 | .08em | **sentence** | values: dates, counts, captions, sub-labels |
| `.t-head` | meta | 11px / 1.50 | 500 | .08em | **UPPER** | running heads only |

Additions, not new steps:

- `.t-authorship` — `.t-d3` in **Playfair italic 400**. Authorship and asides
  only. Never a heading, never a control.
- `.t-money` — DM Mono, 15px / 1.5, `font-variant-numeric: tabular-nums;
  letter-spacing: .02em`. Every ledger figure. *(amended §F-B)*
- **One family per figure.** The single *announced* money figure at the head
  of a money block takes `.t-d2` (Playfair 26). Every other figure in that
  block, and every figure aligned to a rule, is `.t-money`. The act label
  carries the figure in the act's own family (A5). No block ever shows one
  payment in three families.

Nothing else. No inline `font-size`. Playfair tracking stays `0` — never
negative below 40px.

## A4. Rhythm, radius, rules

| Thing | Value |
|---|---|
| Vertical module | 24px. Every block-level gap is 24 / 48 / 72 / 12 (half). Nothing else. |
| Page measure | `max-width: 1100px` centred at ≥1200px; prose capped at `65ch` |
| Radius | `2px` (marks, small plates), `3px` (image plates, stage plates, the terminal act), `50%` (the 7px mark dot only) |
| Hairline | `1px solid var(--hairline)` for structure; `1px solid var(--hairline-strong)` for a money rule or a totals rule |
| Shadows | **none.** `box-shadow` must not appear in any specimen file. |
| Truncation | none. `text-overflow: ellipsis` must not appear. Wrap. |

## A5. The three action tiers — exact CSS

All three share the control box:

```css
.act {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  min-width: 44px;
  padding: 4px 6px 10px;
  border: 0;
  background: none;
  font-family: var(--font-meta);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: .06em;
  text-transform: uppercase;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.act .label { position: relative; display: inline-block; line-height: 13px; }
.act .label::before, .act .label::after {
  content: ''; position: absolute; left: 0; right: 0;
  transform-origin: left center;
  transition: background-color 150ms linear, height 150ms var(--ease);
}
.act .label::before { bottom: -5px; height: 1px; }
.act .label::after  { bottom: -8.5px; height: 1px; }
```

### Tertiary — a scored word with a resting rule

```css
.act--tertiary { color: var(--ink-subtle); }
.act--tertiary .label::before { background: var(--oak); }        /* 4.20:1 at rest */
.act--tertiary .label::after  { content: none; }
.act--tertiary:hover .label::before { background: var(--ink-faint); height: 1.5px; }
.act--tertiary:active { color: var(--ink); transition-duration: var(--press-in); }
```

### Inline — a tertiary act living inside a sentence *(amended §F-D)*

```css
.act--inline {
  display: inline;
  min-height: 0;
  min-width: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: inherit;
}
.act--inline .label::before { bottom: -3px; height: 1px; background: var(--oak); }
.act--inline .label::after  { content: none; }
.act--inline:hover .label::before { background: var(--ink-faint); height: 1.5px; }
```

Inherits the surrounding sentence's family, size, case and colour — no
`min-height` box, no padding. Use it for the doorstep's object ("Finished
work" inside the Playfair h2), the day's line links, "Filed under
Previously", "Back to the house", and any act living inside prose. Same
focus ring as the other tiers.

The rest rule is unconditional — no `@media (hover:none)` variant, no
`scaleX(0)`. This is the fix for IX03 / IX04 / B01.

### Secondary — the two-score word

```css
.act--secondary { color: var(--ink); }
.act--secondary .label::before { height: 1.5px; background: var(--ink); }
.act--secondary .label::after  { background: var(--clay); }
.act--secondary:hover .label::after { height: 2px; }
.act--secondary:active { transition-duration: var(--press-in); }
```

### Terminal — filled charcoal, money moves or a paper is signed

```css
.act--terminal {
  padding: 13px 22px;
  min-height: 48px;
  border-radius: var(--radius-box);
  background: var(--ink);
  color: var(--ink-paper);
  letter-spacing: .06em;
}
.act--terminal .label::before,
.act--terminal .label::after { content: none; }
.act--terminal:hover  { background: #1F1D1A; }
.act--terminal:active { transform: translateY(1px); transition-duration: var(--press-in); }
```

*(amended §F-C)* The label typography overrides the shared 13px mono caps:

```css
.act--terminal .label {
  font-family: var(--font-body);
  font-size: 16px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  font-variant-numeric: tabular-nums;
}
```

Inter 500, 16px, sentence case, tracking 0, figures tabular ("Pay $4,060.00",
"Accept the finished work · $2,980.00"). Tertiary and secondary keep DM Mono
13px caps unchanged.

Dark mode: `.act--terminal { background: var(--ink); color: var(--ink-paper); }`
already inverts correctly because both tokens flip.

**The amount lives inside the label.** `Pay $4,060.00`,
`Accept the finished work · $2,980.00`. Never a bare verb on a terminal act.

### Focus — one rule for every tier

```css
.act:focus-visible {
  outline: 2px solid var(--clay-ink);
  outline-offset: 2px;
}
.act::after { /* the proofreader's caret, kept */
  content: '\2038' / ''; position: absolute; left: 1px; top: 50%;
  font-size: 14px; line-height: 1; color: var(--ink-faint);
  opacity: 0; transform: translateY(-50%);
  transition: opacity 140ms linear; pointer-events: none;
}
.act:focus-visible::after { opacity: 1; }
.act--terminal:focus-visible::after { color: var(--ink-paper); }
```

Reserve the outline's space in the resting box so a focused control never
resizes its neighbours (VC-22): give action rows `padding: 2px` or set the
outline via `outline` (which does not affect layout) — never `border`.

### Pressed — `aria-pressed` *(amended §F-E)*

```css
.act[aria-pressed="true"]              { color: var(--ink); }
.act[aria-pressed="true"] .label::before { height: 1.5px; background: var(--ink); }
.act[aria-pressed="true"] .label::after  { background: var(--clay); }
.act[aria-pressed="false"]             { color: var(--ink-subtle); }

.chip[aria-pressed="true"] {
  background: var(--rail);
  border: 1px solid var(--ink-faint);
  color: var(--ink);
}
.chip[aria-pressed="false"] {
  background: var(--paper);
  border: 1px solid var(--hairline-strong);
}
```

`[aria-pressed="true"]` on a scored act takes `--ink` text plus the secondary
two-score rule; unpressed keeps the tertiary look. Chips (finish, facets
drawn as chips, the 16/43 switcher): pressed = `--rail` ground, 1px
`--ink-faint` border, `--ink` text; unpressed = paper ground, 1px
`--hairline-strong` border.

### `aria-disabled` — never `disabled`

```css
.act[aria-disabled="true"] { cursor: not-allowed; }
.act--tertiary[aria-disabled="true"],
.act--secondary[aria-disabled="true"] { color: var(--ink-faint); }
.act--tertiary[aria-disabled="true"] .label::before,
.act--secondary[aria-disabled="true"] .label::before,
.act--secondary[aria-disabled="true"] .label::after { background: var(--hairline-strong); }
.act--terminal[aria-disabled="true"] {
  background: var(--rail);
  color: var(--ink-faint);                 /* 5.32:1 on rail */
  border: 1px solid var(--hairline-strong);/* keeps its ROLE while unavailable */
}
```

Rules:

- Never `opacity: .5` on any state. Ever. (B07: quiet-ink at `opacity-50` is
  2.21:1.)
- The control **stays focusable**: `aria-disabled="true"` plus
  `aria-describedby` pointing at the visible reason.
- Activating an `aria-disabled` act moves focus to the unmet input and writes
  the reason into the page's `role="status"` line. It never silently does
  nothing.

### Loading — ink, not a spinner

```css
.act--terminal.is-loading { background: var(--ink); }
.act--terminal.is-loading .label { opacity: 1; }
```

Swap the label text (`Pay $4,060.00` → `Opening payment`), set
`aria-busy="true"` on the *wrapper*, not the control, and announce completion
in the `role="status"` line. No ring, no dots, no `@keyframes spin`.

### Taken — the act is replaced by its record

Once an act is taken, the control is removed from the DOM and the record
block (A9) is rendered in its place. Never leave a taken act enabled beside
its own state (IX11).

## A6. The consequence sentence

```css
.consequence {
  font-family: var(--font-body);
  font-size: 15px;      /* the floor. Never smaller. */
  line-height: 1.55;
  color: var(--ink);
  max-width: 56ch;
  margin: 0 0 12px;
}
```

One sentence, directly above the terminal act, present in **every** state
including unavailable. It says what the act does *and* what it does not do.
After the act, the same slot carries the dated record line.

## A7. The Stamp

```css
.stamp {
  display: inline-block;
  position: relative;
  padding: 6px 10px 4px;
  border: 1px solid currentColor;
  border-radius: var(--radius-hair);
  transform: rotate(-2deg);
  font-family: var(--font-meta);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: .1em;
  text-transform: uppercase;
  line-height: 1.4;
}
.stamp::before {
  content: ''; position: absolute; inset: 2.5px;
  border: 1px solid currentColor; opacity: .42; pointer-events: none;
}
```

The pigment lives on `color` — `--clay-ink` (noted / recorded), `--sage-ink`
(accepted), `--golden-ink` (held), `--terracotta-ink` (declined). **Border
pigment only. No fill, no shadow, no ✓, no badge.** Words used in these
specimens: `NOTED`, `ACCEPTED`, `IN PRODUCTION`, `INSTALLED`.

## A8. Letterhead and colophon

Letterhead — the first block of every client-facing page:

```
┌──────────────────────────────────────────────────────────────────────┐
│ LOCAL DEV STUDIO                              PREPARED FOR NORA ELLISON│  .t-head, --ink-muted
│                                                                       │
│ Cedar Lane Study                                                      │  .t-d1
│ Installation · September 2026                                         │  .t-meta, --ink-subtle
├───────────────────────────────────────────────────────────────────────┤  1px --hairline
```

- Grid: `display:flex; justify-content:space-between; align-items:baseline`
  for the two head lines; the title block follows at 12px, the hairline at
  24px below it.
- ≤600px: the two head lines stack, both left-aligned, 4px apart.
- If the client's display name is unset the right slot renders **nothing** —
  never "CLIENT USER" (BE-23).
- No PATINA wordmark anywhere inside a client page.

Colophon — the last block of every client-facing page:

```
├───────────────────────────────────────────────────────────────────────┤  1px --hairline
│ Prepared by Local Dev Studio · Sent through Patina                     │  .t-meta, --ink-faint
```

Left-aligned, 24px under the hairline, 48px of space beneath it.

## A9. The record block

Replaces an act once it is taken. Never a card, never a fill.

```
[Stamp: ACCEPTED]                                      ← --sage-ink, rotate(-2deg)

Built-in shelving, north wall                          ← .t-d3
Authorization No. 8 · Cedar Lane Study                 ← .t-head
Nora Ellison · Local Dev Studio                        ← .t-meta
Accepted 8 September 2026, 2:14 pm                     ← .t-meta

Marta Voss is released to invoice $2,980.00 for the
finished shelving.                                     ← .t-body
Recorded in Previously                                 ← .act--tertiary link
Back to the house                                      ← .act--tertiary link
```

Order is fixed: stamp → subject → reference → parties → timestamp → what
happens next (with a date) → where it is filed → the way back. Above it, a
`1px var(--hairline-strong)` rule; 24px above and below.

## A10. Plates, captions, empty states

| Context | Plate | Radius | Border |
|---|---|---|---|
| Client house room piece, ≥960px | 96 × 96px | 3px | 1px `--hairline` |
| Decision hero piece | 120 × 120px | 3px | 1px `--hairline` |
| Dense schedule row / ≤600px | 64 × 64px | 3px | 1px `--hairline` |
| Desk board thumbnail | 92 × 92px cover | 3px | 1px `--hairline` |

Caption, under every plate, `.t-meta` in `--ink-subtle`, sentence case:
**what it is · whose it is · when.**

> `Study · photographed by Local Dev Studio · 3 September 2026`
> `Reading chair · drawing by Local Dev Studio · photograph from Harmon Bench Works to follow`

No photograph → an inline SVG **silhouette** of the piece on
`--paper-doc`, stroke `--ink-faint` at 1px with one detail line in
`--ink-faint` (secondary hatch strokes may use `stroke-opacity: .5`; `--rail`
is for fills/grounds only, never a stroke). Never a diagonal hash, never a
blank fill, never a broken-image glyph. *(amended §F-A)*

Empty state — a region with something to say but nothing in it:

```css
.empty { padding: 0 0 24px; }
.empty .floor { height: 1px; background: var(--rail); margin: 12px 0; }
.empty p { font-family: var(--font-body); font-size: 16px; line-height: 1.55;
           color: var(--ink-subtle); max-width: 56ch; }
```

Room name at `.t-d3`, a floor line at full band width, one sentence. **Never a
rectangle.** A region with nothing at all to say renders nothing (no heading,
no rule, no zero).

## A11. Reduced motion and forced colors

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}

@media (forced-colors: active) {
  .act--terminal { border: 2px solid ButtonText; }
  .act .label::before, .act .label::after { forced-color-adjust: none; background: ButtonText; }
  .stamp, .stamp::before { border-color: CanvasText; }
  .plate, .empty .floor, hr { border-color: CanvasText; }
  .act:focus-visible { outline: 2px solid Highlight; }
}
```

Every state change must still be legible with colour removed: state lives in
the word and the rule, never in a hue alone.

## A12. The specimen frame

Every specimen is a standalone page. Above the mocked page — **outside** it —
sits a slim meta strip:

```html
<div class="specimen-meta" role="region" aria-label="Specimen controls">
  <span>Specimen 1 · The house page, polished</span>
  <span>Fixture: Cedar Lane Study · Nora Ellison · Local Dev Studio · fictional data</span>
  <span>Stand-in photograph where noted</span>
  <div class="switcher" role="group" aria-label="State">
    <button type="button" class="act act--tertiary" aria-pressed="true">Default</button>
    …
  </div>
</div>
```

```css
.specimen-meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 24px;
  padding: 10px 24px;
  background: var(--rail);
  color: var(--ink-muted);
  font-family: var(--font-meta);
  font-size: 11px;
  letter-spacing: .04em;
  border-bottom: 1px solid var(--hairline-strong);
}
```

- The strip is the **only** place a prototype caveat may appear. Nothing
  inside the mocked page says "prototype", "fictional", or "example"
  (IA-15, VC-51).
- State switcher buttons are `.act--tertiary` with `aria-pressed`; they toggle
  a class on the page root. The label never changes with the state (IX18).
- The strip is not part of the design and carries no Playfair.

## A13. Gate — every specimen

| Check | Requirement |
|---|---|
| Widths | Renders at 1440 and 390 with **no horizontal scroll** (`document.documentElement.scrollWidth <= clientWidth`) |
| Console | No errors, no warnings |
| Keyboard | Every act reachable and operable by keyboard; focus ring visible on all three tiers |
| Switcher | Every declared state reachable from the meta strip |
| Language | `<html lang="en">` |
| Headings | `h1` → `h2` → `h3` in order; exactly one `h1` per specimen page |
| Images | Every `<img>` has a caption in the page and honest `alt` (`alt=""` when the caption carries the meaning) |
| Disabled | The string `disabled` never appears as an attribute on a gating act |
| Wordmark | No PATINA wordmark inside a client page (Specimens 1 and 3) |

**Do not** (all three specimens): no shadows · no pills · no status dots · no
badges · no olive · no green success fill · no ✓ glyph · no spinner · no
`disabled` · no PATINA wordmark on client pages · no truncation · no
placeholder text · no `opacity: .5` on a state.

## A14. Fields on paper

*(adopted 2026-09-10, **AR-c**; source the Agreement Room build contract,
`artifacts/agreement-room-2026-09-10/specimens/SPEC.md` §2.)*

**The rule, in one paragraph.** A field is not a control laid on the page: it is
the place on the paper where a line has not been written yet, so a sentence must
not change its size, leading, ink or ground when the studio starts typing in it.
The label is a `.t-head` and it is always there — no `placeholder`, because a
hint that vanishes when it is needed was never a label. A prose field inherits
the paper's body metrics and grows with its content: no scrollbar, no grip. A
money field is `.t-money`, right-aligned to the block's own rule (§F-I), its
currency mark furniture the field prints and never stores. A select is the same
box; its longest option must fit, because a clipped option is truncation. Ground
`--paper-doc`, box 1px `--hairline-strong` at 2px radius, and the one edge a
reader can actually see is a 1px `--ink-faint` baseline rule. Focus is §A5's,
drawn with `outline` so nothing moves. Held is a `--rail` ground, a 2px
`--terracotta-ink` leading rule and a reason in words — never `opacity`, and
`aria-disabled="true"` with `aria-describedby`, never `disabled`. The dark twin
needs no redeclaration: every colour is a token.

```css
/* §A14 · Fields on paper ─────────────────────────────────────────────── */

/* The group. One module between groups, a half-module inside one. */
.field           { display: block; margin: 0 0 var(--module); }
.field:last-child{ margin-bottom: 0; }

/* The label — .t-head, exactly. 11px is the floor and there is nothing below
   it. The label is always present and always above the field. A placeholder
   is not a label: no field carries a `placeholder` attribute (A13). */
.field > .label {
  display: block;
  margin: 0 0 12px;
  font-family: var(--font-meta);
  font-size: 11px;
  line-height: 1.5;
  font-weight: 500;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--ink-subtle);
}

/* The box. A sheet laid on the page: --paper-doc ground, a 1px
   --hairline-strong box, 2px radius, and a 1px --ink-faint BASELINE rule —
   the ruled line of a form on paper, and the one edge a reader can actually
   see. No shadow, ever (A4). */
.field-control {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 12px;
  background: var(--paper-doc);
  border: 1px solid var(--hairline-strong);
  border-bottom: 1px solid var(--ink-faint);
  border-radius: var(--radius-hair);
  color: var(--ink-muted);
  font-family: var(--font-body);
  font-size: 16px;          /* .t-body */
  line-height: 1.55;
  letter-spacing: 0;
  -webkit-appearance: none;
  appearance: none;
}

/* Prose — the clause body. Inherits the paper's body metrics exactly, caps at
   the paper's own measure, and grows with its content: a paper has no
   scrollbar and no resize grip. */
.field-control--prose {
  max-width: 65ch;
  min-height: calc(var(--module) * 3);
  resize: none;
  overflow: hidden;
  field-sizing: content;
}
/* Auto-grow where field-sizing is unsupported: the control and a hidden
   mirror of its value share one grid cell, so the cell is always as tall as
   the text. In a static specimen `data-value` is authored, not scripted. */
.field-grow { display: grid; max-width: 65ch;
              font-family: var(--font-body); font-size: 16px; line-height: 1.55; }
.field-grow::after {
  content: attr(data-value) ' ';
  visibility: hidden;
  white-space: pre-wrap;
}
.field-grow > .field-control--prose,
.field-grow::after {
  grid-area: 1 / 1 / 2 / 2;
  font: inherit;
  padding: 12px;
  border: 1px solid transparent;
}

/* Select. Same box, same metrics. The mark is drawn from two 1px --ink-faint
   edges — never a glyph font, never an image (an image cannot read a token).
   The longest option must still fit: a clipped option is truncation (A4). */
.field-select { position: relative; }
.field-select .field-control { padding-right: 36px; }
.field-select::after {
  content: '';
  position: absolute; right: 14px; top: 50%;
  width: 7px; height: 7px; margin-top: -6px;
  border-right: 1px solid var(--ink-faint);
  border-bottom: 1px solid var(--ink-faint);
  transform: rotate(45deg);
  pointer-events: none;
}

/* Money — .t-money in the field exactly as on the paper, so a figure never
   changes family between being typed and being printed (A3: one family per
   figure). Right-aligned to the block's own rule, never to the page edge
   (F-I). The currency mark is furniture printed by the field: never typed,
   never stored, never part of the value. */
.field-money { position: relative; display: inline-block; }
.field-money .field-control {
  max-width: 13ch;
  padding-left: 30px;
  text-align: right;
  font-family: var(--font-meta);
  font-size: 15px;          /* .t-money */
  line-height: 1.5;
  letter-spacing: .02em;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}
.field-money::before {
  content: '$';
  position: absolute; left: 12px; top: 50%;
  transform: translateY(-50%);
  font-family: var(--font-meta);
  font-size: 15px;
  line-height: 1.5;
  color: var(--ink-faint);
  pointer-events: none;
}

/* Focus — §A5's focus, unchanged, for every field. `outline` and not `border`,
   so a focused field never resizes its neighbours (A5, VC-22). */
.field-control:focus-visible {
  outline: 2px solid var(--clay-ink);
  outline-offset: 2px;
}

/* Held — a field that may not be written, or is written wrong. The ink stays
   at full strength: never opacity, ever (A5). The ground moves to --rail, a
   2px --terracotta-ink rule takes the leading edge, and the reason prints
   directly beneath in words. The rule is the second channel, so the state
   survives forced colors (A11); the ground change alone is 1.23:1 and carries
   nothing. */
.field-control[aria-invalid="true"],
.field-control[aria-disabled="true"] {
  background: var(--rail);
  color: var(--ink);
  border-left: 2px solid var(--terracotta-ink);
  padding-left: 11px;       /* 12 − 1, so the text does not move */
  cursor: not-allowed;
}
.field .reason {
  display: block;
  margin: 12px 0 0;
  max-width: 56ch;
  font-family: var(--font-body);
  font-size: 14px;          /* .t-body-sm */
  line-height: 1.50;
  color: var(--ink);
}
```

---

# §B Fixture data — identical in all three specimens

| Field | Value |
|---|---|
| Studio | Local Dev Studio, Des Moines, Iowa |
| Designer | Leah Hartwell |
| Homeowner | Nora Ellison |
| House | Cedar Lane Study |
| Phase | Installation · September 2026 |
| Today | Tuesday, 8 September 2026 |
| Agreed | $11,100.00 |
| Open invoice | INV-2026-0301 · $4,060.00 · $0.00 paid · due 11 September 2026 |
| Rooms | Study · Hall · Stair |

**Pieces**

| Piece | Price | State | Maker | Date |
|---|---|---|---|---|
| Reading chair, oiled oak and shearling | $8,120.00 | In production | Harmon Bench Works | arriving 24 September |
| Built-in shelving, north wall | $2,980.00 | Installed, awaiting acceptance | Marta Voss | installed 3 September |

**The selection under decision**

| Line | Value |
|---|---|
| Piece | Round oak coffee table, 42″ × 16″, solid oak |
| Piece | $2,100.00 |
| Delivery | $180.00 |
| **Total** | **$2,280.00** |
| Allowance | $2,600.00 → "$320.00 remaining" |
| Tax | **none — never print an illustrative tax line** |
| Finishes | Natural oak · Smoked oak |

**Leah's Desk — Tuesday 8 September, 16 live · 1 overdue**

| Stage | Count | Jobs |
|---|---|---|
| Brief | 3 | Marcus Wright (new lead — respond by 10 September) · Lily Tanaka (respond by 12 September) · Elena Ruiz (consultation · quiet · nothing needs your hand) |
| Discovery | 1 | Reinhardt lake house — Green Lake WI · initial site visit not yet scheduled |
| Direction | 3 | Sarah Chen (respond by 11 September) · David Nielsen (respond by 11 September) · Cedar Lane Study — **Nora Ellison replied last night** |
| Proposal | 2 | Halvorsen townhouse · Brekke farmhouse |
| Project | 4 | Sonnenberg residence · Aalborg loft · Whitcomb carriage house · Hollenbeck residence |
| Install | 2 | **Vandersteen — install · overdue since 4 September** · Lindgren lake cabin |
| Care | 1 | Osterberg residence |

16 live = the 15 named above + Hollenbeck residence (Project ×4). *(amended
§F-H)*

**Desk people facet** (staff, for *By person*) — Leah Hartwell · Anneke Sund ·
Colin Brandt. Marta Voss is a maker, not staff, and does not appear in *By
person*. *(amended §F-H)*

Invent no other names. For the 43-job proof, repeat the same seven stages with
plausible Midwest client names (Kjelstrom, Bergquist, Norgaard, Trestrail,
Maartens, Delacroix-Ryan …) — the seven stage plates and their ordering never
change.

**Images.** Exactly one photograph is available:
`/private/tmp/patina-design-proposal-2026-09-07-kul503/assets/room.jpg` — a
generated living room. It may be used **once, in Specimen 1 only**, as the
*installed photograph* plate of the Study, captioned inside the page as an
installation photograph would be ("Study · photographed by Local Dev Studio ·
3 September 2026"), and declared as a stand-in in the specimen meta strip.
Copy it next to your HTML and reference it relatively. **No other
photograph.** Everything else is drawn as inline SVG in `--rail` and
`--ink-faint`.

---

# §C Specimen 1 — `client-house.html`

## Purpose

The homeowner's one page, polished: she learns whose page this is, what she
owes and when, what changed, what needs her hand, and where the papers are —
in that order, without hunting. It proves principles 1, 2 and 4.

## Structure, top to bottom

| # | Block | Detail |
|---|---|---|
| 1 | **Letterhead** (A8) | `LOCAL DEV STUDIO` / `PREPARED FOR NORA ELLISON` · `Cedar Lane Study` `.t-d1` (h1) · `Installation · September 2026` `.t-meta` · hairline |
| 2 | **Landmark ledger** | One row of five `.act--tertiary` anchors, `.t-head`, 44px tall, 24px gaps: `Where we are` → `#story-pole`, `What changed` → `#changed`, `What you owe` → `#letterbox`, `What needs you` → `#wall`, `The papers` → `#previously`. A landmark whose target does not render is **omitted**, never disabled. `data-never-dim` on `What you owe`. 390: wraps to two rows, still above the doorstep. |
| 3 | **Doorstep** | `h2.t-d2` — "Finished work waits for your acceptance." The words *finished work* are a `.act--tertiary` link to `#wall`. Under it, `.t-meta`: `Previously — Trade scope · Cedar Lane — Joinery and paint, 7 August`. |
| 4 | **Money block** (`#letterbox`) | `.t-head` `WHAT YOU OWE`. Then `$4,060.00` at `.t-d2` with `due 11 September 2026` at `.t-meta` beneath. One reconciling sentence, `.t-body`: "$11,100.00 agreed · $0.00 paid · $4,060.00 owed on INV-2026-0301." Right of it at ≥960px: the letterbox drawing (inline SVG, one letter half out of a slot, `--rail` stroke) with the plain gloss `Invoice` at `.t-meta` beneath. Then `.consequence`: "This opens payment. Nothing is charged until you choose how to pay." Then `.act--terminal` **Pay $4,060.00**. Beside it, `.act--tertiary` `Print`. |
| 5 | **What changed** (`#changed`) | `.t-head` `WHAT CHANGED SINCE YESTERDAY` · one `.t-body` line with a date: "Marta Voss finished the north-wall shelving on 3 September. It waits for your acceptance." |
| 6 | **Story pole** (`#story-pole`) | Sticky left rail, 170px, at ≥900px. Six phases as `.act--tertiary` **links** to their bands: Discovery · Design · Design refinement · Procurement · **Installation** (held) · Completion. The held phase carries a date line at `.t-meta`. The caret is a reading mark, not a control. ≤600px: the rail is replaced by a sticky one-line bar at the top of the content column — `You are in: Study` — that opens the same list. |
| 7 | **Study band** | `h2.t-d3` `Study` with `$11,100.00 agreed · two pieces · finished work waits for your acceptance` right-aligned at `.t-meta`. Below: the drawn section (inline SVG — floor line, wall line, one footprint per piece; dashed while on its way, solid once standing). Then two piece rows, each: 96px plate · `.t-d3` name · `.t-money` price · one `.t-body-sm` state sentence · caption `.t-meta`. Row 1 — Reading chair: **drawn silhouette** plate, caption "Reading chair · drawing by Local Dev Studio · photograph from Harmon Bench Works to follow", state "In production at Harmon Bench Works · arriving 24 September", `.stamp` `IN PRODUCTION` in `--clay-ink`. Row 2 — Built-in shelving: the **stand-in installation photograph**, caption "Study · photographed by Local Dev Studio · 3 September 2026", state "Installed 3 September by Marta Voss · awaiting your acceptance", `.stamp` `INSTALLED` in `--sage-ink`. |
| 8 | **The wall gate** (`#wall`) | Elevation drawing strip (inline SVG, hatched wall with a square notch where acceptance is owed). `h3.t-d3` "Built-in shelving, north wall". `.t-money` `Trade scope · $2,980.00`. `.consequence`: "Accepting releases $2,980.00 to Marta Voss for the finished shelving. It does not close the project or change your invoice." Signature line: `.t-head` label `TYPE YOUR FULL NAME`, a text input with a 1px bottom rule, `autocomplete="name"`, beside it the date at `.t-money`. A **visible** hold caption at `.t-meta`, `--ink-subtle`: "Press and hold to accept". Then `.act--terminal` **Accept the finished work · $2,980.00**, `aria-disabled="true"` with `aria-describedby` → "Type your full name to accept." until the field matches. |
| 9 | **Hall**, **Stair** | Each: `h2.t-d3` name, a floor line, one sentence — "Nothing stands here yet. The Study comes first." / "Nothing stands here yet — the stair runner is still with the maker." No rectangle. No per-room "ask for a change" act. |
| 10 | **The road** | `.t-head` running head `ON ITS WAY`, then the fact at `.t-body`: "One piece in motion · reading chair, oiled oak and shearling — arriving 24 September." A drawn road SVG at ≤120px tall. |
| 11 | **The studio's note** | `.t-meta` `3 SEPTEMBER · YESTERDAY`. `.t-body` at 56ch: "The shelving is up and oiled. Look at it when you can, and if it reads right I will have Marta move on to the hall." Signed `.t-authorship`: "Leah Hartwell · Local Dev Studio · 3 September 2026". No avatar disc. |
| 12 | **Previously** (`#previously`) | `h2.t-d3`. Four rows, each: date `.t-money` · title `.t-body-sm` wrapping to **two lines** · state word `.t-head` right. Rows: 30 August "The chair shipped from the workshop this morning. Nothing is needed from you." SENT · 7 August "Trade scope · Cedar Lane — Joinery and paint" SIGNED · 31 July "Furnishings authorization · Cedar Lane — Authorization No. 1" SIGNED · 15 May "Design services agreement · Cedar Lane — Design Services" SIGNED. Each row is a link. **No truncation.** |
| 13 | **The mat** | `.t-head` `THE MAT`. Only columns with rows: `THE PEOPLE, WHERE THEY WORK` (Leah Hartwell · your designer / Local Dev Studio · the studio / Marta Voss · joinery and paint) and `THE PAPERS` (the four above). Right: `.act--tertiary` `Your details` and `.act--tertiary` **`Sign out`**. No empty column headers. |
| 14 | **Colophon** (A8) | "Prepared by Local Dev Studio · Sent through Patina" |

## States (meta-strip switcher)

| State | What changes |
|---|---|
| **Default** | As above. The doorstep asks; the gate is armed but unmet. |
| **Quiet day** | The doorstep ask is replaced by `h2.t-d2` "Nothing needs you today." plus `.t-body`: "The next thing on the calendar is the reading chair, arriving 24 September. When there is a real update it will appear here with its date." The wall gate and the `What needs you` landmark are **omitted entirely**. The money block, letterbox and Previously stay. |
| **After acceptance** | The gate (row 8) is replaced by the record block (A9): `.stamp` `ACCEPTED` in `--sage-ink`, "Built-in shelving, north wall", "Authorization No. 8 · Cedar Lane Study", "Nora Ellison · Local Dev Studio", "Accepted 8 September 2026, 2:14 pm", "Marta Voss is released to invoice $2,980.00 for the finished shelving.", "Recorded in Previously", "Back to the house". The doorstep re-reads: "One piece is on its way. Nothing else needs you today." The Study stamp changes `INSTALLED` → `ACCEPTED`. |

## Layout

**1440** — content column 1100px centred. Story pole sticky at left of the
column, 170px, from row 6 down. Letterbox drawing sits right of the money
figures at 40/60. Piece rows: plate 96px, then a fluid text column, price
right-aligned to one rule.

**390** — money first: rows reorder to letterhead → landmark ledger (two rows)
→ doorstep → **money block** → what changed → sticky "You are in: Study" bar →
rooms. Story pole rail hidden; its list reachable from the sticky bar. Plates
drop to 64px. The wall gate's terminal act **docks**: the dock appears only
while `#wall` is on screen *and* the in-flow act is below the viewport; the
dock carries the act only — `position: sticky; bottom: 0`, 1px top hairline,
`--paper` ground — and `scroll-padding-bottom` is set to the dock's height.
In-flow order never changes (consequence → name → hold caption → act); the
dock never covers the consequence sentence and never renders before its own
signature field. *(amended §F-L)*

## Gate

Renders at 1440 and 390 with no horizontal scroll and no console errors; every
act keyboard-operable; the state switcher works; all three states reachable.

## Do not

No shadows · no pills · no status dots · no olive · no ✓ glyph · no spinner ·
no `disabled` attribute on the gate · no PATINA wordmark · no truncation · no
second photograph · no "$0" placeholder · no per-room "ask for a change"
repeated four times.

---

# §D Specimen 2 — `designer-desk.html`

## Purpose

The Desk at real load: 16 jobs proved, 43 proved, with the studio's creative
work beside the day's work rather than 4,000px below it, and the overdue job
still the first thing on the page. It proves principles 3 and 5.

## Structure, top to bottom

| # | Block | Detail |
|---|---|---|
| 1 | **Greeting** | `h1.t-d1` — "Good morning, *Leah*" with *Leah* in `.t-authorship` (Playfair italic, same size). Beneath, `.t-head`: `TUESDAY · 8 SEPTEMBER`. |
| 2 | **The three acts** | Right-aligned on the greeting row at ≥1000px: `.act--secondary` `+ Capture a lead` (sub-label `.t-meta` "Begin a brief"), `.act--secondary` `+ Open a project` (sub-label "No proposal needed"), `.act--tertiary` `Find anything` with a `<kbd>⌘K</kbd>` chip (1px `--hairline` box, `--radius-hair`, `.t-head`). ⌘K stays global — no inline search field replaces it. |
| 3 | **Margin note** | One line, `.t-authorship` with an en-dash lead: "— This is your Desk. Folders that need you gather here; the rest stays quiet. ⌘K finds anything by name — try 'invoice'." Followed by `.t-head` "APPEARS ONCE · RECEDES ON USE" and a 44px `×` dismiss hung in the true left margin on line 1's baseline. One note only. |
| 4 | **Roster head** | Left: `.t-head` `EVERY JOB · 16 LIVE · 1 OVERDUE` with the 24px scored rule mark to its left. Right, on the same line: two facets, `.act--tertiary` with `aria-pressed` — `Only what needs me` and `By person`. Labels never change with state. 390: facets wrap to a second line, still above the first plate. |
| 5 | **The day's line** | Directly under the head, above the first stage plate. A `1px --hairline-strong` rule, then at most **three** `.t-body` lines, 12px apart: 1) "One thing is overdue — **Vandersteen**, install, since 4 September" (the job name a `.act--tertiary` link; the clause after the dash in `--terracotta-ink`); 2) "Marcus Wright · new lead — respond by 10 September"; 3) "Nora Ellison replied last night — Cedar Lane Study". At 43 jobs it is still three, with `and 12 more below` as a `.act--tertiary` link to the first stage plate. Zero needs → the band does not render. **It is not a second queue** — every line is a view of a roster row and links to it. |
| 6 | **Boards strip** | ≥1200px only, beside the roster head in the right 260px: `.t-head` `BOARDS`, then three 92px **drawn** board thumbnails (inline SVG compositions in `--rail` / `--ink-faint`, never photographs), each captioned `.t-meta` with house and date. Below the roster at <1200px. Never above it. |
| 7 | **The roster** | Seven stage groups in fixed order: Brief · Discovery · Direction · Proposal · Project · Install · Care. Each headed by a **plate**: `h3`, `display:inline-flex`, `padding: 3px 10px`, `border-radius: var(--radius-box)`, `.t-head` in **white**, ground `var(--tab-*)`, text `Brief · 3`. Plates are sticky within their group at ≥900px. Rows below stay on `--paper`. |
| 8 | **A roster row** | `min-height: 44px`, `display:flex; align-items:baseline; gap:12px`, 1px `--hairline` bottom rule. Left: a 7px mark — filled disc in `--terracotta` (urgent) or `--dusty-blue`-equivalent quiet pigment `--clay`, and a **1px open ring in `--ink-faint`** where a row has no mark, so the column never gaps. Then the job name at `.t-d3` as a link with a resting 1px `--rail` rule that raises to `--clay` on hover/focus. Then the state sentence at `.t-body-sm` in `--ink-muted`, with the overdue clause on a second line in `--terracotta-ink`. Then a dotted leader (`border-bottom: 1px dotted var(--hairline-strong)`, `flex:1`). Then a fixed **96px** action column, left edges aligned: `.act--tertiary` `Open` at 13px DM Mono with its resting `--oak` rule. |
| 9 | **The Studio index** | Below the roster, unchanged in kind: three columns — `Rooms` (Library · People · The Scans · The Post) · `Ledgers` (Orders · Accounts · Hours · Contract Room) · `Begin` (Capture a lead · Open a project · Draw a proposal). Each a one-liner: `.t-d3` label, dotted leader to a doorway glyph for rooms and ledgers, an em-dash lead for verbs. No counts, no tiles. |
| 10 | **Bottom bar** | Full width, `--paper-doc` ground with a 1px `--hairline-strong` top rule, `--ink` text: `Library · People · The Scans · Ledgers ↑ · Find anything ⌘K · The Post`, and at the right `Leah Hartwell` at `.t-body-sm` over `LOCAL DEV STUDIO` at `.t-head`. **No dwell timer.** No "TODAY 0:47". No charcoal chrome anywhere. The name prints once as a person and once as the studio — never the same name twice. *(amended §F-F)* |

## States (meta-strip switcher)

| State | What changes |
|---|---|
| **16 jobs** | Default. Six rows and two stage plates above 900px. |
| **43 jobs** | The same layout with 43 rows across the same seven plates. The day's line is still three lines plus "and 12 more below". Proves the plates, the leader and the 96px action column hold. |
| **Only what needs me** | The facet is `aria-pressed="true"`; the roster filters to rows with a mark (7 rows at 16 jobs). The head sentence states the facet in words — "Every job · 16 live · 1 overdue · showing what needs you". Empty result prints "Nothing needs your hand today." — never an empty list. |
| **By person** | Rows regroup under person plates in `--rail` with `--ink` labels (people are not stages, so they never take a stage pigment): Leah Hartwell · Marta Voss · unassigned. |

## Layout

**1440** — content 1100px; boards strip in the right 260px beside the roster
head; roster rows one line each, wrapping to two at long state sentences.

**390** — the margin note collapses to one line; the **day's line comes first
under the greeting**, ahead of the roster head; stage plates are
`position: sticky; top: 0` with a `--paper` ground behind them; the action
column drops under the state sentence at the row's right edge; the boards
strip moves below the roster; the three acts stack under the date.

## Gate

Renders at 1440 and 390 with no horizontal scroll and no console errors; every
act keyboard-operable; the state switcher works; 16 ⇄ 43 both render without
layout change.

## Do not

No shadows · no badges or count chips · no tinted band behind a stage group
(the plate is the colour; the row stays on cream) · no pills · no olive · no
✓ glyph · no spinner · no `disabled` · no truncation · no hero photograph · no
"Ready for your hand" second queue · no dwell timer · no inline search field
replacing ⌘K.

---

# §E Specimen 3 — `decision-moment.html`

## Purpose

Two acts on one page, side by side in weight: a **selection** that is
reversible and a **authorization** that moves money. It proves principle 3 —
tiers by consequence, not by page.

## Structure

One page, two documents stacked, each with its own letterhead (A8) and 72px
between them. One `h1` for the page — "Two acts, two weights" is a specimen
title and belongs in the **meta strip**, not the page; the page's `h1` is
`Cedar Lane Study`, and each document opens at `h2`.

### (A) Selection No. 3 · Cedar Lane Study

| # | Block | Detail |
|---|---|---|
| A1 | Letterhead | `LOCAL DEV STUDIO` / `PREPARED FOR NORA ELLISON` · `Cedar Lane Study` · `Selection No. 3 · 8 September 2026` |
| A2 | Heading | `h2.t-d2` "The table for the Study" |
| A3 | Framing | One paragraph, `.t-body`, 56ch: "The round oak keeps the walk between the chair and the shelving clear, and the 42-inch top still seats four when your sister visits. I have set out two finishes; the natural reads warmer against the shearling." Signed `.t-authorship`: "Leah Hartwell · Local Dev Studio · 8 September 2026". |
| A4 | The piece | 120px **drawn** plate (inline SVG — a round table in plan and elevation, `--rail` stroke, one `--ink-faint` detail line). `.t-d3` "Round oak coffee table". `.t-meta` "42″ × 16″ · solid oak". Caption `.t-meta`: "Round oak coffee table · drawing by Local Dev Studio · 8 September 2026". |
| A5 | Finish chips | Two flat chips, `min-height: 44px`, `padding: 10px 16px`, 1px `--hairline-strong`, `--radius-hair`, `.t-body-sm`, **named in words**: `Natural oak` / `Smoked oak`. `role="radiogroup"`, each `aria-pressed`. Selected = ground `--rail` plus a 1.5px `--ink` left rule; unselected = `--paper-doc`. **No fill colour standing in for the finish, no swatch disc, no ✓.** Below, `.t-meta`: "Physical samples at your next meeting; screens do not show grain truly." |
| A6 | Money table | Three rows to one right rule, labels `.t-body-sm` left, figures `.t-money` right: `Piece $2,100.00` · `Delivery $180.00` · then a `1px --hairline-strong` rule · `Total $2,280.00` (label and figure at weight 500). Below the rule, one sentence at `.t-body`: "Allowance $2,600.00 · $320.00 remaining." **No tax line. No allowance row inside the ledger.** |
| A7 | Consequence | `.consequence`: "Noting your choice tells Leah which finish to price. It is not an order and nothing is charged." |
| A8 | Acts | `.act--secondary` **Note my choice — Natural oak** (label follows the selected chip). Beside it, `.act--tertiary` `Ask Leah for a change`. |

**State — noted.** A6–A8 are replaced by the record block (A9 of the house
sheet): `.stamp` `NOTED` in `--clay-ink` · `h3.t-d3` "Selection No. 3 · Cedar
Lane Study" · `.t-meta` "Nora Ellison · Local Dev Studio" · `.t-meta` "Noted 8
September 2026, 12:41 pm" · `.t-body` "Leah will confirm the maker's price by
12 September." · `.act--tertiary` "Filed under Previously" · `.act--tertiary`
"Back to the house". The money table stays on screen above it — a record that
shrinks is not a record (IX13).

**State — failed.** Above the acts, a `1px --hairline-strong` rule, then
`.t-body` in **body ink** (no colour, no ground): "Your choice wasn't saved.
It is still here — try again." The panel is `role="alert"`; focus moves to the
retry. The retry is a `.act--secondary` `Try again`; the original act stays
where it is. The finish selection is preserved.

### (B) Authorization No. 8 · Built-in shelving, north wall · $2,980.00

| # | Block | Detail |
|---|---|---|
| B1 | Letterhead | Same, with `Authorization No. 8 · 8 September 2026` |
| B2 | Heading | `h2.t-d2` "Built-in shelving, north wall" · `.t-money` `Trade scope · $2,980.00` |
| B3 | Drawing strip | Inline SVG elevation, ≤160px tall: hatched wall, a square notch cut where acceptance is owed. `role="img"`, `aria-label="Elevation of the north wall, hatched, with one square notch open where your acceptance is owed."` |
| B4 | Consequence | `.consequence`: "Accepting releases $2,980.00 to Marta Voss for the finished shelving. It does not close the project or change your invoice." |
| B5 | Typed name | `.t-head` label `TYPE YOUR FULL NAME`; text input, 1px bottom rule, `autocomplete="name"`, `.t-d3` in Playfair; the date beside it at `.t-money` — "8 September 2026". |
| B6 | Hold caption | **Visible**, `.t-meta` in `--ink-subtle`, directly under the act: "Press and hold to accept". |
| B7 | Act | `.act--terminal` **Accept the finished work · $2,980.00**, `aria-disabled="true"` + `aria-describedby` → B5's visible reason ("Type your full name to accept.") until the field matches "Nora Ellison". Activating it while unmet moves focus to the input and writes the reason into the page `role="status"`. |

**State — accepted.** B4–B7 are replaced by the record block: `.stamp`
`ACCEPTED` in `--sage-ink` · "Built-in shelving, north wall" ·
"Authorization No. 8 · Cedar Lane Study" · "Nora Ellison · Local Dev Studio" ·
"Accepted 8 September 2026, 2:14 pm" · the typed name rendered once at
`.t-d3` above a 1px `--hairline-strong` rule · "Marta Voss is released to
invoice $2,980.00 for the finished shelving." · "Recorded in Previously" ·
"Back to the house". The drawing stays, with the notch now closed.

### The legend rail

At **1440**, a hairline column on the right (200px, `border-left: 1px solid
var(--hairline)`, 24px padding), sticky. `.t-head` `THE THREE TIERS`. Three
entries, each: the tier name at `.t-body-sm`, one live specimen of the act,
and one line at `.t-meta` naming when it is used.

| Tier | Specimen | Rule |
|---|---|---|
| Tertiary | `Ask Leah for a change` | Opens or navigates. Nothing changes. |
| Secondary | `Note my choice` | A reversible record. Nothing is charged. |
| Terminal | `Accept · $2,980.00` | Money moves or a paper is signed. |

At **390** the legend moves below both documents, as a plain three-row list.

## States (meta-strip switcher)

| State | What changes |
|---|---|
| **Default** | Both documents at rest. (A) selectable, (B) `aria-disabled`. |
| **Noted** | (A) becomes its record block. (B) unchanged. |
| **Accepted** | (B) becomes its record block. (A) unchanged. |
| **Save failed** | (A) shows the failure panel above its acts. (B) unchanged. |

## Layout

**1440** — the two documents in a 1100px column with the 200px legend rail to
their right, sticky. The money table right-aligned to the document's measure.

**390** — the legend moves below. The money table comes **before** the finish
chips. Each act **docks** to the bottom edge only while its own paper is on
screen *and* its in-flow act is below the viewport; the dock carries the act
only — `position: sticky; bottom: 0`, 1px top hairline, `--paper` ground —
and `scroll-padding-bottom` equals the dock's height. In-flow order never
changes (consequence → name/chips → hold caption → act); the dock never
covers the consequence sentence and never renders before its own signature
field. When paper (A) scrolls out and paper (B) enters, (A)'s act undocks and
(B)'s docks. Only ever one docked act on screen. *(amended §F-L)*

## Gate

Renders at 1440 and 390 with no horizontal scroll and no console errors; every
act keyboard-operable; the state switcher works; all four states reachable;
`aria-disabled` gate is focusable and announces its reason.

## Do not

No shadows · no pills · no status dots · no green success fill · no ✓ glyph ·
no checkbox standing in for a signature · no spinner · no `disabled` · no
PATINA wordmark · no truncation · no tax line · no allowance row inside the
ledger · no colour swatch standing in for a finish · no photograph.

---

# §F Amendments after review 01 (8 September 2026)

The three specimens were built from §A–§E above, then adversarially reviewed
in `../review/01a-specimens-technical.md` (technical) and
`../review/01b-specimens-design.md` (design). The rulings below are final for
this sheet. Where the body of §A–§E and this section disagree, this section
wins; the body has been patched in place to match, with each patched line
marked `*(amended §F-X)*`.

**A. Drawing ink.** Every meaning-carrying SVG stroke (silhouettes, sections,
hatching, the letterbox, the road, wall elevations, board thumbnails) is
`var(--ink-faint)` at 1px; secondary hatch strokes may use
`stroke-opacity:.5`; `--rail` is for fills/grounds only. Never draw a line in
`--rail`.
Answers: PR-09.

**B. Money.** `.t-money` becomes DM Mono 15px/1.5, `tabular-nums`,
letter-spacing .02em. Every money block has exactly one announced figure at
`.t-d2` (house page: the owed amount; a selection paper: the Total; an
authorization: the trade-scope amount). All other figures in that block are
`.t-money`. The allowance/reconciling sentence is `.t-body` with its figures
in `.t-money` spans.
Answers: PR-03, PR-04, PR-05, PR-06.

**C. Terminal label.** `.act--terminal .label` is Inter 500, 16px, sentence
case, tracking 0, figures tabular ("Pay $4,060.00", "Accept the finished
work · $2,980.00"). Tertiary and secondary keep DM Mono 13px caps.
Answers: PR-04.

**D. `.act--inline`** (new tier variant): a tertiary act living inside a
sentence. Inherits the sentence's family/size/case/colour, no min-height box,
no padding, a 1px `--oak` rule at 3px below the baseline, hover →
`--ink-faint` 1.5px, same focus ring. Use it for the doorstep's object
("Finished work" inside the Playfair h2), the day's line links, "Filed under
Previously", "Back to the house", and any act inside prose.
Answers: OS-01, CR-01.

**E. Pressed state.** `[aria-pressed="true"]` on a scored act = `--ink` text
+ the secondary two-score rule; unpressed = tertiary look. Chips (finish,
facets drawn as chips, the 16/43 switcher): pressed = `--rail` ground, 1px
`--ink-faint` border, `--ink` text; unpressed = paper ground, 1px
`--hairline-strong` border.
Answers: OS-05.

**F. Desk bottom bar** = `--paper-doc` ground with a 1px `--hairline-strong`
top rule and `--ink` text. No charcoal chrome anywhere.
Answers: OS-06.

**G. Hold.** One implementation: 900ms press-and-hold with keyboard parity
(Enter/Space held), ink fills left→right, early release cancels silently,
reduced-motion keeps the wait and stills the fill, a bare click never
commits. The visible caption "Press and hold to accept" sits directly under
the act in `.t-meta`. Specimen 3's implementation is canonical.
Answers: OS-02, SF-02, SF-04.

**H. Fixture.** 16 live = the 15 named + Hollenbeck residence (Project ×4).
People facet = Leah Hartwell, Anneke Sund, Colin Brandt. (Marta Voss is a
maker, not staff.)
Answers: SF-14, and technical finding #4 (T02 — the 15-vs-16 arithmetic and
the Hollenbeck/Project count).

**I. Measure.** Ledger tables `max-width: 56ch`; signature input
`max-width: 360px`; figures right-align to the table's own rule, not the page
edge.
Answers: SF-26, SF-29, CR-03.

**J. Dark stage plates:** do not lift the plate values in dark mode — keep
the light values, which meet ≥5.2:1 with the white label.
Answers: technical finding #1 (T01 — white stage-plate labels fail 4.5:1 in
dark mode on Brief/Discovery/Direction).

**K. Embedded images stay data URIs** (self-containment is required for
publishing). The technical review's relative-path finding is declined.
Answers: technical finding #2 (T05 — declined).

**L. 390 dock.** The docked act appears only while its paper section is on
screen AND the in-flow act is below the viewport; the dock carries the act
only; `scroll-padding-bottom` = dock height; in-flow order never changes
(consequence → name → hold caption → act); the dock never covers the
consequence sentence and never renders before its own signature field.
Answers: SF-24, SF-25.

**M. Commit writes to `role="status"`** ("Selection noted: Natural oak,
$2,280.00." / "Finished work accepted: $2,980.00 released to Marta Voss.");
focus moves to the record heading.
Answers: technical finding #3 (T03 — decision-moment never announces
Noted/Accepted completion).

**N. Sentences are state-scoped:** no line may contradict the state being
rendered (quiet day and after-acceptance states update the band note, the row
state, "What changed", and the stamps together).
Answers: SF-01.

**O. Row/job names on the Desk** carry a resting 1px `--oak` rule; hover
raises to `--clay`.
Answers: SF-13.

**P. Imagery.** The one installed photograph on the house page sits at the
room band's full measure as a 3:2 plate with its caption below; Desk board
thumbnails are richer drawings (a plate, two swatches, a caption) not three
rectangles; the legend rail's tier specimens are inert (`<span>`,
`aria-hidden="true"`), never a live terminal act beside a record.
Answers: PR-10, PR-12, SF-27.

**Q. The studio working band.** A **studio** surface — a designer's working
tool, not a letter the studio sends — may run to a **1200px** band. Prose
inside it still caps at **65ch**. §A4's **1100px** page measure is unchanged
and continues to govern every **client** page.
Answers: AR-f (the Agreement Room, ruled by Kody 2026-09-10; R149).
