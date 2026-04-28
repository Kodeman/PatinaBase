# The Daily Room — Data Architecture

**Every Signal. Where It Lives. How It's Used. Where It's Seen.**

*Patina iOS · April 2026 · Internal Working Document*

---

## Document Purpose

This document traces every data point collected by The Daily Room home screen from the moment a user's thumb touches glass to the moment that signal reshapes a recommendation, appears on a designer's dashboard, or triggers a re-engagement push notification. Nothing is collected without a purpose. Nothing is stored without a destination.

### Hard Constraints (Phase 1 Reality)

| Layer | Technology | Notes |
|---|---|---|
| **Primary Database** | PostgreSQL (Supabase managed) | All transactional data, pgvector for embeddings |
| **Object Storage** | Cloudflare R2 | Room scans (USD/USDZ), product images (WebP) |
| **Cache** | Redis (self-hosted on Proxmox) | Session data, recommendation cache, feed cache |
| **Analytics** | PostHog (self-hosted) | Event stream, funnels, feature flags, session replay |
| **ML Inference** | FastAPI sidecar (Proxmox) | Recommendation scoring, re-ranking |
| **Behavioral Batch** | Client-side queue → API every 30s | Dwell, scroll, swipe events batched, not real-time |
| **Search** | pgvector nearest-neighbor | Style vector → product vector similarity |

---

## Part 1: Signal Inventory

Every interaction on The Daily Room generates one or more data points. This is the complete inventory organized by the four screen zones.

### Zone 1: The Greeting

| Signal | Event Name | What's Captured | Why It Matters |
|---|---|---|---|
| App open | `app_launched` | timestamp, launch_type (cold/warm), time_since_last_session, device_model | Retention measurement. Time-between-sessions reveals engagement decay. |
| Session start | `session_started` | session_id, user_id, day_of_week, hour_of_day, timezone | Determines optimal push notification timing per user. |
| Time-of-day context | (derived) | morning/afternoon/evening based on local time | Personalizes greeting and potentially story selection. |

**Storage:** `PostHog` for event stream → nightly aggregation to `analytics_summary` table in PostgreSQL.

**Used By:**
- **Re-engagement engine:** If `time_since_last_session > 72h`, trigger push notification sequence
- **Push timing optimization:** Cluster users by `hour_of_day` patterns to find their natural open time
- **Admin dashboard:** DAU/WAU/MAU metrics, retention curves

---

### Zone 2: The Daily Story

| Signal | Event Name | What's Captured | Why It Matters |
|---|---|---|---|
| Story impression | `story_viewed` | story_id, story_type (maker/material/transformation/principle/arrivals), position: "hero" | Measures which story types get eyeballs. |
| Story tap | `story_tapped` | story_id, story_type, time_on_home_before_tap | Tap rate by story type reveals content preferences. |
| Story read depth | `story_scroll_depth` | story_id, max_depth (0.0–1.0), time_spent_ms, products_visible | 80% depth = "read." <30% = "bounced." Shapes content calendar. |
| Story product view | `story_product_viewed` | story_id, product_id, position_in_story, dwell_ms | Which story-embedded products get attention. |
| Story product add | `story_product_added` | story_id, product_id, room_id, source: "story" | Story-driven conversions — the ROI of editorial content. |
| Story dismissed | `story_scrolled_past` | story_id, time_visible_ms | If <1.5s visible before scroll, story didn't hook. |

**Storage:**

| Data Point | Where | Format |
|---|---|---|
| All events | PostHog event stream | JSON events with user_id, session_id, properties |
| Story engagement summary | `story_analytics` table (PostgreSQL) | Aggregated daily: story_id, impressions, taps, avg_read_depth, product_taps, product_adds |
| Story content | `daily_stories` table (PostgreSQL) | id, type, title, subtitle, maker_id, image_url, body_content, products (int[]), publish_date, status |

**Used By:**

| Consumer | What They See | How |
|---|---|---|
| **Content calendar (Admin)** | Which story types drive engagement | PostHog dashboard: story_type breakdown by tap rate, read depth, product conversion |
| **Aesthete Engine** | User's content affinity | If user consistently reads maker stories but skips material deep-dives, weight maker provenance higher in recommendations |
| **Push notifications** | "New story from a maker you love" | Match story.maker_id against user's high-dwell maker products |

---

