import { act, fireEvent, render, screen, within } from "@testing-library/react";

// ── shared mocks — the schedule-spine-add-line.test.tsx pattern, with the
// hooks that vary per test exposed as jest.fn()s so each test can drive its
// own resolved-schedule/phase-state scenario. ──
const useResolvedScheduleMock = jest.fn();
const useDesignerClientForClientUserMock = jest.fn();
const phaseStateMock = jest.fn();
const useScheduleProposalsMock = jest.fn();
const useCoordinationItemsMock = jest.fn();
const registerRevealHandlerMock = jest.fn();

jest.mock("@patina/supabase", () => ({
  excludeProjectArtifactApprovals: (items: unknown[]) => items,
  useScheduleProposals: () => useScheduleProposalsMock(),
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
  useCoordinationItems: () => useCoordinationItemsMock(),
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

// W4 — the lens is a page-level observer and never runs in jsdom, so the store
// is mocked per suite. `'full'` is the reading every claim below was written
// against (today's body, on the paper); the quiet cases at the foot drive
// `null`, the lens being silent, which is where an unpromoted stop starts.
const mockLensDensity = jest.fn<"full" | null, [string]>(() => "full");
jest.mock("@/hooks/use-lens-density", () => ({
  useLensDensityStore: (region: string) => mockLensDensity(region),
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
  isOpen: (item: { status?: string }) => item.status === "pending",
}));

jest.mock("@/lib/document/phase-anchor", () => ({
  phaseAnchorId: (phaseId: string) => `phase-${phaseId}`,
}));

jest.mock("../schedule-nav-context", () => ({
  useScheduleNav: () => ({
    registerRevealHandler: (...args: unknown[]) =>
      registerRevealHandlerMock(...args),
    armEdit: jest.fn(),
  }),
}));

jest.mock("../schedule-proposals", () => ({
  ScheduleProposals: () => <div data-testid="schedule-proposals" />,
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
  // The anchor id rides through: a reveal scrolls to exactly this element, so a
  // stub without it could not witness the scroll landing.
  PhaseSection: ({ name, anchorId }: any) => (
    <div data-testid="phase-section" id={anchorId}>
      {name}
    </div>
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
  window.localStorage.clear();
  mockLensDensity.mockReset();
  mockLensDensity.mockReturnValue("full");
  useDesignerClientForClientUserMock.mockReturnValue({ data: { id: "dc-1" } });
  useScheduleProposalsMock.mockReturnValue({ data: [], isError: false });
  useCoordinationItemsMock.mockReturnValue({ data: [] });
  registerRevealHandlerMock.mockClear();
  phaseStateMock.mockReset();
});

/** The live reveal handler the spine last registered with the Rule. */
function latestRevealHandler() {
  const handler = registerRevealHandlerMock.mock.calls
    .map((call) => call[0])
    .filter(Boolean)
    .pop();
  if (!handler) throw new Error("the spine registered no reveal handler");
  return handler as (target: {
    kind: "phase";
    phaseId: string;
  }) => void;
}

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

  it("arrives OPEN when every phase is closed — a derived default quiets a stop, it never folds it", () => {
    // R127 OD-10 (W3-L5). This case read "renders the seam by default when
    // every phase is closed". `schedule` is a STOP key — it owns a
    // `[data-index-region]` root — so its derived default no longer produces a
    // fold: it produces DENSITY. The region arrives open and quiet, with its
    // head on the paper; only the designer can shut a stop, and the case that
    // proves she still can is directly below.
    useResolvedScheduleMock.mockReturnValue(onePhaseSchedule("completed"));
    phaseStateMock.mockReturnValue("closed");

    renderSpine();

    expect(document.querySelector("[data-fold-seam]")).toBeNull();
    expect(document.querySelector("[data-region-head]")).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Schedule" }),
    ).toBeInTheDocument();
  });

  it("renders the seam when she folded it herself, with an unmounted body", () => {
    // The seam's own claims, kept whole — only their CAUSE changed. A stop can
    // still stand folded; it can only ever stand folded because she said so
    // (OD-10), and a remembered choice from before R127 still reads the same.
    useResolvedScheduleMock.mockReturnValue(onePhaseSchedule("completed"));
    phaseStateMock.mockReturnValue("closed");
    window.localStorage.setItem("patina:doc-fold:project-1:schedule", "1");

    renderSpine();

    const seam = document.querySelector("[data-fold-seam]") as HTMLElement;
    expect(seam).not.toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Schedule" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("phase-section")).not.toBeInTheDocument();
    // The body is UNMOUNTED behind the seam, so the seam must not claim to
    // control an element that is not on the page.
    expect(seam).toHaveAttribute("aria-expanded", "false");
    expect(seam).not.toHaveAttribute("aria-controls");
  });

  it("unfolds the seam back to the head and body on click", () => {
    useResolvedScheduleMock.mockReturnValue(onePhaseSchedule("completed"));
    phaseStateMock.mockReturnValue("closed");
    // The fold she made herself is the only seam a stop can wear (OD-10).
    window.localStorage.setItem("patina:doc-fold:project-1:schedule", "1");

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

  it("stays open when every phase is closed but a proposal is still pending", () => {
    useResolvedScheduleMock.mockReturnValue(onePhaseSchedule("completed"));
    phaseStateMock.mockReturnValue("closed");
    useScheduleProposalsMock.mockReturnValue({
      data: [{ id: "proposal-1" }],
      isError: false,
    });

    renderSpine();

    expect(document.querySelector("[data-fold-seam]")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Schedule" }),
    ).toBeInTheDocument();
  });

  it("stays open when every phase is closed but an item is still open", () => {
    useResolvedScheduleMock.mockReturnValue(onePhaseSchedule("completed"));
    phaseStateMock.mockReturnValue("closed");
    useCoordinationItemsMock.mockReturnValue({
      data: [{ id: "item-1", status: "pending" }],
    });

    renderSpine();

    expect(document.querySelector("[data-fold-seam]")).toBeNull();
  });

  it("unfolds a folded region and scrolls when the Rule reveals a phase", () => {
    useResolvedScheduleMock.mockReturnValue(onePhaseSchedule("completed"));
    phaseStateMock.mockReturnValue("closed");
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const raf = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });

    // Folded by her, which after OD-10 is the only way a stop is folded at all.
    window.localStorage.setItem("patina:doc-fold:project-1:schedule", "1");

    renderSpine();
    expect(document.querySelector("[data-fold-seam]")).not.toBeNull();

    act(() => latestRevealHandler()({ kind: "phase", phaseId: "phase-1" }));

    expect(document.querySelector("[data-fold-seam]")).toBeNull();
    expect(document.getElementById("phase-phase-1")).not.toBeNull();
    expect(scrollIntoView).toHaveBeenCalled();

    raf.mockRestore();
  });
});

// W4 (L-4, OD-12, OD-13) — the quiet body: the same head, one count line, one
// quiet leader that presses the region open, the sr-only state line, and none
// of the phases.
describe("ScheduleSpine quiet body (W4)", () => {
  /** A one-phase schedule whose phase IS the install window, so the count line
   *  has both halves to state. */
  const installSchedule = () => ({
    isLoading: false,
    phases: [
      {
        id: "phase-1",
        name: "Installation",
        status: "in_progress",
        phase_key: "installation",
        lane: "main",
        sort_order: 0,
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
          start: "2026-09-15",
          end: "2026-09-29",
          anchored: true,
          slackDays: 0,
        },
      ],
      milestones: [],
      conflicts: [],
    },
  });

  beforeEach(() => {
    mockLensDensity.mockReturnValue(null);
    phaseStateMock.mockReturnValue("active");
  });

  it("prints head, count line, leader and the sr-only state line — and no phases", () => {
    useResolvedScheduleMock.mockReturnValue(installSchedule());

    const { container } = renderSpine();

    const root = container.querySelector('[data-index-region="schedule"]');
    expect(root).toHaveAttribute("data-density", "quiet");
    expect(root).toHaveStyle({
      "--doc-quiet-reserve": "var(--doc-quiet-reserve-min)",
    });

    expect(
      screen.getByRole("heading", { name: "Schedule" }),
    ).toBeInTheDocument();
    const countLine = screen.getByText("INSTALL SEP 15 · 1 PHASE");
    expect(countLine.textContent!.length).toBeLessThanOrEqual(40);
    expect(screen.getByText("Quiet — opens as you read")).toHaveClass("sr-only");

    // The phases, the ghost line and the proposals are not on the paper until
    // the lens reaches this root.
    expect(screen.queryByTestId("phase-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ghost-add-line")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schedule-proposals")).not.toBeInTheDocument();
    expect(document.getElementById("project-schedule-body")).toBeNull();
    // The quiet body grows NO act of its own: the mockup's condensed head
    // prints the head's own leader and nothing beside it, so the region still
    // inks exactly one word.
    expect(
      container.querySelectorAll('[data-action-variant="inked"]'),
    ).toHaveLength(1);
  });

  it("drops the half it cannot state, and prints nothing when it can state neither", () => {
    // No install window resolves off this fixture, so the date half is simply
    // absent — never a placeholder.
    useResolvedScheduleMock.mockReturnValue(onePhaseSchedule("in_progress"));
    const withPhases = renderSpine();
    expect(screen.getByText("1 PHASE")).toBeInTheDocument();
    expect(screen.queryByText(/INSTALL/)).not.toBeInTheDocument();
    withPhases.unmount();

    // Nothing dated, nothing phased: no count line at all.
    useResolvedScheduleMock.mockReturnValue(zeroPhaseSchedule);
    const bare = renderSpine();
    expect(
      bare.container.querySelector("[data-region-count-line]"),
    ).toBeNull();
    // Never zero text: the head and the sr-only state line still print.
    expect(screen.getByRole("heading", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.getByText("Quiet — opens as you read")).toBeInTheDocument();
  });

  it("keeps the SAME head element across quiet → full", () => {
    useResolvedScheduleMock.mockReturnValue(installSchedule());

    const { container, rerender } = renderSpine();
    const quietHead = container.querySelector('[data-region-head="schedule"]');
    const quietHeading = document.getElementById("project-schedule-title");
    expect(quietHead).not.toBeNull();

    mockLensDensity.mockReturnValue("full");
    rerender(
      <ScheduleSpine
        projectId="project-1"
        clientUserId="user-1"
        clientName="Winky Loft"
      />,
    );

    expect(container.querySelector('[data-index-region="schedule"]')).toHaveAttribute(
      "data-density",
      "full",
    );
    expect(container.querySelector('[data-region-head="schedule"]')).toBe(quietHead);
    expect(document.getElementById("project-schedule-title")).toBe(quietHeading);
    expect(document.getElementById("project-schedule-body")).not.toBeNull();
    expect(screen.queryByText("INSTALL SEP 15 · 1 PHASE")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Quiet — opens as you read"),
    ).not.toBeInTheDocument();
  });

  it("lets her own fold outrank the lens", () => {
    useResolvedScheduleMock.mockReturnValue(installSchedule());
    window.localStorage.setItem("patina:doc-fold:project-1:schedule", "1");
    mockLensDensity.mockReturnValue("full");

    const { container } = renderSpine();

    expect(document.querySelector("[data-fold-seam]")).not.toBeNull();
    expect(
      screen.queryByText("Quiet — opens as you read"),
    ).not.toBeInTheDocument();
    // An explicit choice is `full` by construction (C-8) — the lens can neither
    // quiet a region she has shut nor unfold one.
    expect(container.querySelector('[data-index-region="schedule"]')).toHaveAttribute(
      "data-density",
      "full",
    );
    expect(
      container.querySelector('[data-index-region="schedule"]'),
    ).toHaveStyle({ "--doc-quiet-reserve": "var(--doc-quiet-reserve-min)" });
  });
});
