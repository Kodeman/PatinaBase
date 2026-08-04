# MoodBoard release measurement baseline

**Evidence date:** 2026-08-03
**Cutoff:** 2026-08-03 23:17:54 UTC
**Scope:** read-only production measurement review; no production data was changed.

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
  there are no active designers, so release goes directly to 100%. Run one
  controlled authenticated smoke walk, then monitor the first **20 eligible
  client renders or 30 days**, whichever closes the observation window first.
  Before 20 renders, inspect every failure individually. Publish the D+30
  report even if fewer than 20 renders have occurred.

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

## Baseline observations

### PostHog

At the cutoff, the read-only event inventory contained **zero**
`mood_board_*` events, which is expected before GA. The only legacy drafting
signal found was ten "Boards" toggle autocaptures across eight sessions. Those
autocaptures do not contain a reliable close boundary or dwell duration.

Re-run the namespaced inventory in PostHog/HogQL before release:

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
  LEFT JOIN public.proposal_board_items AS i ON i.board_id = b.id
  WHERE b.status = 'active'
    AND b.proposal_id IS NOT NULL
  GROUP BY b.id
)
SELECT count(*) AS boards,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY item_count) AS median,
       min(item_count) AS minimum,
       max(item_count) AS maximum
FROM board_counts;
```

This is explicitly an **M3 proxy**. It is not the PRD's event-time median per
board at Done.

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
| M8 No regression | For `surface = 'client_proposal'`, `mood_board_client_render_failed / (failed + succeeded)`. Monitor `guest_share` separately and correlate privacy-safe captured exceptions where `feature = 'mood_board'`. | New renderer is queryable. | **Approved prospective monitor:** one controlled smoke, then the first 20 eligible client renders or 30 days; inspect every failure before 20 and issue a D+30 report even at a lower sample. Critical privacy/auth issues or >2% failures trigger an evidence capture and rollback-approval request to Kody. |

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
| Direct 100% GA; no canary because there is no active designer cohort | Kody | **Approved** | 2026-08-03; one controlled authenticated smoke walk replaces the pre-GA split. |
| M2 prospective waiver | Kody | **Approved** | 2026-08-03; closes after both 30 days and 50 completed room sessions, with weekly directional reporting. |
| M3 snapshot proxy accepted as the pre-GA baseline | Kody | **Approved** | 2026-08-03; first comparison after 10 genuine, distinct boards emit Done. |
| M8 prospective monitor | Kody | **Approved** | 2026-08-03; first 20 eligible renders or 30 days, every pre-20 failure inspected, D+30 report required. |
| Background removal launch state and media schema | Kody | **Approved** | 2026-08-03; vendor disabled and media Prisma migrations deferred to enablement. |
| Asset-cleanup launch state | Kody | **Approved** | 2026-08-03; dry-run only, with two clean reports required before destructive enablement. |
| Rollback authority | Kody | **Approved** | 2026-08-03; request Kody approval before any rollback. |
| MoodBoard GA dashboard review schedule | Kody | **Approved** | Manual D+7 review 2026-08-10 and D+30 review 2026-09-02. |
