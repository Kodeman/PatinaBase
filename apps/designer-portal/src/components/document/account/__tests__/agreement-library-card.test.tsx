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
  REMOVE_PART_WARNING,
  REMOVE_TEMPLATE_WARNING,
} from "../agreement-library-card";

const mockTemplates = jest.fn();
const mockParts = jest.fn();
const mockRenameTemplate = jest.fn();
const mockDeleteTemplate = jest.fn();
const mockSavePart = jest.fn();
const mockDeletePart = jest.fn();

/** Every Library mutation binds the acting studio at construction — the
 *  @patina/supabase shape. The mocks record it so a card that stopped passing
 *  it would fail here rather than at integration. */
const mockBoundStudio = jest.fn();

jest.mock("@patina/supabase", () => ({
  useAgreementTemplates: (studioId: string) => mockTemplates(studioId),
  useStudioAgreementParts: (studioId: string) => mockParts(studioId),
  useRenameAgreementTemplate: (studioId: string) => {
    mockBoundStudio("rename-template", studioId);
    return { mutateAsync: mockRenameTemplate };
  },
  useDeleteAgreementTemplate: (studioId: string) => {
    mockBoundStudio("delete-template", studioId);
    return { mutateAsync: mockDeleteTemplate };
  },
  useSaveAgreementPart: () => ({ mutateAsync: mockSavePart }),
  useDeleteStudioAgreementPart: (studioId: string) => {
    mockBoundStudio("delete-part", studioId);
    return { mutateAsync: mockDeletePart };
  },
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

/** The two-step remove: Delete, then Remove it. */
const removeFrom = (row: HTMLElement) => {
  fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
  fireEvent.click(within(row).getByRole("button", { name: "Remove it" }));
};

beforeEach(() => {
  mockBoundStudio.mockReset();
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

  it("names a part in the designer's words, never the database's", () => {
    renderCard();
    const dayRate = rowFor("Site day rate");
    expect(within(dayRate).getByText("Day rate")).toBeInTheDocument();
    expect(within(dayRate).queryByText(/day_rate/)).not.toBeInTheDocument();
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
        id: "studio.full-service",
        title: "Full service, residential",
      }),
    );
  });

  it("binds the acting studio into every Library mutation", () => {
    renderCard();
    expect(mockBoundStudio).toHaveBeenCalledWith(
      "rename-template",
      "studio-1",
    );
    expect(mockBoundStudio).toHaveBeenCalledWith(
      "delete-template",
      "studio-1",
    );
    expect(mockBoundStudio).toHaveBeenCalledWith("delete-part", "studio-1");
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

  it("asks before it removes a studio template, and only then removes it", async () => {
    renderCard();
    const row = rowFor("Full-service residential");
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));

    expect(within(row).getByText(REMOVE_TEMPLATE_WARNING)).toBeInTheDocument();
    expect(mockDeleteTemplate).not.toHaveBeenCalled();

    fireEvent.click(within(row).getByRole("button", { name: "Remove it" }));
    await waitFor(() =>
      expect(mockDeleteTemplate).toHaveBeenCalledWith("studio.full-service"),
    );
  });

  it("keeps a template the studio decides to keep", () => {
    renderCard();
    const row = rowFor("Full-service residential");
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(row).getByRole("button", { name: "Keep it" }));

    expect(mockDeleteTemplate).not.toHaveBeenCalled();
    expect(
      within(row).queryByText(REMOVE_TEMPLATE_WARNING),
    ).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Delete" })).toBeVisible();
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
      expect(mockSavePart).toHaveBeenCalledWith(
        expect.objectContaining({
          studioId: "studio-1",
          partKey: "studio.house-rules",
          title: "Studio house rules",
          payload: { body: "The studio own words." },
        }),
      ),
    );
  });

  it("asks before it removes a Library part, and only then removes it", async () => {
    renderCard();
    const row = rowFor("Site day rate");
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));

    expect(within(row).getByText(REMOVE_PART_WARNING)).toBeInTheDocument();
    expect(mockDeletePart).not.toHaveBeenCalled();

    fireEvent.click(within(row).getByRole("button", { name: "Remove it" }));
    await waitFor(() =>
      expect(mockDeletePart).toHaveBeenCalledWith("studio.day-rate"),
    );
  });

  it("asks about one row at a time", () => {
    renderCard();
    const first = rowFor("Site day rate");
    fireEvent.click(within(first).getByRole("button", { name: "Delete" }));
    const second = rowFor("House rules");
    fireEvent.click(within(second).getByRole("button", { name: "Delete" }));

    expect(
      within(first).queryByText(REMOVE_PART_WARNING),
    ).not.toBeInTheDocument();
    expect(within(second).getByText(REMOVE_PART_WARNING)).toBeInTheDocument();
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
    removeFrom(rowFor("Full-service residential"));
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
