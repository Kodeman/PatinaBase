# Help & Guidance System — Detailed PRD (As-Built)

## 1. Header

**Area:** Help & Guidance System — four-layer, CMS-backed in-context guidance framework (`@patina/help-system`)

**Status by sub-feature:**

| Sub-feature | Status |
|---|---|
| Layer 1 · Ambient (FieldLabel, FieldHelper, EmptyState, SmartDefault, SectionIntro) | Shipped |
| Layer 2 · Reactive (Tooltip, InfoIcon, StrataInfoIcon, LearnMore, ContextualHelpPanel) | Shipped ⚠ (panel-open bug unconfirmed post-fix) |
| Layer 3 · Proactive (Coachmark, WelcomeModal, TourController, FeatureAnnouncementCoachmark) | Partial (Coachmark/WelcomeModal/TourController shipped + live; FeatureAnnouncementCoachmark built but unused) |
| Layer 4 · Reference (HelpArticle, HelpSearch, VideoPlayer, RelatedArticles) | Partial (components + Help Center routes shipped; 10 videos not recorded) |
| Cross-device persistence (`profiles.help_state`) | Shipped (designer portal only; admin/client not wired) |
| Sanity CMS content authoring | Planned / in progress (~142 of ~150 docs still placeholder) |
| Designer Portal integration (utility bar, First Project Walkthrough, The Document, Help Center) | Shipped |
| Admin Portal integration | Shipped (ambient/reactive only; no tours, no Supabase persistence) |
| Client Portal integration | Shipped (ambient/reactive only; no tours, no Supabase persistence) |
| iOS native Help module | Shipped (code-complete, parity-tested) but Deferred from pilot |
| Analytics (PostHog events) | Shipped (direct `window.posthog` calls); typed `helpEvents` taxonomy unused |
| PostHog dashboards (5 content dashboards + quarterly audit) | Planned (unverified / not built) |

**Last reconciled:** 2026-07-06

**Source docs:**
- `docs/prds/Guide/patina-help-guidance-engineering-handoff.md`
- `docs/prds/Guide/patina-help-guidance-system.html`
- `docs/handoffs/help-system-sprint-1-report.md`
- `docs/handoffs/help-system-sprint-2-report.md`
- `docs/handoffs/help-system-sprint-3-report.md`
- `docs/handoffs/help-system-sprint-4-report.md`
- `docs/handoffs/help-system-production-verification-report.md`
- `packages/help-system/src/index.ts`
- `packages/help-system/src/surfaceKeys.ts`
- `packages/help-system/src/hooks/useHelpContent.ts`
- `packages/help-system/src/isPlaceholderContent.ts`
- `packages/help-system/src/persistence/supabaseAdapter.ts`
- `packages/help-system/src/reactive/ContextualHelpPanel/ContextualHelpPanel.tsx`
- `apps/designer-portal/src/components/help/first-signin-tour.tsx`
- `apps/designer-portal/src/components/document/help/document-help.tsx`
- `apps/designer-portal/src/components/portal/utility-bar.tsx`
- `apps/designer-portal/src/app/(portal)/portal/help/page.tsx`
- `supabase/migrations/00146_profiles_help_state.sql`
- `studios/help-system/schemas/helpContent.ts`
- `studios/help-system/schemas/index.ts`

---

## 2. Overview

**Purpose:** Make Patina approachable on the first click and reliable on the thousandth without interrupting the work (per `docs/prds/Guide/patina-help-guidance-engineering-handoff.md`). The Help & Guidance System is Patina's in-context guidance framework — a four-layer model (Ambient → Reactive → Proactive → Reference) that surfaces CMS-authored help copy, tooltips, empty-state nudges, onboarding tours, feature-announcement coachmarks, and a searchable Help Center, all keyed off a single `portal/section/component[/state]` **surface key** identifier.

