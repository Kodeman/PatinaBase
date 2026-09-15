# Re-review — content, round 4 (adversarial)

Target: `artifacts/hour-tracking-2026-09-11/deck/src/index.html` (1555 lines, 16 `.slide`
sections). Sources checked against: `synthesis.md`, `architecture.md`, the nine memos in
`panel/`, the four files in `briefing/`, `docs/design/the-document/DECISIONS.md`,
`docs/design/field-companion/field-companion-package.md`, `docs/vision/VISION.md`, and the
repo itself (read-only). Prior rounds read: `01-content.md`, `02-fix-log.md`,
`02-fix-log-r2.md`, `03-rereview-content.md`, `02-fix-log-r3.md`,
`03-rereview-content-r3.md`.

**Verdict: NOT clean.** 9 majors, 12 minors, 5 notes. **No blockers** — every ruling id in
the deck (D9, D10, R19, R64, R69, R77; the deck cites no others) resolves at the digest's
line in `DECISIONS.md` and is used consistently with the ruling's own text: D9 `:20`,
D10 `:21`, R19 `:668` (body `:668-677`, "punch card — comfortable", one person), R64
`:2359` (contiguous idle ≥ 30 min provisional, "watch with data" at `:2372-2373`), R69
`:2555`, R77 `:2648`. All verified in source this round.

Four of the nine majors are **new this round** (R4-2 … R4-5, R4-7): they are repo-level
refutations of claims that three prior rounds and all nine memos carried unchallenged.
Two are carried deck-vs-source mismatches whose *source side* is still unamended
(R4-8, R4-9).

---

## 1 · Findings