### Zone 3: Room Channels

| Signal | Event Name | What's Captured | Why It Matters |
|---|---|---|---|
| Room channel view | `room_channel_viewed` | room_id, room_name, room_type, products_available, new_count | Which rooms users care about most. |
| Room channel switch | `room_channel_switched` | from_room_id, to_room_id, time_in_previous_channel_ms, products_seen_in_previous | Channel switching reveals project priority shifts. |
| Room channel dwell | `room_channel_dwell` | room_id, total_dwell_ms, products_scrolled, products_viewed (>50% visible >1.5s) | **Primary room intent signal.** 80% of session in Bedroom = bedroom is the active project. |
| Room context viewed | (passive) | room dimensions, orientation, window_count displayed | No event — static context from room scan data. |
| Filter applied | `feed_filter_applied` | room_id, filter_category (seating/tables/lighting/storage/all) | Category interest within room context. |
| New picks cleared | `new_picks_viewed` | room_id, new_count_at_start, new_count_at_end, time_to_clear | How fast users consume new recommendations. |

**Storage:**

| Data Point | Where | Format |
|---|---|---|
| Channel events | PostHog | Standard event stream |
| Room channel time (aggregated) | `user_room_engagement` table (PostgreSQL) | user_id, room_id, total_time_ms, sessions_count, last_active, products_added, updated_at |
| Room scan data (reference) | `rooms` table (PostgreSQL) | id, user_id, name, room_type, dimensions (jsonb), detected_objects (jsonb), scan_data_url, window_count, orientation, lighting_conditions, confidence |

**Used By:**

| Consumer | What They See | How |
|---|---|---|
| **Recommendation Engine** | Room-weighted product scoring | Products scored per-room using dimensions, orientation, and existing items. Room with highest `total_time_ms` gets priority in push notifications. |
| **Spatial context generator** | "Why it fits" text per product | `rooms.dimensions` + `rooms.orientation` + `rooms.detected_objects` → template-generated spatial explanations ("108" fits your long wall with 18" clearance") |
| **Push notifications** | "5 new picks for your Bedroom" | `user_room_engagement.last_active` determines which room to feature |
| **Designer portal (leads)** | "Client is actively furnishing their Living Room" | Lead context enriched with room engagement data |

---

### Zone 4: Product Feed (The Core Intelligence Pipeline)

This is where the majority of behavioral data is generated. Every product card in the feed is an intelligence collection point.

#### 4.1 Dwell Time — The Primary Implicit Signal

| Signal | Event Name | What's Captured | Why It Matters |
|---|---|---|---|
| Card enters viewport | `product_dwell_start` | product_id, room_context (current channel), feed_position, scroll_velocity_at_entry (px/s), timestamp | Scroll velocity distinguishes "browsing past" from "stopping to look." |
| Card exits viewport | `product_dwell_end` | product_id, duration_ms, max_visibility_pct (how much of card was visible), interacted (bool), timestamp | Raw dwell duration + visibility percentage = calibrated attention score. |
| **Computed: dwell event** | `product_dwell` (batched) | product_id, room_id, duration_ms, feed_position, scroll_velocity, visibility_pct, session_products_seen, expanded_insight (bool), expanded_pairing (bool) | The unified dwell record sent in the 30-second batch to API. |

**Dwell Interpretation Model:**

| Duration | Classification | Signal Strength | Aesthete Weight |
|---|---|---|---|
| <1.5s | Scrolled past | Weak negative | -0.05 on product style tags |
| 1.5–3s | Glanced | Neutral | 0.0 (below threshold, not recorded as meaningful) |
| 3–6s | Noticed | Mild positive | +0.10 on product style tags |
| 6–12s | Reading | Strong positive | +0.25 — user read the maker story or insight |
| 12–20s | Considering | Very strong positive | +0.40 — equivalent to a "soft save" |
| >20s | Imagining | Highest implicit signal | +0.55 — nearly as strong as explicit save (+0.70) |

**Combined with scroll velocity:**

| Velocity | Modifier | Interpretation |
|---|---|---|
| >800 px/s at entry | ×0.5 weight | Fast scrolling — attention was incidental |
| 200–800 px/s | ×1.0 weight | Normal browsing speed |
| <200 px/s at entry | ×1.3 weight | Slow, deliberate browsing — high intent |
| 0 px/s (stopped) | ×1.5 weight | User stopped scrolling FOR this product |

