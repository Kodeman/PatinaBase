# MoodBoard release measurement baseline

**Evidence date:** 2026-08-03
**Cutoff:** 2026-08-03 23:17:54 UTC
**Scope:** pre-GA measurement baseline plus the 2026-08-03 production GA
deployment and monitoring handoff.

This document records what can and cannot be measured at the GA release gate.
It is deliberately separate from the acceptance ledger: implementation can make
future events queryable, but it cannot recreate historical events that were never
emitted.

## Release decision

Kody approved direct 100% GA on 2026-08-03. M1 and M4–M7 retain their complete
post-GA query contracts, and the three unrecoverable/adapted comparisons are
resolved without fabricating historical zeroes:

- **M2 — prospective waiver:** exact legacy accordion dwell remains
  unrecoverable. The GA baseline closes only after **both 30 days and 50
  completed room sessions** have elapsed. Report weekly directional results
  while the cohort accumulates.
- **M3 — adapted proxy accepted:** the 8-board database snapshot below is the
  accepted pre-GA proxy. Make the first post-GA comparison after **10 genuine,
  distinct boards** emit `mood_board_done`.
- **M8 — prospective GA monitor:** there is no meaningful canary cohort because
  there are no active designers, so release goes directly to 100%. Use the
  first eligible authenticated client-proposal render as the controlled sample,
  then monitor the first **20 eligible client renders or 30 days**, whichever
  closes the observation window first. Before 20 renders, inspect every failure
  individually. Publish the D+30 report even if fewer than 20 renders have
  occurred. The current authenticated QA account had no eligible authorized
  proposal, and no invitation or magic link was sent to manufacture one.

A critical privacy/auth issue or a client-renderer failure rate above 2% is a
rollback trigger, but rollback is never automatic: capture evidence and request
Kody's approval before redeploying the last-good release. These decisions
convert the former measurement blockers into explicit prospective/adapted
release policies.

### GA operating constraints

- Background removal launches **disabled**. Do not configure
  `REMOVE_BG_API_KEY`; defer the media Prisma ledger migrations until the later
  background-removal enablement release.
- Board-asset cleanup launches **dry-run only**. Keep
  `BOARD_ASSET_CLEANUP_DESTRUCTIVE_ENABLED` unset and require two clean future
  reports before destructive cleanup can be considered.
- The durable PostHog dashboard is named **MoodBoard GA** and covers M1–M8,
  export failures, client-renderer failure rates, and critical exceptions.
  Reviews are manual: D+7 on **2026-08-10** and D+30 on **2026-09-02**. No
  automated Slack/email send or parallel task queue is authorized.

## Production GA record

The ordered production rollout completed from main merge
`625d8bbdf6db6e72ce5202488fcea189be68c7d2`, followed by spec-PDF hotfix
`ee8151e8` and mirror-parity hotfix `8406a864`:

