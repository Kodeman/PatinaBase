import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('@patina/supabase', () => ({
  excludeProjectArtifactApprovals: (items: unknown[]) => items,
  // R109/R110 — the spine's proposed-anchor block.
  useScheduleProposals: () => ({ data: [], isError: false }),
  useCommitScheduleProposal: () => ({ mutateAsync: jest.fn(), isPending: false, isError: false }),
  useDismissScheduleProposal: () => ({ mutateAsync: jest.fn(), isPending: false, isError: false }),
  // R112 — the install window ceremony rides the installation phase row.
  useInstallWindow: () => ({ data: null, isError: false }),
  useHoldInstallWindow: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useConfirmInstallWindow: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useReleaseInstallWindow: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCoordinationItems: () => ({ data: [] }),
  useProjectParties: () => ({ data: [] }),
  useProjectFFEItems: () => ({ data: [] }),
  useProjectFfeReadiness: () => ({ data: [] }),
  useCoordinationRealtime: jest.fn(),
  useDesignerClientForClientUser: () => ({ data: null }),
  useResolvedSchedule: () => ({
    isLoading: false,
    phases: [
      {
        id: 'phase-1',
        name: 'Design development',
        status: 'in_progress',
        follows_phase_id: null,
        duration_days: 14,
        duration_weeks: null,
      },
    ],
    milestones: [],
    resolved: {
      phases: [
        {
          id: 'phase-1',
          lane: 'main',
          start: '2026-08-07',
          end: '2026-08-21',
          anchored: false,
          slackDays: 0,
        },
      ],
      milestones: [],
      conflicts: [],
    },
  }),
  useProjects: () => ({ data: [], isPending: false }),
  useProjectPhaseCounts: () => ({ data: {}, isPending: false }),
  useCreateProjectPhase: () => ({ mutate: jest.fn(), isError: false }),
  useUpdateProjectPhaseChain: () => ({ mutate: jest.fn() }),
  useAddScheduleMilestone: () => ({
    mutate: jest.fn(),
    reset: jest.fn(),
    isPending: false,
    isError: false,
  }),
  useUpdateScheduleMilestone: () => ({ mutate: jest.fn() }),
  useDeletePhaseWithRelink: () => ({
    mutate: jest.fn(),
    reset: jest.fn(),
    isPending: false,
    isError: false,
  }),
  useSeedProjectScheduleFromTemplate: () => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
  }),
  useCopyScheduleAsBuilt: () => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
  }),
  mapPhaseRowToScheduleInput: () => ({}),
  mapMilestoneRowToScheduleInput: () => ({}),
}));

jest.mock('@/hooks/use-section-work', () => ({
  useSectionTasks: () => ({ data: [] }),
}));

jest.mock('@/lib/analytics/schedule-events', () => ({
  scheduleEvents: {
    scheduleAnchorSet: jest.fn(),
    scheduleBorn: jest.fn(),
    schedulePhaseAdded: jest.fn(),
    spinePhaseUnfolded: jest.fn(),
  },
}));

jest.mock('@/lib/document/schedule-spine-derivation', () => ({
  phaseState: () => 'active',
  itemsForPhase: () => [],
  todayIndex: () => 1,
  phaseMeta: () => ({ text: '', overrunText: null }),
  phaseGhostLine: () => null,
  threadsFor: () => new Map(),
}));

jest.mock('@/lib/document/coordination-derivation', () => ({
  blocksText: () => null,
  sortItemsBlockingFirst: (items: unknown[]) => items,
  isOpen: (item: { status?: string }) => item.status === 'pending',
}));

jest.mock('@/lib/document/phase-anchor', () => ({
  phaseAnchorId: (phaseId: string) => `phase-${phaseId}`,
}));

jest.mock('../schedule-nav-context', () => ({
  useScheduleNav: () => ({ registerRevealHandler: jest.fn() }),
}));

jest.mock('../schedule-ripple-context', () => ({
  useRippleSession: () => ({ diff: null, begin: jest.fn() }),
}));

jest.mock('../../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('../../overlays/doc-sheet', () => ({
  DocSheet: ({ open, children, title }: any) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));
jest.mock('../../coordination/open-item-sheet', () => ({
  OpenItemSheet: () => null,
}));
jest.mock('../../coordination/item-composer', () => ({
  ItemComposer: () => <div>Coordination item composer</div>,
  toComposerFfeItems: () => [],
  toComposerPhases: () => [],
}));
jest.mock('../../coordination/coordination-work', () => ({
  CoordinationWork: () => null,
}));
jest.mock('../phase-section', () => ({
  PhaseSection: ({ headingActions }: any) => <div>{headingActions}</div>,
}));
jest.mock('../today-rule', () => ({ TodayRule: () => null }));
jest.mock('../ghost-add-line', () => ({
  GhostAddLine: () => <div data-testid="ghost-add-line" />,
}));
jest.mock('../schedule-birth', () => ({ ScheduleBirth: () => null }));
jest.mock('../phase-delete-confirm', () => ({
  PhaseDeleteConfirm: () => null,
}));
jest.mock('../milestone-composer', () => ({ MilestoneComposer: () => null }));
jest.mock('../schedule-entry-field', () => ({
  ScheduleEntryField: () => null,
}));
jest.mock('../revision-ledger', () => ({ RevisionLedger: () => null }));
jest.mock('../../document-action', () => ({
  DocumentAction: ({ children, onClick, disabled }: any) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  DocumentActionGroup: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('../add-line-sheet', () => ({
  AddLineSheet: ({ open, projectId, roomName }: any) =>
    open ? (
      <div role="dialog" aria-label="Add a line">
        {projectId} · {roomName}
      </div>
    ) : null,
}));

import { ScheduleSpine } from '../schedule-spine';

describe('ScheduleSpine add item action', () => {
  it('opens the existing line sheet without requiring a designer-client record', () => {
    render(
      <ScheduleSpine
        projectId="project-1"
        clientUserId={null}
        clientName="Winky Loft"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));

    expect(screen.getByRole('dialog', { name: 'Add a line' })).toHaveTextContent(
      'project-1 · Throughout',
    );
  });
});

describe('ScheduleSpine ongoing add-a-phase line', () => {
  it('offers the ghost line while the project is still running', () => {
    render(
      <ScheduleSpine projectId="project-1" clientUserId={null} clientName="Winky Loft" />,
    );

    expect(screen.getByTestId('ghost-add-line')).toBeInTheDocument();
  });

  it('stands the ghost line down once the project is completed', () => {
    render(
      <ScheduleSpine
        projectId="project-1"
        clientUserId={null}
        clientName="Winky Loft"
        projectStatus="completed"
      />,
    );

    expect(screen.queryByTestId('ghost-add-line')).not.toBeInTheDocument();
  });
});

describe('ScheduleSpine region gap (W3-L4)', () => {
  it('carries the region-gap token as its own top margin, and no other mt-/mb-', () => {
    const { container } = render(
      <ScheduleSpine projectId="project-1" clientUserId={null} clientName="Winky Loft" />,
    );

    const root = container.querySelector('[data-index-region="schedule"]');
    expect(root).not.toBeNull();
    expect(root).toHaveClass('mt-[var(--doc-region-gap)]');
    expect(
      root!.className.split(/\s+/).filter((cls) => /^mt-/.test(cls)),
    ).toEqual(['mt-[var(--doc-region-gap)]']);
    expect(root!.className).not.toMatch(/\bmb-/);
  });
});
