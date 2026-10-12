# D1 · UI designer seat: card anatomy, colour tags, header, section edges

SQ-788, US-26, 2026-10-12. No product code.

Sources: `BRIEF.md`; `walk/WALK.md` with its screenshots; the old card and CSS at `818db6e55`; `apps/designer-portal/src/app/globals.css:8-195`; `docs/design/house-sheet/SPEC.md`; V18 (`docs/vision/VISION-DECISIONS.md:493-523`). The contrast figures are WCAG relative-luminance ratios computed from the token hexes. Sketches are in `review/d1-sketches/`.

---

## (a) Card anatomy for a Desk card

**The unit is one need, not one job.** This matches `DaySheet.lines: DeskNeed[]` (`lib/document/day-sheet.ts:42-47`). System 3 in (e) is the exception, and it names that reversal.

The old card had six registers (stage plate, custody word with a 7 px dot, name, person · phase, sentence, act). WALK §4 counts that as noise: "YOUR PEN ×29". This card has four registers and a foot, in DOM order, which is also screen-reader order:

| # | Register | Type | Colour | Why |
|---|---|---|---|---|
| 1 | **Eyebrow:** stage word · holder word (only when it is not yours) · freshness word | DM Mono 12/16 caps, 0.08em | `--text-subtle` | 12 px, not the old 11 px `HEAD_TYPE`, which sits under the 12 px floor (`globals.css:100`). "LEAH'S" answers M5 without a dot. "2 HOURS AGO" is Q5's mark |
| 2 | **Name:** the job, as a link | Playfair 20/26, 500 | `--text-primary` | The whole upper block is the link (the old D10 overlay, `818db6e55 globals.css:603-632`). This fixes WALK finding 2: the sheet's name cannot open the job (M6) |
| 2b | **Person**, only when it adds something | Inter 14/21 | `--text-muted` | For a default job name ("Consultation"), this is the real handle. WALK finding 5 (M7) |
| 3 | **Sentence:** the need, its fact and its age | Inter 15/22.5 | `--text-muted`, with the overdue clause in `--color-terracotta-ink` (5.41:1) | The one place state colour is spent, and as words: the old SP-20 device. Today "$3,800 overdue" prints in plain ink (WALK §4) |
| 4 | **Foot:** one act + Not today | the `DocumentAction` tiers, as they are | as their tier | A `--rule-hair` band, 44 px (48 at 390). **One row whenever the act fits** (about 18 characters at 309 px); a longer act wraps Not today below it (sketch). Today at 390, Not today always takes its own row (WALK §1b-5) |

**Box (the old recipe):** 1 px `--color-card-edge` (3.21:1), 2 px radius, `--doc-paper` face, no shadow; padding 20 / 20 / 4 (the 4 px keeps the act's focus ring unclipped); gaps 8 / 4 / 12 / 16 px down the registers. The tag lives in the edge ((b)), never as a plate.

**Density.**
- **At 1440** the measure is 976 px (232→1208). Three-up with 24 px gaps gives 309 px cards, a sentence measure of about 38 characters, and cards about 190 px tall. Five cards (3 + 2) take about 420 px, so the sheet plus the next eyebrow fit inside 900 px with the one-line header.
- **At 390** the card is one-up, 358 px wide and about 160 px tall. Five cards take about one screen; today five lines take 1,095 px.
- **Marks at rest for five cards:** about 30 text, 5 tags, up to 3 terracotta clauses and 5 edges. WALK measured today at 45 text / 9 colour / 12 edges, and the old Desk at about 38 / 9 / 3.

**Hover and focus: value only.**
- **Hover:** the card takes its stage's `--wash-*-still` (6 %, `globals.css:187-192`), and the name's score turns clay. Hovering the act keeps the name's score aged oak (`818db6e55 globals.css:663-665`), so only one target is lit.
- **Focus:** a 2 px `--color-clay-ink` outline, offset 2 px, around the whole upper block (`:has(:focus-visible)`, the old recipe). The act keeps its own ring.
- **Never:** an edge-colour change (it would read as a tag change), a scale, or a shadow.

**Wrap, never truncate.** Name and eyebrow use `overflow-wrap: anywhere`; no `text-overflow` or `line-clamp`. The grid stretches rows and pins the foot with `margin-top: auto`, so a row's acts share a baseline (fixing WALK §4's "ragged feet"). It measures its container, as `.desk-ledger-list` does (`globals.css:631-634`): 3-up ≥ 900 px, 2-up ≥ 600 px, 1-up below.

---

## (b) The colour-tag system

### The contrast facts that decide most of it

A tag is a graphical object, so it needs 3:1 against its ground (WCAG 1.4.11). It is never the only signal (1.4.1).

