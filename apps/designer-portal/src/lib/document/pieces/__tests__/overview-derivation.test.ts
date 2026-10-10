import {
  deriveOverviewJob,
  deriveOverviewRows,
  overviewFrontMatter,
  splitCentsByShare,
  type OverviewLine,
} from "../overview-derivation";

/**
 * T-43b (F-A2): an allowance's ceiling, `budget_max_cents`, is the line total
 * (00744 step 10; the Release amount). The overview counts it once, split by
 * a room's share and never multiplied by the quantity, and never counts the
 * line's stale `unit_price_cents`. Fixed lines are unchanged.
 */
function line(id: string, extra: Partial<OverviewLine> = {}): OverviewLine {
  return {
    id,
    project_room_id: "bedroom",
    assignment_scope: "room",
    status: "specified",
    quantity: 1,
    item_type: "fixed",
    product_id: "p-1",
    vendor_id: "v-1",
    vendor_name: null,
    unit_price_cents: 0,
    budget_max_cents: null,
    ffe_line_authorization: null,
    line_kind: "goods",
    parent_ffe_item_id: null,
    trade_scope_document_id: null,
    removed_at: null,
    ...extra,
  } as OverviewLine;
}

const ROOMS = [
  { id: "bedroom", name: "Bedroom" },
  { id: "hall", name: "Hall" },
];

// Made an allowance after it was priced: 00743 keeps the old $230 a roll.
const WALLPAPER = line("wallpaper", {
  quantity: 9,
  unit: "roll",
  item_type: "allowance",
  unit_price_cents: 23000,
  budget_max_cents: 225000,
} as Partial<OverviewLine>);
const LAMP = line("lamp", { quantity: 2, unit_price_cents: 40000 });

describe("overview-derivation: an allowance counts its ceiling as the line total", () => {
  it("totals budget_max once, with no quantity multiplication and no stale price", () => {
    const job = deriveOverviewJob([WALLPAPER]);
    const total = job.pricedCents + job.roughedCents + job.releasedCents;
    expect(total).toBe(225000);
    expect(total).not.toBe(9 * 225000);
    expect(total).not.toBe(9 * 23000);
  });

  it("adds the ceiling beside a fixed line's price × quantity", () => {
    const job = deriveOverviewJob([WALLPAPER, LAMP]);
    expect(job.pricedCents + job.roughedCents + job.releasedCents).toBe(
      225000 + 2 * 40000,
    );
    expect(overviewFrontMatter(job)).toContain("$3,050");
  });

  it("counts the ceiling once in its one room", () => {
    const [bedroom] = deriveOverviewRows([WALLPAPER, LAMP], [], ROOMS);
    const t = bedroom.tally;
    expect(t.pricedCents + t.roughedCents + t.releasedCents).toBe(305000);
  });

  it("splits the ceiling by a placed line's share, summing to the line total", () => {
    const rows = deriveOverviewRows(
      [WALLPAPER],
      [
        { ffeItemId: "wallpaper", projectRoomId: "bedroom", quantity: 6 },
        { ffeItemId: "wallpaper", projectRoomId: "hall", quantity: 3 },
      ],
      ROOMS,
    );
    const sum = (key: string) => {
      const t = rows.find((r) => r.key === key)!.tally;
      return t.pricedCents + t.roughedCents + t.releasedCents;
    };
    expect(sum("bedroom")).toBe(150000);
    expect(sum("hall")).toBe(75000);
  });

  it("shares the waste: the room rows sum to the job (T-55b, F13)", () => {
    // 913 sq ft bought, 830 placed (600 + 230); 83 is waste.
    const floor = line("floor", {
      quantity: 913,
      unit_price_cents: 1150,
      project_room_id: "bedroom",
    });
    const rows = deriveOverviewRows(
      [floor],
      [
        { ffeItemId: "floor", projectRoomId: "bedroom", quantity: 600 },
        { ffeItemId: "floor", projectRoomId: "hall", quantity: 230 },
      ],
      ROOMS,
    );
    const money = (key: string) => {
      const t = rows.find((r) => r.key === key)!.tally;
      return t.pricedCents + t.roughedCents + t.releasedCents;
    };
    const job = deriveOverviewJob([floor]);
    const jobMoney = job.pricedCents + job.roughedCents + job.releasedCents;
    expect(jobMoney).toBe(913 * 1150);
    expect(money("bedroom") + money("hall")).toBe(jobMoney);
    // 1,049,950 × 600/830 = 759,000.0…; × 230/830 = 290,950.0…
    expect(money("bedroom")).toBe(759000);
    expect(money("hall")).toBe(290950);
  });

  it("splits in integer cents by largest remainder, ties to placement order (F9)", () => {
    expect(splitCentsByShare(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitCentsByShare(225000, [6, 3])).toEqual([150000, 75000]);
    expect(splitCentsByShare(10, [0, 0])).toEqual([10, 0]);
    const ceiling = line("odd", {
      quantity: 3,
      item_type: "allowance",
      budget_max_cents: 100001,
    });
    const rows = deriveOverviewRows(
      [ceiling],
      [
        { ffeItemId: "odd", projectRoomId: "bedroom", quantity: 1 },
        { ffeItemId: "odd", projectRoomId: "hall", quantity: 2 },
      ],
      ROOMS,
    );
    const cents = rows.map((r) => r.tally.roughedCents + r.tally.pricedCents);
    cents.forEach((c) => expect(Number.isInteger(c)).toBe(true));
    expect(cents.reduce((s, c) => s + c, 0)).toBe(100001);
  });

  it("never counts a superseded predecessor (T-55b, F7)", () => {
    const old = line("old", {
      quantity: 2,
      unit_price_cents: 40000,
      design_disposition: "superseded",
    });
    const job = deriveOverviewJob([old, LAMP]);
    expect(job.lines).toBe(1);
    expect(job.pricedCents + job.roughedCents + job.releasedCents).toBe(80000);
    const [bedroom] = deriveOverviewRows([old, LAMP], [], ROOMS);
    expect(bedroom.lineIds).toEqual(["lamp"]);
  });

  it("leaves an allowance with no ceiling on its old reading", () => {
    const open = line("open", {
      quantity: 2,
      item_type: "allowance",
      unit_price_cents: 0,
      budget_max_cents: null,
      rough_cents: 5000,
    });
    const job = deriveOverviewJob([open]);
    expect(job.pricedCents + job.roughedCents + job.releasedCents).toBe(10000);
  });
});
