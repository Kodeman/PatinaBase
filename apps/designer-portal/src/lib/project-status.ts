/**
 * Project status indicator variants.
 *
 * Spec palette (per `docs/prds/Projects/patina-designer-portal-mvp-additions-spec.md`):
 *   sage       — on-track
 *   clay       — active (general)
 *   gold       — warning (deadline approaching)
 *   terracotta — at-risk / overdue
 *   pearl      — future / draft / on-hold
 */

export type ProjectStatusVariant = 'sage' | 'clay' | 'gold' | 'terracotta' | 'pearl';

const STATUS_COLOR_VAR: Record<ProjectStatusVariant, string> = {
  sage: 'var(--color-sage, #A8B5A0)',
  clay: 'var(--color-clay, #C4A57B)',
  gold: 'var(--color-golden-hour, #E8C547)',
  terracotta: 'var(--color-terracotta, #D4A090)',
  pearl: 'var(--color-pearl, #E5E2DD)',
};

const STATUS_LABEL: Record<ProjectStatusVariant, string> = {
  sage: 'On track',
  clay: 'Active',
  gold: 'Deadline approaching',
  terracotta: 'At risk',
  pearl: 'Future',
};

export function getStatusColor(variant: ProjectStatusVariant): string {
  return STATUS_COLOR_VAR[variant];
}

export function getStatusLabel(variant: ProjectStatusVariant): string {
  return STATUS_LABEL[variant];
}

interface ProjectInput {
  status?: string | null;
  current_phase?: string | null;
  expected_completion_date?: string | null;
  target_end_date?: string | null;
  progress?: number | null;
}

const DAY = 1000 * 60 * 60 * 24;

/**
 * Returns the brand-palette variant for a project based on lifecycle status
 * and proximity to its expected completion date.
 *
 * Logic:
 *   • status 'completed'           → sage (final state)
 *   • status 'on_hold'              → pearl
 *   • status 'draft' / pre-active   → pearl
 *   • status 'active':
 *       past expected_completion → terracotta
 *       within 14 days remaining → gold
 *       otherwise                → sage (on-track) when progress healthy, else clay
 */
export function getProjectStatusVariant(project: ProjectInput): ProjectStatusVariant {
  const status = (project.status || '').toLowerCase();

  if (status === 'completed') return 'sage';
  if (status === 'on_hold' || status === 'on-hold') return 'pearl';
  if (status === 'draft' || status === 'planning' || status === 'proposal_sent') return 'pearl';

  // Active path
  const targetStr = project.expected_completion_date || project.target_end_date;
  if (!targetStr) return 'clay';

  const targetMs = new Date(targetStr).getTime();
  const nowMs = Date.now();
  const daysRemaining = (targetMs - nowMs) / DAY;

  if (daysRemaining < 0) return 'terracotta';
  if (daysRemaining < 14) return 'gold';

  // Healthy active project
  return (project.progress ?? 0) > 0 ? 'sage' : 'clay';
}
