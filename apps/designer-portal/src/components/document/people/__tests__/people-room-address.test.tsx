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
  mergedSurvivor.current = null;
  goTo("");
});

describe("the head", () => {
  it("counts cards, and names both nouns", () => {
    render(<PeopleRoom />);
    expect(screen.getByTestId("room-count")).toHaveTextContent(
      "1 person · 1 firm",
    );
  });

  it("SQ-877 N11 — the 390 dock act and the head's act share one name", () => {
    const { useMobilePrimaryAction } = jest.requireMock(
      "../../mobile/mobile-shell",
    ) as { useMobilePrimaryAction: jest.Mock };
    useMobilePrimaryAction.mockClear();
    render(<PeopleRoom />);
    expect(useMobilePrimaryAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: "add-person", label: "Add contact" }),
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
   * r4 B-3 / QA finding 3 — PR-o: BOTH IDS STAY RESOLVABLE, and the merge
   * sheet says so on its face ("an old link still opens this person"). A
   * merged-away card emits no directory row, so these two ids are absent from
   * the book and only `resolve_merged_contact()` can answer them.
   */
  it("?person=<a merged card's id> opens the survivor's card", async () => {
    mergedSurvivor.current = "card-dana";
    goTo("?person=card-folded-away");
    render(<PeopleRoom />);
    await waitFor(() =>
      expect(screen.getByTestId("person-card")).toHaveAttribute(
        "data-person",
        "card-dana",
      ),
    );
  });

  it("?firm=<a merged card's id> opens the surviving firm's card", async () => {
    mergedSurvivor.current = "firm-northgate";
    goTo("?firm=firm-folded-away");
    render(<PeopleRoom />);
    await waitFor(() =>
      expect(screen.getByTestId("company-card")).toHaveAttribute(
        "data-firm",
        "firm-northgate",
      ),
    );
  });

  it("leaves the Directory standing where the id resolves to nothing the room carries", async () => {
    mergedSurvivor.current = "card-not-in-the-book";
    goTo("?person=card-folded-away");
    render(<PeopleRoom />);
    await waitFor(() =>
      expect(screen.getByTestId("directory-view")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("person-card")).toBeNull();
  });

  /**
   * CR3-4 — the body is chosen `openFirm ? <CompanyCard/> : openPerson ? … :
   * view`, and `goView` cleared everything EXCEPT `openFirm`. So choosing a
   * view with a firm card open left the card standing.
   *
   * US-28 — the views are no longer a rail in the Room; a sub-room opens from
   * More or ⌘K at `/people?view=<key>`, and the standing Room follows it.
   */
  it("walking to a sub-room's address puts the company card down", () => {
    goTo("?firm=firm-northgate");
    const { rerender } = render(<PeopleRoom />);
    expect(screen.getByTestId("company-card")).toBeInTheDocument();
    goTo("?view=threads");
    rerender(<PeopleRoom />);
    expect(screen.queryByTestId("company-card")).toBeNull();
    expect(
      document.querySelector("[data-people-sub-room]"),
    ).toHaveAttribute("data-people-sub-room", "client-relations");
  });

  it("US-28 — a fresh arrival at a sub-room's address opens it and never strips ?view=", async () => {
    goTo("?view=threads");
    render(<PeopleRoom />);
    expect(document.querySelector("[data-people-main-panel]")).toHaveAttribute(
      "data-people-current-view",
      "threads",
    );
    await waitFor(() =>
      expect(
        document.querySelector("[data-people-main-panel]"),
      ).toHaveAttribute("data-people-sub-room", "client-relations"),
    );
    expect(mockReplace).not.toHaveBeenCalledWith("/people", expect.anything());
  });

  it("the Header line's way back from a record returns to the Directory", () => {
    goTo("?person=card-dana");
    render(<PeopleRoom />);
    expect(screen.getByTestId("person-card")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Back to Studio contacts" }),
    );
    expect(screen.queryByTestId("person-card")).toBeNull();
    expect(screen.getByTestId("directory-view")).toBeInTheDocument();
  });

  /**
   * SQ-872 F1 — ⌘K's person row pushes `/people?person=<id>` while the Room
   * already stands at a sub-room's address. The first read has run, so the
   * Room has to follow the card the new address names, and never strip it.
   */
  it("follows ⌘K's ?person= into the record while the Room stands at a sub-room", () => {
    goTo("?view=threads");
    const { rerender } = render(<PeopleRoom />);
    expect(screen.queryByTestId("person-card")).toBeNull();

    mockReplace.mockClear();
    goTo("?person=card-dana");
    rerender(<PeopleRoom />);

    expect(screen.getByTestId("person-card")).toHaveAttribute(
      "data-person",
      "card-dana",
    );
    // The address sync never writes the named card back out of the address.
    for (const [href] of mockReplace.mock.calls) {
      expect(href).toContain("person=card-dana");
    }

    fireEvent.click(
      screen.getByRole("button", { name: "Back to Studio contacts" }),
    );
    expect(screen.queryByTestId("person-card")).toBeNull();
    expect(screen.getByTestId("directory-view")).toBeInTheDocument();
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
