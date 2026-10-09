import {
  deriveOverviewJob,
  deriveOverviewRows,
  overviewFrontMatter,
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
