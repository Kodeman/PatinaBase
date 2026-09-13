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
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
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
  PersonProfile: (props: { personId: string }) => (
    <div data-testid="person-card" data-person={props.personId} />
  ),
}));
jest.mock("../company-card", () => ({
  CompanyCard: (props: { firmId: string }) => (
    <div data-testid="company-card" data-firm={props.firmId} />
  ),
}));
jest.mock("../party-profile-sheet", () => ({ PartyProfileSheet: () => null }));
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
