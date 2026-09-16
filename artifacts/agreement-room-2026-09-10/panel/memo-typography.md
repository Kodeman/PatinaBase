# Memo — seat 3 · the typographer / paper

Fixture: the Okonkwo house. Every figure below traces to `briefing/fixture.md`.

---

## 1 · The argument

### The room has no type scale

The house sheet's seven steps and its two additions do not exist in this portal.
`packages/patina-design-system/src/styles/typography.css` ships a different scale
(`.type-meta-small` at **0.63rem = 10.08px**) and the Contract Room uses none of
it. Every size here is a Tailwind arbitrary value — `font-size` written inline by
another name: 1.65rem, 1.25rem, 1.05rem, 13px, 12.5px, 11.5px, 10.5px, 0.85rem.
Not one is a step; §A3 ends "Nothing else. No inline `font-size`."

This is the finding under all the others. Clunky here is largely arithmetic:
**eight sizes doing the work of four.** The rail's eyebrow and the paper's list
note differ by one pixel; the printed clause and the field holding it differ by
1.1px. A stack of near-misses tells the eye nothing about what is subordinate to
what, so it reads everything at once.

### The paper will not print its own cents

`money()` sets `maximumFractionDigits: 0` — the fixture's ceiling is `$24,000.00`
and the paper prints `$24,000`. Money on the paper is Playfair 16.8px, a display
step, while a rate row's figure in the same file is DM Mono **11px**: two
families and two steps for figures in one document, `tabular-nums` in neither.

### The field is not the paper

The Services clause is one string, set twice on screen:

| | size / leading | ink | ground |
|---|---|---|---|
| in the field | 13.6px, inherited leading (`input.tsx:15`, `textarea.tsx:15`) | `--text-primary` charcoal | `--bg-surface` **#FFFFFF** |
| on the paper | 12.5px / 1.75 (`agreement-parts-body.tsx:328`) | `--text-body` mocha | `--doc-paper` |

Four differences on one sentence — and that sentence is not a draft of the paper,
it *is* the paper: it projects into `proposal_service_terms.scope`
(`00575_agreement_parts.sql:2934-2939`). Every direction that puts the editor
near the paper (A, D, and B while the drawer is open) makes the mismatch louder,
so §A14 must land before any of them is built.

The controls make this worse in ways a specimen cannot patch around. All three
set `style={{ fontFamily: 'var(--font-body)' }}` **inline** (`input.tsx:39`,
`textarea.tsx:39`, `select.tsx:29`), so a money field cannot take DM Mono from a
class at all; all three carry `disabled:opacity-50`, the one treatment §A5
forbids by name; all three kill the outline for a 1px clay ring at **2.33:1**.
Five placeholders stand in for labels, and money fields are plain text boxes: the
retainer field reads `5000` beside a paper reading `$5,000`.

### The measure, at three widths

