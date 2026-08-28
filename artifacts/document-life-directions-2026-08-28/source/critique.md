# Critique — three directions for "The Document, alive"

Critic: fresh context, did not author any of the three. Everything below was checked against
the repo at `main`, the fresh captures in `shots/`, the rendered previews in `mock/`, and
recomputed WCAG 2.2 arithmetic (same formula as
`apps/designer-portal/src/lib/document/__tests__/contrast.test.ts:85-102`). Where a number in a
direction disagreed with mine, mine is shown with the hex it came from so the author can check it
in one line.

---

## Verdicts

**Direction A — Ink on Paper.** A is the only lane whose mock actually renders a hierarchy: five
type steps, three rule weights, three separated muted inks and three paper stocks whose
separations I recomputed and confirmed exactly (1.177 / 1.173 / 1.381:1). Its arithmetic for
*why* the inks must darken is sound in shape but wrong in every digit, and its blast radius is
larger than it says — `--bg-primary` is the ground of `/library`, `/people` and every ledger,
none of which A mocks or prices. Take A as the floor, make it tell the truth about the sweep it
rides on, and either scope the ground token or draw the other three rooms.

**Direction B — Honest Materials.** B is the most honest lane about its own risks and the only
one whose data claim I could verify end to end (6 FF&E lines locally, 0 with a `product_id`; 21
products, 17 with images) — and it is also the lane whose signature does not survive
measurement. The five movement stocks are quoted against the sheet but painted on the desk
ground, where they measure **1.001–1.020:1** — flatter than the 1.025:1 the audit called the
defect; what the preview actually shows is a column of saturated badges over nothing. B's real
assets are the rail, the band, the fills and the tabs, all verified correct; its stated
signature is decorative and it should say so or drop it.

**Direction C — The Dark Desk.** C has the largest and most correct numbers in the deck (12.16:1
sheet-to-desk, 13.87:1 sheet-to-rails, all recomputed exact) and the cleanest D4 argument — it
is the strongest case against the elevation amendment. But it does not render its own thesis:
`.sheet-on-desk` is padded, not inset, so preview-c is a dark header, a full-bleed white page and
a dark footer, and inside that page nothing at all changes (`direction-c.css` declares zero
`font-size` rules). Add to that an app-wide `--bg-primary` repoint that darkens three unmocked
rooms and two distinct ways it breaks `contrast.test.ts`, and C as written is the most expensive
lane pretending to be a token change.

---

## Defects

Every defect found, unfiltered. Severity and confidence are mine; the orchestrator filters.

---

### D01 — A repoints an app-wide ground and prices only two routes
**Lane** A · **Severity** high · **Confidence** 0.95

A sets `--bg-primary: #E0D6C4` (`direction-a.md`, token table row 1; `globals.css:62`). Per
`research/12-measurements.md` §1, `--bg-primary` is painted by `.document-route-shell`, "the
wrapper div **every route** in `app/(document)/layout.tsx` renders inside" — so `/library`,
`/people`, `/desk` and every ledger sheet sit on it. A's Refuses says A "does not touch People,
Library or the ledger layouts beyond their type floors." That is false as written: all three
rooms go tan. A mocks neither, and A's file list does not include a single Library, People or
ledger component.

**Settles it:** either scope the tan to the desk route (a `.desk-route` ground token, which is a
component edit A has not priced) or add `/library` and `/people` mocks and their components to
the cost. Repointing `--bg-primary` and mocking two routes is not a ruling the team can make.

**Disposition required:** fix (scope the token) or accept-with-note (and add two mocks).

---

### D02 — A's muted/subtle contrast rows are wrong, and disagree with B's and C's own tables
**Lane** A · **Severity** high · **Confidence** 1.0

A's token table gives `--text-muted: #4E4339` as **10.47 / 8.89 / 7.58** on paper / rail / desk
and `--text-subtle: #5A4E43` as **8.33 / 7.08 / 6.03**. Recomputed:

| token | hex | on `#FCFAF6` | on `#EFE7DA` | on `#E0D6C4` |
|---|---|---|---|---|
| `--text-muted` | `#4E4339` | **9.216** (A: 10.47) | **7.829** (A: 8.89) | **6.672** (A: 7.58) |
| `--text-subtle` | `#5A4E43` | **7.731** (A: 8.33) | **6.568** (A: 7.08) | **5.598** (A: 6.03) |

