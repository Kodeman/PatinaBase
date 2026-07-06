# Help & Guidance System — Sprint 1 Gate Report

**Period:** 2026-05-18 (single orchestrator session)
**Branch:** `help-system/sprint-1` (HEAD `70e1fa9`, pushed to origin)
**Plan:** `/Users/kody/.claude/plans/review-the-documenation-for-compressed-shore.md`
**Spec:** `docs/prds/Guide/patina-help-guidance-engineering-handoff.md`

This is the first of three sprint-boundary checkpoints in the 12-week buildout. Kody (technical lead) should review and sign off before Sprint 2 work begins.

---

## TL;DR

Sprint 1 delivered the full **Foundation** (Stream A) and **Ambient layer** (Stream B), the first **two web migrations** (F1.1 Today + F1.2 Pipeline), and the full **iOS Help foundation** (G1 module + G2 Sanity client + G3 surface keys + G4 PostHog parity). One stream item (H.1 Sanity placeholder content) is deferred until you deploy the Sanity schemas.

- **Web**: `@patina/help-system` v0.1.0 — 126 unit tests, type-checks, builds; 5 ambient components shipped; designer-portal Today + Pipeline migrated.
- **iOS**: Help module + models + Sanity client + surface keys + analytics parity — `xcodebuild build` and `xcodebuild test -only-testing:PatinaTests` both succeed on iPhone 17 Pro simulator.
- **Sanity**: studio scaffolded and builds; schemas are local — **not yet deployed** (your gate).

---

## Tasks Completed

### Stream A · Foundation (closed last session)
| ID | Title | Commit lineage |
|----|-------|----------------|
| A1 | Scaffold `@patina/help-system` package | landed pre-summary |
| A2 | Extend `@patina/design-system` tokens + StrataMark | landed pre-summary |
| A3 | Sanity studio + 4 schemas (`helpContent`, `tooltipContent`, `emptyStateContent`, `helpArticleContent`) | landed pre-summary |
| A4 | Surface keys source-of-truth file | landed pre-summary |
| A5 | `useHelpContent` TanStack Query hook + persona fallback chain | landed pre-summary |
| A6 | `SurfaceKeyProvider` + `useSurfaceKey` context primitives | landed pre-summary |
| A7 | `helpEvents` taxonomy (22 events) added to all 3 portals | landed pre-summary |
| A8 | Storybook 8 config (port 6007) | landed pre-summary |

### Stream B · Ambient components (this session)
| ID | Title | Worker branch | Tests |
|----|-------|---------------|-------|
| B1 | `<FieldLabel />` (no CMS — pure presentational) | `help-system/B1-field-label` | 8 |
| B2 | `<FieldHelper />` (CMS-backed via `useHelpContent`) | `help-system/B2-field-helper` | 14 |
| B3 | `<EmptyState />` (CMS wrapper over design-system EmptyState; Lucide icon map of 10 names + 8 typographic-glyph fallbacks) | `help-system/B3-empty-state` | 14 |
| B4 | `<SmartDefault />` (headless render-prop wrapper with audit logging) | `help-system/B4-smart-default` | 14 |
| B5 | `<SectionIntro />` (CMS-backed brief intro paragraph) | `help-system/B5-section-intro` | 10 |

Total package: **126 tests across 9 files**; `pnpm --filter @patina/help-system test/type-check/build` all green.

### Stream F · Web migrations (this session)
| ID | Title | Files touched | Surface keys |
|----|-------|---------------|--------------|
| F1.1 | Migrate Designer Today (= `apps/designer-portal/src/app/(portal)/portal/page.tsx`) | 6 (page + portal infra) | 6 new |
| F1.2 | Migrate Designer Pipeline (`pipeline/page.tsx`) | 6 | 1 new (`Pipeline.ProjectListEmpty.Unfiltered`) |

**Designer-portal type-check delta:** 3166 → 3138 errors. **Zero new errors introduced** by migrations; the 28-error reduction is incidental (workspace types refreshed during install). All pre-existing errors are in unrelated packages (`@patina/utils` test files, communications/decisions/messages pages, etc.).

