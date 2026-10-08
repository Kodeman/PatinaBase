# US-19 re-walk: walk D1–D6, D10, D12 and the FR6 fixes, live at 1440 and 390 (SQ-553)

Verification only. No product code was changed. Each row is judged against `design-review-6.md` F6-1…F6-11 and the defect table in `walk.md`.

- **Tree.** main at `e33cae2f5`, which includes every fix ticket SQ-546…SQ-552. The orchestrator's dev server on `localhost:3000` served it with `ask-the-paper:true,one-voice:true` and live data. The server was not touched.
- **Supabase.** Confirmed local: every API request in the walk went to `127.0.0.1:54321`, and to no other Supabase host. Reading `.env.local` directly is denied by settings, so the request log is the evidence.
- **Method.** Same as `walk.md`: headless Playwright 1.58.2, signed in as `designer@patina.dev`.
  - Browsers: 1440×900 (DPR 2) and 390×844 (DPR 2, mobile, touch).
  - Each step was one press or key, then a screenshot and a `document.activeElement` probe. The probe records the tag, text, rect and occlusion, where occlusion means `elementFromPoint` at the element's centre is the element itself.
  - A route guard aborted any non-GET request matching `nudge|send-po|send-email|invite|sms|record-payment|stripe…`. It fired **0** times.
  - Walk window: 07:05:01Z–07:25:18Z.
- **Evidence.** Screenshots are in `delivery/rewalk/<width>-<case>-<step>.jpg`, 49 files, 4.9 MB. Raw PNGs, `db-before.txt`, `db-after.txt`, `net-writes.log` and `release-scan.json` are in `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-553/`.

## 1. Verdicts