#### 4.2 Explicit Actions

| Signal | Event Name | What's Captured | Why It Matters |
|---|---|---|---|
| Add to room tap | `product_add_initiated` | product_id, source_room_id (channel context), feed_position | Intent to place product in a room. |
| Room selected in sheet | `product_added_to_room` | product_id, room_id, was_preselected (bool), time_in_sheet_ms | **Primary conversion signal.** Room selection validates spatial recommendation. |
| Add cancelled | `product_add_cancelled` | product_id, time_in_sheet_ms, rooms_viewed | Changed their mind — mild negative signal on product, not on room. |
| Save (heart) | `product_saved` | product_id, room_context, feed_position | Explicit positive without room commitment. |
| Long press (material close-up) | `product_material_viewed` | product_id, duration_ms | Strong tactile interest signal — weight material tags. |
| Swipe right | `product_swiped_right` | product_id, swipe_velocity, room_context | Quick save gesture. Velocity indicates enthusiasm. |
| Swipe left | `product_swiped_left` | product_id, swipe_velocity, room_context | Rejection. Velocity indicates strength of dislike. |
| Product tap (→ detail) | `product_detail_opened` | product_id, room_context, feed_position, dwell_before_tap_ms | Deepened interest — transitions to Product Detail screen. |
| Insight expanded | `product_insight_viewed` | product_id, insight_type (spatial/pairing), room_context | Did the "why it fits" explanation matter? |
| Pairing suggestion tapped | `product_pairing_tapped` | product_id, paired_product_id, room_id | Validates pairing intelligence from designer feedback data. |
| Share | `product_shared` | product_id, share_method (messages/copy/airdrop), room_context | Social signal — strong purchase intent indicator. |

#### 4.3 Feed-Level Signals

| Signal | Event Name | What's Captured | Why It Matters |
|---|---|---|---|
| Feed loaded | `feed_loaded` | room_id, products_count, load_time_ms, cache_hit (bool) | Performance monitoring + content freshness. |
| Feed exhausted | `feed_exhausted` | room_id, products_scrolled, session_duration_ms | User saw everything — trigger "Scan another room" or refresh. |
| Scroll depth | `feed_scroll_depth` | room_id, max_position_reached, total_products, percentage | How deep into the feed users go per session. |
| Pull-to-refresh | `feed_refreshed` | room_id, time_since_last_refresh | Explicit "show me more" — high engagement signal. |

**Storage for All Zone 4 Signals:**

| Data Point | Where | Format | Retention |
|---|---|---|---|
| Raw events (dwell, swipe, add, save) | PostHog event stream | JSON with full context | 90 days raw, then aggregated |
| Batched interactions | `interactions` table (PostgreSQL) | id, user_id, product_id, room_id, composition_id, event_type, metadata (jsonb), created_at | Permanent — this is ML training data |
| Dwell aggregates | `product_user_dwell` table (PostgreSQL) | user_id, product_id, total_dwell_ms, view_count, last_seen, avg_visibility, computed_interest_score | Permanent, updated on each session |
| User style vector updates | `style_profiles.computed_vector` (pgvector) | Updated nightly by re-ranking job | Permanent (versioned) |
| Product engagement scores | `product_engagement` table (PostgreSQL) | product_id, total_dwell_all_users, save_rate, add_to_room_rate, avg_match_when_shown, updated_at | Permanent, recalculated nightly |

---

## Part 2: Data Flow — From Signal to Intelligence

### The Nightly Re-Ranking Pipeline

Every night at 2:00 AM CST, a batch job processes the day's behavioral data and updates the recommendation engine.

