# US-27 W2a · D1, the design system seat: card, section and depth for the whole portal (SQ-801)

**12 October 2026 · Opus 5.5.** This is a proposal. It changes no product code.

**Inputs:** BRIEF, WALK, e1 inventory, US-26 `direction.md` §3 A and §7, `proposed-a-1440.html` (CSS `:107-247`), house `SPEC.md`, `globals.css`.

**Sketches:** `d1-sketches/ladder.html`, `components.html` and `sheets.html`. Each is light and dark at real size, with no shadow.

**Notation:**
- Ratios use WCAG 2.x, and an rgba value is composited over its own ground first. The script and its output are in the board verification folder `SQ-801/`.
- **Exempt** means a separator or a region boundary, not a component boundary, so 1.4.11 does not attach (R144's reasoning, `globals.css:49-55`).
- **Dark is documented, not shipped** (`globals.css:56`; US-26 Q13).

---

## (a) The depth ladder

**The rule.** Depth is three things: the order of the stocks, the weight of the edge, and the space around a unit. **The nearer the layer, the purer its stock and the heavier its edge.**
- In light, purer means lighter.
- The house dark set is an inversion. `SPEC.md:89-108` puts dark `--paper-doc` below `--paper`, and A15's dark `--sheet` is `#1C1A17`. So in dark, purer means darker.
- The dark stock steps are tiny (1.05–1.30:1), so in dark **the edge carries the depth.**

| Layer | What sits on it | Stock, light / dark | Edge, against its ground | Inset and spacing |
|---|---|---|---|---|
| **L0 Ground** | the page, the header line, every non-document page's sections | `--paper` `#FAF7F2` / `#2A2622` | none | measure: 976 (Desk), 1200 (studio band, F-Q). Gutters 24, and 16 at 390. Gaps 48 / 24 / 12. |
| **L0′ Rail** | *beside* the ground: the Document's spine and margin | `--rail` `#E8E3DB` / `#3A3530` | the stock step | **No `--card-edge` on rail.** It falls to 2.62:1 (2.58 dark). |
| **L1 Laid document** | the job paper, print sheets, the galley | `--paper-doc` `#FCFAF6` / `#26221E` | the stock step: 1.03 on ground, 1.23 on rail (dark 1.05 / 1.30). **Exempt:** it is a region, read by its measure and rules. | proposed inset 48 / 56 at ≥ 900; 16 below 600 |
| **L2 Card** | a unit that earns one (c) | `--paper-doc` | 1 px `--card-edge` `#8F8C88`: **3.21** on its face, **3.13** against the ground. Dark `#77736E`: **3.35 / 3.19**. A job card's left side is the stage rule. | 16 / 20 / 4 / 18 (+3 px rule). Gap 24; 12 below 600 (A's 16, put on the module). |
| **L3 Lifted, the unit in hand** | **one per view:** the card whose sheet is open; a record opened in place | `--paper-lift` `#FFFFFF` / `#1C1A17` | 1 px `--ink-faint`: **6.79** on its face, **6.35** against the ground. Dark `#B8AEA2`: **7.95 / 6.87**. | the same box. Lifting never resizes or reflows. |
| **L4 Sheet** | act sheets, ledgers, ⌘K, Keys, pickers | `--veil` over the page, then a `--paper-doc` face | 1 px `--card-edge`. **Light:** the face against the veiled ground (`#7B7976`) is **4.16**, and that is the boundary; the line alone is 1.30. **Dark:** the face is 1.21 and the edge is **4.06**, so the edge is the boundary. | 28 / 40, and 24 / 16 at 390. Width 640 for an act sheet, 880 for a ledger. |
| **L4′ Popover** | the Ledgers menu, `⋯` menus | `--paper-doc`, no veil | 1 px `--card-edge`: **3.13** (dark 3.19) | 12 / 16 |
| **L5 Modal** | an irreversible confirm or a signature; the only thing allowed above a sheet | a second `--veil`, then `--paper-doc` | 1 px `--ink`: **3.33** against the light veil, **16.41** against the dark | max 480, inset 24 |

**Focus**, on every layer: 2 px `--clay-ink`, offset 2.
- Light: **5.75** on doc, **5.61** on paper, **6.00** on lift.
- Dark (`#D8B98A`): **8.44 / 8.03 / 9.28**.

**Stage edges**, the 3 px rule and the 2 px tick:

