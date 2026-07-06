# Designer Portal — Core (Shell, Navigation & Everyman Workspace)

## 1. Header

**Area**: Designer Portal (core) — the Next.js 15 shell (top nav, sub-nav/breadcrumb, mobile tab bar, command palette, messages panel, toast/tour providers) plus the "everyman" workspace pages that are not their own PRD.

**Last reconciled**: 2026-07-06

**Per-sub-feature status**:

| Sub-feature | Status |
|---|---|
| Shell (TopBar, SubNav, MobileTabBar, CommandPalette, MessagesPanel, ToastProvider, FirstSigninTour) | Shipped |
| 8-zone navigation (`config/navigation.ts`) | Shipped (drifted from 3-zone spec) |
| THE FLIP (`/portal` → `/desk` via `the-document-pilot` flag) | Shipped |
| Today dashboard | Shipped |
| Projects (list + 12-zone detail) | Shipped |
| Clients (directory + profile) | Shipped |
| Rooms (list + 3D viewer) | Shipped |
| Reviews | Shipped |
| Inbox | Shipped |
| Team | Partial (no real member roster; invite reuses client-invite path) |
| Settings / Profile | Shipped |
| Insights (admin) | Partial (built, but orphaned from all navigation) |
| Portfolio | Shipped |
| Resources | Partial (fully static hardcoded stub) |

**Source docs**:
- `docs/specs/designer-portal-spec.md`
- `docs/specs/Redesign/patina-navigation-redesign.html`
- `docs/specs/Redesign/designer-portal-vision.html`
- `docs/specs/Redesign/patina-project-management-design.html`
- `docs/specs/Redesign/patina-project-detail-design.html`
- `docs/specs/Redesign/patina-project-detail-v2.html`
- `docs/specs/Redesign/patina-client-management-design.html`
- `docs/specs/Redesign/patina-component-catalog.html`
- `docs/qa/designer-portal-audit/findings.md`
- `docs/qa/designer-portal-audit/punch-list.md`
- `docs/qa/designer-portal-audit/handoff-2026-05-28.md`
- `docs/qa/designer-portal-audit/sec-06-07-help-content-status-2026-05-28.md`
- `docs/qa/designer-portal-crawl-2026-06-01.md`
- `apps/designer-portal/CLAUDE.md`

## 2. Overview

The core Designer Portal is the Next.js 15 app at `apps/designer-portal` (app.patina.cloud, port 3000). It is the container shell — top navigation, sub-nav/breadcrumb, mobile tab bar, command palette, messages panel, toast and tour providers — plus the set of "everyman" workspace pages that don't warrant their own PRD: the Today dashboard, Projects (list + 12-zone detail), Clients (directory + profile), Rooms (list + 3D viewer), Reviews, Inbox, Team, Settings, Profile, Insights (admin), Portfolio, and Resources.

**Primary users**: interior designers (role `designer`), studio owners (who additionally see margin/trade financial visibility), and Patina admins (who use the Insights surface).

**Where it lives**: this is the container that hosts every specialized zone documented in its own PRD — The Document desk, Decisions, Procurement, Billing, Aesthete Engine, the three-layer Library, and Vendors. Two structural facts dominate this area as-built: (1) navigation grew from the spec's 3 zones to 8 zones driven by `config/navigation.ts`; (2) the portal root flips to `/desk` (The Document) when the `the-document-pilot` PostHog flag is on — the classic dashboard at `/portal` is now a fallback, though every zone route stays URL-reachable.

## 3. As-Built Architecture