```
┌─────────────────────────────────────────────────────────────┐
│                    NIGHTLY PIPELINE                          │
│                    (FastAPI on Proxmox)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. COLLECT                                                 │
│  ├─ Pull today's interactions from PostgreSQL               │
│  ├─ Pull today's PostHog events (dwell, scroll, channel)    │
│  └─ Pull any new designer_feedback records                  │
│                                                             │
│  2. COMPUTE USER SIGNALS                                    │
│  ├─ For each user:                                          │
│  │   ├─ Calculate dwell-weighted product affinities         │
│  │   ├─ Apply exponential decay (λ=0.95/day) to old signals │
│  │   ├─ Merge explicit (saves, adds) + implicit (dwell)     │
│  │   └─ Identify room channel priorities by time-spent      │
│  └─ Output: updated user preference vectors                 │
│                                                             │
│  3. COMPUTE PRODUCT SIGNALS                                 │
│  ├─ For each product:                                       │
│  │   ├─ Aggregate dwell time across all users               │
│  │   ├─ Calculate save rate, add-to-room rate               │
│  │   ├─ Apply designer corrections (tag adjustments)        │
│  │   └─ Detect declining engagement (stale product flag)    │
│  └─ Output: updated product engagement scores               │
│                                                             │
│  4. RE-RANK                                                 │
│  ├─ For each (user, room) pair:                             │
│  │   ├─ pgvector nearest-neighbor: user vector → products   │
│  │   ├─ Apply room spatial filters (dimensions, clearance)  │
│  │   ├─ Apply behavioral re-ranking weights                 │
│  │   ├─ Apply designer pairing rules                        │
│  │   ├─ Ensure price-point diversity in top 20              │
│  │   └─ Ensure category coverage (seating+surface+light)    │
│  └─ Output: ranked product list per (user, room)            │
│                                                             │
│  5. CACHE                                                   │
│  ├─ Write ranked lists to Redis (TTL: 24h)                  │
│  ├─ Compute "new picks" count per room vs. yesterday        │
│  └─ Update app badge count via APNs silent push             │
│                                                             │
│  6. UPDATE PROFILES                                         │
│  ├─ Write updated style_profiles.computed_vector            │
│  ├─ Update user_room_engagement aggregates                  │
│  └─ Log pipeline metrics to PostHog                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Real-Time Path (During Session)

Not everything waits for the nightly batch. These happen in-session:

| Trigger | Action | Latency |
|---|---|---|
| User saves product | Immediately added to room_compositions | <200ms API response |
| User adds to room | Room composition updated, "View →" toast | <200ms |
| Swipe left (reject) | Product removed from current session cache, not shown again this session | Client-side, instant |
| 30-second batch fires | Dwell + scroll events POST to /api/interactions | <500ms |
| Feed exhausted | API fetches next page from Redis cache, or generates fresh if cache miss | <300ms cached, <2s uncached |

---

## Part 3: Database Schema — New Tables for The Daily Room

These tables augment the existing Phase 1 data model.

```sql
-- Daily stories (editorial content)
CREATE TABLE daily_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_type VARCHAR(50) NOT NULL,
        -- maker_spotlight, material_deep_dive, room_transformation,
        -- design_principle, new_arrivals, community
    title VARCHAR(200) NOT NULL,
    subtitle VARCHAR(300),
    hero_image_url TEXT NOT NULL,
    body_content TEXT,             -- Markdown for expanded view
    maker_id UUID REFERENCES makers(id),
    embedded_products INT[],      -- product IDs shown in story
    read_time_minutes INT DEFAULT 3,
    publish_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'draft',  -- draft, scheduled, published, archived
    engagement_summary JSONB,     -- aggregated: impressions, taps, avg_depth, product_conversions
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_stories_publish ON daily_stories(publish_date, status);

-- User room engagement (aggregated from events)
CREATE TABLE user_room_engagement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    room_id UUID REFERENCES rooms(id) NOT NULL,
    total_dwell_ms BIGINT DEFAULT 0,
    session_count INT DEFAULT 0,
    products_viewed INT DEFAULT 0,
    products_added INT DEFAULT 0,
    products_saved INT DEFAULT 0,
    last_active TIMESTAMP,
    primary_category VARCHAR(50),   -- most-filtered category
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, room_id)
);

CREATE INDEX idx_ure_user ON user_room_engagement(user_id);
CREATE INDEX idx_ure_active ON user_room_engagement(user_id, last_active DESC);

-- Product dwell aggregates (per user×product)
CREATE TABLE product_user_dwell (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    product_id INT REFERENCES products(id) NOT NULL,
    total_dwell_ms BIGINT DEFAULT 0,
    view_count INT DEFAULT 0,
    max_single_dwell_ms INT DEFAULT 0,
    avg_visibility_pct FLOAT DEFAULT 0,
    computed_interest_score FLOAT DEFAULT 0,  -- 0.0 to 1.0
    last_seen TIMESTAMP,
    UNIQUE(user_id, product_id)
);

