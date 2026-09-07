import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { AgreementTemplate, StudioAgreementPart } from "@patina/types";
import {
  AgreementLibraryCard,
  MEMBERS_COMPOSE_NOTE,
  NO_COMPOSITION_EDITOR_NOTE,
} from "../agreement-library-card";

const mockTemplates = jest.fn();
const mockParts = jest.fn();
const mockRenameTemplate = jest.fn();
const mockDeleteTemplate = jest.fn();
const mockSavePart = jest.fn();
const mockDeletePart = jest.fn();

jest.mock("@patina/supabase", () => ({
  useAgreementTemplates: (studioId: string) => mockTemplates(studioId),
  useStudioAgreementParts: (studioId: string) => mockParts(studioId),
  useRenameAgreementTemplate: () => ({ mutateAsync: mockRenameTemplate }),
  useDeleteAgreementTemplate: () => ({ mutateAsync: mockDeleteTemplate }),
  useSaveAgreementPart: () => ({ mutateAsync: mockSavePart }),
  useDeleteStudioAgreementPart: () => ({ mutateAsync: mockDeletePart }),
}));

function template(
  input: Partial<AgreementTemplate> & { templateKey: string; title: string },
): AgreementTemplate {
  return {
    id: input.id ?? input.templateKey,
    templateKey: input.templateKey,
    kind: input.kind ?? "studio",
    studioId: input.kind === "seeded" ? null : "studio-1",
    class: "design_services",
    title: input.title,
    parts: [],
    consentKey: null,
    createdBy: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };
}

function libraryPart(
  input: Partial<StudioAgreementPart> & { partKey: string; title: string },
): StudioAgreementPart {
  return {
    id: input.id ?? input.partKey,
    studioId: "studio-1",
    kind: input.kind ?? "clause",
    variant: input.variant ?? null,
    partKey: input.partKey,
    title: input.title,
    payload: input.payload ?? { body: "The studio own words." },
    requiredDefault: input.requiredDefault ?? false,
    clientVisibleDefault: input.clientVisibleDefault ?? true,
    createdBy: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };
}

const TEMPLATES = [
  template({
    templateKey: "studio.full-service",
    title: "Full-service residential",
  }),
  template({
    templateKey: "patina.design_services",
    title: "Design services (Patina standard)",
    kind: "seeded",
  }),
];

const PARTS = [
  libraryPart({ partKey: "studio.house-rules", title: "House rules" }),
  libraryPart({
    partKey: "studio.day-rate",
    title: "Site day rate",
    kind: "schedule",
    variant: "day_rate",
  }),
  libraryPart({
    partKey: "studio.punchlist",
    title: "Punch list",
    kind: "list",
  }),
];

function renderCard(canManage = true) {
  mockTemplates.mockReturnValue({ data: TEMPLATES, isLoading: false });
  mockParts.mockReturnValue({ data: PARTS, isLoading: false });
  return render(
    <AgreementLibraryCard studioId="studio-1" canManage={canManage} />,
  );
}

const rowFor = (title: string) =>
  screen
    .getAllByRole("listitem")
    .find((item) => within(item).queryByText(title)) as HTMLElement;

beforeEach(() => {
  mockTemplates.mockReset();
  mockParts.mockReset();
  mockRenameTemplate.mockReset().mockResolvedValue(undefined);
  mockDeleteTemplate.mockReset().mockResolvedValue(undefined);
  mockSavePart.mockReset().mockResolvedValue(undefined);
  mockDeletePart.mockReset().mockResolvedValue(undefined);
});

