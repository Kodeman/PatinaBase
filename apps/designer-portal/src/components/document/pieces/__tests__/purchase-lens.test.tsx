import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  derivePurchaseGroups,
  purchaseRow,
  PurchaseLens,
  type PurchaseContext,
  type PurchaseLensLine,
} from "../purchase-lens";
import { BuildRoomShell, type BuildRoomShellProps } from "../build-room-shell";
import { buildInstrumentIndex } from "@/lib/document/authorization-derivation";
import { emptyRoomCounts } from "@/lib/document/pieces/room-counts";
import {
  REMOVED_PLACE,
  THROUGHOUT_PLACE,
} from "@/lib/document/pieces/build-room-url";

const mockLines: { data: PurchaseLensLine[] | undefined } = { data: [] };
const mockPurchases = {
  data: [] as unknown[] | undefined,
  isError: false,
  isPending: false,
  refetch: jest.fn(),
};
function settledRead(data: unknown) {
  return { data, isPending: false, isError: false, refetch: jest.fn() };
}
const mockAuthority = settledRead(null);
const mockAgreement = settledRead({ state: "missing", evidence: null });
const mockInstruments = settledRead([]);

jest.mock("@patina/supabase", () => ({
  useProjectFFEItems: () => mockLines,
  useStudioPurchases: () => mockPurchases,
}));
jest.mock("@/hooks/use-commercial-documents", () => ({
  useProjectBillingAuthority: () => mockAuthority,
  useProjectInstruments: () => mockInstruments,
}));
jest.mock("@/hooks/use-project-purchasing-agreement", () => ({
  useProjectPurchasingAgreement: () => mockAgreement,
}));
jest.mock("@/hooks/use-document-rooms", () => ({
  useDocumentRooms: () => ({
    data: [
      { id: "living", name: "Living Room" },
      { id: "kitchen", name: "Kitchen" },
    ],
  }),
}));
jest.mock("@/components/document/purchases/purchase-record-form", () => ({
  PurchaseRecordForm: ({ onDone }: { onDone: (r: string) => void }) => (
    <button type="button" onClick={() => onDone("Recorded the lamp.")}>
      Mock record form
    </button>
  ),
}));

function line(id: string, extra: Partial<PurchaseLensLine> = {}): PurchaseLensLine {
  return {
    id,
    name: `Line ${id}`,
    status: "specified",
    blocked: false,
    received_quantity: null,
    assignment_scope: "room",
    project_room_id: "living",
    quantity: 1,
    vendor_id: "vendor-1",
    vendor_name: "Maker Co",
    item_type: "fixed",
    unit_price_cents: 120_000,
    line_total_cents: 120_000,
    design_disposition: "selected",
    ...extra,
  } as PurchaseLensLine;
}

const READY = line("ready");
const WAITING = line("waiting", {
  vendor_id: null,
  vendor_name: null,
  unit_price_cents: null,
  line_total_cents: null,
});
const ORDERED = line("ordered", {
  status: "ordered",
  ffe_line_authorization: "executed",
  purchase_order: { status: "draft", sent_at: null, po_number: "PO-7" },
});
const BOUGHT = line("bought", { studio_purchases: [{ status: "recorded" }] });
const EXTERNAL = line("external", {
  name: "GC cabinet run",
  external_fulfilment_id: "ext-1",
  unit_price_cents: 0,
  line_total_cents: 0,
  assignment_scope: "room",
  project_room_id: "kitchen",
});
const LABOR = line("labor", { line_kind: "labor" });
const REMOVED = line("removed", { removed_at: "2026-10-01" } as Partial<PurchaseLensLine>);
const THROUGHOUT = line("throughout", { assignment_scope: "throughout", project_room_id: null });
const ROOMS = [
  { id: "living", name: "Living Room" },
  { id: "kitchen", name: "Kitchen" },
];
const ALL = [READY, WAITING, ORDERED, BOUGHT, EXTERNAL, LABOR, REMOVED, THROUGHOUT];

