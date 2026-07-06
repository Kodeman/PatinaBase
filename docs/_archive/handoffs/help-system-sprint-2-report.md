# Help & Guidance System — Sprint 2 Gate Report

**Period:** 2026-05-18 (single orchestrator session, continued from Sprint 1)
**Branch:** `help-system/sprint-2` (HEAD `c1292117`, pushed to origin)
**Commits ahead of main:** 33
**Plan:** `/Users/kody/.claude/plans/review-the-documenation-for-compressed-shore.md`
**Sprint 1 report:** `docs/handoffs/help-system-sprint-1-report.md`

---

## TL;DR

Sprint 2 delivered the full **Reactive layer** (Stream C), 4 more **Designer Portal migrations** (F.1.3–F.1.6), wired the `?` help trigger in **all 3 web portals** (C.6), shipped the iOS **HelpTooltip + HelpInfoIcon + HelpPanelSheet** components (G5/G6), migrated **iOS Home + ProductDetail** (G7), and resolved **R11** (PostHog property-key casing) by sweeping web + iOS to snake_case.

- **Web tests**: 316 passing in `@patina/help-system` (up from 126 at Sprint 1 close)
- **iOS**: `xcodebuild build` + `xcodebuild test -only-testing:PatinaTests` both succeed on iPhone 17 Pro / iOS 26.5
- **Surface keys registered**: 16 (Sprint 1) → 164 cross-platform
- **Help affordances in code**: Designer Portal Today, Pipeline, Activation Wizard (7 steps), Aesthete Engine, Products (list/detail/capture), Clients; iOS Home + ProductDetail; `?` icon in all 3 web portal headers

Two stream items defer to Sprint 3:
- **H.2 — 40 placeholder articles in Sanity** (Kody-owned: Sanity deploy)
- **I.2 — 5 PostHog dashboards** (manual UI task in PostHog product)

---

## Tasks Completed

### Stream C · Reactive components (Wave 3 — 5 parallel agents)
| ID | Title | Tests | Branch |
|----|-------|-------|--------|
| C1 | `<Tooltip />` (Radix-based, 240px max, 200ms hover, 100ms grace, snake_case props) | 13 | `help-system/C1-tooltip` |
| C2 | `<InfoIcon />` (14px `?` glyph triggers Tooltip; uses Radix directly, TODO to swap to C1) | 14 | `help-system/C2-info-icon` |
| C3 | `<StrataInfoIcon />` (StrataMark glyph for Patina concepts; inlined SVG pending design-system dts fix) | 14 | `help-system/C3-strata-info-icon` |
| C4 | `<LearnMore />` (Radix Collapsible, expanded/collapsed events with `duration_ms`) | 14 | `help-system/C4-learn-more` |
| C5 | `<ContextualHelpPanel />` (Radix Dialog slide-out; GROQ article-list query; full HelpArticle deferred to Sprint 3 Stream E) | 17 | `help-system/C5-contextual-help-panel` |

### Stream F · Web migrations (Wave 4 — 4 parallel + 1 utility-bar + 2 iOS, 7 total)
| ID | Title | Files touched | Surface keys |
|----|-------|---------------|--------------|
| F1.3 | Activation Wizard (7 steps, 23 fields, 4 empty states, ~16 trailing icons) | 3 components (`activation-wizard/{steps,wizard-shell,field-primitives}.tsx`) + `surfaceKeys.ts` | **47 new** under `DesignerPortal.ActivationWizard.*` |
| F1.4 | Aesthete Engine (`/portal/companion` route) | 1 page + `surfaceKeys.ts` | 4 new (extends `Aesthete.*`) |
| F1.5 | Products list + detail + capture (new + import) | 4 pages + `surfaceKeys.ts` | **30 new** under `DesignerPortal.Products.*` |
| F1.6 | Clients list + detail + AddClientDialog | 3 components + `surfaceKeys.ts` | **18 new** under `DesignerPortal.Clients.*` |

All F.1.x type-check deltas: zero new errors. Pre-existing baseline maintained.

### Stream C.6 · Utility-bar `?` icon (Waves 4 + 5)
| Portal | Path | Pathname mapper |
|--------|------|-----------------|
| designer | `components/portal/utility-bar.tsx` | `pathname → designer-portal/<first-segment>` |
| admin | `components/portal/utility-bar.tsx` | Routes under `(dashboard)` group — no `/admin` prefix; `pathname → admin-portal/<first-segment>`, bare `/` → `admin-portal/dashboard` |
| client | `components/layout/client-header.tsx` (no utility-bar.tsx — `?` slotted into header) | `pathname → client-portal/<first-segment>`, `/` and `/today` → `client-portal/home` |

