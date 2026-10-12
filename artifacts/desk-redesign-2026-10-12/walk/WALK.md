# US-26 W1 walk — today's Desk against the old card Desk

SQ-786, 2026-10-12. This walk is design evidence only. No product code changed.

## 0. Method

- **Code.** HEAD `8016e5b39` (the docs commit on top of `82a7dec08` = origin/main). Designer portal `next dev --webpack -p 3005`, run from this worktree. The 13 flags in BRIEF §8 came from `NEXT_PUBLIC_FLAG_OVERRIDES`. PostHog was off (empty key).
- **Data.** Local Supabase only: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`. `seed_uplift_walk_v2.sql` was applied with psql to `127.0.0.1:54322` before each run, and again at the end. `supabase db reset` was never run.
- **Seats.** Leah is `designer@patina.dev`. Jordan is `hire@patina.dev`.
- **Browser.** Headless Chromium through the portal's own Playwright, at 1440×900 and 390×844, timezone America/Chicago, reduced motion.
  - The ticket asked for Claude in Chrome. I did not use it, because the designer portal keeps its Supabase session in a `localhost` cookie, and cookies are not scoped by port. Signing in on :3005 in the shared Chrome profile would overwrite the session of whoever is on :3000 (memory: "Two-portal collision"). A headless context keeps the walk off that session.
- **Times.**
  - "Auto" is the automation's wall clock on a compile-warm dev server: from load to the sheet painted, or from click to sheet open.
  - "Est." is a first-week reader's estimate: reading time plus pointer travel, using the same method as US-24 WALK §3.
- **Marks at rest.** A DOM count inside `<main>` within the first viewport (`capture.js`, `marks()`):
  - every element that holds its own text;
  - every control;
  - every colour mark, meaning text or fill with HSL saturation above 0.25 (the ink, mocha and cream stocks fall below that);
  - every drawn border edge.
  - The fixed dock and the TESTER pill are outside `<main>`, so they are not counted.
- **Evidence.** Raw JSON (`capture.json`, `moments-*.json`, `m678-*.json`) is in the board verification folder `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-786/`.
- **Dark mode.** The portal has none. `today-leah-dark-probe-fold-1440.jpg` asks for `prefers-color-scheme: dark` and still paints cream: the body is `oklch(0.958 0.015 90)`. `apps/designer-portal/src/app/globals.css:56` says why: "This portal paints no dark paper set". Dark mode is therefore N/A. No dark capture exists beyond the probe.

## 1. Today's Desk — screenshots

| File | What it shows |
|---|---|
| `today-leah-mine-fold-1440.jpg` / `-390` | Leah, Mine, with five Day Sheet lines (the cap) |
| `today-leah-studio-fold-1440.jpg` / `-390` | Leah, The studio's: the same five lines. Leah owns every job that is still live, so her two scopes are identical |
| `today-leah-mine-full-1440.jpg` / `-390` | The whole page: 4,999 px at 1440 and 10,793 px at 390. Downsized with `sips -Z 1600`. The full-page capture repeats the fixed dock mid-page, which is a capture artefact |
| `today-leah-workload-byperson-1440.jpg` / `-390` | Studio workload grouped "By team member". Leah's page has one group (LEAH HARTWELL) |
| `today-jordan-mine-fold-1440.jpg` / `-390` | Jordan, Mine, with three lines: the PO chase, the hand-off, and Wren Row signed |
| `today-jordan-studio-fold-1440.jpg` / `-390` | Jordan, The studio's: Leah's five lines |
| `today-jordan-mine-full-1440.jpg` / `-390` | Jordan's whole page. Mine also scopes the workload, so the page is 1,536 px |
| `today-jordan-workload-byperson-1440.jpg` / `-390` | Workload by team member: LEAH HARTWELL, then JORDAN REYES |
| `today-jordan-quiet-fold-1440.jpg` / `-390` | The quiet state: Jordan after Not today ×2 and Read the note (M8) |
| `today-header-1440.jpg`, `today-header-390.jpg` | The header alone, captured at 2× |
| `today-header-tips-crop-1440.jpg` | A crop of the three acts and the tip under each (Kody's complaint) |
| `today-leah-dark-probe-fold-1440.jpg` | The dark-mode probe: no change |
| `m2-…` to `m7-…` (`-1440`, `-390`) | What each day moment opens; see §3 |

### 1a. The header (BRIEF §1, complaint 1)

`desk/page.tsx:448-529` stacks a mono tip under each act. The tips come from `STUDIO_VERBS[].subLabel` (`lib/document/registry.tsx:264`, `:277`). Measured at 1440 (`today-header-tips-crop-1440.jpg`):
- **Two lines, not one.** The act row is 64 px tall (`actionsBox` 584×64). The tips sit on a second baseline, so the header reads as a 2×3 grid.
- **The tips misalign with their acts.** "CREATE AN INQUIRY BRIEF" is wider than "＋ RECORD AN INQUIRY", so it overhangs to the left, past the ＋. "DIRECT PROJECT SETUP" sits under the gap between the two acts, not under its own act. Each act is right-aligned in its own column, so no edge lines up.
- **The tips look like acts.** They use the same DM Mono caps and the same letter-spacing as the acts. The only difference is the missing underline. At a glance you count five caps phrases and cannot tell which are clickable.
- **Three underline weights in one row.** RECORD AN INQUIRY has an ink double rule. CREATE A PROJECT FILE has a mocha single rule. FIND ANYTHING is lighter still, and it sits about 10 px lower than the other two, beside a boxed ⌘K.
- **The tips repeat the acts.** "Record an inquiry" / "Create an inquiry brief" say the same thing twice. "Direct project setup" is the only tip that adds a fact (no proposal).
- **At 390** (`today-header-390.jpg`) the header is 203 px tall, a quarter of the screen. The acts stack into five right-aligned rows beside a three-line greeting. "DIRECT PROJECT SETUP" ends at x=383, which breaks the 16 px side gutter (`dock390.js`).

### 1b. Where the sections bleed together (BRIEF §1, complaint 2)

The computed styles back Kody up. Every section has a transparent background, and only the last one has a border (`capture.json` `sections`):
- header: 76 px, no rule;
- Day Sheet: 502 px. One 1 px ink rule under its head, then hairline row rules;
- Studio workload: 3,676 px. A 45 px top margin and no rule; a short ornament ("═══") marks the eyebrow;
- Studio resources: a 1 px top border, 72 px margin.

What bleeds, concretely:
1. **The sheet into the workload.** "The rest are on their projects." is a 17 px italic line with no rule. Below it, STUDIO WORKLOAD is a 12 px mono eyebrow, then OWED BY YOU, then a full ink rule. The workload's first ink rule reads as the sheet's closing rule, so the two lists read as one list in two typefaces.
2. **The sheet rules stop short.** The head rule runs 232→1208 px, but the row hairlines stop at 1183 px (`today-leah-mine-fold-1440.jpg`). The sheet has no right edge, and the scope switch "Mine · The studio's" floats past where the rows end.
3. **The same job appears twice.** The Day Sheet line "Holloway Den — Invoice INV-2026-0721 … SEND REMINDER" appears again in the workload under WAITING ON OTHERS, as "Holloway Den · AWAITING CLIENT · Overdue 12 days … · SEND REMINDER" (`today-leah-mine-full-1440.jpg`). The same is true of Chen Residence (sheet line, then OWED BY YOU row 1), Walk · Release to invoice, Tanaka and Okafor. Within one screen at 1440, the eye meets the same need twice in two registers.
4. **The rows have no stage colour.** The stage is a 12 px mocha mono word (PROJECT, BRIEF, DIRECTION…) in column 2. There is no plate and no edge. About forty rows at 1440 read as one ruled table.
5. **At 390** the day-sheet acts stack under each sentence. NOT TODAY gets its own row (`today-leah-mine-fold-390.jpg`), so five lines become 1,095 px, and the sheet alone runs to about 1.3 screens. At rest the fixed dock covers the fifth act row.

### 1c. Two defects seen in passing (not in scope; noted for the directions)

- At 390, the dock's "STUDIO NAVIGATION / Studio overview" label uses the `truncate` class ("Studio overv…"). That breaks *wrap, never truncate* (BRIEF §6). The TESTER pill (flag `tester-notes`) also sits on top of it.
- In the quiet state, the Day Sheet says "No current action alerts." Directly below it, the workload says "OWED BY YOU · Wren Row Bath — design services · ACTION WITH YOU · Signed, open the project". That is the line Jordan just put off with Not today (`today-jordan-quiet-fold-1440.jpg`). The sheet has a "Coming back" block (`components/document/day-sheet.tsx:250-262`), but it did not render here. So the false all-clear test from US-24 S5 half-fails: the sheet is quiet, but the page is not.

## 2. Seed caveat — which lines are artefacts

The v2 fixture (`seed_uplift_walk_v2.sql`, US-24 `delivery/WALK-RESULT.md`:28) seeds only:
- Holloway Den (INV-2026-0721, PO-HD-0412);
- Linden Place (declined);
- Ines Calder (inquiry);
- Marsh Street Kitchen (Jordan's hand-off and PO-MS-0388);
- Pell Court (PO-PC-0419);
- Wren Row Bath.

Everything else comes from the base local seed and from earlier e2e walks. These older rows crowd the five-line sheet:

| Seen on | Line | Source |
|---|---|---|
| Leah's sheet, line 1 | Chen Residence — $3,400 due 12 May, WS-188 (153 days) | **Artefact:** the base seed's 12 May invoice |
| Leah's sheet, line 3 | Walk · Release to invoice — INV-0007 | **Artefact:** a "Walk ·" fixture from an older walk |
| Leah's sheet, lines 4–5 | Tanaka Garden Flat, Okafor Terrace — not yet viewed | **Artefact:** the base seed |
| Leah's sheet, line 2 | Holloway Den — INV-2026-0721 | **v2 fixture** |
| The workload | Full Room ×4 (Marcus Wright, David Nielsen, Sarah Chen, Lily Tanaka), Furnishings authorization № 1/2, Sample accepted proposal, Concurrency source/target draft, Walk · Two palettes…, Whitlock residence (plan room e2e …) | **Artefacts:** base seed and e2e leftovers |
| The workload | Consultation — Ainsley Moore wrote | **Made by this walk** (M7, local brief `5a0ec190-6248-4031-898d-7eda3a25427a`). The v2 reseed does not remove it |
| Jordan's sheet | all three lines | **v2 fixture.** Jordan's Desk is the clean read |

**What the crowding hides:**
- On Leah's Desk, Linden (M2), PO-HD-0412 (M3) and Ines Calder (M7) never make the top five.
- In a real studio with no legacy rows, they probably would.

So M2, M3 and M7 below are scored twice: as walked, and as a real Leah would meet them.

## 3. The day moments — M1–M8 on today's Desk

Clicks count from the Desk at rest to the act's own sheet or the page being open. Scrolling is not a click; scroll distance is given in px.

| # | Moment | Path walked | Clicks · auto 1440 / 390 | Est. seconds to act, 1440 / 390 | Marks at rest (first screen, 1440 / 390) | Eye lands first | Where sections bleed |
|---|---|---|---|---|---|---|---|
| M1 | Monday 8am: what needs me today, and what can wait | Read the sheet | 0 · painted in 2.7 s / 2.3 s | 8 / 14. At 1440 all five lines fit, but reading five run-on sentences takes about 8 s. At 390 the sheet takes 1.3 screens and one scroll | text 45 · controls 18 · colour 9 · edges 12 / 25 · 9 · 4 · 8 | The greeting, then the 22 px italic "This morning, these need you." The first line has no weight of urgency; Chen (153 days) and Okafor (not viewed) look alike | "What can wait" has no answer on the sheet. It is the 3,676 px workload below, joined to the sheet without an edge (§1b-1) |
| M2 | Linden declined: see it, act on it | Not on the sheet, which is crowded (§2). Scroll the workload to OWED BY YOU row 2, then FOLLOW UP | 1 · scroll 529 px / 1,522 px · opens the Linden doc in 2.1 s | 12 / 20 as walked. About 4 if it reached the sheet | same as M1 | The OWED BY YOU rule, then the Playfair job name | The decline's quoted reason, "The sofa is over budget", sits in the same 15 px ink as "Proposal declined — follow up" on the next row. Nothing marks a decline as news |
| M3 | Vendor PO ack overdue: chase it | **Leah:** PO-HD-0412 is not on the Desk at all; it is not on the sheet and not in the workload. **Jordan:** sheet line 1, FOLLOW UP WITH THE MAKER | Leah: n/a (open Holloway, then Pieces). Jordan: 1 · sheet opens in 1.0 s / 1.0 s, prefilled with Leah's hand-off note | Jordan: 4 / 5. Leah: 20+ through the job | Jordan: text 41 · controls 15 · colour 7 · edges 12 / 23 · 9 · 4 · 8 | Jordan: the bold job name on line 1 | For Jordan, the PO chase appears twice: on the sheet, and as Marsh Street under WAITING ON OTHERS · AWAITING SUPPLIER |
| M4 | Invoice past due: remind, or record a payment | Sheet line 2 (Holloway), SEND REMINDER | 1 · reminder sheet in 1.0 s / 1.0 s (`m4-…`) | 5 / 6 | as M1 | The overdue amount sits mid-sentence: "$3,800 overdue, oldest due 30 September". No colour; it reads at the same weight as "Issued 4 October" | The same invoice appears again about 1,950 px lower, under WAITING ON OTHERS, with a second SEND REMINDER |
| M5 | Jordan picks up the hand-off: whose is what | Sheet line 2, READ THE NOTE. Opens the Marsh doc at `#hand-off` | 1 · navigates in 2.1 s / 2.2 s (`m5-…`) | 4 / 5 | as M3 | "Leah handed you Marsh Street Kitchen on Saturday, October 10". It is the one line without a bold job name, so it reads as quieter than the PO line it explains | Whose is what lives in the workload, where By team member groups LEAH HARTWELL / JORDAN REYES (`today-jordan-workload-byperson-*`). That grouping is a toggle 900 px below the sheet; the sheet itself never says "Leah's" |
| M6 | Midday: from the Desk into the job and back | The sheet's job name is **not a link**: the only links on a sheet line are the act and Not today. So scroll to the workload row and click the Playfair name "Holloway Den", then Back | 1 · scroll 1,873 px / 4,624 px · job in 1.6 s / 1.4 s · Back in 0.05 s | 8 / 15 there; 2 back | as M1 | On the job, the NEXT band: "OVERDUE 12D · INV-2026-0721 · SEND REMINDER" (`m6-holloway-job-*`) | Back does not restore the place. Scroll returns to 96 px / 868 px, not to the 1,873 / 4,624 px where Leah left. There is no visible way back to the Desk on the job page apart from the browser |
| M7 | New inquiry: record it, and see it land | ＋ RECORD AN INQUIRY, then the client name, the summary, and CREATE INQUIRY BRIEF → | 3 (open, plus two fields, plus submit) · dialog in 1.0 s · recorded and **taken to the new brief** (`/doc/5a0e…`) in 2.8 s | 25 to record (typing). Seeing it land needs Back plus a 1,344 px scroll | as M1 | The dialog's "New client inquiry" head | It lands in the workload as **"Consultation"**, not "Ainsley Moore": the job name is the default, and the client is only in the need text (`m7-inquiry-landed-1440.jpg`). It does not reach the sheet (crowded). In a list with four "Full Room"s, the new inquiry is hard to find |
| M8 | Close of day: what moved, what waits on others, what comes back tomorrow | Jordan: Not today ×2 plus Read the note → the quiet sheet | 3 clicks · 5.5 s auto | about 10 to clear. Then 0: nothing on the sheet says what moved | Quiet: not machine-counted; visibly about half of M1 | "No current action alerts." | "Waiting on others" is the workload group below (Marsh Street, AWAITING SUPPLIER). "What comes back tomorrow" is not shown (§1c). "What moved today" has no surface on the Desk |

