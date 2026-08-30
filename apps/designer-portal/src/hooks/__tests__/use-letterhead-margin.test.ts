import { renderHook } from "@testing-library/react";
import type { MarginItemRow } from "@/lib/document/margin-derivation";
import type { WorkflowGate } from "@/lib/document/workflow-gate";

let mockItems: MarginItemRow[] = [];
let mockCoordinationItems: unknown[] | undefined = [];
let mockGates: WorkflowGate[] = [];

jest.mock("@/hooks/use-margin-items", () => ({
  useMarginItems: () => ({ data: mockItems }),
}));

jest.mock("@patina/supabase", () => ({
  useCoordinationItems: () => ({
    data: mockCoordinationItems,
    isLoading: false,
    isPending: false,
    isError: false,
  }),
  isProjectArtifactApproval: () => false,
}));

jest.mock("@/components/document/margin-handoff-item", () => ({
  useHandoffGates: () => ({
    gates: mockGates,
    handoffsById: new Map(),
    isError: false,
  }),
}));

import { useLetterheadMargin } from "../use-letterhead-margin";

function row(overrides: Partial<MarginItemRow>): MarginItemRow {
  return {
    kind: "decision",
    item_id: "item-1",
    project_id: "proj-1",
    proposal_id: null,
    anchor_kind: "letterhead",
    anchor_id: null,
    state: "pending",
    title: "A decision",
    detail: "",
    ts: "2026-08-01T00:00:00Z",
    payload: {},
    ...overrides,
  };
}

function gate(overrides: Partial<WorkflowGate>): WorkflowGate {
  return {
    id: "gate-1",
    sourceKind: "project_approval",
    sourceId: "src-1",
    sourceState: "pending",
    projectId: "proj-1",
    canonicalStageKey: null,
    lane: "With Marta",
    studioLane: false,
    terms: "Awaiting a pick",
    provenance: "",
    dueAt: null,
    overdue: { isOverdue: false, days: 0 },
    act: null,
    ...overrides,
  };
}

describe("useLetterheadMargin (D-B30)", () => {
  beforeEach(() => {
    mockItems = [];
    mockCoordinationItems = [];
    mockGates = [];
  });

  it("keeps only letterhead- and section-anchored, non-time items", () => {
    mockItems = [
      row({ item_id: "a", anchor_kind: "letterhead" }),
      row({ item_id: "b", anchor_kind: "section" }),
      row({ item_id: "c", anchor_kind: "line", anchor_id: "line-1" }),
      row({ item_id: "d", anchor_kind: "letterhead", kind: "time" }),
    ];

    const { result } = renderHook(() =>
      useLetterheadMargin({ projectId: "proj-1", proposalId: null }),
    );

    expect(result.current.items.map((r) => r.item_id)).toEqual(["a", "b"]);
  });

  it("counts items plus handoff gates, matching what the deleted chips block printed", () => {
    mockItems = [
      row({ item_id: "a" }),
      row({ item_id: "b", anchor_kind: "section" }),
    ];
    mockGates = [gate({ id: "g1" }), gate({ id: "g2" })];

    const { result } = renderHook(() =>
      useLetterheadMargin({ projectId: "proj-1", proposalId: null }),
    );

    expect(result.current.count).toBe(4);
    expect(result.current.gates).toHaveLength(2);
  });

  it("counts an overdue decision item and an overdue gate toward overdueCount", () => {
    mockItems = [
      row({ item_id: "a", state: "overdue" }),
      row({ item_id: "b", state: "pending" }),
    ];
    mockGates = [
      gate({ id: "g1", overdue: { isOverdue: true, days: 3 } }),
      gate({ id: "g2", overdue: { isOverdue: false, days: 0 } }),
    ];

    const { result } = renderHook(() =>
      useLetterheadMargin({ projectId: "proj-1", proposalId: null }),
    );

    expect(result.current.overdueCount).toBe(2);
  });

  it("surfaces the decision classification notice when decisions are withheld", () => {
    mockItems = [row({ item_id: "a" })];
    mockCoordinationItems = undefined; // classification still loading

    const { result } = renderHook(() =>
      useLetterheadMargin({ projectId: "proj-1", proposalId: null }),
    );

    expect(result.current.showDecisionNotice).toBe(true);
    expect(result.current.decisionState).toBe("loading");
    // The withheld decision row does not count until the classifier resolves.
    expect(result.current.items).toHaveLength(0);
  });

  it("is ready with no classifier query on a proposal (no project)", () => {
    mockItems = [
      row({ item_id: "a", project_id: null, proposal_id: "prop-1" }),
    ];

    const { result } = renderHook(() =>
      useLetterheadMargin({ projectId: null, proposalId: "prop-1" }),
    );

    expect(result.current.decisionState).toBe("ready");
    expect(result.current.items).toHaveLength(1);
  });
});
