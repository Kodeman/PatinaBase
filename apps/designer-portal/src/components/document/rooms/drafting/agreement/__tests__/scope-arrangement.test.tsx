import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AgreementPart, ScopeEdition, ScopeEditionState } from "@patina/types";
import type { CommercialDocument } from "@/lib/document/commercial-documents";
import { PartEditor } from "../part-editor";
import { hasEditor } from "../part-kinds";
import { assessAgreementReadiness } from "../readiness";
import { ScopeArrangementChoices, InheritedBindingReading } from "../editors/scope-package-editor";
import { useScopeEditions } from "@patina/supabase";

// Supabase has no tsconfig alias; the ordinary workspace mock owns this hook.
// Payload validation remains the real shared boundary, not a test parser.
jest.mock("@patina/supabase", () => ({
  ...jest.requireActual("@patina/supabase"),
  useScopeEditions: jest.fn(),
}));
const mockReading = jest.mocked(useScopeEditions);
const refetch = jest.fn();
const payload = () => ({
  packageKey: "pkg.kitchen", label: "Kitchen cabinetry", roomIds: ["room-kitchen"],
  inclusion: "conditional", conditionText: "Subject to measured drawings", overrideOf: "pkg.original",
  responsibilities: { design: "studio", purchasing: "gc", payer: "client", fabrication_contract: "other", installation: "none" },
  serviceBindings: { design: [], installation: [] },
});
const part = (content = payload()): AgreementPart => ({
  id: "part-1", proposalId: "proposal-addendum", position: 0, kind: "scope_package", variant: null,
  partKey: "pkg.kitchen", title: "Kitchen scope", payload: content, required: false,
  clientVisible: true, sourceTemplateKey: null, sourcePartId: null, updatedAt: null,
});
const edition = (id = "edition-source", number = 1): ScopeEdition => ({
  id, projectId: "job-1", editionNumber: number, kind: "baseline", status: "superseded",
  commercialDocumentId: "document-1", sourceProposalId: "proposal-1", predecessorEditionId: null,
  agreementFingerprint: "signed-fingerprint", effectiveAt: "2026-10-26T00:00:00Z", content: {},
  contentHash: "hash", staleReason: null, packages: [], signers: [],
  phases: [{ sourceProposalPhaseId: `signed-design-${number}`, projectPhaseId: null,
    packageKey: "pkg.kitchen", serviceSlot: "design", boundInEdition: number }],
});
const document: CommercialDocument = {
  id: "proposal-addendum", projectId: null, kind: "service_addendum", state: "draft", title: "Addendum",
  version: 1, waveName: null, sentAt: null, executedAt: null, supersededAt: null, replacementProposalId: null,
};
function reading(state: ScopeEditionState, refetchError: Error | null = null) {
  mockReading.mockReturnValue({ editionState: state, refetchError, refetch } as ReturnType<typeof useScopeEditions>);
}
function editor(content = payload()) {
  const onChange = jest.fn();
  render(<PartEditor part={part(content)} libraryOn readOnly={false} onChange={onChange}
    scopeProjectId="job-1" inheritedScopeEditionId="edition-source" />);
  return onChange;
}
beforeEach(() => { jest.clearAllMocks(); reading({ status: "absent" }); });

