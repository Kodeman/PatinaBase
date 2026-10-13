# US-28 build walk — the built portal against the proposed specimens (SQ-834)

Walked 2026-10-13 at feat/portal-uplift **39e74f1e1**, locally (designer `next dev` :3005, client portal :3006, local Supabase, seed `seed_uplift_walk_v2.sql`, migrations 00766/00767 applied). Read-only: nothing was fixed. Compared against `artifacts/portal-uplift-2026-10-12/specimens/*.html` (proposed frames, incl. boardroom and specbook) and the US-27 walk (`../walk/WALK.md`).

## 0. Method

- **Viewports:** 1440×900 and 390×844, Playwright Chromium, signed in as Leah (designer) and Jordan (the hire, Desk only). Dock geometry was additionally swept at 1280.
- **Per capture:** `scrollWidth` vs viewport (horizontal scroll), elements whose text overflows its box (truncation), visible controls under 44 px on either axis, computed `box-shadow` that is not fully transparent, filled acts (a control with a solid non-paper background), and **marks at rest** as `text · controls · colour · edges`.
- **Marks counter caveat:** the counter is re-implemented from US-27 WALK §0 definitions, not SQ-786's verbatim script, so the numbers are comparable in direction, not to the digit. Its raw colour count includes some near-white paper stocks (an HSL saturation quirk). Desk/Plans reproduce US-27 closely (Plans identical, 11 · 6 · 1 · 4), which is the sanity check.
- **Dev-only noise excluded:** the Next dev indicator and TanStack devtools are hidden before every shot. The **TESTER** pill (Tester Notes widget) is not dev-only and is left in, and it counts as one filled act on every page.
- **Raw metrics** (JSON) live outside the repo: `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-834/` (`pass1.json`, `pass2.json`, `docksweep.json`, `room-*.json`, `share.json`, `ledger.json`, the exported PNG).
- **Screenshots** are in this folder, compressed with `sips -Z 1600`, about 12 MB total. Names are `b<area>-<surface>-<fold|full>-<width>.jpg`.