| ID | Sev | Conf | Location | Finding | Fix |
|---|---|---|---|---|---|
| **R4-1** | major | high | `index.html:327` vs `:328` (sheet 02, row 1) | **The row contradicts itself.** The `.mq` quantifier now reads "0 taps in a document, **8 off one**, impossible on the phone…", while the "What the row actually holds" cell two lines later still reads "Zero taps inside an open document; **impossible off one**, on the phone with nothing held…". Round 3's A-R3-1 rewrote only the `.mq` (`02-fix-log-r3.md:14-18`) and left the prose cell carrying the defect the finding was raised against. Sheet 03 (`:418`, ◐ + "8") and sheet 04 (`:601-605`, 8 → 5) both say 8. | Reword `:328` to "Zero taps inside an open document; **eight off one**; impossible on the phone with nothing held and in Patina Field for anything but a just-closed visit." |
| **R4-2** | major | high | `index.html:521` (sheet 03, "Fix a member's wrong entry" footnote) | **"Every write policy is `user_id = auth.uid()`" is false.** `00177:136-137` is `CREATE POLICY "Designers manage their project time entries" … FOR ALL USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_time_entries.project_id AND p.designer_id = auth.uid()))` — **no `user_id` test**. The project's own designer can therefore already UPDATE and DELETE another member's unbilled entry today (`guard_invoiced_time_entry`, `00177:51-80`, still freezes invoiced rows). The footnote cites only the four own-row policies (`00177:148,152` · `00316:248,257`) and omits the one `FOR ALL` policy. Consequence: the ○ mark on "Fix a member's wrong entry" is wrong for the **desktop/owner** case; so is `synthesis.md:49`'s "No admin can fix a member's wrong entry", and `architecture.md:280`'s "An owner/admin can **finally** fix a member's wrong entry". Checked every migration: `grep "ON public.project_time_entries"` returns nine CREATE POLICY statements and no later DROP, so the policy is live at head. **Not found by any seat, any prior round, or the briefing.** | Restate: "every *own-row* write policy is `user_id = auth.uid()` (`00177:148,152`, `00316:248,257`); the one exception is `00177:136` FOR ALL, which already lets the project's own `designer_id` adjust anyone's row — so the gap is **an admin who is not the project's designer**, not all admins." Mark the cell ◐ for Designer desktop. Orchestrator: re-word HT-22's cost line (`synthesis.md:193`) and `architecture.md:280` the same way. |
| **R4-3** | major | high | `index.html:1296` (sheet 13, risk №2) | **The policy count is nine, not eight — and five, not four, resolve through `projects p`.** Repo at head: `00177:136` (FOR ALL, via `projects p`), `00177:140,144,148,152` (via `is_project_team_member`), `00316:237,242,248,257` (all four via `projects p`) = **9 policies; 5 via `projects p`, 4 via `is_project_team_member`**. Round 2's R2-10c correction (`02-fix-log-r2.md:44-46`) produced "four / four" by silently dropping `00177:136`. Same miscount at `architecture.md:892`, `:512-513` ("all eight") and `synthesis.md:186`. The risk's *conclusion* (a NULL `project_id` falsifies every one of them) is unaffected, and W4 would need **five** own-row/owner replacements, not four. | "All **nine** policies resolve through `project_id` — five through `projects p` (`00177:136`, `00316:237,242,248,257`), four through `is_project_team_member(project_id)` (`00177:140,144,148,152`)." Orchestrator: correct `architecture.md:512-513`, `:892` and `synthesis.md:186`, and re-check W4's "four new RLS policies" against the ninth. |
| **R4-4** | major | high | `index.html:673` and `:681` (sheet 05, both Provenance cells) | **The head classifier span `00578:2599-2805` truncates the function.** `classify_project_time_entry_authority` runs `00578:2599` → `END;` at `:2819` / `$$;` at `:2820`. Lines **2802-2818** — the prior-accrual `SELECT … sum(rated_amount_cents)`, the ceiling comparison, and the final `ELSE NEW.billing_state := 'pending_authorization'` — fall **outside** the cited range. The deck only prints it as provenance, but `architecture.md:20` makes "re-anchor on the head body, `00578:2599-2805`" a rule binding **every wave**, and `architecture.md:172` instructs W1 to "redefine … **from the head body at `00578:2599-2805`**" — a wave brief that copies that span drops the ceiling branch. Inherited from `synthesis.md:143`. | `00578:2599-2820`. Orchestrator: amend `synthesis.md:143`, `architecture.md:20`, `:172`, `:891` — this one is load-bearing for W1's implementation brief. |
| **R4-5** | major | high | `index.html:873` (sheet 07, "Blast radius") and `:1295` (risk №1) | **"The classifier is 207 lines" is not derivable from the head body.** The statement `2599-2820` is **222** lines; the `BEGIN … END` body `2619-2819` is **201**. Neither is 207 (207 was the 00412-era figure, carried forward through two redefinitions — the very staleness `architecture.md:20` warns about). | "222 lines (`00578:2599-2820`), 201 between `BEGIN` and `END`". Orchestrator: amend `synthesis.md:141`, `architecture.md:241`, `:891`. |
| **R4-6** | major | med | `index.html:1133` (sheet 10, W5 Gate) | **"every column populated" is not in the source and is contradicted by the plan's own test.** `architecture.md:633` reads "one row per entry, every row naming a person and a day; the amounts sum to the ledger's total"; `architecture.md:618` specifies the W5 CSV test must assert "**an internal row's empty project cell**". Internal rows appear in the studio scope (W4), so a studio-scope CSV with "every column populated" is exactly what the test forbids. | "one row per entry, every row naming a person and a day; amounts sum to the ledger's total". |
| **R4-7** | major | high | `index.html:637`, `:1024`, `:1344` (sheets 04, 09, 14) | **"Invariant V" names the wrong authority.** `docs/design/field-companion/field-companion-package.md:319-321` defines Invariant V as *"On every screen where a capture can be created, the visit's project and room are legible without a tap, and changing them is exactly one tap away."* It says nothing about the collapsed companion strip carrying one action. The deck asserts "the collapsed strip carries one action and it is 'End visit' **(Invariant V)**" in three places, and "Invariant V holds" as HT-18's recommendation. The **code** fact is true and sufficient — `FieldCompanionCollapsedPresentation` carries a single optional `action` (`FieldCompanionPresentation.swift:56-64`) and `FieldCompanionActionID` has exactly two cases, `openVisit` / `endVisit` (`:51-54`) — so the recommendation stands; the named invariant does not support it. Mislabel originates at `memo-ux-mobile.md:21` (UX_MOBILE-11) and is repeated at `synthesis.md:93`. | Drop "(Invariant V)" and cite the contract directly: "the collapsed presentation carries a single optional action (`FieldCompanionPresentation.swift:56-64`)". HT-18's cell: "the collapsed strip's one-action contract holds". |
| **R4-8** | major | high | `index.html:1181`, `:1187` (sheet 11) — **source side unamended** | Critical path printed as **15–25** eng-days; `architecture.md:8`, `:835`, `:880` all still say **17–25**. The deck's figure is the arithmetically correct one (M 3–5 + L 6–10 + M 3–5 + M 3–5 on both paths, per `architecture.md:873-877`). Raised as R2-1c, then R3-4, and **skipped twice** (`02-fix-log-r2.md:193-201`, `02-fix-log-r3.md:135-138`); re-verified this round that `architecture.md` is unamended. | Orchestrator: amend `architecture.md:8, :835, :880` to 15–25. Deck needs no change. Third round of asking. |
| **R4-9** | major | high | `index.html:1298` (sheet 13, risk №4) — **source side unamended** | Risk reads "across **three** concurrent worktrees"; `architecture.md:894` still says **four**. The deck's three matches the parallelisation table's peak (stage 4 = 3 worktrees, `architecture.md:857`, deck `:1234`) and the "2–3" count tile (`architecture.md:879`). Raised as R2-2c, then R3-5, skipped twice; re-verified unamended. | Orchestrator: amend `architecture.md:894` to three. Deck needs no change. |
| **R4-10** | minor | med | `index.html:1314` (risk №8) vs `:1375` (HT-37) | **`head+12` still double-booked on the face of the deck.** Risk 8: the HT-10 narrowing is "isolated to its own reserved migration (head+12) … and the **only** change in it". HT-37: if Kody rules delete, "the INVOKER replacement lands in **head+12**". Both faithful to `architecture.md` (`:301-302` vs `:951`), which assigns W2 only `head+10 … +12`, all three already spoken for. Carried R3-11, skipped as out of the fixer's remit. | Orchestrator: widen W2's range to `head+13` (and shift W3 onward) or give the INVOKER rollup its own number; then correct `architecture.md:301-302, :951` and the deck. |
| **R4-11** | minor | high | `index.html:1354` (sheet 14, HT-24 "Touches") vs `synthesis.md:195` | HT-24's Touches is now **`new`** in the deck (A-R3-13) while `synthesis.md:195` still labels it **"D10 (second amendment)"**. The fixer flagged the mirror as owed (`02-fix-log-r3.md:45-48`); it has not been made. The deck's label is the defensible one — `DECISIONS.md:21` governs duration, not `activity`. | Orchestrator: amend `synthesis.md:195` to match. |
| **R4-12** | minor | high | `index.html:711-713` (sheet 05, hole 4) vs `synthesis.md:37` | The deck states hole 4's mechanism as "the view is declared `security_invoker = true` (`00412:2672`), so the caller's own `profiles` RLS applies to its join" — verified correct in repo (`00412:2672` is `WITH (security_invoker = true) AS`). `synthesis.md:37` still states the mechanism as an entry "logged by a `project_team_members` vendor or bookkeeper **who is not an org member**", which is not why the row drops (`user_id` is `NOT NULL REFERENCES profiles`, `00177:18`). Deck right, source unamended since R2-11. | Orchestrator: amend `synthesis.md:37`. |
| **R4-13** | minor | high | `index.html:1299` (risk №5 severity) vs `architecture.md:895` | Deck prices risk 5 **low**; `architecture.md:895` still prices it **medium** and `architecture.md:69` still asserts the `source` constraint name "**appears in no migration**". The deck's correction is true: `00545:147-148` drops and re-adds `project_time_entries_source_ck` by name. Deck right, source unamended. | Orchestrator: amend `architecture.md:69`, `:895`. |
| **R4-14** | minor | med | `index.html:1299` (risk №5 body) | "the 00545 precedent **cost 232 lines of archaeology** finding `source`'s name" overstates: `00545_time_entry_field_visit_source.sql` is **232 lines in total**, of which the name-discovery passage is one block (`:35-40` comment + the `pg_constraint` resolution); the rest of the migration does other work. Inherited from `synthesis.md:58` / `architecture.md:895`. | "a 232-line migration whose name-discovery block (`00545:35-40`) is the precedent". |
| **R4-15** | minor | high | `index.html:903` (sheet 08, "Approval / submit / lock-week" Seats) | "**7 seats**" overcounts by one. `synthesis.md:156` enumerates "BIL §5, VET-16, CR-26, LEAH-13, FS-40, OPS-13, **draft** — 7 seats": six seats plus the architecture draft, which is not a seat. Same at `architecture.md:913` ("Seven seats."). | "6 seats + the draft", or "6 of 9 seats; none against". Orchestrator may prefer to fix both sources. |
| **R4-16** | minor | med | `index.html:588` (sheet 04, row 2 Source) | "**CR 4, FS 3 — CR's unit adopted**" mischaracterises the difference: the two numbers price **different actions**. `memo-critic.md` §3 row 2 is "Adjust that entry before it becomes money" = 4 (minutes field, type, activity select ×2, Log). `memo-feasibility.md` §3's matching row is "Log with activity recorded" = 3 (activity open + pick + Log) — it has **no minutes nudge**. It is not a unit disagreement; FS simply counted a shorter path. | "4 (CR §3, minutes + activity + Log); FS §3's 3 omits the minutes nudge." |
| **R4-17** | minor | med | `index.html:609-610` (sheet 04, row 5) | v1 = **3** is attributed to "CR §3", but `memo-critic.md` §3's matching row proposes "**2–4**". The 3 is `synthesis.md:89`'s reconciliation, not the critic's figure; the *Today* side (≥6, the doorway gate, the double offer) is genuinely CR's. | "Today ≥6 from CR §3; v1 = 3 per synthesis §3's reconciliation (CR proposed 2–4)." |
| **R4-18** | minor | med | `index.html:303` (cover, "Today") vs `:481-489` (sheet 03) | "three of the four views **exist in the database and in no click path**" — the project view *does* have a click path (`?projectId=`, `hours-ledger.tsx:95-97`), which the deck's own sheet 03 marks ◐ "wrong answer" and sheet 06 calls "the lens that already exists". Faithful to `synthesis.md:291`, but the cover and sheet 03 do not agree. | "one of the four works, one answers the wrong question, and two have no click path at all". |
| **R4-19** | minor | med | `index.html:1064` (sheet 09) and `:1357` (HT-31) | "**reverses R69**" overreaches the ruling's own scope. `DECISIONS.md:2561` ("**Scope.** Spine timer + mobile bar only") excludes a lock-screen surface, and `:2559` confines the ruling to the *at-rest* readout in peripheral chrome. A Live Activity is therefore outside R69 as written; the honest claim is that it would breach R69's *principle*. Faithful to `synthesis.md:202`. | "breaches R69's principle (its stated scope is spine timer + mobile bar only, `DECISIONS.md:2561`) — 3 seats against, 0 for". |
| **R4-20** | minor | high | `index.html:423`, `:450`, `:994`, `:1002` (four cells citing `hours-ledger.tsx:545-591`) | The add-row block is `:545` (the "Batch add" comment) to `:595` (its closing `</div>`); the `Add` `DocumentAction` closes at `:594`. The cited span ends four lines short, mid-element. Round 3 standardized all four cells on `545-591` (A-R3-9) — consistently, but on the wrong end line. | `hours-ledger.tsx:545-595` in all four cells. |
| **R4-21** | minor | med | `index.html:679-681`, `:687-689` (sheet 05 holes 1–2 "What it is"); `:823` (sheet 06 "Open question"); `:1437-1438` (colophon) | **Prose residue against ruling 4.** Sheet 05's two "What it is" cells run three sentences each; sheet 06's "Open question" annotation is two sentences plus a pointer; the colophon's "Findings count" and "Typeset to" remain multi-line. All three were explicitly dispositioned — colophon pair accepted as a recorded deviation (`02-fix-log-r2.md:52-59`), sheet 05 cells accepted as table rows (`02-fix-log-r3.md:148-157`). Filed at **minor** on that standing disposition; under the charge's literal reading ("prose is a major") these are majors, and the orchestrator may re-escalate. | Either compress sheet 05's cells to one clause + citation and sheet 06's annotation to one sentence, or record the deviation once in the colophon so it stops being re-found. |
| **R4-22** | note | high | program-level | **No DECK CONTRACT file exists** — fourth round, same result (re-grepped `artifacts/`, `.claude/workflows/`, `~/.claude/workflows/`; C-24 → R2-20c → R3-15 → here). What is verifiable passes: **16** `.slide` sections, ids `sheet-1 … sheet-16` with no duplicates, "Sheet 01 / 16" … "Sheet 16 / 16" sequential and complete. Structure is **cover + 14 content sheets + colophon**. If the contract meant "15 content sheets + colophon" the deck is one content sheet short; if it meant "15 sheets including the cover + colophon" it is exact. I cannot assert which without the contract. | Orchestrator: supply the contract, or record the 1+14+1 shape as ruled. |
| **R4-23** | note | high | program-level | Carried from R3-15: the seven crux labels **i–vii** (`briefing/panel-brief-common.md:24-32`; `synthesis.md:65-73`) appear **nowhere** in the deck. Every crux's *content* is covered (i → sheets 03/04/09, ii → 02, iii → 06, iv → 07, v → 08, vi → 06/13/14, vii → 12), but the charge's own vocabulary is absent, so no reader can check coverage against the brief. | Add the crux letter to each sheet's `.chapter` gutter label, or accept. |
| **R4-24** | note | high | program-level | Carried: of `architecture.md:905-924`'s 14 "explicitly NOT in v1" rows, **13** have a row or a "Never" cell somewhere (sheets 04, 06, 09, 12, 14). The one with no row of its own is **"Hours on the paper's margin"**, which survives only as the cover epigraph (`:292`) and the colophon's "Title from" (`:1440`) — i.e. as a title, not as a refusal. | One row, or accept. |
| **R4-25** | note | med | `index.html:1069` (sheet 09 footnote) | The "Offline" column's "online only" values are disclosed as inferred ("read from the plan's absence of one, not a cited line") — correct and honest. The four `derived, current-state §2` marks on sheet 03's Designer-mobile column (`:407`, `:466`, `:474`, `:482`) are likewise marked. **No other unmarked inference found** in the deck this round. | None. Logged so round 5 need not re-derive it. |
| **R4-26** | note | high | `synthesis.md:136-139` vs `architecture.md:184-186` | The deck's sheet 07 annotation ("W1 ships a one-off re-rate … **synthesis said W0 — the plan moves it behind the resolver**", `:872`) is the **only** place in the three documents where this divergence is acknowledged. `synthesis.md:138` still says "Wave 0 ships a one-off re-rate"; `architecture.md` puts it at `head+8`, in W1. The deck's handling is correct; the synthesis is not amended. | Orchestrator: amend `synthesis.md:138` to W1, so the ruling sheet and the plan agree. |

