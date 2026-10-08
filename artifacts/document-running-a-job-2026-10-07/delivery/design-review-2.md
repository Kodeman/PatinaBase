# Design review 2 — slice 2 (One Voice), the band, the dock and the tour

**Ticket:** SQ-503 (US-19 FR2) · **Reviewer:** Fable, design seat · **Tree reviewed:** main `9bfc83285` (2-A `3e24d2e7f`, 2-B `98c6d27b6`, 2-C `b117c4a7d`, fixes SQ-506/507/508/510, CR2 SQ-511) served by the orchestrator's `:3000` with `ask-the-paper:true,one-voice:true` · **Date:** 2026-10-07
**Authority:** `rulings.md` (D1–D11, §3 rows 2-1..2-7) and `design-review-1.md` (R1–R42, F1–F16 — all stand). Nothing below contradicts either silently; where I would amend a ruling it is listed in §4 for Kody and left unbuilt.
**Method:** headless Chromium (Playwright 1.58.2) at exact CSS viewports 1440×900 and 390×844 (DPR 2, touch), signed in as the seeded designer. Chrome's localhost tab runs at 75% zoom and refused to resize below 1832px, so it was not used for measures. Screenshots: `delivery/review-2/<width>-<paper>-<state>.png` (40 files, `sips -Z 1600`). Probe JSON (band geometry, act classes, focus, forbidden strings): `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-503/*.json`.
**Papers walked:** Chen Residence (1440, 390) · Elena Marlowe — Living Room Direction (1440, 390) · Harrow Road Flat, held (1440, 390) · Lindqvist, closed (1440, 390) · Cedar Lane Study, install (1440, 390) · Aspen Ridge, proposal sent (1440) · Olsen, claim (1440) · Halloran, care (1440) · the Desk (1440).

**One principle, used below more than once (P-1):** *a pointer is scored, the landing control is filled.* The band act, the dock centre, the Desk card act, the ⌘K row and a region head all point at a control. Only the control where money is recorded or a paper is sent for signature wears D3's filled weight with its consequence sentence. This reads D3's "where the act leads a region" and 2-5 together and resolves 498-f, 499-3 and 507-1 without a new tier.

---

## 1. Rulings on every open DESIGN-Q

Columns: the question · the ruling (exact string or behaviour) · reason · source. Rulings marked **▲** are also fixes in §3.

### SQ-498 — 2-A, the band

