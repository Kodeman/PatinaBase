# US-19 F9 walk: the FR9 fixes, live at 1440 and 390 (SQ-578)

This walk checks fixes only. No product code was changed. It walks the paragraph "Walk after the fixes" in `design-review-9.md` §4 and the §2 rows marked Re-walk **yes**: F9-1, F9-4 and F9-2. Nothing the F8 walk marked FIXED was walked again.

- **Tree.** main at `cc0e08152`. It includes SQ-574 (F9-1, plus its page wiring), SQ-575 (F9-2), SQ-576 (F9-3) and SQ-577 (F9-4 seed). The orchestrator's dev server on `localhost:3000` (`next dev --webpack`, cwd the main checkout, branch `main`) served it with `NEXT_PUBLIC_FLAG_OVERRIDES=ask-the-paper:true,one-voice:true` and `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, read from the process environment. The main checkout's copies of `page.tsx`, `ffe-section.tsx`, `lens-band-derivation.ts` and `ack-check.tsx` are byte-identical to `cc0e08152`, and `po-silences.ts` is present. The server was not touched.
- **Supabase is local.** The walk's requests went to `localhost:3000` and `127.0.0.1:54321`. The only other hosts were read-only GETs: `kv3qrinl.apicdn.sanity.io` (the help CMS CDN) and `images.unsplash.com` (seed images). No other Supabase host was contacted. (`.env.local` itself could not be read in this session, because the permission policy denies it. The network log is the evidence.)
- **Fixtures.** The walk seed was already applied: Varga `f1900000-…0a2` exists, and Birchwood has `unacked_po_count 2`, `unacked_po_label BR-2026-031`, POs `…092` (`BR-2026-031`, sent 1 October) and `…093` (`BR-2026-032`, sent 3 October), with the `maker_follow_up` `…098` held on `…094`. The seed was not re-applied, and there was no `db reset`.
- **Method.** The same as `f8-walk.md`. The harness was headless Playwright 1.58.2, signed in as `designer@patina.dev` with email and password.
  - Every case ran in a fresh browser context, at 1440×900 or 390×844 (mobile, touch), both at DPR 2.
  - A screenshot and a `document.activeElement` probe followed every step. The probe recorded the ancestor chain and whether the element was occluded (`elementFromPoint`).
  - The band probe read `[data-lens-line="2"]`, its kind, form and rung, and the ink width of `[data-lens-sentence]`.
  - At 1440 the press is `[data-action-key=lens-band-next]`. At 390 it is the dock centre.
- **Send guard.** A Playwright route intercepts every fetch and XHR. It aborted and counted any non-GET request matching `nudge|remind|send-po|send-email|resend|invite|twilio|sms|record-payment|checkout|stripe|/send|_send|send_|discard|functions/v1|client_messages|procurement_drafts|ask-maker`. This is the F8 pattern widened to cover the draft-send and discard routes and the maker-note hold. **It fired 0 times** across 9 contexts. A safety guard on non-GET requests matching `release|authoriz|countersign` (excluding the `rpc/list_*` and `rpc/get_*` reads) **also fired 0 times**.
- **Walk window.** 11:32:20Z to 11:40:42Z.
- **Evidence.**
  - Screenshots are in `delivery/f9-walk/<width>-<fix>-<step>.jpg`: 18 files, 1.7 MB.
  - The raw PNGs, `steps.jsonl` (every probe), `run-*.log` (case output), `net-writes.log`, `guard-summary.log`, `hosts.log`, `psql.log`, `db-pre.txt`, `db-after.txt` and the walk scripts are in `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-578/`.

## 1. Verdicts

