/* ── The house's own graduations ────────────────────────────────────────────
   A story pole is struck before the building starts. Most real client
   projects carry no `project_phases` rows at all — the studio never opened the
   phase register — and `splitSpinePhases` then answers with nothing, which
   leaves the pole blank beside a house that plainly exists.

   So when the register is empty the pole is graduated from the house's own six
   chapters instead. They are not invented: they are `ALL_PHASE_SLUGS` in their
   own order, lettered with the client labels the whole product already uses
   (Discovery · Design · Design Refinement · Procurement · Installation ·
   Completion).

   NOTHING IS DATED. A canonical graduation carries no start, no target and no
   completion, so `graduationSpan` prints nothing beside it — the pole reports
   the chapters of the work, never a schedule the studio has not promised.

   NOTHING IS HELD UNLESS THE PROJECT SAYS SO. The open chapter is taken from
   `project.currentPhase` and only when `recognisePhaseSlug` actually
   recognises it, or from a project whose own status is `completed`.
   A project that names no phase gets six ungraduated chapters and no caret,
   because guessing which one is open is exactly the copy that later reverses.
   ────────────────────────────────────────────────────────────────────────── */

import type { Database } from '@patina/supabase';
import { ALL_PHASE_SLUGS, PHASE_DISPLAY_CONFIG, getPhaseLabel } from '@patina/types';
import type { PhaseSlug } from '@patina/types';

import {
  recognisePhaseSlug,
  splitSpinePhases,
  type SpinePhase,
  type SpinePhases,
} from '@/components/making/making-spine';
import type { MilestoneDetail } from '@/types/project';

/**
 * The one project status that means the work itself is over. `archived` means
 * withdrawn from view, not finished — a project archived mid-Procurement would
 * otherwise be told its Installation and Completion are behind it. Typed
 * against the generated enum so a rename in the column reaches this file.
 */
const FINISHED_STATUS: Database['public']['Enums']['project_status'] = 'completed';

function canonicalGraduation(
  slug: PhaseSlug,
  index: number,
  status: SpinePhase['status'],
): SpinePhase {
  const label = getPhaseLabel(slug, 'client');
  return {
    id: slug,
    index,
    slug,
    label,
    // `graduationName` re-reads this when the slug is `consultation`, because
    // that slug is also `normalizePhaseSlug`'s can-never-fail fallback. The
    // client label resolves back to the same phase, so the pole letters it
    // "Discovery" rather than falling through to a row name it does not have.
    title: label,
    color: PHASE_DISPLAY_CONFIG[slug].color,
    status,
    checklistDone: 0,
    checklistTotal: 0,
  };
}

/**
 * The six chapters of the house, split around the one the project says is
 * open. `currentPhase` wins; failing that a finished project has walked all
 * six; failing that nothing is held.
 */
export function canonicalPhases(
  currentPhase?: string | null,
  status?: string | null,
): SpinePhases {
  const slugs = [...ALL_PHASE_SLUGS];
  const open = recognisePhaseSlug(currentPhase);
  const finished = (status ?? '').trim().toLowerCase() === FINISHED_STATUS;

  if (open === null) {
    return finished
      ? {
          settled: slugs.map((slug, index) => canonicalGraduation(slug, index, 'completed')),
          current: null,
          future: [],
        }
      : {
          settled: [],
          current: null,
          future: slugs.map((slug, index) => canonicalGraduation(slug, index, 'upcoming')),
        };
  }

  const heldAt = slugs.indexOf(open);
  return {
    settled: slugs
      .slice(0, heldAt)
      .map((slug, index) => canonicalGraduation(slug, index, 'completed')),
    current: canonicalGraduation(open, heldAt, 'in_progress'),
    future: slugs
      .slice(heldAt + 1)
      .map((slug, offset) => canonicalGraduation(slug, heldAt + 1 + offset, 'upcoming')),
  };
}

/**
 * The pole's graduations: the studio's own phases where the register has any,
 * and the house's six canonical chapters where it has none.
 */
export function thresholdPhases(
  milestones: MilestoneDetail[],
  currentPhase?: string | null,
  status?: string | null,
): SpinePhases {
  const split = splitSpinePhases(milestones);
  const struck = split.settled.length + split.future.length + (split.current ? 1 : 0);
  return struck > 0 ? split : canonicalPhases(currentPhase, status);
}
