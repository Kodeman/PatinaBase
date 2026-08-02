import { act, render, waitFor } from "@testing-library/react";
import type { CustomCommissionWorkspaceProps } from "./custom-commission-workspace";
import { EMPTY_COMMISSION_BRIEF } from "./custom-commission-model";
import { CustomCommissionSheet } from "./custom-commission-sheet";

let mockWorkspaceProps: CustomCommissionWorkspaceProps | null = null;
let mockConfigurations: Array<Record<string, unknown>> = [];
let mockExactConfiguration: Record<string, unknown> | undefined;
let mockFfeItems: Array<Record<string, unknown>> = [];
const mockUseMilestones = jest.fn(() => ({ data: [], isLoading: false }));
const mockRecordMilestone = jest.fn();
const mockPrepareRfq = jest
  .fn()
  .mockResolvedValue({ id: "rfq-1", status: "draft" });
const mockPlace = jest.fn().mockResolvedValue({ ffeItemId: "ffe-1" });
const mockTransition = jest.fn().mockResolvedValue({ id: "revision-1" });
const mockInstantiate = jest.fn();
const mockSave = jest.fn().mockResolvedValue({
  configuration: {
    id: "configuration-1",
    productId: "product-1",
    projectId: "project-1",
    version: 1,
    status: "saved",
    name: "Library wall cabinetry",
    snapshot: { productName: "Library wall cabinetry" },
    snapshotHash: "sha256:configuration-1",
    updatedAt: "2026-08-02T12:00:00Z",
  },
  customRevision: {
    id: "revision-1",
    configurationId: "configuration-1",
  },
});

jest.mock("./custom-commission-workspace", () => ({
  CustomCommissionWorkspace: (props: CustomCommissionWorkspaceProps) => {
    mockWorkspaceProps = props;
    return <div>Custom commission adapter</div>;
  },
}));

jest.mock("@patina/supabase", () => ({
  useProjects: () => ({
    data: [{ id: "project-1", name: "Hawthorn House", status: "active" }],
    isLoading: false,
  }),
  useVendors: () => ({
    data: { data: [{ id: "vendor-1", name: "Northstar Millwork" }] },
    isLoading: false,
  }),
  useSavedProductConfigurations: () => ({
    data: mockConfigurations,
    isLoading: false,
  }),
  useProductConfiguration: () => ({
    data: mockExactConfiguration,
    isLoading: false,
  }),
  useProjectFFEItems: () => ({ data: mockFfeItems, isLoading: false }),
  useCustomCommissionRevisions: () => ({ data: [], isLoading: false }),
  useCustomCommissionMilestones: (configurationId: string) =>
    mockUseMilestones(configurationId),
  useSaveProductConfiguration: () => ({
    mutateAsync: mockSave,
    isPending: false,
  }),
  useInstantiateProductConfigurationTemplate: () => ({
    mutateAsync: mockInstantiate,
    isPending: false,
  }),
  useTransitionCustomCommissionRevision: () => ({
    mutateAsync: mockTransition,
    isPending: false,
  }),
  useRecordCustomCommissionMilestone: () => ({
    mutateAsync: mockRecordMilestone,
    isPending: false,
  }),
  usePlaceProductConfiguration: () => ({
    mutateAsync: mockPlace,
    isPending: false,
  }),
  usePromoteConfigurationToLibrary: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  usePrepareConfigurationQuoteRequest: () => ({
    mutateAsync: mockPrepareRfq,
    isPending: false,
  }),
}));

const completeBrief = {
  ...EMPTY_COMMISSION_BRIEF,
  projectId: "project-1",
  name: "Library wall cabinetry",
  scope: "Integrated desk and storage wall.",
  dimensions: {
    width: "156",
    depth: "24",
    height: "108",
    unit: "in" as const,
    siteNotes: "Field verify after flooring.",
  },
  material: "rift-sawn white oak",
  finish: "clear oil",
  fabricatorVendorId: "vendor-1",
  fabricator: "Northstar Millwork",
  drawingReferences: ["https://files.example/A-602-rev-3.pdf"],
  allowance: "28500",
  priceOnRequest: false,
  quote: {
    reference: "NSM-Q-1042-R2",
    tradeAmount: "31840",
    retailAmount: "41200",
    validUntil: "2026-09-15",
    leadTimeWeeks: "14",
  },
  designerApproval: "pending" as const,
  clientApproval: "pending" as const,
};

