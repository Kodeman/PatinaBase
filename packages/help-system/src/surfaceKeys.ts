/**
 * Surface Keys — Source of Truth
 *
 * Every help moment in Patina is identified by a surface key.
 * Format: portal/section/component[/state] — lowercase, kebab-case, slash-separated.
 *
 * Rules (spec Section 6.2):
 * - MUST follow portal/section/component[/state] hierarchy
 * - MUST be unique across the entire system
 * - MUST be added to the Sanity CMS schema enum when a new key is created
 * - Every new key MUST be defined here BEFORE being referenced in a component
 *
 * iOS surface keys live in a parallel Swift registry under apps/mobile/Patina/Features/Help/.
 * Web and iOS keys are intentionally separate namespaces — content for shared concepts
 * is stored in Sanity once but referenced by either web or iOS key.
 *
 * Out-of-scope portals (not included here):
 * - manufacturer-portal — out of scope per 2026-05-18 decision
 * - consumer-app (iOS) — handled by a separate Swift registry in Stream G
 */

export const SurfaceKeys = {
  DesignerPortal: {
    Today: {
      Dashboard: 'designer-portal/today/dashboard',
      EmptyState: 'designer-portal/today/empty-state',
      // Per-section intros rendered beneath each section header on /portal.
      // Added in F1.1 (designer-portal Today migration). See spec §9.2.
      Intro: {
        OverdueDecisions: 'designer-portal/today/intro/overdue-decisions',
        Leads:            'designer-portal/today/intro/leads',
        ActiveWork:       'designer-portal/today/intro/active-work',
      },
      // Per-section empty states — distinct surfaces so authors can write
      // bespoke copy per zero-state rather than reusing one bucket.
      Empty: {
        OverdueDecisions: 'designer-portal/today/empty/overdue-decisions',
        Leads:            'designer-portal/today/empty/leads',
        ActiveWork:       'designer-portal/today/empty/active-work',
      },
    },
    Pipeline: {
      ProjectList: 'designer-portal/pipeline/project-list',
      ProjectListEmpty: {
        Leads:      'designer-portal/pipeline/project-list/empty-leads',
        Proposals:  'designer-portal/pipeline/project-list/empty-proposals',
        Active:     'designer-portal/pipeline/project-list/empty-active',
        Completed:  'designer-portal/pipeline/project-list/empty-completed',
        // Unfiltered: shown when the Pipeline page renders with no `stage` filter
        // applied and no items in any stage. The 4 stage-scoped keys above remain
        // the spec-mandated variants per §6; this 5th key covers the all-stages
        // empty surface so a first-time designer doesn't see a silent blank list.
        Unfiltered: 'designer-portal/pipeline/project-list/empty-unfiltered',
      },
      StageDefinitions: {
        Leads:     'designer-portal/pipeline/stage/leads',
        Proposals: 'designer-portal/pipeline/stage/proposals',
        Active:    'designer-portal/pipeline/stage/active',
        Completed: 'designer-portal/pipeline/stage/completed',
      },
      // The Activation Wizard, Project Detail zones, FF&E, Decisions, etc. land in Sprint 2
      // A4 amendments — do NOT pre-populate them in this task to keep the file scoped to
      // Sprint 1 surfaces.
    },
    Aesthete: {
      Overview:       'designer-portal/aesthete/overview',
      Score:          'designer-portal/aesthete/score-meaning',
      EngineOverview: 'designer-portal/aesthete/engine-overview',
    },
    // Products surface — the Designer Portal renders products under the
    // `/portal/catalog` route, but the page itself is titled "Products" and
    // is the designer's primary product workspace. We use the user-facing
    // name in the registry so authors writing Sanity copy aren't confused
    // by the internal route slug. Added in F1.5.
    //
    // Spec references:
    //   §6.2 — surface-key shape (portal/section/component[/state])
    //   §9.2 — Designer Portal section coverage
    //   §12.4 — QA checklist (this migration's acceptance criteria)
    Products: {
      // Page root — used by SurfaceKeyProvider for the products list page
      // and any analytics that need a stable identifier for the surface.
      Root:      'designer-portal/products/root',
      // Section intro rendered beneath the "Products" page header.
      ListIntro: 'designer-portal/products/list-intro',
      Empty: {
        // Designer hasn't captured any products yet.
        NoProducts:      'designer-portal/products/empty/no-products',
        // Designer has products but no rows match the current filters.
        NoFilterResults: 'designer-portal/products/empty/no-filter-results',
      },
      // Per-filter tooltips on the tier + refine bars. Surfaced by the
      // Tooltip + InfoIcon components — copy explains what each tier means
      // and where each filter is sourced.
      Filter: {
        AllProducts:    'designer-portal/products/filter/all-products',
        MakerPiece:     'designer-portal/products/filter/maker-piece',
        DesignersPick:  'designer-portal/products/filter/designers-pick',
        Sourced:        'designer-portal/products/filter/sourced',
        NeedsTeaching:  'designer-portal/products/filter/needs-teaching',
        Drafts:         'designer-portal/products/filter/drafts',
        Style:          'designer-portal/products/filter/style',
        Category:       'designer-portal/products/filter/category',
      },
      // Detail-page surfaces — page-level intro and per-section intros.
      // FieldHelper-on-spec-row migrations are deferred (catalog-ui is a
      // shared package consumed by admin-portal too; deeper threading is
      // tracked separately).
      Detail: {
        Root:   'designer-portal/products/detail/root',
        Intro:  'designer-portal/products/detail/intro',
        Specs: {
          // Placeholder for spec field helpers once catalog-ui exposes the
          // surfaceKey prop for individual fields. Pre-registered so authors
          // can begin drafting copy before the component-level migration.
          Dimensions: 'designer-portal/products/detail/specs/dimensions',
          Materials:  'designer-portal/products/detail/specs/materials',
          Finish:     'designer-portal/products/detail/specs/finish',
          Assembly:   'designer-portal/products/detail/specs/assembly',
          LeadTime:   'designer-portal/products/detail/specs/lead-time',
          TradePrice: 'designer-portal/products/detail/specs/trade-price',
        },
        // Patina-specific concepts on the detail page — surfaced via
        // <StrataInfoIcon /> per spec §4.2 (Patina-coined vocabulary).
        Concepts: {
          Tier:               'designer-portal/products/detail/concept/tier',
          FoundingCircle:     'designer-portal/products/detail/concept/founding-circle',
          Provenance:         'designer-portal/products/detail/concept/provenance',
        },
      },
      // Capture flow — the Designer Portal exposes two capture entry points:
      // `/portal/catalog/new` (manual single product) and `/portal/catalog/import`
      // (bulk CSV). Each step gets its own surface so authors can write
      // step-specific copy.
      Capture: {
        New: {
          Root:    'designer-portal/products/capture/new/root',
          Intro:   'designer-portal/products/capture/new/intro',
          Photos:  'designer-portal/products/capture/new/photos',
        },
        Import: {
          Root:    'designer-portal/products/capture/import/root',
          Upload:  'designer-portal/products/capture/import/upload',
          Mapping: 'designer-portal/products/capture/import/mapping',
          Preview: 'designer-portal/products/capture/import/preview',
        },
      },
    },
  },
  AdminPortal: {
    // Sprint 1: only the minimum to prove the namespace works. Migrations in Sprint 3.
    Dashboard: 'admin-portal/dashboard',
  },
  ClientPortal: {
    // Sprint 1: only the minimum.
    Home: 'client-portal/home',
  },
} as const

/**
 * A flattened union of every key value, useful for downstream type-narrowing
 * (e.g., on Sanity content fetches, you can constrain surfaceKey to known values).
 */
export type SurfaceKey = ExtractValues<typeof SurfaceKeys>

/**
 * Helper that flattens a deeply nested const object into a union of its string-leaf values.
 * Internal — do not export from index.
 */
type ExtractValues<T> =
  T extends string ? T :
  T extends Record<string, unknown> ? ExtractValues<T[keyof T]> :
  never

/**
 * Regex that every valid surface key must satisfy.
 * Pattern: one or more lowercase-alphanumeric-or-hyphen segments, separated by forward slashes.
 * At minimum two segments are required (portal/section).
 */
export const SURFACE_KEY_REGEX = /^[a-z0-9-]+(\/[a-z0-9-]+)+$/

/**
 * Type guard. Useful at the boundary where a string from Sanity arrives
 * and we want to assert it conforms to the surface-key shape.
 */
export function isSurfaceKey(value: unknown): value is SurfaceKey {
  return typeof value === 'string' && SURFACE_KEY_REGEX.test(value)
}
