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
    // ─── Clients (F1.6 — Stream F.1.6 in Sprint 2) ────────────────────────────
    //
    // The Designer Portal Clients screen has two surfaces: a list/directory at
    // /portal/clients and a per-client profile at /portal/clients/[id]. Help
    // moments here cover:
    //
    //   • Section intros — what the page is for at a glance (Root, ListIntro).
    //   • Empty states  — two distinct CMS-authored variants so the first-time
    //     designer sees onboarding copy ("Add your first client") while a
    //     search-with-no-matches gets a different "Try a different search" message.
    //   • Field labels / helpers — every Add-Client form field plus the
    //     contact rows on the profile page.
    //   • Metric tooltips — Patina concepts on the profile page (lifetime
    //     value, project count, first project) get explanatory tooltips so the
    //     designer knows what each measures and how it's computed.
    //   • StrataInfoIcon — Patina-specific concepts on the profile (Style DNA,
    //     Aesthete Profile, Relationship Journey) get the Strata icon per
    //     spec §4.2.
    //
    // Keys follow the portal/section/component[/state] convention from
    // surfaceKeys.ts header. The `contact/*` and `metric/*` and `empty/*`
    // subspaces let authors organize the Sanity workspace by surface family.
    Clients: {
      // Root surface key for the Clients section (used by the list page intro
      // wrapper + as the parent in any analytics breakdowns by route).
      Root:      'designer-portal/clients/root',
      // SectionIntro slot below the "Clients" heading on the list page.
      ListIntro: 'designer-portal/clients/list-intro',
      Empty: {
        // Zero clients in the workspace at all (first-time designer).
        NoClients:        'designer-portal/clients/empty/no-clients',
        // Search query returned no matches (different copy from above).
        NoSearchResults:  'designer-portal/clients/empty/no-search-results',
      },
      // Add-Client form field helpers — one per input. Keys are stable per
      // field name (not per dialog instance) so renaming a field requires
      // touching this file first.
      Contact: {
        // Profile-page Contact section heading (the whole rows-of-contact
        // block, not any individual row). Distinct from the per-field
        // helpers below so authors can write section-level vs. field-level
        // copy independently per spec §8.
        Section: 'designer-portal/clients/contact/section',
        Name:    'designer-portal/clients/contact/name',
        Email:   'designer-portal/clients/contact/email',
        Source:  'designer-portal/clients/contact/source',
        Notes:   'designer-portal/clients/contact/notes',
        Invite:  'designer-portal/clients/contact/invite',
        // Profile-page contact rows (display fields, not inputs). FieldHelper
        // explains the provenance / privacy of each piece of contact info.
        Phone:             'designer-portal/clients/contact/phone',
        Location:          'designer-portal/clients/contact/location',
        PreferredContact:  'designer-portal/clients/contact/preferred-contact',
      },
      // Relationship metrics on the profile page. Tooltips explain "what this
      // measures" so the designer doesn't have to guess whether the number
      // includes proposals, refunds, etc.
      Metric: {
        LifetimeValue:  'designer-portal/clients/metric/lifetime-value',
        ProjectCount:   'designer-portal/clients/metric/project-count',
        FirstProject:   'designer-portal/clients/metric/first-project',
      },
      // Patina-specific concepts that earn the Strata icon (spec §4.2).
      Concept: {
        StyleDna:            'designer-portal/clients/concept/style-dna',
        RelationshipJourney: 'designer-portal/clients/concept/relationship-journey',
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