| Fix | Verdict | Evidence (screenshot · DOM/focus probe) |
|---|---|---|
| **F9-1**: Birchwood Row Standing prints one row per unanswered PO | **FIXED** (1440 and 390) | `1440-f91-031-02-standing-open`, `390-f91-031-02-standing-open`. `Standing · 7`; at 390 it opens from More. The rows, in order:<br>1. `NEXT · BR-2026-031 sent — no acknowledgment · OPEN THE HELD DRAFT`<br>2. `STUCK · 2 purchase orders unanswered, 7 days · FOLLOW UP WITH THE MAKER`<br>3. `NO ACK · BR-2026-032 sent — no acknowledgment · FOLLOW UP WITH THE MAKER`<br>4. `NO ACK · Follow-up to the maker drafted · OPEN THE HELD DRAFT`<br>5–8. Four setup rows.<br>The aggregate `2 POs sent — no acknowledgment` row of the F8 walk is gone. |
| F9-1: the band's Next is 031's row | **FIXED** (1440 and 390) | `1440-f91-031-01-birchwood`, `390-f91-031-01-birchwood`.<br>- **1440:** line 2 reads `NEXT ─ With the maker: BR-2026-031 sent — no acknowledgment · OPEN THE HELD DRAFT`, kind `next`.<br>- **390:** the band reads `NEXT NO ACK · BR-2026-031` (rung `short`, form `sentence`, 165px, not clipped), and the dock centre reads `OPEN THE HELD DRAFT` (`next:po_unacknowledged-0`). |
| F9-1: 031's `Open the held draft` opens the Apparatus note | **FIXED** (1440 and 390) | `1440-f91-031-03-pressed`, `390-f91-031-03-pressed`.<br>- Focus lands on `INPUT#draft-f1900000-…098-subject` (`Subject`, value `BR-2026-031 — following up`). Its chain is `draft-review` › `line-held-maker-note` › `line-movement-cell` › `ffe-selection-…094` (031's line) › `project-ffe`. It is not occluded (1440 y 384; 390 y 355).<br>- The DraftReview reads `FOLLOW-UP TO THE MAKER · To info@quentin.com · Subject · Letter · SEND · DISCARD`. Send was never pressed. |
| F9-1: 032's `Follow up with the maker` opens the Ceramica composer | **FIXED** (1440 and 390) | `1440-f91-032-03-pressed`, `390-f91-032-03-pressed`.<br>- The sheet `FOLLOW UP WITH THE MAKER` opens. It reads `To Ceramica Studio`, with Subject value **`BR-2026-032 — following up`** and the Note body focused (`TEXTAREA#ask-maker-body`, not occluded).<br>- The sheet has no DraftReview, so this is the composer and not the 031 note.<br>- `HOLD FOR REVIEW` and `DISCARD` were never pressed. |
| F9-1: the `STUCK` aggregate lends 032's act (review-9 F9-1 test line; observed, not required) | **As ruled** (1440) | `1440-f91-stuck-03-pressed`. The STUCK row's `FOLLOW UP WITH THE MAKER` opens the same Ceramica composer, with subject `BR-2026-032 — following up`. It does not open 031's held note. |
| F9-3: the short rung at 390 | **FIXED** (as reachable) | `390-f91-031-01-birchwood`. The band reads `NO ACK · BR-2026-031`, not `NO ACK · POS`. No aggregate row reaches the rung on this paper, because Next is 031's per-PO row and the `STUCK` aggregate is a Standing row only, so `2 ORDERS` cannot be seen here. That form is covered by SQ-576's unit tests. |
| **F9-4**: Varga House, `client_signed` (psql, §3) | **FIXED** (1440 and 390) | `1440-f94-01/02`, `390-f94-01/02`. The paper mounts at `/doc/f1900000-…0a2` with no redirect, and `#document-act-countersign` is present.<br>- **Band:** line 1 `PROPOSAL · VARGA HOUSE — DESIGN SERVICES` (plus `SENT 2 OCTOBER · $4,200`); line 2 **`NEXT ─ Signed by Ilona.`**, kind `next`. At 1440 the band act is **`COUNTERSIGN AGREEMENT`** (`lens-band-next`), with `Standing · 1`.<br>- **390:** line 2 reads `NEXT ─ Signed by Ilona.` (rung `long`). The **dock centre reads `COUNTERSIGN AGREEMENT`** (`next:own:document-act-countersign`).<br>- **The press:** at 300 ms and at 3 s, at both widths, focus is on **`INPUT#document-act-countersign`** (`aria-label` `Studio signer name`, placeholder `Your full name`, value empty, `aria-invalid` unset). Its chain is `#doc-section-proposal`, and it is not occluded (1440 y 324; 390 y 400).<br>- The form reads `Countersign for the studio · This final act creates one project and one billing authority…`. The countersign submit was **never pressed**, and the safety guard counted 0.<br>- The row was restored exactly (§3). |
| **F9-2**: Fenwick at 390, after `Answer the maker`: the door `THEY CORRECTED IT — LOG THE NEW ACKNOWLEDGMENT` | **FIXED** | `390-f92-04-door`. The door wraps to two left-aligned lines (`whitespace-normal`), spans x 67 to 326, and its label is whole. |
| F9-2: `DISPUTE` | **FIXED** | `390-f92-05-accept-at-rest`. The control spans x 255 to 326, which is exactly the right edge of the table's `overflow-x-auto` box, and its label is whole. |
| F9-2: `ACCEPT THEIRS` | **STILL FAILS (label not whole; X3)**. `getBoundingClientRect().right` is **376.4 ≤ 390**, so the literal bound passes. | `390-f92-05-accept-at-rest`, `390-f92-03-decisions`.<br>- At rest, the button spans x 255 to 376, but the table's own `overflow-x-auto` box ends at x 326 (`scrollWidth 318`, `clientWidth 259`). It therefore prints **`ACCEPT T`**, and `elementFromPoint` at its right edge hits `MAIN`, not the button. The verdict beside it prints `differs · +$32`.<br>- When the table is scrolled sideways (`390-f92-03-decisions`, from `scrollIntoView`), the label is whole, but `WE ORDERED` and `$3,800.00` are cut on the left instead.<br>- The page itself does not scroll (`scrollWidth 390`), and nothing in the cell passes the 390 viewport. Nothing was pressed except the dock's `ANSWER THE MAKER`. The landing still focuses `INPUT#draft-…077-subject` inside `line-po-cell` › `draft-review`. |

