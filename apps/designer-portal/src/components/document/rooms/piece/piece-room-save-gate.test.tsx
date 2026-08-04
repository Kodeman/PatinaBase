/**
 * W1-B — the Piece room always hands the configuration workspace a save handler.
 *
 * `PieceConfigurationWorkspace` reads a MISSING `onSaveConfiguration` as "this
 * host keeps no configuration record" — the picker's configure step relies on
 * exactly that, and places a piece from its server-confirmed resolution without
 * writing a `product_configurations` row. The Piece room is the opposite kind of
 * host: it is where the record is written. Passing `undefined` there when the
 * designer happens to be signed out would silently borrow the picker's meaning
 * and place a configured piece unconfigured. So the room always passes one, and
 * a signed-out save hits a wall it can read.
 */
import { act, render, screen } from "@testing-library/react";

let mockUser: { id: string } | null = { id: "user-1" };
const mockSaveConfiguration = jest.fn();

/** The last `onSaveConfiguration` the room handed the workspace. */
let capturedOnSave:
  | ((draft: unknown, current?: unknown) => Promise<unknown>)
  | undefined;

const configuredPiece = () => ({
  id: "piece-1",
  name: "Oak Writing Desk",
  brand: "Atelier Whitfield",
  layer: "personal",
  owner_user_id: "user-1",
  studio_id: null,
  status: "draft",
  configuration_mode: "variant",
  dimensions: { width: "48 in" },
  materials: ["white oak"],
  images: [],
  product_styles: [],
  category: null,
  description: null,
  short_description: null,
  price_retail: null,
  price_trade: null,
  patina_managed: false,
});

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@patina/supabase", () => ({
  useProduct: () => ({
    data: configuredPiece(),
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useUserWithRoles: () => ({ user: mockUser, isSuperAdmin: false }),
  useOrganizations: () => ({ data: [] }),
  useCaptureProduct: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCaptureFromUrl: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProductConfigurationDefinition: () => ({
    data: {
      productId: "piece-1",
      productName: "Oak Writing Desk",
      mode: "variant",
      pricingStrategy: "base_plus_adjustments",
      revision: 0,
      optionGroups: [],
      variants: [],
      components: [],
      rules: [],
    },
    isLoading: false,
  }),
  useProductConfiguration: () => ({ data: undefined, isLoading: false }),
  useSavedProductConfigurations: () => ({ data: [] }),
  useUpsertProductConfigurationDefinition: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useEvaluateProductConfiguration: () => ({
    mutateAsync: jest.fn().mockImplementation(() => new Promise(() => undefined)),
    isPending: false,
  }),
  useSaveProductConfiguration: () => ({
    mutateAsync: mockSaveConfiguration,
    isPending: false,
  }),
  useReviseProjectFFEConfiguration: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock("@/hooks/use-hydrated", () => ({ useHydrated: () => true }));
jest.mock("@patina/utils", () => ({ buildRefreshDiff: () => [] }));
jest.mock("@/hooks/use-piece-field", () => ({
  usePieceField: () => ({ save: jest.fn(), state: "idle", error: null }),
}));

// The workspace itself is exercised by its own suite. Here it is only a probe
// for the prop the room hands it.
jest.mock("./piece-configuration-workspace", () => ({
  PieceConfigurationWorkspace: (props: {
    onSaveConfiguration?: (draft: unknown, current?: unknown) => Promise<unknown>;
  }) => {
    capturedOnSave = props.onSaveConfiguration;
    return (
      <div data-testid="configuration-workspace">
        {props.onSaveConfiguration ? "saving host" : "no-save host"}
      </div>
    );
  },
}));

jest.mock("../../document-action", () => ({
  DocumentAction: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DocumentActionGroup: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock("../../mobile/mobile-shell", () => ({
  useMobilePrimaryAction: () => undefined,
}));
jest.mock("../room-shell", () => ({
  RoomShell: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/components/document/strata-mark", () => ({
  StrataMark: () => <span />,
}));
jest.mock("@/components/ui/strata-sweep", () => ({
  StrataSweep: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("./facet-field", () => {
  const Stub = () => <div />;
  return {
    FacetText: Stub,
    FacetTextarea: Stub,
    FacetNumber: Stub,
    FacetMoney: Stub,
    FacetSelect: Stub,
    FacetChips: Stub,
    FacetDimensions: Stub,
    FacetVendorContact: Stub,
    FacetVendorPicker: Stub,
  };
});
jest.mock("./piece-folio", () => ({ PieceFolio: () => <div /> }));
jest.mock("./add-to-project-sheet", () => ({ AddToProjectSheet: () => <div /> }));
jest.mock("./custom-commission-sheet", () => ({ CustomCommissionSheet: () => <div /> }));
jest.mock("../library/deep-analysis-sheet", () => ({ DeepAnalysisSheet: () => <div /> }));
jest.mock("@/components/products/promotion/promote-to-studio-modal", () => ({
  PromoteToStudioModal: () => <div />,
}));
jest.mock("@/components/products/nomination/nominate-to-catalog-modal", () => ({
  NominateToCatalogModal: () => <div />,
}));

// eslint-disable-next-line import/first
import { PieceRoom } from "./piece-room";

const DRAFT = {
  name: null,
  notes: null,
  customRequirements: null,
  selection: { values: {}, components: [] },
  comDetails: null,
};

describe("PieceRoom — the configuration save gate", () => {
  beforeEach(() => {
    capturedOnSave = undefined;
    mockSaveConfiguration.mockReset();
    mockSaveConfiguration.mockResolvedValue({
      configuration: { id: "config-1", version: 1 },
    });
  });

  afterEach(() => {
    mockUser = { id: "user-1" };
  });

  it("hands the workspace a save handler when the designer is signed in", async () => {
    render(<PieceRoom productId="piece-1" />);
    expect(screen.getByTestId("configuration-workspace")).toHaveTextContent(
      "saving host",
    );
    expect(typeof capturedOnSave).toBe("function");

    await act(async () => {
      await capturedOnSave!(DRAFT, null);
    });
    expect(mockSaveConfiguration).toHaveBeenCalled();
  });

  it("STILL hands one when signed out, and it refuses loudly", async () => {
    mockUser = null;
    render(<PieceRoom productId="piece-1" />);
    // Not "no-save host": the room never borrows the picker's semantics.
    expect(screen.getByTestId("configuration-workspace")).toHaveTextContent(
      "saving host",
    );
    expect(typeof capturedOnSave).toBe("function");

    await expect(capturedOnSave!(DRAFT, null)).rejects.toThrow(
      "Sign in to save configurations",
    );
    // The wall comes BEFORE the write, so nothing half-lands.
    expect(mockSaveConfiguration).not.toHaveBeenCalled();
  });
});
