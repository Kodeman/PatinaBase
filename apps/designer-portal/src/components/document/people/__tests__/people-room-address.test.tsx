/**
 * THE ROOM'S ADDRESS AND ITS HEAD (W2b).
 *
 * PR-j — `?role`, `?view`, `?scope` and `?trade` stay in the address and stay
 * CURRENT, so a narrowed room can be shared, bookmarked and refreshed into the
 * same narrowing. `?person=` names a person card by its rolodex id and
 * `?firm=` names a company card by its.
 *
 * And the head COUNTS CARDS: `people-room.tsx:383` counted rows, which v4's
 * one-row-per-identity rebuild is what makes honest.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PeopleRoom } from "../people-room";

const mockReplace = jest.fn();
/** CR9-1 — the seat the stubbed person card hands back to the Room. */
const seatToOpen: { current: Record<string, unknown> } = { current: {} };
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

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
    count,
    children,
  }: {
    title: string;
    count?: string;
    children: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {count && <p data-testid="room-count">{count}</p>}
      {children}
    </div>
  ),
}));
jest.mock("../views/directory-view", () => ({
  DirectoryView: (props: { chip: string; trade: string }) => (
    <div
      data-testid="directory-view"
      data-chip={props.chip}
      data-trade={props.trade}
    />
  ),
}));
jest.mock("../views/person-profile", () => ({
  PersonProfile: (props: {
    personId: string;
    onOpenSeat?: (seat: unknown) => void;
  }) => (
    <div data-testid="person-card" data-person={props.personId}>
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

function goTo(search: string) {
  window.history.replaceState({}, "", `/people${search}`);
}

beforeEach(() => {
  mockReplace.mockClear();
  mockPush.mockClear();
  seatToOpen.current = {};
  goTo("");
});

describe("the head", () => {
  it("counts cards, and names both nouns", () => {
    render(<PeopleRoom />);
    expect(screen.getByTestId("room-count")).toHaveTextContent(
      "1 person · 1 firm",
    );
  });
});

describe("the address", () => {
  it("PR-j — a legacy ?role= forwards to its chip and is NOT stripped", async () => {
    goTo("?role=sub");
    render(<PeopleRoom />);
    expect(screen.getByTestId("directory-view")).toHaveAttribute(
      "data-chip",
      "crew",
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/people?role=crew", {
        scroll: false,
      }),
    );
  });

  it("keeps ?trade in the address", () => {
    goTo("?role=crew&trade=electrical");
    render(<PeopleRoom />);
    expect(screen.getByTestId("directory-view")).toHaveAttribute(
      "data-trade",
      "electrical",
    );
  });

  it("?person= opens the person card by its rolodex id", () => {
    goTo("?person=card-dana");
    render(<PeopleRoom />);
    expect(screen.getByTestId("person-card")).toHaveAttribute(
      "data-person",
      "card-dana",
    );
  });

  it("?firm= opens the company card by its rolodex id", () => {
    goTo("?firm=firm-northgate");
    render(<PeopleRoom />);
    expect(screen.getByTestId("company-card")).toHaveAttribute(
      "data-firm",
      "firm-northgate",
    );
  });

  /**
   * CR3-4 — the body is chosen `openFirm ? <CompanyCard/> : openPerson ? … :
   * view`, and `goView` cleared everything EXCEPT `openFirm`. So choosing a
   * rail view with a firm card open left the card standing, the rail showing
   * nothing active, and the card's own Back the only way out.
   */
  it("choosing a view puts the company card down", () => {
    goTo("?firm=firm-northgate");
    render(<PeopleRoom />);
    expect(screen.getByTestId("company-card")).toBeInTheDocument();
    const rail = document.querySelector<HTMLElement>(
      "[data-people-desktop-rail]",
    );
    fireEvent.click(within(rail!).getByRole("button", { name: /Threads/ }));
    expect(screen.queryByTestId("company-card")).toBeNull();
  });
});

/**
 * CR9-1 — A SEAT LINE NEVER FABRICATES A KIND.
 *
 * Every non-field seat was coerced to `'sub'` before opening the field party
 * sheet, which prints the role it is handed as its eyebrow ("Field crew ·
 * Subcontractor") and as its Kind row. A household member, a city inspector, a
 * client and a maker's rep each opened a sheet stating a kind the record does
 * not hold — two wrong facts over the person's real name, with a field-link
 * band and an SMS composer beneath them.
 */
describe("the seat line's destination", () => {
  it("opens the field sheet, under its OWN kind, for a field seat", () => {
    goTo("?person=card-dana");
    render(<PeopleRoom />);
    seatToOpen.current = {
      seat_id: "seat-1",
      person_id: "card-dana",
      party_kind: "installer",
    };
    fireEvent.click(screen.getByRole("button", { name: "open the seat" }));
    const sheet = screen.getByTestId("party-sheet");
    expect(sheet).toHaveAttribute("data-party", "seat-1");
    expect(sheet).toHaveAttribute("data-role", "installer");
  });

  /**
   * CR10-1 — and it never re-opens the card the reader is already on. A
   * household member's seat walks to the JOB, where the Call Sheet carries it
   * (direction §2.1: seat ──► /doc/<project>?sheet=call).
   */
  it("walks a household member's seat to the job's Call Sheet, not to a field sheet", () => {
    goTo("?person=card-dana");
    render(<PeopleRoom />);
    seatToOpen.current = {
      seat_id: "seat-2",
      person_id: "card-dana",
      party_kind: "client_rep",
      project_id: "project-okonkwo",
    };
    fireEvent.click(screen.getByRole("button", { name: "open the seat" }));
    expect(screen.queryByTestId("party-sheet")).toBeNull();
    expect(mockPush).toHaveBeenCalledWith(
      "/doc/project-okonkwo?sheet=call",
    );
  });

  it("falls back to the card for a seat the view hands us with no project", () => {
    goTo("?person=card-dana");
    render(<PeopleRoom />);
    seatToOpen.current = {
      seat_id: "seat-3",
      person_id: "card-dana",
      party_kind: "client_rep",
      project_id: null,
    };
    fireEvent.click(screen.getByRole("button", { name: "open the seat" }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("person-card")).toHaveAttribute(
      "data-person",
      "card-dana",
    );
  });
});