`--text-faint: #65594E` is right (6.514 / 5.534 / 4.717 vs A's 6.51 / 5.53 / 4.72), which is what
makes the two wrong rows look like a transcription slip rather than a method error. Both
`direction-b.md` and `direction-c.md` print **9.22 / 7.73** for the same two tokens on the same
paper — so A's table contradicts its own siblings inside one deck. `shared-planks.md` SP-02 is
also correct ("`#65594E` holds at 4.72:1 on Direction A's desk stock").

**Settles it:** rerun `research/contrast-check.mjs` over A's table and paste the output.

**Disposition required:** fix.

---

### D03 — A's "why the four inks move" numbers are all overstated
**Lane** A · **Severity** medium · **Confidence** 1.0

A: "On a stock at `#E0D6C4` the shipped I151 values land at 4.43 (clay), 4.09 (terracotta), 4.10
(golden hour) and 4.08 (sage)." Recomputed on `#E0D6C4`: clay `#7C5E30` = **4.166**, terracotta
`#9C5340` = **3.916**, golden `#79651E` = **3.949**, sage `#5F6B57` = **3.913**. Every one is
worse than A claims. The argument survives — all four are under 4.5 and the inks must move — but
four printed figures in a deck are wrong, and they are wrong in the direction that flatters the
status quo.

**Settles it:** recompute; the conclusion does not change.

**Disposition required:** fix.

---

### D04 — A's "span available above the ink floor is 1.27" does not reproduce
**Lane** A · **Severity** medium · **Confidence** 0.9

A argues three stocks 1.15:1 apart cannot fit: "1.15² needs a 1.32 span, and the span available
above the ink floor is 1.27." The 1.15² figure is right (1.3225). The 1.27 is not. Holding all
four shipped inks at ≥4.5:1 caps the deepest stock at about `#EDE5D8` (clay 4.80, terracotta
4.51, golden 4.55, sage 4.51) — and `CR(#FCFAF6, #EDE5D8)` = **1.20**, not 1.27. A's own
candidate `#EDE5D8` is named in the sentence, so this is checkable in one line. Again the
argument survives (1.20 < 1.3225, by more than A claims) and again a printed number is wrong.

**Settles it:** recompute the span from `#EDE5D8`.

**Disposition required:** fix.

---

### D05 — all three lanes mislabel the "from" baseline for the rails
**Lane** all · **Severity** low · **Confidence** 0.85

A: "Today the same three pairs measure 1.025 / 1.000 / 1.025." B: "1.151:1 under the sheet, from
1.053:1 and 1.000:1." C: "13.87:1 (from 1.053:1)." `research/12-measurements.md` §2 is explicit
that 1.053:1 is the spine wash against **the ground it sits on**, and against **the paper** the
same wash is 1.081:1 — the measurer flagged this as "a precision correction" precisely because
the claim did not say which ground. A's triple (1.025 / 1.000 / 1.025) matches no consistent
reading of §1–§2 at all: ground↔paper is 1.025, margin↔ground is 1.000, spine↔paper is 1.081.

**Settles it:** state the ground each "from" figure is measured against, once, in all three
tables.

**Disposition required:** fix.

---

### D06 — A's cost does not cover the two sweeps A depends on
**Lane** A · **Severity** medium · **Confidence** 0.9

A: "2–3 days for the tokens and the named components; the pearl sweep is the long pole and is
mechanical." Counted in `apps/designer-portal/src/components/document`:

- `border-[var(--color-pearl)]` — **502** literals across **172** files (A's 502 is exactly right;
  the file count is not stated).
- `text-[<n>px]` — **1,745** literals across **252** files, in **25** distinct sizes
  (305×`9px`, 270×`12px`, 207×`10px`, 202×`11px`, …).

A defers the type sweep to SP-01, and SP-01 names seven files (see D25). So the 1,745-literal,
252-file sweep is priced nowhere in the package, and 2–3 days plus eleven named components plus a
contrast-test change is not an honest ceiling.

**Settles it:** put both counts in A's cost section and re-estimate.

**Disposition required:** fix.

---

### D07 — A claims a mobile size that is the shared baseline
**Lane** A · **Severity** low · **Confidence** 0.9

A's 390 recipe: "the greeting drops to 26px, which is the only size that changes with the
viewport." `mock/direction-a.css:126` declares `.patina-mock .mdesk .greet { font-size: 26px; }`
in **BLOCK 1**, which that file's own header defines as "shared mock shapes, at TODAY's values …
scoped to all four lane classes." So 26px is today's measured mobile greeting, shared with B, C
and today — not an A move.

**Settles it:** drop the sentence or re-measure.

**Disposition required:** fix.

---

### D08 — A's new hairline reads worse on A's deepest stock than today's pearl does today
**Lane** A · **Severity** medium · **Confidence** 0.8

A replaces `--border-default` `#E5E2DD` with `#D8CDBA`, "a hairline that reads on the deeper
stocks." Recomputed: `#D8CDBA` on the desk stock `#E0D6C4` = **1.092:1**. Today's pearl on
today's off-white is **1.209:1**. On the deepest of A's three stocks — the one the roster and the
studio index print on — the new hairline is *less* visible than the one it replaces. It is fine
on paper (1.508) and rail (1.281); it is the desk that fails, which is where A moved the most
content.

**Settles it:** a second border value for the desk stock, or state that rows on the desk are
separated by `--rule-hair` only and the border token never appears there.

**Disposition required:** fix or accept-with-note.

---

### D09 — A's contrast-test cost misses two existing hardcoded grounds
**Lane** A · **Severity** low · **Confidence** 0.9

A: "The test's ground list would need A's three stocks added — one array." `contrast.test.ts:31-37`
also hardcodes `'red-letter band over paper': '#F9F3EE'` (with a comment deriving it from
`rgba(212,160,144,0.08)`) and `white: '#FFFFFF'`. A changes the red-letter fill to `#F1E1D9` and
`--bg-surface` to `#FCFAF6`, so one entry becomes stale and one becomes a ground nothing paints.
Not a failure — A's inks clear both — but the "one array" line understates the edit.

**Settles it:** name the two entries in the cost.

**Disposition required:** fix.

---

### D10 — B's signature tints are measured against the wrong ground, and on the right ground they are flatter than today
**Lane** B · **Severity** high · **Confidence** 0.95

Every one of B's five movement stocks is quoted against the sheet (`--doc-paper` `#FCFAF6`), where
they sit at 1.026–1.046:1. But in `b-m1-desk-1440.html` the stocks are painted as roster bands on
the **desk ground**, which B leaves at `#FAF7F2`. Recomputed against `#FAF7F2`:

| band | hex | vs desk ground |
|---|---|---|
| Project (the largest group, 4 jobs) | `#FBF7ED` | **1.001:1** |
| Care | `#F7F6F1` | 1.013:1 |
| Install | `#FAF5F0` | 1.014:1 |
| Proposal | `#F9F5EF` | 1.016:1 |
| Brief | `#F6F5F2` | 1.020:1 |

The audit's headline defect is three grounds inside 1.07:1 and the desk ground at 1.025:1 from
paper. B's Project band is **1.001:1** — it is not merely subtle, it is invisible, and four of
five bands are flatter than the number the deck calls the problem. B half-anticipates this
("if hue at 5% cannot be read … B's signature is decorative") but frames it as an open question
for the critic. It is not open; it is measured, and B's own tables do not contain the
measurement.

**Settles it:** print the five stocks against `#FAF7F2` in B's token table, then either deepen
them on the desk or say plainly that the desk's structure is carried by the tab alone.

**Disposition required:** fix.

---

### D11 — the preview confirms the dashboard read, and the band reads as a card
**Lane** B · **Severity** high · **Confidence** 0.9

`mock/preview-b.png`, M1: because of D10 what the eye gets is five saturated rectangles in a
vertical column (the deepened tabs at 4.66–6.19:1 against the ground) with an all-but-invisible
field behind each. That is a status-badge column — Kanban/dashboard grammar — not tinted paper.
Two further reads from the same image: the tabs render as plain rectangles at 1440, not folder
tabs (no notch is legible), so the `FolderCard` defence in B's canon check is not what the team
will see; and each band plus its attached tab reads as a rounded panel, i.e. a card. B names this
as the thing "the critic should press hardest" and answers "it has no edge of its own" — the
preview shows that a ground plus a tab, offset from the copy around it, is an edge whether or not
a border is drawn.

**Settles it:** look at preview-b at 100% next to preview-today and ask a designer which one has
cards on it.

**Disposition required:** fix (deepen the bands so they are paper, or drop the bands and keep
the tab as a rule-and-label device).

---

### D12 — B's roster chip is new data on `desk-roster.tsx`, priced as styling
**Lane** B · **Severity** high · **Confidence** 0.85

B's desk recipe: "A 40px shape-only chip stands where a room scan exists." That requires the
roster to know, per job, whether a scan exists — a query `desk-roster.tsx` does not make today
(`desk-roster.tsx:38-52` renders a 7px mark, a name, a need line and an act; nothing else). B
prices the FF&E thumbnail's query honestly and explicitly ("the FF&E line does not select the
product image today, so the query and the row's markup both change") and then prices the roster
chip as nothing. It also puts a 40px block on a component whose docstring is "one line per job,
wrapping to two or three; never a card" — a 40px chip sets the row's minimum height and makes the
line a block.

**Settles it:** name the scan-existence source, price it beside the FF&E query, and show a
390 roster row with the chip at real size against the "never a card" rule.

**Disposition required:** fix or drop the roster chip (the FF&E thumbnail carries F15 on its own).

---

### D13 — B's imagery is honestly scoped for the mock and not for the product
**Lane** B · **Severity** medium · **Confidence** 0.9

Verified against the local DB: `select count(*), count(product_id) from project_ffe_items` →
**6 / 0**; `products` → **21 rows, 17 with images**. B's mock index states the zero exactly and
the mock shows the empty case — that is the most honest disclosure in the package and it should
be kept. What is missing is the consequence: on this data, and on any data with the same shape,
B's headline material move renders **zero thumbnails on the shipped surface**. The deck asks the
team to buy imagery without telling them how many production FF&E lines carry a `product_id` —
a number nobody in this program has.

**Settles it:** one query against Strata, quoted in the direction and in the colophon; if the
number is near zero, B's F15 claim is aspirational and must say so.

**Disposition required:** fix (add the prod number) or accept-with-note.

---

### D14 — B's five movements are not the product's six stage groups
**Lane** B · **Severity** medium · **Confidence** 0.85

`shots/w1440-desk.png` shows six stage groups: **BRIEF · 5**, **DISCOVERY · 1**, **DIRECTION ·
3**, **PROPOSAL · 2**, **PROJECT · 4**, **INSTALL · 1**. B declares five stocks — Brief,
Proposal, Project, Install, **Care**. "Care" appears on no capture in this program. Discovery and
Direction get no stock at all; `b-m1-desk-1440.html` paints the Discovery group with
`mv-brief`, i.e. the Brief stock. And the six `--phase-*` tokens B draws the hues from are a
third vocabulary again (consultation / concept / refinement / procurement / installation /
walkthrough, `globals.css:105-110`). B's cost names "a movement-to-stock resolver … a map from
the section the document is in to its stock — data the surface already has," but the map B
publishes does not cover the surface it is drawn on.

**Settles it:** publish the six-stage → stock map against the labels in `w1440-desk.png`.

**Disposition required:** fix.

---

### D15 — B's chip fills pass `contrast.test.ts` by 0.01
**Lane** B · **Severity** low · **Confidence** 0.85

I ran all four `-ink` tokens against all eleven grounds B introduces (five stocks, five fills, the
rail). **Zero failures** — B's claim is correct and I confirmed the tightest pair exactly:
terracotta-ink on the damaged fill = **4.515** and sage-ink on the same fill = **4.512**, both of
which the test rounds to `4.51` at `toFixed(2)` and compares against `4.5`. That is a margin of
0.01 at the rounding boundary. Any retune of `--color-error`, `--color-terracotta-ink`,
`--color-sage-ink` or the 18% alpha by a single 8-bit step turns the suite red. B prints "4.51:1"
without saying it is one step from failing.

**Settles it:** either widen the damaged fill (16% instead of 18% buys headroom) or state the
margin in the direction so nobody retunes it casually.

**Disposition required:** accept-with-note, or fix by widening.

---

### D16 — B's visible fills are stamps; the StatusChip half is unverifiable
**Lane** B · **Severity** medium · **Confidence** 0.8

`status-chip.tsx` is nineteen lines and takes `{ label, color }` — a fill variant is an API
change plus a per-call-site decision, not a token. More to the point,
`research/12-measurements.md` §8 records that `StatusChip` has **no reachable render on the local
DB** (0 rows in `plan_sheets`, 0 `proposal_items` with a `product_id`), so nothing in this
program has ever seen one on screen. Everything filled in `preview-b.png` is a `Stamp`, which is
why B's one named canon departure is `KIT.md:266` ("Stamps are always outlined, never filled").
The direction reads as though the chip carries the move; the mock shows the stamp carrying it.

**Settles it:** say which component the fill actually lands on in each site, and note that the
chip variant is unrendered today.

**Disposition required:** fix (rewrite the recipe around `Stamp`) or accept-with-note.

---

### D17 — B's "honest empty case" reads as a broken image
**Lane** B · **Severity** low · **Confidence** 0.9

F15's fix asked for "a neutral material swatch rather than nothing, so the column exists at a
fixed width." `direction-b.css:147` fills the unlinked slot with `--b-stock-proposal` `#F9F5EF`,
which is **1.042:1** from the sheet — in `preview-b.png` M2 the Hartland rug's slot is a blank
white square with a hairline. Next to two photographic crops it reads as a failed image load, not
as a stock swatch. The honest case is the one the team will see most often (D13).

**Settles it:** give the empty slot a real material value (the rail stock `#F0EADC` at 1.151:1,
or a hatched fill) and re-shoot.

**Disposition required:** fix.

---

### D18 — C darkens `/library`, `/people` and every ledger, and prices none of them
**Lane** C · **Severity** blocker · **Confidence** 0.9

C sets `--bg-primary: #37322D`. As in D01, `--bg-primary` is the ground `.document-route-shell`
paints on **every** `(document)` route (`12-measurements.md` §1). C's file list is
`globals.css` · `doc-spine` · `margin-rail` · `studio-drawer` · `desk-contents` ·
`desk-roster` · the desk route shell · `mobile-bar` · "every component that prints an ink inside
the three chrome regions." The Library, the People room and the ledger sheets are not chrome
regions and are not on the list — so as specified C turns three rooms charcoal and leaves their
type in the paper register. `12-measurements.md` §3 counts **78** pearl border-sides and 20 white
backgrounds on `/people` alone, all of them tuned for a cream ground. This is not a tail risk; it
is the default outcome of the token C names first.

**Settles it:** scope the ground to the desk route, or add `/library`, `/people` and a ledger to
both the mocks and the cost. Until then C cannot be ruled on.

**Disposition required:** fix.

---

### D19 — C breaks `contrast.test.ts`, and not in the way C says
**Lane** C · **Severity** high · **Confidence** 0.9

C's canon check: "The test's charcoal ground list gains `#37322D` and `#201D1B`." Two mechanisms
say otherwise.

1. `contrast.test.ts:47-53` (`parseTokens`) runs `/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g`
   over the **whole file**, `Map.set`, last declaration wins. `inkTokens` is then *every* token
   whose name ends in `-ink`, and `it.each(inkTokens)` asserts ≥4.5:1 on every **light** ground.
   `mock/direction-c.css:50-55` names the dark register `--c-night-quiet-ink` `#F4F0E8`,
   `--c-clay-quiet-ink` `#C4A57B`, `--c-muted-quiet-ink` `#B9AC9B` and so on. Ported to
   `globals.css` under those names, the suite measures `#F4F0E8` on `#FCFAF6` (≈1.1:1) and
   `#C4A57B` on `#FCFAF6` (2.18:1) and fails hard. The `quiet`-in-the-name convention is a
   `research/contrast-check.mjs` convention; the shipped test knows nothing about it.
2. The alternative C recommends — "a `.doc-on-dark` scope that repoints `--text-*` for its
   subtree (the mechanism `.doc-room-lifted` already uses at `globals.css:748-753`)" — is worse:
   a `.doc-on-dark { --color-clay-ink: #C4A57B; }` block in `globals.css` **overwrites the parsed
   value of the real token** (last-wins), so the suite would then measure clay-ink as `#C4A57B`
   on paper and fail. Note `.doc-room-lifted` escapes this only because its override is
   `var(--color-charcoal)`, not a hex.

**Settles it:** name the exact token strategy for the dark register and run
`pnpm --filter designer-portal test -- contrast` against a globals.css that contains it.

**Disposition required:** fix.

---

### D20 — C widens the base-pigment guard by six files and calls it a ground list
**Lane** C · **Severity** high · **Confidence** 0.85

The second half of the same suite — `contrast.test.ts:236`, "finds no base pigment spent as text
anywhere under `src/`" — exempts exactly five files (`DARK_GROUND_SITES`, :221-227). C spends
`--color-clay`, `--color-terracotta`, `--color-sage` and dusty blue as text in `doc-spine.tsx`,
`margin-rail.tsx`, `studio-drawer.tsx`, `desk-roster.tsx`, `desk-contents.tsx` and the running
index. Every one of those must join the exemption list, taking it from five files to eleven —
which is the guard being **widened**, not extended, and it is exactly the "well-meant sweep …
land[ing] quiet" the test's own comment was written to prevent. (Sideways: `TEXT_FORMS` only
matches `clay|terracotta`, so C's sage and dusty-blue on dark are unguarded in either direction —
worth saying out loud rather than benefiting from silently.)

**Settles it:** list the six files in C's cost and say whether the exemption list is still a
guard at eleven entries.

**Disposition required:** fix.

---

### D21 — C's mock does not show C's signature
**Lane** C · **Severity** high · **Confidence** 0.9