Marks for the old card Desk, counted by hand from the US-24 JPGs at the 1440 fold (`desk-fold-1440.jpg`):
- about 38 text marks;
- about 9 colour marks: 3 stage plates, 3 custody dots, 2 terracotta overdue sentences, and the clay ＋;
- 3 card boxes.

Today's Desk shows more text marks at rest (45) with about the same colour count. Today's colour marks are ＋ glyphs and dock and mocha accents; none of them orients the reader.

## 4. Then and now

Old = US-24 walk (`artifacts/designer-portal-uplift-2026-10-09/walk/`), the claim-card Desk at `818db6e55`. Now = this walk.

| Then (old card Desk) | Now (today's Desk) | What changed |
|---|---|---|
| `desk-fold-1440.jpg` | `today-leah-mine-fold-1440.jpg` | **Then:** a summary line ("Six things are overdue — Chen, Holloway, Halloran and 3 more"), three text links, "and 29 more below", then a 3-up grid of bordered cards. Each card has a coloured stage plate (PROJECT in umber, BRIEF in slate blue). **Now:** five ruled sentences with two acts each, then straight into the workload table. The cards gave the fold three hard edges; today's fold has none |
| `desk-full-1440.jpg` | `today-leah-mine-full-1440.jpg` | **Then:** 32 cards in eleven rows of three, 5,819 px. Then an AT REST list grouped under coloured stage plates (BRIEF · 1, DISCOVERY · 1 …). **Now:** 4,999 px of one ruled table in three groups (OWED BY YOU / WAITING ON OTHERS / NO CURRENT ALERT). The grid was taller, but you could scan it by plate colour. Today's table is shorter but uniform, so finding Holloway means reading names |
| `desk-fold-390.jpg` | `today-leah-mine-fold-390.jpg` | **Then:** the greeting takes three lines beside four stacked acts *with tips* (BEGIN A BRIEF / NO PROPOSAL NEEDED), then the summary and three links. No card at the fold. **Now:** the same stacked header with tips, then the sheet head and 1.5 lines. **Both waste the 390 fold on the header.** The tip-under-act pattern predates US-25; Kody's complaint applies to both |
| `desk-full-390.jpg` (from the US-24 set) | `today-leah-mine-full-390.jpg` | **Then:** the card grid collapses to one column (not re-measured here). **Now:** 10,793 px; each workload row stacks name / stage / need / date / act |
| `s5-step1-hire-desk-1440.jpg` | `today-jordan-mine-fold-1440.jpg` | **Then:** Jordan saw Leah's Desk. Every card said YOUR PEN, even on Leah's jobs, and nothing marked a hand-off. **Now:** Jordan's sheet is his own three lines, with the hand-off named. That is a real gain in content. But the hand-off line has no job name and no edge |
| `s5-step1-hire-desk-390.jpg` | `today-jordan-mine-fold-390.jpg` | Then: Leah's whole Desk at 390, with nothing scoped to Jordan. Now: Jordan's three lines; the 390 fold shows the header, the sheet head and the first line |
| `s7-step1-desk-new-lead-1440.jpg` | `m7-inquiry-landed-1440.jpg` | **Then:** a new lead landed as a BRIEF card in slate blue, "Full Room / New lead — respond by 11 October", one card in the first row. **Now:** it lands as a workload row named "Consultation", 1,344 px down, in a column of four other briefs |
| (no old equivalent) | `today-jordan-quiet-fold-1440.jpg` | The quiet state is new in US-25. It is calm, but it contradicts the workload directly below (§1c) |
| (no old equivalent) | `today-header-tips-crop-1440.jpg` | The old header had the same two-line tip pattern ("BEGIN A BRIEF", "NO PROPOSAL NEEDED") |

### What the old cards did well
- **Scan by colour.** At 1440 the stage plates (umber PROJECT, slate BRIEF, olive PROPOSAL, brick INSTALL) let the eye sort 32 jobs into stages without reading. Colour worked as orientation, not alarm.
- **Edges.** A 1 px `--card-edge` box per job gave each claim its own territory. Name, need and act were visibly one thing, and the act (RECORD THE PAYMENT) sat on its own ruled foot at the bottom of its card.
- **Urgency was visible in the need sentence.** "Overdue 150 days — Balance to Woodward & Sons…" was in terracotta-ink, so the overdue cards stood out within the grid. Today the overdue clause is plain ink.
- **The job name was a link and the headline.** Playfair 20 px, underlined: one click into the job from the card. Today's sheet line cannot take you into the job (M6).

### What the old cards did badly
- **Noise.** Every card carried a plate, a dot, a custody word (YOUR PEN ×29), a name, a person, a need and an act: seven registers. The custody dot plus YOUR PEN repeated on almost every card said nothing.
- **Plates as shouting.** White mono on a solid pigment, 32 times. At the full-page view the plates are the loudest thing on the Desk, louder than the overdue sentences.
- **The grid's height.** 32 cards in eleven rows meant 4,000+ px of grid before the at-rest list. The grid had no cap and no ranking: Chen at 150 days and a Friday Pulse draft sat at the same size. "And 29 more below" admitted it.
- **Uneven cards.** Card heights varied with the wrapped need (Chen's box ran past its row-mates; `desk-fold-1440.jpg`), so the 3-up rows had ragged feet.
- **The same tip-under-act header,** at both widths.

### What today does better, and should survive into the directions
- A bounded, ranked sheet: five lines, with Not today.
- Mine versus the studio's.
- A hand-off line for Jordan.
- Act sheets that open in about 1 s, prefilled (M3, M4).
- A workload grouped by who owes the next move.

## 5. Prioritized findings (worst first)

1. **Nothing separates the sheet from the workload, and the same need appears in both** (`today-leah-mine-fold-1440.jpg`; §1b-1, §1b-3). A reader takes Holloway's second SEND REMINDER, about 1,950 px down, for a second invoice.
2. **The sheet's job name is not a link** (M6). To open the job, Leah scrolls 1,873 px at 1440 or 4,624 px at 390 to the workload row. She will think the sheet is a notification list, not a way into the work.
3. **The header's tips read as five equal caps phrases on two baselines** (`today-header-tips-crop-1440.jpg`). A reader cannot tell the acts from the descriptions. At 390 the header takes 203 px and breaks the gutter.
4. **The quiet sheet says "No current action alerts." while the workload lists what Jordan owes** (`today-jordan-quiet-fold-1440.jpg`). Jordan will think the page disagrees with itself, and "Coming back" never shows (§1c).
5. **A new inquiry lands as "Consultation"** (M7). It is indistinguishable among the generic brief names, so Leah cannot see that her inquiry landed.
6. **No colour orients the workload.** The stage is a 12 px mocha word, so about forty rows read as one table. The old plates did this job, too loudly.
7. **At 390 the sheet's acts stack** NOT TODAY onto its own row, so five lines take 1.3 screens. The dock label truncates (§1c).

## 6. Leftovers for the orchestrator

- The local DB keeps one brief this walk recorded: "Ainsley Moore", `5a0ec190-6248-4031-898d-7eda3a25427a`. The v2 reseed does not remove it.
- All need states were reset by the final reseed.
