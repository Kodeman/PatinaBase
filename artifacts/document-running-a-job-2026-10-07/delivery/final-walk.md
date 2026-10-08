# US-19 final walk: the FR7 fixes, live at 1440 and 390 (SQ-562)

This walk checks fixes only. No product code was changed. Each row is judged against the `design-review-7.md` §2 rows marked Re-walk **yes**, and against the paragraph "Walk after the fixes" in §4.

- **Tree.** main at `b563b1256`, which includes every FR7 fix ticket, SQ-555 to SQ-561. The orchestrator's dev server on `localhost:3000` served it with `ask-the-paper:true,one-voice:true` and live data. The server was not touched.
- **Supabase is local.** The walk's requests went to only three hosts: `localhost:3000`, `127.0.0.1:54321`, and `kv3qrinl.apicdn.sanity.io` (the help CMS CDN, read-only). No other Supabase host was contacted.
- **Method.** The same method as `rewalk.md`: headless Playwright 1.58.2, signed in as `designer@patina.dev`.
  - Each case used a fresh browser context (empty localStorage), at 1440×900 DPR 2 or at 390×844 DPR 2 (mobile, touch).
  - Each step was one press or key. A screenshot and a `document.activeElement` probe followed every step.
  - The band probe read `[data-lens-line="2"]` and its `data-lens-line2-kind`, `data-lens-line2-form` and `data-lens-sentence-rung` attributes. It measured the ink width of `[data-lens-sentence]` with a DOM Range.
- **Send guard.** The guard aborted any non-GET request that matched `nudge|remind|send-po|send-email|resend|invite|twilio|sms|record-payment|checkout|stripe|/send|functions/v1`. It fired **0** times.
- **Walk window.** 08:48:58Z to 09:05:40Z.
- **Evidence.**
  - Screenshots: `delivery/final-walk/<width>-<fix>-<step>.jpg`, 34 files, 3.4 MB.
  - Raw PNGs, `net-writes.log`, `help-state-before.txt` and `db-after.txt` are in `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-562/`.

## 1. Verdicts

