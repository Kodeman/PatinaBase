# US-27 W2c: The Desk build spec, Direction A against today's code

**12 October 2026, SQ-803, base `a91a98107`.** This spec turns US-26 Direction A (V19) into a build. It changes no product code.

**Sources:** `artifacts/desk-redesign-2026-10-12/` `synthesis/direction.md` §3 A, §5–§7; `specimens/SPEC.md` §2–3; `proposed-a-{1440,390}.html`; `review/triage.md` R1 and R2; V18 and V19 (`docs/vision/VISION-DECISIONS.md:493-541`).

**Conventions:** paths are relative to `apps/designer-portal/src/` unless they start with `supabase/` or `packages/`. ⟦Qn⟧ marks a step that depends on an open question; §(f) gives the declined case. Copy is the team's wording until Leah confirms it (direction §8).

## (a) The component tree for A

`DeskPage` (`app/(document)/desk/page.tsx`) renders, in order: the header; `hr.doc-rule-strong` (`globals.css:373`); **Today** (`DaySheet`), up to five `DeskJobCard`s of `SheetLine`s; **the ledger** (`DeskRoster`) of `DeskLedgerRow`s.

**New:** `components/document/desk-job-card.tsx`; `acts/set-aside-sheet.tsx` ⟦Q9⟧; a `record-payment` act kind ⟦Q10⟧. **Unchanged:** `RecentBoardsStrip`, `DeskBoardsReactionRollup`, `DeskContents`.

**Header:** F1 (§(d)), plus "Record an inquiry" goes from `primary` (`page.tsx:486`) to `secondary`, and the date `<p data-part="head">` (`:470-476`) moves into Today's eyebrow.

**DaySheet** takes `{ sheet, cards, scope, onScope, oneVoice, now, dateLabel, visitLine? }` and drops `jobs`.
- The salutation (`day-sheet.tsx:40-44`, `:206-212`) gives way to the eyebrow "MONDAY 12 OCTOBER · TODAY", with the existing scope buttons (`:35-38`, `:213-227`) on its baseline.
- The `<ol>` (`:230-245`) becomes the card grid.
- The Awaiting and Coming back blocks (`:250-278`) and `THE_REST` (`:280`) move to the ledger.
- `data-testid="day-sheet"` and `data-day-sheet-line` stay.

