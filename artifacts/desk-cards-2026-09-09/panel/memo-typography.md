# Memo — the typographer and editorial designer

A print designer's lens: what the eye does per card, where the figures line up, whether the
page still reads as one sheet at 45 entries.

## 1. Findings on the screenshot's card

- **F1 (high).** Three of four lines share one type colour — serif name, sans sub-line,
  sans status. No hierarchy below the name. The third role already exists and is unused:
  DM Mono (`.t-meta`) for *values* — dates, counts, provenance.
- **F2 (high).** "Waiting on Kody for 30 days", "Proposal pending 44 days" set durations
  inside running Inter. Durations and dates are values; in prose they cannot be compared
  card-to-card. Fifteen cards, fifteen unaligned numbers.
- **F3 (high).** "1 · Client: Kody" prints a label where position should carry it. Print
  the value; drop `Client:`.
- **F4 (med).** The "Presented / Approved / In Production / Installed" strip is a progress
  meter — four words where one is true, a badge in prose clothing. Cut it.
- **F5 (med).** The serif name is right, but the retired folder card set it at 1.6rem
  (25.6px, off-scale) and the live roster sets it at Playfair **16px** (below the sheet's
  `.t-d3` 20px). Neither matches. Pick 20 and hold it.
- **F6 (med).** Under D4 the only depth is value contrast between the three stocks — and
  `--paper` #FAF7F2 → `--paper-doc` #FCFAF6 is a ΔL of about 1. The hairline is therefore
  load-bearing; a card leaning on its fill reads flat.
- **F7 (low).** "Test Residence 1757…" shows the ellipsis habit is already in the data.
  The sheet forbids `text-overflow: ellipsis` outright.

## 2. Recommendation — five slots, fixed order, one type role each

| # | Slot | Type | Colour | Grammar |
|---|---|---|---|---|
| 1 | Stage plate | `.t-head` DM Mono 11/1.5, 500, .08em, UPPER, white | ground `--tab-*` | `DIRECTION` — the word only, never `· 3` on a card |
| 2 | Name | `.t-d3` Playfair 20/1.30, 500, tracking 0 | `--ink` | verbatim, wraps, never truncates |
| 3 | Person | `.t-meta` DM Mono 12/1.5, .08em, sentence case | `--ink-subtle` | `Nora Ellison` — no label |
| 4 | State | `.t-body-sm` Inter 14/1.50 | `--ink-muted`; overdue clause `--terracotta-ink` | existing grammar unchanged: `Opened 3× — last 7 Sep, no signature yet` |
| 5 | Value + act | value `.t-money` DM Mono 15/1.5 tabular .02em; act DM Mono 13 caps | `--ink` / `--oak` rule | `12 Aug` · `$17,500` · `Send reminder` |

**Numerals.** `font-variant-numeric: tabular-nums` on slots 3 and 5 **only**. Digits inside
the running sentence stay proportional — tabular figures in prose are an error; they are
for columns. Slot 5 right-aligns to the card's own inner rule, never the page edge (§F-I).

**Dates.** One form: `12 Aug` — day, three-letter month, no full stop, no leading zero, no
comma. Year only when not the current year (`12 Aug 2025`). Never `2026-08-12`, never
`Aug 12`. Age appended only where it is the point: `overdue since 4 Sep · 5 days`.