| Defect / fix | Verdict | Evidence (screenshot · DOM/focus probe) |
|---|---|---|
| **Scenario 1**, 1440 | **PASS** | `1440-s1-01-desk`, `-02-paper`, `-03-band-press`. The card reads `Respond to the inquiry`, and the band reads `NEXT ─ RESPOND TO THE INQUIRY`. The press focuses `BUTTON#document-act-inquiry-reply "ACCEPT · BEGIN"` at y 519–563, not occluded. Lead `73a3cde4…` stayed `viewed` (updated_at 2026-10-07 02:38:07Z) before and after. That makes 2 steps. |
| **Scenario 1**, 390 / **D6** | **FIXED** | `390-s1-03-dock-press`. The dock act focuses `ACCEPT · BEGIN` at rect y 707–751. The dock top is 751 and `scroll-padding-bottom` is 93px, so the control is flush above the dock and not occluded. Walk 1 had it at y 740–784, under the dock. |
| D6, section jumps at 390 | **PASS** | `390-d6-jump-pieces`, `-money`, `-closing`. On Halloran, In this document → Pieces focuses H2 at y 78–107, and Money focuses H2 at y 94–123; the dock top is 772. Closing the book focuses its section container, whose top (y 72) is visible. |
| **Scenario 5**, 1440 | **PASS** | `1440-s5-01-olsen-cold`, `-02-claim-landing`. The page reads `PROJECT · OLSEN LAKE HOUSE` / `NEXT ─ AP-012 has an open damage claim · FILE THE CLAIM · Standing · 6` with 0 presses. One press focuses `NOTIFY THE MAKER` (`review-claim-notification`), not occluded. Esc returns focus to the band's `FILE THE CLAIM`. |
| **Scenario 5**, 390 | **PASS** | `390-s5-01-olsen-cold`, `-02-claim-landing`. The band rung is `sentence` and reads `NEXT CLAIM OPEN · AP-012`; the dock reads `AT APPROVALS · FILE THE CLAIM · MORE`. A dock tap focuses `NOTIFY THE MAKER` with no occlusion. `Close` returns focus to the dock's `FILE THE CLAIM`. |
| **D1 / F6-1** (Tanaka `/doc/f1900000-…053`) | **FIXED** | `1440-t-01-tanaka-top`, `-02-tanaka-nudge-composer`, `-03-after-esc`; `390-t-02-tanaka-dock-nudge`. The band reads `NEXT ─ Sent 3 October — not yet opened · NUDGE MEI`. The press focuses `TEXTAREA` (placeholder `A quick note to Mei…`, not occluded) under the composer eyebrow `NUDGE MEI`. The composer prints `Waiting on Mei: the proposal, sent 3 October · Daybed cushion — undyed linen vs moss wool · Rug size — 8x10 vs 9x12` once. One Esc closes it (0 textareas) and focus returns to the band's `NUDGE MEI`. At 390 the dock's `NUDGE MEI` gives the same focus and line, and Esc returns to the dock act. No `Nudge Mei Tanaka` prints anywhere. |
| **F6-1b**: reminder named and armed | **FIXED** (walked on Aspen's proposal; see note) | `1440-a-02-reminder-armed`, `-03-reminder-cancelled`. On the Aspen proposal `/doc/b0000000-…0002`, `#document-act-proposal-reminder` reads `SEND A REMINDER`.<br>- **Press 1 arms it:** `aria-expanded=true` and the row shows `The client gets an email that the proposal is waiting for a reply.` · `SEND THE REMINDER` · `CANCEL`.<br>- **Disarm, three ways:** Esc from the control, `Cancel`, and Esc with focus on `Cancel` each leave 0 armed rows and focus back on `SEND A REMINDER`.<br>- **Never sent:** `Send the reminder` was never pressed. The proposal's `nudge_count` is 0 and `last_nudged_at` is null, before and after.<br>- **Tanaka:** the control is absent (`1440-t-04-tanaka-watch`). Walk 1's D1 press set `last_nudged_at` to 05:18:48Z, and the 3-day cooldown (`canNudge`) stands the verb down, so the send wall prints the voiced state line `REMINDER SENT 8 OCTOBER.` That is F6-1b's watch copy. |
| **Aspen D′ check** | **PASS for band, composer and dock; 2 new defects (R1, R2)** | `1440-a-04`, `1440-a-05`, `1440-d2-01`, `390-a-01-aspen-project`.<br>- The band and dock read `NUDGE THE CLIENT`.<br>- The composer placeholder reads `A quick note to the client…`, with helper `It lands in the client's portal messages.` and line `Waiting on the client: …`.<br>- The 390 dock prints `AT APPROVALS` with no household name.<br>- But `Client User` still prints twice; see R1 and R2. |
| **D2**: Nudge composer takes Esc | **FIXED** | `1440-d2-01-aspen-composer`, `-02-after-esc`. On the Aspen project, one Esc closes the composer (0 textareas) and focus returns to the band's `NUDGE THE CLIENT`. The `project_time_entries` id list was identical before and after the Esc (21 rows). No log-time offer was visible. |
| **D3**: Olsen `Send the purchase order` | **FIXED** | `1440-s5-03-olsen-standing`, `-04-olsen-send-row-landing`. The Standing row focuses `SEND →` (`open-purchase-order-preview`) on the ledger row `PO drafted DRAFT … $3,400 · NOT SENT`. That row is inside the dialog headed `Orders · LEDGER`, and the control is not occluded. Nothing was sent: the PO preview was not opened. Esc returns focus to `Standing · 6`. |
| **D4 / D5**: held maker note, red-letter row | **FIXED** | `1440-d4-03-halloran-standing`, `-04-red-letter-landing`, `-02-band-held-draft`. On Halloran, the Standing row has the red `NO ACK` label (rgb 156,83,64) and reads `Arrival date request to the maker drafted · OPEN THE HELD DRAFT`. Pressing it focuses `INPUT#draft-eef596b4…-subject` inside `[data-testid=line-held-maker-note]`. The band's `Open the held draft` lands on the same control. A second press now reopens the held note rather than an empty composer (D5). |
| D4/D5: kind label | **Reads per DB kind; body label is "Letter"** | The DraftReview's kind line reads `ARRIVAL DATE REQUEST TO THE MAKER` on both held notes, Halloran and Wren. Both rows are `kind = maker_eta_request`: walk 1 wrote them before 00728 added `maker_follow_up`. So Halloran's follow-up (subject `NA-2026-077 — following up`) carries the arrival-date label from its stored kind. **The body field's label reads `Letter`, which is DESIGN-Q 4 on SQ-538.** |
| **F6-4 / D9**: Change this order | **FIXED** | `1440-d12-01-record-a-change`, `1440-f64-01-change-this-order`.<br>- The router's hint reads `Swap, add or remove a piece, or change its maker.`<br>- Change this order opens with all 5 radios `checked=false`.<br>- `RECORD THE CHANGE` has `aria-disabled=true` and `data-held=true`, with reason `Choose what changed.`<br>- Focus is on the first radio, which is unchecked. The dialog is named `CHANGE THIS ORDER`. |
| **D10**: one Esc closes Change this order (1440) | **FIXED** | `1440-d10-01-after-one-esc`. One Esc takes the dialog count from 1 to 0, and focus returns to the sofa line button. |
| **D12 / F6-5**: Choose the piece | **FIXED** | `1440-d12-02-choose-the-piece`. Focus is on `P[data-testid=ffe-choose-the-piece]` (role status). The prompt block spans y 376–420 and the first line's text starts at y 450. No heading sits between them; Folio (y 171) and *Plan the project work* (y −3) are above the prompt. |
| **D12 / F6-2**: Release lands on the lift | **NOT WALKED** | No live paper offers a Release. `release-scan.json` opened all 25 active or on-hold papers visible to the designer: 0 render `[data-release-lift]`, and 0 render any `[data-action-key=release-for-authorization]`. The only coverage is SQ-547's unit test. |
| **F6-3**: band keeps the reading after a held ask | **FIXED** (1440) | `1440-f63-01-wren-held`, `-02-wren-band-press`. Wren's band reads `NEXT ─ Library ladder and rail was due 3 October and isn't here. · OPEN THE HELD DRAFT`. The press focuses `INPUT#draft-183b64bf…-subject` inside `line-held-maker-note`. |
| **F6-6**: at 390 the sentence before the act | **PARTIAL: still fails on Wren and Cedar** | `390-s5-01`, `390-f67-halloran-dock`, `390-t-01`, `390-a-01`, `390-f66-wren`, `390-f66-cedar`.<br>- **Prints `form="sentence"` with no act:** Olsen `Claim open · AP-012`; Halloran `No ack · NA-2026-077`; Tanaka `Sent 3 October — not yet opened`; Aspen `Overdue 6d · Decisions`. The dock carries the act in each case.<br>- **Stays `form="act"`:** Wren `NEXT ─ OPEN THE HELD DRAFT` and Cedar `NEXT ─ ADD THE MAKER`. F6-6's named test case, Wren with `form="sentence"`, is therefore not met live.<br>- **Measure:** at the 1440 band face (15px Inter), Wren's ruled short form `Library ladder and rail isn't here — due 3 October.` measures about 353px, plus about 56px for the lead, against the 327px measure. This is the refusal F6-6's confidence note foresaw.<br>- **Olsen's string:** Olsen prints `Claim open · AP-012`, not the F6-6 test's `AP-012 has an open damage claim`. |
| **F6-7**: no household name on a client-less paper | **FIXED** | `1440-s5-01`, `1440-f67-halloran-rail`, `390-f67-halloran-dock`, `390-s5-01`, `390-a-01`. The rail reads `← PUT DOWN PROJECT Client approvals…`, with nothing in the household slot, on both Olsen and Halloran. The dock left reads `AT APPROVALS` alone on Olsen, Halloran, Wren and Aspen (whose client is the `Client User` placeholder). No text node is exactly `the client`. |
| **F6-8**: the maker word | **FIXED for 2 of 3; `Answer the maker` NOT WALKED** | `1440-s5-02`, `390-s5-02`, `1440-f69-01-open-the-order`. The claim control reads `NOTIFY THE MAKER` at both widths, and the Order cell reads `sent to the maker 1 October · awaiting acknowledgment`. No paper visible to the designer carries an `ack_discrepancy` need: the 3 buying-walk papers that have `ack_discrepancy_reply` drafts render no band for this user. So `Answer the maker` was not seen. |
| **F6-9**: ack form behind a door | **FIXED** | `1440-f69-01-open-the-order`, `-02-ack-form-open`.<br>- **Before the press:** `Log what they confirmed` is the only act; 0 ack inputs and 0 `agrees` strings are in the DOM.<br>- **After the press:** focus is on the input labelled `THEIR ORDER №`. The rows read `as ordered`, the summary reads `Nothing differs from the order.`, and the act reads `LOG IT — CONFIRMED AS ORDERED`.<br>- **Esc:** focus returns to `LOG WHAT THEY CONFIRMED`. Nothing was logged. |
| **F6-10**: Cedar's Next is the repair | **FIXED for the act; D26 tour note STILL FAILS** | `1440-f610-01-cedar`, `-02-cedar-press`, `-03-cedar-no-tour-note`, `390-f66-cedar`.<br>- **Band:** `NEXT ─ Side table isn't here, and no arrival date is recorded. 2 more aren't here. · ADD THE MAKER`. The press focuses `ADD THE MAKER` (`install-reading-add-maker`).<br>- **Region head:** `ASK THE MAKER FOR A DATE` held, `No maker is recorded on this line.` beneath it, and `ADD THE MAKER` beside it.<br>- **Tour note:** `The band says what's next on this job. Press it.` is **absent on Cedar** at 1440 and 390, on a fresh load. It is present on Olsen and Wren in the same session. F6-10 and D26 say it returns on Cedar. |
| **F6-11**: triad eyebrow | **FIXED** | `1440-s1-03-band-press`. `P` (mono, uppercase) reads `RESPOND TO THE INQUIRY` at y 494–510. Its next sibling is `ACCEPT · BEGIN · NURTURE · PASS`. It also shows at 390 (`390-s1-03-dock-press`). |

**Summary.**
- **Fixed:** D1, F6-1b, D2, D3, D4/D5 landing, D6, D9/F6-4, D10, D12/F6-5, F6-3, F6-7, F6-9, F6-11, and 2 of F6-8's 3 strings.
- **Still fails:** F6-6 on Wren and Cedar (act-only at 390), and the D26 tour note on Cedar.
- **Not walked:** F6-2 and `Answer the maker`. No seeded paper reaches either.
- **New defects:** R1 and R2 below.

## 2. New defects

| # | Defect | Sev. | Conf. | Evidence |
|---|---|---|---|---|
| R1 | The Aspen proposal paper's `WHAT THE CLIENT SEES` preview prints `Prepared for Client User`. That is the placeholder name, on the paper that otherwise says `the client` everywhere. Walk 1's D′ check may not have opened this paper. | low | high | `1440-a-01-aspen-proposal-top`; text node in `P.mb-6`, y 825 |
| R2 | The Aspen project's schedule prints `BALL: CLIENT USER · DUE 2 OCTOBER` on the `Design Development sign-off — drawing set B` row (region `Project schedule`). This contradicts walk 1's "no `Client User` anywhere on the paper" and the D′ rule. | low | high | `1440-a-05-aspen-project-top` (row below the fold); probe region `Project schedule`, y 1231 |

**Notes, not defects:**
- Esc inside a landed DraftReview subject input leaves focus in the input.
- The Next.js dev badge covers the 390 dock's household slot on the Brief (dev-only).
- The 390 band prints a day counter, `Overdue 6d`, in X3's family.
- The decision title prints `8x10`, not `8×10`; that is data text.
- D24 (focus ring) was not judged, because headless `:focus-visible` makes it unreliable.

## 3. DB writes (read-only SELECTs, `created_at > 2026-10-08T07:05:01Z`)

```
procurement_drafts    0   (status totals unchanged: awaiting_review 4 · sent 2)
agent_tasks           0
client_messages       0
project_time_entries  5   timer_auto, from opening papers (the keeping-time timer):
  60f294c2… Olsen 5 min · d6092c4f… Cedar 1 min · 76e00dfd… Halloran 4 min ·
  eb8a9ba6… Halloran 1 min · 5ffc6b82… Halloran open (duration null; the browser closed on it)
time_entry_ledger     5   (mirrors the five above)
```

- **No holds were needed or made:** both held notes walked were walk 1's rows.
- **Leaving a paper deletes its own timer.** It issued 11 `DELETE project_time_entries?…&duration_minutes=is.null` requests, each against a timer this walk had opened.
  - The 19 time entries from before the walk are all present.
  - No delete fell inside the D2 Esc window: the snapshots at 07:13:13Z and 07:13:24Z are identical.
- **No reminders or decisions changed:**
  - Tanaka still shows `last_nudged_at` 05:18:48Z with `nudge_count` 1, unchanged from before the walk.
  - The Aspen proposal still has `nudge_count` 0.
  - Lead `73a3cde4…` is still `viewed`.
- **Nothing was sent:** no request went to `/api/document/*`, `functions/v1`, a nudge RPC, `procurement_drafts` or `client_messages`.
