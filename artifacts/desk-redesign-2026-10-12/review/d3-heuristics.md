<!-- SQ-790 (D3 heuristic critic, GPT-6 Luna, readonly). Saved by the orchestrator from ticket comments c_mv5g83x5_f1b8b5 + c_mv5g8dlg_b576ff. -->

# D3 heuristic critique — today’s Desk and old card Desk

**Scope.** Independent critique using `BRIEF.md`, `walk/WALK.md` and captures (including `kody-desk-2026-10-12.png`), current components/CSS, and the historical card source at `818db6e55`. The walkthrough is a seeded local run; legacy records crowd Leah’s five-line cap, so M2/M3/M7 distinguish the observed fixture from a clean scenario. Severity uses Nielsen’s 0–4 scale; confidence is confidence in the finding, not user research. These are heuristic findings, not task-completion research.

## 1. Nielsen’s ten heuristics, now vs old cards

**1. Visibility of system status**
- Today — **S3, high.** Five-line Day Sheet is a useful bounded view, but status is split from an unbounded workload: “No current action alerts” coexists with Jordan’s Wren Row under OWED BY YOU after Not today. “The rest are on their projects” does not say what waits, moved, or returns tomorrow. New inquiry lands 1,344px down as generic “Consultation,” not in crowded sheet. `today-jordan-quiet-fold-1440.jpg`, `m7-inquiry-landed-1440.jpg`; WALK §§1c, 3.
- Old — **S2, high.** “Six things are overdue…” and “29 more below” disclose summary/overflow, but no moved/waiting/return summary; new lead depends on appearing in displayed cards. `desk-fold-1440.jpg`; WALK §4.

**2. Match between system and real world**
- Today — **S2, high.** “Owed by you / Waiting on others” conveys responsibility and Jordan sees a named hand-off. But “Mine” may mean owned jobs or next actions; the hand-off starts with “Leah handed you…” rather than job name, while PO is a separate named row; “Consultation” obscures inquiry identity. `today-jordan-mine-fold-390.jpg`; `desk-ledger-row.tsx:55-64`; WALK M5/M7.
- Old — **S3, high.** “YOUR PEN” resembles studio language but is false for Jordan’s Leah-owned jobs; no hand-off relation. Repeated “Full Room” names obscure client/job relation. `desk-fold-1440.jpg`, `s5-step1-hire-desk-1440.jpg`; WALK §4.

**3. User control and freedom**
- Today — **S2, high.** “Not today” and scope switch give control, but sheet job name is not a link; act is the only route into work. Back loses the prior position (1,873px/4,624px observed); fixed dock covers lower controls at 390. `day-sheet.tsx:137-170`, `today-leah-mine-fold-390.jpg`; WALK M6.
- Old — **S2, medium-high.** Linked names and one-act card footer provide direct routes; “29 more below” makes recovery long, with no compact return/bounded prioritization evident. `desk-fold-1440.jpg`; old `desk-claim-card.tsx`; WALK §4.

**4. Consistency and standards**
- Today — **S3, high.** Three header actions have three visual weights/underline treatments; tips use same mono caps as actions and look actionable. Sheet rules, workload row rules and full-width first group rule create an ambiguous boundary. `today-header-tips-crop-1440.jpg`; `page.tsx:483-529`; `globals.css:575-644`.
- Old — **S2, high.** Repeated card anatomy is consistent, but stage plates/washes and custody dot + word add noisy registers, and tips retain same two-line header pattern. `desk-fold-1440.jpg`; old `desk-claim-card.tsx`, `desk-claims.tsx`; WALK §4.

**5. Error prevention**
- Today — **S2, medium.** Specific act labels and prefilled reminder/PO sheets reduce choice/entry errors. But duplicate invoice/action may look like two obligations; all-clear/workload mismatch risks false inference; declined proposal can be outside five-line cap. `today-leah-mine-fold-1440.jpg`, `today-jordan-quiet-fold-1440.jpg`; WALK M2–M4/M8. No evidence underlying transaction unsafe.
- Old — **S2, medium.** One act per card and overdue ink help, but 32 equally sized claims put 150-day invoice beside routine draft; custody repeats without preventing error. `desk-fold-1440.jpg`; old card source; WALK §4.

**6. Recognition rather than recall**
- Today — **S3, high.** Greeting, date and labeled acts are recognizable; scanning ~40 rows requires reading small monochrome stage words and names. Repeated jobs/actions can confuse identity; at 390 rows stack and page is 10,793px. `today-leah-mine-full-1440.jpg`, `today-leah-mine-full-390.jpg`; `desk-ledger-row.tsx:55-85`; WALK §1b.
- Old — **S1, high.** Stage plates, card edges, terracotta overdue text and prominent linked name aid recognition. But seven registers per card require parsing; equal-size claims do not distinguish priority. `desk-fold-1440.jpg`; old card source; WALK §4.