**Severity scale:** BLOCKER (a user can't do the job), HIGH (a user would misread or miss something important), MEDIUM (visibly not the specimen; costs a beat), LOW (polish or a ruling).

## 1. Cross-cutting results (all areas)

| Check | Result |
|---|---|
| Horizontal scroll | **None** at either width on any route walked (scrollWidth = viewport everywhere). |
| Truncation | **None detected** by the probe. Visible wraps that are not ellipsis are listed per area. |
| Shadow | **No visible shadows.** The only non-none computed shadows are transparent Tailwind ring stacks (`li.group` on /library/[id], `input` on the board, the Export dialog root). The Share dialog shows a soft lift. |
| More than one filled act | **No page has two filled acts of its own.** The TESTER pill (black/yellow) is the one filled object everywhere. Share dialog: one filled tan act, "Create and copy share link". |
| Targets < 44 px | Mostly inline links in prose: Desk project-name links are 27 px tall, the Build room has 58 chips, Preferences has 7. Per-area counts are below. |

### BLOCKER — the fixed dock collapses at desktop widths (1180 px and up)

- **Where:** every route using the "section" dock: /doc/* (paper, pieces, plans, spec book, boards tab), /rooms, /room/*/file, /people, /library, /library/[id], /library/judgments, /drafting, /compose, and the ceremony (/project/*).
- **What happens:** at 1440 and 1280, `nav.fixed.bottom-0 … min-[1180px]:grid grid-cols-[1fr_auto_minmax(max-content,1fr)]` squeezes the label span (`span.min-w-0`) to **0 px wide**.
  - The label letters stack one per line, 198–306 px tall ("P / R / O / …" beside the TESTER pill).
  - All 8 dock buttons are pushed to y ≥ 942, **below the 900 px viewport**.
- **Not affected:** Desk and /boards use the other dock and are fine. /help and /preferences have no dock.
- **What a user misreads:** the desktop user has no section nav and no dock acts (Ledgers, Find, More actions). The vertical letter column reads as a rendering bug.
- **Evidence:** `docksweep.json` (`label 0x198 … offscreen 8`), and the bottom-left of `b7-compose-fold-1440.jpg` and `b7-ceremony-fold-1440.jpg`.

### HIGH — the TESTER pill covers live controls

- **At 1440 on the board room:** the pill sits over **EXPORT** (button at 14,832, 61×44). A real pointer click hits the pill, so Export cannot be reached by mouse at 900 px height. Playwright clicks time out; only a dispatched click opens it.
- **At 390:** the pill overlaps the "Ledgers" item in the More sheet, the Accounts invoice rows, and the "Section name" field in the Tools sheet.
- **Is this the build?** The specimen chrome-p6 shows a quiet TESTER mark above the dock, not a black pill floating over content.

## 2. Area × width verdicts

Marks shown are `text · controls · colour · edges` at the fold, and "US-27" is the same surface in the US-27 walk.

### 1. Desk (Leah; Jordan)

| Width | Verdict | Marks (US-27) | <44 | Notes |
|---|---|---|---|---|
| 1440 | **Match, minor deviations** | 50 · 28 · 15 · 28 (45 · 18 · 9 · 12) | 4 | |
| 390 | **Deviation, MEDIUM** | 26 · 14 · 7 · 11 (25 · 9 · 4 · 8) | 2 | |
| Jordan 1440 | **Match** | 28 · 14 · 7 · 18 | 1 | |
| Jordan 390 | **Match, the same 390 dock deviation** | 23 · 11 · 6 · 12 | 1 | |

**Desk at 1440**
- Cards, ledger and no filled act match the specimen.
- Defaults to **MINE**, where desk-p1 shows the studio's scope. LOW, a ruling.
- An extra "Until…" act row.
- The ledger act column wraps "CONTACT THE CLIENT" over two lines.
- An extra STUDIO RESOURCES footer.
- Marks rose against US-27: controls 18→28, edges 12→28.

**Desk at 390**
- Find sits on its own line.
- The dock is a dark ink band ("STUDIO NAVIGATION / Studio overview · ··· MORE ACTIONS"). The specimen chrome-p6 has a light "STUDIO SECTION / ··· MORE" band.
- The TESTER pill overlaps the card below.

**Record-payment sheet** (`b8-record-payment-sheet-*`)
- **Cents-exact amounts ✓:** "$3,800.00 open" and "RECORD $3,800.00".
- **Deviations, MEDIUM:**
  - The commit act is an underline link, not money-p3's filled ink button.
  - The amount input is narrow.
  - The date is a native mm/dd/yyyy field with a "Choose a date from the calendar" hint.
  - Put back / Esc sits in the header.
- Marks 11 · 6 · 3 · 13 at both widths.

**Undo** (`b1-desk-settled-*`, `b1-desk-undone-*`)
- "Not today — Chen Residence" was acted on, then undone.
- **Focus returns to "Record the payment — Chen Residence" ✓.**
- **Status reads "Chen Residence: Undone." ✓**
- The restored card shows a tinted, lifted background for a beat. LOW.

### 2. Document — paper, pieces, plans, spec book, boards tab

**Paper (Holloway)**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | **Deviation, MEDIUM-HIGH** | 36 · 17 · 14 · 10 (37 · 17 · 15 · 12) |
| 390 | **Deviation, MEDIUM** | 22 · 12 · 9 · 6 |

At 1440:
- The first-run teaching hint "The band says what's next… UNDERSTOOD" and a boxed margin onboarding note remain.
- The head has extra acts: SET DATES, SHARING, PROJECT DIRECTORY · 0.
- Sections are large Playfair headings ("Client approvals") with Collapse/Expand and an inset "Schedule dates" box. The specimen has a mono Section header with ticks plus rows.
- The margin "THE WHOLE JOB" box is edged.
- Whole Home: 32 · 14 · 10 · 9 at 1440, 21 · 11 · 7 · 6 at 390.

At 390:
- "SEND REMINDER" appears **twice**: in the head band and as the dock act.
- "MESSAGE THE CLIENT" and "WRITE TO YOUR CLIENT" are two acts for one job.

**Pieces / Build room**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | **Unchanged, by design (non-goal V15)** | 51 · 61 · 0 · 58 (51 · 13 · 0 · 60) |
| 390 | **Unchanged, by design** | 16 · 11 · 0 · 21 |

- 58 targets under 44 px at 1440 (chips).
- The controls figure differs because of the counter, not the page (see §0).

**Plans**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | **Deviation, MEDIUM** | 11 · 6 · 1 · 4 (identical) |
| 390 | Same | 11 · 6 · 1 · 4 |

- Unchanged from US-27.
- The dashed-edge "Start the current drawing set" box is not the single empty-state component in chrome-p5.

**Spec book**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | **Structure match; HIGH defect** | 37 · 21 · 1 · 11 (100 · 26 · 10 · 62) |
| 390 | Same | 24 · 15 · 2 · 6 |

What matches:
- It opens at rest.
- The tab reads **"Specification"** ✓.
- Chapters and Show filters are present.
- Marks are far quieter than US-27.
- **The opened piece shows the trade price $184.00 ✓.**

**HIGH:** the state column prints raw field keys, "NO DESIGNDISPOSITION, DOCUMENTCODE, IMAGE, ITEMTYPE…", breaking mid-word. A designer reads internal schema names as the item's state.

Other deviations:
- Incomplete lines say "OPEN" rather than the specimen's "ADD A FINISH".
- The title is "— Spec Book", not "· specification book".
- The opened piece doubles "Not specified / Not specified" lines.
- The opened row is tinted.
- No plates appear, and only the Wallcovering and Unsorted chapters show; both may be fixture data.

**Boards tab**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | **Deviation, LOW** | 9 · 2 · 1 · 3 (8 · 3 · 2 · 3) |
| 390 | Same | 9 · 2 · 1 · 3 |

- "Start the first mood board" sits in a dashed box.
- The duplicate "NEW BOARD" act is **KNOWN (SQ-852)**.

### 3. Rooms — rooms list, room, room file

**Rooms list**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | **Deviation, MEDIUM** | 21 · 6 · 10 · 20 (26 · 7 · 10 · 35) |
| 390 | **Deviation, MEDIUM** | 22 · 6 · 16 · 20 |

- The old white head band (← BACK · ornament · MEASURED ROOMS) remains. The specimen has a Header line with "Scan a room".
- Cards lack the "Open the scan / room file" act.
- The brief's stage edge is blue.

**Room**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | Same as US-27 | 5 · 2 · 7 · 6 (4 · 1 · 6 · 1) |
| 390 | Same | 8 · 3 · 13 · 6 |

- "The room plan is not available yet."

**Room file**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | **Deviation, LOW-MEDIUM** | 9 · 2 · 2 · 7 (7 · 1 · 2 · 0) |
| 390 | Same | 12 · 3 · 8 · 7 |

- The empty state is a centred italic message, not the one empty-state component.
- "SURVEYED OCTOBER 7, 2026" uses US date order.
- The back link reads "OPEN KITCHEN".

### 4. People

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | **Deviation, HIGH (largely unbuilt vs people specimen)** | 40 · 14 · 0 · 34 (40 · 18 · 6 · 72) |
| 390 | Same | 19 · 10 · 0 · 13 |

- The old head band remains.
- A left "IN THIS ROOM" sidenav lists Contact directory / Client relations / Studio marketing / The Engine.
- There are 6 tabs plus My/Studio sub-tabs.
- The search line is borderless.
- Inbound rows have no act and no kind column.
- Edges halved against US-27; the structure is unchanged.

### 5. Library — library, piece, judgments

**Library**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | **Deviation, MEDIUM** | 30 · 15 · 8 · 13 (32 · 13 · 15 · 33) |
| 390 | Same | 31 · 16 · 14 · 13 |

- The old head band remains.
- The default shelf is PERSONAL, and there is no "All shelves".
- The italic empty state matches.
- Search "Holloway" was not walked.

**Piece**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | Close | 34 · 8 · 10 · 21 (35 · 6 · 13 · 32) |
| 390 | Close | 26 · 7 · 16 · 18 |

**Judgments**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | Close | 11 · 6 · 9 · 14 (10 · 5 · 6 · 9) |
| 390 | Close | 14 · 7 · 15 · 14 |

### 6. Boards — index, board room, client share

**Boards index**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | **Match** | 5 · 1 · 0 · 3 (12 · 6 · 2 · 2) |
| 390 | **Match** | 5 · 1 · 0 · 3 |

- The head act is New board, as intended.

**Board room** (board "Palette + materials study", created for this walk)

| Width | Verdict | Marks (specimen) |
|---|---|---|
| 1440 | **Deviation, MEDIUM** | 37 · 34 · 11 · 40 (specimen today 44 · 31 · 8 · 74) |
| 390 | **Deviation, MEDIUM** | 13 · 15 · 9 · 23 |
| Selected | **Match** | — |
| Export | **Match, MEDIUM** | 10 · 5 · 0 · 12 |
| PNG vs screen | **Match, LOW** | — |
| Share dialog | **Deviation, LOW** | 13 · 5 · 1 · 9 |
| Tools sheet 390 | **Match** | 23 · 18 · 0 · 13 |

Rest at 1440:
- The title is set in sans, not Playfair.
- There is no back link and no double Header rule.
- The canvas zones run past the right edge and are clipped (the 4th palette swatch and the 3rd frame).
- Placeholder frames are tilted and dashed.
- The "Browse resource library" button and the section inputs are boxed.
- Tool words have no underlines.

Rest at 390:
- It opens at 100%, not fit, so only the left fragment of the first zone is visible.
- "Press Escape again to leave the board" toast appears.

Selected (1440):
- The selection ring and the 8 handles plus the rotate handle are clear.
- The inspector shows Lock pin, Replace image, Delete reference.
- The on-canvas lock word was not exercised.

Export:
- The dialog offers PNG 2× 2400×1800, PDF, and Spec sheet PDF.
- Option cards are edged with a rounded sheet.
- Reaching it is blocked by the TESTER pill (see §1).

PNG vs screen:
- The exported PNG matches the composition (palette, 3 frames, note, zones).
- The PNG shows the **whole** canvas, which the screen clips.
- Placeholder frames are drawn with **solid** edges in the PNG but **dashed** on screen.
- Drag grips and zone chips are omitted, as expected.

Share dialog:
- A rounded, lifted sheet with one filled tan act.
- The link field truncates the token visually; it is an input, so this is expected.
- "could not be copied automatically" appears (headless clipboard).

Tools sheet at 390:
- A modal sheet with PUT BACK.
- Focus lands on the TOOLS heading, which shows a focus box.
- The TESTER pill overlaps "Section name".

**Client guest `/share/[token]`** (client portal :3006)

| Width | Verdict | Marks |
|---|---|---|
| 1440 | **Match** | 9 · 0 · 7 · 26 |
| 390 | **Deviation, MEDIUM** | 6 · 0 · 3 · 7 |

- **At 1440:** the read-only canvas has zones and frames. It is quiet, with no acts.
- **At 390:** the stacked reading view **drops the three Materials placeholders** (Textile / Stone or surface / Wood or finish). MATERIALS shows only the note. A client on a phone sees a materials section with nothing in it, while the desktop shows three tiles.
- The "BoardsBlock Present tiles" on the client project page were not walked; only the guest share route was.

### 7. Making papers — drafting, compose, ceremony

**Drafting**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | **Deviation, MEDIUM** | 35 · 10 · 13 · 24 (45 · 10 · 12 · 48) |
| 390 | Same | 23 · 7 · 18 · 19 |

- The old white band head ("← BACK TO THE DOCUMENT · PROPOSAL DRAFTING · SHARING") is stacked above the new Header line.
- Facets are split into many sections.
- The client copy has FULL / MILESTONES / CURATED tabs.

**Compose**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | **Deviation, MEDIUM** | 24 · 8 · 15 · 30 (32 · 6 · 16 · 49) |
| 390 | Same | 24 · 9 · 22 · 30 |

- The old band head ("← RESOURCE LIBRARY · COMPOSE A PIECE · SAVE DRAFT") remains.
- The current section is a double-ruled box, and each section is a boxed card.
- The broken dock is visible.

**Ceremony / project start** (/project/…0051)

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | **Deviation, LOW-MEDIUM** | 24 · 5 · 2 · 8 (24 · 5 · 2 · 16) |
| 390 | Same | 24 · 5 · 2 · 8 |

- The left rail, the "IN THE MARGIN" column, and the inquiry acts ACCEPT · BEGIN / NURTURE / PASS remain.
- A broken dock column shows bottom-left.

### 8. Money — accounts, invoice sheet, procurement, invoice print

**Accounts sheet**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | **Close, MEDIUM deviations** | 43 · 14 · 8 · 8 (64 · 21 · 16 · 40) |
| 390 | Same | 31 · 9 · 7 · 6 |

- Extras: an "Accounts · the studio's book" heading, LEDGER / RECEIVABLES / EARNINGS tabs, STUDIO EYES ONLY, an export manifest paragraph, and a "?".
- Whole-dollar amounts ($42,860, $17,500) where the specimen shows cents.
- Sorted newest first, not what-is-owed first.

**Invoice sheet INV-2026-0723**

| Width | Verdict | Marks |
|---|---|---|
| 1440 | Close | 38 · 5 · 0 · 16 |
| 390 | **Deviation, LOW-MEDIUM** | 33 · 3 · 0 · 14 |

- Labels touch their values: "SUBTOTAL$9,200.00", "TOTAL$9,200.00".
- "No lines on this invoice yet" sits beside a $9,200 total (fixture).
- US date order: "Oct 10, 2026".

**Procurement sheet**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | **Deviation, HIGH (largely unbuilt vs money-p4)** | 55 · 30 · 2 · 8 (54 · 29 · 3 · 16) |
| 390 | Not captured | — |

- The filters fill the fold.
- There are 4 sub-tabs, a THROUGHPUT strip, SELECT MULTIPLE, and APPARATUS grouping.
- "~6 May" and "—" placeholders appear.

**Invoice print**

| Width | Verdict | Marks (US-27) |
|---|---|---|
| 1440 | Close | 29 · 3 · 2 · 7 (28 · 2 · 0 · 4) |
| 390 | Same | 29 · 3 · 2 · 7 |

- The page is fixed width.

### 9. Shared chrome — dock, ⌘K, help, preferences

**Dock (section variant)**

| Width | Verdict | Notes |
|---|---|---|
| 1440 | **BLOCKER** | See §1. |
| 390 | **Deviation, MEDIUM** | |

- At 390 the dock is a dark ink band, not chrome-p6's light band.
- The More sheet is a dark popover: Find anything ⌘K, Active session time, Studio inbox NEW, Ledgers.
- The TESTER pill covers Ledgers.

**⌘K**

| Width | Verdict | Marks |
|---|---|---|
| 1440 | Close | 15 · 7 · 3 · 16 |
| 390 | Close | 15 · 7 · 3 · 16 |

**Help**

| Width | Verdict | Marks |
|---|---|---|
| 1440 | Close | 12 · 5 · 0 · 13 |
| 390 | Close | 11 · 5 · 0 · 12 |

- No dock.

**Preferences**

| Width | Verdict | Marks |
|---|---|---|
| 1440 | **Deviation, LOW** | 18 · 8 · 7 · 39 |
| 390 | Same | 18 · 8 · 7 · 39 |

- 7 targets are under 44 px.
- The edges are boxed fields.

## 3. Known, not new

- **The lens band jumps at 390** — SQ-852.
- **Duplicate "New board" act** after creating a board — SQ-852.
- **The Build room (Pieces) is unchanged** — non-goal V15.

## 4. Not walked / limits

- The procurement sheet at 390 was not walked.
- The on-canvas lock word was not walked.
- The client project-page BoardsBlock Present tiles were not walked.
- The Library search was not walked.
- The Room plan is unavailable in the fixture.
- The invoice sheet at 1440 is from pass 2; the second attempt timed out.

## Leftovers (local only, cleaned before submit)

- **Board** `9dcbdaef-031c-436e-a2a6-b5f6a4e70a9c` ("Palette + materials study", Whole Home Renovation) and its 2 `document_shares` rows were created for this walk. They were deleted from local Supabase after the walk.
- **One Desk "Not today"** on Chen Residence was acted on and undone. The local state is restored.
- **Throwaway env files** `apps/{designer,client}-portal/.env.local` were deleted. Both dev servers were stopped.