| Stage | Light `--tab-*`: doc / paper / lift | Dark `--tab-*-edge`: doc / paper / lift | Light pigment on dark doc |
|---|---|---|---|
| Brief | 5.01 / 4.89 / 5.22 | `#7D9EC0` 5.66 / 5.38 / 6.22 | 3.02 |
| Discovery | 5.56 / 5.42 / 5.80 | `#5FA08F` 5.20 / 4.94 / 5.71 | 2.72 |
| Direction | 6.14 / 5.99 / 6.40 | `#73A374` 5.43 / 5.16 / 5.97 | 2.47 |
| Proposal | 6.74 / 6.58 / 7.03 | `#A3A75C` 6.20 / 5.89 / 6.81 | 2.25 |
| Project | 7.28 / 7.11 / 7.59 | `#B98F5A` 5.37 / 5.10 / 5.90 | 2.08 |
| Install | 7.87 / 7.67 / 8.20 | `#CC7A70` 4.95 / 4.71 / 5.44 | 1.93 |

**Separators, exempt:**
- `--doc-ink-border`: 1.41 light, 1.94 dark.
- `--hairline-strong` `#D8CCB8`: 1.48.
- `--rule-mid`, the section close: 13.53.

**Front to back**, each step adds one cue (stock, edge or veil), so no layer needs a shadow (`ladder.html`).

---

## (b) The components

Seven components, reused unchanged in every area. A variant needs a reason in the area seat's spec.

### 1. Section

- **Anatomy:**
  - an **eyebrow**: the ornament, then the mono name, with any controls right-aligned on its baseline;
  - an optional Playfair title;
  - the body;
  - a **closing rule**.
- **The rule belongs to the section's foot.** That fixes WALK patterns 2 and 7 ("a section closes only when the next one opens").
- **Tokens:** eyebrow `--text-subtle`, ornament `--clay`, and a closing `--rule-mid` at full measure, 24 under the last unit. The first section opens under the header's `.doc-rule-strong` (R126: a hairline ends a row, 1.5 px ends a section, the double rule opens a movement).
- **Type:** eyebrow DM Mono 12/16, 500, `.08em`, caps (`.t-head` as amended in G-6); title `.t-d2`.
- **Hover:** none.
- **Focus:** the eyebrow is an arrival target (`tabIndex=-1`, `desk/page.tsx:467-474`), with a 2 px `--clay-ink` ring at offset 4.
- **390:** the eyebrow wraps, controls drop under the name, the rule spans 358, and 48 becomes 24.
- **Use** for every grouped region, including the last one before the dock.
- **Not** inside a card or a sheet. **A Section never draws a box.**

### 2. Card (A's job card, generalised)

- **Anatomy, in DOM order:**
  1. **eyebrow:** a kind or stage word · a holder word (only when not yours) · a freshness word;
  2. **name:** a link, and the whole upper block is the hit area;
  3. optional person;
  4. **lines**, split by `--rule-hair`;
  5. **foot:** one act plus at most one tertiary, on a 44 px row with `margin-top: auto`, so feet share a baseline.
- **Plate slot.** One A10 plate may replace the lines. That is how a Room or a Board takes a card.
- **Tokens:**
  - face `--paper-doc`, 1 px `--card-edge`, `--radius-hair`;
  - left side: `--edge-stage` in `--tab-*` (job) or `--card-edge` (any other card);
  - lines `--text-muted`, a settled line `--text-faint` (Q6), and the overdue clause `--terracotta-ink`.
- **Type:** name `.t-d3` (Playfair 20/26 500, 1 px oak underline); person `.t-body-sm`; lines `.t-body` (A drew 15/22.5, off-scale; snap it); acts in the A5 tiers.
- **Grid:** a container query, 3 / 2 / 1-up at 900 / 600 (A `:139-142`). Rows stretch.
- **Hover:**
  - light: a job card takes its `--wash-*-still` (A); any other card takes `--bg-hover`;
  - dark: no wash, because the stage pigments fail there; the edge previews the lift (`--ink-faint`).
- **Focus:** a 2 px `--clay-ink` outline on the upper block (`:has(.name:focus-visible)`).
- **Lifted:** while its sheet is open, the face is `--paper-lift` and the edge `--ink-faint`.
- **390:** 1-up at 358; the act and Not today share the foot when they fit; names wrap; a plate goes 3:2 at the card's width.
- **Not** for a fact, a filter, a status, a setting, a help topic or a keycap.

