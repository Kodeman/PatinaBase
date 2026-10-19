# SYNTHETIC PROPOSED hours labels — human review

**Status: PROPOSED. All 40 cases are synthetic, unapproved label proposals.** These are not expert ground truth, observed messages, model outputs, or evaluation results. Bodies, task descriptions, reference codes, unit/room identifiers, and dates are invented. No real names, phones, clients, or project data are included.

Machine-readable companion: `scripts/field-line/hours-replies.proposed.json` (`status: "proposed"`, `synthetic: true`). IDs are stable review references; preserve them when recording corrections. This document does not approve any label.

**SQ-133 remains blocked until BOTH secure runtime access and explicit label approval are recorded.** Preparing these fixtures grants neither. No keys/environment, network, API, database, model call, live evaluation, threshold changes, production changes, or production wiring are part of this preparation. No evaluation runner is added.

## Reading the proposals

The field names follow `HoursJudgmentInput` in `supabase/functions/_shared/hours-judgment.ts`: `body`, `askDay`, `taskTitle`, and `openPrompts: [{code, label}]`. These review records are not direct runtime inputs: they intentionally do not supply `askText`, candidates, transport configuration, or confidence scores. A future, separately authorized evaluation must define its ask text and input mapping explicitly.

`proposedExpected` is a reduced verdict shape, not a fabricated runtime response:

- `hours(N, "42")` means `{ "kind": "hours", "hours": N, "promptCode": "42" }`.
- `hours(N, null)` means the duration is interpretable but its target is unresolved. It is **not permission to book hours**. The existing caller requests clarification when multiple asks are open and the target is null.
- `defer` means `{ "kind": "defer" }`; no reason or confidence is asserted.
- Labels concern the constrained hours judgment, not end-to-end booking behavior. Some digit-only replies can use the existing number grammar before the fallback judgment. Listing them here does not claim they reach a model in production.
- Candidate selection normalizes a stated span rather than calculating a duration from clock times or generating a missing number. The current shared judgment acts only on positive durations up to 16 hours; its intent gate rejects did-not-work replies.

### Complete shared context

All cases have `askDay: "2026-09-21"` and `taskTitle: "SYNTHETIC A — cabinet hanging"`. For this invented review scenario, “today”/“hoy” means that frozen ask day; it is not the wall-clock date of review.

- **S (single open prompt):** `[{"code":"42","label":"SYNTHETIC A — cabinet hanging, 2026-09-21"}]`.
- **T (two open prompts):** `[{"code":"42","label":"SYNTHETIC A — cabinet hanging, 2026-09-21"},{"code":"43","label":"SYNTHETIC B — wall finishing, 2026-09-21"}]`.

The context column below specifies the complete `openPrompts` value for every case. T deliberately retains task A as the framing title even when a reply identifies task B. No real task or project is referenced.

## All 40 proposed cases

Every row below is **SYNTHETIC and PROPOSED**, including seemingly straightforward numerals. “Notes” gives the rationale, not evidence that a model produced the proposed label.