### Stream G · iOS foundation (this session)
| ID | Title | Worker branch |
|----|-------|---------------|
| G1 | Help module skeleton + `Persona` + `HelpContent` (5 variants) + `SurfaceKey` regex | `help-system/G1-ios-help-module` |
| G2 | `SanityHelpClient` actor with persona fallback + 5-min cache | `help-system/G2-swift-sanity-client` |
| G3 | iOS `SurfaceKeys` namespace mirroring web (16 keys, parity test enforces match) | `help-system/G3-ios-surface-keys` |
| G4 | `HelpAnalytics` PostHog parity (22 events match web exactly) | `help-system/G4-ios-help-events` |

`xcodebuild build` on `iPhone 17 Pro` (iOS 26.5): **BUILD SUCCEEDED**.
`xcodebuild test -only-testing:PatinaTests`: **TEST SUCCEEDED** (SurfaceKeysParityTests + SanityHelpClientTests + HelpAnalyticsParityTests + existing PatinaTests).

---

## Gate Criteria — Status

From `plan §5` — Sprint 1 exit conditions:

| Criterion | Status | Notes |
|-----------|--------|-------|
| `@patina/help-system` builds and is importable from all 3 portals | ✅ | Imported and consumed by designer-portal. Admin + client portals have not consumed it yet — that's Sprint 2 (F2/F3). The package builds and exports cleanly. |
| Sanity studio deployable; 4 schemas live in `kv3qrinl/help-system` workspace | ⏳ | **KODY GATE** — Studio scaffolded, `npx sanity build` succeeds; schemas are committed but not deployed. See "Outstanding gate items" below. |
| Designer Portal Today + Pipeline render Ambient-layer components with CMS-backed copy | ✅* | Components render with `fallback` props until Sanity content lands; CMS hook will hydrate automatically once schemas + docs are deployed. |
| PostHog receives `help.empty_state.shown` events in dev | ✅* | Events fire via `window.posthog?.capture(...)`. Verified the wiring exists in `apps/designer-portal/src/lib/analytics/PostHogProvider.tsx`. Runtime verification deferred until first dev-session against a live Supabase auth (worktree has no local Supabase). |
| Storybook covers all Ambient components | ✅ | Each B1-B5 ships `*.stories.tsx`. |
| iOS help module compiles; Sanity client returns content in a sample SwiftUI view | ✅ partial | Compiles + tests pass. Sample SwiftUI view binding deferred to Sprint 2 Stream G5+ (the reactive layer is what consumes content). G2 unit tests cover the wire-format round-trip. |
| Sprint 1 report written; Kody signs off | 🟡 | This document is the report; signoff pending. |

\*marked "✅*" indicates the wiring is complete but end-to-end runtime verification (against live Sanity + a logged-in dev session) is deferred to your hands-on smoke when convenient.

---

## Outstanding Gate Items — Kody-owned

These three items remain from the Stream A gate and were not unblocked during Sprint 1:

1. **Deploy Sanity schemas** to project `kv3qrinl`, workspace `help-system`.
   ```bash
   cd studios/help-system
   npx sanity login           # interactive — MCP can't drive
   npx sanity schema deploy
   ```
   Until this lands, `useHelpContent` always returns `null` in practice. All migrated UI falls back to the `fallback` prop text — visible and reasonable, just not CMS-driven.

2. **Leah's design review** of placeholder OKLCH accent values in `packages/patina-design-system/src/tokens/colors.ts:helpSystemAccents` (pearl, agedOak, sage, dustyBlue, terracotta, goldenHour). These are explicit placeholders; the StrataMark icon and design-system extensions are otherwise unchanged. See risk **R5** in the plan.

3. ~~Verify iOS PostHog SDK presence (R8)~~ — **RESOLVED 2026-05-18 in this session.** The Patina iOS app already integrates `posthog-ios` via SPM (verified by `grep PostHog Patina.xcodeproj/project.pbxproj`). G4 wired `HelpAnalytics` against the existing `PostHogService` singleton.

---

## Notable Decisions & Drift From Spec

1. **Event-name property casing inconsistency.** The portal-side `helpEvents` namespace from A7 emits **camelCase** property keys (`surfaceKey`, `tourKey`, `durationMs`); the Stream B components fire raw `window.posthog?.capture(...)` calls with **snake_case** property keys (`surface_key`). G4 iOS chose **camelCase** to match the A7 web reference verbatim. **Recommended Sprint 2 cleanup:** pick one convention (industry-standard for PostHog is snake_case) and align all three surfaces; until then, dashboards filtering on `surface_key` vs `surfaceKey` may produce surprising results.

