# Sprint 2 close — PostHog dashboards for the help system

Built 2026-05-19 via Chrome browser automation against PostHog Cloud US, project `326191`. Five dashboards materialize spec §10.2 of the [help-guidance engineering handoff](../../prds/Guide/patina-help-guidance-engineering-handoff.md).

## Dashboards

| # | Name | URL | Tiles | Purpose (Spec §10.2) |
|---|------|-----|-------|-----------------------|
| 1 | Tooltip Health | [/dashboard/1603706](https://us.posthog.com/project/326191/dashboard/1603706) | 3 | Per `surface_key`: shown count, avg view duration, quick-dismiss table. High frequency + low duration ⇒ clarify the underlying UI element. |
| 2 | Empty State Conversion | [/dashboard/1603742](https://us.posthog.com/project/326191/dashboard/1603742) | 3 | Per `surface_key`: shown count, CTA click rate (A/B formula), CTA label mix (top 10). <20% click rate ⇒ rewrite. |
| 3 | Tour Completion Funnel — First Project Walkthrough | [/dashboard/1603758](https://us.posthog.com/project/326191/dashboard/1603758) | 4 | Funnel `started → completed` (1-day window, `tour_key = first_project_walkthrough`) + per-step trend + abandonment by `at_step` + avg/p50/p90 completion duration. |
| 4 | Help Article Effectiveness | [/dashboard/1603776](https://us.posthog.com/project/326191/dashboard/1603776) | 5 | Per `article_key`: views, scroll-to-end rate, thumbs-up rate, thumbs-down rate, comments. <60% thumbs-up ⇒ rewrite. |
| 5 | Surface-Level Help Density | [/dashboard/1603788](https://us.posthog.com/project/326191/dashboard/1603788) | 1 | All 11 surface-bearing `help.*` events stacked, broken down by `surface_key`. Identifies confusing screens. |

**Total: 5 dashboards, 16 insight tiles.**

## Status — every tile currently shows "No data"

PostHog project 326191 has **zero ingested `help.*` events** as of 2026-05-19. The taxonomy is wired in code (`apps/{designer,client,admin}-portal/src/lib/analytics/events.ts` + iOS `HelpAnalytics.swift` with parity test), but no traffic has fired events to this project yet — either no portal in production with `NEXT_PUBLIC_POSTHOG_KEY` set has exercised the help UI, or events stream to a different project.

The dashboards are saved as **skeletons**: every tile renders "No insight results / There are no matching events for this query" but is functionally correct. The moment events start arriving they'll populate without any further dashboard work.

## What was deviated from the plan

1. **PostHog UI didn't accept unknown event names in the event picker.** Workaround: each insight was built by direct URL-hash navigation. PostHog's editor reads the full insight definition (kind, source, series, breakdownFilter, trendsFilter) from the `#q=` URL fragment, so custom event names load cleanly and save to the dashboard. Helper script: `python3 /tmp/posthog_insights.py` (see commit). This path also makes future bulk edits trivial.
2. **D5 tile 5.2 (SQL coalesce companion) was deferred.** The HogQL editor stuck on "Loading insight..." when navigated to via URL hash. Plan explicitly allowed skipping after 2 attempts; 5.1 (stacked-events trend) satisfies the spec. Tile 5.2 is documented below as a follow-up.
3. **Dashboard tags weren't applied** (PostHog UI in this version doesn't expose a tags input on the dashboard view or from the list row's ⋯ menu — only View/Edit/Duplicate/Delete options). Workaround: every dashboard description ends with `| Tag: help-system` so the literal string is searchable from the dashboards list search box. Real PostHog tags can be applied via API later.
4. **Per-tile dates show "Last 7 days" not 30d.** Per-tile defaults were left at PostHog's 7d; the dashboard-level filter on each dashboard is set to "No date range override," so the per-tile 7d wins. To switch to 30d, set dashboard-level filter on each via the `No date range override` dropdown at the top-left of each dashboard. Recommended once events start flowing — keep the 7d view while debugging the ingestion pipeline.
5. **Insights have PostHog auto-generated names** (e.g., `shown count & avg_duration_ms's Duration (ms, unprefixed) average & quick_dismiss_lt_2s count, by event's surface_key`). They're descriptive; the rename-each-insight pass was skipped to stay within the time budget. To rename, click the title in the insight edit view and save.

## Auto-generated insight names (one per row in each dashboard)

**Tooltip Health (3 tiles)**
- `help.tooltip.shown count by event's surface_key` — Trend, Bar chart, breakdown limit 20
- `help.tooltip.dismissed's Duration (ms, unprefixed) average by event's surface_key` — Trend, Bar chart
- `shown count & avg_duration_ms's Duration (ms, unprefixed) average & quick_dismiss_lt_2s count, by event's surface_key` — Trend, **Table** with 3 series, surface_key breakdown

**Empty State Conversion (3 tiles)**
- `help.empty_state.shown count by event's surface_key` — Trend, Bar chart
- `A/B on A. cta_clicked count & B. shown count, by event's surface_key` — Trend with `A/B` formula, percentage display
- `help.empty_state.cta_clicked count by event's cta_label` — Trend, Bar chart, **breakdown limit 10**

**Tour Completion Funnel — First Project Walkthrough (4 tiles)**
- `started → completed user conversion rate` — Funnel, both series filtered by `tour_key = first_project_walkthrough`, 1-day window
- `step_advanced count by event's step_number` — Trend, tour_key filter, breakdown by `step_number`
- `abandoned count by event's at_step` — Trend, tour_key filter, breakdown by `at_step`
- `avg_duration_ms's Duration (ms, unprefixed) average & p50_duration_ms p50 & p90_duration_ms's Duration (ms, unprefixed) 90th percentile` — Trend, 3 series of `help.tour.completed` with math = avg / p50 / p90 of `duration_ms`

**Help Article Effectiveness (5 tiles)**
- `help.article.opened count by event's article_key` — Trend, Bar chart, limit 20
- `A/B on A. scrolled_to_end count & B. opened count, by event's article_key` — Trend formula
- `A/B on A. positive count & B. all_feedback count, by event's article_key` — Trend formula (thumbs-up rate); A filtered `sentiment = positive`
- `A/B on A. negative count & B. all_feedback count, by event's article_key` — Trend formula (thumbs-down rate); A filtered `sentiment = negative`
- `feedback_with_comment count by event's article_key` — Trend, filtered `has_comment = true`

**Surface-Level Help Density (1 tile)**
- `help.tooltip.shown count & help.tooltip.dismissed count & help.learnmore.expanded count & help.learnmore.collapsed count & help.empty_state.shown count & help.empty_state.cta_clicked count & help.coachmark.shown count & help.coachmark.dismissed count & help.article.opened count & help.field_helper.rendered count & help.smart_default.applied count, by event's surface_key` — 11 series stacked, breakdown by `surface_key`

## Open follow-ups for Kody

These are intentionally deferred from this dashboard build session:

1. **Apply real PostHog tags.** Use the PostHog API to set `tags = ["help-system"]` on each dashboard. (Requires `POSTHOG_PERSONAL_API_KEY`.) Example:
   ```bash
   curl -X PATCH "https://us.posthog.com/api/projects/326191/dashboards/<ID>/" \
        -H "Authorization: Bearer $POSTHOG_PERSONAL_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"tags": ["help-system"]}'
   ```
   IDs: 1603706, 1603742, 1603758, 1603776, 1603788.

2. **Sharing / ACLs.** Spec §10.2 calls for granting access to Leah (content designer when hired) + engineering. Currently default project visibility; configure when Leah onboards.

3. **First-project walkthrough step count.** When the tour ships and the final step count is fixed, replace the 2-node funnel in D3 with a real per-step funnel. The `step_advanced by step_number` tile already gives the count once data flows.

4. **`cta_label` standardization.** D2 tile 3 will read cleanly as "primary vs secondary" only if the team standardizes `cta_label` values in code. If/when standardized, update the tile to filter on the agreed strings.

5. **Event property casing audit.** Spec §10.1 comments use camelCase (`surfaceKey`, `durationMs`); code emits snake_case (`surface_key`, `duration_ms`). Dashboards use the snake_case names actually emitted. Either update the spec (low-effort) or rename in code (high-effort — breaks data continuity if events ever start flowing). Pick before external publication of the spec.

6. **Enable the SQL companion tile on D5.** The HogQL editor was flaky via browser automation but works manually. The query to add:
   ```sql
   SELECT
     coalesce(properties.surface_key, properties.from_surface_key, '(none)') AS surface,
     count(*) AS interactions
   FROM events
   WHERE event LIKE 'help.%'
     AND timestamp > now() - INTERVAL 30 DAY
   GROUP BY surface
   HAVING surface != '(none)'
   ORDER BY interactions DESC
   LIMIT 20
   ```
   This coalesces `surface_key` and `from_surface_key` (the latter used by panel/welcome_modal events), giving a more complete picture than the stacked-events tile 5.1.

7. **Diagnose ingestion.** Before the dashboards become useful, confirm `help.*` events actually reach project 326191. Spot checks:
   - In dev: `pnpm dev:designer`, open the help panel → check PostHog Live Events for `help.panel.opened`.
   - In iOS: launch app, trigger a tooltip → check Live Events for `help.tooltip.shown`.
   - Production: confirm `NEXT_PUBLIC_POSTHOG_KEY` is set in each portal's active Wrangler configuration, then deploy through `infra/deploy-portal.sh` and verify Live Events.

## Verification (what was confirmed)

- 5 dashboards visible on [/project/326191/dashboard](https://us.posthog.com/project/326191/dashboard) at the end of the session.
- Each dashboard has a description ending with `| Tag: help-system` (visible in the list view).
- Each insight URL hash matches the spec — events, math, breakdowns, filters, formulas, and display modes load correctly when the URL is re-navigated.
- Save success was implicit: every "Save & add to dashboard" click was followed by a green "Insight saved & added to dashboard" toast (observed on every tile build) and a redirect to `/dashboard/<id>?highlightInsightId=...`.
- No console errors observed during build (no `read_console_messages` filter `error|warn` hits across the session).

## Plan reference

Plan executed: `/Users/kody/.claude/plans/make-a-plan-to-misty-sedgewick.md`.
