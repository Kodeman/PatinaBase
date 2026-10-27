# Round 8 token, type and P02 mapping (WP-00.4)

Ticket SQ-1811 · US-52 · base `0fabcadf2` · 2026-10-23. This is a design spec only. WP-01.3 implements it in
`apps/designer-portal/src/app/globals.css` and the two gate tests. This ticket changes no CSS and no tests.

**Authority.** P01 (map round 8 into a scoped document theme) and P02 (Kody, 2026-10-23: a scoped visual
exception for round 8's filled navigation and save controls and its few shadows) in
[DECISIONS.md](../DECISIONS.md). The house-sheet amendment that adopts this mapping is
[SPEC.md §H](../../house-sheet/SPEC.md).

**Scope selector.** Every round-8-only rule sits under `[data-paper-renderer="round8"]`. The legacy renderer
reads nothing new. The only additions at `:root` are the two survey-blue tokens, which have to sit where
`contrast.test.ts` measures them.

## 0. How this was measured

- **Reference.** The frozen `artifacts/room-proof-round8-2026-10-23/` was served read-only from this worktree
  (`python3 -m http.server 4191 --bind 127.0.0.1 --directory artifacts`). Computed styles were read in
  headless Chromium (Playwright 1.58.2) for `studio.html` and `job.html` at 1440 and 390 CSS px. Screenshots,
  the full computed-style JSON and the probe log are in the dispatch evidence directory
  `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1811/`, which is outside the repo.
  The artifact itself was not modified.
- **Source.** The six stylesheets the pages load (`studio.css`, `job.css`, `workflow.css`, `design.css`,
  `whole.css`, `notes.css`) were inventoried per selector.
- **Root size.** The reference root is **16px**: Chromium computed `html { font-size: 16px }`, so its rem
  values resolve against 16. Production `html` is **18px** (`globals.css` `@layer base`). Every size below is
  stated in **computed CSS px**. A reference rem value must never be copied into production. `.78rem` is
  12.48px in the reference but would be 14.04px in production.
- **Contrast.** Ratios use the WCAG 2.2 relative-luminance formula, implemented exactly as in
  `src/lib/document/__tests__/contrast.test.ts`: sRGB linearisation with the 0.04045 knee, then
  (L1+0.05)/(L2+0.05). Grounds with alpha are composited source-over, as that file's `composite()` does.
  - **Text thresholds.** 4.5:1 for text. 3:1 for large text, which means ≥24px, or ≥18.66px bold.
  - **Non-text thresholds.** 3:1 for control boundaries and focus indicators.

## 1. Rules WP-01.3 must respect (gates the mapping has to survive)

1. **No `-ink` suffix on an alias.**
   - `contrast.test.ts` refuses any `--*-ink: var(…)`, through `aliasedInkNames`.
   - It also measures every hex `--*-ink` against every light ground, in any block: `--doc-paper`,
     `--color-off-white`, white, the red-letter band `#F9F3EE` and the note band `#F8F0EA`.
   - So no round-8 token is named `…-ink` unless it is a hex literal that clears 4.5:1 on all five.
   - This spec adds exactly one such token, `--color-survey-blue-ink`. It is a hex literal and it passes (§2).
2. **No colour alias layer.**
   - Round-8 components use the production tokens in §2 directly.
   - The scoped block holds only these:
     - the type steps (§3);
     - the measures (§4);
     - the two depth tokens and their enumerated uses (§7);
     - the plate geometry override (§6).
   - No component-local hex literals (DESIGN-CONTRACT).
3. **Never use Tailwind `text-sm`, `text-xs` or `text-base` for a round-8 size.** At the 18px root they compute
   to 15.75, 13.5 and 18px. Use the `.t-*` / `.r8-*` classes or `text-[14px]`-style px values.
4. **Keep legacy CSS out of the scored-ink slice.** `document-action-hierarchy-contract.test.ts` reads the
   slice from `/* The Scored Ink (I107)` to `/* ── stilled`, through `indexOf`. Round-8 overrides live in their
   own delimited block **after** that slice. Then every existing `.da-plate {` / `.da-plate::after {`
   assertion keeps reading the legacy rule byte for byte.
   - `contrast.test.ts` anchors on `\n\.da-plate…`, which a rule that starts with `[data-paper-renderer` never
     matches.
   - `action-rest-rules.test.ts` forbids `transform` on any `.da-plate` rule.
5. **Never write the literal `box-shadow:` inside a CSS comment.** `shadow-gate.test.ts`'s `shadowsIn()` does
   not strip comments.
6. **Keep the existing gates unchanged.**
   - Dark mode stays deferred: no `prefers-color-scheme` block and no dark twins in `globals.css`.
   - Reduced motion and forced colours (§A11) stay as they are.
   - The focus ring stays `--focus-ring` (clay-ink).
   - Breakpoints stay 600/1180/1440.

## 2. Colour

### 2.1 Mapping

| Reference | Hex | Role in reference | Production token | Prod hex | Note |
|---|---|---|---|---|---|
| `--paper` | `#f7f5ef` | page ground (studio and job) | `--paper` | `#FAF7F2` | ΔE small; house stock wins |
| `--insert` / `--white` | `#fffefa` | lifted insert, field and secondary-button ground, skip link | `--paper-doc` | `#FCFAF6` | fields follow §A14; card/sheet faces keep `--paper-lift` (`#FFFFFF`) where the depth ladder already uses it |
| `--ink` | `#302e2a` | text, outlined-button border, filled primary (job) | `--ink` | `#2C2926` | |
| `--muted` | `#69665f` | secondary text, captions | `--ink-faint` | `#65594E` | same value as `--text-faint`. Use `--ink-subtle` (`#4E4339`) only where §R126's three-step ramp is needed |
| `--rule` | `#d4cec1` | 1px structural rule | `--hairline-strong` | `#D8CCB8` | **structure only**: 1.48:1, never a control boundary (§5) |
| `--moss` | `#4c624f` | active nav/index word and tick, pressed tab, studio filled button | `--color-forest` | `#3E5145` | text and ticks. Not `--color-sage-ink`: forest has more contrast headroom on the tracing stock (7.22 vs 4.78). Filled use: see §6 |
| `--moss` hover | `#3e5140` | filled-button hover | (none; §6) | | the plate's hover is `#1F1D1A` |
| `--trace` / `--tracing` | `#e8ede6` | pressed row, brief origin, scope presets, empty state, package head | `--color-green-record` | `#E8EEE7` | rule on it: `--color-green-record-rule` |
| nav-current | rgba(76,98,79,.05) on paper → `#eeeee7` | current contents row | `--color-green-record` | `#E8EEE7` | one stock, not a new alpha wash |
| `--blue` | `#58717b` | focus outline (studio), draft-issue rule (whole) | **new** `--color-survey-blue` | `#58717B` | pigment, **non-text only**. Focus departs to `--focus-ring` (§8) |
| survey caption/metric | `#4e6770` | "survey, not installed" caption, measured figures | **new** `--color-survey-blue-ink` | `#4E6770` | text companion (F56 pattern) |
| survey plate | `#eaf0ee` | scan plate ground | `--color-green-record` | `#E8EEE7` | no fourth light stock |
| `--rust` | `#895035` | wait/attention word, price note, warning tick, superseded | `--terracotta-ink` | `#9C5340` | §G-13: overdue, blocked or do-not-contact words only. Errors use the existing `ActFailLine` |
| form errors | `#913c26`, `#8a2a1c` | inline errors | existing `ActFailLine` / `--terracotta-ink` | `#9C5340` | |
| hold ink | `#865236`, `#73582f`, `#805b2f` | purchase hold, design hold, active journey step | `--clay-ink` | `#7C5E30` | state is an ink word (§G) |
| `--warm` | `#ece6da` | product plate ground | `--bg-warm` | `#EEE6DB` | |
| `--wash` | `#ece9df` | released stage, bulk bar, table head, disabled button | `--doc-sheet-2` | `#EFE9DD` | table heads inside the embedded BuildRoom keep the drafting stock's `--sheet-head` |
| `--oak` | `#ba9470` | plate/illustration pigment | `--oak` | `#8B7355` | non-text only (N-14) |
| care-return bar | `#334a3f` + `#fff` | floating return bar | `--color-forest-press` ground + `--ink-paper` | `#334539` / `#FAF7F2` | 9.58:1 |
| toast | `--ink` + `--insert` | transient confirmation | `--ink` + `--ink-paper` | | 13.53:1 |
| decorative numerals/initials | `#a5ad9d`, `#a2aa9a` | brief number 65px, large initials 48px | `aria-hidden` decoration, or `--ink-faint` if it carries meaning | | 2.13 and 2.20:1 in the reference: decoration only |

**Not ported (reference-only).**

- `notes.css`: the founder notes instrument, with `--nt-*` and `#1f3a2c` / `#f8f6f0` / `#fffdf8`.
- `review.css`, `.study-strip` and `.mockup-ribbon`: the review frame.
- About 60 illustration pigments in `design.css` and `studio.css`. These are the CSS-drawn swatches, the
  lighting figure, drawings, `.material-ribbon` and `.piece-plate .illustration`.

Production imagery is real: board and proposal covers, scans and drawings (DESIGN-CONTRACT; "Studio plate
images" recommendation).

### 2.2 The new token: survey blue

The approved direction names survey blue as a working accent. No production pigment is close:
`--color-dusty-blue-ink` `#556B82` is hue 210°, while survey blue is hue 197°. It follows the F56
pigment/ink split.

- `--color-survey-blue: #58717B`
  - **Status:** pigment.
  - **Use:** non-text marks for survey and drawing provenance: a scan or measured-plate edge, the 3px
    draft-issue tick, and the uncertain-measurement mark.
  - **Never:** approval or hold state (forest/ink words do that), focus, or fill behind text.
- `--color-survey-blue-ink: #4E6770`
  - **Status:** text grade.
  - **Use:** the "survey, not installed" caption, measured figures and the drawing-issue word.

Both are declared in `:root`'s palette beside `--color-dusty-blue-ink`, so `contrast.test.ts` measures the
`-ink` automatically. The new names do not end in `-ink` except that one hex.

- **Dark companion:** deferred. No dark paper set is painted, matching the current policy.
- **On charcoal:** the pigment reads 2.80:1 on charcoal, so neither token is used on a charcoal ground.

### 2.3 Contrast

| Pair | Ratio | Need | Result |
|---|---|---|---|
| `--ink` on `--paper` / `--paper-doc` / `--color-green-record` / `--doc-sheet-2` / `--bg-warm` | 13.53 / 13.87 / 12.27 / 11.96 / 11.69 | 4.5 | pass |
| `--ink-faint` on `--paper` / `--paper-doc` / white / `--color-green-record` / `--doc-sheet-2` / `--bg-warm` / `--rail` | 6.35 / 6.51 / 6.79 / 5.76 / 5.62 / 5.49 / 5.32 | 4.5 | pass |
| `--color-forest` (text) on `--paper` / `--paper-doc` / `--color-green-record` / `--doc-sheet-2` / `--rail` | 7.96 / 8.16 / 7.22 / 7.04 / 6.66 | 4.5 | pass |
| `--terracotta-ink` on `--paper` / `--paper-doc` / `--color-green-record` / `--bg-warm` | 5.28 / 5.41 / 4.78 / 4.56 | 4.5 | pass (bg-warm is the binding ground) |
| `--clay-ink` on `--paper` / `--color-green-record` / `--rail` | 5.61 / 5.09 / 4.70 | 4.5 | pass |
| **new** `--color-survey-blue-ink` on `--doc-paper` / off-white / white / red-letter `#F9F3EE` / note band `#F8F0EA` | 5.76 / 5.62 / 6.00 / 5.46 / 5.33 | 4.5 | **pass: all five `contrast.test.ts` grounds** |
| **new** `--color-survey-blue-ink` on `--color-green-record` / `--rail` / reference survey plate `#eaf0ee` | 5.09 / 4.70 / 5.20 | 4.5 | pass |
| **new** `--color-survey-blue` (non-text) on `--paper` / `--paper-doc` / `--color-green-record` / `--rail` | 4.84 / 4.96 / 4.38 / 4.05 | 3 | pass as a mark. **Fails 4.5 as text on green-record and rail, so it is never text** |
| `--ink-paper` on `--ink` (plate) / `#1F1D1A` (plate hover) | 13.53 / 15.73 | 4.5 | pass |
| `--ink-paper` on `--color-forest` (terminal) / `--color-forest-press` (return bar) | 7.96 / 9.58 | 4.5 | pass |
| `--focus-ring` (`#7C5E30`) on `--paper` / `--paper-doc` | 5.61 / 5.75 | 3 (non-text) | pass |
| `--color-forest` tick (2–3px) on `--paper` | 7.96 | 3 | pass |
| `--hairline-strong` on `--paper` / `--paper-doc` | 1.48 / 1.52 | n/a | **structure only**. A control or claim boundary uses `--card-edge` (3.13 / 3.21) |
| reference moss `#4c624f` against production forest `#3E5145` | 1.28 | n/a | this is why a moss fill would read as the forest terminal (§6) |

The reference's own pairs, for comparison:

| Pair | Ratio | Result |
|---|---|---|
| ink on paper | 12.43 | pass |
| muted on paper | 5.25 | pass |
| muted on tracing / wash | 4.82 / 4.72 | pass, barely |
| blue as text on tracing | 4.35 | **fails 4.5** |
| moss fill under insert text | 6.57 | pass |
| rule on paper | 1.44 | structure only |

The production mapping removes the one reference failure: blue text on tracing.

## 3. Type

### 3.1 Families

| Reference | Production |
|---|---|
| Playfair (`PlayfairDisplay-Regular/Italic`, 400 only) | `var(--font-display)`, `next/font` Playfair Display. 400 and italic are loaded in `app/layout.tsx` |
| Inter 400/500/600 | `var(--font-body)`, `next/font` Inter (variable) |
| no mono | `var(--font-meta)` (DM Mono) only where an existing identifier or money grammar already uses it: `.t-money` and record numbers. Round-8 secondary text is **Inter**, not `.t-meta` |

### 3.2 Steps

Sizes are the computed px read from the rendered reference. "Prod px" is the computed size at the 18px root,
with its rem for anyone who must write rem.

| Reference (computed) | Where | Production step | Prod px (rem @18) | Weight / tracking / line |
|---|---|---|---|---|
| Playfair 36→68px clamp(36px,4.8vw,68px), −2.4px; phone 40px −1.5px | job title (h1) | **new `.r8-d0`** (scoped, §H-2) | clamp(36px, 4.8vw, 68px) (2–3.778rem) | 400 · **−0.035em** (−2.38px at 68, −1.4px at 40) · 1.15; ≤599px: 40px / 1.12 |
| Playfair 38→58px clamp(38px,4vw,58px), −1.4px | studio title (h1) | **new `.r8-d1`** (scoped) | clamp(38px, 4vw, 58px) (2.111–3.222rem) | 400 · **−0.024em** (−1.39px at 58) · 1.15 |
| Playfair italic 65px / 48px / 52px | brief number, large initials, piece-plate glyph | decorative: `.r8-d0` size, italic, `aria-hidden` | as `.r8-d0` | 400 italic · 0 |
| Playfair 30–34px (studio h2 30, featured job 34, job h2 32 −0.7px, job h3 30/31) | chapter and section heads | `.t-d1` | 34px (1.889rem) | **400 inside round 8** (§H-2), tracking 0 (A3 rule kept below 36px) |
| Playfair 25–29px (h3 25/26/27/28/29) | room, job and register names | `.t-d2` | 26px (1.444rem) | 400 inside round 8 · 0 |
| Playfair 20–24px (h3/h4 22–24, index cover 20) | sub-heads, contents cover | `.t-d3` | 20px (1.111rem) | 400 inside round 8 · 0 |
| Playfair italic 17–25px (deck, notes, room tags, folio) | authorship and asides | `.t-authorship` | 20px (1.111rem) | 400 italic |
| Playfair 36px (account totals) / Inter 24px (job figures) | announced money figure | `.t-d2` per §F-B | 26px | money grammar wins; departure (§8) |
| Inter 17px (funding summary, completion reading) | lead reading line | `.t-body` | 16px (0.889rem) | 400; 500 for the reading word |
| Inter 14px 400/500 | body, row names, skip link | `.t-body-sm` | 14px (0.7778rem) | 400; row names 500 (`font-medium`) |
| Inter 12.8–13.76px (13px is the reference's most common text: links, `dd`, text acts) | primary row text, inline acts | **rises to** `.t-body-sm` | 14px (0.7778rem) | the 14px primary floor (DESIGN-CONTRACT) |
| Inter 12–12.8px (secondary metadata, 98 × 12px on the job) | captions, dates, sub-labels | **new `.r8-small`** (scoped): Inter 12px/1.5, sentence case, tracking 0 | 12px (0.6667rem) | 400; 500 for an emphasised value |
| Inter 9.92–11.52px (contents numbers 10, `small` 10–11, `th` 11/500, labels 11.52 +.06em) | index numbers, smallest metadata | **rises to** `.r8-small` | 12px (0.6667rem) | the 12px floor; table heads inside the embedded BuildRoom keep the drafting stock |
| button labels 11–13px (400 studio, 500 job) | filled and outlined controls | DocumentAction tiers: `plate` Inter 15/600, `secondary` 14/400, `terminal` 16/500 | 15 / 14 / 16px | the action grammar sets control type; no reference size is copied |

### 3.3 Traps WP-01.3 must avoid

- **No reference rem.**
  - Reference rem sizes (`design.css`, `workflow.css`, `notes.css`) are relative to 16px.
  - Convert to px first (rem × 16), then map through the table.
  - Never write the reference rem.
- **No rem-for-px substitution.** 14px is 0.7778rem at the 18px root, not 0.875rem: Tailwind `text-sm` is 15.75px.
- **Negative tracking only on the two new display steps.**
  - Allowed only on `.r8-d0` and `.r8-d1`, which are ≥36px.
  - It is expressed in **em**, so it equals the reference at its design widths and scales with the clamp.
  - A3's "never negative below 40px" stays in force for every other step.
  - At 36–39px the new steps carry −0.035em or −0.024em (−1.3px to −0.9px). That is the only scoped exception (§H-2).

## 4. Spacing, measure and rhythm

Block gaps snap to the house module (12 / 24 / 48 / 72). Composition measures keep the reference's proportions.

| Reference (computed) | Production | Note |
|---|---|---|
| studio `main` max-width 1540px, padding 30px 4% 70px (42px top ≥1700) | `--r8-studio-measure: 1540px`; padding 24px 4% 72px; 48px top ≥1440 | §F-Q's 1200px studio band is lifted for the round-8 studio only (§H-2). Prose stays ≤65ch |
| studio spread `minmax(0,1.7fr) minmax(300px,1fr)`, gap 40 | ≥1440: same columns, gap 48. 1180–1439: `1.5fr 1fr`, gap 24. <1180: one column, imagery first | DESIGN-CONTRACT "imagery stacks before next acts" |
| job paper: `.paper` max 1640, `minmax(0,1fr) 200px`, gap 44 (whole.css overrides job.css's 1520 / 212 / 60) | `--r8-paper-measure: 1640px`; contents margin `--r8-contents: 200px`, gap 48 ≥1440; 176px / gap 24 at 1180–1439; <1180 no margin column (MobileSheets spine sheet) | the effective computed values are 200/44. The contract's "≈212/60" is job.css before the override |
| job head 65px sticky (58px ≤540) | 64px; 56px <600 | 56 matches the R127 band |
| chapter gap 58; chapter head padding 18, gap 18 | chapter gap 48; head padding 24, gap 24 | |
| room row padding 24, gap 22; register row padding 20, gap 22; attention row padding 21, gap 16 | 24 / 24; 24 / 24; 24 / 12 | |
| section heading margin-bottom 22 | 24 | |
| contents row padding 14px 0 14px 25px (47px tall) | padding 12px 0 12px 24px, min-height 44px | target size |
| dense sheet rows (td 8px 6px, th 9px 6px) | unchanged: the embedded BuildRoom's `--row: 40px` / `--head: 48px` | the round-8 frame does not restyle the drafting stock |
| buttons min-height 42–44 | 44px target (DocumentAction) | |

## 5. Rules and radius

| Reference | Production |
|---|---|
| `1px solid var(--rule)` (structure) | `1px solid var(--hairline-strong)`; a row end can use `--rule-hair` |
| `1px solid var(--ink)` on outlined buttons and fields | fields: §A14 fields on paper. Outlined buttons → `secondary` scored word (§6, §8) |
| `1px dashed` / `dotted var(--rule)` | dashed only means "not filled in" (R126). Otherwise a solid hairline |
| `3px double #8c826e` (job) | `.doc-rule-strong` (`--rule-strong` + `--doc-ink-border`): the double rule opens a movement |
| 2px moss left tick (current contents row), 2–3px moss underline (current nav, pressed tab), 3px moss left (pressed thread) | `--color-forest` at `--tick-stage` (2px) or `--edge-stage` (3px) |
| 3px rust left (warning) | `var(--edge-stage) solid var(--terracotta-ink)`: overdue or blocked only |
| 3px blue left (draft issues) | `var(--edge-stage) solid var(--color-survey-blue)` |
| a claim or control boundary needing 3:1 | `--card-edge` (3.13 / 3.21). Never `--hairline-strong` |
| radius `0` everywhere | §A4 unchanged: 2px (marks, small plates, cards, sheets, the plate act), 3px (image plates, terminal). Departure ≤2px (§8) |
| radius 50% (38px profile button) | the portal's existing avatar primitive; §A4's 50% mark-dot rule is unchanged |

## 6. P02: filled controls

**Decision (Kody, 2026-10-23).** Inside `[data-paper-renderer="round8"]` only, round 8's filled navigation and
save controls are allowed. Terminal commercial and signature actions keep their explicit consequence language.
The legacy renderer is unchanged.

**One variant, no new grammar.** A round-8 filled control is the existing `DocumentAction` `variant="plate"`
(US-46 R203: charcoal, "your next step, it never commits"). The existing rules carry over unchanged:
- `LEADER_VARIANTS = ['primary','plate']`;
- one leader per action region;
- the 44px target;
- `--ink-paper` on `--ink`;
- hover `#1F1D1A`;
- disabled on rail stock;
- the forced-colours rules.

**Round-8 geometry override.** This is the only CSS change, in the round-8 block after the scored-ink slice.
The reference fill is 42–44px tall, so round 8 paints the whole target. The ring then sits on paper on both
sides (5.61:1).

```
[data-paper-renderer="round8"] .da-plate::after { inset: 0; }
[data-paper-renderer="round8"] .da-plate:focus-visible::after,
[data-paper-renderer="round8"] .da-plate[data-held-focus-cue]::after { outline-offset: 2px; }
```

Use the same selector list as the legacy focus rule (`globals.css` `.da-plate:focus-visible::after, .da-plate[data-held-focus-cue]::after`). The override must not use `transform`, `background` or
forest, and must not touch `.da-terminal` or `.da-danger`.

### 6.1 Enumerated plate sites

Plates are allowed only at these sites. Production action keys are named by WP-02, WP-03 and WP-04 against
this list.

| # | Surface | Reference control | Kind |
|---|---|---|---|
| 1 | Studio · commission spread cover note | "Open the job paper" | navigate (with origin) |
| 2 | Studio · library product | "Place a draft on ‹job›" | save a draft candidate (never approves or prices) |
| 3 | Studio · resource handoffs (people, correspondence, books, search) | "Open CP-01 on the job", "Read F-07 in the package", "Open the existing job selection", a person's job link | navigate (with origin) |
| 4 | Job · Brief & agreement | "Save proposed arrangement" | save an unsigned proposal |
| 5 | Job · Design | "Save unsent set draft" | save a draft |
| 6 | Job · Cabinetry | "Unfold the build package" | navigate (unfold) |
| 7 | Job · Approvals | "Preview the client's review" | preview (sends nothing) |
| 8 | Job · FF&E | "Unfold the FF&E schedule" | navigate (unfold) |
| 9 | Job · Financials | "Prepare time invoice draft" | prepare an unsent draft |
| 10 | Unfolded instrument foot: one per instrument | "Save group", "Save allowance", "Save change draft", "Move N lines", "Review pasted rows", "Add room to the job", "Prepare client edition" / "Read saved draft", "Save review of N items", "Prepare orders · N selected" (unsent PO drafts), "Save purchase record", "Record site observation", "Print finish schedule" | save, prepare, preview or print |

### 6.2 Never a plate

These stay `terminal` (forest, 48px, money or consequence in the label) or `danger`, each with its §A6
consequence sentence. They also keep V22 draft-first, designer-Send.

- Issue or send an invoice; record a payment.
- Send or authorise a PO to a vendor. Reference: "Record sample dispatch".
- Record a client's decisions or approval. Reference: "Record sample decisions". This uses the existing approval act.
- Sign or accept an agreement, scope edition or final service acceptance.
- Void a draft. Reference: "Void this draft". This is `danger`.
- Anything that sends outside the studio.

"Reset this sample" is reference-only and is not ported.

### 6.3 Label rule

A plate names its place or its draft ("Open the job paper", "Save unsent set draft"). It is never a bare "Save",
"Submit", "Continue" or "Confirm".

### 6.4 Studio fill colour

The reference fills the studio buttons with moss `#4c624f`. Production paints the plate **charcoal** (`--ink`).

- **Reason:** in production a forest-family fill means "commits" (R139 terminal, `--color-forest`
  `#3E5145`), and moss against forest is only 1.28:1, so a moss "Open the job paper" would read as a terminal.
  The reference's own job paper already uses charcoal for its filled primary.
- **Affected users:** the designer on the studio.
- **Acceptance:** WP-01.9 visual evaluation at 1440 and 390.
- **Ratification, non-blocking:** if Kody prefers moss, it is a one-line `background-color` change in the
  round-8 plate override. Moss clears 6.57:1 under `--ink-paper`. The gate (§7.2) would then pin moss instead
  of `--ink`.

### 6.5 Outlined boxes

The reference's outlined `.button` / `.button.secondary` are **not** part of P02. They map to the `secondary`
two-score word (§8).

## 7. P02: shadows and the gate allowlists

### 7.1 Allowed depth

There are exactly two tokens. Both are declared **once**, inside the rule whose selector is exactly
`[data-paper-renderer="round8"]` (never `:root`):

```
--r8-shadow-float: 0 4px 20px rgba(44, 41, 38, 0.13);   /* reference: 0 4px 20px #0002 / 0 4px 22px #302e2a22 / 0 3px 16px #0002 */
--r8-stack-edge:   0 3px 0 var(--doc-sheet-2), 0 4px 0 var(--hairline-strong);   /* reference: 0 3px 0 #ede9de, 0 4px 0 #d9d5ca and kin; zero blur, a flat stacked edge */
```

**Enumerated sites** (frozen inventory). Selector names are proposals for WP-01.3; the *count and token* per
site is the contract.

| Site | Token | Reference selector |
|---|---|---|
| `[data-paper-renderer="round8"] .r8-return-bar` | `--r8-shadow-float` | `.care-return-bar` (the floating return to origin) |
| `[data-paper-renderer="round8"] .r8-toast` | `--r8-shadow-float` | `.toast` / `#toast`. Only if a round-8 transient status layer is built. A failed save never toasts; inline `role="alert"` and `role="status"` lines stay the default |
| `[data-paper-renderer="round8"] .r8-client-review-paper` | `--r8-stack-edge` | `.client-review-paper` (the approvals preview) |
| `[data-paper-renderer="round8"] .r8-set-preview` | `--r8-stack-edge` | `.set-preview` (issued drawing set) |
| `[data-paper-renderer="round8"] .r8-field-copy` | `--r8-stack-edge` | `.field-copy` (the Field work-order copy) |

**Excluded** (illustration or review-only, not ported): `.swatch`, `.lighting-figure`, `.material-ribbon i`,
`.material-ribbon .bronze` and everything in `notes.css`. Legacy stays at zero.

### 7.2 Gate design for WP-01.3

No blanket disable, no `it.skip`, no threshold.

**`shadow-gate.test.ts`**

1. **Walk rules.** Use the comment-stripped rule walk that `action-rest-rules.test.ts` already uses
   (`rules()` → `{selector, body}`). Use it rather than the bare `box-shadow` regex, so each declaration
   knows its selector.
2. **Freeze two constants.**
   - `ROUND8_SCOPE = '[data-paper-renderer="round8"]'`.
   - `ROUND8_SHADOW_SITES`: the five (selector → token) pairs above, as a frozen array.
3. **Allowlist conditions.** In `globals.css`, a non-`none` `box-shadow` is allowlisted only when all of
   these hold:
   - (a) every comma-separated selector of its rule starts with `ROUND8_SCOPE`;
   - (b) its value is exactly `var(--r8-shadow-float)` or `var(--r8-stack-edge)`;
   - (c) its (selector, token) pair is in `ROUND8_SHADOW_SITES`.
4. **Exact equality.** Assert that the allowlisted pairs **equal** the frozen array, so a new site fails until
   the array and SPEC §H change together.
   - Remaining (non-allowlisted) shadows in `globals.css` → `[]`.
   - Every other stylesheet under `src/` → `[]`, unchanged.
5. **Pin the token values.** Assert the two declarations byte for byte, and that each is declared exactly
   once, inside the rule whose selector is exactly `ROUND8_SCOPE`. `--r8-stack-edge` must have zero blur and
   no `inset`.
6. **Unchanged assertions.** These stay as they are:
   - drop-shadow / `filter: …shadow…` is zero everywhere, with no exception;
   - the `--elevation-sheet` / `.doc-elevated` retirement;
   - the S1 depth-ladder pins.
7. **ESLint D4 unchanged.** No `shadow-*` utility or inline `boxShadow` in any TSX, round-8 files included.
   Round-8 components get depth only by wearing the enumerated class names.

**`document-action-hierarchy-contract.test.ts`** (new `describe("P02 round-8 plate (Kody 2026-10-23)")`)

1. **The block exists.** A delimited block, `/* Round 8 paper renderer (P02)` … `/* end Round 8 paper renderer */`,
   exists after the scored-ink slice. `scoredInkBlock` does not contain `data-paper-renderer`. So every existing
   R203 / R5 assertion still reads the legacy rule unchanged, and they all remain as written.
2. **Selectors.** Every selector in that block starts with `[data-paper-renderer="round8"]`.
3. **Plate rules.** Its `.da-plate` rules declare only `inset: 0` on `::after` and `outline-offset: 2px` on the
   focus rule.
   - It contains no `background`, `forest` or `transform`.
   - It has no `.da-terminal`, `.da-danger` or `.da-primary` selector, so the terminal and scored grammar is
     identical in round 8.
4. **Round-8 plates.**
   - Scope: round-8 source files (`components/document/paper/**`, `components/document/studio/**`).
   - Each `variant="plate"` carries an `actionKey` listed in a frozen `ROUND8_PLATE_SITES` map (file → keys)
     that mirrors §6.1.
   - No such `actionKey` matches `/send|issue|pay|sign|accept|authori[sz]e|dispatch|void|approve/`.
   - Each action region in those files has ≤1 leader (`primary|plate`), using the existing `actionRegion()`
     helper.
5. **Terminals in round-8 files.** Every `variant="terminal"` in those files sits in a region that renders the
   §A6 consequence sentence. This proves that terminal commercial and signature acts keep their consequence
   language.
6. **Legacy unchanged.**
   - LensBand still prints exactly two plates.
   - The dock is unchanged.
   - People, Desk and the other legacy heads keep their current leader counts.

**`contrast.test.ts`.** No allowlist is needed. `--color-survey-blue-ink` is measured by the existing sweep.

WP-01.3 may add one explicit row: survey-blue-ink ≥4.5:1 on `--color-green-record` and `--rail`. These are
grounds the sweep does not cover, and §2.3 shows 5.09 and 4.70.

## 8. Breakpoints

| Reference | Production | What moves there |
|---|---|---|
| min-width 1400 / 1600 / 1700 | `@media (min-width: 1440px)` | wide gaps (48), 200px contents margin, 1.7fr/1fr spread, studio top padding 48 |
| max-width 1100 / 1150 / 1180 / 1200 | `@media (max-width: 1179px)` (compact; MobileShellProvider) | contents margin → spine sheet; head context hides |
| max-width 800 / 850 | `@media (max-width: 1179px)` for structure: paper single column, desk spread single column (imagery first), contents hidden | One compact regime, so 768 and 1024 are compact tests (DESIGN-CONTRACT) |
| (same) | component reflow inside 600–1179 | 2-up person, thread and product lists; 3-up attention list |
| max-width 680 / 600 / 560 / 540 / 420 | `@media (max-width: 599px)` | phone: job title 40px; head 56px; single-column forms; price table becomes cards; register 3 columns |

The desktop band 1180–1439 uses the 1.5fr/1fr spread, the 176px margin and 24px gaps.

WP-01.10 verifies 320, 390, 768, 1024, 1179/1180/1181, 1439/1440/1441 and 1920, plus 200% zoom.

## 9. Departures from the reference

Each departure lists its reason and the test that checks it.

| Departure | Reason | Acceptance |
|---|---|---|
| Studio filled buttons: moss → charcoal plate | the forest fill means commit (§6) | WP-01.9 visual + this gate |
| Outlined boxes → `secondary` scored word | P02 covers filled controls only. A boxed outline is not house grammar | WP-01.9 visual. If it reads too weak, that is a P02 extension for Kody |
| Focus ring: blue → `--focus-ring` (clay-ink) | US-43 F-F single focus ink, gated | existing contrast and hierarchy tests |
| 10–13px text → 12 / 14px floors | DESIGN-CONTRACT floors | G2 jest + visual |
| Announced money figure 36px → `.t-d2` 26px | §F-B one-family money rule | visual |
| Radius 0 → 2 / 3px | §A4, imperceptible at review distance | visual |
| Spacing snapped to 12 / 24 / 48 / 72 | §A4 module | visual at listed widths |
| Survey plate `#eaf0ee` → `--color-green-record` | no fourth light stock | contrast table |

## 10. As implemented (WP-01.3, SQ-1821, 2026-10-23)

Story decision #5 moved the scoped block out of `globals.css`. This section records where each piece landed.
SPEC §H-4 records the same correction.

- **`apps/designer-portal/src/components/document/paper/round8.css`.** Every rule here starts with
  `[data-paper-renderer="round8"]`. Only the round-8 frame and the studio body import this file, and it has
  no importer until WP-01.4a/01.5. It holds:
  - the depth tokens `--r8-shadow-float` and `--r8-stack-edge` (§7.1), declared once on the scope rule;
  - the measures: `--r8-studio-measure: 1540px` and `--r8-paper-measure: 1640px`;
  - `--r8-contents` (176px, or 200px from 1440px), `--r8-paper-gap` (24px, or 48px from 1440px) and
    `--r8-head` (64px, or 56px below 600px);
  - the type steps `.r8-d0`, `.r8-d1` and `.r8-small`;
  - Playfair 400 on `.t-d1`, `.t-d2` and `.t-d3`;
  - the two plate geometry declarations (§6);
  - the five shadow sites (§7.1).
- **`globals.css`** gains only `--color-survey-blue` and `--color-survey-blue-ink` at `:root`, beside
  `--color-dusty-blue-ink`.
- **Gates.**
  - **`shadow-gate.test.ts`.** The exact five-pair inventory, restricted to `round8.css`. It pins both token
    values, checks for zero blur and no `inset`, and checks that neither token is declared anywhere else.
    Every other stylesheet, `globals.css` included, stays at zero.
  - **`document-action-hierarchy-contract.test.ts`.** `ROUND8_PLATE_SITES` (file → actionKeys) is frozen
    **empty**. WP-02, WP-03 and WP-04 add each key against §6.1 as they build it.
  - **The consequential-verb check.** It is anchored to the start of a kebab segment, so `design` does not
    read as `sign`.
  - **Variants are spelled literally.** Round-8 files write `variant="plate"` and `variant="terminal"`
    literally. No computed variant and no ledger entry, so the gate can read them.
  - **Terminals.** A round-8 terminal carries `aria-describedby` pointing at its §A6 sentence, and that
    element is rendered in the same file.
  - **`contrast.test.ts`.** Every §2.3 text and mark pair is measured. A sweep also checks that the survey
    pigment is never spent as text.
