# SPEC — three specimens, one room

The build contract for *The Paper, Under the Pencil*. Three standalone HTML
pages, built in isolation, that must look like one room.

Read `../synthesis.md` §5 first — it carries every string. Read
`docs/design/house-sheet/SPEC.md` §A in full, then §F; **where §A and §F
disagree, §F wins.** Then build only your own file. Nothing here is a
description: where CSS appears, paste it.

---

## §0 · Files

| File | Direction | Shape |
|---|---|---|
| `direction-1.html` | **D · the galley** | the printed part stays; its editor unfolds beneath it |
| `direction-2.html` | **A · the paper is the page** | the printed part is replaced by its editor, in its own place |
| `direction-3.html` | **B · builder as overlay** | the paper is the page; a non-modal drawer holds the parts |

Each file is self-contained: one `<style>`, one `<script>`, no images, no
external asset except the one Google Fonts link in §1. Every prohibition is
greped in §8 and each grep must return nothing: no `box-shadow` / `drop-shadow`
/ `--elevation-sheet` (FS-4: `.doc-elevated` **is** a shadow); no `disabled`
attribute anywhere (`aria-disabled="true"` only); no `contenteditable` (AX-18);
no truncation; no rendered `font-size` below 11px; no `opacity` carrying a
state; no `position: sticky` or `fixed` — the shipped room has a sticky bar, the
specimens do not, and part heads still carry `scroll-margin-top` so the shipped
build has the hook (AX-19). `body` paints its ground explicitly
(`background: var(--paper); color: var(--ink)`), `<html lang="en">`, exactly one
`<h1>`, headings in order. Size cap **≤120 KB per file.**

---

## §1 · The shared block

Every one of the three files opens with exactly this, byte for byte: the
`:root` tokens, both dark twins, the reset, the seven type steps plus
`.t-authorship` and `.t-money`, the four action tiers, focus, pressed, the chip,
`aria-disabled`, loading, the consequence sentence, the §A12 meta strip and
§A11 — copied from `../../portal-polish-review-2026-09-08/specimens/designer-desk.html`
and `client-house.html`, which are the house sheet §A as amended by §F.

Above it in the `<head>`, the one permitted external asset:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Wrap it in `/* SHARED BLOCK — BEGIN … */` and `/* SHARED BLOCK — END */`
exactly, so the reviewer can cut it out of all three files and diff them.

```css
/* SHARED BLOCK — paste verbatim; the reviewer diffs it */
:root {
  color-scheme: light dark;

  /* — paper, three stocks — */
  --paper:            #FAF7F2;  /* the ground */
  --paper-doc:        #FCFAF6;  /* a document laid on the ground */
  --rail:             #E8E3DB;  /* the rail / deeper sheet */

  /* — ink — */
  --ink:              #2C2926;
  --ink-muted:        #4E4339;
  --ink-subtle:       #5A4E43;
  --ink-faint:        #65594E;
  --ink-paper:        #FAF7F2;

  /* — hairlines — */
  --hairline:         #E8E3DB;
  --hairline-strong:  rgba(44, 41, 38, .14);

  /* — the rest rule pigment — */
  --oak:              #8B7355;

  /* — state pigments: material value / paper ink — */
  --clay:             #C4A57B;   --clay-ink:      #7C5E30;
  --golden:           #E8C547;   --golden-ink:    #79651E;
  --terracotta:       #D4A090;   --terracotta-ink:#9C5340;
  --sage:             #A8B5A0;   --sage-ink:      #5F6B57;

  /* — the seven stage plates — */
  --tab-brief:     #497093;
  --tab-discovery: #307063;
  --tab-direction: #366A3A;
  --tab-proposal:  #575D1D;
  --tab-project:   #6D4E24;
  --tab-install:   #823832;
  --tab-care:      #823832;

  --elevation-sheet: 0 1px 2px rgba(44, 41, 38, .08);

  /* — rhythm — */
  --module: 24px;
  --radius-hair: 2px;
  --radius-box:  3px;

  /* — motion — */
  --press-in:  70ms;
  --press-out: 240ms;
  --ease: cubic-bezier(.22, 1, .36, 1);

  /* — families — */
  --font-display: 'Playfair Display', Georgia, 'Times New Roman', serif;
  --font-body:    'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-meta:    'DM Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
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
    --clay-ink:        #D8B98A;
    --golden-ink:      #E0C963;
    --terracotta-ink:  #E2A895;
    --sage-ink:        #AFC0A6;
    /* J: the seven plates keep their light values in dark mode; lifting them
       drops the white label to 3.90/4.20/4.46:1 (T01). */
  }
}

:root[data-theme="dark"] {
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
  --clay-ink:        #D8B98A;
  --golden-ink:      #E0C963;
  --terracotta-ink:  #E2A895;
  --sage-ink:        #AFC0A6;
  /* J: the seven plates keep their light values in dark mode (T01). */
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-padding-top: 60px; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-body);
}
h1, h2, h3, p, ul, ol, figure { margin: 0; padding: 0; }
ul { list-style: none; }

/* ——— A3. the type scale ——— */
.t-d1      { font-family: var(--font-display); font-size: 34px; line-height: 1.15; font-weight: 500; letter-spacing: 0; }
.t-d2      { font-family: var(--font-display); font-size: 26px; line-height: 1.20; font-weight: 500; letter-spacing: 0; }
.t-d3      { font-family: var(--font-display); font-size: 20px; line-height: 1.30; font-weight: 500; letter-spacing: 0; }
.t-body    { font-family: var(--font-body); font-size: 16px; line-height: 1.55; font-weight: 400; }
.t-body-sm { font-family: var(--font-body); font-size: 14px; line-height: 1.50; font-weight: 400; }
.t-meta    { font-family: var(--font-meta); font-size: 12px; line-height: 1.50; font-weight: 400; letter-spacing: .08em; }
.t-head    { font-family: var(--font-meta); font-size: 11px; line-height: 1.50; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; }
.t-authorship { font-family: var(--font-display); font-size: 20px; line-height: 1.30; font-style: italic; font-weight: 400; }
.t-d1 .t-authorship { font-size: inherit; line-height: inherit; }

/* ——— A5. the action tiers ——— */
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

.act--tertiary { color: var(--ink-subtle); }
.act--tertiary .label::before { background: var(--oak); }
.act--tertiary .label::after  { content: none; }
.act--tertiary:hover .label::before { background: var(--ink-faint); height: 1.5px; }
.act--tertiary:active { color: var(--ink); transition-duration: var(--press-in); }

.act--secondary { color: var(--ink); }
.act--secondary .label::before { height: 1.5px; background: var(--ink); }
.act--secondary .label::after  { background: var(--clay); }
.act--secondary:hover .label::after { height: 2px; }
.act--secondary:active { transition-duration: var(--press-in); }

/* — shared block: inline tier, pressed state, chip (byte-identical in all three specimens) — */
.act--inline{display:inline;min-height:0;min-width:0;padding:0 0 3px;font:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit;white-space:normal;background:none;border:0;border-bottom:1px solid var(--oak);cursor:pointer;text-decoration:none;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.act--inline .label{display:inline;line-height:inherit}
.act--inline .label::before,.act--inline .label::after,.act--inline::after{content:none}
.act--inline:hover{border-bottom-color:var(--ink-faint);border-bottom-width:1.5px;padding-bottom:2.5px}
.act--inline:focus-visible{outline:2px solid var(--clay-ink);outline-offset:2px}
.act[aria-pressed="true"]{color:var(--ink)}
.act[aria-pressed="true"] .label::before{height:1.5px;background:var(--ink)}
.act[aria-pressed="true"] .label::after{content:'';background:var(--clay)}
.act[aria-pressed="false"]{color:var(--ink-subtle)}
.act[aria-pressed="false"] .label::before{height:1px;background:var(--oak)}
.act[aria-pressed="false"] .label::after{content:none}
.chip{min-height:44px;padding:10px 14px;border-radius:var(--radius-box);font-family:var(--font-body);font-size:14px;color:var(--ink);background:var(--paper);border:1px solid var(--hairline-strong);cursor:pointer}
.chip[aria-pressed="true"]{background:var(--rail);border-color:var(--ink-faint)}
.chip:focus-visible{outline:2px solid var(--clay-ink);outline-offset:2px}

.act:focus-visible {
  outline: 2px solid var(--clay-ink);
  outline-offset: 2px;
}
.act::after {
  content: '\2038' / ''; position: absolute; left: 1px; top: 50%;
  font-size: 14px; line-height: 1; color: var(--ink-faint);
  opacity: 0; transform: translateY(-50%);
  transition: opacity 140ms linear; pointer-events: none;
}
.act:focus-visible::after { opacity: 1; }

/* ——— A3 addition · .t-money (§F-B) ——— */
.t-money { font-family: var(--font-meta); font-size: 15px; line-height: 1.50; font-weight: 400; letter-spacing: .02em; font-variant-numeric: tabular-nums; }

/* ——— A5 · terminal tier ——— */
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
.act--terminal:focus-visible::after { color: var(--ink-paper); }

/* aria-disabled — set from script, never the bare HTML attribute */
.act[aria-disabled="true"] { cursor: not-allowed; }
.act--tertiary[aria-disabled="true"],
.act--secondary[aria-disabled="true"] { color: var(--ink-faint); }
.act--tertiary[aria-disabled="true"] .label::before,
.act--secondary[aria-disabled="true"] .label::before,
.act--secondary[aria-disabled="true"] .label::after { background: var(--hairline-strong); }
.act--terminal[aria-disabled="true"] {
  background: var(--rail);
  color: var(--ink-faint);
  border: 1px solid var(--hairline-strong);
}
.act--terminal.is-loading { background: var(--ink); }
.act--terminal.is-loading .label { opacity: 1; }

/* C — the terminal label names its amount in body type, sentence case */
.act--terminal .label {
  font-family: var(--font-body);
  font-size: 16px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
  position: relative;
  z-index: 1;
}

/* ——— A6 · the consequence sentence ——— */
.consequence {
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.55;
  color: var(--ink);
  max-width: 56ch;
  margin: 0 0 12px;
}


/* ——— A12 · the specimen frame ——— */
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
.specimen-meta .switcher { display: flex; align-items: center; gap: 12px; }

/* ——— A11 · reduced motion and forced colors ——— */
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

**The diff the reviewer runs.** Any output at all is a failure.

```bash
cd /Users/kody/Code/patina-merged/artifacts/agreement-room-2026-09-10/specimens
for f in direction-1 direction-2 direction-3; do
  awk '/SHARED BLOCK — BEGIN/,/SHARED BLOCK — END/' "$f.html" > "$TMPDIR/$f.shared.css"
