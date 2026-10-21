# Design brief: the homeowner page, adjusted (US-44)

Lead: SQ-1508. Screen designers: SQ-1509 (A), SQ-1510 (B), SQ-1511 (C). Review: SQ-1512.
This file is the contract. Build only from it, the spec
(`docs/specs/_active/client-portal-homeowner-usability.md` in the design worktree) and the canvas
format (`inputs/canvas-format/SKILL.md`, `artifact-type/reference/format.md`). Where this brief and
the spec disagree, the spec wins; report it rather than picking.

Frozen today: **Tuesday, 20 October 2026**. Every date on every board is written long: `2 November 2026`.

---

## 1. The merge rule

**Structure, behavior and anything they rule come from the house sheet
(`docs/design/house-sheet/SPEC.md`, with §F/§G amendments), R139–R141, the live client-portal CSS
(`apps/client-portal/src/app/globals.css`) and the spec. The Patina Design System supplies the feel
where those are silent or agree:** the three type voices, the warm palette, the Strata Mark, the
italic accent on names, and the hairline rhythm. Where the DS README contradicts a ruling (it is stale
on "AI", a fixed top bar, a mobile tab bar, counts, progress numerals) the ruling wins.

Readability floors (R140, CPUX-07) outrank both sources: if any value below would put money, a date,
a party name or a consequence under 15px, or any text under 4.5:1, the floor wins.

Artboards use **inline literal values only**, never `var()`. The checker fails `var(--` inside
`style="…"`.

Fonts, the only network line allowed, inside `<helmet>`:

```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Real weights only (Playfair 400/500 + italic 400, Inter 400/500/600, DM Mono 400/500). Never ask for 700.

### 1.1 Conflicts resolved

| # | Conflict | Resolution | Why |
|---|---|---|---|
| C1 | DS `--text-muted` = Aged Oak #8B7355 for text | Oak is a **rule pigment only** (resting score under quiet acts, 4.20:1 as non-text). Muted text uses Oak ink #4E4339 or Ink subtle #5A4E43 | 4.20:1 fails 4.5:1 for text (client CSS `W1-04` already moved off it) |
| C2 | DS "Clay is the only interactive accent" (and client `a { color: clay }`) | Clay is **never text** and **never the only affordance**: second score of the secondary act, hover score, Strata Mark. Links are ink words with an oak rule. Focus ring is Clay ink #7C5E30 | Clay on Off-White 2.18:1 fails text and the 3:1 non-text floor |
| C3 | DS italic accent in Aged Oak | Italic Playfair names in **Mocha #5C4A3C** (7.86:1) | Keeps the DS voice, passes at 17–20px |
| C4 | DS display tracking −0.02em, weight 400; body line-height 1.7; meta always UPPERCASE | House sheet: Playfair 500, tracking 0 (≤40px); body 1.55; `.t-meta` sentence case, only `.t-head` is uppercase | House sheet §A3 rules type |
| C5 | DS radius-lg 8px for media; DS "no pills" vs production rounded Strata lines | 2px marks/fields, 3px terminal act and image plates, nothing else. Strata lines keep a 1px end radius (a line, not a pill) | House §A4 |
| C6 | DS buttons Inter 13.6px; DS green success, red error | R139 terminal: charcoal, Inter 500 16px, amount in label. No green fill, no red anywhere | R139, R141 §5, spec |
| C7 | House `.t-head` 12px (§G-6) vs client CSS 11px | **12px** | Later amendment; nearer the floor |
| C8 | House `.consequence` 15px vs R141 "one sentence, `.t-body`" | **16px** Inter, ink, 56ch | R141 + CPUX-07 body 16; still above the 15 floor |
| C9 | House overdue word in Terracotta ink (§G-13) | Due status in **ordinary body ink**: `Past due · 25 September 2026` | Spec CPUX-03.1 rules it for this surface |
| C10 | House field label = `.t-head` 11px caps; field "held" state = 2px terracotta rule | Label Inter 15px/500 ink, sentence case; unmet input = neutral helper text + focus, no red, no `aria-invalid` styling on untouched fields | CPUX-04.4, CPUX-07 |
| C11 | R201 action labels: lead 15/500, tools 14/400 | Secondary lead 15/500 (as R201). Quiet tools **15/400** and ledger links **16/500** | 15px floor on labels that carry party names ("Contact Maren Holt"); findability for a low-confidence reader. **Flagged F2** |
| C12 | House hairline #E8E3DB vs DS/client Pearl #E5E2DD (doorplate rule) | **#E8E3DB** everywhere | House rules the token; the two are 1.01:1 apart |
| C13 | House §G permits a framed Card/sheet; production payment details open in a framed white sheet; brief and DS say no cards | No frame. An opened region is **Document stock #FCFAF6 between two hairline-strong rules** | Brief hard don't. **Flagged F4** |
| C14 | House doorplate `.t-d1` 34px vs production doorplate `clamp(2.1rem, 4.6vw, 3.5rem)` | Phone 34px tracking 0; desktop (≥1200) 56px/1.14, tracking −0.012em | Live client CSS rules structure; negative tracking only above 40px |
| C15 | DS UI kit: sticky client header with counts, project rows with a large progress numeral | Rejected | R135/R141 (no header), spec (no badges, no percentages) |
| C16 | House stamp (§A7) vs DS "no badges" | A stamp appears **only** inside an A9 record block (Approval-States), border pigment, no fill. Never on a list row | It is the record of a taken act, not a status chip |

### 1.2 Founders' rulings flagged (not picked silently)

- **F1** House words on section heads: this brief uses literal heads (Invoices, Approvals, Progress) and keeps the house only in composition (doorplate, letterbox drawing, colophon). Keep any house words as running heads?
- **F2** Quiet tools at 15px and ledger links at 16px are 1–2px above R201. Rule it in for client pages, or hold R201?
- **F3** Ledger order: `Invoices · Approvals · Progress · Updates · Documents · Contact Maren Holt`. Money first, or the highest-priority ask first?
- **F4** Payment details: today's framed white sheet, or document stock between two rules (this brief)?
- **F5** Approve is the charcoal terminal (it is signed). Send change request and Confirm pause stay two-score and still held for 900 ms. Agree?
- **F6** Studio-only purpose sentence (spec gives none): `Pay your studio invoices and review agreements here.`
- **F7** The §13 click-to-confirm comparison stays deferred. Commission the separate prototype test?
- **F8** Italic names move from the DS's Aged Oak to Mocha (C3). Is Mocha still the accent wanted?

**Ruled 2026-10-20 (US-45)**

- **F1:** Use the literal section heads Invoices, Approvals, and Progress; house wording stays in composition, not section titles.
- **F2:** Rule in 15px quiet tools and 16px ledger links on client pages.
- **F3:** Keep the canvas order: Invoices · Approvals · Progress · Updates · Documents · Contact Maren Holt.
- **F4:** Use the framed card and payment sheet treatment from A3: `#FFFDF9` fill, `#C9C7BD` rule, 8px radius, soft shadow.
- **F5:** Terminal acts use forest with `#FFFDF9` ink; choices outline in green and fill when selected. Keep the 900 ms hold for binding acts.
- **F6:** Use the studio-only purpose sentence: “Pay invoices, review approvals, and follow your project here.”
- **F7:** Keep click-to-confirm deferred; retain the 900 ms hold.
- **F8:** Use forest instead of clay for client-page links, italic party names, focus, and selected states. Studio branding is unchanged.

