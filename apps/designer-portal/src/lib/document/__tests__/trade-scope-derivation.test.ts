import {
  computeDrawAmounts,
  drawIsLiveBilled,
  drawIsPaid,
  drawScheduleGatesArePinned,
  mapTradeScopeWorkspace,
  mapTradeScopes,
  mergeCommerceLedgerRows,
  pinDrawScheduleGates,
  tradeDrawGate,
  tradeEngageGate,
  tradeJourneySteps,
  tradeProgressGate,
  tradeProgressLabel,
  tradeScopeStatusView,
  validateDrawSchedule,
  validateTradeScopeDraft,
  type TradeDrawDraft,
  type TradeScopeDrawView,
  type TradeScopeView,
} from "../project-commerce";

const draw = (
  overrides: Partial<TradeScopeDrawView> = {},
): TradeScopeDrawView => ({
  id: "draw-1",
  label: "Deposit · on signature",
  percentage: 50,
  amountCents: 340_000,
  sortOrder: 0,
  gatesOnAcceptance: false,
  invoiceId: null,
  invoiceStatus: null,
  invoicePaidCents: 0,
  ...overrides,
});

const scope = (overrides: Partial<TradeScopeView> = {}): TradeScopeView => ({
  documentId: "pcd-1",
  proposalId: "proposal-1",
  number: 1,
  title: "Drapery fabrication & install",
  state: "executed",
  progressState: "none",
  partyDisplayName: "Atelier Marchand",
  clientPriceCents: 680_000,
  currency: "USD",
  depositInvoiceId: "invoice-1",
  depositPaid: true,
  draws: [
    draw(),
    draw({
      id: "draw-2",
      label: "Final · on acceptance",
      sortOrder: 1,
      gatesOnAcceptance: true,
    }),
  ],
  drawCount: 2,
  drawsIssued: 0,
  drawsPaid: 0,
  sectionRoomIds: ["room-1", "room-2"],
  ...overrides,
});

describe("mapTradeScopes", () => {
  it("maps the studio list RPC, ordering draws and deduping section rooms", () => {
    const [mapped] = mapTradeScopes([
      {
        documentId: "pcd-1",
        proposalId: "proposal-1",
        number: 2,
        title: "Tile setting",
        state: "executed",
        progressState: "in_progress",
        partyDisplayName: "Kesler Tile",
        clientPriceCents: 412_000,
        currency: "USD",
        depositInvoiceId: "invoice-9",
        depositPaid: true,
        sectionRoomIds: ["room-a", "room-a", "room-b"],
        sectionCount: 3,
        draws: [
          {
            id: "draw-b",
            label: "Final · on acceptance",
            percentage: 50,
            amountCents: 206_000,
            sortOrder: 1,
            gatesOnAcceptance: true,
            invoiceId: null,
          },
          {
            id: "draw-a",
            label: "Deposit · on signature",
            percentage: 50,
            amountCents: 206_000,
            sortOrder: 0,
            gatesOnAcceptance: false,
            invoiceId: "invoice-9",
            invoiceStatus: "paid",
            invoicePaidCents: 206_000,
          },
        ],
      },
    ]);

    expect(mapped).toMatchObject({
      number: 2,
      title: "Tile setting",
      state: "executed",
      progressState: "in_progress",
      partyDisplayName: "Kesler Tile",
      clientPriceCents: 412_000,
      depositPaid: true,
      sectionRoomIds: ["room-a", "room-b"],
      drawsIssued: 1,
      drawsPaid: 1,
    });
    expect(mapped.draws.map((row) => row.id)).toEqual(["draw-a", "draw-b"]);
    // The RPC's own sectionCount (3 sections, 2 of them sharing a room) is
    // read as-is — never collapsed to the deduped room count, which is a
    // different, smaller number the ledger's "Lines" column must not show.
    expect(mapped.sectionCount).toBe(3);
  });

  it("falls back to the deduped room count only when the RPC omits sectionCount", () => {
    const [mapped] = mapTradeScopes([
      {
        documentId: "pcd-3",
        proposalId: "p-3",
        sectionRoomIds: ["room-a", "room-a", "room-b"],
      },
    ]);
    expect(mapped.sectionCount).toBe(2);
  });

  it("reads an unknown state as draft and an unknown progress as none", () => {
    const [mapped] = mapTradeScopes([
      { documentId: "pcd-2", proposalId: "p-2", state: "something", progressState: "wat" },
    ]);
    expect(mapped.state).toBe("draft");
    expect(mapped.progressState).toBe("none");
    expect(mapped.title).toBe("Trade scope");
  });

  it("falls back to row order when the RPC omits the ordinal", () => {
    const mapped = mapTradeScopes([
      { documentId: "pcd-1", proposalId: "p-1" },
      { documentId: "pcd-2", proposalId: "p-2" },
    ]);
    expect(mapped.map((row) => row.number)).toEqual([1, 2]);
  });

  it("never copies a bid onto a scope view", () => {
    const [mapped] = mapTradeScopes([
      {
        documentId: "pcd-1",
        proposalId: "p-1",
        bids: [{ id: "bid-1", amountCents: 415_000 }],
      },
    ]);
    expect(JSON.stringify(mapped)).not.toContain("415000");
    expect(mapped).not.toHaveProperty("bids");
  });
});

