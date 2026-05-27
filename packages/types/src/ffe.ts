/**
 * FF&E (Furniture, Fixtures & Equipment) procurement lifecycle types.
 *
 * The 8 ordered stages match the `status` CHECK constraint on
 * `project_ffe_items` and are the canonical procurement lifecycle for
 * Patina FF&E items. They are referenced from:
 *   - apps/designer-portal — FFE Kanban board (per-project) and Procurement
 *     By Status view (cross-project)
 *   - help-system SurfaceKeys.DesignerPortal.Ffe.Stage.* — per-stage help copy
 *
 * Color/surface mapping lives per-view (see designer-portal FFE page and the
 * Procurement By Status view); only the key list and union type live here so
 * `@patina/types` stays free of UI / help-system dependencies.
 */

/** The 8 ordered FF&E procurement stage keys. */
export type FFEStageKey =
  | 'specified'
  | 'quoted'
  | 'approved'
  | 'ordered'
  | 'production'
  | 'shipped'
  | 'delivered'
  | 'installed';

/**
 * Canonical ordered list of FF&E stage keys. Use this anywhere you need to
 * iterate stages in pipeline order (e.g., rendering a flow chart, summing
 * per-stage counts).
 */
export const FFE_STAGE_KEYS: readonly FFEStageKey[] = [
  'specified',
  'quoted',
  'approved',
  'ordered',
  'production',
  'shipped',
  'delivered',
  'installed',
] as const;