**Primary users:**
- **Designers** — the deepest integration (39 files); utility-bar help panel, First Project Walkthrough tour, full Help Center.
- **Admin operators** — utility-first voice help on Dashboard, Users, Applications, Communications, Audit (8 files).
- **Homeowner/clients** — consumer-voice help on today/projects/scans/reviews/messages (10 files, `persona='consumer'`).
- **iOS app users** — parallel native module, built and parity-tested but deferred from the web-first pilot.

**Where it lives in the product:**
- Shared package `@patina/help-system` (v0.1.0, `HELP_SYSTEM_VERSION` constant in `packages/help-system/src/index.ts`), consumed by all three Next.js portals (designer, admin, client) and by a native SwiftUI module on iOS (`apps/mobile/Patina/Patina/Features/Help/`).
- Content is authored and stored in Sanity CMS (project `kv3qrinl`, dataset `production`, studio at `studios/help-system/`), fetched client-side by surface key.
- Cross-device state (tour completions, feature-announcement dismissals) persists in `public.profiles.help_state` (designer portal only, at present).

---

## 3. As-Built Architecture

### Package: `@patina/help-system` (all four layers present)

- **Layer 1 · Ambient** (`packages/help-system/src/ambient/`): `FieldLabel`, `FieldHelper`, `EmptyState`, `SmartDefault`, `SectionIntro`
- **Layer 2 · Reactive** (`packages/help-system/src/reactive/`): `Tooltip`, `InfoIcon`, `StrataInfoIcon`, `LearnMore`, `ContextualHelpPanel`
- **Layer 3 · Proactive** (`packages/help-system/src/proactive/`): `Coachmark`, `WelcomeModal`, `TourController` (+ `tourState`), `FeatureAnnouncementCoachmark` (+ `featureAnnouncementState`)
- **Layer 4 · Reference** (`packages/help-system/src/reference/`): `HelpArticle` (+ `portableTextComponents`), `HelpSearch`, `VideoPlayer`, `RelatedArticles`

All exported from `packages/help-system/src/index.ts`. Built with tsup, Storybook 8, vitest (681 web tests at Sprint-4 close).

### Content resolution

- **`useHelpContent(surfaceKey, contentType, persona)`** — `packages/help-system/src/hooks/useHelpContent.ts`. Built on **TanStack/React Query** (5-minute `staleTime`), not SWR. Implements the canonical **4-step persona fallback chain**: exact match → surfaceKey + `all` → parent + persona → parent + `all` → null + warn. Uses GROQ `coalesce()` across flat and nested field shapes (`tooltipContent.*`, `emptyStateContent.*`, `coachmarkContent.*`). Catches Sanity errors and returns null (graceful absence, per spec §13.4). The contract is mirrored in Swift (`SanityHelpClient.swift`) and pinned in `packages/help-system/src/persistence/helpContentQuery.md`.
- **`isPlaceholderContent`** (`packages/help-system/src/isPlaceholderContent.ts`) — treats any body starting with `PLACEHOLDER` or containing `pending Leah review` as a content miss, so seed stubs never reach users.
- **`SurfaceKeyProvider` / `useSurfaceKey` / `useSetSurfaceKey`** (`packages/help-system/src/providers/`) — context so a page can declare its active surface for the help panel.

### Cross-device persistence (Sprint 4, S4-1)

- `packages/help-system/src/persistence/supabaseAdapter.ts` — reads/writes `public.profiles.help_state` JSONB via pluggable `TourStateBackend` / `FeatureAnnouncementStateBackend` interfaces; synchronous in-memory cache with serialized async write-through; `migrateLocalToSupabase()` sweeps legacy localStorage state into Supabase then clears it. Adapter never throws.
- Default backend is localStorage; the Supabase-backed adapter is installed only for authenticated users.

### Designer-portal integration (the deepest surface)

