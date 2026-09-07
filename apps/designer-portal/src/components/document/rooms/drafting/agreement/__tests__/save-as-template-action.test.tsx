import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  NOT_PERMITTED_NOTE,
  SAVED_NOTE,
  SaveAsTemplateAction,
} from "../save-as-template-action";

const mockSave = jest.fn();
const mockTemplateSaved = jest.fn();

jest.mock("@patina/supabase", () => ({
  useSaveAgreementAsTemplate: () => ({
    mutateAsync: mockSave,
    isPending: false,
  }),
}));

jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: {
    agreementTemplateSaved: (props: unknown) => mockTemplateSaved(props),
  },
}));

function renderAction(canManage = true, disabled = false) {
  return render(
    <SaveAsTemplateAction
      proposalId="agreement-1"
      canManage={canManage}
      disabled={disabled}
    />,
  );
}

const openNaming = () =>
  fireEvent.click(screen.getByRole("button", { name: "Save as template…" }));

beforeEach(() => {
  mockSave.mockReset();
  mockTemplateSaved.mockReset();
});

describe("Save as template…", () => {
  it("is not offered to a plain member (R3)", () => {
    const { container } = renderAction(false);
    expect(container).toBeEmptyDOMElement();
  });

  it("is offered to an owner or admin", () => {
    renderAction(true);
    expect(
      screen.getByRole("button", { name: "Save as template…" }),
    ).toBeInTheDocument();
  });

  it("is held while the agreement has no parts to save", () => {
    renderAction(true, true);
    expect(
      screen.getByRole("button", { name: "Save as template…" }),
    ).toBeDisabled();
  });

  it("refuses a blank title without calling the server", async () => {
    renderAction();
    openNaming();
    fireEvent.click(screen.getByRole("button", { name: "Save to Library" }));
    expect(
      await screen.findByText("Name this template before saving it."),
    ).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("saves the trimmed title and says so quietly", async () => {
    mockSave.mockResolvedValue({ templateKey: "studio.abc" });
    renderAction();
    openNaming();
    fireEvent.change(screen.getByLabelText("Template name"), {
      target: { value: "  Full-service residential  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Library" }));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith({
        proposalId: "agreement-1",
        title: "Full-service residential",
      }),
    );
    expect(await screen.findByText(SAVED_NOTE)).toBeInTheDocument();
    expect(mockTemplateSaved).toHaveBeenCalledWith({
      proposal_id: "agreement-1",
    });
  });

  it("prints the owner-or-admin sentence on insufficient_privilege", async () => {
    mockSave.mockRejectedValue({
      code: "42501",
      message: "only a studio owner or admin may edit the Library",
    });
    renderAction();
    openNaming();
    fireEvent.change(screen.getByLabelText("Template name"), {
      target: { value: "Full-service residential" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Library" }));

    expect(await screen.findByText(NOT_PERMITTED_NOTE)).toBeInTheDocument();
    expect(mockTemplateSaved).not.toHaveBeenCalled();
  });

  it("prints any other refusal in the database's own words", async () => {
    mockSave.mockRejectedValue({
      code: "23514",
      message: "this agreement has no parts to save",
    });
    renderAction();
    openNaming();
    fireEvent.change(screen.getByLabelText("Template name"), {
      target: { value: "Empty" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Library" }));

    expect(
      await screen.findByText("this agreement has no parts to save"),
    ).toBeInTheDocument();
  });
});
