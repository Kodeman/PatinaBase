# @patina/help-system-studio

Sanity Studio for the Patina Help & Guidance System.

This workspace manages all contextual help copy — tooltips, field helpers, empty states, and long-form articles — that appears across `designer-portal`, `admin-portal`, and `client-portal`. Content is fetched at runtime by surface key using the `useHelpContent` hook in `@patina/help-system`.

## Project details

| Key | Value |
|-----|-------|
| Sanity project ID | `kv3qrinl` |
| Dataset | `production` |
| Workspace name | `help-system` |
| Studio base path | `/help-system` |

## Local development

```bash
# From this directory
pnpm dev
```

The studio runs at `http://localhost:3333/help-system`. You must be authenticated with Sanity (`sanity login`) before editing content.

## Building

```bash
pnpm build
```

Produces a static site in `dist/`. This does not deploy to Sanity — it produces local build output for CI verification.

## Deploying

```bash
pnpm deploy
```

Deploys the studio to `https://kv3qrinl.sanity.studio`. Requires Sanity credentials with deploy rights on project `kv3qrinl`.

**Deployment is normally triggered by the orchestrator/CI, not by individual engineers.** See the master plan at `/Users/kody/.claude/plans/review-the-documenation-for-compressed-shore.md`.

## Schema overview

| Schema | Purpose | Key constraints |
|--------|---------|----------------|
| `helpContent` | Base document type. Every piece of help content starts here. | `surfaceKey` required, regex-validated. `contentType` required. Inline sub-objects for each type (conditionally shown). |
| `tooltipContent` | Standalone tooltip documents (used for dedicated list views). | `body` required, max 160 chars. |
| `emptyStateContent` | Standalone empty-state documents. | `heading` required max 50, `description` required max 300. |
| `helpArticleContent` | Long-form articles rendered in the Contextual Help Panel. | `title` + `oneSentenceAnswer` + `body` required. `wordCount`, `readingTimeMinutes`, `lastUpdated` are read-only (auto-set). |
| `coachmarkContent` | Standalone coachmark documents (Sprint 4 S4-4). | `heading` required max 60, `body` required max 120, `ctaLabel` optional max 20. |

### `helpContent` inline design

Rather than requiring editors to create a separate `tooltipContent` document and then reference it from `helpContent`, the `helpContent` schema embeds type-specific fields as conditional inline objects (`tooltipContent`, `emptyStateContent`, `helpArticleContent`). Fields for non-selected types are hidden. This keeps all content for a given surface key in one document, which simplifies GROQ queries and the `useHelpContent` hook (single fetch, no join).

## Sprint 4 S4-4 — coachmark schema migration

Adds a dedicated `coachmarkContent` object (`heading + body + ctaLabel`) so coachmark surfaces can express the richer copy shape modelled by the iOS + web `CoachmarkContent` types. Previously coachmark docs reused the shared `tooltipContent` block (eyebrow + body).

### Apply the schema

```bash
cd studios/help-system
npx sanity@latest schema deploy
```

This registers the new inline `coachmarkContent` field on `helpContent` plus the standalone `coachmarkContent` document type.

### Migrate the 8 existing tour docs

After the schema is deployed, run the migration GROQ mutations below to copy `tooltipContent.{eyebrow,body}` into `coachmarkContent.{heading,body}` for the existing 5 designer-portal tour docs and 3 iOS first-launch tour docs. Each step intentionally leaves the legacy `tooltipContent` block in place during the transition; once verified, those legacy blocks can be unset with `unset: ["tooltipContent"]`.

```bash
# Inside studios/help-system — uses the @sanity/client built into the studio
npx sanity@latest exec --with-user-token ./scripts/migrate-coachmark-s4-4.ts
```