Compact mode drops the measure (`service-agreement-preview.tsx:101`), so **one
scale serves three**: ≈45ch in the 280px aside, ≈86ch in the 640px sheet
(`doc-sheet.tsx:377`, narrower than the paper's own 720), 115ch at 720 — against
§A4's 65ch cap. At 1024 the aside is `hidden` (`agreement-composer.tsx:960`) and
the clause field runs the full band: 13.6px on ~1210px is **≈178ch**, 2.7× the
cap (`resting-1024.png`). Kody's "too thin" is real at 1440 and the wrong
complaint below it: at 1024 and 390 the paper is *gone*, and `room-shell.tsx:155`
takes `Review & send` with it.

### The title, and the oak

The paper's title sets at 26.4px Playfair in a 280px measure. The production
title is `document.title` — `j.enzenroth@gmail.com — design services agreement` —
and it breaks to three lines, the first an unbreakable 21-character email needing
≈278px of the 280 available (screenshot, aside). No measure rescues an email.
**A title should be the client's name:** `Dave Okonkwo` at `.t-d2`, `Design
services agreement · V1` above at `.t-head`, `DRAFT` below.

And four labels a designer reads here are `--color-aged-oak` #8B7355 — the
readiness count, `The client's copy · live`, the rail eyebrows, `needs
attention`. That is **4.20:1** on #FAF7F2 and **4.49:1** on the card's white; all
four fail and none is large text. `globals.css:16-33` already rules that a
pigment asked to be read on paper takes an `-ink` companion. Clay, terracotta,
golden hour and sage each got one. Oak did not.

---

## 2 · Findings

`TY-` · P1 blocks a direction · P2 fix or rule out · P3 nit.

| ID | P | conf | surface | claim | evidence | proposed change | §6 |
|---|---|---|---|---|---|---|---|
| TY-1 | P1 | high | preview sheet · aside | The client's copy sets its body at 12.5px/1.75 — no step; §A3's prose steps are 16/1.55 and 14/1.50 | `agreement-parts-body.tsx:328`, `:338`, `:175`, `:395`; SPEC §A3 `:126-151` | Set the paper's prose at `.t-body`, margin notes at `.t-body-sm` | new |
| TY-2 | P1 | high | aside · preview sheet | Money on the paper is Playfair 16.8px; rate rows in the same file are DM Mono 11px; `tabular-nums` appears nowhere — two families, two steps, one document | `agreement-parts-body.tsx:202,402,416,432,475` vs `:139,242,379,494`; §A3 "one family per figure"; §F-B | One announced figure per money part at `.t-d2`, every other figure `.t-money` | new |
| TY-3 | P1 | high | aside · preview sheet | The paper drops cents from every contract figure — prints `$24,000` where the fixture's ceiling is `$24,000.00` | `service-agreement-preview.tsx:161-167`; `money-part-fee-floor-1440.png` | Two decimal places on every printed figure | new |
| TY-4 | P2 | high | rail | Row eyebrow, hidden sub-label and `needs attention` all set at 10.5px, below §A3's 11px floor | `parts-rail.tsx:308`, `:341`, `:349`; `SPEC.md:136` | `.t-head` 11px | new |
| TY-5 | P2 | high | rail | Row title `text-[13px]` is not a step | `parts-rail.tsx:329` | `.t-body-sm` 14 | new |
| TY-6 | P2 | medium | aside · editor · paper | 11.5px italic notes below the floor in three files | `agreement-composer.tsx:1060`; `agreement-parts-body.tsx:346`; `part-editor.tsx:138` | `.t-meta` 12 | new |
| TY-7 | P2 | high | composer page · aside | Page title and paper title both `text-[1.65rem]` = 26.4px, an arbitrary value 0.4px off the 26 step | `agreement-composer.tsx:733`; `service-agreement-preview.tsx:110` | `.t-d2` | new |
| TY-8 | P3 | medium | editor | Part heading is Playfair italic 20px — `.t-authorship` in all but name, and §A3 says `.t-authorship` is "never a heading" | `part-editor.tsx:113`; `SPEC.md:145-147` | `.t-d3` roman; `AMENDMENT-ASK:` permit `.t-authorship` as a part heading if the italic is wanted | new |
| TY-9 | P1 | high | whole room | The seven steps and `.t-money` do not exist in the portal; a parallel `.type-*` scale ships instead, including `.type-meta-small` at 10.08px | `packages/patina-design-system/src/styles/typography.css:106-125`; §A3 | Land the seven steps + `.t-money` as real classes before any direction is built | new |
| TY-10 | P1 | high | editor | Every field sets `text-[0.85rem]` = 13.6px — off-step and below `--type-control-min: 16px`, which this repo declares itself | `input.tsx:15`; `textarea.tsx:15`; `select.tsx:16`; `globals.css:87` | `.t-body` 16 for prose fields | new |
| TY-11 | P1 | high | editor | An edited clause does not keep the paper's body metrics: 13.6px charcoal on #FFFFFF vs 12.5px/1.75 mocha on `--doc-paper`, for one string that projects to `proposal_service_terms.scope` | `input.tsx:15` vs `agreement-parts-body.tsx:328`; `00575_agreement_parts.sql:2934-2939`; screenshot, editor vs aside | §A14 `.field-control--prose` — the field inherits the paper's body metrics and ink exactly | new |
| TY-12 | P1 | high | editor | Money fields are plain text boxes: no DM Mono, no tabular figures, no currency mark, no grouping, left-aligned. The retainer field reads `5000` beside a paper reading `$5,000` | `part-editor.tsx:424`, `:467`, `:514`; `money-part-fee-floor-1440.png` | §A14 `.field-control--money` | new |
| TY-13 | P1 | high | editor | All three controls set `style={{ fontFamily: 'var(--font-body)' }}` inline, so an inline style beats any class — a money field **cannot** take DM Mono without editing the control | `input.tsx:39`; `textarea.tsx:39`; `select.tsx:29` | Delete the inline family; set it in CSS | new |
| TY-14 | P1 | high | editor | `disabled:opacity-50` on all three controls — the one treatment §A5 names and forbids ("Never `opacity: .5` on any state. Ever.") | `input.tsx:15`; `textarea.tsx:15`; `select.tsx:16`; `SPEC.md:355-356` | §A14 held state: full-strength ink, `--rail` ground, a visible reason | touches §6-8 (that row is about the `disabled` attribute; this is its visual treatment) |
| TY-15 | P1 | high | editor | Focus is `outline-none` plus a 1px clay ring: #C4A57B on #FFFFFF = **2.33:1**, failing 3:1; §A5 focus is 2px `--clay-ink` at offset 2 | `input.tsx:15`; `clause-editing-390.png`; `SPEC.md:290-310` | §A14 focus = §A5 focus verbatim | new |
| TY-16 | P2 | high | editor · aside | No field boundary in the room clears 3:1: `--border-default` #E5E2DD on white = 1.29:1; `--doc-ink-border` on white = 1.42:1 | `input.tsx:15`; `agreement-composer.tsx:961` | §A14's 1px `--ink-faint` baseline rule (6.51:1) carries the boundary | new |
| TY-17 | P2 | high | editor · header | Placeholder-as-label in five places; §A13's Do-not list bans placeholder text outright | `part-editor.tsx:203`, `:329`, `:420`, `:436`; `agreement-composer.tsx:782` | A `.t-head` label above every field; no `placeholder` attribute | new |
| TY-18 | P2 | medium | editor | The clause textarea is a fixed box with a resize grip, not auto-growing: 508×172 holding two lines in the screenshot, ~1210×250 holding one at 1024 | screenshot, editor column; `resting-1024.png` | §A14 auto-grow; a paper has no scrollbar | new |
| TY-19 | P2 | high | editor | The credit-rule control is three chips with a filled clay ground and white text: #FFFFFF on #C4A57B = **2.33:1**; §A5's chip is `--rail` + 1px `--ink-faint` + `--ink` | `part-editor.tsx:546-549`; `money-part-fee-floor-1440.png` | Take §A5's chip spec | new |
| TY-20 | P2 | high | composer page | `Saved` / `Save agreement` is a filled clay act with a near-white label (~1.6:1); §A5 reserves a filled act for charcoal terminal, money-or-signature only | `agreement-composer.tsx:756-762`; screenshot, third act | Replace with its dated record (§A5 "taken") — as the shared treatment already proposes | touches §6-8 |
| TY-21 | P1 | high | aside | The paper's title sets at 26.4px Playfair in a 280px measure and breaks to three lines on `j.enzenroth@gmail.com — design services agreement`; the first line is an unbreakable 21-char email needing ≈278px | screenshot, aside; `money-part-fee-floor-1440.png` | Title = the client's name (`Dave Okonkwo`) at `.t-d2`; class and version above at `.t-head`; an email is never a title | touches §6-3 (no rename RPC exists, so a bad title cannot be corrected today) |
| TY-22 | P1 | high | aside · preview sheet | One type scale serves ≈45ch, ≈86ch and 115ch because compact mode drops the measure; §A4 caps prose at 65ch | `service-agreement-preview.tsx:101`; `SPEC.md:158` | One measure, one scale, 65ch cap wherever the paper renders | new |
| TY-23 | P1 | high | preview sheet | The sheet is 640px — narrower than the paper's own 720px — so the act called "Preview client copy" never shows the paper at its own measure | `doc-sheet.tsx:377` vs `service-agreement-preview.tsx:101`; `preview-sheet-1440.png` | A full-page proof route at 720 | new |
| TY-24 | P1 | high | editor (1024) | Below 1180 the grid stacks and a 13.6px clause field runs the full 1176 band — ≈178ch, 2.7× the cap; rail titles sit ~900px from their own row menus | `agreement-composer.tsx:820`, `:960`; `resting-1024.png` | Cap every prose field at 65ch regardless of column width | new |
| TY-25 | P2 | high | composer page (390) | The page title sets at 26.4px Playfair and takes three lines before any content, on the *seeded* title; the production email title takes more | `clause-editing-390.png`; screenshot | `.t-d2` on a client name; `AMENDMENT-ASK:` step the page title to `.t-d3` below 480 | new |
| TY-26 | P2 | medium | rail | Four of nine eyebrows wrap to two lines inside 260px at 10.5px caps + .1em; at 1024 the same string sits alone on a ~960px band | current-state §1; `resting-1024.png`; `clause-editing-390.png` | Print the standing as one word at `.t-head`, or move it below the title | new |
| TY-27 | P1 | high | aside | `The client's copy · live` is aged-oak on the card's white: **4.49:1**, under 4.5 | `agreement-composer.tsx:962-964`, `:961` | `--ink-subtle` (7.73:1 on paper-doc) | **known — §6 item 4** (recorded at 4.48; same pair, rounding) |
| TY-28 | P1 | high | aside · rail · composer page | The same oak on #FAF7F2 is **4.20:1** — `2 of 9 parts need attention`, the rail eyebrow, `needs attention`, `CLIENT ACCOUNT`. Four labels, all failing, none large text | `agreement-composer.tsx:1048`, `:87`; `parts-rail.tsx:308`, `:349`; `globals.css:13` | Mint an oak `-ink` companion as F56 did for the other four pigments, or print these in `--ink-subtle` | touches §6-4 (that row names one of the four sites; the other three are the same defect) |
| TY-29 | P2 | high | composer page | The RoomShell count prints aged-oak at `opacity-70` — #AC9B84 on #FAF7F2 = **2.53:1** — and opacity-as-hierarchy is forbidden outright | `room-shell.tsx:150`; `SPEC.md:355-356` | Drop the opacity; `.t-head` in `--ink-subtle` | new |
| TY-30 | P3 | medium | aside | The aside card is `rounded-[8px]`; §A4 permits 2px and 3px only | `agreement-composer.tsx:961`; `SPEC.md:159` | `var(--radius-box)` 3px | new |
| TY-31 | P3 | medium | aside | The card head reads `The client's copy · live`; `live` is on the banned list inside the paper, and this label frames the paper | `agreement-composer.tsx:963`; brief §9 | `The client's copy` | new |
| TY-32 | P2 | high | editor | The editing state is a white box with charcoal ink, a resize grip and a clay ring; the paper is a warm sheet with mocha ink. Nothing says the field *is* the paper | `input.tsx:15` vs `service-agreement-preview.tsx:101`; screenshot | §A14: fields print on `--paper-doc` | new |
| TY-33 | P3 | high | aside | An unset rate card prints `Recorded with your agreement.` in body prose where R21 rules an empty part prints nothing | `money-part-fee-floor-1440.png`, aside | Ruled by the pending merge of the two renderers | **known — §6 item 6 (minor N-i)** |
| TY-34 | P2 | medium | aside · preview sheet | List items print `— ` as a typed character inside the `<li>`, so a wrapped line aligns under the dash, not under the text; and lists use `leading-relaxed` (1.625) where clause prose uses 1.75 | `agreement-parts-body.tsx:338-346` | `.t-body` rows with a hanging indent and one leading | new |
| TY-35 | P3 | medium | aside · preview sheet | `Not yet set` renders in the same family and step as a real amount, separated only by slope and value — Playfair italic 16.8 muted vs Playfair roman 16.8 charcoal | `agreement-parts-body.tsx:99-102`, `:202` | Print `Not yet set` at `.t-meta` on the money rule, so an unwritten figure never occupies a figure's own step | new |

Counts: **P1 × 16 · P2 × 14 · P3 × 5** — 35 findings. Known: 2. Touches: 4. New: 29.

---

## 3 · Required artifact (a) — proposed house-sheet block

### §A14 · Fields on paper

*Sits after §A13, before §B. Every colour is a §A1 token, every size an §A3 step,
and no hex literal appears. Tokens used:* `--paper-doc` · `--rail` · `--ink` ·
`--ink-muted` · `--ink-subtle` · `--ink-faint` · `--hairline-strong` ·
`--clay-ink` · `--terracotta-ink` · `--module` · `--radius-hair` *(plus §A2's*
`--font-body` *and* `--font-meta`*).*

A field is not a control laid on the page: it is the place on the paper where a
line has not been written yet. **A sentence must not change its size, its
leading, its ink or its ground when the studio starts typing in it.**

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
   the text. Script writes `data-value` on input; nothing else. */
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
  line-height: 1.5;
  color: var(--ink);
}
```

**The rules, in the sheet's register** — the comments above are normative; these
are the eight the gate reads.

1. **The label is a `.t-head` and it is always there.** No field carries a
   `placeholder`: a hint that vanishes when it is needed was never a label.
2. **A prose field inherits the paper's body metrics** — step, leading, ink,
   ground, 65ch measure. It grows with its content: no grip, no scrollbar.
3. **A money field is `.t-money`**, right-aligned to the block's own rule (§F-I).
   **Currency:** the mark is furniture the field prints in its own family, never
   typed, never stored; on blur the figure normalises to grouped digits and two
   decimals (`24,000.00`, never `24000` or `$24,000`) and the paper prints
   `$24,000.00`. A non-USD mark replaces the character and nothing else.
4. **A select is the same box**, its mark two hairline edges; its longest option
   must fit, because a clipped option is truncation.
5. **Ground `--paper-doc`; box 1px `--hairline-strong` at 2px radius; visible
   edge a 1px `--ink-faint` baseline rule.** No shadow.
6. **Focus is §A5's focus**, drawn with `outline` so nothing moves.
7. **Held is `--rail` + a 2px `--terracotta-ink` leading rule + a reason.** Never
   `opacity`; `readonly` and `aria-disabled="true"`, never `disabled`, with
   `aria-describedby` on the reason.
8. **The dark twin needs no redeclaration** — every colour is a token. Two
   consequences are stated, not coded: `--hairline-strong` reads 1.94:1 on dark
   `--paper-doc`, so the baseline rule is the boundary in both schemes; and the
   held ground change is 1.30:1 dark to 1.23:1 light, so rule and words carry it.

---

## 4 · Required artifact (b) — contrast table

sRGB, WCAG 2.2. Text floor 4.5:1; non-text (boundaries, focus, state rules) 3:1.
Alpha tokens are composited over their ground and the composite hex shown.

### Pairs §A14 introduces — light

| Pair | fg | bg | ratio | need | |
|---|---|---|---|---|---|
| money field value · `--ink` on `--paper-doc` | `#2C2926` | `#FCFAF6` | **13.87** | 4.5 | PASS |
| prose field value · `--ink-muted` on `--paper-doc` | `#4E4339` | `#FCFAF6` | **9.22** | 4.5 | PASS |
| label `.t-head` · `--ink-subtle` on `--paper-doc` | `#5A4E43` | `#FCFAF6` | **7.73** | 4.5 | PASS |
| label `.t-head` · `--ink-subtle` on `--paper` | `#5A4E43` | `#FAF7F2` | **7.54** | 4.5 | PASS |
| currency mark `$` (text) · `--ink-faint` on `--paper-doc` | `#65594E` | `#FCFAF6` | **6.51** | 4.5 | PASS |
| held field value · `--ink` on `--rail` | `#2C2926` | `#E8E3DB` | **11.32** | 4.5 | PASS |
| reason line · `--ink` on `--paper` | `#2C2926` | `#FAF7F2` | **13.53** | 4.5 | PASS |
| baseline rule · `--ink-faint` on `--paper-doc` | `#65594E` | `#FCFAF6` | **6.51** | 3.0 | PASS |
| baseline rule on a held field · `--ink-faint` on `--rail` | `#65594E` | `#E8E3DB` | **5.32** | 3.0 | PASS |
| select mark · `--ink-faint` on `--paper-doc` | `#65594E` | `#FCFAF6` | **6.51** | 3.0 | PASS |
| focus ring · `--clay-ink` on `--paper-doc` | `#7C5E30` | `#FCFAF6` | **5.75** | 3.0 | PASS |
| focus ring · `--clay-ink` on `--paper` | `#7C5E30` | `#FAF7F2` | **5.61** | 3.0 | PASS |
| focus ring on a held field · `--clay-ink` on `--rail` | `#7C5E30` | `#E8E3DB` | **4.70** | 3.0 | PASS |
| held rule · `--terracotta-ink` on `--paper-doc` | `#9C5340` | `#FCFAF6` | **5.41** | 3.0 | PASS |
| held rule on its own ground · `--terracotta-ink` on `--rail` | `#9C5340` | `#E8E3DB` | **4.41** | 3.0 | PASS |
| box · `--hairline-strong` .14 over `--paper-doc`, vs `--paper` | `#DFDDD9` | `#FAF7F2` | 1.27 | 3.0 | **FAIL — carried by the baseline rule** |
| field ground vs page ground · `--paper-doc` on `--paper` | `#FCFAF6` | `#FAF7F2` | 1.03 | 3.0 | **FAIL — carried by the baseline rule** |
| held ground vs resting ground · `--rail` on `--paper-doc` | `#E8E3DB` | `#FCFAF6` | 1.23 | 3.0 | **FAIL — carried by the rule + the words** |

