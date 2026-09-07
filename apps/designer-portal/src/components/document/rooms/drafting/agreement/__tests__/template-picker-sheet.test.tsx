import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AgreementTemplate } from "@patina/types";
import {
  REPLACE_WARNING,
  REPLACE_WARNING_UNSAVED,
  TemplatePickerSheet,
  templateClassFor,
  documentKindForTemplateClass,
} from "../template-picker-sheet";

const mockTemplates = jest.fn();

jest.mock("@patina/supabase", () => ({
  useAgreementTemplates: (studioId: string | null) => mockTemplates(studioId),
}));

jest.mock("../../../../overlays/doc-sheet", () => ({
  DocSheet: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

function template(
  input: Partial<AgreementTemplate> & { templateKey: string; title: string },
): AgreementTemplate {
  return {
    id: input.id ?? input.templateKey,
    templateKey: input.templateKey,
    kind: input.kind ?? "studio",
    studioId: input.kind === "seeded" ? null : "studio-1",
    class: input.class ?? "design_services",
    title: input.title,
    parts: input.parts ?? [
      { kind: "clause", title: "Services", payload: {} },
      { kind: "clause", title: "Terms", payload: {} },
    ],
    consentKey: null,
    createdBy: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };
}

const SHELF = [
  template({
    templateKey: "studio.full-service",
    title: "Full-service residential",
  }),
  template({
    templateKey: "patina.design_services",
    title: "Design services (Patina standard)",
    kind: "seeded",
  }),
  template({
    templateKey: "patina.furnishings_services",
    title: "Furnishings only",
    kind: "seeded",
    class: "furnishings_services",
  }),
  template({
    templateKey: "patina.design_build",
    title: "Design-build",
    kind: "seeded",
    class: "design_build",
  }),
];

function renderSheet({
  onMaterialize = jest.fn(),
  documentKind = "design_services",
  shelf = SHELF,
  unsavedChanges = false,
}: {
  onMaterialize?: jest.Mock;
  documentKind?: string;
  shelf?: AgreementTemplate[];
  unsavedChanges?: boolean;
} = {}) {
  mockTemplates.mockReturnValue({ data: shelf, isLoading: false });
  render(
    <TemplatePickerSheet
      open
      onClose={jest.fn()}
      studioId="studio-1"
      documentKind={documentKind}
      onMaterialize={onMaterialize}
      unsavedChanges={unsavedChanges}
    />,
  );
  return onMaterialize;
}

/** The row's whole button is the target — its accessible name is the chip,
 *  the title and the part-title preview run together. */
const chooseTemplate = (title: string) => {
  const row = screen
    .getAllByRole("listitem")
    .find((item) => within(item).queryByText(title)) as HTMLElement;
  fireEvent.click(within(row).getByRole("button"));
};

beforeEach(() => {
  mockTemplates.mockReset();
});

describe("the template picker", () => {
  // R35 — the shelf is filtered by the document KIND each class composes onto,
  // so all three seeded classes stand on a design-services paper and only
  // design_build (Wave 3) is held back.
  it("shows every template this document can take, Patina first", () => {
    renderSheet();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(
      within(rows[0]).getByText("Design services (Patina standard)"),
    ).toBeInTheDocument();
    expect(within(rows[0]).getByText("Patina")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Furnishings only")).toBeInTheDocument();
    expect(
      within(rows[2]).getByText("Full-service residential"),
    ).toBeInTheDocument();
    expect(within(rows[2]).getByText("studio")).toBeInTheDocument();
  });

  it("holds design-build back until Wave 3", () => {
    renderSheet();
    expect(screen.queryByText("Design-build")).not.toBeInTheDocument();
    expect(documentKindForTemplateClass("design_build")).toBe("design_build");
    expect(documentKindForTemplateClass("consultation")).toBe("design_services");
    expect(documentKindForTemplateClass("furnishings_services")).toBe(
      "design_services",
    );
    expect(documentKindForTemplateClass("design_services")).toBe(
      "design_services",
    );
  });

  it("previews a template by its part titles", () => {
    renderSheet();
    expect(screen.getAllByText("Services · Terms")).toHaveLength(3);
  });

  it("composes an addendum from the design-services shelf", () => {
    expect(templateClassFor("service_addendum")).toBe("design_services");
    expect(templateClassFor("design_services")).toBe("design_services");
    renderSheet({ documentKind: "service_addendum" });
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("warns that the parts are replaced before it materializes anything", () => {
    const onMaterialize = renderSheet();
    chooseTemplate("Design services (Patina standard)");
    expect(screen.queryByText(REPLACE_WARNING)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use this template" }));
    expect(screen.getByText(REPLACE_WARNING)).toBeInTheDocument();
    expect(onMaterialize).not.toHaveBeenCalled();
  });

  it("names the unsaved edits it is about to take with them", () => {
    renderSheet({ unsavedChanges: true });
    chooseTemplate("Design services (Patina standard)");
    fireEvent.click(screen.getByRole("button", { name: "Use this template" }));

    expect(screen.getByText(REPLACE_WARNING_UNSAVED)).toBeInTheDocument();
    expect(screen.queryByText(REPLACE_WARNING)).not.toBeInTheDocument();
  });

  it("carries the chosen template's key once the warning is confirmed", () => {
    const onMaterialize = renderSheet();
    chooseTemplate("Full-service residential");
    fireEvent.click(screen.getByRole("button", { name: "Use this template" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace the parts" }));
    expect(onMaterialize).toHaveBeenCalledTimes(1);
    expect(onMaterialize.mock.calls[0][0].templateKey).toBe(
      "studio.full-service",
    );
  });

  it("materializes nothing until a template is chosen", () => {
    renderSheet();
    expect(
      screen.getByRole("button", { name: "Use this template" }),
    ).toBeDisabled();
  });

  it("says the shelf is empty in the studio's own words", () => {
    renderSheet({ shelf: [] });
    expect(
      screen.getByText(/Your Library has no template for this kind/),
    ).toBeInTheDocument();
  });

  it("says the Library is opening rather than saying it is empty", () => {
    mockTemplates.mockReturnValue({ data: undefined, isLoading: true });
    render(
      <TemplatePickerSheet
        open
        onClose={jest.fn()}
        studioId="studio-1"
        documentKind="design_services"
        onMaterialize={jest.fn()}
      />,
    );
    expect(screen.getByText("Opening the Library…")).toBeInTheDocument();
  });

  it("prints a refusal it was handed", () => {
    mockTemplates.mockReturnValue({ data: SHELF, isLoading: false });
    render(
      <TemplatePickerSheet
        open
        onClose={jest.fn()}
        studioId="studio-1"
        documentKind="design_services"
        onMaterialize={jest.fn()}
        error="template not found or not accessible"
      />,
    );
    expect(
      screen.getByText("template not found or not accessible"),
    ).toBeInTheDocument();
  });
});
