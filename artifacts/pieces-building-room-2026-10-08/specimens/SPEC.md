# SPEC: the building-a-job's-pieces specimens

This is the build contract for three builders working in parallel without talking to each other. Each builder writes **two files**, one direction at 1440 and at 390, and reads only:
- this file (it is complete; nothing it needs is elsewhere)
- `../synthesis/direction.md` §3 (your direction's idea; this file's frames override it where they are more specific)
- the walk screenshots named in §5, which show today's chrome to replicate on the overview frames

**What these specimens are for.** This is a founder deck. The deck sets a walk screenshot (today) beside your frame (proposed). A founder must be able to point at what moved. Everything outside your direction's list is copied from today.

**Today is Thursday 8 October 2026.** Design canon is waived for this work: the working sheet may use tabs-in-all-but-name, a white stock, full-ink contrast, column heads, key hints and visible stage words. The Document's reading paper (the overview frames) stays as it is today except where your direction names a change.

---

## 1. File targets and rules

| Direction | Files (absolute) | 1440 frames | 390 frames |
|---|---|---|---|
| **A, The Build room** | `/Users/kody/Code/patina-merged/artifacts/pieces-building-room-2026-10-08/specimens/proposed-a-1440.html`<br>`…/specimens/proposed-a-390.html` | `frame-a1` … `frame-a10`, optional `frame-a11` | `frame-a12` … `frame-a15` |
| **B, Lenses on the paper** | `…/specimens/proposed-b-1440.html`<br>`…/specimens/proposed-b-390.html` | `frame-b1` … `frame-b10`, optional `frame-b11` | `frame-b12` … `frame-b15` |
| **C, Room sheets** | `…/specimens/proposed-c-1440.html`<br>`…/specimens/proposed-c-390.html` | `frame-c1` … `frame-c10`, optional `frame-c11` | `frame-c12` … `frame-c15` |

Write only your two files. Do not touch anything else in the repo. Do not commit `_renders/`.

| Rule | Statement |
|---|---|
| Self-contained | One file, one `<style>`, one `<script>`. Vanilla JS. No CDN script, no library, no `fetch` |
| External requests | Only the Google Fonts link in §2.2 and the `fonts.gstatic.com` files it pulls. Nothing else |
| Images | None. No `<img>`, no data-URI raster, no `background-image: url(…)`. Inline SVG only, 1px strokes in `var(--sheet-ink-faint)` or `var(--ink-faint)`. The wood-grain swatch (§4, F1) is six wavy 1px paths in a 120×80 box. Paint swatches (optional frame 11) are a 24×24 `<rect>` whose `fill` is the colour's hex; that is the **only** place a hex literal may appear outside the token block |
| Banned strings | `box-shadow`, `text-overflow`, the `disabled` attribute, the `placeholder` attribute, `opacity:` on any act, and the words `AI`, `curated`, `luxury`, `bespoke`, `elevated`, `disrupt`, `powered by`, `algorithm`, `engine` |
| Structure | `<html lang="en">`, exactly one `<h1>` per file (a visually hidden file title), the Document's own title inside a frame is an `<h2>`, headings in order, every act a `<button>` or `<a>`, every table a `<table>` with `<th scope>` |
| Last line | The file's last line is exactly `<!-- SPECIMEN COMPLETE -->` and nothing follows it |
| Size | Under 400 KB per file |

---

## 2. Visual system

Two stocks. **Beige is reading, white is working.** The Document (overview frames) is today's reading paper. The working surface (every other frame) is the **drafting stock**.

### 2.1 Tokens, pasted byte for byte

Paste this block as the first rule in `<style>`. Do not rename a token. Add no hex literal anywhere else except SVG swatch fills (§1).

```css
:root {
  color-scheme: light dark;

  /* reading stock: the Document, as today */
  --paper:            #FAF7F2;
  --paper-doc:        #FCFAF6;
  --rail:             #E8E3DB;
  --ink:              #2C2926;
  --ink-muted:        #4E4339;
  --ink-subtle:       #5A4E43;
  --ink-faint:        #65594E;
  --ink-paper:        #FAF7F2;
  --hairline:         #E8E3DB;
  --hairline-strong:  rgba(44, 41, 38, .14);
  --oak:              #8B7355;
  --clay:             #C4A57B;   --clay-ink:       #7C5E30;
  --golden:           #E8C547;   --golden-ink:     #79651E;
  --terracotta:       #D4A090;   --terracotta-ink: #9C5340;
  --sage:             #A8B5A0;   --sage-ink:       #5F6B57;

  /* drafting stock: the working sheet */
  --sheet:            #FFFFFF;
  --sheet-head:       #F3F0EA;
  --sheet-ink:        #1A1816;
  --sheet-ink-muted:  #4A4540;
  --sheet-ink-faint:  #6B655E;
  --sheet-rule:       #D9D4CC;
  --sheet-rule-strong:#1A1816;
  --sheet-row-hover:  #F6F3EE;
  --sheet-toast:      #1A1816;
  --sheet-toast-ink:  #FFFFFF;

  /* rhythm */
  --module: 24px;
  --radius-hair: 2px;
  --radius-box:  3px;
  --row: 40px;
  --head: 48px;

  --font-display: 'Playfair Display', Georgia, 'Times New Roman', serif;
  --font-body:    'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-meta:    'DM Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper:            #2A2622;
    --paper-doc:        #26221E;
    --rail:             #3A3530;
    --ink:              #F2EDE6;
    --ink-muted:        #D6CEC4;
    --ink-subtle:       #C7BEB3;
    --ink-faint:        #B8AEA2;
    --ink-paper:        #2A2622;
    --hairline:         rgba(242, 237, 230, .14);
    --hairline-strong:  rgba(242, 237, 230, .22);
    --oak:              #B39572;
    --clay-ink:         #D8B98A;
    --golden-ink:       #E0C963;
    --terracotta-ink:   #E2A895;
    --sage-ink:         #AFC0A6;
    --sheet:            #1C1A17;
    --sheet-head:       #211E1A;
    --sheet-ink:        #F4F0EA;
    --sheet-ink-muted:  #CFC8BF;
    --sheet-ink-faint:  #A9A198;
    --sheet-rule:       #3A3631;
    --sheet-rule-strong:#F4F0EA;
    --sheet-row-hover:  #24211D;
    --sheet-toast:      #F4F0EA;
    --sheet-toast-ink:  #1C1A17;
  }
}
:root[data-theme="dark"] {
  --paper:            #2A2622;
  --paper-doc:        #26221E;
  --rail:             #3A3530;
  --ink:              #F2EDE6;
  --ink-muted:        #D6CEC4;
  --ink-subtle:       #C7BEB3;
  --ink-faint:        #B8AEA2;
  --ink-paper:        #2A2622;
  --hairline:         rgba(242, 237, 230, .14);
  --hairline-strong:  rgba(242, 237, 230, .22);
  --oak:              #B39572;
  --clay-ink:         #D8B98A;
  --golden-ink:       #E0C963;
  --terracotta-ink:   #E2A895;
  --sage-ink:         #AFC0A6;
  --sheet:            #1C1A17;
  --sheet-head:       #211E1A;
  --sheet-ink:        #F4F0EA;
  --sheet-ink-muted:  #CFC8BF;
  --sheet-ink-faint:  #A9A198;
  --sheet-rule:       #3A3631;
  --sheet-rule-strong:#F4F0EA;
  --sheet-row-hover:  #24211D;
  --sheet-toast:      #F4F0EA;
  --sheet-toast-ink:  #1C1A17;
}
```

Contrast, measured: `--sheet-ink` on `--sheet` 17:1 light, 15:1 dark; `--sheet-ink-muted` 9:1 / 10:1; `--sheet-ink-faint` 5.6:1 / 6.9:1. Nothing on the drafting stock is set below `--sheet-ink-faint`. `body` paints `var(--paper)`; every working frame paints `var(--sheet)` on its own root.

### 2.2 Fonts, pasted into `<head>`

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400;1,500&family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### 2.3 Type