### Pairs §A14 introduces — dark twin

| Pair | fg | bg | ratio | need | |
|---|---|---|---|---|---|
| money field value · `--ink` on `--paper-doc` | `#F2EDE6` | `#26221E` | **13.56** | 4.5 | PASS |
| prose field value · `--ink-muted` on `--paper-doc` | `#D6CEC4` | `#26221E` | **10.14** | 4.5 | PASS |
| label · `--ink-subtle` on `--paper-doc` | `#C7BEB3` | `#26221E` | **8.61** | 4.5 | PASS |
| currency mark `$` · `--ink-faint` on `--paper-doc` | `#B8AEA2` | `#26221E` | **7.23** | 4.5 | PASS |
| held field value · `--ink` on `--rail` | `#F2EDE6` | `#3A3530` | **10.41** | 4.5 | PASS |
| reason line · `--ink` on `--paper` | `#F2EDE6` | `#2A2622` | **12.89** | 4.5 | PASS |
| baseline rule · `--ink-faint` on `--paper-doc` | `#B8AEA2` | `#26221E` | **7.23** | 3.0 | PASS |
| baseline rule · `--ink-faint` on `--rail` | `#B8AEA2` | `#3A3530` | **5.55** | 3.0 | PASS |
| focus ring · `--clay-ink` on `--paper-doc` | `#D8B98A` | `#26221E` | **8.44** | 3.0 | PASS |
| focus ring · `--clay-ink` on `--rail` | `#D8B98A` | `#3A3530` | **6.48** | 3.0 | PASS |
| held rule · `--terracotta-ink` on `--rail` | `#E2A895` | `#3A3530` | **5.93** | 3.0 | PASS |
| box · `--hairline-strong` .22 over `--paper-doc` | `#534F4A` | `#26221E` | 1.94 | 3.0 | **FAIL — carried by the baseline rule** |
| held ground vs resting ground · `--rail` on `--paper-doc` | `#3A3530` | `#26221E` | 1.30 | 3.0 | **FAIL — carried by the rule + the words** |