**The 34-character name.** At a 350px column with 24px padding the measure is 302px;
Playfair 500 at 20px averages ~0.50em → ~30 characters a line. "Whitcomb carriage house,
north wing" (35) wraps to two. So `min-height: 52px` (two 26px lines), `overflow-wrap:
break-word`, `hyphens: none`, and **reserve** those two lines so person, sentence and act
share a baseline across the row. A third line pushes only its own card —
`align-items: start` on the grid, never stretch.

## 3. Shape — three candidates

**(a) Bordered paper card.** `background: var(--paper-doc); border: 1px solid
var(--hairline); border-radius: var(--radius-box); padding: 24px;` grid gap 24px; internal
rhythm 12px name→person, 24px person→sentence, 24px sentence→act rule. Because the fill is
nearly the ground, the hover *is* the border: `--hairline` → `--hairline-strong`. No lift.
Demands: name must drop to 20px and the sentence to 14px, or 302px fights every line. The
stage sits as a small plate at top-left **on** the face (3px radius, `3px 10px`), not
straddling. The 7px mark hangs in the true left margin, outside the padding box, on the
name's first baseline (`left:-16px; top:9px`) — a printer's marginal mark, which is what a
mark is for. Correct, conservative, least information per vertical inch.

**(b) Folder with a stage tab (retired precedent).** Radius `0 8px 8px 8px`, two offset
sheets, tab straddling the top edge. Demands: the tab is already mono caps, so the body may
carry no second mono caps line — the act must become an Inter two-score word, which breaks
A5; and the name needs 1.6rem to balance a 26px tab, which is off-scale. The offset sheets
are a shadow drawn in paper: three stocks spent on one card, nothing left for the ground.
Looks most like a document, costs the most rules. Do not revive.

**(c) The wide card — a roster row given a top hairline and an internal grid.**
My recommendation.

```css
.card--ledger {
  display: grid;
  grid-template-columns: 24px 320px minmax(0,1fr) 132px 96px;
  align-items: baseline; column-gap: 24px;
  padding: 24px 0;
  border-top: 1px solid var(--hairline-strong);
  background: transparent;                 /* the ground shows through */
}
.card--ledger .mark  { width:7px; height:7px; border-radius:50%; align-self:start; margin-top:9px; }
.card--ledger .name  { font: 500 20px/1.30 var(--font-display); color: var(--ink); min-height:52px; }
.card--ledger .who   { font: 400 12px/1.50 var(--font-meta); letter-spacing:.08em;
                       color: var(--ink-subtle); font-variant-numeric: tabular-nums; }
.card--ledger .state { font: 400 14px/1.50 var(--font-body); color: var(--ink-muted); max-width:44ch; }
.card--ledger .value { font: 400 15px/1.5 var(--font-meta); letter-spacing:.02em;
                       text-align:right; font-variant-numeric: tabular-nums; }
.card--ledger:hover  { border-top-color: var(--ink-faint); }
.card--ledger .name a:focus-visible { outline:2px solid var(--clay-ink); outline-offset:2px; }
```

Demands, and the argument: it is the only shape where date and money columns **actually
align across 45 entries**, which is the entire case for tabular figures. The sentence gets
a 44ch measure instead of 302px, so the existing grammar fits one line. Depth comes from
stock, not border — ground stays `--paper`; an urgent entry takes `--paper-doc` full-bleed
across its own band (a lighter sheet laid on the ground, exactly what the token names);
`--rail` is reserved for the person plate under *By person*. Press moves nothing: D4 has no
z-axis, so only the act's own rule responds.

**Grid.** (a) at 15 jobs is five rows; at 45 it is fifteen rows of three-column Z-scanning,
~4,200px, and the eye re-finds the left edge 45 times. (c) at 45 is ~5,600px on one axis
but one saccade per entry, every column holding. At **390px**: (a) is one 302px column,
unchanged — its advantage; (c) collapses to `grid-template-columns: 16px 1fr`, the value
moving under the sentence at `text-align:left`, the act at the band's right edge — it
degrades back into the roster row it came from, which is honest.

## 4. Contract — honored and departed

Honored: D1; D4 (**zero** shadow in all three — depth is stock value, hairline, marginal
mark). No badges: the stage plate is the existing roster plate reused ("no new site, no new
token"); the four-word progress strip is cut. No red/green — urgency is `--terracotta-ink`
on the clause plus the 7px mark, and survives colour removal because the words
`overdue since 4 Sep` carry it. No truncation. 24px module on padding, gaps and rhythm;
12px as the only half-step.

**The departure.** "Never a card" is departed from on Kody's instruction; (c) minimises it —
a roster row with a top hairline, 24px of air and an internal grid. One line per job
wrapping to two, stage plates kept, 7px mark kept, nothing folded on first paint. A card in
the sense a *ledger entry* is a card: an edge and a measure, not a tile. Worth it because
what the roster genuinely lacked was columnar values — you could not compare two dates or
two figures down the page — and only an internal grid gives that.

What I will not concede: **no cover image, no budget, no room count**. A card invites all
three and `document_state` has none. Cards whose data is absent grow placeholders, and
placeholders are how "you won't notice Patina" dies.

## 5. The risk for Kody to rule on

**Does the card replace the roster, or become a third facet beside "Only what needs me" and
"By person"?** Replacing it costs ~1.4× the scroll at 45 jobs and formally rescinds the
26 Aug density rule — which should then be written down. As a facet, we keep two renderings
of one model in sync forever and the Desk gains a view switcher, one step from the
dashboard UI the vision refuses. I would rule *replace, with shape (c)* — one rendering,
honestly amended — but it is his call, and it belongs in the record before anyone builds.