// A job with no agreement behind it: authorization warns, never blocks.
const STUDIO_JOB: PurchaseContext = { isCommercialOrigin: false, instruments: new Map() };
// A job with an executed agreement behind it, holding no instrument yet.
const COMMERCIAL_JOB: PurchaseContext = { isCommercialOrigin: true, instruments: new Map() };
function authorizedOn(lineId: string, depositPaid: boolean): PurchaseContext {
  return {
    isCommercialOrigin: true,
    instruments: buildInstrumentIndex([
      {
        state: "executed",
        number: 2,
        depositPaid,
        items: [{ sourceFfeItemId: lineId, clientLineTotalCents: 120_000 }],
      },
    ] as Parameters<typeof buildInstrumentIndex>[0]),
  };
}

describe("purchaseRow — where a line stands", () => {
  it("reads each standing from the line's own facts", () => {
    expect(purchaseRow(READY, STUDIO_JOB).standing).toBe("ready");
    expect(purchaseRow(READY, STUDIO_JOB).next).toEqual({ kind: "order" });
    expect(purchaseRow(READY, STUDIO_JOB).reasons).toEqual([]);
    expect(purchaseRow(WAITING, STUDIO_JOB).standing).toBe("waiting");
    expect(purchaseRow(ORDERED, STUDIO_JOB).standing).toBe("ordered");
    expect(purchaseRow(ORDERED, STUDIO_JOB).next).toEqual({ kind: "send" });
    expect(purchaseRow(BOUGHT, STUDIO_JOB).standing).toBe("bought");
  });

  it("external fulfilment is external responsibility with no next act, even when it looks ready", () => {
    const external = purchaseRow({ ...EXTERNAL, unit_price_cents: 100 }, STUDIO_JOB);
    expect(external.standing).toBe("external");
    expect(external.next).toBeNull();
  });

  it("a cancelled order no longer counts as an order", () => {
    const row = purchaseRow(
      line("c", { purchase_order: { status: "cancelled", sent_at: null } }),
      STUDIO_JOB,
    );
    expect(row.standing).toBe("ready");
  });
});