done
diff "$TMPDIR/direction-1.shared.css" "$TMPDIR/direction-2.shared.css" \
  && diff "$TMPDIR/direction-1.shared.css" "$TMPDIR/direction-3.shared.css" \
  && echo "SHARED BLOCK IDENTICAL"
```

Everything a direction needs beyond the block goes **after** the END comment.
Never edit a line inside it, never add a token, never write a hex literal
outside it. `--oak` is a **rest-rule pigment, not an ink** (AX-5: 4.20:1 on
paper, 3.51:1 on rail): it may take `background` and `border-color` and must
never take `color`. Meta text takes `--ink-subtle` (7.54:1) or `--clay-ink`
(5.61:1).

---

## §2 · §A14 · Fields on paper

The typographer's block from `panel/memo-typography.md` §3, pasted whole. One
amendment, because §A wins: `.field .reason` sets `line-height: 1.50` to match
`.t-body-sm` exactly. Nothing else is changed.

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

**Two additions this program needs.** Paste them under §A14 in all three files.

```css
/* A money row: label on the line, figure right-aligned to the block's own rule
   (F-I). Stacks below 520px — no container queries exist in the portal (FS-1),
   so this is a viewport rule and the specimen says so. */
.money-row { display: flex; align-items: baseline; justify-content: space-between;
             gap: 12px; margin: 0 0 12px; }
.money-row > .label { margin: 0; }
.money-rows { border-top: 1px solid var(--hairline-strong); padding-top: 12px; }
@media (max-width: 519px) {
  .money-row { display: block; }
  .money-row > .label { margin: 0 0 12px; }
}

/* Studio chrome. Readiness sentences and marginal notes are the studio's, not
   the paper's: --rail ground, a 2px --clay-ink leading rule (5.61:1 on paper,
   4.70:1 on rail — AX-5's proposal), a .t-head running head. NO-4's binding
   treatment, at 1440, 1024 and 390 alike. */
.studio-note { background: var(--rail); border-left: 2px solid var(--clay-ink);
               padding: 12px; margin: 0 0 var(--module); color: var(--ink); }
.studio-note > .head { display: block; margin: 0 0 12px; color: var(--ink-subtle); }
.studio-note > p { max-width: 56ch; }
```

---

## §3 · The specimen frame, the state switcher, the breakpoints

### The meta strip — §A12 markup, verbatim shape

Outside the mocked page, above it. It is the only place a caveat may appear;
nothing inside the page says prototype, example or fictional.

```html
<div class="specimen-meta" role="region" aria-label="Specimen controls">
  <span>Direction I &middot; The galley</span>
  <span>Fixture: Okonkwo house &middot; Dave Okonkwo &middot; Middle West Studio, Madison &middot; fictional data</span>
  <span>Nothing drawn but the paper &middot; no photographs</span>
  <div class="switcher" role="group" aria-label="State">
    <button type="button" class="chip" id="state-resting" aria-pressed="true">Resting</button>
    <button type="button" class="chip" id="state-clause"  aria-pressed="false">Editing a clause</button>
    <button type="button" class="chip" id="state-money"   aria-pressed="false">Editing the money</button>
  </div>
</div>
```

The three ids are **fixed** — `#state-resting`, `#state-clause`,
`#state-money` — because the render gate and the deck both address them. Only
the first span changes per direction (`Direction II · The paper is the page`,
`Direction III · The builder as an overlay`). Labels never change with state.

### The state machine — one script, identical in all three files

`data-state` lives on `<html>` and takes `resting | clause | money`. Layout is
CSS keyed off it; the two things CSS cannot do — ARIA attributes and the
readiness sentence — the script does.

```html
<script>
(function () {
  var READY = {
    resting: 'One thing before this can go: name a fee.',
    clause:  'One thing before this can go: name a fee.',
    money:   'One thing before this can go: name a ceiling.'
  };
  var FOLD = { clause: 'services', money: 'role-rates' };
  var root = document.documentElement;
  var ids  = ['resting', 'clause', 'money'];

  function apply(s) {
    if (ids.indexOf(s) < 0) return;
    root.dataset.state = s;
    ids.forEach(function (k) {
      var b = document.getElementById('state-' + k);
      if (b) b.setAttribute('aria-pressed', String(k === s));
    });
    ['services', 'role-rates'].forEach(function (key) {
      var fold = document.getElementById('fold-' + key);
      var head = document.getElementById('toggle-' + key);
      if (!fold) return;
      var open = FOLD[s] === key;
      fold.hidden = !open;
      if (head) head.setAttribute('aria-expanded', String(open));
    });
    var status = document.getElementById('room-status');
    if (status) status.textContent = READY[s];
  }

  ids.forEach(function (k) {
    var b = document.getElementById('state-' + k);
    if (b) b.addEventListener('click', function () { apply(k); });
  });
  window.addEventListener('message', function (e) {
    var s = e.data && e.data.state;
    if (s) apply(s);
  });
  apply('resting');
})();
</script>
```

