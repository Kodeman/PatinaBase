# Running a Job — the binding ruling record

**Ruled by the Fable design council, delegated by Kody, 7 October 2026.** Chair: SQ-488. Members, ruled blind to each other: **C1** vision and the studio moment (SQ-485), **C2** interaction and the first hire (SQ-486), **C3** risk, scope and reversibility (SQ-487). Ties broken against the code as mapped by the four recon tickets: **SQ-481** slice-0 anchors, flags and tests · **SQ-482** ⌘K, Record a change, install data · **SQ-483** One Voice seams · **SQ-484** Whose Move data.

This record is the design authority for the build. Engineers build from this file, not from the synthesis, the specimens or the council comments. Where this file and `synthesis/direction.md` or a specimen disagree, this file wins. The canon entries R155–R164 in `docs/design/the-document/DECISIONS.md` record the same rulings for the ledger; this file carries the build detail.

**Method.** On each item the chair picked one member's ruling as the spine, grafted better parts from the other two, and ruled against any member where the code makes the ruling unbuildable without inventing data. Nothing was averaged. Every lost position is in §6 so the next session does not re-propose it blind.

**Mandate applied throughout.** The least that lets a first hire pick up Leah's job without Leah, and nothing that makes the studio notice Patina (VISION §2, §4). No task manager, no dashboard, no progress bar, no badge (VISION §6, V11). Copy follows `.claude/skills/patina-brand-voice/SKILL.md`; the two-letter label VISION §6 refuses never prints, and the work is Designer-Taught Intelligence where it must be named at all.

---

## 1. Founder questions Q1–Q10

Each: ruling · vote · why · reversal condition.

### Q1 — Does the stage print in words at the top of every paper? **YES.**
**Vote:** 3–0 on the word. Placement split 1–2 (C1 band line 1; C2 and C3 the letterhead eyebrow); the chair ruled **band line 1**.
**Why:** Scenario 5 is the whole studio moment, and the cold reader cannot name the stage (`walk/s5-step1-olsen-opened.jpg`): the rail says ACTIVE, ONGOING or INSTALLATION and the letterhead prints an unlabelled mark. R150 already seats the stage on band line 1 ("identity and — only where a resolver anchors it — stage") and left the letterhead "the name and nothing else"; the band is sticky, so a word on line 1 is in frame on every scroll stop, where a letterhead eyebrow leaves the frame at the first stop. This ruling drops R150 R1's "where a resolver anchors it" for the seven document words only: they need no resolver. The eleven workflow names stay behind R150 R1's door. L-6 is untouched: the rail head keeps yielding at s0, and wherever its stage phrase does print it prints the same word (the `Ongoing`/`Active`/`Installation` sub-labels from `section-derivation.ts` retire as stage words; see D1).
**Reverse if:** Leah's own stage words make the seven unusable. Then the words swap; the word never leaves.

### Q2 — May the band carry Next and Standing side by side? **YES, two fixed positions, with the door counted and never summarised.**
**Vote:** C1 and C2 yes now; C3 yes in principle, sequenced (rename the door first, split only if the walk still fails). Chair: two positions now, C3's single-slot rename kept as the reversal form.
**Why:** Chen Residence and Cedar Lane both lose the stage's own step to a standing item today because `deriveLensBand` makes line 2 winner-take-all (`lens-band-derivation.ts:729-736`, SQ-483 §4). Giving Next and Standing separate positions ends the competition at the source. C2's kind split in the band (`1 blocks money · 2 setup`) is cut: it is not a verified walk fact (ADV-18) and a classified total in a 56px band is a dashboard in miniature; the sheet one press away carries the groups (V11: the count is the front matter of the rows beneath it). The 56px band is measured law (R127, I154) and is not reopened; the 390 form is specified in D2 so the door never clips.
**Reverse if:** the hire walk (Q8) fails scenario 5 at 390 with two positions. Then line 2 prints Next alone and the door moves to the dock's More as `Standing · N` (C3's form).

### Q3 — Rank by kind, with deadline order inside a class? **YES, from a static need-kind table.**
**Vote:** C1 yes narrowly (static table); C2 yes, openly against W3-R1; C3 partial (keep deadline order, add one setup demotion). Chair: C1's spine, C2's class order, C3's setup rule folded in as the third class.
**Why:** A first hire cannot weigh a damage claim against a missing client link; the paper must. C3's objection — "no field defines consequence" — is answered without inventing data: the class is read from a **hand-written table keyed on `NeedKind`** (`desk-derivation.ts:109-156`), never inferred from state. That is exactly C3's own reversal condition ("a consequence rule derivable from existing state is written and tested"). W3-R1's deadline order is kept **inside** each class, so nothing about distance is lost. ADV-14 holds: a damage claim is in the class the table says, not the class a mockup wanted. The table is in D2.
**Reverse if:** Leah asks for pure date order back after a month on it. Then W3-R1 is restored whole and only the setup rule (class 3 is never Next) survives.