### The four labels in the screenshot's aside and rail — as shipped

| Label | fg | bg | ratio | need | |
|---|---|---|---|---|---|
| `THE CLIENT'S COPY · LIVE` — aged-oak on the card's white (`agreement-composer.tsx:962` / `:961`) | `#8B7355` | `#FFFFFF` | **4.49** | 4.5 | **FAIL** |
| `2 OF 9 PARTS NEED ATTENTION` — aged-oak on `--color-off-white` (`:1048`) | `#8B7355` | `#FAF7F2` | **4.20** | 4.5 | **FAIL** |
| rail eyebrow, e.g. `ROLE RATES · CREATES AUTHORITY` (`parts-rail.tsx:308`, 10.5px) | `#8B7355` | `#FAF7F2` | **4.20** | 4.5 | **FAIL** |
| rail `NEEDS ATTENTION` (`parts-rail.tsx:349`, 10.5px) | `#8B7355` | `#FAF7F2` | **4.20** | 4.5 | **FAIL** |

Same page, not among the four, all FAIL: `CLIENT ACCOUNT` `#8B7355`/`#FAF7F2`
**4.20** · the RoomShell count at `opacity-70` `#AC9B84`/`#FAF7F2` **2.53** · the
`Credited` chip `#FFFFFF`/`#C4A57B` **2.33** · the field focus ring
`#C4A57B`/`#FFFFFF` **2.33** (3:1) · the field boundary `#E5E2DD`/`#FFFFFF`
**1.29** (3:1) · the aside card's border `#D9D8D8`/`#FFFFFF` **1.42** (3:1).
The paper's own ink is sound: `#5C4A3C` reads 8.40:1 on white, 8.06:1 on
`--doc-paper`. Its problem is *size*, not ink.