- **Utility bar `?`** — `apps/designer-portal/src/components/portal/utility-bar.tsx` renders a `HelpCircle` IconButton (`aria-haspopup="dialog"`) that opens `ContextualHelpPanel`; surface key derived via `lib/help-system/pathname-to-surface-key.ts`.
- **First Project Walkthrough** — `apps/designer-portal/src/components/help/first-signin-tour.tsx`, mounted once in `app/(portal)/portal/layout.tsx`. Shows `WelcomeModal` on first sign-in (`created_at` within a 60-second window, gated on Supabase hydration), then `TourController` runs a **5-step** tour anchored on `[data-tour-anchor="today|pipeline|aesthete|products|profile"]` nav links.
- **The Document** (`(document)` route group) has no utility bar, so `apps/designer-portal/src/components/document/help/document-help.tsx` wraps the shell in `SurfaceKeyProvider` (seeded from pathname) and mounts `ContextualHelpPanel` once; opened by the ⌘K "Help…" row via `openHelp()` custom event (`lib/help-system/open-help.ts`). Document surfaces refine the key via `lib/help-system/use-document-surface.ts`, `document-pathname-to-surface-key.ts`, and `document-surface-keys.ts`.
- **Help Center (Layer 4)** — routes `apps/designer-portal/src/app/(portal)/portal/help/{page.tsx, [surfaceKey]/page.tsx, topic/[prefix]/page.tsx}` (HelpSearch + featured RelatedArticles + topic browse), mirrored under the document shell at `app/(document-help)/help/{page.tsx, [surfaceKey]/page.tsx, topic/[prefix]/page.tsx}`.

### Admin + client portals

- **Admin:** `components/portal/utility-bar.tsx` `?` panel + help components on Dashboard, Users, Applications, Communications, Audit (utility-first voice).
- **Client:** `components/layout/client-header.tsx` HelpButton + help components on today, projects, scans, reviews, messages (`persona='consumer'`).

### iOS (parallel native module, deferred for web-first pilot)

`apps/mobile/Patina/Patina/Features/Help/`: `Services/SanityHelpClient.swift` (same 4-step chain), `SurfaceKeys.swift` (parity-tested against the web registry), `FirstLaunchTour.swift` (3-step), `Services/SupabaseHelpStateAdapter.swift`; analytics live at `apps/mobile/Patina/Patina/Services/Analytics/HelpAnalytics.swift` (not under `Features/Help/`). Uses tolerant `Codable` decoding for coachmark/welcome-modal shapes.

### Analytics

Components fire `window.posthog?.capture('help.*', { snake_case })` directly, portal-agnostic (an R11 casing sweep unified web + iOS to snake_case). Events include `help.tooltip.shown/dismissed`, `help.empty_state.shown/cta_clicked`, `help.learnmore.expanded/collapsed`, `help.section_intro.shown`, `help.panel.opened/closed`, `help.tour.*`, `help.coachmark.*`, `help.welcome_modal.*`, `help.article.*`, `help.search.*`, plus the non-specced `help.help_center.viewed`.

---

## 4. Data Model

**Only one migration touches this area:**

- **`00146_profiles_help_state.sql`** — `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS help_state JSONB NOT NULL DEFAULT '{}'::jsonb`. Stores cross-device help state (tour completions/abandonments, feature-announcement dismissals). Shape:
  ```json
  {
    "tours": {
      "<tourId>": { "completed": bool, "abandoned": bool, "launched": bool, "atStep": number, "completedAt": ts, "abandonedAt": ts }
    },
    "featureAnnouncements": {
      "<featureKey>": { "dismissedAt": ts }
    }
  }
  ```

**RLS:** Inherits the existing `public.profiles` policies from `00013_profiles_table.sql` — public SELECT (directory/search), write-self (`auth.uid() = id`). No new policy was added for this column. The column comment explicitly notes the blob is metadata-only (no PII, no message bodies).

**No RPCs, no functions, no new tables** exist for this area. The column lives on `public.profiles` — there is **no** `user_profiles` table (see §7 drift note).

