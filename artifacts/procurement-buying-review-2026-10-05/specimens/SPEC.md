# SPEC: the buying specimens

This is the build contract for three builders. Each builder writes one file and reads nothing but this one. It contains:
- the tokens and the class fragment
- the fixture
- every state and its exact strings
- the friction pins
- the width, keyboard and copy rules
- the render command

**House.** This is Patina's Document, a studio surface: paper, scored ink and hairline rules. Nothing uses `box-shadow`. Patina's design grammar applies throughout:
- things **unfold in place**
- sheets are 640px or 760px wide
- pages are reached by text links, not tabs
- states are **words in hairline boxes**, never filled badges
- a terminal act is charcoal and carries its amount in its own label, with a consequence sentence directly above it
- a refused act is still focusable, uses `aria-disabled`, and states its reason in words
- totals are **front matter over their own rows**, never a tile grid

**What these specimens are for.** The synthesis (`../synthesis/direction.md`) argues that buying for a job has to move into The Document: one spine, one line card, one order paper, plus plain records for money out and receiving. The three files show the evidence and the proposal:
- File A shows today's screens, with numbered friction pins.
- Files B and C show the proposal at studio width and at phone width.

---

## 1. File targets

| Builder | File (absolute) | Renders |
|---|---|---|
| A | `/Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/specimens/today-1440.html` | Five TODAY screens, replicated from code, each with numbered friction pins and a "Friction" rail |
| B | `/Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/specimens/proposed-1440.html` | The proposed studio surface in a 1200px band, centred in a 1440 viewport, with a "Rulings and notes" rail |
| C | `/Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/specimens/proposed-390.html` | Five phone screens: site check-in, the drafted claim, owner release, the release record, and a ledger glance |

Every file is a single self-contained file.

| Rule | Statement |
|---|---|
| External resources | Only the Google Fonts stylesheet and the `fonts.gstatic.com` files it pulls. Nothing else |
| JS | Vanilla only. No library, no framework, no CDN script |
| Images | None. Inline SVG only, drawn at 1px in `var(--ink-faint)`. Photo thumbnails are drawn as 1px boxes holding a simple inline SVG line drawing (a shade outline, a carton corner), each with a `<title>` |
| Shadows | The string `box-shadow` must not appear |
| Truncation | The string `text-overflow` must not appear. Text wraps |
| Structure | One `<style>`, one `<script>`, `<html lang="en">`, exactly one `<h1>` per file, headings in order |
| Last line | Each file's last line is exactly `<!-- specimen-complete -->` |

Paste these three lines into `<head>` for the fonts:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;1,400&family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

---

## 2. The shared CSS, pasted byte for byte

Every builder pastes §2.1 and then §2.2 at the top of `<style>`, in that order, before writing any CSS of their own.
- Do not rename a token.
- Do not add a hex literal anywhere else in the file.
- The block below is already complete: every brace is closed. Paste it exactly as it stands.

### 2.1 Tokens, verbatim

```css
/* Source: artifacts/agreement-room-2026-09-10/deck/src/index.html (lines 14-91) */
:root {
  color-scheme: light dark;

  /* paper, three stocks */
  --paper:            #FAF7F2;
  --paper-doc:        #FCFAF6;
  --rail:             #E8E3DB;

  /* ink */
  --ink:              #2C2926;
  --ink-muted:        #4E4339;
  --ink-subtle:       #5A4E43;
  --ink-faint:        #65594E;
  --ink-paper:        #FAF7F2;

  /* hairlines */
  --hairline:         #E8E3DB;
  --hairline-strong:  rgba(44, 41, 38, .14);

  /* the rest rule pigment */
  --oak:              #8B7355;

  /* state pigments: material value / paper ink */
  --clay:             #C4A57B;   --clay-ink:      #7C5E30;
  --golden:           #E8C547;   --golden-ink:    #79651E;
  --terracotta:       #D4A090;   --terracotta-ink:#9C5340;
  --sage:             #A8B5A0;   --sage-ink:      #5F6B57;

  /* rhythm */
  --module: 24px;
  --radius-hair: 2px;
  --radius-box:  3px;

  /* motion */
  --press-in:  70ms;
  --press-out: 240ms;
  --ease: cubic-bezier(.22, 1, .36, 1);

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
}
```

### 2.2 The class fragment, verbatim

These classes come from the People room. Here, `.crm-row` is a schedule or order row and `.word` is a state word. Keep the class names exactly as written: the buying classes in §2.3 sit beside them.

```css
  .crm-band { max-width: 1200px; margin: 0 auto; padding: 24px; background: var(--paper); font-family: var(--font-body); color: var(--ink); }
  .crm-h    { font-family: var(--font-display); font-size: 20px; font-weight: 500; margin: 48px 0 12px; }
  .crm-h:first-child { margin-top: 0; }

  /* ── Row (person + company share this grammar) ─────────────────────── */
  .crm-list { border-top: 1px solid var(--hairline); }
  .crm-row  { display: flex; align-items: center; gap: 16px; padding: 12px 16px; border-bottom: 1px solid var(--hairline); }

  .avatar { flex: none; display: flex; align-items: center; justify-content: center;
    font-family: var(--font-meta); font-weight: 500; font-size: 12px; color: var(--ink-paper); background: var(--oak); }
  .avatar--circle { width: 34px; height: 34px; border-radius: 50%; }
  .avatar--square { width: 42px; height: 42px; border-radius: 8px; }

  .row-id   { flex: 1 1 320px; min-width: 0; }
  .row-name { font-size: 14px; font-weight: 600; line-height: 1.4; }
  .row-sub  { font-family: var(--font-meta); font-size: 12px; letter-spacing: .04em; color: var(--ink-subtle); margin-top: 2px; }
  .row-rule { font-size: 14px; line-height: 1.5; color: var(--ink); margin-top: 4px; }
  .row-rule--blocked { border-left: 2px solid var(--terracotta-ink); padding-left: 10px; }

  .row-words { flex: none; display: flex; gap: 12px; }
  .row-chevron { flex: none; width: 16px; color: var(--ink-faint); text-align: center; }

  /* ── The word: bordered box, word + border always agree, never a fill ── */
  .word { flex: none; width: 108px; text-align: center; padding: 4px 6px;
    border: 1px solid var(--hairline-strong); border-radius: var(--radius-box);
    font-family: var(--font-meta); font-size: 11px; font-weight: 500;
    letter-spacing: .06em; text-transform: uppercase; background: transparent; }
  .word--current  { border-color: var(--sage);       color: var(--sage-ink); }
  .word--pending  { border-color: var(--golden);     color: var(--golden-ink); }
  .word--blocked  { border-color: var(--terracotta); color: var(--terracotta-ink); }
  .word--dormant  { border-color: var(--hairline-strong); color: var(--ink-faint); }
  /* Authority: a fact, not a state — no border pigment, no fill. */
  .word--plain { border-color: transparent; color: var(--ink-subtle); text-transform: none;
    letter-spacing: 0; font-weight: 400; text-align: left; width: auto; padding: 4px 0; }

  /* ── Card ────────────────────────────────────────────────────────────── */
  .crm-card { max-width: 720px; margin: 0 auto 48px; }
  .card-header { display: flex; align-items: center; gap: 16px; padding-bottom: 24px; }
  .card-name { font-family: var(--font-display); font-size: 20px; font-weight: 500; }
  .card-meta { font-family: var(--font-meta); font-size: 12px; color: var(--ink-subtle); margin-top: 4px; }
  .card-region { padding: 24px 0; border-top: 1px solid var(--hairline-strong); }
  .card-region h3 { font-family: var(--font-meta); font-size: 11px; font-weight: 500;
    letter-spacing: .08em; text-transform: uppercase; color: var(--ink-subtle); margin: 0 0 12px; }

  .crm-table { width: 100%; border-collapse: collapse; }
  .crm-table th { font-family: var(--font-meta); font-size: 11px; font-weight: 500; letter-spacing: .08em;
    text-transform: uppercase; color: var(--ink-subtle); text-align: left; padding: 0 12px 8px 0; }
  .crm-table td { font-size: 14px; padding: 12px 12px 12px 0; border-top: 1px solid var(--hairline); }
```

### 2.3 What you add on top

Add only the rules below, and build them only from the tokens above.