The canvas carries these as one "For the founders" sticky per row, plus row-specific questions the
screen designers will meet (history open by default, wording of `Total outstanding`, note placement
on the invitation, `Target date`, where `Waiting on you` appears).

---

## 2. Tokens (literal values)

### 2.1 Colour

| Token | Hex | On Off-White | Use | Source |
|---|---|---|---|---|
| Off-White (paper) | `#FAF7F2` | ground | page ground, `body` background | DS + house + client |
| Document stock | `#FCFAF6` | 1.01 | opened region, field ground | house §A1 |
| Rail | `#E8E3DB` | 1.20 | unavailable terminal ground, empty-state floor | house |
| Hairline | `#E8E3DB` | 1.20 | structure rules, row separators | house |
| Hairline strong | `rgba(44, 41, 38, .14)` (≈ `#DDDAD5`) | 1.30 | money rule, totals rule, field box, region rules | house + client |
| Charcoal (ink) | `#2C2926` | **13.53** | body, money, dates, names, terminal fill | all three |
| Oak ink (ink muted) | `#4E4339` | **8.99** | secondary prose, purpose sentence | client `--color-oak-ink` = house `--ink-muted` |
| Ink subtle | `#5A4E43` | **7.54** | meta, running heads, quiet act text | house |
| Ink faint | `#65594E` | **6.35** | faint text, unavailable label, drawing strokes, field baseline | house + client `--color-quiet-ink` |
| Mocha | `#5C4A3C` | **7.86** | italic names, Strata line 1 | DS |
| Aged Oak | `#8B7355` | 4.20 | **rule pigment only** (non-text ≥3:1) | DS + house |
| Clay | `#C4A57B` | 2.18 | second score, hover score, Strata lines 2–3 (decor) | DS |
| Clay ink | `#7C5E30` | **5.61** | focus ring; accent text if ever needed | house + client |
| Paper on charcoal | `#FAF7F2` on `#2C2926` | **13.53** | terminal label | house |
| Charcoal hover | `#1F1D1A` | 15.73 vs label | terminal hover | house |

Not used on these boards: Pearl as text (1.21), Terracotta/Sage/Dusty blue/Golden pigments (2.0–2.6),
DS `--color-success #7A9B76` (2.90), DS `--color-error #C77B6E` (3.03), white `#FFFFFF` surfaces,
Terracotta ink, any green or red.

### 2.2 Contrast: failing pairs and their substitutes

Computed with the WCAG 2 relative-luminance formula.

| Failing pair | Ratio | Substitute | Ratio |
|---|---|---|---|
| Aged Oak `#8B7355` text on Off-White | 4.20 | Oak ink `#4E4339` / Ink faint `#65594E` | 8.99 / 6.35 |
| Aged Oak text on Document stock | 4.30 | Oak ink `#4E4339` | 9.22 |
| Clay `#C4A57B` text or link on Off-White | 2.18 | Clay ink `#7C5E30` text; links = Charcoal + Oak rule | 5.61 / 13.53 |
| Clay as the only non-text affordance | 2.18 (<3) | Oak rule `#8B7355` (4.20) or Charcoal score; Clay rides as a second score | — |
| Pearl `#E5E2DD` text (DS `--text-subtle`) | 1.21 | Ink faint `#65594E` | 6.35 |
| Aged Oak text on Rail | 3.51 | Ink faint `#65594E` on Rail | 5.32 |
| DS success green / error red on Off-White | 2.90 / 3.03 | Status in words, Charcoal ink | 13.53 |
| Clay ink focus ring against the charcoal fill | 2.41 | Ring sits 2px outside the act, on paper: Clay ink vs Off-White | 5.61 |

Passing pairs used: Charcoal 13.53, Oak ink 8.99, Mocha 7.86, Ink subtle 7.54, Ink faint 6.35,
Clay ink 5.61 (all on Off-White); Ink faint on Rail 5.32; Paper on Charcoal 13.53.

### 2.3 Type

