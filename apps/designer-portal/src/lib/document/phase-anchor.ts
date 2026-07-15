/**
 * Phase anchor ids — one source of truth for the DOM id a spine PhaseSection
 * wears and the Rule's minimap addresses when a phase (or one of its
 * milestones) is clicked. Mirrors `section-anchor.ts` exactly (same
 * `doc-<thing>-<id>` shape as the mobile room jumps in mobile-sheets.tsx),
 * so the Rule's jump targets and the spine's section wrappers never drift
 * apart.
 */

export function phaseAnchorId(phaseId: string): string {
  return `doc-phase-${phaseId}`;
}