### Shell & navigation
- `app/(portal)/portal/layout.tsx` — wraps children in `CommandPaletteProvider` → `MessagesPanelProvider` → `ToastProvider`; renders `TopBar` + `SubNav` (Suspense), `PageContainer`, `MobileTabBar`, `MessagesPanel`, `CommandPalette`, `FirstSigninTour`, `ZoneFlightTelemetry`.
- `config/navigation.ts` defines **8 `ZONES`** (`today`, `pipeline`, `procurement`, `billing`, `products`, `aesthete`, `clients`, `messages`) + `ZONE_SUB_ITEMS` + `ZONE_ACTIONS`. `components/portal/top-bar.tsx` renders zones (procurement gated on `procurement-workspace-pilot`, fail-closed); `components/portal/sub-nav.tsx` renders sub-nav tabs, the three-layer `LibraryLayerNav` (products special-case), or a **breadcrumb with per-entity name resolution** (resolver components `ProjectBreadcrumbLabel`/`ClientBreadcrumbLabel`/etc. that never show a raw UUID). Zone/breadcrumb state comes from `useActiveZone`; tab counts from `useNavCounts`.
- Orphaned-from-nav routes reachable only via the account menu / ⌘K / notification bell: `settings`, `profile` (account menu `components/portal/account-menu.tsx`); `portfolio`, `settings` (⌘K `components/portal/command-palette.tsx`); `inbox` (`inbox-bell`). `team`, `insights`, `resources` are linked from nowhere in-app.

### THE FLIP
- `portal/page.tsx` (Today dashboard) runs `useFeatureFlag('the-document-pilot')` and `router.replace('/desk')` when on — the flip is a data-free redirect toggle (rollback = flag off). All hooks run before the early return to keep hook order stable.

### Today dashboard — `portal/page.tsx`
Greeting (Playfair italic firstName), 4 `MetricBlock`s (New Leads / Active Projects / This Month / **Avg Match**), Overdue Decisions (`useAllDecisions({isOverdue:true})` → `DecisionCard`), pilot-gated `ProcurementTodayCard`, two-column Leads (`useLeads` → `LeadListItem`) + Active Work (`useProjects` → `ProjectListItem`). Copy comes from `@patina/help-system` `SectionIntro`/`EmptyState` (Sanity-backed, inline fallbacks).

### Projects
- List `portal/projects/page.tsx` — `ListPageHeader` + `FilterRow` status tabs (active/proposal_sent/completed/on_hold, URL-synced via `?status=`) + `SearchInput` + `FacetedFilterPopover` (designer/client/budget/health) + `ViewToggle` (list/grid, localStorage-persisted) + `MetricsRow` + sortable `ListView`/`GridView` (`StatusBadge` dot) + `BulkActionBar`. Uses `@/hooks/use-projects` (`useProjects`, `useProjectListMetrics`, `useUpdateProject`).
- Detail `portal/projects/[id]/page.tsx` — 12 stacked "zones": `ProjectIdentityHeader`, `KeyMetricsRow`, open-decisions tile, `ProjectBriefPanel`, `ProjectBoardsSection` (proposal boards, 00180), `RoomScopeGrid` (adapted rooms+FF&E), `PhaseTimelineV2` (phase/task CRUD, `normalizePhaseSlug` guard against the vocab-crash), pilot-gated `FFESummaryTile`, `FinancialsPanel` (dual-pricing margin studio-owner-only via `useIsStudioOwner`, 00185), `DecisionsPanel` (resolves real `designer_clients.id` via `useDesignerClientForClientUser` — raw `client_id` fails RLS), `DocumentGrid`, `TimeTrackingPanel` (00177) + `RecentActivityPanel`, `ProjectCommunicationsPanel`, `TeamPanel`, lifecycle actions (hold/reactivate/archive). `editMode` defaults true and is gated to real (UUID) projects — slug fixtures render read-only. Sub-routes: `/edit`, `/financials`, `/ffe`, `/decisions`, `/time`, `/complete`, `/scope-change[/new|/[changeId]]`, `/phase/[phaseId]`, `/new`.

### Clients
- Directory `portal/clients/page.tsx` — stage tabs (all/lead/proposal/active/completed/nurture), search, `MetricsRow` (active clients / lifetime revenue / avg satisfaction / referral rate from `useClientStats`), `ClientListItem`, `AddClientDialog` (auto-opens on `?add=1`). CMS-probe empty-state fallback pattern.
- Profile `portal/clients/[id]/page.tsx` — `PageActionBar` (Message/+New Decision/View Project), hero, Contact, **Style DNA** (style_tags + learned prefs + inspiration quote), Active & Past Projects, Room Scans, Financial Summary (tooltip-wrapped), **Relationship Journey** (authoritative `project_phases` 00066, falls back to activity-log heuristic), Pending Decisions, Recent Activity, Notes.

