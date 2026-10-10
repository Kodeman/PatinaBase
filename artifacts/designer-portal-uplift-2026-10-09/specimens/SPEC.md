# US-24 specimens: build spec and gate

**9 October 2026 · SQ-727.** This tells the specimen builders what to draw for each of the three directions in `../synthesis/direction.md` §3, and how `check.mjs` will judge it. Six files: two per direction, one at 1440 and one at 390. Each frame sets the proposed screen beside today's screen from the walk, for the same moment.

Specimens are **static illustrations**. They prove nothing about time or trust (direction.md §7). Every click and second figure printed on them is an estimate from direction.md §3 and is labelled "est.".

## 1. Frame table

`check.mjs` reads this table, so keep its rows exactly in this format. Only these three lines may start with `| **`.

| Direction | Files | 1440 frames | 390 frames |
|---|---|---|---|
| **A, Quiet marks** | `artifacts/designer-portal-uplift-2026-10-09/specimens/proposed-a-1440.html`<br>`…/specimens/proposed-a-390.html` | `frame-a1` … `frame-a7` | `frame-a8` … `frame-a11` |
| **B, The Day Sheet** | `artifacts/designer-portal-uplift-2026-10-09/specimens/proposed-b-1440.html`<br>`…/specimens/proposed-b-390.html` | `frame-b1` … `frame-b7` | `frame-b8` … `frame-b11` |
| **C, The job workspace** | `artifacts/designer-portal-uplift-2026-10-09/specimens/proposed-c-1440.html`<br>`…/specimens/proposed-c-390.html` | `frame-c1` … `frame-c7` | `frame-c8` … `frame-c11` |

Each direction has seven frames at 1440 and four at 390. In every direction:
- frame 1 is the Desk landing (S1);
- frame 5 is the in-project next step (S6);
- frames 2, 3, 4 and 10 are act-on-it moments (S2, S3, S4).

## 2. Frames

### 2.1 The pairing table

Frame `xN` means `frame-aN`, `frame-bN` and `frame-cN`. Every direction draws the same moment, so the three can be compared directly. **Before** is the walk screenshot shown under the proposal. It is referenced as `../walk/<file>` and `check.mjs` checks that the file exists and that the page references it.

| Frame | Width | Scenario | Before | The moment |
|---|---|---|---|---|
| x1 | 1440 | S1, S7 | `desk-fold-1440.jpg` | Leah opens the Desk, Monday 12 October, 8:40 am |
| x2 | 1440 | S2 | `s2-step5-linden-doc-1440.jpg` | Linden Place declined yesterday; Leah opens the follow-up |
| x3 | 1440 | S3 | `s3-step3-follow-up-with-maker-1440.jpg` | Fenmoor Joinery has not answered PO-HD-0412; Leah opens the chase |
| x4 | 1440 | S4 | `s2-step6-pell-court-doc-1440.jpg` | Pell Court's deposit landed at 6:10 am; Leah releases the order |
| x5 | 1440 | S6 | `doc-holloway-fold-1440.jpg` | Leah opens Holloway Den: what is the next step on this job? |
| x6 | 1440 | S5 | `s5-step1-hire-desk-1440.jpg` | Jordan Reyes, the hire, opens the Desk |
| x7 | 1440 | S8 | `s8-step1-desk-bottom-1440.jpg` | 5:50 pm: is the day done? |
| x8 | 390 | S1 | `desk-fold-390.jpg` | x1 on Leah's phone, between appointments |
| x9 | 390 | S6 | `s6-step1-holloway-next-band-390.jpg` | x5 on the phone |
| x10 | 390 | S4 | `doc-holloway-fold-390.jpg` | Holloway's invoice reminder, sent from the phone, with the act beside its reason |
| x11 | 390 | S5 | `s5-step1-hire-desk-390.jpg` | x6 on Jordan's phone |

### 2.2 What each frame shows, per direction

Wording on a frame is the panel's guess, pending Leah's words (direction.md §7). Use the fixture's names and amounts exactly (§3).