| Role | Family / stack | Size / line | Weight | Tracking / case | Ink | Source |
|---|---|---|---|---|---|---|
| Doorplate title, phone | `'Playfair Display', Georgia, 'Times New Roman', serif` | 34px / 1.15 | 500 | 0 / sentence | `#2C2926` | house `.t-d1` |
| Doorplate title, desktop | same | 56px / 1.14 | 500 | −0.012em | `#2C2926` | client doorplate |
| Section head, announced money figure | same | 26px / 1.2 | 500 | 0 | `#2C2926` | `.t-d2` |
| Item / approval name | same | 20px / 1.3 | 500 | 0 | `#2C2926` | `.t-d3` |
| Ledger-row name (invoice title) | same | 17px / 24px | 500 | 0 | `#2C2926` | `.t-d4` (§G-7) |
| Authorship (designer's signature line, names in prose) | same, italic | 20px / 1.3 | 400 italic | 0 | `#5C4A3C` | `.t-authorship` + DS accent |
| Body, instructions, state sentences | `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` | 16px / 1.55 | 400 | 0 | `#2C2926` (`#4E4339` secondary) | `.t-body` |
| Consequence sentence | Inter | 16px / 1.55, max-width 56ch | 400 | 0 | `#2C2926` | R141 (C8) |
| Dense non-critical prose | Inter | 14px / 1.5 | 400 | 0 | `#4E4339` | `.t-body-sm` (never money/date/party/consequence) |
| Money, invoice number, dated figures in rows | `'DM Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace` | 15px / 1.5, `font-variant-numeric: tabular-nums` | 400 | .02em / sentence | `#2C2926` | `.t-money` |
| Metadata (captions outside the screen, non-critical sub-labels; any money, date or party name is 15px / 1.5, .02em, like the doorplate) | DM Mono | 12px / 1.5 | 400 | .08em / sentence | `#5A4E43` | `.t-meta` |
| Running head / eyebrow | DM Mono | 12px / 16px | 500 | .08em / UPPER | `#5A4E43` | `.t-head` (C7) |
| Terminal label | Inter | 16px / 20px, tabular | 500 | 0 / sentence | `#FAF7F2` on `#2C2926` | R139 |
| Secondary label (one per section) | Inter | 15px / 20px | 500 | 0 / sentence | `#2C2926` | R201 |
| Quiet label | Inter | 15px / 20px | 400 | 0 / sentence | `#5A4E43` | R201 + C11 |
| Ledger link | Inter | 16px / 20px | 500 | 0 / sentence | `#2C2926` | C11 |
| Field label | Inter | 15px / 1.4 | 500 | 0 / sentence | `#2C2926` | C10 |
| Field value | Inter | 16px / 1.55 | 400 | 0 | `#2C2926` | house §A14 |

Mono caps (`.t-head`) are metadata only: never a due date, amount, name or instruction.

### 2.4 Rhythm, radius, measure

| Thing | Value | Source |
|---|---|---|
| Vertical module | 24px; block gaps 12 / 24 / 48 / 72 only | house §A4 |
| Inline gaps | 8px (icon to word), 24px (between ledger links), 16px (method rows) | house / DS spacing |
| Phone gutter | 24px each side at 390 (content 342px) | production |
| Desktop measure | content `max-width: 1100px` centred; prose `max-width: 65ch`; ledger tables `max-width: 56ch` (figures right-aligned to the table's own rule) | house §A4, §F-I |
| Radius | 2px fields and marks; 3px terminal act and image plates; nothing else | house §A4 |
| Hairline | `1px solid #E8E3DB`; money/totals rule `1px solid rgba(44, 41, 38, .14)` | house |
| Targets | every control `min-height: 44px` (terminal 48px), `min-width: 44px` | R139 / CPUX-07 |
| Focus | `outline: 2px solid #7C5E30; outline-offset: 2px` on every focusable | house §A5 |
| Shadows, gradients, translucency | none | house §A4, DS |

---

## 3. Component recipes

Copy these. Each names the live component it maps to. Values are literal. In a mock, show focus with
the focus ring drawn inline on the one control that represents focus.

### 3.1 Strata Mark (`components/strata-mark.tsx`, mini) and divider (full)

```html
<div aria-hidden="true" style="display: flex; flex-direction: column; gap: 4px; padding: 32px 0">
  <div style="height: 1.5px; width: 60px; border-radius: 1px; background: #5C4A3C"></div>
  <div style="height: 1.5px; width: 48px; border-radius: 1px; background: #C4A57B; opacity: 0.7"></div>
  <div style="height: 1.5px; width: 36px; border-radius: 1px; background: #C4A57B; opacity: 0.35"></div>
</div>
<!-- divider between major regions (full variant) -->
<div aria-hidden="true" style="display: flex; flex-direction: column; gap: 6px; padding: 48px 0">
  <div style="height: 2px; width: 100%; border-radius: 1px; background: #5C4A3C"></div>
  <div style="height: 2px; width: 80%; border-radius: 1px; background: #C4A57B; opacity: 0.7"></div>
  <div style="height: 2px; width: 60%; border-radius: 1px; background: #C4A57B; opacity: 0.35"></div>
</div>
```

Mini opens every page (above the doorplate). Use the full divider at most once per page (before the
mat). It is decoration: `aria-hidden`.

### 3.2 Doorplate + purpose sentence (`threshold/doorplate.tsx`, house §A8)

```html
<header id="doorplate" style="padding: 0 0 12px; border-bottom: 1px solid #E8E3DB">
  <p style="margin: 0; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 18px; font-family: 'DM Mono', 'SF Mono', ui-monospace, monospace; font-size: 15px; line-height: 1.5; letter-spacing: .02em; color: #5A4E43">
    <span>Birchwood Studio · Madison, Wisconsin</span><span>Prepared for June Brennan</span>
  </p>
  <h1 style="margin: 12px 0 4px; font-family: 'Playfair Display', Georgia, serif; font-size: 34px; line-height: 1.15; font-weight: 500; color: #2C2926">Elm Street House</h1>
  <p style="margin: 0; font-family: 'DM Mono', 'SF Mono', ui-monospace, monospace; font-size: 15px; line-height: 1.5; letter-spacing: .02em; color: #5A4E43">Procurement · October 2026</p>
</header>
<p style="margin: 24px 0 0; max-width: 56ch; font-family: 'Inter', -apple-system, sans-serif; font-size: 16px; line-height: 1.55; color: #4E4339">Pay invoices, review approvals, and follow your project here.</p>
```

The right head slot renders nothing when the name is unknown. No Patina wordmark on a client page.

### 3.3 Landmark ledger, evolved (`threshold/landmark-ledger.tsx`)

```html
<nav aria-label="On this page" style="margin: 24px 0 0; padding: 2px; display: flex; flex-wrap: wrap; column-gap: 24px; row-gap: 0">
  <a href="#letterbox" style="display: inline-flex; align-items: center; min-height: 44px; font-family: 'Inter', -apple-system, sans-serif; font-size: 16px; line-height: 20px; font-weight: 500; color: #2C2926; text-decoration: underline; text-decoration-color: #8B7355; text-decoration-thickness: 1px; text-underline-offset: 6px">Invoices</a>
  <!-- Approvals → #approval-<id> (first ask), else #approvals (honest empty) · Progress → #road ·
       Updates → #note · Documents → #mat-papers · Contact Maren Holt → #contact -->
</nav>
```

Under the doorplate, inside the page, scrolls with it. Descriptive words only: no icon-only links,
no counts in the links, no badges. A landmark whose target does not render is omitted (or, for the
three primary ones, points at the honest empty/explanation block). At 390 it wraps to 2–3 lines.

### 3.4 Section head (house `.t-head` eyebrow + `.t-d2`)

```html
<section id="letterbox" aria-labelledby="invoices-h" style="padding: 48px 0 0">
  <p style="margin: 0 0 12px; font-family: 'DM Mono', 'SF Mono', ui-monospace, monospace; font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: #5A4E43">Elm Street House and studio</p>
  <h2 id="invoices-h" style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 26px; line-height: 1.2; font-weight: 500; color: #2C2926">Invoices</h2>
</section>
```

The `h2` is the literal destination name. The eyebrow carries the scope. Group heads inside a section
(`Invoices to pay`, `Payment history`) are `h3` at 20px Playfair 500.

### 3.5 Hairline row: invoice row anatomy (`letterbox.tsx` / `earlier-invoices.tsx`)

```html
<li style="list-style: none; padding: 16px 0; border-bottom: 1px solid #E8E3DB; display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 16px; row-gap: 4px">
  <p style="margin: 0; font-family: 'Playfair Display', Georgia, serif; font-size: 17px; line-height: 24px; font-weight: 500; color: #2C2926">Sofa deposit</p>
  <p style="margin: 0; text-align: right; font-family: 'DM Mono', 'SF Mono', ui-monospace, monospace; font-size: 15px; line-height: 24px; letter-spacing: .02em; font-variant-numeric: tabular-nums; color: #2C2926">$300.00</p>
  <p style="margin: 0; font-family: 'DM Mono', 'SF Mono', ui-monospace, monospace; font-size: 15px; line-height: 1.5; letter-spacing: .02em; color: #2C2926">INV-2026-017 · Elm Street House</p>
  <p style="margin: 0; text-align: right; font-family: 'DM Mono', 'SF Mono', ui-monospace, monospace; font-size: 15px; line-height: 1.5; letter-spacing: .02em; color: #5A4E43; font-variant-numeric: tabular-nums">of $800.00</p>
  <p style="margin: 0; grid-column: 1 / -1; font-family: 'Inter', -apple-system, sans-serif; font-size: 16px; line-height: 1.55; color: #2C2926">Due 2 November 2026 · $500.00 paid</p>
  <div style="grid-column: 1 / -1">
    <!-- disclosure control, 3.9 -->
  </div>
</li>
```

Order: title (or the number when untitled) · remaining amount · number and origin (`Elm Street House`
or `Birchwood Studio`) · written due/payment status in body ink · `View invoice`. No colour carries
status. The amount is the remaining balance; a partial shows `of {total}` and `{paid} paid`.

### 3.6 Terminal act, R139 (`instruments/scored-action.tsx` `variant="terminal"`, `HoldAction` for approve)

```html
<p style="margin: 0 0 12px; max-width: 56ch; font-family: 'Inter', -apple-system, sans-serif; font-size: 16px; line-height: 1.55; color: #2C2926">The next screen shows the amount and asks you to confirm. Nothing is charged until you confirm there.</p>
<button type="button" style="display: inline-flex; align-items: center; justify-content: center; min-height: 48px; min-width: 44px; padding: 13px 22px; border: 0; border-radius: 3px; background: #2C2926; color: #FAF7F2; font-family: 'Inter', -apple-system, sans-serif; font-size: 16px; line-height: 20px; font-weight: 500; font-variant-numeric: tabular-nums; cursor: pointer">Continue to secure payment · [total from quote]</button>
<!-- unavailable: still focusable, never `disabled` -->
<button type="button" aria-disabled="true" aria-describedby="why-1" style="display: inline-flex; align-items: center; min-height: 48px; padding: 12px 21px; border: 1px solid rgba(44, 41, 38, .14); border-radius: 3px; background: #E8E3DB; color: #65594E; font-family: 'Inter', -apple-system, sans-serif; font-size: 16px; line-height: 20px; font-weight: 500; cursor: not-allowed">Approve this edition · $7,480.00</button>
```

Charcoal only where money moves or a paper is signed. Amount inside the label. The consequence sentence
sits directly above in **every** state (armed, unavailable, loading). Loading swaps the label
(`Opening payment`), keeps the fill, no spinner. Never `opacity`. A held act carries the caption
directly under it at 15px Inter `#4E4339`: `Press and hold to approve this edition.`

### 3.7 Secondary act (two-score) and quiet act (resting rule)

```html
<!-- secondary: the section's one scored lead -->
<button type="button" style="display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; padding: 4px 2px; border: 0; background: none; font-family: 'Inter', -apple-system, sans-serif; font-size: 15px; line-height: 20px; font-weight: 500; color: #2C2926; cursor: pointer"><span style="display: inline-block; padding-bottom: 2px; border-bottom: 1px solid #C4A57B"><span style="display: inline-block; padding-bottom: 2px; border-bottom: 1.5px solid #2C2926">Send change request</span></span></button>
<!-- quiet: tools, disclosure, navigation -->
<a href="#note" style="display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; padding: 0 2px; font-family: 'Inter', -apple-system, sans-serif; font-size: 15px; line-height: 20px; font-weight: 400; color: #5A4E43; text-decoration: underline; text-decoration-color: #8B7355; text-decoration-thickness: 1px; text-underline-offset: 6px">Past updates</a>
<!-- inline: inside a sentence, inherits the sentence -->
<a href="#approval-sofa-e2" style="color: inherit; text-decoration: underline; text-decoration-color: #8B7355; text-decoration-thickness: 1px; text-underline-offset: 3px">the sofa edition</a>
```

Secondary = charcoal word, 1.5px charcoal score plus a 1px clay second score under it. Quiet = subtle
ink word, 1px oak resting rule, always drawn (no hover-only rule). Unavailable quiet/secondary: word
`#65594E`, rules `rgba(44, 41, 38, .14)`, `aria-disabled="true"`, still focusable.

### 3.8 Focus ring (house §A5)

```html
<a href="#letterbox" style="…ledger link styles…; outline: 2px solid #7C5E30; outline-offset: 2px">Invoices</a>
```

Draw it on exactly one control per board where focus matters (the opened region's heading, the field
an unmet action sent focus to, the first ledger link on System). Never a border, never a glow.

### 3.9 Disclosure control (`View invoice`, `Payment history`)

```html
<button type="button" aria-expanded="false" aria-controls="inv-017-details" style="display: inline-flex; align-items: center; gap: 8px; min-height: 44px; min-width: 44px; padding: 0 2px; border: 0; background: none; font-family: 'Inter', -apple-system, sans-serif; font-size: 15px; line-height: 20px; color: #5A4E43; text-decoration: underline; text-decoration-color: #8B7355; text-decoration-thickness: 1px; text-underline-offset: 6px; cursor: pointer">
  View invoice
  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#65594E" stroke-width="1.25"><path d="M2 4.5 6 8.5 10 4.5"></path></svg>
</button>
<div id="inv-017-details" role="region" aria-label="Payment details for INV-2026-017" style="margin: 12px 0 0; padding: 24px 16px; background: #FCFAF6; border-top: 1px solid rgba(44, 41, 38, .14); border-bottom: 1px solid rgba(44, 41, 38, .14)">
  <!-- details, methods, consequence, terminal act, then the quiet "Close payment details" -->
</div>
```

Expanded label stays `View invoice` with the chevron turned (`d="M2 7.5 6 3.5 10 7.5"`) and
`aria-expanded="true"`; the close control inside the region is `Close payment details`. One region
open per collection. History toggle: `Payment history` with the same pattern.

### 3.10 Input + label + neutral helper (`instruments/signature-line.tsx`, change note)

```html
<div style="display: flex; flex-direction: column; gap: 8px; max-width: 360px">
  <label for="sig-name" style="font-family: 'Inter', -apple-system, sans-serif; font-size: 15px; line-height: 1.4; font-weight: 500; color: #2C2926">Your full name</label>
  <p id="sig-help" style="margin: 0; font-family: 'Inter', -apple-system, sans-serif; font-size: 15px; line-height: 1.5; color: #4E4339">Type your full name before approving.</p>
  <input id="sig-name" type="text" autocomplete="name" aria-describedby="sig-help" aria-required="true" style="box-sizing: border-box; width: 100%; min-height: 48px; margin: 0; padding: 12px; background: #FCFAF6; border: 1px solid rgba(44, 41, 38, .14); border-bottom: 1px solid #65594E; border-radius: 2px; font-family: 'Inter', -apple-system, sans-serif; font-size: 16px; line-height: 1.55; color: #2C2926">
</div>
```

No `placeholder`. The helper is present before interaction in neutral ink; an attempted unavailable
action re-states it in the status line and focuses the input. Prose fields (change note) use a
`<textarea>` with the same box, `min-height: 96px`, `max-width: 65ch`.

### 3.11 Quiet status line (role="status")

```html
<div role="status" style="margin: 24px 0 0; padding: 12px 0 0; border-top: 1px solid rgba(44, 41, 38, .14)">
  <p style="margin: 0; max-width: 56ch; font-family: 'Inter', -apple-system, sans-serif; font-size: 16px; line-height: 1.55; color: #2C2926">We couldn't load your invoices.</p>
  <!-- recovery: a secondary or quiet act directly under it, e.g. Retry -->
</div>
```

Failure, refresh, hold and recovery messages all use this: body ink under a hairline. No red, no icon
that carries the meaning, no fill, no repeated announcements.

### 3.12 Record block (house §A9; Approval-States only)

Stamp (border only, `#7C5E30`, DM Mono 11px caps, `rotate(-2deg)`, 2px radius) → subject (20px
Playfair) → reference (`.t-head`) → parties (15px) → timestamp (15px, `Approved 14 October 2026, 2:14 pm`)
→ what happens next → `Copy link to this record` (quiet). Above it a 1px `rgba(44, 41, 38, .14)` rule.

---

## 4. Readability floors (R140 / CPUX-07)

- Body and instructions: **16px** Inter, `#2C2926` or `#4E4339`.
- Money, dates, party names, consequence sentences: **≥15px**, sentence case. Never inside an
  11–12px mono caption.
- Targets: **≥44px** high and wide; terminal 48px. Hit area is the visible control, not a halo.
- Text contrast **≥4.5:1**; non-text controls/rules that carry affordance **≥3:1** (oak rule 4.20).
- Status in words, never colour alone. Reduced motion stills fills; the hold stays 900 ms.
- 390 width: no horizontal overflow, no clipped amount or action label; wrap, never truncate.

---

## 5. Voice and copy

House metaphor stays in composition (doorplate, letterbox drawing, colophon). **Literal words at
navigation, money, consent and recovery.** No emoji, no exclamation points, no "AI". Long dates:
`2 November 2026`; with time `14 October 2026, 2:14 pm`.

### 5.1 Required literal strings (spec §4–§5; the checker enforces the bold board-owned ones)

Arrival and wayfinding (Main, Arrival-Studio, Arrival-Desktop):
- **`Pay invoices, review approvals, and follow your project here.`**
- Ledger: **`Invoices`** · **`Approvals`** · **`Progress`** · `Updates` · `Documents` · `Contact Maren Holt`
- **`Your project isn't connected to this page yet. You can still view and pay your studio invoices.`**
- **`Contact your designer using the phone number or email you already use.`**
- Summary prose: `You have six invoices to pay.` and, separately, `One approval is waiting for you.`
  (spec example form: `You have six invoices to review.`; never one combined count of unlike work)

Invoices and payment:
- Group heads: **`Invoices to pay`** · **`Payments in progress`** · **`Payment needs review`** · **`Payment history`**
- **`Total outstanding`** with its scope: `$1,375.00 across Elm Street House and your studio invoices.`
- Row status: `Past due · 25 September 2026` · `Due today · 20 October 2026` · `Due 2 November 2026` · `No due date`
- Disclosure: **`View invoice`** · **`Close payment details`**
- Continuation: **`Continue to secure payment · {total}`** (the total includes the selected method's known fee)
- Above it: `The next screen shows the amount and asks you to confirm. Nothing is charged until you confirm there.`
- History: `Paid 3 September 2026` (only with paid evidence) · `No balance due` (zero-balance sent row)
- Processing: `Payment started 18 October 2026. Confirmation is pending. You don't need to pay again.`
- Review: `This payment needs a closer look. Maren Holt will follow up. You don't need to do anything now.`
- **`We couldn't load your invoices.`** + `Retry` · **`No invoices to pay.`** · **`Check expected`**
- Incomplete: `Some invoices didn't load, so this list may be incomplete. The total is hidden until everything loads.`
- Stale: `We couldn't refresh your invoices. These may be out of date.`
- Card fee unresolved: `We couldn't confirm the card fee. Card payment is unavailable until it loads.` + `Try again`

Approvals:
- Choices: `Approve` · **`Request changes`** · **`Pause to discuss`**; separate `Ask Maren Holt a question`
- Final actions: **`Approve this edition`** (`· $7,480.00` in the terminal label) · **`Send change request`** · **`Confirm pause`**
- Helpers: **`Type your full name before approving.`** · **`Tell your designer what you'd like changed before sending.`**
- Pause consequence: `This records that you want to pause and talk it through. It doesn't approve or reject the edition.`
- `Choose another response`
- States: **`Confirm review`** · **`Your review is confirmed. Your designer prepares the approval next. Nothing is waiting on you.`**
- Recovery: **`We couldn't load the information needed to confirm this review. Refresh the review or contact your designer.`** + **`Refresh review`**
- **`Loading document`** · **`This document isn't available. Contact your designer for help.`**
- Keep: `You're the one who answers this.`

Invitation and sign-in:
- **`Open your project`** (project invitation) · `Open your page` (no project)
- **`This invitation has already been used. Sign in to continue.`**
- **`This invitation link has expired.`** + **`Send a new invitation link`**
- **`If a new invitation can be sent, you'll receive an email.`**
- **`We couldn't request a new link. Try again or contact your designer.`** + `Try again`

Progress and help:
- **`Project progress`** · **`Now`** · **`Next`** · `Target date` · `Current designer update`
- **`Your designer will share the next step here.`** · `No project stage is shown here yet.` ·
  `Date not confirmed` · `No current designer update is shown here.` · **`Waiting on you`**

### 5.2 Retired (fail the checker everywhere except Words)

`A toll on the line` · `Settle the balance` · `Earlier invoices` · `letters are waiting` · `gone stale` ·
`frozen authority revision` · `% complete` · `Email sent`. Also retire `Close this letter`,
`What you owe`, `What needs you`, `Project status`, `Return`/`Hold` as choice labels, `Submit response`,
`Send a fresh letter`, `This letter has already been opened`.

---

## 6. Hard don'ts

No fixed or sticky header · no bottom tab bar · no numeric or notification badges · no cards or framed
panels · no pills · no green buttons or fills · no red error register (no `#C77B6E`, no terracotta
words) · no completion percentages or progress bars · no "AI" · no invented receipts, paid dates,
contacts, delivery estimates or invoice descriptions · no onboarding modal or tour · no shadows ·
no `opacity` on a state · no `disabled` attribute on a gating act (use `aria-disabled`) · no Patina
wordmark inside the page · no placeholder text in fields · no truncation or ellipsis · no fake status
bar · no emoji, no ✓ glyph, no spinner · no caveat words ("example", "mock") inside a screen.

---

## 7. The fixture world (every board)

**Studio:** Birchwood Studio, Madison, Wisconsin. **Designer:** Maren Holt. Presentation identity
(PresentedBy): name Maren Holt, phone `(608) 555-0148`, no email supplied, no website.
**Household:** June and Arlo Brennan; the page is prepared for **June Brennan** (she signs).

**Projects** (adopted project = lexicographically lowest id):

| id | Name | Role |
|---|---|---|
| `proj-0412` | **Elm Street House** | adopted: shows its own invoices **and** the studio invoices. Main board. |
| `proj-0587` | Lake Cottage | other house in the mat; shows only its own invoice (INV-2026-025, $90.00, due 6 November 2026); never the studio invoices |

Elm Street House: Now `Procurement`. Next milestone `Living room installation`, **Target date
22 January 2027**. Current designer update, sent **16 October 2026**, signed `Maren Holt · Birchwood
Studio · 16 October 2026`:

> The walnut sideboard is being finished at the workshop, and I've asked for photographs before it is
> wrapped. When you have a quiet moment, look at the second edition of the sofa. Once it reads right
> to you, I can order the linen.

Walnut sideboard stage: `In production` (finishing at the workshop is part of production, before
wrapping and dispatch). The note says it is being finished, not finished; no delivery date or
percentage is drawn.

**Outstanding invoices (USD; sorted due-date ascending, undated last):**

| # | Number | Title | Origin | Due | Total | Paid | **Balance** | Status line |
|---|---|---|---|---|---|---|---|---|
| 1 | INV-2026-014 | Design fee, September | Birchwood Studio | 25 September 2026 | $600.00 | $0.00 | **$600.00** | `Past due · 25 September 2026` |
| 2 | INV-2026-019 | Fabric samples and freight | Elm Street House | 20 October 2026 | $100.00 | $0.00 | **$100.00** | `Due today · 20 October 2026` |
| 3 | INV-2026-017 | Sofa deposit | Elm Street House | 2 November 2026 | $800.00 | $500.00 | **$300.00** | `Due 2 November 2026 · $500.00 paid` |
| 4 | INV-2026-022 | Lighting deposit | Elm Street House | 14 November 2026 | $250.00 | $0.00 | **$250.00** | `Due 14 November 2026` |
| 5 | INV-2026-023 | *(no title: show the number)* | Birchwood Studio | 30 November 2026 | $50.00 | $0.00 | **$50.00** | `Due 30 November 2026` |
| 6 | INV-2026-024 | Site measure visit | Elm Street House | none | $75.00 | $0.00 | **$75.00** | `No due date` |

60000 + 10000 + 30000 + 25000 + 5000 + 7500 = 137500 cents = **$1,375.00 outstanding**, six invoices to pay.

**History (Payment history, collapsed by default; sorted paid/sent date descending):**

| Number | Title | Origin | Amount | Line |
|---|---|---|---|---|
| INV-2026-016 | Sample return credit | Elm Street House | $0.00 balance (sent 12 October 2026) | `No balance due` |
| INV-2026-011 | Rug deposit | Elm Street House | $450.00 | `Paid 22 September 2026` |
| INV-2026-009 | Design retainer | Birchwood Studio | $1,200.00 | `Paid 3 September 2026` |

Draft and void invoices exist in the data and are never drawn.

**States-only additions (Invoices-States; do not add them to Main/List):**
- Processing: INV-2026-020 · Dining chair deposit · Elm Street House · $420.00 · payment `pending`
  with a PaymentIntent, started 18 October 2026 → `Payments in progress`.
- Needs review: INV-2026-018 · Upholstery labor · Elm Street House · $180.00 · `requires_refund`
  evidence → `Payment needs review`.
- With both: Invoices to pay stays **six**, `$1,375.00`; Payments in progress one, Payment needs
  review one; Total outstanding **$1,975.00** (each counted once).
- Second currency (A04): INV-2026-026 · Lake Cottage rug sample · CAD $120.00 → totals shown
  separately: `USD $1,375.00` and `CAD $120.00`, never added.
- Pending without a PaymentIntent (A05): variant of INV-2026-020 with a checkout session only. Not
  processing evidence (spec §3, resolver 00636), so it stays under **Invoices to pay**, counted once,
  with the same `View invoice` entry as its siblings and no processing or settlement copy.
- Reconciliation hold (A08): variant of INV-2026-017 after an uncertain checkout return, no
  `requires_refund` evidence → **Payment needs review**, no pay action; the hold copy is the same
  after Close payment details and View invoice again.
- Check intent: INV-2026-022 after a successful acknowledgement → `Check expected` · balance still
  `$250.00` · not paid, no receipt.

**Payment methods (Invoices-Pay; INV-2026-017, balance $300.00):** Bank transfer (ACH) · Card ·
Mail a check. Fees are never invented. Draw full totals as bracketed holes in DM Mono:
`$300.00 + [bank fee from quote]` → full total `[bank total from quote]`; Card
`[card fee from quote]` / `[card total from quote]`; Mail a check `No fee · $300.00`. Continuation:
`Continue to secure payment · [bank total from quote]`. Payee line: `Payable to Birchwood Studio`.

**Approval (Approval-Ask, Approval-States):** `Living room sofa, edition 2`, id `appr-sofa-e2`,
presented by Maren Holt on 16 October 2026. What changed from edition 1: oatmeal performance linen
replaces wool bouclé; arm height lowered from 26 to 24 inches. Impacts, always three separate facts:
- **Cost:** `$7,480.00, which is $640.00 more than edition 1 ($6,840.00).`
- **Schedule:** `No change to the living room installation target of 22 January 2027.`
- **Lead time:** `The linen adds two weeks at the workshop. The maker quotes nine weeks from the fabric order.`

Approve consequence: `Approving signs edition 2 of the living room sofa at $7,480.00. Maren Holt can
then order the linen. It doesn't charge you; any deposit arrives as its own invoice.`
Signature name to show when filled: `June Brennan`.

**Studio-only world (Arrival-Studio):** same household before Elm Street House is connected. Studio
invoices only: INV-2026-014 ($600.00, past due) and INV-2026-023 ($50.00, due 30 November 2026) →
Total outstanding `$650.00` for `your studio invoices`. One pending origin agreement:
`Design services agreement`, sent 9 October 2026, action `Read and sign`. No designer phone/email
(studio identity has name only) → the contact fallback sentence.

**Invitation (Invitation):** project invitation from Maren Holt for Elm Street House, sent 19 October
2026, recipient drawn as `For June Brennan` (never an email address), personal note:
`June, everything for Elm Street House now lives on one page. Start with the sofa when you have a minute.`

No real people or studios anywhere (no "Middle West", "Leah", "Kody").

---

## 8. Board outlines

Common rules: phone boards are 390 wide with a 24px gutter; the root is fixed at the frame size and
the `$preview` equals the frame exactly (table below; do not edit `canvas.json`; report a needed
height in submit). PAGE boards use `"expand":"fill"`, a fluid root (`max-width: 1100px; margin: 0 auto`)
and still declare `$preview` = frame. Every board: `<html lang="en">`, its own `<title>`, the exact
`<script src="./support.js"></script>` head line, the fonts link in `<helmet>`, `body{margin:0;
background:#FAF7F2}`, one `h1`, headings in order, real `<button>`/`<a href>`/`<input>`+`<label>`,
inline stroke SVG only, no tweaks unless named here.

**Interactive boards** (`is_interactive: true`): Invoices-List, Invoices-Pay, Approval-Ask. Logic
lives in `renderVals()`; holes are dotted lookups (`{{ row.label }}`), never expressions. Per-item
handlers are attached to each item in `renderVals()` and bound as `onClick="{{ item.toggle }}"`.
Branches use `<sc-if value="{{ flag }}" hint-placeholder-val="{{ true }}">`; repeats use
`<sc-for … hint-placeholder-count="N">`. No script-built UI, no global key handlers. Copy that a
founder may retype stays literal markup.

| Board | Owner | Frame (w×h) | Demonstrates | Must show |
|---|---|---|---|---|
| `System.dc.html` | SQ-1508 | 1440×4000 | merged system | specimen sheet |
| `Words.dc.html` | SQ-1508 | 1440×2400 | §5 inventory | before → after pairs |
| `Main.dc.html` | SQ-1509 (A) | 390×3600 | CPUX-01, 02, 06, 07 · A01, A03, A17, A18, A19, A20 | Full Elm Street House page, top to bottom: Strata mini → doorplate → purpose sentence → ledger → summary prose → the current ask (sofa edition, prominence kept, inline link to `#approval-appr-sofa-e2`) → `#letterbox` Invoices (all six rows visible, closed; `Total outstanding $1,375.00` + scope; `Payment history` closed) → `#approvals` Approvals (the sofa edition entry; full flow lives on Approval-Ask) → `#road` Progress summary (Now/Next/Target date/Current designer update, Waiting on you) → `#note` the update + `Contact Maren Holt` (phone) → `#mat-papers` Documents (2–3 signed papers) → mat (`Lake Cottage` under other houses, `Your details`, `Sign out`) → Strata full divider → colophon `Prepared by Birchwood Studio · Sent through Patina`. Static. |
| `Arrival-Studio.dc.html` | SQ-1509 (A) | 390×2600 | CPUX-01.5, 02, 06 · A03, A06 (honest empty), A18 | Studio-only page: doorplate `Birchwood Studio` (no project vitals) → F6 purpose sentence → ledger Invoices · Approvals · Progress · Contact your designer → Invoices (2 studio rows, `$650.00`) → Approvals (pending `Design services agreement`, `Read and sign`) → Progress lands on the not-connected explanation → contact fallback sentence → mat, colophon. Static. |
| `Arrival-Desktop.dc.html` | SQ-1509 (A) | 1280×2600, `expand: fill` | CPUX-01, 07 · A19 | Main at desktop: 1100 measure, doorplate 56px, ledger on one line, summary, ask, Invoices block with the six rows in a 56ch-wide ledger (figures right-aligned to the table rule), Progress summary in two columns (`flex-wrap`, stacks at phone width). No sticky rail, no header. Static. |
| `Invoices-List.dc.html` | SQ-1510 (B) | 390×3200 | CPUX-02, 03.1, 07 · A01, A02, A03, A07 | `Invoices to pay` (6) with written statuses, `Total outstanding $1,375.00` + scope; `Payment history` (zero-balance `No balance due` + 2 paid). **Works:** each `View invoice` opens that row's details (number, title, origin, payee `Birchwood Studio`, total/paid/balance in `.t-money`, print link `Print invoice` to the retained app print page `/invoices/<id>/print`, labelled `Opens this invoice’s print page.`; an invoice sheet, never called a receipt) and closes any other; focus moves to the opened region heading (draw the ring there); `Close payment details` closes it; `Payment history` toggles. `aria-expanded`/`aria-controls` bound from state. |
| `Invoices-Pay.dc.html` | SQ-1510 (B) | 390×2800 | CPUX-03 · A08, A09 | INV-2026-017 open: balance head `$300.00` at 26px Playfair (the one announced figure), `Due 2 November 2026 · $500.00 paid`, payee; method radios (native `<input type="radio">` + `<label>`, 44px rows) each with its full total and fee beneath; consequence; `Continue to secure payment · …` terminal; `Close payment details`. **Works:** choosing a method updates the total line and the terminal label; `Mail a check` replaces the terminal with check instructions and a secondary `I'll mail a check` acknowledgement, after which the status line reads `Check expected` and the balance stays `$300.00`. No payment ever submits. |
| `Invoices-States.dc.html` | SQ-1510 (B) | 1760×2600 | CPUX-02, 03 · A04, A05, A06, A08, A09 | A sheet of 390-wide panels, 4 per row, each headed by a DM Mono caption outside the screen naming the state: loading (no zero, no all-clear), failed with no data + Retry, incomplete merge (rows kept, total withheld), stale refresh failed, empty success `No invoices to pay.` with history, `Payments in progress` (INV-2026-020, no pay action), `Payment needs review` (INV-2026-018, help, no retry), `Check expected`, card fee unresolved (card unavailable, bank still available), two currencies (separate totals), states fixture totals (6 to pay, 1 in progress, 1 in review, `$1,975.00`), pending without a PaymentIntent (stays in Invoices to pay), reconciliation hold after an uncertain checkout return (survives reopen). Static. |
| `Approval-Ask.dc.html` | SQ-1511 (C) | 390×3200 | CPUX-04 · A10, A11, A14 | The sofa edition ask: name, presented by, what changed, three separate impacts, choices `Approve` / `Request changes` / `Pause to discuss` (`aria-pressed`), separate `Ask Maren Holt a question`. **Works:** choosing reveals that choice's consequence, field and final action and moves focus (name field / note field / confirmation heading); attempting the final act with the field empty shows the helper in the status line and focuses the field (no submit); with input it shows a hold caption, and a 900 ms press (pointer down/up handlers on the button itself) shows the dated result; `Choose another response` returns to the choices. Approve = terminal `Approve this edition · $7,480.00`; change/pause = secondary, held (F5). |
| `Approval-States.dc.html` | SQ-1511 (C) | 1760×2800 | CPUX-04 · A12, A13 | Panels: review-only draft (`Confirm review`, cannot approve), confirmed draft sentence, pending (choices), recorded outcome (A9 record block, `Copy link to this record`, no new response), withdrawn / superseded (link to the newer edition) / expired, household viewer read-only, missing authority (recovery sentence + `Refresh review` + contact; draft note kept, labelled unsent), changed edition after refresh (requires a new response), `Loading document`, document unavailable. Static. |
| `Invitation.dc.html` | SQ-1511 (C) | 1760×2000 | CPUX-05 · A15, A16 | Panels: project invitation shell (studio, project, recipient, note, purpose sentence, `Open your project`), page invitation (`Open your page`), used, expired + `Send a new invitation link`, after request (neutral acknowledgement), transport failure + `Try again`, sign-in that returns to the named instrument (shows `Sign in to see Living room sofa, edition 2`). Static. |
| `Progress.dc.html` | SQ-1509 (A) | 390×3000 | CPUX-06 · A17, A18 | Top: `Project progress` summary (Now `Procurement`; Next `Living room installation`; Target date `22 January 2027`; Current designer update with its date and signature) and `Waiting on you` linking to the sofa ask; below, the existing detailed road (pieces in words only: no dates we don't hold), `Past updates`, contact (phone `(608) 555-0148` as a `tel:` link, `Write to Maren Holt` opens the composer and sends nothing). Lower half, ruled, captioned in DM Mono: unknown states (`No project stage is shown here yet.`, `Your designer will share the next step here.`, `Date not confirmed`, `No current designer update is shown here.` with `Past updates` still offered, failed note read with Retry). Static. |

### A01–A20 coverage on the canvas

Drawn = the visual case is on a board. Partial = some branches are missing (named). Not visual =
runtime behaviour a static or local-state mock cannot show; it is not verified here.

| ID | Coverage | Where | Missing or not visual |
|---|---|---|---|
| A01 | drawn | Main, Invoices-List | Not visual: runtime projection |
| A02 | partial (missing: draft/void exclusion shown) | Invoices-List | Draft and void rows are stated, not demonstrated |
| A03 | partial (missing: duplicate-ID suppression; adopted-project ownership across several projects) | Main, Arrival-Studio, Invoices-States | — |
| A04 | drawn | Invoices-States | Excerpt: one of six USD rows plus the CAD row |
| A05 | partial (missing: overlapping review/zero/pending precedence) | Invoices-States | PI processing, session-only pending, requires_refund and paid-positive contradiction are drawn |
| A06 | drawn | Invoices-States, Progress | Not visual: actual query recovery |
| A07 | partial (missing: unpaid/history/unauthorized/draft/void deep-link paths) | Invoices-List | No URL or hash handling in the List script |
| A08 | partial (missing: duplicate activation) | Invoices-Pay, Invoices-States | Not visual: settlement lifecycle, server reconciliation |
| A09 | partial (missing: check failure; settlement-to-receipt transition) | Invoices-Pay, Invoices-States | — |
| A10 | drawn | Approval-Ask | Not visual: backend outcome, consent, authority, idempotency payloads |
| A11 | drawn | Approval-Ask | Not visual: real DOM and assistive-technology focus |
| A12 | drawn | Approval-States | Not visual: stale-authority rejection, refresh lifecycle, duplicate-note prevention |
| A13 | partial (missing: studio viewer authority) | Approval-States | — |
| A14 | drawn | Approval-Ask | Not visual: real browser/AT behaviour and equivalence with the current app |
| A15 | drawn | Invitation | Not visual: token privacy, request guard |
| A16 | partial (missing: non-active-project return; query/anchor preservation; safe redirect validation) | Invitation | — |
| A17 | drawn | Main, Progress | Not visual: source freshness |
| A18 | drawn | Main, Progress, Arrival-Studio | Not visual: messaging and contact capability |
| A19 | partial (missing: 360, tablet, 200% zoom and reflow frames) | Main, Arrival-Desktop | Not visual: screen reader, measured target geometry |
| A20 | drawn | Main, Invoices-List, Approval-States | Not visual: legacy auth, record and nonce runtime paths |

Panels on a states sheet: each panel is a 390-wide screen fragment on Off-White, separated by 48px,
with a DM Mono 12px caption above it (outside the screen) naming the state and its A-id. The caption
is the only place a state is labelled.