Direction III replaces the `FOLD` map with its drawer equivalent: `resting`
leaves the drawer closed, `clause` and `money` open it on Services and Role
rates. The `message` listener, the three ids, the `aria-pressed` sweep and
`READY` are identical in all three.

The status region is authored in the page, never inserted (AX-2):

```html
<p class="studio-note" id="room-status-wrap">
  <span class="t-head head">The studio</span>
  <span class="t-body" id="room-status" role="status" aria-live="polite">One thing before this can go: name a fee.</span>
</p>
```

Present at load, never removed, never empty — when nothing is outstanding it
reads `Nothing left to finish.`, so §A10 is honoured by the region always having
something to say.

### Breakpoints — exact px, the same three in all three files

The deck sets the iframe width, so viewport = frame width.

| Band | Rule | At the deck's widths |
|---|---|---|
| **wide** | `@media (min-width: 1248px)` | 1440 |
| **middle** | `@media (min-width: 768px) and (max-width: 1247px)` | 1024 |
| **narrow** | `@media (max-width: 767px)` | 390 |

1248 = the widest band any direction needs (1200) plus a module of air each
side; 768 is where no direction can hold a second column beside a 720 paper.
Both are declared once per direction, in §4.

### What each state shows — pinned, and the same fixture in all three

The nine standard parts of §6.2, with three load-bearing exceptions:

| Part | Pinned | Why |
|---|---|---|
| 4 · Role rates | **unwritten** in resting and clause; two rates written in money | R21/FS-6 — an unwritten part draws nothing on the paper, so every direction must show the studio-only rest row the paper omits. The FS-6 proof. |
| 5 · Ceiling | **`Not yet set`** throughout | keeps a live blocker in money: `readiness.ts:469-475` clears the fee floor the moment a rate card carries a value and `:503-530` fires the ceiling blocker instead, so the two sentences cannot coexist. |
| 6 · Furnishings deposit | **`Not yet set`** | §6.2 part 6, R21. |

Client account **linked** (`Dave Okonkwo · dave@okonkwo.test`), so the title
treatment and the `aria-disabled` inline act are both provable.

**`resting`** — Services, Deliverables, Exclusions, Retainer ($5,000.00),
Billing cadence (Monthly) and Terms written; Ceiling and Furnishings deposit
print `Not yet set`; Role rates prints nothing and is reachable only by its
studio rest row. Nothing unfolded, nothing selected. Readiness: `One thing
before this can go: name a fee.`, with the fee-floor note beside the **Role
rates** seam. Record: `Saved 10 September 2026, 5:36 am`.

**`clause`** — the same composition, Services mid-edit. The field holds the
fixture's prose verbatim, caret **after `selections.`** — the end of the second
sentence, before the space that begins `The studio draws`. The specimen shows
the caret by focusing the field on entry to this state. Readiness unchanged.
Record: `… · Services not yet saved`.

**`money`** — Role rates mid-edit. `Principal $185.00` and `Designer $140.00`
written; the **Assistant** field is focused and holds `85.0`, caret after the
`0` — the plate proving a decimal point survives a keystroke (ED-22). Ceiling
still `Not yet set`. Readiness: `One thing before this can go: name a ceiling.`
The fee-floor note is **gone**; the ceiling note sits beside the **Ceiling**
seam, and the Ceiling row in the outline carries `needs attention`. Record:
`… · Role rates not yet saved`.

No specimen state carries the Concept fee: it is a step-7 addition, it would
satisfy the fee floor and kill the resting blocker, and it belongs only to the
send-sheet copy, written for the finished agreement.

---

## §4 · Per-direction build sheets

### Common to all three