---

## 5 · Ranking A–D, one sentence each

1. **D · The galley** — one measure, one scale, one ink, the editor unfolding
   beneath the printed part: the only arrangement where §A14's metric identity is
   the obvious implementation rather than a discipline to remember.
2. **A · The paper is the page** — the same virtue, strictest test, but it pushes
   money into a 208px margin a three-role rate card at `.t-money` 15 only just
   survives at 1440 and cannot survive at 1024.
3. **B · Builder as overlay** — the only direction giving the paper a real ≥720
   measure at rest (fixing TY-22 and TY-23 outright), but it keeps two type
   environments alive at once and so preserves what produced eight sizes.
4. **C · Two panes** — the least change and so likeliest to inherit today's
   habits intact, its accordion head and indent making the editor measure
   *narrower* than the 524 that already forces 10.5px labels.

---

## 6 · What the specimen must show to change my mind

**One plate, three widths, one string.** Render the fixture's Services clause in
the specimen's paper, put the same string in the field, and shoot both in one
frame at 1440, 1024 and 390. If the two settings are indistinguishable — same
step, leading, ink, ground and measure, only the baseline rule and the caret
saying which is which — the direction has solved what Kody called clunky.

Three reversals, specifically:

- **B above A** if the drawer's editor renders at `.t-body` 16/1.55 on
  `--paper-doc` inside 480, the three roles at `.t-money` 15 tabular right-aligned
  to their rule, and the paper behind it holds ≥720 and 65ch while it is open.
- **A above D** if the 208px margin holds `Principal · $185.00 / hour`,
  `Designer · $140.00 / hour` and `Assistant · $85.00 / hour` at `.t-money` 15,
  no truncation, nothing below 11px, at 1440 *and* at 1024.
- **C above B** if the accordion, at 580 less head and indent, still renders those
  three roles and the ceiling `$24,000.00` at `.t-money` 15 with no label at 10.5px.

Nothing rescues a direction that still prints the email as the title at `.t-d2`:
it breaks to three lines in any margin under ~300px, at every width.