### Rooms / Reviews / Inbox / Team / Settings / Profile / Insights / Portfolio / Resources
- Rooms: list `portal/rooms/page.tsx` (`useRooms`), viewer `portal/rooms/[id]/page.tsx` (`RoomScanViewer` on first `room_scans` row + detail rows).
- Reviews `portal/reviews/page.tsx` — tabs collected/pending/queued, `ReviewCard`/`ReviewRequestCard`, `useCompletedProjectsWithoutReview`, send/schedule via `POST /api/clients/[id]/reviews/[reviewId]/send`.
- Inbox `portal/inbox/page.tsx` — Notifications + Messages tabs, realtime (`useInboxNotificationsRealtime`), `POST /api/inbox/mark-read`, deep-link navigation from `metadata.deep_link`.
- Team `portal/team/page.tsx` — studio card + project-assignment list + `InviteMemberModal` (reuses `useAddClient` with `invite:true`).
- Settings `portal/settings/page.tsx` — Profile (name/bio), Account (password), Security (`useMfaFactors` MFA state + link to `/settings/security`), Notifications (toggles → `/api/user/preferences`, canonical `type_*` keys), Organization. Subpages: `settings/security`, `settings/notifications`, `settings/devices`.
- Profile `portal/profile/page.tsx` — identity, account info, permissions, `ActiveSessions` (`/api/me/sessions`, DELETE = sign out others).
- Insights `portal/insights/page.tsx` — **admin-role-gated** (non-admins get a friendly message); overview/engagement-distribution/top-users/funnel from `useInsightsOverview`/`useEngagementScoreDistribution`/`useTopEngagedUsers`/`useConversionFunnel`.
- Portfolio `portal/portfolio/page.tsx` — completed projects filtered to UUID ids (drops mock slug fixtures).
- Resources `portal/resources/page.tsx` — **fully static, hardcoded** 3-category list; items are plain text, no links, no data source.

### Design system
Portal-local primitives under `components/portal/*` (`StrataMark`, `MetricBlock`, `FieldGroup`, `DetailRow`, `LoadingStrata`, `ListPageHeader`, `PageActionBar`, `FilterRow`, `MetricsRow`, `ViewToggle`, `FacetedFilterPopover`, `BulkActionBar`, `SearchInput`) + `@patina/design-system` (Radix `Popover` etc.) + `@patina/catalog-ui` (`StatusBadge`) + `@/components/ui/controls` (`Button`, `PortalButton` alias) + `@patina/help-system` layer. `useHydrated` gates render across nearly every page to keep SSR (empty cache) and first client paint (warm singleton cache) consistent.

## 4. Data Model

Core reads/writes go through `@patina/supabase` hooks against the `public` schema under RLS (NestJS `svc_*` schemas are not used by these pages).

**Clients / CRM**: `designer_clients` — created by 00017, direct-contact fields 00018, `client_management_v2` 00062. `client_reviews` (review request lifecycle: `request_status` queued/sent/collected, `scheduled_for`, `published_to_portfolio`, `referral_count`).

**Projects**: `projects` + `project_phases` (00066) + `project_tasks` & `project_documents` (00169; storage bucket 00170) + `project_payment_milestones` + `project_time_entries` (00177) + `project_boards` (00179, carried on activation 00180) + FF&E dual pricing / trade cost + margin (00185) + invoice↔FF&E lines (00187). Foundational: `project_management_mvp` (00084); `activate_project` RPC (00086, `created_by` fix 00167); projects RLS scope widen (00168). Phase-vocab normalization is handled in-app (`normalizePhaseSlug`) because activated projects persist a simplified vocab.

**Leads**: `leads` — room_scan_id 00029, notification triggers 00042, designer-insert RLS 00166, free-text `source` 00223, `client_discovery` 00224.