---

## 2 · Verification ledger — claims attacked and **not** refuted

Recorded so round 5 need not re-run them. Everything below was checked **this round**
against the repo or the source document, not inherited from round 3.

**Rulings (no blockers).** Every ruling id in the deck resolves at the digest's line and
is used consistently with its own text: `DECISIONS.md:20` D9 ✓ · `:21` D10 ✓ · `:668-677`
R19 (two-part evidence, "punch card — comfortable", Leah only — so the deck's "one person,
who is also the owner" is exact) ✓ · `:2359-2373` R64 (contiguous idle ≥ 30 min,
provisional, "watch with data") ✓ · `:2555-2563` R69 ✓ (scope caveat = R4-19) ·
`:2648` R77 ✓. R4, R20, R75, R82, D11 are cited in the digest but **not in the deck**, so
nothing to check.

**Ruling-sheet completeness.** Sheet 14 carries **HT-1 … HT-40**, in order, none
duplicated, none missing — machine-checked against `synthesis.md` §7's forty ids. Every
"Touches" value matches `synthesis.md:172-211` except HT-24 (R4-11). Every For/against
cell re-derived from the synthesis's vote line, **all 40**, including the ones that are
seat-lists rather than numbers: HT-2 `4 · 1 (LEAH keeps tier 3)` ✓ · HT-4 `1 seat (CR) · 0`
✓ · HT-5/9/19/25/33/40 `unopposed` with the right arity ✓ · HT-12 `3 · 0` ✓ · HT-22 `4 · 0`
(FS-40, VET-11, OPS-13, BIL §5) ✓ · HT-24 `2 seats (FS, CR) · 0` ✓ · HT-31 `0 · 3` ✓ ·
HT-34 `4 · 1 · daily: 0 for` ✓ · HT-37 `8 delete · 1 wire` ✓.

