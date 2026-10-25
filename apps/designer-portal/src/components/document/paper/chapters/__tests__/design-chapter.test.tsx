import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  useProjectRooms,
  useProjectRoomScans,
  useGeneratedRoomFilesByScan,
  useScanContextCaptures,
  useRoomConceptRenderRecord,
  usePlanRoom,
  useRoomScanCovers,
} from "@patina/supabase";
import { DesignChapter } from "../design-chapter";

jest.mock("@patina/supabase", () => ({
  useProjectRooms: jest.fn(),
  useProjectRoomScans: jest.fn(),
  useGeneratedRoomFilesByScan: jest.fn(),
  useScanContextCaptures: jest.fn(),
  useRoomConceptRenderRecord: jest.fn(),
  usePlanRoom: jest.fn(),
  useRoomScanCovers: jest.fn(),
}));
jest.mock("@/components/feedback/inline-error-surface", () => ({
  InlineErrorSurface: () => null,
}));
jest.mock("@/components/room-file/capture-context-section", () => ({
  CaptureContextSection: ({
    captures,
  }: {
    captures: Array<{ id: string; title: string }>;
  }) => (
    <ul>
      {captures.map((capture) => (
        <li key={capture.id}>{capture.title}</li>
      ))}
    </ul>
  ),
}));
jest.mock("../../../document-action", () => ({
  DocumentActionRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DocumentAction: ({
    children,
    onClick,
    href,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    href?: string;
  }) =>
    href ? (
      <a href={href}>{children}</a>
    ) : (
      <button onClick={onClick}>{children}</button>
    ),
}));

const ok = (data: unknown) => ({
  data,
  isPending: false,
  isError: false,
  refetch: jest.fn(),
});
const pending = () => ({
  data: undefined,
  isPending: true,
  isError: false,
  refetch: jest.fn(),
});
const failed = () => ({
  data: undefined,
  isPending: false,
  isError: true,
  refetch: jest.fn(),
});
const living = {
  id: "room-living",
  name: "Living room",
  concept_render_url: "private/concept.jpg",
};
const kitchen = {
  id: "room-kitchen",
  name: "Kitchen",
  concept_render_url: null,
};
const scan = (id: string, roomId: string | null, name = id) => ({
  id,
  project_room_id: roomId,
  name,
  scanned_at: "2026-10-23T12:00:00Z",
  created_at: "2026-10-23T12:00:00Z",
});
const mockRooms = jest.mocked(useProjectRooms);
const mockScans = jest.mocked(useProjectRoomScans);
const mockFiles = jest.mocked(useGeneratedRoomFilesByScan);
const mockCovers = jest.mocked(useRoomScanCovers);
const mockCaptures = jest.mocked(useScanContextCaptures);
const mockConcept = jest.mocked(useRoomConceptRenderRecord);
const mockPlans = jest.mocked(usePlanRoom);
const mount = (onWorkRoom = jest.fn()) =>
  render(
    <DesignChapter
      projectId="project-id"
      routeId="document-id"
      onWorkRoom={onWorkRoom}
    />,
  );

beforeEach(() => {
  mockRooms.mockReturnValue(
    ok([living, kitchen]) as ReturnType<typeof useProjectRooms>,
  );
  mockScans.mockReturnValue(
    ok([
      scan("survey-living", living.id),
      scan("survey-kitchen", kitchen.id),
    ]) as ReturnType<typeof useProjectRoomScans>,
  );
  mockFiles.mockReturnValue(
    ok(
      new Map([
        [
          "survey-living",
          { id: "file-living", unverified: true, drawings: { sheet_count: 2 } },
        ],
      ]),
    ) as ReturnType<typeof useGeneratedRoomFilesByScan>,
  );
  mockCovers.mockReturnValue(
    ok(new Map()) as ReturnType<typeof useRoomScanCovers>,
  );
  mockCaptures.mockImplementation(
    (scanId) =>
      ok(
        scanId === "survey-living"
          ? [{ id: "capture-1", title: "Window measurement" }]
          : [],
      ) as ReturnType<typeof useScanContextCaptures>,
  );
  mockConcept.mockReturnValue(
    ok({
      url: "https://local.test/signed-concept.jpg",
      uploadedAt: "2026-10-22T12:00:00Z",
      caption: "Proposed direction",
    }) as ReturnType<typeof useRoomConceptRenderRecord>,
  );
  mockPlans.mockReturnValue(
    ok({
      issues: [], issuePrints: [], transmittals: [], tokens: [],
      sheets: [
        {
          id: "sheet-1",
          sheet_number: "A-201",
          title: "Room plan",
          current_print_id: "print-current",
          state: "shared",
        },
      ],
      prints: [
        {
          id: "print-old",
          print_number: 1,
          rev_letter: "A",
          created_at: "2026-10-01T12:00:00Z",
        },
        {
          id: "print-current",
          print_number: 2,
          rev_letter: "B",
          created_at: "2026-10-23T12:00:00Z",
        },
      ],
    }) as ReturnType<typeof usePlanRoom>,
  );
});