**Summary.**
- **Fixed:** F9-1, at both widths. It covers the two per-PO rows, 031's row as Next, 031's row landing on the Apparatus note, 032's row opening the Ceramica composer with `BR-2026-032 — following up`, and the STUCK row lending 032's act.
- **Fixed:** F9-3's `NO ACK · BR-2026-031`.
- **Fixed:** F9-4, at both widths: `Signed by Ilona.` · `COUNTERSIGN AGREEMENT`, with focus on `#document-act-countersign`, and the dock centre at 390.
- **Fixed:** F9-2's door and `DISPUTE`.
- **Still fails:** F9-2's `ACCEPT THEIRS` at 390. Its right edge is inside the viewport, but the table's own scroll box clips its label (X3).
- **New:** X3, plus notes N1 to N3.

## 2. New defects and notes

| # | Finding | Sev. | Conf. | Evidence |
|---|---|---|---|---|
| X3 | **At 390, `ACCEPT THEIRS` is clipped by the acknowledgment table's own scroll box.** F9-2 removed the table's `22rem` floor (`ack-check.tsx:516`, `w-full min-w-0`) and let the verdict wrap (`:554`). However, the decisions `Accept theirs` and `Dispute` (`:560-580`) are `DocumentAction`s without `wrap`, so they keep the base `whitespace-nowrap shrink-0` (`document-action.tsx:54`). The CHECK column is therefore at least `ACCEPT THEIRS`'s 121px wide. The four columns (WHAT 42, WE ORDERED 69, THEY CONFIRMED 75, CHECK 131) need 318px, but the cell's `overflow-x-auto` box (`:514`) has 259px. At rest the button reads `ACCEPT T` and the verdict reads `differs · +$32`. Sideways scrolling inside the table reveals them, but hides `WE ORDERED`. The walk's literal bound, right ≤ 390, passes at 376, but the "label whole" leg fails. Where the fix goes (a `wrap` on the decisions, stacking the CHECK column under the row, or something else) is Fable's to rule; no decision is made here. | medium (one of the acknowledgment's two decisions is unreadable at rest on the phone, the R158 reason F9-2 was ruled for) | high | `390-f92-05-accept-at-rest`, `390-f92-03-decisions`; `run-f92-390.log`, `run-f92-clip.log` (box, table and column widths, and the `elementFromPoint` miss) |
| N1 | Birchwood's Standing has two rows that both read `OPEN THE HELD DRAFT` and open the same note: row 1 (031's silence, relabelled per F7-1) and row 4 (`NO ACK · Follow-up to the maker drafted`, the held note's own row, which the F8 walk passed). The two rows have one control and one name, and they are two printings of one fact. Recorded only. Whether the held-note row should fold into 031's silence when that row already carries its act is Fable's call. | low | high | `1440-f91-031-02-standing-open` |
| N2 | On Varga at 390, line 1 ellipsizes the job to `PROPOSAL · VARGA …` because the right-hand `SENT 2 OCTOBER · $4,200` holds its width. The DOM text is whole. Also, `SENT 2 OCTOBER` and the section's `V1 · AWAITING SIGNATURE` still read as sent while the `CLIENT SIGNED` callout and the band read signed. This is most likely the fixture: the walk edit changes `commercial_state` only, and `status` stays `sent` with no `signed_at`. It was not judged. | low | medium | `390-f94-02-press-3s` |
| N3 | Opening papers still writes (D21's family, review-9 §3-9): 17 `rpc/mark_arrival`, 2 `rpc/start_timer`, 2 `PATCH project_time_entries`, and 2 `api/auth/qr/generate` on sign-in. There were no other non-GET writes beyond read RPCs. | note | high | `net-writes.log`, `db-after.txt` |

## 3. psql write and restore log (127.0.0.1:54322)

The write ran under `set local session_replication_role = replica`, so no `updated_at` trigger, nudge guard or dispatch fired. The restore put back the exact captured values (`psql.log`).

| When (UTC) | Row | Before | Set | Restored | Verified after |
|---|---|---|---|---|---|
| 11:36:55 → 11:38:21 | `proposals` f1900000-…0a2 (Varga House — Design Services) `commercial_state` | `sent` · status `sent` · updated_at `2026-10-08 11:11:35.819843+00` · project_id NULL · signed_at NULL | `client_signed` (`… where commercial_state = 'sent'`, UPDATE 1) | `commercial_state = 'sent'`, `updated_at = '2026-10-08 11:11:35.819843+00'` (`… where commercial_state = 'client_signed'`, UPDATE 1) | identical: `sent`, updated_at `11:11:35.819843+00`, sent_at, viewed_at and nudge_count 0 unchanged |

**After the walk.** Read-only SELECTs found these rows created or updated at or after 11:32:20Z (`db-after.txt`):

```
procurement_drafts    0   (status totals unchanged: awaiting_review 6 · sent 2)
agent_tasks           0
client_messages       0
proposals             0   rows with updated_at in the window; Varga reads its original values
purchase_orders       0
project_time_entries  3   timer_auto, from opening papers: Birchwood (…091), Fenwick (…071), and
                          db23bdbc… on project 5cbf990e… (started 11:19Z, before the window; closed at
                          11:33Z on this walk's first open, as in the F8 walk)
```

No holds were needed or made. Nothing was sent: there was no request to `/api/document/*`, to `functions/v1`, to a nudge or reminder route, to `client_messages` or to `procurement_drafts`. **The send guard's count is 0.** **The safety guard's count is 0.**

## 6. F9-2b re-walk (SQ-580)

This re-walks X3 only, after F9-2b (SQ-579, `916a1a0e5`). No product code was changed. (The section is numbered 6 as the ticket asks; this file has no §4 or §5.)

- **Tree.** main at `916a1a0e5`. The main checkout's `HEAD` is `916a1a0e5`, and its `ack-check.tsx` and `document-action.tsx` are byte-identical to that commit (`wrap={inCell}` at `:566` and `:578`). The orchestrator's dev server on `localhost:3000` (PID 59297, cwd `apps/designer-portal` in the main checkout) served it. It was not touched. The live DOM shows SQ-579's change is being served: `ACCEPT THEIRS` and `DISPUTE` now compute `white-space: normal` (they were `nowrap`). The flags are on: the dock centre reads `ANSWER THE MAKER` (`next:ack_discrepancy-0`).
- **Method.** This uses the §0 harness: headless Playwright 1.58.2 in one fresh context at 390×844, mobile and touch, DPR 2, signed in as `designer@patina.dev`. Only the Fenwick Lodge paper (`/doc/f1900000-…071`) was opened.
  - The only control pressed was the dock centre, `ANSWER THE MAKER`.
  - "At rest" means the window was scrolled vertically with `window.scrollTo`. There was no `scrollIntoView` and no sideways scroll. The table box's `scrollLeft` was 0 at both probes.
  - **Label whole** means two things: every line box of the control's text lies inside its clipping ancestors (the table's `overflow-x-auto` box, then the 390 viewport), and the control does not overflow itself.
  - `elementFromPoint` was probed at `right − 2`, at the control's vertical centre.
- **Send guard.** The §0 pattern was used, with the `release|authoriz|countersign` safety guard. **It fired 0 times; the safety guard also fired 0 times.**
  - Supabase was local: `127.0.0.1:54321` only, with no `db reset`. The only foreign hosts were read-only GETs to the Sanity CDN (2) and Unsplash (1).
  - Writes came only from opening the paper (N3's family): 2 `rpc/mark_arrival`, 1 `rpc/start_timer`, and 1 `DELETE project_time_entries?…&duration_minutes=is.null` (the auto-timer clearing its open entry before it restarts). Every other non-GET was a read RPC. There was no request to `/api/document/*`, `functions/v1` or `procurement_drafts`.
- **Walk window.** 11:56:15Z to 11:56:53Z.
- **Evidence.** Screenshots are `delivery/f9-walk/390-f92b-01-fenwick`, `-02-landed-3s`, `-03-table-at-rest` and `-04-door-at-rest` (`.jpg`, 4 files, 0.40 MB). Raw PNGs, `measure.jsonl` (both probes), `steps.jsonl`, `run-f92b-390.log`, `net-writes.log`, `guard-summary.log`, `hosts.log` and the scripts are in `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-580/`.

**The table at rest.** The `overflow-x-auto` box spans x 67 to 326, with **`scrollWidth 309` and `clientWidth 259`**. It was 318 / 259 in §1, so the table still scrolls sideways. The page itself does not (`scrollWidth 390`).
- The table spans x 67 to 335. Its columns are WHAT 42.5, WE ORDERED 69.4, THEY CONFIRMED 75.3 and CHECK 80.8.
- The table ends 9px past the box. `ACCEPT THEIRS` overflows its own CHECK cell, which ends at x 335, by a further 41px.

| Control | Rect x (left → right) | 1. right ≤ box right (326) and ≤ 390 | 2. Label whole | 3. `elementFromPoint` at right edge | Verdict |
|---|---|---|---|---|---|
| `ACCEPT THEIRS` | 255.2 → **376.4** (one line, text 261 → 370) | **fails**: 376.4 > 326 (passes ≤ 390) | **fails**: prints **`ACCEPT T`** | **miss**: hits `MAIN` at (374, 363) | **STILL FAILS (X3)** |
| `DISPUTE` | 255.2 → 326.0 | passes (326.0 = 326) | passes | hits `BUTTON[dispute-ack-difference]` | passes |
| `THEY CORRECTED IT — LOG THE NEW ACKNOWLEDGMENT` | 67 → 326 (two lines; outside the table) | passes | passes | hits `BUTTON[log-corrected-acknowledgment]` | passes |

**The other cells.** `WE ORDERED` and `THEY CONFIRMED` read whole; each wraps to two lines inside the box. Their values `$3,800.00` and `$4,120.00` also read whole. The verdict reads whole as `differs · / +$320.00` on two lines, spanning x 255 to 307. The WHAT cell reads whole (`Oak / trestle / table / — 84 / in · / price`, six lines).

**Verdict: F9-2b NOT FIXED.** At 390, at rest, `ACCEPT THEIRS` still prints `ACCEPT T`. Its right edge is 376.4, which is past the table box's 326, and `elementFromPoint` at its right edge misses it. `DISPUTE`, the door, `WE ORDERED`, `THEY CONFIRMED` and the verdict all pass.

**Why, from the live computed styles (observed, not ruled).** `wrap` reached the button: it computes `white-space: normal`, which gives a min-content of `ACCEPT`. The table therefore sizes CHECK to 80.8.
- The button still carries the base `shrink-0` (`flex-shrink: 0`; `WRAP_BASE_CLASS`, `document-action.tsx:55-58`, swaps only `whitespace-nowrap`).
- It is a flex item in the `flex flex-wrap` row (`ack-check.tsx:559`), so it lays out at its max-content basis, about 121px, and cannot shrink to the 80px cell. The label therefore never breaks onto a second line.
- `DISPUTE`'s max-content (71px) fits, which is why it passes.
- Where the fix goes is Fable's to rule; no decision is made here.
