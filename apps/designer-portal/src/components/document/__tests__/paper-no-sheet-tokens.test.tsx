/**
 * US-21 CONTRACT §3.5 (T-33 F14) — no `--sheet-*` token resolves under
 * `[data-document-paper]`. The globals.css grep proves the stylesheet; this
 * proves the DOM: the Pieces overview, rendered on the paper with every room
 * open, a returned room and a held room, carries no `sheet-` class and no
 * `var(--sheet-` inline style.
 */
import { render } from "@testing-library/react";
import type {
  OverviewLine,
  OverviewPlacement,
} from "@/lib/document/pieces/overview-derivation";

const mockPlacements: OverviewPlacement[] = [
  { ffeItemId: "F1", projectRoomId: "hall", quantity: 120 },
  { ffeItemId: "F1", projectRoomId: "living", quantity: 320 },
];

jest.mock("@patina/supabase", () => ({
  useProjectRoomPlacements: () => ({ data: mockPlacements }),
  useProjectPalettes: () => ({ data: [] }),
}));
jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import { PiecesOverview } from "../pieces/pieces-overview";
import { deriveOverviewJob } from "@/lib/document/pieces/overview-derivation";

const ROOMS = [
  { id: "hall", name: "Hall" },
  { id: "living", name: "Living Room" },
  { id: "dining", name: "Dining" },
];

const line = (
  id: string,
  room: string | null,
  over: Partial<OverviewLine> = {},
): OverviewLine => ({
  id,
  project_room_id: room,
  quantity: 1,
  status: "specified",
  item_type: "fixed",
  unit_price_cents: 0,
  rough_cents: 120000,
  ...over,
});

const LINES: OverviewLine[] = [
  line("H1", "hall"),
  line("L1", "living", { vendor_name: "A maker" }),
  line("F1", "living", {
    quantity: 440,
    rough_cents: 1150,
    vendor_name: "A maker",
  }),
  line("D1", "dining"),
  line("T1", null),
];

describe("the Pieces overview on the paper (CONTRACT §3.5)", () => {
  it("carries no sheet- class and no var(--sheet- inline style under [data-document-paper]", () => {
    const { container } = render(
      <div data-document-paper>
        <PiecesOverview
          projectId="project-1"
          docId="doc-1"
          lines={LINES}
          rooms={ROOMS}
          job={deriveOverviewJob(LINES)}
          allOpen
          returnedRoomId="living"
          heldRoomId="dining"
          onAddLine={jest.fn()}
          renderLines={(_row, ids) => (
            <ul>
              {ids.map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ul>
          )}
        />
      </div>,
    );

    const paper = container.querySelector("[data-document-paper]");
    expect(paper).not.toBeNull();
    const elements = [
      paper as Element,
      ...Array.from(paper!.querySelectorAll("*")),
    ];
    // The overview actually printed: rows, their acts and the open rooms' lines.
    expect(
      paper!.querySelectorAll("[data-pieces-room]").length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      paper!.querySelector('[data-action-key="work-this-room"]'),
    ).not.toBeNull();

    const sheetClasses = elements.filter((el) =>
      (el.getAttribute("class") ?? "")
        .split(/\s+/)
        .some((name) => name.includes("sheet-")),
    );
    const sheetStyles = elements.filter((el) =>
      (el.getAttribute("style") ?? "").includes("var(--sheet-"),
    );
    expect(sheetClasses.map((el) => el.outerHTML.slice(0, 120))).toEqual([]);
    expect(sheetStyles.map((el) => el.outerHTML.slice(0, 120))).toEqual([]);
  });
});