test("groups surveys and Field captures by recorded room ID, never by matching names", () => {
  mockScans.mockReturnValue(
    ok([
      scan("survey-living", living.id),
      scan("survey-kitchen", kitchen.id),
      scan("unlinked", null, "Living room"),
      scan("removed-room", "deleted", "Old room"),
    ]) as ReturnType<typeof useProjectRoomScans>,
  );
  mount();
  const livingRoom = screen.getByRole("region", { name: "Living room" });
  const kitchenRoom = screen.getByRole("region", { name: "Kitchen" });
  expect(within(livingRoom).getByText("survey-living")).toBeInTheDocument();
  expect(
    within(livingRoom).getByText("Window measurement"),
  ).toBeInTheDocument();
  expect(
    within(livingRoom).queryByText("survey-kitchen"),
  ).not.toBeInTheDocument();
  expect(within(kitchenRoom).getByText("survey-kitchen")).toBeInTheDocument();
  expect(
    within(kitchenRoom).queryByText("Window measurement"),
  ).not.toBeInTheDocument();
  expect(
    within(
      screen.getByRole("region", { name: "Surveys without a current room" }),
    ).getByText("Old room"),
  ).toBeInTheDocument();
  expect(within(livingRoom).queryByText("Old room")).not.toBeInTheDocument();
  expect(mockCaptures).toHaveBeenCalledWith("survey-living");
  expect(mockConcept).toHaveBeenCalledWith({
    projectId: "project-id",
    roomId: living.id,
  });
});

test("labels survey, concept, date and uncertain measurements without claiming installation", () => {
  mockCovers.mockReturnValue(
    ok(
      new Map([
        [
          "survey-living",
          { signedPreviewUrl: "https://local.test/signed-survey.jpg" },
        ],
      ]),
    ) as ReturnType<typeof useRoomScanCovers>,
  );
  mount();
  expect(
    screen.getAllByText("Survey, not installed · Oct 23, 2026"),
  ).toHaveLength(2);
  expect(
    screen.getByText(/Concept, not installed · Oct 22, 2026/),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Measurements unverified — confirm on site."),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      /Field captures · survey evidence, not installed condition/,
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Open Room File · 2 sheets" }),
  ).toHaveAttribute("href", "/room/survey-living/file");
  expect(screen.getAllByRole("img")).toHaveLength(2);
  const image = screen.getByAltText(
    "Survey of survey-living, not installed condition",
  );
  expect(image).toHaveAttribute("loading", "lazy");
  expect(image).toHaveAttribute("src", "https://local.test/signed-survey.jpg");
});

test("Work this room passes the exact room ID and initiating control to the unfold owner", () => {
  const onWorkRoom = jest.fn();
  mount(onWorkRoom);
  const button = within(
    screen.getByRole("region", { name: "Kitchen" }),
  ).getByRole("button", { name: "Work this room" });
  fireEvent.click(button);
  expect(onWorkRoom).toHaveBeenCalledWith(kitchen.id, button);
  expect(onWorkRoom).toHaveBeenCalledTimes(1);
});