| # | Question | Ruling | Reason | Source |
|---|---|---|---|---|
| 498-a | Line 1 at s0 | Keep: `STAGE · Name` prints at every stop with the flag on; flag off yields to the letterhead as today. **▲ `Name` is the job's name** (`PROJECT · Chen Residence`, `INSTALL · Cedar Lane Study`), never the household — the tree prints `PROJECT · THE CLIENT` and `INSTALL · NORA ELLISON` (F2-1). | D1's example is the job; the household already stands in the letterhead's `for Nora Ellison` line, so repeating it is a second name for one thing. | D1 eyebrow; R150 |
| 498-b | Sheet title vs door count | **▲** Title = door count. The sheet title reads the same `Standing · N` as the door. Next's row stays in the sheet, first in its group, under a `NEXT` eyebrow instead of a count. | One number on two surfaces; a door saying 5 that opens on 6 reads as a miscount (V11). | D2 door; V11 |
| 498-c | Own-act stand-in | **▲** The guide line never stands in. When the stage's own act is Next, line 2 prints `NEXT ─ {region status} {OWN ACT}` with the region's status sentence where one exists (`3 lines unspecified.`), else the act alone. Also while loading (500-5). | D1 retired the guide sentence; a swapped-in sentence is a second voice for 1.5 s. | D1 own-act table; D2 |
| 498-d | Custody form | Keep `Waiting on {first}: <sentence>` / `With the maker: <sentence>`; a studio owner adds nothing. | Whose Move names the other party only; the studio's turn is the default voice. | D8 |
| 498-e | Rows with no act | Keep "a row with no act cannot be Next" as a guard, but **▲** a row with no act is a defect of the row: every sheet row carries its own act (I154 D1). Observed without acts: `STUCK 3 unspecified` → `Spec the 3 unspecified`; Aspen `DECISIONS 2 overdue client decisions` → `Nudge {first}`; Halloran `STUCK NA-2026-077 unanswered, 6 days` → `Follow up with the maker` (F2-7). | D2: "Each row carries its own act." | D2 sheet |
| 498-f | Band act weight | Keep `primary` (scored). P-1: the band points; the record-payment control it lands on is filled with its sentence. **▲** No filled control exists on Chen today (F2-3). | D3 filled = where money is recorded. | D3; 2-5 |
| 498-g | Narrow widths | **▲** The measure decides at every width, never the tier: order of yield on line 2 is door → sentence → never the act. 600–1100: door stays, short sentence; if the short sentence clips, it drops and the act prints alone. 390: door to More (as built), and the sentence drops when its short form clips (it does: `OVERDUE 14…`, F2-4). | D2: "chosen by the measure … never by width alone"; a clipped sentence is a clipped band. | D2 390; I154 |
| 498-h | Inputs | Keep: INPUT NEEDED rows fold into NEEDS YOU; budget band, target date, `No client linked`, `schedule_unconfigured` reach SETUP via D10 rows. | Matches the class table verbatim. | D2 class table |
| 498-i | Door type and colour | Mono, sentence case: keep. Colour: **terracotta only when a class-1 row (blocks money or a signature) stands behind the door**, clay otherwise; not "an exception stands". | The colour must mean what the sheet's first group means; a stuck line is class 2 and the class is never inferred from state (ADV-14). | D2 class table; ADV-14 |
| 498-j | Chen's Next sentence | **▲** Prose, not the Desk ledger line. 1440: `Pay Woodward & Sons the WS-188 balance, $3,400 — 148 days overdue.` Short form: `WS-188 balance, 148 days overdue.` Act-alone form per 498-g. | D2's example is prose; `· $3,400 due 12 May — WS-188` is a ledger cell with two separators. | D2 1440 example; W6-R1 |
| 498-k | Sheet row acts | Plain `secondary`, except the four named acts (`Record a change` · `Ask the maker for a date` · `Open the order` · `File the claim`), which stay scored wherever they print; held rows change form. | D3 lists the named acts as scored without a surface condition. | D3 |

### SQ-499 — 2-B, one name per act

