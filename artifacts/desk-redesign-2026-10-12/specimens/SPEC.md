# US-26 specimens: build spec and gate

**12 October 2026 · SQ-792.** This spec tells the specimen builders what to draw for each of the three Desk directions in `../synthesis/direction.md` §3, and how `check.mjs` will judge it.

There are six files, two per direction: one at 1440 and one at 390. Each frame sets the proposed Desk beside today's Desk from `../walk/`, for the same moment.

Specimens are **static illustrations**. They prove nothing about time or trust (direction.md §8). Every click and second figure printed on them is an estimate from direction.md §3, labelled "est.".

## 1. Frame table

`check.mjs` reads this table, so keep its rows exactly in this format. Only these three lines may start with `| **`.

A frame's short id is `a1` … `c13`. Its anchor is `frame-a1` … `frame-c13`. Each file carries the anchor as `data-frame="frame-a1"`, and `#frame-a1` in the URL shows that frame alone (§5).

| Direction | Files | 1440 frames | 390 frames |
|---|---|---|---|
| **A, Restored and tightened** | `artifacts/desk-redesign-2026-10-12/specimens/proposed-a-1440.html`<br>`…/specimens/proposed-a-390.html` | `frame-a1` … `frame-a7` | `frame-a8` … `frame-a13` |
| **B, The day board** | `artifacts/desk-redesign-2026-10-12/specimens/proposed-b-1440.html`<br>`…/specimens/proposed-b-390.html` | `frame-b1` … `frame-b7` | `frame-b8` … `frame-b13` |
| **C, Studio colours** | `artifacts/desk-redesign-2026-10-12/specimens/proposed-c-1440.html`<br>`…/specimens/proposed-c-390.html` | `frame-c1` … `frame-c7` | `frame-c8` … `frame-c13` |

Each direction has seven frames at 1440 and six at 390. In every direction:
- frame 1 is the Desk at rest;
- frames 2 and 3 are acting on a card (during and after);
- frame 5 is Jordan's view;
- frame 6 is the close of day;
- frame 7 is dark mode;
- frames 8–13 are the 390 equivalents of 1, 2, 3, 5, 6 and 7.

## 2. Frames

### 2.1 The pairing table

Frame `xN` means `frame-aN`, `frame-bN` and `frame-cN`. Every direction draws the same moment, so the three can be compared directly.

**Today** is the walk screenshot shown under the proposal. It is referenced as `../walk/<file>`. `check.mjs` checks that the file exists in `../walk/` and that the page references it.

| Frame | Width | Moment | Today | What the frame shows |
|---|---|---|---|---|
| x1 | 1440 | M1 | `today-leah-studio-fold-1440.jpg` | **At rest.** Leah opens the Desk, Monday 12 October, 8:40 am, in the studio's scope |
| x2 | 1440 | M4 | `m4-holloway-reminder-1440.jpg` | **Acting, during.** 8:41, Mine: Leah presses Send reminder on Holloway Den's invoice; the reminder is open, nothing sent |
| x3 | 1440 | M4, M3 | `today-leah-mine-fold-1440.jpg` | **Acting, after.** 8:48, Mine: the reminder sent at 8:42 and Fenmoor chased at 8:47; both lines settled in place, slots not refilled |
| x4 | 1440 | M7 | `m7-inquiry-landed-1440.jpg` | 11:21, Mine: Leah recorded Ainsley Moore's inquiry at 11:20, and sees it land under her name |
| x5 | 1440 | M5 | `today-jordan-mine-fold-1440.jpg` | **Jordan's view.** 8:55, Jordan Reyes, Mine: the hand-off first |
| x6 | 1440 | M8 | `today-jordan-quiet-fold-1440.jpg` | **Close of day.** 5:50 pm, Leah, Mine: what waits on others, what comes back. Today's only quiet capture is Jordan's |
| x7 | 1440 | M1 | `today-leah-dark-probe-fold-1440.jpg` | **Dark mode.** x1 in the documented dark set. Today has no dark mode: the probe paints cream (WALK §0) |
| x8 | 390 | M1 | `today-leah-studio-fold-390.jpg` | x1 on Leah's phone |
| x9 | 390 | M4 | `m4-holloway-reminder-390.jpg` | x2 on the phone |
| x10 | 390 | M4, M3 | `today-leah-mine-fold-390.jpg` | x3 on the phone |
| x11 | 390 | M5 | `today-jordan-mine-fold-390.jpg` | x5 on Jordan's phone |
| x12 | 390 | M8 | `today-jordan-quiet-fold-390.jpg` | x6 on the phone |
| x13 | 390 | M1 | `today-leah-mine-fold-390.jpg` | x7 on the phone. There is no 390 dark probe, so today's light fold stands in |