test("shows current prints once at project level using print identity rather than array order", () => {
  mount();
  const drawings = screen.getByRole("region", {
    name: "Project-level drawings",
  });
  expect(
    within(drawings).getByText(
      "Project-level prints — not assigned to individual rooms.",
    ),
  ).toBeInTheDocument();
  expect(
    within(drawings).getByText("Current print 2 · revision B · Oct 23, 2026 · Client-shared current"),
  ).toBeInTheDocument();
  expect(screen.getAllByText("A-201 · Room plan")).toHaveLength(1);
  expect(
    within(screen.getByRole("region", { name: "Living room" })).queryByText(
      "A-201 · Room plan",
    ),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Open project drawing sets" }),
  ).toHaveAttribute("href", "/doc/document-id/plans");
});

test("loading and failed reads never masquerade as empty evidence and retry stays inline", () => {
  const rooms = failed();
  mockRooms.mockReturnValue(rooms as ReturnType<typeof useProjectRooms>);
  mockScans.mockReturnValue(
    pending() as ReturnType<typeof useProjectRoomScans>,
  );
  mockPlans.mockReturnValue(failed() as ReturnType<typeof usePlanRoom>);
  mount();
  expect(
    screen.getByText("Rooms could not be read. Your place is kept."),
  ).toBeInTheDocument();
  expect(screen.getByText("Reading room surveys…")).toBeInTheDocument();
  expect(screen.queryByText("No rooms recorded yet.")).not.toBeInTheDocument();
  expect(
    screen.queryByText("No project drawings filed yet."),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry rooms" }));
  expect(rooms.refetch).toHaveBeenCalledTimes(1);
});

test("Room File failure keeps room context and never claims there is no generated file", () => {
  mockFiles.mockReturnValue(
    failed() as ReturnType<typeof useGeneratedRoomFilesByScan>,
  );
  mockCaptures.mockReturnValue(
    failed() as ReturnType<typeof useScanContextCaptures>,
  );
  mount();
  expect(
    screen.getByRole("region", { name: "Living room" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Room Files could not be read. Your place is kept."),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/No generated Room File available/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/No Field captures available/),
  ).not.toBeInTheDocument();
});

test("renders honest empty room, survey, concept, capture and drawing states", () => {
  mockScans.mockReturnValue(ok([]) as ReturnType<typeof useProjectRoomScans>);
  mockPlans.mockReturnValue(
    ok({ sheets: [], prints: [], issues: [], issuePrints: [], transmittals: [], tokens: [] }) as ReturnType<typeof usePlanRoom>,
  );
  const { rerender } = mount();
  expect(
    screen.getAllByText("No survey evidence linked to this room."),
  ).toHaveLength(2);
  expect(
    screen.getByText("No concept rendering recorded."),
  ).toBeInTheDocument();
  expect(
    screen.getByText("No project drawings filed yet."),
  ).toBeInTheDocument();
  mockRooms.mockReturnValue(ok([]) as ReturnType<typeof useProjectRooms>);
  rerender(
    <DesignChapter
      projectId="project-id"
      routeId="document-id"
      onWorkRoom={jest.fn()}
    />,
  );
  expect(screen.getByText("No rooms recorded yet.")).toBeInTheDocument();
});

test("reports unavailable concept image inline and offers a signing retry", () => {
  const concept = ok({
    url: null,
    uploadedAt: null,
    caption: "Proposed direction",
  });
  mockConcept.mockReturnValue(
    concept as ReturnType<typeof useRoomConceptRenderRecord>,
  );
  mount();
  expect(screen.getByText("Concept image unavailable.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry concept image" }));
  expect(concept.refetch).toHaveBeenCalledTimes(1);
});

test("image byte failure stays inline and retries without losing room actions", () => {
  mount();
  fireEvent.error(
    screen.getByAltText("Concept rendering, not installed condition"),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Evidence image could not be loaded. Your place is kept.",
  );
  expect(
    screen.getAllByRole("button", { name: "Work this room" }),
  ).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Retry evidence image" }));
  expect(
    screen.getByAltText("Concept rendering, not installed condition"),
  ).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

 test("keeps private concept provenance and issue history on the project folio without room joins", () => {
   mount();
   expect(screen.getByText(/Private room evidence; not product media/)).toBeInTheDocument();
   expect(screen.getByRole('region', {name: 'Issued print history'})).toBeInTheDocument();
   expect(screen.getByText('No drawing issues recorded.')).toBeInTheDocument();
 });