describe("CustomCommissionSheet data adapter", () => {
  beforeEach(() => {
    mockWorkspaceProps = null;
    mockConfigurations = [];
    mockExactConfiguration = undefined;
    mockFfeItems = [];
    mockPrepareRfq.mockClear();
    mockPlace.mockClear();
    mockSave.mockClear();
    mockTransition.mockClear();
    mockInstantiate.mockReset();
    mockUseMilestones.mockClear();
    mockRecordMilestone.mockReset();
  });

  it("creates a review-only RFQ draft for a matched maker without sending", async () => {
    const fetchSpy = jest.fn();
    Object.defineProperty(global, "fetch", {
      configurable: true,
      value: fetchSpy,
    });
    render(
      <CustomCommissionSheet
        open
        onClose={jest.fn()}
        productId="product-1"
        productName="Library wall cabinetry"
      />,
    );
    await waitFor(() => expect(mockWorkspaceProps).not.toBeNull());

    let result: { draftCreated: boolean; message: string } | undefined;
    await act(async () => {
      result = await mockWorkspaceProps!.onPrepareQuoteRequest(
        "configuration-1",
        "revision-1",
        completeBrief,
      );
    });

    expect(mockPrepareRfq).toHaveBeenCalledWith({
      configurationId: "configuration-1",
      vendorId: "vendor-1",
      scope: "Integrated desk and storage wall.",
      timeline: "14 weeks",
      message: expect.stringContaining("156 × 24 × 108 in"),
    });
    expect(result).toEqual({
      draftCreated: true,
      message:
        "Commission submitted and RFQ draft saved for review. Nothing was sent.",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    delete (global as { fetch?: unknown }).fetch;
  });

  it("keeps a free-text maker inside the commission until directory matching", async () => {
    render(
      <CustomCommissionSheet
        open
        onClose={jest.fn()}
        productId="product-1"
        productName="Library wall cabinetry"
      />,
    );
    const freeTextBrief = { ...completeBrief, fabricatorVendorId: "" };
    const result = await mockWorkspaceProps!.onPrepareQuoteRequest(
      "configuration-1",
      "revision-1",
      freeTextBrief,
    );

    expect(mockPrepareRfq).not.toHaveBeenCalled();
    expect(result.draftCreated).toBe(false);
    expect(result.message).toMatch(/Match the named fabricator/);
  });

  it("consumes the immutable revision created atomically with the saved brief", async () => {
    render(
      <CustomCommissionSheet
        open
        onClose={jest.fn()}
        productId="product-1"
        productName="Library wall cabinetry"
      />,
    );
    let result: { configurationId: string; revisionId: string } | undefined;
    await act(async () => {
      result = await mockWorkspaceProps!.onSaveDraft(completeBrief);
    });

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "product-1",
        projectId: "project-1",
        selections: {},
        components: [],
        customBrief: expect.objectContaining({
          fabricatorVendorId: "vendor-1",
          allowanceCents: 2_850_000,
          priceOnRequest: false,
        }),
      }),
    );
    expect(result).toEqual({
      configurationId: "configuration-1",
      revisionId: "revision-1",
    });
  });

  it("issues through the single server placement transaction with explicit provenance", async () => {
    render(
      <CustomCommissionSheet
        open
        onClose={jest.fn()}
        productId="product-1"
        productName="Library wall cabinetry"
      />,
    );
    await mockWorkspaceProps!.onPlaceApproved("configuration-1", "project-1");

    expect(mockPlace).toHaveBeenCalledWith({
      projectId: "project-1",
      configurationId: "configuration-1",
      source: {
        surface: "designer_piece_custom_commission",
        explicitDesignerAction: true,
      },
    });
  });

  it("records workshop cost and client price as separate quote fields", async () => {
    render(
      <CustomCommissionSheet
        open
        onClose={jest.fn()}
        productId="product-1"
        productName="Library wall cabinetry"
      />,
    );

    await mockWorkspaceProps!.onTransition("revision-1", "quoted", {
      quote: completeBrief.quote,
    });

    expect(mockTransition).toHaveBeenCalledWith({
      revisionId: "revision-1",
      targetStatus: "quoted",
      note: undefined,
      quote: {
        quoteNumber: "NSM-Q-1042-R2",
        tradePriceCents: 3_184_000,
        retailPriceCents: 4_120_000,
        currency: "USD",
        leadTimeWeeks: 14,
        validUntil: "2026-09-15",
        receivedAt: expect.any(String),
      },
      approval: undefined,
    });
  });

  it("instantiates a sanitized Library template before saving it to a project", async () => {
    mockConfigurations = [
      {
        id: "template-1",
        productId: "product-1",
        projectId: null,
        version: 1,
        status: "saved",
        name: "Proven cabinetry pattern",
        snapshot: { productName: "Cabinetry template" },
        snapshotHash: "sha256:template-1",
        updatedAt: "2026-08-02T12:00:00Z",
        isLibraryTemplate: true,
      },
    ];
    mockInstantiate.mockResolvedValue({
      configuration: {
        ...mockConfigurations[0],
        id: "project-instance-1",
        projectId: "project-1",
      },
      templateConfigurationId: "template-1",
      customRevision: { id: "instance-revision-1" },
    });

    render(
      <CustomCommissionSheet
        open
        onClose={jest.fn()}
        productId="product-1"
        productName="Library wall cabinetry"
        initialConfigurationId="template-1"
      />,
    );
    await waitFor(() => expect(mockWorkspaceProps).not.toBeNull());
    await act(async () => {
      await mockWorkspaceProps!.onSaveDraft(completeBrief);
    });

    expect(mockInstantiate).toHaveBeenCalledWith({
      templateConfigurationId: "template-1",
      projectId: "project-1",
      name: "Library wall cabinetry",
    });
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        configurationId: "project-instance-1",
        expectedVersion: 1,
        projectId: "project-1",
      }),
    );
  });

  it("binds fulfillment evidence to the selected issued revision and its purchase order", async () => {
    mockConfigurations = [
      {
        id: "configuration-draft",
        productId: "product-1",
        projectId: "project-1",
        version: 3,
        status: "saved",
        snapshot: {},
        snapshotHash: "draft-hash",
        updatedAt: "2026-08-03T12:00:00Z",
      },
    ];
    mockExactConfiguration = {
      id: "configuration-issued",
      productId: "product-1",
      projectId: "project-1",
      ffeItemId: "ffe-issued",
      version: 2,
      status: "issued",
      snapshot: {},
      snapshotHash: "issued-hash",
      updatedAt: "2026-08-02T12:00:00Z",
    };
    mockFfeItems = [
      {
        id: "ffe-issued",
        purchase_order_id: "po-1",
      },
    ];
    mockRecordMilestone.mockResolvedValue({ id: "milestone-1" });

    render(
      <CustomCommissionSheet
        open
        onClose={jest.fn()}
        productId="product-1"
        productName="Library wall cabinetry"
      />,
    );
    await act(async () => {
      mockWorkspaceProps!.onActiveRevisionChange?.({
        id: "revision-issued",
        configurationId: "configuration-issued",
        revisionNumber: 2,
        status: "issued",
        brief: completeBrief,
        snapshot: {},
        snapshotHash: "issued-hash",
        lockedAt: "2026-08-02T12:00:00Z",
        createdAt: "2026-08-02T12:00:00Z",
      });
    });

    await waitFor(() =>
      expect(mockUseMilestones).toHaveBeenLastCalledWith(
        "configuration-issued",
      ),
    );
    expect(mockWorkspaceProps!.fulfillmentReady).toBe(true);
    await mockWorkspaceProps!.onRecordMilestone?.({
      milestoneType: "submittal",
      status: "approved",
      note: "Shop drawing A-602 approved.",
      references: ["A-602 rev 4"],
    });
    expect(mockRecordMilestone).toHaveBeenCalledWith(
      expect.objectContaining({
        configurationId: "configuration-issued",
        milestoneType: "submittal",
      }),
    );
  });
});