| Pigments | Paper / doc-paper | Rail stock | Dark ground `#26221E` |
|---|---|---|---|
| `--tab-*` ×6 | 4.89–7.87 ✔ | 4.09–6.42 ✔ | **1.93–3.02 ✘** |
| State material (clay, golden, terracotta, sage) | **1.57–2.23 ✘** | ✘ | ✔ |
| State `-ink` ×4 | 5.27–5.75 ✔ | ✔, but R126 bans three of them on rail (`globals.css:65-70`) | ✘ |
| `--color-card-edge` | 3.13–3.21 ✔ | **2.62 ✘** | dark twin `#77736E` |

Two consequences:
1. **State tags must use the `-ink` values.** Those four sit within 5.27–5.61 in value and within about 60° of hue, so they barely separate.
2. **A Desk card can never sit on rail stock.**

### The four candidates

| | **Stage** `--tab-*` | **Need class** 1/2/3 | **State pigment** | **Project colour** (new field) |
|---|---|---|---|---|
| Means | where the job is in its life | how much it blocks (`need-class.ts:18-56`) | late / decision / waiting / moved | which job, by the studio's choice |
| Hues | 6 (Care borrows Install) | 3; effectively 2 (class 3 is one kind, `need-class.ts:55`) | 4 | **at most 4** (below) |
| Buys | **M7** strong: a Brief-blue card is findable at once, as the old Desk proved (`s7-step1-desk-new-lead-1440.jpg`). M6 orientation. M2 is findable. M1 weak: it sorts by life stage, not urgency | **M1** strong, but it duplicates the order: the sheet already ranks by class (V18 Q3). M2 and M4 are class 1. M3 and M5 are class 2, like everything else | **M8** strong: "moved" / "waiting" give close of day meaning. M4 "late" | **M6** strong only if it also prints on the Document and iOS. M5 weak |
| Noise, 5 cards | 5 tags + ≤3 terracotta clauses. It **orients**, it does not alarm (WALK §4) | 5 tags, and the top row is usually all class-1 terracotta. **Alarm-shaped** | 5 tags whose colours change through the day. Motion on the studio surface | 5 tags that say nothing about the day |
| Collides with | nothing on the Desk | state, if it borrows terracotta | **the Document's stamps:** clay = ordered, golden = decision, terracotta = **damaged**, sage = delivered (`globals.css:152-155`) | stage, if it borrows the tab pigments |
| Colour-blind | neighbours step only 1.08–1.11:1 in value. Under deuteranopia, about three groups. **The word always prints** | terracotta- vs clay-ink are close. The word must print | four inks within 5.27–5.61. **Indistinguishable to most CVD readers** | needs the name anyway |
| Tokens | reuse `--tab-*`; **add** dark `--tab-*-edge` | reuse the inks | reuse the inks | **add** `--job-1…4`, plus a DB field |

**Why project colour tops out at four hues.** The stage ladder spans 5°→208° with "no two hues closer than 30°" (`globals.css:159-169`), so a project hue that never reads as a stage must live in 238°–335°: four hues. Sixteen jobs repeat each colour four times, so it groups jobs but cannot identify one. It also needs a field the DB lacks (BRIEF §7) and a studio choice, against "the studio won't notice Patina".

### Size, form and placement

| Form | Size | Verdict |
|---|---|---|
| **Left rule** | 3 px × card height, in place of the left edge | Reads in peripheral vision down a column, including 1-up at 390. Best for stage. Roster rows can take a 2 px tick |
| **Corner tab** | 28 × 5 px, notched into the top edge at the left, a folder tab | Reads as "filed under". It must stay a bare shape; with a word on it, it is a badge |
| **Small square** | 8 × 8 px, in the eyebrow | A status dot by another name (house :592, V18 Q1). **Reject** |
| **Top hairline** | 3 px × card width, in place of the top edge | Reads across a grid row, weakly down a 1-up column. Suits job-level colour |

### Recommendation

**One colour meaning per card: stage, as a 3 px left rule, with the stage word always printed in ink.**
- Urgency stays in the order and in terracotta-ink words.
- State pigments stay the Document's stamp vocabulary. On the Desk they appear only as words, in the close-of-day tray.
- Project colour is a founder question, not a default.

**Dark mode.** The portal paints none (`globals.css:56-59`; WALK §0), so dark values are documented, not shipped, like `--color-card-edge`'s twin (`SPEC.md:102`). §F-J keeps plate values dark because a white label sits *on* the plate (`SPEC.md:1201`); a rule sits on dark paper, where the light tabs fail (1.93–3.02). Proposed companions, each ≥4.71:1 on `#2A2622`, hue order kept:

