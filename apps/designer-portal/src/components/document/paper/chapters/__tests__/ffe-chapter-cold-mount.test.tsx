/**
 * SQ-1898 (SQ-1896 F5): the cold mount, in its real order. The real
 * `BuildRoom` prints its skeleton until the sheet's reads answer, and only
 * then mounts the real `BuildRoomShell`, whose embedded title focus runs on
 * that mount. A reader who has moved on while the reads were out keeps her
 * place; one who has not is landed as before. Only the reads and the lens
 * bodies are stood in for.
 */

import type { ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const DOC = "11111111-1111-4111-8111-111111111111";
const PROJECT = "66666666-6666-4666-8666-666666666666";
const ROOM = "22222222-2222-4222-8222-222222222222";

let answerLines: (lines: unknown[]) => void = () => {};

jest.mock("@patina/supabase", () => ({
  // The lines answer only when the test says so, through a real query.
  useProjectFFEItems: (projectId: string) => {
    const { useQuery: query } = jest.requireActual("@tanstack/react-query");
    return query({
      queryKey: ["project-ffe-items", projectId],
      queryFn: () =>
        new Promise((resolve) => {
          answerLines = resolve;
        }),
    });
  },
  useProjectRoomPlacements: () => ({ data: [], isPending: false }),
  useRemovedProjectLines: () => ({ data: [] }),
  useProjectPalettes: () => ({ data: [] }),
}));
jest.mock("@/hooks/use-document-state", () => ({
  useDocumentEngagement: () => ({
    data: {
      kind: "engagement",
      row: { project_id: PROJECT, title: "F01 Residence" },
    },
    isError: false,
    fetchStatus: "idle",
  }),
}));
jest.mock("@/hooks/use-document-rooms", () => ({
  useDocumentRooms: () => ({
    data: [{ id: ROOM, name: "Living Room" }],
    isPending: false,
  }),
  useAddDocumentRoom: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("@/hooks/use-can-see-margin", () => ({ useCanSeeMargin: () => true }));
jest.mock("@/components/document/pieces/rough-in-lens", () => ({
  RoughInLens: ({ room }: { room: string | null }) =>
    room ? (
      <h3 tabIndex={-1} data-room-heading={room}>
        Living Room
      </h3>
    ) : null,
}));
jest.mock("@/components/document/pieces/spec-lens", () => ({ SpecLens: () => null }));
jest.mock("@/components/document/pieces/price-lens", () => ({ PriceLens: () => null }));
jest.mock("@/components/document/pieces/release-lens", () => ({
  ReleaseLens: () => null,
}));
jest.mock("@/components/document/pieces/finishes-lens", () => ({
  FinishesLens: () => null,
  roomFinishesByRoom: () => new Map(),
}));

import { FfeChapter } from "../ffe-chapter";

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderUnfolded() {
  window.history.replaceState(
    {},
    "",
    `/doc/${DOC}?unfold=pieces&lens=rough&room=${ROOM}`,
  );
  return render(
    <FfeChapter docId={DOC}>
      <p>The chapter body</p>
    </FfeChapter>,
    { wrapper },
  );
}

const title = () =>
  document.querySelector<HTMLElement>("[data-build-room-title]");
const heading = () =>
  document.querySelector<HTMLElement>(`[data-room-heading="${ROOM}"]`);
const returnToRoom = () =>
  screen.getByRole("button", { name: /Return to the room/ });

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  answerLines = () => {};
  (Element.prototype.scrollIntoView as jest.Mock).mockClear();
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("SQ-1896 F5: the cold-mounted sheet leaves a reader who has moved on", () => {
  it("does not take focus to its title once the reader has focused Return to the room", async () => {
    renderUnfolded();
    // The real BuildRoom holds its skeleton: no shell, no title yet.
    await waitFor(() => expect(client.isFetching()).toBeGreaterThan(0));
    expect(screen.getAllByText("Loading the pieces.").length).toBeGreaterThan(0);
    expect(title()).toBeNull();

    act(() => returnToRoom().focus());
    await act(async () => answerLines([]));

    // The shell has mounted now, with its title and the room's heading.
    await waitFor(() => expect(title()).not.toBeNull());
    await waitFor(() => expect(heading()).not.toBeNull());
    expect(document.activeElement).toBe(returnToRoom());
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("with the reader still waiting, the cold mount takes the title and lands on the room", async () => {
    renderUnfolded();
    await waitFor(() => expect(client.isFetching()).toBeGreaterThan(0));
    await act(async () => answerLines([]));

    await waitFor(() => expect(document.activeElement).toBe(heading()));
  });
});