| Need | Add |
|---|---|
| Page ground | `body { background: var(--paper); color: var(--ink); margin: 0; font-family: var(--font-body); }` |
| Type scale | `.t-d1`: display 34/1.15, w500<br>`.t-d2`: display 26/1.20, w500<br>`.t-d3`: display 20/1.30, w500<br>`.t-body`: body 16/1.55<br>`.t-body-sm`: body 14/1.50<br>`.t-meta`: meta 12/1.50, tracking .08em, sentence case<br>`.t-head`: meta 11/1.50, w500, tracking .08em, UPPER |
| Money | Every money figure is `font-variant-numeric: tabular-nums` and right-aligned in its column. Write two decimals every time: `$3,240.00`, never `$3,240` |
| Acts | `.act`:<br>• minimum 44×44<br>• DM Mono 13px, w500, caps, tracking .06em<br>• no border, no background, a 1px `var(--oak)` rule under the label at rest<br>`.act--secondary` adds a second `var(--clay)` rule.<br>`.act--tertiary` is DM Mono 12px with a 1px `var(--hairline-strong)` rule.<br>`.act--terminal`:<br>• `var(--ink)` ground, `var(--ink-paper)` text<br>• 3px radius, 12px 20px padding<br>• Inter 500 16px, sentence case label<br>`.act:focus-visible { outline: 2px solid var(--clay-ink); outline-offset: 2px; }` |
| Gated act | `[aria-disabled="true"] { cursor: not-allowed; color: var(--ink-faint); }`. A gated terminal act keeps its charcoal ground and changes its label colour to `var(--ink-faint)` on `var(--rail)`.<br>Never use `opacity`, and never the `disabled` attribute. The reason is printed beside the act and linked with `aria-describedby` |
| Consequence sentence | `.consequence`: `.t-body-sm`, `var(--ink)`, max 56ch, 12px above the act it explains, with no rule and no ground |
| Chips | Pressed: `var(--rail)` ground, 1px `var(--ink-faint)` border, `var(--ink)` text.<br>Unpressed: `var(--paper)` ground, 1px `var(--hairline-strong)` border.<br>3px radius, never fully rounded. The word "chip" never appears on a face |
| Held | `var(--rail)` ground, `border-left: 2px solid var(--terracotta-ink)`, `padding-left: 11px`. The reason prints beneath in `.t-body-sm` at full `var(--ink)` |
| Waiting (a soft hold, e.g. awaiting release) | `var(--paper-doc)` ground, `border-left: 2px solid var(--golden-ink)`, `padding-left: 11px` |
| Fields | The label is always visible as `.t-head` above the control. Never use a `placeholder` attribute.<br>Control: `var(--paper-doc)` ground, 1px `var(--hairline-strong)` box, 1px `var(--ink-faint)` bottom rule, 2px radius, 12px padding, Inter 16/1.55 |
| Kind word | `.kind`: DM Mono 11px, `var(--ink-subtle)`, lowercase, no border, set after the line name. Examples: `from Patina`, `custom · Hale Upholstery Works`, `fabric for: Sofa` |
| Readiness words | `.ready`: `.t-body-sm` `var(--ink-subtle)` reasons joined by " · ".<br>A hard stop (needs a maker, needs a trade cost, already on PO n) prints with a 2px `var(--terracotta-ink)` leading rule.<br>A warning (needs the client's yes, needs the CFA) prints with a 2px `var(--golden-ink)` leading rule.<br>A ready line prints the single word "Ready to order" in `var(--sage-ink)`, with no rule |
| Unfold | The open row gets `border-left: 3px solid var(--clay)` and a `var(--paper-doc)` ground. Cells sit in a CSS grid, each cell with a `.t-head` label and values below, separated by 1px `var(--hairline)` rules. The act row goes last |
| Trail | Any lifecycle trail is an `<ol>`. Each step is DM Mono 11px.<br>• Done steps: `var(--ink)`, with a 1px `var(--sage)` underline.<br>• The current step: `var(--ink)`, with a 2px `var(--clay-ink)` underline.<br>• Steps with no record: `var(--ink-faint)`, with the words "no record" after them.<br>Never use dots, ticks or a progress bar |
| Pins (A and B only) | `.pin`: a 22×22 box, 1px `var(--terracotta-ink)` border, 2px radius, DM Mono 11px number centred in `var(--terracotta-ink)`, `var(--paper)` ground.<br>Place it inline at the end of the element it points at, or absolutely in the face column's left gutter. It must never cover text. File B's pins use `var(--clay-ink)` in place of `var(--terracotta-ink)`, so a proposal never looks like a defect. Pins are `aria-hidden="true"`. The rail carries the words |
| Rail (A and B) | `.rail`: `var(--paper)` ground, 1px `var(--hairline-strong)` left rule, 24px left padding. Its heading is `.t-head` ("FRICTION" in A, "RULINGS AND NOTES" in B). It holds an `<ol>` in which each entry starts with its number, set in the same `.pin` box. After the number come the plain sentence and then a `.t-meta` evidence line (path:line, R-id or C-id) |
| Rhythm | Block gaps are 12, 24, 48 or 72px only. Radius is 2px or 3px only |
| Rules | `1px solid var(--hairline)` between rows; `1px solid var(--hairline-strong)` at a region seam |
| Reduced motion | An `@media (prefers-reduced-motion: reduce)` block that zeroes animation and transition durations |
| Forced colors | An `@media (forced-colors: active)` block giving `.word`, `.pin` and `.act--terminal` a `ButtonText` border, with the focus ring in `Highlight` |

---

## 3. The fixture: Ashby Lakehouse

One fixture is shared by all three files. Do not invent any other name, firm, place, phone, email, number or price.
- **Today** is **Wednesday 28 October 2026**. "This week" is Mon 26 Oct to Sun 1 Nov.
- **Date formats.** File A copies today's code and writes `Oct 7` / `~Nov 4`. Files B and C use the house form: `7 Oct`, `Wed 4 Nov`, `Thu 29 Oct, 5 pm`. The year appears only when it is not 2026, e.g. `~Fri 15 Jan 2027`.
- **File A only.** Today's code prints the studio address as `Middlewest Studio · Madison WI`. That literal string *is* the friction, so file A shows it exactly. Files B and C never show it.

```json
{
  "today": "2026-10-28",
  "studio": {
    "name": "Hartwell Studio",
    "address": "412 N 1st St, Suite 300, Minneapolis MN 55401",
    "phone": "(612) 555-0150",
    "releaseThreshold_cents": 250000,
    "releaseBy": "an owner or admin",
    "people": [
      { "id": "P-1", "name": "Leah Hartwell",   "initials": "LH", "seat": "owner",  "title": "principal",         "phone": "(612) 555-0160" },
      { "id": "P-2", "name": "Priya Natarajan", "initials": "PN", "seat": "admin",  "title": "lead designer",     "phone": "(612) 555-0161", "ownsProject": true },
      { "id": "P-3", "name": "Maya Reyes",      "initials": "MR", "seat": "member", "title": "design assistant",  "phone": "(612) 555-0162", "buysForThisJob": true }
    ],
    "paymentMethods": [
      { "id": "PM-1", "label": "Amex · Leah", "last4": "4471" },
      { "id": "PM-2", "label": "Chase operating", "last4": "0918", "checks": true },
      { "id": "PM-3", "label": "ACH from Chase operating", "last4": "0918" }
    ]
  },
  "job": {
    "name": "Ashby Lakehouse",
    "sidemark": "HART-ASHBY",
    "client": "Nora and Martin Ashby",
    "clientShort": "the Ashbys",
    "site": "2216 North Shore Drive, Excelsior MN 55331",
    "rooms": { "LR": "Living room", "DR": "Dining room", "KIT": "Kitchen", "BED": "Primary bedroom", "ENT": "Entry" }
  },
  "receiver": {
    "name": "Cedar Lake Receiving & Storage",
    "address": "3100 Cedar Lake Rd, Minneapolis MN 55416",
    "phone": "(612) 555-0140",
    "dock": "Weekdays 07:00 to 15:30",
    "storage": "30 days free storage"
  },
  "vendors": [
    { "id": "V-HALE", "name": "Hale Upholstery Works", "short": "Hale",      "city": "St. Paul MN",     "phone": "(651) 555-0123", "orders": "orders@haleupholstery.com",  "terms": "50% deposit, 50% before ship", "claimWindow": "3 business days, by 5 pm", "account": "HW-20418" },
    { "id": "V-KESS", "name": "Kessler Textile Co.",   "short": "Kessler",   "city": "Chicago IL",      "phone": "(312) 555-0145", "orders": "trade@kesslertextile.com",   "terms": "Full payment upfront",          "claimWindow": "5 business days",          "account": "K-7731" },
    { "id": "V-FEN",  "name": "Fenwick & Rowe",        "short": "Fenwick",   "city": "Milwaukee WI",    "phone": "(414) 555-0131", "orders": "orders@fenwickrowe.com",     "terms": "30% deposit, 70% before ship", "claimWindow": "3 business days, by 5 pm", "account": "FR-3390" },
    { "id": "V-ARD",  "name": "Ardent Rug Atelier",    "short": "Ardent",    "city": "Madison WI",      "phone": "(608) 555-0119", "orders": "studio@ardentrug.com",       "terms": "50% deposit, 50% before ship", "claimWindow": "7 days",                   "account": "ARD-118" },
    { "id": "V-LARK", "name": "Larkspur Lighting",     "short": "Larkspur",  "city": "Plymouth MN",     "phone": "(763) 555-0188", "orders": "orders@larkspurlighting.com", "claims": "claims@larkspurlighting.com", "terms": "NET-30 from delivery", "claimWindow": "3 business days, by 5 pm", "account": "LL-5502" },
    { "id": "V-STILL","name": "Stillwater Drapery Co.","short": "Stillwater","city": "Stillwater MN",   "phone": "(651) 555-0177", "orders": "work@stillwaterdrapery.com", "terms": "50% deposit, 50% before ship", "claimWindow": "3 business days, by 5 pm", "account": "SD-0712" },
    { "id": "V-ORO",  "name": "Oro Seating",           "short": "Oro",       "city": "Minneapolis MN",  "phone": "(612) 555-0193", "orders": "orders@oroseating.com",      "terms": "50% deposit, 50% before ship", "claimWindow": "3 business days, by 5 pm", "account": null },
    { "id": "V-TAM",  "name": "Tamarack Woodworks",    "short": "Tamarack",  "city": "Duluth MN",       "phone": "(218) 555-0126", "patinaMaker": true }
  ],
  "payees": [
    { "id": "Y-NLH",  "name": "Northloop Home Supply", "city": "Minneapolis MN", "phone": "(612) 555-0104", "kind": "store" },
    { "id": "Y-HOLM", "name": "Holm Estate Sales",     "city": "Cannon Falls MN", "phone": "(507) 555-0112", "kind": "estate sale" },
    { "id": "Y-LAKE", "name": "Lakeland Freight",      "kind": "carrier" }
  ],
  "lines": [
    { "id": "L-01", "name": "Sofa", "room": "LR", "kind": "custom", "kindWord": "custom · Hale Upholstery Works", "vendor": "V-HALE", "sku": "HU-TA96", "finish": "COM, Kessler Brae linen, Flax", "dims": "96 W × 38 D × 33 H in", "build": "Track-arm sofa, kiln-dried maple frame, 8-way hand-tied", "qty": 1, "trade_cents": 648000, "client_cents": 972000, "leadWeeks": 9, "po": "1042", "state": "In production" },
    { "id": "L-02", "name": "Fabric for the sofa", "room": "LR", "kind": "fabric", "kindWord": "fabric for: Sofa", "parent": "L-01", "vendor": "V-KESS", "sku": "BRAE-FLAX-54", "finish": "Brae linen, Flax, 54 in wide, plain", "qty": "19 yd", "unit_cents": 6400, "trade_cents": 121600, "client_cents": 182400, "po": "1043", "shipsTo": "Hale Upholstery Works", "cfa": "Cutting approved by Priya Natarajan, 9 Oct", "dyeLot": "31-118", "state": "Delivered to Hale 22 Oct" },
    { "id": "L-03", "name": "Lounge chairs", "room": "LR", "vendor": "V-FEN", "sku": "FR-LC22", "finish": "Smoked walnut, Fenwick leather Saddle", "dims": "29 W × 33 D × 30 H in", "qty": 2, "unit_cents": 214000, "trade_cents": 428000, "client_unit_cents": 315000, "client_cents": 630000, "po": "1045" },
    { "id": "L-04", "name": "Dining table, walnut", "room": "DR", "kind": "patina", "kindWord": "from Patina", "vendor": "V-TAM", "dims": "96 × 42 in, seats 8", "qty": 1, "trade_cents": 790000, "client_cents": 1185000, "patinaOrder": "2219", "paidAtCheckout": "6 Oct", "state": "In production", "eta": "~Fri 4 Dec" },
    { "id": "L-05", "name": "Dining chairs", "room": "DR", "vendor": "V-FEN", "sku": "FR-DC08", "finish": "Smoked walnut, rush seat", "qty": 8, "unit_cents": 69000, "trade_cents": 552000, "client_unit_cents": 99500, "client_cents": 796000, "po": "1045" },
    { "id": "L-06", "name": "Sconce pair", "room": "LR", "vendor": "V-LARK", "sku": "LL-S14-BR", "finish": "Aged brass", "qty": 2, "unit_cents": 58500, "trade_cents": 117000, "client_unit_cents": 86000, "client_cents": 172000, "po": "1047", "state": "Delivered 26 Oct, clean" },
    { "id": "L-07", "name": "Kitchen pendants", "room": "KIT", "vendor": "V-LARK", "sku": "LL-P09-OP", "finish": "Opal glass, aged brass", "qty": 3, "unit_cents": 43000, "trade_cents": 129000, "client_unit_cents": 64000, "client_cents": 192000, "po": "1047", "state": "Delivered 26 Oct, 1 of 3 damaged" },
    { "id": "L-08", "name": "Wool rug, 9 × 12", "room": "LR", "vendor": "V-ARD", "sku": "AR-HW912", "finish": "Hand-knotted wool, Oat", "qty": 1, "trade_cents": 435000, "client_cents": 630000, "po": "1046", "state": "Backorder", "etaWas": "~Fri 20 Nov", "etaNow": "~Fri 15 Jan 2027", "toldOn": "23 Oct" },
    { "id": "L-09", "name": "Living room drapery", "room": "LR", "vendor": "V-STILL", "sku": "SD-PP4", "finish": "Stillwater house linen, Oat, pinch pleat, lined and interlined", "dims": "4 panels, 108 in finished length", "qty": 4, "trade_cents": 386000, "client_cents": 560000, "po": "1048", "state": "Held for release", "invoiced": false },
    { "id": "L-10", "name": "Table lamps, pair", "room": "LR", "kind": "store", "kindWord": "store buy · Northloop Home Supply", "payee": "Y-NLH", "qty": 2, "paid_cents": 38900, "tax_cents": 2844, "card": "4471", "boughtOn": "19 Oct", "returnBy": "Mon 23 Nov", "billed": false },
    { "id": "L-11", "name": "Pine console, c. 1880", "room": "ENT", "kind": "find", "kindWord": "a find · Holm Estate Sales", "payee": "Y-HOLM", "qty": 1, "hammer_cents": 145000, "premium_cents": 21750, "paid_cents": 166750, "client_cents": 260000, "card": "4471", "boughtOn": "Sat 24 Oct", "pickup": "Studio van, Sat 24 Oct", "returns": "Non-returnable", "billed": false },
    { "id": "L-12", "name": "Pair of nightstands", "room": "BED", "source": "pasted link", "vendor": null, "trade_cents": null, "retail_unit_cents": 124000, "retail_cents": 248000, "qty": 2, "readiness": ["needs a maker", "needs a trade cost"] },
    { "id": "L-13", "name": "Entry bench", "room": "ENT", "kind": "need", "kindWord": "to be found", "readiness": ["waiting on a decision"] },
    { "id": "L-14", "name": "Fabric memos, 3", "room": "LR", "kind": "sample", "kindWord": "sample", "vendor": "V-KESS", "trade_cents": 0, "returnBy": "Fri 6 Nov" },
    { "id": "L-15", "name": "Smoked walnut finish chip", "room": "DR", "kind": "sample", "kindWord": "sample", "vendor": "V-FEN", "state": "Received 14 Oct" },
    { "id": "L-16", "name": "Bar stools", "room": "KIT", "vendor": "V-ORO", "sku": "OS-BS26", "finish": "Blackened steel, oak seat", "dims": "26 in seat height", "qty": 3, "unit_cents": 54000, "trade_cents": 162000, "client_unit_cents": 79500, "client_cents": 238500, "approvedBy": "Nora Ashby, 20 Oct", "invoiced": false, "readiness": ["Ready to order"] },
    { "id": "L-17", "name": "Window seat cushion", "room": "KIT", "kind": "custom", "kindWord": "custom · Hale Upholstery Works", "vendor": "V-HALE", "beingAdded": true, "trade_cents": 64000, "client_cents": 96000, "leadWeeks": 6, "fabric": { "vendor": "V-KESS", "name": "Brae linen, Flax", "yards": 4, "unit_cents": 6400, "trade_cents": 25600, "client_cents": 38400 }, "readiness": ["needs the client's yes", "needs the CFA"] }
  ],
  "purchaseOrders": [
    { "no": "1042", "vendor": "V-HALE",  "lines": ["L-01"], "total_cents": 648000, "sidemark": "HART-ASHBY-LR-SOFA", "shipTo": "receiver", "sentOn": "7 Oct", "sentBy": "Maya Reyes", "ack": "9 Oct, agrees", "state": "In production", "ships": "Mon 2 Nov", "arrives": "~Wed 4 Nov", "deposit": { "cents": 324000, "paidOn": "8 Oct", "method": "PM-1", "by": "Maya Reyes" }, "balance": { "cents": 324000, "due": "Fri 30 Oct" }, "note": "COM arriving separately: Kessler PO-1043, 19 yd Brae linen, Flax, tagged HART-ASHBY-LR-SOFA." },
    { "no": "1043", "vendor": "V-KESS",  "lines": ["L-02"], "total_cents": 121600, "shipTo": "Hale Upholstery Works", "sentOn": "7 Oct", "ack": "8 Oct, agrees", "state": "Delivered to Hale", "shippedOn": "16 Oct", "deliveredOn": "22 Oct", "paid": { "cents": 121600, "paidOn": "7 Oct", "method": "PM-3" } },
    { "no": "1045", "vendor": "V-FEN",   "lines": ["L-03", "L-05"], "total_cents": 980000, "shipTo": "receiver", "sentOn": "13 Oct", "requestedShip": "Fri 27 Nov", "ack": "20 Oct, 2 differences", "confirmedShip": "Fri 4 Dec", "arrives": "~Fri 11 Dec", "quote": "Q-5528, 2 Oct, valid to Mon 2 Nov", "deposit": { "cents": 294000, "paidOn": "15 Oct", "method": "PM-2", "check": "2207" }, "balance": { "cents": 686000, "due": "before ship" }, "coveredBy": "0219 (unpaid)" },
    { "no": "1046", "vendor": "V-ARD",   "lines": ["L-08"], "total_cents": 435000, "shipTo": "receiver", "sentOn": "1 Oct", "ack": "2 Oct, agrees", "state": "Backorder", "deposit": { "cents": 217500, "paidOn": "2 Oct", "method": "PM-1" }, "balance": { "cents": 217500, "due": "before ship" } },
    { "no": "1047", "vendor": "V-LARK",  "lines": ["L-06", "L-07"], "total_cents": 246000, "shipTo": "receiver", "sentOn": "6 Oct", "ack": "7 Oct, agrees", "state": "Delivered", "deliveredOn": "Mon 26 Oct", "carrier": "Lakeland Freight", "pro": "88120457", "terms": "NET-30 from delivery", "due": "Wed 25 Nov", "claimBy": "Thu 29 Oct, 5 pm" },
    { "no": "1048", "vendor": "V-STILL", "lines": ["L-09"], "total_cents": 386000, "sidemark": "HART-ASHBY-LR-DRAPERY", "shipTo": "receiver", "requestedShip": "Fri 20 Nov", "state": "Held for release", "heldBy": "Maya Reyes", "heldOn": "28 Oct 09:15", "releasedBy": "Leah Hartwell", "releasedOn": "28 Oct 14:02", "deposit": { "cents": 193000, "due": "at release" }, "balance": { "cents": 193000, "due": "before ship" }, "note": "Measurements from the site visit, 21 Oct, are attached. Questions to Maya Reyes, (612) 555-0162." }
  ],
  "riders": [
    { "id": "R-1", "parentPo": "1042", "what": "Freight, Hale to Cedar Lake, prepaid and added", "payee": "V-HALE", "estimate_cents": 42000 },
    { "id": "R-2", "parentPo": "1045", "what": "LTL freight, Fenwick to Cedar Lake", "payee": "Y-LAKE", "estimate_cents": 61000 },
    { "id": "R-3", "parentPo": null, "what": "Receiving and handling, October", "payee": "receiver", "amount_cents": 28000, "due": "Fri 30 Oct" },
    { "id": "R-4", "parentLine": "L-11", "what": "Buyer's premium, 15%", "payee": "Y-HOLM", "amount_cents": 21750 },
    { "id": "R-5", "parentLine": "L-11", "what": "Studio van to Cannon Falls, 112 mi", "payee": "studio", "amount_cents": 7840, "reimbursable": true }
  ],
  "clientInvoices": [
    { "no": "0214", "total_cents": 3333400, "state": "Paid 5 Oct", "covers": ["L-01", "L-02", "L-04", "L-06", "L-07", "L-08"] },
    { "no": "0219", "total_cents": 1426000, "state": "Sent 21 Oct, unpaid", "covers": ["L-03", "L-05"] }
  ],
  "frontMatter": {
    "onOrders_cents": 2430600,
    "paidOutOnOrders_cents": 957100,
    "paidAtCheckoutPatina_cents": 790000,
    "purchases_cents": 205650,
    "dueThisWeek_cents": 352000,
    "dueThisWeekCount": 2
  },
  "ownerBlock": {
    "scope": "Studio orders 1042 to 1047",
    "client_cents": 3574400,
    "trade_cents": 2430600,
    "difference_cents": 1143800
  }
}
```

**Derivations.** Every figure on a face either is in the JSON or comes from these sums:

| Figure | Derivation | Value |
|---|---|---|
| On orders | Sum of the totals of sent POs 1042, 1043, 1045, 1046, 1047 | $24,306.00 |
| Paid out on orders | Hale deposit $3,240.00 + Kessler $1,216.00 + Fenwick deposit $2,940.00 + Ardent deposit $2,175.00 | $9,571.00 |
| Due this week | Hale balance $3,240.00 (Fri 30 Oct) + Cedar Lake receiving $280.00 (Fri 30 Oct) | $3,520.00 across 2 |
| Purchases | Northloop $389.00 + Holm $1,667.50 | $2,056.50 |
| Lamps before tax | $389.00 − $28.44 | $360.56 |
| Find | Hammer $1,450.00 + premium $217.50 | $1,667.50 |
| Fenwick fronted | The deposit was paid 15 Oct, and invoice №0219 is unpaid | $2,940.00 |
| Releasing Stillwater fronts | Deposit at release; L-09 is not invoiced | $1,930.00 |
| Owner block | Client $35,744.00 − trade $24,306.00 | $11,438.00 |
| Cushion line | Work $640.00 + fabric 4 yd × $64.00 = $256.00 | $896.00 trade |

**Patina order 2219** (from Patina, Tamarack Woodworks) shows only "Paid at checkout, 6 Oct · $7,900.00". It is never added to On orders, Paid out, or the owner block. The rail says why (V1).

---

## 4. The state switcher

### 4.1 States

| File | Hash | State | Default |
|---|---|---|---|
| A | `#state-unfold` | The FF&E line, unfolded | yes |
| A | `#state-review` | Order Assistant, Review items | |
| A | `#state-ledger` | Orders book, Ledger | |
| A | `#state-receiving` | Receiving, with the Log inspection drawer open | |
| A | `#state-addline` | Add a line, after trying Import a schedule | |
| B | `#state-spine` | The job, read by maker, one line unfolded | yes |
| B | `#state-add` | Add to the job, line card mid-flow | |
| B | `#state-custom` | The custom piece: work and fabric | |
| B | `#state-paper` | The order paper, held for release | |
| B | `#state-ack` | The acknowledgment check | |
| B | `#state-money` | Money: due, paid, covered, owner block | |
| B | `#state-receiving` | Receiving and exceptions | |
| C | `#state-checkin` | Site check-in at Cedar Lake | yes |
| C | `#state-claim` | The drafted notice to Larkspur | |
| C | `#state-release` | Leah releases Maya's order | |
| C | `#state-released` | The release record | |
| C | `#state-glance` | One ledger glance | |

### 4.2 Mechanics (identical in all three files)

| Rule | Statement |
|---|---|
| Hash format | A list of tokens separated by `&` or `,`.<br>• The first token matching `state-*` sets the state.<br>• `nobar` hides the state bar.<br>• `nopins` hides every `.pin` and the rail (or, in C, the notes block).<br>For example, `#state-ledger&nobar&nopins` is valid |
| On load | Read `location.hash` on `DOMContentLoaded`. The render tool navigates straight to the hash, so a listener on `hashchange` alone will never fire. Wire both |
| On change | Listen for `hashchange` and re-render |
| postMessage | `window.addEventListener('message', e => {...})`, accepting `{ state: 'state-ledger' }` or `{ state: 'ledger' }`.<br>Normalise by adding the `state-` prefix when it is missing. Ignore any message whose state is not one of this file's states. Never call `eval`, and never read any other field |
| Switching | Exactly one state region is in the flow at a time. Use the `hidden` property. Hidden regions must not be reachable by Tab |
| Announce | On every change, write the state's name (column "State" above) into the single page-level `<p role="status" aria-live="polite">` |
| Unknown hash | Falls back to the file's default state |

### 4.3 The state bar (hidden by `nobar`)

- **Ground and type:** `var(--rail)` ground, `var(--ink-muted)` text, DM Mono 11px, tracking .04em, a 1px `var(--hairline-strong)` bottom rule, and 10px 24px padding (10px 16px at 390).
- **Buttons:** `.act .act--tertiary` with `aria-pressed`. The bar wraps at 390.
- **No Playfair** in the bar.
- **Caveats live only here.** The bar is the only place where "invented", "replica", "proposed" or any other caveat may appear.

Bar caption, one line each:

| File | Caption |
|---|---|
| A | `Today, replicated from code · Ashby Lakehouse · Wed 28 Oct 2026 · invented data · not screenshots` |
| B | `Proposed · Ashby Lakehouse · Wed 28 Oct 2026 · invented data · open rulings marked in the rail` |
| C | `Proposed, phone · Ashby Lakehouse · invented data · open rulings in the notes` |

---

## 5. File A: `today-1440.html`, five screens from today's code

**Layout.** The band is 1200px. On the left is a **face column 840px wide** holding the replica. Then a 48px gap. On the right is the **rail, 312px**, headed "FRICTION". With `nopins`, the rail is gone and the face column centres in the band.

**Faithfulness.** Copy the strings below exactly. They are today's strings, read from the code. Where this file shows a state word, it uses the `.word` box: today's portal draws a Stamp, and this is its closest house equivalent. Today's dusty-blue "Acknowledged" stamp has no house token, so draw it as `.word` with the default border and `var(--ink-muted)` text.

**Pins.** Number the pins 1 to 22 across the whole file. Each state's rail shows only that state's pins, in numeric order.

### 5.1 `#state-unfold`: the FF&E section with the sofa unfolded

The face shows The Document's Project section for Ashby Lakehouse:
- a `.t-head` eyebrow "ASHBY LAKEHOUSE"
- `<h1>` "Ashby Lakehouse"
- an `<h2>` "Project" set as `.t-d3`

| # | Must be visible |
|---|---|
| 1 | Four rows, in this order: Sofa (Living room · Hale Upholstery Works · word `Ordered`), Bar stools (Kitchen · Oro Seating · word `Specified`), Pair of nightstands (Primary bedroom · no maker printed · word `Specified`), Kitchen pendants (Kitchen · Larkspur Lighting · word `Delivered`, sage) |
| 2 | The Sofa row is unfolded with a 3px `var(--clay)` left border on a `var(--paper-doc)` ground. Its unfold has three cells: **Purchase order**, "PO-1042" over "sent to vendor Oct 7 · acknowledged"; **Movement**, "Acknowledged" with an inline "arrives ~Nov 4"; **Receiving**, "—" |
| 3 | The trail, as an `<ol>`, in this order: Cleared to produce, Released to maker, Acknowledged (current), Awaiting inputs · no record, In production, Ready to ship · no record, In transit, Received, Accepted or issue, Stored · no record, Install released · no record, Installed, Closed · no record |
| 4 | The commercial line "signed price $9,720.00 · deposit clear" |
| 5 | A room select showing "Living room" |
| 6 | The act row, in order: "Send to vendor", "Log inspection", "Bill", "Add note", "Fold". There is no "Log ack" and no "Mark installed" |
| 7 | The Bar stools row, folded, shows the inline act "Order with Assistant", enabled |
| 8 | The Pair of nightstands row, folded, shows "Order with Assistant" with `aria-disabled="true"` and the visible reason "No vendor on this line yet" |
| 9 | The unfold shows no SKU, no finish, no dimensions and no fabric |

Pins and rail entries:

| Pin | Sits on | Rail sentence | Evidence line |
|---|---|---|---|
| 1 | The current trail step, "Acknowledged" | Hale is building the sofa, but the line can never say so. Nothing in the portal moves an order to in production or shipped. | `use-procurement.ts:770` has zero callers; `purchase_orders` is RPC-only, `00447:15-36` |
| 2 | Bar stools, "Order with Assistant" | Ordering is offered on a line the client has not approved. On a job with no agreement behind it nothing writes approved, so the line stays specified for good. | `line-unfold.tsx:75`; `00331:665,703` |
| 3 | Nightstands, the disabled act | A pasted link has no maker and no trade cost, and the studio has no way to add either. | `use-project-v2.ts:287-298,329-336` throw "RPC-only" |
| 4 | The empty spec area | The unfold shows neither the SKU, the finish nor the COM fabric. The fabric lives only in the product configuration. | `00413:45-71`; spec row inserted empty, `00380:565-570` |
| 5 | The act row | Acknowledgments can be logged only from the Ledger. There is no act here to mark a piece installed, so close-out can never clear. | `closure-derivation.ts:191-199` |

### 5.2 `#state-review`: Order Assistant, step 1

The face is a 760px sheet over the Project section, which shows behind it in `var(--paper)` with no dimming. Sheet title: "Order with Assistant". Page label: "Oro Seating".

| # | Must be visible |
|---|---|
| 1 | The header "Step 1 of 4 · Review items" |
| 2 | Section "Open vendor portal" with the line "No trade portal on file" |
| 3 | Section "Copy item details" with the act "Copy details" and a preformatted block reading, on two lines: "1. Bar stools · Kitchen" then "Ship to: Middlewest Studio · Madison WI" |
| 4 | Below that block, the item list: "Bar stools · ×3 · $540.00 · $1,620.00" |
| 5 | Acts at the foot: "Back" (tertiary) and "Continue" (terminal) |

| Pin | Sits on | Rail sentence | Evidence line |
|---|---|---|---|
| 6 | "Ship to: Middlewest Studio · Madison WI" | Every studio's order screen prints the same hardcoded address, &ldquo;Middlewest Studio · Madison WI&rdquo; (Leah&rsquo;s own studio). | `order-assistant/step-review.tsx:31` |
| 7 | "Continue" | When the PO goes out with no ship-to, the send fills in the client's house and saves it. LTL freight then arrives at 2216 North Shore Drive, where there is no dock and no inspection. | `po-send/index.ts:382-393` |
| 8 | The copied block | The copied text carries only the name and the room. The SKU, finish and quantity are retyped by hand into the vendor's portal. | `step-review.tsx` |
| 9 | "Step 1 of 4" | Four steps lead to a second send screen, whose note-to-vendor field is still a TODO. | `po-send-actions.tsx:26`; `order-assistant/index.tsx:1057` |

### 5.3 `#state-ledger`: Orders book, Ledger

The face shows:
- a sheet head with a small inline SVG package icon and the `.t-head` "ORDERS · LEDGER"
- the intro line "Every project's purchase orders, gathered in one studio register."
- page links "Ledger · The Week · Receiving · Vendors", with Ledger current

| # | Must be visible |
|---|---|
| 1 | Front matter in one line: "Open: 6 · Arriving this week: 0 · Unsent: 1 · No ack: 0" |
| 2 | A lens line "project · all · Ashby Lakehouse", with "all" pressed |
| 3 | A lens line "payment · all · due · pending · paid", with "all" pressed |
| 4 | A tertiary act "Select multiple" |
| 5 | Vendor groups in uppercase `.t-head`, in this order: ARDENT RUG ATELIER, FENWICK & ROWE, HALE UPHOLSTERY WORKS, KESSLER TEXTILE CO., LARKSPUR LIGHTING, STILLWATER DRAPERY CO. |
| 6 | Each PO row has two lines. **Line 1:** the PO number, then the word, then the ETA. **Line 2:** "Ashby Lakehouse · $total · sent Oct d · ack", then acts. The rows: <br>• 1046: `Acknowledged`, "~Nov 20", "$4,350.00 · sent Oct 1 · acknowledged"<br>• 1045: `Acknowledged`, "~Dec 11", "$9,800.00 · sent Oct 13 · acknowledged"<br>• 1042: `Acknowledged`, "~Nov 4", "$6,480.00 · sent Oct 7 · acknowledged"<br>• 1043: `Acknowledged`, "NO DATE", "$1,216.00 · sent Oct 7 · acknowledged"<br>• 1047: `Delivered` (sage), "Oct 26", "$2,460.00 · sent Oct 6 · acknowledged"<br>• 1048: `Draft` (oak border, `var(--ink-muted)` text), "NO DATE", "$3,860.00 · not sent" |
| 7 | Acts on each sent row: "log ack ↓", "resend", "pdf", "open document →". On 1048: "send →", "pdf", "open document →" |
| 8 | The Fenwick row 1045 has its ack band unfolded. Above it: "Stamped as of today — PO # and ETA are optional, blank keeps what's on file." Two fields, "VENDOR PO #" (empty) and "CONFIRMED ETA" holding "Dec 11", and the secondary act "Log acknowledgment" |
| 9 | Row 1046 says nothing about a backorder |

| Pin | Sits on | Rail sentence | Evidence line |
|---|---|---|---|
| 10 | The "payment · … paid" lens | The studio can filter by paid, but nothing lets it record a payment. Hale's balance, due Friday, can never clear. | `use-procurement.ts:602` has zero callers; `00189:7-19` |
| 11 | The ack band | An acknowledgment records only a vendor number and a date. Fenwick confirmed the lounge chairs in Natural oak against an order for Smoked walnut, and this band cannot show it. | `00190:29-32` |
| 12 | "CONFIRMED ETA" | Changing the date writes straight to a table that refuses direct writes, so the change probably fails. Runtime not verified. | `use-procurement.ts:663-708`; `00447:15-36` |
| 13 | 1048 "send →" | Priya owns the project. When Maya sends the order she built, the send replies "not found". | `po-send/index.ts:236`; `00449:131-136` |
| 14 | 1046's ETA "~Nov 20" | Ardent moved the rug to mid-January. A line can only be marked blocked, so the old date stands. | `is_blocked` only, R3 J1 |
| 15 | The project lens | When the studio opens the Ledger from Ashby Lakehouse to chase an order, the lens resets to all projects. | `orders-ledger.tsx:158` |

### 5.4 `#state-receiving`: Receiving, with the Log inspection drawer open

The face shows the Orders book page links with Receiving current. A 640px drawer titled "Log inspection" sits over the right of the face column.

| # | Must be visible |
|---|---|
| 1 | The strip: "Arriving · next 7 days 0 · Awaiting log 1 · Open claims 0 · Received · 30d 0" |
| 2 | Group "Awaiting inspection · 1" with the row "PO-1047 · Larkspur Lighting", "Ashby Lakehouse · delivered Oct 26", and the acts "Inspect" and "open document →" |
| 3 | Group "Open claims · 0" with the line "Nothing waiting on the warehouse floor." |
| 4 | In the drawer: "PO-1047 · Larkspur Lighting"; a field "OUTCOME" with three choices, Clean, Damaged and Partial, with Damaged pressed |
| 5 | A field "NOTES" holding "Shade on one of three pendants cracked at the rim. Carton corner crushed." |
| 6 | A dashed 1px `var(--hairline-strong)` box reading **"Photos: upload via mobile."** then "Open the iOS app and tap *Log on phone* from the Arriving tab to attach photo evidence. Desktop logs the inspection without photos." |
| 7 | The terminal act "Log inspection" |

| Pin | Sits on | Rail sentence | Evidence line |
|---|---|---|---|
| 16 | The dashed photo box | The desk cannot attach a photo. Photos taken on the phone cannot be opened on the desk either, because the media service hands back a storage key instead of a link. | `log-inspection-drawer.tsx:456-467`; `media.service.ts:197` |
| 17 | "Received · 30d" | The only clock on this page counts the last 30 days. Larkspur's claim window, three business days that close Thu Oct 29 at 5 pm, appears nowhere. | `orders-book-receiving.tsx:10` |
| 18 | OUTCOME | One outcome covers the whole delivery. Nothing records which piece cracked, or that the damage was noted on the carrier's receipt. | R3 I1/I3; `00150` |

### 5.5 `#state-addline`: Add a line, after Import a schedule

The face shows a 640px sheet, "Add a line", with the page label "Ashby Lakehouse".

| # | Must be visible |
|---|---|
| 1 | Five rows, each with a Playfair 14px label, an 11px description and a clay "→":<br>• "Start a board" / "Concept, selections, materials, or blank."<br>• "Browse the Library" / "Choose one known product, then route it here."<br>• "Paste a product link" / "Capture through the guarded URL intake, then route it here."<br>• "Name a need" / "Add a named selection to resolve later."<br>• "Import a schedule" / "Project schedule staging is not available in this build." |
| 2 | Under the rows, an inline failure line in `var(--terracotta-ink)` with a 2px leading rule: "Project schedule staging is not available yet. No selections were created." |
| 3 | No toast and no overlay. The failure sits in the sheet |

| Pin | Sits on | Rail sentence | Evidence line |
|---|---|---|---|
| 19 | The failure line | Import a schedule is a labelled dead end, though the staging and review pipeline it needs already exists. | `add-to-project-sheet.tsx:272-274`; staging through `00666` |
| 20 | The row list | There is no road for a custom piece with its fabric, a store buy, an estate find, a sample or a reimbursable. None of them has a model. | R2; R3 lanes 3 to 8 |
| 21 | "Paste a product link" | A pasted piece arrives with no maker, and its retail price is written into the trade cost. | `00435:203,234` |
| 22 | "Name a need" | A named need can never become an order. An order needs a vendor, and the studio has no way to put one on the line. | `00148:54`; `00435:894` |

---

## 6. File B: `proposed-1440.html`, the proposed studio surface

**Layout.** Same as A: a face column 840px wide, a 48px gap, and the rail at 312px headed "RULINGS AND NOTES". With `nopins`, the face column centres.

**Pins.** Number the pins P1 to P30 across the file. Each state's rail shows only that state's pins. The box prints the number alone ("1"), and the rail entry reads "1". B's pins use `var(--clay-ink)`.

**What every buying screen holds to:**
- **Trade cost only.** No buying screen shows margin, markup or a percentage. The single exception is the owner block in `#state-money`.
- **One terminal act** per screen at most.
- **Totals are front matter.** Every total sits directly above the rows it sums.
- **Drafts wait for a person.** Every outbound message is a draft that a person sends.

**Common head on every state:**
- `.t-head` "ASHBY LAKEHOUSE · HARTWELL STUDIO"
- `<h1>` "Ashby Lakehouse"
- one meta line "Nora and Martin Ashby · 2216 North Shore Drive, Excelsior MN 55331"

Sheets (`#state-add`, `#state-custom`, `#state-paper`, `#state-ack`) open over the job. The job's head stays visible above them.

### 6.1 `#state-spine`: the job, read by maker

| # | Must be visible |
|---|---|
| 1 | `<h2>` "Project" (`.t-d3`), followed by the reading links "read by · room · maker · next act", with "maker" current |
| 2 | Front matter, one block of three short lines:<br>• "17 lines · 5 orders sent · 1 held for release · 2 purchases"<br>• "On orders $24,306.00 · Paid out $9,571.00 · Due this week $3,520.00"<br>• "Paid at checkout, from Patina, $7,900.00 · Purchases $2,056.50" |
| 3 | Column heads in `.t-head`: LINE, ROOM, QTY, TRADE COST, STATE. There is no client price column and no margin column |
| 4 | Groups in this order, each headed by the maker in `.t-head` with a group foot sentence in `.t-body-sm`:<br>**HALE UPHOLSTERY WORKS** · "PO-1042 · In production · arrives ~Wed 4 Nov at Cedar Lake"<br>**KESSLER TEXTILE CO.** · "PO-1043 · delivered to Hale 22 Oct"<br>**FENWICK & ROWE** · "PO-1045 · acknowledged with 2 differences"<br>**LARKSPUR LIGHTING** · "PO-1047 · delivered 26 Oct · tell Larkspur by Thu 29 Oct, 5 pm"<br>**ARDENT RUG ATELIER** · "PO-1046 · backorder · now ~Fri 15 Jan 2027"<br>**STILLWATER DRAPERY CO.** · "PO-1048 · held for release"<br>**ORO SEATING** · "Not yet ordered"<br>**TAMARACK WOODWORKS** · "from Patina · order 2219 · In production · ~Fri 4 Dec"<br>**PURCHASES** · "Bought and paid. No order to send."<br>**NO MAKER YET** · "2 lines" |
| 5 | Line rows. Name, then the `.kind` word where one exists, then room, qty, trade cost and a `.word`:<br>• Sofa `custom · Hale Upholstery Works` · Living room · 1 · $6,480.00 · `In production` (golden)<br>• Fabric for the sofa `fabric for: Sofa` · Living room · 19 yd · $1,216.00 · `Delivered` (sage)<br>• Fabric memos, 3 `sample` · "return by Fri 6 Nov" · `Out` (dormant)<br>• Lounge chairs · 2 · $4,280.00 · `Differs` (blocked)<br>• Dining chairs · 8 · $5,520.00 · `Acknowledged` (current)<br>• Smoked walnut finish chip `sample` · `Received` (dormant)<br>• Sconce pair · 2 · $1,170.00 · `Accepted` (current)<br>• Kitchen pendants · 3 · $1,290.00 · `Claim open` (blocked)<br>• Wool rug, 9 × 12 · 1 · $4,350.00 · `Backorder` (blocked)<br>• Living room drapery · 4 · $3,860.00 · `Waiting` (pending)<br>• Bar stools · 3 · $1,620.00 · `Ready` (current)<br>• Dining table, walnut `from Patina` · 1 · "Paid at checkout" · `In production` (golden)<br>• Table lamps, pair `store buy · Northloop Home Supply` · 2 · $389.00 · `Bought` (current)<br>• Pine console, c. 1880 `a find · Holm Estate Sales` · 1 · $1,667.50 · `Bought` (current)<br>• Pair of nightstands · 2 · "—" · `Not ready` (dormant)<br>• Entry bench `to be found` · "—" · `To find` (dormant) |
| 6 | Riders fold under their parent and are indented 24px, in `.t-body-sm`:<br>• under Sofa: "Freight, Hale to Cedar Lake · estimate $420.00"<br>• under the Fenwick group: "LTL freight, Lakeland Freight · estimate $610.00"<br>• under Pine console: "Buyer's premium, 15% · $217.50" and "Studio van to Cannon Falls, 112 mi · $78.40 · reimbursable" |
| 7 | Readiness words printed under rows:<br>• Pair of nightstands: "needs a maker · needs a trade cost" (hard-stop rule)<br>• Bar stools: "Ready to order"<br>• Living room drapery: "Waiting for release by an owner or admin" (waiting treatment) |
| 8 | The Oro group foot carries the secondary act "Write the order to Oro" |
| 9 | The Sofa row is unfolded (`aria-expanded="true"`), with these cells in a 3 × 2 grid:<br>**THE BUY:** "Hale Upholstery Works · HU-TA96 · COM, Kessler Brae linen, Flax · 96 W × 38 D × 33 H in · 1 · $6,480.00 · 9 weeks"<br>**QUOTE:** "Hale, 2 Oct · $6,480.00"<br>**ORDER:** "PO-1042 · sent 7 Oct by Maya Reyes · acknowledged 9 Oct, agrees"<br>**MOVEMENT:** "In production · ships Mon 2 Nov · arrives ~Wed 4 Nov at Cedar Lake Receiving & Storage"<br>**MONEY OUT:** "Deposit $3,240.00 paid 8 Oct, Amex ••4471 · Balance $3,240.00 due Fri 30 Oct"<br>**RECEIVING:** "Not yet" |
| 10 | The unfold's trail, an `<ol>`: Quoted, Ordered, Acknowledged, In production (current), Shipped, Received, Inspected, Installed |
| 11 | The unfold's acts: secondary "Record the balance", then tertiary "Change the date", "Change or cancel", "Mark installed", "Fold". "Mark installed" carries `aria-disabled="true"` with the visible reason "Not received yet" |
| 12 | A line under the Tamarack row: "Patina's maker order. Payment and fulfillment run through Patina." |

| Pin | Sits on | Rail sentence | Evidence |
|---|---|---|---|
| 1 | "read by · … maker · next act" | Read by maker ships in Phase 1. Read by next act waits for a ruling on whether it reopens the By Status view the R21 dissolve closed. | C-15, C-33 · R-PB5 · flag `document-buying-readings` |
| 2 | The TRADE COST column | Buying screens show what the studio pays the maker, and nothing more. Who sees margin is an open ruling. | R1 open · V1 open |
| 3 | The Tamarack row | The Patina maker order is one lane, shown as paid at checkout. It is kept out of every studio total until V1 is ruled. | V1 open · `00350/00352` |
| 4 | The nightstands readiness | One readiness rule, mirroring what the database refuses. It says in words what a line still needs. | C-11a · `00445:60` |
| 5 | "Waiting for release" | Held for release is designed but off by default. It is built only after a ruling. | C-32 · R-PB2, R-PB6 |
| 6 | The PURCHASES group | Store buys and finds are purchase records, not orders: there is nothing to send or acknowledge. | C-25 · R-PB7 for billing · flag `buying-purchases` |
| 7 | The riders | Freight, receiving and premiums fold under the line they serve. The payee can differ from the maker. | C-26 · flag `buying-freight` |
| 8 | MONEY OUT | Recording a payment is a secondary act. It writes an append-only record and never touches a card-processor row. | C-11 · flag `buying-payments-made` |
| 9 | Bar stools "Ready to order" | On a job with no agreement behind it, the client's yes is a warning, not a stop, until ruled. Nora approved these on 20 Oct. | R-PB1 open |

### 6.2 `#state-add`: Add to the job, with the line card

A 760px sheet titled "Add to the job", with the page label "Ashby Lakehouse". Its left part is the source list, 280px wide. Its right part is the line card.

| # | Must be visible |
|---|---|
| 1 | Source list head "FROM SOMETHING YOU HAVE", with rows: From the Library; Paste a link; From a photo; From a vendor's quote; Import a schedule; Bring in a deck |
| 2 | Source list head "NOT IN ANY CATALOG", with rows: A custom piece (pressed); A find; A store buy; Name a need |
| 3 | Under the list, one quiet line: "Import a schedule reads it first and shows you each line before anything is added." |
| 4 | The line card heading (`.t-d3`): "The line, as it will be bought" |
| 5 | Fields with `.t-head` labels:<br>• MAKER: "Hale Upholstery Works", with the inline secondary act "New maker"<br>• WHAT IT IS: "Window seat cushion"<br>• KIND: "A custom piece"<br>• ROOM: "Kitchen"<br>• QUANTITY: "1"<br>• TRADE COST: "$640.00"<br>• CLIENT PRICE: "$960.00"<br>• LEAD TIME: "6 weeks" |
| 6 | A sub-region "THE FABRIC" with fields:<br>• FABRIC MAKER: "Kessler Textile Co."<br>• FABRIC: "Brae linen, Flax"<br>• YARDS: "4"<br>• TRADE COST PER YARD: "$64.00"<br>• SHIPS TO: "Hale Upholstery Works"<br>and the computed line "4 yd × $64.00 = $256.00" |
| 7 | Readiness, warning rule: "needs the client's yes · needs the CFA" |
| 8 | Consequence sentence: "This adds two lines: the cushion from Hale and its fabric from Kessler, shipped to Hale. Nothing is ordered yet." |
| 9 | The terminal act "Put it on the schedule" |
| 10 | No field uses a `placeholder` attribute |

| Pin | Sits on | Rail sentence | Evidence |
|---|---|---|---|
| 10 | The source list | One sheet for any road into the job. Schedule import and vendor quotes reuse the deck import's review pages. | C-16 · flags `buying-line-card`, `ffe-schedule-import` |
| 11 | "New maker" | A studio's new maker is a studio card over a shared maker record, found first by its website. | R-PB4 open |
| 12 | CLIENT PRICE | The client price is entered here only at intake. Repricing after the client agrees waits on R1, R5 and R8. On imported lines, the trade cost stays empty until the studio confirms it. | R1, R5, R8 open · R-DI4 |
| 13 | THE FABRIC | The fabric is its own line, with its own maker and destination. It is linked to the work it feeds. | C-24 · flag `buying-com-pair` |

### 6.3 `#state-custom`: the custom piece

A 760px sheet titled "Sofa", with the page label "custom · Hale Upholstery Works".

| # | Must be visible |
|---|---|
| 1 | Region "THE WORK":<br>• "Hale Upholstery Works · PO-1042"<br>• "Track-arm sofa, kiln-dried maple frame, 8-way hand-tied"<br>• "96 W × 38 D × 33 H in"<br>• "Trade cost $6,480.00"<br>• "Ships to Cedar Lake Receiving & Storage"<br>• the word `In production` |
| 2 | Region "THE FABRIC":<br>• "Kessler Textile Co. · PO-1043"<br>• "Brae linen, Flax · 54 in wide · plain"<br>• "19 yd × $64.00 = $1,216.00"<br>• "Ships to Hale Upholstery Works"<br>• "Tagged HART-ASHBY-LR-SOFA"<br>• the word `Delivered` |
| 3 | A yardage line with its arithmetic: "Hale asked for 17 yd. With 10% for cutting that is 18.7 yd, ordered as 19 yd. Hale's number wins." |
| 4 | The trail "CUTTING FOR APPROVAL" as an `<ol>`: Cutting requested 2 Oct; Cutting received 8 Oct; Approved by Priya Natarajan 9 Oct (current, done); Fabric ordered 7 Oct after a reserve held to 9 Oct; Dye lot 31-118; Fabric delivered to Hale 22 Oct |
| 5 | The sentence "Two orders make this sofa: the fabric from Kessler, shipped to Hale, and the work from Hale, shipped to Cedar Lake." |
| 6 | The note to Hale as printed on PO-1042: "COM arriving separately: Kessler PO-1043, 19 yd Brae linen, Flax, tagged HART-ASHBY-LR-SOFA." |
| 7 | Tertiary acts: "Open PO-1042", "Open PO-1043", "Fold" |

| Pin | Sits on | Rail sentence | Evidence |
|---|---|---|---|
| 14 | "Two orders make this sofa" | No platform reviewed models COM as a chain across two vendors. Today COM lives only in the product configuration. | R4 open ground · `00413:45-71` |
| 15 | The approval trail | Cutting for approval is a dated record that gates the fabric order. | C-24 · flag `buying-cfa` |
| 16 | The fabric's price | Whether COM fabric bought through Patina carries a margin is V1. | V1 open · R1 open |

### 6.4 `#state-paper`: the order paper, held for release

A 760px sheet titled "Purchase order 1048", with the page label "Stillwater Drapery Co.". The face shows Maya's view on 28 Oct, just before she holds the order.

| # | Must be visible |
|---|---|
| 1 | A header block:<br>• "Hartwell Studio · 412 N 1st St, Suite 300, Minneapolis MN 55401"<br>• "To Stillwater Drapery Co. · work@stillwaterdrapery.com · account SD-0712" |
| 2 | Fields:<br>• SIDEMARK: "HART-ASHBY-LR-DRAPERY"<br>• REQUESTED SHIP: "Fri 20 Nov"<br>• BILL TO: "Hartwell Studio"<br>• FREIGHT: "Prepaid and added" |
| 3 | A field group "SHIP TO", `role="radiogroup"`, with four choices:<br>• "Cedar Lake Receiving & Storage · 3100 Cedar Lake Rd, Minneapolis MN 55416 · dock weekdays 07:00 to 15:30" (checked)<br>• "The job site · 2216 North Shore Drive, Excelsior MN 55331"<br>• "The studio · 412 N 1st St, Suite 300, Minneapolis MN 55401"<br>• "Another address" |
| 4 | The line table, with heads LINE, QTY, TRADE COST: "Living room drapery · Stillwater house linen, Oat, pinch pleat, lined and interlined · 108 in finished length · 4 panels · $3,860.00" |
| 5 | The total line "Total $3,860.00" |
| 6 | Terms: "50% deposit, 50% before ship · $1,930.00 at release · $1,930.00 before ship" |
| 7 | A field NOTE TO STILLWATER holding "Measurements from the site visit, 21 Oct, are attached. Questions to Maya Reyes, (612) 555-0162." |
| 8 | In the held treatment: "Not invoiced to the Ashbys yet. Releasing fronts the $1,930.00 deposit from studio funds." Beside it, the tertiary act "Invoice the Ashbys first" |
| 9 | In the waiting treatment: "Orders over $2,500.00 wait for an owner or admin to release them." |
| 10 | Consequence sentence: "This order is over the studio's $2,500.00 line, so it waits for Leah Hartwell or Priya Natarajan. Holding sends nothing to Stillwater." |
| 11 | The terminal act "Hold for release · $3,860.00" |
| 12 | Under it, the secondary act "Save the paper" and the tertiary act "Released by phone or portal — mark as sent" |
| 13 | No second send screen follows. The paper is the PO |

| Pin | Sits on | Rail sentence | Evidence |
|---|---|---|---|
| 17 | SHIP TO | The ship-to is always chosen and never preselected. A PO with no ship-to does not send, though its preview still renders. | C-02, C-13 · R-PB3 open |
| 18 | The terminal act | The order paper replaces the four-step assistant and its second send screen. | C-23 · flag `buying-order-paper` |
| 19 | The waiting line | The release line is a studio setting: off by default, using owner and admin seats. Whether Patina offers it at all is Kody's ruling. | C-32 · R-PB2, R-PB6 open |
| 20 | The coverage sentence | This warns and never blocks, matching today's coverage check. | `step-coverage.tsx:158-254` · R9 posture |

### 6.5 `#state-ack`: the acknowledgment check

A 760px sheet titled "Fenwick & Rowe acknowledged PO-1045", with the page label "20 Oct".

| # | Must be visible |
|---|---|
| 1 | A table with heads WHAT, QUOTED, WE ORDERED, THEY CONFIRMED, and a final unheaded column for the word |
| 2 | Rows:<br>• "Lounge chairs · finish" · "Smoked walnut" · "Smoked walnut" · "Natural oak" · `Differs` (blocked)<br>• "Lounge chairs · price" · "$2,140.00" · "$2,140.00" · "$2,140.00" · `Agrees` (current)<br>• "Dining chairs · finish" · "Smoked walnut" · "Smoked walnut" · "Smoked walnut" · `Agrees`<br>• "Dining chairs · price" · "$690.00" · "$690.00" · "$690.00" · `Agrees`<br>• "Ship date" · "—" · "Fri 27 Nov" · "Fri 4 Dec" · `Differs`<br>• "Terms" · "30% deposit, 70% before ship" (all three) · `Agrees`<br>• "Freight" · "Lakeland Freight, to Cedar Lake" (all three) · `Agrees` |
| 3 | Under the table: "Quote Q-5528, 2 Oct, valid to Mon 2 Nov. The money agrees: $9,800.00 on all three." |
| 4 | Consequence sentence: "This drafts a reply to Fenwick about 2 differences and files it for your review. Nothing is sent until you send it." |
| 5 | The secondary act "Draft a reply to Fenwick about 2 differences", then the tertiary act "Accept as acknowledged anyway" |
| 6 | There is no terminal act in this state |
| 7 | A line under the acts: "Fenwick's date moves the chairs to ~Fri 11 Dec at Cedar Lake." |

| Pin | Sits on | Rail sentence | Evidence |
|---|---|---|---|
| 21 | "Natural oak" | Practitioners name a silently accepted wrong acknowledgment as the costliest buying miss. Today an ack records only a number and a date. | R3 failure 1 · `00190:29-32` · C-27 |
| 22 | The draft act | Drafts wait for a person. No Designer-Taught Intelligence composes them until a studio member can review agent work. | Agent OS rule · C-28 |
| 23 | "Accept … anyway" | Accepting a changed price on an approved line waits on R8. Here the price agrees. | R8 open |

### 6.6 `#state-money`: money out, money in, and the owner block

No sheet. `<h2>` "Money" (`.t-d3`). The page links read "Project · Money · Receiving", with Money current.

| # | Must be visible |
|---|---|
| 1 | Front matter: "Due this week · $3,520.00 across 2" |
| 2 | Rows under it:<br>• "Hale Upholstery Works · PO-1042 balance · due Fri 30 Oct · $3,240.00"<br>• "Cedar Lake Receiving & Storage · Receiving and handling, October · due Fri 30 Oct · $280.00" |
| 3 | The Hale row is unfolded, with fields AMOUNT "$3,240.00", PAID ON "28 Oct 2026", METHOD "Amex · Leah ••4471", REFERENCE (empty). Then the secondary act "Record the payment" and the line "Recorded payments can be voided, never edited." |
| 4 | Region "PAID OUT · $9,571.00", with rows:<br>• "Ardent Rug Atelier · PO-1046 deposit · 2 Oct · Amex ••4471 · $2,175.00"<br>• "Kessler Textile Co. · PO-1043 in full · 7 Oct · ACH ••0918 · $1,216.00"<br>• "Hale Upholstery Works · PO-1042 deposit · 8 Oct · Amex ••4471 · Maya Reyes · $3,240.00"<br>• "Fenwick & Rowe · PO-1045 deposit · 15 Oct · check 2207 · $2,940.00" |
| 5 | Region "LATER", with rows:<br>• "Larkspur Lighting · PO-1047 · NET-30 · due Wed 25 Nov · $2,460.00"<br>• "Fenwick & Rowe · PO-1045 balance · before ship · $6,860.00"<br>• "Ardent Rug Atelier · PO-1046 balance · before ship · $2,175.00" |
| 6 | Region "PAID AT CHECKOUT": "Tamarack Woodworks · from Patina · order 2219 · 6 Oct · $7,900.00" |
| 7 | Region "CLIENT COVERAGE":<br>• "Invoice №0214 · paid 5 Oct · $33,334.00 · covers Sofa, Fabric for the sofa, Dining table, Sconce pair, Kitchen pendants, Wool rug"<br>• "Invoice №0219 · sent 21 Oct, unpaid · $14,260.00 · covers Lounge chairs, Dining chairs", with the held line beneath: "Fronting $2,940.00 to Fenwick & Rowe from studio funds since 15 Oct."<br>• "Not invoiced · Living room drapery $5,600.00 · Bar stools $2,385.00" |
| 8 | Region "PURCHASES TO BILL · 3", with rows:<br>• "Table lamps, pair · Northloop Home Supply · 19 Oct · $389.00 incl. $28.44 tax"<br>• "Pine console, c. 1880 · Holm Estate Sales · Sat 24 Oct · $1,667.50 incl. $217.50 premium"<br>• "Studio van to Cannon Falls · 112 mi · $78.40"<br>Then the secondary act "Bill 3 purchases to the Ashbys" |
| 9 | A final region, set apart by a 1px `var(--hairline-strong)` box (no fill), headed "FOR THE STUDIO OWNER". Lines:<br>• "Studio orders 1042 to 1047"<br>• "Client price $35,744.00"<br>• "Trade cost $24,306.00"<br>• "Difference $11,438.00"<br>• "The Patina order is not in these figures." |
| 10 | No percentage appears anywhere on this state |

| Pin | Sits on | Rail sentence | Evidence |
|---|---|---|---|
| 24 | "Record the payment" | Payments are append-only and lane-guarded. Direct writes to the payment schedule are revoked, and card-processor rows are refused. Internal payables stay the truth. | C-11 · Agent OS payable rule · `00584:242-260` |
| 25 | METHOD | Only the last four digits of a card are stored, as a studio payment method. | C-11 |
| 26 | "Bill 3 purchases" | Whether purchases and riders bill at cost or at client price is an open ruling. Tax per line is a CPA matter. | R-PB7 open · R1 open · `packages/shared/src/invoice/index.ts:71-81` |
| 27 | FOR THE STUDIO OWNER | Who sees this block is R1. Which kind of owner it means (the studio_owner role nobody can grant, or the owner seat) is R-PB6. The basis (margin or markup) is not shown, so R2, the entry frame, stays open. V1 is open, so the Patina order stays out of the total. | R1, R-PB6, V1 open · `use-permissions.ts:429` |

### 6.7 `#state-receiving`: receiving and exceptions

No sheet. `<h2>` "Receiving" (`.t-d3`). Page links "Project · Money · Receiving", with Receiving current.

| # | Must be visible |
|---|---|
| 1 | Front matter: "1 open claim · 1 backorder · 1 return window open · receiver Cedar Lake Receiving & Storage" |
| 2 | Region "OPEN", with the Larkspur row: "PO-1047 · Larkspur Lighting · delivered Mon 26 Oct to Cedar Lake · Kitchen pendants, 1 of 3 damaged". Its word is `Claim open` (blocked). Beneath it, the clock sentence in `var(--ink)`: "Tell Larkspur by Thu 29 Oct, 5 pm." |
| 3 | Under that row: "Checked in by Maya Reyes, 26 Oct 10:40 · damage noted on the carrier's receipt · Lakeland Freight PRO 88120457", then a strip of three 72×72 photo boxes, each with a `<title>` ("Cracked rim, pendant shade", "Shade, second view", "Carton corner") |
| 4 | Then: "Notice to Larkspur drafted 26 Oct, waiting for your review." with the secondary act "Review and send the notice" |
| 5 | The Ardent row: "PO-1046 · Ardent Rug Atelier · Wool rug, 9 × 12", word `Backorder`, and the sentence "Ardent moved the ship date from ~Fri 20 Nov to ~Fri 15 Jan 2027. Told 23 Oct." Acts: tertiary "Tell the Ashbys", tertiary "Look for an alternate" |
| 6 | The Northloop row: "Table lamps, pair · Northloop Home Supply · store buy", word `Return open` (pending), and "Return by Mon 23 Nov." |
| 7 | Region "SETTLED · 30 DAYS":<br>• "Sconce pair · Larkspur Lighting · accepted 26 Oct, clean"<br>• "Fabric for the sofa · received by Hale 22 Oct · 19 yd, dye lot 31-118"<br>• "Pine console, c. 1880 · picked up by the studio van, Sat 24 Oct" |
| 8 | Region "COMING":<br>• "Sofa · Hale Upholstery Works · arrives ~Wed 4 Nov"<br>• "Dining table, walnut · from Patina · ~Fri 4 Dec"<br>• "Lounge chairs and dining chairs · Fenwick & Rowe · ~Fri 11 Dec" |

| Pin | Sits on | Rail sentence | Evidence |
|---|---|---|---|
| 28 | The clock sentence | The window comes from the vendor account: delivered plus 3 business days, by 5 pm. A missed window turns the sentence golden ink, and the studio can still file. | C-20 · R-PB9 defaults · flag `buying-claim-clock` |
| 29 | The photo strip | Photos from the phone open on the desk once the media service signs its links. | C-19 · `media.service.ts:197` · flag `receiving-web-photos` |
| 30 | "Tell the Ashbys" | Telling the client about a date is a draft for review. What the client is told about dates is an open ruling. | R7 open · C-30 |

---

## 7. File C: `proposed-390.html`, the phone

**Layout.** The band is `width: 100%`, padding 24px 16px. No frame, no notch and no device chrome. Under each state's content comes a **Notes** region: an `<h2>` "Notes" in `.t-head`, then an `<ol>` of 2 to 4 entries. It uses the same sentence and evidence pattern as B's rail, with no pin boxes on the face. `nopins` hides it.

### 7.1 `#state-checkin`: Field check-in at Cedar Lake

This is Maya, Mon 26 Oct, 10:40.

| # | Must be visible |
|---|---|
| 1 | `.t-head` "ARRIVING · CEDAR LAKE RECEIVING & STORAGE" and `<h1>` "PO-1047 · Larkspur Lighting" |
| 2 | The sidemark first, large in DM Mono 16px: "HART-ASHBY" with "Ashby Lakehouse" beneath |
| 3 | "Lakeland Freight · PRO 88120457 · Mon 26 Oct 10:40" |
| 4 | Per-line cards, stacked:<br>• **"Sconce pair · Living room · HART-ASHBY-LR"**, with a count field RECEIVED "2 of 2" and CONDITION choices Clean / Damaged / Short, Clean pressed<br>• **"Kitchen pendants · Kitchen · HART-ASHBY-KIT"**, with RECEIVED "3 of 3" and CONDITION "2 clean, 1 damaged" shown as Damaged pressed. A field holds "Shade on one of three pendants cracked at the rim. Carton corner crushed." Below it, three 72×72 photo boxes (with `<title>`) and the secondary act "Add a photo" |
| 5 | A checkbox, checked, drawn with no tick glyph: "Damage noted on the carrier's delivery receipt" |
| 6 | Consequence sentence: "Saving records 5 pieces in, 1 damaged. Larkspur's window closes Thu 29 Oct, 5 pm." |
| 7 | The terminal act "Save the check-in" |
| 8 | Under it, the secondary act "Draft the notice to Larkspur →" |
| 9 | Each target is at least 44×44, with at least 8px between targets |

Notes:
1. "Check-in works the same from Patina Field or the portal at phone width. The receiver at the dock needs no login." — `00281:48-53` · C-19
2. "Per-line count and condition, and the carrier-receipt note, are new. Today one outcome covers the delivery." — C-19 · `00150`
3. "Default windows when a vendor account has none are a ruling for Leah." — R-PB9

### 7.2 `#state-claim`: the drafted notice

| # | Must be visible |
|---|---|
| 1 | `.t-head` "DRAFT · WAITING FOR YOUR REVIEW" and `<h1>` "Notice to Larkspur" |
| 2 | Lines: "To claims@larkspurlighting.com" · "From Maya Reyes, Hartwell Studio" · "Subject: Damage on PO-1047, Ashby Lakehouse (HART-ASHBY)" |
| 3 | A body field holding three short paragraphs: "PO-1047 arrived at Cedar Lake Receiving & Storage on Mon 26 Oct by Lakeland Freight, PRO 88120457." / "One of three kitchen pendants, LL-P09-OP, arrived with the shade cracked at the rim. The damage is noted on the carrier's receipt. Three photos are attached." / "Please send a replacement shade to Cedar Lake. Our sidemark is HART-ASHBY-KIT." |
| 4 | "3 photos attached", with the three boxes |
| 5 | The clock: "Tell Larkspur by Thu 29 Oct, 5 pm." |
| 6 | Consequence sentence: "Sending emails Larkspur from the studio's address and starts the claim. Nothing is sent until you send it." |
| 7 | The terminal act "Send the notice to Larkspur" |
| 8 | The tertiary act "Keep as a draft" |

Notes:
1. "Every outbound message is a draft a person sends. There are no automated external sends." — Agent OS rule · C-28
2. "Sent notices go through the studio's compliant email path." — `sendCompliantEmail`

### 7.3 `#state-release`: Leah releases Maya's order

This is Leah, Wed 28 Oct, 14:00.

| # | Must be visible |
|---|---|
| 1 | `.t-head` "DESK" and a need line in the waiting treatment: "Maya Reyes is holding 1 order for your release · $3,860.00", with the act "Release →" (already opened) |
| 2 | `<h1>` "Purchase order 1048", then "Stillwater Drapery Co. · Ashby Lakehouse" |
| 3 | A compact paper, as label-over-value stacks:<br>• SIDEMARK "HART-ASHBY-LR-DRAPERY"<br>• SHIP TO "Cedar Lake Receiving & Storage"<br>• REQUESTED SHIP "Fri 20 Nov"<br>• LINE "Living room drapery · 4 panels · $3,860.00"<br>• TERMS "$1,930.00 at release · $1,930.00 before ship" |
| 4 | "Held by Maya Reyes, 28 Oct 09:15" |
| 5 | In the held treatment: "Not invoiced to the Ashbys yet. Releasing fronts the $1,930.00 deposit from studio funds." |
| 6 | Consequence sentence: "Releasing sends PO-1048 to Stillwater at work@stillwaterdrapery.com and makes the $1,930.00 deposit due." |
| 7 | The terminal act "Release to Stillwater · $3,860.00" |
| 8 | The secondary act "Send back to Maya with a note" |
| 9 | Nowhere on this state does a margin, markup or client price appear |

Notes:
1. "This is the studio moment: the day Leah is no longer the only person who can commit the studio's money." — R5
2. "Off by default. Owner and admin seats release. Whether Patina offers this at all is a ruling." — R-PB2, R-PB6 · C-32
3. "Today a member who did not create the project gets 'not found' when sending. That is fixed in Phase 0." — `po-send/index.ts:236` · C-07

### 7.4 `#state-released`: the record

| # | Must be visible |
|---|---|
| 1 | `<h1>` "Purchase order 1048" with the word `Sent` (current) |
| 2 | An `<ol>` record, newest first:<br>• "Sent to Stillwater Drapery Co., work@stillwaterdrapery.com · 28 Oct 14:02"<br>• "Released by Leah Hartwell · 28 Oct 14:02"<br>• "Held for release by Maya Reyes · 28 Oct 09:15"<br>• "Written by Maya Reyes · 28 Oct 09:12" |
| 3 | "Deposit $1,930.00 due now · balance $1,930.00 before ship" |
| 4 | "Waiting on Stillwater's acknowledgment." |
| 5 | Tertiary acts "Open the paper" and "Back to the Desk" |
| 6 | Nothing celebrates: no confirmation flourish, no success colour fill |

Notes:
1. "A quiet audit line: who released, and when. It is a record, not a feed." — R4 take · V11

### 7.5 `#state-glance`: one ledger glance

| # | Must be visible |
|---|---|
| 1 | `<h1>` "Ashby Lakehouse" and `.t-head` "BUYING · WED 28 OCT" |
| 2 | Front matter, stacked: "On orders $24,306.00" · "Paid out $9,571.00" · "Due this week $3,520.00 across 2" |
| 3 | Region "NEXT", rows in this order:<br>• "Tell Larkspur by Thu 29 Oct, 5 pm · Kitchen pendants"<br>• "Hale balance $3,240.00 · due Fri 30 Oct"<br>• "Cedar Lake receiving $280.00 · due Fri 30 Oct"<br>• "Fenwick confirmed 2 differences · reply drafted"<br>• "Bar stools ready to order · Oro Seating" |
| 4 | Region "ORDERS", one row per PO: number, maker and the word:<br>• "1042 · Hale Upholstery Works" `In production`<br>• "1043 · Kessler Textile Co." `Delivered`<br>• "1045 · Fenwick & Rowe" `Differs`<br>• "1046 · Ardent Rug Atelier" `Backorder`<br>• "1047 · Larkspur Lighting" `Claim open`<br>• "1048 · Stillwater Drapery Co." `Sent` |
| 5 | Each row is one open control, at least 44px tall. Words print as bordered `.word` boxes at 96px width |
| 6 | No counts in circles, no unread marks, no streaks |

Notes:
1. "A ledger is not a dashboard: totals sit over their rows, and no tile, score or chart appears." — V11 · `VISION-DECISIONS.md:226-241`
2. "Order 1048 reads Sent here because this glance follows the release." — fixture

---

## 8. Copy rules

| # | Rule |
|---|---|
| 1 | Plain, specific, present tense, sentence case, the studio's own words: maker, order, line, piece, the Ashbys, the dock. Confident and unpretentious, plain-spoken Midwest |
| 2 | Name the thing, the person and the date. "Tell Larkspur by Thu 29 Oct, 5 pm." beats "Claim deadline approaching" |
| 3 | A refusal is a reason ("Not received yet", "needs a maker"), never "Unavailable" or "Error" |
| 4 | A consequence sentence says what the act does and what it does not do. Every draft-producing act says "Nothing is sent until you send it." |
| 5 | Money always shows two decimals with a `$` sign. Card and account numbers show four digits after "••" |
| 6 | Never on a face: AI, algorithm, smart, powered by, Pledge, commission, Patina's cut, margin (except inside the owner block, where the word is still not used: it reads "Difference"), dashboard, badge, pill, chip, modal, toast, spinner, wizard, CRM, specimen, prototype, example, sample data, lorem, TBD |
| 7 | "sample" may appear only as the kind word for a fabric memo or finish chip, as in §3 |
| 8 | Avoid curated, luxury, elevated, disrupt, revolutionize, and bespoke. Use "custom" for custom work |
| 9 | No schema words: never `purchase_orders`, `po_payments`, `vendor_id`, `project_ffe_items`, `is_studio_comember`, `L-01`, `V-HALE`, `PM-1`, `R-3`. File A's rail and file B's rail and notes may cite code paths and ruling ids. Faces may not |
| 10 | No exclamation marks. No "Success". No "Oops" |

---

## 9. Width rules

### 9.1 Files A and B (1440)

| Rule | Statement |
|---|---|
| Band | One wrapper, `max-width: 1200px; margin: 0 auto; padding: 48px 24px;`, centred with paper either side |
| Columns | A CSS grid `840px 312px` with a 48px gap. With `nopins`, a single column `max-width: 840px` centred |
| Sheets | 760px (or 640px where §5 says so), placed at the face column's left edge. The job's head stays above them |
| Prose | Paragraphs cap at 65ch. Consequence sentences cap at 56ch |
| Rows | Money columns are right-aligned and tabular. A row never truncates. The name wraps |
| Overflow | `document.documentElement.scrollWidth` must not exceed `clientWidth` |

### 9.2 File C (390)

| Rule | Statement |
|---|---|
| Band | `width: 100%; padding: 24px 16px;`, with no horizontal scroll |
| Tables | Become label-over-value stacks. A table never scrolls sideways |
| Targets | At least 44×44, at least 8px apart. An `<a>` never nests inside a `<button>` |
| Acts | The terminal act runs full width and sits in the flow, directly under its consequence sentence. It is never docked over the sentence |
| Photos | 72×72 boxes in a row of three, 12px apart |
| Overflow | `document.documentElement.scrollWidth` must not exceed `clientWidth` |

---

## 10. Keyboard and assistive

| # | Rule |
|---|---|
| 1 | Every act and field is reachable by Tab in reading order and works with Enter and Space |
| 2 | The focus ring is `outline: 2px solid var(--clay-ink); outline-offset: 2px`, drawn with outline so nothing moves |
| 3 | Exactly one `<p role="status" aria-live="polite">` per file. It carries state-change announcements |
| 4 | A gated act uses `aria-disabled="true"` plus `aria-describedby` pointing at its visible reason. The attribute `disabled` must not appear in any file |
| 5 | Every disclosure (a row unfold, an ack band, a payment band) pairs `aria-expanded` on its trigger with `aria-controls` pointing at the panel's real `id` |
| 6 | A schedule row is a container, not a button. Inside it, the open control is a `<button>` named by the line's name. Any `tel:` or `mailto:` link is a separate sibling |
| 7 | Every set of choices is a `role="group"` or `role="radiogroup"` with an `aria-label`. Pressed choices carry `aria-pressed` (groups) or `aria-checked` (radios) |
| 8 | No state is carried by colour alone. Every `.word` prints its word, and its border pigment agrees with it |
| 9 | Meaningful SVG gets a `<title>`. Decorative SVG gets `aria-hidden="true"`. Pins are `aria-hidden="true"`, and the rail and notes carry their words |
| 10 | Headings run `h1` → `h2` → `h3` in order, with one `h1` per file. Rail and notes headings are `h2` |
| 11 | Write acts are deliberately inert: they stay enabled, focusable buttons with no `aria-disabled` and no caveat on the face. These include Record the payment, Hold for release, Release to Stillwater, Send the notice to Larkspur, Save the check-in, Put it on the schedule, Draft a reply, Bill 3 purchases, and Write the order to Oro. The only `aria-disabled` acts are those §5 to §7 name ("Order with Assistant" on the nightstands, "Mark installed" on the sofa) |
| 12 | `@media (prefers-reduced-motion: reduce)` zeroes animation and transition durations. An unfold may ease its height over `var(--press-out)` with `var(--ease)`, and does nothing else |
| 13 | State changes through the bar keep focus on the pressed bar button |

---

## 11. Forbidden

| # | Never |
|---|---|
| 1 | Any person, firm, place, phone, email, number or price not in §3 or its derivations |
| 2 | Real brand or retailer names |
| 3 | `box-shadow`, `text-overflow`, `opacity` used to express a state, a `disabled` attribute, a `placeholder` attribute, a bare colour dot, a fully rounded pill, a ✓ glyph, a spinner, a green success fill, a filled state pigment |
| 4 | A hex literal outside the pasted token block |
| 5 | Any external resource beyond the Google Fonts preconnects and stylesheet |
| 6 | A caveat on a face. Caveats go in the state bar only. File A's rail and file B's rail and notes may say "today", "proposed" and "ruling", and cite code |
| 7 | A spend chart, a vendor score, an on-time percentage, a per-person order count, an unread count, or any tile grid of numbers (V11) |
| 8 | A margin figure, markup or percentage on any surface except B's owner block, which shows dollars only |
| 9 | Any wording that resolves V1 or R1 to R11. Where a ruling is open, show the neutral fact and pin it |

---

## 12. Render

Run each command with the sandbox disabled: Chromium fails in a sandboxed shell with a Mach port bootstrap error. Output goes to `.../procurement-buying-review-2026-10-05/specimens/shots/`.

Builder A:

```bash
node /Users/kody/Code/patina-merged/artifacts/people-room-crm-2026-09-11/tools/render.mjs \
  /Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/specimens/today-1440.html \
  --out /Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/specimens/shots \
  --name today-1440 --widths 1440 \
  --hashes state-unfold,state-review,state-ledger,state-receiving,state-addline \
  --console
```

Builder B:

```bash
node /Users/kody/Code/patina-merged/artifacts/people-room-crm-2026-09-11/tools/render.mjs \
  /Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/specimens/proposed-1440.html \
  --out /Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/specimens/shots \
  --name proposed-1440 --widths 1440 \
  --hashes state-spine,state-add,state-custom,state-paper,state-ack,state-money,state-receiving \
  --console
```

Builder C:

```bash
node /Users/kody/Code/patina-merged/artifacts/people-room-crm-2026-09-11/tools/render.mjs \
  /Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/specimens/proposed-390.html \
  --out /Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/specimens/shots \
  --name proposed-390 --widths 390 \
  --hashes state-checkin,state-claim,state-release,state-released,state-glance \
  --console
```

Each run must report zero console errors, zero warnings, and `horizontalOverflow: false` on every capture. Also render a dark pass once with `--dark` and check that nothing disappears. The tool navigates straight to each hash and never clicks, so state must come from `location.hash` at load.

---

## 13. Done

| # | Check before you hand back |
|---|---|
| 1 | The file's last line is exactly `<!-- specimen-complete -->` |
| 2 | `grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled' <file>` returns 0 |
| 3 | Every string in your file's acceptance tables appears on the face, spelled exactly |
| 4 | Every name, figure and date on the face is in §3 or its derivations. Sums add up to the cent |
| 5 | The §2.1 token block and the §2.2 fragment are byte for byte as pasted |
| 6 | The render ran clean: zero errors, zero warnings, no horizontal overflow |
| 7 | With `#…&nobar&nopins`, the face carries no caveat, no code path and no ruling id |

<!-- specimen-complete -->