**Rooms/scans**: `rooms` / `room_scans` — RoomPlan features 00019, scan associations 00020, images 00032 (+ captions 00083), daily room tracking 00069.

**Account/prefs**: `notification_preferences` (00040) + `notification_digest_state` (00120); `user_sessions` (created 00162, `auth.sessions`→`user_sessions` exception-guarded trigger + backfill 00164 — powers Profile Active Sessions); profile availability status (00183 — ⚠ MEMORY flags this as not-on-prod); GDPR compliance (00025); roles & permissions seed (00022).

**RPCs**: `activate_project` (00086, patched 00167).

**RLS notes**: `projects` RLS scope widened at 00168 (fixed the "wide-open projects" issue found in Active Project QA); `leads` designer-insert RLS added 00166. Decisions panel must resolve `designer_clients.id` (not the raw `client_id` auth uid) or `client_decisions` INSERT RLS rejects the row — this is a previously-shipped bug fix (`useDesignerClientForClientUser`), not an open item.

Insights hooks read platform-wide engagement/waitlist aggregates (`use-insights.ts`: `useInsightsOverview`, `useEngagementScoreDistribution`, `useTopEngagedUsers`, `useConversionFunnel`, `useWaitlistStats`).

## 5. API / Edge / Service Surface

### Next.js API routes (`apps/designer-portal/src/app/api`)
- **Account/self**: `me/route.ts`, `me/profile`, `me/avatar`, `me/password`, `me/sessions` (GET list / DELETE others) + `me/sessions/[id]`, `me/data-export`, `me/delete-account`, `me/designer-application`.
- **Preferences**: `user/preferences` (GET/PATCH — canonical notification toggle endpoint used by Settings + settings/notifications + preferences), `user/data-export`, `user/data-erase`, `preferences/apply-token`.
- **Inbox**: `inbox/mark-read` (POST).
- **Clients**: `clients/invite` (magic-link invite), `clients/[id]/reviews/[reviewId]/send` (send/schedule review request), `clients/[id]/nurture-send`.
- **Projects**: `projects/route.ts`, `projects/[id]`, `projects/[id]/tasks[/[taskId]]`, `projects/[id]/milestones[/[milestoneId]]`, `projects/[id]/documents[/[documentId]]`, `projects/[id]/rfis[/[rfiId]]`.
- **Admin** (Insights/user mgmt): `admin/users*`, `admin/roles/[id]/users`.

### Edge functions (core-relevant, `supabase/functions/`)
`notification-dispatch`, `comms-notification-dispatch`, `digest-dispatcher`, `review-requests`, `lead-expiration-check`, `decision-resolved-notify`, `sms-dispatch`, `campaign-dispatch`.

### Direct Supabase
The majority of core reads/writes bypass Next API routes entirely and go through `@patina/supabase` React Query hooks (`useClients`, `useClientStats`, `useRooms`, `useClientReviews`, `useInboxNotifications`, `useMfaFactors`, `useAvailability`, `useOrganizations`, `useProjectPhases`, etc.) against RLS-protected tables.

## 6. UI Surfaces

Real routes under `apps/designer-portal/src/app/(portal)/portal/`:

**Shell/landing**: `/portal` (Today dashboard; **redirects to `/desk`** when `the-document-pilot` is on).

**Projects**: `/portal/projects` (list, list/grid), `/portal/projects/new`, `/portal/projects/[id]` (12-zone detail), `.../edit`, `.../financials`, `.../ffe`, `.../decisions`, `.../time`, `.../complete`, `.../scope-change`, `.../scope-change/new`, `.../scope-change/[changeId]`, `.../phase/[phaseId]`.

**Clients**: `/portal/clients` (directory), `/portal/clients/[id]` (profile), `.../messages`, `.../decisions/new`.

**Rooms**: `/portal/rooms` (list), `/portal/rooms/[id]` (3D viewer).

**Reviews**: `/portal/reviews` (collected/pending/queued tabs).

**Inbox**: `/portal/inbox` (notifications + messages tabs).

**Team**: `/portal/team`.