| Stable ID | Body (verbatim) | Context | Category | PROPOSED label | Notes / ambiguity for review |
| --- | --- | --- | --- | --- | --- |
| synthetic-hours-001 | 6.5 hours today | S | decimal | hours(6.5, "42") | Explicit decimal duration for the asked day. |
| synthetic-hours-002 | 7,25 horas hoy | S | decimal/spanish | hours(7.25, "42") | Decimal comma has a supported numeric form; confirm Spanish interpretation. |
| synthetic-hours-003 | 0.75 hours on the cabinets today | S | decimal | hours(0.75, "42") | Positive sub-hour duration, not zero. |
| synthetic-hours-004 | Worked 2.25 hrs today. | S | decimal | hours(2.25, "42") | Abbreviated hours unit remains explicit. |
| synthetic-hours-005 | six hours today | S | number-word | hours(6, "42") | Supported English number word. |
| synthetic-hours-006 | six and a half hours today | S | number-word/half | hours(6.5, "42") | Preserve the whole compound, not the bare six. |
| synthetic-hours-007 | 6 1/2 hours today | S | fraction | hours(6.5, "42") | One mixed-fraction duration, not separate numbers. |
| synthetic-hours-008 | Only 1/2 hour today | S | fraction | hours(0.5, "42") | Standalone half-hour fraction. |
| synthetic-hours-009 | half an hour on cabinets today | S | half | hours(0.5, "42") | Half explicitly modifies an hour. |
| synthetic-hours-010 | sixteen hours today | S | number-word/boundary | hours(16, "42") | Existing upper boundary; confirm whether the review policy accepts the unusually long day. |
| synthetic-hours-011 | about 6.5 hours today | S | hedge/estimate | hours(6.5, "42") | Proposes accepting a single estimate; approximation policy is unresolved. |
| synthetic-hours-012 | I think seven hours today | S | hedge/estimate | hours(7, "42") | Tentative single estimate; clarification may be preferable. |
| synthetic-hours-013 | six or seven hours, not sure | S | hedge/alternatives | defer | Neither alternative is settled; do not select one or average them. |
| synthetic-hours-014 | at least six hours, maybe more | S | hedge/lower-bound | defer | A lower bound is not an exact duration. |
| synthetic-hours-015 | driving now, will send hours later | S | noise/driving | defer | No hours supplied yet. |
| synthetic-hours-016 | driving, there in 6 minutes | S | noise/driving | defer | Travel ETA in minutes, not work duration. |
| synthetic-hours-017 | driving now but worked 4.5 hours on cabinets today | S | noise/driving-with-report | hours(4.5, "42") | Explicit duration despite driving context; says nothing about whether/when to send a reply. |
| synthetic-hours-018 | uhh cabinets done, 5.5 hrs todya, signal bad | S | noise/typo | hours(5.5, "42") | Filler and typo do not obscure the explicit duration. |
| synthetic-hours-019 | finished 2 rooms, worked 6 hours today | S | two-numbers/non-hours-count | hours(6, "42") | Two counts rooms, six counts hours. |
| synthetic-hours-020 | unit 7 cabinets took 4 hours today | S | two-numbers/non-hours-unit | hours(4, "42") | Seven is a fictional unit identifier. |
| synthetic-hours-021 | arrived at 9 and left at 5 today | S | two-numbers/clock-times | defer | No duration span; do not infer meridiem, breaks, or subtract times. |
| synthetic-hours-022 | worked 3 hours today and received 2 deliveries | S | two-numbers/non-hours-count | hours(3, "42") | Duration comes before an unrelated count. |
| synthetic-hours-023 | 4 hours yesterday and 6 today | S | multi-day | defer | Existing judgment defers a multi-day report, even with a separable today figure. |
| synthetic-hours-024 | 6 hours each of the past 2 days | S | multi-day/per-day | defer | A per-day figure still covers multiple days. |
| synthetic-hours-025 | 12 hours total across yesterday and today | S | multi-day/total | defer | Do not invent a daily split of the aggregate. |
| synthetic-hours-026 | worked 6 hours today; planning 8 tomorrow | S | multi-day/future-plan-contrast | hours(6, "42") | Proposes distinguishing future planning from reporting work on multiple days; explicit ruling needed. |
| synthetic-hours-027 | didn't work today | S | did-not-work | defer | No positive hours report; not a proposed zero-hours action. |
| synthetic-hours-028 | 0 hours today, job cancelled | S | did-not-work/zero | defer | The current shared judgment does not act on zero; not a claim about other pipeline handlers. |
| synthetic-hours-029 | rained off today, room 4 never started | S | did-not-work/non-hours-number | defer | Cancellation plus a fictional room number, not four hours. |
| synthetic-hours-030 | Can I log 6 hours if I haven't finished? | S | question | defer | Permission question, not an actual-work assertion. |
| synthetic-hours-031 | need 8 screws for the cabinets | S | off-topic/materials | defer | Materials count is unrelated to worked hours. |
| synthetic-hours-032 | who is this? | S | question/confused | defer | No duration, only confusion. |
| synthetic-hours-033 | Hoy trabajé 6.5 horas en los gabinetes | S | spanish/numeric | hours(6.5, "42") | Today's work with a numeric duration; fluent-language review pending. |
| synthetic-hours-034 | Hoy trabajé seis horas | S | spanish/unsupported-number-word | defer | Semantically six hours, but current candidate grammar does not recognize “seis.” This is a constrained-action proposal, not a claim that the sentence lacks hours. |
| synthetic-hours-035 | Ref 43, about 6.5 hours on the wall finish today | T | two-open-prompts/explicit-reference | hours(6.5, "43") | Code and task identify non-framing prompt B; code 43 is not hours. |
| synthetic-hours-036 | six hours on the cabinets today | T | two-open-prompts/task-match | hours(6, "42") | Task wording identifies prompt A without a code. |
| synthetic-hours-037 | about 6.5 hours today | T | two-open-prompts/unclear-target | hours(6.5, null) | Same body as 011, but no target is identified among two prompts. Preserve caller clarification, not a default to A. |
| synthetic-hours-038 | 4 hours on cabinets and 3 on wall finishing today | T | two-open-prompts/multiple-durations | defer | Cannot represent both task-duration pairs in one verdict without losing information. |
| synthetic-hours-039 | STOP | S | pipeline-gated/stop | defer — pipeline only | **NEVER model input.** Compliance handling precedes hours judgment; this is not a model label. |
| synthetic-hours-040 | HELP | S | pipeline-gated/help | defer — pipeline only | **NEVER model input.** Help handling precedes hours judgment; this is not a model label. |

