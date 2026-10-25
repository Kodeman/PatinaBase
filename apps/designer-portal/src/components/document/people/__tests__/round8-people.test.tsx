/** Round-8 shell with mocked existing data/action-owner boundaries. */
import { StrictMode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { PeopleRoom } from "../people-room";
jest.mock("@/hooks/use-paper-renderer", () => ({ usePaperRenderer: () => ({ renderer: mockRenderer }) }));

let mockRenderer = "round8";
const mockReplace = jest.fn();
const mockHistoryReplace = jest.spyOn(window.history, "replaceState");
/** CR9-1 — the seat the stubbed person card hands back to the Room. */
const seatToOpen: { current: Record<string, unknown> } = { current: {} };
const mockPush = jest.fn();
/** What resolve_merged_contact() answers; null means "itself". */
const mergedSurvivor: { current: string | null } = { current: null };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
jest.mock("../../command-bar", () => ({ openCommandBar: jest.fn() }));

const ROWS = [
  {
    person_id: "card-dana",
    role: "contact",
    display_name: "Dana Kowalski",
    email: null,
    phone: null,
    last_touch_at: null,
    scope: "studio",
    meta: { entity_kind: "person", contact_kind: "sub" },
    seat_count: 1,
  },
  {
    person_id: "firm-northgate",
    role: "contact",
    display_name: "Northgate Electric",
    email: null,
    phone: null,
    last_touch_at: null,
    scope: "studio",
    meta: { entity_kind: "company", contact_kind: "sub" },
    seat_count: 0,
  },
];

jest.mock("@patina/supabase", () => ({
  usePeopleDirectory: (filters?: { scope?: string }) => ({
    data: filters?.scope === "mine" ? [] : ROWS,
    isLoading: false,
  }),
  useOrganizations: () => ({ data: [{ id: "org-1", type: "design_studio" }] }),
  // CR-1: the promote band resolves the studio from the SEAT's project
  // (project_recorded_studio), never from the membership list.
  useProjectRecordedStudio: () => ({ data: "org-1" }),
  /**
   * PR-o — `resolve_merged_contact()`, the forward map for an id that names a
   * card folded into another one (r4 B-3). `mergedSurvivor` is what the RPC
   * answers for whichever id the address handed it.
   */
  useResolvedContactId: (id: string | null) => ({
    data: id ? (mergedSurvivor.current ?? id) : null,
  }),
  isFieldRosterRole: (role: string | null | undefined) =>
    !!role && ["gc", "sub", "installer", "receiver"].includes(role),
}));

jest.mock("@/lib/help-system/use-document-surface", () => ({
  useDocumentSurface: jest.fn(),
}));
jest.mock("../../mobile/mobile-shell", () => ({
  useMobilePrimaryAction: jest.fn(),
}));
jest.mock("../../rooms/room-shell", () => ({
  RoomShell: ({
    title,
    heading,
    count,
    children,
  }: {
    title: string;
    heading?: React.ReactNode;
    count?: string;
    children: React.ReactNode;
  }) => (
    <div>
      {heading ?? <h1>{title}</h1>}
      {count && <p data-testid="room-count">{count}</p>}
      {children}
    </div>
  ),
}));
jest.mock("../views/directory-view", () => ({
  DirectoryView: (props: { chip: string; trade: string; openPerson: (id: string, role: string) => void }) => (
    <div
      data-testid="directory-view"
      data-chip={props.chip}
      data-trade={props.trade}
    ><button onClick={() => props.openPerson("card-dana", "contact")}>Dana Kowalski</button></div>
  ),
}));
jest.mock("../views/person-profile", () => ({
  PersonProfile: (props: {
    personId: string;
    onOpenSeat?: (seat: unknown) => void;
    onBack?: () => void;
  }) => (
    <div data-testid="person-card" data-person={props.personId}>
      <button onClick={props.onBack}>Back to directory</button>
      <button type="button" onClick={() => props.onOpenSeat?.(seatToOpen.current)}>
        open the seat
      </button>
    </div>
  ),
}));
jest.mock("../company-card", () => ({
  CompanyCard: (props: { firmId: string }) => (
    <div data-testid="company-card" data-firm={props.firmId} />
  ),
}));
jest.mock("../party-profile-sheet", () => ({
  PartyProfileSheet: (props: { open: boolean; partyId: string | null; role: string }) =>
    props.open ? (
      <div data-testid="party-sheet" data-party={props.partyId} data-role={props.role} />
    ) : null,
}));
jest.mock("../views/threads-view", () => ({ ThreadsView: () => null }));
jest.mock("../views/nurture-view", () => ({ NurtureView: () => null }));
jest.mock("../views/reviews-view", () => ({ ReviewsView: () => null }));
jest.mock("../views/portfolio-view", () => ({ PortfolioView: () => null }));
jest.mock("../views/outreach-view", () => ({ OutreachView: () => null }));
jest.mock("../profile/your-eye", () => ({ YourEyePanel: () => null }));
jest.mock("../directory/ask-bar", () => ({
  AskBar: () => null,
  routePeopleAsk: jest.fn(() => null),
}));
jest.mock("../directory/add-person-sheet", () => ({
  AddPersonSheet: () => null,
}));


beforeEach(() => {
  mockRenderer = "round8";
  mockPush.mockClear(); mockReplace.mockClear();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/people?role=crew&scope=mine&trade=electrical");
  seatToOpen.current = { seat_id: "seat-dana", person_id: "card-dana", project_id: "job-1", party_kind: "client_rep" };
});

test("round8 presents six distinct meanings without granting any authority", () => {
  render(<PeopleRoom />);
  expect(screen.getByRole("heading", { name: "People", exact: true })).toBeInTheDocument();
  for (const term of ["Saved contact", "Trade account", "Appointment", "Permitted work copy", "Consent", "Authority"]) {
    expect(screen.getByText(term, { selector: "dt" })).toBeInTheDocument();
  }
  expect(screen.getByText(/Neither a contact nor an appointment creates it/)).toBeInTheDocument();
});

test("round8 resources delegate every destination to its existing view", () => {
  const { container } = render(<PeopleRoom />);
  const nav = screen.getByRole("navigation", { name: "People resources" });
  for (const [label, view] of [["Relationship follow-ups", "nurture"], ["Client reviews", "reviews"], ["Email campaigns", "outreach"], ["Portfolio", "portfolio"], ["Design profile", "your-eye"], ["Correspondence", "threads"], ["Directory", "directory"]]) {
    fireEvent.click(within(nav).getByRole("button", { name: label }));
    expect(container.querySelector("[data-people-current-view]")).toHaveAttribute("data-people-current-view", view);
  }
});

test("StrictMode fast consecutive view switches keep the last choice after pending navigation settles", () => {
  window.history.replaceState({}, "", "/people");
  const pending: string[] = [];
  mockReplace.mockImplementation((href: string) => pending.push(href));
  try {
    const tree = <StrictMode><PeopleRoom /></StrictMode>;
    const { container, rerender } = render(tree);
    const nav = screen.getByRole("navigation", { name: "People resources" });
    for (const label of ["Relationship follow-ups", "Client reviews", "Email campaigns", "Directory"]) {
      fireEvent.click(within(nav).getByRole("button", { name: label, exact: true }));
    }
    act(() => {
      for (const href of pending) window.history.replaceState({}, "", href);
    });
    rerender(<StrictMode><PeopleRoom /></StrictMode>);
    expect(window.location.pathname + window.location.search).toBe("/people");
    expect(container.querySelector("[data-people-current-view]")).toHaveAttribute("data-people-current-view", "directory");
  } finally {
    mockReplace.mockReset();
  }
});

test("directory to person to job preserves the exact People return address", () => {
  render(<PeopleRoom />);
  fireEvent.click(screen.getByRole("button", { name: "Dana Kowalski" }));
  expect(screen.getByTestId("person-card")).toHaveAttribute("data-person", "card-dana");
  fireEvent.click(screen.getByRole("button", { name: "Back to directory" }));
  expect(screen.getByTestId("directory-view")).toHaveAttribute("data-chip", "crew");
  expect(screen.getByTestId("directory-view")).toHaveAttribute("data-trade", "electrical");
  fireEvent.click(screen.getByRole("button", { name: "Dana Kowalski" }));
  window.history.replaceState({}, "", "/people?role=crew&scope=mine&trade=electrical&person=card-dana");
  fireEvent.click(screen.getByRole("button", { name: "open the seat" }));
  expect(mockPush).toHaveBeenCalledWith("/doc/job-1?sheet=call");
  expect(window.sessionStorage.getItem("patina:paper-origin:v1")).not.toBeNull();
  const origin = JSON.parse(window.sessionStorage.getItem("patina:paper-origin:v1")!)[0];
  expect(origin).toMatchObject({ docId: "job-1", kind: "people", path: "/people", search: "?role=crew&scope=mine&trade=electrical&person=card-dana" });
});

test.each([
  ["round8", "person", "card-dana", "person-card"],
  ["round8", "firm", "firm-northgate", "company-card"],
  ["legacy", "person", "card-dana", "person-card"],
  ["legacy", "firm", "firm-northgate", "company-card"],
])("%s warm return preserves the %s address while opening its card", (renderer, key, id, card) => {
  mockRenderer = renderer;
  window.history.replaceState({}, "", `/people?${key}=${id}`);
  mockHistoryReplace.mockClear();
  render(<StrictMode><PeopleRoom /></StrictMode>);
  expect(screen.getByTestId(card)).toBeInTheDocument();
  for (const [, , href] of mockHistoryReplace.mock.calls) {
    expect(new URL(String(href), window.location.origin).searchParams.get(key)).toBe(id);
  }
  expect(new URL(window.location.href).searchParams.get(key)).toBe(id);
  fireEvent.click(screen.getByRole("button", { name: "Back to Studio contacts" }));
  expect(screen.getByTestId("directory-view")).toBeInTheDocument();
  expect(window.location.pathname + window.location.search).toBe("/people");
});

test("legacy keeps the existing shell and unresolved renderer mounts no subview", () => {
  mockRenderer = "legacy";
  const { unmount } = render(<PeopleRoom />);
  expect(screen.getByRole("heading", { name: "Studio contacts" })).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "People resources" })).not.toBeInTheDocument();
  unmount(); mockRenderer = "pending";
  render(<PeopleRoom />);
  expect(screen.getByRole("status")).toHaveTextContent("Opening People");
  expect(screen.queryByTestId("directory-view")).not.toBeInTheDocument();
});