| Role | Face | Size / leading | Weight | Colour | Case |
|---|---|---|---|---|---|
| Sheet title in the head (`BUILD THE PIECES`, `LIVING ROOM`) | DM Mono | 12 / 1 | 500 | `--sheet-ink` | caps, tracking .08em |
| Lens words in the head | DM Mono | 13 / 1 | 500 | active `--sheet-ink`, others `--sheet-ink-faint` | caps, tracking .06em |
| Room heading on the sheet | Playfair Display italic | 18 / 1.2 | 400 | `--sheet-ink` | as written |
| Line name in a row | Inter | 14 / 1.4 | 500 | `--sheet-ink` | as written |
| Need label above a product (after a fill) | Inter | 14 / 1.4 | 500 | `--sheet-ink` | as written |
| Product name under a need label | Inter | 13 / 1.4 | 400 | `--sheet-ink-muted` | as written |
| Table cells (qty, unit, money) | Inter | 14 / 1.4, tabular numerals (`font-variant-numeric: tabular-nums`) | 400 | `--sheet-ink` | — |
| Rough figure | Inter | 14 | 400 | `--sheet-ink-faint`, prefixed `~` | — |
| Column heads | DM Mono | 12 / 1 | 500 | `--sheet-ink` | caps, tracking .06em |
| Key hints, meta | DM Mono | 11 / 1.4 | 400 | `--sheet-ink-faint` | caps |
| Drawer heading (the line's name) | Playfair Display | 24 / 1.2 | 400 | `--sheet-ink` | as written |
| Field labels in the drawer | DM Mono | 11 / 1 | 500 | `--sheet-ink-muted` | caps |
| Field values | Inter | 15 / 1.5 | 400 | `--sheet-ink` | as written |
| Sentences (consequence, refusal, hint) | Inter | 14 / 1.5, max 56ch | 400 | `--sheet-ink` | sentence case |
| Reading paper (overview frames) | As the walk screenshots: Playfair for the title and room names, Inter 14 body, DM Mono 11 caps meta, `--ink*` colours | | | | |

### 2.4 Stage stamps (on the sheet and on the paper)

`.stamp`: DM Mono 11px caps, tracking .06em, 4px 8px padding, radius 2px, no fill, 1px border. Word, border and ink:

| Word | Border | Ink | Derived when |
|---|---|---|---|
| `PLACEHOLDER` | 1px **dashed** `--sheet-ink-faint` | `--sheet-ink-faint` | no product, no maker, no rough price |
| `ROUGHED` | 1px dashed `--sheet-ink-muted` | `--sheet-ink-muted` | placeholder with a rough `~` price |
| `SPECCED` | 1px solid `--sheet-rule-strong` | `--sheet-ink` | a product, or a custom line with a maker |
| `READY` | 1px solid `--sheet-rule-strong` | `--sheet-ink` | release eligibility passes (maker, qty, price or allowance ceiling) |
| `RELEASED` | filled `--sheet-ink`, text `--sheet` | — | on an authorization |
| `LABOR` | 1px solid `--sheet-rule` | `--sheet-ink-muted` | a labor line (printed beside the name, not instead of the stage) |

On the reading paper the same words use `--ink`, `--ink-faint` and `--hairline-strong`. `SPECIFIED` never prints anywhere in these specimens.

### 2.5 Acts

- `.act`: DM Mono 12px, w500, caps, tracking .06em, a 1px rule under the word in `--sheet-ink` (on paper: `--oak`), no border, no ground, 44×44 minimum hit area.
- `.act--inked`: the one heavy act on a surface. Same word, a second 1px rule in `--clay`, text `--sheet-ink` where others are `--sheet-ink-muted`.
- `.act--terminal`: `--sheet-ink` ground, `--sheet` text, 3px radius, 12px 20px padding, Inter 500 16px, sentence case. Only for the Release ceremony, with a `.consequence` sentence directly above it.
- Gated: `aria-disabled="true"`, `--sheet-ink-faint` text, the reason printed beside it in a sentence and linked by `aria-describedby`. Never the `disabled` attribute.
- Every act has `:focus-visible { outline: 2px solid var(--clay-ink); outline-offset: 2px }`.
- Row menus (`⋯`) are a `<button aria-haspopup="menu">` and a `<ul role="menu">` that is visible in the frame where the spec says it is open.

### 2.6 Rows, tables, panes

- Table rows are `--row` (40px) tall with a 1px `--sheet-rule` under each. Column heads sit on a 1px `--sheet-rule-strong` rule.
- **The active row** has a 1px `--sheet-rule-strong` outline (`outline-offset: -1px`), no tint. Hover is `--sheet-row-hover`.
- **The empty entry row** is the last row of each room's table: a text caret `|` drawn as a 1px × 18px `<i>` in the Line cell, the row outlined as active, the other cells empty.
- **An indented child row** (labor, a group member) starts with `↳` in `--sheet-ink-faint` and is inset 24px.
- **A group heading row** (the shower) is Inter 14 w500 with no qty, no unit, no money, no stamp, and a 1px `--sheet-rule-strong` rule under it.
- **Placement chips**: Inter 13, 1px `--sheet-rule-strong` border, 2px radius, 4px 10px padding, `Hall · 120 sq ft`; the `+ ROOM` chip is a `.act`.
- **"Also in" line**: DM Mono 11 `--sheet-ink-faint` under the line name: `ALSO IN LIVING ROOM · DINING · KITCHEN`.
- **The undo toast**: `--sheet-toast` ground, `--sheet-toast-ink` text, Inter 14, 12px 16px padding, 3px radius, 560px wide, placed as the last row of the body above the drawer (not fixed). It carries the sentence, a `.act` `UNDO` in `--sheet-toast-ink` and `10 S` in DM Mono 11.
- **The elevation pane** (Direction A Rough in; C's sheet): 360px wide, a 1px `--sheet-rule` box with the DM Mono 11 head `LIVING ROOM · ELEVATION` and, inside, an SVG rectangle 320×200 with the text `ELEVATION NOT ON FILE` and a `.act` `+ FILE`.

### 2.7 Pins and notes

Each changed element carries a `.pin`: 22×22, 1px `--clay-ink` border, 2px radius, DM Mono 11 number in `--clay-ink`, `--paper` ground (on the sheet, `--sheet` ground), `aria-hidden="true"`, placed inline after the element, never covering text. Number per frame from 1.

Under each frame a `.notes` block: a `.t-head` `WHAT CHANGED`, then an `<ol>` where each entry starts with its number in a `.pin`, then one plain sentence, then a `.t-meta` line of finding ids from §5's table. Any value marked `[illustrative]` in §4 is named in the notes, never on the face.

### 2.8 Rhythm and media

Gaps are 12, 24, 48 or 72px. Radius 2 or 3px. Include `@media (prefers-reduced-motion: reduce)` (no transitions) and `@media (forced-colors: active)` giving `.pin`, `.act--terminal`, `.stamp` and the active row a `ButtonText` border, focus in `Highlight`. Light and dark both work through the token block alone; render both.

### 2.9 Geometry

**1440.** Every frame is 1440 × 900, `overflow: hidden`, clipped cleanly by the frame edge. The Document's shell, replicated from the walk screenshots: a 200px spine on the left, a 232px margin rail on the right, and the 60px studio drawer as the frame's last row (not fixed). The drawer's strings, verbatim: `PATINA / DOCUMENT` · `Library` · `People` · `The Scans` · `Ledgers ↑` · `Find anything` · `ON HAND TODAY 2h 13m` · `THE POST` · `LH Leah Hartwell`. The working sheet replaces the spine, paper and margin rail between the top of the frame and the drawer; the drawer stays, because the sheet is inside the Document.

**390.** Every frame is 390 × 844. Frames sit side by side with 48px gaps and wrap; at a 390 viewport the page shows one per row and never scrolls horizontally. The last row of each frame is the 64px dock from `walk/pieces-list-390.jpg`: dark ground, `IN THIS DOCUMENT` / `Client · AT CLIENT APP…` on the left, `⋯ MORE` on the right.

---

## 3. Frame switcher (identical mechanics in all six files)

| Rule | Statement |
|---|---|
| Hash | Tokens separated by `&`. The first token matching `frame-*` picks the frame. `nobar` hides the frame bar. `nopins` hides every `.pin` and `.notes`. Example: `#frame-a4&nobar&nopins` |
| Default | No hash, or an unknown frame: show **all frames stacked** (1440) or side by side (390), each with its caption `<h2 class="t-head">` and notes |
| One frame | A valid `frame-*` shows only that frame via the `hidden` property; hidden frames are not reachable by Tab |
| Load | Read `location.hash` on `DOMContentLoaded` and on `hashchange` |
| postMessage | Accept `{ frame: 'frame-a4' }` or `{ frame: 'a4' }`, normalise by adding `frame-`, ignore anything else, never `eval` |
| Announce | One `<p role="status" aria-live="polite">` names the frame shown |
| Frame bar | `#bar`, `--rail` ground, DM Mono 11, `--ink-muted`: a caption, then one `.act` button per frame with `aria-pressed`. Caption: `Proposed · Direction <A/B/C>, <name> · Thu 8 Oct 2026 · fixture from the local walk · illustrative values marked in the notes`. The bar is the **only** place a caveat may appear |

Copy this script and change only `FRAMES`:

```html
<script>
(function () {
  'use strict';
  var FRAMES = {
    'frame-a1': 'a1, the overview',
    'frame-a2': 'a2, rough in'
    /* … one entry per frame in this file … */
  };
  var has = function (k) { return Object.prototype.hasOwnProperty.call(FRAMES, k); };
  var state = { frame: null, nobar: false, nopins: false };
  function parse(hash) {
    var toks = String(hash || '').replace(/^#/, '').split('&');
    var out = { frame: null, nobar: false, nopins: false };
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i].trim();
      if (!out.frame && t.indexOf('frame-') === 0) out.frame = t;
      if (t === 'nobar') out.nobar = true;
      if (t === 'nopins') out.nopins = true;
    }
    return out;
  }
  function apply() {
    var one = !!state.frame && has(state.frame);
    var secs = document.querySelectorAll('[data-frame]');
    for (var i = 0; i < secs.length; i++) secs[i].hidden = one && secs[i].getAttribute('data-frame') !== state.frame;
    document.getElementById('bar').hidden = state.nobar;
    document.body.classList.toggle('nobar', state.nobar);
    document.body.classList.toggle('nopins', state.nopins);
    var notes = document.querySelectorAll('.notes');
    for (var n = 0; n < notes.length; n++) notes[n].hidden = state.nopins;
    var btns = document.querySelectorAll('[data-go]');
    for (var b = 0; b < btns.length; b++) btns[b].setAttribute('aria-pressed', one && btns[b].getAttribute('data-go') === state.frame ? 'true' : 'false');
    document.getElementById('announce').textContent = one ? 'Showing frame ' + FRAMES[state.frame] : 'Showing all frames';
  }
  function fromHash() { state = parse(location.hash); apply(); }
  document.addEventListener('DOMContentLoaded', fromHash);
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (!d || typeof d !== 'object' || typeof d.frame !== 'string') return;
    var f = d.frame.indexOf('frame-') === 0 ? d.frame : 'frame-' + d.frame;
    if (!has(f)) return;
    state.frame = f; apply();
  });
  document.addEventListener('click', function (e) {
    var go = e.target.closest && e.target.closest('[data-go]');
    if (!go) return;
    var toks = [go.getAttribute('data-go')];
    if (state.nopins) toks.push('nopins');
    var next = '#' + toks.join('&');
    if (location.hash === next) fromHash(); else location.hash = next;
  });
})();
</script>
```

Each frame is a `<section data-frame="frame-a1" aria-labelledby="…">`. `body.nopins .pin { display: none }`.

---

## 4. The fixture: Whole Home Renovation

Leah's real job, as seeded in the local walk and extended for these frames. **Do not invent names, rooms or prices beyond this table.** Anything marked `[illustrative]` is named in the frame's notes.

### 4.1 People and chrome

| Who / what | Facts |
|---|---|
| Studio | Leah Hartwell, owner, `LH`. The first hire is **Maya Reyes**, design assistant, `MR` `[illustrative]`, reused from the procurement deck |
| Client | None linked. The paper reads `THE CLIENT · PROJECT` and the spine reads `the client` |
| Project | **Whole Home Renovation**, Project stage, active. 7 rooms in this order: **Hall, Living Room, Dining, Kitchen, Primary Bath, Sunroom, Bedroom** |
| Time | `ON HAND TODAY` reads `2h 13m` on frame 1, `2h 21m` on frames 2–9, `2h 27m` on frame 10. It never resets and no Log / Discard strip appears |
| Today's chrome (overview frames) | From `walk/step2-living-room-after-4-lines-1440.jpg`: spine `← PUT DOWN`, `the client`, the strata mark, `PROJECT ACTIVE`, then `Client approvals NOTHING YET`, `Schedule NOT KNOWN YET`, `Pieces` (count per frame), `Hall`, `Living Room`, `+5 MORE`, `Money NOTHING YET`, `Closing the book NOTHING YET`, `The record NOTHING YET`, `FILED WITH THIS JOB`: `Plan room`, `Spec book`, `Boards`, `Call sheet`. Margin rail: `– One client, one paper. The rail on the left says…`, `MORE`, `APPEARS ONCE · RECEDES ON USE`, `IN THE MARGIN  + NOTE`, `The margin — decisions, messages, and money gather here`. Region head today: `Pieces` / `the FF&E schedule, by room · 7 groups · 4 lines` / `4 unspecified · 4 uninvoiced`; acts `SPEC THE 4 UNSPECIFIED →` (inked), `ADD A LINE`, `BILL 4 UNINVOICED LINES →`, `FOLD ↑`. Room heading today: strata mark, `Living Room` italic, `0 OF 4 UNDERWAY`, `ADD A LINE`, `ADD A CONCEPT RENDER`. Line row today: an image box, `Custom cabinet · ×2`, `SPECIFIED`, `$0` |
| Money form | `$9,545`, `$11.50 / sq ft`, `~$4,800` for a rough figure, `$38 each`. Dates: `Thu 8 Oct` |

### 4.2 Lines

26 rows. Stage and money columns show the **worked state** (after frames 2–9). Frames that show an earlier moment say so. Qty is a whole number; `unit` is one of `each · sq ft · roll · lot`.

| Id | Room (primary) | Line (need label) | Qty | Unit | Stage | Rough `~` or price | Product / maker / spec |
|---|---|---|---|---|---|---|---|
| H1 | Hall | Console table | 1 | each | PLACEHOLDER | ~$1,200 | — |
| H2 | Hall | Runner, 2′6″ × 10′ | 1 | each | PLACEHOLDER | ~$680 | — |
| L1 | Living Room | Custom cabinet | 2 | each | SPECCED (PLACEHOLDER before frame 4) | ~$4,800 each at rough-in; trade cost $3,900 each, markup 23%, client price $4,800 each after frame 7 | Maker **Hollis Millwork** `[illustrative]`; Finish `Painted`; Material `Paint grade`; Color `Farrow & Ball Railings No. 31` `[illustrative]`; Dimensions empty; Exact location `See drawings`; Notes `Fluted doors, see elevation 3` `[illustrative]`; no image |
| L2 | Living Room | Countertop for custom cabinets | 2 | each | PLACEHOLDER | ~$1,400 each | — |
| L3 | Living Room | Hardware, 2 knobs for custom cabinet | 2 | each | SPECCED (PLACEHOLDER before frame 6) | $38 each | Product **Emtek Ribbon & Reed knob, satin brass** `[illustrative]` |
| L4 | Living Room | Hardware, 4 pulls for custom cabinet | 4 | each | PLACEHOLDER | ~$52 each | — |
| L5 | Living Room | Sofa, 96 in | 1 | each | PLACEHOLDER | ~$7,200 | — |
| F1 | Living Room (primary); placed in Hall 120 · Living Room 320 · Dining 180 · Kitchen 210 sq ft | White oak floor, satin Bona finish | 830 | sq ft | SPECCED | $11.50 / sq ft · $9,545 | Custom, local supplier **Nord Hardwood Co.** `[illustrative]`; Finish `Satin Bona`; Plank width `TBD`; image on file (the wood-grain SVG swatch) |
| D1 | Dining | Dining table, custom walnut | 1 | each | SPECCED | trade $5,400 · client $6,800 | Maker **Woodward & Sons** |
| D2 | Dining | Dining chairs | 8 | each | PLACEHOLDER | ~$900 each | — |
| D3 | **Dining before frame 9, Kitchen after** | Counter stools | 3 | each | PLACEHOLDER | ~$420 each | entered in the wrong room; moved in frame 9 |
| K1 | Kitchen | Pendant lights, island | 3 | each | PLACEHOLDER | ~$640 each | — |
| K2 | Kitchen | Faucet, bridge, unlacquered brass | 1 | each | PLACEHOLDER | ~$1,150 | — |
| G1 | Primary Bath | **Shower** (a group heading: no qty, no money, no stamp) | — | — | — | — | contains B1–B6 |
| B1 | Primary Bath · in G1 | Valve and trim | 1 | each | PLACEHOLDER | ~$650 | — |
| B2 | Primary Bath · in G1 | Shower head | 1 | each | PLACEHOLDER | ~$320 | — |
| B3 | Primary Bath · in G1 | Hand shower | 1 | each | PLACEHOLDER | ~$280 | — |
| B4 | Primary Bath · in G1 | Linear drain | 1 | each | PLACEHOLDER | ~$240 | — |
| B5 | Primary Bath · in G1 | Niche tile | 1 | lot | PLACEHOLDER | ~$160 | — |
| B6 | Primary Bath · in G1 | Glass panel | 1 | each | PLACEHOLDER | ~$1,800 | — |
| B7 | Primary Bath | Vanity, 60 in, double | 1 | each | PLACEHOLDER | ~$3,200 | — |
| T1 | Primary Bath (primary); placed in Primary Bath 72 · Sunroom 148 · Hall 36 (`back entry`) · Kitchen 24 (`pantry`) sq ft | Porcelain floor tile, 12 × 24, matte | 280 | sq ft | SPECCED | $6.80 / sq ft · $1,904 | Store buy, **The Tile Shop** `[illustrative]` |
| S1 | Sunroom | Rattan lounge chair | 2 | each | PLACEHOLDER | ~$1,100 each | **the stray line**, removed in frame 8 (stand-in for the walk's seed line) |
| R1 | Bedroom | Wallpaper, grasscloth | 9 | roll | SPECCED | trade $184 / roll · markup 25% · client $230 / roll · $2,070 | Product **Phillip Jeffries Manila Hemp, Chalk** `[illustrative]` |
| R1a | Bedroom · under R1 | ↳ Install, wallpaper hanger | 9 | roll | LABOR | $85 / roll · $765, no markup `[illustrative]` | a labor line attached to R1 |
| R2 | Bedroom | Bed, king, upholstered | 1 | each | PLACEHOLDER | ~$4,200 | — |
| R3 | Bedroom | Nightstands | 2 | each | PLACEHOLDER | ~$950 each | — |

### 4.3 Placement shares (a placed line prints its room's share in that room)

| Line | Hall | Living Room | Dining | Kitchen | Primary Bath | Sunroom | Total |
|---|---|---|---|---|---|---|---|
| F1 oak floor, $11.50 / sq ft | 120 sq ft · $1,380 | 320 · $3,680 | 180 · $2,070 | 210 · $2,415 | — | — | 830 sq ft · $9,545 |
| T1 tile, $6.80 / sq ft | 36 (back entry) · $245 | — | — | 24 (pantry) · $163 | 72 · $490 | 148 · $1,006 | 280 sq ft · $1,904 |

### 4.4 Room rows for the overview (counts include placed lines; the labor line counts as a line)

| Room | Before (frame 1) | Worked (frame 10) |
|---|---|---|
| Hall | `4 lines · 2 placeholders · ~$3,505` | same |
| Living Room | `6 lines · 5 placeholders · ~$23,564` | `6 lines · 3 placeholders · ~$23,564` |
| Dining | `4 lines · 2 placeholders · ~$17,330` | `3 lines · 1 placeholder · ~$16,070` |
| Kitchen | `4 lines · 2 placeholders · ~$5,648` | `5 lines · 3 placeholders · ~$6,908` |
| Primary Bath | `8 lines · 7 placeholders · ~$7,140` | same |
| Sunroom | `2 lines · 1 placeholder · ~$3,206` | `1 line · 0 placeholders · ~$1,006` |
| Bedroom | `4 lines · 2 placeholders · ~$8,935` | same |
| **Job** | `26 lines · 21 placeholders · 4 specced · ~$69,328 · nothing released` | `25 lines · 18 placeholders · 6 specced · $30,760 priced · ~$36,368 roughed · nothing released` |

Priced = client prices of specced lines (L1 $9,600 + L3 $76 + F1 $9,545 + D1 $6,800 + T1 $1,904 + R1 $2,070 + R1a $765 = $30,760). Roughed = the `~` figures of the rest. Per-room Price-lens subtotals: Bedroom `$2,835 priced · ~$6,100 roughed`; Living Room `$13,356 priced · ~$10,208 roughed`.

### 4.5 Voice (from `BRIEF.md`)

- Plain words a designer uses: line, piece, room, spec, placeholder, allowance, labor, rough price.
- Never "AI", "algorithm", "engine", "powered by". Patina's intelligence is designer-taught, and it does not come up in these frames.
- No Pledge, not the tagline. Not "curated", "luxury", "bespoke", "elevated", "disrupt".
- Verb first on every act. No exclamation marks. Sentence case for sentences, caps for acts and meta.
- The lens words are **Rough in · Spec · Price · Release**. The stage words are §2.4's. "FF&E schedule" and "selections" never print.

---

## 5. The ten states, and the finding ids to cite

Every direction renders the same ten states (eleven with the optional paint schedule) in the same order, so the deck can set A, B and C side by side. State 1 and 10 are on the reading paper; 2–9 are on the working surface.

| # | State | Must show | Fixture | Cite |
|---|---|---|---|---|
| 1 | **The overview and the door in** | The Document's Pieces region as an overview of rooms; the one act that opens building; the quick `ADD A LINE` kept per room; tasks, folio preamble, concept renders and Bill gone | §4.4 before | R1-F13, R1-F14, R1-F4, R2-F4, R2-F9, R3-11 |
| 2 | **Rough-in rapid entry** | Living Room, the moment after the four lines L1–L4 were typed; the empty next row with the cursor; no sheet; Enter adds; the key hint | L1–L4 with their rough figures (L3, L4 blank) | R1-F11, R2-F6, R3-7, R3-2 |
| 3 | **Where am I, what can I do** | The standing head, the lens or place named, and a one-line reading of what this surface does and does not do; the Release view | all rooms, worked | R1-F2, R1-F6, R1-F15, R2-F1, R2-F10, R2-F12, R3-8 |
| 4 | **Spec pass** | L1's fields filled on the same surface; the room editable there; the stage flips to SPECCED on naming a maker; no money; `NEXT UNFINISHED →`; the clock still counting | L1 | R1-F8, R1-F9, R1-F10, R2-F5, R3-6, R3-10 |
| 5 | **Multi-room placement** | F1 as one row with four placement chips carrying square feet; the row printed in each room with `ALSO IN …`; T1's `back entry` and `pantry` notes | F1, T1 | R1-F16, R1-F18, R2-F2, R2-F13, R3 S2 |
| 6 | **Placeholder → product** | L3 at the moment of the fill: inline search, the chosen product, and the need label kept above the product name | L3 | R1-F19, R1-F20, R2-F7, R3-9 |
| 7 | **Labor attached** | Bedroom in the Price view: R1 with R1a indented under it, unit `roll`, the room subtotal, the job total as front matter | R1, R1a, R2, R3 | R1-F26, R1-F27, R1-F28, R2-F2, R3 S4 |
| 8 | **Delete with undo** | Sunroom after S1 is removed: the toast with `UNDO`, `Removed · 1` somewhere standing, and the refusal sentence a released line would print | S1, T1 share | R1-F29, R1-F7, R2-F2, R3-3 |
| 9 | **Drag between rooms** | D3 mid-drag from Dining onto Kitchen; the drop target marked; a row menu open elsewhere showing `Move to room…` | D3 | R1-F17, R2-F13, R3 S6 |
| 10 | **Back on the overview** | The Document scrolled to the Living Room row with the worked counts; the hold continuous; no Log / Discard | §4.4 worked | R1-F9, R1-F10, R2-F5, R3-10, R3-11 |
| 11 | **Paint and finish schedule** (optional) | A per-room Finishes table and the act that prints it for the painter | Bedroom: Walls `Farrow & Ball Setting Plaster No. 231`, eggshell, `#F2DCD2`; Ceiling `Benjamin Moore Chantilly Lace OC-65`, flat, `#F7F6F1`; Trim and doors `Chantilly Lace OC-65`, satin; all `[illustrative]` | R2 §6, R3 S8 |

390 frames: 12 = state 1, 13 = state 2, 14 = state 4, 15 = state 8 with the way back visible.

---

## 6. Direction A: The Build room

A working sheet at `/doc/[id]/pieces`. **Changes, and only these:** the Pieces region becomes an overview of rooms with one door in; the sheet with its head, room rail, four lenses, keyboard table, fields pane, placement chips, labor, undo and drag; the hold on the layout. The Document's letterhead, band, other regions, spine, margin and drawer are as today.

### The sheet's shell (frames a2–a9, a11)

- Top: the **head**, `--head` tall, `--sheet-head` ground, a 1px `--sheet-rule-strong` rule under it. Left: `.act` `← WHOLE HOME RENOVATION`. Then `BUILD THE PIECES`. Centre: the four lens words `ROUGH IN · SPEC · PRICE · RELEASE`, each a `<button aria-pressed>`, 44px tall, the active one in `--sheet-ink` with a 2px `--sheet-ink` rule under it, the others `--sheet-ink-faint`. Right: `Living Room · 6 lines · 4 placeholders` (the active room's counts) in DM Mono 12.
- Under the head, a one-line reading in Inter 14 `--sheet-ink-muted`, 24px gutter: per lens, `Rough in · Name it, count it, place it. Specs, prices and buying come later.` / `Spec · Fill each line's details and its product. No money here.` / `Price · Line up trade cost, markup and client price. Rough figures stay as ~ until you set them.` / `Release · Check what the client will see, then release rooms for authorization. Nothing here edits a spec or a price.`
- Left: the **room rail**, 200px, `--sheet` ground, a 1px `--sheet-rule` on its right. `ROOMS` head, then one row per room (Inter 14) with its line count in DM Mono 11: `Hall 4`, `Living Room 6`, … The active room is `--sheet-ink` with a 3px `--sheet-ink` left bar; others `--sheet-ink-muted`. Under the rooms: `Not in a room yet 0`, `Removed 1` (0 before frame 8). Foot: `.act` `+ ROOM`.
- Body: 24px gutters, `--sheet` ground, scrolls; what each lens puts there is below.
- Bottom: the Document's 60px drawer as today (§2.9), with `ON HAND TODAY` per §4.1.

### `a1`: the overview (1440)

Today: `walk/step2-living-room-after-4-lines-1440.jpg`. Copy the spine, letterhead strip (`THE CLIENT · PROJECT`, `21 placeholders  +4 MORE` replaces `4 unspecified`), margin rail and drawer. Change the Pieces region only:
- Head: `Pieces` / `by room · 7 rooms · 26 lines` / `21 placeholders · 4 specced · nothing released`. Acts: `WORK THE PIECES →` (`.act--inked`), `ADD TO THE JOB`, `RELEASE FOR AUTHORIZATION` (gated, reason `Nothing is ready to release yet.`), `FOLD ↑`. **Gone:** `SPEC THE 4 UNSPECIFIED →`, `BILL 4 UNINVOICED LINES →`. Pin the acts.
- Front matter under the head, Inter 16 `--ink`: `~$69,328 roughed · nothing released`. Pin it.
- **Gone:** `Plan the project work`, `ADD THE FIRST TASK`, `FOLIO + FILE`, `READ BY · ROOM · MAKER · NEXT ACT`. Pin the space, note R2-F9.
- **Room rows** replace the room headings and line lists: one row per room, 56px, hairline under: strata mark · `Living Room` (Playfair italic 16) · `6 lines · 5 placeholders` (DM Mono 11 `--ink-faint`) · `~$23,564` (Inter 14 tabular) · acts `ADD A LINE` and `WORK THIS ROOM →`. Seven rows, §4.4 before. Pin one row; the note says a room row unfolds to its lines, and a released line unfolds to the buyer's instrument as today (Q14).
- Spine: `Pieces 26 LINES`.

### `a2`: rough in, Living Room (1440)

The sheet; lens **Rough in**; rail active Living Room (`Living Room 4` at this moment; Hall 2, others per §4.2 minus L5/F1). Head right: `Living Room · 4 lines · 4 placeholders`. Body shows the rooms stacked as tables; the frame is scrolled so Hall's table (H1, H2, then its empty row) sits at the top with 24px of it visible and Living Room's table fills the rest:
- Room heading row: `Living Room` (Playfair italic 18) · right `.act` `ELEVATION` (toggles the pane, pressed) · `⋯`.
- Columns: `LINE · QTY · UNIT · ROUGH $ · STAGE · ` (last head empty, for the row menu). Widths 480 · 72 · 96 · 120 · 140 · 48.
- Rows: `Custom cabinet | 2 | each | ~$4,800 | PLACEHOLDER`, `Countertop for custom cabinets | 2 | each | ~$1,400 | PLACEHOLDER`, `Hardware, 2 knobs for custom cabinet | 2 | each | (empty) | PLACEHOLDER`, `Hardware, 4 pulls for custom cabinet | 4 | each | (empty) | PLACEHOLDER`. The third row's `⋯` is hovered and its menu is **open**: `Fill with a product`, `Move to room…`, `Also place in…`, `Remove`.
- The **empty entry row** with the caret, active outline.
- Under the table, the key hint (DM Mono 11 `--sheet-ink-faint`): `ENTER ADDS THE LINE · TAB MOVES ACROSS · ⌘↓ NEXT ROOM · PASTE A LIST TO ADD SEVERAL · / SEARCHES THE LIBRARY`.
- Right: the elevation pane (§2.6), 360px.
- Pins: the empty row (no sheet, Enter adds: R1-F11, R2-F6, R3-7); the key hint; the menu (fill, move, remove on the line itself: R3-6, R3-3); the `ROUGH $` column (an allowance, printed ~: R1-F23, Q7); the absence (no buying cells, no Bill, no roads: R1-F6, R2-F3); the pane (R2 §5).

### `a3`: where am I — the Release lens (1440)

Lens **Release**; the one-line reading under the head. Rail active: none (the whole job); head right `Whole job · 25 lines · 6 ready`. Body: a table across rooms, grouped by room heading rows, columns `LINE · ROOM · STAGE · READINESS · FOR THE CLIENT · `. Visible rows (worked state): Hall H1 `PLACEHOLDER | Needs a product or a maker | —`, H2 same; Living Room L1 `READY | Ready | Selected`, L2 `PLACEHOLDER | Needs a product or a maker`, L3 `READY | Ready | Selected`, L4, L5 placeholders, F1 `READY | Ready | Selected`; Dining D1 `READY | Ready | Selected` … clip at the frame edge. `FOR THE CLIENT` is a select-looking `.act` per ready line (`Selected ▾`); placeholders print `—`.
- Each room heading row carries `.act` `READY FOR LEAH` (pin: the first hire's hand-back; writes disposition, sends nothing; R2 §5, Q13).
- Foot of the body, right-aligned: `.consequence` `Releasing sends 6 lines to the client for authorization. Their prices lock when the client signs.` above `.act--terminal` `Release 6 lines for authorization`. Pin: the ceremony lives in the room, filled only here.
- Pin the head's lens words (R2-F10, Q1), the reading sentence (R2 §4), the readiness column (R3 §5 "plain next-work queues"; the Order cell's sentence moved to the right stage: R2 §2).

### `a4`: spec pass, Custom cabinet (1440)

Lens **Spec**; rail Living Room. Body is two panes:
- Left, 520px: the room's lines as rows: name · stage · `3 OF 6` (fields filled). L1 is the active row (`SPECCED · 5 OF 6`), L2 `PLACEHOLDER · 0 OF 6`, L3 `SPECCED · 1 OF 6`, L4, L5 `0 OF 6`, F1 `SPECCED · 4 OF 6`. Foot: `.act--inked` `NEXT UNFINISHED →`.
- Right, the rest: `WHAT WE NEED` label, then `Custom cabinet · ×2` (Playfair 24), stamp `SPECCED`. Then fields in a two-column grid, label above value:
  - `MAKER` `Hollis Millwork` · `PRODUCT` `.act` `FILL WITH A PRODUCT` and `.act` `BRING IN…`
  - `IMAGE` a 200×140 box, 1px dashed `--sheet-ink-faint`, `DROP AN IMAGE OR PASTE A LINK`
  - `FINISH` `Painted` · `MATERIAL` `Paint grade` · `COLOR` `Farrow & Ball Railings No. 31` · `DIMENSIONS` (empty cell, shown as a 1px `--sheet-rule` underline with nothing in it) · `EXACT LOCATION` `See drawings` · `NOTES` `Fluted doors, see elevation 3`
  - `ROOMS` chips `Living Room · ×2`, `+ ROOM` · `UNIT` `each` · `LABOR` `.act` `ADD LABOR` · `COM` `This piece takes COM` with an unchecked box
  - bottom right, dim: `~$4,800 each · set the price in Price`
- Drawer: `ON HAND TODAY 2h 21m`. Pin it: the hold never dropped (R1-F9, D14).
- Pins: fields on the same surface (R1-F8, R3-6); the room editable here (R2-F5, fix-now 8); the stamp flipped on naming a maker (R1-F1, D1); no money (R2 Q7); `NEXT UNFINISHED` (R3 §6); the image box (R1-F25).

### `a5`: one piece, four rooms (1440)

Lens **Spec**; rail active **Hall**. Left pane rows: H1 `PLACEHOLDER`, H2 `PLACEHOLDER`, F1 `SPECCED` with the also-in line `ALSO IN LIVING ROOM · DINING · KITCHEN · 120 SQ FT HERE`, T1 `SPECCED` with `ALSO IN PRIMARY BATH · SUNROOM · KITCHEN · 36 SQ FT HERE · BACK ENTRY`. F1 is active.
- Right pane: `WHAT WE NEED` / `White oak floor, satin Bona finish` / `SPECCED`. `MAKER` `Nord Hardwood Co. · local`. `IMAGE` the wood-grain SVG swatch, 120×80. `FINISH` `Satin Bona` · `PLANK WIDTH` `TBD` · `UNIT` `sq ft` · `ROOMS` chips `Hall · 120 sq ft`, `Living Room · 320 sq ft`, `Dining · 180 sq ft`, `Kitchen · 210 sq ft`, `+ ROOM`; under the chips Inter 14: `830 sq ft × $11.50 / sq ft = $9,545`. `LABOR` `ADD LABOR`.
- Pins: one row, four placements (R1-F16, D7, Q4); square feet per room (R3 S2); the also-in line in each room (R1 §3); the unit (R1-F26, D3); `back entry` on T1 (area note).

### `a6`: placeholder → product (1440)

Lens **Spec**; rail Living Room; L3 active. Right pane, the fill moment:
- `WHAT WE NEED` / `Hardware, 2 knobs for custom cabinet · ×2` / stamp `PLACEHOLDER` (not yet flipped).
- `PRODUCT`: an inline search field with the typed value `knob` (a real `<input value="knob">`), under it three result rows: `Emtek Ribbon & Reed knob · satin brass · $38 each` (selected, 2px `--sheet-ink` left rule), `Rejuvenation Mission knob · aged brass · $24 each` `[illustrative]`, `Search the Library for "knob" →` as a `.act`.
- Under the results, a preview box (1px `--sheet-rule-strong`): `Hardware, 2 knobs for custom cabinet` (need label, Inter 14 w500) / `Emtek Ribbon & Reed knob, satin brass · ×2 · $38 each` (Inter 13 muted) / sentence `The need stays on the line. The PO carries the product.` / `.act--inked` `FILL THIS LINE`.
- Pins: fill from the line, not from eleven roads (R1 §4, R3-6); the need label survives (R1-F19, R1-F20, D2, R2-F7, R3-9); the stamp flips on fill (D1).

### `a7`: labor attached, the Price lens (1440)

Lens **Price**; rail Bedroom. Front matter under the reading line, Inter 16: `Job · $30,760 priced · ~$36,368 roughed`. Body: Bedroom's table, columns `LINE · QTY · UNIT · TRADE COST · MARKUP · CLIENT PRICE · ROUGH ~ · ` (widths 400 · 64 · 80 · 120 · 80 · 130 · 110 · 48):
- `Wallpaper, grasscloth` / `Phillip Jeffries Manila Hemp, Chalk` (product line) | 9 | roll | $184 | 25% | $230 | —
- `↳ Install, wallpaper hanger` `LABOR` | 9 | roll | $85 | — | $85 | — (indented)
- `Bed, king, upholstered` `PLACEHOLDER` | 1 | each | — | — | — | ~$4,200
- `Nightstands` `PLACEHOLDER` | 2 | each | — | — | — | ~$950
- Subtotal row, 1px `--sheet-rule-strong` above: `Bedroom · $2,835 priced · ~$6,100 roughed`.
- The wallpaper row's `⋯` menu is open: `Add labor`, `Make it an allowance`, `Move to room…`, `Remove`.
- Pins: a labor line under its piece (R1-F27, D4, D5, Q5); unit `roll` (D3); released with its piece, never on the maker's PO (R1 §5); trade cost and client price typed here (R1-F26, 00692 allow-list); the `~` column (D12).

### `a8`: delete with undo (1440)

Lens **Rough in**; rail Sunroom (`Sunroom 1`, `Removed 1`). Body: Sunroom's table with one row, T1 `Porcelain floor tile, 12 × 24, matte` with `ALSO IN PRIMARY BATH · HALL · KITCHEN · 148 SQ FT HERE`, then the empty entry row. The toast (§2.6) as the body's last row: `Removed Rattan lounge chair ×2 from Sunroom.` `UNDO` `10 S`.
- Under the table, a second, dim example for the notes: a row `Dining table, custom walnut · RELEASED` from Dining shown with its menu open where `Remove` is gated and prints `Released lines change through Record a change.` Mark it `[illustrative: D1 is not released in this fixture]` in the notes.
- Pins: remove with undo before release (R1-F29, R1 §6, D8); `Removed · 1` restorable for the life of the job; the refusal names the door (R3-3, R1-F7: "Something's wrong…" is for damage, hidden until ordered).

### `a9`: drag between rooms (1440)

Lens **Rough in**; rail Dining. Body scrolled so Dining's table (D1, D2, D3, entry row) and Kitchen's heading plus table (K1, K2, entry row) are both visible. D3 `Counter stools | 3 | each | ~$420 | PLACEHOLDER` is lifted: 1px `--sheet-rule-strong` outline, translated 8px right, a drag handle `⋮⋮` in `--sheet-ink-faint` at the row's left on every row. The Kitchen heading row is the drop target: a 2px `--sheet-ink` rule above it and the text `MOVE TO KITCHEN` in DM Mono 11 at its right. K2's `⋯` menu is open with `Move to room…` expanded to the room list, `Kitchen` marked `· HERE`.
- Pins: drag reopens I25 (R1-F17, Q8); `Move to room…` for keyboard, touch and locked lines (R3 §5); the data path already exists (`triage_project_ffe_items`).

### `a10`: back on the overview (1440)

As `a1` with the worked counts (§4.4 worked), scrolled so the Pieces head sits at the top of the paper and the **Living Room row is first under it with a 3px `--ink` left bar** (you came from here). Front matter: `$30,760 priced · ~$36,368 roughed · nothing released`. Letterhead strip: `18 placeholders  +4 MORE`. Spine `Pieces 25 LINES`. Drawer `ON HAND TODAY 2h 27m`.
- Pins: `←`, Esc and back land here, at the room (R1-F10, R2 §3 "getting back"); counts updated; the hold continuous, no Log / Discard (R1-F9, R3-10).

### `a11` (optional): paint and finish schedule (1440)

A fifth lens word `FINISHES` after `RELEASE`, active. Rail Bedroom. Body: `Bedroom · Finishes`, table `SURFACE · PRODUCT · SHEEN · SWATCH` with the §5 rows; a 24×24 swatch rect per row. Under it `.act` `PRINT THE PAINT AND FINISH SCHEDULE` and the sentence `One page per room, addressed to the painter. Nothing else prints on it.` Pin: R2 §6, Q10.

### `a12`: the overview on the phone (390)

Today: `walk/pieces-list-390.jpg` (the title, `SET DATES`, `MESSAGE THE CLIENT`, `LINK A CLIENT`, `Link a client first.`, `PREVIEW · SHARING · CALL SHEET`, the `21 placeholders +4 MORE` strip, `Client approvals`). Then the Pieces region as in `a1`, stacked: head, `WORK THE PIECES →`, front matter, the seven room rows each with `WORK THIS ROOM →` (the `ADD A LINE` act under it). Dock as today. Pin the door.

### `a13`: rough in on the phone (390)

The sheet at 390: head row 1 `← WHOLE HOME` · `Living Room ▾` (a room picker button); row 2 the four lens words as a full-width segmented row, each ≥44px tall, Rough in active. Then the reading line. Then Living Room's lines as 56px cards: name on the first line, `×2 · each · ~$4,800 · PLACEHOLDER` on the second. The entry row is the last row before the dock: a full-width input with the caret and, to its right, `.act` `ADD`; above it a `.act` `DONE ADDING`. No elevation pane. Pin the entry row (R3-7: a visible act, not only Enter).

### `a14`: spec pass on the phone (390)

Head as `a13` with Spec active. The fields pane full width: `WHAT WE NEED` / `Custom cabinet · ×2` / `SPECCED`, then the fields stacked in `a4`'s order, `ROOMS` chips wrapping, `NEXT UNFINISHED →` inked at the foot above the dock. Pin: one surface, the room editable here.

### `a15`: delete with undo, and the way back (390)

Head with Sunroom chosen, Rough in. T1's card. The toast as the last row above the dock: `Removed Rattan lounge chair ×2.` `UNDO` `10 S`. The head's `← WHOLE HOME` carries a pin whose note says it lands on the overview at the Sunroom row.

---

## 7. Direction B: Lenses on the paper

No new route. **Changes, and only these:** the Pieces region's `READ BY · ROOM · MAKER · NEXT ACT` control becomes a lens strip `OVERVIEW · ROUGH IN · SPEC · PRICE · RELEASE`; the region's body re-renders by lens; the head gets contrast; the line's drawer unfolds in place with the fields until release; the hold on a layout. Beige stays. Everything else on the paper is today's.

### The region's shell (every frame)

- Today's paper: spine, letterhead strip, margin rail, drawer, the other regions above and below Pieces (`Schedule` folded above, `Money` folded below, as in `walk/project-1440-full.jpg`), all as the screenshots.
- The Pieces head: `Pieces` / `by room · 7 rooms · 26 lines` / counts. Acts `ADD TO THE JOB`, `RELEASE FOR AUTHORIZATION` (gated until the Release lens), `FOLD ↑`. **Gone:** `SPEC THE 4 UNSPECIFIED →`, `BILL …`, the tasks, the folio preamble, concept renders.
- Under the head, the **lens strip**: full region width, `--paper-doc` ground, a 3px `--ink` left bar, 44px tall; the five words in DM Mono 13 caps, the active one in `--ink` with a 2px `--ink` rule under it, the others `--ink-faint`. To its right the reading line in Inter 13 `--ink-muted` (the same sentences as A's).
- Acts on the paper use today's Scored Ink (`--oak` rule). Stage stamps use §2.4 in paper colours. The region's working rows use `--row` height and `--ink` column heads at DM Mono 12 (the one contrast change on the paper; pin it).

### `b1`: the overview lens (1440)

Lens `OVERVIEW`. Body: the front matter `~$69,328 roughed · nothing released` and the seven room rows as in A's `a1` (each with `ADD A LINE` and `.act` `ROUGH IN →` which sets the lens and scrolls to the room). Pins as `a1`, plus the strip (R2-F10, Q1 applied to the reading paper).

### `b2`: rough in, Living Room (1440)

Lens `ROUGH IN`. Body: rooms stacked as tables inside the 900px paper column (`LINE · QTY · UNIT · ROUGH $ · STAGE · ` at 420 · 64 · 80 · 110 · 130 · 40), Hall then Living Room, the same rows and open menu as `a2`, the empty entry row, the key hint. The room heading keeps today's strata mark and italic name; `ADD A LINE` under it is **gone** (the entry row replaces it); `ADD A CONCEPT RENDER` is gone. The elevation is a `.act` `ELEVATION` on the heading that would unfold a 240px-tall pane under it (closed in this frame). Pins as `a2`, plus one on the paper column noting the width (R2 §3, the lens-only case).

### `b3`: where am I — the Release lens (1440)

Lens `RELEASE`. Body as `a3` inside the column (`LINE · STAGE · READINESS · FOR THE CLIENT`), room headings with `READY FOR LEAH`, the consequence sentence and `Release 6 lines for authorization` at the foot of the region. The region head's `RELEASE FOR AUTHORIZATION` is now live and points at the same act. Pins as `a3`; add one on the letterhead band above, noting that the band and five other regions still compete with the strip for "where am I" (R2-F9, R2-F12).

### `b4`: spec pass, unfolded in place (1440)

Lens `SPEC`. Living Room's rows (name · stage · `N OF 6`); L1 unfolds **in place** under its row on `--paper-doc` with a 3px `--clay` left rule (today's unfold ground), carrying A's `a4` fields in the same order in a two-column grid, and the foot acts `NEXT UNFINISHED →` (inked) and `FOLD`. **No** buying cells, Submittals, Samples or Bill in this unfold. Pin: the builder's drawer and the buyer's unfold are the same seam; release decides which opens (Q14). Drawer `ON HAND TODAY 2h 21m`, pinned.

### `b5`: one piece, four rooms (1440)

Lens `SPEC`, Hall. H1, H2, F1 (`ALSO IN …`), T1 (`ALSO IN … · BACK ENTRY`). F1 unfolded in place with `a5`'s fields and chips. Pins as `a5`.

### `b6`: placeholder → product (1440)

Lens `SPEC`, Living Room. L3 unfolded with `a6`'s search, results and preview. Pins as `a6`.

### `b7`: labor, the Price lens (1440)

Lens `PRICE`. Front matter `Job · $30,760 priced · ~$36,368 roughed`. Bedroom's table at the column's width (`LINE · QTY · UNIT · TRADE · MARKUP · CLIENT · ROUGH ~` at 300 · 56 · 64 · 100 · 70 · 110 · 100; the line names wrap to two lines where needed, never truncate). Rows, subtotal and open menu as `a7`. Pins as `a7`, plus one on the table noting the squeeze at 900px (R2 §3).

### `b8`: delete with undo (1440)

Lens `ROUGH IN`, scrolled to Sunroom: T1's row, the entry row, the toast as the last row of the region (not fixed), and the spine's `Pieces` entry reading `25 LINES · 1 REMOVED`. The `[illustrative]` released-row example as `a8`. Pins as `a8`.

### `b9`: drag between rooms (1440)

Lens `ROUGH IN`, Dining and Kitchen tables visible; D3 lifted; the Kitchen heading as the drop target; K2's menu open with `Move to room…` expanded. Pins as `a9`.

### `b10`: back on the overview (1440)

Lens `OVERVIEW` again after work: worked counts, the Living Room row first with a 3px `--ink` left bar, front matter `$30,760 priced · ~$36,368 roughed · nothing released`, drawer `2h 27m`. Pin: "back" is a lens change and a scroll, never a route (R2 §3, the case for lenses).

### `b11` (optional): finishes (1440)

A sixth strip word `FINISHES`; Bedroom's table and the print act as `a11`.

### `b12`–`b15` (390)

`b12`: today's phone paper (`walk/pieces-list-390.jpg`) with the Pieces region: head, the strip as a horizontally wrapping row of five 44px buttons (two rows: `OVERVIEW · ROUGH IN · SPEC` / `PRICE · RELEASE`), the room rows. `b13`: strip at Rough in, Living Room's cards, the entry row above the dock with `ADD` and `DONE ADDING`. `b14`: strip at Spec, L1 unfolded in place, fields stacked. `b15`: strip at Rough in, Sunroom, the toast above the dock; pin the strip's `OVERVIEW` as the way back.

---

## 8. Direction C: Room sheets

The unit is the room. **Changes, and only these:** the Pieces region becomes an overview of rooms whose only door is `WORK THIS ROOM →`; a per-room sheet at `/doc/[id]/pieces/[roomId]` with one growing-column table, a drawer with folded groups, previous and next room, the elevation pane, undo and move; the hold on the layout. There are **no lens words anywhere**. Release and the buying acts stay on the Document.

### The sheet's shell (frames c2–c9, c11)

- Head, `--head`, `--sheet-head`: left `.act` `← WHOLE HOME RENOVATION`; centre `LIVING ROOM` (DM Mono 12 caps) with `6 lines · 4 placeholders · ~$23,564` beside it; right `.act` `← HALL` and `.act` `DINING →`.
- Under the head, Inter 14 `--sheet-ink-muted`: `Everything in this room. A line's row grows as you fill it in; open a line for the rest.`
- No room rail. Left of the table, nothing. Right: the elevation pane (§2.6), 360px, always present.
- Body: one table. Columns `LINE · QTY · UNIT · PRODUCT OR MAKER · ROUGH $ · CLIENT PRICE · STAGE · ` at 360 · 56 · 72 · 260 · 100 · 110 · 120 · 40. Empty cells print nothing; a placeholder's `PRODUCT OR MAKER` cell holds a `.act` `FILL`. The empty entry row, the key hint (`ENTER ADDS THE LINE · TAB MOVES ACROSS · PASTE A LIST`).
- The **drawer** opens to the right of the table in place of the elevation pane, 480px: the line's name (Playfair 24), its stamp, then four groups each with a DM Mono 11 head and a `FOLD` / `UNFOLD` act: `SPEC` (maker, product, image, finish, material, color, dimensions, exact location, notes), `ROOMS` (chips, unit), `PRICE` (trade cost, markup, client price, rough ~, `Make it an allowance`), `LABOR` (`ADD LABOR`, children). A group beyond the line's stage is folded with a reason in Inter 13 `--sheet-ink-faint`: `Price · after a maker or a product`.
- Drawer at the foot of the frame as today (§2.9).

### `c1`: the overview (1440)

As A's `a1` **except** the head's inked act is `WORK THIS ROOM →` on the first room row and there is **no** `WORK THE PIECES →`; the head acts are `ADD TO THE JOB`, `RELEASE FOR AUTHORIZATION` (gated, reason as `a1`), `RECORD A CHANGE`, `FOLD ↑`. Pins as `a1`, with the note that the door is per room (R2 §5, Leah "I'm in the living room").

### `c2`: rough in, Living Room (1440)

The Living Room sheet the moment after L1–L4: four rows with `PRODUCT OR MAKER` showing `FILL`, `ROUGH $` `~$4,800`, `~$1,400`, empty, empty; `CLIENT PRICE` empty; `STAGE` `PLACEHOLDER`. L3's menu open (`Fill with a product`, `Move to room…`, `Also place in…`, `Remove`). The entry row; the key hint; the elevation pane. Head counts `4 lines · 4 placeholders`. Pins as `a2`, plus one on the empty money columns: the first hire sees price columns during rough-in (direction.md §3 C risks).

### `c3`: where am I — the room head and the folded groups (1440)

The Living Room sheet, worked state, L2 (`Countertop for custom cabinets`, PLACEHOLDER) open in the drawer: `SPEC` unfolded (empty fields), `ROOMS` unfolded (`Living Room · ×2`, `+ ROOM`), `PRICE` folded with `Price · after a maker or a product`, `LABOR` folded with `Labor · after a product`. The head's `LIVING ROOM · 6 lines · 3 placeholders · ~$23,564` and the room acts. Under the head's reading line, nothing else names a mode. Pins: the room is the place (R3 §6 "Whole Home Renovation / Build Pieces / Living Room"); what you can do is folded, not absent (R3 §5 warning, direction.md §3 C); the release and buying acts are not on this sheet.

### `c4`: spec pass (1440)

L1 open in the drawer, `SPEC` unfolded with `a4`'s fields and values, `ROOMS` unfolded, `PRICE` unfolded (empty trade cost and client price, `~$4,800 each`), `LABOR` unfolded (`ADD LABOR`). The table row for L1 now reads `Hollis Millwork` in `PRODUCT OR MAKER` and `SPECCED`. `NEXT UNFINISHED →` inked at the drawer's foot. Drawer `2h 21m` pinned. Pins as `a4`.

### `c5`: one piece, four rooms (1440)

The **Hall** sheet (head `HALL · 4 lines · 2 placeholders · ~$3,505`, `LIVING ROOM →`). Rows H1, H2, F1 with `ALSO IN LIVING ROOM · DINING · KITCHEN · 120 SQ FT HERE` and `QTY` `120`, `UNIT` `sq ft`, `CLIENT PRICE` `$1,380`; T1 with its also-in line, `36`, `sq ft`, `$245`. F1 open in the drawer with `ROOMS` unfolded: the four chips and `830 sq ft × $11.50 / sq ft = $9,545`; `SPEC` unfolded with the swatch, `Satin Bona`, `TBD`. Pins as `a5`, plus one noting an edit here reaches the other three rooms (direction.md §3 C risks).

### `c6`: placeholder → product (1440)

Living Room sheet, L3 open, `SPEC` unfolded with `a6`'s search, results and preview. Pins as `a6`.

### `c7`: labor (1440)

The **Bedroom** sheet (`BEDROOM · 4 lines · 2 placeholders · ~$8,935`, `← SUNROOM`). Rows: R1 (`Phillip Jeffries Manila Hemp, Chalk` in product, `9`, `roll`, client `$230`, `SPECCED`), `↳ Install, wallpaper hanger` `LABOR` (`9`, `roll`, `$85`), R2, R3 placeholders. R1 open in the drawer with `PRICE` unfolded (`TRADE COST $184 / roll`, `MARKUP 25%`, `CLIENT PRICE $230 / roll`, `$2,070`) and `LABOR` unfolded listing the install line with `$85 / roll · $765` and `ADD LABOR`. A subtotal row `Bedroom · $2,835 priced · ~$6,100 roughed`. Pins as `a7`, plus one: there is no job-wide price table; the job total lives on the overview (direction.md §3 C).

### `c8`: delete with undo (1440)

The **Sunroom** sheet (`SUNROOM · 1 line · ~$1,006`): T1's row, the entry row, the toast as the body's last row. The head shows `← PRIMARY BATH` and `BEDROOM →`. The `[illustrative]` released-row example as `a8` in the notes only (no second room on this sheet). Pins as `a8`.

### `c9`: move to another room (1440)

The **Dining** sheet. D3 lifted (as `a9`) and the head's `KITCHEN →` act is the drop target: 2px `--sheet-ink` rule under it and `DROP TO MOVE TO KITCHEN` in DM Mono 11 beneath. K-side is not visible (one room per sheet), so D2's `⋯` menu is also open with `Move to room…` expanded to the seven rooms. Pins as `a9`, plus one: cross-room drag on one sheet needs the head as the target.

### `c10`: back on the overview (1440)

As `a10`, with `WORK THIS ROOM →` per row and the Living Room row first with the 3px bar. Pins as `a10`.

### `c11` (optional): finishes (1440)

The Bedroom sheet with a `FINISHES` group at the foot of the table: the §5 rows and `PRINT THE PAINT AND FINISH SCHEDULE`. Pin: R2 §6, Q10.

### `c12`–`c15` (390)

`c12`: the overview on the phone as `a12` with `WORK THIS ROOM →` per row. `c13`: the Living Room sheet: head row 1 `← WHOLE HOME` · `LIVING ROOM`, row 2 `← HALL` · `DINING →`; cards `Custom cabinet` / `×2 · each · ~$4,800 · PLACEHOLDER · FILL`; the entry row above the dock with `ADD` and `DONE ADDING`. `c14`: L1's drawer full width with the four groups, `PRICE` and `LABOR` unfolded and empty. `c15`: the Sunroom sheet with the toast above the dock; pin `← WHOLE HOME`.

---

## 9. Render and self-check

Render each file with the sandbox disabled. Output goes to `…/specimens/_renders/`, git-ignored by convention; do not commit it.

```bash
node /Users/kody/Code/patina-merged/artifacts/people-room-crm-2026-09-11/tools/render.mjs \
  /Users/kody/Code/patina-merged/artifacts/pieces-building-room-2026-10-08/specimens/proposed-<x>-1440.html \
  --out /Users/kody/Code/patina-merged/artifacts/pieces-building-room-2026-10-08/specimens/_renders \
  --name proposed-<x>-1440 --widths 1440 \
  --hashes frame-<x>1,frame-<x>2,frame-<x>3,frame-<x>4,frame-<x>5,frame-<x>6,frame-<x>7,frame-<x>8,frame-<x>9,frame-<x>10 --console
# 390 file: --widths 390 --hashes frame-<x>12,frame-<x>13,frame-<x>14,frame-<x>15
# add --dark for a dark pass; render both
```

**Look at every PNG** (light and dark) beside the matching walk screenshot. Then the gate, run from the repo root on each of your two files:

```bash
f=artifacts/pieces-building-room-2026-10-08/specimens/proposed-<x>-1440.html
test "$(tail -n1 "$f")" = "<!-- SPECIMEN COMPLETE -->" && echo "PASS sentinel" || echo "FAIL sentinel"
grep -nE 'box-shadow|text-overflow|placeholder=|\sdisabled[\s>=]|\bAI\b|curated|luxury|bespoke|elevated|disrupt|powered by|algorithm|engine|SPECIFIED|FF&E' "$f" && echo "FAIL banned" || echo "PASS banned"
test "$(grep -c '<h1[ >]' "$f")" = 1 && echo "PASS h1" || echo "FAIL h1"
grep -c 'data-frame="frame-' "$f"   # 10 or 11 for 1440, 4 for 390
```

Report back, in under 2 KB:
- the two absolute paths
- the PASS lines and the frame count per file
- the render PNG paths
- every fixture value you marked `[illustrative]`, and anything in §6–§8 you could not render as written, with the frame id