**x1 / x8, Desk landing (S1, S7).**
- **A:** Today's roster of cards, re-ranked by the D2 class table.
  - Chen Residence leads, because A has no defer memory. This is the honest weakness from direction.md §3 A S1; draw it, do not hide it.
  - Holloway Den carries two need lines, the invoice and the PO, each with the 3px need rule.
  - Ines Calder's lead card is titled by name: "wrote 2 hours ago".
  - Pell Court reads "Deposit in · 2 hours ago · Release the order".
  - Stage plates become ink words. The day line names the first three cards.
  - At 390: the first three cards.
- **B:** The Day Sheet, five sentences in this order:
  1. Holloway invoice;
  2. Ines Calder;
  3. Pell Court deposit;
  4. Fenmoor PO;
  5. Linden decline.

  Each line has its act and "Not today". Under the five: "The rest are on their jobs." Above them, the scope switch "Mine · The studio's". Below them, the line roster's first group, "Owed by you", in which Thornfield appears.
  At 390: the five lines only, then a single text act, "Every job".
- **C:**
  - The door line: "Ines Calder wrote 2 hours ago about a living room".
  - **Your move**, a table of job · what · since · act.
  - **Their move**, oldest first: Fenmoor Joinery 12 days, Halloran samples 6 days, and so on.
  - Set-aside items fold into one line.
  - At 390: the door line and the first four Your move rows.

**x2, Linden follow-up (S2).**
- **A:** Linden's card has risen with "Declined yesterday", and its Document is open at Client approvals. The reason is quoted and Follow up is the view's one filled act.
- **B:** The follow-up sheet opens over the Desk, scoped to Linden's proposal. It shows:
  - the reason in the client's words from the fixture;
  - an empty note "To Tom and Ellery Vance";
  - a named control, "Send to Tom and Ellery", with nothing sent yet.
- **C:** Linden's workspace opens at the Proposal stage. The Now panel quotes the reason and holds a draft note for review.

**x3, the PO chase (S3).**
- **A:** Orders, filtered to PO-HD-0412, with Fenmoor's contact and a follow-up draft. "All orders" is one text act away.
- **B:** A sheet scoped to PO-HD-0412 with:
  - the date sent and "no answer in 12 days";
  - Fenmoor's contact;
  - the follow-up to review;
  - "Send to Fenmoor Joinery".
- **C:** Holloway's workspace at Buying. The Now panel is the chase, and the PO row carries its inline flag.

**x4, deposit landed (S4).**
- **A:** Pell Court's Document:
  - the band reads "Deposit in · $9,200 · 2 hours ago" with "Release the order";
  - the Money region reads "↓ received $9,200";
  - there is no "Record the payment".
- **B:** The release sheet. PO-PC-0431 (Calloway & Brandt Upholstery) and PO-PC-0432 (Ninebark Lighting) can each be reviewed, with one named send per maker.
- **C:** The Now panel shows "Deposit received · $9,200 · Release 2 orders", with both POs in place.

**x5 / x9, the next step on Holloway Den (S6).**
- **A:** Today's Document with:
  - the NEXT act as the only filled control;
  - region acts as text;
  - the rail reading "Pieces · 1 PO unanswered, 12 days" and "Money · ↑ owed $3,800";
  - no coaching line.
- **B:** As A, except the band is the head of the job's list and Standing becomes "Everything open on this job · 2".
- **C:** The workspace at the Buying stage:
  - the stage lens on the left;
  - the reading paper in the centre;
  - the Now panel on white stock on the right, holding the invoice reminder;
  - "Also open on this job: PO-HD-0412".
- **At 390:** the act sits beside its reason in the sticky head, not in a bottom bar.

**x6 / x11, the hire's Desk (S5).**
- **A:** The By person facet is defaulted to Jordan. The Marsh Street card reads "Handed to you by Leah · Wed 7 Oct" and opens Leah's note. The Desk counts only Jordan's job. The PO act is "Draft the chase for Leah", never a ready send.
- **B:** Jordan's Day Sheet has two lines, the hand-off first:
  - "Leah handed you Marsh Street Kitchen on Wednesday 7 October · Read Leah's note";
  - "Marsh Street Kitchen — Ninebark Lighting has not answered PO-MS-0388 in 4 days. Leah's note asks to see anything in writing before it goes. · Draft the chase for Leah".

  The note's rule sits on the chase's own line, not on a parallel one.

  Then "The rest of the studio's jobs are Leah's" with "The studio's" one press away.