| # | Question | Ruling | Reason | Source |
|---|---|---|---|---|
| 499-1 | Band first name | **▲** The band gets the first name: `Nudge Mei`, `Message Nora`. Pass `clientFirstName` into `voiceItem`; `the client` only as the family fallback. | Rule of names: one string on all five surfaces, and D1's row is `Nudge {first name}`. | D1 |
| 499-2 | Draw an invoice / Money head | `Draw an invoice` stays plain everywhere. The Money head leads with `Record the payment` (scored, P-1) only when a **client receivable** on this paper is due (invoice sent, unpaid). A maker balance (`payment_due` on a PO) leads the order's row in Pieces, not Money. When nothing is due the Money head has no scored leader. | One leader per region, and a plain act promoted because it is alone invents a tier. | D3; R150 R5; R27 |
| 499-3 | Release for authorization | **▲** The Pieces head prints `Release for authorization` scored (own act). The release sheet's confirm control is the same act, filled with its consequence sentence, and reads `Release for authorization`, not `Send for signature`. The filled set stays D3's four names. | P-1; one name per act. | D1 own-act; D3 |
| 499-4 | Send the proposal | **▲** The agreement composer's send control reads `Send the proposal`; `Send the agreement` is deleted. | D1 names the act and the control it lands on (the send sheet). | D1 |
| 499-5 | Payment consequence sentence | One sentence above the filled act: `Records $3,400 paid to Woodward & Sons on 12 May — voidable with a reason, never edited.` ({amount} {payee} {day} from the record; today's date before it is saved). | R141 is one sentence; "the balance" is our word, the person's is the amount and the payee. | R141; D3 |
| 499-6 | Direction band | Keep the drops (`Drafting the proposal`, Contract Room inline). **▲** `The proposal — N% written` is a ratio: print `The proposal — {N} sections to write`, and `The proposal — written` at zero. | V11 bans ratios and `OF 7`; a percentage is both. | V11; D1 |
| 499-7 | FF&E status line | Keep the trade-word drop. **▲** The empty-state title `Build the FF&E schedule` retires with the name: title `No pieces yet.`; the act beneath keeps the add-line control's current label verbatim. | D1: `FF&E schedule` retires as a printed name. | D1 own-act table |
| 499-8 | Open contradictions (it.todo) | Make them live tests with these strings: (3) Discovery own act `Add the {first missing essential}` in the order project type · rooms · scope · budget band, same string on Desk and ⌘K; (5) `Open the Contract Room` retires on ⌘K and Desk — both print `Write the proposal` (**▲** Direction ⌘K still prints a `Contract Room` row and no act row, F2-14); (11) Install `Hold the window` → `Hold a window`; (12) Care own act `Run the closeout checklist`, studio-owned, never the custody form. | D1 deletes the four Direction labels and names the Install and Care acts. | D1 |
| 499-9 | Desk relabels by kind | **▲** The Desk labels by the landing control, not by kind: a held-for-release line → `Release for authorization` (held form when gated); a draft awaiting review → `Open the held draft`. | Rule of names. | D1 |
| 499-10 | Pieces head hand template | **▲** Delete the template; the head reads `ownAct` from the one table. | "One table in one module feeds all five." | D1 |

### SQ-500 — 2-C, dock and tour

| # | Question | Ruling | Reason | Source |
|---|---|---|---|---|
| 500-1 | Tour note placement | Keep: only on papers that have a band. | "Press it" with nothing to press is a broken promise. | 2-7 |
| 500-2 | Dismissing the tour | Keep: `Understood` only, no ×. | A × is a second dismissal with an unstated promise; 2-7 says never again after Understood. | 2-7 |
| 500-3 | Message label scope | Yes, every surface: letterhead, More, ⌘K print `Message {first}`. **▲** The letterhead prints bare `MESSAGE` on Cedar and Aspen, where a client is linked (F2-9). | D1 named acts. | D1 |
| 500-4 | More rows per paper | Keep `Sharing` · `Call sheet` · `Set dates` · `Set a budget band` on project papers only. Every paper gets `Standing · N` (when the fallback is in force), `Message {first}`, `Preview the client's copy`, `Keys`. **▲** Direction 390 More has none of the four (F2-17). | D7 order is the full list; a proposal still has a client to message and a copy to preview. | D7 |
| 500-5 | Own act while loading | While pieces load or a proposal has no status, line 2 prints the `NEXT` eyebrow and nothing else; the act arrives when known. No guide line (498-c). | A placeholder sentence that swaps is a flash of the wrong voice in a 56px band. | D1; D2; CONTRACT §4h precedent |

### SQ-506 — Ask the maker → procurement drafts

| # | Question | Ruling | Reason | Source |
|---|---|---|---|---|
| 506-1 | F2 acceptance vs R42 | Amend the walk acceptance: the held case is the line whose vendor, PO vendor and brand are all empty. Seed one such line on Cedar Lane (`Side table`, no maker) so the held form is walkable; Cedar's chair stays un-held. | R42 stands; the fixture, not the rule, was wrong. | R42; F2 (review 1) |
| 506-2 | Maker, no PO, no address | Send is **held** (D3 form): `aria-disabled`, reason `No address on file for Fixture Metalworks.`, repair act `Add an address`. Never native `disabled`. The draft shows in the Movement cell of the line it was asked from as `Date request drafted · no address`. | D3 gated; a disabled control with a sentence in a sheet is tooltip-only by another name. | D3; SQ-511 R2/R12 |
| 506-3 | Second ask after Discard → 409 | A Discard releases the day. 409 only while a live draft (draft / awaiting_review / sending / sent) exists for that line; its refusal reads `A date request for this line is already drafted.` with the act `Open the held draft`. | F1's point is no double send; refusing a person who just said "not that one" until tomorrow is a refusal with no reason to read. | F1 (review 1); L-10 |
| 506-4 | DraftReview in the Movement cell | Keep. | The ask is about arrival; the answer stands where the question is. | D6 |
| 506-5 | Time zone | Keep `America/Chicago` as one named constant in one module for this delivery; listed in §4 as a studio setting for Kody. | No stored studio zone exists; one constant beats a scatter. | §5 open |
| 506-6 | Desk wording | **▲** The Desk row's act is `Open the held draft`; its text `Date request to {maker} drafted — not sent.` Not `Follow up with the maker`, which lands on nothing. | Rule of names. | D1 |

### SQ-507 — ⌘K

| # | Question | Ruling | Reason | Source |
|---|---|---|---|---|
| 507-1 | R27 "when due" source | Same as 499-2: the paper's client receivable, not the Desk's `payment_due` maker need. | A maker balance is not a Money-head matter. | R27; D3 |
| 507-2 | R23 Esc steps back | Keep: Esc from All jobs returns to the paper's results with the sheet open; a second Esc closes. Eyebrow `All jobs` accepted. | Two scopes, one step each; Esc never jumps two floors. | D4; R23 |
| 507-3 | R31 `Open Help` | Keep on both the paper's and the Desk's dry query. | One name. | R31 |
| 507-4 | R24/R25 ask row | Keep the dedupe and the unlabelled group. The row's string is `Ask the paper: "{query}"` — no "AI", no "Engine", no model word anywhere the person reads. | House voice (D11). | D11; R24/R25 |
| 507-5 | R30 leftover `The keys` help row; PO aria-label | **▲** Delete the `The keys` help row; `Keys ?` is the one door. Keep the aria-label `Open the order, PO WS-188` — the visible act never says PO; the number is the row's. | D1 named acts: the act is `Open the order`; the row shows `PO WS-188`. | D1; R28; R30 |

### SQ-508 — region heads

| # | Question | Ruling | Reason | Source |
|---|---|---|---|---|
| 508-1 | ask-the-paper off → Amendment | **▲** No. With one-voice on, the Money head's door is `Record a change` at every state of ask-the-paper; "Amendment" never prints at a door (only inside the router's options). one-voice off keeps today's. | D1 Never column; D5. | D1; D5; D9 |
| 508-2 | Record a change on install and care | Yes — all three spreads print the line's `Record a change` (scored, named act). **▲** Observed absent from Chen's and Halloran's Pieces and Money heads at 1440 (F2-18). | A change after signature is recorded whenever it happens. | D5; D3 |
| 508-3 | Damaged row loses its terracotta stamp | Keep one stamp, but damage **is** the one stamp: a damaged row's single stamp is `DAMAGED` in terracotta; the other stamp yields. | F13's rule is one stamp, not "the first stamp"; damage is the row's exception and must be seen. | F13; D6 |
| 508-4 | Punch list ` · N of M` | **▲** Drop the ratio: `Punch list · {N} open`. | R13 / V11: counts of what is beneath, never ratios. | R13; V11 |

