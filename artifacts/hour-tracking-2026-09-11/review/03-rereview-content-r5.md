clean = false

# Re-review — content, round 5 (adversarial)

Target: `artifacts/hour-tracking-2026-09-11/deck/src/index.html` (1,559 lines, 16 `.slide`
sections). Checked against `synthesis.md`, `architecture.md` (both as amended by the
round-5 fixer), the nine memos in `panel/`, the four files in `briefing/`,
`docs/design/the-document/DECISIONS.md`, `docs/design/field-companion/field-companion-package.md`,
`docs/vision/VISION.md`, and the repo (read-only). Prior rounds read in full:
`03-rereview-content-r4.md` and `02-fix-log-r4.md` including its "Round-5 source
amendments" section.

**Verdict: NOT clean.** 0 blockers, 9 majors, 5 minors, 4 notes.

No blockers: every ruling id the deck cites (D9, D10, R19, R64, R69, R77 — it cites no
others) was re-resolved in `DECISIONS.md` this round and is quoted consistently with the
ruling's own text — D9 `:20`, D10 `:21`, R19 `:668-677`, R64 `:2359-2372`, R69 `:2555` with
the Scope line at `:2561`, R77 `:2648-2650`.

The dominant finding is new and mechanical: **the round-5 renumbering of reserved migration
ranges landed in `architecture.md` and not in the deck**, so six cells of sheet 10 and one
cell of sheet 14 now disagree with the plan they summarise.

---

## 1 · Findings

