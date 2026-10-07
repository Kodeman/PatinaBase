# SPEC: the running-a-job specimens

This is the build contract for three builders. Each builder writes **two files**, one direction at 1440 and at 390, and reads only:
- this file
- `../synthesis/direction.md` (§4 has your direction)
- the walk screenshots this file names, which show today's chrome to replicate
- the reference files listed in §2

**What these specimens are for.** This is a founder deck. The deck sets each walk screenshot (today) beside your frame (proposed). Your frame has to read as *the same product, changed in the places the direction names, and nowhere else*. A founder should be able to point at what moved. Don't redesign anything outside your direction's list.

**House.** This is Patina's Document: paper, scored ink, hairline rules, and nothing uses `box-shadow`. The grammar:
- things unfold in place
- sheets are 640px or 760px
- states are words in hairline boxes, never filled badges
- the filled (charcoal) terminal act is only for money or signature, carries a consequence sentence directly above it, and is never on a chore
- a refused act stays focusable, uses `aria-disabled`, and prints its reason in words
- there are no tabs, no dashboards, no progress bars and no numeric badges
- there is no red or green status

---

## 1. File targets

| Ticket | Direction | Files (absolute) | Frames |
|---|---|---|---|
| M1 | A, One Voice | `/Users/kody/Code/patina-merged/artifacts/document-running-a-job-2026-10-07/specimens/proposed-a-1440.html`<br>`…/specimens/proposed-a-390.html` | 1440: `a1`, `a2`, `a3` · 390: `a4`, `a5` |
| M2 | B, Whose Move | `…/specimens/proposed-b-1440.html`<br>`…/specimens/proposed-b-390.html` | 1440: `b1`, `b2` · 390: `b3`, `b4` |
| M3 | C, Ask the Paper | `…/specimens/proposed-c-1440.html`<br>`…/specimens/proposed-c-390.html` | 1440: `c1`, `c2`, `c3` · 390: `c4`, `c5` |

Write only your two files. Do not touch anything else in the repo.

