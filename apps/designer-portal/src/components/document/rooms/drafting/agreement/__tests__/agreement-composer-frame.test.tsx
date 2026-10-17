/**
 * SQ-1211 — the drafting room's paper column is the composer's spotlight
 * frame. The composer renders its own RoomShell, so this suite renders the
 * real shell and the real DocumentAction: the held Send resolves that frame,
 * and its press opens the hold's window there and says why (R186).
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AgreementPart } from "@patina/types";
import { AgreementComposer } from "../agreement-composer";
import type { CommercialDocumentBundle } from "@/hooks/use-commercial-documents";

jest.mock("@/hooks/use-teaching-note", () => ({
  useTeachingNoteFor: () => ({ note: null, bind: null }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock("@/lib/help-system/open-help", () => ({ openHelp: jest.fn() }));
jest.mock("../../../../overlays/doc-sheet", () => ({
  DocSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
}));
jest.mock("@/components/portal/client-picker", () => ({
  ClientPicker: () => <div data-testid="client-picker" />,
}));
jest.mock("@/hooks/use-attach-client", () => ({
  useAttachDocumentClient: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "designer-1" }, status: "authenticated" }),
}));
jest.mock("@/hooks/use-clients", () => ({
  useClients: () => ({ isLoading: false, data: [] }),
}));
jest.mock("@patina/supabase", () => ({
  useStudioLicenseAttestation: () => ({ data: null, isLoading: false }),
  licenseAttestationIsLive: () => false,
  useAgreementJurisdictionNotices: () => ({ data: [], isLoading: false }),
  useAgreementDraws: () => ({ data: [], isLoading: false }),
  useSaveAgreementParts: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useMaterializeStandardParts: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDiscardAgreementParts: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAgreementStudioContext: () => ({ data: null }),
  useAgreementParts: () => ({ data: [], refetch: jest.fn() }),
  useMaterializeAgreementTemplate: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAgreementTemplates: () => ({ data: [], isLoading: false }),
  useStudioAgreementParts: () => ({ data: [], isLoading: false }),
  useSaveAgreementAsTemplate: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSaveAgreementPart: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAgreementPartEvents: () => ({ data: [], isLoading: false }),
}));
jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));
jest.mock("../../../../commercial/service-agreement-preview", () => ({
  ServiceAgreementPreview: () => <div>Agreement preview</div>,
}));
jest.mock("../../../../commercial/service-agreement-send-sheet", () => ({
  ServiceAgreementSendSheet: () => null,
}));

const proposal = {
  id: "agreement-1",
  designer_id: "designer-1",
  client_id: null,
  client: { email: "okafor@example.com", full_name: "Ada Okafor" },
};

function bundleWith(parts: AgreementPart[]): CommercialDocumentBundle {
  return {
    document: {
      id: "agreement-1",
      projectId: null,
      kind: "design_services",
      state: "draft",
      title: "Okafor design agreement",
      version: 1,
      waveName: null,
      sentAt: null,
      executedAt: null,
      supersededAt: null,
      replacementProposalId: null,
    },
    terms: null,
    rates: [],
    signatures: [],
    parts,
  };
}

describe("AgreementComposer · the drafting room's spotlight frame (SQ-1211)", () => {
  it("holds Send inside the Room's paper column and still says why on a press", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    render(<AgreementComposer proposal={proposal} bundle={bundleWith([])} />);

    const send = screen.getByRole("button", { name: /^Send the agreement/, hidden: true });
    expect(send).toHaveAttribute("aria-disabled", "true");

    // What frameOf resolves: the nearest frame, with no fixed layer between.
    const frame = send.closest<HTMLElement>("[data-spotlight-frame]");
    expect(frame).not.toBeNull();
    expect(frame!.querySelector("[data-room-header-line]")).toBeNull();
    for (let el = send.parentElement; el && el !== frame; el = el.parentElement) {
      expect(window.getComputedStyle(el).position).not.toBe("fixed");
    }

    // A missing fee is a listed hold whose fixer, the seam's + Add a part,
    // is in the frame: the press opens its window there, the fixer stays
    // live, and the spotlight says why in the blocker's words. The
    // never-silent fallback stands aside.
    const blocker = document.getElementById(send.getAttribute("aria-describedby")!)!;
    // K3: the reason stands visible before any press.
    expect(
      screen.getByText("This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee."),
    ).toBeVisible();
    fireEvent.click(send);
    await waitFor(() =>
      expect(
        Array.from(frame!.querySelectorAll("[data-hold-spotlight-window]")).map((el) =>
          el.getAttribute("data-hold-spotlight-window"),
        ),
      ).toEqual(["add-a-part"]),
    );
    const seam = within(frame!).getAllByRole("button", { name: "+ Add a part", hidden: true })[0]!;
    expect(seam.closest("[inert]")).toBeNull();
    expect(frame!.querySelector(".hold-spotlight__reason")).toHaveTextContent(blocker.textContent!);
    expect(frame!.querySelector("[data-hold-spotlight-root] [role='status']")).toHaveTextContent(
      `1 thing needs attention: ${blocker.textContent}`,
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
