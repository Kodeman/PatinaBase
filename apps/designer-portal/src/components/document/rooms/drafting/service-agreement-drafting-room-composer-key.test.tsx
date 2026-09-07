/**
 * The composer's mount identity, flag ON.
 *
 * `agreement-parts` is fail-closed and every OTHER case in this directory is a
 * flag-off case (see `service-agreement-drafting-room.test.tsx`, which mocks
 * the flag to `false` at module scope). `jest.mock` is module-scoped, so the
 * flag-on branch needs its own file.
 *
 * The one thing asserted here is the remount key. `upsert_agreement_parts`
 * projects through `_project_agreement_terms`, whose upsert ends
 * `updated_at = now()`, so a key built from `terms.updatedAt` (or from
 * `parts.length`, which a save can also change) changed on EVERY save — the
 * composer unmounted, and the designer lost her place and her save note.
 */

import { render, screen } from "@testing-library/react";
import { ServiceAgreementDraftingRoom } from "./service-agreement-drafting-room";

let mockMountCount = 0;

const bundle = (
  terms: { updatedAt: string } | null,
  partCount: number,
) => ({
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
  terms,
  rates: [],
  signatures: [],
  parts: Array.from({ length: partCount }, (_, index) => ({
    id: `part-${index + 1}`,
    proposalId: "agreement-1",
    position: index + 1,
    kind: "clause" as const,
    variant: null,
    partKey: `patina.part-${index + 1}`,
    title: `Part ${index + 1}`,
    payload: {},
    required: false,
    clientVisible: true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
  })),
});

let mockBundle = bundle(null, 3);

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("../room-shell", () => ({
  RoomShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("../../overlays/doc-sheet", () => ({ DocSheet: () => null }));
jest.mock("../../document-action", () => ({ DocumentAction: () => null }));

jest.mock("@/hooks/use-attach-client", () => ({
  useAttachDocumentClient: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "designer-1" }, status: "authenticated" }),
}));

jest.mock("@/hooks/use-clients", () => ({
  useClients: () => ({ isLoading: false, data: [] }),
  useAddClient: () => ({ mutateAsync: jest.fn() }),
  useInviteAndLinkClient: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/hooks/use-commercial-documents", () => ({
  useCommercialDocument: () => ({
    isLoading: false,
    error: null,
    data: mockBundle,
  }),
  useSaveServiceAgreement: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock("../../commercial/service-agreement-preview", () => ({
  ServiceAgreementPreview: () => null,
}));

jest.mock("../../commercial/service-agreement-send-sheet", () => ({
  ServiceAgreementSendSheet: () => null,
}));

jest.mock("@/lib/document/room-origin", () => ({
  readRoomOrigin: () => "/desk",
  clearRoomOrigin: jest.fn(),
}));

jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: () => ({ value: true, isLoading: false }),
}));

// The composer counts its own mounts. React remounts a child whose `key`
// changes, so a stable count across a bundle change IS the stable-key proof.
jest.mock("./agreement/agreement-composer", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    AgreementComposer: () => {
      React.useEffect(() => {
        mockMountCount += 1;
      }, []);
      return <div data-testid="composer">Composer</div>;
    },
  };
});

const proposal = {
  id: "agreement-1",
  designer_id: "designer-1",
  client_id: null,
  description: "Seeded from Discovery",
  client: null,
};

describe("ServiceAgreementDraftingRoom · composer mount identity", () => {
  beforeEach(() => {
    mockMountCount = 0;
    mockBundle = bundle(null, 3);
  });

  it("mounts the composer once per agreement, whatever a save does to the bundle", () => {
    const { rerender } = render(
      <ServiceAgreementDraftingRoom proposal={proposal} />,
    );
    expect(screen.getByTestId("composer")).toBeInTheDocument();
    expect(mockMountCount).toBe(1);

    // Exactly what a save produces: a fresh terms.updatedAt, and a part count
    // that moved because the designer added one.
    mockBundle = bundle({ updatedAt: "2026-09-06T12:00:00.000Z" }, 4);
    rerender(<ServiceAgreementDraftingRoom proposal={proposal} />);
    expect(mockMountCount).toBe(1);

    // And a second save, which changes updatedAt again while the count holds.
    mockBundle = bundle({ updatedAt: "2026-09-06T12:05:00.000Z" }, 4);
    rerender(<ServiceAgreementDraftingRoom proposal={proposal} />);
    expect(mockMountCount).toBe(1);
  });
});
