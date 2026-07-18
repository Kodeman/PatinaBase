import { fireEvent, render, screen } from "@testing-library/react";
import { SiteRequestGuest } from "../site-request-guest";
import type {
  SiteRequestBootstrapDTO,
  SiteRequestItem,
} from "../site-request-types";

const item = (kit: "K-01" | "K-02", id: string): SiteRequestItem => ({
  id,
  current_version_id: `${id}-version`,
  sort_order: 0,
  status: "pending",
  redo_note: null,
  deliveries: [],
  version: {
    id: `${id}-version`,
    version_number: 1,
    kit_code: kit,
    title: kit === "K-01" ? "Kitchen west wall" : "Vanity alcove",
    room_id: null,
    room_name: kit === "K-01" ? "Kitchen" : "Primary bath",
    guidance: {},
    configuration:
      kit === "K-01"
        ? { dimensions: [{ id: "a", label: "A · Run length" }] }
        : {
            shots: [
              {
                id: "wide",
                label: "Straight on",
                reference_url: "https://example.test/reference.jpg",
              },
            ],
          },
  },
});

const dto: SiteRequestBootstrapDTO = {
  access: { id: "access", expires_at: "2026-08-01T00:00:00Z" },
  request: {
    id: "request",
    project_id: "project",
    status: "sent",
    due_at: "2026-07-18T18:00:00Z",
    due_context: "before drywall",
    site_name: "Killkenny West",
    designer_name: "Leah",
    studio_name: "Middlewest Studio",
  },
  assignee: { id: "party", display_name: "Dan", trade: "gc" },
  items: [item("K-01", "measure"), item("K-02", "photos")],
};

describe("SiteRequestGuest", () => {
  it("starts with names, scope, and no-account landing before the checklist", () => {
    render(<SiteRequestGuest token={"a".repeat(64)} initial={dto} />);
    expect(
      screen.getByText(/Leah is asking for 2 site items/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/this request only.*no account or installation/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open checklist" }));
    expect(screen.getByText("Killkenny West")).toBeInTheDocument();
    expect(screen.getByText("0 of 2 delivered")).toBeInTheDocument();
  });

  it("renders the K-01 sixteenth-inch keypad, metric toggle, and optional proof photo", () => {
    render(
      <SiteRequestGuest
        token={"a".repeat(64)}
        initial={{ ...dto, items: [dto.items[0]] }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open checklist" }));
    fireEvent.click(screen.getByRole("button", { name: "Start K-01" }));
    expect(screen.getByLabelText("A · Run length fraction")).toHaveDisplayValue(
      "—",
    );
    expect(screen.getByText(/proof photo.*optional/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Millimetres" }));
    expect(
      screen.getByLabelText("A · Run length millimetres"),
    ).toBeInTheDocument();
  });

  it("renders K-02 reference framing, low-light guidance, and a recorded skip reason", () => {
    render(
      <SiteRequestGuest
        token={"a".repeat(64)}
        initial={{ ...dto, items: [dto.items[1]] }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open checklist" }));
    fireEvent.click(screen.getByRole("button", { name: "Start K-02" }));
    expect(
      screen.getByAltText("Reference framing for Straight on"),
    ).toHaveAttribute("src", "https://example.test/reference.jpg");
    expect(screen.getByText(/low light.*work lamp/i)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("e.g. room is locked"),
    ).toBeInTheDocument();
  });
});
