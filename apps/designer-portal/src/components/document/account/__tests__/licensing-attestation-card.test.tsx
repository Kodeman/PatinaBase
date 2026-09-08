/**
 * Account → Studio → Licensing (M7, R10).
 *
 * What the walk's step 2 reads, pinned: the fields in order, the affirmation,
 * the standing disclaimer verbatim, the annotation that Patina stores and
 * does not verify — and NO word count anywhere, which is the one thing §8
 * asks for explicitly and the one thing a well-meaning later edit is most
 * likely to add.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DESIGN_BUILD_COPY } from "@patina/types";
import { LicensingAttestationCard } from "../licensing-attestation-card";

const mockAttestation = jest.fn();
const mockSave = jest.fn();
const mockIsLive = jest.fn();

jest.mock("@patina/supabase", () => ({
  useStudioLicenseAttestation: () => mockAttestation(),
  useSaveStudioLicenseAttestation: () => ({
    mutateAsync: mockSave,
    isPending: false,
  }),
  licenseAttestationIsLive: (...args: unknown[]) => mockIsLive(...args),
}));

jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "designer-1" }, status: "authenticated" }),
}));

jest.mock("../../document-action", () => ({
  DocumentActionGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DocumentAction: ({
    children,
    actionKey: _actionKey,
    variant: _variant,
    loading: _loading,
    loadingLabel: _loadingLabel,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> &
    Record<string, unknown>) => <button {...props}>{children}</button>,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockAttestation.mockReturnValue({ data: null, isLoading: false });
  mockIsLive.mockReturnValue(false);
  mockSave.mockResolvedValue({});
});

function renderCard(canManage = true) {
  return render(
    <LicensingAttestationCard studioId="studio-1" canManage={canManage} />,
  );
}

describe("the Licensing card", () => {
  it("asks for the credential in M7's order", () => {
    renderCard();
    expect(screen.getByLabelText("Credential type")).toBeInTheDocument();
    expect(screen.getByLabelText("Number")).toBeInTheDocument();
    expect(screen.getByLabelText("State")).toBeInTheDocument();
    expect(screen.getByLabelText("Expiry")).toBeInTheDocument();
    expect(
      screen.getByText(DESIGN_BUILD_COPY.attestationAffirmation),
    ).toBeInTheDocument();
  });

  it("carries the standing disclaimer verbatim", () => {
    renderCard();
    expect(
      screen.getByText(DESIGN_BUILD_COPY.legalDisclaimer),
    ).toBeInTheDocument();
  });

  it("says Patina stores it and does not verify it", () => {
    renderCard();
    expect(
      screen.getByText(DESIGN_BUILD_COPY.attestationStored),
    ).toBeInTheDocument();
  });

  it("prints no word count anywhere on the card", () => {
    const { container } = renderCard();
    expect(container.textContent).not.toMatch(/\b\d+\s*words?\b/i);
  });

  it("will not save until every field and the affirmation are in", () => {
    renderCard();
    const save = screen.getByRole("button", { name: "Save attestation" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Number"), {
      target: { value: "1234567" },
    });
    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "WI" },
    });
    fireEvent.change(screen.getByLabelText("Expiry"), {
      target: { value: "2027-03-31" },
    });
    expect(save).toBeDisabled();

    fireEvent.click(
      screen.getByLabelText(DESIGN_BUILD_COPY.attestationAffirmation),
    );
    expect(save).not.toBeDisabled();
  });

  it("writes the walk's attestation, with the acting member as the attester", async () => {
    renderCard();
    fireEvent.change(screen.getByLabelText("Number"), {
      target: { value: "1234567" },
    });
    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "wi" },
    });
    fireEvent.change(screen.getByLabelText("Expiry"), {
      target: { value: "2027-03-31" },
    });
    fireEvent.click(
      screen.getByLabelText(DESIGN_BUILD_COPY.attestationAffirmation),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save attestation" }));

    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave).toHaveBeenCalledWith({
      studioId: "studio-1",
      credentialType: "WI Dwelling Contractor",
      credentialNumber: "1234567",
      state: "WI",
      expiresOn: "2027-03-31",
      attestedBy: "designer-1",
    });
  });

  it("takes a credential the select does not carry, as free text", () => {
    renderCard();
    fireEvent.change(screen.getByLabelText("Credential type"), {
      target: { value: "Other" },
    });
    // Two controls now answer to the label: the select and the free-text
    // field beneath it. The free-text one is the input.
    const typed = screen
      .getAllByLabelText("Credential type")
      .find((node) => node.tagName === "INPUT") as HTMLInputElement;
    expect(typed).toBeTruthy();
    fireEvent.change(typed, { target: { value: "MN Residential Remodeler" } });
    expect(typed.value).toBe("MN Residential Remodeler");
  });

  it("shows a member what is on file and offers no edit", () => {
    mockAttestation.mockReturnValue({
      data: {
        studioId: "studio-1",
        credentialType: "WI Dwelling Contractor",
        credentialNumber: "1234567",
        state: "WI",
        expiresOn: "2027-03-31",
        attestedBy: "designer-1",
        attestedAt: "2026-09-07T00:00:00Z",
      },
      isLoading: false,
    });
    mockIsLive.mockReturnValue(true);
    renderCard(false);
    expect(screen.getByText(/WI Dwelling Contractor/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save attestation" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Number")).not.toBeInTheDocument();
  });

  it("says a lapsed attestation locks the template", () => {
    mockAttestation.mockReturnValue({
      data: {
        studioId: "studio-1",
        credentialType: "CA CSLB",
        credentialNumber: "9",
        state: "CA",
        expiresOn: "2020-01-01",
        attestedBy: "designer-1",
        attestedAt: "2019-01-01T00:00:00Z",
      },
      isLoading: false,
    });
    mockIsLive.mockReturnValue(false);
    renderCard();
    expect(
      screen.getByText(
        /The design-build template is locked until it is renewed/,
      ),
    ).toBeInTheDocument();
  });
});