describe("mapTradeScopeWorkspace", () => {
  it("maps terms, sections, bids and draws off their snake_case rows", () => {
    const workspace = mapTradeScopeWorkspace({
      proposalId: "proposal-1",
      terms: {
        proposal_id: "proposal-1",
        party_id: "party-1",
        party_display_name: "Atelier Marchand",
        party_company_name: "Atelier Marchand LLC",
        party_trade: "drapery",
        client_price_cents: 680_000,
        currency: "USD",
        terms: "Prices are fixed.",
        progress_state: "engaged",
        engaged_at: "2026-07-22T00:00:00Z",
      },
      sections: [
        {
          id: "section-2",
          project_room_id: "room-2",
          room_name: "Primary bedroom",
          prose: "Matching panels.",
          allocation_cents: 190_000,
          sort_order: 1,
        },
        {
          id: "section-1",
          project_room_id: "room-1",
          room_name: "Living",
          prose: "Five windows.",
          allocation_cents: 490_000,
          sort_order: 0,
        },
      ],
      bids: [
        {
          id: "bid-2",
          party_id: "party-2",
          party_display_name: "Winfield Workroom",
          amount_cents: 460_000,
          status: "quoted",
          source: "party_response",
          responded_at: "2026-07-08T00:00:00Z",
        },
        {
          id: "bid-1",
          party_id: "party-1",
          party_display_name: "Atelier Marchand",
          amount_cents: 415_000,
          status: "selected",
          source: "recorded",
          noted_at: "2026-07-07T00:00:00Z",
        },
      ],
      draws: [
        { id: "draw-1", label: "Deposit", amount_cents: 340_000, sort_order: 0 },
      ],
    });

    expect(workspace.terms).toMatchObject({
      partyId: "party-1",
      partyCompanyName: "Atelier Marchand LLC",
      partyTrade: "drapery",
      clientPriceCents: 680_000,
      progressState: "engaged",
    });
    expect(workspace.sections.map((row) => row.roomName)).toEqual([
      "Living",
      "Primary bedroom",
    ]);
    expect(workspace.bids.map((row) => row.id)).toEqual(["bid-1", "bid-2"]);
    expect(workspace.bids[1].source).toBe("party_response");
    expect(workspace.draws[0].amountCents).toBe(340_000);
  });

  it("holds an unset allocation as null rather than zero", () => {
    const workspace = mapTradeScopeWorkspace({
      proposalId: "proposal-1",
      sections: [
        { id: "s-1", room_name: "Living", prose: "x", allocation_cents: null, sort_order: 0 },
      ],
    });
    expect(workspace.sections[0].allocationCents).toBeNull();
  });

  it("returns null terms when the scope has none yet", () => {
    const workspace = mapTradeScopeWorkspace({ proposalId: "proposal-1" });
    expect(workspace.terms).toBeNull();
    expect(workspace.sections).toEqual([]);
  });
});