```css
--tab-brief-edge: #7D9EC0; --tab-discovery-edge: #5FA08F; --tab-direction-edge: #73A374;
--tab-proposal-edge: #A3A75C; --tab-project-edge: #B98F5A; --tab-install-edge: #CC7A70;
```

---

## (c) A concise one-line header

**Today** (WALK §1a): two baselines, tips that read as acts, three underline weights, and 203 px at 390.

**1440: one 44 px row.**

```
Good morning, Leah          ＋ RECORD AN INQUIRY   ＋ CREATE A PROJECT FILE   FIND ANYTHING ⌘K
```

- **The greeting** is Playfair 28, with the italic first name as today (`desk/page.tsx:452-465`). All items share one baseline.
- **The date leaves the header** and becomes the Day Sheet's eyebrow: "MONDAY 12 OCTOBER · THIS MORNING". It dates the sheet.
  - **Builder constraint:** the date `<p>` carries `data-part="head"` and `tabIndex={-1}`, the US-14 arrival landing (`desk/page.tsx:467-474`). Those must move with it.
  - **Width:** about 260 + 820 px fits in 976 px. With the date kept on the line, it does not.
- **Two underline weights, not three.** Both ＋ acts take the secondary tier and Find takes tertiary. The header verbs are not the day's strongest act; the top card's act is.
  - The clay ＋ is the header's only colour.
- **The tips leave the Desk.**
  - **⌘K.** They are the ⌘K rows' own words (`lib/document/registry.tsx:255-257`), and in a verb list they help.
  - **The project sheet.** The one tip that adds a fact ("no proposal needed") opens the Create-a-project-file sheet. That copy already exists as `help.blurb` (`registry.tsx:283`).
  - **No tooltip:** touch and keyboard would lose it.
- **⌘K.** The `kbd` keycap box stays (a keycap, not a badge) and sits on the shared baseline (today it sits about 10 px low). It shows only under `(hover: hover) and (pointer: fine)`.

**390: two short rows, about 92 px (today 203).**

```
Good morning, Leah                 ⌕ FIND
＋ INQUIRY    ＋ PROJECT
```

- **Row 1.** The greeting is Playfair 24 on one line. Find is a 44 × 44 target with a visible word and no ⌘K.
- **Row 2.** The ＋ acts are 44 px tall, left on the 16 px gutter, with short visible labels. Their accessible names stay full, so the visible word is contained in the name (WCAG 2.5.3).
  - The full labels cannot share a 358 px row: they need 362 px or more.
  - **The short forms need the Direction C labeling owner's sign-off** (V18, `VISION-DECISIONS.md:516`). I am asking, not renaming.
- **Rejected:** a "＋ New" menu; it adds a click to M7.

---

## (d) Section edges

Today every section is transparent ink on cream, and only Resources has a border (WALK §1b). There are three shadow-free edges available. Give **each kind of content its own kind of edge**:

1. **Cards get the box.** The Day Sheet is now the only boxed material on the page, so it can no longer read as the top of the workload. That is WALK finding 1, the worst.
2. **The close-of-day tray gets a stock change.** "Waiting on", "Coming back" and "Set aside" (`day-sheet.ts:27-45`) sit on one full-measure `--doc-rail-stock` panel: 24 px padding, no border, the 1.20:1 stock step as its edge. Only ink, the muted ramp and clay-ink print there (R126), and no cards (edge 2.62:1 on rail). It also answers WALK §1c: the quiet sheet ends in what is waiting, not in "No current action alerts" above a contradicting workload.
3. **The workload gets rules.** It stays a ruled ledger on ground paper, with R126's three ranks (`globals.css:137-145`):
   - a hairline ends a row;
   - `--rule-mid` (1.5 px charcoal) ends a section;
   - the double rule opens a movement.

**Rules.**
- **The double rule** (`.doc-rule-strong`) runs under the header and opens the day.
- **Every section closes on a full-measure `--rule-mid`.** Full measure means 232→1208; today the sheet's hairlines stop at 1183 (WALK §1b-2). Row hairlines run full measure too.
- "*The rest are on their projects.*" moves *above* the sheet's closing rule, so it stops captioning the workload.

**Eyebrows: one system.** Every section opens with the ornament, a mono 12 px caps name, and its controls right-aligned on the same baseline ("MONDAY 12 OCTOBER · THIS MORNING … Mine · The studio's"; "STUDIO WORKLOAD … By team member"; BOARDS; RESOURCES). The Playfair italic line may stay as the sheet's voice under its eyebrow. Today the sheet head is a 22 px italic beside a mono workload eyebrow: two systems side by side.