**Settings/Profile**: `/portal/settings`, `/portal/settings/security`, `/portal/settings/notifications`, `/portal/settings/devices`, `/portal/profile`.

**Studio-tail (orphaned from nav)**: `/portal/insights` (admin-only), `/portal/portfolio`, `/portal/resources` (static).

Client-portal and admin-portal are separate apps/PRDs. Native/extension surfaces do not consume these core pages.

## 7. Reconciliation & Gaps

### Spec-vs-reality drift
- **Navigation zones**: `designer-portal-spec.md` §3.3 and `Redesign/patina-navigation-redesign.html` specify **3 zones** (Work / Clients / Studio). Code (`config/navigation.ts`) ships **8 zones** (Today / Pipeline / Procurement / Billing / Products / Aesthete / Clients / Messages). The "Studio" zone (Earnings/Portfolio/Resources/Settings) never materialized — those pages are orphaned into the account menu, ⌘K palette, or nowhere.
- **Landing route**: spec §4.1 says `/portal` = Dashboard (default redirect). Code makes `/portal` **redirect to `/desk`** (The Document) whenever the `the-document-pilot` flag is on (`portal/page.tsx`). The typography-first dashboard is now a flag-off fallback, not the primary landing.
- ⚠ **Hard anti-patterns violated**: spec §1/§10 forbids tabs-within-pages, colored status badges, card containers, and box-shadows. As-built uses tab bars (Reviews, Inbox, Clients/Projects `FilterRow`), `StatusBadge` pills/dots, and grid **cards with `hover:shadow-sm`** in the Projects grid view and bordered cards in Portfolio/Team/Reviews.
- **Dashboard metrics**: spec §7.1 defines newLeads/activeProjects/**monthRevenue**/**avgResponseTime**. Code renders New Leads / Active Projects / This Month / **Avg Match** — avgResponseTime was replaced by average match score.
- **Dashboard data source**: spec §7.1 specifies a composite `GET /api/portal/dashboard` endpoint. No such endpoint exists — the dashboard composes client-side from `useLeads`, `useLeadStats`, `useProjects`, `useEarningsStats`, `useAllDecisions`.
- ⚠ **Resources page**: spec §4 / file structure imply a real Help & Resources surface. `portal/resources/page.tsx` is **fully static hardcoded copy** with no links and no data.
- **Design tokens & stack**: spec header names package `@strata/designer-portal`, React 18, and `strata` monorepo. Reality (per `apps/designer-portal/CLAUDE.md`) is `@patina/*`, React 19, self-hosted Supabase; the spec's CSS token tables were physically migrated into `apps/designer-portal/src/app/globals.css`, which is now the token source of truth (spec md is no longer authoritative).
- **Mobile tab bar**: spec §3.3/§6 specifies Work / Clients / Rooms / Studio tabs; `MobileTabBar` uses the current 8-zone set, not the specced four.

### Known bugs / TODOs
- ⚠ Resources page (`portal/resources/page.tsx`) is a P2 stub — 3 hardcoded categories, no navigable links, no CMS/data backing.
- ⚠ Insights (`portal/insights/page.tsx`) is admin-only and orphaned from all navigation (no zone, no ⌘K, no account-menu entry); reachable only by typing the URL. Non-admins get a friendly "not available for your role" message.
- Projects bulk actions Change Lead / Export Financials / Combined Report render as disabled "Coming soon" buttons (`ComingSoonButton`, punch-list B-07); only "Move to On Hold" is wired.
- Team page has no real member roster — it shows the studio + project assignments only, and directs the user to add support designers from a project's detail page. `project_parties` has no login (v1, `profile_id` nullable). Invite reuses the client-invite path (`useAddClient`, `invite:true`) rather than a dedicated team-member flow.
- ⚠ Profile Active Sessions depends on `user_sessions` being populated by the 00164 `auth.sessions` trigger; the current session is always derived client-side from the Supabase session + `navigator.userAgent` because login-time population is unreliable (`profile/page.tsx` comment: "nothing populates it on login yet").
- ⚠ Availability-status migration 00183 is flagged **not-on-prod** in project MEMORY, so the account-menu availability dot may not persist in production.
- ⚠ No `error.tsx` / `not-found.tsx` boundaries exist anywhere in the portal app (resilience gap, crawl-2026-06-01 §Minor).
- ⚠ `useProjects` silently falls back to slug-ID **mock fixtures** when Supabase returns no rows; Portfolio compensates with a UUID filter and Team can show fake assignments (SET-02). This mock-fallback masks a broken API/data layer when it triggers (project MEMORY: mock-fallback note).
- ⚠ Pervasive placeholder help-content: ~137 "PLACEHOLDER — pending Leah review" Sanity docs were bulk-published and win over inline fallbacks because `effectiveBody = cmsBody ?? fallback` (crawl §C); a central placeholder guard was dispatched but should be re-verified across Today/Clients/Settings surfaces.
- SSR/CSR hydration-gate mismatches on `isLoading`/data branches were found across detail pages (crawl §A); mitigated by the `useHydrated` gate pattern now pervasive, but any page not gated remains at risk.