describe("draw arithmetic", () => {
  it("gives the last draw the remainder so the schedule sums to the price", () => {
    const drafts: TradeDrawDraft[] = [
      { label: "Deposit", percentage: 33.33, gatesOnAcceptance: false },
      { label: "Progress", percentage: 33.33, gatesOnAcceptance: false },
      { label: "Final", percentage: 33.34, gatesOnAcceptance: true },
    ];
    const amounts = computeDrawAmounts(100_001, drafts);
    expect(amounts.reduce((sum, value) => sum + value, 0)).toBe(100_001);
  });

  it("reads a live-billed draw, and a voided invoice as not billed", () => {
    expect(drawIsLiveBilled(draw({ invoiceId: null }))).toBe(false);
    expect(drawIsLiveBilled(draw({ invoiceId: "i-1", invoiceStatus: "sent" }))).toBe(
      true,
    );
    expect(drawIsLiveBilled(draw({ invoiceId: "i-1", invoiceStatus: "void" }))).toBe(
      false,
    );
  });

  // Mirrors the DB's own ordering gate exactly (issue_trade_draw_invoice /
  // list_trade_scopes, 00423: `i.status = 'paid' AND i.amount_paid_cents >=
  // i.total_cents`) — AND, not OR. Status alone or amount alone must both
  // read as unpaid.
  it("reads a draw as paid only when status is paid AND the money landed in full", () => {
    expect(
      drawIsPaid(
        draw({ invoiceId: "i-1", invoiceStatus: "paid", invoicePaidCents: 340_000 }),
      ),
    ).toBe(true);
    // status says paid, but nothing has actually settled — must not read paid.
    expect(
      drawIsPaid(draw({ invoiceId: "i-1", invoiceStatus: "paid", invoicePaidCents: 0 })),
    ).toBe(false);
    // the full amount landed, but the invoice itself is still "sent" — must
    // not read paid (this was the OR bug: amount alone used to be enough).
    expect(
      drawIsPaid(
        draw({ invoiceId: "i-1", invoiceStatus: "sent", invoicePaidCents: 340_000 }),
      ),
    ).toBe(false);
    expect(
      drawIsPaid(
        draw({ invoiceId: "i-1", invoiceStatus: "sent", invoicePaidCents: 1_000 }),
      ),
    ).toBe(false);
  });
});

