/**
 * US-34 F13a — the Build room (`/doc/[id]/pieces`) before its document
 * resolves. It used to render an empty `<main>` (blank paper) for the whole
 * read and for a missing document alike. Now the read in flight is the
 * shaped sheet, a failed read is an alert, and a missing document says so.
 */

import { act, render, screen } from "@testing-library/react";
import BuildRoomPage from "@/app/(document)/doc/[id]/pieces/page";

const DOC_ID = "6f1c1b6e-8a0e-4c47-9a39-2f3f1c2b9d10";
const mockEngagement = jest.fn();
type Read = { data: unknown[] | undefined; isPending: boolean };
const answered = (): Read => ({ data: [], isPending: false });
const mockRooms = jest.fn(answered);
const mockLines = jest.fn(answered);
const mockPlacements = jest.fn(answered);

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/hooks/use-document-state", () => ({
  useDocumentEngagement: () => mockEngagement(),
}));

jest.mock("@patina/supabase", () => ({
  useProjectFFEItems: () => mockLines(),
  useProjectPalettes: () => ({ data: undefined }),
  useProjectRoomPlacements: () => mockPlacements(),
  useRemovedProjectLines: () => ({ data: undefined }),
}));

jest.mock("@/hooks/use-document-rooms", () => ({
  useDocumentRooms: () => mockRooms(),
  useAddDocumentRoom: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/use-can-see-margin", () => ({
  useCanSeeMargin: () => false,
}));

jest.mock("@/components/document/pieces/build-room-shell", () => ({
  ...jest.requireActual("@/components/document/pieces/build-room-shell"),
  BuildRoomShell: () => <div data-testid="build-room" />,
}));
jest.mock("@/components/document/pieces/finishes-lens", () => ({
  FinishesLens: () => null,
  roomFinishesByRoom: () => new Map(),
}));
jest.mock("@/components/document/pieces/price-lens", () => ({
  PriceLens: () => null,
}));
jest.mock("@/components/document/pieces/release-lens", () => ({
  ReleaseLens: () => null,
}));
jest.mock("@/components/document/pieces/rough-in-lens", () => ({
  RoughInLens: () => null,
}));
jest.mock("@/components/document/pieces/spec-lens", () => ({
  SpecLens: () => null,
}));

async function renderPage(id = DOC_ID) {
  const params = Promise.resolve({ id });
  let result!: ReturnType<typeof render>;
  // `use(params)` suspends the page's first render; let the promise settle.
  await act(async () => {
    result = render(<BuildRoomPage params={params} />);
  });
  return result;
}

describe("the Build room before its document resolves", () => {
  it("a read in flight is the shaped sheet, busy, never blank", async () => {
    mockEngagement.mockReturnValue({
      data: undefined,
      isError: false,
      fetchStatus: "fetching",
    });
    const { container } = await renderPage();
    expect(await screen.findByText("Loading the pieces.")).toBeInTheDocument();
    const region = container.querySelector('[aria-busy="true"]');
    expect(region).not.toBeNull();
    expect(
      region?.querySelectorAll("[data-placeholder]").length,
    ).toBeGreaterThan(3);
    expect(screen.queryByTestId("build-room")).toBeNull();
  });

  it("a redirect on its way keeps the sheet", async () => {
    mockEngagement.mockReturnValue({
      data: { kind: "redirect", projectId: "proj-1" },
      isError: false,
      fetchStatus: "idle",
    });
    await renderPage();
    expect(await screen.findByText("Loading the pieces.")).toBeInTheDocument();
  });

  it("a failed read is an alert, not a busy sheet", async () => {
    mockEngagement.mockReturnValue({
      data: undefined,
      isError: true,
      fetchStatus: "idle",
    });
    const { container } = await renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The pieces could not be read.",
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("a missing document says so", async () => {
    mockEngagement.mockReturnValue({
      data: { kind: "missing" },
      isError: false,
      fetchStatus: "idle",
    });
    const { container } = await renderPage();
    expect(
      await screen.findByText("This document could not be found."),
    ).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

/**
 * SQ-1012 (N14) — once the document resolves, the sheet is composed from three
 * reads. Printed as each answered, the lines first stood unplaced, the room
 * tables landed above them and the placements emptied them: CLS 0.18 on a hard
 * load. The shaped sheet holds until all three have answered.
 */
describe("the Build room while its sheet's reads are in flight", () => {
  const inFlight = (): Read => ({ data: undefined, isPending: true });
  beforeEach(() => {
    mockEngagement.mockReturnValue({
      data: { kind: "engagement", row: { project_id: "proj-1", title: "Aspen Loft" } },
      isError: false,
      fetchStatus: "idle",
    });
  });
  afterEach(() => {
    mockRooms.mockImplementation(answered);
    mockLines.mockImplementation(answered);
    mockPlacements.mockImplementation(answered);
  });

  it.each([
    ["the rooms", mockRooms],
    ["the lines", mockLines],
    ["the placements", mockPlacements],
  ])("keeps the shaped sheet while %s are still in flight", async (_, read) => {
    read.mockImplementation(inFlight);
    await renderPage();
    expect(await screen.findByText("Loading the pieces.")).toBeInTheDocument();
    expect(screen.queryByTestId("build-room")).toBeNull();
  });

  it("prints the sheet once all three have answered", async () => {
    await renderPage();
    expect(await screen.findByTestId("build-room")).toBeInTheDocument();
    expect(screen.queryByText("Loading the pieces.")).toBeNull();
  });

  it("stops holding when a read fails", async () => {
    mockPlacements.mockImplementation(() => ({ data: undefined, isPending: false }));
    await renderPage();
    expect(await screen.findByTestId("build-room")).toBeInTheDocument();
  });
});