**Sanity (the real content store, not Postgres):** `helpContent` documents keyed by `(surfaceKey, contentType, persona)` in project `kv3qrinl` / dataset `production`. Type-specific fields live inline as conditional objects within a single document type, rather than as separate referenced documents (a deliberate schema deviation — see §7). Approximately 150 docs seeded to date: 5 designer tour coachmarks + 3 iOS tour coachmarks + ~142 Layer-4/H.2 placeholders.

---

## 5. API / Edge / Service Surface

**No edge functions and no NestJS endpoints exist for the Help & Guidance System.** Verified: no `help*` directory under `supabase/functions/`; the only `help` substring hits in edge functions are unrelated.

Data flow is entirely client-side:

- **Sanity Content Lake (read)** — `@sanity/client` (`packages/help-system/src/sanityClient.ts`) issues GROQ queries directly to `https://kv3qrinl.apicdn.sanity.io` from the browser. This requires (a) Sanity CORS origins configured per portal domain and (b) each portal's CSP `connect-src` allowing `*.sanity.io` — both are configured in production (see §9).
- **Supabase (help-state read/write)** — the persistence adapter uses the standard Supabase JS client against `public.profiles` (`select`/`update` on `help_state`), governed by existing profile RLS. No dedicated API layer or Next.js API route.
- **PostHog (analytics egress)** — `window.posthog.capture(...)` called directly from components; no server-side route in the path.

**Typed event taxonomy:** `helpEvents` exists per portal in `src/lib/analytics/events.ts` (spec §10.1, unit-tested) but is **not consumed by the shipped components** — they call `window.posthog` directly instead. It currently functions only as a reference catalogue, not a live contract.

---

## 6. UI Surfaces

### Designer Portal (`apps/designer-portal`)

- Utility-bar `?` → `ContextualHelpPanel` (Radix Dialog slide-out) on every `(portal)` page.
- First-signin `WelcomeModal` + 5-step First Project Walkthrough tour (`(portal)/portal/layout.tsx`).
- Help Center: `/portal/help`, `/portal/help/[surfaceKey]` (single article), `/portal/help/topic/[prefix]` (category browse).
- The Document shell: ⌘K "Help…" row → `ContextualHelpPanel`; mirror help routes at `(document-help)/help/{page, [surfaceKey], topic/[prefix]}`.
- Ambient/reactive affordances present across: Today, Pipeline, Activation Wizard (7 steps / 47 keys), Aesthete Engine (`/portal/companion`), Products (list/detail/capture), Clients, Decisions, Inbox, FF&E, Financials, Team, Settings.

### Admin Portal (`apps/admin-portal`)

- Utility-bar `?` panel + help components on Dashboard, Users (`CreateUserDialog`), Applications, Communications, Audit. Utility-first voice.

### Client Portal (`apps/client-portal`)

- `client-header` HelpButton + help components on today, projects, scans, reviews, messages. Consumer voice (`persona='consumer'`).

### iOS (`apps/mobile/Patina`)

- `HelpTooltip` / `HelpInfoIcon` / `HelpPanelSheet` / `HelpCoachmark` / `HelpWelcomeModal` SwiftUI components; migrated onto Home, ProductDetail, Designer, QRAuth, Companion, Rooms, Profile. First-launch 3-step tour. **Deferred from the pilot** (web-first, per Kody 2026-05-19).

### Out of scope

- Manufacturer portal — the spec lists `apps/manufacturer-portal`; it does not exist and was declared out of scope 2026-05-18.

---

## 7. Reconciliation & Gaps

### Spec-vs-reality drift