### SQ-510 — fixes F5/F8/F11/F12/F14, R17–R19

| # | Question | Ruling | Reason | Source |
|---|---|---|---|---|
| 510-1 | `Target band · November 2026` in vitals | `Target · November 2026`. "Band" is the budget's word. | D10 names `Set a budget band` and `Set dates` as two things. | D10 |
| 510-2 | Discovery ladder `N OF 5` | **▲** Print the missing names: `Still to add: project type, rooms.`; nothing when complete. | V11; the Discovery own act already names the first missing essential. | V11; D1 |
| 510-3 | `of 04–09` span dropped | Keep dropped. | R13. | R13 |
| 510-4 | Rail drops `Week N` | Keep dropped. | Counts are not front matter on the rail. | V11 |
| 510-5 | Desk stamp unchecked | No ruling change; not walked here (the Desk card stamps were not in this review's probes). Orchestrator: fold into WALK. | — | — |
| 510-6 | Proposal paper collapsed `The proposal needs N inputs` row has no act | **▲** The row's act is `Write the proposal` (scored; lands on the composer at the first missing input). The paper's own act `Send the proposal` stands held beneath the Money/Proposal head with reason `The proposal needs {N} inputs.` | Every row carries its own act; the count is of rows beneath (allowed), and the held form shows why Send cannot be taken. | D2; D3 gated; D1 |

### SQ-511 — CR2 verdict on SQ-506

| # | Finding | Ruling | Reason | Source |
|---|---|---|---|---|
| 511-R1 | `Add the maker` lands nowhere in install mode | **▲** It lands on the line's maker selector with focus, in every mode; a repair act that lands nowhere is a held act with no repair. | L-10 "a press lands with focus on that control". | D1; D3 |
| 511-R2 | Brand-only maker → draft with no address | As 506-2: held Send, reason, repair `Add an address`. | D3 | D3 |
| 511-R3 | Same-day keyed on `created_at` | Key on the studio day (America/Chicago) of the latest **live** draft for the line; a discarded draft does not count (506-3). | 506-3 | F1 |
| 511-R4 | Re-ask then 409 | Resolved by 506-3: no 409 after Discard; the 409 refusal names the live draft and offers `Open the held draft`. | 506-3 | F1; L-10 |
| 511-R5 | `sending` reads as held | A draft in `sending` prints a plain status `Sending…`, not the held form. Held means "this person cannot take it"; sending means "in flight". | D3 | D3 |
| 511-R6 | Sibling notes in the Movement cell | Only the line's own draft shows in its Movement cell; siblings show on their own lines. | One line, one cell. | D6 |
| 511-R7 | Name vs address disagree | The maker name printed on the line wins; an address is used only when it belongs to that same record. Otherwise the draft is address-less and takes the 506-2 held form. | Never send to an address the person did not see named. | D3; trust |
| 511-R12 | No `aria-describedby` on the no-recipient Send | Add it (506-2 form). | D3 gated. | D3 |
| 511 deploy | 00727 → Strata | Not a design matter; the orchestrator's deploy chain. | — | — |

---

## 2. Acceptance against rulings §3 (rows 2-1..2-7), plus slice-1 regressions seen

Verdicts: **pass** · **part** · **fail** · **n/w** (not walked). Screenshots are in `delivery/review-2/`.

| Row | Expectation | 1440 | 390 | Evidence |
|---|---|---|---|---|
| 2-1 | `STAGE · Name` with one of seven words; held reads `PROJECT · ON HOLD`; no `OF 7` | **part** — stage word correct on all nine (`PROJECT`, `DIRECTION`, `INSTALL`, `CARE`); `PROJECT · ON HOLD` ✓ Harrow, `CARE · CLOSED` ✓ Lindqvist; no `OF 7` on any band. **Name is wrong:** `PROJECT · THE CLIENT` ×6, `INSTALL · NORA ELLISON`, `DIRECTION · ELENA MARLOWE (NO-LOGIN HOUSEHOLD)`. Aspen's rail prints `DESIGN DEVELOPMENT` and Cedar's `INSTALL INSTALLATION` (workflow words). | **part** — same, and line 1 clips `… (NO-LOGIN HOUS…` | `1440-chen-top`, `1440-harrow-top`, `1440-lindqvist-top`, `1440-aspen-top`, `1440-cedar-top`, `390-direction-top` |
| 2-2 | Same string per act across band, Desk card, ⌘K, region head, dock on Chen and Direction; cross-device test passes | **fail** — Chen: band/⌘K/dock `Record the payment` but Desk `RECORD PAYMENT`; Aspen Desk `REVIEW DECISIONS` vs band `NUDGE THE CLIENT` (and neither is `Nudge Mei`); Olsen Desk `REVIEW THE CLAIM` vs band and head `FILE THE CLAIM`; Desk prints `Band — no anchor yet` on Birch Hollow and Marrow & Vale (R17); Direction ⌘K prints a `Contract Room` row and no `Write the proposal` row; Harrow band `OPEN THE PIECES` vs Pieces head `BILL 1 UNINVOICED LINE`. Letterhead `MESSAGE`/`PREVIEW` bare; Cedar `PUNCH`. Unit test `act-label-agreement.test.ts` **not run** (no node_modules in the isolated worktree; orchestrator's gate). | **fail** — dock centre matches the band ✓; 390 letterhead `SHARE…` | `1440-desk-top`, `1440-chen-cmdk-pay`, `1440-direction-cmdk-prop`, `1440-olsen-top`, `1440-harrow-top`, `390-direction-top` |
| 2-3 | Chen line 2 `Next ─ Pay Woodward & Sons … RECORD THE PAYMENT` left, `Standing · 2` right; Pieces head leads `Spec the 3 unspecified`; band 56px | **part** — band 56px sticky on all nine ✓; act scored `da-primary` ✓; Pieces head leads `SPEC THE 3 UNSPECIFIED →` ✓; door `Standing · 5` (seed now carries 4 setup/stuck rows, so the count is right for the seed, not the row's `2`); sentence is the Desk ledger line `Balance to Woodward & Sons · $3,400 due 12 May — WS-188`, not prose (498-j). Door terracotta with no class-1 row behind it (498-i). | **part** — stacked form ✓, door to More ✓; short sentence clips to `OVERDUE 14…` (scrollWidth 180 / client 112) | `1440-chen-top`, `390-chen-top`; `chen-1440.json` band.height=56 |
| 2-4 | Door opens `BLOCKS MONEY OR A SIGNATURE` / `NEEDS YOU` / `SETUP`, each row with its own act; Esc returns focus to the word | **part** — groups ✓ in order; Esc → door ✓ (`afterEsc` id `lens-band-more-…`); title `STANDING · 6` vs door `Standing · 5`; rows without an act: Chen `STUCK 3 unspecified`, Aspen `DECISIONS 2 overdue client decisions · Client · blocks Active project work`, Halloran `STUCK NA-2026-077 unanswered, 6 days` | **fail** on Lindqvist — Esc from the sheet lands on the Desk's `Put down` (kin to F3) | `1440-chen-standing-sheet`, `1440-aspen-standing-sheet`, `1440-halloran-standing-sheet`, `390-lindqvist-standing-sheet` |
| 2-5 | On Chen only `Record the payment` is filled with its consequence sentence; `Draw an invoice` and `Spec the 3 unspecified` scored or plain | **fail** — no `.da-terminal` on the paper; pressing the band act opens an `Orders · ledger` sheet with no filled act and no sentence. `Spec the 3 unspecified` inked ✓, `Draw an invoice` plain ✓. Cedar shows filled weight on `ASSIGN PROJECT CLIENT` and on the Install region's `ASK THE MAKER FOR A DATE` (V9). | **fail** — dock centre press opens the same ledger sheet | `1440-chen-record-form`, `390-chen-record-form`, `1440-cedar-top` |
| 2-6 | Chen's phone: centre `Record the payment` in full; Message in More, held with `Link a client first.` and `Link a client` | **—** | **part** — centre `RECORD THE PAYMENT` full, two lines, no overflow ✓; More rows `Standing · 5` · `Message the client` [held, `Link a client first.`] · `Link a client` · `Preview the client's copy` · `Sharing` · `Call sheet` · `Set dates` · `Set a budget band` · `Keys` in D7 order ✓ — but the sheet is 949px tall at top −221 with `overflow: hidden`, so the first four rows are off-screen and unreachable. Dock left column `IN THIS DOCUMENT / Client / AT CLIENT APPROVALS` sits under the `N` FAB. | `390-chen-more-opened`, `390-chen-more-top`, `390-chen-top` |
| 2-7 | First open after the flag: `The band says what's next on this job. Press it.` once under the band; never again after `Understood` | **pass** — mounts under the band, no ×, does not take focus; gone after `Understood` and after reload (`tourAfterReload: null`) | **pass** — same; `Understood`'s underline sits detached ~20px below its label (cosmetic) | `1440-cedar-top`, `390-chen-top`, `390-chen-after-understood` |

**Slice-1 / review-1 fixes rechecked:** F4 reason beneath the held act ✓ · F3 Esc return at 1440 ✓ (390 regression above) · R26/R27/R31 ⌘K rows ✓ · drawer `Keys ?` beneath `Find anything`, clear of `IN HAND TODAY`; `THE POST` one line (rects find[843,841,171,36] keys[843,877,84,27] inhand[1032,848,386,50]) ✓ · Money head without `Amendment` ✓ · Install head one scored leader ✓ · no `N of M` in Closing the book ✓.

**Held and closed papers (D2 last paragraph):** Harrow (held) prints a Next act `This project is paused OPEN THE PIECES` with SETUP rows behind a clay door; Lindqvist (closed) prints `Close the book on this one Standing · 1` with a `No budget band set` setup row, and its ⌘K dry query prints both `Nothing matches.` and `Nothing on this paper matches "close".` plus an `Open the pieces · 0 lines` act row.

---

## 3. Fixes (buildable), with severity and confidence

Severity: **high** = a rulings row fails or a person is blocked; **med** = a ruling is contradicted on one surface; **low** = polish. Confidence is in the finding, not the fix.

| # | Fix | Where | Sev | Conf |
|---|---|---|---|---|
| F2-1 | Band line 1 prints the **job name**: `PROJECT · Chen Residence`, `INSTALL · Cedar Lane Study`, `DIRECTION · Elena Marlowe — Living Room Direction`. Never the household, never the no-login suffix. Line 1 may ellipsise a long job name at 390; the stage word never clips. | `lens-band-derivation.ts` line-1 source; `lens-band.tsx` | high | high |
| F2-2 | Every Desk card component reads `needActLabel` with the first name: kill `Record payment`, `Review decisions`, `Review the claim` (`desk-derivation.ts:162,166,182`) and `Band — no anchor yet` (R17). `folder-card.tsx` already reads the flag; `desk-ledger-row.tsx`, `desk-roster.tsx`, `desk-roster-derivation.ts` do not. | Desk components above | high | high |
| F2-3 | `Record the payment` lands on the WS-188 record-payment control with focus. That control is `da-terminal` with the 499-5 sentence directly above it; nothing else on the paper is filled. The `Orders · ledger` sheet is not a landing. | payment record form; band/dock/⌘K press handlers | high | high |
| F2-4 | 390 (and 600–1100) line 2 yields in the order door → sentence → never the act. When the short form cannot fit unclipped, line 2 prints `NEXT ─ RECORD THE PAYMENT` alone. Sentence per 498-j. Direction prints `Draw up the ...` today. | `lens-band.tsx` measure; `lens-band-derivation.ts` forms | high | high |
| F2-5 | More sheet: `max-height: calc(100dvh - dock)`, `overflow-y: auto`, opens scrolled to its first row. Today `Standing · 5`, `Message the client`, `Link a client`, `Preview the client's copy` are above the viewport (dlgRect top −221, height 949, overflow hidden). | mobile More sheet | high | high |
| F2-6 | Sheet title = door count; Next's row sits first in its group under a `NEXT` eyebrow and is not counted (498-b). | standing sheet | med | high |
| F2-7 | Every sheet row carries its act: `Spec the 3 unspecified`, `Nudge {first}`, `Follow up with the maker` for the three observed. Drop Aspen's trailer ` · Client · blocks Active project work` ("blocks" is machinery; the group eyebrow already says it). | standing sheet rows; `NEED_ACT_LABELS` | med | high |
| F2-8 | 390: Esc from the standing sheet returns focus to the More row that opened it (door in dock) — today lands on `Put down`. | standing sheet focus return | med | high |
| F2-9 | Letterhead names: `Message Nora` / `Message {first}` (held form when none), `Preview the client's copy`, `Open the punch list`, `Sharing` — never `MESSAGE`, `PREVIEW`, `PUNCH`, `SHARE…`. | `letterhead-instruments.tsx` | med | high |
| F2-10 | Held job (Harrow): no Next, no SETUP rows behind the door; line 2 prints the hold sentence (`Paused — nothing moves until it resumes.`) and the door is silent unless a class-1 or class-2 row stands. The Pieces head still leads with the own act (`Open the pieces`), not `Bill 1 uninvoiced line`. | `lens-band-derivation.ts` held branch; Pieces head | med | high |
| F2-11 | Closed job (Lindqvist): line 2 = today's closed sentence, no Next, no setup rows, door silent. ⌘K dry query: one sentence `Nothing on this paper matches "close".`, no `Open the pieces · 0 lines` row. | band; ⌘K dry state | med | high |
| F2-12 | V9: `Assign project client` and the Install region's `Ask the maker for a date` on Cedar leave the filled tier (plain and scored respectively). Filled = D3's four, on the landing control only (P-1). | Client approvals head; install reading row | med | high |
| F2-13 | Aspen letterhead: two `COMPLETE PHASE` primaries and `+ NEW OPEN ITEM` inked — one scored leader per region (R150 R5), and workflow words (`Complete phase`, `Design development`, `Installation`) never print; the rail uses the seven stage words. | letterhead; rail | med | med |
| F2-14 | Direction ⌘K: the `Contract Room` row becomes the act row `Write the proposal`. | ⌘K paper rows | med | high |
| F2-15 | 390 dock left column: never under the `N` FAB (reserve its width or move the FAB above the dock); the no-login suffix never prints in the dock; `AT CLIENT APPROVALS` → the short place word `At approvals` (D7). | mobile bar; FAB | med | high |
| F2-16 | 390 Direction card: `Not started yet` collides with `WRITE THE PROPOSAL →`; stack status above the act at 390. `Understood`'s underline rejoins its label. | direction card; margin-note | low | high |
| F2-17 | Direction 390 More gets `Message {first}` (held when none), `Preview the client's copy`, `Keys`, and `Standing · N` when the fallback is in force (500-4). | More rows per paper type | med | high |
| F2-18 | `Record a change` prints (scored) on the project spread's Pieces and Money heads as on install and care — absent on Chen and Halloran at 1440. | region heads | med | med |
| F2-19 | Delete the Pieces-head hand template; read `ownAct` from the table (499-10). The 499-8 `it.todo`s become live with the strings in 499-8. | `act-names.ts` consumers; tests | med | high |
| F2-20 | Rename controls: `Send the agreement` → `Send the proposal`; release sheet `Send for signature` → `Release for authorization` (filled, with sentence); `Hold the window` → `Hold a window`. | composer; release sheet; install reading | med | high |
| F2-21 | Ratios out: Discovery `N OF 5` → `Still to add: …`; punch list ` · N of M` → `Punch list · N open`; `The proposal — N% written` → `The proposal — N sections to write`. | Discovery ladder; punch list; Direction mark | med | high |
| F2-22 | Door colour: terracotta only when a class-1 row stands **behind** the door (Next excluded); clay otherwise (498-i). Chen is terracotta today with only class-2/3 rows behind it. | door colour source | low | high |
| F2-23 | ⌘K: delete the leftover `The keys` help row (507-5); the ask row reads `Ask the paper: "{query}"` (507-4). | ⌘K | low | high |
| F2-24 | Procurement drafts (SQ-506/511): `Add the maker` lands on the maker selector in install mode; held Send with reason + `Add an address` + `aria-describedby`; Discard releases the day, 409 only against a live draft with `Open the held draft`; `Sending…` plain; one draft per Movement cell; name-record address only; Desk row `Open the held draft` / `Date request to {maker} drafted — not sent.` Seed a maker-less line on Cedar for the walk. | `procurement_drafts` UI, Desk, seed | med | high |
| F2-25 | Vitals `Target band · November 2026` → `Target · November 2026`. | vitals | low | high |
| F2-26 | Cedar `This project does not have a designated decision lead yet.` / `0 decided · no decision lead` → `No decision lead named yet.` (one sentence, no machinery). | Client approvals region | low | med |

---

## 4. For Kody — where I would amend rulings.md (not built; listed, not resolved)

1. **The 390 band sentence yields entirely.** D2 says line 2's form is "chosen by the measure, as the three forms already are". I have ruled (498-g) that when even the short form clips, the sentence drops and the act prints alone. If I154's third form is not "act alone", this is an amendment to D2 and the alternative is a two-row line 2 at 390, which breaks the 56px law. I prefer the amendment.
2. **Held jobs.** D1 gives the eyebrow `PROJECT · ON HOLD`; D2 rules only the closed case ("prints no Next"). I have ruled held = no Next (F2-10). Open: whether a held job offers one act, `Resume the project`, on line 2. Not built.
3. **Door colour** (498-i): terracotta now means "money or a signature waits behind this word", a narrower rule than the executor's "an exception stands". Reverse if the hire walk shows people missing a stuck line because the door was clay.
4. **The studio clock** (506-5): `America/Chicago` is a constant. A studio setting is the right home; it is not in this delivery.
5. **Discard releases the day** (506-3) is a behaviour rulings.md does not have; F1's one-ask-a-day stands for live drafts only.
6. **`Assign project client`** on Cedar is a control whose label wins under the rule of names, but it is a decision-lead control with a client word in it. I left the label and fixed only its weight (F2-12); renaming it is a vocabulary question for §4 of rulings.md ("words to revisit").

## 5. Notes

- **Not walked / not run:** the `act-label-agreement.test.ts` unit test (the isolated worktree has no `node_modules`; the orchestrator's merged gate owns it); Desk card stamps (510-5); the agreement composer and release sheet controls (ruled from the DESIGN-Q text); the ⌘K ask-row string (ruled, not inspected); 390 on Aspen, Olsen, Halloran.
- **Harness:** `node harness.mjs <steps> <width>` in the session scratchpad (`fr2/`) — storage state and all probe JSON are in the SQ-503 verification directory, with `band.height`, act classes (`da-*`), `aria-disabled`/`aria-describedby`, focus after Esc, dock/More geometry and forbidden-string sweeps per paper.
- **Seed drift:** Chen now carries four setup/stuck rows, so `Standing · 5` is right for the seed; §3's `Standing · 2` describes the earlier fixture. WALK should pin the count to the seed it runs on.