**Spacing, on the 24 px module only** (`SPEC.md:164`): 48 px header → sheet, 72 px between sections, 24 px inside, 12 px eyebrow → content.

**What edges cannot fix:** Holloway's second SEND REMINDER about 1,950 px down (WALK §1b-3). Only the model can stop the double act. A suggestion for the UX seat: a roster row whose need is on the sheet prints "On today's sheet" in place of its act.

---

## (e) Three visual systems for the founders

**All three keep** every BRIEF §6 "still binding" item, at most five sheet cards, and V18's Q1 guards against an overflow count, dots and a Not-today counter.

**Reversal key** (BRIEF §6): **V18-Q1m** "Desk is monochrome" · **V18-Q7** plates become ink words · **C/D3** Direction C superseding R143 D3, the claim grid · **H54** `--card-edge` for claim cards only · **H592** no pills, dots or badges · **H1011** no badges, chips or tinted band · **H168** no shadows (kept by all three).

### 1 · Index Cards: stage, on a left rule (recommended)

**Layout.**
- **Sheet:** five need cards, 3 + 2 at 1440 and 1-up at 390. Each has a 3 px `--tab-*` left rule, the ink stage word, and terracotta-ink overdue clauses.
- **Tray:** the rail-stock close-of-day tray.
- **Workload:** the ruled ledger. Each row gets a 2 px stage tick, the height of its name line. That returns scan-by-colour to about 40 rows (WALK finding 6) without a plate.
- **Colour at the 1440 fold:** about 9 marks, today's count, but every one orients.

**Reverses:** **V18-Q1m**; **V18-Q7 in part** (the word stays ink; colour returns as an edge, not a plate); **C/D3** (the grid returns); **H54, extended** to Day Sheet cards, which are claim cards renamed.

**Keeps:** R143 D5 (a holder word only when it is not yours), D7, H592, and H1011 (the hover wash is per card and transient, never a band).

**Adds:** six dark-only `--tab-*-edge` companions, documented only.

### 2 · The Docket: need class, on a corner tab

**Layout.**
- **Sheet:** one column of full-measure **row-cards**: name | sentence | foot on one row at 1440, about 88 px tall, about 480 px for five. At 390 they stack into the (a) anatomy.
- **Tag:** a 28 × 5 px corner tab:
  - class 1 (money / signature) in `--color-terracotta-ink`;
  - class 2 in `--color-clay-ink`;
  - class 3 in `--text-subtle`.
- **Class word:** "MONEY" / "NEEDS YOU" / "SET UP" leads the eyebrow, because the two inks fail CVD separation.
- **Workload:** grouped under the same class eyebrows. No stage colour anywhere.
- **Its honest weakness:** the top is usually all class 1, a row of hot tabs every morning. That is exactly why founders should see it.

**Reverses:** **V18-Q1m**; **V18 Q1 "no badges", arguably** (a per-class marker is badge-adjacent, even as a bare shape); **C/D3 in part** (rows, not a grid); **H54, extended**; **H592 at risk** (founders rule whether a shape on an edge is a "status dot").

**Keeps:** V18-Q7, H1011.

**Adds:** no tokens. **Collides:** terracotta already means "damaged" on the Document's stamps (`globals.css:154`).

### 3 · Job Folders: project colour, on a top hairline

**Layout.**
- **Sheet:** cards per **job**, 3-up. A card holds up to two needs, each with its act.
- **Tag:** a 3 px top hairline in the job's colour (`--job-1…4`, in 238°–335° so it never reads as a stage), plus the ink stage word.
- **Spread:** the same hairline prints on the job's Document letterhead and its iOS tile. It is the only system whose colour helps M6 off the Desk.
- **Default:** assigned round-robin, so the studio never has to choose, and editable in settings.

**Reverses:** **V18-Q1m**; **R143 D10**, "a card is a treatment for NEED, not a container for a JOB" (`818db6e55 desk-claim-card.tsx:6`); **C/D3**; **H54, extended**; and it invokes **BRIEF §6's new-hex rule** by naming four `--job-*` tokens, light and dark.

**Keeps:** V18-Q7, H592, H1011.

**Outside this story:** a `project_colour` field, which is a schema change. With 16 jobs on four colours, each repeats about four times: the colour groups jobs, it does not identify them.

### Founder framing

System 1 does Kody's ask with the least new canon; System 2 answers M1 most directly but spends alarm colour every morning; System 3 alone pays off beyond the Desk, for a schema field and a studio habit.

**The question this seat adds:** may the Desk's colour ever mean **urgency** (System 2), or only **orientation** (System 1)? V18 kept the Desk monochrome partly so colour could not nag. The answer decides which half of that ruling survives.