| Unit | Production evidence |
|---|---|
| Supabase schema | Migrations 00406–00411 applied. |
| Supabase Edge | `capture-from-url` v16, `spec-pdf` v18, and `board-asset-cleanup` v1 deployed. `spec-pdf` is the sole shared-PDF importer; its exhaustive manifest and the successful production retry confirm the safe-image hotfix shipped through v18. |
| Media service | Deployment `dd07e64e-d7f1-4c7b-84d0-525a2c14de80` is healthy. Background removal remains disabled and its Prisma ledger migrations remain deferred. |
| Client portal | Deployment `f10ceebd-5d8a-4eda-91da-567c913bff36`. |
| Designer portal | Deployment `50f6cce1-3535-43fe-aa93-39fa670059e4`. The live proposal mirror rendered both persisted section bands and emitted `mood_board_presented` with `surface = mirror`. |
| Asset maintenance | Dry-run job 49718 succeeded with zero candidates and zero deletions; destructive cleanup is disabled, and the two-clean-report enablement gate remains in force. |
| Measurement | [MoodBoard GA dashboard](https://us.posthog.com/project/326191/dashboard/1949127) created with corrected GA0 coverage (`EIutm214`) for the 17 currently registered event series, plus M1–M8, export-failure, guest-renderer, and critical-exception tiles. The saved insight IDs are `hkkZ2owf`, `eXZFstOy`, `yVaOh6ya`, `qznCgPb0`, `C3ZjrwMu`, `Z6FiNm3C`, `BDgfprWy`, `CFX8PF97`, `mwCrish1`, `JACEeUQj`, and `VNNYaAyU`. Unseen server/vendor events are added to GA0 after their first organic emission; background removal is disabled at GA. |
| Authenticated smoke | The designer/guest walk passed: editor, Present/Edit, PNG, composition PDF, spec-sheet PDF after hotfix, template save/delete, share create/view/revoke, all three proposal entry sources, and project continuation. PostHog captured the expected opened/item-added/arranged/Done, presentation/share/share-view, export, template, and project-continuation events. The authenticated client-proposal M8 sample remains prospective because the current QA account had no eligible authorized proposal. |
| Retained QA artifacts | Proposal board `0ac0e62f-3969-4e11-b83f-8163c4637788` and project board `a34f2026-647c-4b67-b0fc-7a3f1a6db9a5` are clearly named retained QA artifacts and must be excluded from organic KPI reporting. Temporary notes and the temporary studio template were deleted; the share token was revoked. |

## Baseline observations

### PostHog

At the cutoff, the read-only event inventory contained **zero**
`mood_board_*` events, which is expected before GA. The only legacy drafting
signal found was ten "Boards" toggle autocaptures across eight sessions. Those
autocaptures do not contain a reliable close boundary or dwell duration.

Use the GA0 insight `EIutm214` and the saved M1–M8/error tiles on the MoodBoard
GA dashboard for post-release monitoring. GA0 contains the 17 event series
currently registered by PostHog; it intentionally omits unseen vendor/server
events until their first organic emission and does not contain the nonexistent
`mood_board_url_unfurl_failed` event. The pre-GA inventory remains reproducible
with:

```sql
SELECT event, count() AS events,
       count(DISTINCT properties.$session_id) AS sessions
FROM events
WHERE timestamp < toDateTime('2026-08-03 23:17:54')
  AND event LIKE 'mood_board_%'
GROUP BY event
ORDER BY event;
```

### Strata database: M3 proxy

The read-only snapshot contained **8 active proposal-owned boards**, with item
counts **median 1, minimum 0, maximum 2**. Reproducible query:

```sql
WITH board_counts AS (
  SELECT b.id, count(i.id)::integer AS item_count
  FROM public.proposal_boards AS b
  LEFT JOIN public.proposal_board_items AS i
    ON i.board_id = b.id
   AND i.created_at < TIMESTAMPTZ '2026-08-03 23:17:54+00'
  WHERE b.status = 'active'
    AND b.proposal_id IS NOT NULL
    AND b.created_at < TIMESTAMPTZ '2026-08-03 23:17:54+00'
  GROUP BY b.id
)
SELECT count(*) AS boards,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY item_count) AS median,
       min(item_count) AS minimum,
       max(item_count) AS maximum
FROM board_counts;
```

This is explicitly an **M3 proxy**. It is not the PRD's event-time median per
board at Done. For all post-GA metrics, exclude controlled-smoke board IDs
`0ac0e62f-3969-4e11-b83f-8163c4637788` and
`a34f2026-647c-4b67-b0fc-7a3f1a6db9a5`.

### Controlled production observations

The retained proposal board emitted all three distinct open sources and a Done
event whose `used_undo`, `used_multiselect`, `used_tidy`, and `used_handles`
properties were all true. The walk also emitted item-added, arranged,
presented, shared, share-viewed, template-used, template-saved, and export
events. PNG and composition PDF succeeded. Spec-sheet PDF first emitted a
failure identifying unsafe SVG/font input; hotfix `ee8151e8` added bounded
PNG/JPEG hydration/omission, and the retry succeeded through `spec-pdf` v18.

Project continuation created retained board
`a34f2026-647c-4b67-b0fc-7a3f1a6db9a5` from frozen snapshot
`e950cdc6-4b7a-4508-8980-ca1ea05e4e17`. The project surface showed one live and
one frozen board, the room edit flushed through Done, and reopening returned to
the same board. No duplicate continuation was created.

No client verdict or background-removal outcome was manufactured. A
board-scoped guest share proves scoped rendering and server-side share-view
telemetry, but it does not emit M8's authenticated
`surface = client_proposal` renderer event and is not counted as that sample.

The post-smoke parity audit found that the proposal-mirror projection omitted
persisted board sections and the runtime never emitted the documented mirror
presentation variant. Hotfix `8406a864` now selects/maps sections and tracks one
duration-bearing presentation per non-empty mirror board. The production probe
showed `The feeling` and `The pieces` behind the retained board and confirmed
the new `surface = mirror` event in PostHog.

## M1–M8 query contracts

All event names below are the implemented namespaced names. `$session_id` is
the PostHog session property. Time windows and environment filters must be the
same in each numerator and denominator.

| Metric | Implemented query contract | Queryability at GA | Baseline / decision |
|---|---|---|---|
| M1 Room adoption | Of distinct `$session_id` values on `mood_board_drafting_touched` where `has_board = true`, count the sessions that also contain `mood_board_opened`; divide that intersection by all touched sessions. Break down matched opens by `source`. | Ready: denominator and numerator are explicit. | No historical ratio required; start the 30-day window at GA. |
| M2 Session depth | Median `duration_ms` on `mood_board_done`, one event per completed room session. | Future input ready. | **Approved prospective waiver:** close the baseline only after both 30 days and 50 completed room sessions; report weekly directional results until then. |
| M3 Composition richness | Per `board_id`, take the latest `mood_board_done.item_count` in the window, then the median across boards. | Future input ready. | **Approved adapted proxy:** 8 boards; median 1; min 0; max 2 at the cutoff. Compare after the first 10 genuine, distinct boards emit Done. |
| M4 Ergonomic uptake | `mood_board_done` sessions where `used_undo OR used_multiselect OR used_tidy OR used_handles`, divided by all `mood_board_done` sessions. | Ready; all four booleans are on the Done event. | Begin at GA; no legacy comparator required. |
| M5 Presentation reach | Count `mood_board_presented` + `mood_board_shared`, grouped by non-null `proposal_id`; divide by distinct activated proposal IDs with boards in the same cohort. Project boards use `source_proposal_id` lineage. | Ready: presentation/share events carry owner and proposal lineage. | Validate the activated-proposal cohort against Strata for the reporting window. |
| M6 Verdict engagement | Distinct `board_id` on `mood_board_verdict_given` divided by the union of distinct `board_id` on `mood_board_presented` and `mood_board_shared`. | Ready. | Begin at GA; designer read-only verdict chips do not emit the event. |
| M7 Export fidelity uptake | Count `mood_board_exported` by `format` and `board_id`; composition is `png` + `pdf_composition`, denominator adds `pdf_spec_sheet`. Track `mood_board_export_failed` separately. | Ready. | Begin at GA; target is composition ≥70% of completed exports. |
| M8 No regression | For `surface = 'client_proposal'`, `mood_board_client_render_failed / (failed + succeeded)`. Monitor `guest_share` separately and correlate privacy-safe captured exceptions where `feature = 'mood_board'`. | New renderer is queryable; no eligible authenticated client sample was available during the controlled walk. | **Approved prospective monitor:** treat the first eligible authenticated/organic client render as the controlled sample, then monitor the first 20 eligible renders or 30 days; inspect every failure before 20 and issue a D+30 report even at a lower sample. Critical privacy/auth issues or >2% failures trigger evidence capture and a rollback-approval request to Kody. |

## Contract evidence

- Designer event names and property types:
  `apps/designer-portal/src/lib/analytics/mood-board-events.ts`
- Designer taxonomy tests:
  `apps/designer-portal/src/lib/analytics/__tests__/mood-board-events.test.ts`
- Client success/failure and privacy-safe exception capture:
  `apps/client-portal/src/lib/analytics/events.ts`
- Client renderer telemetry tests:
  `apps/client-portal/src/lib/analytics/__tests__/mood-board-events.test.ts`
- Server-side guest/share telemetry:
  `apps/client-portal/src/lib/analytics/mood-board-server.ts`

Focused reproducibility commands:

```bash
pnpm --filter @patina/designer-portal test -- --runInBand \
  src/lib/analytics/__tests__/mood-board-events.test.ts
pnpm --filter @patina/client-portal test -- --runInBand \
  src/lib/analytics/__tests__/mood-board-events.test.ts \
  src/lib/analytics/__tests__/mood-board-server.test.ts
```

## Approval record

| Decision | Owner | Status | Date / note |
|---|---|---|---|
| Direct 100% GA; no canary because there is no active designer cohort | Kody | **Approved** | 2026-08-03; the controlled authenticated designer/guest walk replaces the pre-GA split, while the first eligible authenticated client render remains M8's prospective sample. |
| M2 prospective waiver | Kody | **Approved** | 2026-08-03; closes after both 30 days and 50 completed room sessions, with weekly directional reporting. |
| M3 snapshot proxy accepted as the pre-GA baseline | Kody | **Approved** | 2026-08-03; first comparison after 10 genuine, distinct boards emit Done. |
| M8 prospective monitor | Kody | **Approved** | 2026-08-03; first 20 eligible renders or 30 days, every pre-20 failure inspected, D+30 report required. |
| Background removal launch state and media schema | Kody | **Approved** | 2026-08-03; vendor disabled and media Prisma migrations deferred to enablement. |
| Asset-cleanup launch state | Kody | **Approved** | 2026-08-03; dry-run only, with two clean reports required before destructive enablement. |
| Rollback authority | Kody | **Approved** | 2026-08-03; request Kody approval before any rollback. |
| MoodBoard GA dashboard review schedule | Kody | **Approved** | Manual D+7 review 2026-08-10 and D+30 review 2026-09-02. |