CREATE INDEX idx_pud_user ON product_user_dwell(user_id, computed_interest_score DESC);

-- Product engagement (global, across all users)
CREATE TABLE product_engagement (
    product_id INT REFERENCES products(id) PRIMARY KEY,
    total_impressions INT DEFAULT 0,
    total_dwell_ms BIGINT DEFAULT 0,
    avg_dwell_ms INT DEFAULT 0,
    save_rate FLOAT DEFAULT 0,           -- saves / impressions
    add_to_room_rate FLOAT DEFAULT 0,    -- adds / impressions
    detail_open_rate FLOAT DEFAULT 0,    -- detail taps / impressions
    share_rate FLOAT DEFAULT 0,
    avg_match_when_shown FLOAT DEFAULT 0,
    declining_flag BOOLEAN DEFAULT FALSE, -- engagement dropping week-over-week
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Feed cache metadata
CREATE TABLE feed_cache_meta (
    user_id UUID REFERENCES users(id) NOT NULL,
    room_id UUID REFERENCES rooms(id) NOT NULL,
    products_ranked INT[],       -- ordered product IDs
    new_since_last_view INT DEFAULT 0,
    generated_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    PRIMARY KEY(user_id, room_id)
);

-- Spatial context templates (pre-generated "why it fits" text)
CREATE TABLE spatial_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id INT REFERENCES products(id) NOT NULL,
    room_id UUID REFERENCES rooms(id) NOT NULL,
    context_type VARCHAR(50),    -- dimension_fit, lighting, pairing, orientation
    context_text TEXT NOT NULL,   -- "108" fits your long wall with 18" clearance"
    generated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(product_id, room_id, context_type)
);