| _id | surfaceKey | persona | new heading / body |
|---|---|---|---|
| `6851cebe-20e0-4f64-9ef5-5d3272bebaf9` | `designer-portal/tours/first-project-walkthrough/step-1-today` | designer | "Welcome to your Today" / "Each morning starts here. Your pinned project, decisions due, and what your team's waiting on." |
| `3c7629b8-a8dc-4286-81d5-727f14da9d46` | `designer-portal/tours/first-project-walkthrough/step-2-pipeline` | designer | "Your projects, by stage" / "Leads, proposals, active, and completed. Drag to move stages or click for a project's full picture." |
| `ae337117-3144-4a44-bd92-72d0d45617fe` | `designer-portal/tours/first-project-walkthrough/step-3-aesthete` | designer | "The Aesthete Engine" / "Aesthete tracks the design tension across your work and surfaces opportunities to push or pull back." |
| `406275b2-60f3-4aaf-9492-fad7ba09fb8e` | `designer-portal/tours/first-project-walkthrough/step-4-products-capture` | designer | "Capture once, use everywhere" / "Your captured products live here — search, filter, and add them to any room in any project." |
| `ae7288f1-aa7f-4ed8-be51-d881e768c14c` | `designer-portal/tours/first-project-walkthrough/step-5-profile` | designer | "Your space" / "Settings, team, billing, and your designer profile — what clients see when you share a project." |
| `cb2047b7-8ea6-4b6b-9f4d-12e2e66b9c54` | `ios-app/first-launch-tour/step-1-home` | consumer | "Welcome to Patina" / "Your home design board. Today is what's pinned, Saved is the heart, and Profile is where settings live." |
| `afb0ff70-4aa0-4d2d-ae11-e16a769160f1` | `ios-app/first-launch-tour/step-2-saved` | consumer | "Your saved finds" / "Tap the heart on any product to save it. Saved items follow you across devices and into project rooms." |
| `6581a570-0c16-487d-b50a-b3950b5f6f71` | `ios-app/first-launch-tour/step-3-profile` | consumer | "Your account" / "Notification settings, scan history, designer access, and sign-out all live in Profile." |

`ctaLabel` is intentionally left undefined for all eight — pilot-time addition.

## PT-D-2-T6-2 — Decisions dashboard help content

Authors the 9 `helpContent` documents for the Designer-Portal **Decisions**
dashboard (`/portal/decisions`). Until these exist the page renders only the
inline `fallback` strings hard-coded in the page component; seeding promotes
that copy (refined) into Sanity so it is editable without a deploy and so the
persona-fallback chain has a base to resolve to.

The copy lives in `scripts/decisions-help-content.json` (single source of
truth, shared by both runners below). Surfaces:

| contentType | surfaceKey | Component |
|---|---|---|
| `fieldHelper` | `designer-portal/decisions/list-intro` | `<SectionIntro>` |
| `tooltip` | `designer-portal/decisions/metric/open-decisions` | `<StrataInfoIcon>` |
| `tooltip` | `designer-portal/decisions/metric/overdue` | `<StrataInfoIcon>` |
| `tooltip` | `designer-portal/decisions/metric/avg-response` | `<StrataInfoIcon>` |
| `tooltip` | `designer-portal/decisions/metric/resolution-rate` | `<StrataInfoIcon>` |
| `emptyState` | `designer-portal/decisions/empty/all-open` | `<EmptyState>` |
| `emptyState` | `designer-portal/decisions/empty/overdue` | `<EmptyState>` |
| `emptyState` | `designer-portal/decisions/empty/due-this-week` | `<EmptyState>` |
| `emptyState` | `designer-portal/decisions/empty/resolved` | `<EmptyState>` |

All docs are `persona: 'all'` (the dashboard fetches with the default persona),
use deterministic `_id`s (`helpContent.<slug>`) so re-runs `createOrReplace`
rather than duplicate, and respect the schema caps (tooltip body ≤160, empty
heading ≤50, empty description ≤300). The registry already declares these keys
under `SurfaceKeys.DesignerPortal.Decisions.*`; no schema change is needed
(`surfaceKey` is a regex-validated string, not an enum).

```bash
# Inside studios/help-system — preferred (uses the studio's @sanity/client)
npx sanity@latest exec --with-user-token ./scripts/seed-decisions-help.ts            # dry run
npx sanity@latest exec --with-user-token ./scripts/seed-decisions-help.ts --commit   # write

# Token-based runner (CI / no interactive session). Dry run needs no token or
# @sanity/client — it validates the content offline.
node ./scripts/run-decisions-help-seed.mjs                              # dry run
SANITY_AUTH_TOKEN=<token> node ./scripts/run-decisions-help-seed.mjs --commit  # write
```

## Spec reference

Full content architecture is documented in:

```
docs/prds/Guide/patina-help-guidance-engineering-handoff.md
```

Section 7 covers schemas; Section 8 covers writing standards that content editors must follow.