- **Package namespace & targets:** the spec is written for `@strata/*` in a "Strata monorepo" targeting `apps/designer-portal`, `apps/manufacturer-portal`, `apps/consumer-app`, `apps/admin-portal`. As built it is `@patina/*` in patina-merged; there is no manufacturer portal (out of scope 2026-05-18), and "consumer" resolves to the client-portal web app plus the iOS app. Spec code samples using `@strata/help-system/...` subpaths are illustrative only — the real package exports a single barrel, `@patina/help-system`.
- **Caching layer:** spec §7.3 and §14 mandate "SWR with a 5-minute revalidation window." Code uses TanStack/React Query with a 5-minute `staleTime` (`useHelpContent.ts`). Same 5-minute semantics, different library.
- **Persistence table name:** spec §4.7/§15 and the Sprint-4 report prose reference `user_profiles.help_state`. The actual migration (`00146`) adds `help_state` to `public.profiles` — ⚠ there is no `user_profiles` table.
- **Analytics property casing:** spec §10.1 shows camelCase props (`surfaceKey`, `durationMs`). Shipped components emit snake_case (`surface_key`, `duration_ms`) after the R11 sweep. The typed `helpEvents` taxonomy in each portal's `events.ts` still exists but is unused by components (they call `window.posthog` directly), and undocumented events were added (`help.help_center.viewed`, `help.section_intro.shown`).
- **ContextualHelpPanel contract:** spec §4.6 defines a required prop `currentSurfaceKey` and prescribes a bespoke 280ms slide. Code's prop is `surfaceKey?` (optional) with `open`/`onOpenChange`, implemented on Radix Dialog primitives (slide-in/out utilities).
- **Surface-key namespace for the wizard:** spec §6.1 examples use `designer-portal/wizard/step-1-basics`; the registry namespaces under `designer-portal/activation-wizard/step-1-basics` (a deliberate deviation, to reserve room for future wizards — noted directly in `surfaceKeys.ts`).
- **Sanity content modeling:** spec §7.2 implies type-specific content as separate sub-documents/references; the deployed schema (`studios/help-system/schemas/helpContent.ts`) uses inline conditional objects in a single document (a documented deviation to keep one-query fetches).
- **Sanity persona for tours:** the spec assumes persona-scoped content resolves cleanly via the fallback chain, but ⚠ a runtime bug meant the chain (queried with `persona='all'`) never reached designer/consumer-scoped docs — fixed content-side by re-tagging all 8 tour docs to `persona='all'` (a workaround, not the specced behavior).

### Known bugs / TODOs