**7. Flexibility and efficiency**
- Today — **S2, high.** One-click act sheets (~1s), five-line cap, scope and by-person support varying needs. Yet Leah cannot reach PO chase in observed Desk; M2/M6 require scroll 529/1,873px at 1440 (1,522/4,624 at 390). Search is not shown to substitute for direct navigation. WALK M2/M3/M6; `m3-jordan-chase-po-390.jpg`.
- Old — **S3, high.** Direct job links and 3-up grid are operable, but 32-card, 5,819px uncapped grid makes repeated triage expensive; at 390 one-column grid and header consume fold. `desk-fold-1440.jpg`; WALK §4.

**8. Aesthetic and minimalist design**
- Today — **S3, high.** Sheet is calm, but hierarchy dissolves below: transparent cream sections, ~40 uniform ruled rows, no stage pigment, duplicate needs. Lack of grouping shifts work to reading; header tips add duplicated text. `today-leah-mine-fold-1440.jpg`, `today-leah-mine-full-1440.jpg`; `page.tsx:448-529`.
- Old — **S3, high.** Edges restore units but seven-register cards, repeated color plates/dots and 32 cards overload; plates outshout urgency, card bottoms ragged. `desk-fold-1440.jpg`; WALK §4.

**9. Recognize, diagnose, recover from errors**
- Today — **S2, medium.** Failed Not today has inline retry language; desk read error is coherent (`day-sheet.tsx:70-71,172-175`; `page.tsx:532-546`). But quiet-state mismatch is not recoverable/explained: owed line remains below. WALK §1c.
- Old — **S2, medium.** Need and overdue text by act supports diagnosis. Reviewed source gives no evidence of inline save-failure recovery; do not infer underlying flow lacked it. Old card source; `desk-fold-1440.jpg`.

**10. Help and documentation**
- Today — **S2, high.** ⌘K and act labels help, but tips are redundant/misleading. At 390 header is 203px and “DIRECT PROJECT SETUP” breaks 16px gutter. “Rest are on their projects” does not explain how to find/prioritize them. `today-header-390.jpg`, `today-header-tips-crop-1440.jpg`; WALK §1a/b.
- Old — **S2, high.** “BEGIN A BRIEF” / “NO PROPOSAL NEEDED” explain action but are visually indistinguishable tips; acts self-describe, no explanation for repeated YOUR PEN / 29 more. `desk-fold-1440.jpg`; WALK §4.

## 2. Cognitive walkthrough — M1–M8

At each step: can user identify goal, control, connection, result? Timing is WALK evidence, not usability study.

- **M1 Monday open — S3.** Leah sees greeting and five lines with clear acts + Not today. “What can wait?” requires interpreting long workload; five run-on lines take estimated 8s/14s (1440/390), mobile needs scroll. Chen’s 153-day invoice and unviewed items lack differentiated urgency. Per-line feedback, no unified day picture. `today-leah-mine-fold-1440.jpg`; WALK M1.
- **M2 decline — S3 (fixture caveat).** Linden absent from Leah’s cap; needs 529px/1,522px scroll to workload. FOLLOW UP is visible there, but “Proposal declined” and reason have same emphasis. Clean fixture might surface it, but decline is not visually news. Opens in 2.1s; no evidence of follow-up completion feedback. `m2-linden-follow-up-1440.jpg`; WALK M2.
- **M3 overdue PO — S4 Leah / S1 Jordan.** Jordan sees clear FOLLOW UP WITH THE MAKER; prefilled sheet ~1s. Leah’s PO-HD-0412 is absent from sheet and workload, so no control or feedback on her Desk. Jordan sees PO twice (sheet+roster). `m3-jordan-chase-po-1440.jpg`; WALK M3.
- **M4 past-due invoice — S2.** Holloway SEND REMINDER leads to prefilled sheet (~1s; 5–6s estimate). Amount and overdue clause sit mid-sentence in ordinary ink, less salient than old terracotta. Second Holloway row ~1,950px down can look like another invoice. `m4-holloway-reminder-1440.jpg`; WALK M4.
- **M5 hand-off — S2.** Jordan sees giver/job and READ THE NOTE, one click to note (~2.1s): improvement over old scope. But hand-off has no bold job name and is quieter than PO; ownership grouping is below-fold “By team member,” not on sheet. Result is note, though row-level relation unclear. `today-jordan-mine-fold-1440.jpg`, `m5-jordan-handoff-note-1440.jpg`; WALK M5.
- **M6 job and back — S3.** Sheet name is not linked. User must know to scroll ~1,873px/4,624px to roster’s linked name. Job shows NEXT band, but Back returns 96px/868px, not departure position. Control discoverability/context restoration weak. `m6-holloway-job-1440.jpg`; WALK M6.
- **M7 inquiry — S2.** Plus + RECORD AN INQUIRY visible, but second-line tip competes as another action. Form submission takes 3 clicks/25s typing and navigates to brief. Yet “see it land” fails: generic “Consultation,” 1,344px down, not in sheet; Back + scroll needed. `m7-record-inquiry-1440.jpg`, `m7-inquiry-landed-1440.jpg`; WALK M7.
- **M8 close day — S3.** Not today ×2 and Read the note produce a quiet sheet. But it says “No current action alerts” while Wren Row remains under OWED BY YOU. “Coming back” does not render; waiting sits below and moved-today is absent. Calm result does not answer waits/returns. `today-jordan-quiet-fold-1440.jpg`; WALK M8/§1c.