Each portal also got `apps/<portal>/src/lib/help-system/pathname-to-surface-key.ts` mirroring the designer pattern. All 3 portals had `@patina/help-system` workspace dep added.

### Stream G · iOS Reactive (Waves 4 + 5)
| ID | Title | Worker branch |
|----|-------|---------------|
| G5 | `HelpTooltip<Trigger>` + `HelpInfoIcon` SwiftUI components — tap-to-show popover (iOS HIG; no hover on touch), Dynamic Type, VoiceOver | `help-system/G5-ios-tooltip-info-icon` |
| G6 | `HelpPanelSheet` (presentationDetents [.medium, .large]) + extended `SanityHelpClient` with `fetchArticles(forSurfaceKey:)` using parent-prefix GROQ match | `help-system/G6-ios-help-panel` |
| G7 | Migrate `Features/Home/Views/*` (DailyGreetingHeader, DailyRoomView, DailyProductCard, DailyProductDetailView) and `Features/ProductDetail/Views/ProductDetailView.swift` — 6 help affordances per screen | `help-system/G7-ios-home-product-detail` |

iOS test suite: **all PatinaTests pass** including `HelpTooltipTests` (8), `HelpPanelSheetTests` (15), `SurfaceKeysParityTests` (extended for IOSApp.Home + IOSApp.ProductDetail — 29 parity tests pass).

### R11 · PostHog property-casing sweep (Wave 3)
| Files modified | Property keys renamed |
|----------------|-----------------------|
| 6 portal events.ts + tests + 1 iOS HelpAnalytics.swift | 19 unique keys × 3 portals + iOS = ~287 line-level rewrites |

Event NAMES unchanged. Method parameter names kept camelCase (Swift + TS idiomatic). Only PostHog property keys (object literals passed to `posthog.capture`) snake_cased.

---

## Gate Criteria — Status

From plan §5 (Sprint 2):

| Criterion | Status | Notes |
|-----------|--------|-------|
| All Reactive components shipped with a11y verified (keyboard, screen reader, reduced motion) | ✅ | Tests cover keyboard nav + aria attributes + reduced-motion paths. Runtime VoiceOver / NVDA / browser screen-reader smoke deferred to Sprint 3 pilot. |
| `?` icon present + functional in all 3 web portals | ✅ | designer + admin + client all wired. Runtime click-through smoke deferred (auth-gated routes; ContextualHelpPanel will show empty state until Sanity is seeded). |
| Activation Wizard 100% covered (every step has surface key, every field has helper, every concept has correct icon variant) | ✅ | F1.3: 47 surface keys across 7 steps; every field has FieldLabel + FieldHelper; StrataInfoIcon on Patina concepts (FF&E, Phases, Design Fee, Contingency, Milestones, Visibility Tier ×4, Vendor Assignments — 10 total), InfoIcon on general questions (6 total), 3 SmartDefaults, 4 EmptyStates. |
| iOS Reactive layer shipped on 2 major screens | ✅ | Home + ProductDetail. 12 total help affordances (6 per screen). |
| First 40 articles in Sanity (placeholder body OK; titles + one-sentence answers final) | ❌ | **BLOCKED** on Sanity schema deploy (Kody-owned gate from Sprint 1). H.2 task deferred to Sprint 3 prereq. |
| All 5 PostHog dashboards live with non-empty data | ❌ | Manual UI task in PostHog product. Deferred to Sprint 3 — agents can't build PostHog dashboards via API. |
| Sprint 2 report; Kody signs off | 🟡 | This document; sign-off pending. |

---

## Outstanding Kody-owned Gate Items

1. **Deploy Sanity schemas** (carryover from Sprint 1) — `cd studios/help-system && npx sanity login && npx sanity schema deploy`. Required before H.2 placeholder content authoring. Components silently fall back to `fallback` prop copy until then.
2. **Leah accent palette review** (carryover) — `packages/patina-design-system/src/tokens/colors.ts:helpSystemAccents`. Components use `text-muted-foreground`/`border-input` approximations pending Leah's OKLCH numbers.
3. **PostHog dashboards** (new for Sprint 2 close) — 5 dashboards per spec §10.2. Manual UI task in posthog.patina.cloud. Event taxonomy is in place + flowing.

---

## Notable Decisions & Drift From Spec

1. **R11 resolved as snake_case.** Industry default for PostHog; matches B-stream Sprint 1 components; required only ~287 mechanical renames across web events.ts + iOS HelpAnalytics.swift. Event names unchanged.

