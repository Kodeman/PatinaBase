import { fireEvent, render, screen, within } from "@testing-library/react";

// ── shared mocks — the schedule-spine-add-line.test.tsx pattern, with the
// hooks that vary per test exposed as jest.fn()s so each test can drive its
// own resolved-schedule/phase-state scenario. ──
const useResolvedScheduleMock = jest.fn();
const useDesignerClientForClientUserMock = jest.fn();
const phaseStateMock = jest.fn();

jest.mock("@patina/supabase", () => ({
  excludeProjectArtifactApprovals: (items: unknown[]) => items,
  useScheduleProposals: () => ({ data: [], isError: false }),
  useCommitScheduleProposal: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
    isError: false,
  }),
  useDismissScheduleProposal: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
    isError: false,
  }),
  useInstallWindow: () => ({ data: null, isError: false }),
  useHoldInstallWindow: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useConfirmInstallWindow: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useReleaseInstallWindow: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCoordinationItems: () => ({ data: [] }),
  useProjectParties: () => ({ data: [] }),
  useProjectFFEItems: () => ({ data: [] }),
  useProjectFfeReadiness: () => ({ data: [] }),
  useCoordinationRealtime: jest.fn(),
  useDesignerClientForClientUser: (...args: unknown[]) =>
    useDesignerClientForClientUserMock(...args),
  useResolvedSchedule: (...args: unknown[]) => useResolvedScheduleMock(...args),
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

jest.mock("@/hooks/use-section-work", () => ({
  useSectionTasks: () => ({ data: [] }),
}));

jest.mock("@/lib/analytics/schedule-events", () => ({
  scheduleEvents: {
    scheduleAnchorSet: jest.fn(),
    scheduleBorn: jest.fn(),
    schedulePhaseAdded: jest.fn(),
    spinePhaseUnfolded: jest.fn(),
  },
}));

jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: {
    regionFolded: jest.fn(),
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

jest.mock("@/lib/document/schedule-spine-derivation", () => ({
  phaseState: (...args: unknown[]) => phaseStateMock(...args),
  itemsForPhase: () => [],
  todayIndex: () => 0,
  phaseMeta: () => ({ text: "", overrunText: null }),
  phaseGhostLine: () => null,
  threadsFor: () => new Map(),
}));

jest.mock("@/lib/document/coordination-derivation", () => ({
  blocksText: () => null,
  sortItemsBlockingFirst: (items: unknown[]) => items,
}));

jest.mock("@/lib/document/phase-anchor", () => ({
  phaseAnchorId: (phaseId: string) => `phase-${phaseId}`,
}));

jest.mock("../schedule-nav-context", () => ({
  useScheduleNav: () => ({
    registerRevealHandler: jest.fn(),
    armEdit: jest.fn(),
  }),
}));

jest.mock("../schedule-ripple-context", () => ({
  useRippleSession: () => ({ diff: null, begin: jest.fn() }),
}));

jest.mock("../../overlays/doc-sheet", () => ({
  DocSheet: ({ open, children, title }: any) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));
jest.mock("../../coordination/open-item-sheet", () => ({
  OpenItemSheet: () => null,
}));
jest.mock("../../coordination/item-composer", () => ({
  ItemComposer: () => <div>Coordination item composer</div>,
  toComposerFfeItems: () => [],
  toComposerPhases: () => [],
}));
jest.mock("../../coordination/coordination-work", () => ({
  CoordinationWork: () => null,
}));
jest.mock("../phase-section", () => ({
  PhaseSection: ({ name }: any) => (
    <div data-testid="phase-section">{name}</div>
  ),
}));
jest.mock("../today-rule", () => ({ TodayRule: () => null }));
jest.mock("../ghost-add-line", () => ({
  GhostAddLine: () => <div data-testid="ghost-add-line" />,
}));
jest.mock("../schedule-birth", () => ({
  ScheduleBirth: () => <div data-testid="schedule-birth">Schedule birth</div>,
}));
jest.mock("../phase-delete-confirm", () => ({
  PhaseDeleteConfirm: () => null,
}));
jest.mock("../milestone-composer", () => ({ MilestoneComposer: () => null }));
jest.mock("../schedule-entry-field", () => ({
  ScheduleEntryField: () => null,
}));
jest.mock("../revision-ledger", () => ({ RevisionLedger: () => null }));
jest.mock("../add-line-sheet", () => ({
  AddLineSheet: () => null,
}));

import { ScheduleSpine } from "../schedule-spine";

const onePhaseSchedule = (status: string) => ({
  isLoading: false,
  phases: [
    {
      id: "phase-1",
      name: "Design development",
      status,
      follows_phase_id: null,
      duration_days: 14,
      duration_weeks: null,
    },
  ],
  milestones: [],
  resolved: {
    phases: [
      {
        id: "phase-1",
        lane: "main",
        start: "2026-08-07",
        end: "2026-08-21",
        anchored: false,
        slackDays: 0,
      },
    ],
    milestones: [],
    conflicts: [],
  },
});

const zeroPhaseSchedule = {
  isLoading: false,
  phases: [],
  milestones: [],
  resolved: { phases: [], milestones: [], conflicts: [] },
};

function renderSpine() {
  return render(
    <ScheduleSpine
      projectId="project-1"
      clientUserId="user-1"
      clientName="Winky Loft"
    />,
  );
}

beforeEach(() => {
  useDesignerClientForClientUserMock.mockReturnValue({ data: { id: "dc-1" } });
  phaseStateMock.mockReset();
});

describe("ScheduleSpine region head", () => {
  it("inks exactly one action in the head", () => {
    useResolvedScheduleMock.mockReturnValue(onePhaseSchedule("in_progress"));
    phaseStateMock.mockReturnValue("active");

    renderSpine();

    expect(
      document.querySelectorAll('[data-action-variant="inked"]'),
    ).toHaveLength(1);
  });

  it("renders open with zero phases so ScheduleBirth stays reachable, with no seam", () => {
    useResolvedScheduleMock.mockReturnValue(zeroPhaseSchedule);
    phaseStateMock.mockReturnValue("active");

    renderSpine();

    expect(screen.getByTestId("schedule-birth")).toBeInTheDocument();
    expect(document.querySelector("[data-fold-seam]")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Schedule" }),
    ).toBeInTheDocument();
  });

  it("renders the seam by default when every phase is closed", () => {
    useResolvedScheduleMock.mockReturnValue(onePhaseSchedule("completed"));
    phaseStateMock.mockReturnValue("closed");

    renderSpine();

    expect(document.querySelector("[data-fold-seam]")).not.toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Schedule" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("phase-section")).not.toBeInTheDocument();
  });

  it("unfolds the seam back to the head and body on click", () => {
    useResolvedScheduleMock.mockReturnValue(onePhaseSchedule("completed"));
    phaseStateMock.mockReturnValue("closed");

    renderSpine();

    const seam = document.querySelector("[data-fold-seam]") as HTMLElement;
    expect(seam).not.toBeNull();

    fireEvent.click(seam);

    expect(document.querySelector("[data-fold-seam]")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Schedule" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("phase-section")).toBeInTheDocument();
  });
});