describe("inactive scope arrangements", () => {
  it("renders four labelled disabled choices with no selected preset or submitting act", () => {
    const submit = jest.fn();
    render(<form onSubmit={submit}><ScopeArrangementChoices /></form>);
    for (const label of ["Full service with a building team", "Cabinetry-focused commission", "Furnishings with mixed buying", "Design-only/client implementation"]) {
      const choice = screen.getByRole("radio", { name: label });
      expect(choice).toBeDisabled();
      expect(choice).not.toBeChecked();
      fireEvent.click(choice);
    }
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText(/Not yet available. Arrangements cannot be applied/)).toBeVisible();
    expect(screen.getByText(/do not appoint anyone, grant access or authorize work/)).toBeVisible();
  });

  it("mounts the native package editor and preserves all five independent recorded responsibilities", () => {
    const original = payload();
    const onChange = editor(original);
    expect(hasEditor("scope_package", null, true)).toBe(true);
    for (const [label, value] of [["Design", "studio"], ["Purchasing", "gc"], ["Payer", "client"], ["Fabrication contract", "other"], ["Installation", "none"]]) {
      const control = screen.getByRole("combobox", { name: label, exact: true });
      expect(control).toHaveValue(value);
      expect(control).toBeDisabled();
    }
    expect(screen.getByRole("combobox", { name: "Inclusion" })).toHaveValue("conditional");
    expect(screen.getByRole("textbox", { name: "Condition" })).toHaveValue("Subject to measured drawings");
    expect(screen.getByText("Overrides pkg.original")).toBeVisible();
    expect(screen.getByText(/No appointment, access or fabrication authority is granted here/)).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
    expect(original).toEqual(payload());
  });

  it("keeps inherited bindings read-only and separate from this draft's empty new bindings", () => {
    reading({ status: "recorded", editions: [edition("edition-newer", 2), edition()] });
    const original = payload();
    const onChange = editor(original);
    expect(mockReading).toHaveBeenCalledWith("job-1");
    const inherited = screen.getByRole("region", { name: "Inherited service bindings" });
    expect(inherited).toHaveTextContent("Scope edition 1 · superseded");
    expect(inherited).toHaveTextContent("signed-design-1");
    expect(inherited).not.toHaveTextContent("signed-design-2");
    const draft = screen.getByRole("region", { name: "This draft's new service bindings" });
    expect(draft).not.toHaveTextContent("signed-design-1");
    expect(within(draft).getAllByText(/No new binding recorded/)).toHaveLength(2);
    expect(original.serviceBindings).toEqual({ design: [], installation: [] });
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(["idle", "absent"] as const)("states unavailable rather than an empty inherited binding list for %s", status => {
    render(<InheritedBindingReading state={{ status }} editionId="edition-source" packageKey="pkg.kitchen" />);
    expect(screen.getByText(/Inherited bindings unavailable/)).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
  it("states the recorded source edition was not returned rather than claiming it has no bindings", () => {
    render(<InheritedBindingReading state={{ status: "recorded", editions: [edition()] }} editionId="edition-missing" packageKey="pkg.kitchen" />);
    expect(screen.getByText("Inherited bindings unavailable — the recorded source scope edition was not returned.")).toBeVisible();
    expect(screen.queryByText(/source edition records no bindings/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
  it("states no bindings for this package only when the source edition was returned", () => {
    const source = edition(); source.phases[0].packageKey = "pkg.other";
    render(<InheritedBindingReading state={{ status: "recorded", editions: [source] }} editionId="edition-source" packageKey="pkg.kitchen" />);
    expect(screen.getByText(/source edition records no bindings/)).toBeVisible();
    expect(screen.queryByText(/source scope edition was not returned/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
  it("distinguishes a loading reading from cold failure and supports retry", () => {
    reading({ status: "loading" });
    const view = render(<PartEditor part={part()} libraryOn readOnly={false} onChange={jest.fn()} scopeProjectId="job-1" inheritedScopeEditionId="edition-source" />);
    expect(screen.getByRole("status")).toHaveTextContent("Reading the source scope edition");
    reading({ status: "error", error: new Error("refused") });
    view.rerender(<PartEditor part={part()} libraryOn readOnly={false} onChange={jest.fn()} scopeProjectId="job-1" inheritedScopeEditionId="edition-source" />);
    expect(screen.getByRole("alert")).toHaveTextContent("bindings are unknown");
    fireEvent.click(screen.getByRole("button", { name: "Retry scope reading" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
  it("shows only the unknown-bindings alert and Retry after an empty-cache refetch error", () => {
    const error = new Error("refresh refused");
    reading({ status: "error", error }, error);
    editor();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("The source scope edition could not be read. Its bindings are unknown.");
    expect(screen.queryByText(/last recorded bindings remain/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry scope reading" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
  it("retains signed inherited bindings alongside a failed warm refresh", () => {
    reading({ status: "recorded", editions: [edition()] }, new Error("refresh refused"));
    editor();
    expect(screen.getByText(/signed-design-1/)).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("scope refresh failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry scope reading" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
  it("refuses malformed package presentation without changing the record", () => {
    const onChange = editor({ ...payload(), responsibilities: { design: "studio" } } as ReturnType<typeof payload>);
    expect(screen.getByRole("alert")).toHaveTextContent("scope package cannot be read");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
  it("holds sending inactive and malformed scope packages, not ordinary legacy parts", () => {
    const assess = (parts: AgreementPart[]) => assessAgreementReadiness({ document, parts, recipientEmail: "fixture@test.invalid" });
    expect(assess([part()]).blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code: "scope-inactive", partId: "part-1" })]));
    expect(assess([part({ ...payload(), inclusion: "conditional", conditionText: "" })]).blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "scope-inactive" }), expect.objectContaining({ code: "scope-malformed" }),
    ]));
    expect(assess([{ ...part(), kind: "clause", payload: { body: "Legacy wording" } }]).blockers.filter(row => row.code?.startsWith("scope-"))).toEqual([]);
  });
});