**Counts and headline figures.** Cover "9 / 218 / 1 / 30–50, 8 waves" ✓ (`synthesis.md:3`;
bands `architecture.md:873-877`: 6×M = 18–30 + 2×L = 12–20 = 30–50). Colophon findings
arithmetic **independently re-derived by grep this round**: critic 30, feasibility 45,
leah 25, billing 12, studio-ops 16, veteran 27, mobile 17, reporting 15, web 16 = **203**,
character-for-character the deck's "30+45+25+12+16+27+17+15+16"; +7 feasibility per-wave
rows = 210; +C1–C29 = 239. The disclosure that 218 is carried, not re-derived, is honest.
Sheet 02 "Six cells. Two pass outright." ✓ (6 rows; ● on Who and Project only). Sheet 03
"Seventeen capabilities, five surfaces" ✓ (17 rows counted) and "One empty column: the
admin portal" ✓ — `grep -rln "project_time_entries|time_entries|hourly_rate_cents"
apps/admin-portal/src` returns **nothing**, and the client-portal column's single ◐ is the
invoice line. Sheet 12 "Twenty-three dispositions" ✓ = `architecture.md:926-952`, row for
row, numbering and wave assignments matching. Sheet 13 "Eleven risks" ✓ =
`architecture.md:887-901` 1:1 (severity deltas = R4-13). Sheet 14 "Forty questions" ✓.
"Local head is eleven behind Strata" ✓ — `ls supabase/migrations | sort` tops out at
**00580**, against Strata's 00591. `command-bar.tsx` = **1175** lines ✓;
`hours-ledger.tsx` = **751** ✓; `WorkDashboardScreen.swift:349-390` holds **6** browse
tiles (Projects, Leads, Decisions, Messages, Receiving, Site scan) so "7th" ✓.

**Friction table (sheet 04).** 0/0 · 4/4 · 8/5 · impossible/+1 field · ≥6/3 ·
saves-nothing/3 · 1/1 · impossible/3 · impossible/3 · impossible/not-in-v1 ✓ against
`synthesis.md:85-95`. The "8 convergent across CR §3 / WEB §3 / FS §3" claim was
**re-derived from the three memos directly** this round: critic §3 "**8** — `g`,`h` (2 keys)
→ project select (2) → minutes (2 keys) → activity select (2) → Add (1)"; web §3 "~**8**
discrete actions (2 keys to open `g,h` + 6 clicks …)"; feasibility §3 "~**8** — `g h` (2
keys) + project select (2) + minutes (2–3 keys) + activity (2) + Add (1)". Convergent ✓.
v1 = 5 ✓ (`memo-feasibility.md` §3 "~5"), and "the NL parser is a later S" ✓
(`architecture.md:915`, `:469`).

**Wave plan (sheet 10).** Every band (W0 M, W1 L, W2 M, W3 M, W4 L, W5 M, W6 M, W7 M),
every dependency (incl. "W0 — **not W1**" for W2 and "W0 (HT-33), W1, W3" for W6) and
every migration range (`+1…+3`, `+4…+9`, `+10…+12`, `+13…+14`, `+15…+19`, none/`+20`,
`+21…+22`, `+23…+25`, total `+1…+25`) match `architecture.md:822-831` and §§1-8. All eight
`**Flag:** unconditional` lines exist, so "Every one ships unflagged" ✓. Ship gates are
faithful condensations of the eight `**Ship gate.**` paragraphs — **except W5** (R4-6).
The PostHog tfoot map now covers W1, W2, W3, W5, W6 in wave order ✓
(`architecture.md:210-215, 338-339, 445-450, 613, 702-703`); W0 and W4 correctly carry
none and W7 "none new" ✓.

**Sheet 11.** 30–50 / 15–25 / 18–28 / 2–3 ✓ (`architecture.md:877-880`, the 15–25 delta is
R4-8); stage table 1:1 with `architecture.md:852-857` including "W2 owns `hours-ledger.tsx`"
and stage 2's rationale (`:863-867`).

**Permission matrix (sheet 06).** Every cell traced to source this round:
`is_org_admin_or_owner(_organization_id, _user_id DEFAULT auth.uid())` with
`role IN ('owner','admin') AND status = 'active'` ✓ (`00484:604-623`);
`time_entries_studio_read` grants any studio co-member SELECT on every studio entry ✓
(`00316:237-240`), with the active/non-guest test inside `is_studio_comember`
(`00556:51`) ✓; `is_project_team_member` has **no role filter** (only
`removed_at IS NULL`, `00484:626-644`), so both guest ◐ "rostered" marks are sound ✓; the
column really is `organization_members.role` of type `member_role` (`00021:136`, `:22`) ✓;
`user_is_org_member` is the un-hardened helper at `00021:484-517` ✓. The "What the
database already permits a `member`" row is correct as printed (a plain member is not a
project's `designer_id`) — R4-2 touches only sheet 03's footnote.

**Migration citations re-verified in source this round (all correct):** `00021:22, 136,
226-241, 484-517` · `00066:525-535` (the `proposal_change_order_terms` → `projects.change_order_terms`
copy, exact) · `00084:164-165` (`role TEXT … CHECK (role IN (…))` — the A-R3-6 fix landed
and is right; `:163` is `user_id`) · `00177:13-25, 14-15, 18, 22, 51-80, 89, 111, 118,
136-137, 140, 144-146, 148, 152` · `00198:25-26` (three values), `:27-29` (activity CHECK,
inline and unnamed) · `00316:237-240, 242-246, 248, 257` · `00317:15-18` (studio_id
explicitly not an RLS gate) · `00412:2356-2366` (guard early exit), `:2672`
(`WITH (security_invoker = true) AS`), `:2676-2682`, `:2677/2680` (change_order_terms legs),
`:2678/2681` (profiles legs), `:2683-2685` (the two JOINs) — **all exact to the line** ·
`00484:604-623, 626-644` · `00545:147-148` (`project_time_entries_source_ck` named) ·
`00555:3024-3026` (the row-dropping hazard comment, verbatim) · `00556:51` ·
`00577:2493-2496` (promotion filter, both `NOT NULL`) · `00578:2648-2653` (non-services
branch: `billing_state := 'authorized'`, `rated_amount_cents` set **only** when both
duration and rate are non-NULL — so sheet 05 hole 1's "lands `authorized` with
`rated_amount_cents` NULL, then $0" is exact), `:2709-2745` (the `count(DISTINCT member.role) = 1`
test at `:2712` and the normalize-match at `:2719-2733` — the A-R3-10 re-anchor landed and
is right), `:2765-2771` (the NULL landing, verbatim).

**TS/TSX citations re-verified this round:** `use-time-tracking.ts:118` (`useTimeEntries`),
`:159` + `:706` (`project_unbilled_time`), `:271` (`useTimeSummary`), `:286-299`
(`CreateTimeEntryInput` — no rate field), `:316` (`started_at: input.startedAt ?? now`),
`:320` (`billable: input.billable ?? true`), `:467` (`useStartTimer` — sets `billable` only
when provided, exactly as the deck's row 15 says), `:480-484` (the `23505` branch),
`:604-621` / `:616-619` (the claim + compensating detach), `:634`
(`useReleaseTimeEntries`), `:653` (the stale section comment), `:689` / `:689-781`
(`useStudioTimeReport`), `:791` (`useUpdatePhaseEstimates`) · `use-projects.ts:475-481`
(`useProjectTimeTracking` → `fetchTimeSummary`; the A-R3-2 restatement "one call site …
itself in a hook with no consumers" is **correct**) · `hours-ledger.tsx:95-97, 104-123,
184, 273` (`addValid` — the A-R3-8 fix landed), `:380-400`, `:683-700` (the pill) ·
`studio-drawer.tsx:468` (`holding && inHandToday > 0` — the deck's `:468` is more precise
than the memo's `:470-472`) · `log-strip.tsx:11-12, 36` · `document-time-provider.tsx:283-290,
410-413, 410-424` · `authority-hours.ts:74-88` · `invoice-composer.ts:150-161` ·
`time-billing.ts:43-54` · `invoice-composer.tsx:611-616` · `margin-groups.ts:11-13` ·
`part-editor.tsx:423` · `service-agreement-drafting-room.tsx:238` ·
`mobile-sheets.tsx:1145-1231` · `use-scope-builder.ts:945-950` (under `packages/supabase/src/hooks/`,
now declared in the colophon's Paths row) · `desk-doorway.tsx:19,41` ·
`qbo-export/index.ts:131-132` (the `CSV_HEADER` constant — the A-R3-12 relabel to
"CSV-header precedent" is accurate).

**Swift citations re-verified this round:** `RootView.swift:432`
(`await container.visitCloseOutboxDrainer?.resume()`, inside the per-owner reconcile — so
"the drainer runs once per launch" ✓) · `FieldCompanionPresentation.swift:51-54`
(`FieldCompanionActionID` with exactly two cases) and `:56-64`
(`FieldCompanionCollapsedPresentation`, one optional `action`) ✓ — label issue is R4-7 ·
`VisitReview.swift:52-58` (`VisitReviewComposer.summarize`, `rows.sorted { $0.createdAt < $1.createdAt }`
at `:58` — "already sorted" ✓) · `V4VisitReviewScreen.swift:286-316` (footer + `timeOffer`),
`:310` the `if let projectID, !projectID.isEmpty, let ownerUserID` gate (so the deck's
`:308-316` span is right) · `FieldVisitCloseRecord.swift:137` (`public let activity: String`
under the comment `/// Always "site_visit".`) and `:149` (`activity: String = "site_visit"`)
✓ · `:56-58` (`retryDelay(attempt:)`) ✓ · `Capture.xcodeproj/project.pbxproj:1140`
(`/* Begin PBXNativeTarget section */`) with zero `CaptureWidgets` / `CaptureShareExtension`
references, and both directories exist and are **empty** ✓.

