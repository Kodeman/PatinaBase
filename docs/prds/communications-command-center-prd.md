# Communications Command Center — Product Requirements Document

> **Status**: Active — Ready for Development  
> **Owner**: Kody  
> **Version**: 1.0  
> **Last Updated**: March 2026  
> **Depends On**: Email & Notification System PRD (v1.0)  
> **Portal**: Admin Portal (admin-only visibility)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Portal Integration & Navigation](#3-portal-integration--navigation)
4. [Access Control & Permissions](#4-access-control--permissions)
5. [Information Architecture](#5-information-architecture)
6. [Screen Specifications](#6-screen-specifications)
7. [User Flows](#7-user-flows)
8. [Data Models](#8-data-models)
9. [PostHog Analytics Integration](#9-posthog-analytics-integration)
10. [Template System](#10-template-system)
11. [Audience Segmentation Engine](#11-audience-segmentation-engine)
12. [Automation Sequences](#12-automation-sequences)
13. [Sender Configuration & Compliance](#13-sender-configuration--compliance)
14. [API Specifications](#14-api-specifications)
15. [Technical Architecture](#15-technical-architecture)
16. [Implementation Roadmap](#16-implementation-roadmap)
17. [Success Metrics](#17-success-metrics)
18. [Open Questions](#18-open-questions)
19. [Related Documentation](#19-related-documentation)

---

## 1. Executive Summary

### What We're Building

The Communications Command Center is an admin-only module within the Patina Admin Portal that provides a unified interface for composing, scheduling, targeting, and analyzing all email communications sent through the Patina platform. It sits on top of the notification infrastructure defined in the Email & Notification System PRD, adding the human-facing orchestration layer — the screens where Leah composes a Founding Circle update and Kody monitors delivery health.

### Why Now

The Email & Notification System PRD defines the plumbing: the `notify()` dispatch function, the preference schema, the queue architecture, the React Email templates, the Resend integration. That system works programmatically — a database trigger fires, a function calls `notify()`, an email sends. But there's an entire class of communications that can't be triggered by code alone: marketing campaigns, Founding Circle updates, maker spotlights, seasonal collections, re-engagement sequences. Those require a human composing content, selecting an audience, reviewing a preview, and pressing send. This module is where that happens.

Building it now — in parallel with the notification infrastructure sprints — means the first marketing campaign can send the same week the queue goes live. Deferring it means Leah is either locked out of email until a developer wires each send manually, or she's using a disconnected third-party tool that can't leverage Patina's style profile data, Aesthete Engine segments, or branded templates.

### Who It's For

Today: Kody and Leah. Kody uses it as the system operations dashboard — delivery health, queue depth, bounce monitoring, PostHog attribution funnels. Leah uses it as the marketing composition tool — writing Founding Circle updates, assembling maker spotlight campaigns, reviewing engagement analytics to understand what stories resonate.

Tomorrow: A marketing coordinator or growth lead who inherits a structured, documented system instead of tribal knowledge.

### Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time from idea to sent campaign | < 15 minutes | Timestamp delta: campaign created → campaign sent |
| Delivery rate across all sends | > 98.5% | Resend webhook data aggregated in Command Center |
| Open rate on marketing campaigns | > 35% | Resend open tracking + PostHog event correlation |
| Click-through rate on marketing campaigns | > 5% | Resend click tracking + UTM attribution in PostHog |
| Revenue attributable to email (7-day window) | Trackable from Sprint 2 | PostHog funnel: email_clicked → purchase_completed |
| Admin time spent on campaign operations | < 2 hours/week | Self-reported, validated against session analytics |
| Template creation time (new template from base) | < 30 minutes | Sprint retrospective measurement |

---

## 2. Problem Statement

### The Gap Between Infrastructure and Operations

The Email & Notification System PRD solves the engineering problem: how notifications route, queue, render, deliver, and log. It does not solve the operational problem: how a non-developer team member composes a marketing email, targets it to users who match specific style profiles, previews it across devices, schedules it for Tuesday morning, and then reviews whether it drove any purchases.

Without this module, the founding team faces three specific pain points:

**Leah can't send marketing email without developer assistance.** Every campaign requires Kody to write a React Email component, define a Resend batch call, construct the audience query, and trigger the send from code. This makes Leah dependent on Kody's availability for every communication, which violates the "Leah's Time is Sacred" principle and creates a bottleneck that gets worse as send frequency increases.

**There's no visibility into how email performs against business outcomes.** Resend provides delivery, open, and click metrics at the email level. PostHog tracks user behavior at the product level. Without a bridge between them, there's no way to answer "did the maker spotlight campaign drive any purchases?" — which is the only question that matters for a three-sided marketplace generating revenue through commissions.

**Audience targeting can't leverage the Aesthete Engine.** Patina's core differentiator is that professional designers teach the recommendation algorithm, producing rich style profiles and behavioral data that no competitor has. If marketing campaigns can't target by style profile cluster, engagement tier, or Aesthete Engine affinity scores, the team is sending generic blasts when they could be sending hyper-relevant curated content — the exact opposite of the brand promise.

---

## 3. Portal Integration & Navigation

### Where It Lives

The Communications Command Center is a new top-level section within the existing Admin Portal. It appears in the Admin Portal's primary sidebar navigation, gated by the `admin` and `comms_admin` roles. Non-admin users — designers, manufacturers, consumers — never see this module.

### Existing Admin Portal Navigation (Before)

```
Admin Portal
├── Dashboard
│   ├── System Health Monitor
│   ├── Intelligence Metrics
│   ├── Active Alerts
│   └── Quick Actions
│
├── Product Catalog Management
│   ├── Product Intake Queue
│   ├── Bulk Import Tools
│   ├── Vendor Management
│   ├── Pricing & Availability
│   └── Quality Control
│
├── The Aesthete Engine Core
│   ├── Style Taxonomy Manager
│   ├── Matching Rules Editor
│   ├── ML Model Dashboard
│   ├── Training Data Curator
│   └── A/B Test Controller
│
├── Designer Management
│   ├── Designer Directory
│   ├── Teaching Performance
│   ├── Expertise Mapping
│   └── Compensation Dashboard
│
├── Quality Assurance
│   ├── Anomaly Detection
│   ├── Conflict Resolution
│   ├── Validation Queues
│   └── Accuracy Tracking
│
└── Analytics & Insights
    ├── System Performance
    ├── Business Intelligence
    ├── Predictive Models
    └── Export Center
```

### Updated Admin Portal Navigation (After)

```
Admin Portal
├── Dashboard
│   ├── System Health Monitor
│   ├── Intelligence Metrics
│   ├── Active Alerts
│   └── Quick Actions
│
├── Product Catalog Management
│   └── ... (unchanged)
│
├── The Aesthete Engine Core
│   └── ... (unchanged)
│
├── Designer Management
│   └── ... (unchanged)
│
├── ──────────────────────────        ← visual divider
│
├── 📬 Communications                 ← NEW TOP-LEVEL SECTION
│   ├── Command Center                  (daily ops dashboard)
│   ├── Campaigns                       (compose + manage campaigns)
│   │   ├── All Campaigns
│   │   ├── Create New
│   │   └── Drafts
│   ├── Automations                     (lifecycle sequences)
│   │   ├── Active Sequences
│   │   ├── Create New
│   │   └── Performance
│   ├── Templates                       (email template library)
│   │   ├── All Templates
│   │   ├── Create New
│   │   └── Base Layouts
│   ├── Audiences                       (segment builder + library)
│   │   ├── Saved Segments
│   │   ├── Build Segment
│   │   └── Suppression Lists
│   └── Analytics                       (PostHog-powered insights)
│       ├── Campaign Performance
│       ├── Revenue Attribution
│       ├── Engagement Cohorts
│       └── Delivery Health
│
├── ──────────────────────────        ← visual divider
│
├── Quality Assurance
│   └── ... (unchanged)
│
└── Analytics & Insights
    └── ... (unchanged)
```

### Sidebar Rendering Logic

The Communications section renders conditionally based on the authenticated user's role. The sidebar component checks `user.roles` against the `comms_admin` permission before mounting the section.

```typescript
// Pseudocode for sidebar conditional rendering
const COMMS_NAV_ITEMS = [
  { label: 'Command Center', path: '/admin/comms', icon: 'BarChart3' },
  { label: 'Campaigns', path: '/admin/comms/campaigns', icon: 'Send', badge: draftCount },
  { label: 'Automations', path: '/admin/comms/automations', icon: 'Zap' },
  { label: 'Templates', path: '/admin/comms/templates', icon: 'Palette' },
  { label: 'Audiences', path: '/admin/comms/audiences', icon: 'Users' },
  { label: 'Analytics', path: '/admin/comms/analytics', icon: 'TrendingUp' },
];

// Only renders if user has comms_admin permission
{hasPermission('comms_admin') && (
  <SidebarSection label="Communications" icon="Mail">
    {COMMS_NAV_ITEMS.map(item => <SidebarItem key={item.path} {...item} />)}
  </SidebarSection>
)}
```

### Sidebar Visual Treatment

The Communications section is visually separated from the existing Admin Portal sections with a subtle horizontal divider (1px, `var(--pearl)` / `#E5E2DD`). This signals it as a distinct operational domain without breaking the unified sidebar pattern.

The section icon uses a mail/envelope icon in the Clay Beige accent color. Active state follows the existing Admin Portal pattern: left-edge 3px accent bar in Clay Light (`#C4A57B`), slightly elevated background (`rgba(163,146,124,0.12)`), and white text.

A badge counter on "Campaigns" shows the number of unsent drafts. A dot indicator on "Command Center" appears if any delivery health alerts are active (bounce rate > 2%, queue depth > threshold).

### URL Structure

All Communications routes are namespaced under `/admin/comms/`:

| Route | Screen |
|-------|--------|
| `/admin/comms` | Command Center dashboard |
| `/admin/comms/campaigns` | Campaign list (all states) |
| `/admin/comms/campaigns/new` | Campaign builder wizard |
| `/admin/comms/campaigns/:id` | Campaign detail / edit |
| `/admin/comms/campaigns/:id/report` | Post-send campaign report |
| `/admin/comms/automations` | Automation sequence list |
| `/admin/comms/automations/new` | Sequence builder |
| `/admin/comms/automations/:id` | Sequence detail + live metrics |
| `/admin/comms/templates` | Template library grid |
| `/admin/comms/templates/new` | Template editor |
| `/admin/comms/templates/:id` | Template detail / edit |
| `/admin/comms/audiences` | Saved segment list |
| `/admin/comms/audiences/new` | Segment builder |
| `/admin/comms/audiences/:id` | Segment detail + member preview |
| `/admin/comms/analytics` | Analytics overview |
| `/admin/comms/analytics/attribution` | Revenue attribution funnel |
| `/admin/comms/analytics/delivery` | Delivery health dashboard |
| `/admin/comms/settings` | Sender domains, compliance config |

---

## 4. Access Control & Permissions

### Role Definitions

| Role | Scope | Who |
|------|-------|-----|
| `super_admin` | Full platform access including Communications | Kody |
| `comms_admin` | Full Communications module access | Leah, future marketing hire |
| `comms_viewer` | Read-only access to analytics and campaign reports | Stakeholders, advisors |

### Permission Matrix

| Action | `super_admin` | `comms_admin` | `comms_viewer` |
|--------|:---:|:---:|:---:|
| View Command Center | ✓ | ✓ | ✓ |
| View campaign reports | ✓ | ✓ | ✓ |
| View analytics dashboards | ✓ | ✓ | ✓ |
| Create / edit campaigns | ✓ | ✓ | — |
| Send / schedule campaigns | ✓ | ✓ | — |
| Create / edit templates | ✓ | ✓ | — |
| Create / edit audiences | ✓ | ✓ | — |
| Create / edit automations | ✓ | ✓ | — |
| Activate / pause automations | ✓ | ✓ | — |
| Manage sender settings | ✓ | — | — |
| Manage suppression lists | ✓ | ✓ | — |
| Delete campaigns / templates | ✓ | — | — |
| Access notification queue debug | ✓ | — | — |
| Export analytics data | ✓ | ✓ | — |

### Implementation

Permissions are enforced at both the routing layer (Next.js middleware checks role before rendering the page) and the API layer (Supabase RLS policies on `campaigns`, `email_templates`, `audience_segments` tables). The sidebar rendering check is a convenience UI gate; the API is the security boundary.

```sql
-- RLS policy example for campaigns table
CREATE POLICY "comms_admin_full_access" ON campaigns
  FOR ALL
  USING (
    auth.jwt() ->> 'role' IN ('super_admin', 'comms_admin')
  );

CREATE POLICY "comms_viewer_read_only" ON campaigns
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'comms_viewer'
  );
```

---

## 5. Information Architecture

### Module Structure

The Communications Command Center comprises six primary sections, each serving a distinct function in the campaign lifecycle. The sections map to the operational phases of email marketing: monitor → compose → target → automate → analyze.

```
📬 Communications
│
├── Command Center ─────────── MONITOR
│   Daily operations dashboard.
│   What: send volume, delivery health, open/click rates, queue status, recent activity, scheduled sends.
│   Why: single pane of glass for "is everything working and how did yesterday go."
│
├── Campaigns ──────────────── COMPOSE + SEND
│   Create, manage, and review one-time email campaigns.
│   What: guided wizard (template → content → audience → preview → schedule), campaign list, post-send reports.
│   Why: the primary interface where Leah writes and sends marketing communications.
│
├── Automations ────────────── AUTOMATE
│   Build and manage lifecycle email sequences.
│   What: visual flow editor, trigger configuration, conditional branching, per-step performance metrics.
│   Why: welcome series, abandoned scan, re-engagement, post-purchase — emails that run continuously.
│
├── Templates ──────────────── DESIGN
│   Manage the email template library.
│   What: template grid with previews, template editor with live preview, content block library, base layout management.
│   Why: maintain brand consistency, enable rapid campaign composition, provide reusable building blocks.
│
├── Audiences ──────────────── TARGET
│   Build, save, and manage audience segments.
│   What: visual rule composer, real-time recipient counts, saved segments, suppression lists, preset quick-segments.
│   Why: leverage Aesthete Engine data for hyper-relevant targeting. No blast emails.
│
└── Analytics ──────────────── ANALYZE
    PostHog-powered engagement analytics.
    What: campaign comparison, revenue attribution funnels, engagement cohorts, delivery health trends, A/B test results.
    Why: close the loop between "we sent an email" and "it drove $14K in revenue."
```

### Cross-Section Relationships

Campaigns consume Templates and Audiences. When composing a campaign, the user selects a template (from the Templates library) and an audience (from the Audiences library or builds one inline). After sending, the campaign generates a report visible in Analytics. Automations are composed of steps, each of which references a Template and can target a subset of an Audience via conditional logic.

```
Templates ──uses──▶ Campaigns ──targets──▶ Audiences
    │                    │
    │                    ├──reports──▶ Analytics
    │                    │
    └────uses────▶ Automations ──tracks──▶ Analytics
```

---

## 6. Screen Specifications

### 6.1 Command Center (`/admin/comms`)

The daily operations dashboard. The first screen visible when clicking "Communications" in the sidebar.

**Layout**: Full-width content area with top action bar, four stat cards in a row, a two-column body (chart left, activity feed right), and a scheduled sends section below.

**Top Action Bar**:
- Page title: "Command Center" (Playfair Display, 22px)
- Time range selector: dropdown defaulting to "Last 7 days" with options for 24h, 7d, 30d, 90d, custom range
- Primary CTA: "+ New Campaign" button (Clay background, pill shape, links to `/admin/comms/campaigns/new`)

**Stat Cards Row** (4 cards, equal width):

| Card | Value | Delta | Source |
|------|-------|-------|--------|
| Emails Sent | Total count for period | % change vs previous period | `notification_log` aggregation |
| Open Rate | Percentage | Point change vs previous period | Resend webhook `email.opened` |
| Click Rate | Percentage | Point change vs previous period | Resend webhook `email.clicked` |
| Delivery Health | Percentage | Bounce/complaint count today | Resend webhook `email.bounced` + `email.complained` |

Color coding: Delivery Health card value renders in Success green when > 98%, Warning amber when 95-98%, Error red when < 95%.

**Chart Area** (left column, ~60% width):
- Title: "Send Volume — [period]"
- Chart type: Vertical bar chart
- X-axis: date buckets (hourly for 24h, daily for 7d/30d, weekly for 90d)
- Y-axis: email count
- Bar color: Clay Beige for marketing, Mocha Brown for transactional (stacked)
- Hover state: tooltip with exact count and breakdown
- Library: Recharts

**Recent Activity Feed** (right column, ~40% width):
- Title: "Recent Activity"
- List of last 10 notification events, most recent first
- Each row: bold campaign/notification name, short description, relative timestamp
- Row types: campaign sent, automation step triggered, lead alert dispatched, welcome email sent, campaign scheduled, high-performing campaign flag
- Click action: navigates to the relevant campaign report or automation detail
- Bottom link: "View all activity →" links to full activity log

**Scheduled Sends Section** (full width, below fold):
- Title: "Upcoming"
- Table of campaigns and automation steps scheduled to send in the next 7 days
- Columns: Name, Type (campaign / automation step), Audience size, Scheduled time, Status
- Row actions: Edit, Reschedule, Cancel
- Empty state: "No upcoming sends. [Create a campaign →]"

**Alert Banner** (conditional, top of page):
- Renders when delivery health drops below 95% or queue depth exceeds threshold
- Yellow Warning background with Charcoal text
- Message: "Delivery health is at {x}%. {n} bounces in the last 24 hours. [View details →]"
- Dismissible per session, re-appears if condition persists

---

### 6.2 Campaign Builder (`/admin/comms/campaigns/new`)

A multi-step wizard that guides the user from template selection through content composition, audience targeting, preview, and scheduling. The wizard preserves state between steps — the user can move backward without losing work. Auto-saves draft every 30 seconds.

**Wizard Steps**:

```
① Template  →  ② Content  →  ③ Audience  →  ④ Preview  →  ⑤ Schedule
```

**Step Progress Bar**: Horizontal stepper at top of content area. Completed steps show a green checkmark. Active step has Clay-filled circle. Future steps have outlined circles. Steps are clickable for backward navigation.

#### Step 1: Template Selection

**Layout**: Grid of template cards (4 columns on desktop, 2 on tablet).

Each card displays:
- Mini email preview (120px tall, showing the template's header pattern and content skeleton)
- Template name (13px, bold)
- Description (11px, muted)
- Category tags (Engagement, Campaign, Transactional)
- Audience tags (Consumer, Designer, Manufacturer, All)

Filter bar above grid: tab-style filters for All, Engagement, Campaign, Sequence. Search input for name/tag search.

"+ Create New Template" card at the end of the grid, styled as dashed-border outline.

**Action**: Clicking a template card selects it (adds Clay border highlight and checkmark overlay) and enables the "Next: Compose Content →" button.

#### Step 2: Content Composition

**Layout**: Two-column — compose form (left, ~65%) and live preview panel (right, ~35%).

**Compose Form Fields**:

| Field | Type | Validation | Notes |
|-------|------|------------|-------|
| Campaign Name | Text input | Required, max 80 chars | Internal reference only, not shown to recipients |
| Subject Line | Text input | Required, max 120 chars | Character counter with color coding (green < 60, amber 60-90, red > 90). Supports merge tags: `{{firstName}}`, `{{styleName}}` |
| Preview Text | Text input | Optional, max 150 chars | Shown in inbox beneath subject line |
| Greeting | Text input | Pre-filled with `Good morning, {{firstName}} —` | Supports time-of-day dynamic: morning/afternoon/evening |
| Headline | Text input | Required for templates with headline block | Renders in Georgia 28px in email |
| Body Copy | Rich textarea | Required, min 20 chars | Markdown supported. Toolbar: bold, italic, link, merge tag dropdown. No HTML editing. |
| CTA Button Text | Text input | Required if template has CTA block | Max 40 chars |
| CTA URL | URL input | Required if CTA text present | Must be valid URL. Auto-appends UTM params (see §9). |
| Product Selection | Product picker | Optional, depends on template | For product-centric templates (price drop, new arrival). Searches product catalog, shows image + name + price. |
| Maker Selection | Maker picker | Optional, depends on template | For maker spotlight templates. Searches maker directory, shows portrait + name + provenance line. |

**A/B Subject Line Testing**:
- "Generate A/B variant" link below subject line field
- Opens inline panel with Variant B subject line input
- Split percentage selector: 50/50 (default), 70/30, 80/20
- Winner criteria: open rate after 2 hours, then sends winning variant to remainder
- Winner audience percentage: configurable (e.g., send to 20% as A/B test, winner to remaining 80%)

**Merge Tag Reference**:
Dropdown above body copy field listing available merge tags:
- `{{firstName}}` — Recipient first name
- `{{styleName}}` — Primary style profile name (e.g., "Mid-Century Warm")
- `{{city}}` — Recipient city
- `{{foundingCircleNumber}}` — Founding Circle member number (if applicable)
- `{{designerName}}` — Assigned designer name (if applicable)

**Live Preview Panel**:
- Renders the selected template with current form content in real-time
- Scale: 85% of actual email width to fit panel
- Toggle buttons below preview: 📱 Mobile | 🖥 Desktop | 📨 Send Test
- "Send Test" opens modal: email input pre-filled with logged-in user's address, sends via Resend test mode
- Preview updates on every field blur or after 500ms of typing inactivity (debounced)

**Auto-Save**: Draft saves to `campaigns` table every 30 seconds when form is dirty. Visual indicator: "Draft saved" with timestamp, fades after 3 seconds.

#### Step 3: Audience Selection

**Layout**: Two-column — segment builder (left, ~65%) and audience preview panel (right, ~35%).

**Quick Segments** (top of left column):
Row of pre-built segment buttons: All Consumers, All Designers, All Manufacturers, Founding Circle, Active (7d), Active (30d). Clicking a quick segment loads its rules into the builder below.

**Segment Builder**:
Visual rule composer with stackable rows. Each row contains:
- Field selector dropdown (User Role, Style Profile, Engagement Level, Geography, Founding Circle Status, Last Active, Product Interactions, Purchase History, Email Engagement Tier, Signup Date)
- Operator dropdown (is, is not, is any of, is none of, contains, greater than, less than, within last, before)
- Value input (dropdown for enums, text for freeform, date picker for dates)
- Remove button (X icon, right-aligned)

Between rows: AND/OR connector toggle (defaults to AND).

"+ Add Rule" button below last row (dashed border, full width).

**Load Saved Segment**: Button opens dropdown of previously saved segments. Selecting one populates the builder with its rules.

**Save Segment**: Button opens inline name input. Saving persists the segment rules to `audience_segments` table for reuse across campaigns.

**Audience Preview Panel** (right column):
- Large number: estimated recipient count (queries against user database with current rules, debounced 1 second after rule change)
- Progress bar: recipients as percentage of total user base
- Breakdown table: recipients by role (Consumer, Designer, Manufacturer), by Founding Circle status, minus opted-out count
- "Preview Recipients" link: opens modal with paginated list of matching users (name, email, role, style profile) — max 100 shown
- Warning banner if audience < 10: "Very small audience — consider broadening your criteria"
- Warning banner if audience includes users with unverified emails: "{n} recipients have unverified email addresses and will be excluded"

#### Step 4: Preview & Test

**Layout**: Centered email preview at actual 600px width, with action bar above.

**Preview Rendering**: Server-side renders the React Email template with actual content from Step 2, using a sample recipient's data for merge tags (defaults to logged-in user, or selectable from audience).

**Device Toggle**: Tab-style switcher for Desktop (600px centered), Mobile (375px container), and Plain Text (stripped HTML fallback).

**Inbox Preview**: Above the full preview, a simulated inbox row showing: sender name ("Patina"), subject line, and preview text as they'd appear in Gmail/Apple Mail.

**Pre-Send Checklist** (auto-validated):
- ✓ Subject line present and under 90 characters
- ✓ Preview text present
- ✓ Body content present (min 20 characters)
- ✓ CTA URL is valid and accessible (HTTP HEAD check)
- ✓ Unsubscribe link present in footer (enforced by base template)
- ✓ Physical address present in footer (enforced by base template)
- ✓ Audience selected with > 0 recipients
- ✓ No broken merge tags (all `{{tags}}` resolve)
- ⚠ Image alt text present (warning, not blocking)

**Actions**:
- "← Back to Audience" — returns to Step 3
- "Send Test Email" — sends to logged-in user's address
- "Next: Schedule →" — advances to Step 5

#### Step 5: Schedule & Confirm

**Layout**: Centered card with scheduling options and final confirmation.

**Scheduling Options**:
- "Send Now" — immediate dispatch after confirmation
- "Schedule for Later" — date picker + time picker + timezone selector (defaults to CT)
- "Optimal Send Time" (future, Sprint 5+) — uses PostHog engagement data to determine best time per recipient

**Campaign Summary Card**:
- Campaign name
- Template used
- Subject line (with A/B variant if applicable)
- Audience: segment name and recipient count
- Estimated send time
- Sender: from name and email address

**Confirmation Actions**:
- "← Back to Preview"
- "Save as Draft" — saves campaign with `draft` status, returns to campaign list
- "Schedule Campaign" / "Send Campaign" — primary CTA (Clay background, bold)
  - Clicking triggers confirmation modal: "Send to {n} recipients {now / at time}? This action cannot be undone."
  - Confirm: creates campaign send job, updates status to `scheduled` or `sending`
  - Cancel: returns to schedule screen

---

### 6.3 Campaign List (`/admin/comms/campaigns`)

**Layout**: Full-width table with filter tabs and action bar.

**Filter Tabs**: All | Draft | Scheduled | Sending | Sent | Archived

**Table Columns**:

| Column | Content | Sort |
|--------|---------|------|
| Campaign Name | Text, clickable to detail view | Alpha |
| Status | Badge (Draft, Scheduled, Sending, Sent, Archived) | — |
| Template | Template name tag | — |
| Audience | Segment name + recipient count | Numeric |
| Sent / Scheduled | Date + time | Date (default desc) |
| Open Rate | Percentage (only for Sent) | Numeric |
| Click Rate | Percentage (only for Sent) | Numeric |
| Actions | ⋮ menu: Edit, Duplicate, Archive, Delete | — |

**Empty State** (no campaigns yet): Illustration + "Your first campaign is waiting. [Create one →]"

**Search**: Text input above table, searches campaign name and subject line.

---

### 6.4 Template Studio (`/admin/comms/templates`)

**Layout**: Grid of template cards (4 columns desktop) with filter tabs.

**Filter Tabs**: All Templates | Transactional | Engagement | Campaign | Sequences

**Template Card**:
- Header preview (120px, shows template's header/content skeleton against Mocha background)
- Template name (13px, bold)
- Description (11px, muted)
- Category + audience tags
- Footer: last edited date, "used in X campaigns" count

**Card Actions** (on hover): Edit, Duplicate, Preview, Delete (super_admin only)

**Template Editor** (`/admin/comms/templates/:id`):

Two-column layout: content block editor (left) + live email preview (right).

The template editor operates on content blocks, not raw HTML. Blocks are the modular sections defined in the base email template:

| Block Type | Description | Fields |
|------------|-------------|--------|
| Hero | Greeting + headline + body | greeting_template, headline_placeholder, body_placeholder |
| Product Card (Full) | Single product feature | product_picker, description_placeholder, show_price, show_match_score |
| Product Grid (2-col) | Two products side by side | product_picker ×2, show_provenance |
| Notification | Alert-style detail card | badge_label, headline, body, detail_fields[] |
| Maker Spotlight | Portrait + narrative | maker_picker, story_placeholder, link_text |
| CTA Button | Primary action button | button_text, button_url, subtext |
| Divider | Horizontal line | style (subtle, gold accent) |
| Text Block | Free-form body text | body_content (markdown) |

Block ordering via drag-and-drop. Add block button between existing blocks.

Base layout (header + footer) is not editable per-template — it's inherited from the BaseEmailLayout component and managed separately under Templates > Base Layouts.

**Template Metadata Panel** (collapsible right sidebar):
- Template name
- Description
- Category (Transactional, Engagement, Campaign, Sequence)
- Target audience (Consumer, Designer, Manufacturer, All)
- Tags (freeform)
- Created / last modified dates

---

### 6.5 Audience Manager (`/admin/comms/audiences`)

**Layout**: Table of saved segments with action bar.

**Table Columns**:

| Column | Content |
|--------|---------|
| Segment Name | Text, clickable to detail |
| Rules Summary | Human-readable rule preview (e.g., "Consumers + MCM style + Active 30d + Midwest") |
| Est. Size | Current recipient count (refreshed on page load) |
| Used In | Count of campaigns + automations referencing this segment |
| Created | Date |
| Actions | Edit, Duplicate, Delete |

**Preset Segments** (system-created, not deletable):
- All Consumers
- All Designers  
- All Manufacturers
- Founding Circle Members
- Highly Engaged (email_engagement_tier = 'highly_engaged')
- At Risk (email_engagement_tier = 'dormant')

**Suppression Lists** (sub-section):
- Global suppression: users who have unsubscribed from all marketing
- Hard bounces: automatically suppressed by Resend webhook handler
- Manual suppression: admin-added email addresses
- Import: CSV upload for external suppression lists

---

### 6.6 Automation Sequences (`/admin/comms/automations`)

**Layout**: Card grid of automation sequences, each showing flow preview.

**Sequence Card**:
- Sequence name (bold)
- Status badge (Active, Paused, Draft)
- Trigger description (e.g., "Account Created")
- Step count (e.g., "3 emails, 1 condition")
- Users in sequence / completion rate
- Last triggered date

**Sequence Detail View** (`/admin/comms/automations/:id`):

**Layout**: Horizontal flow diagram (left) + performance sidebar (right).

**Flow Diagram**:
Vertical flow of connected nodes:

| Node Type | Visual | Config |
|-----------|--------|--------|
| Trigger | Dark background, bolt icon | Event type, filter conditions |
| Email Step | Card with left-side color bar (green = healthy, amber = underperforming, red = problem) | Template selection, subject override, send delay |
| Wait | Connector with duration label | Duration (hours, days), "until specific time" option |
| Condition | Dashed border, branch icon | Condition type (user property, event occurred, time elapsed), Yes/No branches |
| End | Small dark terminal node | — |

Each email node shows inline metrics: Sent count, Open rate, Click rate.

Nodes are editable inline (click to expand config panel) and drag-reorderable.

**Performance Sidebar** (right, 280px):
- Total entries: users who entered the sequence
- Active: users currently in-progress
- Completed: users who reached the end
- Dropped: users who exited early (condition branch, unsubscribe, suppression)
- Completion rate: completed / total entries
- Average time to complete
- Revenue attributed (PostHog funnel)

**Sequence Builder** (`/admin/comms/automations/new`):
Same flow diagram interface in edit mode. Start with trigger selection, add steps via "+" buttons between nodes. Templates are selected from the template library. Conditions reference user properties and events from PostHog.

---

### 6.7 Analytics Dashboard (`/admin/comms/analytics`)

**Layout**: Full-width with tab sub-navigation.

**Sub-Tabs**: Overview | Campaign Comparison | Revenue Attribution | Engagement Cohorts | Delivery Health

#### Overview Tab
- Time-series line chart: Open rate and Click rate over time (30-day default)
- Stat cards: Total sent, Avg open rate, Avg click rate, Unsubscribe rate, Revenue attributed
- Top 5 campaigns by open rate (table)
- Top 5 campaigns by revenue attribution (table)

#### Campaign Comparison Tab
- Multi-select dropdown to choose 2-5 campaigns
- Side-by-side bar charts: open rate, click rate, unsubscribe rate, revenue
- Table with all metrics for selected campaigns

#### Revenue Attribution Tab
- Funnel visualization (PostHog embed or custom):
  - Email Sent → Opened → Clicked → App Visit (within 7d) → Purchase (within 7d)
- Revenue total attributed to email channel
- Breakdowns by: campaign type, audience segment, template, time period
- Average revenue per email sent, per click

#### Engagement Cohorts Tab
- Pie chart: user distribution across engagement tiers (Highly Engaged, Engaged, Passive, Dormant)
- Trend line: tier migration over time (are users becoming more or less engaged?)
- Table: tier definitions with current counts and 30-day change

#### Delivery Health Tab
- Delivery rate over time (line chart)
- Bounce rate by type (hard vs soft)
- Complaint rate
- Suppression list growth
- Domain reputation indicators (if available from Resend)
- Queue depth over time (for monitoring async processing)

---

## 7. User Flows

### Flow 1: Leah Sends a Founding Circle Update

```
1. Leah clicks "Communications" in Admin Portal sidebar
2. Command Center loads → she sees recent activity and stats
3. Clicks "+ New Campaign" button
4. STEP 1 — Template: Selects "Founding Circle Update" template from grid
5. Clicks "Next →"
6. STEP 2 — Content:
   a. Enters subject: "Building in public: what we learned from our first 100 scans"
   b. Writes body copy about recent learnings, embeds a product story
   c. Live preview updates in real-time on the right
   d. Clicks "Send Test" → receives test email on her phone → confirms it looks right
7. Clicks "Next →"
8. STEP 3 — Audience:
   a. Clicks "Founding Circle" quick segment button
   b. Preview panel shows 112 recipients
   c. Optionally adds rule: "Engagement > was active within > Last 30 days"
   d. Count updates to 98
9. Clicks "Next →"
10. STEP 4 — Preview:
    a. Reviews full email render at desktop + mobile sizes
    b. Pre-send checklist shows all green checks
11. Clicks "Next →"
12. STEP 5 — Schedule:
    a. Selects "Send Now"
    b. Reviews summary card
    c. Clicks "Send Campaign" → confirmation modal → "Yes, send to 98 recipients"
13. Campaign status changes to "Sending"
14. Redirects to campaign report page (updates live as opens/clicks come in)
15. TOTAL TIME: ~10 minutes
```

### Flow 2: Kody Investigates a Delivery Issue

```
1. Kody opens Admin Portal → Communications → Command Center
2. Alert banner: "Delivery health at 96.2%. 14 bounces in last 24h."
3. Clicks "View details →"
4. Navigates to Analytics → Delivery Health tab
5. Sees bounce spike on chart corresponding to yesterday's weekly inspiration send
6. Drills into the campaign report for "Weekly Inspiration — March 1"
7. Sees bounce breakdown: 12 hard bounces (invalid addresses), 2 soft bounces (full inbox)
8. Notes the hard bounces are all from a recent CSV import
9. Navigates to Audiences → Suppression Lists
10. Confirms hard bounces were auto-suppressed by Resend webhook handler
11. Creates a note in the campaign report: "Bounces from batch import 2/28. Auto-suppressed."
12. Delivery health returns to normal on next send
```

### Flow 3: Building a New Automation Sequence

```
1. Navigate to Communications → Automations → Create New
2. Name the sequence: "Post-Consultation Follow-Up"
3. Select trigger: "Event: consultation_completed"
4. Add first email step:
   a. Select template: "Post-Consultation Thank You"
   b. Configure delay: "Send immediately"
5. Add wait step: "Wait 3 days"
6. Add condition: "Has user scheduled a follow-up? (event: followup_scheduled)"
   a. YES path → End sequence (they're engaged)
   b. NO path → Continue
7. Add email step on NO path:
   a. Select template: "Gentle Nudge — Schedule Follow-Up"
   b. Configure delay: "Send immediately"
8. Add end node
9. Click "Save as Draft"
10. Review flow diagram and metrics placeholders
11. Click "Activate" → sequence starts processing for new consultation events
```

### Flow 4: Quick Compose (Simplified Path)

For situations where Leah wants to send a simple update without the full wizard:

```
1. Command Center → "Quick Send" button (secondary action in topbar)
2. Opens simplified single-page form:
   a. Subject line
   b. Body text (markdown, rendered in Patina base template)
   c. Audience dropdown (saved segments only)
   d. Preview toggle
   e. "Send Now" or "Schedule" buttons
3. No template selection — uses default "Simple Message" template
4. No A/B testing, no product picker, no maker picker
5. Time to send: < 3 minutes
```

---

## 8. Data Models

### campaigns

```sql
CREATE TABLE campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
    -- ENUM: 'draft', 'scheduled', 'sending', 'sent', 'cancelled', 'archived'
  template_id     UUID REFERENCES email_templates(id),
  subject_line    TEXT,
  subject_line_b  TEXT,                    -- A/B variant
  ab_split        NUMERIC(3,2),            -- e.g., 0.50 for 50/50
  ab_winner       TEXT,                    -- 'a', 'b', or NULL
  preview_text    TEXT,
  content_json    JSONB NOT NULL DEFAULT '{}',
    -- {greeting, headline, body, cta_text, cta_url, product_ids[], maker_id, custom_blocks[]}
  audience_segment_id UUID REFERENCES audience_segments(id),
  audience_snapshot   JSONB,               -- frozen recipient list at send time
  recipient_count     INTEGER,
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  send_completed_at TIMESTAMPTZ,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  -- PostHog correlation
  posthog_cohort_id TEXT,

  -- Performance (updated by webhook handler)
  emails_delivered  INTEGER DEFAULT 0,
  emails_opened     INTEGER DEFAULT 0,
  emails_clicked    INTEGER DEFAULT 0,
  emails_bounced    INTEGER DEFAULT 0,
  emails_complained INTEGER DEFAULT 0,
  emails_unsubscribed INTEGER DEFAULT 0
);

CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_created_by ON campaigns(created_by);
CREATE INDEX idx_campaigns_scheduled ON campaigns(scheduled_at) WHERE status = 'scheduled';
```

### email_templates

```sql
CREATE TABLE email_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL,
    -- ENUM: 'transactional', 'engagement', 'campaign', 'sequence'
  target_audience TEXT[] DEFAULT '{}',
    -- ARRAY of: 'consumer', 'designer', 'manufacturer'
  tags            TEXT[] DEFAULT '{}',
  content_blocks  JSONB NOT NULL DEFAULT '[]',
    -- Array of {type, order, config} defining the template's block structure
  base_layout_id  UUID REFERENCES base_layouts(id),
  thumbnail_url   TEXT,
  is_system        BOOLEAN DEFAULT false,  -- system templates can't be deleted
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  used_count      INTEGER DEFAULT 0
);
```

### audience_segments

```sql
CREATE TABLE audience_segments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  rules_json      JSONB NOT NULL,
    -- {operator: 'AND'|'OR', conditions: [{field, operator, value}]}
  is_preset       BOOLEAN DEFAULT false,   -- system presets can't be deleted
  estimated_size  INTEGER,
  last_calculated TIMESTAMPTZ,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### automation_sequences

```sql
CREATE TABLE automation_sequences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
    -- ENUM: 'draft', 'active', 'paused', 'archived'
  trigger_config  JSONB NOT NULL,
    -- {event_type, filter_conditions[]}
  steps_json      JSONB NOT NULL DEFAULT '[]',
    -- Array of {type, order, config, template_id, delay, condition}
  
  -- Performance counters
  total_entries   INTEGER DEFAULT 0,
  active_users    INTEGER DEFAULT 0,
  completed       INTEGER DEFAULT 0,
  dropped         INTEGER DEFAULT 0,

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE automation_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id     UUID REFERENCES automation_sequences(id),
  user_id         UUID REFERENCES auth.users(id),
  current_step    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active',
    -- ENUM: 'active', 'completed', 'dropped', 'paused'
  entered_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  next_step_at    TIMESTAMPTZ,
  step_history    JSONB DEFAULT '[]',
    -- Array of {step_index, sent_at, opened, clicked}

  UNIQUE(sequence_id, user_id)
);
```

---

## 9. PostHog Analytics Integration

### Event Pipeline

Email events flow from Resend → webhook handler → PostHog via server-side `posthog.capture()`. Every email event becomes a PostHog event tied to the recipient's `distinct_id`.

### Events Emitted

| PostHog Event | Trigger | Properties |
|---------------|---------|------------|
| `email_sent` | Resend `email.delivered` webhook | `campaign_id`, `template_id`, `notification_type`, `audience_segment`, `subject_line` |
| `email_opened` | Resend `email.opened` webhook | Same as above + `time_to_open_seconds`, `device_type` |
| `email_clicked` | Resend `email.clicked` webhook | Same as above + `link_url`, `link_text`, `link_position` |
| `email_bounced` | Resend `email.bounced` webhook | Same as above + `bounce_type` (hard/soft), `error_message` |
| `email_unsubscribed` | Resend `email.complained` or unsubscribe link click | Same as above + `unsubscribe_type` (this_type, all_marketing) |

### User Properties Updated

| PostHog User Property | Computation | Update Frequency |
|----------------------|-------------|-----------------|
| `email_engagement_tier` | Based on open rate over last 30 days: `highly_engaged` (>80%), `engaged` (40-80%), `passive` (10-40%), `dormant` (<10% or no open in 30d) | Nightly via pg_cron |
| `last_email_opened_at` | Timestamp of most recent open | Real-time on webhook |
| `total_emails_received` | Cumulative count | Real-time on send |
| `email_preferred_send_hour` | Mode of open times (hour bucket) | Weekly via pg_cron |

### UTM Parameter Auto-Tagging

Every CTA URL in every email is auto-tagged with UTM parameters before send:

```
utm_source=patina_email
utm_medium=email
utm_campaign={campaign_slug}
utm_content={cta_position}  // e.g., "hero_cta", "product_card_1"
```

PostHog ingests these via the standard `$current_url` property on page views, enabling end-to-end attribution.

### Attribution Funnel

The primary attribution funnel in PostHog:

```
email_sent  →  email_opened  →  email_clicked  →  page_viewed (utm_source=patina_email)  →  purchase_completed
```

Attribution window: 7 days from click to purchase. Multi-touch: last-click model for v1, configurable in v2.

### Pre-Built PostHog Dashboards

The implementation creates these dashboards automatically:

1. **Email Performance Overview** — send volume, open/click trends, top campaigns
2. **Email → Purchase Attribution** — funnel from send to revenue
3. **User Engagement Cohorts** — tier distribution and migration
4. **Campaign A/B Test Results** — subject line variant performance
5. **Delivery Health Alerts** — bounce/complaint monitoring with thresholds

---

## 10. Template System

### Architecture

Templates are React Email components stored as structured `content_blocks` JSON in the database and rendered server-side at send time. The Template Studio provides a visual block editor that produces this JSON; the rendering pipeline consumes it.

```
Template Studio (admin UI)
    ↓ writes content_blocks JSON
email_templates table
    ↓ read by
@patina/email package (React Email renderer)
    ↓ produces
HTML string → Resend API
```

### Base Layout

All templates inherit from `BaseEmailLayout`, which provides:
- Outer wrapper (full-width Off-White background)
- 600px centered container with Warm White background and subtle shadow
- Patina header (solid Mocha Brown, Strata Mark, wordmark, tagline)
- Patina footer (Charcoal background, navigation links, preference center links, compliance text)

The base layout is not configurable per-template. Changes to the header or footer propagate to all emails automatically.

### Content Block Types

See §6.4 for the complete block type reference.

### Template Inheritance Model

```
BaseEmailLayout (non-editable per template)
  └── Template (defines which blocks appear and in what order)
        └── Campaign (fills in the block content for a specific send)
```

---

## 11. Audience Segmentation Engine

### Available Segment Fields

| Field | Source | Operators |
|-------|--------|-----------|
| User Role | `users.role` | is, is not, is any of |
| Style Profile (Primary) | `style_profiles.primary_style` | is, is not, is any of |
| Style Profile (Affinity Score) | `style_profiles.affinities` | greater than, less than |
| Engagement Level | PostHog `email_engagement_tier` | is, is not |
| Geography (State) | `users.state` | is, is any of, is none of |
| Geography (City) | `users.city` | is, is any of |
| Founding Circle Status | `users.is_founding_circle` | is true, is false |
| Last Active | `users.last_active_at` | within last N days, before date |
| Signup Date | `users.created_at` | after date, before date, between dates |
| Product Interactions | `product_interactions.product_id` | has interacted with, has saved, has purchased |
| Purchase History | `orders` aggregate | has purchased, purchase count >, total spend > |
| Email Engagement Tier | PostHog property | is, is not |
| Has Completed Style Quiz | `style_profiles.quiz_completed` | is true, is false |
| Designer Assignment | `designer_assignments` | has designer, no designer |
| Room Scan Count | `room_scans` aggregate | greater than, less than, equals |

### Query Execution

Segment rules compile to a Supabase query at preview time and again at send time. The send-time query is frozen as `audience_snapshot` JSON on the campaign record to ensure the recipient list is deterministic (no users added or removed between schedule and send).

### Suppression Application

Before any send, the recipient list is filtered against:
1. Global unsubscribe list (users who opted out of all marketing)
2. Type-specific unsubscribe list (users who opted out of this notification type)
3. Hard bounce suppression list (Resend-sourced)
4. Manual suppression list (admin-added)
5. Frequency cap: no user receives more than 3 marketing emails per 7-day window

---

## 12. Automation Sequences

### Trigger Types

| Trigger | Event Source | Example |
|---------|-------------|---------|
| Account Created | Supabase Auth `user.created` | Welcome series |
| Style Quiz Completed | App event | Style journey follow-up |
| Room Scan Completed | App event | Post-scan engagement |
| Consultation Requested | Designer Portal event | Pre-consultation prep |
| Consultation Completed | Designer Portal event | Post-consultation follow-up |
| Purchase Completed | Stripe webhook | Post-purchase care |
| No Activity (N days) | pg_cron scheduled check | Re-engagement |
| Abandoned Scan | App event + time threshold | Abandoned scan recovery |
| Founding Circle Joined | User event | Founding Circle onboarding |

### Condition Types

| Condition | Description |
|-----------|-------------|
| User Property Check | e.g., "Has completed style quiz?" "Is Founding Circle member?" |
| Event Occurred | e.g., "Has user logged in since last email?" |
| Time Elapsed | e.g., "More than 7 days since trigger?" |
| Engagement Check | e.g., "Did user open the previous email in this sequence?" |

### Pre-Built Sequences (Shipped with v1)

1. **Consumer Welcome Series** (3 emails, 10 days): Welcome + verify → Style journey intro (day 3) → Discover your style quiz nudge (day 7, conditional on quiz completion)
2. **Designer Onboarding** (4 emails, 14 days): Welcome + portal tour → First lead setup guide (day 2) → Teaching interface intro (day 5) → Check-in + support offer (day 14)
3. **Post-Purchase** (2 emails, 14 days): Order confirmation (immediate, transactional) → Care guide + review request (day 14)
4. **Re-Engagement** (3 emails, 21 days): "We miss you" with new arrivals (day 0) → Curated picks based on style (day 7, conditional on no activity) → Final nudge with value prop (day 21, conditional on no activity)

---

## 13. Sender Configuration & Compliance

### Sender Domains

| Domain | Purpose | Type |
|--------|---------|------|
| `notify.patina.design` | Transactional emails (verification, password reset, order confirmation) | Dedicated IP, highest reputation priority |
| `mail.patina.design` | Marketing emails (campaigns, digests, spotlights) | Shared/dedicated based on volume |

Both domains require DKIM, SPF, and DMARC configuration in DNS. Verified through Resend's domain verification flow.

### Compliance Configuration (Settings Screen)

| Setting | Description | Default |
|---------|-------------|---------|
| Company Name | Shown in email footer | "Patina" |
| Physical Address | CAN-SPAM required | Milwaukee, Wisconsin, US |
| From Name (Transactional) | Sender display name | "Patina" |
| From Name (Marketing) | Sender display name | "Patina" |
| Reply-To Address | Where replies go | hello@patina.design |
| Unsubscribe Processing Time | CAN-SPAM max 10 days | Immediate |
| GDPR Mode | Explicit opt-in for EU users | Enabled |
| Frequency Cap | Max marketing emails per user per 7 days | 3 |
| Quiet Hours | No marketing sends during these hours | 10 PM – 7 AM recipient local time |

### CAN-SPAM Enforcement

The base email template enforces CAN-SPAM compliance by construction:
- Physical address in every footer (not removable)
- Unsubscribe link in every footer (not removable)
- From address matches verified sender domain (enforced at API layer)
- Subject lines cannot be deceptive (no automated check, admin responsibility)

### GDPR Provisions

- EU users (detected by geography) require explicit opt-in before receiving marketing email
- Right to erasure: deleting a user account purges all email preference data and removes them from all audience segments
- Data portability: notification_log data exportable as CSV from Analytics > Export

---

## 14. API Specifications

### Internal API Endpoints

All endpoints are Next.js API routes under `/api/admin/comms/`, protected by `comms_admin` middleware.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/admin/comms/dashboard` | Command Center stats + recent activity |
| GET | `/api/admin/comms/campaigns` | List campaigns with filters |
| POST | `/api/admin/comms/campaigns` | Create new campaign (draft) |
| PATCH | `/api/admin/comms/campaigns/:id` | Update campaign content |
| POST | `/api/admin/comms/campaigns/:id/send` | Trigger campaign send |
| POST | `/api/admin/comms/campaigns/:id/schedule` | Schedule campaign |
| POST | `/api/admin/comms/campaigns/:id/test` | Send test email |
| GET | `/api/admin/comms/campaigns/:id/report` | Campaign performance report |
| GET | `/api/admin/comms/templates` | List templates |
| POST | `/api/admin/comms/templates` | Create template |
| PATCH | `/api/admin/comms/templates/:id` | Update template |
| DELETE | `/api/admin/comms/templates/:id` | Delete template (super_admin) |
| POST | `/api/admin/comms/templates/:id/preview` | Render template preview |
| GET | `/api/admin/comms/audiences` | List saved segments |
| POST | `/api/admin/comms/audiences` | Create segment |
| PATCH | `/api/admin/comms/audiences/:id` | Update segment |
| POST | `/api/admin/comms/audiences/estimate` | Calculate recipient count for rule set |
| POST | `/api/admin/comms/audiences/:id/preview` | Preview matching users |
| GET | `/api/admin/comms/automations` | List automation sequences |
| POST | `/api/admin/comms/automations` | Create sequence |
| PATCH | `/api/admin/comms/automations/:id` | Update sequence |
| POST | `/api/admin/comms/automations/:id/activate` | Activate sequence |
| POST | `/api/admin/comms/automations/:id/pause` | Pause sequence |
| GET | `/api/admin/comms/analytics/:view` | Analytics data by view type |

### Resend Webhook Handler

Existing endpoint from Email & Notification System PRD: `/api/webhooks/resend`

Extended to emit PostHog events alongside updating `notification_log`:

```typescript
// Pseudocode for extended webhook handler
async function handleResendWebhook(event: ResendWebhookEvent) {
  // 1. Update notification_log (existing behavior)
  await updateNotificationLog(event);

  // 2. Emit PostHog event (new behavior)
  await posthog.capture({
    distinctId: event.recipientUserId,
    event: mapResendEventToPostHog(event.type),
    properties: {
      campaign_id: event.tags.campaign_id,
      template_id: event.tags.template_id,
      notification_type: event.tags.notification_type,
      audience_segment: event.tags.audience_segment,
      ...eventSpecificProperties(event),
    },
  });

  // 3. Update campaign counters (new behavior)
  if (event.tags.campaign_id) {
    await incrementCampaignCounter(event.tags.campaign_id, event.type);
  }
}
```

---

## 15. Technical Architecture

### Package Structure (Monorepo)

```
packages/
├── @patina/notifications       ← existing (from Email PRD)
│   ├── notify()                  dispatch function
│   ├── preference checker        user opt-out enforcement
│   └── queue manager             async processing
│
├── @patina/email               ← existing (from Email PRD)
│   ├── BaseEmailLayout           shared header/footer
│   ├── templates/                React Email components
│   └── renderer                  server-side HTML generation
│
├── @patina/email-campaigns     ← NEW
│   ├── campaign-sender           orchestrates batch send via Resend
│   ├── audience-resolver         compiles segment rules to recipient list
│   ├── ab-test-manager           manages A/B variant splitting + winner selection
│   ├── scheduler                 pg_cron job definitions for scheduled sends
│   └── automation-engine         processes automation enrollments + step advancement
│
apps/
├── admin-portal/
│   └── app/admin/comms/        ← NEW route group
│       ├── page.tsx              Command Center
│       ├── campaigns/            Campaign routes
│       ├── automations/          Automation routes
│       ├── templates/            Template routes
│       ├── audiences/            Audience routes
│       └── analytics/            Analytics routes
```

### Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Admin UI | Next.js 15 + React | Existing portal stack |
| UI Components | Custom design system (existing) + Recharts for charts | Consistency with Admin Portal |
| State Management | React Query (TanStack Query) | Server state caching + optimistic updates for auto-save |
| Email Rendering | React Email | Type-safe, component-based templates in monorepo |
| Email Delivery | Resend | Already integrated, excellent DX |
| Analytics Pipeline | PostHog (server-side SDK) | Unified with existing product analytics |
| Database | Supabase PostgreSQL | Existing infrastructure |
| Queue | Supabase Edge Functions + pg_notify | Existing pattern from Email PRD |
| Scheduling | pg_cron | No additional infrastructure |
| Template Preview | React Email `render()` on API route | Server-side rendering for accurate preview |
| A/B Testing | Custom logic in `@patina/email-campaigns` | Simple winner selection, no third-party dependency |

### Database Migrations

Sprint 1 migrations:
1. Create `email_templates` table
2. Create `audience_segments` table with preset seed data
3. Create `campaigns` table
4. Create `automation_sequences` table
5. Create `automation_enrollments` table
6. Add PostHog-related columns to `notification_log` (existing table)
7. Create RLS policies for all new tables

---

## 16. Implementation Roadmap

### Sprint 1-2: Foundation (Weeks 1-4)

**Goal**: Command Center live with real data. Template library seeded. Campaign list functional.

| Deliverable | Acceptance Criteria |
|-------------|-------------------|
| Admin sidebar integration | Communications section visible for admin roles, hidden for all others |
| Command Center dashboard | Displays real stats from `notification_log`. Chart renders send volume. Activity feed shows last 10 events. |
| Template Studio (read-only) | Grid view of seeded templates with previews. Template detail view with block listing. |
| Campaign list (read-only) | Table displays campaigns from database. Filter tabs work. Status badges render correctly. |
| Database migrations | All new tables created with RLS policies. Preset segments seeded. |
| PostHog event pipeline | Resend webhook handler emits PostHog events. Events visible in PostHog. |

### Sprint 3-4: Compose & Target (Weeks 5-8)

**Goal**: Leah can create and send a campaign end-to-end without developer assistance.

| Deliverable | Acceptance Criteria |
|-------------|-------------------|
| Campaign builder wizard (all 5 steps) | Template selection → content composition → audience selection → preview → schedule/send. Full flow functional. |
| Live email preview | Preview updates within 500ms of content change. Mobile/desktop toggle works. Send test delivers to inbox. |
| Audience builder | Visual rule composer with real-time recipient count. Save/load segments. Suppression filtering applied. |
| Template editor (write) | Block editor with drag-and-drop reordering. New block types addable. Template metadata editable. |
| Campaign send pipeline | Batch send via Resend API. Campaign counters update from webhooks. Status lifecycle: draft → scheduled → sending → sent. |
| A/B subject line testing | Variant B input, split configuration, winner auto-selection after 2 hours. |
| Quick Compose shortcut | Simplified single-page form for fast sends. |
| First real campaign | Founding Circle update sent through the system. |

### Sprint 5-6: Automate & Analyze (Weeks 9-12)

**Goal**: Lifecycle automations running. Analytics dashboards live with attribution data.

| Deliverable | Acceptance Criteria |
|-------------|-------------------|
| Automation sequence builder | Visual flow editor with trigger, email, wait, and condition nodes. Save/activate/pause lifecycle. |
| Automation engine | pg_cron job processes enrollments, advances steps, respects wait times and conditions. |
| Welcome series live | 3-email consumer welcome sequence active and processing new signups. |
| Analytics overview | Time-series charts, stat cards, top campaigns tables. Data sourced from PostHog API + campaign counters. |
| Revenue attribution funnel | PostHog funnel embedded or reconstructed. 7-day attribution window. Revenue total displayed. |
| Engagement cohorts | Tier distribution pie chart. Nightly computation of `email_engagement_tier`. |
| Delivery health dashboard | Bounce/complaint monitoring with alert thresholds. |
| Campaign comparison | Multi-select comparison view with side-by-side metrics. |

### Sprint 7+: Optimize (Month 4+)

| Feature | Description |
|---------|-------------|
| Send-time optimization | Use PostHog `email_preferred_send_hour` to stagger sends per-recipient |
| Predictive engagement scoring | ML model predicts which users are likely to engage with a campaign |
| Advanced A/B testing | Body content variants, CTA variants, send time variants |
| Template block marketplace | Reusable content blocks shared across templates |
| Campaign duplication + scheduling recurrence | "Send this every Tuesday" |
| Export + reporting | PDF campaign reports, CSV data exports |
| Push notification channel | Extend automation sequences to include push via APNs |

---

## 17. Success Metrics

### Operational Metrics (Measured Weekly)

| Metric | Target | Data Source |
|--------|--------|-------------|
| Campaigns sent per week | ≥ 2 | `campaigns` table |
| Average time from draft to send | < 15 min | Timestamp delta |
| Template reuse rate | > 80% of campaigns use existing templates | Template `used_count` |
| Automation sequence completion rate | > 60% | `automation_enrollments` |
| Admin session duration in Communications module | < 30 min average | PostHog session tracking |

### Engagement Metrics (Measured Monthly)

| Metric | Target | Data Source |
|--------|--------|-------------|
| Marketing email open rate | > 35% | Resend + PostHog |
| Marketing email click rate | > 5% | Resend + PostHog |
| Unsubscribe rate per campaign | < 0.5% | Resend webhook |
| Founding Circle email open rate | > 60% | Resend + PostHog |
| Engagement tier: "Highly Engaged" percentage | > 25% of active users | PostHog user property |

### Business Metrics (Measured Monthly)

| Metric | Target | Data Source |
|--------|--------|-------------|
| Revenue attributed to email (7-day window) | Trackable by Sprint 6 | PostHog attribution funnel |
| Designer lead response rate from email alerts | < 2 hours average | `notification_log` + designer portal |
| Cost per email sent | < $0.001 | Resend billing / send volume |
| Email channel contribution to total revenue | > 10% by Month 6 | PostHog |

---

## 18. Open Questions

| # | Question | Decision Needed By | Stakeholder |
|---|----------|-------------------|-------------|
| 1 | **Quick Compose mode**: Should Leah have a simplified single-page compose path separate from the full wizard? Reduces friction for simple updates but adds a second compose pattern to maintain. | Sprint 3 | Leah |
| 2 | **PostHog hosting**: Self-hosted (full data control, higher ops burden) vs. cloud (managed, usage-based pricing)? Both support the event pipeline architecture. | Sprint 1 | Kody |
| 3 | **Template editing depth**: Block editor only (faster, constrained to brand) vs. HTML escape hatch (flexible, risk of brand drift)? Recommendation: block editor only for v1. | Sprint 3 | Kody + Leah |
| 4 | **Approval workflow**: Should campaigns require a second admin's approval before sending? Useful for future team scale, unnecessary overhead for two founders. Recommendation: defer to Sprint 7+. | Sprint 7 | Kody |
| 5 | **Founding Circle as a separate channel**: Should Founding Circle members get their own notification category in preferences, or are they a segment within marketing? | Sprint 2 | Leah |
| 6 | **Manufacturer marketing permissions**: Can admins send marketing campaigns to manufacturers, or is the Communications module consumer + designer only? | Sprint 4 | Kody |
| 7 | **Resend Audiences vs. Patina segments**: Resend has its own audience/contact management. Do we sync segments to Resend Audiences for suppression, or manage everything in Supabase? Recommendation: Supabase is source of truth, Resend handles delivery only. | Sprint 1 | Kody |

---

## 19. Related Documentation

| Document | Relationship |
|----------|-------------|
| **Email & Notification System PRD** | Foundation infrastructure this module builds upon. Defines `notify()`, preference schema, queue architecture, template rendering, Resend integration. |
| **Admin Portal — Aesthete Engine Ecosystem** | Existing Admin Portal navigation and IA that this module extends. |
| **Designer Portal Design Document** | Designer-facing screens that trigger notifications consumed by this module (lead alerts, client messages). |
| **Manufacturer Portal Design Document** | Manufacturer-facing screens and marketing collaboration features. |
| **Patina Brand Guidelines** | Brand colors, typography, voice guidelines enforced by the template system. |
| **Complete Brand Document** | Email communication voice guidelines, provenance line patterns, CTA tone. |
| **Style Profiles** | Style profile data structure used by audience segmentation engine. |
| **Master PRD** | Platform-wide feature roadmap and phase definitions. |
| **iOS App Design Document** | Consumer app events that trigger automation sequences. |
| **User Journey** | End-to-end user flows including email touchpoints. |

---

*Patina — Where Time Adds Value*

© 2026 Patina. All rights reserved.

*Document Version: 1.0 | Last Updated: March 2026*