| ID | Sev | Conf | Location | Finding | Fix |
|---|---|---|---|---|---|
| **R5-1** | major | high | `index.html:1112`, `:1120`, `:1128`, `:1136`, `:1144`, `:1152`, `:1162` (sheet 10, Migrations column) | **Every migration range from W2 down is stale against the amended plan.** `02-fix-log-r4.md:155-183` renumbered W2–W7 in `architecture.md`; the deck was explicitly not touched. Deck vs `architecture.md:831-836` at head: W2 `head+10…+12` vs **`head+10 … +13`**; W3 `head+13…+14` vs **`head+14 … +15`**; W4 `head+15…+19` vs **`head+16 … +20`**; W5 `none · head+20 reserved` vs **`(none; head+21 reserved)`**; W6 `head+21…+22` vs **`head+22 … +23`**; W7 `head+23…+25` vs **`head+24 … +26`**. The `tfoot` total `head+1…+25` (`:1162`) is short by one. Every wave-block bullet in `architecture.md` §2–§8 was renumbered to match (`:287-305`, `:411-422`, `:504-525`, `:667-670`, `:769-778`), so the deck is the only stale copy. | Set the six cells to `head+10…+13`, `head+14…+15`, `head+16…+20`, `none · head+21 reserved`, `head+22…+23`, `head+24…+26`, and the total to `head+1…+26`. |
| **R5-2** | major | high | `index.html:1365` (sheet 14, HT-37) | **`head+12` double-booked on the face of the deck.** HT-37's recommendation still reads "if he rules delete, the INVOKER replacement lands in **head+12**". The fix log resolved R4-10 by reserving a *separate* slot: `architecture.md:305-307` ("`head+13` — reserved, and the home for the INVOKER rollup RPC **if** Kody rules HT-37 … a separate reserved slot from `head+12`"), with `:324` and `:956` both amended to `head+13`. `head+12` is now HT-10's alone. Flagged as known-stale by the fixer (`02-fix-log-r4.md:193-199`). `index.html:1304` (risk 8) and `:1399` (HT-10 gates "W2's head+12") are **correct** and must not be changed. | `head+12` → `head+13` at `:1365` only. |
| **R5-3** | major | high | `index.html:1298` (risk 2) and `:523` (sheet 03, "Fix a member's wrong entry" footnote) | **Four of the nine policies are cited at superseded definitions.** `00484_public_rpc_authorization_contract.sql:783-812` DROPs and re-CREATEs all four "Team can …" policies; the head definitions are `00484:785` (DELETE), `:794` (INSERT), `:803` (UPDATE), `:812` (SELECT), each adding `TO authenticated`. `00177:140,144,148,152` are dead at head — exactly the staleness class `architecture.md:20` makes a binding rule ("re-anchors on the head body"), and the class R4-4 was graded major for. The *substance* is unaffected (the head bodies still read `user_id = auth.uid() AND is_project_team_member(project_id)`), and the count of nine and the 5/4 split are both **correct**. `00177:136` (FOR ALL, via `projects p`) and all four `00316` policies are **not** re-created later and are cited correctly. Missed by rounds 1–4. | `:1298` → "four through `is_project_team_member(project_id)` (`00177:140,144,148,152`, re-created at head by `00484:785,794,803,812`)". `:523` → "every *own-row* write policy is `user_id = auth.uid()` (head: `00484:803,785`; `00316:248,257`)". |
| **R5-4** | major | high | `index.html:874` (sheet 07, "Backfill is mandatory") | **The parenthetical is now false.** It reads "W1 ships a one-off re-rate … **(synthesis said W0 — the plan moves it behind the resolver)**". The fixer amended `synthesis.md:137` this round to "**Wave 1** ships a one-off re-rate" (`02-fix-log-r4.md:221-224`). The divergence the annotation exists to flag no longer exists; the deck now asserts something about the synthesis that the synthesis does not say. | Drop the parenthetical: "…W1 ships a one-off re-rate plus a pre-flight count of rows whose rate would change." |
| **R5-5** | major | high | source-side — `synthesis.md:29`, `:143`; `architecture.md:20`, `:171`, `:896` | **R4-4 not discharged.** All five still carry `00578:2599-2805`. Re-verified in repo this round: `CREATE OR REPLACE FUNCTION public.classify_project_time_entry_authority()` at `00578:2599`, `AS $$` `:2604`, `BEGIN` `:2619`, `END;` `:2819`, `$$;` `:2820` — lines **2802-2818** (the prior-accrual sum, the ceiling comparison and the final `ELSE NEW.billing_state := 'pending_authorization'`) fall outside the cited span. `architecture.md:171` is W1's implementation instruction; a brief copying `2599-2805` drops the ceiling branch. Deck (`:675`, `:683`) is correct. Reopened at original severity — third round asked. | `00578:2599-2820` at all five lines. (R4-4 named `:891` and `:172`; after the R4-10 insertion those are `:896` and `:171`.) |
| **R5-6** | major | high | source-side — `synthesis.md:141`; `architecture.md:241`, `:896` | **R4-5 not discharged.** "207 lines" / "a 207-line body" / "a 207-line classifier" survive in all three. Re-derived: 2820 − 2599 + 1 = **222** statement lines; 2819 − 2619 + 1 = **201** between `BEGIN` and `END`. 207 is the 00412-era figure. Deck (`:875`, `:1297`) is correct. | "222 lines (`00578:2599-2820`), 201 between `BEGIN` and `END`". |
| **R5-7** | major | high | source-side — `architecture.md:513`, `:897`; `synthesis.md:186`, `:270` | **R4-3 not discharged**, and it has a fourth site the round-4 report did not name (`synthesis.md:270`, dissent 10). All four still say "all eight" policies. Re-counted at head by grep: **nine** `CREATE POLICY … ON public.project_time_entries` with no later DROP — five via `projects p` (`00177:136`; `00316:237,242,248,257`), four via `is_project_team_member` (head bodies at `00484:785,794,803,812`). Deck `:1298` is correct on nine. W4's **"four new RLS policies"** (`architecture.md:512`, deck `:1124` and `:1298`) is still un-re-checked against the ninth — that was the second half of R4-3's ask and remains open. | "nine … five through `projects p`, four through `is_project_team_member`" at all four lines; then re-derive W4's new-policy count against `00177:136`. |
| **R5-8** | major | high | source-side — `synthesis.md:49`, `:193`; `architecture.md:280` | **R4-2 not discharged.** `synthesis.md:49` still reads "**No admin can fix a member's wrong entry** … Every UPDATE/DELETE policy is `user_id = auth.uid()`"; `:193` still reads "Today the only thing an admin can do about a member's wrong entry is nothing"; `architecture.md:280` still reads "An owner/admin can **finally** fix a member's wrong entry". Re-verified: `00177:136-137` is `FOR ALL USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_time_entries.project_id AND p.designer_id = auth.uid()))` — no `user_id` test, no later DROP, so the project's own designer can already UPDATE and DELETE another member's unbilled row today. The deck (`:518` ◐ "the project's own designer only", `:523`) is correct; the three source lines are false. | Restate all three as "an admin who is **not** the project's designer", not all admins. |
| **R5-9** | major | med | source-side — `synthesis.md:93`; `panel/memo-ux-mobile.md:21` | **R4-7 not discharged.** Both still label the collapsed-strip one-action contract "(Invariant V)". `field-companion-package.md:319-322` defines Invariant V as "On every screen where a capture can be created, the visit's project and room are legible without a tap, and changing them is exactly one tap away" — nothing about the strip. The code fact is sound (`FieldCompanionPresentation.swift:51-54` two action ids; `:56-64` one optional `action`) and the deck now cites it directly (`:639`, `:1026`, `:1346`). Caveat on the fix: `memo-ux-mobile.md` is a seat's record, not a live document — amending it rewrites history. | Amend `synthesis.md:93` to cite `FieldCompanionPresentation.swift:56-64` without the invariant name. Leave the memo as written, or add a bracketed editor's note beside it. |
| **R5-10** | minor | high | source-side — `synthesis.md:156`; `architecture.md:918` | **R4-15 not discharged.** Both still say seven seats ("BIL §5, VET-16, CR-26, LEAH-13, FS-40, OPS-13, **draft** — 7 seats"; "Seven seats."). That is six seats plus the architecture draft, which is not a seat. Deck `:905` is correct at "6 seats + the draft". | "6 seats + the draft" at both. |
| **R5-11** | minor | high | source-side — `architecture.md:916` | R4-19's correction landed deck-side only. `architecture.md` §12's Live-Activity row still says the capability "**Reverses R69**"; R69's own Scope line (`DECISIONS.md:2561`, "Spine timer + mobile bar only") puts a lock-screen surface outside the ruling, which is why the deck (`:1066`, `:1359`) now says "breaches R69's **principle**". Source and deck now contradict each other. | "Breaches R69's principle — its stated scope is spine timer + mobile bar only (`DECISIONS.md:2561`)". |
| **R5-12** | minor | med | `index.html:1010` vs `:478` | **Two different spans cited for the same symbol, and the narrower one misses the fact.** Sheet 09's "stepper on the visit-close offer, defaulted to the *active* duration" cites `VisitReview.swift:52-58`; the active duration is computed at `VisitReview.swift:75` (`let elapsed = max(1, Int((now.timeIntervalSince(startedAt) / 60).rounded()))`), inside `VisitReviewComposer.summarize` (`:52-83`). Sheet 03 `:478` already cites `52-83` for the same symbol. (`V4VisitReviewScreen.swift:286-371` at `:1010` is exact — 286 opens `footer`, 371 closes `logTheHours`.) | `VisitReview.swift:52-83` at `:1010`, matching `:478`. |
| **R5-13** | minor | med | `index.html:695` (sheet 05, hole 4 "What it is") | **An uncovered prose deviation.** The cell runs two sentences ("…vanishes from the balance. **And** the rate printed beside the amount did not price the line."). Round 5 compressed holes 1 and 2 to one sentence each and recorded the residue at `:1426` as "sheet 05's **two** hole cells plus sheet 06's open question" — hole 4's cell is not in that entry and is not one sentence. | Join with a semicolon or em-dash, or widen the colophon entry from "two hole cells" to "its hole cells". |
| **R5-14** | minor | low | `index.html:1387`, `:1389` (sheet 15 verdicts) | Both verdict bodies run two sentences ("…and a CSV. No new route, no dashboard, no approval workflow, no daily nudge." / "…three dated governance entries. It depends on nothing and blocks everything."). Not named in the colophon's deviation list. Filed on the standing R4-21 disposition, which accepted this class elsewhere; raised only so round 6 need not re-find it. | Fold "the cover and sheet 15 verdict bodies" into the colophon's deviation entry, or accept. |
| **R5-15** | note | high | program-level | **No DECK CONTRACT file exists** — fifth round, same result (re-grepped `artifacts/`, `.claude/`, `docs/`, and `briefing/`, which holds only `architecture-draft.md`, `current-state.md`, `panel-brief-common.md`, `rulings-digest.md`). What is machine-checkable passes: **16** `<section class="slide">`; ids `sheet-1 … sheet-16`, no duplicates, in order; "Sheet 01 / 16" … "Sheet 16 / 16" complete. Shape is cover + 14 content sheets + colophon. | Supply the contract or rule the 1 + 14 + 1 shape. |
| **R5-16** | note | high | `index.html:1158` ("Local head is eleven behind Strata") | **Settled by a live read-only check**, not carried: `list_migrations` against Strata (`bkvcixdmuyejfzcijpdg`) returns head **`00591_notification_log_delivery`** (plus the imported `20260910152111_create_contact_messages`); the local tree tops out at `00580_room_concept_render.sql`. 591 − 580 = 11 ✓. `synthesis.md:13` and `briefing/current-state.md:3,24` agree. Note for the wave briefs: `00587`, `00570`, `00512`, `00487-88` and others are absent from the ledger, so `head+n` must be minted against the *tip*, never by counting files. | None. |
| **R5-17** | note | high | `index.html:1300`, `:1183`, `:1189`, `:1301` | **R4-8, R4-9 and R4-13 confirmed discharged on both sides**, and the fixer's §4 residue is gone: `architecture.md:8`, `:840`, `:842`, `:885` all read **15–25**; `:899` reads "three concurrent worktrees"; `:69` and `:900` now read the constraint as already named at `00545:147-148` with risk 5 at **low**, matching deck `:1301`. R4-11 (`synthesis.md:195` → `new`) and R4-12 (`synthesis.md:37` → `security_invoker`) also verified landed. | None. |
| **R5-18** | note | med | `index.html:523`, `:1298` | If R5-3's re-citation is taken, note that `00484:812` re-creates the *SELECT* policy "Team can view their project time entries" too — so the sheet-06 gate cell at `:799` ("`is_project_team_member` (00484:626-644) also covers a rostered non-co-member") is already anchored at head and needs no change; only the `00177:140-152` citations do. | None. |

