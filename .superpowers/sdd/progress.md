# SDD progress — iOS Living Companion (animation + wake-up intro + coaching)

Plan: /Users/kody/.claude/plans/review-the-patina-ios-smooth-crystal.md
Worktree: .claude/worktrees/agent-living-companion (branch companion/living-companion, base = main @ dispatch 2026-07-21)
Briefs/reports: /private/tmp/claude-501/-Users-kody-Code-patina-merged/7f5f5e10-0812-410a-9e54-78dd90e3ac7f/scratchpad/sdd/

Task map: 1=CompanionAnalytics events + CompanionCoachingModel + unit tests (Opus) ·
2=CompanionMarkView + CompanionIntroBubble (Sonnet) ·
3=CompanionOverlay integration (Opus) · 4=final whole-branch review + merge to main + push

## Ledger (Living Companion)
(append one line per task when its review comes back clean)
Task 1 (analytics+CompanionCoachingModel+tests): complete (3a435d9f..9540895d incl. fix commit, Opus re-review APPROVED; 21/21; rulings: 14-day + 3-nav graduation from ANY phase, migration seeds firstNavAckSeen, phase reads pure w/ deferred emission via reconcilePhase)
Task 2 (CompanionMarkView+CompanionIntroBubble): complete (9540895d..ff518f89 incl. fix commit, Sonnet review + Fable direct re-review APPROVED; BUILD SUCCEEDED; fixes: == cleanup, fileprivate preview seam, 44pt Show-me, pulse structurally unmounted under reduce motion [ruling])
Task 3 (CompanionOverlay integration): complete (ff518f89..7f874a6a incl. Critical nav-ack fix, Opus review Needs-fixes→fix→Fable direct re-review APPROVED; BUILD SUCCEEDED + 309/309 PatinaTests; 7 FirstLaunchUITests failures bisected pre-existing/environmental)
Smoke walk: 6/6 PASS on iPhone 17 sim (wake-up+intro copy, coachmark copy, first-nav ack via AX tree, quieting@3, legacy migration, cap-2; report scratchpad/sdd/smoke/)
Task 4 (final review+merge+push): complete — Opus whole-branch READY TO MERGE; its Important finding (stuck escalation bypassed tour gate) fixed pre-merge (dfdeeae4); first merge attempt BLOCKED by 46-commit origin/main race (field-capture program pushing concurrently); recovered via reset --keep origin/main + re-merge 26103a1c + build/test gate (309/309) + pushed origin/main AND origin/companion/living-companion; MERGED-ON-ORIGIN verified; worktree+branch retired.
PROGRAM COMPLETE 2026-07-21. Follow-ups filed (not blocking): sheet-occluded first-nav ack on special-action path; second_session label can attach same-session; smoke "Later" first-tap miss at transition tail (likely automation artifact). OWED: on-device walk (feature is sim-verified only).

## Minor findings for final-review triage (Living Companion)
- T1: coincident time+nav graduation emits phaseChanged with pre-increment navCount payload (e.g. 2 not 3) — defensible, analytics-awareness only.
- T1: introGate "launched-unresolved → 2s grace" is init-ordering-dependent — Task 3 MUST construct the model in the @State initializer (constraint added to task-3 brief; T3 review confirmed structural compliance).
- T3: `second_session` intro trigger is count-driven and can label a same-session return as second_session — bounded by intro cap 2; analytics-label drift only.
- T3: reduce-motion intro appears instantly (nil animation on .opacity transition) — matches file-wide `reduceMotion ? nil : …` convention; ruled keep-as-is.
- T3: first-nav ack on the special-action path renders behind the presented sheet (occluded but harmless; first-nav-via-sheet is a rare edge). One-shot is consumed either way.
- T2: reduceMotion "pulse structurally unmounted" ruling applied; breathing ring remains as static geometry (internally inert).

---

# ARCHIVED — SDD progress — The Document · Schedule, landing + Slice 01 (complete)

Plan: /Users/kody/.claude/plans/review-the-handoff-document-proud-creek.md
W1: /Users/kody/Code/patina-merged/.claude/worktrees/agent-schedule-w1 (branch schedule/slice-01, base 156f6b13)
W2: /Users/kody/Code/patina-merged/.claude/worktrees/agent-schedule-w2 (branch schedule/slice-01-resolver, base 156f6b13)
Briefs/reports: /private/tmp/claude-501/-Users-kody-Code-patina-merged/2a8daddb-994b-408d-af8e-6918b5e25993/scratchpad

