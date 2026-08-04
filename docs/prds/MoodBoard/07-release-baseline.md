# MoodBoard release measurement baseline

**Evidence date:** 2026-08-03
**Cutoff:** 2026-08-03 23:17:54 UTC
**Scope:** read-only production measurement review; no production data was changed.

This document records what can and cannot be measured at the GA release gate.
It is deliberately separate from the acceptance ledger: implementation can make
future events queryable, but it cannot recreate historical events that were never
emitted.

## Release decision

M1 and M4–M7 have complete post-GA query contracts. M2, M3, and M8 need an
explicit release-owner decision before production deployment:

- **M2 is blocked:** the legacy accordion emitted no explicit open/close or dwell
  event. Ten legacy "Boards" toggle autocaptures across eight sessions are not a
  defensible duration baseline. Exact pre-GA median dwell is unrecoverable without
  a separately approved, manual session-replay sampling protocol.
- **M3 needs approval for an adapted baseline:** the read-only database snapshot
  below is a composition-richness proxy, not `item_count` at Done. It may be used
  only if the release owner explicitly accepts that adaptation.
- **M8 is blocked:** the legacy client renderer had no renderer-scoped success,
  failure, or exception event. The new renderer's error rate is queryable, but a
  numerical pre-swap comparator cannot be reconstructed.

These are measurement blockers, not reasons to fabricate zeroes. The release
owner must either (a) hold GA while an approved alternate baseline is produced,
or (b) sign off on a prospective/adapted comparison window. Approval and the
chosen window must be appended here before deployment.

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
| M2 Session depth | Median `duration_ms` on `mood_board_done`, one event per completed room session. | Future input ready. | **Blocked:** exact legacy accordion dwell median is unavailable; approval required for manual replay sampling or a prospective baseline. |
| M3 Composition richness | Per `board_id`, take the latest `mood_board_done.item_count` in the window, then the median across boards. | Future input ready. | **Adapted proxy pending approval:** 8 boards; median 1; min 0; max 2 at the cutoff. |
| M4 Ergonomic uptake | `mood_board_done` sessions where `used_undo OR used_multiselect OR used_tidy OR used_handles`, divided by all `mood_board_done` sessions. | Ready; all four booleans are on the Done event. | Begin at GA; no legacy comparator required. |
| M5 Presentation reach | Count `mood_board_presented` + `mood_board_shared`, grouped by non-null `proposal_id`; divide by distinct activated proposal IDs with boards in the same cohort. Project boards use `source_proposal_id` lineage. | Ready: presentation/share events carry owner and proposal lineage. | Validate the activated-proposal cohort against Strata for the reporting window. |
| M6 Verdict engagement | Distinct `board_id` on `mood_board_verdict_given` divided by the union of distinct `board_id` on `mood_board_presented` and `mood_board_shared`. | Ready. | Begin at GA; designer read-only verdict chips do not emit the event. |
| M7 Export fidelity uptake | Count `mood_board_exported` by `format` and `board_id`; composition is `png` + `pdf_composition`, denominator adds `pdf_spec_sheet`. Track `mood_board_export_failed` separately. | Ready. | Begin at GA; target is composition ≥70% of completed exports. |
| M8 No regression | For `surface = 'client_proposal'`, `mood_board_client_render_failed / (failed + succeeded)`. Monitor `guest_share` separately and correlate privacy-safe captured exceptions where `feature = 'mood_board'`. | New renderer is queryable. | **Blocked:** no legacy renderer-scoped denominator or failure event exists; approve a prospective/canary comparator or hold release. |

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
| M2 alternate legacy baseline or prospective waiver | Release owner | **Required — blocking** | — |
| M3 snapshot proxy accepted as the pre-GA baseline | Release owner | **Required — blocking** | — |
| M8 prospective/canary comparator accepted | Release owner | **Required — blocking** | — |