### 2.2 What each frame shows, per direction

The wording on a frame is the team's guess, pending Leah's words (direction.md §8). Use the fixture's names, amounts and times exactly (§3).

**x1 / x8, at rest, 8:40, the studio's scope.**
- The header is the direction's own (direction.md §3).
- The scope switch reads "Mine · **The studio's**".
- The studio's five, in rank order (§3):
  1. Holloway invoice;
  2. Linden decline;
  3. Holloway PO;
  4. Marsh Street PO (Jordan's);
  5. Pell Court release.
- **A:**
  - Today holds **four job cards**:
    - Holloway Den carries two lines, the invoice and the PO, with "$3,800 overdue" as a terracotta-ink clause;
    - Linden Place;
    - Marsh Street Kitchen, with "JORDAN'S" in its eyebrow;
    - Pell Court Dining.
  - Each card has its stage on a 3 px left rule, with the stage word in ink.
  - Under Today's closing rule, the ledger regroups by person:
    - **Leah's:** Also yours (Ines Calder "6:35 AM", Thornfield); With others (Mae Halloran, the Whitfields, Aldous Lane); Coming back (Chen, Friday 16 October; Garnet Hill, Monday 19 October); At rest — show.
    - **Jordan's:** Marsh Street hand-off, "with Jordan since Saturday"; Wren Row Bath.
  - Each row has a 2 px stage tick.
  - At 390: the two-row header, then the Holloway and Linden cards; the rest is below the fold.
- **B:**
  - **Now** holds five need cards:
    - Holloway invoice: 5 px terracotta tab, "MONEY OR SIGNATURE";
    - Linden: 5 px terracotta tab;
    - Holloway PO: 2 px clay tab, "NEEDS YOU";
    - Marsh PO: 2 px clay tab, "JORDAN'S";
    - Pell Court: 2 px clay tab.
  - **Waiting**, in the studio's scope, is split. *With clients and makers:* Mae Halloran since Tuesday 6 October; the Whitfields since Friday 9 October; Calloway & Brandt Upholstery, delivering to Aldous Lane on Thursday 15 October. *With Jordan:* Marsh Street hand-off since Saturday.
  - **Coming back:** Chen, Friday 16 October; Garnet Hill, Monday 19 October.
  - Waiting and Coming back tabs are faint.
  - "Every job — show" is folded.
  - At 390: the Now column's first three cards.
- **C:**
  - The **focus strip** holds the five lines. Each has its job's colour tick: Holloway indigo ×2, Linden teal, Marsh plum, Pell Court ochre.
  - The **wall** is grouped "Leah's" (15 cards, including the Ines Calder lead) and "Jordan's" (Marsh Street, Wren Row Bath). Each card has its 3 px band, its stage word in ink, and one state line.
  - Jobs on the strip read "On today's strip".
  - At 390: the strip, then the wall's first row, 2-up.

**x2 / x9, acting, during, 8:41, Mine.**
- Leah has switched to Mine. Her five are:
  1. Holloway invoice;
  2. Linden;
  3. Holloway PO;
  4. Pell Court;
  5. Ines Calder.
- The reminder to Nora and Sam Holloway is open, scoped to INV-2026-0721:
  - the facts: $3,800, due Monday 28 September, 14 days overdue;
  - the draft to review;
  - **"Send to Nora and Sam Holloway"** as a named second control, with "Put back".
  - Nothing is sent.
- **A and C:** today's reminder sheet, over the Desk.
- **B:** the Holloway invoice card has grown in place to hold the draft and the send control. The other Now cards reflow below it, and Waiting and Coming back do not move.
- At 390: the opened reminder fills the width. The act and its reason sit together.

**x3 / x10, acting, after, 8:48, Mine.**
- **The line that was acted on stays where it was, in muted ink, as its new state**, and **no slot is refilled**.
- The settled lines:
  - "Reminder sent · waiting on Nora and Sam Holloway since 8:42";
  - "Chase sent · waiting on Fenmoor Joinery since 8:47".
- There is no ✓, no count and no "cleared".
- **A:** both settled lines sit on the Holloway card, and the card's act feet are gone. Linden, Pell Court and Ines Calder keep their acts.
- **B:** the two Holloway cards are settled in Now, with their tabs dropped to faint. Their slots stay empty. They move to Waiting on the next open, never during the visit.
- **C:** both strip lines are settled with their indigo ticks. The Holloway wall card reads "Waiting on the Holloways and Fenmoor Joinery".
- At 390: the same, for the first two lines.

**x4, 11:21, Mine (M7).**
- Since 8:48, Leah has followed up Linden (9:05), released both Pell Court orders (9:12) and replied to Ines Calder (9:20).
- She recorded Ainsley Moore at 11:20. The overlay closed **onto the Desk**, with a muted line for the visit: "Ainsley Moore recorded · just now · Open the brief".
- Today now holds:
  - Thornfield: "the Ashbys signed on Friday · Open the project";
  - Ainsley Moore: "BRIEF · JUST NOW · called about a primary bedroom, budget $25–35k · Reply".
- **A:** two cards: Thornfield (proposal rule) and Ainsley Moore (brief rule).
- **B:** two Now cards. Waiting lists the five people and makers acted on this morning, each "since today".
- **C:** two strip lines. Ainsley Moore's new wall card heads Leah's group in rose (`--job-6`, the next colour in turn).

**x5 / x11, Jordan's view, 8:55, Mine.**
- Jordan's three lines, the hand-off first:
  1. "Leah handed you Marsh Street Kitchen on Saturday 10 October · Read her note";
  2. "Ninebark Lighting has not answered PO-MS-0388 ($2,180) in 4 days. Leah's note asks to see anything in writing first. · **Draft the chase for Leah**";
  3. "Priya and Dev Anand signed the Wren Row Bath design services agreement ($6,500) on Saturday · Open the project".
- Then: "The rest of the studio's jobs are Leah's", with "The studio's" one press away.
- **No studio money totals** anywhere (V18 Q10).
- **A:** two cards. Marsh Street (project rule) holds the hand-off line above the PO line; Wren Row Bath has a proposal rule.
- **B:** three Now cards. The hand-off and the PO have 2 px clay tabs; Wren Row has a 2 px clay tab. Waiting reads "Nothing waiting on others."; Coming back reads "Nothing coming back."
- **C:** three strip lines (Marsh plum ×2, Wren Row ochre); the wall holds Jordan's two jobs.

**x6 / x12, close of day, 5:50 pm, Leah, Mine.**
- Today reads **"Nothing more needs you today."**
- **With others**, with dates:
  - Nora and Sam Holloway, since today;
  - Fenmoor Joinery, since today (PO sent Wednesday 30 September);
  - Tom and Ellery Vance, since today;
  - Calloway & Brandt Upholstery and Ninebark Lighting, since today;
  - Ines Calder, since today;
  - Ainsley Moore, since today;
  - Mae Halloran, the samples, since Tuesday 6 October;
  - Hal and Dana Whitfield, the palettes, since Friday 9 October;
  - Calloway & Brandt Upholstery, delivering to Aldous Lane on Thursday 15 October.
- **Coming back:**
  - Thornfield, Tuesday 13 October (Not today, 4:15 pm);
  - Chen Residence, Friday 16 October, "waiting on the Chens' bench decision";
  - Garnet Hill, Monday 19 October, "the Okafors are travelling; call after the 18th".
- At rest is folded.
- **No "moved today" list, no "cleared", no count** (V18 Q1). What moved reads only as "since today".
- **A:** the empty Today box, then the ledger's With others and Coming back groups.
- **B:** Now's sentence, beside full Waiting and Coming back columns.
- **C:** the strip's sentence, then the wall, whose state lines carry the same facts.

**x7 / x13, dark mode.**
- x1 (or x8) in the house sheet's documented dark set (`docs/design/house-sheet/SPEC.md:89-108`), with `--card-edge #77736E`.
- **A:** the six `--tab-*-edge` companions (direction.md §3 A).
- **B:** the dark inks: terracotta `#E2A895`, clay `#D8B98A`, faint `#B8AEA2`.
- **C:** `--job-*-dark`.
- Each frame says "Documented, not shipped: the portal paints no dark paper set".

### 2.3 Every frame

- **Proposed canvas:** 1440 × 900, or 390 × 844, inside the `data-frame="frame-xN"` element.
- **Caption:** the frame id, the moment, what it shows, and the estimated clicks and seconds from direction.md §3, marked "est.".
- **Today figure** under the canvas: `<img src="../walk/<today>" alt="…">`. Its alt text names what today's screen shows. `&nobefore` hides it.
- **Pins:** up to four numbered annotation pins, naming what changed and why. Each cites a source id (for example "WALK §1b-3", "D2 (c)", "F3"). `&nopins` hides them. A pin never sits over the text it explains.
- **Fixture notice:** a small "Illustrative fixture · not a real studio" line in the frame's foot.

## 3. Fixture: Hartwell Studio [illustrative]

These names are invented. It extends US-24 `specimens/SPEC.md` §3.
- No real client, maker or company appears, and none may be added.
- D5 B2's simulated Jordan names a real furniture maker for Marsh Street's PO. The fixture keeps US-24's invented **Ninebark Lighting**.
- The walk's artefact rows (Chen at 153 days, "Walk · Release to invoice", Tanaka, Okafor Terrace, the "Full Room" briefs; WALK §2) are **not** in this fixture.

**The studio:**
- Hartwell Studio: 16 live jobs, plus two inquiries by the end of the day.
- Owner: Leah Hartwell (LH).
- Hire: Jordan Reyes (JR), in week two. Leah handed him Marsh Street Kitchen on **Saturday 10 October 2026**.
- **Today:** Monday 12 October 2026. The Desk landing is at 8:40 am, and the close of the day is at 5:50 pm.
- Times are in the studio's local time.

### 3.1 The jobs

The C colours are assigned round-robin by creation order (direction.md §3 C). A and B never print them.

| Job | Client | Stage | Lead | C colour | The fact on Monday 8:40 am |
|---|---|---|---|---|---|
| Holloway Den | Nora and Sam Holloway | Project | Leah | `--job-1` indigo | INV-2026-0721, **$3,800**, due Mon 28 Sep, **14 days overdue** (class 1). And PO-HD-0412 to **Fenmoor Joinery**, **$11,450** (built-in bench and bookcase), sent Wed 30 Sep, **no answer in 12 days** (class 2) |
| Linden Place Living Room | Tom and Ellery Vance | Proposal | Leah | `--job-2` teal | Declined Sun 11 Oct: "The sofa is over budget; can we see a second option under $6,000?" (class 1) |
| Pell Court Dining | Rosalind Fairweather | Project | Leah | `--job-3` ochre | Signed Sun 11 Oct; deposit **$9,200** paid Mon 6:10 am. Release the order: PO-PC-0431 to **Calloway & Brandt Upholstery** ($14,600), PO-PC-0432 to **Ninebark Lighting** ($3,950) (class 2) |
| Marsh Street Kitchen | the Brannigans | Project | **Jordan** | `--job-4` plum | Handed to Jordan Sat 10 Oct (class 2, hand-off). PO-MS-0388 to **Ninebark Lighting**, **$2,180**, sent Thu 8 Oct, no answer in 4 days (class 2) |
| Thornfield | the Ashbys | Proposal | Leah | `--job-5` moss | Proposal **$48,200** signed Fri 9 Oct, before a project exists · Open the project (class 2) |
| Halloran Library | Mae Halloran | Direction | Leah | `--job-6` rose | Fabric samples sent Tue 6 Oct, not yet opened · waiting on the client |
| Chen Residence | the Chens | Install | Leah | `--job-1` indigo | Balance to Calloway & Brandt, **$3,400**, on hold; set aside Fri 9 Oct until **Fri 16 Oct**, "waiting on the Chens' bench decision" |
| Garnet Hill | the Okafors | Proposal | Leah | `--job-2` teal | Declined Thu 8 Oct, "postponing until spring"; set aside until **Mon 19 Oct**, "the Okafors are travelling; call after the 18th" |
| Wren Row Bath | Priya and Dev Anand | Proposal | **Jordan** | `--job-3` ochre | Design services agreement **$6,500** signed Sat 10 Oct · Open the project (class 2) |
| Aldous Lane | Marguerite Osei | Install | Leah | `--job-4` plum | Calloway & Brandt delivering Thu 15 Oct · with the maker |
| Copperfield Terrace | Hal and Dana Whitfield | Direction | Leah | `--job-5` moss | Two palettes sent Fri 9 Oct · waiting on the client |
| Brierley Mews | the Lindqvists | Discovery | Leah | `--job-6` rose | At rest |
| Dunmore Road | Felix Arden | Project | Leah | `--job-1` indigo | At rest |
| Elm Quay | the Moraleses | Discovery | Leah | `--job-2` teal | At rest |
| Fairlight Close | June Pak | Direction | Leah | `--job-3` ochre | At rest |
| Greaves Court Bath | the Bellamys | Install (Care) | Leah | `--job-4` plum | At rest; everything read, nothing open |
| Ines Calder (inquiry) | Ines Calder | Brief | Leah | `--job-5` moss | Web inquiry at **6:35 am**: living room, budget $40–60k, "We just moved in and the living room is empty except for a piano." · Reply (class 2) |
| Ainsley Moore (inquiry) | Ainsley Moore | Brief | Leah | `--job-6` rose | **Recorded by Leah at 11:20 am** after a phone call at 11:05: primary bedroom, budget $25–35k · Reply (class 2) |

On a full day, **11 jobs and 2 inquiries** reach the Desk's top or its With others and Coming back groups. The jobs are Holloway, Linden, Pell Court, Marsh Street, Thornfield, Halloran, Chen, Garnet Hill, Wren Row, Aldous Lane and Copperfield; the inquiries are Ines Calder and Ainsley Moore, who arrives at 11:20. The other five jobs are at rest.

### 3.2 The rank at 8:40 am

The rank is V18 Q3's: class, then deadline, then age. A hand-off prints first on its own job.

| # | Leah, Mine | The studio's | Jordan, Mine (8:55) |
|---|---|---|---|
| 1 | Holloway · INV-2026-0721 · Send reminder | Holloway · INV-2026-0721 (Leah's) | Marsh Street · hand-off · Read her note |
| 2 | Linden · declined · Follow up | Linden · declined (Leah's) | Marsh Street · PO-MS-0388 · Draft the chase for Leah |
| 3 | Holloway · PO-HD-0412 · Chase the maker | Holloway · PO-HD-0412 (Leah's) | Wren Row Bath · signed · Open the project |
| 4 | Pell Court · deposit in · Release the order | Marsh Street · PO-MS-0388 (Jordan's) | — |
| 5 | Ines Calder · wrote at 6:35 am · Reply | Pell Court · deposit in (Leah's) | — |
| beyond five | Thornfield (Also yours) | Ines Calder, Thornfield (Leah's); Marsh hand-off, Wren Row (Jordan's) | — |

Leah's hand-off note to Jordan, an **illustrative fixture line**: "Marsh Street is yours. The Brannigans like a call before anything is ordered; ask me before anything goes out in writing." Because it covers anything in writing, the Marsh PO chase is **"Draft the chase for Leah"**, saved for Leah with "Leah sees this first", in every direction (V18 Q11). It never sends.

### 3.3 The day

| Time | Who | What | The line then reads |
|---|---|---|---|
| 8:40 | Leah | Opens the Desk in the studio's scope (x1) | — |
| 8:41 | Leah | Switches to Mine; opens Send reminder on Holloway (x2) | — |
| 8:42 | Leah | Sends the reminder to Nora and Sam Holloway | "Reminder sent · waiting on Nora and Sam Holloway since 8:42" |
| 8:47 | Leah | Chases Fenmoor Joinery on PO-HD-0412 | "Chase sent · waiting on Fenmoor Joinery since 8:47" (x3 at 8:48) |
| 8:55 | Jordan | Opens his Desk (x5) | — |
| 9:00 | Jordan | Reads Leah's note | the hand-off line clears |
| 9:05 | Leah | Follows up Linden with Tom and Ellery Vance | "Follow-up sent · waiting on Tom and Ellery Vance since 9:05" |
| 9:12 | Leah | Releases PO-PC-0431 and PO-PC-0432 | "Orders released · waiting on Calloway & Brandt Upholstery and Ninebark Lighting since 9:12" |
| 9:20 | Leah | Replies to Ines Calder | "Replied · waiting on Ines Calder since 9:20" |
| 9:30 | Jordan | Saves the PO-MS-0388 chase as a draft for Leah | "Drafted for Leah · she sees this first" |
| 10:15 | Jordan | Opens the Wren Row Bath project | the need clears |
| 11:20 | Leah | Records Ainsley Moore (x4 at 11:21) | "Ainsley Moore recorded · just now · Open the brief" |
| 2:40 pm | Leah | Replies to Ainsley Moore | "Replied · waiting on Ainsley Moore since 2:40" |
| 4:15 pm | Leah | Thornfield · Not today | "Back Tuesday 13 October" |
| 5:50 pm | Leah | Opens the Desk (x6) | "Nothing more needs you today." |

**Money shown on Leah's frames:** only the amounts above. **Jordan's frames** show only his own jobs' amounts (PO-MS-0388 $2,180; Wren Row $6,500), with no studio revenue, A/R or margin (V18 Q10).

## 4. Visual latitude

Canon is waived for the specimens (BRIEF §6). Each direction gets **one coherent look**, changes only what its idea needs, and keeps everything else as today's portal. Start from today's tokens (`apps/designer-portal/src/app/globals.css`):
- **Paper:** `--color-off-white #FAF7F2`, `--doc-paper #FCFAF6`, `--doc-rail-stock #E8E3DB`.
- **Inks:** `--color-charcoal #2C2926`, `--text-muted #4E4339`, `--text-subtle #5A4E43`, `--text-faint #65594E`.
- **Pigment inks:** `--color-clay-ink #7C5E30`, `--color-terracotta-ink #9C5340`, `--color-golden-hour-ink #79651E`, `--color-sage-ink #5F6B57`.
- **Stage pigments:** `--tab-brief #497093`, `--tab-discovery #307063`, `--tab-direction #366A3A`, `--tab-proposal #575D1D`, `--tab-project #6D4E24`, `--tab-install #823832`.
- **Edges:** `--color-card-edge #8F8C88`; `--rule-hair` 1px rgba(44,41,38,.10); `--rule-mid` 1.5px `#2C2926`.
- **Fonts:** Playfair Display, Inter and DM Mono, from Google Fonts.

| Direction | The look | Changes only |
|---|---|---|
| A, Restored and tightened | Today's portal, with edges | D1's one-line header (both creates; date in the Today eyebrow). Today's job cards with a 3 px `--tab-*` left rule. The grouped ledger with 2 px stage ticks. Full-measure rules; every section closes on `--rule-mid`. |
| B, The day board | Today's portal, as three columns | D2's one-line header (one create; date on the line). Need cards in Now · Waiting · Coming back on `--doc-paper`. The corner class tab (5 px terracotta-ink or 2 px clay-ink; faint when not yours). Acts open inside the card. |
| C, Studio colours | Today's portal, with a job wall | D2's header. The focus strip, boxed. A 4-up wall (2-up at 390) of compact job cards, each with a 3 px `--job-*` top band. Stage as an ink word everywhere. |

**Not waived on any specimen:**
- **Calm:** no badges, unread dots, counters, streaks, progress bars, "cleared today", "moved today" lists, or red/green status. No overflow count.
- **Shadows:** none. `box-shadow` and `drop-shadow` must not appear in any specimen file (house sheet :168).
- **Words:** "Designer-Taught Intelligence", never "AI".
- **Accessibility:**
  - body text at least 4.5:1 against its ground, and 3:1 for 18 px text and for tags;
  - no meaning by colour alone: every tag has its word or name beside it;
  - real `<button>` and `<a>` elements with visible focus;
  - every today image has alt text;
  - nothing smaller than 12 px.
- **Wrap, never truncate:** no `text-overflow: ellipsis` and no `line-clamp`.
- **Honesty:**
  - the fixture is labelled as illustrative;
  - estimates are marked "est.";
  - dark frames say "Documented, not shipped";
  - no invented statistics;
  - no words attributed to Leah, Jordan or any real person: D5's seats are simulated.
- **Sending:** nothing on any frame sends on its own. Every send is a named second control ("Send to Nora and Sam Holloway").

## 5. Build rules

1. **Self-contained HTML.** One file per direction and width, with inline CSS and JS.
   - Nothing is fetched except Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`), the one exception, kept from US-24 for the three typefaces.
   - No CDN scripts and no remote images. Inline SVG is fine, including its `xmlns`.
   - Any `data:image` base64 payload must stay at or under 20 KB (20,480 base64 characters).
2. **Today images** are referenced only as `../walk/<file>.jpg`, the file named in §2.1.
3. **Frames.** Each frame is one element carrying `data-frame="frame-xN"`, using the ids in §1.
4. **The hash shows one frame.**
   - `#frame-xN` shows only that frame, with no page chrome.
   - `&nobar` hides the caption bar, `&nopins` hides the pins, and `&nobefore` hides the today figure. Tokens may come in any order, for example `#frame-b3&nopins&nobefore`.
   - With no hash, every frame shows in order, with a sticky bar of `data-go="frame-xN"` buttons.
   - Listen to `hashchange`.
   - The deck builder (`tools/build.us24.mjs`, adapted) drives frames through this hash and the iframe's `name`.
5. **No horizontal overflow at 390.**
   - In the 390 files, `document.documentElement.scrollWidth` must not exceed 390 in any single-frame view.
   - Use a 16 px side gutter.
   - Long sentences wrap; no `white-space: nowrap` on prose.
   - `check.mjs` enforces this statically (§6); the render check confirms it.
6. **Sentinel.** The last non-empty line of every file is exactly `<!-- SPECIMEN COMPLETE -->`. Write it last, so that a truncated file fails the gate.
7. **Marks at rest.** At render check, count the marks in each frame-1 and frame-8 canvas by WALK §0's method: text, controls, colour marks and drawn edges in the first viewport. Compare the counts with direction.md §3. A difference of more than 4 means either the frame or the estimate is wrong; fix one of them.

## 6. Gate

```
node artifacts/desk-redesign-2026-10-12/specimens/check.mjs              # all three directions
node artifacts/desk-redesign-2026-10-12/specimens/check.mjs b            # one direction
node artifacts/desk-redesign-2026-10-12/specimens/check.mjs --spec-only  # this file only
```

`check.mjs` reads §1 and §2.1.

**`--spec-only`** validates this file alone and opens no specimen. It checks:
- there are exactly three direction rows;
- every row lists frames at both widths;
- each listed frame is numbered on its own width in §2.1 (1–7 at 1440, 8–13 at 390);
- every §2.1 today image exists in `../walk/`.

**Without the flag**, it also checks every `proposed-{a,b,c}-{1440,390}.html`:
- the file exists;
- its last non-empty line is the sentinel;
- **every `data-frame` anchor listed in §1 is present;**
- every today image named in §2.1 for those frames is referenced as `../walk/<file>`;
- **no external fetch:** no `src`, `href`, `srcset`, `poster`, `action`, CSS `url()`, `@import` or `fetch()` points at an http(s) or protocol-relative URL outside the two Google Fonts hosts;
- **no `box-shadow`** and no `drop-shadow(`, in any form;
- **the word "AI" is absent:** no standalone `AI` (case-sensitive, word-bounded) and no `A.I.`, anywhere in the file;
- **no horizontal overflow at 390** (390 files only, static). No CSS `width`, `min-width` or `flex-basis` over 390 px; no `grid-template-columns` whose fixed px tracks and gaps sum to over 390 px; no `width="…"` attribute over 390; no `white-space: nowrap` on a `p`, `li`, `h1`–`h6` or `blockquote` rule;
- no `data:image` base64 payload is over 20 KB.

It exits 0 when everything passes and 1 otherwise, naming each failing file and each problem. A bad argument exits 2. Until the specimens are built, a full run exits 1 and names all six `proposed-*.html` files as missing. That is expected; `--spec-only` passes.

**Render check** (after the gate passes): render each file with `artifacts/people-room-crm-2026-09-11/tools/render.mjs`, using `--widths` 1440 or 390 and `--hashes` from `frame-x1&nobar` to `frame-x13&nobar`. Then confirm:
- there is no horizontal scroll at 390 (the static check is a floor, not proof);
- there are no console errors;
- the marks counts are within 4 of the estimates.

Keep render output in the ticket's board verification folder, never in the repo.
