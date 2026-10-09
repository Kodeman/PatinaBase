import { deriveTicket, type TicketInput } from "@/lib/document/ticket-derivation";
import { pieceLineStage } from "../line-stage";
import { buildRoomTicketLines } from "../live-lines";
import {
  deriveOverviewJob,
  deriveOverviewRows,
  type OverviewLine,
} from "../overview-derivation";
import { deriveRoomCounts } from "../room-counts";

/**
 * T-61 F7: one placeholder count everywhere. A placeholder count counts live
 * pieces only: never a labor line waiting on a vendor, never a superseded
 * predecessor, never a Trade Scope presence line or a line not selected.
 */
type Row = OverviewLine & { status: string; blocked: boolean | null; received_quantity: number | null };

const row = (id: string, room: string, extra: Partial<Row> = {}): Row => ({
  id,
  status: "specified",
  blocked: false,
  received_quantity: null,
  project_room_id: room,
  assignment_scope: "room",
  quantity: 1,
  item_type: "tbd",
  ...extra,
});

const ROOMS = [
  { id: "hall", name: "Hall" },
  { id: "living", name: "Living" },
];

const LINES: Row[] = [
  // Two placeholder pieces.
  row("H1", "hall"),
  row("L1", "living"),
  // A specced piece and its labor, which waits on a vendor.
  row("L2", "living", { vendor_name: "Maker", quantity: 9 }),
  row("L2a", "living", {
    line_kind: "labor",
    parent_ffe_item_id: "L2",
    quantity: 9,
  }),
  // A superseded predecessor beside its successor; it reads PLACEHOLDER.
  row("H2-old", "hall", { design_disposition: "superseded" }),
  row("H2", "hall", { vendor_name: "Maker" }),
  // A line not selected, and a Trade Scope presence line.
  row("L3", "living", { design_disposition: "not_selected" }),
  row("T1", "hall", { trade_scope_document_id: "pcd-1" }),
];

function bandCount(lines: readonly Row[]): number {
  const input: TicketInput = {
    section: "project",
    phase: null,
    project: true,
    rooms: { settled: true, list: [] },
    pieces: { settled: true, lines: buildRoomTicketLines(lines) },
    drawings: { settled: true, sheetCount: 0 },
    boards: { settled: true, count: 0 },
    money: {
      settled: true,
      failed: false,
      ladder: {
        budget: { cents: null, note: "", word: "budget" },
        plan: { cents: null, note: "", word: "plan" },
        authorized: { cents: null, note: "", word: "authorized" },
        moved: { cents: null, note: "", word: "moved" },
        owed: { cents: null, note: "", word: "owed" },
        notDrawn: { cents: null, note: "", word: "not drawn" },
      },
      owedDays: null,
      undrawnKind: null,
      owedSince: null,
    },
    dates: { settled: true, schedule: null },
    people: { settled: true, callSheetEnabled: true, rosterCount: 0 },
    now: new Date(2026, 9, 8),
  };
  const spec = deriveTicket(input).find((r) => r.key === "spec");
  // The band's Standing row parses this phrase (lens-band-derivation PLACEHOLDERS).
  const match = /^(\d+) placeholders?$/.exec(spec?.exception?.phrase ?? "");
  return match ? Number(match[1]) : 0;
}

describe("one placeholder count (T-61 F7)", () => {
  it("stamps the labor line and the predecessor PLACEHOLDER, so the fixture tests the exclusion", () => {
    const byId = (id: string) => LINES.find((l) => l.id === id)!;
    expect(pieceLineStage(byId("L2a"), byId("L2")).stage).toBe("placeholder");
    expect(pieceLineStage(byId("H2-old")).stage).toBe("placeholder");
    expect(pieceLineStage(byId("L3")).stage).toBe("placeholder");
    // The predecessor leaves the band; the labor line stays a ticket line.
    const ticket = buildRoomTicketLines(LINES);
    expect(ticket).toHaveLength(LINES.length - 1);
    expect(ticket.filter((l) => l.stamp === "placeholder")).toHaveLength(4);
  });

  it("the band, the overview head and the sum of the room rows agree", () => {
    const head = deriveOverviewJob(LINES).placeholders;
    const rows = deriveOverviewRows(LINES, [], ROOMS);
    const roomSum = rows.reduce((sum, r) => sum + r.placeholderLines, 0);
    const band = bandCount(LINES);

    expect(head).toBe(2);
    expect(band).toBe(head);
    expect(roomSum).toBe(head);
  });

  it("the Build room counts agree with them", () => {
    const counts = deriveRoomCounts(LINES, [], ["hall", "living"]);
    expect(counts.job.placeholders).toBe(2);
    expect(counts.rooms.hall.placeholders + counts.rooms.living.placeholders).toBe(2);
    const rows = deriveOverviewRows(LINES, [], ROOMS);
    for (const r of rows) {
      expect(r.placeholderLines).toBe(counts.rooms[r.key].placeholders);
    }
  });
});