### Q4 — Only the seven document words print as stage on a studio surface? **YES.**
**Vote:** 3–0.
**Why:** Brief · Discovery · Direction · Proposal · Project · Install · Care are the words the paper already uses for its regions (`SectionKey`, `desk-derivation.ts:41-48`). The eleven workflow names (`RESIDENTIAL_WORKFLOW_STAGES`, `packages/types/src/residential-workflow.ts`) stay data and behind R150 R1's door. C2 found the rule already broken in two places this delivery repairs: ⌘K's `STAGE_LABELS` prints "In procurement" and "Out for signature" for Project and Proposal (`command-bar.tsx`), and the rail prints ACTIVE/ONGOING/INSTALLATION. All of it becomes the one word. R124 item 7's I114 mapping is **not** resolved here; nothing built depends on it.
**Reverse if:** the owed I114 session renames the seven. Then the names change in one table (D1) and nowhere else.

### Q5 — Is a missing expected act a named sentence rather than silence? **YES, one gloss only.**
**Vote:** 3–0 on the gloss. Held jobs split: C1 and C2 print the held state; C3 nothing this delivery. Chair: print the held state as the code records it, which is a status without a date.
**Why:** Absence of **state** is silence (V9 §5 unchanged). A **withheld act** — offered but gated — prints one reason sentence beneath it, in muted ink ("Link a client first."). V9 P3 already requires the named reason on an `aria-disabled` act; this names where it prints. A held job is state, and R1-22 found a held job looks live today, so it prints — but `project_status` carries `on_hold` with **no held-since timestamp** (`database.types.ts:46045`), so the eyebrow reads `PROJECT · ON HOLD`, never "Held since 2 Oct": no date is invented. Nothing else earns a sentence; "No active phase handoffs need attention." and its kind are deleted in 0a.
**Reverse if:** the paper starts explaining things it does not offer, or Leah's answer on held jobs (synthesis §7) asks for a different held reading.

### Q6 — May a paper show its full standing list once, on first open? **NO.**
**Vote:** 3–0.
**Why:** It is a task list (ADV-15), it teaches nothing because a thing shown once is never learned, and the L-11 door is the same rows one press away. VISION §5: no task manager. A first open is identical to every open.
**Reverse if:** a real first hire fails scenario 5 **at the door** in the Q8 walk. Then the door prints in words (`Standing · 3` already is words) and still no list unfolds.

### Q7 — Does VISION §4 need a first-hire sentence? **Intent only: not needed.**
**Vote:** 3–0.
**Why:** §2 ("a studio at the moment it adds its first hands") and §4 ("prompts and collects information when and where you need it") already carry the first hire (ADV-46). The sentence would restate, not rule. Nobody edits `VISION.md` or `VISION-DECISIONS.md` in this delivery; a reading may be logged in VISION-DECISIONS later if Kody wants it.
**Reverse:** n/a. No build depends on it.

### Q8 — The five scenarios become the acceptance gate? **YES.**
**Vote:** 3–0.
**Why:** No record of a task test after August was found; R127's gates measure geometry. For every flagged slice, the five scenarios in `walk/WALK.md` are performed by someone who did not build the job, at 1440 and 390, recording (ADV-26): success and step count · accuracy (the right PO, piece, date) · one named refusal met and whether its reason was read · the return path to the paper. Two seed fixtures are added first: a **blocked PO** and a **change after signature**. This replaces geometry-only gates; the R127 e2e measures still run as regression.
**Reverse if:** never.

### Q9 — Is B's first-open list a task list? **Yes. Cut.**
**Vote:** 3–0. Follows Q6. Ownership lives in the band sentence where a record backs it (D8), never in a sheet.

### Q10 — Is the stage mark a progress bar? **The count is; cut it. The mark is logged for Kody, not changed.**
**Vote:** 3–0 on cutting `5 OF 7`. Mark split: C1 and C3 leave it as built; C2 retires it. Chair: untouched this delivery.
**Why:** `5 OF 7` shows position in a sequence, which V11 names refused ("a progress bar"). The eyebrow prints the word alone. The existing strata/arc mark is per-track canon (R111, I114) that this delivery was not briefed to relitigate; its V11 status is an open question for Kody, recorded in §5 and §6.
**Reverse if:** Kody rules the mark a bar — then the mark goes and the word stays. The count stays out regardless.

---

## 2. Design decisions D1–D11 (buildable specs)

### D1 — Vocabulary: the stage words, the eyebrow, and the one-name table

**Stage words, exactly:** `Brief · Discovery · Direction · Proposal · Project · Install · Care`. Title case in prose; DM Mono caps in the eyebrow.

**Eyebrow format (band line 1, left):** `STAGE · Name` — `PROJECT · Chen Residence`. Held: `PROJECT · ON HOLD`. Closed: `CARE · CLOSED`. No count, no plate, no fill, no stage badge (ADV-22). The agreed figure keeps line 1's right slot on project spreads (R150). The letterhead keeps the name at 34px and nothing else (R150 R6).

**Rule of names:** the act's name is the label of the control it lands on, verbatim, on every surface that prints it — band, Desk card, ⌘K, region head, dock. One table in one module feeds all five (SQ-483 §5: `document-guide.ts` `needVerb` and `desk-derivation.ts` `NEED_ACTION_LABELS` consciously diverge today and both read the new table; all consumers are `'use client'` and the derivation libs are isomorphic TS, so there is no server/client seam to cross). A press lands with focus on that control (L-10).

