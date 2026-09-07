import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  AGREEMENT_SCHEDULE_VARIANTS,
  type AgreementPart,
  type StudioAgreementPart,
} from "@patina/types";
import { AddPartSheet } from "../add-part-sheet";

const mockStudioParts = jest.fn();

jest.mock("@patina/supabase", () => ({
  useStudioAgreementParts: (studioId: string | null) =>
    mockStudioParts(studioId),
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

function studioPart(
  input: Partial<StudioAgreementPart> & { partKey: string; title: string },
): StudioAgreementPart {
  return {
    id: input.id ?? `studio-part-${input.partKey}`,
    studioId: "studio-1",
    kind: input.kind ?? "clause",
    variant: input.variant ?? null,
    partKey: input.partKey,
    title: input.title,
    payload: input.payload ?? {},
    requiredDefault: input.requiredDefault ?? false,
    clientVisibleDefault: input.clientVisibleDefault ?? true,
    createdBy: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };
}

function onAgreement(
  input: Partial<AgreementPart> & { partKey: string },
): AgreementPart {
  return {
    id: input.id ?? `on-${input.partKey}`,
    proposalId: "agreement-1",
    position: input.position ?? 1,
    kind: input.kind ?? "clause",
    variant: input.variant ?? null,
    partKey: input.partKey,
    title: input.title ?? "Part",
    payload: {},
    required: false,
    clientVisible: true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
  };
}

const LIBRARY = [
  studioPart({ partKey: "studio.house-rules", title: "House rules" }),
  studioPart({
    partKey: "studio.ceiling",
    title: "Studio ceiling",
    kind: "schedule",
    variant: "ceiling",
  }),
];

function renderSheet(
  parts: AgreementPart[] = [],
  onAdd = jest.fn(),
  library: StudioAgreementPart[] = LIBRARY,
) {
  mockStudioParts.mockReturnValue({ data: library, isLoading: false });
  render(
    <AddPartSheet
      open
      onClose={jest.fn()}
      studioId="studio-1"
      parts={parts}
      onAdd={onAdd}
    />,
  );
  return onAdd;
}

const partRows = () =>
  within(screen.getByRole("region", { name: "Parts" })).getAllByRole(
    "listitem",
  );

beforeEach(() => {
  mockStudioParts.mockReset();
});

describe("the Add-a-part picker", () => {
  it("is headed From your Library", () => {
    renderSheet();
    expect(screen.getByText("From your Library")).toBeInTheDocument();
  });

  it("lists Patina's standard parts and the studio's own, each chipped", () => {
    renderSheet();
    const rows = partRows();
    // Nine Patina standard parts plus the two the studio saved.
    expect(rows).toHaveLength(11);
    expect(within(rows[0]).getByText("Patina")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Services")).toBeInTheDocument();
    expect(within(rows[9]).getByText("studio")).toBeInTheDocument();
    expect(within(rows[9]).getByText("House rules")).toBeInTheDocument();
  });

  it("chips a Library schedule part with its R9 standing", () => {
    renderSheet();
    const rows = partRows();
    const rateCard = rows.find((row) =>
      within(row).queryByText("Role rates"),
    ) as HTMLElement;
    expect(within(rateCard).getByText("creates authority")).toBeInTheDocument();
  });

  it("refuses a part the agreement already carries, by key", () => {
    renderSheet([onAgreement({ partKey: "patina.services" })]);
    const services = partRows().find((row) =>
      within(row).queryByText("Services"),
    ) as HTMLElement;
    expect(within(services).getByRole("button")).toBeDisabled();
    expect(
      within(services).getByText("already on this agreement"),
    ).toBeInTheDocument();
  });

  it("refuses a second part of the same money shape, whatever its key (R18)", () => {
    renderSheet([
      onAgreement({
        partKey: "patina.ceiling",
        kind: "schedule",
        variant: "ceiling",
      }),
    ]);
    const studioCeiling = partRows().find((row) =>
      within(row).queryByText("Studio ceiling"),
    ) as HTMLElement;
    expect(within(studioCeiling).getByRole("button")).toBeDisabled();
  });

  it("offers all fifteen schedule variants under Schedule ▾", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Schedule ▾" }));
    const variants = within(
      screen.getByRole("list", { name: "Schedule variants" }),
    ).getAllByRole("listitem");
    expect(variants).toHaveLength(AGREEMENT_SCHEDULE_VARIANTS.length);
    expect(variants).toHaveLength(15);
  });

  it("chips every variant in the Schedule menu with its R9 standing", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Schedule ▾" }));
    const menu = screen.getByRole("list", { name: "Schedule variants" });
    expect(within(menu).getAllByText("creates authority")).toHaveLength(6);
    expect(
      within(menu).getAllByText("creates authority · deposit only"),
    ).toHaveLength(1);
    expect(within(menu).getAllByText("record only (R9)")).toHaveLength(8);
  });

  it("adds a blank clause under a custom key", () => {
    const onAdd = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Clause" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add to this agreement" }),
    );
    expect(onAdd).toHaveBeenCalledTimes(1);
    const choice = onAdd.mock.calls[0][0];
    expect(choice.partKey).toMatch(/^custom\./);
    expect(choice.kind).toBe("clause");
    expect(choice.variant).toBeNull();
    expect(choice.payload).toEqual({ body: "" });
    expect(choice.sourcePartId).toBeNull();
  });

  it("adds a Library part carrying the row it came from", () => {
    const onAdd = renderSheet();
    const houseRules = partRows().find((row) =>
      within(row).queryByText("House rules"),
    ) as HTMLElement;
    fireEvent.click(within(houseRules).getByRole("button"));
    fireEvent.click(
      screen.getByRole("button", { name: "Add to this agreement" }),
    );
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        partKey: "studio.house-rules",
        title: "House rules",
        sourcePartId: "studio-part-studio.house-rules",
      }),
    );
  });

  it("adds nothing until a choice is made", () => {
    const onAdd = renderSheet();
    expect(
      screen.getByRole("button", { name: "Add to this agreement" }),
    ).toBeDisabled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("says the Library is opening rather than saying it is empty", () => {
    mockStudioParts.mockReturnValue({ data: undefined, isLoading: true });
    render(
      <AddPartSheet
        open
        onClose={jest.fn()}
        studioId="studio-1"
        parts={[]}
        onAdd={jest.fn()}
      />,
    );
    expect(screen.getByText("Opening the Library…")).toBeInTheDocument();
  });
});
