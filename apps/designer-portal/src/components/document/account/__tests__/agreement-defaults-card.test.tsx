import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountStudioPage } from "../account-studio-page";

const mockUpdateAgreementDefaults = jest.fn();
let memberRole = "owner";
let agreementDefaultsRow: any = {
  studioId: "studio-1",
  rateCard: [
    { roleName: "Principal designer", hourlyRateCents: 22_500, sortOrder: 0 },
  ],
  depositPercent: 50,
  cadence: "monthly",
  retainerCreditRule: "credited",
  defaultExclusions: ["Construction labor"],
  updatedBy: null,
};

jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "designer-1" } }),
}));

// The card is P3 behind `agreement-parts`; every OTHER flag on this page
// stays off, exactly as the seven-facet suite next door has it.
let agreementPartsOn = true;
jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: (flag: string) => ({
    value: flag === "agreement-parts" ? agreementPartsOn : false,
    isLoading: false,
  }),
}));

// DR21 — one data layer. The card reads and writes through
// `@patina/supabase`'s hooks, so they are stubbed in that factory rather than
// in an app-local one.
jest.mock("@patina/supabase", () => ({
  useStudioAgreementDefaults: () => ({ data: agreementDefaultsRow }),
  useUpdateStudioAgreementDefaults: () => ({
    mutate: mockUpdateAgreementDefaults,
    isPending: false,
    isError: false,
    error: null,
  }),
  useOrganizations: () => ({
    data: [
      {
        id: "studio-1",
        name: "Okafor Studio",
        type: "design_studio",
        website: null,
        email: null,
        phone: null,
        address: null,
        created_at: "2026-01-01T00:00:00Z",
        rolodex_seed_skipped_at: null,
        membership: { role: memberRole },
      },
    ],
    isLoading: false,
  }),
  useOrganizationMembers: () => ({ data: [] }),
  useCreateOrganization: () => ({ mutate: jest.fn(), isPending: false }),
  useUpdateOrganization: () => ({ mutate: jest.fn(), isPending: false }),
  useUpdateMemberRole: () => ({ mutate: jest.fn() }),
  useRemoveMember: () => ({ mutate: jest.fn() }),
  useLeaveOrganization: () => ({ mutate: jest.fn() }),
  useTransferOrganizationOwnership: () => ({ mutate: jest.fn() }),
  useInviteMember: () => ({ mutateAsync: jest.fn() }),
  useProjects: () => ({ data: [] }),
  useStudioContacts: () => ({ data: [] }),
  useStudioBillingSettings: () => ({
    data: {
      studioId: "studio-1",
      card_surcharge_bps: 300,
      check_remit_to: null,
      created_at: "",
      updated_at: "",
    },
  }),
  useUpdateStudioBillingSettings: () => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

jest.mock("../studio-invite-modal", () => ({
  StudioInviteModal: () => null,
}));
jest.mock("../studio-logo-upload-field", () => ({
  StudioLogoUploadField: () => null,
}));
jest.mock("../studio-setup-checklist", () => ({
  StudioSetupChecklist: () => null,
}));
jest.mock("../member-title-line", () => ({ MemberTitleLine: () => null }));
jest.mock("../../people/directory/rolodex-seed-sheet", () => ({
  RolodexSeedSheet: () => null,
}));
jest.mock("../../document-action", () => ({
  DocumentActionGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DocumentAction: ({
    children,
    actionKey: _actionKey,
    surfaceKey: _surfaceKey,
    regionKey: _regionKey,
    variant: _variant,
    loading: _loading,
    loadingLabel: _loadingLabel,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> &
    Record<string, unknown>) => <button {...props}>{children}</button>,
}));
jest.mock("@/lib/analytics/studio-events", () => ({
  studioEvents: { created: jest.fn() },
}));

const saveButton = () =>
  screen.getByRole("button", { name: "Save agreement defaults" });

beforeEach(() => {
  jest.clearAllMocks();
  memberRole = "owner";
  agreementPartsOn = true;
  agreementDefaultsRow = {
    studioId: "studio-1",
    rateCard: [
      { roleName: "Principal designer", hourlyRateCents: 22_500, sortOrder: 0 },
    ],
    depositPercent: 50,
    cadence: "monthly",
    retainerCreditRule: "credited",
    defaultExclusions: ["Construction labor"],
    updatedBy: null,
  };
});

describe("Account · Studio · Agreement defaults", () => {
  it("seeds every field from the studio's saved row", () => {
    render(<AccountStudioPage />);
    expect(screen.getByText("Agreement defaults")).toBeInTheDocument();
    expect(screen.getByLabelText("Default role 1")).toHaveValue(
      "Principal designer",
    );
    expect(screen.getByLabelText("Default role 1 hourly rate")).toHaveValue(
      "225",
    );
    expect(screen.getByRole("button", { name: "50%" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Billing cadence")).toHaveValue("monthly");
    expect(screen.getByRole("button", { name: "Credited" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Default exclusions")).toHaveValue(
      "Construction labor",
    );
  });

  it("keeps Save disabled until something actually changes", () => {
    render(<AccountStudioPage />);
    expect(saveButton()).toBeDisabled();
    expect(screen.getAllByText("Saved").length).toBeGreaterThan(0);
  });

  it("flips dirty on the rate card", () => {
    render(<AccountStudioPage />);
    fireEvent.change(screen.getByLabelText("Default role 1 hourly rate"), {
      target: { value: "250" },
    });
    expect(saveButton()).toBeEnabled();
  });

  it("flips dirty on the deposit", () => {
    render(<AccountStudioPage />);
    fireEvent.click(screen.getByRole("button", { name: "25%" }));
    expect(saveButton()).toBeEnabled();
  });

  it("flips dirty on the cadence", () => {
    render(<AccountStudioPage />);
    fireEvent.change(screen.getByLabelText("Billing cadence"), {
      target: { value: "biweekly" },
    });
    expect(saveButton()).toBeEnabled();
  });

  it("flips dirty on the credit rule", () => {
    render(<AccountStudioPage />);
    fireEvent.click(screen.getByRole("button", { name: "Non-refundable" }));
    expect(saveButton()).toBeEnabled();
  });

  it("flips dirty on the exclusions", () => {
    render(<AccountStudioPage />);
    fireEvent.change(screen.getByLabelText("Default exclusions"), {
      target: { value: "Construction labor\nFreight" },
    });
    expect(saveButton()).toBeEnabled();
  });

  it("does not flip dirty on whitespace alone", () => {
    render(<AccountStudioPage />);
    fireEvent.change(screen.getByLabelText("Default exclusions"), {
      target: { value: "Construction labor\n" },
    });
    expect(saveButton()).toBeDisabled();
  });

  it("saves trimmed, renumbered values and drops blank roles", async () => {
    render(<AccountStudioPage />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add a role" }));
    fireEvent.change(screen.getByLabelText("Default role 2"), {
      target: { value: "  Junior designer  " },
    });
    fireEvent.change(screen.getByLabelText("Default role 2 hourly rate"), {
      target: { value: "110" },
    });
    fireEvent.change(screen.getByLabelText("Default exclusions"), {
      target: { value: "Construction labor\n  Freight  \n\n" },
    });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(mockUpdateAgreementDefaults).toHaveBeenCalledTimes(1),
    );
    expect(mockUpdateAgreementDefaults.mock.calls[0][0]).toEqual({
      studioId: "studio-1",
      rateCard: [
        {
          roleName: "Principal designer",
          hourlyRateCents: 22_500,
          sortOrder: 0,
        },
        { roleName: "Junior designer", hourlyRateCents: 11_000, sortOrder: 1 },
      ],
      depositPercent: 50,
      cadence: "monthly",
      retainerCreditRule: "credited",
      defaultExclusions: ["Construction labor", "Freight"],
      // DR7 — the write names who made it. `updated_by` is NULL with no
      // default and no trigger (00575), so a save that omits it makes "who
      // last changed the studio's defaults" permanently unanswerable.
      updatedBy: "designer-1",
    });
  });

  it("keeps an unset deposit unset rather than saving a zero nobody chose", async () => {
    agreementDefaultsRow = { ...agreementDefaultsRow, depositPercent: null };
    render(<AccountStudioPage />);
    expect(
      screen.getByText(/No deposit set — a new agreement leaves it open/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Billing cadence"), {
      target: { value: "milestone" },
    });
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(mockUpdateAgreementDefaults).toHaveBeenCalledTimes(1),
    );
    expect(
      mockUpdateAgreementDefaults.mock.calls[0][0].depositPercent,
    ).toBeNull();
  });

  it("shows a plain member the values read-only, with no Save (R3)", () => {
    memberRole = "member";
    render(<AccountStudioPage />);
    expect(screen.getByText("Agreement defaults")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save agreement defaults" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Default role 1")).not.toBeInTheDocument();
    expect(screen.getByText(/Principal designer/)).toBeInTheDocument();
  });

  it("is not on the page at all with the flag off", () => {
    agreementPartsOn = false;
    render(<AccountStudioPage />);
    expect(screen.queryByText("Agreement defaults")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save agreement defaults" }),
    ).not.toBeInTheDocument();
    // Billing, one block above it, is untouched either way.
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByLabelText("Card fee (%)")).toBeInTheDocument();
  });

  it("leaves the Billing card exactly where it was, above it", () => {
    render(<AccountStudioPage />);
    const billing = screen.getByText("Billing");
    const agreement = screen.getByText("Agreement defaults");
    expect(
      billing.compareDocumentPosition(agreement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByLabelText("Card fee (%)")).toBeInTheDocument();
    expect(screen.getByLabelText("Remit checks to")).toBeInTheDocument();
  });
});