CREATE INDEX idx_sc_product_room ON spatial_context(product_id, room_id);
```

---

## Part 4: Where Data Is Viewed

Every data point has at least one place where a human sees it. Here is the complete map of data → surface.

### 4.1 iOS App (The User)

The user never sees raw data. They see the *effects* of data:

| What User Sees | Data Behind It |
|---|---|
| "12 new" badge on Living Room chip | `feed_cache_meta.new_since_last_view` — computed nightly by comparing today's ranked list vs. yesterday's |
| Product match percentage "92%" | `pgvector cosine_similarity(style_profiles.computed_vector, products.embedding)` — pre-computed in nightly pipeline |
| "South-facing light will warm this walnut grain" | `spatial_context.context_text` — generated from `rooms.orientation` + `products.material_tags` |
| "Fits the open zone by your bay window with 18" clearance" | `spatial_context` generated from `rooms.dimensions` + `rooms.detected_objects` + `products.dimensions` |
| "Pairs with your saved Cherry Coffee Table" | `room_compositions.products` cross-referenced with `designer_feedback.pairing_product_id` |
| Product feed order | `feed_cache_meta.products_ranked` — served from Redis, generated by nightly pipeline |
| Daily story content | `daily_stories` where `publish_date = today AND status = 'published'` |
| Project total "$8,583" | `SUM(products.price_cents) WHERE product_id IN room_compositions.products` |

### 4.2 Designer Portal (Leah)

| Dashboard Element | Data Source | Query Pattern |
|---|---|---|
| **Lead quality context** — "Client is actively furnishing Living Room, 6 items saved, $8.5K invested" | `user_room_engagement` + `room_compositions` + `products.price_cents` | Aggregated per lead at lead creation time, snapshot stored in `leads.style_profile_snapshot` |
| **Product performance** — "Your Walnut Chair has 92% avg match, 34% save rate" | `product_engagement` | Direct read for products where `products.created_by = designer_id` |
| **Pairing validation** — "Users who saved your chair also saved these 5 items" | `interactions` + `room_compositions` | Co-occurrence query: products appearing in same room_compositions as designer's product |
| **Teaching effectiveness** — "Your corrections improved match rate by 12%" | `designer_feedback` + `product_engagement` before/after correction | Compare product engagement metrics pre/post designer feedback timestamp |
| **Client style summary** — visual quiz results + behavioral drift | `style_profiles` + `interactions` aggregated | Style vector visualization showing quiz baseline vs. behavioral-adjusted current |

### 4.3 Admin Portal (Kody)

| Dashboard Element | Data Source | Tool |
|---|---|---|
| **DAU/WAU/MAU** | PostHog `app_launched` events | PostHog dashboard — standard retention chart |
| **Session duration distribution** | PostHog `session_started` / `session_ended` | PostHog histogram |
| **Avg dwell time per product** | `product_engagement.avg_dwell_ms` | PostHog + custom SQL query |
| **Feed scroll depth** | PostHog `feed_scroll_depth` events | PostHog funnel: what % reach position 5, 10, 15, 20 |
| **Story engagement by type** | `daily_stories.engagement_summary` | Custom PostHog dashboard grouping by story_type |
| **Room channel distribution** | `user_room_engagement` aggregated | SQL: AVG(total_dwell_ms) GROUP BY room_type |
| **Add-to-room conversion rate** | `product_add_initiated` → `product_added_to_room` | PostHog funnel |
| **Recommendation accuracy** | `interactions` where event_type IN (save, add_to_room) / total impressions | Nightly computed metric, tracked as time-series |
| **Style vector drift** | `style_profiles.computed_vector` versioned over time | Custom visualization — how user cohort vectors shift |
| **ML pipeline health** | Pipeline logs, timing, error rates | Grafana on Proxmox |
| **Product staleness** | `product_engagement.declining_flag` | SQL count of declining products, alert if >20% |
| **Push notification effectiveness** | PostHog: `push_opened` / `push_sent` | PostHog ratio metric |

### 4.4 PostHog Dashboard Structure

```
PostHog Project: "Patina iOS"
├── Dashboards
│   ├── Daily Room — Feed Health
│   │   ├── Avg products viewed per session (line chart, 30d)
│   │   ├── Avg dwell per product by feed position (bar)
│   │   ├── Add-to-room conversion funnel
│   │   ├── Room channel time distribution (pie)
│   │   └── Feed scroll depth histogram
│   │
│   ├── Daily Room — Story Performance
│   │   ├── Story tap rate by type (bar, weekly)
│   │   ├── Avg read depth by type (bar)
│   │   ├── Story → product add conversion (funnel)
│   │   └── Story engagement trend (line, 30d)
│   │
│   ├── Engagement — Core Metrics
│   │   ├── DAU/WAU/MAU (line)
│   │   ├── Session duration distribution (histogram)
│   │   ├── Sessions per user per week (line)
│   │   ├── Retention cohort chart (standard)
│   │   └── Time-to-first-add-to-room (histogram)
│   │
│   ├── Recommendation Quality
│   │   ├── Save rate over time (line)
│   │   ├── Match score vs. save rate (scatter)
│   │   ├── Dwell time vs. match score (scatter)
│   │   ├── Swipe-left rate by product category (bar)
│   │   └── Designer correction impact (before/after)
│   │
│   └── Push & Re-engagement
│       ├── Push open rate by notification type (bar)
│       ├── Time-since-last-session distribution (histogram)
│       ├── New picks badge → session start correlation
│       └── Returning user first-action breakdown (pie)
│
├── Feature Flags
│   ├── daily_room_enabled (rollout %)
│   ├── pairing_suggestions_enabled
│   ├── spatial_context_enabled
│   └── story_embedded_products_enabled
│
└── Session Replays
    └── Filtered by: high-dwell sessions, add-to-room flows, story interactions
```

---

## Part 5: Data Lifecycle & Privacy

### Retention Policy

| Data Type | Retention | Reason |
|---|---|---|
| Raw PostHog events | 90 days | Sufficient for trend analysis; storage cost management |
| Aggregated metrics (PostgreSQL) | Permanent | ML training requires historical behavioral patterns |
| Style profile vectors | Permanent (versioned) | Core Aesthete Engine asset |
| Room scan files (R2) | Permanent until user deletes room | User's data, user controls it |
| Session replays (PostHog) | 30 days | Debugging and UX research only |
| Feed cache (Redis) | 24h TTL | Regenerated nightly |
| Spatial context text | Regenerated when room data or product catalog changes | Not permanently stored — derived data |

### User Data Rights

| Right | Implementation |
|---|---|
| **View my data** | Profile screen shows: style profile summary, rooms, saved products, interaction count |
| **Delete my data** | Account deletion removes: user row, style_profiles, rooms, interactions, room_compositions, user_room_engagement, product_user_dwell. PostHog anonymization triggered. R2 scan files deleted. |
| **Export my data** | JSON export of: style profile, room data, saved products, interaction history |
| **Opt out of behavioral tracking** | Disables dwell tracking and swipe recording. Recommendations fall back to style-quiz-only scoring. Reduced personalization, user is informed. |

### What We Never Collect

- Camera images outside of active room scan sessions
- Microphone data
- Location data beyond timezone (for greeting time-of-day)
- Contacts or address book
- Health data
- Cross-app tracking identifiers

---

## Part 6: The Feedback Loop — Complete Cycle

This is how a single dwell event on The Daily Room ultimately changes what a different user sees next week:

```
1. User A dwells 14 seconds on a Chilton Walnut Chair (Living Room channel)
   → interactions table: event_type=dwell, metadata.duration_ms=14000