- **C:** Jordan's lanes hold Marsh only, and Leah's note sits at the top of its Now panel, above "Draft the chase for Leah".
- **All directions:**
  - The Marsh Street chase is "Draft the chase for Leah". It opens a draft that lands with Leah for a look before anything goes to Ninebark Lighting, as the hand-off note asks (direction.md Q11).
  - No studio money totals on the hire's Desk or Day Sheet. Behind them, a hire's Accounts and Orders hide studio-wide revenue and A/R only once the money-visibility rule ships: slice 2 under B and C, slice 3 under A (direction.md Q10). Until then Accounts still prints them to every viewer (`accounts-book.tsx:87-88`).

**x7, close the day (S8).**
- **A:** The roster in the evening, in honest custody groups. Owed cards remain, and there is no stated end. Draw A's "partly" honestly.
- **B:** "Nothing needs you tonight."
  - **Coming back:** Garnet Hill on Tuesday; Chen Residence on Friday 16 October, with its reason.
  - **Waiting on**, each with its date: the Holloways, Fenmoor Joinery, Ines Calder, Tom and Ellery Vance, Calloway & Brandt Upholstery, Ninebark Lighting, the Halloran samples.
- **C:** The end of the evening round, "The round is done", with the same coming-back and waiting-on lines. Position words only, with no progress bar (V11).

**x10, Holloway reminder on the phone (S4).** Holloway's sticky head reads "Overdue 14 days · INV-2026-0721 · $3,800". "Send reminder" sits beside it and opens the reminder to review. Draw the opened sheet.
- **A and B:** today's Document, with the act moved up beside its reason.
- **C:** the Now panel, stacked full width.

### 2.3 Every frame

- **Proposed canvas:** 1440 × 900, or 390 × 844, inside a `data-frame="frame-xN"` element.
- **Caption:** frame id, scenario, the moment, and the estimated clicks and seconds from direction.md §3 marked "est.".
- **Today figure** under the canvas: `<img src="../walk/<before>" alt="…">`, whose alt text names what today's screen shows. It is hidden by `&nobefore`.
- **Pins:** up to four numbered annotation pins naming what changed and why, each citing a finding id (for example "R2-01"). They are hidden by `&nopins`. A pin never sits over text it explains.
- **Fixture notice:** a small "Illustrative fixture · not a real studio" line in the frame's foot.

## 3. Fixture: Leah's studio [illustrative]

These names are invented. No real client, maker or company appears, and none may be added. The studio owner is Leah Hartwell; the walk used the same seat name.

**Studio:**
- Hartwell Studio, with 16 live engagements.
- Owner: Leah Hartwell (LH).
- Hire: Jordan Reyes (JR), handed Marsh Street Kitchen on Wednesday 7 October 2026.
- **Today:** Monday 12 October 2026. The Desk landing is at 8:40 am; the close of the day is at 5:50 pm.

**Jobs that need the studio on Monday.** Ranks are the B sheet's order; A and C use the same facts.

| Job | Client | Fact | Act | Rank |
|---|---|---|---|---|
| Holloway Den | Nora and Sam Holloway | INV-2026-0721, $3,800, due Mon 28 Sep, 14 days overdue | Send reminder | 1 |
| Ines Calder (lead) | Ines Calder | New inquiry at 6:35 am: living room, budget $40–60k, "We just moved in and the living room is empty except for a piano." | Reply | 2 |
| Pell Court Dining | Rosalind Fairweather | Proposal signed Sun 11 Oct; deposit $9,200 paid Mon 6:10 am | Release the order: PO-PC-0431 to Calloway & Brandt Upholstery, PO-PC-0432 to Ninebark Lighting | 3 |
| Holloway Den | Nora and Sam Holloway | PO-HD-0412 to Fenmoor Joinery, sent Wed 30 Sep, no answer in 12 days | Chase the maker | 4 |
| Linden Place Living Room | Tom and Ellery Vance | Declined Sun 11 Oct: "The sofa is over budget; can we see a second option under $6,000?" | Follow up | 5 |
| Thornfield | the Ashbys | Proposal signed Fri 9 Oct, before a project exists | Open the project | 6 |
| Garnet Hill | the Okafors | Declined Thu 8 Oct, "postponing until spring" | Follow up | 7 |
| Halloran Library | Mae Halloran | Fabric samples sent Tue 6 Oct, not yet opened | none (waiting on) | — |
| Chen Residence | the Chens | Balance to Calloway & Brandt, $3,400, due 12 May, on hold; set aside Fri 9 Oct until Fri 16 Oct, "waiting on the Chens' bench decision" | none until Friday (A shows it first: no defer) | — |