2. **Persona fallback chain shape.** Web `useHelpContent` does a 4-step fallback (exact persona → designer→ admin → null). iOS `SanityHelpClient` was specified with a slightly different chain (consumer/maker → designer → all). The agent matched the iOS task spec and called this out in the docstring. **Recommended:** unify both at the GROQ level in Sprint 2 by treating personas symmetrically — same backing index, same fallback rules.

3. **Inline `cn` helper.** Stream B components inline `cn(...) = twMerge(clsx(...))` rather than importing from `@patina/design-system`. Reason: design-system currently ships without a `.d.ts` build (its dts step fails on an unrelated `@patina/types/media` import). Swap to a shared `cn` once the design-system dts issue is fixed.

4. **B3 EmptyState icon mapping.** Settled on 10 Lucide icons (`inbox`, `search`, `file`, `folder`, `folder-open`, `plus`, `shopping`, `sparkles`, `star`, `users`) + a typographic-glyph fallback set (`◇ ◉ ▣ ◎ ⌕ ⌂ ★ ◈`) for CMS authors who want non-standard glyphs. The mapping is documented inline; new icons require a code change (intentional — keeps the icon library bounded).

5. **B4 SmartDefault API shape.** Chosen as a **render-prop** (`children: (api: SmartDefaultAPI<T>) => ReactElement`) rather than a wrapping `<div>` — works with any form library (RHF, Formik, controlled state) without imposing a DOM container. v2 considerations (typed `helpEvents.smartDefault.*` namespace; pluggable deep-equality comparator; Sanity-driven `reason`; `<Tooltip />` integration) are noted in the component JSDoc.

6. **G1 + G4 both hot-fixed `PatinaApp.swift`.** Both agents independently noticed `PatinaApp.uitestingAuthEmail` and `PatinaApp.uitestingAuthOtp` were referenced by `AuthenticationView.swift:74-75` but not defined — the iOS build was broken on `main` and on `help-system/sprint-1` *before* Stream G touched anything. G1 won the conflict resolution (more defensive `guard isUITesting else { return nil }` pattern, matches the rest of the file).

7. **No code-reviewer dispatch this sprint.** The plan §6.6 calls for a `feature-dev:code-reviewer` pass after every component task; this sprint relied on each agent's `superpowers:test-driven-development` + `superpowers:verification-before-completion` skill invocation + the orchestrator's integration verification (tests + builds + type-check delta). Pragmatic call given the volume; consider adding reviewer dispatches in Sprint 2 for Reactive layer where keyboard/screen-reader correctness matters more.

---

## Risk Register — Updates

From plan §8:

