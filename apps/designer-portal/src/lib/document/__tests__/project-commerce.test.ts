import {
  furnishingsDepositPosture,
  instrumentStatusView,
  isValidBudgetTargetCents,
  mapProjectInstruments,
  mapWorkingBudget,
} from "../project-commerce";

describe("project commerce adapters", () => {
  it("only accepts a target of zero or more", () => {
    expect(isValidBudgetTargetCents(0)).toBe(true);
    expect(isValidBudgetTargetCents(150_000)).toBe(true);
    expect(isValidBudgetTargetCents(-1)).toBe(false);
    expect(isValidBudgetTargetCents(NaN)).toBe(false);
  });

  it("maps immutable checkpoint acknowledgement and override history, plus stamped scheduled/authorized figures", () => {
    const acknowledged = mapWorkingBudget({
      version: {
        id: "version-1",
        projectId: "project-1",
        version: 1,
        status: "published",
      },
      checkpoint: {
        id: "checkpoint-1",
        status: "acknowledged",
        publishedAt: "2026-07-30T00:00:00Z",
        acknowledgedAt: "2026-07-31T00:00:00Z",
      },
    });
    expect(acknowledged.checkpoint).toMatchObject({
      state: "acknowledged",
      acknowledgedAt: "2026-07-31T00:00:00Z",
    });

    const result = mapWorkingBudget({
      version: {
        id: "version-2",
        projectId: "project-1",
        version: 2,
        status: "published",
        lowTotalCents: 100,
        targetTotalCents: 200,
        highTotalCents: 300,
        publishedAt: "2026-08-01T00:00:00Z",
      },
      lines: [
        {
          id: "line-2",
          roomId: null,
          roomName: "Living room",
          category: "Seating",
          lowCents: 100,
          targetCents: 200,
          highCents: 300,
          scheduledCents: 220,
          authorizedCents: 180,
          sortOrder: 0,
        },
      ],
      checkpoint: {
        id: "checkpoint-2",
        checkpointCode: "B-002",
        status: "overridden",
        publishedAt: "2026-08-01T00:00:00Z",
        overrideReason: "Client confirmed by recorded phone call.",
        overriddenAt: "2026-08-02T00:00:00Z",
      },
      isPurchaseAuthority: true,
    });

    expect(result.version?.state).toBe("published");
    expect(result.version?.lines[0]).toMatchObject({
      scheduledCents: 220,
      authorizedCents: 180,
    });
    expect(result.checkpoint).toMatchObject({
      checkpointCode: "B-002",
      state: "overridden",
      overrideReason: "Client confirmed by recorded phone call.",
      overrideAt: "2026-08-02T00:00:00Z",
    });
    expect(result.isPurchaseAuthority).toBe(false);
  });

  it("preserves an 'open' (unacknowledged) checkpoint status distinctly — never collapsed into 'published', which is not a real status value", () => {
    const fresh = mapWorkingBudget({
      version: { id: "version-3", projectId: "project-1", version: 1 },
      checkpoint: {
        id: "checkpoint-3",
        checkpointCode: "B-003",
        status: "open",
        publishedAt: "2026-08-03T00:00:00Z",
      },
    });
    expect(fresh.checkpoint).toMatchObject({
      state: "open",
      checkpointCode: "B-003",
    });

    // A checkpoint row with no status at all is exactly as unacknowledged as
    // one explicitly marked 'open' — both must gate the release RPC, so both
    // must map the same way.
    const noStatusField = mapWorkingBudget({
      version: { id: "version-3", projectId: "project-1", version: 1 },
      checkpoint: { id: "checkpoint-3", publishedAt: "2026-08-03T00:00:00Z" },
    });
    expect(noStatusField.checkpoint?.state).toBe("open");
  });

  it("defaults scheduled/authorized to zero when the RPC has not stamped them yet", () => {
    const result = mapWorkingBudget({
      version: { id: "version-1", projectId: "project-1", version: 1 },
      lines: [
        {
          id: "line-1",
          roomName: "Living room",
          category: "Seating",
          lowCents: 0,
          targetCents: 0,
          highCents: 0,
        },
      ],
    });
    expect(result.version?.lines[0]).toMatchObject({
      scheduledCents: 0,
      authorizedCents: 0,
    });
  });

  it("keeps multiple authorizations on one project, numbers them by creation order, and strips private economics", () => {
    const instruments = mapProjectInstruments([
      {
        documentId: "doc-1",
        proposalId: "proposal-1",
        waveName: "Living Room Essentials",
        commercialState: "sent",
        totalAmountCents: 100_000,
        depositPercent: 50,
        depositRequiredCents: 45_000,
        depositPaidCents: 0,
        budgetCheckpointId: "checkpoint-1",
        sentAt: "2026-08-03T12:00:00Z",
        proposalSendDispatchId: "dispatch-1",
        items: [
          {
            id: "item-1",
            name: "Sofa",
            projectRoomId: "room-1",
            quantity: 1,
            clientUnitPriceCents: 100_000,
            clientLineTotalCents: 100_000,
            tradeUnitCostCents: 40_000,
            vendorName: "Private vendor",
            markupPercent: 150,
          },
        ],
      },
      {
        documentId: "doc-2",
        proposalId: "proposal-2",
        waveName: "Bedroom Lighting",
        commercialState: "executed",
        totalAmountCents: 20_000,
        depositPercent: 25,
        depositRequiredCents: 5_000,
        depositPaidCents: 5_000,
        depositInvoiceId: "invoice-2",
        budgetCheckpointId: "checkpoint-1",
        items: [],
      },
    ]);

    expect(instruments.map((instrument) => instrument.name)).toEqual([
      "Living Room Essentials",
      "Bedroom Lighting",
    ]);
    expect(instruments.map((instrument) => instrument.number)).toEqual([1, 2]);
    expect(instruments[0]).toMatchObject({
      kind: "furnishings_authorization",
      checkpointId: "checkpoint-1",
      depositRequiredCents: 45_000,
      depositPaid: false,
      coveredRoomIds: ["room-1"],
      sentAt: "2026-08-03T12:00:00Z",
      proposalSendDispatchId: "dispatch-1",
    });
    expect(instruments[1]).toMatchObject({
      state: "executed",
      depositPaid: true,
    });
    expect(JSON.stringify(instruments)).not.toMatch(/trade|vendor|markup/i);
    expect(furnishingsDepositPosture(instruments[0])).toBe("awaiting_signature");
    expect(furnishingsDepositPosture(instruments[1])).toBe("invoice_ready");
  });

  it("prefers the RPC's own stamped number, coveredRoomIds, and depositPaid over the client-side fallbacks (00422 shape)", () => {
    const instruments = mapProjectInstruments([
      {
        documentId: "doc-1",
        proposalId: "proposal-1",
        waveName: "Living Room Essentials",
        commercialState: "sent",
        number: 7,
        totalAmountCents: 100_000,
        depositPercent: 50,
        depositRequiredCents: 45_000,
        depositPaid: false,
        coveredRoomIds: ["room-9", "room-9", "room-10"],
        supersededByNumber: null,
        items: [
          // The item's own room (room-1) is deliberately NOT room-9/room-10 —
          // proves coveredRoomIds reads the checkpoint's rooms, not the
          // items', once the server supplies it.
          { id: "item-1", name: "Sofa", projectRoomId: "room-1", quantity: 1 },
        ],
      },
    ]);

    expect(instruments[0]).toMatchObject({
      number: 7,
      depositPaid: false,
      coveredRoomIds: ["room-9", "room-10"],
    });
  });

  it("reads supersededByNumber directly from the RPC rather than deriving it, and stays null while the server has not wired a replacement", () => {
    const instruments = mapProjectInstruments([
      {
        documentId: "doc-1",
        proposalId: "proposal-1",
        waveName: "First release",
        commercialState: "superseded",
        number: 1,
        supersededByNumber: 3,
        items: [],
      },
      {
        documentId: "doc-2",
        proposalId: "proposal-2",
        waveName: "Undated instrument",
        commercialState: "sent",
        number: 2,
        supersededByNumber: null,
        items: [],
      },
    ]);

    expect(instruments[0]).toMatchObject({
      state: "superseded",
      supersededByNumber: 3,
    });
    expect(instruments[1].supersededByNumber).toBeNull();
    expect(instrumentStatusView("superseded")).toMatchObject({
      label: "Void · superseded",
    });
  });

  it("falls back to a client-recomputed number and items-derived coveredRoomIds for a payload that predates 00422", () => {
    const instruments = mapProjectInstruments([
      {
        documentId: "doc-1",
        proposalId: "proposal-1",
        waveName: "Living Room Essentials",
        commercialState: "sent",
        items: [{ id: "item-1", name: "Sofa", projectRoomId: "room-1", quantity: 1 }],
      },
      {
        documentId: "doc-2",
        proposalId: "proposal-2",
        waveName: "Bedroom Lighting",
        commercialState: "executed",
        items: [],
      },
    ]);

    expect(instruments.map((instrument) => instrument.number)).toEqual([1, 2]);
    expect(instruments[0].coveredRoomIds).toEqual(["room-1"]);
    expect(instruments[0].supersededByNumber).toBeNull();
  });

  it("folds an unrecognized instrument state to draft rather than guessing", () => {
    const [instrument] = mapProjectInstruments([
      {
        documentId: "doc-1",
        proposalId: "proposal-1",
        waveName: "Odd state",
        commercialState: "client_signed",
        items: [],
      },
    ]);
    expect(instrument.state).toBe("draft");
  });
});