describe("the Agreement Library card", () => {
  it("is headed in the program vocabulary (R7)", () => {
    renderCard();
    expect(screen.getByText("Agreement Library")).toBeInTheDocument();
    expect(screen.getByText("Templates")).toBeInTheDocument();
    expect(screen.getByText("Parts")).toBeInTheDocument();
  });

  it("lists Patina first, chipped, and the studio own beside it", () => {
    renderCard();
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("Patina")).toBeInTheDocument();
    expect(
      within(rows[0]).getByText("Design services (Patina standard)"),
    ).toBeInTheDocument();
    expect(within(rows[1]).getByText("studio")).toBeInTheDocument();
  });

  it("gives a seeded template no acts, ever", () => {
    renderCard();
    const seeded = rowFor("Design services (Patina standard)");
    expect(within(seeded).queryByRole("button")).not.toBeInTheDocument();
  });

  it("counts the parts by kind, as a line rather than a chip", () => {
    renderCard();
    expect(
      screen.getByText("Clauses 1 · Lists 1 · Schedules 1"),
    ).toBeInTheDocument();
  });

  it("says a template composition cannot be edited here", () => {
    renderCard();
    expect(screen.getByText(NO_COMPOSITION_EDITOR_NOTE)).toBeInTheDocument();
  });

  it("renames a studio template", async () => {
    renderCard();
    const row = rowFor("Full-service residential");
    fireEvent.click(within(row).getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Rename Full-service residential"), {
      target: { value: "  Full service, residential  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockRenameTemplate).toHaveBeenCalledWith({
        templateKey: "studio.full-service",
        title: "Full service, residential",
      }),
    );
  });

  it("refuses a blank rename without calling the server", async () => {
    renderCard();
    const row = rowFor("Full-service residential");
    fireEvent.click(within(row).getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Rename Full-service residential"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Name this template before saving it."),
    ).toBeInTheDocument();
    expect(mockRenameTemplate).not.toHaveBeenCalled();
  });

  it("deletes a studio template", async () => {
    renderCard();
    const row = rowFor("Full-service residential");
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(mockDeleteTemplate).toHaveBeenCalledWith({
        templateKey: "studio.full-service",
      }),
    );
  });

  it("renames a Library part through the upsert, carrying its payload", async () => {
    renderCard();
    const row = rowFor("House rules");
    fireEvent.click(within(row).getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Rename House rules"), {
      target: { value: "Studio house rules" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockSavePart).toHaveBeenCalledWith({
        studioId: "studio-1",
        part: expect.objectContaining({
          partKey: "studio.house-rules",
          title: "Studio house rules",
          payload: { body: "The studio own words." },
        }),
      }),
    );
  });

  it("deletes a Library part", async () => {
    renderCard();
    const row = rowFor("Site day rate");
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(mockDeletePart).toHaveBeenCalledWith({
        studioId: "studio-1",
        partId: "studio.day-rate",
      }),
    );
  });

  it("offers a plain member no acts, and says why (R3)", () => {
    renderCard(false);
    expect(
      screen.queryByRole("button", { name: "Rename" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(MEMBERS_COMPOSE_NOTE)).toBeInTheDocument();
  });

  it("does not lecture an owner about who may edit", () => {
    renderCard(true);
    expect(screen.queryByText(MEMBERS_COMPOSE_NOTE)).not.toBeInTheDocument();
  });

  it("prints the database refusal it was handed", async () => {
    mockDeleteTemplate.mockRejectedValue({
      message: "only a studio owner or admin may edit the Library",
    });
    renderCard();
    const row = rowFor("Full-service residential");
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    expect(
      await screen.findByText(
        "only a studio owner or admin may edit the Library",
      ),
    ).toBeInTheDocument();
  });

  it("says the Library is opening rather than saying it is empty", () => {
    mockTemplates.mockReturnValue({ data: undefined, isLoading: true });
    mockParts.mockReturnValue({ data: undefined, isLoading: true });
    render(<AgreementLibraryCard studioId="studio-1" canManage />);
    expect(screen.getAllByText("Opening the Library…")).toHaveLength(2);
  });

  it("invites a studio with an empty Library to fill it from a composition", () => {
    mockTemplates.mockReturnValue({ data: [], isLoading: false });
    mockParts.mockReturnValue({ data: [], isLoading: false });
    render(<AgreementLibraryCard studioId="studio-1" canManage />);
    expect(screen.getByText("No templates yet.")).toBeInTheDocument();
    expect(screen.getByText(/No parts saved yet/)).toBeInTheDocument();
  });
});