### 3. Ledger row (with the stage tick)

- **Anatomy:** a name (the link), a sentence, a when, and one act, right-aligned.
- **Columns:** A's 236 / 96 / 1fr / 132 / 150 at ≥ 900 (the `.desk-ledger-list` container query, `globals.css:631-660`). A plain row drops the phase column.
- **A job row** has a **2 × 24 px tick** in `--tab-*`, 12 px left of the name and aligned to its line box.
- **Tokens:** a top and bottom `--doc-ink-border` on each row, at **full measure** (F2). The group closes on its Section's `--rule-mid`.
- **Type:** name `.t-d4` (17/24, new; G-7); sentence `.t-body-sm` `--text-muted`; when `.t-meta` `--text-subtle`; figures `.t-money`, right-aligned to the block's rule (F-I).
- **Status is an ink word, never a chip.** WALK found three chip shapes on the reading paper. The A15 stamps stay on the drafting stock.
- **Hover:** `--bg-hover` across the row (a job row may take its still wash).
- **Focus:** the name's ring only.
- **390:** name / sentence / act stack; the tick stays beside the name; the act becomes a full-width 44 px row.
- **Use** for every unbounded set: the ledger, People, Accounts, Procurement, ⌘K, Keys, the Library list, and Rooms beyond the recent three.

### 4. Sheet frame, popover and modal

- **Anatomy:** the veil; the panel; a one-line **head** (a 16 px `--clay-ink` icon, the mono title, "Put back · Esc" at the right) on `--rule-hair`; the body; and an optional **foot**, an act row on `--rule-hair` with at most one filled act (V18 Q8).
- **One stock for every sheet:** `--paper-doc`, 1 px `--card-edge`, 2 px radius. This retires today's doc, white and cream sheets (WALK §9) and the 5 px radius (`doc-sheet.tsx:395`).
- **Type:**
  - head: DM Mono 12/16 caps;
  - a body title (an invoice number) `.t-d2`;
  - facts in a `dl` (`dt` `.t-meta`, `dd` `.t-body`).
- **Never two sheets.** A folio opened from Accounts **replaces** the Accounts body in the same frame, with "← Accounts" first in the head. Today three layers show (`a8-invoice-sheet-1440`), and at 390 the rows bleed through.
- **Popover:** the same face and edge, no veil. Today's Ledgers menu is rounded and the same cream as the cards under it.
- **Modal:** a 1 px `--ink` edge, a second veil, and an explicit Cancel.
- **Focus:** trapped; it lands on the head title, and Esc restores it to the opener. **The opener's unit is lifted (L3) while the sheet is open,** so the eye returns to its place.
- **390:** full width from the safe top inset, scrolling inside; the head wraps; the foot act is a full-width row; `scroll-padding-bottom` equals the dock (F-L).
- **Not** for navigation: a destination is a route.

### 5. Empty state

- **Anatomy:** the Section's eyebrow, **one sentence** (with its starting act inline, if there is one), and the Section's closing rule.
- **Type:** `.t-authorship` (Playfair italic 20) for a whole region; `.t-body` `--text-subtle` inside a sheet.
- **Never** a dashed box (plans, doc boards), a dashed plate in a card (Rooms' AWAITING DRAWING becomes A10's silhouette), or a rule with nothing above it (Library). Dashed means "not filled in" and survives only on the A15 placeholder stamp.
- **One exception:** a Section of Cards that empties keeps one card frame for its sentence. That is A's close-of-day Today box (`proposed-a-1440.html:205`), and it needs G-10.
- **Hover, focus:** the inline act only.
- **390:** the sentence wraps.
- **Not** for loading (A5 "Loading": ink, not a spinner) or for errors.

### 6. Header line

- **Anatomy:**
  - one 44 px row: a back act (tertiary) when nested, then the **title** on the left; the page's acts on the right (secondary ＋ creates; tertiary Find, with ⌘K under `(hover: hover) and (pointer: fine)`);
  - then `.doc-rule-strong`.
- **Tokens:**
  - ground `--paper` (L0, never a band of its own stock);
  - the clay ＋ is its only colour.