One `<h1>` — the client's name; `<h2>` for the page's regions, `<h3>` for part
heads, no level skipped. The outline keeps the shipped contract (FS-16 — free,
and it saves the whole rail test surface): `<nav aria-label="Agreement parts">`
wrapping a `<ul>` of `<li>`. Every part `<section>` carries `data-part-key` (the
shipped body's own hook, `agreement-parts-body.tsx:574`) and
`scroll-margin-top: 24px`. Every act is ≥44 × 44 (AX-17), padding invisible
where the mark must stay small; no act is hover-revealed and seam acts are
persistent (AX-20). Fold, open and focus state key on the **part key**, never a
uuid (FS-26). Money prints with cents, always — `$185.00`, never `$185` (TY-3).
The paper's prose is `.t-body` capped at 65ch; notes and readiness are
`.t-body-sm` inside `.studio-note`. Part heads are **`.t-d3` roman**, one per
part, never two (FS-7) and never `.t-authorship`, which §A3 forbids as a heading
(AM-2 asks; the SPEC builds the compliant version).

### The shared page furniture, in order down the page

Identical in all three; this is the header reduction.

```html
<p class="t-head">Design services agreement · V1</p>
<h1 class="t-d2">Dave Okonkwo</h1>
<p class="t-head">Draft</p>
<p class="t-body">Prepared for Dave Okonkwo &middot; dave@okonkwo.test —
  <button type="button" class="act act--inline" aria-disabled="true"
          aria-describedby="owner-reason"><span class="label">Change the client account</span></button></p>
<p class="t-body-sm" id="owner-reason">Only the agreement owner can change the client account.</p>
<p class="t-meta record">Saved 10 September 2026, 5:36 am</p>
<p class="studio-note" id="room-status-wrap">
  <span class="t-head head">The studio</span>
  <span class="t-body" id="room-status" role="status" aria-live="polite">One thing before this can go: name a fee.</span></p>
```

No Save control exists in any specimen: `Saved …` is the record that replaced it
(§A5 "taken").

At the paper's foot, in this order and no other (§A6): `<p class="consequence">`
carrying string #25/#26, then the terminal act
`<button class="act act--terminal" aria-disabled="true" aria-describedby="fee-blocker">`
labelled `Send the agreement · $5,000.00 retainer`, then
`<button class="act act--tertiary">Read the whole paper</button>`.

At the outline's foot (D, A) or the page foot (B): `<p class="consequence">`
carrying string #36, then
`<button class="act act--tertiary" data-hold="900">Return to the seven facets</button>`,
then `<p class="t-meta">Press and hold to return</p>` (§F-G).

---

### Direction I — D · the galley · `direction-1.html`

#### The bands — exact px, every number on the 24px module

```
1440   120 │ 192 outline │ 48 │ 720 galley  │ 48 │ 192 notes │ 120     band 1200
1024    48 │ ▸ The parts │    │ 664 galley  │ 48 │ 216 notes │  48     residual galley
 390    16 │ ▸ The parts · 358 galley · notes as --rail strips │ 16     one column
```

192 = 8 modules · 216 = 9 · 720 = 30 · 48 = 2 · 120 = 5 · 16 is the phone gutter.
720 is the shipped paper's own `max-w-[720px]`
(`service-agreement-preview.tsx:101`). The 1200 band exceeds §A4's 1100 page
measure, which governs a *client* page; the ruling sheet asks (AR-f) and the
prose inside still caps at 65ch. At 1024 the galley is the residual —
1024 − 48 − 48 − 48 − 216 = **664** — and never narrower than 600.

```css
.room  { width: 1200px; max-width: calc(100% - 48px); margin: 0 auto; }
.galley{ max-width: 720px; }
@media (min-width: 1248px) {
  .room { display: grid; grid-template-columns: 192px 720px 192px; column-gap: 48px; }
}
@media (min-width: 768px) and (max-width: 1247px) {
  .room { display: grid; grid-template-columns: minmax(600px,1fr) 216px;
          column-gap: 48px; padding: 0 48px; width: 100%; max-width: none; }
}
@media (max-width: 767px) {
  .room { display: block; padding: 0 16px; width: 100%; max-width: none; }
}
```

#### Where everything sits

The outline is the left column at 1440 under the head `The parts`, and a
disclosure at the galley's head at 1024 and 390 — the same `nav`/`ul`/`li`
either way. Marginal notes are the right column at 1440 and 1024, and
`.studio-note` strips between parts at 390: `--rail` ground, `THE STUDIO` head,
never the paper's ground (NO-4). Readiness is a `.studio-note` above the galley
at every width; the Save record sits under the prepared-for line, with a
per-part record inside each open fold. Seams between every pair of parts, folds
beneath the printed part, Review & send at the galley's foot above `Read the
whole paper`, the return act at the outline's foot — inside the disclosure at
1024 and 390.

#### Markup — a part, three states

```html
<!-- RESTING. Role rates is unwritten, so the paper prints NOTHING; the studio
     rest row is what the designer reaches (R21, FS-6). -->
<section class="part" data-part-key="patina.role_rates" id="part-role-rates">
  <h3 class="part__head t-d3">
    <button type="button" class="act act--tertiary" id="toggle-role-rates"
            aria-expanded="false" aria-controls="fold-role-rates">
      <span class="label">Role rates</span></button>
  </h3>
  <p class="t-meta part__rest">Not written yet. Your client's copy does not print this part.</p>
  <p class="t-head part__standing">Creates authority</p>
  <div class="part__acts">
    <button type="button" class="act act--tertiary"><span class="label">Move up</span></button>
    <button type="button" class="act act--tertiary"><span class="label">Move down</span></button>
  </div>
  <div class="fold" id="fold-role-rates" role="group" aria-labelledby="toggle-role-rates" hidden></div>
</section>
<div class="seam"><button type="button" class="act act--tertiary"><span class="label">+ Add a part</span></button></div>
```

SELECTED is the same section with `data-selected="true"` — a rule and a word,
never a hue alone (AX-11):

```css
.part            { padding: 0 0 var(--module); scroll-margin-top: 24px; }
.seam            { min-height: 44px; display: flex; align-items: center; }
.part__head      { margin: 0 0 12px; }
.part[data-selected="true"] { border-left: 2px solid var(--ink); padding-left: 22px; }
.part[data-selected="true"] .part__head::after {
  content: ' — being written'; font-family: var(--font-meta); font-size: 11px;
  letter-spacing: .08em; text-transform: uppercase; color: var(--ink-subtle); }
.fold            { border-left: 1px solid var(--hairline-strong);
                   padding: 12px 0 12px 22px; margin: 12px 0 0; }
.fold[hidden]    { display: none; }
```

EDITING — the fold, unfolded **beneath** the printed form, which does not move.
It carries **no heading of its own** (FS-7):

```html
<div class="fold" id="fold-role-rates" role="group" aria-labelledby="toggle-role-rates">
  <div class="money-rows">
    <div class="field money-row">
      <label class="label t-head" for="rate-principal">Principal · hourly</label>
      <span class="field-money"><input class="field-control" id="rate-principal"
            type="text" inputmode="decimal" value="185.00"></span>
    </div>
    <!-- Designer · hourly = 140.00, same shape -->
    <div class="field money-row">
      <label class="label t-head" for="rate-assistant">Assistant · hourly</label>
      <span class="field-money"><input class="field-control" id="rate-assistant"
            type="text" inputmode="decimal" value="85.0" autofocus></span>
    </div>
  </div>
  <p class="t-meta record">Saved 10 September 2026, 5:36 am &middot; Role rates not yet saved</p>
</div>
```

The clause fold is the same shape with §2's `.field-grow` prose field, the
fixture's Services text (§6.2 part 1) verbatim, caret after `selections.`

#### D's money-part answer

The editor unfolds at the galley's full measure — **720 / 664 / 358**. There is
no margin editor in D and none may be drawn; the right column carries marginal
notes only.

#### Keyboard model

Tab: h1 block → prepared-for act → outline rows → per part: head toggle → Move
up → Move down → seam act → the open fold's fields → send act → `Read the whole
paper` → return act. `Enter`/`Space` on a part head toggles the fold, sets
`aria-expanded` and lands focus in the fold's first field on open; `Esc` inside
a fold folds it and returns focus to its own head. `Enter` on Move up / Move
down moves the part, **returns focus to that part's own head**, and writes
`Billing cadence is now part 7 of 9.` to `#room-status`. Tab reaches
`+ Add a part` at every seam with no hover — including the seam beside an
unwritten part.

#### a11y checks with a D-specific reading

All twenty in §8 bind; four read specially here. **18 — Δ = 0px:** record
`getBoundingClientRect().top` of the part *above* Role rates, switch to `money`,
re-read. D's crux. **13** — an act matching `/review|send/i` present at 390;
today's room fails it. **14 / 15** — with `pointerEvents='none'`, focus the
Billing cadence head and press its move affordance twice; focus stays on that
part's control and `#room-status` names the part and its new position each time.
**6** — switching `resting → money` rewrites `#room-status` to a full sentence.

#### What D must prove — the seven cruxes

(i) three role rates at `.t-money` 15 inside 720, 664 and 358, no truncation;
(ii) `+ Add a part` at the seam beside the **unwritten** Role rates part, by Tab
alone; (iii) at 390 the marginal note on `--rail`, outside the paper's ground;
(iv) the fee-floor note beside the Role rates seam in resting and the ceiling
note beside the Ceiling seam in money, `#room-status` moving between them;
(v) Review & send on the page at all three widths, the return act at the
outline's foot in the quietest tier; (vi) one heading per part and a paper a
per-part export could render unchanged; (vii) no rail, no editor column, no
aside, no preview sheet, one count.

---

### Direction II — A · the paper is the page · `direction-2.html`

#### The bands

```
1440   144 │ 168 outline │ 48 │ 768→720 paper │ 48 │ 168 margin │ 144   band 1152
1024    48 │ ▸ The parts │    │ 712 paper     │ 48 │ 168 margin │  48   residual paper
 390    16 │ readiness band above · 358 paper · ▸ The parts     │  16   one column
```

168 = 7 modules · 720 = 30 · 48 = 2 · 144 = 6. At 1024 the paper is the
residual: 1024 − 48 − 48 − 48 − 168 = **712**. At 390 the studio margin becomes
a `.studio-note` band directly above the paper, with its own ground and running
head — proximity alone would read as a line of the agreement (NO-1).

```css
.room  { width: 1152px; max-width: calc(100% - 96px); margin: 0 auto; }
.paper { max-width: 720px; }
@media (min-width: 1248px) {
  .room { display: grid; grid-template-columns: 168px 720px 168px; column-gap: 48px; }
}
@media (min-width: 768px) and (max-width: 1247px) {
  .room { display: grid; grid-template-columns: minmax(0,1fr) 168px;
          column-gap: 48px; padding: 0 48px; width: 100%; max-width: none; }
}
@media (max-width: 767px) {
  .room { display: block; padding: 0 16px; width: 100%; max-width: none; }
}
```

#### Where everything sits

As in D, with one difference: A's right column carries **readiness and the
marginal notes and no editor**, and at 1024 and 390 it becomes the band above
the paper.

#### Markup — a part, three states

```html
<!-- RESTING (printed) -->
<section class="part" data-part-key="patina.services" id="part-services" data-mode="printed">
  <h3 class="part__head t-d3">Services</h3>
  <div class="part__printed"><p class="t-body"><!-- §6.2 part 1, verbatim --></p></div>
  <div class="part__acts">
    <button type="button" class="act act--tertiary" id="toggle-services"
            aria-expanded="false" aria-controls="fold-services">
      <span class="label">Write this part</span></button>
    <button type="button" class="act act--tertiary"><span class="label">Move up</span></button>
    <button type="button" class="act act--tertiary"><span class="label">Move down</span></button>
  </div>
</section>
```

EDITING is the same section with `data-mode="editing"`: the `<h3>` unchanged
(no second heading, FS-7), `.part__printed` replaced by the §2 field group, the
record line beneath it, and `Write this part` replaced by `Done writing`
(`.act--secondary`).

```html
<div class="field" id="fold-services">
  <label class="label t-head" for="f-services">The language the client reads and signs</label>
  <div class="field-grow" data-value="<!-- §6.2 part 1, verbatim -->">
    <textarea class="field-control field-control--prose" id="f-services" rows="4"><!-- §6.2 part 1, verbatim --></textarea>
  </div>
</div>
```

Both renderings are authored and switched by `data-mode`, which the state script
sets alongside `aria-expanded`. SELECTED takes D's `data-selected` rule. The
unwritten Role rates part takes the same studio rest row as in D (FS-6), with
`Write this part` as its only act.

#### A's money-part answer

The right margin holds **no editor**. Every editor — prose and money alike —
takes the part's own place on the paper at the paper's full measure: **720 / 712
/ 358**. The money markup is D's `.money-rows` block, unchanged, sitting where
the schedule prints. This is A's answer, stated rather than drawing a 208px
margin form the feasibility seat says cannot exist (FS-1, FS-2).

#### Keyboard model

Tab: h1 block → prepared-for act → outline rows → per part `Write this part` →
Move up → Move down → seam act → (editing) the field, then `Done writing` → send
act → `Read the whole paper` → return act. `Enter` on `Write this part` swaps the
printed body for the field and lands focus in it; `Esc` restores the printed body
and returns focus to `Write this part`. Move up / Move down behave as in D and
write the same sentence to `#room-status`.

#### a11y checks with an A-specific reading

**16 — no `contenteditable`:** A is the shape that most tempts it; zero matches,
every field a real control with a visible label. **17 — no hover-only act:** A's
seams are the temptation; each is persistent, and any `:hover` rule touching
`opacity`/`visibility`/`display` on an interactive descendant needs a
`:focus-within` twin. **19 — focus never obscured:** A moves the reading position
on every selection; with no sticky element this passes by construction, and
`scroll-margin-top` is still declared so the shipped build has the hook.
**18 — Δ = 0px** applies in A only to the parts *above* the one being edited: A's
substitution may reflow what is below it, and the specimen shows that honestly
rather than padding the field to the printed height. **6 — readiness speaks**, as
in D.

#### What A must prove

(i) three role rates in the part's own place at 720, 712 and 358; (ii) the seam
beside the unwritten Role rates part, keyboard-reachable; (iii) at 390 the
readiness band with its own ground and running head; (iv) readiness and both
marginal notes in the right margin at 1440/1024 and in the band at 390; (v) send
on the page at three widths, return at the outline's foot; (vi) an editing state
that never asks the body for a slot — the chrome renders the printed section *or*
the field, never both; (vii) no third rendering, no editor column, no preview
act.

---

### Direction III — B · builder as overlay · `direction-3.html`

#### The bands

```
1440 open     0 │ 480 drawer │ 48 │ 720 paper │ 192 residual │              1248 used
1440 closed     │              720 paper, centred             │
1024 open     0 │ 384 drawer │ 48 │ 544 paper (residual)      │ 48
 390 open     the drawer is a full-screen sheet — the paper is NOT visible
 390 closed   16 │ 358 paper │ 16
```

480 = 20 modules · 384 = 16 · 720 = 30 · 48 = 2. The drawer is flush to the
viewport's left edge — it is a drawer, not a column.

```css
.shell { display: block; }
@media (min-width: 1248px) {
  html[data-state="clause"] .shell, html[data-state="money"] .shell {
    display: grid; grid-template-columns: 480px 720px minmax(0,1fr); column-gap: 48px; }
}
@media (min-width: 768px) and (max-width: 1247px) {
  html[data-state="clause"] .shell, html[data-state="money"] .shell {
    display: grid; grid-template-columns: 384px minmax(0,1fr);
    column-gap: 48px; padding-right: 48px; }
}
html[data-state="resting"] .drawer { display: none; }
@media (max-width: 767px) {
  html[data-state="clause"] .paper-col, html[data-state="money"] .paper-col { display: none; }
  .drawer { padding: 0 16px; }
}
```

#### The drawer — non-modal, separated without a shadow

`DocSheet` is a modal: `aria-modal`, focus trap, `lockBodyScroll`, a
`rgba(20,18,16,.55)` veil (FS-3). B's premise needs none of it, and
`.doc-elevated` is a `box-shadow` (FS-4).

```html
<div class="drawer" id="drawer" role="region" aria-label="The parts">
  <div class="drawer__head">
    <button type="button" class="act act--tertiary" id="drawer-close"><span class="label">Close</span></button>
  </div>
  <nav class="outline" aria-label="Agreement parts"><ul>…</ul></nav>
  <div class="drawer__editor">…</div>
</div>
```

```css
.drawer { background: var(--rail);
          border-right: 1px solid var(--ink-faint);  /* the one edge a reader can
                              see: 6.51:1 on paper-doc, 5.32:1 on rail */
          padding: 24px; min-height: 100%; }
.drawer .money-row { display: block; }               /* B's single-column money */
.drawer .money-row > .label { margin: 0 0 12px; }
```

No veil, no scroll lock, no `inert`, no `aria-modal`. Focus is **placed, not
trapped**: opening moves it to the drawer's first outline row, `Esc` closes. The
paper stays in the flow and scrollable — B's whole point, and if the specimen
has to dim the paper to separate the drawer from it, B's premise is decoration.

#### B's money-part answer

Inside 480 (432 usable after padding) the shipped rate card's
`minmax(0,1fr)_140px` grid leaves ~200px for a role name (ED-43) and cannot hold
draws or allowances at all (FS-2). B's money form is therefore **a single
column** — label above, figure below, right-aligned to the drawer's own rule.
`.money-row`'s own stacking rule is a *viewport* query and does not fire at a
1440 viewport (FS-1), so B declares `.drawer .money-row { display: block; }`
above. This is a rewrite of the rate card and the deck's fold note says so.

#### Readiness when the drawer is shut

One `.studio-note` band above the closed paper carries the readiness sentence
and the document-level notes. Part-scoped blockers read **inside the drawer
only**, and the readiness sentence names the part whenever the count moves — B's
answer to FS-30 and ED-42, and the honest one: with no margin, B buys the naming
with the sentence rather than the geometry. Each part on the closed paper
carries one inline act at its foot, `Edit this part` (`.act--inline`), which is
also the focus-restore target on close — not the global `Edit the parts` (ED-6).
Where a part is unwritten and the paper prints nothing, the studio rest row
carries that act (FS-6).

#### Keyboard model

`Edit the parts` / `Edit this part` opens the drawer and moves focus to the
drawer's first outline row. `Esc` or `Close` shuts it and returns focus to the
`Edit this part` act of the part just edited; where none was used, the fallback
is `Edit the parts`. Inside the drawer, Tab runs Close → outline rows → editor
fields → `+ Add a part`. Nothing traps.

#### a11y checks with a B-specific reading

**7 / 8** — B is where AX-10 bites: `doc-sheet.tsx:80` filters
`aria-disabled="true"` out of the trap's focusable set; the specimen has no trap,
so it must prove the behaviour the shipped sheet cannot — Tab reaches the held
send act. **13** — reflow at 390 keeps every act, the drawer's counted.
**19** — focus never obscured; no sticky, no fixed, drawer included.
**20c** — with the veil and the shadow gone the drawer's separation is a 1px
`--ink-faint` rule plus a ground change, so under `forced-colors: active` the
rule must still draw (`border-color: CanvasText`).

#### What B must prove

(i) three role rates typed inside 480 and printed on the paper **in the same
frame**; (ii) reorder from inside the drawer, keyboard only; (iii) at 390 the
full-screen drawer and, on the other plate, the paper alone with no studio
chrome in it; (iv) the closed-paper readiness band in a home that is not a
restored aside; (v) send at the closed paper's foot at three widths; (vi) a
paper that is the read-only render untouched — B touches no body file;
(vii) the honest answer that nothing is removed, only relocated.

---

## §5 · The shared copy

Every string, verbatim, with the state it appears in. Deviation is a P1.

| # | String | Where | State |
|---|---|---|---|
| 1 | `DESIGN SERVICES AGREEMENT · V1` | `.t-head` above the h1 | all |
| 2 | `Dave Okonkwo` | the h1, `.t-d2` | all |
| 3 | `DRAFT` | `.t-head` below the h1 | all |
| 4–5 | `dave@okonkwo.test` · `A draft with no client yet` | the title's email fallback and its third state — **authored as an HTML comment, not rendered** | — |
| 6 | `Prepared for Dave Okonkwo · dave@okonkwo.test — Change the client account` | the prepared-for line; `Change the client account` is `.act--inline`, `aria-disabled="true"` | all |
| 7 | `Only the agreement owner can change the client account.` | the visible reason, `aria-describedby` target of #6 | all |
| 8 | `Prepared for no one yet — Link a client` | the unlinked variant — **comment, not rendered** | — |
| 9 | `Okonkwo house — design services agreement` | the **paper's** own headline (the page names the person, the paper names the house) | all |
| 10 | `Saved 10 September 2026, 5:36 am` | the record line replacing Save | resting |
| 11 | `Saved 10 September 2026, 5:36 am · Services not yet saved` | same slot | clause |
| 12 | `Saved 10 September 2026, 5:36 am · Role rates not yet saved` | same slot | money |
| 13 | `One thing before this can go: name a fee.` | `#room-status` | resting, clause |
| 14 | `One thing before this can go: name a ceiling.` | `#room-status` | money |
| 15 | `Role rates name the fee. One thing left: name a ceiling.` | `#room-status` on the transition — written by the script when moving `clause → money` | transition |
| 16–17 | `Two things before this can go: name a fee; link a client.` · `Nothing left to finish.` | the two-item and the nothing-outstanding forms of `#room-status` — **comments, not rendered** | — |
| 18 | `This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.` | `.studio-note` beside the Role rates seam | resting, clause |
| 19 | `An agreement that bills hourly needs a ceiling. Add a Ceiling part, or remove the role rates.` | `.studio-note` beside the Ceiling seam | money |
| 20 | `Link a client with an email address.` | the client blocker — **comment, not rendered** | — |
| 21 | `THE STUDIO` | the `.t-head` running head on every `.studio-note` | all |
| 22 | `needs attention` | the outline's attention word, `.t-head` | Ceiling in money |
| 23 | `Not written yet. Your client's copy does not print this part.` | the studio rest row for an unwritten part (Role rates) | resting, clause |
| 24 | `Not yet set` | the paper, for Ceiling and Furnishings deposit — R21's own constant | all |
| 25 | `Dave Okonkwo receives the six parts this agreement has written — the services, the deliverables, the exclusions, the $5,000.00 retainer, the monthly billing cadence and the terms — and his signature preserves consent; nothing is billed and no work is authorized until the studio countersigns.` | `.consequence`, directly above the send act | resting, clause |
| 26 | `Dave Okonkwo receives the seven parts this agreement has written — the services, the deliverables, the exclusions, the role rates, the $5,000.00 retainer, the monthly billing cadence and the terms — and his signature preserves consent; nothing is billed and no work is authorized until the studio countersigns.` | same slot | money |
| 27 | `Send the agreement · $5,000.00 retainer` | `.act--terminal`, `aria-disabled="true"`, `aria-describedby` at #18 / #19 | all |
| 28 | `Read the whole paper` | the full-read act (D, A). B renames the preview act to this too. | all |
| 29 | `Edit the parts` | `.act--secondary` on the closed paper — **direction III only** | resting |
| 30 | `Edit this part` | `.act--inline` at each part's foot — **direction III only** | resting |
| 31 | `← Back to the paper` | the drawer's first act at 390 — **direction III only** | clause, money |
| 32 | `+ Add a part` | every seam act | all |
| 33 | `Move up` / `Move down` | the two acts on a part head | all |
| 34 | `Write this part` / `Done writing` | **direction II only** | all |
| 35 | `Save as template…` | the outline's foot | all |
| 36 | `This takes away the nine parts you have written and puts the seven facets back in their place; the money already recorded on the agreement does not change, and a part with no facet to return to — a flat fee, a per-phase fee, a draw schedule — does not survive it.` | `.consequence` above the return act | all |
| 37 | `Return to the seven facets` | `.act--tertiary`, the quietest act on the page | all |
| 38 | `Press and hold to return` | `.t-meta` caption directly under #37 (§F-G) | all |
| 39 | `Billing cadence is now part 7 of 9.` | written to `#room-status` by a reorder | on reorder |
| 40 | `Creates authority` | the part standing, `.t-head`, beside the money — never in the outline (IA-11, IA-12) | all |
| 41 | `Record only` + `This is recorded on the agreement. It does not create billing authority yet.` | the exception's standing and its consequence — **comment, not rendered** | — |

**The send sheet** is not a specimen state — deck sheet 15 renders its copy,
pinned in `../synthesis.md` §5. No builder writes it.

`facet` appears once, in #37. Everything else uses **Agreement · Part · Library
· Template · Addendum**.

---

## §6 · Fixture

Copied from `../briefing/fixture.md` §1–§2. Every figure a specimen prints
traces here; one that does not is a defect.

### §6.1 · The parties and the paper

| Field | Value |
|---|---|
| Studio | Middle West Studio, Madison |
| Client | Dave Okonkwo |
| Client account | `dave@okonkwo.test` |
| Document | Design services agreement · V1 · DRAFT |
| Date | 10 September 2026 |
| Parts | the nine standard parts, in the order `PATINA_STANDARD_AGREEMENT_PARTS` seeds them (`packages/types/src/agreement.ts:96-106`) |
| Estimate | $22,200.00 of professional time |
| Ceiling | $24,000.00 |
| Retainer | $5,000.00 |
| Role rates | Principal $185.00 / hour · Designer $140.00 / hour · Assistant $85.00 / hour |

The Concept fee — a `flat` part, **$2,400.00** — is fixture step 7. **It is not
present in any specimen state** (it would satisfy the fee floor and kill the
resting blocker). It appears only in the send-sheet copy, which is written for
the finished agreement.

### §6.2 · The nine standard parts, as they read in a finished agreement

Figures live only in `schedule` parts; the clause and list parts carry no money
(R5). `Not yet set` is R21's wording, from `agreement-copy.ts:38`.

**1 · Services — clause**

> Middle West Studio provides interior design services for the Okonkwo house:
> concept development, design documentation, and selections. The studio draws
> the rooms, specifies the pieces and finishes, and coordinates with the trades
> doing the work. Furnishings and purchasing stay outside this agreement.

**2 · Deliverables — list**

> — Concept presentation for each room in scope
> — Design documentation — plans, elevations, and finish schedules
> — Selection schedules naming maker, finish, and lead time
> — One walkthrough at installation

**3 · Exclusions — list**

> — Construction labor and permits
> — Structural, mechanical, electrical, and plumbing engineering
> — Purchasing, freight, and installation of furnishings

**4 · Role rates — schedule / `rate_card` · creates authority**

| Role | Rate |
|---|---|
| Principal | $185.00 / hour |
| Designer | $140.00 / hour |
| Assistant | $85.00 / hour |

> Professional time is billed at the rate of the person who worked it.

*Pinned unwritten in resting and clause; two written and the third mid-keystroke in money.*

**5 · Ceiling — schedule / `ceiling` · creates authority**

> $24,000.00
>
> Professional time stops at this figure. Work past it needs a written
> authorization first.

*Pinned `Not yet set` in all three states.* Required whenever a rate card is
present (R4); the uncapped alternative is `AGREEMENT_PART_COPY.ceilingUncapped`,
`agreement-copy.ts:17`.

**6 · Furnishings deposit — schedule / `procurement` · creates authority ·
deposit only**

> Not yet set

**7 · Retainer — schedule / `retainer` · creates authority**

> $5,000.00
>
> Credited against the first invoices.
>
> Design work begins after the fully executed agreement and retainer payment.

(Third line: `AGREEMENT_PART_COPY.retainerOnPayment`, `agreement-copy.ts:19-20`.)

**8 · Billing cadence — schedule / `cadence` · creates authority**

> Monthly
>
> Additional work requires written authorization before it can be invoiced.

(Second line: `AGREEMENT_PART_COPY.cadenceNote`, `agreement-copy.ts:24-25` —
always printed under a cadence part.)

**9 · Terms — clause**

> This agreement stands until the work it describes is finished, or until either
> party ends it in writing with fourteen days' notice. Drawings, schedules, and
> specifications the studio prepares stay the studio's work; the Okonkwos hold a
> license to use them for this house. Invoices are due on receipt, and work
> pauses on an invoice unpaid for thirty days. Wisconsin law governs this
> agreement.

**10 · Concept fee — schedule / `flat` · creates authority** — send-sheet copy
only

> $2,400.00
>
> A flat fee for the concept phase, invoiced once at its presentation.

---

## §7 · Banned words

Verbatim from `../briefing/panel-brief-common.md` §9:

> `clause library`, `contract builder`, `wizard`, `dashboard`, `AI`, `badge`,
> `pill`, `chip`, `modal`, `toast`, `spinner`, `facet` (on any studio-facing
> string in a specimen except the return act's own label, which is R24's — the
> panel may propose renaming it as an AMENDMENT-ASK), `live` inside the paper,
> `Patina` inside the paper above the colophon; specimen faces additionally
> `builder`, `composer`, `preview panel`, any `R\d+` / `W\dR\d`.

These bind the words a designer or homeowner reads. `chip` may appear as a CSS
class name (`.chip` is the house's own switcher class) but never as visible
text. `facet` may appear exactly once, in string #37.

The grep the builder runs before handoff:

```bash
f=direction-1.html   # then -2, -3
grep -niE 'clause library|contract builder|wizard|dashboard|\bAI\b|badge|pill|toast|spinner|preview panel|R[0-9]+|W[0-9]R[0-9]' "$f"
grep -niE '>[^<]*\b(chip|modal|builder|composer)\b' "$f"      # visible text only
grep -c 'Return to the seven facets' "$f"                      # must be exactly 1
grep -niE 'facet' "$f" | grep -v 'Return to the seven facets'  # must be empty
```

---

## §8 · The gate

### Render

```bash
R=/Users/kody/Code/patina-merged/artifacts/portal-polish-review-2026-09-08/tools/render.mjs
S=/Users/kody/Code/patina-merged/artifacts/agreement-room-2026-09-10/specimens
O=/Users/kody/Code/patina-merged/artifacts/agreement-room-2026-09-10/shots/specimens

ST="--state resting=#state-resting --state clause=#state-clause --state money=#state-money"

for f in direction-1 direction-2 direction-3; do
  for m in "" "-dark" "-rm"; do
    case "$m" in ""|"-dark") x="${m:+--dark}";; "-rm") x="--reduced-motion";; esac
    node "$R" "$S/$f.html" --out "$O/$f$m" --widths 1440,1024,390 $ST $x --console
  done
done
```

Exit 0 on every run; `console.json` carries **zero** errors and zero warnings.
Nine plates per run, twenty-seven per file.

### Greps — every one returns nothing

```bash
grep -nE 'box-shadow|drop-shadow|--elevation-sheet' "$f"
grep -nE '<(button|input|a|select|textarea)[^>]*\sdisabled' "$f"
grep -nE 'contenteditable|text-overflow|line-clamp' "$f"
grep -nE 'font-size:\s*(([0-9]|10)(\.[0-9]+)?px|0\.[0-6][0-9]*rem)' "$f"
grep -nE 'opacity:\s*\.?0?\.[0-9]' "$f"          # opacity may not carry a state
grep -nE 'position:\s*(sticky|fixed)|maximum-scale|user-scalable' "$f"
grep -n 'aged-oak\|#8B7355' "$f"                  # and: --oak never on `color`
grep -nE 'https?://' "$f" | grep -v fonts.g
```

Plus `grep -c '<h1' "$f"` = 1, `<html lang="en">` present, and the §7 word greps
empty.

### The a11y acceptance list — all twenty, copied from `panel/memo-critic.md` §5

A specimen passes only on 20/20.

| # | Check | Exact test | Pass condition |
|---|---|---|---|
| 1 | No native `disabled` on any act | `grep -nE '<(button\|input\|a)[^>]*\sdisabled' specimen.html` | 0 matches. Gating acts carry `aria-disabled="true"` instead. |
| 2 | No `opacity: .5` state | `grep -nE 'opacity:\s*\.?0?\.5\|opacity-50' specimen.html` | 0 matches. |
| 3 | No shadow, no truncation, no spinner | `grep -nE 'box-shadow\|text-overflow\|@keyframes spin\|animate-spin' specimen.html` | 0 matches (`--elevation-sheet` unused). |
| 4 | One `h1`, headings in order | DOM: collect `h1..h6` in document order; assert exactly one `h1` and no level skipped forwards | true in every switcher state. |
| 5 | A permanent status line exists | DOM at load, before any interaction: `document.querySelectorAll('[role="status"],[aria-live]')` | ≥1 node present and **not** inside a conditionally rendered block. *(This program's amendment: the node carries the readiness sentence at load rather than empty text — a region present at load and then rewritten announces correctly, and §A10 wants a region that always has something to say.)* |
| 6 | Readiness speaks | Switch state Resting → Money; poll the check-5 node | Its text changes to a full sentence naming what cleared and what remains, within one frame of the state change. |
| 7 | Every `aria-disabled` act is focusable and explained | For each `[aria-disabled="true"]`: assert `tabIndex >= 0` or it is natively focusable without `disabled`; assert `aria-describedby` resolves to a non-empty, visible node | true for all. |
| 8 | Activating a held act does not silently fail | Focus each `[aria-disabled="true"]` act, press Enter | The check-5 node receives the reason text **and** `document.activeElement` moves to the unmet input. |
| 9 | Held terminal contrast | Computed style of `.act--terminal[aria-disabled="true"]`: ratio(color, background-color) | ≥ 4.5:1. (§A5's `--ink-faint` on `--rail` gives 5.32:1; clay@50% gives 1.20:1 and fails.) |
| 10 | No aged-oak used as an ink | `grep -n 'aged-oak\|#8B7355\|--oak' specimen.html` and, for each hit, assert it styles `border-color`/`background`, never `color` | 0 hits on a `color` declaration. Text meta takes `--ink-subtle` or `--clay-ink`. |
| 11 | Every text/ground pair clears AA | Walk every element with visible text; compute ratio(effective color, nearest painted background), accounting for inherited `opacity` | ≥ 4.5:1 for text < 18.66px or non-bold < 24px; ≥ 3:1 otherwise. No exemptions for `aria-disabled` controls. |
| 12 | No pinch-zoom block | `grep -n 'maximum-scale\|user-scalable' specimen.html` | 0 matches. |
| 13 | Reflow at 390 keeps every act | Render at 390×844; assert `scrollWidth <= clientWidth`; collect accessible names of all enabled acts at 1440 and at 390 | The 390 set is not a proper subset of the 1440 set — specifically, an act named `/review\|send/i` is present at 390. |
| 14 | Keyboard reorder works and speaks | Tab to the part head for `Billing cadence`; press the move-up affordance twice | The part moves twice; `document.activeElement` is still that part's own control after each move; the check-5 node names the part and its new position each time. |
| 15 | Reorder needs no pointer and no drag | With `document.body.style.pointerEvents='none'`, repeat check 14 | Passes identically. |
| 16 | No `contenteditable` | `grep -n 'contenteditable' specimen.html` | 0 matches. Every edited field is `<input>`, `<textarea>` or `<select>` with a programmatic label. |
| 17 | No hover-only act | `grep -nE 'group-hover\|:hover' specimen.html`; for each rule changing `opacity`, `visibility` or `display` on an interactive descendant, assert a paired `:focus-within` rule exists | Every hover-revealed act has a focus-revealed twin. |
| 18 | Unfolding does not shift the reading position | Record `getBoundingClientRect().top` of the part **above** the target; switch to the state that opens the target; re-read | Δ = 0px. |
| 19 | Focus is never obscured | Tab through every act at 390 and 1440; after each Tab assert `document.activeElement`'s rect is inside the viewport and not intersected by any `sticky`/`fixed` element | true for all. |
| 20 | Reduced motion and forced colours | (a) `grep -n 'prefers-reduced-motion'` → §A11's block present verbatim. (b) `grep -n 'forced-colors'` → §A11's block present. (c) Render with `forced-colors: active` and switch to the "part selected" state | (a) and (b) present; (c) the selected part is still identifiable without hue — by a rule, a word, or a border. |

Two switcher notes from the same memo: the §A12 strip's buttons take
`aria-pressed`, the page's own disclosures take `aria-expanded`, and no element
takes both. The strip sits outside the mocked page, so checks 11, 13 and 19
scope to the page root, not the document.

### Contrast pairs to compute and paste as a table

Light and dark, sRGB, WCAG 2.2. Text ≥4.5:1, non-text ≥3:1.

1 paper prose `--ink-muted` on `--paper-doc` · 2 paper heading `--ink` on
`--paper-doc` · 3 `.t-money` `--ink` on `--paper-doc` · 4 `.t-head` running heads
`--ink-subtle` on `--paper` and on `--rail` · 5 `.studio-note` body `--ink` on
`--rail` · 6 its leading rule `--clay-ink` on `--rail` *(non-text)* ·
7 `.act--tertiary` label `--ink-subtle` on `--paper` · 8 its rest rule `--oak` on
`--paper` *(non-text)* · 9 `.act--terminal` label `--ink-paper` on `--ink` ·
10 `.act--terminal[aria-disabled]` label `--ink-faint` on `--rail` · 11 focus ring
`--clay-ink` on `--paper`, `--paper-doc` and `--rail` *(non-text)* · 12 field value
`--ink-muted` and baseline rule `--ink-faint` on `--paper-doc` · 13 **III only:**
drawer edge `--ink-faint` on `--paper` and `--rail` *(non-text)* · 14 the outline's
`needs attention` on its own ground · 15 `.consequence` `--ink` on `--paper`.

Any FAIL must be answered by a second channel named in the table — a rule or a
word — exactly as §A14's own table does for the three grounds that cannot clear
3:1 alone.

### Done

Render exit 0, 27 plates per file, `console.json` empty of errors and warnings ·
no horizontal overflow at 390 in any state · every grep here and in §7 empty ·
the shared-block diff prints `SHARED BLOCK IDENTICAL` · 20/20 on the a11y list ·
contrast table all-pass or answered · ≤120 KB per file · every figure traces to
§6 and every string matches §5 exactly.

---

## §9 · The deck frame contract

`deck/index.html` embeds each specimen in one `srcdoc` iframe. CSS isolation is
the point: no style crosses the frame in either direction.

```html
<figure class="spec">
  <div class="spec__controls">
    <div role="group" aria-label="Frame width">
      <button type="button" class="chip" data-w="1440" aria-pressed="true">1440</button>
      <button type="button" class="chip" data-w="1024" aria-pressed="false">1024</button>
      <button type="button" class="chip" data-w="390"  aria-pressed="false">390</button>
    </div>
    <div role="group" aria-label="State">
      <button type="button" class="chip" data-s="resting" aria-pressed="true">Resting</button>
      <button type="button" class="chip" data-s="clause"  aria-pressed="false">Editing a clause</button>
      <button type="button" class="chip" data-s="money"   aria-pressed="false">Editing the money</button>
    </div>
  </div>
  <iframe class="spec-frame" title="Direction I · The galley"
          sandbox="allow-scripts" srcdoc="…the whole specimen, entity-escaped…"></iframe>
  <figcaption class="t-meta">Direction I · the galley · 1440 · resting</figcaption>
</figure>
```

**Width.** The button sets the iframe's own width in px, so the frame's viewport
is that width and the specimen's media queries fire exactly as the render gate
saw them. Fit the frame to the sheet with `transform: scale()` on a wrapper at
`transform-origin: top left` — never by changing the iframe's width. Scaling
preserves the viewport; resizing destroys the test.

**Height, fixed per width.** Scrolling is allowed inside the frame and nowhere
else.

| Frame width | Frame height | Scale at a 1200px sheet column |
|---|---|---|
| 1440 | 900 | 0.833 → 1200 × 750 on the sheet |
| 1024 | 900 | 0.833 → 853 × 750 |
| 390 | 844 | 1.000 → 390 × 844, centred |

```css
.spec-frame { border: 1px solid var(--hairline-strong); background: var(--paper);
              display: block; overflow: auto; }
```

**State.** The button posts `frame.contentWindow.postMessage({state: btn.dataset.s}, '*')`
and mirrors `aria-pressed`; the specimen's own `message` listener (§3) applies
it. The deck never reaches into the frame's DOM, and the specimen's meta strip
stays visible inside the frame so a reader sees the switcher the gate drives.

**Themes.** A specimen inherits the frame's own `prefers-color-scheme`, so both
frames and both themes are checked at publish.