describe("purchaseRow — the one readiness rule, never the visual stage", () => {
  const cases: [string, PurchaseLensLine, PurchaseContext, string][] = [
    [
      "a maker named but not linked",
      line("maker", { vendor_id: null, vendor_name: "Maker Co" }),
      STUDIO_JOB,
      "Needs a maker",
    ],
    [
      "a candidate not yet selected",
      line("candidate", { design_disposition: "candidate" }),
      STUDIO_JOB,
      "Not selected yet",
    ],
    [
      "a commercial job without the authorization",
      line("unauthorized"),
      COMMERCIAL_JOB,
      "Waiting on the authorization",
    ],
    [
      "a commercial job authorized with the deposit unpaid",
      line("deposit"),
      authorizedOn("deposit", false),
      "Waiting on the deposit (A2)",
    ],
  ];

  it.each(cases)("%s is not ready to order and says why", (_name, subject, context, reason) => {
    const row = purchaseRow(subject, context);
    expect(row.standing).toBe("waiting");
    expect(row.next).toBeNull();
    expect(row.reasons).toEqual([reason]);
  });

  it("a commercial job authorized with the deposit clear is ready", () => {
    const row = purchaseRow(line("cleared"), authorizedOn("cleared", true));
    expect(row.standing).toBe("ready");
    expect(row.next).toEqual({ kind: "order" });
  });

  it("a blocked line never sits under Ready to order and shows its reason", () => {
    mockLines.data = [line("maker", { vendor_id: null, vendor_name: "Maker Co" })];
    render(<PurchaseLens projectId="p1" room={null} canSeeMoney />);
    const row = document.querySelector('[data-purchase-row="maker"]') as HTMLElement;
    expect(row).toHaveAttribute("data-purchase-standing", "waiting");
    expect(within(row).getByText("Not ready to order")).toBeInTheDocument();
    expect(within(row).getByText("Needs a maker")).toBeInTheDocument();
    expect(within(row).queryByText(/Prepare a PO/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Show purchasing lines"), { target: { value: "ready" } });
    expect(document.querySelector('[data-purchase-row="maker"]')).toBeNull();
  });
});

describe("derivePurchaseGroups", () => {
  it("groups pieces by room, then Throughout; drops labor and removed lines", () => {
    const groups = derivePurchaseGroups(ALL, ROOMS, null, "all", STUDIO_JOB);
    expect(groups.map((g) => g.name)).toEqual(["Living Room", "Kitchen", "Throughout"]);
    const ids = groups.flatMap((g) => g.rows.map((r) => r.line.id));
    expect(ids).not.toContain("labor");
    expect(ids).not.toContain("removed");
    expect(groups[1].rows.map((r) => r.line.id)).toEqual(["external"]);
  });

  it("narrows to one place and one filter", () => {
    expect(
      derivePurchaseGroups(ALL, ROOMS, THROUGHOUT_PLACE, "all", STUDIO_JOB).flatMap((g) => g.rows.map((r) => r.line.id)),
    ).toEqual(["throughout"]);
    expect(
      derivePurchaseGroups(ALL, ROOMS, "living", "ordered", STUDIO_JOB).flatMap((g) => g.rows.map((r) => r.line.id)),
    ).toEqual(["ordered", "bought"]);
    expect(
      derivePurchaseGroups(ALL, ROOMS, null, "external", STUDIO_JOB).flatMap((g) => g.rows.map((r) => r.line.id)),
    ).toEqual(["external"]);
  });
});

describe("PurchaseLens", () => {
  beforeEach(() => {
    mockLines.data = ALL;
    mockPurchases.data = [
      {
        id: "sp-1",
        description: "Brass lamp",
        payee_name: "Flea market",
        amount_cents: 8_500,
        purchased_on: "2026-10-20",
        voided_at: null,
      },
    ];
    mockPurchases.isError = false;
    mockPurchases.isPending = false;
  });

  it("with money: amounts show, and external lines are never priced as studio purchases", () => {
    render(<PurchaseLens projectId="p1" room={null} canSeeMoney />);
    const table = screen.getByRole("table", { name: "Purchasing" });
    expect(within(table).getByRole("columnheader", { name: "Amount" })).toBeInTheDocument();
    const external = table.querySelector('[data-purchase-row="external"]') as HTMLElement;
    expect(external).toHaveAttribute("data-purchase-standing", "external");
    expect(within(external).getByText("External responsibility")).toBeInTheDocument();
    // C5 fulfilments start planned: the copy names whose it is, never that it is bought.
    expect(within(external).getByText("Buying and payment sit outside the studio.")).toBeInTheDocument();
    expect(within(external).queryByText(/bought|paid/i)).not.toBeInTheDocument();
    expect(within(external).getByText("Not priced by the studio")).toBeInTheDocument();
    expect(within(external).queryByText(/\$/)).not.toBeInTheDocument();
    expect(within(external).queryByText(/Prepare a PO/)).not.toBeInTheDocument();
    const ready = table.querySelector('[data-purchase-row="ready"]') as HTMLElement;
    expect(within(ready).getByText("$1,200")).toBeInTheDocument();
    expect(within(ready).getByText("Next: Prepare a PO")).toBeInTheDocument();
    expect(screen.getByText(/Brass lamp · Flea market · \$85/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record something bought already" })).toBeInTheDocument();
  });

  it("without money: no amounts anywhere and no record act, as the Price lens gates money", () => {
    render(<PurchaseLens projectId="p1" room={null} canSeeMoney={false} />);
    expect(screen.queryByRole("columnheader", { name: "Amount" })).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.getByText(/Brass lamp · Flea market/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record something bought already" })).not.toBeInTheDocument();
  });

  it("offers no send or order act: nothing here sends", () => {
    render(<PurchaseLens projectId="p1" room={null} canSeeMoney />);
    for (const name of [/send/i, /prepare/i, /release/i, /order/i]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("the filter narrows the schedule and an empty view says so", () => {
    mockLines.data = [READY];
    render(<PurchaseLens projectId="p1" room={null} canSeeMoney />);
    fireEvent.change(screen.getByLabelText("Show purchasing lines"), { target: { value: "external" } });
    expect(screen.getByText("No lines match this view. Change the room or the purchasing filter.")).toBeInTheDocument();
  });

  it("opening a line hands it to Specifications", () => {
    const onOpenLine = jest.fn();
    render(<PurchaseLens projectId="p1" room="living" canSeeMoney onOpenLine={onOpenLine} />);
    fireEvent.click(screen.getByRole("button", { name: "Line ready" }));
    expect(onOpenLine).toHaveBeenCalledWith("ready");
  });

  it("the record form is the existing one, and closes on done", () => {
    render(<PurchaseLens projectId="p1" room={null} canSeeMoney />);
    fireEvent.click(screen.getByRole("button", { name: "Record something bought already" }));
    fireEvent.click(screen.getByRole("button", { name: "Mock record form" }));
    expect(screen.getByRole("status")).toHaveTextContent("Recorded the lamp.");
    expect(screen.queryByRole("button", { name: "Mock record form" })).not.toBeInTheDocument();
  });

  it("a refused studio-purchases read says so and retries", () => {
    mockPurchases.data = undefined;
    mockPurchases.isError = true;
    render(<PurchaseLens projectId="p1" room={null} canSeeMoney />);
    expect(screen.getByRole("alert")).toHaveTextContent("could not be read");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mockPurchases.refetch).toHaveBeenCalled();
  });

  it("an unread purchasing authority shows no line as ready, says so and retries", () => {
    mockAuthority.isError = true;
    try {
      render(<PurchaseLens projectId="p1" room={null} canSeeMoney />);
      expect(document.querySelector("[data-purchase-row]")).toBeNull();
      expect(screen.queryByText("Next: Prepare a PO")).not.toBeInTheDocument();
      const alert = screen.getAllByRole("alert")[0];
      expect(alert).toHaveTextContent("purchasing authority could not be read");
      fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
      expect(mockAuthority.refetch).toHaveBeenCalled();
      expect(mockInstruments.refetch).not.toHaveBeenCalled();
    } finally {
      mockAuthority.isError = false;
    }
  });

  it("removed lines are not purchased", () => {
    render(<PurchaseLens projectId="p1" room={REMOVED_PLACE} canSeeMoney />);
    expect(screen.getByText(/Removed selections are not purchased/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("the lens band", () => {
  function band(embedded: boolean, canSeeMoney = true) {
    const props: BuildRoomShellProps = {
      docId: "doc-1",
      jobName: "Lake House",
      rooms: ROOMS,
      counts: {
        rooms: {},
        throughout: emptyRoomCounts(),
        unassigned: emptyRoomCounts(),
        job: emptyRoomCounts(),
      },
      removedCount: 0,
      lens: "purchase",
      room: null,
      canSeeMoney,
      embedded,
      onNavigate: jest.fn(),
      onReturn: jest.fn(),
    };
    render(<BuildRoomShell {...props} />);
    return within(screen.getByRole("group", { name: "Schedule view" }))
      .getAllByRole("button")
      .map((b) => b.textContent);
  }

  it("legacy keeps five lenses: no hidden sixth tab", () => {
    expect(band(false)).toEqual([
      "Preliminary selections",
      "Specifications",
      "Pricing",
      "Purchasing authorization",
      "Finish schedule",
    ]);
  });

  it("round 8 shows Purchasing sixth, in lens order", () => {
    expect(band(true)).toEqual([
      "Preliminary selections",
      "Specifications",
      "Pricing",
      "Purchasing authorization",
      "Finish schedule",
      "Purchasing",
    ]);
  });

  it("round 8 keeps Purchasing for a seat without money", () => {
    expect(band(true, false)).toEqual([
      "Preliminary selections",
      "Specifications",
      "Purchasing authorization",
      "Finish schedule",
      "Purchasing",
    ]);
  });
});