C's desk recipe: "The roster and the studio index sit on **one sheet inset from the desk edges**,
`#FCFAF6`, with a 2px clay rule down its left edge: the paper edge, C's signature."
`mock/direction-a.css:137` sets `.patina-mock .sheet-on-desk { padding: 0 200px 36px; }` —
**padding**, not margin — and `direction-c.css:77` paints that same element. So in
`mock/preview-c.png` the sheet runs edge to edge and the 2px clay rule sits at x=0, off the
optical page. What M1 shows is a charcoal band at the top, a full-bleed white page, and a
charcoal band at the bottom: a dark header and footer around a content area. The signature the
whole direction is named for is not in the figure the team will rule on. The same is true of M5
at 390.

**Settles it:** change `padding` to `margin` on `.sheet-on-desk` for lane C (or add a lane-C
inset) and re-shoot `preview-c.png`.

**Disposition required:** fix.

---

### D22 — C leaves the surface where the complaint lives untouched
**Lane** C · **Severity** high · **Confidence** 0.85

The reported problem is "too flat and everything blends together," and 76.4% of the rich
document's sized text is 8–12px (`12-measurements.md` §4). C's answer is that the sheet "was
never the problem." Measured against C's own artifacts: `grep -c "font-size" direction-c.css` =
**0**, and C declares no rule weights. So inside the sheet — the roster lines, the stage heads,
the studio index, the letterhead, the FF&E rows, the region heads — C's mock is pixel-identical to
today. F01, F09, F10, F11, F12, F13, F14, F18 and F21 all survive at today's values in C's own
preview. C's findings table attributes F11/F12/F13/F14/F18/F21 to "the shared planks," but the
planks are not in C's stylesheet either (D29), so nothing in the figure closes them. C answers the
chrome and leaves the page.

**Settles it:** either C adopts the planks visibly in `direction-c.css` and re-shoots, or C's
findings table stops claiming them.

**Disposition required:** fix.

---

### D23 — C overstates the "one surface with value contrast" claim
**Lane** C · **Severity** medium · **Confidence** 0.85

C's thesis opens: "The product has exactly one surface with real value contrast and it only
exists below 1180px: the MobileBar." `proposal-preview.tsx:44` paints
`bg-[var(--color-charcoal)]` with **no width gate**, and `contrast.test.ts:221-227` names five
charcoal-ground sites (`mobile-bar`, `mobile-sheets`, `log-strip`, `client-mirror`,
`proposal-preview`). C's own precedent argument is stronger than the sentence it opens with, so
this is a self-inflicted overstatement.

**Settles it:** rewrite as "the only charcoal a designer meets in the working shell above 1180 is
the log strip's sub-1180 branch and the client-preview banners."

**Disposition required:** fix.

---

### D24 — C's derived luminance caps are slightly wrong
**Lane** C · **Severity** low · **Confidence** 1.0

C: "4.5:1 on paper caps a text's relative luminance at 0.1745 and 4.5:1 on charcoal floors it at
0.283." Recomputed from `L(#FCFAF6) = 0.9572` and `L(#2C2926) = 0.0226`: the cap is
**0.1738** and the floor is **0.2768**. The conclusion (the two registers cannot meet) is right
and is the best-argued paragraph in the deck; the two constants are not.

**Settles it:** `(L(paper)+0.05)/4.5 - 0.05` and `4.5*(L(charcoal)+0.05) - 0.05`.

**Disposition required:** fix.

---

### D25 — SP-01 is sized M over seven files; the real surface is 1,745 literals across 252
**Lane** planks · **Severity** high · **Confidence** 0.9