2. Nightly pipeline processes:
   → product_user_dwell: User A's interest score for this product = 0.72
   → product_engagement: Chilton Chair avg_dwell rises to 9.2s (strong product)
   → style_profiles: User A's vector shifts slightly toward "warm_wood" + "handcrafted"

3. Chilton Chair's engagement data feeds designer portal:
   → Leah sees: "Your chair has 92% match rate, 34% save rate, avg 9.2s dwell"
   → Leah adds pairing feedback: "pairs beautifully with Floyd Bed Frame"

4. Designer feedback enters the pipeline:
   → designer_feedback: pairing_product_id links Chair → Bed Frame
   → Next nightly run: pairing rule applied to all users with both in their rooms

5. User B (different user, similar style vector) opens The Daily Room:
   → Bedroom channel shows Floyd Bed Frame
   → Pairing suggestion below card: "Pairs with the Walnut Chair in your Living Room"
   → User B adds Bed Frame to Bedroom
   → Interaction recorded → cycle continues

6. Both users' room compositions grow toward "Complete the Room":
   → Project total crosses $5K threshold
   → Companion nudges: "Talk to a designer →"
   → Lead generated with full context: style profile + rooms + saved products + engagement data
```

---

## Appendix: API Contracts for The Daily Room

### Feed Endpoint

```
GET /api/feed/{room_id}?limit=20&offset=0
Headers: Authorization: Bearer {jwt}

Response: {
  room: {
    id, name, room_type, dimensions, orientation,
    window_count, items_saved: 6
  },
  products: [{
    id, name, price_cents, match_score: 92,
    maker: { name, location },
    image_url, tier, badges,
    spatial_context: {
      why_it_fits: "South-facing light will warm this walnut grain",
      dimension_fit: "Fits the open zone by your bay window",
      pairing: { product_id, product_name, reason: "matched wood tones" }
    }
  }],
  new_count: 12,
  total: 18,
  cache_generated_at: "2026-04-07T02:00:00Z"
}
```

### Interaction Batch Endpoint

```
POST /api/interactions/batch
Headers: Authorization: Bearer {jwt}
Body: {
  session_id: "uuid",
  events: [
    {
      event_type: "dwell",
      product_id: 42,
      room_id: "uuid",
      metadata: {
        duration_ms: 8420,
        feed_position: 3,
        scroll_velocity: 340,
        visibility_pct: 0.85,
        expanded_insight: true,
        expanded_pairing: false
      },
      timestamp: "2026-04-07T07:14:23Z"
    },
    {
      event_type: "product_added_to_room",
      product_id: 42,
      room_id: "uuid",
      metadata: {
        was_preselected: true,
        time_in_sheet_ms: 1200,
        source: "feed"
      },
      timestamp: "2026-04-07T07:14:31Z"
    }
  ]
}

Response: { received: 2, processed: 2 }
```

### Daily Story Endpoint

```
GET /api/stories/today
Headers: Authorization: Bearer {jwt}

Response: {
  story: {
    id, type: "maker_spotlight",
    title, subtitle, hero_image_url,
    body_content: "markdown...",
    read_time_minutes: 4,
    maker: { id, name, location, avatar_url },
    embedded_products: [{
      id, name, price_cents, image_url, match_score
    }]
  },
  is_read: false
}
```

---

*Every signal has a destination. Every destination has a purpose. The feed is the intelligence pipeline.*

---

**Document Version:** 1.0
**Last Updated:** April 2026
**Companion Design Reference:** `patina-daily-room.html`
**Phase 1 Tech Reference:** `Phase_1_spec`
**Data Model Reference:** Phase 1 spec → Data Model section
