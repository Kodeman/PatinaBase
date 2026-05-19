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
 * iOS surface keys live in a parallel Swift registry under apps/mobile/Patina/Features/Help/
 * AND are mirrored here under `IOSApp` so the parity test, Sanity authoring tools, and any
 * cross-platform tooling can reason about both platforms with one source. Every iOS-app
 * surface declared here MUST have an identical Swift constant in `SurfaceKeys.swift`.
 *
 * Out-of-scope portals (not included here):
 * - manufacturer-portal — out of scope per 2026-05-18 decision
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
    },
    /**
     * Activation Wizard — the 7-step new-project flow (Sprint 2 F1.3).
     *
     * Per spec §9.2 ("Designer Portal · Project Activation Wizard — the
     * priority surface"), every step gets a step-level surface key, every
     * field gets a FieldHelper, Patina-specific concepts (Aesthete, FF&E,
     * Strata Mark, visibility tiers, contingency, milestone triggers) use
     * <StrataInfoIcon>, general "what does this mean?" questions use
     * <InfoIcon>, and the smart defaults (default phase set, contingency 10%,
     * visibility = milestone) advertise themselves via SmartDefault.
     *
     * Key shape mirrors the spec example (`designer-portal/wizard/step-1-basics`)
     * but is namespaced under `activation-wizard/` so the registry leaves
     * room for the future Aesthete Onboarding / Studio Setup wizards without
     * collision.
     */
    ActivationWizard: {
      Root: 'designer-portal/activation-wizard',
      // Step intros — copy under each step header
      StepIntro: {
        Basics:     'designer-portal/activation-wizard/step-1-basics/intro',
        Scope:      'designer-portal/activation-wizard/step-2-scope/intro',
        Schedule:   'designer-portal/activation-wizard/step-3-schedule/intro',
        Financials: 'designer-portal/activation-wizard/step-4-financials/intro',
        Team:       'designer-portal/activation-wizard/step-5-team/intro',
        Access:     'designer-portal/activation-wizard/step-6-access/intro',
        Review:     'designer-portal/activation-wizard/step-7-review/intro',
      },
      // Step 1 — Basics (4 fields)
      Step1Basics: {
        Root:               'designer-portal/activation-wizard/step-1-basics',
        ProjectName:        'designer-portal/activation-wizard/step-1-basics/project-name',
        ProjectAddress:     'designer-portal/activation-wizard/step-1-basics/project-address',
        Client:             'designer-portal/activation-wizard/step-1-basics/client',
        LeadDesigner:       'designer-portal/activation-wizard/step-1-basics/lead-designer',
      },
      // Step 2 — Scope & rooms (5 fields + empty + section concepts)
      Step2Scope: {
        Root:           'designer-portal/activation-wizard/step-2-scope',
        Empty:          'designer-portal/activation-wizard/step-2-scope/empty-rooms',
        RoomName:       'designer-portal/activation-wizard/step-2-scope/room-name',
        RoomType:       'designer-portal/activation-wizard/step-2-scope/room-type',
        RoomDimensions: 'designer-portal/activation-wizard/step-2-scope/room-dimensions',
        RoomBudget:     'designer-portal/activation-wizard/step-2-scope/room-budget',
        // Patina concept: FF&E categories
        FfeCategories:  'designer-portal/activation-wizard/step-2-scope/ffe-categories',
      },
      // Step 3 — Schedule & phases (6 default phases + kickoff)
      Step3Schedule: {
        Root:             'designer-portal/activation-wizard/step-3-schedule',
        KickoffDate:      'designer-portal/activation-wizard/step-3-schedule/kickoff-date',
        ExpectedEnd:      'designer-portal/activation-wizard/step-3-schedule/expected-completion',
        Phases:           'designer-portal/activation-wizard/step-3-schedule/phases',
        PhaseName:        'designer-portal/activation-wizard/step-3-schedule/phase-name',
        PhaseDuration:    'designer-portal/activation-wizard/step-3-schedule/phase-duration',
        PhaseGate:        'designer-portal/activation-wizard/step-3-schedule/phase-gate-condition',
      },
      // Step 4 — Financials (7 concepts)
      Step4Financials: {
        Root:                 'designer-portal/activation-wizard/step-4-financials',
        BudgetTotal:          'designer-portal/activation-wizard/step-4-financials/budget-total',
        DesignFee:            'designer-portal/activation-wizard/step-4-financials/design-fee',
        Contingency:          'designer-portal/activation-wizard/step-4-financials/contingency',
        Milestones:           'designer-portal/activation-wizard/step-4-financials/milestones',
        MilestoneLabel:       'designer-portal/activation-wizard/step-4-financials/milestone-label',
        MilestonePercentage:  'designer-portal/activation-wizard/step-4-financials/milestone-percentage',
        MilestoneAmount:      'designer-portal/activation-wizard/step-4-financials/milestone-amount',
        MilestoneTrigger:     'designer-portal/activation-wizard/step-4-financials/milestone-trigger',
        EmptyMilestones:      'designer-portal/activation-wizard/step-4-financials/empty-milestones',
      },
      // Step 5 — Team & vendors (currently scaffolded)
      Step5Team: {
        Root:               'designer-portal/activation-wizard/step-5-team',
        SupportDesigners:   'designer-portal/activation-wizard/step-5-team/support-designers',
        VendorAssignments:  'designer-portal/activation-wizard/step-5-team/vendor-assignments',
        EmptyTeam:          'designer-portal/activation-wizard/step-5-team/empty-team',
        EmptyVendors:       'designer-portal/activation-wizard/step-5-team/empty-vendors',
      },
      // Step 6 — Client access (3 visibility tiers — all Patina concepts)
      Step6Access: {
        Root:               'designer-portal/activation-wizard/step-6-access',
        VisibilityTier:     'designer-portal/activation-wizard/step-6-access/visibility-tier',
        TierFull:           'designer-portal/activation-wizard/step-6-access/tier-full',
        TierMilestone:      'designer-portal/activation-wizard/step-6-access/tier-milestone',
        TierCurated:        'designer-portal/activation-wizard/step-6-access/tier-curated',
      },
      // Step 7 — Review and activate (final summary surface)
      Step7Review: {
        Root:               'designer-portal/activation-wizard/step-7-review',
        ActivationOutcome:  'designer-portal/activation-wizard/step-7-review/activation-outcome',
      },
    },
    Aesthete: {
      Overview:       'designer-portal/aesthete/overview',
      Score:          'designer-portal/aesthete/score-meaning',
      EngineOverview: 'designer-portal/aesthete/engine-overview',
      // F1.4 additions — Aesthete Engine surface (route: /portal/companion).
      // The Aesthete Engine ships as a Companion-style conversational surface
      // where designers refine the ML model that powers personalized matches.
      // Per spec §4.2 + §9.2 Phase-2, every Aesthete concept on this screen
      // gets a StrataInfoIcon and the deep "how it works" story collapses
      // behind a LearnMore. See SurfaceKeys.DesignerPortal.Aesthete.* below.
      Engine: {
        // Page-level intro rendered under the H1.
        Intro:       'designer-portal/aesthete/engine/intro',
        // Deep dive — collapsible LearnMore explaining how the engine learns
        // from teaching sessions and the data-use story (spec §9.2 line 982).
        HowItWorks:  'designer-portal/aesthete/engine/how-it-works',
      },
      // Per-suggestion category prompts surfaced on the empty Companion canvas.
      // Each is a Patina-vocab moment (style profile, vocabulary, match) so
      // they're tooltip-eligible surfaces even though we render them as chips.
      QuickActions: {
        Intro:       'designer-portal/aesthete/quick-actions/intro',
      },
      // Empty state shown before a designer has run a single teaching turn.
      // Distinct from generic Companion empties so authors can write Aesthete-
      // specific copy (spec §9.2 Phase-2 "Empty teaching session state").
      EmptyTeaching: 'designer-portal/aesthete/empty-teaching',
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
    /**
     * Tours — onboarding coachmark sequences (Sprint 3 D5).
     *
     * Per spec §1 ("First Project Walkthrough is optional and skippable on
     * every step") and the glossary entry for "Tour" (line 1398), the Designer
     * Portal ships a single canonical tour today: First Project Walkthrough.
     *
     * Each step is a coachmark surface authored in Sanity. Step keys live
     * under `tours/first-project-walkthrough/` so the registry can grow to
     * cover follow-up tours (e.g. an Aesthete deep-dive, a Capture refresher)
     * without renaming the active one. The `Root` key represents the tour
     * as a whole and is the surface used by analytics events (tour_start /
     * tour_complete / tour_skip) per spec line 1142.
     */
    Tours: {
      Root: 'designer-portal/tours',
      FirstProjectWalkthrough: {
        Root:                'designer-portal/tours/first-project-walkthrough',
        Step1Today:          'designer-portal/tours/first-project-walkthrough/step-1-today',
        Step2Pipeline:       'designer-portal/tours/first-project-walkthrough/step-2-pipeline',
        Step3Aesthete:       'designer-portal/tours/first-project-walkthrough/step-3-aesthete',
        Step4ProductsCapture:'designer-portal/tours/first-project-walkthrough/step-4-products-capture',
        Step5Profile:        'designer-portal/tours/first-project-walkthrough/step-5-profile',
      },
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
  /**
   * Client Portal — the homeowner / consumer web surface (Sprint 3 Stream F3).
   *
   * Persona context: `'consumer'`. The voice is conversational and hospitality-
   * oriented, not designer-jargon. Per spec §8 (Writing Standards), Patina-
   * internal terms (FF&E, Aesthete, Founding Circle, etc.) MUST be either
   * avoided or explained in consumer terms here. The CMS-side persona variants
   * carry the voice difference; the keys themselves are voice-agnostic and
   * mirror the structure designers use so authoring tooling stays consistent.
   *
   * Spec refs:
   *   - §6.2 — surface-key shape (portal/section/component[/state])
   *   - §8   — Writing Standards (consumer voice characteristics)
   *   - §9.2 — F3 client-portal full pass
   *   - §12.4 — QA acceptance checklist
   *
   * Note on backwards compatibility: Sprint 1 shipped a single literal
   *   ClientPortal.Home = 'client-portal/home'
   * which the C6 client-header HelpButton still references via the pathname
   * mapper. The new shape preserves that literal as `Home.Root` so any seeded
   * Sanity content keyed on `client-portal/home` keeps resolving; downstream
   * code paths use the nested form going forward.
   */
  ClientPortal: {
    Home: {
      // Page root — what the C6 HelpButton + pathname mapper resolve to.
      Root: 'client-portal/home',
      // Section intro beneath the "Today" / "Curated for you" hero on /today.
      GreetingIntro: 'client-portal/home/greeting-intro',
      // Section heading for the "For your rooms" daily feed.
      RoomsFeedIntro: 'client-portal/home/rooms-feed-intro',
      Empty: {
        // No daily story available yet.
        NoStory:  'client-portal/home/empty/no-story',
        // No rooms captured (homeowner hasn't run the iOS app).
        NoRooms:  'client-portal/home/empty/no-rooms',
      },
    },
    // ─── Projects — the homeowner's project list + per-project view ───────
    //
    // The list at /projects is the homeowner's primary landing surface (the
    // bare `/` redirects to /projects). Each card opens the project view at
    // /projects/[projectId]. Per spec §8 the voice is hospitality-oriented
    // ("Your projects" / "your designer"), not pro lingo ("the pipeline").
    Projects: {
      Root:      'client-portal/projects/root',
      ListIntro: 'client-portal/projects/list-intro',
      Empty: {
        // First-time homeowner — no active projects yet. Most common landing
        // state for a freshly-invited client.
        NoProjects: 'client-portal/projects/empty/no-projects',
      },
      Detail: {
        // Page-level intro for /projects/[projectId].
        Root:           'client-portal/projects/detail/root',
        // Section intro for the project timeline view.
        TimelineIntro:  'client-portal/projects/detail/timeline-intro',
        // Section intro for the budget summary (when shown to homeowner).
        BudgetIntro:    'client-portal/projects/detail/budget-intro',
        // Section intro for the approvals list (decisions awaiting client).
        ApprovalsIntro: 'client-portal/projects/detail/approvals-intro',
      },
    },
    // ─── Rooms (the homeowner's term for "scans") ──────────────────────────
    //
    // Internally we call them room scans; in consumer copy we say "rooms" or
    // "captured rooms" — the iOS app is the capture surface. Empty state is
    // hospitality-framed (you haven't captured one yet; here's the warm path
    // to do it from your phone).
    Scans: {
      Root:      'client-portal/scans/root',
      ListIntro: 'client-portal/scans/list-intro',
      Empty: {
        NoScans: 'client-portal/scans/empty/no-scans',
      },
    },
    // ─── Reviews — homeowner shares experience after a project wraps ──────
    //
    // The voice here is "share your experience" — never "rate" or "submit
    // feedback." Pending requests carry an explicit ask from the designer.
    Reviews: {
      Root:      'client-portal/reviews/root',
      ListIntro: 'client-portal/reviews/list-intro',
      Empty: {
        // No reviews requested yet (first-time / nothing pending).
        NoReviews: 'client-portal/reviews/empty/no-reviews',
      },
      PendingIntro: 'client-portal/reviews/pending-intro',
    },
    // ─── Messages — conversations with the designer team ──────────────────
    //
    // Consumer voice: "your designer" / "your design team" — never "users"
    // or "counterparts." The empty state is reassuring, not technical.
    Messages: {
      Root:      'client-portal/messages/root',
      ListIntro: 'client-portal/messages/list-intro',
      Empty: {
        // No conversations yet.
        NoConversations: 'client-portal/messages/empty/no-conversations',
        // A thread is open but has no messages yet.
        NoMessages:      'client-portal/messages/empty/no-messages',
      },
    },
  },
  /**
   * iOS consumer app surfaces — Sprint 2 Stream G7 first migration.
   *
   * Mirrors `SurfaceKeys.IOSApp.*` in
   * `apps/mobile/Patina/Patina/Features/Help/SurfaceKeys.swift`. Every key
   * here MUST be byte-for-byte identical to the Swift constant; the iOS
   * parity test pins the contract.
   *
   * The Home screen is the "Daily Room" editorial feed. ProductDetail is
   * the full-screen product view with maker story, spatial context, and
   * AR placement. Both lean on Patina vocabulary (tier, match score, why-
   * it-fits) that benefits from contextual help affordances.
   */
  IOSApp: {
    Home: {
      Root:             'ios-app/home',
      DailyGreeting:    'ios-app/home/daily-greeting',
      DailyStoryCard:   'ios-app/home/daily-story-card',
      DailyProductCard: 'ios-app/home/daily-product-card',
      TierPill:         'ios-app/home/tier-pill',
      MatchPill:        'ios-app/home/match-pill',
      AddToRoom:        'ios-app/home/add-to-room',
    },
    ProductDetail: {
      Root:            'ios-app/product-detail',
      SavedStatus:     'ios-app/product-detail/saved-status',
      ShareAction:     'ios-app/product-detail/share-action',
      ArAction:        'ios-app/product-detail/ar-action',
      SpatialContext:  'ios-app/product-detail/spatial-context',
      Materials:       'ios-app/product-detail/materials',
    },
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
