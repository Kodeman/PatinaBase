/**
 * C-13 — the studio locations editor: create, edit, archive (and restore),
 * and the default-receiver flow, on a company card and in the account page.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";

const upsertMutateAsync = jest.fn();
const archiveMutateAsync = jest.fn();
const mockRows: { list: Array<Record<string, unknown>> } = { list: [] };
const mockLocationsCalls: Array<[unknown, unknown]> = [];

jest.mock("@patina/supabase", () => ({
  useStudioLocations: (orgId: unknown, options: unknown) => {
    mockLocationsCalls.push([orgId, options]);
    return { data: mockRows.list, isLoading: false };
  },
  useUpsertStudioLocation: () => ({ mutateAsync: upsertMutateAsync, isPending: false }),
  useArchiveStudioLocation: () => ({ mutateAsync: archiveMutateAsync, isPending: false }),
}));

jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import {
  EMPTY_LOCATION_FORM,
  NO_LOCATIONS_SENTENCE,
  StudioLocationsEditor,
  locationRequestFromForm,
} from "../studio-locations-editor";

function row(over: Record<string, unknown> = {}) {
  return {
    id: "loc-1",
    organization_id: "org-1",
    kind: "receiver",
    studio_contact_id: "firm-1",
    label: "Badger Receiving",
    address: { street: "7 Dock Rd", city: "Madison", state: "WI", zip: "53704" },
    receiving_hours: "Mon–Fri 8–4",
    has_dock: true,
    needs_liftgate: null,
    storage_free_days: 30,
    storage_rate_cents_month: 4500,
    receiving_fee_cents_piece: 2500,
    instructions: "Call ahead.",
    is_default_receiver: false,
    archived_at: null,
    ...over,
  };
}

beforeEach(() => {
  upsertMutateAsync.mockReset().mockResolvedValue(row());
  archiveMutateAsync.mockReset().mockResolvedValue(row());
  mockRows.list = [];
  mockLocationsCalls.length = 0;
});

const announce = jest.fn();

function renderEditor(props: { studioContactId?: string | null } = { studioContactId: "firm-1" }) {
  announce.mockReset();
  return render(
    <StudioLocationsEditor organizationId="org-1" onAnnounce={announce} {...props} />,
  );
}

describe("StudioLocationsEditor · reading", () => {
  it("reads archived ones too, and says so when there are none", () => {
    renderEditor();
    expect(mockLocationsCalls).toContainEqual(["org-1", { includeArchived: true }]);
    expect(screen.getByText(NO_LOCATIONS_SENTENCE)).toBeInTheDocument();
  });

  it("on a company card lists only that card's locations; in settings, all of them", () => {
    mockRows.list = [
      row(),
      row({ id: "loc-2", label: "Other Firm Dock", studio_contact_id: "firm-2" }),
    ];
    const { unmount } = renderEditor();
    expect(screen.getByText("Badger Receiving")).toBeInTheDocument();
    expect(screen.queryByText("Other Firm Dock")).not.toBeInTheDocument();
    unmount();

    renderEditor({ studioContactId: null });
    expect(screen.getByText("Badger Receiving")).toBeInTheDocument();
    expect(screen.getByText("Other Firm Dock")).toBeInTheDocument();
  });

  it("prints the kind, the default mark, the address and the receiving facts", () => {
    mockRows.list = [row({ is_default_receiver: true })];
    renderEditor();
    expect(screen.getByText(/· Receiver · Default receiver/)).toBeInTheDocument();
    expect(screen.getByText("7 Dock Rd, Madison, WI 53704")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Receives Mon–Fri 8–4 · Dock · 30 days free storage · then $45.00 a month · $25.00 a piece to receive",
      ),
    ).toBeInTheDocument();
    // Already the default: no act to make it so.
    expect(
      screen.queryByRole("button", { name: /default receiver/i }),
    ).not.toBeInTheDocument();
  });
});

describe("StudioLocationsEditor · create", () => {
  it("adds a location hung off the card, with every field the form shows", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Add a location" }));
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "workroom" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Able Workroom " } });
    fireEvent.change(screen.getByLabelText("Street"), { target: { value: "3 Mill St" } });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Verona" } });
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "WI" } });
    fireEvent.change(screen.getByLabelText("Zip"), { target: { value: "53593" } });
    fireEvent.change(screen.getByLabelText("Receiving hours"), { target: { value: "Tue 9–3" } });
    fireEvent.change(screen.getByLabelText("Dock"), { target: { value: "no" } });
    fireEvent.change(screen.getByLabelText("Liftgate"), { target: { value: "yes" } });
    fireEvent.change(screen.getByLabelText("Free storage days"), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("Storage rate, dollars a month"), {
      target: { value: "60" },
    });
    fireEvent.change(screen.getByLabelText("Receiving fee, dollars a piece"), {
      target: { value: "12.50" },
    });
    fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: "Rear door." } });
    fireEvent.click(screen.getByLabelText("Default receiver"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add the location" }));
    });

    expect(upsertMutateAsync).toHaveBeenCalledWith({
      organizationId: "org-1",
      request: {
        kind: "workroom",
        label: "Able Workroom",
        address: { street: "3 Mill St", city: "Verona", state: "WI", zip: "53593" },
        receivingHours: "Tue 9–3",
        hasDock: false,
        needsLiftgate: true,
        storageFreeDays: 14,
        storageRateCentsMonth: 6000,
        receivingFeeCentsPiece: 1250,
        instructions: "Rear door.",
        isDefaultReceiver: true,
        studioContactId: "firm-1",
      },
    });
    expect(announce).toHaveBeenCalledWith("Location added.");
    expect(screen.queryByRole("button", { name: "Add the location" })).not.toBeInTheDocument();
  });

  it("from the account settings adds a studio-level location (no card)", async () => {
    renderEditor({ studioContactId: null });
    fireEvent.click(screen.getByRole("button", { name: "Add a location" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Main studio" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add the location" }));
    });
    expect(upsertMutateAsync).toHaveBeenCalledWith({
      organizationId: "org-1",
      request: expect.objectContaining({
        kind: "receiver",
        label: "Main studio",
        address: null,
        studioContactId: null,
        isDefaultReceiver: false,
      }),
    });
  });

  it("refuses a nameless location or a bad amount without writing", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Add a location" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add the location" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Give the location a name.");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Dock" } });
    fireEvent.change(screen.getByLabelText("Storage rate, dollars a month"), {
      target: { value: "lots" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add the location" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Storage rate is not an amount.");
    expect(upsertMutateAsync).not.toHaveBeenCalled();
  });

  it("shows the server's refusal in place", async () => {
    upsertMutateAsync.mockRejectedValue(new Error("upsert_studio_location: denied"));
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Add a location" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Dock" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add the location" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("upsert_studio_location: denied");
  });
});

describe("StudioLocationsEditor · edit", () => {
  it("opens the form filled from the row and patches it by id", async () => {
    mockRows.list = [row()];
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit Badger Receiving" }));

    expect(screen.getByLabelText("Name")).toHaveValue("Badger Receiving");
    expect(screen.getByLabelText("Dock")).toHaveValue("yes");
    expect(screen.getByLabelText("Liftgate")).toHaveValue("");
    expect(screen.getByLabelText("Storage rate, dollars a month")).toHaveValue("45.00");
    expect(screen.getByLabelText("Receiving fee, dollars a piece")).toHaveValue("25.00");

    fireEvent.change(screen.getByLabelText("Receiving hours"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Liftgate"), { target: { value: "no" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save the location" }));
    });

    expect(upsertMutateAsync).toHaveBeenCalledWith({
      organizationId: "org-1",
      request: {
        id: "loc-1",
        kind: "receiver",
        label: "Badger Receiving",
        address: { street: "7 Dock Rd", city: "Madison", state: "WI", zip: "53704" },
        receivingHours: null,
        hasDock: true,
        needsLiftgate: false,
        storageFreeDays: 30,
        storageRateCentsMonth: 4500,
        receivingFeeCentsPiece: 2500,
        instructions: "Call ahead.",
        isDefaultReceiver: false,
      },
    });
    expect(announce).toHaveBeenCalledWith("Location saved.");
  });
});

describe("StudioLocationsEditor · default receiver", () => {
  it("makes a location the default receiver through the upsert", async () => {
    mockRows.list = [row()];
    renderEditor();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Make Badger Receiving the default receiver" }),
      );
    });
    expect(upsertMutateAsync).toHaveBeenCalledWith({
      organizationId: "org-1",
      request: { id: "loc-1", isDefaultReceiver: true },
    });
    expect(announce).toHaveBeenCalledWith("Badger Receiving is the default receiver.");
  });
});

describe("StudioLocationsEditor · archive", () => {
  it("archives a live location and restores an archived one", async () => {
    mockRows.list = [
      row(),
      row({ id: "loc-old", label: "Old Dock", archived_at: "2026-09-01T00:00:00Z" }),
    ];
    renderEditor();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Archive Badger Receiving" }));
    });
    expect(archiveMutateAsync).toHaveBeenCalledWith({ locationId: "loc-1" });
    expect(announce).toHaveBeenCalledWith("Badger Receiving archived.");

    // The archived one sits under "Archived", not among the live ones.
    const archived = screen.getByText("Archived").parentElement as HTMLElement;
    expect(within(archived).getByText("Old Dock")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Old Dock" })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restore Old Dock" }));
    });
    expect(archiveMutateAsync).toHaveBeenCalledWith({ locationId: "loc-old", archived: false });
  });
});

describe("locationRequestFromForm", () => {
  it("keeps a country already on the row and drops empty address parts", () => {
    expect(
      locationRequestFromForm({ ...EMPTY_LOCATION_FORM, label: "Lyon", city: "Lyon", country: "FR" })
        .address,
    ).toEqual({ city: "Lyon", country: "FR" });
  });

  it("refuses a fractional free-days count", () => {
    expect(() =>
      locationRequestFromForm({ ...EMPTY_LOCATION_FORM, label: "X", storageFreeDays: "1.5" }),
    ).toThrow("Free storage days is not a number.");
  });
});