- **Type:** title `.t-d2`. A's greeting is drawn at 28, off-scale; snap it. A name in a title is `.t-authorship`.
- **Sticky** only for long lists. Then it is opaque `--paper` with its double rule. **Never translucent:** People today shows rows through it.
- **Hover and focus:** the act tiers.
- **390:** two rows, about 92 px:
  - back, title and Find;
  - the creates with short labels (Q7; the labeling sign-off), with full accessible names (2.5.3).
- **It replaces five header patterns** (WALK §9): the Desk masthead, the white Room head band (`room-shell.tsx:128-139`), the board toolbar's title row, and the missing headers on Help and Preferences.
- **On the laid document** the letterhead is the title, so the header line carries only the back act and the acts.

### 7. Stage edge rule

- **Anatomy:** a 3 px rule replacing a card's left edge, full height; or a 2 × 24 px tick beside a row's name.
- **The stage word always prints in ink** (WCAG 1.4.1, direction §3 A).
- **Tokens:**
  - light `--tab-*` (Care borrows install);
  - dark `--tab-*-edge`;
  - widths `--edge-stage` and `--tick-stage`;
  - forced colours `CanvasText`.
- **Hover and focus:** none. It is not interactive.
- **390:** unchanged.
- **Use only on a unit that stands for a job** (d).
- **Never** a dot, a plate, a fill, a band, a wash at rest, or a top or bottom rule.

---

## (c) Card, row or text

A unit **earns a card** only when all four are true:

1. **It is one thing someone opens.** It has a name that is a link.
2. **It holds something to do or see now:** a line with an act, or a plate. A name and a date alone make a row.
3. **The set is bounded by a rule, not by the data:** Today's five (V18 Q1), the three newest scans, this job's open boards. **At most six cards per Section.**
4. **The set is ranked,** or its order is stated.

Otherwise:

| If the unit is… | It is a… | Examples |
|---|---|---|
| one of a set that grows with the studio | **Ledger row** | other jobs, people, invoices, POs, older rooms, ⌘K results |
| image-led, in a collection someone browses | **Plate and caption** (A10): the plate's hairline is the edge, with no box | Library results, the Boards index, judgments |
| a fact or a single value | **Text** (a `dl` or a sentence) | ceremony's Budget and Timeline tiles; spec metadata; the piece page's tags |
| a filter, a setting or a key | **Control** (A5 chip, field, keycap) | the Library and People filters; Preferences |

**How this avoids the old catalogue** (US-26 WALK §4: 32 equal cards, 5,819 px, seven registers, plates louder than the money):