SP-01 ("A 14px body floor and an 11px mono floor") is **Size M** = "tokens plus a class sweep in
**named files**," and names seven components plus "the ledger sheets." Counted in
`src/components/document`: **1,745** `text-[<n>px]` literals across **252** files in **25**
distinct sizes. SP-03's pearl sweep is **502** literals across **172** files. Neither file count
appears anywhere in `shared-planks.md`, and the plank the whole deck calls the floor ("No
direction can be judged on its hierarchy while three quarters of the page is below the reading
floor") is the largest single piece of work in the package and the least specified.

**Settles it:** put both file counts in the planks and re-size SP-01 as its own lane of work,
not a plank rider.

**Disposition required:** fix.

---

### D26 — SP-01's mono denominator does not reproduce
**Lane** planks · **Severity** medium · **Confidence** 0.85

SP-01: "649 of 863 mono usages are at or below 10px and 296 of them are at exactly 9px." Both
numerators reproduce **exactly** — 649 and 296 — which is good evidence the method was real. The
denominator does not: `grep -ro "font-mono" src/components/document` = **1,038**, and matching
`font-mono` with a following size literal gives **1,029**. So the true share is **63%**, not 75%.
The plank's rhetorical move ("a floor of 12px would be a rewrite, a floor of 11px is a sweep")
leans on that share.

**Settles it:** state the denominator's grep alongside the numerators.

**Disposition required:** fix.

---

### D27 — SP-07 and SP-08 are sized S but both edit component literals
**Lane** planks · **Severity** medium · **Confidence** 0.85

The planks' own key: **S** = tokens only. SP-07 and SP-08 are both S and both require Tailwind
arbitrary-value edits inside components: `doc-spine.tsx:44` `bg-[rgba(229,226,221,0.28)]`,
`margin-rail.tsx:258` `bg-[rgba(250,247,242,0.98)]` plus
`min-[1440px]:bg-[rgba(250,247,242,0.55)]`, `studio-drawer.tsx:289` `bg-[var(--bg-surface)]`.
None of those is a token change. Related: SP-08 (and A, B and C's rail rows) quote only the
**0.55** value; between 1180 and 1439 the margin rail is **0.98** — a different composite that
none of the three directions' numbers cover.

**Settles it:** re-size both to M and add the 1180–1439 rail value to the tables.

**Disposition required:** fix.

---

### D28 — SP-05 changes a component API and breaks a KIT rule, and only B says so
**Lane** planks · **Severity** medium · **Confidence** 0.85

`status-chip.tsx:7` is `StatusChip({ label, color })` — SP-05's fill variant is a prop, a variant
resolution rule, and a decision at every call site about which rows are "the reason the row is on
the page." SP-05 also fills `Stamp`, which contradicts `KIT.md:266` ("**Stamps are always
outlined, never filled** … A filled/solid stamp is not this system"). `direction-b.md` names that
departure explicitly and well. `shared-planks.md` does not — and A and C adopt the plank too, so
two directions inherit a KIT break their canon checks do not mention.

**Settles it:** move the KIT.md:266 departure into SP-05 itself.

**Disposition required:** fix.

---

### D29 — the three lanes are not compared on equal terms
**Lane** all · **Severity** high · **Confidence** 0.9

All three directions adopt the planks identically. Only one lane's stylesheet implements them.
`grep -c "font-size" direction-c.css` = **0**; `direction-b.css` has **2**, both on its tab. The
type scale, the mono floor and the three rule weights live in `.lane-a` (`direction-a.css:262-296`).
Consequence: `preview-a.png` shows **planks + A**, while `preview-b.png` and `preview-c.png` show
**B and C with today's type and today's single hairline**. Every hierarchy comparison the deck
plans to make — the M4 "one column, four ways" strip, the three 1440 desks, the compare table,
and my own "hierarchy & scan" row below — is structurally biased toward A. It also inflates A:
much of what reads as A's signature (the section head over a rule, the five steps) is shared plank
work A's findings table claims for itself (D39).

**Settles it:** hoist SP-01/SP-02/SP-03 into a `.planks` block that all four lanes carry, keep
`today-m4` as the only unplanked fragment, and re-shoot all three previews.

**Disposition required:** fix. This is the one defect that changes what the team will conclude.

---

### D30 — the mocks show neither today's stage groups nor today's order
**Lane** all · **Severity** high · **Confidence** 0.85

`shots/w1440-desk.png`, in order: **BRIEF · 5 · DISCOVERY · 1 · DIRECTION · 3 · PROPOSAL · 2 ·
PROJECT · 4 · INSTALL · 1** (16 live, which is the eyebrow's number). All twelve lane fragments
render four groups in this order: **Project · 4 · Proposal · 2 · Install · 1 · Discovery · 1** —
Project promoted to first, Brief (the largest group, 5 jobs) and Direction (3 jobs) absent, under
an eyebrow that still says "16 live." The group *counts* are today's real counts, which is good;
the *order* is not, and all three "What stays identical" paragraphs assert "the same stage groups
in the same order." `direction-a.md`'s mock index discloses the count ("Four stage groups are
shown … where the brief's crop named two") and mentions neither the reordering nor the two
omissions; B's and C's disclose nothing.

**Settles it:** reorder the four groups to Discovery → Proposal → Project → Install and caption
"Brief · 5 and Direction · 3 cropped," or restore all six.

**Disposition required:** fix.

---

### D31 — all three 390 mocks silently repair a layout defect none of them fixes
**Lane** all · **Severity** high · **Confidence** 0.85

`shots/m390-desk.png` is the worst screen in the program: 47 CSS px of horizontal overflow onto a
fourth ground (F24) *and* roster rows in which the "OPEN THE JOB" act lane collides with the need
line on essentially every row — "The Ashfords (no-login household)" wraps into a four-word-wide
column with the act sitting on top of it. All three M5 mocks show a clean, non-overflowing,
non-colliding 390 desk. SP-09 is explicit that "the overflow itself is a layout defect and is out
of this program's scope" — but the mocks do not honour that boundary, so the deck's mobile
section reads as three directions that fixed mobile, and whichever wins will be blamed when it
does not.

**Settles it:** either draw the collision into the M5 fragments (three lanes, same broken
geometry, only the colour differing) or put a hard caption on the mobile section naming F24 and
the row collision as unaddressed by all three.

**Disposition required:** fix.

---

### D32 — the M2 mocks change which act is primary
**Lane** all · **Severity** medium · **Confidence** 0.8

`shots/w1440-doc-project-rich.png`: on the Pieces head the filled charcoal act is **"SPEC THE 3
UNSPECIFIED →"**, with "ADD A LINE" and "BILL 3 UNINVOICED LINES" as plain links; the Schedule
head carries **no filled act at all** (only "FOLD ↑"). All three M2 fragments show "Bill 3
uninvoiced lines" as the filled act and add a filled **"Open the schedule"** to the Schedule
head. The filled charcoal button is a real product device — that part is faithful — but promoting
a different act to primary is a change to what the surface emphasises, on a deck whose premise is
"same routes, same components, same acts."

**Settles it:** restore "Spec the 3 unspecified" as the filled act and drop the invented
Schedule button, in all three lanes (the markup is shared, so it is one edit).

**Disposition required:** fix.

---

### D33 — only A discloses the Schedule specimen state
**Lane** all · **Severity** low · **Confidence** 0.9

`direction-a.md`'s mock index says: "The Schedule block renders the specimen's phase-4-of-6 state;
today's capture shows the composer instead, because the local project has no phases." That is
correct and confirmed by the shot (the live doc shows "COMPOSE A SCHEDULE · THREE STARTING
POINTS"). B's and C's mock indexes carry the same figure with no caveat.

**Settles it:** copy A's sentence into both.

**Disposition required:** fix.

---

### D34 — there is only one "today" fragment
**Lane** all · **Severity** medium · **Confidence** 0.8

`fragments/` contains exactly one today fragment: `today-m4-strip-360.html`. Sections 06/07/08
will show A's, B's and C's M1 (1440 desk) and M2 (1440 document) with **no today counterpart at
either size**, so the deck's largest and most persuasive figures have no control and the reader
compares against memory. This matches the plan's fragment list, so it is the brief's shape rather
than the author's slip — but combined with D29 and D31 it means the only place the deck draws a
fair before/after is one 360px column.

**Settles it:** add `today-m1-desk-1440` (the markup is already shared; it is a lane class and a
caption) or point section 03's evidence shots directly at the same crop.

**Disposition required:** accept-with-note, or fix cheaply by adding one fragment.

---

### D35 — `direction-a.css` is the shared base for all four lanes
**Lane** all · **Severity** low · **Confidence** 0.9

`direction-a.css` carries **117** `.patina-mock`-scoped rules against **47** `.lane-a` rules,
including `.thumb { display: none }` (:132), `.movement-tab { display: none }` (:145) and the
desk/document layout padding B, C and today all depend on. The file's header documents this
clearly and gives a good reason (kit.css is read-only for this program). It still means B and C
render wrong without A's stylesheet, and it is why D21 exists — C's inset is governed by a
padding rule in A's file. Fine for a mock kit; worth a line in `KIT.md` so nobody assumes a lane
file is self-contained.

**Settles it:** move BLOCK 1 to a `mock/shared-shapes.css` and inject it separately.

**Disposition required:** accept-with-note.

---

### D36 — the amendment's stated cost is false, and it is the amendment's only cost
**Lane** amendment · **Severity** high · **Confidence** 0.95

`amendment-elevation.md`, "What it would cost": "Selectors 3 and 4 (`Literal[value=/box-shadow|
drop-shadow\(/]` and its template twin, `eslint.config.mjs:82-105`) match the *string*, so a token
named `--elevation-sheet` declared once in `globals.css` and referenced as `box-shadow:
var(--elevation-sheet)` still trips them. The rule would need an allowance for one identifier,
which is the moment the ban stops being mechanical and starts being a convention. **That is the
real cost — not the pixels.**"

That is wrong. The five D4 selectors are ESLint rules in a config block whose `files` are
`src/app/(document)/**/*.{ts,tsx}`, `src/components/document/**/*.{ts,tsx}`,
`src/lib/document/**/*.{ts,tsx}` and five hooks (`eslint.config.mjs:72-80`), inside a flat config
whose only language block is `files: ['**/*.{ts,tsx}']` (:30). **ESLint never reads
`globals.css`,** and there is no stylelint in this app, this workspace or the repo root. The
codebase says so itself, in the comment above the surviving exception
(`globals.css:210-215`): *"Defined here in CSS — never as a TSX shadow literal — so the D4
shadow-ban lint stays enforced everywhere else."* R72's shadow ships today and trips nothing.

So the amendment as written costs **zero** lint change. It costs a lint change only if the
elevation is spent from a `.tsx` — a `shadow-[var(--elevation-sheet)]` class (selector 1) or a
`style={{ boxShadow }}` (selector 5). That reframes the whole question: the real cost is the
precedent paragraph, which the amendment already argues well, and the fact that the mechanical
ban is already weaker than D4's text claims. The team should be told that, not the opposite.

**Settles it:** `pnpm --filter designer-portal lint` with a `box-shadow: var(--elevation-sheet)`
line added to `globals.css` — it will pass.

**Disposition required:** fix. This paragraph is the amendment's load-bearing argument.

---

### D37 — the amendment's `.folio-face` status is right; its lint line-cite is not
**Lane** amendment · **Severity** low · **Confidence** 0.9

Credit where due: the amendment states the exception's real status correctly and prominently —
"`.folio-face` is currently dead CSS. `grep -rl "folio-face" apps/designer-portal/src
--include="*.tsx"` returns zero files." I reproduced it: zero `.tsx` references, three CSS
references at `globals.css:217/223/227` inside the `@media (prefers-reduced-motion: no-preference)`
block at :216-229. That is exactly the fact a ruling needs. The line citation for the selectors
is off: the amendment says `eslint.config.mjs:82-105`, and selectors 3 and 4 are at **:96** and
**:100** (the five are at :86, :91, :96, :100, :104).

**Settles it:** cite `eslint.config.mjs:86-105`.

**Disposition required:** fix.

---

### D38 — no lane wants the amendment, and its own evidence argues against it
**Lane** amendment · **Severity** low · **Confidence** 0.9

All three directions' Refuses end with "does not ask for the elevation amendment," and C argues
against it explicitly and correctly (12:1 of value lifts a sheet without one). The amendment's
own honest counter-argument says the same: all three lanes close F06, F07 and F08 with grounds
alone. Combined with D36 — the cost is not what the amendment says it is — the question as posed
has no advocate. That is a legitimate outcome for a question, but the deck should pose it as
"close R72's dead exception" first and "admit a token" second, which is the order the evidence
supports.

**Settles it:** reverse the order of the two halves of the "We ask" sentence.

**Disposition required:** accept-with-note.

---

### D39 — the findings tables double-count the planks
**Lane** all · **Severity** medium · **Confidence** 0.85

A's findings table claims F11, F12, F13, F14, F21 and F22 for A ("Five Playfair steps … replace
thirty-nine arbitrary sizes"; "Mono floor at 11px") while A's own cost says "The type sweep rides
on SP-01, which is shared," and SP-01 claims the identical six. B's table claims F01 ("Three
competing row grounds resolve to one") which is delivered by SP-05 and SP-06, both shared. C's
table lists nine findings as closed "through the shared planks" while `direction-c.css` implements
none of them (D22, D29). A three-column compare table built from these rows will show A closing
roughly twice as many findings as B or C, most of the difference being work all three share.

**Settles it:** split every findings table into "closed by the planks" and "closed by this
direction," and build section 11's compare table from the second column only.

**Disposition required:** fix.

---

## What checked out

Stated so the author knows what not to touch, and so the numbers below can be quoted with
confidence:

- **A's three stock separations**, exactly: paper→rail **1.177**, rail→desk **1.173**,
  paper→desk **1.381**. And A's red-letter stock is exactly terracotta at 28% over paper
  (`mix(#D4A090, #FCFAF6, .28)` = `#F1E1D9`), at **1.220:1** under the sheet, with terracotta-ink
  at **5.181**, quiet ink at **5.340** and clay-ink at **5.548** on it — all four as printed.
- **A's four darkened inks pass everywhere**: on paper, off-white, white, both existing bands,
  A's rail, A's desk and A's new red-letter stock — 20 pairs, zero failures, lowest 4.577. The
  hue-gap assertion at `contrast.test.ts:161-186` also holds (A's inks 24.30° vs the base
  pigments' 20.40°).
- **Every one of B's tint derivations**, to the byte: `#F6F5F2` `#F9F5EF` `#FBF7ED` `#FAF5F0`
  `#F7F6F1` and all five 18% fills `#F2EBE0` `#F8F0D7` `#EDEEE7` `#F2E3DE` `#E8E9E9`.
- **B's full ink × ground matrix**: four `-ink` tokens against all eleven new grounds, **zero
  failures**, tightest exactly as B states (terracotta-ink and sage-ink on the damaged fill at
  4.51 — see D15 for the margin).
- **All ten of B's tab ratios**, old and new: 2.816/2.329/1.679/2.275/2.147 → 5.046/4.976/5.741/
  5.961/6.618. And the band: charcoal↔paper **13.871**, off-white on band **13.532**, base clay
  **6.208**, base terracotta **6.356**.
- **C's entire dark matrix**, every cell: 11.153/12.722/14.745 · 5.697/6.498/7.532 ·
  5.442/6.208/7.195 · 5.905/6.736/7.807 · 5.572/6.356/7.367 · 5.573/6.357/7.368 (the
  terracotta/dusty-blue coincidence C prints is real, not a copy-paste). Separations
  **13.871 / 12.160 / 1.141 / 1.159 / 1.322 / 16.077** and the mobile bar at **14.460** — all as
  stated. C's second sheet `#F5EFE5` at **1.097** with all four shipped inks clearing 4.5.
- **"Same markup, four stylesheets" is literally true.** Normalising the lane class, all four M1
  fragments, all three M2, all four M4 and all three M5 differ by exactly two lines: the
  `class`/`data-lane` attribute and the `<figcaption>`. This is the strongest structural claim in
  the package and it survives a diff.
- **Zero shadows** in `direction-{a,b,c}.css` and all thirteen fragments (`kit.css`'s two hits are
  both prose in comments saying there are none). No lane trips any of the five selectors: every
  move is a background colour, a border colour, a font-size, a border-width or a
  `repeating-linear-gradient`.
- **SP-01's numerators** (649 mono usages ≤10px, 296 at exactly 9px) and **A's 502** pearl
  usages, all reproduced exactly.
- **`.folio-face` is dead CSS** (0 `.tsx` references) and **B's imagery scope is real**
  (`project_ffe_items` 6/0 linked, `products` 21/17 with images) — both verified live.
- Every `file:line` I spot-checked resolved: `doc-spine.tsx:44`, `margin-rail.tsx:258` and `:563`,
  `studio-drawer.tsx:289`, `red-letter-zone.tsx:87`, `status-chip.tsx:10`, `stamp.tsx:31`,
  `section-eyebrow.tsx:19-23`, `mobile-bar.tsx:216`, `log-strip.tsx:86`,
  `globals.css:738-742`/`748-753`/`860`.

---

## Numbers that disagreed with the author

| Where | Author | Recomputed | From |
|---|---|---|---|
| A · `--text-muted` on paper/rail/desk | 10.47 / 8.89 / 7.58 | **9.216 / 7.829 / 6.672** | `#4E4339` |
| A · `--text-subtle` on paper/rail/desk | 8.33 / 7.08 / 6.03 | **7.731 / 6.568 / 5.598** | `#5A4E43` |
| A · shipped inks on `#E0D6C4` | 4.43 / 4.09 / 4.10 / 4.08 | **4.166 / 3.916 / 3.949 / 3.913** | I151 hexes |
| A · span above the ink floor | 1.27 | **1.20** | `CR(#FCFAF6, #EDE5D8)` |
| A/B/C · rail "from" baseline | 1.053:1 vs the sheet | **1.081** vs paper, 1.053 vs ground | 12-measurements §2 |
| B · movement stocks (unstated) | — (quoted vs sheet only) | **1.001–1.020:1** vs the desk ground | vs `#FAF7F2` |
| C · luminance cap on paper | 0.1745 | **0.1738** | `(0.9572+0.05)/4.5-0.05` |
| C · luminance floor on charcoal | 0.283 | **0.2768** | `4.5*(0.0226+0.05)-0.05` |
| SP-01 · mono denominator | 863 | **1,038** (share 63%, not 75%) | grep, `components/document` |
| Costs · type sweep | 7 named files | **1,745 literals / 252 files** | grep, `components/document` |
| Costs · pearl sweep | 502 usages | 502 ✓, across **172 files** | grep, `components/document` |

---

## Scorecard

Six axes, 1–10, per lane. Never averaged — a lane is a shape, not a total.

| Axis | A · Ink on Paper | B · Honest Materials | C · The Dark Desk |
|---|---|---|---|
| Contrast & separation | **8** | **5** | **9** |
| Hierarchy & scan | **9** | **5** | **3** |
| Still Patina | **9** | **4** | **6** |
| Canon fit | **8** | **6** | **3** |
| Cost & reversibility | **6** | **4** | **3** |
| Different-product risk (10 = low) | **8** | **3** | **2** |

**Contrast & separation** — A: three stocks at 1.177/1.173/1.381 verified exactly, and it is the
only lane that also repairs relationships *inside* the sheet, docked for a hairline that reads at
1.092 on its own deepest stock (D08). B: the rail (1.151), band (13.87) and fills (1.09–1.20) are
real and correct, but the signature tints measure 1.001–1.020 on the ground they are actually
painted on, which is flatter than the defect the deck is arguing (D10). C: 12.16 and 13.87 are the
largest and most correct separations anyone proposes, docked one point only because the
separation stops dead at the sheet's edge.

**Hierarchy & scan** — A: five type steps, three rule weights and three genuinely separated muted
inks, and it is the only lane whose stylesheet actually renders a scale. B: the tabs give the
desk a scan order, but within a group nothing ranks and the document gains one loud band and no
new ranks; B says outright it "does not restate the type scale." C: `direction-c.css` declares
zero `font-size` rules, so inside the sheet — where 76.4% of the type is 8–12px — C's mock is
today (D22).

**Still Patina** — A: type, rule weight and paper stock are the house grammar exactly as
`CLAUDE.md:21-23` names it, and only the tan ground is a matter of taste. B: `preview-b.png` is a
column of saturated badges over invisible fields, opening on a dark app header — understated,
honest, Midwest is the brand and this reads as software (D11). C: the paper is untouched and the
pigments are the shipped ones, which is genuinely respectful, but a charcoal room around a white
page is a screen idiom, not a desk.

**Canon fit** — A: no selector tripped, no card, no tile, no count; the only canon debt is three
grounds and one stale band literal in `contrast.test.ts` (D09). B: no selector tripped either,
but the band-plus-tab reads as a card in its own preview, it breaks `KIT.md:266` by design (named,
to its credit), and the 40px roster chip pushes a line into a block (D11, D12). C: the shadow ban
is untouched and C is its best defender, but `contrast.test.ts` breaks two separate ways (D19)
and the base-pigment guard has to more than double its exemption list (D20).

**Cost & reversibility** — A: every value is a token and reverts in one commit, but the two sweeps
A rides on are 502 and 1,745 literals across 172 and 252 files, and "2–3 days" does not cover
them (D06, D25). B: tokens revert cleanly, but the FF&E query, the roster's scan lookup and the
`StatusChip` API do not, and B's own "medium" is generous (D12, D13, D16). C: repointing
`--bg-primary` takes three unmocked rooms with it (D18), every ink inside the chrome needs a
register, and the failure mode is a silent 1.5:1 line rather than a visible break.

**Different-product risk (10 = low)** — A: nothing changes shape; the tan ground is the only
thing anyone can reject on sight, and A names it as the risk in its own words. B: `preview-b.png`
is the clearest "this became a dashboard" of the three, and the charcoal letterhead band is a
header by any reading. C: `preview-c.png` is dark chrome around a white content area, and at 390
it is a dark header, a white page and a dark bar — which is every app on the phone.

---

## What I would tell the team in one paragraph

The planks are the deck. Nine repairs — a reading floor, three muted inks that are three colours,
three rule weights, an ink for every pigment, a state you can see without reading, a hover that
says something, a drawer with a ground, two rails you can see, and one ground under the page at
every width — are what actually answers "everything blends together," and all three directions
adopt them identically, which means the ruling in front of you is smaller than it looks and the
work in front of you is larger. Take Direction A as the floor: it is the house grammar taken
literally, its three paper stocks are the only separation numbers in the deck I could reproduce
to three decimals, and it is the only lane whose mock shows a hierarchy — but make it tell the
truth about the 1,745 type literals and 502 pearl literals it rides on, and either scope
`--bg-primary` to the desk or draw the Library and the People room before you approve a tan
ground for them. Direction B has the best instinct in the program — a designer judges by eye and
this product shows nothing — and the wrong instrument for it: the tinted movements measure
1.001:1 against the ground they are painted on, so what you would actually ship is a column of
saturated badges, while the parts of B that are real (the rails, the filled states, the deepened
tabs, a 48px crop where a catalogue line exists) are all things A or the planks could carry
without the dashboard. Direction C has the largest correct numbers and the cleanest argument
against ever needing a shadow, and it does not yet render its own thesis — the sheet is padded
rather than inset, so the mock is a dark header over a full-bleed page, and nothing inside that
page changes at all; before ruling on C, ask to see the inset sheet, the Library on charcoal, and
a passing `contrast.test.ts`. On the amendment: the cost it states is not real — `globals.css` is
linted by nothing, R72's shadow ships today and trips no rule — so the honest question is not
"may we admit one token" but "do we delete a dead exception and let D4's text match D4's
enforcement," and all three directions have already answered it by closing every "this is not a
surface" finding with grounds alone.

---

# v2 re-read (2026-08-28)

Second pass, same critic, same method: WCAG 2.2 recomputed from the hex values in
`mock/direction-{a,b,c}.css` and the direction tables (formula ported from
`apps/designer-portal/src/lib/document/__tests__/contrast.test.ts:85-102`), greps run against
`main`, the four `mock/preview-*.png` opened, and the PNGs pixel-scanned where a claim was about
geometry rather than about a number. Everything above this line is the v1 text, unchanged.

**Headline.** The revision is real and mostly honest. Every disputed digit in v1 — A's muted ramp,
A's four shipped inks, A's span, C's two luminance constants, SP-01's denominator, both sweep
counts, the amendment's lint cost — now reproduces exactly, and three structural complaints
(D21's padded sheet, D29's unequal lanes, D30's invented stage order) are fixed in the artifacts,
not only in the prose. Two things the revision did not do: B's retune moved a floor it did not
re-measure, and A's second app-wide token was never scoped the way its ground was.

---

## D01-D39, one line each

**Key:** *resolved* = the "Settles it" was done and I reproduced it · *partly* = the fix landed
but left a checkable residue · *accepted* = the critic offered accept-with-note and the author
took it, completely · *unresolved* / *disputed* = neither.

| D | Verdict | Proof |
|---|---|---|
| D01 | **resolved** | The tan is a `--desk-ground` scoped to the desk route, not `--bg-primary` — `direction-a.md:91-95`, `direction-a.css:369` (`.lane-a .desk, .lane-a .mdesk`), and the unscoped alternative is priced at **+2-3 days and three rooms** (`direction-a.md:247-251`). |
| D02 | **resolved** | `direction-a.md:52-53` now reads 9.22 / 7.83 / 6.67 and 7.73 / 6.57 / 5.60; I get **9.216 / 7.829 / 6.672** and **7.731 / 6.568 / 5.598**. |
| D03 | **resolved** | `direction-a.md:79-81`: **4.166 / 3.916 / 3.949 / 3.913** on `#E0D6C4` — all four exact. |
| D04 | **resolved** | `direction-a.md:82`: `CR(#FCFAF6,#EDE5D8)` = **1.199** (and the four shipped inks on `#EDE5D8` are 4.799 / 4.510 / 4.549 / 4.507, so `#EDE5D8` really is the cap). |
| D05 | **partly** | A's ground-named table (`direction-a.md:68-77`) and SP-08 (`shared-planks.md:170-176`) are exact — but B's findings row still sells the rails as "open to **1.152:1**" (`direction-b.md:188`), a ratio against the desk ground, which B's rails are never adjacent to. See **D41**. |
| D06 | **resolved** | `direction-a.md:228-238` carries both sweeps; I recount **1,749** `text-[<n>px]` literals / **252** files and **502** pearl / **172** files, and the timing is re-cut (A 2-3d, SP-01 4-6d, SP-03 2-3d). |
| D07 | **resolved** | `direction-a.md:148` — "today's measured size, shared by all four lanes — not an A move." |
| D08 | **resolved** | Second hairline `#C9BCA4` = **1.301** on `#E0D6C4` (`direction-a.md:104`, `direction-a.css:346`), and `#D8CDBA`'s **1.092** there is printed rather than hidden. |
| D09 | **partly** | Both entries are named (`direction-a.md:240-245`), but one of the two consequences is false — see **D45** — and `LIGHT_GROUNDS` has a third hardcoded entry A does not mention (`'note band over paper': '#F8F0EA'`, `contrast.test.ts:36`). |
| D10 | **resolved** | Every stock recomputed against `#FAF7F2`: **1.088 / 1.081 / 1.081 / 1.087 / 1.084 / 1.081** — all six digits match `direction-b.md:48-53`, and pairwise between stocks is **1.000-1.007** as stated. |
| D11 | **partly** | The bands bleed to the page edge with no radius (`direction-b.css:109-111`, `margin: 10px -200px 0`) and `preview-b.png` M1 no longer reads as a panel — the card charge is answered. The tab-as-plate charge is stated and declined (`direction-b.md:118-119, 217-219`), and the preview still shows six saturated plates. |
| D12 | **resolved** | The chip is gone from the doc (`direction-b.md:121-124`) *and* from the markup — no chip node in `b-m1-desk-1440.html`. |
| D13 | **accepted** | `direction-b.md:154-162, 254-256, 293`: the local 6/0 and 21/17 stay, the production number is declared unknown, and the team is told to ask before ruling. Legitimate — but the ruling on B's headline move is still blocked on a number nobody has. |
| D14 | **resolved** | Six stage labels, six hues, one published map (`direction-b.md:70-83`); "Care" is gone; `b-m1-desk-1440.html` paints Discovery with `mv-discovery`, not `mv-brief`. |
| D15 | **resolved by widening** | `comp(#C77B6E, #FCFAF6, .16)` = **#F4E6E0** exactly; terracotta-ink **4.629**, sage-ink **4.626** — the 0.13 margin is real. (It is no longer the tightest pair — **D40**.) |
| D16 | **resolved** | Rewritten around `Stamp` (`direction-b.md:145-152`), and SP-05 carries the same sentence (`shared-planks.md:113-116`). |
| D17 | **partly** | The slot takes the rail stock with a 22%-charcoal edge (`direction-b.css:163`) — but on the tinted sheet the rail stock is **1.063:1**, not the 1.151:1 the critic asked for, so the border is doing nearly all of the work. See **D41**. |
| D18 | **resolved** | `direction-c.md:17-27` scopes the inversion to four surfaces; `direction-c.css:78` paints `.lane-c .desk/.mdesk/.doc-shell/.strip`, never `--bg-primary`; the three rooms are priced **+3-4 days** (`direction-c.md:241-245`). New residue: **D46**. |
| D19 | **resolved** | `direction-c.md:196-214` names both mechanisms and commits to a strategy — no `-ink` suffix in the dark register plus a light/dark split in `parseTokens` — priced at **1 day** and called non-optional (`:236-239`). |
| D20 | **accepted, priced** | `direction-c.md:216-225`: six files named, 5 → **11** stated as a guard being *widened*, a scope-check alternative proposed, and `TEXT_FORMS` matching only `clay\|terracotta` said out loud. |
| D21 | **resolved** | `direction-c.css:81-88` uses **margin**, 120px at 1440 and 14px at 390. Pixel-scanned `preview-c.png`: at 1440 desk `#37322D` to x=121, clay rule `#C4A57B` at x=122-123, sheet `#FCFAF6` 124→1320; at 390 desk to x=15, clay rule x=16-17, sheet 18→376. |
| D22 | **resolved** | C inherits BLOCK 2; `preview-c.png` M2/M4 show the mono floor, the muted ramp and the three weights, and `direction-c.md:38-39, 112-114` says plainly that on the sheet C is the planks and nothing more. New residue: **D42**. |
| D23 | **resolved** | `direction-c.md:5-9` is rewritten around the five sites `contrast.test.ts:221-227` names. |
| D24 | **resolved** | **0.173823** and **0.276758** from `L(#FCFAF6)=0.957205` and `L(#2C2926)=0.022613` — matching `direction-c.md:55-56`. (The stylesheet header was not updated — **D47**.) |
| D25 | **resolved** | `shared-planks.md:13-17, 40-47`: **Size L**, 1,749 / 252, "a lane of its own, not a rider", 4-6 days, sequenced before any direction. |
| D26 | **resolved — and the plank is right where I was not** | `grep -ro "font-mono" src/components/document \| wc -l` = **1,029** exactly (my v1 figure of 1,038 was the loose grep); 649 at ≤10px and 296 at exactly 9px both reproduce; share **63.1%**. |
| D27 | **resolved** | SP-07 and SP-08 are both **M** with the component literals named (`shared-planks.md:160-163, 182-184`), and the 1180-1439 `0.98` tier is in the plank and in A's table (`direction-a.md:76`). |
| D28 | **resolved** | `shared-planks.md:118-123` carries both the `StatusChip({label, color})` API cost and the `KIT.md:266` departure. |
| D29 | **resolved** | BLOCK 2 of `direction-a.css:204-313` is scoped `.lane-a, .lane-b, .lane-c`; both builds inject `direction-a.css` first (`build-preview.sh:51-53`; `deck-parts/build.mjs:176-178`); `grep -c lane-today` = **0** in all three stylesheets. Confirmed in the previews. |
| D30 | **resolved** | All four M1 fragments render **Discovery · 1 → Proposal · 2 → Project · 4 → Install · 1** — the desk's own relative order — and every M1 figcaption names `BRIEF · 5` and `DIRECTION · 3` as cropped. |
| D31 | **resolved** | All three M5 figcaptions read "drawn with F24 (the 390 overflow) assumed repaired: a defect, not a direction. No lane fixes it."; `shared-planks.md:199-204` says the same for the row collision. |
| D32 | **resolved** | `class="rh-act is-inked"` sits on **Spec the 3 unspecified →** in all three M2 fragments; the Schedule head carries only `Fold ↑`. |
| D33 | **resolved** | The phase-4-of-6 caveat is in all three M2 figcaptions and all three mock indexes. |
| D34 | **resolved** | `today-m1-desk-1440.html` exists; normalised for the lane class it differs from `a/b/c-m1` by one line (`data-screen`). No today M2, reasoned at `direction-a.md:318`. |
| D35 | **accepted** | `direction-a.css:4-33` labels the three blocks and states outright that `direction-b.css` and `direction-c.css` are not self-contained. |
| D36 | **resolved** | `amendment-elevation.md:41-72`. Verified: the D4 block's `files` are all `.{ts,tsx}` (`eslint.config.mjs:73-80`); the only language block is `files: ['**/*.{ts,tsx}']` (:30); `grep -rl stylelint --include=package.json` over the repo returns nothing; and `globals.css:218/225` is the **only** shadow in any app stylesheet (plus one `box-shadow: none !important` at :1307) and trips nothing. |
| D37 | **resolved** | Selectors are at **:86, :91, :96, :100, :104** — exact; `.folio-face` at `globals.css:217/223/227` inside the `:216-229` media block — exact; 0 `.tsx` references. |
| D38 | **resolved** | `amendment-elevation.md:90-100` puts closing R72's dead exception first and gives the reason. |
| D39 | **resolved** | All three findings tables are split; C's own column is four rows, not nine. |

**Counts: 35 resolved (three of them by the accept route the critique itself offered — D13, D20,
D35), 4 partly (D05, D09, D11, D17), 0 unresolved, 0 disputed.**

---

## Recomputed v2 numbers

Sixteen checks, all from the hex values in the stylesheets and tables. Everything not flagged
below reproduces to three decimals.

**1 — B's six stocks vs the ground they are painted on (`#FAF7F2`) and vs the sheet (`#FCFAF6`).**

| stock | hex | vs `#FAF7F2` | B says | vs `#FCFAF6` | B says |
|---|---|---|---|---|---|
| Brief | `#EDEEED` | **1.088** | 1.088 | 1.116 | 1.116 |
| Discovery | `#EFEFE8` | **1.081** | 1.081 | 1.108 | 1.108 |
| Direction | `#F2EEE8` | **1.081** | 1.081 | 1.109 | 1.109 |
| Proposal | `#F4EDE4` | **1.087** | 1.087 | 1.114 | 1.114 |
| Project | `#F8EED0` | **1.084** | 1.084 | 1.111 | 1.111 |
| Install | `#F6EDE7` | **1.081** | 1.081 | 1.108 | 1.108 |

All six clear the 1.08 bar. Pairwise between stocks: **1.000-1.007**, exactly as B states. The
orchestrator's other half — every ink ≥4.5:1 — also holds: 9 inks × 14 B grounds = 126 pairs,
**zero failures**, lowest **4.578** (see 6).

**2 — A's muted / subtle ratios on its three stocks.** `#4E4339` = **9.216 / 7.829 / 6.672**;
`#5A4E43` = **7.731 / 6.568 / 5.598**; `#65594E` = 6.514 / 5.534 / 4.717. A prints 9.22 / 7.83 /
6.67 and 7.73 / 6.57 / 5.60 and 6.51 / 5.53 / 4.72. Agreed.

**3 — C's luminance bounds.** `L(#FCFAF6)` = **0.957205**, `L(#2C2926)` = **0.022613**; cap
`(L+0.05)/4.5-0.05` = **0.173823**, floor `4.5(L+0.05)-0.05` = **0.276758**. Agreed with
`direction-c.md:55-56`. (For the record the floor against C's *desk* `#37322D` is **0.32273**,
which is where the register actually has to live on the desk route.)

**4 — SP-01's denominator.** `grep -ro "font-mono" src/components/document | wc -l` = **1,029**.
Numerators: **649** at ≤10px and **296** at exactly 9px. Share **63.1%**. The plank is right.
(The v1 draft's 863 was not invented either — 864 `font-mono` usages carry a size within 120
chars, and 649/864 = 75.1%. Both denominators are defensible; the plank's footnote saying "63%
either way" is true of 1,029 and 1,038, not of 864. Trivial.)

**5 — the sweep counts.** `text-[<n>px]` = **1,749** literals / **252** files (v2's number; my v1
figure of 1,745 was the one that was wrong). `border-[var(--color-pearl)]` = **502** / **172**.
`font-mono` files = 276. All as printed.

**6 — the lowest plank ink on B's rail.** *Disagreement.* On `#ECE7DF`: sage-ink `#5F6B57` =
**4.578**, terracotta-ink `#9C5340` = **4.581**, golden-ink **4.620**, clay-ink **4.874**,
`--text-faint` **5.518**. `direction-b.md:67` prints "lowest B pair: `--text-faint` on the rail,
**5.52:1**" — the number is right for that token and wrong as a floor by **0.94**. See **D40**.

**7 — the lowest plank ink on C's state tint.** `--plank-state-tint: #F4E6E0`: sage-ink
**4.626**, terracotta-ink **4.629**, clay-ink 4.925, golden 4.668, faint 5.576. The stamp that
wears it takes terracotta-ink, so C clears at 4.63. No claim to disagree with; stated because
nothing in the package prints it.

**8 — B's rail against the sheets it actually flanks.** *Disagreement in framing.* `#ECE7DF` vs
Brief **1.058**, Proposal **1.060**, Project **1.063**, Direction **1.065**, Discovery **1.066**,
Install **1.066**. Today's spine wash vs the paper is **1.081** (12-measurements §2). See
**D41**.

**9 — B's charcoal band.** 13.871 vs `#FCFAF6` as stated — but **12.485** vs the Project stock
the M2 sheet takes (12.43-12.52 across the six). See **D49**.

**10 — B's tabs.** White on tab: **5.046 / 6.618 / 6.973 / 4.976 / 5.741 / 5.961** — all six as
printed (5.05 / 6.62 / 6.97 / 4.98 / 5.74 / 5.96).

**11 — A's four darkened inks.** `#6F5429` 6.769 / 5.750 / 4.901 · `#8E4A38` 6.321 / 5.370 /
**4.577** · `#6C5A1B` 6.465 / 5.492 / 4.681 · `#55604E` 6.356 / 5.399 / 4.602. Across the five
shipped `LIGHT_GROUNDS` plus A's three stocks: **32 pairs, zero failures, lowest 4.577**. A's
"20 pairs, lowest 4.577" is the same floor on a smaller matrix.

**12 — A's stocks and hairlines.** 1.177 / 1.173 / 1.381 · `#D8CDBA` 1.508 / 1.281 / 1.092 ·
`#C9BCA4` 1.301 on `#E0D6C4` · today's pearl on off-white 1.209 · red-letter `#F1E1D9` =
`mix(#D4A090, #FCFAF6, .28)` exactly, 1.220 under the sheet, terracotta-ink 5.181 / quiet 5.340 /
clay 5.548. Every digit as printed.

**13 — C's two registers.** Light: 13.871 / 8.058 / 9.216 / 7.731 / 6.514 / 5.754 / 5.408 /
5.454 / 5.405 on `#FCFAF6`, and the second sheet `#F5EFE5` at **1.097** under it. Dark: 11.153 /
12.722 / 14.745 · 5.697 / 6.498 / 7.532 · 5.442 / 6.208 / 7.195 · 5.905 / 6.736 / 7.807 ·
5.572 / 6.356 / 7.367 · 5.573 / 6.357 / 7.368. Separations 13.871 / 12.160 / 1.141 / 1.159 /
1.322 / 16.077, mobile bar 14.460. Every cell as printed.

**14 — SP-06's hover token.** `--plank-hover-tint: #F3ECE2` = clay @16% over the sheet, exactly.
On the sheet **1.125**; on today's ground **1.097**; on A's rail **1.046**; on A's desk **1.228**
(and *lighter* than the ground); on B's Project stock **1.013**; on B's rail **1.050**. SP-06
promises ≥**1.10** on every stock the ruled direction declares. See **D43**.

**15 — the planks' rule tokens on C's chrome.** `--rule-mid` (`#2C2926`) on desk / rail / well =
**1.141 / 1.000 / 1.159**. `--rule-hair` (charcoal @10%) = **1.015 / 1.000 / 1.011**. See
**D42**.

**16 — B's stock derivations.** Every declared hex is its hue composited over `#FCFAF6`, not over
the `#FAF7F2` the paragraph above the table names as the tuning ground — e.g. concept `#C4A57B`
@15% over the desk ground is `#F2EBE0`, not the declared `#F4EDE4`. The declared hexes are the
ones measured, so nothing downstream is wrong. See **D48**.

**Numbers that disagreed with the author, in one table:**

| Where | Author | Recomputed | From |
|---|---|---|---|
| B · "lowest B pair" on the rail | `--text-faint`, 5.52 | **sage-ink 4.578** / terracotta-ink 4.581 | `#5F6B57`, `#9C5340` on `#ECE7DF` |
| B · "the tightest are … the damaged fill at 4.63" | damaged fill | the **rail** at 4.578 | same |
| B · findings row: "the rails open to 1.152:1" | 1.152 vs the desk ground | **1.058-1.066** vs the six sheets the rails flank | `#ECE7DF` vs the stocks |
| B · band separation | 13.87 | **12.485** on the sheet B actually paints | `#2C2926` vs `#F8EED0` |
| B · stock derivation ground | "@ alpha", over the desk ground per the prose | composited over **`#FCFAF6`** | e.g. `#C4A57B`@15% |
| SP-06 · hover floor | "≥1.10:1 on every stock" | **1.013-1.097** on four of the six declared stocks | `#F3ECE2` |
| A · `white: '#FFFFFF'` "a ground nothing paints" | nothing paints it | **108** `bg-white` literals in `components/document` | grep |
| C · stylesheet header caps | 0.1745 / 0.283 | **0.1738 / 0.2768** (the *doc* is right; the CSS is stale) | `direction-c.css:16-17` |

---

## Do all three lanes render the planks?

**Yes — confirmed three ways.**

1. **Selector scope.** BLOCK 2 of `direction-a.css:204-313` is written `.lane-a, .lane-b,
   .lane-c` on every rule: the SP-02 ramp (:204-210), the SP-03 tokens (:212-215), the SP-05 and
   SP-06 tints (:217-224), the 11px mono floor (:227-253, 25 selectors × 3 lanes), the 14px body
   floor (:255-267), the three rule weights (:269-297) and the state fill (:299-313). `grep -c
   lane-today` in all three lane stylesheets = **0**, so `today` is the only unplanked lane, as
   D29 asked.
2. **Injection.** The per-lane greps the orchestrator asked for do *not* tell the story on their
   own — `direction-b.css` has **1** `font-size` (its tab) and `direction-c.css` has **0** — but
   both builds inject `direction-a.css` first and unconditionally: `build-preview.sh:51-53` and
   `deck-parts/build.mjs:176-178` (`@@DIR_A@@` → `@@DIR_B@@` → `@@DIR_C@@`, source order decides
   the cascade). `preview.html` contains the PLANKS block once.
3. **The pictures.** In `preview-b.png` and `preview-c.png` the mono labels are at the 11px step,
   the muted ramp is three values, the section heads sit over a 1.5px charcoal rule, `PROJECT ·
   FF&E / Pieces` sits over the double rule, and the `DAMAGED` chip is filled — none of which is
   true in `preview-today.png`, whose M4 shows the same six components outlined, at 8-10px, with
   one hairline weight. The markup is identical (`class="status-chip is-damaged is-filled"` is in
   *today's* fragment too; only the CSS scope withholds the fill).

**"Same markup, four stylesheets" still survives a diff in v2.** Normalising the lane class and
dropping the figcaption, `today/a/b/c-m1` differ by one line (`data-screen`), the three M2 by
**zero**, the four M4 by one, the three M5 by **zero**.

---

## Is C's sheet inset, with the clay rule visible, at 1440 and 390?

**Yes, at both widths — pixel-verified, not eyeballed.** `direction-c.css:81-88` is
`margin: 0 120px 40px` at 1440 and `margin: 0 14px 20px` at 390, both with
`border-left: 2px solid var(--c-edge-rule)` (`#C4A57B`).

Scanning `mock/preview-c.png`:

- **M1 (1440), y=560:** `#37322D` … x=**122**`#C4A57B` … x=**124**`#FCFAF6` … x=**1321** the
  right hairline, x=**1322** `#37322D`. A 2px clay rule, a 1,197px sheet, dark desk on both sides.
- **M5 (390), y=4480/4550/4620:** `#37322D` to x=15, `#C4A57B` at x=**16-17**, `#FCFAF6`
  18→376, right hairline 377, `#37322D` 378→391.

D21 is fully closed. `direction-c.md`'s claim that the sheet edge is in M1, M2 and M5 holds; in
M2 the paper column carries the same clay rule on **both** edges (`direction-c.css:89`).

---

## New defects introduced or exposed by v2

Numbered from D40. Severity and confidence are mine; the orchestrator filters.

### D40 — B's "lowest pair" is now wrong, and it is wrong in the direction v1 was punished for
**Lane** B · **Severity** medium · **Confidence** 1.0

`direction-b.md:67` prints "lowest B pair: `--text-faint` on the rail, **5.52:1**", and
`:226` says "the tightest are terracotta-ink and sage-ink on the damaged fill at **4.63:1**."
Both are false on B's own v2 grounds. B deepened the rail from v1's `#F0EADC` to `#ECE7DF`, and
on `#ECE7DF` **sage-ink `#5F6B57` = 4.578** and **terracotta-ink `#9C5340` = 4.581** — tighter
than the damaged fill's 4.626/4.629, and 0.94 below the figure the table prints for that very
ground. The suite still passes (4.58 → `toFixed(2)` = "4.58" ≥ 4.5), but the margin B just spent
a paragraph protecting (D15: "this paragraph is here so nobody retunes it back") is now on a
different token, on a ground with no paragraph. v1 had the floor right at 4.51; the retune moved
it and the table was not re-run.

**Settles it:** print 4.58, name the rail as the binding pair, and move D15's warning paragraph
to it.

### D41 — B's rails read *worse* than today's against every sheet B paints
**Lane** B · **Severity** high · **Confidence** 0.9

In every B document the sheet takes a movement stock (`direction-b.css:99`) and the rails sit
directly against it (`:100`); the `--bg-primary` ground behind `.doc-shell` is fully covered by
the three-column grid. So the rail's only adjacency in the document view is the tinted sheet, and
there it measures:

| sheet | rail `#ECE7DF` vs it |
|---|---|
| Brief `#EDEEED` | **1.058** |
| Proposal `#F4EDE4` | **1.060** |
| Project `#F8EED0` | **1.063** |
| Direction `#F2EEE8` | **1.065** |
| Discovery `#EFEFE8` | **1.066** |
| Install `#F6EDE7` | **1.066** |
| *today's spine wash vs the paper* | *1.081* |

All six are **below today's 1.081:1** — the number `12-measurements.md` §2 records as part of the
defect. B's recipe states the Project figure honestly (`direction-b.md:135-137`) and even says why
it cannot go deeper ("at the next step `--color-sage-ink` falls under 4.5:1 on it" — true, and
D40 shows it is already at 4.578). But `direction-b.md:188` sells the same rail to the team as
"the rails open to **1.152:1**", which is the ratio against a ground the rails never touch in
either view. This is the exact error D10 was about, committed a second time in the opposite
direction, and it is the price of the D10 retune: deepening the stocks by ~8% ate the rail's
headroom and the rail cannot follow. **B is the only lane whose SP-08 goes backwards**, and D17's
empty FF&E swatch inherits the same 1.063.

**Settles it:** put rail↔stock for all six in the token table, then either concede SP-08 is
unclosed in B, leave one movement untinted so the rail has a sheet to work against, or tint the
rail per movement too.

### D42 — C adopts planks that are hardcoded charcoal, and prices only the ink half of the register
**Lane** C / planks · **Severity** medium · **Confidence** 0.9

`direction-a.css:214-215` declares `--rule-hair: 1px solid rgba(44,41,38,.10)` and `--rule-mid:
1.5px solid #2C2926` for `.lane-c` as well, and `:217-224` adds `--plank-state-tint` and
`--plank-hover-tint` as light fills. On C's three chrome grounds the mid rule measures **1.141 /
1.000 / 1.159** and the hairline **1.015 / 1.000 / 1.011** — the two rules SP-03 exists to
separate ranks with are invisible on every surface C inverts, and the rail case is literally
1.000. `direction-c.css:168-171` patches exactly three selectors (`.margin .sect-head`, `.margin
.margin-item`, `.spine .shelf-row`); the two fills get no dark twin at all (`--plank-state-tint`
on the desk ground is a 10.4:1 near-white blob). C's Cost prices the register conversion purely
as an *ink* problem — "one unconverted `text-[var(--text-muted)]` inside the spine is a 1.51:1
line" (`direction-c.md:250-252`; I get 1.505, so the number is right) — and never names SP-03's
rule tokens or SP-05/SP-06's fills. The mock happens not to expose it because C's roster and
studio index sit on the sheet; the product's spine, margin and drawer do not.

**Settles it:** add a `--rule-hair-dark` / `--rule-mid-dark` pair and a dark state fill to the
plank, and put "every plank token, not only every ink, needs a dark twin" in C's 4-5 days.

### D43 — SP-06's own token does not meet SP-06's own floor on any lane's stocks
**Lane** planks / all · **Severity** medium · **Confidence** 0.95

`shared-planks.md:137-139` promises "a fill at or above **1.10:1** on every stock the ruled
direction declares." The single token in the deck is `--plank-hover-tint: #F3ECE2`
(`direction-a.css:224`), whose own comment prints **1.097** over today's ground — already under
the plank's floor in the plank's own package. Measured against the stocks the directions
actually declare: **1.046** on A's spine/margin stock, **1.013** on B's Project stock, **1.050**
on B's rail, **1.125** on the sheet, and on A's desk **1.228 but lighter than the ground**, i.e.
hover inverts direction between A's desk and A's paper. C's own hover (`direction-c.css:153`,
`#F5EFE5`) is **1.097**. The planks' preamble says a direction that needs a plank at its own
value must restate it; none of the three restates SP-06.

**Settles it:** three per-lane hover values (or a per-stock derivation rule), or drop the 1.10
promise and print what each lane actually gets.

### D44 — A scoped its ground and left a second app-wide token unscoped and unpriced
**Lane** A · **Severity** high · **Confidence** 0.9

`direction-a.md:49` moves `--bg-surface` from `#FFFFFF` to `#FCFAF6`, and `direction-a.css:349`
repoints it for the lane. `var(--bg-surface)` resolves **83 times across 51 files**, and the
overwhelming majority are *not* Document surfaces: `components/portal/scope-builder` (9 files),
`components/portal/procurement` (5), `components/ui/controls` (3), `components/portal/proposals`,
`components/portal/ffe`, `components/products/{promotion,nomination}`, `toast-provider.tsx`,
`faceted-filter-popover.tsx`, `bulk-action-bar.tsx`, `mood-board/board-room-shell.tsx`, plus
`app/(document)/library/judgments/page.tsx`. A's Cost prices the desk-ground scoping edit and the
unscoped-ground alternative and nothing else, and `direction-a.md:262` still refuses that A "does
not touch People, Library or the ledger layouts beyond their type floors" — now true of the
ground and false of `--bg-surface`. This is D01's shape on the one token A did not think to
scope, and it reaches further than D01 did, because it leaves the Document tree entirely.

**Settles it:** scope `--bg-surface` the way the ground was scoped (a `--doc-surface` used inside
`components/document`), or add "repaints every white surface in the portal shell" to the cost and
name the 51 files.

### D45 — A's D09 fix trades one imprecision for a factual error
**Lane** A · **Severity** low · **Confidence** 0.95

`direction-a.md:243-244`: "moves `--bg-surface` to `#FCFAF6`, so the second becomes a ground
nothing paints." `bg-white` appears **108 times** in `components/document` — `white: '#FFFFFF'`
in `LIGHT_GROUNDS` remains a ground the surface really paints, and after D44 it is the ratio that
protects those 108 sites. Separately, `LIGHT_GROUNDS` (`contrast.test.ts:31-37`) has five
hardcoded entries, not "the tokens plus two": A names `'red-letter band over paper'` and `white`
and not `'note band over paper': '#F8F0EA'` (unchanged by A, so harmless — but the count in the
sentence is not the file's).

**Settles it:** "the entry stays valid and stays load-bearing — 108 `bg-white` literals still
paint it."

### D46 — C's scope fix puts a charcoal well under three cream rooms, and no figure shows it
**Lane** C · **Severity** low-medium · **Confidence** 0.85

`direction-c.md:17-20`: `/library`, `/people` and the ledgers "keep paper and receive only the
dark drawer along the bottom edge." Today that drawer is `bg-[var(--bg-surface)]` = `#FFFFFF`
(`studio-drawer.tsx:289`); C makes it `#201D1B`, **16.077:1** from paper. So the fix that closed
D18 creates a new combination — a charcoal well under a cream room — on exactly the two rooms
D18 was about, and there is no mock of it anywhere in the deck. It is much cheaper than v1's
problem and it is the right trade; it is still an unmocked visual change to three routes, sitting
under a heading that reads as though those routes are untouched.

**Settles it:** one `/library` crop with the well, or a sentence saying the drawer stays light
off the desk route (which costs C its "the drawer is the one piece of chrome that crosses every
route" argument).

### D47 — `direction-c.css`'s header still prints the two constants D24 corrected
**Lane** C · **Severity** trivial · **Confidence** 1.0

`direction-c.css:16-17`: "a ratio of 4.5 on paper caps a text's relative luminance at **0.1745**;
4.5 on charcoal floors it at **0.283**." The direction now says 0.1738 / 0.2768 and is right. The
stylesheet is the artifact a reviewer greps.

**Settles it:** one edit.

### D48 — B's stock map is a recipe that cannot be reproduced over the ground it names
**Lane** B · **Severity** trivial · **Confidence** 1.0

`direction-b.md:70-83` publishes "stage group → `--phase-*` hue → alpha → stock" directly under a
paragraph saying the stocks are "tuned against **the ground each is painted on**". Every declared
hex is that hue composited over the **sheet** `#FCFAF6`: concept `#C4A57B` @15% over `#FAF7F2` is
`#F2EBE0`, not the declared `#F4EDE4`; procurement @22% over the ground is `#F6ECCC`, not
`#F8EED0`. The declared hexes are the ones measured and every ratio in the deck is correct, so
this changes nothing downstream — but a reader who reproduces the recipe gets six different
colours, and `#F2EBE0` is already B's ordered-state fill.

**Settles it:** say "composited over the sheet, measured against the ground", or publish the
over-the-ground hexes.

### D49 — B's band is quoted against a sheet B never paints
**Lane** B · **Severity** low · **Confidence** 0.95

`direction-b.md:60` and `:187` give the charcoal band **13.87:1**, against `#FCFAF6`. B tints
every document, so the band's real separation is **12.485:1** on the Project stock (12.43-12.52
across the six). It is still the highest-contrast object on the page and the F09 argument is
untouched; the number is simply not the one the figure shows. Same family as D41, and both are
the residue of a retune that changed the sheet and not the sheet-relative figures.

**Settles it:** print the on-stock range.

---

## Scorecard, revised

Same six axes, 1-10, per lane, never averaged. v1 → v2 in the header row of each cell.

| Axis | A · Ink on Paper | B · Honest Materials | C · The Dark Desk |
|---|---|---|---|
| Contrast & separation | 8 → **9** | 5 → **6** | 9 → **9** |
| Hierarchy & scan | 9 → **9** | 5 → **6** | 3 → **6** |
| Still Patina | 9 → **9** | 4 → **5** | 6 → **7** |
| Canon fit | 8 → **8** | 6 → **7** | 3 → **6** |
| Cost & reversibility | 6 → **6** | 4 → **5** | 5 → **5** *(was 3)* |
| Different-product risk (10 = low) | 8 → **8** | 3 → **5** | 2 → **4** |

**Contrast & separation.** A **8→9**: nothing about A's separations changed, but every one of them
now reproduces and the one dock v1 applied — a hairline reading 1.092 on A's own deepest stock —
is answered with a second value at 1.301, so the deduction has no basis left. B **5→6**: the
signature moved from 1.001-1.020 to a real 1.081-1.088 against the ground it is painted on, which
is the single biggest correction in the package — and it is held to one point of gain because the
same retune drove the rails to 1.058-1.066 against every sheet they flank, *under* today's 1.081
(D41). C **9→9**: the numbers were always the largest and most correct; what changed is that
`preview-c.png` now shows them, since the sheet is genuinely inset with its clay rule at both
widths — still docked one point because the separation stops at the sheet's edge, and now also
because the planks' own rules go to 1.00-1.16 on C's chrome (D42).

**Hierarchy & scan.** A **9→9**: unchanged and still the only lane that adds ranks above the
shared floors — a five-step Playfair scale, an 18px name against a 14px need line, three rule
weights spent on three ranks. B **5→6**: B now renders the planks, so a B group has the mono
floor, the body floor and three muted inks inside it, and the saturated tabs give the desk a scan
order it did not have; B still declines the type scale and says so. C **3→6**: the largest single
movement on the board — `direction-c.css` inheriting BLOCK 2 means C's own figures finally show
the floors, the ramp and the weights, so the axis is no longer scoring C against a mock that was
pixel-identical to today. It stops at 6 because on the sheet C's own contribution is still
nothing, which C now states plainly rather than claiming nine findings.

**Still Patina.** A **9→9**: type, rule weight and paper stock, unchanged; the tan is still the
only thing a designer can reject on sight, and scoping it makes rejecting it cheap. B **4→5**:
the bleed fixes the badge-column read — `preview-b.png` M1 is now tinted paper under a label
rather than five saturated rectangles over nothing — but M2 is a buff-yellow document under an
opaque charcoal header, and `#F8EED0` at 22% of procurement yellow is the loudest surface anyone
in this deck proposes. C **6→7**: the inset sheet with a warm clay rule is the first thing in C
that reads as paper on a desk rather than a content area in a dark frame; the room is still dark.

**Canon fit.** A **8→8**: no selector tripped, no card, no tile, and the `contrast.test.ts` cost
is now itemised rather than "one array" — but one of the two items it names is factually wrong
(D45) and A's Refuses is still false about a token that leaves the Document tree entirely (D44),
so the improvement and the new debt cancel. B **6→7**: the KIT.md:266 departure moved into SP-05
where all three lanes own it, the band-as-card read is fixed at the markup level, and the roster
chip that turned a line into a block is gone; held back by the tab-as-plate charge B declines and
by a misprinted contrast floor (D40). C **3→6**: C now names both `contrast.test.ts` break
mechanisms, commits to a specific token strategy *and* a parser change, prices it at a day, calls
it non-optional, states the exemption list going 5→11 as a widening, proposes replacing the list
with a scope check, and volunteers that `TEXT_FORMS` does not match sage or dusty blue. That is
the most complete disposition anyone wrote. It is 6 and not 8 because the register conversion is
priced for inks only (D42) and the mock still ships `-ink` names.

**Cost & reversibility.** A **6→6**: the honesty went up sharply — both sweeps counted, the
package re-timed, the unscoped alternative priced — and the honest number went up with it, and
`--bg-surface`'s 51 files are still nowhere (D44). B **4→5**: one non-styling item instead of two,
the sweeps correctly attributed to the planks, and the unknown that gates the whole lane declared
in three places; the thumbnail query and the unknown remain. C **3→5**: the three unmocked rooms
are out of scope and priced as a follow-on at +3-4 days, the test work is priced and named
non-optional, and the ground is scoped — v1's blocker is gone. It is 5 rather than 6 because the
tail C names for itself (a silent 1.5:1 line) is exactly the failure D42 shows it has
under-scoped.

**Different-product risk (10 = low).** A **8→8**: nothing changes shape; the tan is the only thing
anyone can reject on sight and it is now rejectable without taking the lane down. B **3→5**: the
dashboard read is genuinely fixed — the bands are stock, not badges — and the biggest remaining
risk is a legal-pad-yellow document under a dark header, which is a taste question rather than a
category error. C **2→4**: the inset sheet moves C from "dark chrome around a content area" to
"a lit page on a dark desk", which is a different and defensible object; M5 is still a dark
header, a white page and a dark bar, which is every app on the phone.

---

## What I would tell the team in one paragraph, revised

Put **Direction A first**, and put **SP-01 in front of all three of them**. A is now the only lane
in which I cannot find an arithmetic error — thirty-two contrast pairs, three stock separations,
two hairlines and a red-letter derivation all reproduce to three decimals — it is the only lane
that adds ranks above the shared floors rather than inheriting them, and its one rejectable move
is now scoped so that rejecting the tan costs you the tan and not the direction; what is left to
fix in A is bookkeeping (`--bg-surface` reaches 51 files outside the Document tree and is priced
nowhere, and one sentence in its cost is simply untrue), not judgement. Refuse four things. Refuse
any reading of this package that costs three days: SP-01 is 1,749 literals across 252 files and
4-6 days on its own, it is the plank that answers the actual complaint, and every lane's figures
are worthless until it lands — the ruling in front of you is small and the work behind it is not.
Refuse B's rails as written: the retune that rescued B's signature (1.001 → 1.081, the single best
correction in the revision) drove the rails to **1.058-1.066** against every sheet they flank,
which is *worse than today's 1.081*, while the findings table still advertises 1.152 against a
ground the rails never touch — B is the one lane whose SP-08 goes backwards, and its printed
contrast floor is 0.94 too high. Refuse B's F15 until somebody runs one query against Strata:
locally zero of six FF&E lines carry a `product_id`, and on that shape B's headline material move
renders nothing. Refuse C's register as priced: C now names its two `contrast.test.ts` breaks
better than I did and buys a parser change for a day, but it prices the conversion as an ink
problem, and the planks it adopts hardcode a charcoal rule and a charcoal hairline that measure
**1.141** and **1.015** on C's own desk and **1.000** on its own rails — every plank token needs a
dark twin, not just every ink. On the amendment, the corrected page is right and the team should
read it as it now reads: the cost is zero lint, `globals.css` is linted by nothing, R72's shadow
has shipped untripped for a year on a `.folio-face` that no `.tsx` references — and
`apps/designer-portal/CLAUDE.md:19-26` asked for the stylelint rule "in your first PR" and never
got it, which is the actual finding on this page. Close the dead exception, build the CSS gate,
and note that all three lanes lifted a sheet without asking for a shadow.
