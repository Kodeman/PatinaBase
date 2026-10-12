# The Desk, re-envisioned: synthesis and direction

**12 October 2026 · Synthesis (Opus 5.5, SQ-792) of the US-26 team, W1 and D1–D5**

**Inputs:**
- `BRIEF.md` (Kody's ask, the personas, M1–M8, the success test, and the canon this exploration reopens in §6)
- `walk/WALK.md` and its screenshots (the measured baseline: today's Desk against the old card Desk, local Supabase, the v2 fixture)
- `review/d1-ui.md` and `review/d1-sketches/` (D1, UI: card anatomy, tags, header, edges)
- `review/d2-ux.md` (D2, UX and information architecture)
- `review/d3-heuristics.md` (D3, Nielsen heuristics and a cognitive walkthrough)
- `review/d4-patterns.md` (D4, outside patterns, web research)
- `review/d5-seats.md` (D5, studio seats)
- prior art: US-24 `synthesis/direction.md` (why the cards were removed) and US-24 `specimens/SPEC.md` §3 (the Hartwell fixture)

**Weighting.**
- D1 and D2 read the code behind the walk and cite it.
- D3 works from the walk and the code it cites.
- D4 is web research about other products: evidence about patterns, never about Patina.
- **D5's seats are simulated personas.** Their lines are a reviewer's reading of the screenshots. Nothing here is presented as something Leah, Jordan or anyone in a real studio said.

Canon is waived for the exploration (BRIEF §6), and each direction names its reversals in §3. These are not waived: zero shadows, wrap and never truncate, the three paper stocks and existing pigment tokens (a new hex only as a named token), Playfair / Inter / DM Mono, copy that never says "AI", the VISION promise (the studio won't notice Patina; never optimise the studio surface for engagement), accessibility, and honesty.

**Notation.**
- **M1–M8** are always BRIEF §4's day moments.
- Seat references are written like "D1 (b)", "D2 §0 fact 3" or "D5 A4".
- Click and second figures for the directions are **estimates**. They are set against WALK §3's measured baseline, illustrated by the specimens, and verified by nothing yet.
- "Marks at rest" uses WALK §0's count (text, controls, colour marks, drawn edges, within the first viewport of `<main>`).

---

## 1. The thesis

> **Today's Desk ranks but has no edges; the old Desk had edges but no rank. Kody's ask is to put the edges back around the ranked thing, and to let a small colour tell the eye where each job lives, never how loudly to worry.**

Kody's words (BRIEF §1): "This top bar should be more concise, the actions with the tip below seems sloppy. Then everything kind of bleeds together, Lets look at bring back the cards with little color tags and tighting up the Desk to a true place to look at and operate your day from."

The US-25 Desk got the model right: a bounded, ranked sheet of at most five lines, Not today, Mine against the studio's, a hand-off line, and act sheets that open in about a second, prefilled, and never send on their own (WALK §4 "What today does better"). What it lost when the cards went (`f2d65f64d`) was territory. Every section is transparent ink on cream (WALK §1b); the sheet's rules stop short of its head rule (§1b-2); the sheet's job name is not a link (finding 2); and the workload repeats five of the sheet's needs about 1,950 px lower with a second act (§1b-3). The old cards had the territory, as an edge per job, a linked Playfair name and an act on its own foot. They spent it on 32 unranked boxes and seven registers each, with plates louder than the money (WALK §4 "did badly").

So the redesign is not "cards or rows". It is one bounded, ranked account of the day, **each thing on it once, each unit with its own edge, and colour spent on orientation**. The three directions below differ in what a card stands for, what the tag means, and where acting happens.

## 2. Where the team agrees, and where it splits

### Where it agrees

Each row was raised by at least three seats.

| # | Finding | W1 | D1 | D2 | D3 | D4 | D5 (simulated) |
|---|---|---|---|---|---|---|---|
| G1 | **The header is one line, and the tips go.** The tips read as acts on a second caps baseline; three underline weights; 203 px at 390 and the gutter broken. | §1a, finding 3 | (c) | (d) | §3 "Header", H4, H10 | §3 principle 8; §4 "tip text under buttons" | A2, A5.1, B2; agree 1 |
| G2 | **Each unit gets its own edge.** Name, need and act should read as one thing; the sections need hard boundaries. | §1b, §4 "did well" | (a), (d) | (b) "two hard edges" | §3 "Rhythm and edges", §4 | §3 principle 6 | A3, A5.2; agree 2 |
| G3 | **One need, one place.** A need on the sheet must not repeat below it with a second act. | finding 1 | (d) last para | (b), fact 4 | H1, H5 | §4 "several surfaces for one job" | A2, A5.2; agree 3 |
| G4 | **The job name opens the job from the sheet,** and Back returns to the same place. | finding 2, M6 | (a) register 2 | (a), M6 | H3, M6 | — | A2; agree 4 |
| G5 | **Keep the bounded five, Not today, Mine / the studio's, the hand-off line, and acts that draft but never send.** | §4 "should survive" | (e) "all three keep" | §0 "what survives" | bottom line | — | A2, B2; agree 2, 5 |
| G6 | **Colour must not grade, count or pulse.** Overdue money may keep the red-brown ink, in the sentence only. | §4 "plates as shouting" | (b) "alarm-shaped" | (f) Model 1 | §4 "avoid" | §3 principles 1, 3, 5; §4 | A4, B4; agree 6 |
| G7 | **The close of day must be true.** The quiet sheet over an owed row contradicts itself; "Coming back" never renders; what waits on others is buried. | §1c, finding 4 | (d) tray | §0 facts 1, 4; (a) "Close" | H1, H9, M8 | Things "This Evening", Sunsama (§1a) | B2, B5.3; agree 7 |
| G8 | **A new inquiry must land under the person's name,** not as "Consultation". | finding 5, M7 | (a) register 2b | M7 | H1, H2, M7 | — | A2 |

### Where it splits, and the ruling

| Split | The positions | Ruling and reason |
|---|---|---|
| **What the colour tag means** | **Stage:** D1 (b) recommends it; D5 A4 (simulated Leah: "Colour should be the job's address, not its temperature"); D4 §5 A. **Whose move:** D5 B4 (simulated Jordan); D4 §5 B; D2 (f) Model 2. **Need class:** D1 (e) System 2 and D2 (f) Model 3, both offered so the founders see urgency colour. **Project colour:** D1 (e) System 3; D4 §5 C. | **One meaning per direction, so the founders can compare.** A = stage (the majority view), B = need class (the urgency question D1 (e) says the founders must rule), C = project colour (the only option that pays off beyond the Desk). **Whose move is carried in words and structure in all three**, never in a hue, which is the split D5 itself proposes ("one direction could carry stage in colour and ownership in words"). D4 §3 principle 2 and the Asana collision say two colour meanings on one card is the old noise. |
| **What a card stands for** | D1 (a): one need. D2 (b): today's lines bound onto their job (one object). D2 (f) Model 2: every job. | **One unit per direction:** A = a job card holding today's lines (D2's recommendation); B = one need per card (D1's anatomy); C = every live job, compact. |
| **The tag's form** | D1 (b): a 3 px left rule; it rejects an 8 × 8 square as "a status dot by another name". D2 (b) proposes a small square chip. | **No square chips in any direction.** D1's reason is the canon text (house sheet :592, V18 Q1), and D4 §1 found that calm tools put tags at an edge, never as a fill. A uses D1's left rule, B D1's corner tab, and C D1's top band. |
| **The header's acts** | D1 (c) keeps both ＋ acts and moves the date to the sheet's eyebrow. D2 (d) keeps the date and moves Create a project file to ⌘K. D5 A5.1 (simulated Leah) wants all three, "once each". | **Both shapes are drawn:** A uses D1's header, and B and C use D2's. **Recommended: D1's**, keeping both creates (Q7). Kody's complaint was the tips, not the acts (BRIEF §1). |
| **What happens to a line after an act** | Today the sixth need is promoted into the gap at once (`day-sheet.ts:158`). D2 (c): the line stays where it was for the visit, rewritten in muted ink, and its slot does not refill. | **D2's rule in all three.** "Each defer deals a fresh card" is the engagement loop VISION refuses (D2 (c)). It also answers D5 B4: "a tag that is still lit after he has acted" is gone. |
| **What the studio's scope is for** | D5 A5.3 (Leah): show Jordan's side and what waits on others. D5 B5.1 (Jordan): names on everything, safe to read without acting. D2 §0 fact 3: need state is per person under RLS, so Leah cannot see that Jordan chased. | **Holder words on every card and row in the studio's scope** (V18 Q2 already rules "custody names the holder"). Reading a teammate's acted state is an RLS ruling, not a layout one (Q8). |
| **Sheet order for the hire** | D5 A4 (Leah): by money and trust. D5 B5.2 (Jordan): his hand-off first. | **Rank stays V18 Q3's** (class, then deadline, then age). **A hand-off prints first on its own job's card or group** (D2 (b)), so it explains the act it sits above without changing the cross-job rank. |

**Unique catches worth carrying:**
- **Set aside has no door.** The RPC exists (`00765_studio_need_states.sql:160`), but nothing writes `set_aside` (D2 §0 fact 2).
- **"Waiting on others" means two things:** the workload's "owner is not the designer" and the sheet's "someone has acted" (D2 §0 fact 4).
- **Record the payment opens the whole Accounts ledger** (`day-sheet.tsx:109-112`; D2 (c)), on the first-dollar stream.
- **The state `-ink` pigments sit within 5.27–5.61:1 of each other and about 60° of hue,** so no tag system can rest on them for colour-blind readers (D1 (b)).
- **A Desk card can never sit on rail stock:** `--card-edge` falls to 2.62:1 there (D1 (b)).
- **Stage pigments fail on the dark ground** (1.93–3.02:1), so a dark Desk needs edge companions (D1 (b)).
- **Interior-design studio tools are not documented as colouring the project home by phase.** Patina would be setting that convention, not following one (D4 §1b).
- **The dock label truncates at 390** ("Studio overv…"), against *wrap, never truncate* (WALK §1c).
- **D5 B2 names a real furniture maker** for Marsh Street's PO. The fixture keeps US-24's invented Ninebark Lighting (SPEC §3).

---

## 3. Three directions

All three bring back cards with a colour tag; that is Kody's ask (BRIEF §2). They differ **in kind**:
- **A** puts edges back around today's model: today's lines sit on job cards with a stage edge, and every other job appears once below as a ruled row.
- **B** turns the day itself into the structure: need cards on a board by the day's state, and the act opens inside the card.
- **C** gives every job a studio colour that follows it across the Desk, the Document and Field, with the day's five as a strip above a wall of every job.

**Revisions to the starting frame**, with the evidence:
1. **A's "one urgency mark" is a coloured clause, not a second shape.** It is the overdue clause in `--color-terracotta-ink`; there is no rule or dot beside it. Reasons: D4 §3 principle 2 (one question per colour); D5 A4 ("only in the sentence. Not as a second tag"); US-24 A's graded need rule was the one idea V18 did not adopt (V18 Q7 clause 2).
2. **B's need-class tag is lit only while the need is yours.** In Waiting and Coming back the tab drops to `--text-faint`. Reasons: D5 B4 (simulated Jordan: "If the colour's still shouting after I've done the thing, I'll stop trusting the colour"); D4 §3 principle 5 (colour only where a person might act). A maker's silence (`po_unacknowledged`) is class 2 (`need-class.ts:43`), so it never prints in terracotta. That answers D5 B4's "red on a maker's silence".
3. **C uses six studio colours, not four or eight,** and keeps stage as an ink word. D1 (b) caps project colour at four hues because it must not read as a stage. That cap holds only while stage pigments print beside it. C keeps V18 Q7 (no stage colour anywhere), so six well-separated hues are available. D4 §2 puts the ceiling at five to seven, and Carbon says "more than five or six … can overwhelm".
4. **The focus strip is the Day Sheet.** It is today's at most five need lines, laid as a strip across the top, so C keeps the V18 Q1 five-line guard literally.

The **header fix-now** (§5, F1) applies to all three. Each direction below names only its choice of acts and date.

### Direction A: Restored and tightened — RECOMMENDED

**In one line.** Today's five lines on up to five bordered job cards with a stage edge; every other job appears once below as a ruled row with a stage tick; the close of day is the same page, emptied.

**Header.** D1 (c), one 44 px row at 1440:

```
Good morning, Leah          ＋ Record an inquiry   ＋ Create a project file   Find anything ⌘K
```

- **The date moves** to the Today eyebrow ("MONDAY 12 OCTOBER · TODAY"). The US-14 arrival landing (`data-part="head"`, `tabIndex={-1}`, `desk/page.tsx:467-474`) moves with it.
- **Two underline weights:** both ＋ acts take the secondary tier, and Find takes the tertiary. The clay ＋ is the header's only colour.
- **⌘K** sits on the shared baseline and shows only under `(hover: hover) and (pointer: fine)`.
- **390:** two short rows, about 92 px. "Good morning, *Leah*" with "⌕ Find"; then "＋ Inquiry" and "＋ Project", 44 px targets. The accessible names stay in full (WCAG 2.5.3). The short labels need the Direction C labeling owner's sign-off (V18, `VISION-DECISIONS.md:521`; D1 (c)).

**Card anatomy.** The card stands for **a job, holding that job's lines from today's five** (D2 (b)). Holloway's invoice and PO-HD-0412 share one card. In DOM and reading order:

| # | Register | Type | Colour |
|---|---|---|---|
| 1 | **Eyebrow:** stage word · holder word (only when it is not yours, e.g. "JORDAN'S") · freshness word (e.g. "2 HOURS AGO", V18 Q5) | DM Mono 12/16 caps, 0.08em | `--text-subtle` |
| 2 | **Name:** the job, as a link. The whole upper block is the link (the old D10 overlay). | Playfair 20/26, 500 | `--text-primary` |
| 2b | **Person**, only when it adds something (a lead, a default job name) | Inter 14/21 | `--text-muted` |
| 3 | **Need lines,** one per need from the five. A hand-off line prints first on its card. Each line has its sentence, its act and Not today. | Inter 15/22.5 | `--text-muted`; the overdue clause in `--color-terracotta-ink` (5.41:1) |
| 4 | **Foot** for each line: one act and Not today on one row whenever it fits | the `DocumentAction` tiers | as their tier |

- **Box:** 1 px `--color-card-edge` (3.21:1), 2 px radius, `--doc-paper` face, no shadow. The tag replaces the left edge.
- **Grid:** 3-up at ≥ 900 px, 2-up at ≥ 600 px, 1-up below. It measures its container, as `.desk-ledger-list` does (`globals.css:631-634`). Rows stretch, and the foot is pinned with `margin-top: auto`, so a row's acts share a baseline (WALK §4 "ragged feet").
- **Hover:** the stage's `--wash-*-still` at 6 % (`globals.css:187-192`), per card and transient.
- **Focus:** a 2 px `--color-clay-ink` outline on the upper block.

**Tag system.**

| | |
|---|---|
| Means | **Stage**, where the job is in its life: brief · discovery · direction · proposal · project · install. Care borrows install (house sheet :72). |
| Tokens | `--tab-brief` … `--tab-install` (globals.css:164-169), reused as they are. |
| Form | **A 3 px left rule** in place of the card's left edge (D1 (b)). Ledger rows get a **2 px tick** the height of the name line. The stage **word always prints** in ink in the eyebrow. |
| Colour-blind | Neighbouring stages step only 1.08–1.11:1 in value, so under deuteranopia they read as about three groups (D1 (b)). The ink word carries the meaning (WCAG 1.4.1, technique G14; D4 §2). |
| Dark mode | The portal paints no dark paper set (`globals.css:56`; WALK §0), so dark values are **documented, not shipped**. The tab pigments fail on the dark ground (1.93–3.02:1), so A documents D1's six dark-only edge companions: `--tab-brief-edge #7D9EC0`, `--tab-discovery-edge #5FA08F`, `--tab-direction-edge #73A374`, `--tab-proposal-edge #A3A75C`, `--tab-project-edge #B98F5A`, `--tab-install-edge #CC7A70`. Each is ≥ 4.71:1 on `#2A2622`. The rest of dark mode is the house sheet's dark set (`docs/design/house-sheet/SPEC.md:89-108`), with `--card-edge #77736E`. |
| Urgency | Not in the tag. It lives in the order (V18 Q3) and in the overdue clause in terracotta-ink words. |

**Layout.**
- **1440** (measure 976 px, 232→1208):
  - the header, then the double rule (`.doc-rule-strong`) that opens the day;
  - **Today**: the eyebrow with the scope switch "Mine · The studio's" right-aligned on its baseline, then the cards, 3 + 2 at most (about 420 px for five);
  - Today closes on a full-measure `--rule-mid`;
  - **the ledger**, every other live job once, in groups: **Also yours** · **With others** · **Coming back** · **At rest — show** (folded, no count);
  - each group opens with the ornament eyebrow, and row hairlines run full measure;
  - in the studio's scope the groups regroup by person ("Leah's", "Jordan's"), each with its own yours / with others split, and the "By team member" toggle retires (D2 (b)).
- **390:**
  - the two-row header (about 92 px);
  - then one card per row, 358 px wide, with the act and Not today on one row when the act fits (D1 (a));
  - five lines on four cards come to about one screen (today: 1,095 px);
  - the ledger rows stack name / sentence / act, with the 2 px tick beside the name.

**M1–M8.** Clicks are counted from the Desk at rest to the act's sheet or page being open. Scrolling is not a click. Today's figures are WALK §3's; "real" means without the seed's legacy rows (WALK §2).

| # | Path under A | A: clicks (scroll 1440 / 390) | A: est. s 1440 / 390 | Today: clicks (scroll) | Today: s |
|---|---|---|---|---|---|
| M1 | Read the Today eyebrow and four cards: the stage edges give the shape (two Project, a Proposal, a Brief), then five lines. "What can wait" sits directly under Today's closing rule: Also yours, With others, Coming back. | 0 (0 / under 1 screen) | 5 / 8 | 0 (0 / 1 screen) | 8 / 14 |
| M2 | Linden's card: "Declined yesterday: 'The sofa is over budget; can we see a second option under $6,000?'" · **Follow up** opens `proposal-follow-up` in place | 1 (0) | 4 / 5 | 1 (529 / 1,522 px); real 1 (0) | 12 / 20; real 4 |
| M3 | Holloway's card, line 2: "Fenmoor Joinery has not answered PO-HD-0412 in 12 days" · **Chase the maker** opens `po-chase` | 1 (0) | 4 / 5 | Leah: no Desk path | 20+ |
| M4 | Holloway's card, line 1 · **Send reminder**. Chen's Record the payment opens a **new scoped sheet** (Q10). | 1 (0) | 4 / 5 | 1 (0); Record opens the whole ledger | 5 / 6 |
| M5 | Jordan's Mine: the Marsh Street card opens with the hand-off line, then the PO line, "Draft the chase for Leah". In the studio's scope every card carries its holder word. | Whose: 0 · Read: 1 | 2 / 3 | Read 1; whose: a toggle 900 px down | 4 / 5 |
| M6 | Press the name on Holloway's card; Back returns to the same scroll offset (fix-now F6) | 1 (0) + Back | 2 / 3 | 1 (1,873 / 4,624 px); Back to 96 px | 8 / 15 |
| M7 | ＋ Record an inquiry, two fields, Create. The overlay closes **onto the Desk** with a muted line for the visit: "Ainsley Moore recorded · just now · Open the brief". The lead lands in Today, or at the head of Also yours, **under her name**. | 3 + 0 | 25 + 0 | 3, then Back + 1,344 px | 25 + about 10 |
| M8 | Acted lines read in their settled state for the visit. On the next open: "Nothing more needs you today." above With others ("Waiting on Fenmoor Joinery since today") and Coming back ("Thornfield · back Tuesday 13 October"), both always shown. Facts, never a score. | 3 to clear · 0 to read | about 10 / 5 to read | 3 to clear; "comes back" not shown | about 10 / not readable |

**Calm, operable, glanceable.** Each score is out of 5, against BRIEF §5.

| | Today | A | Basis |
|---|---|---|---|
| **Calm** | 3 | **4** | **Marks at rest at the 1440 fold, measured on the specimen** (frame a1, SQ-796): A 41 text · 19 controls · 13 colour · 11 edges, against today's 45 · 18 · 9 · 12 (WALK §3). At 390 (frame a8): 29 · 14 · 9 · 6, against today's 25 · 9 · 4 · 8. *This replaces the synthesis estimate of ≈ 34 · 14 · 9 · 6; see the note under the side-by-side table.* **Grading colour marks:** 1 at the fold, the terracotta overdue clause; the tags grade nothing. Nothing moves or counts. **Not 5,** because 13 colour marks at rest is more colour than V18 Q1's monochrome Desk. |
| **Operable** | 2 | **4** | Every moment is at most 1 click from rest, except M7's typing. There is no scroll to act at 1440. Not 5, because acts still open an overlay sheet, and Record the payment needs a new sheet (Q10). |
| **Glanceable** | 2 | **4** | M1 ≈ 5 s at 1440 and ≈ 8 s at 390; the close of day is readable in ≈ 5 s. Not 5, because "what can wait" is one section below the fold at 390. |

**Data or schema needs.** **No migration.**
- A new pure fold, `groupSheetByJob`, over `DaySheet.lines` (`lib/document/day-sheet.ts:42-47`), keyed on `projectId`; the roster excludes those ids (D2 (b)).
- `deriveDaySheet` returns its deferred lines instead of dropping them with a bare `continue` (`day-sheet.ts:149`), so Coming back can always render (D2 §0 fact 1).
- One meaning for "with others" (D2 §0 fact 4): a silent PO with a chase owed stays yours.
- A visit memory that holds the five and does not refill a slot (`day-sheet.ts:158`; D2 (c)).
- A Set aside door, "Not today · Until…", onto the existing RPC branch (00765:160).
- A `record-payment` act sheet scoped to one invoice (Q10).
- The inquiry overlay closes onto the Desk (Q11); the lead takes the person's name from `leads`.
- Six dark `--tab-*-edge` tokens, documented only.

**Canon reversals against BRIEF §6.**

| BRIEF §6 item | A |
|---|---|
| V18 Q1: the Desk is monochrome | **Reverses.** Stage colour returns as a 3 px rule. |
| V18 Q1: no dots | Keeps. The rule is an edge, not a dot. |
| V18 Q1: no badges | Keeps. |
| V18 Q1: no overflow count | Keeps. "At rest — show" has no count. |
| V18 Q1: at most five lines | Keeps, literally. Five lines on at most five cards. |
| V18 Q7: stage plates demoted to ink words | **Reverses in part.** The word stays ink; stage colour returns as an edge, not a plate. |
| V18 Q7: B carries urgency in ordering and words alone | **Reverses in part.** The overdue clause prints in terracotta-ink (coloured words, not a mark). |
| V18 / Direction C: R143 D3, the claim grid | **Reverses in part.** Bordered cards return, bounded to the five. |
| R143 D5, custody words | Keeps superseded. Holder words are V18 Q2's "custody names the holder", not YOUR PEN. |
| R143 D6 | Keeps superseded. |
| R143 D7, the day line | Keeps superseded. |
| House :1011: no badges or count chips | Keeps. |
| House :1011: no tinted band behind a stage group | Keeps. The hover wash is per card and transient, and there are no stage groups. |
| House :54–57: `--card-edge` for claim cards only | **Extends** it to Today's job cards. Arguably kept, since these are the claim cards' successors; the founders should rule. |
| House :592: no pills, status dots or badges | Keeps. |
| House :168: no shadows | Keeps (binding). |

**Risks.**
- A 150-day balance and a 2-day one differ only in their words (D2 (f) Model 1 "against").
- Stage colour orients, but it does not say what to do first; the order has to.
- Nine pigments at rest is new colour on a Desk ruled monochrome two days ago.

**Build size.** **5 slices, small to medium** (§6).

### Direction B: The day board

**In one line.** The day is the structure: need cards on three columns, **Now · Waiting · Coming back**, with a need-class tab lit only while the need is yours, and the act opening inside its card. The Day Sheet becomes the Now column.

**Header.** D2 (d), one row at 1440:

```
Good morning, Leah · Monday 12 October          ＋ Record an inquiry · Find anything ⌘K
```

- Create a project file moves to ⌘K and Desk Contents' Begin column, where it already exists (`registry.tsx:274-277`).
- The board names the day, so the date stays on the line.
- **390:** "Morning, *Leah*" · "＋ Inquiry" · a Find button with an accessible name, about 56 px (D2 (d)). The short forms need the labeling owner's sign-off.

**Card anatomy.** The card stands for **one need** (D1 (a)), so Holloway has two cards. In order:
1. **The class tab,** notched into the card's top edge at the left.
2. **The eyebrow:** the class word ("MONEY OR SIGNATURE" or "NEEDS YOU") · the stage word · the holder word (when not yours) · the freshness word.
3. **The name,** as a link (Playfair 20).
4. **The sentence,** with the overdue clause in terracotta-ink.
5. **The foot:** one act + Not today, or "Not today · Until…".

- **Waiting and Coming back cards are compact:** tab, eyebrow, name, and one sentence ("Waiting on Fenmoor Joinery since today"; "Back Tuesday 13 October"). They have no act foot, only the name link, plus Undo for the rest of the visit.
- **Acting on the card.** Pressing an act opens it **inside the card**, not as an overlay. The card grows in place to hold the scoped draft (to, record, the text to review) and a **named second control**, "Send to Nora and Sam Holloway", with "Put back" beside it.
  - One card is open at a time; opening another closes the first, keeping its draft.
  - Nothing animates (reduced motion is the default); the column simply reflows.
  - After sending, the card settles in place for the visit ("Reminder sent · waiting on the Holloways since 8:42"), its tab drops to faint, and **its slot does not refill**. On the next open it sits in Waiting.

**Tag system.**

| | |
|---|---|
| Means | **Need class:** how much the need blocks (`need-class.ts:18-56`). Class 1 is money or a signature; class 2 needs you; class 3 is setup and never reaches the board. |
| Tokens | Class 1: `--color-terracotta-ink` (5.41:1 on doc paper). Class 2: `--color-clay-ink` (5.75:1). Not yours (Waiting, Coming back, or acted this visit): `--text-faint` (6.51:1). **No new hex.** |
| Form | A **corner tab** 28 px wide, notched into the top edge at the left (D1 (b)). **Class 1 is a solid 5 px tab; class 2 is a 2 px tab.** Shape and weight differ as well as hue (Carbon's two-of-three, D4 §2), and the **class word always leads the eyebrow**. |
| Colour-blind | Terracotta-ink and clay-ink are close for most CVD readers (D1 (b)). The tab's weight and the printed word carry the difference. |
| Dark mode | Documented only: the house sheet's dark inks, terracotta-ink `#E2A895` (7.72:1 on `#26221E`), clay-ink `#D8B98A` (8.44:1), and faint `#B8AEA2` (7.23:1). |
| Urgency | **In the tag.** That is B's question for the founders: may Desk colour ever mean urgency (D1 (e) "the question this seat adds")? |

**Layout.**
- **1440:** the header, the double rule, then three columns on `--doc-paper`, each opening with an eyebrow and closing on `--rule-mid`.
  - **Now:** about 480 px wide, at most five need cards, one-up, with acts.
  - **Waiting:** about 236 px, compact cards, oldest first.
  - **Coming back:** about 236 px, compact cards by day.
  - **No column sits on rail stock,** because a card edge fails there (D1 (b)).
  - Below the board, "Every job — show" folds the full ledger: one ruled row per live job, no tags, no count.
  - The scope switch sits on the Now eyebrow. In the studio's scope, Now cards carry holder words, and Waiting splits into "with clients and makers" and "with Jordan" / "with Leah".
- **390:** the columns stack in the same order, Now, then Waiting, then Coming back, each with its edge and eyebrow. There are no tabs or segmented control, because tab bars are refused (VISION §6). An act opened in a card fills the full 358 px. Five Now cards at about 150 px each come to about 1 screen; Waiting starts on the second.

**M1–M8.**

| # | Path under B | B: clicks (scroll 1440 / 390) | B: est. s 1440 / 390 | Today: clicks | Today: s |
|---|---|---|---|---|---|
| M1 | Now holds five cards; Waiting and Coming back sit beside it, so "what can wait" is visible at once at 1440 | 0 (0 / 1 screen to reach Waiting) | 4 / 8 | 0 | 8 / 14 |
| M2 | Linden's card (solid terracotta tab, "MONEY OR SIGNATURE") · Follow up opens in the card | 1 (0) | 4 / 5 | 1 (529 / 1,522 px) | 12 / 20 |
| M3 | Holloway's PO card (2 px clay tab) · Chase the maker opens in the card | 1 (0) | 4 / 5 | Leah: none | 20+ |
| M4 | Holloway's invoice card · Send reminder opens in the card; send is the named second control | 1 (0) + send | 3 / 4 | 1 (0) | 5 / 6 |
| M5 | Jordan's Now: the hand-off card first ("Leah handed you Marsh Street Kitchen on Saturday 10 October · Read her note"), then the PO card, "Draft the chase for Leah" | Whose 0 · Read 1 | 2 / 3 | Read 1; whose: a toggle | 4 / 5 |
| M6 | Press a card's name; Back returns to the same place | 1 + Back | 2 / 3 | 1 + 1,873 / 4,624 px | 8 / 15 |
| M7 | ＋ Record an inquiry · two fields · Create. The overlay closes onto the board; "Ainsley Moore · BRIEF · just now" joins Now if it ranks, otherwise heads Also yours in the folded ledger with a muted line on the board for the visit | 3 + 0 | 25 + 0 | 3, Back + 1,344 px | 25 + 10 |
| M8 | Now reads "Nothing more needs you today."; Waiting and Coming back are the close, side by side at 1440 | 3 to clear · 0 to read | about 10 / 4 to read | 3; not readable | about 10 / — |

**Calm, operable, glanceable.**

| | Today | B | Basis |
|---|---|---|---|
| **Calm** | 3 | **3** | **Marks at rest at the 1440 fold** (est.): ≈ 44 text · 12 controls · 6 colour (5 lit tabs + the clay ＋) · 14 edges (≈ 11 cards + 3 column rules). **Grading colour marks: 5. Every lit tab grades,** and on most mornings the top of Now is solid terracotta (D1 (e) System 2, "its honest weakness"). The most boxes of the three. |
| **Operable** | 2 | **5** | Every act is 1 press from rest and done inside its card, with no overlay to orient in. The close of day reads with 0 clicks. |
| **Glanceable** | 2 | **4** | At 1440 the three columns answer M1 and M8 in one look (about 4 s). At 390 Waiting is a screen down. Holloway as two cards reads as two jobs at a glance (D2 (b) "Gets wrong"). |

**Data or schema needs.** **No migration.**
- `NEED_CLASS` (`need-class.ts:23-56`), as it is.
- The deferred and set-aside lines returned by `deriveDaySheet` (fact 1), plus one meaning of waiting (fact 4).
- The act sheets (`acts/act-sheet-kind.ts:43-52`) rendered as **inline card bodies**: today they are overlay sheets, so each of the four kinds needs an inline host.
- The visit memory, the Set aside door and `record-payment`, as A.
- The ledger below the board is today's roster minus every need on the board.

**Canon reversals against BRIEF §6.**

| BRIEF §6 item | B |
|---|---|
| V18 Q1: the Desk is monochrome | **Reverses.** Class colour. |
| V18 Q1: no dots | Keeps. |
| V18 Q1: no badges | **Reverses, arguably.** A per-class marker is badge-adjacent, even as a bare shape (D1 (e) System 2). |
| V18 Q1: no overflow count | Keeps. |
| V18 Q1: at most five lines | Keeps, on the Now column. |
| V18 Q7: stage plates demoted to ink words | Keeps. Stage is an ink word. |
| V18 Q7: B carries urgency in ordering and words alone | **Reverses in full.** Urgency is the tag. |
| V18 / Direction C: R143 D3, the claim grid | **Reverses in part.** Need cards, in columns, not a job grid. |
| R143 D5, D6, D7 | Keeps superseded. |
| House :1011: no badges or count chips | **At risk** (the class tab). |
| House :1011: no tinted band behind a stage group | Keeps. The columns are untinted, and they group by day state, not stage. |
| House :54–57: `--card-edge` for claim cards only | **Extends** it to need cards in all three columns. |
| House :592: no pills, status dots or badges | **At risk.** The founders rule whether a shape on an edge is a status mark. |
| House :168: no shadows | Keeps. |

**Risks.**
- **Colour that grades every morning.** This is the one thing D5's two seats both refuse (A4: "red on everything late"; B4).
- **A job split across cards.** D2 (b): "Leah recognises jobs, not needs."
- **In-card acting** turns each act sheet into a second component. A card that grows reflows its column, which the 390 reader feels as the page moving.
- **It is the closest of the three to an inbox** (US-24 direction.md §4 "strongest argument against B"), with columns.

**Build size.** **6 slices, medium.** Fix-now; the model folds (as A, without job grouping); the board and columns; the class tab; in-card acting for four act kinds; the studio scope.

### Direction C: Studio colours

**In one line.** Every live job wears a studio-chosen colour that follows it onto the Document's letterhead and Field's job tile. The Desk is the day's five as a **focus strip** over a compact **wall** of every job.

**Header.** As B (D2 (d)). The wall's colours need no key in the header, because every card prints its name.

**Card anatomy.** Two units:
- **The focus strip:** at most five need lines in one ruled, full-measure strip under the header (the Day Sheet, re-laid).
  - Each line has a **3 px colour tick** in its job's colour, the name as a link, the sentence, the act and Not today.
  - The strip is boxed with `--card-edge`.
  - At 1440 the five lines run as one column of rows, each about 56 px.
- **The wall card** stands for **one live job**, compact, about 104 px tall:
  1. a 3 px **top band** in the job's colour, in place of the top edge (D1 (b) "suits job-level colour");
  2. the eyebrow: the stage word in ink · the holder word when not yours;
  3. the name, as a link (Playfair 18);
  4. one state line: today's head need in words ("Owed: send reminder", "Waiting on Fenmoor Joinery since today", "Back Tuesday 13 October", "At rest").
  - The wall card carries **no act**; acting is the strip's job.
  - A job on the strip shows "On today's strip" as its state line, so no act appears twice (G3).

**Tag system.**

| | |
|---|---|
| Means | **Which job,** by the studio's choice. Default assigned round-robin at creation, so the studio never has to choose (D1 (e) System 3); changeable in the job's settings. |
| Tokens | **Six new named tokens,** light and dark. Hues are spread 44–94° apart. Contrast is computed against `#FAF7F2` and `#2A2622`. |
| Form | The 3 px top band on wall cards; the 3 px tick on strip lines; **the same band across the top of the job's Document letterhead and down the left of its Field tile.** The name always prints. |
| Colour-blind | Six hues is D4 §2's ceiling (Carbon: five or six). Under deuteranopia, moss and ochre, and indigo and plum, will converge. The colour then **groups jobs; it never identifies one**, and the name does. D1 (b) makes the same point about 16 jobs on four colours. |
| Dark mode | The dark companions below, each ≥ 6.40:1 on `#2A2622`, documented only. |
| Urgency | Not in the tag. It lives in the strip's order and in the terracotta-ink overdue clause. |

```css
/* Direction C · proposed tokens (BRIEF §6: a new hex only as a named token) */
--job-1: #4F5B9E; /* indigo · hue 231 · 5.91:1 on #FAF7F2 */  --job-1-dark: #9AA6E6; /* 6.41:1 on #2A2622 */
--job-2: #2E7472; /* teal   · hue 178 · 5.09:1 */              --job-2-dark: #6FBDB9; /* 6.90:1 */
--job-3: #8E6410; /* ochre  · hue  40 · 4.94:1 */              --job-3-dark: #D9AE57; /* 7.25:1 */
--job-4: #7A4A86; /* plum   · hue 288 · 6.24:1 */              --job-4-dark: #C69AD2; /* 6.40:1 */
--job-5: #55722A; /* moss   · hue  84 · 5.14:1 */              --job-5-dark: #A2C07A; /* 7.40:1 */
--job-6: #A0466A; /* rose   · hue 336 · 5.49:1 */              --job-6-dark: #E496B4; /* 6.66:1 */
```

These hues are free only because C keeps V18 Q7: no stage pigment prints anywhere beside them. Ochre (40°) sits near the clay ＋ glyph (36°), and rose (336°) sits 36° from terracotta-ink. Both pairs are separated by role, not by hue, which is a residual risk.

**Layout.**
- **1440:**
  - the header and the double rule;
  - the **focus strip** (at most five lines, about 300 px), closing on `--rule-mid`;
  - the **wall**, eyebrow "EVERY JOB" with the scope switch, 4-up cards of about 232 px, sorted with yours first (by the strip's rank, then by stage), then with others, then coming back, then at rest. Sixteen jobs and the morning's inquiry make five rows, about 590 px, so the fold shows about two rows under the strip.
  - In the studio's scope the wall regroups under person eyebrows.
- **390:** the one-row header, then the strip as stacked lines (act and Not today on one row), then the wall **2-up** (171 px cards, name wrapping, never truncated): nine rows for seventeen cards, about 1,000 px.

**M1–M8.**

| # | Path under C | C: clicks (scroll 1440 / 390) | C: est. s 1440 / 390 | Today: clicks | Today: s |
|---|---|---|---|---|---|
| M1 | Read the strip (five lines), then glance at the wall for the rest | 0 (0 / 1 screen) | 5 / 9 | 0 | 8 / 14 |
| M2 | Strip line 2, Linden (teal tick) · Follow up opens the existing sheet | 1 (0) | 4 / 5 | 1 + scroll | 12 / 20 |
| M3 | Strip line 3, Holloway (indigo) · Chase the maker | 1 (0) | 4 / 5 | Leah: none | 20+ |
| M4 | Strip line 1, Holloway · Send reminder | 1 (0) | 4 / 5 | 1 | 5 / 6 |
| M5 | Jordan's strip: the hand-off first, then the PO. In the studio's scope the wall's "Jordan's" group holds Marsh Street (plum) and Wren Row Bath | Whose 0 · Read 1 | 2 / 3 | Read 1 | 4 / 5 |
| M6 | Press Holloway's wall card. The Document opens under an indigo letterhead band, so arrival is confirmed by colour; Back returns to the same place | 1 + Back | 2 / 3 | 1 + 1,873 / 4,624 px | 8 / 15 |
| M7 | Record the inquiry. The overlay closes onto the Desk; Ainsley Moore's new card appears at the wall's head of yours, in the next colour in turn, under her name | 3 + 0 | 25 + 0 | 3, Back + 1,344 px | 25 + 10 |
| M8 | The strip reads "Nothing more needs you today."; the wall's state lines answer waiting and coming back, but across sixteen cards | 3 to clear · 0 to read | about 10 / 8 to read | 3; not readable | about 10 / — |

**Calm, operable, glanceable.**

| | Today | C | Basis |
|---|---|---|---|
| **Calm** | 3 | **2** | **Marks at rest at the 1440 fold** (est.): ≈ 44 text · 12 controls · **14 colour** (≈ 8 wall bands at the fold + 5 strip ticks + the clay ＋) · 10 edges (8 cards + the strip box + 1 rule). The whole page carries 23 colour marks (17 bands in x1, 5 ticks, the ＋). **Grading colour marks: 0,** but it has the most colour of the three, a key a hire must learn, and a studio choice on every new job (against "the studio won't notice Patina"). |
| **Operable** | 2 | **4** | 1 press from rest for every moment; the wall is a one-click index into every job. Acts still open the overlay sheets. |
| **Glanceable** | 2 | **3** | M1's five lines read in ≈ 5 s, but M8 means scanning sixteen state lines. Colour helps only once the studio has learned which job is which colour, and at 390 the wall runs to ≈ 1,000 px. |

**Data or schema needs.** **A migration, and work in three codebases.**
- **`projects.colour`**: a `smallint` 1–6, or a token key, set at creation. That means a migration, a backfill for existing rows (round-robin by `created_at`), the generated types, and a studio-member update policy. The column does not exist today (BRIEF §7; checked against the `projects` Row in `packages/supabase/src/database.types.ts:21131`).
- The six tokens in `globals.css`, and their Swift mirror in the Capture app (`apps/mobile/Capture`) for Field's job tile.
- The Document letterhead reads the colour.
- An inquiry brief gets its colour when the brief is created (M7).
- The same model folds as A for the strip, plus a wall derivation: every live job once, with its head state line.

**Canon reversals against BRIEF §6.**

| BRIEF §6 item | C |
|---|---|
| V18 Q1: the Desk is monochrome | **Reverses**, most heavily. |
| V18 Q1: no dots | Keeps. Bands and ticks are edges. |
| V18 Q1: no badges | Keeps. |
| V18 Q1: no overflow count | Keeps. The wall shows every job, so there is no overflow to count. |
| V18 Q1: at most five lines | Keeps, on the focus strip. |
| V18 Q7: stage plates demoted to ink words | **Keeps, and depends on it.** |
| V18 Q7: B carries urgency in ordering and words alone | Reverses in part (the terracotta-ink clause), as A. |
| V18 / Direction C: R143 D3, the claim grid | **Reverses in full.** A card for every live job returns. Beyond BRIEF §6, it also reverses **R143 D10**, "a card is a treatment for NEED, not a container for a JOB" (`818db6e55 desk-claim-card.tsx:6`; D1 (e) System 3). |
| R143 D5, D6, D7 | Keeps superseded. |
| House :1011: no badges or count chips | Keeps. |
| House :1011: no tinted band behind a stage group | Keeps. The wall never groups or tints by colour. |
| House :54–57: `--card-edge` for claim cards only | **Extends** it to every job card and the strip. |
| House :592: no pills, status dots or badges | Keeps. |
| House :168: no shadows | Keeps. |
| BRIEF §6 "still binding": no new hex unless named | **Invokes it.** It adds `--job-1…6` and their dark twins. |

**Risks.**
- **Colour meaning is the studio's to learn**, which is D4 §4's "colour meaning left to every firm". Jordan in week two meets sixteen jobs in six colours, with no key.
- **A schema field and a habit,** for a Desk benefit that only pays off once Field and the Document carry it too.
- **The wall is the catalogue again** (US-24 A, "S1 not met"; D2 (f) Model 2), with a strip on top to rescue it.
- **The most colour on the page,** two days after a ruling that the Desk is monochrome.

**Build size.** **8 slices, large.** Fix-now; the model folds; the migration and backfill; the tokens and the setting; the strip; the wall; the Document letterhead; the Field tile (iOS, its own verification path).

### Side by side

| | A · Restored and tightened | B · The day board | C · Studio colours |
|---|---|---|---|
| Card stands for | A job, holding today's lines | One need | Every live job (plus the strip's lines) |
| Tag means | Stage | Need class (lit only while yours) | Which job, the studio's colour |
| Tag form | 3 px left rule; 2 px tick on rows | 28 px corner tab, 5 px or 2 px | 3 px top band; tick on strip lines |
| New tokens | 6 dark edge companions (documented) | none | 12 (`--job-1…6` light and dark) |
| Acting | Today's overlay sheets | Inside the card | Today's overlay sheets, from the strip |
| Header | D1: both creates, date to the eyebrow | D2: one create, date on the line | As B |
| Schema | none | none | `projects.colour` |
| Calm · Operable · Glanceable | 4 · 4 · 4 | 3 · 5 · 4 | 2 · 4 · 3 |
| Colour marks at the 1440 fold (measured on the specimen) | 13, 1 graded | 7, 6 graded | 15, 1 graded |
| V18 reversed | Q1 monochrome · Q7 in part | Q1 monochrome and badges (arguably) · Q7 clause 2 in full | Q1 monochrome · Q7 clause 2 in part |
| Slices | 5, small–medium | 6, medium | 8, large |

**Note on the colour-marks row (SQ-796).** The row was an estimate (A 9, none graded; B 6, 5 graded; C 14, none graded). It now carries counts measured on the specimens' at-rest frames, a1, b1 and c1, all with one DOM counter that follows WALK §0. The counter covers the first viewport of the frame's Desk and excludes the dock and the pins. A colour mark is text, a fill or a drawn border with HSL saturation above 0.25, and the paper stocks (lightness above 0.9) count as ground. `capture.js` is not in the repo, so the counter is an approximation, but it reproduces SQ-793's a1 count exactly.
- **Full marks at the 1440 fold** (text · controls · colour · edges): A 41 · 19 · 13 · 11; B 67 · 20 · 7 · 18; C 67 · 25 · 15 · 17. Today is 45 · 18 · 9 · 12.
- **At 390** (frames a8, b8 and c8): A 29 · 14 · 9 · 6; B 32 · 14 · 6 · 7; C 42 · 19 · 9 · 10. Today is 25 · 9 · 4 · 8.
- **What the colour marks are:**
  - A: four stage rules, one ledger stage tick, the terracotta clause and the clay underline on the primary act, plus the two clay ＋ glyphs and the two ornaments, which the counter scores as two marks each.
  - B: five lit tabs, the clause and the ＋.
  - C: five strip ticks, eight wall bands, the clause and the ＋.
- **"Graded"** counts every mark that says how urgent something is. All three directions keep the terracotta overdue clause, so each scores at least 1, including C, which the estimate had scored at 0.
- **Which direction is calmest does not change.** A has the fewest marks in total at 1440 (84, against B's 112 and C's 124). At 390, A and B are level (58 and 59), and C has 80. B still has the fewest colour marks, but six of its seven grade. A's colour count is higher than estimated: 13, close to C's 15. The Calm scores above are the synthesis's and were not re-scored.

---

## 4. The recommendation: Direction A, Restored and tightened

**A, built in the order of §6.**

**Why A.**
- **It answers all three of Kody's objections directly:**
  - a one-line header with no tips;
  - edges, with the cards boxed, sections closing on full-measure rules, and the ledger ruled;
  - cards with little colour tags that orient rather than alarm.
- **It is where the seats already converged.** D1 recommends its tag (System 1), D2 its structure (Model 1), and D5's simulated Leah asks for exactly this mark ("the job's address, not its temperature").
- **It keeps every V18 guard Leah's trust rests on.** Five lines, no overflow count, no dots, no badges, no "cleared today", nothing pushed. It reverses only the monochrome clause and part of Q7.
- **It spends no new hex on the light Desk and needs no migration.**
- **It ends the duplication** that W1 ranks as the worst finding.

**Why not B.** B is the most operable, and acting inside the card is a real idea. But it spends colour on urgency every morning, which is the one thing both seats refuse (D5 A4, B4). It splits Holloway into two cards. And it turns four act sheets into inline components for a gain of about one second per act (M4: 4 s → 3 s). **Its best idea survives under A** as a later question: once A ships, does an act read better inside its card? Its columns' honesty (Waiting and Coming back always shown) is already in A's ledger.

**Why not C.** C is the only direction whose colour pays off beyond the Desk (M6 off the Desk, and Field). But it costs a schema field, a studio habit, a colour-to-job key for a week-two hire to learn, and the most colour on screen. Its wall is the old catalogue. **Park the project colour** as a side journey (VISION-DECISIONS) and revisit it when Field needs cross-surface job identity, with the token set above as the starting point.

**The strongest argument against A.** It is the least new. A founder could fairly say it is today's Desk with boxes and the old plates' colour turned into a 3 px rule. Its answer to "a true place to operate your day from" relies on the ledger's groups being right, and on acts that still open a sheet over the page. If the founders read Kody's "operate your day from" as acting on the card itself, B's in-card acting is the piece to take, not B's colour.

---

## 5. Fix-now track

These ship under any direction, need no ruling beyond BRIEF §6, and need no migration.

| # | Defect | Where | Fix | Source |
|---|---|---|---|---|
| F1 | **The header tips.** Two baselines, tips that read as acts, three underline weights; 203 px at 390, and "DIRECT PROJECT SETUP" ends at x = 383, breaking the gutter. | `desk/page.tsx:448-529`; tip spans `:493-497`, `:510-514`; constants `:71-76`; `STUDIO_VERBS` `registry.tsx:264`, `:277` | Delete the two sub-label spans and their constants. The words stay in `STUDIO_VERBS`, where ⌘K and Desk Contents print them as row descriptions. Put the header on one baseline with two underline weights, and ⌘K on the baseline. At 390, keep everything inside the 16 px gutter. **Which acts stay is Q7.** | WALK §1a, finding 3; D1 (c); D2 (d); D3 §3 |
| F2 | **Section edges.** Every section is transparent; the sheet's head rule runs 232→1208 but its row hairlines stop at 1183; the workload's first ink rule reads as the sheet's closing rule. | `globals.css:575-644`; `day-sheet.tsx:204-211`; `desk-roster.tsx:55-65` | **Full measure** for every rule. **Every section closes on `--rule-mid`.** The double rule opens the day under the header. Use one eyebrow system (ornament, mono 12 caps name, controls right-aligned on its baseline). Spacing on the 24 px module: 48 / 72 / 24 / 12. | WALK §1b-1, §1b-2; D1 (d); D3 §3 |
| F3 | **The lone sheet line.** A one-line sheet (Kody's screenshot) floats between its head and the footer, and its job name opens nothing. | `day-sheet.tsx:121-170` | **Make the job name a link on every sheet line.** Give the line its full-measure rules. At 390, Not today shares the act's row when it fits (today it always takes its own row). | BRIEF §1 screenshot; WALK finding 2, §1b-5, M6; D1 (a) |
| F4 | **The footer copy.** "*The rest are on their projects.*" floats after the last hairline and captions the workload. The quiet sheet says "No current action alerts." over an owed row. "Coming back" never renders. | `day-sheet.tsx:280`; `desk-ledger-row.tsx:20`; `day-sheet.tsx:250`, `:264`; `day-sheet.ts:149` | Move the footer line above the sheet's closing rule. Replace the quiet-state sentence with "Nothing more needs you today." **Always render Waiting on and Coming back,** fed by the deferred lines `deriveDaySheet` drops today. | WALK §1c, finding 4; D1 (d); D2 §0 fact 1; D3 §3 "Floating footer"; D5 B5.3 |
| F5 | **The same need twice.** Holloway's second SEND REMINDER is about 1,950 px down. | `desk-roster.tsx` row act | Until a direction's structure removes the duplicate, a roster row whose need is on the sheet prints "On today's sheet" in place of its act. | WALK §1b-3, finding 1; D1 (d) |
| F6 | **Back loses the place.** It returns to 96 px / 868 px, not to 1,873 / 4,624 px. | `/desk` scroll restoration | Restore the Desk's scroll offset on Back. | WALK M6; D2 M6; D3 H3 |
| F7 | **A new inquiry lands as "Consultation".** | lead naming on the roster | Title the lead by the person ("Ainsley Moore"); keep the summary as its sentence. | WALK finding 5, M7; D2 M7 |
| F8 | **The dock label truncates at 390** ("Studio overv…"), and the TESTER pill sits on it. | the dock's `truncate` class | Wrap, never truncate. Move the TESTER pill off the label. | WALK §1c; D5 B2 |

---

## 6. Slices (Direction A)

Each slice pays off alone.

| Slice | What ships | Needs | Why here |
|---|---|---|---|
| **0: Fix-now** | F1–F8 | Q7 for F1's acts | Kody's complaints 1 and 2 are answered before any card returns |
| **1: The model folds** | `groupSheetByJob`; the roster excludes sheet jobs; deferred and set-aside lines returned; one meaning of "with others"; the visit memory with no refill | Q6 | The cards cannot be honest over a model that repeats needs and hides what comes back |
| **2: Today cards and the ledger** | Job cards with the stage left rule, holder and freshness words, terracotta-ink overdue clause; the grouped ledger (Also yours · With others · Coming back · At rest) with 2 px stage ticks; `--card-edge` on Today cards | Q1, Q2, Q3, Q4, Q5 | Kody's complaint 3, the cards and the tags |
| **3: Acting** | Settled lines with Undo; the Set aside door; the `record-payment` scoped sheet; the inquiry overlay closing onto the Desk | Q9, Q10, Q11 | Operate the day from the Desk, on the first-dollar stream |
| **4: The studio's scope** | Holder words on every card and row; rows regroup by person; "By team member" retires; a teammate's acted state, if Q8 allows | Q8 | Jordan's week two and Leah's 4 pm |
| (doc only) | The six dark `--tab-*-edge` companions recorded in the house sheet | Q13 | No dark paper set ships |

B would replace slices 2–3 with four (the board, the class tab, inline act hosts for four kinds, the columns at 390). C would add the migration, the tokens and setting, the wall, the letterhead and the Field tile: about three more than A.

---

## 7. Founder questions

Decide Q1–Q4 first: they choose the direction. The rest can follow the fix-now track.

| # | Question | Recommended answer | If declined |
|---|---|---|---|
| Q1 | **Reverse V18 Q1's "the Desk is monochrome"?** The guard's other clauses are: at most five lines, no overflow count, no dots or badges, no "cleared today", nothing pushed. | **Yes, for orientation colour only.** Keep every other Q1 guard, word for word. Record it as a V-entry amending V18 Q1: "Colour on the Desk orients; it never grades, counts or nags." | The cards return without colour (edges only), which answers complaints 1 and 2 but not "little color tags". |
| Q2 | **What should the colour tag mean?** Stage (A), need class (B), the studio's job colour (C), or whose move (in words in all three). | **Stage.** It is the job's address: Leah sorts jobs that way already, the old plates proved it scans (WALK §4), it needs no data, and it is system-assigned, so no one learns a key. **Whose move stays in words** ("Jordan's", "Waiting on Fenmoor Joinery since today"). | Need class: B's tab, and Q3's second clause reversed in full. Job colour: C's migration (Q12). |
| Q3 | **Reverse V18 Q7?** Q7 demoted stage plates to ink words, and B carried urgency in order and words alone. | **In part.** Stage colour returns as a 3 px edge rule, **never a plate**; the stage word stays ink. Urgency stays in order and words, and only the overdue clause prints in terracotta-ink. No mark grades. | Under a full keep, stage stays a grey word ("a grey word I skip", D5 B3, simulated) and the tag has nothing to say. |
| Q4 | **What does a Desk card stand for?** A job holding today's lines (A), one need (B), or every job (C). | **A job, holding today's lines.** Leah recognises jobs, not needs (D2 (b)); one name in one place; the five-line guard stays literal. | One need: Holloway as two cards. Every job: the catalogue (32 cards, 5,819 px, WALK §4). |
| Q5 | **May `--card-edge` box more than claim cards?** House sheet :55–57 says "Claim cards ONLY". | **Yes, for the Desk's Today cards.** They are the claim cards' successors, and the edge is the only 3:1 boundary there is (D1 (b)). Do not extend it to rail stock, where it fails (2.62:1). | The cards take a hairline that fails WCAG 1.4.11, or no edge, which is today's bleed. |
| Q6 | **After an act, does the line stay put for the visit, and does the slot stay empty?** Today the sixth need fills the gap at once (`day-sheet.ts:158`). | **Yes to both.** The line settles in muted ink as its new state, with Undo for Not today and Set aside; on the next open it moves to its group. "Each defer deals a fresh card" is the engagement loop VISION refuses (D2 (c)). | The sheet refills as it is cleared and can never be finished. |
| Q7 | **Which acts stay in the header?** D1 keeps both creates and moves the date to the Today eyebrow; D2 moves Create a project file to ⌘K and keeps the date on the line. | **Keep both creates** (A's header). Kody objected to the tips, not the acts. R79 made Create a project file a deliberate quiet act. D5 A5.1 (simulated Leah) wants all three "once each". The **390 short labels** ("＋ Inquiry", "＋ Project") go to the Direction C labeling owner for sign-off (V18). | D2's header in A: one create, date on the line. Same fix-now cost. |
| Q8 | **In the studio's scope, may Leah read a teammate's acted state** ("Jordan chased this, 9:30")? Need state is per person today; `select_own` (00765:45-47). | **Yes, read-only, as a fact on the job:** who acted and when. Never a pace, a count, or "how fast". It needs a studio-member select policy, which is its own migration and its own review. | Leah may chase PO-MS-0388 twice (D2 §0 fact 3), and the studio's scope cannot show "with Jordan". |
| Q9 | **Give Set aside a door?** Q6 allowed a dated set-aside with a reason; the RPC branch exists (00765:160), but nothing writes it. | **Yes.** It is a second choice on Not today: "Not today · Until…", with a date and a reason. It is never counted and is shown under Coming back with its day. | Chen-like holds return every working day, or are hidden. |
| Q10 | **Record the payment as a sheet scoped to one invoice?** Today it opens the whole Accounts ledger (`day-sheet.tsx:109-112`). | **Yes.** It is the first dollar. A one-record sheet with the amount, the date and a named "Record $3,400" control. A hire's view follows V18 Q10/Q11 (no studio totals; release only where `viewerCanRelease`). | M4's "record" half keeps a ledger search. |
| Q11 | **After Record an inquiry, close onto the Desk rather than into the new brief?** | **Yes.** The overlay closes onto the Desk with a muted line for the visit ("Ainsley Moore recorded · just now · Open the brief"), and the lead is named by the person. | Seeing it land costs Back plus a 1,344 px scroll (WALK M7). |
| Q12 | **Add a project colour column** (`projects.colour`) and carry it to the Document and Field (Direction C)? | **Not now.** Park it in VISION-DECISIONS as a side journey, with C's six tokens as its starting point. Revisit when Field needs cross-surface job identity. | C's migration, backfill, setting, letterhead and Field tile: about three slices more than A. |
| Q13 | **Dark mode:** document the Desk's dark values, or ship a dark paper set? | **Document only.** Record the six `--tab-*-edge` companions in the house sheet beside `--card-edge`'s dark twin. The portal paints no dark set (`globals.css:56`), and starting one is a separate story. | A dark Desk on its own would be the only dark page in the portal. |
| Q14 | **May Desk colour ever mean urgency?** This is D1's question, and B's premise. | **No.** Colour orients; order and words carry urgency; terracotta-ink appears only on an overdue clause. Both seats refuse a colour that grades (D5 A4, B4). | B's class tab; the founders also rule the house sheet :592 / :1011 "at risk" items. |

---

## 8. Asks for real studio validation

The specimens are static illustrations. They prove nothing about time or trust.
- **The stage edge at 8am.** Show Leah A's Today cards on her own jobs. Does the colour tell her where each job lives, or does she read it as something to fix?
- **Stage against whose move.** Ask the person closest to the first-hire seat which they need from a colour in week two. The D5 split is a reviewer's guess.
- **The 390 short labels.** "＋ Inquiry" and "＋ Project": are they Leah's words?
- **The settled line.** Does a line that stays put after an act read as done, or as still owed?
- **Studio colours.** Would Leah choose a colour per job, or ignore the setting? That decides whether C's habit is real.
