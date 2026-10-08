# US-19 acceptance walk: five scenarios, both flags on, 1440 and 390 (SQ-504)

The gate is rulings Q8, recorded in the ADV-26 format. The walker did not build this work and read no implementation code before walking. The only code read was the Playwright config and the lens fixture header, both read after the walk to answer the e2e question.

- **Tree.** main at `70a39634e`. The orchestrator's dev server on `localhost:3000` served it with `NEXT_PUBLIC_FLAG_OVERRIDES="ask-the-paper:true,one-voice:true"`. The server was not touched.
- **Method.** Headless Playwright 1.58.2, at exact 1440×900 (DPR 2) and 390×844 (DPR 2, touch, mobile), signed in as `designer@patina.dev`. claude-in-chrome was skipped: the orchestrator's amendment 2 makes it optional, and Chrome had refused to resize in FR2–FR4. One driver process held both browsers. Each step was a single press or keypress, then a screenshot and a read of the focused element. The browsers were closed at the end.
- **Screenshots.** `delivery/walk/<width>-<scenario>-<step>.jpg`, made with `sips -Z 1600` and saved as JPEG. Raw PNGs, DB snapshots (`db-before.txt`, `db-after.txt`) and the e2e log are in `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-504/`.
- **Ground truth.** `design-review-4.md` (FR4) and rulings D1–D11.
- **Step counting.** Every click, keypress, typed query (one step) and scroll that changed the view. Scrolls on the Desk at 390 are estimated from the card's y position (about one step per 750px) and marked `≈`.

## 1. Results

| # | Scenario | Width | Success | Steps | Accuracy (PO / piece / date) | Refusal met: reason readable · read | Return path to the paper | vs US-18 baseline |
|---|---|---|---|---|---|---|---|---|
| 1 | New inquiry | 1440 | Yes | 2 (card `Respond to the inquiry` → paper; band `Respond to the inquiry` → focus `Accept · begin`) | Right lead (Marcus Wright, respond by 9 October); lead status `viewed` before and after (psql) | None on the Brief; the letterhead carries no held act | Already on the paper; Esc puts it down to the Desk | **Better**: the Desk card and the band name the act, and the band lands on the decision control. Before, the walker had to know the triad lived further down |
| 1 | New inquiry | 390 | Yes, with a defect | 3 to focus, 4 to see (≈1 scroll, card tap, dock tap, scroll) | Right lead; status unchanged | None | Already on the paper | **Better**, but the focused `Accept · begin` sits under the dock (D6) |
| 2 | Change after signature (Halloran) | 1440 | Yes | 8 (title, ⌘K, `change`, Enter, `On a piece`, Continue, scroll, the sofa line) → `Change this order` | Right piece (Linen slipcovered sofa — 96 in) on the right PO (NA-2026-077, Nordic Atelier) | `This PO was sent, so it stands as it is. The change is kept on its record — tell Nordic Atelier in writing.` Readable, read. The agreement branch's `Send to the client` is held with `Link a client first.` + `Link a client` | Esc ×2 (the first is swallowed, D10) → focus on the sofa line | **Better**: the baseline was *not found*. ⌘K's first row is `Record a change · on a piece or on the agreement` |
| 2 | Change after signature | 390 | Yes | ≈13 (≈4 Desk scrolls, title, More, Find anything, `change`, row, `On a piece`, Continue, scroll, sofa) | Right piece and PO | Same PO reason, readable | `Put back` → focus on the sofa line | **Better** (baseline not found); the path at 390 is long |
| 3 | Where is the PO for the sofa (Halloran, blocked PO) | 1440 | Yes | 7 including a failed Desk search (⌘K, `sofa` → *Nothing matches*, Esc, Halloran, ⌘K, `sofa`, Enter); 3 from the paper | Right PO NA-2026-077 focused; blocker readable: `sent to vendor 1 October · awaiting acknowledgment` | `Hold for review` refuses an empty body: `The note needs a subject and a body.` Readable, read | After the follow-up hold, focus returns to the band's `Follow up with the maker` | **Better**: ⌘K on the paper finds the piece by name and lands on the PO. The Desk-level ⌘K still finds nothing (D8) |
| 3 | Where is the PO for the sofa | 390 | Yes | 4 from the paper (More, Find anything, `sofa`, row); ≈9 from the Desk | Right PO focused at y 523–540, clear of the dock | Same | Composer `Discard`/Esc → focus on the dock act | **Better** |
| 4 | Install week: what's late (Cedar plus arrival fixtures) | 1440 | Yes | Cedar: ≈3 Desk scrolls, title, band press = 5 (held). Wren: ≈3 scrolls, title = 4, and the band answers. Ask + Hold = 2 | Right piece and date: `Library ladder and rail was due 3 October and isn't here.` (Wren); Alder `arrives Saturday 10 October`; Quill `Everything is here.`; Cedar `Side table isn't here — no date recorded.` | Cedar's `Ask the maker for a date` is held: `No maker is recorded on this line.` The press lands on `Add the maker`. Readable, read | After `Hold for review`, focus returns to the band act; the region prints `Asked 8 October · draft held for review · Open the held draft` | **Better**: the band says the late piece and its date, where the baseline's loudest line was `NEEDS SETUP`. The Desk still shows every install card at rest (D7) |
| 4 | Install week | 390 | Partial | Cedar dock press → `Add the maker` (1, focused, clear of the dock). Wren: the band prints the act alone, so "what's late" needs scrolling to the Install region (count not measured) | Right acts; the late date is not in the band at 390 (D13) | Same held reason on Cedar | After the hold, the Wren dock press lands on the `Install` heading (D4) | **Better** for the act; **same** for the reading, which needs scrolling as before |
| 5 | New hire opens someone else's job cold (Olsen) | 1440 | Yes | 0 to read the stage, what's waiting and the act; 1 press → `Notify vendor` focused in Orders · Receiving | Right PO (AP-012, open damage claim) | `Message the client` held: `Link a client first.` + `Link a client`. Readable, read | Esc → focus on the band's `File the claim` | **Better**: the eyebrow prints `PROJECT · OLSEN LAKE HOUSE` (the baseline found no stage word) and the band states the one Next |
| 5 | New hire cold | 390 | Yes, with a caveat | 0 to read the stage and the act; 1 tap → `Notify vendor` | Right PO | Same | `Put back` → focus on the dock's `File the claim` | **Better** for the stage word; what is waiting (`AP-012 has an open damage claim`) is not printed at 390, only the act (D13). Rulings line 25's reversal is not triggered: the walker succeeded |