2. **C2/C3 use Radix directly, not C1's wrapper.** Sprint 2 parallel-agent dispatch meant InfoIcon + StrataInfoIcon couldn't import from sibling Tooltip (didn't exist in their worktrees). Both have `// TODO: swap inline Radix.Tooltip for canonical <Tooltip surfaceKey={...}> wrapper` comments. Sprint 3 cleanup task: ~30 min mechanical refactor.

3. **C3 StrataInfoIcon SVG inlined.** Design-system's `<StrataMark />` is exported but the package's `.d.ts` build fails on an unrelated `@patina/types/media` import, so TS-strict consumers can't import. Inlined the 3-line SVG with a `// TODO: swap back to import { StrataMark } from '@patina/design-system'` once dts ships.

4. **iOS Sanity client persona fallback diverges from web (R3 from Sprint 1 plan).** Web `useHelpContent`: exact → designer → admin → null. iOS: exact → designer → all → null. Documented in `SanityHelpClient.swift` docstring. Sprint 3 prereq: unify at GROQ template level so both surfaces share lookup rules.

5. **G6 article-list query.** Sprint 2 iOS panel uses a parent-prefix GROQ match (`surfaceKey == $sk || string::startsWith($sk, surfaceKey + "/")`) with `length(surfaceKey) desc` ordering — same shape as web's ARTICLES_QUERY. Cap at 20.

6. **G7 iOS card-button conflict.** TierPill + MatchPill inside `DailyProductCard` (list-row) are NOT wrapped with `HelpTooltip` because the entire card is an outer `Button` and `.onTapGesture` would be swallowed. Same concepts ARE wrapped via tooltip in `DailyProductDetailView`. The help panel surfaces the same surface keys for the list-row case. Documented in code.

7. **C5 ContextualHelpPanel article-body deferred.** Sprint 2 renders article titles + 1-line summaries with a "Coming soon: full article view" stub. Full portable-text rendering ships as part of Sprint 3 Stream E `<HelpArticle />`.

8. **client-portal uses `client-header.tsx`, not a `utility-bar.tsx`.** Client portal is a consumer PWA with a different shell structure. `?` icon was slotted into the header next to NotificationBell. Same functional result.

9. **iOS surface keys live in BOTH iOS Swift registry AND web TS registry** (G7 chose option-a). `SurfaceKeys.IOSApp.{Home,ProductDetail}` exists in both places now. This means a single Sanity content document can be queried by either platform. Documented for Sprint 3 reactive iOS migrations.

10. **No code-reviewer dispatch (carried over from Sprint 1).** Same pragma — relied on `superpowers:test-driven-development` + `superpowers:verification-before-completion` + orchestrator integration verification. Worth introducing reviewer dispatches for Sprint 3 Proactive layer (Coachmark + TourController complexity).

---

## Risk Register — Updates

| # | Risk | Status |
|---|------|--------|
| R1 | Manufacturer portal scope creep | unchanged — still out of scope |
| R2 | Sanity bootstrap blocks content work | active — same Kody gate; now also blocks Sprint 3 H.2 |
| R3 | iOS Sanity client / web hook divergence | **active** — Sprint 2 didn't unify; Sprint 3 prereq to consolidate GROQ templates |
| R4 | Leah unavailable for content review | active — no content authored yet (Sanity not deployed); becomes impactful when H.2 dispatches in Sprint 3 |
| R5 | Design token extension breaks consumers | **mitigated permanently** — Sprint 2 components used design-system approximations and tests all pass; Leah's specific OKLCH numbers can land via additive token update with zero migration cost |
| R6 | TanStack Query vs SWR perception | closed — never surfaced |
| R7 | Coachmark/Tour complexity | **upcoming Sprint 3** — Stream D dispatches Coachmark + TourController; biggest novel UI complexity in the project |
| R8 | iOS PostHog SDK | closed Sprint 1 |
| R9 | `?` icon utility-bar conflict | **closed** — no conflicts; admin + client portals each have their own components |
| R10 | Storybook setup | mitigated — A8 Storybook config working |
| R11 | PostHog property-casing drift | **CLOSED** — Sprint 2 R11 sweep verified all 3 portals + iOS to snake_case |

**New risks discovered Sprint 2:**
| R12 | PostHog dashboards are a manual product-UI task | Low | High | Defer to Sprint 3; orchestrator can't dispatch (no PostHog dashboard API in MCP). Kody can use spec §10.2 as the build spec. |
| R13 | C2/C3 carry "swap to canonical Tooltip wrapper" TODOs | Low | Med | Sprint 3 cleanup; mechanical 30-min refactor — safe to defer. |

---

## Files Modified Summary

**Cumulative (Sprint 1 + Sprint 2):**

- `packages/help-system/` — full Ambient + Reactive layers, 316 tests, Storybook config, all 5 ambient + all 5 reactive components + hooks + provider + content types + surface keys (164 total)
- `packages/patina-design-system/src/tokens/{colors,typography}.ts` + StrataMark component — additive (A2)
- `studios/help-system/` — Sanity studio + 4 schemas (A3) + esbuild pin
- `apps/{designer,admin,client}-portal/src/lib/analytics/events.ts` — `helpEvents` namespace, snake_case after R11
- `apps/{designer,admin,client}-portal/src/lib/help-system/pathname-to-surface-key.ts` — Sprint 2 C6
- `apps/designer-portal` migrations: Today, Pipeline, Activation Wizard (7 steps), Aesthete Engine, Products (list/detail/capture), Clients (list/detail/dialog)
- `apps/{admin,client}-portal/src/components/.../utility-bar.tsx | client-header.tsx` — `?` icon wired
- `apps/mobile/Patina/Patina/Features/Help/` — iOS module + Models (HelpContent, Persona, SurfaceKey) + SurfaceKeys.swift + Services/SanityHelpClient.swift (with fetchArticles) + Views/{HelpTooltip,HelpInfoIcon,HelpPanelSheet}.swift
- `apps/mobile/Patina/Patina/Services/Analytics/HelpAnalytics.swift` — 22 events, snake_case after R11
- `apps/mobile/Patina/Patina/Features/Home/Views/*.swift` + `Features/ProductDetail/Views/ProductDetailView.swift` — iOS migrations
- `apps/mobile/Patina/PatinaTests/{HelpAnalyticsParityTests,SanityHelpClientTests,SurfaceKeysParityTests,HelpTooltipTests,HelpPanelSheetTests}.swift`

---

## Sprint 3 Wave Plan (queued, not dispatched)

When Kody signs off, Sprint 3 (Proactive + Reference layers + remaining migrations + pilot) is ready:

**Wave 6** (parallel, 5 agents) — Proactive layer:
- D1 `<Coachmark />` (Radix Popover-based positioned card with arrow)
- D2 `<TourController />` (sequencer for ordered Coachmarks with persistence)
- D3 `<WelcomeModal />` (first-signin modal with persona-aware CTA)
- D4 `<FeatureAnnouncementCoachmark />` (one-off pulse for new features)
- D5 First Project Walkthrough tour content authored against D2 (5 steps: Today → Pipeline → Aesthete → Products & Capture → Profile)

**Wave 7** (parallel, 5 agents) — Reference layer:
- E1 `<HelpArticle />` (portable text renderer with feedback widget — also enables C5 panel to render full bodies)
- E2 `<HelpSearch />`
- E3 `<VideoPlayer />`
- E4 `<RelatedArticles />`
- E5 Full `/help` Help Center page

**Wave 8** (parallel, ~6 agents) — remaining migrations:
- F1.7+ remaining Designer Portal screens (FF&E/Decisions/Change Orders/Team/Financials)
- F2 Admin Portal full pass
- F3 Client Portal full pass (consumer voice)
- G8 iOS Coachmark + WelcomeModal
- G9 iOS first-launch tour
- G10 iOS migration sweep across remaining Features/*

**Wave 9** (parallel, content + cleanup):
- H4 video walkthroughs (uses Sanity assets — needs deploy + Leah voice review)
- H5 final content pass by Leah
- I3 quarterly content-audit dashboard
- Sprint 3 cleanup: swap C2/C3 to canonical Tooltip wrapper (R13); unify iOS/web GROQ persona fallback (R3); promote `@patina/design-system` dist `.d.ts` build

**Sprint 3 prereqs to land before dispatch:**
- Sanity schemas deployed → unblocks H.2 (Sprint 2 deferral) + H.4 + H.5
- PostHog dashboards built manually by Kody (Sprint 2 deferral)
- Optional: Leah accent palette review (not strictly blocking)
- Pilot recruitment: Leah + 2 designers (per plan §5 Sprint 3 gate criteria)

---

## Sign-off Checklist (for Kody)

- [ ] Reviewed this report
- [ ] Deployed Sanity schemas (or explicitly deferred to Sprint 3 prereq)
- [ ] Built the 5 PostHog dashboards (or explicitly deferred)
- [ ] Approve Sprint 3 kickoff

When ready, merge `help-system/sprint-2` → `main` (merge-commit recommended to preserve per-task history).

---

*Generated 2026-05-18 by orchestrator session against branch `help-system/sprint-2` HEAD `c1292117`. 33 commits ahead of main.*
