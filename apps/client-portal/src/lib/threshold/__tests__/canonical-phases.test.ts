import type { MilestoneDetail } from '@/types/project';

import { canonicalPhases, thresholdPhases } from '../canonical-phases';

function milestone(overrides: Partial<MilestoneDetail> = {}): MilestoneDetail {
  return {
    id: 'm1',
    index: 0,
    title: 'Schematic Design',
    phase: 'concept_development',
    status: 'in_progress',
    progressPercentage: 0,
    checklist: [],
    documents: [],
    messages: [],
    ...overrides,
  };
}

function names(phases: ReturnType<typeof canonicalPhases>): string[] {
  return [...phases.settled, ...(phases.current ? [phases.current] : []), ...phases.future]
    .sort((a, b) => a.index - b.index)
    .map((phase) => phase.label);
}

describe('canonicalPhases — the house’s own six graduations', () => {
  it('graduates the six chapters in the house’s order', () => {
    expect(names(canonicalPhases('Procurement'))).toEqual([
      'Discovery',
      'Design',
      'Design Refinement',
      'Procurement',
      'Installation',
      'Completion',
    ]);
  });

  it('holds the chapter the project names, and settles everything before it', () => {
    const phases = canonicalPhases('Procurement');
    expect(phases.current?.slug).toBe('procurement');
    expect(phases.settled.map((phase) => phase.slug)).toEqual([
      'consultation',
      'concept_development',
      'design_refinement',
    ]);
    expect(phases.future.map((phase) => phase.slug)).toEqual([
      'installation',
      'final_walkthrough',
    ]);
  });

  it('recognises the first chapter by its client label', () => {
    expect(canonicalPhases('Discovery').current?.slug).toBe('consultation');
  });

  it('dates nothing — a canonical graduation carries no schedule', () => {
    for (const phase of [...canonicalPhases('Procurement').settled, canonicalPhases('Procurement').current!]) {
      expect(phase.startDate).toBeUndefined();
      expect(phase.targetDate).toBeUndefined();
      expect(phase.completionDate).toBeUndefined();
    }
  });

  it('holds nothing when the project names no phase it recognises', () => {
    const phases = canonicalPhases('Construction Documentation');
    expect(phases.current).toBeNull();
    expect(phases.settled).toEqual([]);
    expect(phases.future).toHaveLength(6);
  });

  it('settles all six for a project whose own status says the work is done', () => {
    const phases = canonicalPhases(null, 'completed');
    expect(phases.current).toBeNull();
    expect(phases.settled).toHaveLength(6);
    expect(phases.future).toEqual([]);
  });

  it('does not settle a project that is merely active', () => {
    expect(canonicalPhases(null, 'active').settled).toEqual([]);
  });
});

describe('thresholdPhases — the register wins where there is one', () => {
  it('graduates from the canonical six when the project has no phase rows', () => {
    expect(names(thresholdPhases([], 'Procurement'))).toHaveLength(6);
  });

  it('keeps the studio’s own phases when the register has any', () => {
    const phases = thresholdPhases([milestone()], 'Procurement');
    expect(phases.current?.id).toBe('m1');
    expect(phases.settled).toEqual([]);
    expect(phases.future).toEqual([]);
  });
});
