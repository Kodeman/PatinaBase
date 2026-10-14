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

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/hooks/use-document-state", () => ({
  useDocumentEngagement: () => mockEngagement(),
}));

jest.mock("@patina/supabase", () => ({
  useProjectFFEItems: () => ({ data: undefined }),
  useProjectPalettes: () => ({ data: undefined }),
  useProjectRoomPlacements: () => ({ data: undefined }),
  useRemovedProjectLines: () => ({ data: undefined }),
}));

jest.mock("@/hooks/use-document-rooms", () => ({
  useDocumentRooms: () => ({ data: undefined }),
  useAddDocumentRoom: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/use-can-see-margin", () => ({
  useCanSeeMargin: () => false,
}));

jest.mock("@/components/document/pieces/build-room-shell", () => ({
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