| Fix | Verdict | Evidence (screenshot · DOM/focus probe) |
|---|---|---|
| **F7-2**: a proposal sent inside the threshold has no Next | **FIXED** | `1440-f72-02-aspen-sent-today`, `390-f72-01-aspen-sent-today`, `1440-f72-01-desk`.<br>- **Setup.** No seeded sent proposal was sent today or yesterday. The Aspen proposal `b0000000-…0002` (unopened) had `sent_at` set to now() (see §3).<br>- **At both widths:** line 2 reads `Sent 8 October.` with lead none and `data-lens-line2-kind="standing"` (not `next`). It has no `[data-part=act]` and no tour note. `Standing · 2` stays on the right.<br>- **`voice.next` is null.** This is read off the DOM: kind is `standing` and there is no act. React state was not read.<br>- **1440 letterhead:** `MESSAGE THE CLIENT` and the wall's `SEND A REMINDER` are still mounted.<br>- **Desk card:** `AT REST … With client since 8 October · OPEN THE JOB` (R22 day 1).<br>- **390 (Y2):** the dock left reads `IN THIS DOCUMENT · AT THE PROPOSAL`. More opens on `Message the client · Preview the client's copy · Keys · Find anything ⌘K · Time in hand · Mail & messages · The Post · Ledgers` (`390-f72-02-aspen-more`), and focus lands on `Message the client`. Esc returns focus to `MORE`. **The dock centre prints `MARK SIGNED`, not nothing.** See W1. |
| **F7-3**: no-login client (band) | **UNREACHABLE: Tanaka has a login on this DB** | `1440-f73-yday-02-tanaka`, `1440-f73-lapsed-02-tanaka`, `390-f73-*-tanaka`.<br>- **Why unreachable.** `document_state.client_profile_id` is set for Tanaka (`f1900000-…051`, `mei.tanaka@patina.dev`). So `clientMessageable` is true (`page.tsx:2576`), and `ownAct` takes the `Nudge Mei` branch, not the held-Message branch.<br>- **No other candidate.** Aspen, the only other sent proposal, also has a login. Reaching the no-login leg would need a `client_profile_id` write, and the ticket does not allow one.<br>- **What Tanaka printed.** With `last_nudged_at` set to yesterday and then to 4 days ago, the band read `NEXT ─ Sent 3 October — not yet opened · NUDGE MEI` at 1440 both times. At 390 it read `form=sentence`, `rung=long`, `Sent 3 October — not yet opened`, with the dock reading `NUDGE MEI`. This is correct for a messageable client.<br>- Posted on the ticket before the walk began. |
| F7-3: the send wall around the cooldown | **As ruled** (wall only) | `1440-f73-yday-02`, `-lapsed-02`, `-lapsed-03-reminder-armed`, `-lapsed-04-after-esc`.<br>- **Yesterday:** `#document-act-proposal-reminder` is absent and the wall prints `REMINDER SENT 7 OCTOBER.`<br>- **4 days ago:** the control is present and reads `SEND A REMINDER` with `aria-expanded=false`.<br>- **Press 1 arms it:** focus stays on `BUTTON#document-act-proposal-reminder` with `aria-expanded=true`, not occluded. The row reads `Mei gets an email that the proposal is waiting for a reply.` · `SEND THE REMINDER` · `CANCEL`.<br>- **Esc disarms it:** `aria-expanded=false`, focus is back on the control, and `SEND THE REMINDER` is gone. It was never pressed. |
| F7-3: Desk card for Tanaka | **UNREACHABLE (same cause)**; reads `NUDGE MEI` | `1440-f73-*-01-desk`: `PROPOSAL WITH MEI · Sent 3 October — not yet opened · NUDGE MEI`. That is correct while `client_profile_id` is set. `Send a reminder` needs a no-login row. |
| **F7-4**: alone rungs at 390 | **FIXED** (all four match SQ-548's strings) | `390-f74-wren`, `-cedar`, `-olsen`, `-halloran`. All four rows: `form=sentence`, no act in the band, band height 56px, sentence not clipped, line-2 box 327px, Inter 15px.<br>- **Wren:** rung `phone` · `NEXT` + `Library ladder and rail isn't here.` · 35 chars **229px** (lead 30px) · dock centre `OPEN THE HELD DRAFT`.<br>- **Cedar:** rung `phone` · `NEXT` + `Side table isn't here.` · 22 chars **145px** · dock centre `ADD THE MAKER`.<br>- **Olsen:** rung `long` · `NEXT ─` + `AP-012 has an open damage claim` · 31 chars **245px** (lead 49px) · dock centre `FILE THE CLAIM`.<br>- **Halloran:** rung `short` · `NEXT` + `No ack · NA-2026-077` (prints uppercase) · **169px** · dock centre `OPEN THE HELD DRAFT`. |
| F7-4 / Y1: measured width per character | **Recorded, not acted on** | On the 15px band face, Wren's phone form measures 6.5px/char and Cedar's 6.6px/char, against `LENS_LINE2_PX_PER_CHAR = 8.2`. Olsen's string, with its digits and capitals, measures 7.9px/char. For reference, the 1440 long forms measure: Wren 399px (57 chars), Cedar 509px, Olsen 245px. |
| **F7-9**: the once-only band tour note | **FIXED** | One fresh context per person; Cedar, then Olsen, then Wren.<br>- **`designer@patina.dev`** (key set to 2026-10-08T00:43:51.877Z): the note is **absent on all three** at 1440 (`1440-f79-designer-*`) and at 390 (from the F7-4 pass). localStorage holds no margin or help keys.<br>- **The same person with only `marginNotes.band-tour-v1` removed** (§3): `[role=note]` reading `The band says what's next on this job. Press it. · UNDERSTOOD` is **present on all three** at 1440 (`1440-f79-unseen-*`, y 346 to 413) and at 390 (`390-f79-unseen-*`, y 410 to 444).<br>- `Understood` was never pressed. help_state was unchanged by the walk and was restored exactly. |
| **F7-12 (b)**: Fenwick Lodge `Answer the maker`, label | **FIXED** (string) | `1440-f712-01-fenwick`: `NEXT ─ Reply to the maker drafted — the acknowledgment differs · ANSWER THE MAKER` (`data-action-key=lens-band-next`).<br>`390-f712-01-fenwick`: band rung `short` reads `NEXT ACK MISMATCH · REPLY`, and the dock centre reads `ANSWER THE MAKER`. So SQ-561's `NEXT · ACK MISMATCH · REPLY` was the 390 short form; the act is named correctly. |
| F7-12 (b): Fenwick press lands on the held `ack_discrepancy_reply` DraftReview | **STILL FAILS / NEW DEFECT (W2)** | `1440-f712-02-fenwick-press`, `-02b-fenwick-press-3s`. The press, probed at 300 ms, 1.2 s and 3 s, focuses `DIV#doc-section-project` (the section container, top at y 72, under the band). The page scrolls to Schedule.<br>- No DraftReview (`[aria-label*=drafted]`, `input[id^=draft-]`) is on the paper before or after the press, and no dialog opens.<br>- Esc leaves focus on the section.<br>- Nothing was sent; the draft row is unchanged (§3). |
| **F7-12 (a)** / F6-2: Ashby Mews Release lift | **UNREACHABLE without worktable** | `1440-f712-03-ashby-pieces-head`.<br>- **Pieces head:** `Pieces · 1 line · 1 uninvoiced · RELEASE FOR AUTHORIZATION · RECORD A CHANGE · FOLD ↑`.<br>- `[data-release-lift]` count is **0**. `data-action-key=release-for-authorization` is present in the head, and was not pressed.<br>- **Band:** `NEXT ─ OPEN THE PIECES`, `form=act`, with an empty sentence. |
| F7-5: review head `Follow-up to the maker` | **N/A** | No `maker_follow_up` draft is seeded. `procurement_drafts` kinds: 4 × `ack_discrepancy_reply`, 1 × `receiver_inbound_notice`, 2 × `maker_eta_request`. None was created. |
| F7-8: ledger `log ack ↓` opens straight in | **FIXED** | `1440-f78-01-ledger-log-ack`. Halloran → Ledgers → Orders: `LOG ACK ↓` → focus on the `INPUT` labelled `THEIR ORDER №` (value prefilled `NA-2026-077`, placeholder `NA-2026-…`), not occluded. `Log what they confirmed` is not in the dialog, so there is no second door. `CONFIRMED ETA` sits beside it. Esc → `Ledgers ↑`. Nothing was logged. |
| F7-10: Aspen preview `Prepared for you` | **FIXED** | `1440-f710-01-aspen-prepared-for`: `P` at y 825 reads `Prepared for you`, and the aria-label `What the client sees` is present. No text node on the paper contains `Client User`. |
| F7-11: Aspen schedule chip `Ball: Client` | **FIXED** | `1440-f711-01-aspen-ball`: the `Design Development sign-off — drawing set B` row reads `BALL: CLIENT · DUE 2 OCTOBER ›`, and no `Client User` text node appears. |
| F7-1: two unacknowledged POs | **N/A** | No paper has `unacked_po_count >= 2`. None was seeded. |

**Summary.**
- **Fixed:** F7-2, F7-4, F7-8, F7-9, F7-10, F7-11, and F7-12 (b)'s string.
- **Still fails:** F7-12 (b)'s landing. The `Answer the maker` press lands on the section, not on the held DraftReview (W2).
- **Unreachable:**
  - F7-3's no-login band and Desk legs: no seeded sent proposal lacks a `client_profile_id`.
  - F6-2: worktable is off.
- **N/A:** F7-1 and F7-5 (no fixture).
- **New:** W1 and W2.

## 2. New defects and notes

| # | Finding | Sev. | Conf. | Evidence |
|---|---|---|---|---|
| W1 | **Y2.** Inside the threshold, at 390, the dock centre prints a filled `MARK SIGNED` (`data-action-key=mark-proposal-signed`, `da-primary`, region `proposal-watch-actions`) where FR7 Y2 expected nothing. The band has no Next, so the dock centre promotes the proposal-watch region's primary act instead. This is a design question for Fable, not decided here: is a lifecycle commit the right dock centre for a paper with no Next? | medium (unruled) | high | `390-f72-01-aspen-sent-today`; dock probe |
| W2 | Fenwick Lodge: the band's `Answer the maker` lands on `#doc-section-project` (the guide fallback). The `ack_discrepancy_reply` DraftReview is not mounted on the paper, so the press reaches no control (P-2). The reply's DraftReview mounts only in `buying/ack-check.tsx` and `line-unfold/order-cell.tsx`, and neither was open. FR7 §1 assumed the control is keyed by `data-action-key`. | high (a Next that lands on nothing) | high | `1440-f712-02-fenwick-press`, `-02b-…-3s`; focus probe at 3 s |
| N1 | The F7-3 premise in design-review-7 (546 c, "Tanaka … prints `Reminder sent 8 October.`") assumes Tanaka has no login. On this database she has one (`client_profile_id` set), and the re-walk's composer press confirms it. A no-login sent-proposal fixture is needed to walk F7-3's band and Desk legs. | note | high | read-only SELECT; ticket comment `c_muzan03l_ea590b` |
| N2 | Ashby Mews at 1440 prints the band act alone, `NEXT ─ OPEN THE PIECES`, with an empty sentence. | note | high | `1440-f712-03`; band probe `form=act`, `sentence=""` |
| N3 | Opening papers still writes. There were 42 `rpc/mark_arrival`, 19 `rpc/start_timer`, 17 `DELETE project_time_entries` and 2 `PATCH project_time_entries` calls (the keeping-time timer and the arrival marks). That is D21's family, as recorded in review-6 and review-7 §3-9. | note | high | `net-writes.log` |

## 3. psql write and restore log (127.0.0.1:54322)

Every write ran with `set local session_replication_role = replica`, so no `updated_at` trigger, guard or dispatch fired. Each restore put back the exact captured values.

| When (UTC) | Row | Before | Set | Restored | Verified after |
|---|---|---|---|---|---|
| 08:51:08 → 08:53:12 | `profiles` a0000000-…0004 `help_state` | `{"tours": {"desk-walkthrough": {"atStep": 0, "abandoned": true}}, "marginNotes": {"band-tour-v1": "2026-10-08T00:43:51.877Z"}, "featureAnnouncements": {}}` · updated_at `2026-10-08 00:43:51.898843+00` | `#- '{marginNotes,band-tour-v1}'` → `marginNotes: {}` (the walk did not write it; it read `{}` before the restore) | exact JSON + updated_at | identical (`db-after.txt`) |
| 08:54:35 → 08:56:10 | `proposals` b0000000-…0002 (Aspen) `sent_at` | `2026-10-06 02:38:07.577224+00` · updated_at `2026-10-07 02:38:07.577224+00` | `now()` = `2026-10-08 08:54:35.837922+00` | both values | identical |
| 08:56:25 → 08:59:09 | `proposals` f1900000-…053 (Tanaka) `last_nudged_at` | `2026-10-08 05:18:48.107722+00` · nudge_count 1 · updated_at `2026-10-08 05:18:48.106721+00` | `now() - 1 day` (08:56:25), then `now() - 4 days` (08:57:47) | both values | identical; nudge_count 1 |

**After the walk.** Read-only SELECTs for rows created or updated after 08:48:58Z (`db-after.txt`):

```
procurement_drafts    0   (status totals unchanged: awaiting_review 5 · sent 2)
agent_tasks           0
client_messages       0
proposals             0   rows with updated_at in the window (both walked rows read their original values)
project_time_entries  2   timer_auto, from opening papers (the keeping-time timer):
  dace885b… Halloran House 6 min · 7d2d6a95… Aspen Loft Refresh open (duration null; the browser closed on it)
```

No holds were needed or made. Nothing was sent: there was no request to `/api/document/*`, to `functions/v1`, to a nudge or reminder route, to `procurement_drafts` or to `client_messages`. The send guard's count is **0**.