Task map: 1=StageA landing · 2=StageB I56 audit · 3=C1 migration 00323 · 4=C2 seed ·
5=C3 resolver (W2) · 6=C4 types+hooks · 7=C5 derivation · 8=C6 components ·
9=C7 gate+telemetry · 10=C8 verify+screenshots · 11=final review+push

(Old Stripe-rail ledger archived at progress-stripe-rail-archived-2026-07-08.md)

## Ledger
(append one line per task when its review comes back clean)
Task 1 (Stage A landing): complete (W1 156f6b13..ea5e70c6, review Approved)
Task 5 (C3 resolver): complete (W2 156f6b13..8d561471, review Approved; 19/19 + 413/413)
Task 2 (Stage B I56): complete (ea5e70c6..6d689267, review Approved; A0.4 corrected: activate_proposal_as_project live head = 00279 NOT 00274 — Slice 05 must base on 00279)
Resolver merged into slice-01 @ fa14b658 (merge-base verified); W2 worktree + branch retired.
Task 3 (C1 migration 00323): complete (fa14b658..1feebee3, Opus review Approved, zero findings; local blanket-grant = pre-existing seed behavior, prod gets SELECT-only)
Task 4 (C2 seed): complete (1feebee3..99a17f13 amended, review Approved after 1 fix loop: blocking_status='blocks_phase' added to c301 per blockingStatusFor ladder)
Task 6 (C4 types+hooks): complete (99a17f13..21fb43cc amended, review Approved after 1 fix loop: TanStack v5 disabled-query gate — resolved null via data!==undefined, isLoading from isPending; fallback arrays memoized)
Task 7 (C5 derivation+sort): complete (21fb43cc..ee669644, review Approved; 81/81; minors: threadsFor non-active tie-break untested, days-over n=1 untested, lastSigned null-date untested — all hand-traced correct)
Task 10 (C8 walk+screenshots): complete (walk 5/5 PASS; fix round 510e1fed — mobile minmax overflow, pluralization, seed phase keys, item-row meta wrap; drop e28d96a6)
Task 11 (final review+push): complete (Opus whole-branch review READY TO PUSH, 2 ride-along minors: milestones client-SELECT RLS forward-posture, mapper doc nit; pushed origin/schedule/slice-01 @ e28d96a6)
PROGRAM STATE: Kody ruled 2026-07-15 "good to go to slice 02" → R102 logged (d8df46a4); branch schedule/slice-02 stacked on slice-01 in W1; gate stays OFF.
SLICE 02 tasks: 12=R102 ✓ · 13=extremes seeds+rule derivation lib · 14=ScheduleRule components+nav wiring (Opus) · 15=gate+telemetry+I58 · 16=walk+screenshots · 17=final review+push+deliver. Design plan: scratchpad/slice02-plan.md.
Task 12 (R102): complete (d8df46a4, footer R102 verified).
Task 15 (gate+telemetry+I58): complete (3c4ee394..c6e62fa9, review Approved, zero findings)
Task 16 (walk+screenshots): complete after live fix loop — first walk found 4 REAL defects (D-1 pin observer never attached: effect ran during loading null render; D-2 track overlay swallowed label clicks; D-3 today-label overprint; D-4 thread-label overprint); fixed in 9a7670c4 (callback-ref observer, decorative pointer-events-none + z-[1] controls, today label→y82 clear band, thread lanes 112+i×20 w/ data-derived canvas); re-walk 7/7 PASS; drop e49ccb4d.
Task 17 (final review+push): complete (Opus whole-branch READY TO PUSH, fix commit verified; pushed origin/schedule/slice-02 @ e49ccb4d).
SLICE 02: ACCEPTED by Kody 2026-07-15 → R103 logged (e1499dfb) on new branch schedule/slice-03 (stacked on slice-02).
DIRECTIVE (Kody, mid-slice-03): continue through ALL slices (03→04→05) before he reviews again — consolidated review at the end; per-slice drops + DECISIONS entries still produced; gate stays OFF; nothing to prod. Log as R104.
SLICE 04 COMPLETE: 8 commits, walk 9/9 + force-enable zero-write probe, whole-branch Opus READY; pushed origin/schedule/slice-04 @ 102ee976 (incl. late fix: relative +5d grammar, floor-guarded). Branch schedule/slice-05 open. Plan pin: scratchpad/slice05-plan.md.
S4-1 (ripple core): complete (0ea80639 + honesty fixes 26075566; Opus review Approved; per-phase slack sourcing two-chain-proven 10→5).
S4-2 (door+provider): complete (12d20e0f, review Approved; NOTES: studio-comember gap across 00323/00324/00325 schedule RPCs = tracked follow-up; SLICE 05 SEAM: schedule_revisions INSERT from INVOKER RPC needs INSERT policy+grant OR the fn goes DEFINER; update()-without-begin() is a silent no-op — S4-3 must begin() first).
SLICE 03 COMPLETE: walk 9/9 post-fix (birth 4.3s, add 6ms, slack=12 verified, anchor holds through 44d overrun); resolver fixes 459883f7 (slack attribution, anchored-never-demote, chip un-nest) whole-branch Opus-reviewed READY; pushed origin/schedule/slice-03 @ 4a27c296. Branch schedule/slice-04 open (stacked). Ride-along escalation ledger lives in I59 + what-to-click notes.
T23 (walk+drop): complete · T24 (review+push): complete.
T22 (meta/telemetry/proposal side): complete (7ebde6c4..0ca4239f + fix 0cacff33; review found CRITICAL negative-duration hole on live PhaseBuilder → fixed 3-level: ScheduleEntryField unsigned mode + ghost-add guard + duration_days>0 CHECKs in 00324; minors ride: weeks-mirror rounds 1-3d→0w in summary totals).
T21 (spine compose UI): complete (8317cf65..7ebde6c4 amended, Opus review Approved after 1 fix loop: mutation error surfaces added, success-gated teardown; carry-forwards: edit panel single-commit-per-open, thread phases not composable, two-Enter name-only add, chip-unpin errors silent-but-honest).
T20 (compose hooks): complete (ea52a343..8317cf65, Approved; invalidation lists verbatim-verified; minor: sort_order lookback swallows error — pre-existing convention).
T19 (parser+helpers): complete (a51fdc0b..ea52a343 amended, Approved after 1 fix loop: composePreview descendant-DFS conflict matching + unsigned post-round zero guard; 508/508 + 25/25).
T18 (00324 migration): complete (e1499dfb..a51fdc0b, Opus review Approved zero blockers; graft fidelity mechanically verified vs 00279+00135; minors: template-append second-root seam flagged, as-built leaves duration_weeks NULL by design).
SLICE 03 (Compose) tasks: 18=migration 00324 (Opus) · 19=parser+pure helpers · 20=mutation hooks · 21=spine compose UI (Opus) · 22=meta/telemetry/proposal composer · 23=walk+drop · 24=final review+push. Plan: scratchpad/slice03-plan.md. Exploration facts in plan §0 context (PhaseBuilder = proposal phase editor; activation head 00279; proposal_phases has NO chain cols; no proposal-side milestone home → new table).
Task 14 (ScheduleRule components+wiring): complete (4daaa936..3c4ee394 amended, Opus review Approved after pin-containment fix loop — self-sticky wrapper, mount contract = direct child of <main>'s column; Important-flag→escalation: active-segment charcoal ink vs prototype past/future split; minors ride: useLayoutEffect SSR warn, setRows churn, foldedLayers redundancy, second today clock read)
Task 13 (rule lib + extreme seeds): complete (d8df46a4..4daaa936, Opus review Approved; stagger invariant proven; minors ride: combined stagger fixture, single-day-span x=0, 'delayed'→'ahead' weight → design escalation list).
Task 9 (C7 gate+telemetry+O9/I57): complete (236ef69d..c04e3ecb two commits 6d515060+c04e3ecb, review Approved, zero findings)
Task 8 (C6 components): complete (ee669644..236ef69d amended, Opus review Approved after 1 fix loop: validPhaseIds now all-lanes so thread items don't misroute; escalations for drop note: persistent Unfold/Fold mark vs hover-reveal, FF&E stitch meta omitted; minor: thread ink #5f7488 hex matches prototype deliberately)

## Minor findings for final-review triage
- T1: R99–O8 batch lacks `##` program-title wrapper (being fixed in Stage B); workstream_state selftest doesn't assert range-endpoint tokens specifically.
- T5: multi-anchor chain slack-attribution corner (pinned phases report inter-anchor gap as slack) — underspecified, note for downstream; conflict `message` uses id not name (UI rewrites copy anyway); no 2+-hop top-level-slack test; downstreamAnchors unmemoized (irrelevant at real sizes).
- T5 contract note for C4 hooks: `chain_does_not_fit` sets BOTH phaseId and anchorId to the anchored phase's id.
