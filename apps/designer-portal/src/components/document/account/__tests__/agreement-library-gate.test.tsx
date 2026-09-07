/**
 * The one insertion into Account → Studio (M4), and its gate.
 *
 * Both flags, or nothing: `agreement-library` only ever shows where
 * `agreement-parts` already does. Billing above it is untouched in every case
 * — the card's whole shape is "below Billing, changing nothing about it".
 *
 * Shaped after `agreement-defaults-card.test.tsx`, Wave 1's sibling spec,
 * which mounts the whole page against a per-flag mock.
 */

import { render, screen } from "@testing-library/react";
import { AccountStudioPage } from "../account-studio-page";

let agreementPartsOn = true;
let agreementLibraryOn = true;

jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "designer-1" } }),
}));

jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: (flag: string) => ({
    value:
      flag === "agreement-parts"
        ? agreementPartsOn
        : flag === "agreement-library"
          ? agreementLibraryOn
          : false,
    isLoading: false,
  }),
}));

jest.mock("@patina/supabase", () => ({
  useStudioAgreementDefaults: () => ({ data: null }),
  useUpdateStudioAgreementDefaults: () => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useAgreementTemplates: () => ({
    data: [
      {
        id: "t1",
        templateKey: "studio.full-service",
        kind: "studio",
        studioId: "studio-1",
        class: "design_services",
        title: "Full-service residential",
        parts: [],
        consentKey: null,
        createdBy: null,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
    ],
    isLoading: false,
  }),
  useStudioAgreementParts: () => ({ data: [], isLoading: false }),
  useRenameAgreementTemplate: () => ({ mutateAsync: jest.fn() }),
  useDeleteAgreementTemplate: () => ({ mutateAsync: jest.fn() }),
  useSaveAgreementPart: () => ({ mutateAsync: jest.fn() }),
  useDeleteStudioAgreementPart: () => ({ mutateAsync: jest.fn() }),
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
        membership: { role: "owner" },
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

jest.mock("../studio-invite-modal", () => ({ StudioInviteModal: () => null }));
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

beforeEach(() => {
  jest.clearAllMocks();
  agreementPartsOn = true;
  agreementLibraryOn = true;
});

const billingIsIntact = () => {
  expect(screen.getByText("Billing")).toBeInTheDocument();
  expect(screen.getByLabelText("Card fee (%)")).toBeInTheDocument();
  expect(screen.getByLabelText("Remit checks to")).toBeInTheDocument();
};

describe("Account · Studio · Agreement Library", () => {
  it("is on the page when both flags are on", () => {
    render(<AccountStudioPage />);
    expect(screen.getByText("Agreement Library")).toBeInTheDocument();
    expect(screen.getByText("Full-service residential")).toBeInTheDocument();
    billingIsIntact();
  });

  it("is absent when only agreement-parts is on", () => {
    agreementLibraryOn = false;
    render(<AccountStudioPage />);
    expect(screen.queryByText("Agreement Library")).not.toBeInTheDocument();
    // Wave 1's own card is unaffected — it reads the other flag.
    expect(screen.getByText("Agreement defaults")).toBeInTheDocument();
    billingIsIntact();
  });

  it("is absent when only agreement-library is on (fail-closed on the pair)", () => {
    agreementPartsOn = false;
    render(<AccountStudioPage />);
    expect(screen.queryByText("Agreement Library")).not.toBeInTheDocument();
    expect(screen.queryByText("Agreement defaults")).not.toBeInTheDocument();
    billingIsIntact();
  });

  it("is absent with both flags off, and the page is Wave 1's", () => {
    agreementPartsOn = false;
    agreementLibraryOn = false;
    render(<AccountStudioPage />);
    expect(screen.queryByText("Agreement Library")).not.toBeInTheDocument();
    billingIsIntact();
  });

  it("sits below Billing, and below Wave 1's defaults card", () => {
    render(<AccountStudioPage />);
    const billing = screen.getByText("Billing");
    const defaults = screen.getByText("Agreement defaults");
    const library = screen.getByText("Agreement Library");
    expect(
      billing.compareDocumentPosition(library) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      defaults.compareDocumentPosition(library) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