**The stage's own act** (the act that always leads its region head, OD-11's second printing):

| Stage | Own act (control label) | Lands on |
|---|---|---|
| Brief | `Respond to the inquiry` | the inquiry's reply control |
| Discovery | `Add the {first missing essential}` — `Add the project type` · `Add the rooms` · `Add the scope` · `Add the budget band` | that essential's field (today's band already names it: `Yours to add: project type and named rooms.`) |
| Direction | `Write the proposal` | the Contract Room door. Replaces today's four labels on one screen (`Draft up the direction` · `Open the Contract Room` · `Drafting the proposal` · `Continue drafting`); `Continue drafting` is deleted |
| Proposal, draft | `Send the proposal` | the send sheet |
| Proposal, sent | `Nudge {first name}` (family-label fallback `Nudge the client`; "Client User" joins the placeholder guard, 0a #7) | the nudge control |
| Proposal, accepted | `Open the project` | the project paper |
| Project | `Spec the {N} unspecified` while N > 0 · then `Release for authorization` while lines are eligible · then `Open the pieces` | the Pieces head (`FF&E schedule` retires as a printed name; the region is already called Pieces on the rail; the Spec book keeps its name) |
| Install | the install reading's act (D6): `Ask the maker for a date` · `Hold a window` · `Open the punch list` | the reading's row / the window / the punch list |
| Care | `Run the closeout checklist` | the checklist |

**Named acts:**

| Act | Prints as | Never |
|---|---|---|
| Record a change | `Record a change` | "Amendment", "Change order", "Add a change" at the door — those words appear only inside the router's two options |
| Ask the maker for a date | `Ask the maker for a date` | "Chase …" (ADV-34) |
| Open the order | `Open the order` — the row shows `PO WS-188`; the act never says "PO" | "Open PO" |
| Message | `Message {first name}` (fallback `Message the client`); withheld: `Message the client` with the reason beneath, `Link a client first.`, and the repair act `Link a client` beside it | "Message the client" offered while no client is linked (F52) |
| File the claim | `File the claim` | "Review the claim" (a Desk label today) |
| Record the payment | `Record the payment` | the bare `Record` the 390 band prints today |
| Punch | `Open the punch list` | `Punch` (ADV-52) |
| Preview | `Preview the client's copy` | `Preview` alone (ADV-52) |

**Where today prints several names for one control, the control's label wins**, so unchanged controls copy today's string verbatim (ADV-29, ADV-32). The 13 cross-device contradictions in `briefing/current-state.md:126-140` each collapse to the control's label; the build adds one test that asserts cross-device label agreement (none exists today, SQ-483 §8).

### D2 — The band

The band keeps R127's 56px at every width, R150's line 1, and I154's three-form measure for line 2.

**1440.**
Line 1: `STAGE · Name` left (D1); agreed figure right on project spreads (R150).
Line 2, left: `Next ─ <sentence> <ACT>` — the eyebrow `NEXT`, one 15px sentence (V9 P2), the act as a scored word. Example: *Next ─ Pay Woodward & Sons the WS-188 balance, 148 days overdue. RECORD THE PAYMENT*.
Line 2, right: the door, `Standing · 3` — the word and the count, nothing else. Press opens the L-11 `DocSheet`; Esc returns focus to the word. The count is every sheet row (exceptions + inputs, L-11) minus the one the band names (I154 D1). Nothing stands: the right side is silent.

**390.**
Line 2 stacks in the band's short form (I154): the `NEXT` eyebrow, the sentence in its short form (`W6-R1`), then the act, with the door `Standing · 3` after the act on the same row. The dock's centre repeats the act (D7). If the measure cannot fit the door unclipped on the act's row, the door moves to the first row of the dock's More as `Standing · 3` and the band prints Next alone — chosen by the measure, as the three forms already are, never by width alone.

**The sheet** (L-11, opened by the door) groups its rows under three eyebrows in this order: `BLOCKS MONEY OR A SIGNATURE` · `NEEDS YOU` · `SETUP`; deadline order inside each group (W3-R1 inside classes). Each row carries its own act (I154 D1). `INPUT NEEDED` rows fold into `NEEDS YOU` or `SETUP` by the table below. The sheet is where the kind split lives; the band never prints it.

**Next selection order.** Next is the top of this order that the signed-in person **can take**; a gated act is never Next (it stands in the sheet with its reason). Ties inside a class by deadline distance (past first, most days first; then ahead, soonest first; then none, longest standing first — W3-R1's own order).

1. Class 1, **blocks money or a signature**
2. Class 2, **needs you**
3. The stage's own act (D1)
4. Class 3, **setup** — never Next while anything in 1–3 stands; on a quiet job Next is the stage's own act and setup stays behind the door

Whatever Next is, the stage's own act always leads its region head (OD-11, two printings). A closed job keeps today's closed sentence on line 2 and prints no Next.

**The class table (static, keyed on `NeedKind`).** A kind not listed is class 2. The class is never inferred from a row's state, amount or tier (ADV-14).

| Class | `NeedKind` |
|---|---|
| 1 · blocks money or a signature | `payment_due` · `payment_failed` · `overdue_invoice` · `hesitating_proposal` · `proposal_expired` · `proposal_declined` · `quote_expiring` · `return_by` |
| 2 · needs you | `overdue_decision` · `claim_window` · `damage_claim` · `lines_flagged` · `awaiting_inspection` · `schedule_conflict` · `schedule_proposal` · `task_due` · `po_unsent` · `po_unacknowledged` · `ack_discrepancy` · `cfa_pending` · `memo_return` · `exception_open` · `proposal_signed` · `new_lead` · `ceremony_pending` · `reconnect_due` · `pulse_due` |
| 3 · setup | `schedule_unconfigured` · the `No client linked` row (D10) · an unset budget band · an unset target date |

Ticket-row exceptions in `rankStanding()` map through their need kind; a bare `LensStandingTier` with no kind (`overdue` · `decision-due` · `damage` · `po-silence`) is class 2. The tiers stay eyebrow words (W3-R1) and are never the sort key.

**Overflow:** there is no `+N MORE` string any more. The door is always `Standing · N`.

### D3 — Weight tiers

| Tier | When | Acts |
|---|---|---|
| **Filled (`terminal`, R139)** | money moves or is recorded as moved, or a paper is signed or sent for signature; one consequence sentence above it in every state (R141); the amount in the label where there is one | `Record the payment` · `Release for authorization` · `Send the proposal` · `Send the invoice` |
| **Scored (`primary`/`inked`)** | the Next act when not terminal; the stage's own act on its region head (one leader per region, R150 R5); the four named acts | `Record a change` · `Ask the maker for a date` · `Open the order` · `File the claim` |
| **Plain (`secondary`/`tertiary`)** | everything else | `Set dates` · `Set a budget band` · `Preview the client's copy` · `Sharing` · `Call sheet` · `Fold` · `Open the record` · `Draw an invoice` |
| **Gated (`held`)** | offered, cannot be taken by this person now | stays in tab order; `aria-disabled="true"`; the reason as one muted sentence directly beneath, linked by `aria-describedby`; the repair act beside it as a plain act when one exists (`Link a client`). Never native `disabled`, never tooltip-only, never terracotta |

No new tier. `SPEC THE 3 UNSPECIFIED`, `DRAW AN INVOICE` and `OPEN THE RECORD` leave the filled tier (they are not money or signature). Send and Release surface their single blocking condition as the reason sentence and switch from `disabled` to `held` (0a #8; the Release button's native-disabled wiring through `RegionLedgerEntry` is unconfirmed, SQ-481 — the implementer traces it first).

### D4 — ⌘K searches the open paper

**Scope.** With a paper in hand, ⌘K searches it first: FF&E line names, maker names, PO and invoice numbers, room names, people on the job, region names, and the paper's acts. The data is already client-side via `useProjectFFEItems(projectId)` (room, PO number, vendor name on the row, SQ-482 §1); the new result builder sits beside the existing `documentRow`/`personRow` builders in `CommandBar`'s `useMemo`, gated on `inHandRow`. The Engine's "Ask" row (catalog search for a new piece) stays where it is today, below the paper's rows.

**Ranking.** Groups in order: `On this paper · {Name}` (≤5 rows) → `Acts on this paper` → `Elsewhere` (`Search all jobs for "x"`, then `Where the work stands`) → Help, last. Any paper hit outranks Help, always.

**Row form.** `Custom Walnut Sectional — 3 pc · Woodward & Sons · Received · PO WS-188` with the act `↵ Open the order`. Enter lands on the unfolded line with its Order cell visible and focus on the PO (the Order cell renders with the unfolded line; `?ffeItemId=` is mount-only today, so the in-page landing must be wired, SQ-482 §2). Esc returns focus to the opener.

**Synonyms.** One hand-written table in the registry, at most twelve groups, no inference:

| Query words | Resolves to |
|---|---|
| change · revision · amendment · change order · swap · reselect | `Record a change` |
| late · behind · arriving · ETA · lead time · delivery | the Install reading (Install papers only) |
| PO · purchase order · order · order number | `Open the order` |
| pay · payment · balance · deposit · invoice · owed | the Money acts |
| sofa · couch · sectional · settee · loveseat | each other |
| chair · armchair | each other |
| table · desk | each other |
| lamp · light | each other |
| rug · carpet | each other |
| shelving · built-in | each other |
| client · homeowner · household | the household rows |
| keys · shortcuts | `Keys` (`?`) |

**Dry query.** `Nothing on this paper matches "x".` then the rows `Open the pieces · 3 lines` · `Search all jobs for "x"` · Help, last. Pieces first, Help last, never Help alone (today's `help-center-recovery` row).

**`?`.** Prints in two places only: the Studio Drawer, as its own act `Keys ?` beneath `Find anything ⌘K`, at every width; and the ⌘K foot line `↵ open · ↑↓ move · ? keys · esc close`. Not in the letterhead, not on the band. R132's guards stand: `?` never fires inside a text field or an open dialog.

**Controls.** Result rows are real focusable options with ↑↓/Enter; the sheet contains focus (ADV-40).

### D5 — Record a change: a router, not a sheet

**One question:** `What changed?` with two native radio options (ADV-41):

- `On a piece` — *Swap, add or remove a piece, or change its finish, size or maker.*
- `On the agreement` — *The scope, the fee or the terms.*

`Continue` stays focusable and reads `Choose one to continue.` until an option is chosen; Enter continues; Esc returns focus to the pressing control. **No outcome sentences** ("the maker gets a change order", "Chen signs the amendment") — cut until the destination sheets' behaviour is verified (ADV-33); each destination states its own consequence.

**Destinations.** `On a piece` → the Pieces region with `Choose the piece`; a line with a PO opens `ChangeOrderAct` (`line-unfold/change-order.tsx`) for that line; a line without a PO unfolds for editing with today's controls. Each unfolded line carries `Record a change` as its **first** act (today it is buried past buy/quote/order). `On the agreement` → the existing `AmendmentSheet` (`overlays/amendment-sheet.tsx`, via `document:open-project-change`).

**Where it prints.** The Pieces head as its second act (after the stage's own act); the Money head as its second act; ⌘K's `Acts on this paper` at project, install and care (today's install/care gate at `command-bar.tsx:706-717` widens to project). **Not** on the folded seam: `FoldSeam` is one `<button>` with no sibling slot, and a nested control is not viable (SQ-482 §7) — verbs on the seam are deferred (§3). Not in the band.

### D6 — The install reading

**Where.** The Install region head's own status line (W4-R1) — one answer to "where is Install" (ADV-24). The band's Next quotes it when the reading's act is Next. The two counts (`0 of 2 installed`, `1 of 1 placed`) are deleted, not merged (ADV-20); each row prints a state word instead — `Not here` · `Here` · `Installed` — and no ratio.

**Anchor.** A piece-level recorded date only: `purchase_orders.confirmed_eta` (an arrival date). The install start (`project_phases`) is **never** the anchor (ADV-11). The system never writes "late" or "behind"; it prints the fact. `po_acknowledgments.ack_ship_date` is a ship date, not an arrival, and is not read this delivery. "Here" = the row's `delivered_date` is set or `project_ffe_items.status` is received or installed; the build defines that selector once and both the head and the rows read it (0a #2).

**Copy by state** (dates in V9's one style, day then month):

| State | Reading | Act |
|---|---|---|
| A piece not here, no `confirmed_eta` | `Reading chair isn't here, and no arrival date is recorded.` | `Ask the maker for a date` |
| A piece not here, `confirmed_eta` passed | `Reading chair was due 2 October and isn't here.` | `Ask the maker for a date` |
| A piece not here, `confirmed_eta` ahead | `Reading chair arrives Thursday 9 October.` | `Hold a window` (if no window is held; else silence) |
| Everything here | `Everything is here.` | `Open the punch list` |

Several pieces not here: the sentence names the first by the Next order and counts the rest — `Reading chair isn't here, and no arrival date is recorded. 2 more aren't here.` The install start may print as a fact in the rows (`The install began 11 June`), never in the reading as a comparison.

**`Ask the maker for a date`.** Opens a DocSheet with the note drafted — to the maker, subject, body, focus on the body — and two acts: `Hold for review` (scored) and `Discard`. **No Send exists on this surface.** Hold for review writes the draft through the existing server-side route pattern (`enqueue_agent_task` with `p_status: 'awaiting_review'`, as `/api/people/chase-renewal` does; SQ-482 §6) with a new task type; a person sends it from the Post. The row then reads `Asked 7 October · draft held for review` and its act becomes `Open the held draft`. Hard rule, no exception: a draft held for review, never an automated send (AGENTS.md: drafts land `awaiting_review`).

### D7 — The phone dock

Centre = the Next act in the band's exact words; wraps to two lines; never shortened. Left = household + a short place word (`At approvals`), never clipped. Right = `More`, in this order: `Message {first name}` · `Preview the client's copy` · `Sharing` · `Call sheet` · `Set dates` · `Set a budget band` · `Keys`. When Q2's 390 fallback is in force, `Standing · N` is More's first row.

No client linked: Message is never the centre; in More it is gated per D3 — `Message the client`, reason `Link a client first.`, repair act `Link a client`. The Document registers the Next act with the `useMobilePrimaryAction` registry at the top priority from the D1 table (`letterhead-instruments.tsx:299-308` today registers Message; `canSendNote` must require a linked client, not a project id — 0a #3).

### D8 — Whose Move: what ships, what is cut

**Ships this delivery:**
- The stage word (via D1).
- Message withheld with its reason wherever it prints (D3, D7).
- Custody in the band only as a recorded owner already allows: R150 R2's `Waiting on {first name}: …` where the need's owner is the client, `With the maker` where it is the maker. "Yours" is the studio's pen, never a named person.
- **The one-note tour**, re-cut from the existing once-only margin note on a versioned key (R131, `margin-note.tsx`): `The band says what's next on this job. Press it.` with the act `Understood`. In flow under the band, not modal, not focus-stealing, no count, no sequence, once per person per version.

**Cut, and why:**
- The handoff line (`Leah put this down Tuesday. Yours now.`) — no handoff record exists at job or stage grain; `Put down` writes nothing (SQ-484 §1, §3). Deferred until an assignment/handoff record exists (a migration, a follow-on); R133 makes the handoff a conversation Kody runs, not a line.
- The ownership sentence with a named person (`Yours: file the claim …`) — no assignment record; `NeedLine.owner` is a derived role (SQ-484 §1).
- `Waiting on: no one` — an invented negative (ADV-13).
- The first-open unfolded list (Q6, Q9).
- Desk prose (`With Maya: … she has the damage claim`; `In brief · 5 — Show all`) — no need-level assignment exists, and the overflow count was misdescribed (ADV-30, ADV-31). The Desk is out of this delivery's scope.
- `MAYA'S PEN` on a Desk card — R143 D6's four words stand; no fifth.

A first open is identical to every open.

### D9 — Flags

Two PostHog flags, fail-closed (`useFeatureFlag` defaults `false`; `NEXT_PUBLIC_FLAG_OVERRIDES="ask-the-paper:true,one-voice:true"` for local and CI, SQ-481 §11). Flags target Leah's studio by user id, never by email.

| Flag | Gates |
|---|---|
| `ask-the-paper` | Slice 1: ⌘K on the paper, Record a change, the install reading, `?` printed |
| `one-voice` | Slice 2: the one-name table, the Next/Standing band, the stage word, weight by role, the dock; and slice 3's residue (the one-note tour) |

Slices 0a and 0b ship **unflagged**: they remove defects against canon already in force, and a revert is their rollback.

**Order on:** 0a → 0b → `ask-the-paper` for Leah's studio → five-scenario walk → `one-voice` for Leah's studio → five-scenario walk → both to 100%. Each flag stays until its walk passes; a flag that fails its walk goes off, not forward.

### D10 — Slice 0b

- `No client linked — attach one` leaves the letterhead (`household-chip.tsx:57`). On a live job it is **one** `SETUP` row in the standing sheet; it is suppressed on `project_status` `completed` and `on_hold`. The Message gate repeats the same words once, as its reason (D3).
- Setup paints clay ink, plain tier, at the foot of the sheet under the `SETUP` eyebrow; never terracotta, never the band's left slot (`lens-band.tsx:267-271` paints every standing item terracotta today). The `NEEDS SETUP · 1` chip is deleted. `Set a target` and `Set a budget band` leave the letterhead for the `SETUP` group.
- Setup is never Next while any other act is open; on a quiet job Next is the stage's own act (D2 class 3).
- **Placement:** 0b is its own unflagged slice between 0a and slice 1. It ships after 0a because it depends on Q3 and Q5, which this record rules; it ships before slice 1 because slice 1's install reading assumes setup is already off the band.

### D11 — Do not copy from the specimens

1. `5 OF 7`, the `.strata` fills and b2's filled stage `.stamp` plates — the word alone.
2. `Behind the install start · 118 days`, `$14,500`, `Arriving: Nothing dated this week` — only recorded facts print.
3. The handoff line, Maya's assignment, `Waiting on: no one`, `MAYA'S PEN`, and AP-012 as *blocks money* — invented data and an unruled classification (ADV-13, ADV-14).
4. The band's kind summary `1 blocks money · 2 setup` — the band prints the door only.
5. The router's outcome sentences and `Chen signs` (ADV-33); c2's `Add a piece` (today's act is `Spec the 3 unspecified`, copied verbatim).
6. `CHASE FIXTURE METALWORKS` — no landing existed (ADV-34); the act is `Ask the maker for a date` with D6's sheet.
7. `for Elena Marlowe (no-login household)`, `The Scans` for Rooms, and `Client` as a rail label on no-client jobs — unchanged strings copy the walk verbatim (ADV-28, ADV-36).
8. The specimens' non-working ARIA (div listbox, button radios, `aria-modal="false"`) — native controls with real focus return (ADV-40–42).
9. a1's 1080px frame — the landing must be shown at 900 (ADV-27).

---

## 3. Delivery scope

### In scope, with one acceptance line each (checked at 1440 and 390)

**Slice 0a — pure repairs (unflagged).** Anchors in SQ-481.

| # | Feature | Acceptance line |
|---|---|---|
| 0a-1 | Care: rail and body agree; one `Care` heading | On the completed seed job, no `Ongoing` prints anywhere and `Care` prints once; `section-derivation.test.ts:112-121` is updated to the new truth |
| 0a-2 | Install's two counts become one selector | The head's status line and the rows derive from one function; no `N of M` prints in Install |
| 0a-3 | F52 — Message requires a linked client | On Chen (no client), the dock centre is not Message and `canSendNote` is false |
| 0a-4 | Machinery removed | `EXACT ARTIFACT · NAMED AUTHORITY`, `BAND`, and the seeded engineering note do not render on Direction or Project |
| 0a-5 | `No active phase handoffs need attention.` deleted | `phase-advance-control.tsx` renders nothing in that state |
| 0a-6 | `Not priced yet` | A Direction draft with `total_amount` 0 prints `Not priced yet` and no figure |
| 0a-7 | Placeholder-name guard | `Client User` resolves to `the client` in band, nudge and preview labels |
| 0a-8 | Send and Release name their refusal | Each blocked act is focusable, `aria-disabled`, and its single blocking reason is readable beneath it |

**Slice 0b — repairs that waited on Q3/Q5 (unflagged).** See D10.

| # | Feature | Acceptance line |
|---|---|---|
| 0b-1 | `No client linked` leaves the letterhead | On Chen it prints once, as a `SETUP` row in the standing sheet; on the completed seed job it prints nowhere |
| 0b-2 | Setup never terracotta, never Next | On Cedar Lane, `Name the phases` is clay ink inside the sheet and the band's line 2 is the stage's own act |

**Slice 1 — Ask the Paper (`ask-the-paper`).**

| # | Feature | Acceptance line |
|---|---|---|
| 1-1 | ⌘K on the paper | On Chen, typing `sectional` shows `Custom Walnut Sectional — 3 pc` under `On this paper` above any Help row; Enter lands on the unfolded line with the Order cell visible and focus on `PO WS-188` |
| 1-2 | ⌘K synonyms and dry query | `change` offers `Record a change`; `zzz` prints `Nothing on this paper matches "zzz".` with `Open the pieces · 3 lines` first and Help last |
| 1-3 | Record a change | From the Pieces head, `Record a change` → `What changed?` → `On the agreement` opens the amendment sheet; `On a piece` → a line with a PO opens its change order; Esc returns focus to the head's act |
| 1-4 | Install reading | On Cedar Lane the Install head reads `Reading chair isn't here, and no arrival date is recorded.`; nowhere prints `late`, `behind` or a ratio |
| 1-5 | Ask the maker for a date | `Hold for review` writes an `awaiting_review` task and the row reads `Asked {date} · draft held for review`; no Send control exists on the sheet; nothing reaches the maker |
| 1-6 | `?` printed | The drawer shows `Keys ?` and the ⌘K foot shows `? keys`; `?` opens the Keys sheet and does not fire inside a text field |

**Slice 2 — One Voice (`one-voice`).**

| # | Feature | Acceptance line |
|---|---|---|
| 2-1 | Stage word | Every seed paper's band line 1 reads `STAGE · Name` with one of the seven words; the held fixture reads `PROJECT · ON HOLD`; no `OF 7` prints |
| 2-2 | One-name table | The band, Desk card, ⌘K row, region head and dock print the same string for the same act on Chen and Direction; the new cross-device test passes |
| 2-3 | Next and Standing | On Chen, line 2 reads `Next ─ Pay Woodward & Sons … RECORD THE PAYMENT` left and `Standing · 2` right; the Pieces head still leads with `Spec the 3 unspecified`; the band measures 56px |
| 2-4 | Standing sheet | The door opens rows grouped `BLOCKS MONEY OR A SIGNATURE` / `NEEDS YOU` / `SETUP`, each with its own act; Esc returns focus to the word |
| 2-5 | Weight by role | On Chen only `Record the payment` is filled, with its consequence sentence above; `Draw an invoice` and `Spec the 3 unspecified` are scored or plain |
| 2-6 | Dock | On Chen's phone the centre reads `Record the payment` in full; Message is in More, gated with `Link a client first.` and `Link a client` |
| 2-7 | One-note tour | On a person's first open after the flag, `The band says what's next on this job. Press it.` appears once under the band and never again after `Understood` |

**Process (Q8).** Two seed fixtures land before slice 1's walk: a blocked PO and a change after signature. The five scenarios are walked per flag by someone who did not build the job.

### Deferred (not in this delivery)

| Item | Why | Returns when |
|---|---|---|
| Handoff line; ownership sentence naming a person; `Yours` on the paper | No assignment or handoff record exists (SQ-484) | A `document_handoffs`-shaped record ships (a migration) |
| Desk prose (`Yours today …`, `7 more jobs below · SHOW ALL`) | Desk is outside this delivery; no aggregate producer; overflow count misdescribed (ADV-31) | Its own Desk ticket after `one-voice` |
| First-open unfolded standing list | Q6/Q9: a task list | Never, unless Q6's reversal fires |
| Kind split in the band | ADV-18; V11 | Never in the band; it lives in the sheet |
| Verbs on the folded seam | `FoldSeam` is one button with no sibling slot (SQ-482 §7) | A `FoldSeam` trailing-slot ruling |
| `ack_ship_date` in the install reading | A ship date is not an arrival | If Leah wants ship dates read |
| The strata mark's V11 status | Not this delivery's to relitigate (Q10) | Kody's ruling |
| I114 section↔stage mapping | R124 item 7: nothing depends on it | The owed I114 session |

---

## 4. Words to revisit when Leah's studio words arrive

Synthesis §7 asks Leah for four words. Each is shipped now with the council's choice and swapped in one place (the D1 table or the D4 synonym table) when hers arrive:

| Ours | Hers may replace | Where it lives |
|---|---|---|
| `change` (`Record a change`) | revision · amendment · change order | D1 table, D5 router title, D4 synonyms |
| the fact sentence instead of `late` (`was due 2 October and isn't here`) | her word for late, if she has one and wants it printed | D6 copy table |
| `Standing` | her word for open items | D2 door, sheet title |
| `Pieces` (region name, `Open the pieces`) | FF&E · schedule · specs | D1 table, rail |
| the seven stage words | she may rename any; she may not add an eighth | D1 table only |
| `Hold a window` · `Ask the maker for a date` · `Open the punch list` | her install words | D1/D6 tables |
| `whose move` (never printed this delivery) | — | §3 deferred |

Not revisited: `Record` · `Open` · `Message` · `Ask` as verbs; the rule that an act's name is its control's label.

---

## 5. Open for Kody (not resolved here)

- Whether the strata/arc mark is a progress bar under V11 (Q10). The count is cut regardless.
- Whether a held job wants a date; none is recorded today (Q5).
- Leah's four words (§4) and her first hire's walk (Q8).

---

## 6. Dissents — where a member's ruling lost, and why

| Item | Lost position | Member | Why it lost |
|---|---|---|---|
| Q1 | Stage word in the letterhead eyebrow | C2, C3 | R150 left the letterhead "the name and nothing else" and seats stage on band line 1; the band is sticky and always in frame |
| Q2 | Rename the door only; split later | C3 | Two positions is the fix for the winner-take-all slot the recon confirmed; C3's form is kept as the reversal |
| Q2 / D2 | Kind split in the band (`STANDING · 3 — 1 blocks money · 2 setup`) | C2 | Unverified (ADV-18); a classified total in the band is a dashboard in miniature; the sheet carries the groups (V11) |
| Q2 / D2 | `Next — nothing waits on you here.` when nothing is Next | C2 | The stage's own act makes Next never empty on a live job; a closed job keeps its closed sentence; absence of state is silence (Q5) |
| Q3 | Keep W3-R1 whole; no money/signature class | C3 | The static `NeedKind` table is a consequence rule derivable from existing state — C3's own reversal condition — so the class is buildable without inventing data |
| Q5 | `PROJECT · HELD SINCE 2 OCT` | C1, C2 | No held-since timestamp exists on `projects`; the date would be invented. `ON HOLD` prints instead |
| Q5 | No held reading at all | C3 | `on_hold` is recorded state and a held job looking live was a reviewer catch (R1-22) |
| Q10 | Retire the strata mark with the count | C2 | Per-track canon (R111, I114) outside this brief; logged for Kody |
| D1 | Project's own act stays `Open the FF&E schedule` until Leah's word | C3 | The rail already names the region Pieces; the act that leads the head is the control that exists there (`Spec the N unspecified`) |
| D1 | `Message the client` identical on every stage | C2 | R150 R2 names the client by first name; the family-label guard already falls back to `the client` |
| D1 | `Record the ship date` replaces `Ask the maker for a date` | C3 | `purchase_orders.confirmed_eta` is a recorded arrival date, so the reading has a truthful anchor; the ask-the-maker draft is buildable on the existing `awaiting_review` route pattern (SQ-482 §6) and the ticket requires the maker-draft behaviour |
| D3 | Gated reason on the same line after an em dash | C2 | The code's `held` + `aria-describedby` pattern renders a reason element; one form (beneath) on every surface |
| D5 | `Record a change` on the Money fold seam | C1 | `FoldSeam` is one button; a nested control is not viable (SQ-482 §7) |
| D5 | Outcome sentences print once verified | C2 | Cut outright; destinations state their own consequence (ADV-33) |
| D6 | `Late — …` as a printed state word from a piece-level date | C2 | "late" is one of Leah's four words (synthesis §7); the fact sentence prints until she rules |
| D6 | Anchor on `ack_ship_date`; cut the maker draft | C3 | See D1 row above; a ship date is not an arrival |
| D6 | `0 of 2 installed` and `1 of 1 placed` reconciled into one count | synthesis | Deleted, not merged (ADV-20); a state word per row and no ratio (C2) |
| D8 | Desk prose and `Waiting on` from real records | C2 | Desk is out of scope; no aggregate producer exists (SQ-484 §6); deferred, not refused |
| D8 | Tour copy `New to this job? The band says what's next. Press it. ? shows the keys.` | C2 | Two sentences teach two things; the shorter note (C1, C3) teaches the one door |
| D9 | Slice 1 unflagged; one flag `document-next-act` for slice 2 | C3 | Slice 1 adds devices and is walked under a flag (Q8); two flags match the two walks. R124's `job-ticket` precedent shows the no-flag law was program-specific |
| D10 | 0b folds into slice 1 | C3 | 0b is unflagged repair work; slice 1 is flagged. Mixing them puts a repair behind a flag |

---

*Chair's note on the inputs.* The briefing printed for this ticket carried `Ref: undefined` and an empty claim guard; the board's `executor_mismatch` reply supplied the corrected claim (an upstream Sidequest defect, also recorded on SQ-487). All seven board threads were read in full; the walk JPEGs were not re-opened beyond what the members cited.
