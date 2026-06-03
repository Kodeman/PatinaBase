/**
 * Single source of truth for FF&E procurement stage UI config (label + color +
 * help-system surface key), keyed off the canonical stage list in @patina/types.
 *
 * The key list / union type lives in @patina/types (`FFE_STAGE_KEYS`,
 * `FFEStageKey`) and matches the `status` CHECK on `project_ffe_items`. Colors,
 * labels, and SurfaceKeys are UI concerns and live here (correctly out of
 * @patina/types, which stays free of help-system deps). Both the per-project
 * FF&E board and the Procurement → By Status view import from here.
 */

import { FFE_STAGE_KEYS, type FFEStageKey } from '@patina/types';
import { SurfaceKeys } from '@patina/help-system';

export interface StageConfig {
  key: FFEStageKey;
  label: string;
  /** CSS color token (with hex fallback) for the stage's dot / accent. */
  color: string;
  /** Help-system surface key for the per-stage StrataInfoIcon tooltip. */
  surfaceKey: string;
}

export const STAGE_CONFIG: Record<FFEStageKey, StageConfig> = {
  specified: {
    key: 'specified',
    label: 'Specified',
    color: 'var(--text-muted)',
    surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Specified,
  },
  quoted: {
    key: 'quoted',
    label: 'Quoted',
    color: 'var(--color-dusty-blue, #8B9CAD)',
    surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Quoted,
  },
  approved: {
    key: 'approved',
    label: 'Approved',
    color: 'var(--color-clay, #C4A57B)',
    surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Approved,
  },
  ordered: {
    key: 'ordered',
    label: 'Ordered',
    color: 'var(--color-dusty-blue, #8B9CAD)',
    surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Ordered,
  },
  production: {
    key: 'production',
    label: 'Production',
    color: 'var(--color-golden-hour, #E8C547)',
    surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Production,
  },
  shipped: {
    key: 'shipped',
    label: 'Shipped',
    color: 'var(--color-golden-hour, #E8C547)',
    surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Shipped,
  },
  delivered: {
    key: 'delivered',
    label: 'Delivered',
    color: 'var(--color-sage, #A8B5A0)',
    surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Delivered,
  },
  installed: {
    key: 'installed',
    label: 'Installed',
    color: 'var(--color-sage, #A8B5A0)',
    surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Installed,
  },
};

/** Ordered stage config array — drop-in for the old local `STAGES` const. */
export const STAGES: readonly StageConfig[] = FFE_STAGE_KEYS.map((k) => STAGE_CONFIG[k]);

function resolve(key: string | null | undefined): StageConfig {
  return (key && STAGE_CONFIG[key as FFEStageKey]) || STAGE_CONFIG.specified;
}

export function stageLabel(key: string | null | undefined): string {
  return resolve(key).label;
}

export function stageColor(key: string | null | undefined): string {
  return resolve(key).color;
}
