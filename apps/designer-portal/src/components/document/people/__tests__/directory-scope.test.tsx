/**
 * The Directory (W2b). Rewritten: eleven chips, a flag, and two separate lists
 * (people from `people_directory`, firms from `studio_contacts`) are retired by
 * PR-g's mixed list, the six chips, and the rollout ruling that took the
 * `call-sheet` flag out.
 *
 * What survives from the old spec, and is pinned again below: the MINE · STUDIO
 * lens must narrow the QUERY, not just its own visual state (U6 / Wave 4).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PeopleDirectoryRow } from "@patina/supabase";
import { DirectoryView } from "../views/directory-view";
import type { PeopleViewProps } from "../types";

const mockUsePeopleDirectory = jest.fn();
const mockUseStudioContacts = jest.fn(() => ({ data: [], isLoading: false }));

jest.mock("@patina/supabase", () => ({
  usePeopleDirectory: (...args: unknown[]) =>
    mockUsePeopleDirectory(...(args as [])),
  useStudioContacts: (...args: unknown[]) =>
    mockUseStudioContacts(...(args as [])),
  usePeopleSeats: () => ({ data: [] }),
}));

jest.mock("../directory/makers-marketplace", () => ({
  MakersMarketplace: () => <div data-testid="marketplace" />,
}));

jest.mock("@/lib/analytics/people-events", () => ({
  peopleEvents: { directoryChip: jest.fn() },
}));

const NAV: PeopleViewProps = {
  openPerson: jest.fn(),
  openThread: jest.fn(),
  goView: jest.fn(),
  notify: jest.fn(),
};

function row(over: Partial<PeopleDirectoryRow> = {}): PeopleDirectoryRow {
  return {
    person_id: "card-dana",
    role: "contact",
    display_name: "Dana Kowalski",
    email: "dana@northgateelectric.com",
    phone: "(612) 555-0111",
    profile_id: null,
    project_id: "proj-okonkwo",
    designer_id: null,
    status_raw: "active",
    last_touch_at: null,
    meta: {
      entity_kind: "person",
      contact_kind: "sub",
      company_name: "Northgate Electric",
      company_id: "firm-northgate",
      specialties: ["electrical"],
    },
    scope: "studio",
    reach_state: "field_link",
    consent_status: "granted",
    paper_state: "lapsed",
    contact_rule_summary: null,
    seat_count: 1,
    ...over,
  } as PeopleDirectoryRow;
}

const FIRM = row({
  person_id: "firm-northgate",
  display_name: "Northgate Electric",
  phone: null,
  meta: { entity_kind: "company", contact_kind: "sub" },
  paper_state: "lapsed",
  seat_count: 0,
});

const BANK = row({
  person_id: "firm-bank",
  display_name: "Great Northern Bank",
  phone: null,
  meta: { entity_kind: "company", contact_kind: "lender" },
  paper_state: "not_on_file",
  seat_count: 0,
});

const ADAEZE = row({
  person_id: "card-adaeze",
  display_name: "Adaeze Okonkwo",
  phone: "(612) 555-0104",
  email: "adaeze@okonkwo.net",
  meta: { entity_kind: "person", contact_kind: "client" },
  reach_state: "account",
  paper_state: null,
});

function renderDirectory(
  rows: PeopleDirectoryRow[],
  over: Partial<Parameters<typeof DirectoryView>[0]> = {},
) {
  mockUsePeopleDirectory.mockReturnValue({ data: rows, isLoading: false });
  const onChipChange = jest.fn();
  const onOpenFirm = jest.fn();
  const result = render(
    <DirectoryView
      {...NAV}
      chip="everyone"
      onChipChange={onChipChange}
      trade="all"
      onTradeChange={jest.fn()}
      makerLens="roster"
      onMakerLens={jest.fn()}
      search=""
      organizationId="org-1"
      scope="studio"
      onScopeChange={jest.fn()}
      onOpenFirm={onOpenFirm}
      {...over}
    />,
  );
  return { ...result, onChipChange, onOpenFirm };
}

beforeEach(() => {
  mockUsePeopleDirectory.mockReset();
  mockUseStudioContacts.mockReturnValue({ data: [], isLoading: false });
});

describe("the six chips", () => {
  it('prints exactly six, in order, inside a group labelled "Narrow the book"', () => {
    renderDirectory([]);
    const group = screen.getByRole("group", { name: "Narrow the book" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Everyone", "Clients", "Crew", "Makers", "Studio", "Firms"]);
  });

  it("Everyone is the pressed chip on open", () => {
    renderDirectory([]);
    expect(screen.getByRole("button", { name: "Everyone" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows the trade line only under Crew and Makers", () => {
    const { unmount } = renderDirectory([], { chip: "crew" });
    expect(
      screen.getByRole("group", { name: "Narrow by trade" }),
    ).toBeInTheDocument();
    unmount();
    renderDirectory([], { chip: "clients" });
    expect(
      screen.queryByRole("group", { name: "Narrow by trade" }),
    ).not.toBeInTheDocument();
  });
});

describe("the MINE · STUDIO lens narrows the query, not just the toggle", () => {
  it("passes scope: mine through to usePeopleDirectory", () => {
    renderDirectory([], { scope: "mine" });
    expect(mockUsePeopleDirectory).toHaveBeenCalledWith({
      role: "all",
      scope: "mine",
    });
  });

  it("STUDIO is the unfiltered read — never .eq(scope, studio)", () => {
    renderDirectory([], { scope: "studio" });
    expect(mockUsePeopleDirectory).toHaveBeenCalledWith({
      role: "all",
      scope: undefined,
    });
  });
});

describe("one list, two entry types (PR-g)", () => {
  it("prints people and firms together under Everyone", () => {
    renderDirectory([row(), FIRM]);
    expect(
      screen.getByRole("button", { name: "Dana Kowalski" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Northgate Electric" }),
    ).toBeInTheDocument();
  });

  it("the Firms chip shows firms only", () => {
    renderDirectory([row(), FIRM], { chip: "firms" });
    expect(
      screen.queryByRole("button", { name: "Dana Kowalski" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Northgate Electric" }),
    ).toBeInTheDocument();
  });

  it("R-H — a lender firm shows under both chips with no paper word", () => {
    const { unmount } = renderDirectory([BANK]);
    expect(
      screen.getByRole("button", { name: "Great Northern Bank" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Not on file")).not.toBeInTheDocument();
    unmount();
    renderDirectory([BANK], { chip: "firms" });
    expect(
      screen.getByRole("button", { name: "Great Northern Bank" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Not on file")).not.toBeInTheDocument();
  });

  it("opens a firm by its own card id", () => {
    const { onOpenFirm } = renderDirectory([FIRM]);
    fireEvent.click(screen.getByRole("button", { name: "Northgate Electric" }));
    expect(onOpenFirm).toHaveBeenCalledWith("firm-northgate");
  });

  it("a firm row counts the crew and the open jobs off the rows in hand", () => {
    renderDirectory([row(), FIRM]);
    expect(
      screen.getByText("Subcontractor · 1 on the crew · 1 open job"),
    ).toBeInTheDocument();
  });
});

describe("narrowing", () => {
  it("matches phone digits", () => {
    renderDirectory([row(), ADAEZE], { search: "0111" });
    expect(
      screen.getByRole("button", { name: "Dana Kowalski" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Adaeze Okonkwo" }),
    ).not.toBeInTheDocument();
  });

  it("matches a trade", () => {
    renderDirectory([row(), ADAEZE], { search: "electrical" });
    expect(
      screen.getByRole("button", { name: "Dana Kowalski" }),
    ).toBeInTheDocument();
  });

  it("narrows by the trade line", () => {
    renderDirectory([row(), ADAEZE], { chip: "crew", trade: "plumbing" });
    expect(
      screen.queryByRole("button", { name: "Dana Kowalski" }),
    ).not.toBeInTheDocument();
  });

  it("says so in the room’s own words when nothing is left", () => {
    renderDirectory([row()], { search: "nobody here" });
    expect(
      screen.getByText(/Nobody under this narrowing yet\./),
    ).toBeInTheDocument();
  });
});

describe("the duplicate band", () => {
  it("names the two cards and opens each, and carries no merge act (R-Y)", () => {
    const chidi = row({
      person_id: "card-chidi",
      display_name: "Chidi Okonkwo",
      phone: "6125550104",
      meta: { entity_kind: "person", contact_kind: "client_rep" },
    });
    renderDirectory([ADAEZE, chidi]);
    const band = document.querySelector("[data-duplicate-band]") as HTMLElement;
    expect(band).toHaveTextContent("These two cards share a phone.");
    expect(
      within(band).getByRole("button", { name: "Adaeze Okonkwo" }),
    ).toBeInTheDocument();
    expect(
      within(band).getByRole("button", { name: "Chidi Okonkwo" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Compare/)).not.toBeInTheDocument();
    fireEvent.click(
      within(band).getByRole("button", { name: "Chidi Okonkwo" }),
    );
    expect(NAV.openPerson).toHaveBeenCalledWith("card-chidi", "contact");
  });
});
