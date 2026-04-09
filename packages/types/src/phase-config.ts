/**
 * Shared Phase Configuration
 *
 * Canonical definitions for project phases used across all portals.
 * Both designer and client portals should import from here to ensure
 * consistent naming, ordering, and display.
 */

// ============================================================================
// PHASE SLUGS
// ============================================================================

export type PhaseSlug =
  | 'consultation'
  | 'concept_development'
  | 'design_refinement'
  | 'procurement'
  | 'installation'
  | 'final_walkthrough';

export const ALL_PHASE_SLUGS: readonly PhaseSlug[] = [
  'consultation',
  'concept_development',
  'design_refinement',
  'procurement',
  'installation',
  'final_walkthrough',
] as const;

// ============================================================================
// PHASE DISPLAY CONFIG
// ============================================================================

export interface PhaseDisplayConfig {
  /** Full display label (e.g. "Programming & Consultation") */
  label: string;
  /** Short label for compact displays (e.g. "Consult") */
  shortLabel: string;
  /** Client-facing label (e.g. "Discovery") — simpler naming for clients */
  clientLabel: string;
  /** CSS variable for phase color */
  color: string;
  /** Sort order (0-based) */
  order: number;
  /** Typical duration estimate */
  typicalDuration: string;
}

export const PHASE_DISPLAY_CONFIG: Record<PhaseSlug, PhaseDisplayConfig> = {
  consultation: {
    label: 'Programming & Consultation',
    shortLabel: 'Consult',
    clientLabel: 'Discovery',
    color: 'var(--phase-consultation)',
    order: 0,
    typicalDuration: '1–2 weeks',
  },
  concept_development: {
    label: 'Schematic Design',
    shortLabel: 'Schematic',
    clientLabel: 'Design',
    color: 'var(--phase-concept)',
    order: 1,
    typicalDuration: '2–4 weeks',
  },
  design_refinement: {
    label: 'Design Development',
    shortLabel: 'Design Dev',
    clientLabel: 'Design Refinement',
    color: 'var(--phase-refinement)',
    order: 2,
    typicalDuration: '4–8 weeks',
  },
  procurement: {
    label: 'Procurement & Order Management',
    shortLabel: 'Procurement',
    clientLabel: 'Procurement',
    color: 'var(--phase-procurement)',
    order: 3,
    typicalDuration: '4–12 weeks',
  },
  installation: {
    label: 'Installation & Styling',
    shortLabel: 'Install',
    clientLabel: 'Installation',
    color: 'var(--phase-installation)',
    order: 4,
    typicalDuration: '1–3 weeks',
  },
  final_walkthrough: {
    label: 'Completion & Handover',
    shortLabel: 'Completion',
    clientLabel: 'Completion',
    color: 'var(--phase-walkthrough)',
    order: 5,
    typicalDuration: '1–2 weeks',
  },
};

// ============================================================================
// PHASE STATUS
// ============================================================================

/** Unified status type used across both portals */
export type PhaseStatus = 'completed' | 'active' | 'pending' | 'delayed' | 'blocked';

/** Map from ProjectPhaseStatus (Supabase) to unified PhaseStatus */
export function mapPhaseStatus(
  dbStatus: 'pending' | 'in_progress' | 'completed' | 'delayed'
): PhaseStatus {
  if (dbStatus === 'in_progress') return 'active';
  return dbStatus;
}

// ============================================================================
// STATUS DISPLAY CONFIG
// ============================================================================

export interface StatusDisplayConfig {
  label: string;
  dotClass: string;
  textClass: string;
}

export const PHASE_STATUS_DISPLAY: Record<PhaseStatus, StatusDisplayConfig> = {
  completed: {
    label: 'Completed',
    dotClass: 'bg-patina-sage',
    textClass: 'text-patina-sage',
  },
  active: {
    label: 'In Progress',
    dotClass: 'bg-patina-clay',
    textClass: 'text-patina-clay',
  },
  pending: {
    label: 'Upcoming',
    dotClass: 'bg-patina-pearl',
    textClass: 'text-patina-aged-oak',
  },
  delayed: {
    label: 'Delayed',
    dotClass: 'bg-patina-terracotta',
    textClass: 'text-patina-terracotta',
  },
  blocked: {
    label: 'Blocked',
    dotClass: 'bg-patina-terracotta',
    textClass: 'text-patina-terracotta',
  },
};

// ============================================================================
// HELPERS
// ============================================================================

/** Reverse lookup: map a label (designer or client) to a phase slug */
export function getPhaseSlugFromLabel(label: string): PhaseSlug | undefined {
  const normalized = label.toLowerCase().trim();
  for (const [slug, config] of Object.entries(PHASE_DISPLAY_CONFIG)) {
    if (
      config.label.toLowerCase() === normalized ||
      config.clientLabel.toLowerCase() === normalized ||
      config.shortLabel.toLowerCase() === normalized ||
      slug === normalized
    ) {
      return slug as PhaseSlug;
    }
  }
  return undefined;
}

/** Get the display config for a phase by slug */
export function getPhaseConfig(slug: string): PhaseDisplayConfig | undefined {
  return PHASE_DISPLAY_CONFIG[slug as PhaseSlug];
}

/** Get the label for a phase, with optional audience targeting */
export function getPhaseLabel(
  slug: string,
  audience: 'designer' | 'client' = 'designer'
): string {
  const config = getPhaseConfig(slug);
  if (!config) return slug;
  return audience === 'client' ? config.clientLabel : config.label;
}

/** Calculate project progress from phase statuses */
export function calculateProjectProgress(
  phases: Array<{ status: string; progress?: number }>
): number {
  if (phases.length === 0) return 0;

  let totalWeight = 0;
  let completedWeight = 0;

  for (const phase of phases) {
    totalWeight += 1;
    if (phase.status === 'completed') {
      completedWeight += 1;
    } else if (phase.status === 'in_progress' || phase.status === 'active') {
      // For active phases, use their progress percentage
      completedWeight += (phase.progress ?? 0) / 100;
    }
    // pending/delayed phases contribute 0
  }

  return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
}