## 8. Forward Roadmap / Open Requirements

| Item | Priority |
|---|---|
| Reconcile the spec's typography-first anti-patterns (no tabs/badges/cards/shadows) with the shipped tabbed+badged+carded reality — either amend the design contract or refactor Projects grid/Portfolio/Reviews/Inbox to the flat rule set | P2 |
| Build out or retire the orphaned Studio-tail pages: give Resources real content/links (or remove), decide Insights' home (admin nav vs remove), and give Team a first-class member roster instead of the invite-via-project workaround | P1 |
| Add `error.tsx`/`not-found.tsx` boundaries to the portal app for resilience | P1 |
| Remove or quarantine the `useProjects` mock-fixture fallback so an empty/failing data layer surfaces honestly instead of showing fake projects/team assignments | P1 |
| Wire the disabled Projects bulk actions (Change Lead / Export Financials / Combined Report) or drop them | P2 |
| Verify and finish deploy of availability status (00183) and user_sessions population (00164) to prod so account-menu status and Profile Active Sessions are truthful | P2 |
| Re-verify the central placeholder-help-content guard across all core surfaces so no "PLACEHOLDER — pending Leah review" copy reaches users | P2 |

## 9. Status & Deploy

On-main and largely on-prod (app.patina.cloud). The core shell, 8-zone navigation, and all listed pages are on `main`. THE FLIP is live: the `the-document-pilot` flag defaults on, so `/portal` lands on `/desk` in production (per project MEMORY: "FLIPPED TO DEFAULT").

Core-portal pages ride the app-image deploy rather than owning recent migrations — the newest migrations in this area are the account/session/availability set (00162–00164, 00183) and the projects/time/boards/dual-pricing set (00168–00187), which are on prod except ⚠ **00183 availability status (flagged not-on-prod in MEMORY)**.

Later migrations 00191+ belong to The Document / Coordination / Aesthete PRDs; prod tip advanced through the 00230–00254 tier-1 deploy (recent commit `cb15fb37`) but those do not change core-portal behavior.

Edge functions for this area (`notification-dispatch`, `review-requests`, `digest-dispatcher`, `lead-expiration-check`) are deployed as part of the standard function set.

The QA remediation waves (punch-list, 2026-05-28) and the full-page crawl (2026-06-01) are resolved/merged; residual items are captured in Section 7 above.

## 10. Superseded Sources

- `docs/specs/designer-portal-spec.md`
- `docs/specs/Redesign/designer-portal-vision.html`
- `docs/specs/Redesign/patina-navigation-redesign.html`
- `docs/specs/Redesign/patina-project-management-design.html`
- `docs/specs/Redesign/patina-project-detail-design.html`
- `docs/specs/Redesign/patina-project-detail-v2.html`
- `docs/specs/Redesign/patina-client-management-design.html`
- `docs/qa/designer-portal-audit/findings.md`
- `docs/qa/designer-portal-audit/punch-list.md`
- `docs/qa/designer-portal-crawl-2026-06-01.md`