- **A cap and a rank.** "The rest" is always ledger rows directly under the cards. A card is a **promotion**, not a container.
- **Once per view.** A card is never also a row (A's R1).
- **Four registers at most:** eyebrow, name, lines (or a plate), foot. No dots, plates, custody words or counts.
- **Colour only on the edge,** and only for a job.
- **An unbounded set defaults to rows.** Forty scans make three cards and 37 rows.
- **Order grades; size never does.**

---

## (d) Colour that orients across the portal

**Colour means stage, in one form (the edge), and only on a unit that stands for a job.** Beyond the Desk:

| Where | The form | Why |
|---|---|---|
| **The Document's letterhead** | one 3 px rule down the title block, with the stage word in ink. **Once per page.** | The paper shows the same colour as the Desk card that opened it. |
| **⌘K job results** | a tick on each job row | It replaces the stage-line groups (`a9-cmdk-sheet`). |
| **A person's record, "On these jobs"** | rows with ticks | which of her jobs is where |
| **Library piece, "Used on"** | rows with ticks | "find the piece I used on Holloway" (BRIEF §5) |
| **Boards and Rooms** | none on the board or room; the job named in its caption may carry a tick | A board is not a job; its job is. |

**Colour must stay out of:**

- **State.** These become **ink words**:
  - People's state-coloured borders (PR-v `.word--*`);
  - Accounts' blue SENT;
  - Procurement's yellow RECEIVED/INSPECT;
  - the Rooms quality dots.

  These are the places WALK counts where colour grades.
- **Money.** The only coloured words stay the terracotta-ink overdue clause, one per unit, in a sentence (Q3, Q14).
- **Rules, sheet frames, headers, empty states and the dock.**
- **Avatars.** Coloured discs become ink initials in a `--doc-ink-border` ring (A's `.avatar`).
- **Acts.** The clay ＋ and the clay under-score are the house act, not a meaning.
- **Note edges.** Jordan's 2 px blue-grey hand-off and ceremony's 3 px tan quote become one `--edge-note`, 2 px oak. It is never a stage hue.
- **At rest:** never a fill, wash, plate, dot or band.

**Dependencies on open rulings:** **Q5** (this extends `--card-edge` to every Card and sheet; if Q5 is ruled narrowly, they have no 3:1 boundary), **Q13** (dark documented only), **Q14** (colour never urgency) and **Q6** (settled lines faint). **PR-v** (`globals.css:1935-1947`) is reversed under BRIEF §1, and the People seat owns that change.

---

## (e) Tokens

**Reused** (`globals.css`): `--paper`, `--paper-doc`, `--rail` (`:1906-1910`); `--color-card-edge` (`:60`); `--doc-ink-border` (`:74`); `--rule-hair` / `-mid` / `-strong` (`:143-145`) and `.doc-rule-strong` (`:373`); `--tab-*` (`:164-169`); `--wash-*-still` (`:187-192`); `--bg-hover` (`:84`); `--bg-surface` (`:83`); the `--text-*` ramp, `--ink-faint`, `--clay`, `--clay-ink`, `--terracotta-ink`, `--oak`; `--module`, `--radius-hair`, `--type-metadata-min`.

**Proposed:**

| Token | Light | Dark (documented) | Reason |
|---|---|---|---|
| `--card-edge` | `var(--color-card-edge)` | `#77736E` (SPEC :102) | An alias. The alias block at `:1906` has every other house short name. |
| `--paper-lift` | `var(--bg-surface)` `#FFFFFF` | `#1C1A17` (A15's dark `--sheet`) | L3. White means "working" (V15 Q2), in one ruled place, where today it is mixed in at random. |
| `--veil` | `rgba(20,18,16,.55)` | `rgba(0,0,0,.60)` | Names `doc-sheet.tsx:377`'s literal. A drew `.42`; one value for all. |
| `--edge-stage` / `--tick-stage` | `3px` / `2px` | same | One width per form. WALK found 2 px and 3 px edges. |
| `--edge-note` | `2px solid var(--oak)` (4.20 paper, 4.30 doc) | `2px solid #B39572` | One non-stage note edge |
| `--tab-brief-edge` … `--tab-install-edge` | not used | `#7D9EC0` `#5FA08F` `#73A374` `#A3A75C` `#B98F5A` `#CC7A70` | From A and D1. The light pigments fall to 1.83–3.02 on dark grounds; these reach 4.71–6.22, in hue order. |
| dark companions of the rule literals | — | `--rule-hair` `rgba(242,237,230,.14)`; `--rule-mid` / `--rule-strong` `#F2EDE6`; `--doc-ink-border` `rgba(242,237,230,.22)`; `--hairline-strong` `#56524D` | A's dark block (`:215-235`), which the house sheet never recorded |

**Retired** if (g) rules as recommended: `--elevation-sheet` and `.doc-elevated`.

---

## (f) House-sheet amendments

These are against `docs/design/house-sheet/SPEC.md` at `a91a98107`. Each is marked *(amended §G-n)*.

**G-1 · :55–56.** Replace
> `/* — the one boundary grey (R144). A component boundary answers to 1.4.11's` / `3:1, which no hairline reaches. Claim cards ONLY. — */`

with
> `/* — the one boundary grey (R144, amended §G-1). A component boundary answers to` / `1.4.11's 3:1, which no hairline reaches. Every Card and sheet frame (§G);` / `never a ledger row, never on --rail (2.62:1). — */`

*(Depends on Q5.)*

**G-2 · :74–76.** Replace the comment and the declaration with
> `/* — no depth token. Depth is stock, edge and veil (§G). — */`

*(If (g) is declined, it reads instead: "Permitted on the three R126 sites ONLY: margin chips, the open ledger sheet, the studio drawer.")*

**G-3 · after :86**, insert
> `--paper-lift: #FFFFFF;  --veil: rgba(20, 18, 16, .55);`
> `--edge-stage: 3px;  --tick-stage: 2px;  --edge-note: 2px solid var(--oak);`

**G-4 · after :106**, insert
> `--paper-lift: #1C1A17;  --veil: rgba(0, 0, 0, .60);`
> `--tab-brief-edge: #7D9EC0;  --tab-discovery-edge: #5FA08F;  --tab-direction-edge: #73A374;`
> `--tab-proposal-edge: #A3A75C;  --tab-project-edge: #B98F5A;  --tab-install-edge: #CC7A70;`

**G-5 · :107.** Replace
> `/* dark mode keeps the light plate values (amended §F-J) */`

with
> `/* a stage PLATE keeps its light value in dark (§F-J); a stage EDGE takes --tab-*-edge (§G-4) */`

**G-6 · :143** (`.t-head`). Replace `11px / 1.50` with `12px / 16px`, and add "and every eyebrow" to its use.
- Reason: the portal's 12 px floor (`globals.css:100`), and A's 12/16 eyebrow.

**G-7 · after :139**, insert
> `| .t-d4 | display | 17px / 24px | 500 | 0 | sentence | a ledger-row name |`

and at :157 replace "Nothing else." with "Nothing else. (`.t-d4` added §G-7.)"

**G-8 · :166** (Radius). Append
> `; 2px for every card, sheet, popover and modal frame (never 5px)`

**G-9 · :168** (Shadows). Replace
> `**none.** `box-shadow` must not appear in any specimen file.`

with
> `**none, anywhere:** no specimen, stylesheet or component. Depth is the §G ladder.`

**G-10 · :513–515** (A10). Replace
> `Room name at `.t-d3`, a floor line at full band width, one sentence. **Never a rectangle.**`

with
> `The Section's eyebrow, one sentence, and the Section's closing rule (§G). **Never a rectangle, never dashed**, except that a Section of Cards which empties keeps one card frame for its sentence (US-26 A).`

**G-11 · :592.** Replace
> `no shadows · no pills · no status dots · no badges`

with
> `no shadows · no pills · no status dots · no badges · no state chips or coloured state edges on the reading paper (A15 stamps stay on the drafting stock) · no translucent sticky heads · no sheet over a sheet`

**G-12 · :1011–1012.** Replace
> `no tinted band behind a stage group (the plate is the colour; the row stays on cream)`

with
> `no tinted band behind a stage group (the 3px card edge and the 2px row tick are the colour, V19; the row stays on its stock)`

**G-13 · after :1243**, append **§G**: (a) to (d) of this note, the PR-v reversal, and "Answers: US-27 BRIEF §4; V19."

---

## (g) The shadow question

**The evidence.** The portal is not shadow-free today.
- **One shadow is ruled.** `--elevation-sheet` (`0 1px 2px rgba(44,41,38,.08)`) is spent at three sites: the margin chips, the open ledger sheet and the studio drawer (R126, D4 amended; `globals.css:197-201`, `:360`). `shadow-gate.test.ts` holds it.
- **The rest are unruled breaches of A4**, defects for the area seats rather than a question: three product modals at `0 32px 80px` (`promote-to-studio-modal.tsx:474`, `nominate-to-catalog-modal.tsx:429`, `bulk-promote-to-studio-modal.tsx:174`), `MilestoneCard.module.css:5`, and the board room (WALK §6).

> **G-Q1. Retire the one ruled shadow, `--elevation-sheet`, at its three R126 sites, and let the ladder (stock, edge and veil) do that work?**

**The case for keeping it:**
- A ledger sheet over near-identical paper is the hardest separation in the portal.
- The token is tiny, ruled and tested.
- Retiring it means changing `shadow-gate.test.ts`, `doc-sheet-elevation.test.ts` and `margin-item.test.tsx:44`.

**The case against:**
- It reaches 1.16:1 at its darkest pixel against `--paper-doc`, fading over 2 px. That does no work the measured boundaries do not already do: the face against the veil is 4.16:1, and the edge in dark is 4.06:1.
- It is a second depth grammar, and BRIEF §2 binds "zero shadows".
- A permitted shadow is how unruled ones creep in. R72's `.folio-face` is the precedent (`shadow-gate.test.ts:7-9`).

**Recommended: yes, retire it.** Each site moves onto the ladder:
- **The margin chip** stays on rail, so it takes a 1 px `--ink-faint` edge (5.32:1 on rail). That is the one sanctioned edge on rail, because it is the L3 edge and not `--card-edge`.
- **The ledger sheet** becomes an L4 sheet.
- **The drawer** becomes §F-F's bottom bar: a `--paper-doc` ground and a `--hairline-strong` top rule.

**If declined:** G-2's alternative text applies, and nothing else in this system uses the token. Side by side: `sheets.html`, frame "G-Q1".