| Rule | Statement |
|---|---|
| Self-contained | One file, with one `<style>` and one `<script>`. Vanilla JS only. No CDN script, no library |
| External resources | Only the Google Fonts link below, and the `fonts.gstatic.com` files it pulls. Do **not** use kit.css's relative `@font-face` URLs |
| Images | None. No `<img>` and no data-URI raster. Inline SVG only, at 1px in `var(--ink-faint)`. The strata mark is three inline `<i>` bars, drawn per `kit.css` |
| Banned strings | `box-shadow`, `text-overflow`, `opacity:` used on a gated act, the `disabled` attribute, the `placeholder` attribute |
| Structure | `<html lang="en">`, exactly one `<h1>` per file (a visually hidden file title is fine; the Document's own title inside a frame is an `<h2>`), headings in order |
| Last line | The file's last line is exactly `<!-- specimen-complete -->` |

Fonts, pasted into `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400;1,500&family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

---

## 2. Tokens and geometry

1. **Paste the token block byte for byte.** It is `/Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/specimens/SPEC.md`, lines 66–145: the `:root` block, the dark media block and `:root[data-theme="dark"]`. Do not rename a token, and add no hex literal anywhere else in the file.
2. **Geometry and primitives** come from `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/mock/kit.css` and its `KIT.md`. You may read and copy their rules for:
   - `.letterhead`, `.vitals`, `.region-head`, `.region-rule`, `.seam`
   - `.ffe-row`, `.stamp`, `.margin`, `.drawer`, `.cmdk`, `.mobile-bar`, `.sheet`, `.strata-mark`
   - spine widths
   
   But you must **remap every colour to a §2 token**:
   - `--color-charcoal` → `--ink`
   - `--color-mocha` → `--ink-muted`
   - `--color-quiet-ink` → `--ink-faint`
   - `--doc-paper` → `--paper-doc`
   - `--color-off-white` → `--paper`
   - `--color-pearl` / `--border-default` → `--hairline`
   - `--doc-ink-border` → `--hairline-strong`
   - `--color-clay` → `--clay`
   - `--color-aged-oak` → `--oak`
   - `--color-terracotta` → `--terracotta`, its ink → `--terracotta-ink`
   - golden → `--golden` / `--golden-ink`
   - sage → `--sage` / `--sage-ink`
3. **Desk geometry at 1440.**
   - The frame is 1440 wide, with a 200px spine, the sheet, a 232px margin rail, and the 60px studio drawer at the foot of the frame. The drawer is **not** `position: fixed`; it is the last row of the frame.
   - Each frame shows **the first 900px** of the screen (the fold, plus a little) unless the frame spec says otherwise. Clip with `overflow: hidden` on the frame. Clipped content is cut cleanly by the frame edge, never by `text-overflow`.
4. **Phone geometry.** Each frame is 390×844 and carries the 64px mobile bar or dock as its last row, not fixed. Frames sit side by side with 48px gaps and wrap on narrow viewports. At a 390 viewport the page shows one frame per row and never scrolls horizontally.
5. **Replicate today's chrome from the walk screenshots.** These are under `/Users/kody/Code/patina-merged/artifacts/document-running-a-job-2026-10-07/walk/`. Read every image your frames name.
   - The spine, letterhead, band, region heads, margin rail, drawer and dock must look like the screenshot, using the screenshot's own strings, except where your direction changes them.
   - Unchanged strings are copied **verbatim** from the screenshot.
6. **Acts.** Use Scored Ink:
   - `.act`: DM Mono 13px, w500, caps, tracking .06em, a 1px `var(--oak)` rule under the word, no border, no ground.
   - `.act--inked`: the one heavy act. Same word, with a second `var(--clay)` rule, and `var(--ink)` text in w500 where others are `var(--ink-muted)`.
   - `.act--terminal`: `var(--ink)` ground, `var(--ink-paper)` text, 3px radius, 12px 20px padding, Inter 500 16px, sentence case. Only for money or signature, with a `.consequence` sentence (`var(--ink)`, 14/1.5, max 56ch) directly above it.
   - Gated: `aria-disabled="true"`, `var(--ink-faint)` text, the reason printed beside it and linked by `aria-describedby`.
   - Every act is at least 44×44, and has `:focus-visible { outline: 2px solid var(--clay-ink); outline-offset: 2px }`.
7. **Pins.** Each changed element carries a `.pin`:
   - 22×22, 1px `var(--clay-ink)` border, 2px radius, DM Mono 11px number in `var(--clay-ink)`, `var(--paper)` ground, `aria-hidden="true"`
   - placed inline after the element it marks, never covering text
   
   Under each frame is a `.notes` block:
   - a `.t-head` "WHAT CHANGED"
   - then an `<ol>`, where each entry starts with its number in a `.pin` box, followed by a plain sentence, followed by a `.t-meta` line of finding ids (for example `R1-05 · R2-02 · R3-01`)
   
   Number pins per frame, starting at 1.
8. **Rhythm.** Gaps are 12, 24, 48 or 72px. Radius is 2px or 3px. Include an `@media (prefers-reduced-motion: reduce)` block, and an `@media (forced-colors: active)` block that gives `.pin`, `.act--terminal` and `.stamp` a `ButtonText` border, with focus in `Highlight`.
9. **Themes.** Light and dark must both work via the token block. `body` paints `var(--paper)`.

---

## 3. Frame switcher (identical mechanics in all six files)

| Rule | Statement |
|---|---|
| Hash format | Tokens separated by `&`.<br>• The first token matching `frame-*` picks the frame.<br>• `nobar` hides the frame bar.<br>• `nopins` hides every `.pin` and every `.notes` block.<br>Example: `#frame-a2&nobar&nopins` |
| Default | No hash, or an unknown frame, shows **all of the file's frames stacked** (1440) or side by side (390), each with its caption `<h2 class="t-head">` and notes. This is the standalone review view |
| One frame | A valid `frame-*` shows only that frame, using the `hidden` property. Hidden frames can't be reached by Tab |
| On load | Read `location.hash` on `DOMContentLoaded` **and** listen for `hashchange` |
| postMessage | Accept `{ frame: 'frame-a2' }` or `{ frame: 'a2' }` and normalise by adding the `frame-` prefix. Ignore anything else. Never `eval` |
| Announce | One page-level `<p role="status" aria-live="polite">` names the frame shown |
| Frame bar | `var(--rail)` ground, DM Mono 11px, `var(--ink-muted)`. A caption, then one `.act` button per frame, using `aria-pressed`. It is the **only** place a caveat may appear.<br>Caption: `Proposed · Direction <A/B/C>, <name> · Wed 7 Oct 2026 · seed data from the local walk · illustrative values marked in the notes` |

---

## 4. The fixture (from the local walk; do not invent names)

**Today is Wednesday 7 October 2026.**
- Dates use the house form: `Fri 9 Oct`, `11 June`, `Tue 6 Oct`.
- Money uses today's product form: `$6,800`, `$18,500`, `$7,800`.
- Any value not listed here must be marked `[illustrative]` in the frame's notes entry, never on the face.

| Who / what | Facts |
|---|---|
| Studio | Leah Hartwell, owner (`LH`). The first hire is **Maya Reyes**, design assistant (`MR`). Maya is the one invented person: a reused fixture from the procurement deck, so note it in the notes |
| Desk (`walk/s1-step1-desk-landing.jpg`) | "Good morning, Leah…"<br>"Two things are overdue — Chen and Aspen"<br>New leads: Marcus Wright (Full Room, respond by 9 October), David Nielsen (Full Room, respond by 11 October), Lily Tanaka (Full Room, respond by 12 October)<br>"and 7 more below"<br>In brief: 5 |
| Chen Residence (`walk/project-1440.jpg`, `project-390.jpg`, `s2-*`, `s3-*`) | Project stage, signed, active.<br>Desk: "Overdue 148 days". No client linked.<br>Band today: "Balance to Woodward & Sons", phone "OVERDUE 148D · WS-188 RECORD +2 MORE".<br>Project guide act (prints nowhere today): "Open the FF&E schedule".<br>Piece: **Custom Walnut Sectional — 3 pc · Woodward & Sons · RECEIVED · $6,800 · PO WS-188**. Pieces head today: 3 lines, 3 unspecified.<br>Margin: two "VENDOR PAYMENT DUE" cards.<br>Top acts today: RECORD PAYMENT (+1 more), SET DATES, SET A BUDGET BAND |
| Elena Marlowe, Living Room Direction (`walk/direction-1440.jpg`) | Direction stage, draft, no-login household.<br>Today: "$0 proposed"; guide "Draft up the direction"; act OPEN THE CONTRACT ROOM; card "DRAFTING THE PROPOSAL — Not started yet — open the Contract Room to write it"; second act CONTINUE DRAFTING.<br>A leaked engineering note is visible in the body |
| Aspen Loft, Living Room Refresh (`walk/proposal-1440.jpg`) | Proposal stage. "$18,500 proposed". "Sent Oct 5 · unopened 2d". Act today: NUDGE CLIENT USER. "5 unspecified +1 more" in terracotta |
| Olsen Lake House (`walk/s5-step1-olsen-opened.jpg`, `-full.jpg`) | Project stage, active, opened cold.<br>Band today: "AP-012 has an open damage claim — FILE THE CLAIM +2 more".<br>No client linked.<br>The rail says ACTIVE.<br>"No active phase handoffs need attention."<br>"EXACT ARTIFACT · NAMED AUTHORITY" eyebrow |
| Cedar Lane Study, Nora Ellison (`walk/install-1440.jpg`, `install-390.jpg`, `s4-*`) | Install stage.<br>Today: "NEEDS SETUP · 1", "Name the phases for this project", OPEN THE SCHEDULE, SET TARGET, SET A BUDGET BAND, MESSAGE, PREVIEW, SHARING.<br>Pieces: **Reading chair — IN PRODUCTION — $7,800 — maker Fixture Metalworks**, and **Built-in shelving — installed**.<br>Install start **11 June** (118 days ago).<br>Counts today disagree: "0 of 2 installed" and "INSTALL MANIFEST · 1 of 1 placed".<br>PUNCH, "No window is held — HOLD A WINDOW" |

**Voice** (from `.claude/skills/patina-brand-voice/SKILL.md`; read it):
- Plain studio English, with the verb first on every act.
- Never "AI", "smart", "insights", "curated", "luxury" or "bespoke". No exclamation marks.
- Product lexicon: Document, Desk, Contract Room, the band, Pieces, the Record, the margin.
- The seven stage words, and only these, print as stage: **Brief, Discovery, Direction, Proposal, Project, Install, Care**.

---

## 5. Direction A: One Voice (M1)

Read `../synthesis/direction.md` §4 A. The changes are, and are limited to:
1. the stage in words in the letterhead eyebrow
2. the band split into **Next** and **Standing**
3. one label: the act's name is the control's name
4. weight by role
5. the phone dock carries Next
6. the two repairs that A's frames touch: "$0 proposed" becomes "Not priced yet", and the leaked note is gone

### `a1`: Chen Residence, top of the paper (1440)
**Today:** `walk/project-1440.jpg`.
- **Letterhead eyebrow:** `PROJECT · 5 OF 7`. The strata mark carries the label `Project` as visible text beside it.
- The "No client linked — attach one" line **leaves the letterhead.** It becomes a Standing item.
- **Band line 2, left:** `NEXT ─` (DM Mono 11px, `--ink-subtle`), then the sentence `Pay Woodward & Sons the WS-188 balance — 148 days overdue.`, then the act `RECORD THE PAYMENT` as `.act--inked`.
- **Band line 2, right,** separated by a 1px `--hairline-strong` vertical rule: `STANDING · 3` followed by the kind summary `1 blocks money · 2 setup`, then `.act` `SEE ALL 3`.
  - Pin it, with a note: Next is ranked by kind (money or signature first, then dated needs, then the stage's own step, then setup). Standing never takes Next's slot.
- **Region head of the Money region** (or the region where RECORD PAYMENT lives today; follow the screenshot): its act reads the same `RECORD THE PAYMENT`, **with a 2px `var(--clay)` left rule showing where Next lands**. The pin's note says "Pressing Next lands here, with focus on this act."
- **Weight by role.** Every other region-head act drops to plain `.act` (no inked tier). Today's competing acts (SET DATES, SET A BUDGET BAND) stay, plain.
- **Margin:** unchanged from today.

### `a2`: Elena Marlowe, Direction (1440)
**Today:** `walk/direction-1440.jpg`.
- **Eyebrow:** `DIRECTION · 3 OF 7`.
- `$0 proposed` becomes `Not priced yet`, in `--ink-subtle`, with no figure.
- **Band:** `NEXT ─ Write the proposal for Elena.` plus `.act--inked` `WRITE THE PROPOSAL`. Standing is silent: print nothing on the right.
- **The status card:** heading `The proposal`, word box `NOT STARTED` (`.stamp`, dormant), sentence `Write it in the Contract Room. Elena reads it when you send it.` and one act, `WRITE THE PROPOSAL`, the same words as the band.
  - Delete the second act (CONTINUE DRAFTING).
  - Pin it, with a note: today one door has four labels ("Draft up the direction", OPEN THE CONTRACT ROOM, DRAFTING THE PROPOSAL, CONTINUE DRAFTING; `document-guide.ts:169,226`, `proposal-instruments.tsx:373,397`). The act and the control now share one name.
- **The leaked engineering note is gone.** Pin the space where it was, with a note citing Worst Moment 1 in WALK.md, R1-17 and R2-26.

### `a3`: the label table (1440, not a screen)
- A 1200px band on paper, heading `<h2>` "One name for each act", with a `.crm-table`-style table (hairline rows, `.t-head` column heads).
- **Columns:** Stage · Today the guide says · Today the control says · One name.
- **Rows** come from `../briefing/current-state.md`: use its contradictions table and pick the 6 clearest. Copy today's strings verbatim from the briefing, with a citation in a `.t-meta` line under each row.
- A closing sentence under the table: `Every surface that prints a next act (the band, the Desk card, ⌘K, the region head, the phone dock) reads this one table.`

### `a4`: Chen Residence on the phone (390)
**Today:** `walk/project-390.jpg`.
- Letterhead eyebrow `PROJECT · 5 OF 7`.
- **Band, stacked:**
  - row 1 `NEXT`
  - row 2 the full sentence `Pay Woodward & Sons the WS-188 balance — 148 days overdue.` (no shortening to a verb)
  - row 3 `.act--inked` `RECORD THE PAYMENT`
  - row 4 `STANDING · 3 · SEE ALL`
- **Dock:** the centre position is `RECORD THE PAYMENT` (the Next act, the same words). Today's Message moves into `MORE`.
  - Pin the band, with a note: R1-12 says today's phone keeps only "RECORD".
  - Pin the dock, with a note: R1-11 / R2-08.

### `a5`: the More sheet on the phone (390)
- A bottom `.sheet` over a dimmed `a4`. Dim with a `var(--paper)` layer at 80% using `color-mix`, not `opacity` on content.
- Rows:
  - `Message the client`, `aria-disabled`, with its reason printed under it: `Link a client to this job first.` and an act `LINK A CLIENT`
  - `Preview the client's copy`
  - `Sharing`
  - `Set dates`
  - `Set a budget band`
- Pin the Message row, with a note: F52 (`letterhead-instruments.tsx:296`) — today Message is offered with no client linked.

---

## 6. Direction B: Whose Move (M2)

Read synthesis §4 B. The changes are, and are limited to:
1. an ownership sentence
2. the handoff line
3. the standing sheet unfolded once, on first open, grouped by kind
4. the Desk prose
5. the tour walks a real job
6. the stage word in the eyebrow, which B depends on (as A)

### `b1`: Olsen Lake House, Maya's first open (1440)
**Today:** `walk/s5-step1-olsen-opened.jpg`.
- **Eyebrow:** `PROJECT · 5 OF 7`.
- **Under the title, the handoff line** in Playfair italic 18px `--ink-muted`: `Leah put this down Tue 6 Oct. Yours now, Maya.` Pin it.
- **The ownership sentence** (Inter 16 `--ink`), in Discovery's shape (`walk/discovery-1440.jpg`): `Yours: file the damage claim on AP-012. Waiting on: no one.` Pin it, with a note: Discovery's sentence is the only ownership sentence in the product today; this generalises it to every stage (R2-31).
- **The standing sheet, unfolded in place under the band:**
  - It sits on a `var(--paper-doc)` ground with a 3px `var(--clay)` left rule, under the `.t-head` `EVERYTHING STANDING ON THIS JOB · 3`.
  - Three groups, each with a `.t-head` and rows (sentence plus act):
    - **BLOCKS MONEY OR A SIGNATURE:** `AP-012 has an open damage claim with the maker.`, act `.act--inked` `FILE THE CLAIM`
    - **NEEDS YOU:** `Confirm the delivery window with the maker. [illustrative]`, act `CONFIRM THE WINDOW`
    - **SETUP:** `No client linked. Link one before you bill or message.`, act `LINK A CLIENT`. Clay ink, never terracotta.
  - Foot line `.t-meta`: `This list opens in full once, on your first visit. After that the band carries it.`, then act `FOLD IT AWAY`.
  - Pin the group heads, with a note: Q3 and Q6 (rank by kind, first open shows everything once).
- **Remove** "No active phase handoffs need attention." and the "EXACT ARTIFACT · NAMED AUTHORITY" eyebrow wherever they appear in the frame. Pin the gap, with a note citing R1-16 and R1-17.
- **Margin:** as today.

### `b2`: the Desk, read as the owner hands work out (1440)
**Today:** `walk/s1-step1-desk-landing.jpg`.
- Copy the Desk's layout from the screenshot. Change only the prose block and the overflow line.
- **Prose:**
  - `Good morning, Leah.`
  - `Yours today: answer Marcus Wright by Fri 9 Oct, David Nielsen by Sun 11 Oct, and Lily Tanaka by Mon 12 Oct.`
  - `Overdue: Chen Residence and Aspen Loft.`
  - `With Maya: Olsen Lake House — she has the damage claim.`
  - Each name is a scored link.
  - Pin it, with a note: today's prose reads as the whole worklist and hides the third lead (WALK scenario 1; R3-16).
- **Overflow line:** `and 7 more below` becomes `New inquiries · 5 — SHOW ALL` (act). Pin it.
- **The folder cards keep their YOUR PEN marks.** The Olsen card shows `MAYA'S PEN` as its pen word. Pin it, with a note: the pen now reaches the paper (b1).

### `b3`: Olsen on Maya's phone, first open (390)
- Same content as b1, stacked: eyebrow, title, handoff line, ownership sentence, then the grouped standing list (all three groups), then `FOLD IT AWAY`.
- Dock as today (`walk/project-390.jpg` shows its shape), except that its centre is `FILE THE CLAIM`.

### `b4`: the teammate tour walks this job (390)
- Olsen on the phone, standing folded (the second visit).
- A one-time note is **anchored under the band, in the flow, not a modal**:
  - a `var(--paper-doc)` ground with a 1px `--hairline-strong` box
  - `.t-head` `1 OF 3`
  - Playfair 18px: `This is a job Leah handed you. The band says what's yours.`
  - Inter 14: `Press File the claim to start. Two more notes follow as you work.`
  - acts `NEXT NOTE` and `SKIP THE TOUR`
- The band's `FILE THE CLAIM` act carries the 2px clay rule to show where the note points.
- Pin it, with a note: today's tour names the rooms (R1-37, R2-24); this one walks the act.

---

## 7. Direction C: Ask the Paper (M3)

Read synthesis §4 C. The changes are, and are limited to:
1. ⌘K searches the open paper
2. `?` printed beside ⌘K
3. "Record a change" on the Pieces head and the Money head, with one question first
4. folded seams print their verbs
5. the install reading, with setup demoted and one count

### `c1`: ⌘K on Chen, "sectional" (1440)
**Today:** `walk/s3-step1-cmdk-no-match.jpg`.
- Chen's paper sits under the ⌘K overlay (copy its top from `walk/project-1440.jpg`). The overlay is a `var(--paper)` layer at 70% via `color-mix`.
- The `.cmdk` dialog shows the query `sectional` as typed text in the input. Use a `value`, never a placeholder.
- **Group `ON THIS PAPER · CHEN RESIDENCE`:**
  - row `Custom Walnut Sectional — 3 pc` / sub `Woodward & Sons · RECEIVED · PO WS-188` / right `↵ OPEN THE LINE`. This row is selected, with a 2px clay left rule.
  - row `Woodward & Sons` / sub `maker · PO WS-188 · balance overdue 148 days`
- **Group `ACTS`:** `Record a change`, sub `on a piece or on the agreement`.
- **Group `ELSEWHERE`:** `Search all jobs for "sectional"`.
- **Footer** in DM Mono 11: `↵ open · ↑↓ move · ? keys · esc close`.
- **The drawer at the foot of the frame** prints `⌘K  ?` side by side, where `?` is its own small act labelled `?` with the accessible name "Keys". Pin it, with a note: the Keys sheet exists but nothing prints its key (R1-30, R2-19).
- Pin the result group, with a note: today "No match" and the recovery points to Help (R1-05, R2-02, R3-01).

### `c2`: Record a change (1440)
**Today:** `walk/s2-step1-chen-opened.jpg`, `walk/s2-step2-schedule-area.jpg`.
- Show Chen's **Pieces** region head: `Pieces`, status `3 lines · 3 not yet specified` in clay ink, not terracotta.
  - Acts: `ADD A PIECE`, `RECORD A CHANGE`.
  - Pin `RECORD A CHANGE`, with a note: today there is no entry point above the line unfold (R1-04, R2-03, R3-02); ⌘K "Add a change" appears only in Install and Care (`command-bar.tsx:706-717`).
- Under the head, a **640px sheet unfolds in place**: a `var(--paper-doc)` ground, a 3px `var(--clay)` left rule, and `.t-head` `RECORD A CHANGE`.
  - Playfair 20 question: `What changed?`
  - Two chip-choice rows, each a full-width bordered row (1px `--hairline-strong`, 3px radius, 16px padding):
    - `On a piece`, with the sentence `Swap, add or remove a piece, or change its finish, size or maker. The maker gets a change order.`
    - `On the agreement`, with the sentence `Change the scope, the fee or the terms. Chen signs the amendment.`
  - Act `CONTINUE`, `aria-disabled` until a choice is made, with the reason `Choose one to continue.`
  - The sheet does not continue further.
- **Below the sheet,** the `Custom Walnut Sectional — 3 pc` row as today: Woodward & Sons, RECEIVED, $6,800.
- **Further down, the folded Money seam** prints its verbs: `Money · balance to Woodward & Sons overdue · RECORD A PAYMENT · RECORD A CHANGE · UNFOLD ↓`. Pin it, with a note: today folded seams name state, not acts (Q5).

### `c3`: Cedar Lane Study, install week (1440)
**Today:** `walk/install-1440.jpg`, `walk/s4-step2-install-section.jpg`.
- **Eyebrow:** `INSTALL · 6 OF 7`.
- **Band:** `NEXT ─ Reading chair is 118 days past the 11 June start.` plus `.act--inked` `CHASE FIXTURE METALWORKS`. The right side reads `STANDING · 1 setup`.
  - The `NEEDS SETUP · 1` chip is gone from the band.
  - Pin it, with a note: lateness is now a need kind; setup never takes the line (R1-07, R2-09, R3-03).
- **Top acts:**
  - keep `PREVIEW` and `SHARING` as plain `.act` in the letterhead
  - move `SET TARGET` and `SET A BUDGET BAND` into the Setup group below
  - keep `MESSAGE` (Nora is linked)
  - Pin it, with a note: six acts above the fold today.
- **The install reading,** directly under the band, replacing the "0 of 2" vs "1 of 1" pair:
  - `.t-head` `THE INSTALL · 1 OF 2 PLACED`
  - rows:
    - **Late · 1:** `Reading chair` / `IN PRODUCTION` stamp / `Fixture Metalworks` / `$7,800` / `118 days past start`, with a 2px `var(--terracotta-ink)` leading rule
    - **Placed · 1:** `Built-in shelving` / `INSTALLED` stamp (sage)
    - **Arriving:** `Nothing dated this week.` in `--ink-subtle`
  - acts at the foot: `HOLD A WINDOW`, `PUNCH`
  - Pin it, with a note: the two counts disagree today (R1-21, R2-10).
- **Setup group** at the bottom of the frame:
  - `.t-head` `SETUP`
  - rows in clay ink: `Name the phases` + `OPEN THE SCHEDULE`, `Set a target` + `SET TARGET`, `Set a budget band` + `SET A BUDGET BAND`

### `c4`: ⌘K on the phone, "WS-188" (390)
- A full-height sheet with the input value `WS-188`.
- **Group `ON THIS PAPER`:** the sectional row, sub `PO WS-188 · Woodward & Sons · RECEIVED`.
- **Group `ACTS`:** `Record a payment to Woodward & Sons`.
- Footer: `? keys`.

### `c5`: Cedar Lane Study on the phone (390)
**Today:** `walk/install-390.jpg`.
- Eyebrow `INSTALL · 6 OF 7`.
- Band stacked: `NEXT` / `Reading chair is 118 days past the 11 June start.` / `CHASE FIXTURE METALWORKS` / `STANDING · 1 SETUP`.
- Then the install reading rows (Late, Placed, Arriving).
- Dock centre: `CHASE FIXTURE METALWORKS`. The label may wrap to two lines; never truncate.

---

## 8. Render and self-check

Render each file with the sandbox disabled (Chromium fails in a sandboxed shell). The output goes to `…/specimens/_renders/`, which is git-ignored by convention, so do not commit it.

```bash
node /Users/kody/Code/patina-merged/artifacts/people-room-crm-2026-09-11/tools/render.mjs \
  /Users/kody/Code/patina-merged/artifacts/document-running-a-job-2026-10-07/specimens/proposed-<x>-1440.html \
  --out /Users/kody/Code/patina-merged/artifacts/document-running-a-job-2026-10-07/specimens/_renders \
  --name proposed-<x>-1440 --widths 1440 --hashes frame-<x>1,frame-<x>2 --console
# 390 file: --widths 390 --hashes frame-<x>4,frame-<x>5   (b: frame-b3,frame-b4)
# add --dark for a dark pass
```

**Look at every PNG you render** (light and dark) and compare it with the matching walk screenshot. The gate:

```bash
F=/Users/kody/Code/patina-merged/artifacts/document-running-a-job-2026-10-07/specimens/proposed-<x>-1440.html
tail -n1 "$F" | grep -qx '<!-- specimen-complete -->' && \
! grep -nE 'box-shadow|text-overflow|placeholder=|\sdisabled[\s>]|\bAI\b|curated|luxury|bespoke' "$F" && echo PASS
```

Run it for both of your files. Report back:
- the two absolute paths
- the PASS lines
- the render PNG paths
- any fixture value you marked `[illustrative]`