**Nothing reaches a maker.** Both holds landed as `awaiting_review`, and `sent` stayed at 2, both rows from before the walk. No new `agent_tasks` row was written. As built under SQ-506 (story decision #4), `Ask the maker for a date` and `Follow up with the maker` write `procurement_drafts` (`kind = maker_eta_request`), not `agent_tasks`. The ticket's "one agent_tasks row" check therefore reads against the older design. The only `agent_tasks` `maker_eta_request` row predates this walk (2026-10-07 22:20Z).

```
-- agent_tasks (unchanged by the walk)
                  id                  |     task_type     |     status      |          created_at
 808f4b59-d215-46c6-a560-43b0ef8e178a | maker_eta_request | awaiting_review | 2026-10-07 22:20:33.978833+00
-- procurement_drafts, kind = maker_eta_request (both written by this walk)
                  id                  |       kind        |     status      |             ffe_item_id              |          purchase_order_id           |                      subject
 eef596b4-2e16-4927-b0f4-6d42738d120f | maker_eta_request | awaiting_review | f1900000-0000-4000-8000-000000000031 | f1900000-0000-4000-8000-000000000021 | NA-2026-077 — following up          (Halloran, 05:12:23Z)
 183b64bf-7f04-4ed3-8a87-13c067a0c69f | maker_eta_request | awaiting_review | f1900000-0000-4000-8000-000000000033 | f1900000-0000-4000-8000-000000000023 | Arrival date: Library ladder and rail · PO WS-214   (Wren, 05:15:40Z)
-- procurement_drafts by status after the walk: awaiting_review 4 · sent 2 (before: awaiting_review 2 · sent 2)
-- leads 73a3cde4… (Marcus Wright): status viewed, updated_at 2026-10-07 02:38:07Z, unchanged before and after the band press
```

**One unintended local write (D1).** On Tanaka, the region's `NUDGE MEI TANAKA` button sent a reminder on one press: `proposals f1900000-…053 last_nudged_at = 2026-10-08 05:18:48Z, nudge_count = 1`. No message appeared in Mailhog (:8025) or Inbucket (:54324). It was local only and was reported on the ticket at once. Simply opening papers also wrote rows: `project_time_entries` (keeping time), 4 `project_parties`, 2 `studio_contacts` and 1 `project_site_access_cards` (D21).

**Flag-off regression (R127 lens e2e).** The specs can technically run against the running server, because `playwright.config.ts` has `reuseExistingServer: !CI` and `baseURL` `localhost:3000`. They **cannot** measure flag-off: the server carries `ask-the-paper:true,one-voice:true`, and the config's own `webServer.env` overrides apply only when Playwright starts the server itself. They were run anyway, as `playwright test e2e/document/lens- --project=chromium`, from the main checkout's `node_modules` at the same commit: **8 failed, 1 skipped, 57 did not run** (serial files stop at their first failure). All 8 failures are one fixture precondition: `the long paper (b0000000-…00d5) is not seeded: 0 lines across 0 rooms … Run scripts/the-document-lens-seed.sql.` No product assertion ran. Seeding the long paper would be a local DB write beyond the two allowed holds, so the walk stopped there. A real flag-off regression needs a server started without the two overrides, plus the lens seed applied.

## 2. Per-scenario narrative

### Scenario 1: a new inquiry arrives
The Desk opens with `Three things are overdue — Chen, Halloran and Aspen.` Four Brief cards each read `New lead — respond by …` with **`RESPOND TO THE INQUIRY`**, which is FR4 Fix 5 as ruled (`1440-s1-01-desk`). Pressing the card's act opens the paper (`1440-s1-02-card-press`). The band prints `BRIEF · FULL ROOM` / `NEXT ─ RESPOND TO THE INQUIRY`, and the letterhead carries no Message or Preview (524-d). Pressing the band focuses **`ACCEPT · BEGIN`** and accepts nothing: the lead was `viewed` before and after (`1440-s1-03-band-press`). A new hire would still ask what "respond" means when the page offers Accept · begin / Nurture / Pass and no reply. The band names the outcome, but the paper doesn't say that Accept is the reply. At 390 the dock's centre act does the same, but the focused button sits behind the dock (`390-s1-03-dock-press`, D6). Esc on the landing puts the paper down to the Desk, with focus on BODY.

### Scenario 2: the client asked for a change after signing (Halloran House)
The Pieces head shows `RECORD A CHANGE`, but it sits below the fold. A new hire who tries ⌘K `change` gets `Record a change · on a piece or on the agreement` as the first row (`1440-s2-02-cmdk-change`). The chooser (`1440-s2-03-record-a-change`) offers *On a piece: swap, add or remove a piece, or change its finish, size or maker* and *On the agreement: the scope, the fee or the terms*.

**On a piece.** The paper enters `Choose the piece · Put back · Esc`, but the prompt sits above *Plan the project work* and *Folio*, and the line is one scroll further down (`1440-s2-04-on-a-piece`, D12). Choosing the sofa opens **Change this order** (`1440-s2-06-piece-chosen`) with `Cancel` preselected, then Credit, Claim, Change the maker and Remedy. There is no finish or size change, although the chooser promised one (D9). It prints a clear reason: `This PO was sent, so it stands as it is…`.

**On the agreement.** This opens the Amendment (`1440-s2-08-on-the-agreement`), where `Send to the client` is held with `Link a client first.` and `Link a client`. It is a well-formed held act.

Esc on Change this order needed two presses (D10). At 390 the same path works through More → Find anything, with a `CLOSE` header where 1440 says `PUT BACK · ESC`.

### Scenario 3: where is the PO for the sofa (blocked PO)
From the Desk, ⌘K `sofa` returns `Nothing matches "sofa"` and offers no "search all jobs" row (`1440-s3-01-desk-cmdk-sofa`, D8). On Halloran's paper, ⌘K `sofa` returns `Linen slipcovered sofa — 96 in · Nordic Atelier · Released to maker · PO NA-2026-077 ↵ Open the order` (`1440-s3-02-paper-cmdk-sofa`). Enter lands with focus on the PO button `NA-2026-077`, whose cell reads `sent to vendor 1 October · awaiting acknowledgment`. That is the PO, the piece, the date and the blocker in three steps (`1440-s3-03-open-the-order`). Directly above it, a `What they confirmed` form is prefilled with the ordered values, all marked `agrees`, with `Everything agrees — log it`. On a PO nobody has acknowledged, a new hire could read that as confirmed (D17).

The band's `Follow up with the maker` opens the maker composer: `To Nordic Atelier`, subject `NA-2026-077 — following up`, body focused, and `A held note waits for review. Nothing reaches the maker until a person sends it.` (`1440-s3-04-follow-up`). That is FR4 Fix 6 as ruled. `Hold for review` showed `HOLDING…` for 15.8 s on the first call, then wrote the row (D19). Afterwards the band still says `Follow up with the maker`, and the line carries no trace of the held note. Standing grew to 5 with a row reading `Arrival date request to the maker drafted · Follow up with the maker` (`1440-s3-08-standing`). A second press opens an empty composer that doesn't mention the held note (D5).

### Scenario 4: install week, what's late
Cedar's band prints `Side table isn't here — no date recorded. · ASK THE MAKER FOR A DATE` (`1440-s4-01-cedar`). The press lands on `ADD THE MAKER` beside the region's held copy and its reason `No maker is recorded on this line.` (`1440-s4-02-cedar-ask-held`). Cedar has no dated piece, so "what's late" is answered by the arrival fixtures:
- Wren: `Library ladder and rail was due 3 October and isn't here.`
- Alder: `Pair of stoneware bedside lamps arrives Saturday 10 October. · HOLD A WINDOW`
- Quill: `Everything is here. · OPEN THE PUNCH LIST`

The Desk shows all four install cards `AT REST · Nothing needs your hand`, including Wren with its late piece (D7). On Wren, `Ask the maker for a date` opens a fully written note: `Arrival date: Library ladder and rail · PO WS-214`, *"We had it due 3 October, and it hasn't arrived."*, body focused (`1440-s4-05-wren-ask-sheet`). `Hold for review` holds it, and the region then prints `Asked 8 October · draft held for review · OPEN THE HELD DRAFT` (`1440-s4-06-wren-held`). The band, however, switches to `Arrival date request to the maker drafted · FOLLOW UP WITH THE MAKER`, and pressing that lands on the `Install` `<h2>`, not a control, at both widths (`1440-s4-07-wren-followup-after-hold`, `390-s4-04-wren-dock-press`, D4). At 390 every install paper's band prints the act alone (`data-lens-line2-form="act"`), so the late date isn't readable at the top (D13).

### Scenario 5: a new hire opens Olsen cold
At 1440 the top reads `PROJECT · OLSEN LAKE HOUSE` / `NEXT ─ AP-012 has an open damage claim · FILE THE CLAIM · Standing · 6` (`1440-s5-01-olsen-cold`). The stage, what's waiting and the act are all readable with zero presses. The press lands with focus on **`NOTIFY VENDOR`** in Orders · Receiving (FR4 Fix 3 as ruled), and Esc returns to the band act.

The Standing door lists the claim, `Send the purchase order`, `Spec the 3 unspecified` and four setup rows:
- `Spec` lands on `Edit spec details →`, a control.
- `File the claim` lands on `Notify vendor`, a control.
- **`Send the purchase order` lands on the Pieces `<h2>`** (D3), still FR4's failure.

The left rail and the dock name the paper "the client" in lower case, because no client is linked (D14). At 390 the band prints `NEXT ─ FILE THE CLAIM` alone, and the tour note `The band says what's next on this job. Press it.` sits below it. The landing works the same way.

### The orchestrator's checklist (amendment 5)
| Check | Result |
|---|---|
| Olsen `File the claim` lands on a control | **Pass** at both widths: `Notify vendor` focused (still labelled *vendor*, D16) |
| Halloran `Follow up with the maker`: composer, subject, body focus, held, nothing sent | **Pass**: subject `NA-2026-077 — following up`, body focused, `awaiting_review` row, `sent` unchanged |
| Standing-sheet rows land on controls | **Part**: Spec and Claim pass; Olsen `Send the purchase order` → Pieces `<h2>` (D3) |
| Aspen/Tanaka composer: Esc closes and returns focus | **Fail**: Aspen Esc leaves the composer open and the textarea focused (D2). Tanaka's band opens no composer at all (D1) |
| Harrow `Open the pieces` lands on the first line | **Pass**: `Pair of rattan lounge chairs · ×2` focused |
| Cedar Desk card at rest with `Open the job`; Brief cards `Respond to the inquiry` | **Pass** |
| Band `Respond to the inquiry` focuses `Accept · begin`, lead unchanged (psql) | **Pass**: `viewed` before and after |
| Tanaka prints `Nudge Mei` and `Waiting on Mei` in the band and composer; Desk `Nudge Mei` | **Part**: band `NUDGE MEI` and Desk `NUDGE MEI` pass. `Waiting on Mei` prints nowhere, the band press opens no composer, and the region says `NUDGE MEI TANAKA` (D1) |
| Aspen keeps `Nudge the client`, never `Client User` | **Pass**: band `NUDGE THE CLIENT`, placeholder `A quick note to the client…`, helper `It lands in the client's portal messages.`, no `Client User` anywhere on the paper |

## 3. Defects (all, unfiltered)

Severity follows FR4: high = a Next act that lies or does nothing; medium = a ruled behaviour missing on a walked path; low = copy, grammar, polish. Confidence is in the finding.

| # | Defect | Sev. | Conf. | Evidence |
|---|---|---|---|---|
| D1 | **Tanaka:** the band's `NUDGE MEI` lands on the proposal region `<div>`, out of view, with no composer. Esc then puts the paper down. The region's `NUDGE MEI TANAKA` **sends a reminder on one press**, with no composer and no confirmation (`NUDGED 8 OCTOBER · REMINDER SENT TO MEI TANAKA.`), while Aspen's Nudge opens a composer. `Waiting on Mei` prints nowhere. The label differs between band (`Nudge Mei`) and region (`Nudge Mei Tanaka`) | **high** | high | `1440-x-tanaka-composer`, `1440-x-tanaka-region-nudge`; proposals nudge_count=1 |
| D2 | **Aspen:** Esc from the nudge composer does not close it; the textarea stays focused (FR4 Fix 2, Esc half) | medium | high | `1440-x-aspen-composer` |
| D3 | **Olsen:** the Standing row `Send the purchase order` lands on the Pieces `<h2>` (FR4 Fix 4, not landed for this row, or the server is stale) | medium | high | `1440-s5-04-olsen-send-row-landing` |
| D4 | **After `Hold for review` on Wren:** the band reads `Arrival date request to the maker drafted · FOLLOW UP WITH THE MAKER` while the region reads `Open the held draft`. The band press lands on the `Install` `<h2>` at 1440 and 390. The lateness fact drops out of the band | medium | high | `1440-s4-06-wren-held`, `1440-s4-07-…`, `390-s4-04-…` |
| D5 | **After the Halloran follow-up hold:** the band and the line cell are unchanged. Pressing again opens an empty composer that doesn't mention the held note, so duplicates are possible. The Standing row calls the follow-up an `Arrival date request…drafted` and repeats `Follow up with the maker` | medium | medium | `1440-s3-07-after-hold`, `1440-s3-08-standing`, `390-s3-03-follow-up` |
| D6 | **390 Brief:** the dock press focuses `Accept · begin` at y 740–784, under the dock (top 751); the control is occluded | medium | high | `390-s1-03-dock-press` |
| D7 | **Desk:** the Wren Street card reads `AT REST · Nothing needs your hand` while its band says the ladder was due 3 October and isn't here. This contradicts 521: "the card must not contradict" the band. Desk changes are out of scope for US-19 | medium | high | `1440-s1-01-desk` (Desk text) |
| D8 | **Desk ⌘K:** `sofa` → `Nothing matches`, with no "Search all jobs" row; the paper's ⌘K has one. Scenario 3's first move, from the Desk, still dead-ends | medium | high | `1440-s3-01-desk-cmdk-sofa` |
| D9 | **Record a change → On a piece** promises "change its finish, size or maker". On a sent-PO line it opens `Change this order` with **`Cancel` preselected**, and offers no finish or size option | medium | medium | `1440-s2-06-piece-chosen` |
| D10 | **`Change this order`:** the first Esc is swallowed (focus starts on the dialog container); the second closes it. The header says `PUT BACK · ESC` at 1440 and `CLOSE` at 390 | low–medium | high | `1440-s2-07-after-esc` |
| D11 | The Record a change chooser, `Change this order` and the Amendment open with focus on the dialog container, not their first control (P-2), and their dialogs carry no `aria-label` | low | high | probe output |
| D12 | The `Choose the piece` prompt prints above *Plan the project work* and *Folio*; the lines are a scroll away | low | medium | `1440-s2-04-on-a-piece` |
| D13 | **At 390** the band prints the act alone on the install papers and on Olsen, so what's late or waiting is not readable at the top (measure model). It costs scenarios 4 and 5 at 390 | medium | medium | `390-s4-03-wren`, `390-s5-01-olsen-cold` |
| D14 | The left rail and the dock print "the client" in lower case as the paper's name on client-less papers (Halloran, Olsen, Wren) | low | high | `1440-s2-03-…` rail |
| D15 | Rail `Pieces · 1 LINES`; head `1 group · 1 lines` | low | high | `1440-s2-04-…` |
| D16 | `Notify vendor` and `sent to vendor` where the paper says maker (FR4 §4-7) | low | high | `1440-s5-02-…`, `1440-s3-03-…` |
| D17 | On a PO with no acknowledgment, the `What they confirmed` form is prefilled with the ordered values marked `agrees`, with `Everything agrees — log it`. It reads as if the maker had confirmed | medium | medium | `1440-s3-03-open-the-order` |
| D18 | Esc from the Amendment opened through ⌘K returns focus to BODY, not to the opener or the band act | low | medium | probe output |
| D19 | `Hold for review` showed `HOLDING…` for 15.8 s on the first call (`/api/document/ask-maker-date`), likely a dev-server compile | low | low | resource timing |
| D20 | Cedar's band act prints un-held while the region's same act is held with a reason; the band press lands on `Add the maker`, which is correct | low | high | `1440-s4-02-…` |
| D21 | Opening papers during a no-write walk wrote `project_parties` (4), `studio_contacts` (2), `project_site_access_cards` (1) and time entries. The time entries are expected; the other three were not | low | medium | psql row counts after 05:00Z |
| D22 | `THIS PIECE TAKES COM` is truncated; the raw terms label `fifty fifty` | low | high | `1440-s3-03-…` |
| D23 | Esc after a landing puts the paper down to the Desk (Brief, Tanaka, Wren). The law stands; it feels abrupt (FR4 §4-3) | low | medium | probe output |
| D24 | Focus on landed controls (`Accept · begin`, `Add the maker`) shows no visible ring after a mouse press. Headless `:focus-visible` heuristics make this unconfirmed | low | low | `1440-s1-03-…` |
| D25 | Brief: the band says `Respond to the inquiry`, but the paper offers `Accept · begin / Nurture / Pass` and no reply; nothing says Accept is the reply | low | medium | `1440-s1-03-…` |
| D26 | The tour note prints on Wren, Alder, Quill and Olsen but not on Cedar (FR4 §4-9 still open) | low | medium | `390-s5-01-…` |

## 4. Verdicts (Q8 / D9)

- **`ask-the-paper`: PASSES its walk, with fixes owed.** Every slice-1 device worked for a cold walker on the scenario it serves:
  - ⌘K found `Record a change` and the sofa's PO by name.
  - Record a change reached the right piece and PO, with a readable held reason.
  - The install reading named the late piece and its date.
  - `Ask the maker for a date` held as a gated act with a repair, wrote a fully composed note, and sent nothing (`awaiting_review`; `sent` unchanged).

  The owed fixes are medium: D4 (post-hold band lands on a heading), D5, D8, D9, D10 and D17. None makes an act lie on a first press.
- **`one-voice`: FAILS its walk.** Scenarios 1 and 5 pass at 1440, and Next, the Desk card and the stage eyebrow now tell a new hire what to do. But D1 is high: on the new named-client paper, the band's one Next (`Nudge Mei`) does nothing a walker can see, and lands beside a one-press client send. Three FR4 corrections also did not hold on the walked tree:
  - the Aspen composer Esc (D2);
  - Olsen's `Send the purchase order` Standing row (D3);
  - the 390 dock landing occluded on the Brief (D6).

  Re-walk scenarios 1, 5 and the Tanaka/Aspen check once D1–D3 and D6 land.