**DeskJobCard** (new) takes `{ card: SheetCard, position, scope, oneVoice, now }`. It renders an `<article data-stage>` with:
- the eyebrow: stage word, then a holder word when it isn't the viewer's (in the studio's scope, always), then the freshness word from `timeWord` (`day-sheet.ts:176`);
- the job name, a `Link` to `/doc/{jobId}` that covers the whole upper block;
- the person line, only when it differs from the name;
- its lines.

**SheetLine** takes `{ entry, settled, holder, first, oneVoice, now, job? }`. It keeps its act handler (`:93-113`), the Not today write (`:153-170`), the inline failure (`:172-176`) and the landing (`:83-91`). The overdue clause (`deriveOverdue`, `desk-roster-derivation.ts:509`) takes `--color-terracotta-ink`. Settled, it drops its foot and prints its state muted (§(c)); someone else's prints "The move is Jordan's." with no act.

**DeskRoster** takes `{ ledger, belowHead? }`.
- **Retired:** the `deriveDeskClaims` call (`desk-roster.tsx:43-53`), the "Studio workload" eyebrow (`:64-66`), "By team member" (`:67-80`; the studio's scope regroups by person instead) and "The work is in motion." (`:111`).
- **Eyebrows:** `GROUP_HEAD` (`:29-30`) becomes `SectionEyebrow`.
- **Kept:** `data-testid="desk-roster"` and `data-roster-group`.

**DeskLedgerRow** takes `{ line, standing }`: the same five-cell row plus a 2 px stage tick (`::before`), phase word kept (`:67-72`). An `others` row prints "waiting on {who} since {day}" and a `back` row "Back {day}", neither with an act; a row settled today prints muted, in place.

**CSS** (`globals.css`):
- **Grid:** `.desk-job-grid` replaces `.day-sheet-line` and `.day-sheet-acts` (`:590-604`, `:616-619`). It is a self-measuring container, as `.desk-ledger-list` is (`:625-627`): 3-up at ≥ 900 px, 2-up at ≥ 600 px, 1-up below.
- **Card:** `.desk-job-card` has `1px solid var(--color-card-edge)` (`:60`) ⟦Q5⟧, a left edge of `3px solid var(--stage-tab)`, a 2 px radius and a `var(--doc-paper)` face. It is a flex column with its foot set to `margin-top: auto`.
- **Hover and stage map:** the hover is `var(--stage-wash-still)`, with no transition. Six `[data-stage]` rules set `--stage-tab` and `--stage-wash-still` from the existing `--tab-*` (`:164-169`) and `--wash-*-still` (`:187-192`). Care borrows install.
- **No shadow, and no new light token.**

**The Desk has no filled act.** Every card act is already secondary (`day-sheet.tsx:142`). V18 Q8 caps filled acts at one and does not require one. `e2e/document/action-visibility.spec.ts:156` and `:255-259` assert a primary in `desk-head`, so they change (§(h)).

## (b) Data changes

Only change 8 needs a migration or RLS (Q8).

**1. `groupSheetByJob`** is a new pure fold in `lib/document/day-sheet.ts`, placed after `:167`, over `DaySheet.lines` (`:42-50`).
- **Shape:** `groupSheetByJob(lines, rosterJobs): SheetCard[]`, where `SheetCard = { jobId, name, stage, holder, lines }`.
- **Key:** `projectId`, which is `project_id ?? engagement_id` (`desk-need-list.ts:106`).
- **Order:** cards by their first line's rank; within a card, a hand-off first.
- **Stage:** from the full roster map (`page.tsx:231-237`), built before change 2's exclusion.
- No migration or RLS.

**2. The ledger excludes Today's jobs in every scope** (triage R1). A new `deriveDeskLedger({ roster, cards, standing, scope, people })` in `desk-roster-derivation.ts` replaces `custodyGroups` (`:707-730`) and the `deriveDeskClaims` path.
- It drops every line whose `projectId ?? engagementId` (`page.tsx:234`) has a card. The drop runs before the by-person regrouping, so Marsh Street never reappears under "Jordan's".
- `deriveDeskRoster` (`:463-648`) is unchanged; it still feeds `rosterJobs` and `pinnedProjectIds` (`page.tsx:292-295`).
- No migration or RLS.

**3. Settled lines stay until the next morning** (R2, Q6, Q15) ⟦Q6⟧ ⟦Q15⟧.
- **The hook:**
  - `packages/supabase/src/hooks/use-need-states.ts:52` adds `updated_at` to its select.
  - `NeedState` (`:7-15`) and `mapNeedStateRows` (`:27-37`) gain `updatedAt`.
- **When a line counts as settled today:** either of these holds:
  - its `actedAt` falls on today's local day;
  - its `deferredUntil` or `setAsideUntil` is set and its `updatedAt` falls on today.
- **The sheet:** `deriveDaySheet` (`day-sheet.ts:133-158`) ranks open and settled-today needs together in its one `rankDeskNeeds` call (`:158`) and takes five. Settled lines carry `settled: { kind, at, who?, until?, reason? }`. Settling never changes rank, so no slot frees (§(g)).
- **No visit memory to build:** the state rows are that memory, across reloads and devices, and a line stops being "today" the next day.
- **Undo** calls `set_need_state(…, 'clear')` (`supabase/migrations/00765_studio_need_states.sql:132-135`). A hand-off read today settles as "Note read" instead of being skipped (`day-sheet.ts:140`).
- **No migration or RLS:** the column exists (00765:36), and `select_own` (00765:45-47) and the grant (00765:50) cover it.

**4. Deferred and set-aside lines feed Coming back.** `setAside` (`day-sheet.ts:35-40`, `:145-147`) becomes `comingBack: { need, until, reason, kind }`, and the bare `continue` at `:149` now pushes a `not_today` entry. Lines settled today stay on their line. No migration.

**5. One meaning of "with others."** Today the roster splits on need `owner` (`desk-roster-derivation.ts:714-722`; `overdue_invoice` is `client`, `desk-derivation.ts:1112`; `po_unacknowledged` is `maker`, `:1936`, `:1954`), while the sheet splits on `acted_at` (`day-sheet.ts:141-143`). The one meaning: **with others means the studio owes no act** — (a) the need was acted on before today ("waiting on {who} since {day}", `waitingWho`, `day-sheet.ts:85-91`), or (b) the job has no open need but carries a motion chip (`motionAnchorDate`, `desk-roster-derivation.ts:288`).
- `deriveDaySheet` returns `standing: Map<jobId, 'yours' | 'others' | 'back' | 'settled' | 'rest'>`.
- A ledger row prints the job's first open need from that same ranked list, not `folder.need` (`:495-502`), so Today and the ledger agree, and a silent PO or overdue invoice with an act owed stays yours. `owner` becomes the sentence's subject only. No migration.

**6. A lead takes the person's name** (F7). `desk-roster-derivation.ts:561`, `desk-need-list.ts:108` and `desk-scope.ts:156` and `:169` call one helper, `deskJobName(row)`, placed beside `DocumentStateRow` (`desk-derivation.ts:54`). It returns `clientOf(row)` (`desk-roster-derivation.ts:233-239`) for a lead and `row.title` otherwise. No migration.

**7. A draft saved for the lead settles.** `acts/act-draft.tsx:214-224` also marks a saved draft as `acted`, with `waitingOn` set to the lead's first name. The line then reads "Drafted for Leah · she sees this first", with others. No migration.

**8. A teammate's acted state** ⟦Q8⟧ needs **a migration and RLS.** It ships in slice 4, and only on a yes.
- **The policy:** a new `studio_need_states_select_studio`, `FOR SELECT USING (public.is_active_org_member(organization_id))`.
- **The hook:** it selects `user_id` and splits the viewer's own rows from teammates'. Otherwise `need_key` collides, because the primary key is `(user_id, need_key)` (00765:37) and `use-need-states.ts:28` keys by `need_key`.
- **The copy:** a fact only, "Jordan drafted this for you · 9:30". Never a pace or a count.
- **Review:** its own frontier review.

**Freeing a slot:** a need resolved at its source, such as a paid invoice or an opened project, no longer exists, so the next need ranks in. A Desk act never frees one.

## (c) Every state

The fixture is Hartwell (SPEC §3).

**At rest** (Leah, Mine, 8:41).
- **Header and Today:** the header and its double rule; then the eyebrow "MONDAY 12 OCTOBER · TODAY" with "Mine · The studio's".
- **The cards:** four of them hold five lines: Holloway (the invoice and the PO), Linden, Pell Court and Ines Calder. There is no head sentence; the header already greets.
- **A card eyebrow** reads "PROJECT · 2 HOURS AGO".
- **A line** reads "Invoice INV-2026-0721 is **$3,800 overdue**, due Monday 28 September." with **Send reminder** and **Not today**. Only "$3,800 overdue" is in terracotta-ink.
- **The groups** follow Today's closing `--rule-mid`: "Also yours", "With others", "Coming back", and "No current alert" with a **Show** button. The last is Direction C's word for At rest (`desk-roster-derivation.ts:242`), and it has no count.

**Mid-act** (8:41). The act sheet opens over an unchanged Desk, with its existing "Send to Nora and Sam Holloway" and "Put back". The line settles only once the state write lands; failures keep their existing messages (`act-draft.tsx:207-209`).

**Settled** (8:48). The line stays put in `--text-muted`, without its foot. No slot refills, and there is no ✓, count or "cleared".
- **The pattern:** "{what} · waiting on {who} since {h:mm}", for example "Reminder sent · waiting on Nora and Sam Holloway since 8:42".
- **The verbs:** "Chase sent", "Follow-up sent", "Orders released", "Replied", "Drafted for Leah · she sees this first" and "Note read".
- **Not today:** "Not today · 4:15 pm · back Tuesday 13 October", with **Undo**.
- **Set aside:** "Set aside until Friday 16 October · waiting on the Chens' bench decision", with **Undo**.

**Quiet.** Today's head says one of three things:
- "Today's lines are handled. What can wait is below." when every Today line is settled but Also yours still has open lines;
- "Nothing more needs you today." when nothing is open in scope;
- "Nothing needs you today." on an empty morning.

None of these prints while a feed is unread.

**The hire's view** (Jordan, Mine, 8:55). Two cards. Marsh Street opens "Leah handed you Marsh Street Kitchen on Saturday 10 October · Read her note"; its PO line reads "Ninebark Lighting has not answered PO-MS-0388 ($2,180) in 4 days. Leah's note asks to see anything in writing first." with **Draft the chase for Leah**. Wren Row Bath is the second card. Below Today: "The rest of the studio's jobs are Leah's." (with two leads, "…are Leah's and Sam's."). No studio money anywhere (V18 Q10).

**The studio's scope** (Leah, 8:40). Every card eyebrow names its holder ("PROJECT · LEAH'S", "PROJECT · JORDAN'S"). Marsh Street reads "Handed to Jordan by Leah, Saturday 10 October · Read the note", its PO sentence, then "The move is Jordan's." The ledger groups by person: "Leah's" (Also yours, With others, Coming back, No current alert) and "Jordan's" ("With Jordan", Wren Row Bath only; With others; Coming back).

**Empty studio.** The eyebrow, then "No project files yet. Record an inquiry or create a project file to begin." No cards or groups; `DeskContents prominent` rises (`page.tsx:593`).

**Read error.** Whole Desk: the existing block (`page.tsx:543-568`), "Your studio overview couldn't load." with **Try again**, under the eyebrow's date. One feed unread: Today's head reads "Not checked: project leads." and the at-rest group is labelled "Not checked". A failed write: "Not today did not save. Try again." or "Undo did not save. Try again."

**Loading** (replaces `page.tsx:410-423`). The header and the eyebrow's date show. Today is `aria-busy="true"` with three empty 1 px `--border-subtle` frames, 120 px tall and unanimated, and a visually hidden "Loading today's lines." The ledger is not drawn.

**After Record an inquiry** ⟦Q11⟧. A muted visit line prints above Also yours: "Ainsley Moore recorded · just now · Open the brief". Her row heads Also yours, under her name.

## (d) Fix-now F1–F8 (slice 0)

**F1: the header.**
- **Files:** `app/(document)/desk/page.tsx:68-76`, `:448-530`, `:483`, `:486`, `:493-497`, `:501`, `:510-514`, `:521-525`.
- **The change:** delete the sub-labels and their wrappers; set the header on one baseline row; `:486` becomes `secondary`; the ⌘K hint shows for a fine pointer only.
- **Kept:** `lib/document/registry.tsx:264` and `:277`, which ⌘K and Desk Contents print (`desk-contents.tsx:263-264`).
- **Open:** which acts stay is Q7.

**F2: section edges.**
- **Files:** `globals.css:575-583`, `:590-597`, `:605`, `:611`, `:637`; `day-sheet.tsx:204`, `:231-244`, `:252`, `:266`; `desk-roster.tsx:29-30`, `:60`, `:90-91`.
- **Rules:**
  - every rule runs full measure, including the action-group wrapper and the `<ol>` at `day-sheet.tsx:231-244`;
  - Today and the ledger each close on `var(--rule-mid)` (`globals.css:144`);
  - `.doc-rule-strong` sits under the header.
- **Eyebrows:** `SectionEyebrow` replaces `GROUP_HEAD` and the two inline `<h3>`s.
- **Spacing:** 48 px under the header (`page.tsx:448`), 72 px between sections (`desk-roster.tsx:60`), 24 px above each group (`:90`), and 12/12 row padding.

**F3: the lone line** (`day-sheet.tsx:121-136`, `globals.css:616-619`). The name `<strong>` (`:129-131`) becomes a `Link`; at 390 the act and Not today share one `flex-wrap` row. Slice 2's card name link absorbs this.

**F4: footer and quiet copy.**
- **Files:** `day-sheet.tsx:32`, `:250`, `:264`, `:280`; `desk-ledger-row.tsx:20`; `lib/document/day-sheet.ts:149`.
- **Copy:** `:32` becomes "Nothing more needs you today."; `THE_REST` moves above the closing rule; `desk-ledger-row.tsx:20` becomes "No current alert" (as `desk-roster-derivation.ts:94`).
- **Gates:** the `quiet &&` gates at `:250` and `:264` come off, and `:149` feeds Coming back.
- **Recommendation: ungate in slice 1.** Until the one meaning lands, an acted job shows twice: in the sheet's Awaiting block and under the roster's "Owed by you" (`desk-roster-derivation.ts:714-722`). The roster reads no need states.

**F5: the same need twice** (`desk-ledger-row.tsx:89-114`, `desk-roster.tsx:97-99`, `page.tsx:434-438`). Pass the sheet's job ids to the ledger; a row whose job has a sheet line prints "On today's sheet" instead of an act. Slice 1 retires this; skip F5 if slices 0 and 1 ship together.

**F6: Back loses the place.**
- **Files:** `page.tsx:406-408`, `:410-423`; `desk-ledger-row.tsx:22-25`, `:51`.
- **The change:** save `scrollY` to `sessionStorage` when a Desk link is pressed and on `pagehide`. Restore it once `arrivalRoot` latches, **only on a history traversal**; on a hard entry the arrival owns the landing.
- **Fallback:** the row anchor, when the stored offset exceeds the page height.
- **Scroll behaviour:** `behavior: 'auto'`.

**F7: the lead named "Consultation".** See §(b) change 6. The summary stays as its sentence.

**F8: the dock truncates** (`components/document/mobile/mobile-bar.tsx:400`, fallbacks `:367`, `:386`; `components/tester/tester-widget.tsx:236-238`). `truncate` becomes `break-words`, so "Studio overview" wraps. The TESTER pill (`fixed left-4` at `--doc-shell-floating-bottom`, `:39`) moves above the dock at 390, clear of the label.

## (e) Responsive and accessibility

**The 390 header** is two rows of about 92 px: "Good morning, *Leah*", then "＋ Inquiry", "＋ Project" and "Find". A put Find on row 1; this spec moves it to row 2 so focus order equals visual order at both widths (WCAG 2.4.3, 1.3.2). Accessible names stay whole ("Record an inquiry", "Create a project file", "Find anything") and contain each visible word (2.5.3); the short span is `aria-hidden`. No sub-labels.

**The 390 body.** Cards are 1-up; the act and Not today wrap onto one row; ledger rows stack through the existing container query (`globals.css:646-654`), tick beside the name. No horizontal scroll.

**44 px targets.** Already there: `DocumentAction` (asserted at `e2e/document/desk-claims.spec.ts:105-113`), the scope buttons (`min-h-11`, `day-sheet.tsx:221`), the card's name block. To add: the ledger name link (`desk-ledger-row.tsx:56-62`, `min-h-11 inline-flex items-center`), the Show fold, and Undo.

**Focus order** follows the DOM, which follows the eye (the grid flows by row): the header acts; the eyebrow (`tabIndex={-1}`, script only); Mine and The studio's; each card's name, then each line's act and Not today (or Undo); each ledger row's name and act; Show; then the boards and contents. The card's upper block takes a 2 px `--color-clay-ink` focus outline.

**The arrival landing (US-14).**
- **The head moves:** `data-part="head"` and `tabIndex={-1}` move from `page.tsx:470-476` to the eyebrow's date, which becomes `<p data-part="head settle">`. `settle` moves too, because Today's head sentence (`day-sheet.tsx:208`) no longer prints at rest.
- **The engine** takes the first visible `[data-part~="head"]` (`lib/arrival/engine.ts:229`) and reads its text as the place: "Monday 12 October, Today." (`engine.ts:60-63`).
- **Card 1 carries the rest:** `job` is its name, `headline` its first line, `act` that line's act, and `f1`/`f2` the next two lines, as `day-sheet.tsx:118` indexes them now. The tokens are unchanged, so `e2e/arrival/play-desk.spec.ts:51-52` stands.

**Settling.** After an act, focus moves to the settled line (`tabIndex={-1}`) and one polite `role="status"` region announces it; after Not today, focus moves to Undo.

**Reduced motion.** The Desk doesn't move (`globals.css:309`). A settle changes only the ink; the hover wash and the fold have no transition; F6 restores with `auto`. The arrival keeps its own reduced-motion path.

**Colour.** `--color-card-edge` is 3.21:1 on `--doc-paper`, and terracotta-ink is 5.41:1. The stage word always prints, so colour never carries meaning alone (1.4.1). The F9 block (`globals.css:656`) draws the card edge and the stage rule in `CanvasText`. Dark mode is documented only ⟦Q13⟧.

## (f) Dependencies on still-open questions (US-26 Q5–Q15)

**Q5, `--card-edge` beyond claim cards.**
- **Recommended:** Today cards take `--color-card-edge`, never on rail stock (2.62:1).
- **If declined:** only that one declaration changes. The card takes `--doc-ink-border` (`globals.css:74`, which fails 1.4.11) or no box, and the 3 px stage rule stays.

**Q6, settled lines stay and slots don't refill.** Recommended: §(b) change 3, with Undo. If declined: keep `day-sheet.ts:141-143` and the refill at `:158`, and drop `settled`, Undo and §(g).

**Q7, the header's acts.**
- **Recommended:** both creates stay, and the date moves to the eyebrow.
- **If declined:**
  - Create a project file stays in ⌘K (`registry.tsx:277`) and Desk Contents only;
  - the date and `head` stay at `page.tsx:470-476`;
  - the eyebrow reads "TODAY";
  - 390 gets one short label.

**Q8, a teammate's acted state.** Recommended: §(b) change 8, the migration plus RLS, in slice 4. If declined: the studio's scope reads only the viewer's own states, so Jordan's acted line reads open there, with "The move is Jordan's."

**Q9, a door for Set aside.** Recommended: "Not today · Until…" opens `SetAsideSheet`, with date and reason both required, as the RPC requires (00765:161-163); the line returns under Coming back. If declined: no sheet, and Coming back holds deferred lines only.

**Q10, Record the payment as a scoped sheet.** Recommended: a `'record-payment'` kind (`acts/act-sheet-kind.ts:38`) for `overdue_invoice` and `payment_due`, one invoice, named control "Record $3,400", using the existing `useRecordPayment` (`accounts/invoice-folio.tsx:28`) so the writer and RLS are the same; it replaces `day-sheet.tsx:109-112`; the hire follows V18 Q10/Q11. If declined: `openLedger` stays.

**Q11, Record an inquiry closes onto the Desk.** Recommended: `overlays/capture-lead-sheet.tsx:129-130` drops `router.push` and calls `onCreated(lead)`; the Desk prints the visit line. If declined: it navigates to the brief, with no visit line.

**Q12, a project colour.** Recommended: nothing. If declined: Direction C's migration, out of A's scope.

**Q13, dark mode.** Recommended: the six `--tab-*-edge` companions go into `docs/design/house-sheet/SPEC.md:89-108`, with no CSS. If declined: a dark paper set is its own story; A is unchanged.

**Q14, urgency colour.** Recommended: the tag means stage only; terracotta-ink only on the overdue clause. If declined: the 3 px rule takes its colour from the need class (B's tab), and the stage word stays ink.

**Q15, what moved, shown in place.** Recommended: §(b) change 3. If declined: settled lines live in component memory for the visit only, cleared on reload, and the close shows only With others and Coming back.

## (g) The US-26 SPEC x4 inconsistency

**The problem.** SPEC §2.2 x4 (11:21) shows Today holding only Thornfield and Ainsley Moore. That breaks the revised Q6 twice:
- the morning's settled lines have left;
- Thornfield, who ranked beyond five at 8:40 (§3.2), has refilled a freed slot.

The triage left this open (`review/triage.md:26`). x6 has a sister problem: seven settled lines on six cards, against V18 Q1's five lines.

**The rule** (§(b) change 3):
- **One list.** Today is the top five of one ranked list, made of the open needs and the needs settled today.
- **No refill.** Settling never changes a line's rank, so it never frees a slot.
- **New needs can enter.** A newly arrived need that outranks a line enters Today (direction M7: "lands in Today, or at the head of Also yours"), and the line it displaces moves to the ledger with its state.
- **Beyond five.** Needs past the fifth live in Also yours and settle in place there.
- **The cap holds.** Today never shows more than five lines, settled lines included.

**x4 resolved.** At 11:21 Today holds the morning's four cards and five settled lines: Holloway ("Reminder sent … since 8:42", "Chase sent … since 8:47"), Linden (9:05), Pell Court (9:12) and Ines Calder (9:20). Today's head: "Today's lines are handled. What can wait is below." Under the rule: the visit line, then Also yours with Ainsley Moore ("Called about a primary bedroom, budget $25–35k · just now · Reply") and Thornfield ("The Ashbys signed on Friday · Open the project"). Ainsley, a class-2 inquiry arriving after Ines, does not outrank the fifth line, so she heads Also yours; M7's cost is unchanged.

**x6 resolved.** Today: the same five settled lines, under "Nothing more needs you today." Also yours: two muted lines settled in place, "Replied · waiting on Ainsley Moore since 2:40 pm" and "Not today · 4:15 pm · back Tuesday 13 October". With others and Coming back as SPEC has them. One correction: SPEC's note that Thornfield joins Coming back the next morning holds only across a weekend; on Tuesday it is open again.

**Redraw** a4, a6 and a12. B and C share the problem, which is out of A's scope.

## (h) Test plan

Run focused suites while building, and the patina-verification gate for the designer portal before closeout.

**Unit tests.**
- **`lib/document/__tests__/day-sheet.test.ts`.** New cases:
  - `groupSheetByJob`: one card per job, hand-off first, at most five lines;
  - an act at 8:42 is still `settled` at 17:50 and gone the next day;
  - no sixth need is promoted;
  - an outranking arrival displaces the fifth line;
  - Not today and Set aside feed `comingBack`, but today's Not today stays on its line;
  - stateless `overdue_invoice` and `po_unacknowledged` are `yours`;
  - acted-yesterday and chip-only jobs are `others`.
  Rewrite `:132`.
- **`lib/document/__tests__/desk-roster-derivation.test.ts`:** `deriveDeskLedger` excludes Today's jobs in both scopes; group order; no counts; `deskJobName`.
- **`packages/supabase`:** `mapNeedStateRows` maps `updatedAt`.
- **`components/document/day-sheet.test.tsx`:** `head` on the eyebrow; terracotta-ink only on the overdue clause; Undo calls `clear`; a non-holder line has no act; no `/\d+ more|cleared|streak/`.
- **`desk-ledger-row.test.tsx` and `desk-roster.test.tsx`:** the tick; `others` and `back` rows have no act; no "Studio workload" or "By team member"; the fold has `aria-expanded`.
- **`app/(document)/desk/page.test.tsx`:** `:269-275` (F24) inverts; `:384`'s head moves; `:259` no primary; F6 restores on Back only.
- **Act tests:** a lead draft marks `acted`; new `SetAsideSheet` ⟦Q9⟧ and `record-payment` ⟦Q10⟧ tests; capture-lead closes onto the Desk ⟦Q11⟧.

**E2E specs to update** (`apps/designer-portal/e2e/`).
- **`document/desk-claims.spec.ts`:**
  - `:77-119`: group keys and their order (`:88-96`); `[data-claim-card]` and `[data-stage-tab]` now exist (`:97-98`); only the at-rest group folds (`:116-118`);
  - `:121-140`: drop "The rest are on their projects." (`:133`), but keep the five-line cap and the no-count regex (`:137`);
  - `:142-181`: at 390, the act and Not today share a row (`:153-160`);
  - `:183-224` and `:226-250` stand.
- **`document/desk-error-state.spec.ts`:**
  - `:75` and `:117` take the new quiet copy;
  - `:80`, `:95` and `:113` wait on the "Studio workload" heading, which leaves, so they wait on Today instead.
- **`document/action-visibility.spec.ts`:**
  - `:156` and `:255-259`: there is no primary in `desk-head`;
  - `:165-174` stands.
- **`arrival/play-desk.spec.ts`:** `:51-52`, `:64` and `:170` run unchanged as the regression check on `head`.
- **`wp3-screenshots.spec.ts:233-260`:** refresh the shot.
- **`document/hours.spec.ts:152`:** no change. Its "By team member" belongs to Timesheets, not the Desk.

**Visual checks.** Headless Playwright, local Supabase, the Hartwell seed.
- **Frames:** 1440 × 900 and 390 × 844, at 8:40 (studio), 8:48, 8:55 (Jordan), 11:21 and 5:50 pm. Compare each against `proposed-a-1440.html` a1, a3, a5 and a6, and `proposed-a-390.html` a8 and a10–a12.
- **Assertions:** `scrollWidth ≤ clientWidth` at 390; no computed `box-shadow`; no ellipsis or `truncate`; every hit box ≥ 44 px; the head rule and the last hairline share their x-extent (F2); the TESTER pill clears the dock label (F8).
- **Marks at rest,** with US-26's counter, against a1 (43 · 20 · 13 · 12) and a8 (30 · 15 · 9 · 6).
- **Emulate** `forced-colors: active` and `prefers-reduced-motion: reduce`. Dark mode is not rendered.
