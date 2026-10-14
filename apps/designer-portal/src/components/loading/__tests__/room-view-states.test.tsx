/**
 * US-34 F13b — the Room view's states before its plan (D1 §5).
 *
 * It used to return `null` while the scan was read, and its not-ready branch
 * also caught a failed read, so a failure printed the processing sentence.
 * Now: loading is the board with no words, a failed read is an alert, a read
 * that answered with no room says so, and an unparsed scan keeps its sentence.
 * None of them is blank.
 */

import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RoomGeometryDocument } from "@patina/supabase";
import { RoomView } from "@/components/document/rooms/room-view/room-view";

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () =>
    function MockStage() {
      return <div data-testid="stage" />;
    },
}));

jest.mock("@/lib/analytics", () => ({
  roomEvents: {
    roomOpened: jest.fn(),
    modeSwitched: jest.fn(),
    measureUsed: jest.fn(),
  },
}));

jest.mock("@patina/supabase", () => ({
  useRoomFiles: () => ({ data: [] }),
  useScanRefineArtifacts: () => ({ data: undefined }),
  useRoomScan: () => ({ data: null }),
  useSignedScanModelUrl: () => ({ data: null, isFetching: false }),
  useSplatUrl: () => ({
    hasArtifact: false,
    artifact: null,
    url: null,
    unavailable: "no-artifact",
    isLoading: false,
  }),
}));

const PROCESSING = "The room plan is not available yet.";

function pendingDoc(): RoomGeometryDocument {
  return {
    engagementId: "eng-1",
    activeSection: "discovery",
    parseStatus: "pending",
    documentClientName: "Elena Vasquez",
    ownerClientName: "Elena Vasquez",
    roomType: "living_room",
    scannedAt: "2026-07-16T15:24:00Z",
  } as unknown as RoomGeometryDocument;
}

function renderState(state: {
  doc?: RoomGeometryDocument | null;
  isLoading?: boolean;
  isError?: boolean;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RoomView
        roomId="scan-1"
        doc={state.doc ?? null}
        geometry={null}
        thicknessConvention={false}
        isLoading={state.isLoading ?? false}
        isError={state.isError}
      />
    </QueryClientProvider>,
  );
}

describe("RoomView before its plan", () => {
  it("loading: the board, busy, with no words and no processing sentence", () => {
    const { container } = renderState({ isLoading: true });
    expect(container).not.toBeEmptyDOMElement();
    const region = container.querySelector('[aria-busy="true"]');
    expect(region).not.toBeNull();
    expect(region?.querySelector(".sr-only")).toHaveTextContent(
      "Loading the room drawing.",
    );
    expect(container.querySelector("[data-room-board]")).not.toBeNull();
    expect(container.querySelectorAll(".ph-corner")).toHaveLength(4);
    expect(screen.queryByText(PROCESSING)).toBeNull();
  });

  it("a failed read: an alert, not the processing sentence", () => {
    const { container } = renderState({ isError: true });
    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The room could not be read.",
    );
    expect(screen.queryByText(PROCESSING)).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("a read that answered with no room: says it is not found", () => {
    const { container } = renderState({ doc: null });
    expect(container).not.toBeEmptyDOMElement();
    expect(
      screen.getByText("This room could not be found."),
    ).toBeInTheDocument();
    expect(screen.queryByText(PROCESSING)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a scan not parsed yet: the processing sentence", () => {
    const { container } = renderState({ doc: pendingDoc() });
    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByText(PROCESSING)).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
