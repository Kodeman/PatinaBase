import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockSet = jest.fn();
const mockAdd = jest.fn();
const mockRemove = jest.fn();
const mockUpsert = jest.fn();
const mockPlaces = {
  organizationId: "org",
  isLoading: false,
  isError: false,
  jobLocationIds: new Set(["home"]),
  jobPlaces: [
    { id: "home", label: "Hartwell home", kind: "site", is_private_home: true },
  ],
  locations: [
    {
      id: "other",
      label: "Other studio place",
      kind: "receiver",
      address: null,
      receivingParty: "Badger",
      instructions: "Rear door.",
    },
    {
      id: "home",
      label: "Hartwell home",
      kind: "site",
      is_private_home: true,
      address: null,
      receivingParty: null,
    },
  ],
};
jest.mock("../use-job-places", () => ({ useJobPlaces: () => mockPlaces }));
jest.mock("@patina/supabase", () => ({
  useSetProjectFfePlannedDestination: () => ({
    mutateAsync: mockSet,
    isPending: false,
  }),
  useAddProjectDestinationLocation: () => ({
    mutateAsync: mockAdd,
    isPending: false,
  }),
  useRemoveProjectDestinationLocation: () => ({
    mutateAsync: mockRemove,
    isPending: false,
  }),
  useUpsertStudioLocation: () => ({
    mutateAsync: mockUpsert,
    isPending: false,
  }),
  useStudioContacts: () => ({ data: [] }),
}));
jest.mock("../../overlays/doc-sheet", () => ({
  DocSheet: ({ children }: any) => <div role="dialog">{children}</div>,
}));
jest.mock("../../document-action", () => ({
  DocumentAction: ({ children, onClick, disabled, ...props }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={props["aria-label"]}
    >
      {children}
    </button>
  ),
}));
import { PlannedDestination } from "../planned-destination";
import { JobDestinationsSheet } from "../job-destinations-sheet";

beforeEach(() => {
  mockSet.mockReset().mockResolvedValue({});
  mockAdd.mockReset().mockResolvedValue({});
  mockRemove.mockReset().mockResolvedValue({});
  mockUpsert.mockReset().mockResolvedValue({ id: "new-place" });
});

it("offers only job places and writes planned intent or null without changing ship-to", async () => {
  render(
    <PlannedDestination
      projectId="job"
      itemId="line"
      locationId={null}
      canEdit
    />,
  );
  const field = screen.getByLabelText("Planned destination");
  expect(
    screen.getAllByRole("option").map((option) => option.textContent),
  ).toEqual(["Not planned", "Hartwell home · site · Private home"]);
  fireEvent.change(field, { target: { value: "home" } });
  await waitFor(() =>
    expect(mockSet).toHaveBeenCalledWith({
      ffeItemId: "line",
      locationId: "home",
    }),
  );
  // The query refresh represents the completed mutation, not an optimistic ship-to rewrite.
});

it("marks a private planned destination even when the line is read-only", () => {
  render(<PlannedDestination projectId="job" itemId="line" locationId="home" canEdit={false} />);
  expect(screen.getByText("Hartwell home · Private home")).toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(mockSet).not.toHaveBeenCalled();
});

it("clears planned intent with null and shows a mutation refusal", async () => {
  render(
    <PlannedDestination
      projectId="job"
      itemId="line"
      locationId="home"
      canEdit
    />,
  );
  fireEvent.change(screen.getByLabelText("Planned destination"), {
    target: { value: "" },
  });
  await waitFor(() =>
    expect(mockSet).toHaveBeenCalledWith({
      ffeItemId: "line",
      locationId: null,
    }),
  );
  mockSet.mockRejectedValueOnce(new Error("Not allowed"));
  fireEvent.change(screen.getByLabelText("Planned destination"), {
    target: { value: "" },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed");
});

it("adds and removes job associations without archiving studio places", async () => {
  render(<JobDestinationsSheet projectId="job" onClose={jest.fn()} />);
  expect(screen.getByText("Receiving party: Badger")).toBeInTheDocument();
  expect(screen.getByText("Rear door.")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Add Other studio place to this job" }),
  );
  await waitFor(() =>
    expect(mockAdd).toHaveBeenCalledWith({
      projectId: "job",
      locationId: "other",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Remove Hartwell home from this job" }),
  );
  await waitFor(() =>
    expect(mockRemove).toHaveBeenCalledWith({
      projectId: "job",
      locationId: "home",
    }),
  );
});

it("keeps a saved place and shows association failure so retry cannot create a duplicate", async () => {
  mockAdd.mockRejectedValueOnce(new Error("Job association refused"));
  const view = render(<JobDestinationsSheet projectId="job" onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Add destination" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New receiving dock" } });
  fireEvent.click(screen.getByRole("button", { name: "Add destination" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Job association refused");
  expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  mockPlaces.locations.push({ ...mockPlaces.locations[0], id: "new-place", label: "New receiving dock" });
  try {
    view.rerender(<JobDestinationsSheet projectId="job" onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add New receiving dock to this job" }));
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(2));
    expect(mockAdd).toHaveBeenLastCalledWith({ projectId: "job", locationId: "new-place" });
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  } finally {
    mockPlaces.locations.pop();
  }
});

it("adds a new job place through the existing location form", async () => {
  render(<JobDestinationsSheet projectId="job" onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Add destination" }));
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "New receiving dock" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add destination" }));
  await waitFor(() =>
    expect(mockAdd).toHaveBeenCalledWith({
      projectId: "job",
      locationId: "new-place",
    }),
  );
  expect(mockUpsert).toHaveBeenCalledWith({
    organizationId: "org",
    request: expect.objectContaining({ label: "New receiving dock" }),
  });
});