**Other:** `VISION.md:54` = "No lock-in, no hidden fees. **Your data exports.**" ✓ ·
`field-companion-package.md:319-321` = Invariant V's actual text (R4-7) ·
`architecture.md:22` and `:289` (sheet 06's "Open question" citations) ✓ ·
`architecture-draft.md:29,50,51` and `:3,7,8,63,97` ✓ · `copy-deck.md:357,379,627` all
carry `?sheet=hours` ✓ · `15-hours.md:9,15` carry the two studio-scope sentences ✓ ·
gap-matrix `:189,193` = BIL-04 / BIL-08, and **both copies** exist
(`docs/design/the-document/` and `docs/product/`), so sheet 12 row 13's "edit both copies"
is right ✓ · export column list on sheet 08 is character-identical to `synthesis.md:159` ✓.

**Seat attributions spot-checked in the memos:** UX_MOBILE-11 (`memo-ux-mobile.md:21`) ·
FEASIBILITY-25 (`memo-feasibility.md:43`, the in-hand gate at `command-bar.tsx:799-810`) ·
LEAH-13 · the "single biggest avoidable cost in the program" quote. The deck's practice of
citing "`CR §3`" / "`MOB §3`" rather than `synthesis.md`'s non-existent row ids (CR-98,
WEB-33, FS-86, MOB-34, CR-101, REP-45 all exceed their memos' row counts) remains the
right call — **do not reintroduce those ids**.

---

## 3 · What would make this clean

**Deck-side, five one-cell edits:** R4-1 (`:328`), R4-2 (`:521`), R4-3 (`:1296`),
R4-6 (`:1133`), R4-7 (`:637`, `:1024`, `:1344`). Plus R4-4/R4-5 (`:673`, `:681`, `:873`,
`:1295`) once the orchestrator settles the correct span and line count — `00578:2599-2820`,
222 lines / 201 in the body.

**Source-side, outside the deck** — five amendments now owed across three rounds:
`architecture.md:8, :835, :880` → 15–25 (R4-8); `architecture.md:894` → three (R4-9);
`architecture.md:20, :172, :891` + `synthesis.md:143` → `00578:2599-2820` (R4-4);
`synthesis.md:141` + `architecture.md:241` → 222/201 lines (R4-5);
`architecture.md:512-513, :892` + `synthesis.md:186` → nine policies, five via `projects p`
(R4-3). Then `synthesis.md:37` (R4-12), `:138` (R4-26), `:195` (R4-11),
`architecture.md:69, :895` (R4-13), and a migration number freed for the INVOKER rollup
(R4-10).

**Program-level, unresolved for four rounds:** the DECK CONTRACT (R4-22). Without it the
"15 + colophon" test cannot be run; the deck is cover + 14 + colophon.