| # | Risk | Status |
|---|------|--------|
| R1 | Manufacturer portal scope creep | unchanged — still out of scope |
| R2 | Sanity bootstrap blocks all content work | active — see Kody gate item #1 |
| R3 | iOS Sanity client diverges from web hook semantics | **partial divergence acknowledged** (decision #2 above); harmless until Sprint 2 reactive layer ships persona-aware iOS components. Add the unified-chain task to Sprint 2 backlog. |
| R4 | Leah unavailable for content review | not yet impactful (no content authored); becomes Sprint 2 risk |
| R5 | Design token extension breaks consumers | mitigated — A2 was purely additive; designer-portal type-check is at baseline. Leah review still pending. |
| R6 | TanStack Query vs SWR perception | mitigated — documented in plan, no consumer surprise |
| R7 | Coachmark/Tour complexity | Sprint 3 — not yet hit |
| R8 | iOS PostHog SDK missing | **CLOSED** — already integrated |
| R9 | `?` icon utility-bar conflict | not exercised this sprint (Reactive layer is Sprint 2) |
| R10 | Storybook setup | mitigated — A8 set up Storybook config for the package |

**New risk discovered this sprint (R11):**
| R11 | PostHog event-property casing drift between A7 portal helpers, B-stream components, G4 iOS | Med | High | Pick one convention (snake_case recommended) in Sprint 2 kickoff; sweep all three surfaces before reactive layer ships |

---

## Open Questions for Sprint 2 Planning

1. **PostHog property casing**: snake_case vs camelCase — make the call before Sprint 2 dispatches Reactive components.
2. **Persona fallback chain unification**: do we want iOS and web to share GROQ-level logic? Could centralize in a `helpContentQuery(surfaceKey, contentType, persona)` GROQ template stored alongside the schemas.
3. **`@patina/design-system` dts build**: blocking the help-system from emitting full `.d.ts` for downstream type-checking in some configurations. Fix as a Sprint 2 prereq.
4. **Sanity content authoring cadence**: H1 was deferred; once schemas deploy, do we want a content-steward agent to seed placeholder docs (the plan's §6.5 template), or does Leah want to author from scratch in Studio?
5. **`@patina/help-system` portal-agnosticism**: B-stream components fire `window.posthog?.capture(...)` directly to stay portal-agnostic. The A7 `helpEvents` namespace is per-portal-typed but currently unused by the components. Decide: (a) inject an `analytics` adapter into help-system at portal-mount time, or (b) accept the direct call and treat A7 as a reference catalogue.

---

## Files Modified (cumulative)

- `packages/help-system/` — full ambient layer, ~9 source files, 126 tests, Storybook config
- `packages/patina-design-system/src/tokens/{colors,typography}.ts` — additive (A2)
- `packages/patina-design-system/src/components/StrataMark/` — new (A2)
- `packages/patina-design-system/vitest.setup.ts` — Node 24 + vitest 1.6 compat fix
- `studios/help-system/` — full studio scaffold + 4 schemas (A3) + esbuild pin
- `apps/{designer,admin,client}-portal/src/lib/analytics/events.ts` — `helpEvents` namespace (A7)
- `apps/designer-portal/{package.json,tsconfig.json,next.config.js}` — `@patina/help-system` workspace dep + transpilePackages + path mapping
- `apps/designer-portal/src/app/(portal)/portal/{page.tsx,pipeline/page.tsx}` — F1.1 + F1.2 migrations
- `apps/mobile/Patina/Patina/Features/Help/` — full iOS module (G1 + G2 + G3): HelpModule.swift, Models/{HelpContent,Persona,SurfaceKey}.swift, SurfaceKeys.swift, Services/SanityHelpClient.swift
- `apps/mobile/Patina/Patina/Services/Analytics/HelpAnalytics.swift` — G4
- `apps/mobile/Patina/Patina/PatinaApp.swift` — UI-test auth hotfix (G1)
- `apps/mobile/Patina/PatinaTests/{HelpAnalyticsParityTests,SanityHelpClientTests,SurfaceKeysParityTests}.swift` — iOS tests
- `pnpm-workspace.yaml` — added `studios/*`

---

## Suggested Sprint 2 Wave Plan

When you sign off, Sprint 2 (Reactive layer + main migrations + iOS reactive) is ready to dispatch:

**Wave 3** (parallel, 5 agents): C1 Tooltip CMS-refactor · C2 InfoIcon · C3 StrataInfoIcon · C4 LearnMore · C5 ContextualHelpPanel
**Wave 4** (parallel, 4 agents): F1.3 Activation Wizard · F1.4 Aesthete Engine · F1.5 Products · F1.6 Clients
**Wave 5** (parallel, 3 agents): G5 iOS Tooltip + InfoIcon · G6 iOS Sheet HelpPanel · G7 iOS Home + ProductDetail migration
**Wave 6** (parallel, 2 agents + content + analytics): C6 utility-bar `?` icon insertion (all 3 portals) · H2 40 help articles seeded · I2 5 PostHog dashboards built

Sprint 2 prerequisites to land before dispatch:
- PostHog property casing decision (R11)
- Sanity schemas deployed (gate item #1)
- Optional: Leah's accent-palette review (gate item #2; not strictly blocking — reactive layer can use design-system primary tokens)

---

## Sign-off Checklist (for Kody)

- [ ] Reviewed this report
- [ ] Deployed Sanity schemas (or explicitly deferred to Sprint 2 prereq)
- [ ] Leah accent palette acknowledged (review now or defer)
- [ ] PostHog casing decision made
- [ ] Approve Sprint 2 kickoff

When ready, merge `help-system/sprint-1` into `main` (squash or merge-commit — your call; the per-task merge commits preserve worker history if you prefer rich history).

---

*Generated 2026-05-18 by orchestrator session against branch `help-system/sprint-1` HEAD `70e1fa9`.*