---

## 2 · Verification ledger — attacked this round and **not** refuted

Recorded so round 6 need not re-run them. All checked this round against the repo or the
source document.

**Rulings.** `DECISIONS.md:20` D9 ✓ · `:21` D10 ✓ · `:668-677` R19 (two-part evidence,
"punch card — comfortable", Leah only) ✓ · `:2359-2372` R64 (contiguous idle ≥ 30 min,
provisional, "watch with data") ✓ · `:2555` R69 with `:2561` **Scope. Spine timer + mobile
bar only.** ✓ — the deck's `:1066` / `:1359` wording is exact · `:2648-2650` R77 (the full
Hours ledger; week paging, all-time unbilled, per-document lens, delete-with-confirm) ✓,
so HT-8 and HT-36 "Touches R77" are sound. HT-16's "D10 binds every surface that proposes a
duration" is consistent with D10's own text. **No blockers.**

**Structure and counts, machine-checked.** 16 sections · ids unique and ordered · sheet
numbering complete · sheet 02 six rows ("Six cells. Two pass outright." — ● on Who and
Project only) ✓ · sheet 03 seventeen rows, admin-portal column all ○ ✓ · sheet 04 ten rows
✓ · sheet 05 four rows ✓ · sheet 06 five + five ✓ · sheet 08 eight ✓ · sheet 09 thirteen ✓ ·
sheet 10 eight waves ✓ · sheet 12 twenty-three ✓ (1:1 with `architecture.md` §13) · sheet 13
eleven ✓ (1:1 with §11, severities now matching after R4-13) · sheet 14 **HT-1 … HT-40**, in
order, none duplicated, none missing ✓ · sheet 15 four rows ✓.