- ⚠ **Editorial content not authored:** ~142 of the ~150 Sanity docs are still literal "PLACEHOLDER — pending Leah review" stubs. The `isPlaceholderContent` guard deliberately treats these as misses, so production users currently see each component's inline `fallback` prop (or nothing), not CMS copy. H5 (final Leah content pass) is owed.
- ⚠ **Missing dedicated Sanity schemas:** `welcomeModalContent` and `videoContent` were never built (spec §16 + Sprint-4 backlog). `WelcomeModal` reuses the `tooltipContent` shape; `VideoContent` exists only as a TypeScript type. Studio ships 5 schemas: `helpContent`, `tooltipContent`, `emptyStateContent`, `helpArticleContent`, `coachmarkContent`.
- ⚠ **10 video walkthroughs (H4) not recorded** — blocked on the still-open video-hosting decision (spec §16 open question #2).
- ⚠ **PostHog dashboards unverified:** the 5 required content dashboards (I.2, spec §10.2) were reported as built by Kody but never verified via query in the production-verification report; the quarterly content-audit dashboard (I3) is not built.
- ⚠ **TourController persona gap:** does not thread persona context into per-step coachmark queries — the persona='all' content-side re-tag (above) is the current workaround (Sprint 5 code-refactor backlog item).
- ⚠ **ContextualHelpPanel "did not visibly open"** when clicking `?` was left OPEN in the Round-2 production verification (needs a targeted debug session); status unconfirmed post-fix.
- ⚠ **Admin-portal and client-portal do not wire Supabase help-state persistence** (they don't yet mount `TourController` / `FeatureAnnouncementCoachmark`) — they fall back to localStorage-only, one-shot semantics.
- ⚠ **`FeatureAnnouncementCoachmark` is fully built, exported, and state-backed but not wired to any real feature announcement in any portal** — no consumer usage exists anywhere in the codebase.
- ⚠ **WelcomeModal replay affordance** ("Show me around again" from Profile, spec §4.8) is not built; the registry only reserves a future `designer-portal/welcome/replay` key.
- ⚠ **E2E acceptance tests §10 (tests 1–6, 8, 10)** — CMS round-trip, first-signin walkthrough, cross-device dismiss, panel context, axe-core a11y, reduced-motion, dashboards, Five-Principles — remain pending real pilot users; only Sanity-offline (test 7) is implicitly verified.
- ⚠ **iOS parity deferred** from the pilot entirely (web-first decision).
- ⚠ **Chromatic/visual-regression coverage** (spec §12.3) not evidenced beyond Storybook stories.

---

## 8. Forward Roadmap / Open Requirements

| Item | Priority |
|---|---|
| Leah authors real CMS copy over the ~142 placeholder docs (H5); until then users see inline fallbacks, not the designed help. | P0 |
| Confirm/fix `ContextualHelpPanel` opening on the `?` click (open item from Round-2 prod verification); run the deferred §10 E2E acceptance suite with real pilot users. | P0 |
| Refactor `TourController` to pass persona into per-step coachmark queries, retiring the `persona='all'` content-side workaround. | P1 |
| Build dedicated Sanity schemas for `welcomeModalContent` and `videoContent`; resolve the video-hosting decision and record the 10 walkthroughs (H4). | P1 |
| Verify/rebuild the 5 PostHog content dashboards (I.2) and the quarterly content-audit dashboard (I3); reconcile the unused typed `helpEvents` taxonomy with the direct `window.posthog` calls. | P1 |
| Wire the first real `FeatureAnnouncementCoachmark`, and add the `WelcomeModal` "Show me around again" replay affordance. | P2 |
| Wire admin-portal + client-portal Supabase help-state persistence when they ship their first tour. | P2 |
| Un-defer iOS parity (native Help module is built and parity-tested, awaiting pilot go-ahead). | P2 |

---

## 9. Status & Deploy

**On main:** All four sprints merged (`help-system/sprint-{1,2,3,4}` → main). Production-verification pass on `main @ a1450cde`, with Round-2 fixes at `66543886`.

**On prod:** Deployed and verified 2026-05-19/20 across all three portal domains (`app`/`admin`/`client`.patina.cloud). Migration `00146_profiles_help_state` is on prod (the prod migration tip has since advanced well past it — currently in the 00250s after the 00230–00254 tier-1 deploy).

**Two production-config fixes landed live** (config, not application code):
1. Sanity CORS origins added for `https://{app,admin,client}.patina.cloud` (Sanity project settings) — before this, every help fetch failed CORS preflight and all copy silently fell back.
2. CSP `connect-src` extended with `https://*.sanity.io wss://*.sanity.io` in `apps/{designer,admin,client}-portal/next.config.js` (commit `66543886`) — before this, the Sanity CDN was blocked client-side.

**Content deploy state:** Sanity `coachmarkContent` schema deployed; 8 tour docs migrated and re-tagged to `persona='all'`; a `welcomeModal` doc created; ~137 H.2 placeholder drafts bulk-published. Real editorial content (Leah) still owed.

**Verdict at pilot time:** GREEN for pilot (Leah + 2 designers on fresh accounts), with the caveat that CMS copy is placeholder and a few §10 acceptance tests await real first-signin users. iOS deferred.

---

## 10. Superseded Sources

This consolidated PRD replaces:

- `docs/prds/Guide/patina-help-guidance-engineering-handoff.md`
- `docs/prds/Guide/patina-help-guidance-system.html`
- `docs/handoffs/help-system-sprint-1-report.md`
- `docs/handoffs/help-system-sprint-2-report.md`
- `docs/handoffs/help-system-sprint-3-report.md`
- `docs/handoffs/help-system-sprint-4-report.md`