The Fenmoor chase and the Holloway reminder are on one job. In A they are two lines on one card; in B two sentences; in C two rows.

**Jordan's job:** Marsh Street Kitchen, for the Brannigans.
- PO-MS-0388 to Ninebark Lighting, sent Thu 8 Oct, with no answer in 4 days.
- Leah's hand-off note, an **illustrative fixture line** invented for the specimens: "Marsh Street is yours. The Brannigans like a call before anything is ordered; ask me before anything goes out in writing."
- It is not the walk's note. The walk seeded a different line ("…ask me before anything goes to the client.", `walk/seed_uplift_walk.sql:63-66`), and that note never showed on Jordan's Desk (`walk/WALK.md:116`).
- Because the fixture note covers anything in writing, the PO chase on Marsh Street is a draft for Leah in every direction, never a ready send.

**The rest.** Aldous Lane, Brierley Mews, Copperfield Terrace, Dunmore Road, Elm Quay and Fairlight Close are in progress, with nothing owed by Leah today. Their Friday Pulses become one line on Friday ("Review and send 6 Pulses") and do not appear on Monday. Greaves Court Bath is at rest, with everything read and nothing open.

**At 5:50 pm.**
- **Handled today:** reminder sent to the Holloways; Fenmoor chased; Ines replied to; both Pell Court orders released; Linden followed up.
- **Not today:** Garnet Hill, which comes back Tuesday 13 October.
- **Still set aside:** Chen, until Friday 16 October.
- **Waiting on:**
  - the Holloways, since Mon 12 Oct;
  - Fenmoor Joinery, since Mon 12 Oct (PO sent 30 Sep);
  - Ines Calder, since Mon 12 Oct;
  - Tom and Ellery Vance, since Mon 12 Oct;
  - Calloway & Brandt Upholstery and Ninebark Lighting, since Mon 12 Oct;
  - Mae Halloran, the samples, since Tue 6 Oct.

**Money shown on Leah's frames:** only the amounts above. The hire's frames show no studio revenue, A/R or margin. A hire's Accounts and Orders hide them only once the money-visibility rule ships (§2.2 x6, direction.md Q10).

## 4. Visual latitude

Canon is waived for the specimens (BRIEF §2). Each direction gets **one coherent look**, changes only what its idea needs, and keeps everything else as today's portal. Start from today's tokens (`apps/designer-portal/app/globals.css`):
- paper: `--color-off-white #FAF7F2`, `--doc-paper #FCFAF6`, `--doc-rail-stock #E8E3DB`;
- inks: `--color-charcoal #2C2926`, `--text-muted #4E4339`, `--text-subtle #5A4E43`, `--text-faint #65594E`;
- pigment inks: `--color-clay-ink #7C5E30`, `--color-terracotta-ink #9C5340`, `--color-golden-hour-ink #79651E`, `--color-sage-ink #5F6B57`;
- fonts: Playfair Display, Inter and DM Mono, from Google Fonts.