**Repo citations re-verified this round, exact to the line:**
`00021:22` (`CREATE TYPE member_role AS ENUM`), `:136` (`role member_role NOT NULL`),
`:226-241` (`audit_logs`) · `00084:164-165` (`role TEXT NOT NULL CHECK (role IN (…))`) ·
`00177:136-137` (FOR ALL, no `user_id` test) · `00198:25-26` (three `source` values),
`:27-29` (the inline, unnamed `activity` CHECK) · `00316:237,242,248,257` ·
`00412:2671` (`CREATE OR REPLACE VIEW public.project_unbilled_time`), **`:2672`**
(`WITH (security_invoker = true) AS`), `:2676-2682`, `:2677/2680`, `:2678/2681`,
`:2683-2685` (FROM + the two JOINs), `:2356-2366` (the guard's early exits) — and
`project_unbilled_time` is **not** redefined after 00412, so the whole hole-4 citation set
is head-anchored ✓ · `00484:604-606` (`is_org_admin_or_owner(_organization_id, _user_id
DEFAULT auth.uid())`), `:626-628` (`is_project_team_member`), **`:783-812`** (the four
re-created policies — R5-3) · `00545` 232 lines, name-discovery block `:32-43`, named
constraint `:147-148` ✓ · `00555:3024-3026` (the row-dropping hazard comment, verbatim) ·
`00577:2493-2496` (promotion filter, both `NOT NULL`) · `00578:2599 / 2604 / 2619 / 2819 /
2820` (R5-5, R5-6).

**TS/TSX:** `hours-ledger.tsx` **751** lines; the add block is `:545` (`{/* Batch add … */}`)
to `:595` (its closing `</div>`, with `</DocumentAction>` at `:594`) — the round-5 fix to
`545-595` in all four cells (`:415`, `:442`, `:986`, `:994`) is right ✓ ·
`command-bar.tsx` **1175** lines ✓.

**Swift:** `RootView.swift:432` = `await container.visitCloseOutboxDrainer?.resume()`,
inside the per-owner reconcile ✓ · `FieldCompanionPresentation.swift:51-54`
(`FieldCompanionActionID`, exactly `openVisit` / `endVisit`) and `:56-64`
(`FieldCompanionCollapsedPresentation`, one optional `action`) ✓ ·
`FieldVisitCloseRecord.swift:128-176` = the whole `TimeEntryWriteRequest` struct, `:137`
`public let activity: String` under `/// Always "site_visit".`, `:149`
`activity: String = "site_visit"` ✓ · `V4VisitReviewScreen.swift:286` opens `footer`,
`:303-308` the doc comment, `:309-316` `timeOffer` with the `if let projectID, !projectID.isEmpty,
let ownerUserID` gate at `:310`, `:371` closes `logTheHours` — so `286-316`, `308-316` and
`286-371` are each exact for the cell that uses them ✓ · `VisitReview.swift:52-83` =
`VisitReviewComposer.summarize`, `rows.sorted` at `:58`, `elapsedMinutes` at `:75` (R5-12).

**Memos and synthesis:** `memo-critic.md:97` = "Adjust that entry before it becomes money —
**4** (minutes field, type, activity select ×2, Log)" and `memo-feasibility.md:84` = "Log
with activity recorded — **3** (activity open + pick + Log)" with no minutes nudge, so deck
`:590` is exact ✓ · `memo-critic.md:101` proposes **2–4**, so deck `:611` is exact ✓ ·
`synthesis.md:159`'s export column list is character-identical to deck `:927`, and its five
seats (BIL, REP, VET, LEAH, CR) match "5 for, 0 against" ✓ · `synthesis.md:3` = "Nine seats,
218 findings, one table" ✓.

**Deck-internal consistency after the round-5 edits:** no occurrence anywhere of `207`,
`all eight`, `2599-2805`, `Invariant V`, `reverses R69`, `7 seats`, `four concurrent`, or
`17–25` ✓. Doc citations in the deck are only `architecture.md:22, :289` (`:825`),
`architecture-draft.md:29,50,51` (`:1269`) and `synthesis.md:3` (`:1425`) — all four still
resolve correctly after the R4-10 insertion, which fell at `architecture.md:305`, below both
cited lines ✓.

---

## 3 · What would make this clean

**Deck-side, three edits:** R5-1 (seven cells on sheet 10), R5-2 (`:1365`), R5-3 (`:1298`,
`:523`), R5-4 (`:874`).

**Source-side, now owed across three rounds:** `synthesis.md:29,143` + `architecture.md:20,
171, 896` → `00578:2599-2820` (R5-5) · `synthesis.md:141` + `architecture.md:241, 896` →
222/201 (R5-6) · `architecture.md:513, 897` + `synthesis.md:186, 270` → nine policies, and
W4's "four new" re-derived (R5-7) · `synthesis.md:49, 193` + `architecture.md:280` → the gap
is an admin who is not the project's designer (R5-8) · `synthesis.md:93` → drop the
Invariant V label (R5-9) · `synthesis.md:156` + `architecture.md:918` → six seats + the
draft (R5-10) · `architecture.md:916` → "breaches R69's principle" (R5-11).

**Program-level, unresolved for five rounds:** the DECK CONTRACT (R5-15).
