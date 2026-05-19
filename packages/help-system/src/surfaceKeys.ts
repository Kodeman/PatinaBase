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