| Direction | The look | Changes only |
|---|---|---|
| A, Quiet marks | Today's portal | Plates become ink words. The one 3px terracotta-ink need rule, for class 1 or 7 days or older; newer needs get weight only. One filled act per view. Sentence-case acts at 14px. Time words. A truthful rail with ↓ / ↑. |
| B, The Day Sheet | A typeset letter on today's paper: the sheet in Inter 17/26, no cards, no colour anywhere on the Desk; order and words carry urgency | The Desk top becomes the sheet and the grid becomes the line roster. The Document is as A, with the band reading the list. Act sheets are scoped to one record. |
| C, The job workspace | Two stocks: beige for reading, white (#FFFFFF, a hairline in `--doc-rail-stock`) for working. The Now panel and the Desk lanes are white; the reading paper stays beige | The Document becomes three columns: a 200px stage lens, the paper, and a 480px Now panel. The Desk becomes lanes and a door line. The Round is a full-width white sheet. |

**Not waived on any specimen:**
- **Calm:** no badges, unread dots, counters, streaks, progress bars, "cleared today", or red/green status. B's sheet has no overflow count.
- **Words:** "Designer-Taught Intelligence", never "AI".
- **Accessibility:**
  - body text at least 4.5:1 against its ground, and 3:1 for 18px text;
  - no meaning by colour alone: the need rule always has words beside it;
  - real `<button>` and `<a>` elements with visible focus;
  - every before image has alt text;
  - nothing smaller than 12px.
- **Honesty:**
  - the fixture is labelled as illustrative;
  - estimates are marked "est.";
  - no invented statistics;
  - no words attributed to Leah or any real person, except the transcript lines direction.md cites.
- **Sending:** nothing on any frame sends on its own. Every send is a named second control ("Send to Fenmoor Joinery").

## 5. Build rules

1. **Self-contained HTML.** One file per direction and width. Inline CSS and JS. Nothing is fetched except Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`). No CDN scripts, no remote images. Inline SVG is fine, including its `xmlns`. Any `data:image` base64 payload must stay at or under 20 KB (20,480 base64 characters).
2. **Before images** are referenced only as `../walk/<file>.jpg`, the file named in §2.1.
3. **Frames.** Each frame is one element carrying `data-frame="frame-xN"`, using the ids in §1.
4. **The hash shows one frame.**
   - `#frame-xN` shows only that frame, with no page chrome.
   - `&nobar` hides the caption bar, `&nopins` hides pins, and `&nobefore` hides the today figure. Tokens may come in any order, for example `#frame-b3&nopins&nobefore`.
   - With no hash, every frame shows in order, with a sticky bar of `data-go="frame-xN"` buttons.
   - Listen to `hashchange`.
5. **No horizontal scroll at 390.** In the 390 files, `document.documentElement.scrollWidth` must not exceed 390 in any single-frame view. Use a 16px side gutter. Long sentences wrap; no `white-space: nowrap` on prose.
6. **Sentinel.** The last non-empty line of every file is exactly `<!-- SPECIMEN COMPLETE -->`. Write it last, so that a truncated file fails the gate.
7. **Marks at rest.** At render check, count marks in each frame-1 and frame-5 canvas by WALK's method: buttons, links, colour accents and numbers in the first viewport. Compare the counts with direction.md §3. A difference of more than 4 means either the frame or the estimate is wrong; fix one of them.

## 6. Gate

```
node artifacts/designer-portal-uplift-2026-10-09/specimens/check.mjs        # all three directions
node artifacts/designer-portal-uplift-2026-10-09/specimens/check.mjs b      # one direction
```

`check.mjs` reads §1 and §2.1, and for every file it checks that:
- the file exists;
- its last non-empty line is the sentinel;
- every `data-frame` id listed in §1 is present;
- every before image named in §2.1 for those frames exists in `../walk/` and is referenced as `../walk/<file>`;
- no `src`, `href`, `srcset`, `poster`, `action`, CSS `url()`, `@import` or `fetch()` points at an http(s) or protocol-relative URL outside the two Google Fonts hosts;
- no `data:image` base64 payload is over 20 KB.

It exits 0 when every file passes and 1 otherwise, naming each failing file and each problem. A bad direction argument exits 2. Until the specimens are built it exits 1 and names all six `proposed-*.html` files as missing. That is expected.

**Render check** (after the gate passes): render each file with `artifacts/people-room-crm-2026-09-11/tools/render.mjs`, using `--widths` 1440 or 390 and `--hashes` from `frame-x1&nobar` to `frame-x11&nobar`. Then confirm:
- there is no horizontal scroll at 390;
- no console errors;
- the marks counts are within 4 of the estimates.

Keep render output under the ticket's evidence folder, never in the repo.