describe("draw schedule gate pinning", () => {
  it("derives gatesOnAcceptance from position — only the last draw, regardless of what was stored", () => {
    const drafts: TradeDrawDraft[] = [
      { label: "Deposit", percentage: 25, gatesOnAcceptance: true }, // wrong — corrupted/hydrated data
      { label: "Progress", percentage: 25, gatesOnAcceptance: true }, // wrong
      { label: "Final", percentage: 50, gatesOnAcceptance: false }, // wrong — should be the gated one
    ];
    expect(drawScheduleGatesArePinned(drafts)).toBe(false);

    const pinned = pinDrawScheduleGates(drafts);
    expect(pinned.map((d) => d.gatesOnAcceptance)).toEqual([false, false, true]);
    expect(drawScheduleGatesArePinned(pinned)).toBe(true);
    // Repinning a schedule that already satisfies the rule is a no-op on the flags.
    expect(pinDrawScheduleGates(pinned).map((d) => d.gatesOnAcceptance)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("treats an already-correct schedule as pinned", () => {
    const drafts: TradeDrawDraft[] = [
      { label: "Deposit", percentage: 50, gatesOnAcceptance: false },
      { label: "Final", percentage: 50, gatesOnAcceptance: true },
    ];
    expect(drawScheduleGatesArePinned(drafts)).toBe(true);
  });
});

describe("validateDrawSchedule", () => {
  const ok: TradeDrawDraft[] = [
    { label: "Deposit", percentage: 50, gatesOnAcceptance: false },
    { label: "Final", percentage: 50, gatesOnAcceptance: true },
  ];

  it("accepts a schedule that sums to 100 with one acceptance-gated draw last", () => {
    expect(validateDrawSchedule(680_000, ok)).toBeNull();
  });

  // The new floor: a single draw is trivially both "the last draw" and "the
  // only gated draw" at once, so it used to pass every other rule here while
  // actually billing the full price at signature instead of on acceptance —
  // mirrors send_commercial_document's tightened trade-arm floor.
  it("refuses an empty schedule or a single draw — a deposit alone is not a schedule", () => {
    expect(validateDrawSchedule(680_000, [])).toMatch(
      /at least a deposit and a separate final draw/,
    );
    expect(
      validateDrawSchedule(680_000, [
        { label: "Everything", percentage: 100, gatesOnAcceptance: true },
      ]),
    ).toMatch(/at least a deposit and a separate final draw/);
  });

  it("refuses a nameless draw and a short sum", () => {
    expect(
      validateDrawSchedule(680_000, [
        { label: "  ", percentage: 50, gatesOnAcceptance: false },
        { label: "Final", percentage: 50, gatesOnAcceptance: true },
      ]),
    ).toMatch(/needs a name/);
    expect(
      validateDrawSchedule(680_000, [
        { label: "Deposit", percentage: 40, gatesOnAcceptance: false },
        { label: "Final", percentage: 50, gatesOnAcceptance: true },
      ]),
    ).toMatch(/must come to 100%/);
  });

  it("refuses a zero-money draw", () => {
    expect(
      validateDrawSchedule(680_000, [
        { label: "Deposit", percentage: 0, gatesOnAcceptance: false },
        { label: "Final", percentage: 100, gatesOnAcceptance: true },
      ]),
    ).toMatch(/must carry an amount/);
  });

  it("requires exactly one acceptance gate, and requires it last", () => {
    expect(
      validateDrawSchedule(680_000, [
        { label: "Deposit", percentage: 50, gatesOnAcceptance: true },
        { label: "Final", percentage: 50, gatesOnAcceptance: true },
      ]),
    ).toMatch(/Exactly one draw/);
    expect(
      validateDrawSchedule(680_000, [
        { label: "Deposit", percentage: 50, gatesOnAcceptance: true },
        { label: "Final", percentage: 50, gatesOnAcceptance: false },
      ]),
    ).toMatch(/must be the last one/);
  });
});

describe("validateTradeScopeDraft", () => {
  const base = {
    partyId: "party-1",
    clientPriceCents: 680_000,
    sections: [
      { roomName: "Living", prose: "Five windows.", allocationCents: null },
    ],
    draws: [
      { label: "Deposit", percentage: 50, gatesOnAcceptance: false },
      { label: "Final", percentage: 50, gatesOnAcceptance: true },
    ],
  };

  it("passes a complete draft", () => {
    expect(validateTradeScopeDraft(base)).toBeNull();
  });

  it("asks for the party, the price and the work in that order", () => {
    expect(validateTradeScopeDraft({ ...base, partyId: null })).toMatch(
      /who does this work/,
    );
    expect(validateTradeScopeDraft({ ...base, clientPriceCents: 0 })).toMatch(
      /Name the price/,
    );
    expect(
      validateTradeScopeDraft({
        ...base,
        sections: [{ roomName: "Living", prose: "   ", allocationCents: null }],
      }),
    ).toMatch(/Write the work/);
  });

  it("holds allocations to the client price once any are set", () => {
    expect(
      validateTradeScopeDraft({
        ...base,
        sections: [
          { roomName: "Living", prose: "Five windows.", allocationCents: 490_000 },
          { roomName: "Primary", prose: "Two windows.", allocationCents: 100_000 },
        ],
      }),
    ).toMatch(/must come to the client price/);

    expect(
      validateTradeScopeDraft({
        ...base,
        sections: [
          { roomName: "Living", prose: "Five windows.", allocationCents: 490_000 },
          { roomName: "Primary", prose: "Two windows.", allocationCents: 190_000 },
        ],
      }),
    ).toBeNull();
  });
});

describe("trade gates", () => {
  it("engages only an executed scope whose deposit is paid, once", () => {
    expect(tradeEngageGate(scope())).toEqual({ allowed: true });
    expect(tradeEngageGate(scope({ state: "sent" }))).toEqual({
      allowed: false,
      reason: "awaiting the client's signature",
    });
    expect(tradeEngageGate(scope({ state: "draft" }))).toMatchObject({
      allowed: false,
      reason: "the scope has not been released yet",
    });
    expect(tradeEngageGate(scope({ depositPaid: false }))).toMatchObject({
      allowed: false,
      reason: "the deposit is not paid yet",
    });
    expect(
      tradeEngageGate(scope({ depositInvoiceId: null, depositPaid: false })),
    ).toMatchObject({ reason: "the deposit invoice is still being raised" });
    expect(tradeEngageGate(scope({ progressState: "engaged" }))).toMatchObject({
      allowed: false,
      reason: "already engaged",
    });
  });

  it("moves progress forward only, and only after engagement", () => {
    expect(tradeProgressGate(scope(), "in_progress")).toMatchObject({
      allowed: false,
      reason: "engage the trade first",
    });
    expect(
      tradeProgressGate(scope({ progressState: "engaged" }), "in_progress"),
    ).toEqual({ allowed: true });
    expect(
      tradeProgressGate(scope({ progressState: "accepted" }), "in_progress"),
    ).toMatchObject({ allowed: false, reason: "already recorded" });
    expect(
      tradeProgressGate(scope({ state: "sent" }), "in_progress"),
    ).toMatchObject({ reason: "the scope is not authorized yet" });
  });

  it("issues a draw in order, and holds the final one for acceptance", () => {
    const deposit = draw();
    const final = draw({
      id: "draw-2",
      label: "Final · on acceptance",
      sortOrder: 1,
      gatesOnAcceptance: true,
    });

    expect(tradeDrawGate(scope({ draws: [deposit, final] }), deposit)).toEqual({
      allowed: true,
    });

    expect(tradeDrawGate(scope({ draws: [deposit, final] }), final)).toMatchObject(
      { allowed: false, reason: "Deposit · on signature has not been issued yet" },
    );

    const issuedDeposit = draw({ invoiceId: "i-1", invoiceStatus: "sent" });
    expect(
      tradeDrawGate(scope({ draws: [issuedDeposit, final] }), final),
    ).toMatchObject({ reason: "Deposit · on signature is not paid yet" });

    const paidDeposit = draw({
      invoiceId: "i-1",
      invoiceStatus: "paid",
      invoicePaidCents: 340_000,
    });
    expect(
      tradeDrawGate(scope({ draws: [paidDeposit, final] }), final),
    ).toMatchObject({ reason: "the client has not accepted the work yet" });

    expect(
      tradeDrawGate(
        scope({ draws: [paidDeposit, final], progressState: "accepted" }),
        final,
      ),
    ).toEqual({ allowed: true });

    expect(
      tradeDrawGate(scope(), draw({ invoiceId: "i-1", invoiceStatus: "sent" })),
    ).toMatchObject({ allowed: false, reason: "already invoiced" });
  });
});

describe("the journey band", () => {
  it("reads Authorized as the live step on a freshly signed scope", () => {
    const steps = tradeJourneySteps(scope());
    expect(steps.map((step) => step.state)).toEqual([
      "now",
      "ahead",
      "ahead",
      "ahead",
      "ahead",
      "ahead",
    ]);
  });

  it("walks forward with the progress state", () => {
    const steps = tradeJourneySteps(scope({ progressState: "in_progress" }));
    expect(steps.map((step) => step.state)).toEqual([
      "done",
      "done",
      "now",
      "ahead",
      "ahead",
      "ahead",
    ]);
  });

  it("reaches final payment only when the acceptance-gated draw is paid", () => {
    const paidFinal = draw({
      id: "draw-2",
      label: "Final",
      sortOrder: 1,
      gatesOnAcceptance: true,
      invoiceId: "i-2",
      invoiceStatus: "paid",
      invoicePaidCents: 340_000,
    });
    const steps = tradeJourneySteps(
      scope({ progressState: "accepted", draws: [draw(), paidFinal] }),
    );
    expect(steps[5]).toMatchObject({ key: "final_payment", state: "now" });
  });

  it("says nothing has happened while the scope is unsigned", () => {
    const steps = tradeJourneySteps(scope({ state: "sent" }));
    expect(steps.every((step) => step.state === "ahead")).toBe(true);
  });
});

describe("ledger copy", () => {
  it("names each state the way the studio says it", () => {
    expect(tradeScopeStatusView("draft").label).toBe("Draft");
    expect(tradeScopeStatusView("sent").label).toBe("Awaiting signature");
    expect(tradeScopeStatusView("executed").label).toBe("Authorized");
    expect(tradeScopeStatusView("superseded").label).toBe("Void · superseded");
  });

  it("labels progress, reading an unengaged scope as Authorized", () => {
    expect(tradeProgressLabel("none")).toBe("Authorized");
    expect(tradeProgressLabel("substantially_complete")).toBe(
      "Substantially complete",
    );
  });

  it("merges the two instruments, each numbered in its own sequence", () => {
    const rows = mergeCommerceLedgerRows(
      [
        {
          documentId: "doc-a",
          proposalId: "prop-a",
          number: 1,
          name: "Living Room Essentials",
          kind: "furnishings_authorization",
          state: "executed",
          totalAmountCents: 200_000,
          depositPercent: 50,
          depositRequiredCents: 100_000,
          depositInvoiceId: null,
          depositPaid: false,
          checkpointId: null,
          coveredRoomIds: [],
          executedAt: null,
          sentAt: null,
          proposalSendDispatchId: null,
          supersededByNumber: null,
          itemCount: 3,
          items: [],
        },
      ],
      [scope({ number: 1 })],
    );

    expect(rows.map((row) => row.mark)).toEqual(["A1", "TS1"]);
    expect(rows[1].label).toBe("Trade scope № 1 · Drapery fabrication & install");
    expect(rows[0].key).not.toBe(rows[1].key);
  });
});
