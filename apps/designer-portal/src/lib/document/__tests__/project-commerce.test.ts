import {
  furnishingsDepositPosture,
  mapFurnishingsWaves,
  mapWorkingBudget,
  validateWorkingBudgetLines,
} from "../project-commerce";

const line = {
  id: "line-1",
  roomId: null,
  roomName: "Living room",
  category: "Seating",
  lowCents: 100_00,
  targetCents: 200_00,
  highCents: 300_00,
  sortOrder: 0,
};

describe("project commerce adapters", () => {
  it("requires every budget line to be ordered low, target, high", () => {
    expect(validateWorkingBudgetLines([line])).toEqual({
      valid: true,
      errors: {},
    });

    expect(
      validateWorkingBudgetLines([
        { ...line, lowCents: 250_00, targetCents: 200_00 },
      ]),
    ).toEqual({
      valid: false,
      errors: { "line-1": "Enter the range in low, target, high order." },
    });
  });

  it("maps immutable checkpoint acknowledgement and override history", () => {
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
          ...line,
          id: "line-2",
          lowCents: 100,
          targetCents: 200,
          highCents: 300,
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
    expect(result.checkpoint).toMatchObject({
      checkpointCode: "B-002",
      state: "overridden",
      overrideReason: "Client confirmed by recorded phone call.",
      overrideAt: "2026-08-02T00:00:00Z",
    });
    expect(result.isPurchaseAuthority).toBe(false);
  });

  it("keeps multiple named waves on one project and strips private economics", () => {
    const waves = mapFurnishingsWaves([
      {
        documentId: "doc-1",
        proposalId: "proposal-1",
        waveName: "Living Room Essentials",
        commercialState: "sent",
        totalAmountCents: 100_000,
        depositPercent: 50,
        depositRequiredCents: 45_000,
        budgetCheckpointId: "checkpoint-1",
        sentAt: "2026-08-03T12:00:00Z",
        proposalSendDispatchId: "dispatch-1",
        items: [
          {
            id: "item-1",
            name: "Sofa",
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
        depositInvoiceId: "invoice-2",
        budgetCheckpointId: "checkpoint-1",
        items: [],
      },
    ]);

    expect(waves.map((wave) => wave.waveName)).toEqual([
      "Living Room Essentials",
      "Bedroom Lighting",
    ]);
    expect(waves[0]).toMatchObject({
      checkpointId: "checkpoint-1",
      depositRequiredCents: 45_000,
      sentAt: "2026-08-03T12:00:00Z",
      proposalSendDispatchId: "dispatch-1",
    });
    expect(JSON.stringify(waves)).not.toMatch(/trade|vendor|markup/i);
    expect(furnishingsDepositPosture(waves[0])).toBe("awaiting_signature");
    expect(furnishingsDepositPosture(waves[1])).toBe("invoice_ready");
  });
});