## STOP / HELP boundary

Cases 039–040 carry `pipelineGated: true` and `modelInput: false` in JSON as well as the `pipeline-gated/*` category. Their required `proposedExpected: {"kind":"defer"}` is only a no-hours-action placeholder for this review format. It does not replace compliance/help handling and must never be scored as a model response. These bodies must be excluded before constructing any future model input; no runner or enforcement code is implemented here.

Source orientation only: `supabase/functions/sms-inbound/pipeline.ts` handles STOP-family keywords and HELP/INFO before hours handling. Its hours fallback calls `judgeHoursReply`; the latter's candidate selection and caller's unresolved-target clarification explain the conventions above. Reading these seams is not production execution or proof of wiring changes.

## Human decisions still open

Please approve or correct labels by stable ID; preparation is not approval. In particular:

1. **Estimates versus uncertainty:** Accept 011/012 as stated estimates, or require clarification? Confirm deferral for alternatives/lower bounds in 013/014. The same approximation decision affects 035/037.
2. **Long-day boundary:** Is 010 acceptable at 16 hours under the intended review policy? This fixture does not change the existing limit.
3. **Driving context:** Confirm 015/016 are not hours reports and whether 017's explicit duration remains interpretable. No outbound safety/timing policy is decided here.
4. **Several days versus a future plan:** Confirm conservative deferral for 023–025 and decide whether 026 may isolate today's actual work from tomorrow's plan.
5. **Non-work and zero:** Confirm 027–029 as deferrals for this constrained judgment rather than zero-hours actions. Any alternative needs a separate authority decision, not an implicit production change.
6. **Spanish:** Review 002/033 for linguistic accuracy. For 034, explicitly approve constrained deferral or record a desired semantic six-hours label for separately scoped work; the present grammar cannot select “seis.” Do not describe this limitation as a language understanding result.
7. **Prompt ownership:** Confirm 035/036 identify the indicated task, 037 retains a null target and therefore caller clarification, and 038 requires clarification rather than selecting one task or summing durations.
8. **Pipeline-only entries:** Confirm 039/040 as compliance/help coverage notes only, excluded from all model inputs and model-result scoring.

All remaining rows also require explicit approval. No confidence scores, pass rates, threshold recommendation, or live behavior is inferred from these proposals. Validation can establish JSON structure, count, IDs, and basic field presence only; it cannot establish label correctness. Existing seams suffice for fixture preparation; no new helper, abstraction, dependency, or runtime instrument is needed.
