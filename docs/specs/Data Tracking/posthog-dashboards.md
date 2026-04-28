# PostHog Dashboard Setup — The Daily Room

These dashboards live in the self-hosted PostHog instance and are
configured manually through the PostHog UI. The event vocabulary and
properties come from the iOS `DailyRoomBatchQueue` dual-emit path and
from the Next.js portals.

## Required Dashboards

### 1. Daily Room — Feed Health
- **Avg products viewed per session** — line chart, 30d rolling
  - Event: `product_dwell`
  - Aggregation: count per session → average
- **Avg dwell per product by feed position** — bar chart
  - Event: `product_dwell`
  - Breakdown: `feed_position`
  - Value: avg(`duration_ms`)
- **Add-to-room conversion funnel**
  - Steps: `product_dwell` → `product_add_initiated` → `product_added_to_room`
- **Room channel time distribution** — pie chart
  - Event: `room_channel_dwell`
  - Breakdown: `room_id`
  - Value: sum(`duration_ms`)
- **Feed scroll depth histogram**
  - Event: `feed_scroll_depth`
  - Value: `max_position_reached`

### 2. Daily Room — Story Performance
- **Story tap rate by type** — bar, weekly
  - Funnel: `story_viewed` → `story_tapped`
  - Breakdown: `story_type`
- **Avg read depth by type** — bar
  - Event: `story_scroll_depth`
  - Value: avg(`max_depth`)
  - Breakdown: `story_type`
- **Story → product add conversion** — funnel
  - Steps: `story_viewed` → `story_product_viewed` → `story_product_added`
- **Story engagement trend** — line, 30d
  - Event: `story_viewed`

### 3. Engagement — Core Metrics
- **DAU/WAU/MAU** — standard PostHog retention chart
  - Event: `app_launched`
- **Session duration distribution** — histogram
  - Derived: `session_started` → `session_ended` delta
- **Sessions per user per week** — line
- **Retention cohort** — standard
- **Time-to-first-add-to-room** — histogram

### 4. Recommendation Quality
- **Save rate over time** — line
- **Match score vs. save rate** — scatter
- **Dwell time vs. match score** — scatter
- **Swipe-left rate by product category** — bar

### 5. Push & Re-engagement
- **Push open rate by notification type** — bar
- **Time-since-last-session distribution** — histogram
- **New picks badge → session start correlation**

## Feature Flags
Create these flags in PostHog (rollout percentages start at 0):
- `daily_room_enabled`
- `pairing_suggestions_enabled`
- `spatial_context_enabled`
- `story_embedded_products_enabled`

## Session Replays
Filter by:
- High-dwell sessions (duration > 5 min)
- Add-to-room flows
- Story interactions