## 3. “Sloppy” and “bleeds together,” made precise

**Header.** `page.tsx:448` gives header `mb-12` and baseline-aligned flex; `:483-515` wraps each of two actions and its tip in right-aligned columns with `gap-0.5`. `:493-496` and `:510-513` render tips in DM Mono uppercase with near-action scale/tracking. They are not visually subordinate: they create a second caps baseline, look like two more actions, and partly repeat the act. In `today-header-tips-crop-1440.jpg`, “CREATE AN INQUIRY BRIEF” overhangs left of its plus; “DIRECT PROJECT SETUP” sits under the inter-action gap. Three underline weights (double ink, single mocha, faint tertiary) and lower Find/⌘K turn the row into accidental 2×3, not concise actions. At 390, three-line greeting + stacked actions form a 203px header; last tip reaches x=383, violating 16px gutter (WALK §1a).

**Rhythm and edges.** `day-sheet.tsx:204-211` uses 22px italic heading; scope is 15px (`:213-225`); sentences are 17px/26px (`:121-135`). `globals.css:575-583` gives 12px head bottom padding and one dark rule; `:590-604` lines have 16/15px vertical padding, 40px column gap, pale bottom hairline. `.day-sheet-acts` is horizontal until mobile, where `:615-620` stacks each act full-width beneath the sentence. Roster begins only `mt-10` (`desk-roster.tsx:55-65`); group `mt-7` plus bordered eyebrow (`:89-96`, `:29-30`) supplies its other edge. `globals.css:628-644` roster lines have 11/10px padding, hairline, columns 220/96/minmax(200)/132/170px and 20px gaps; <=899px they stack with 6px gap (`:646-654`).

There is no outer edge grouping a need’s identity, context and act in either section. Rows rely on whitespace and pale lines, both sit on transparent cream, and the full-width first workload rule can read as sheet continuation; sheet rules stop short of its width (WALK §1b). A ~40-row table has no stage-color groups. Type creates many adjacent small registers—22px head, 17px sentence, 15px roster need, 18px name, 14px value, 12px stage/head, 11px custody/action—without a strong stage/urgency hierarchy. At 390 each row stacks name, phase, need, amount, act.

**Floating footer.** `day-sheet.tsx:280` ends with muted italic 17px “The rest are on their projects.” After the last pale row rule, it floats; workload follows by margin alone. It reassures but does not say where the rest are, what waits on whom, or what returns. `desk-ledger-row.tsx:20` reuses “No current action alerts” although owed rows can remain below. Kody’s one-line capture makes this spatial disconnect particularly visible.

## 4. What old cards solved; what a return must avoid

At `818db6e55`, each need had a 1px `--card-edge` territory, stage plate, prominent 20px linked job name, person/phase, one need sentence, overdue terracotta ink, and a single act in its bottom band (`desk-claim-card.tsx`; WALK §4). Three-up 1440 grid and stage pigments let the eye group by phase without parsing ~40 monochrome rows. Name opened the job directly; act stayed with need. Summary disclosed overflow. These are real affordances, not decoration.

Avoid reintroducing seven registers per card: stage, custody dot + word, name, person line, need, act. “YOUR PEN” repeated falsely across Jordan’s Leah-owned jobs; dot + word repeated. Solid white-on-pigment plates across 32 cards dominated overdue text. Cards lacked ranking: Chen at 150 days sat beside routine draft; grid was 5,819px/32 cards in eleven rows. Need wrapping made ragged bottoms; mobile was a one-column stack, and header still wasted fold with tips. Preserve edges, stage orientation, linked job and need/act association without repeated ownership marks, saturated plates as loudest signal, unranked unlimited volume, or two-line tips. Evidence: `desk-fold-1440.jpg`; WALK §§4–5; historical `desk-claim-card.tsx`, `desk-claims.tsx` at `818db6e55`.

**Bottom line.** Today improves bounded triage, scope, explicit hand-off and fast prefilled acts. Old cards improve grouping, urgency and direct job entry. The key gap is not cards versus rows in isolation: the page lacks one coherent, bounded and spatially grouped account of what needs action, who owns it, and what happened after acting.
