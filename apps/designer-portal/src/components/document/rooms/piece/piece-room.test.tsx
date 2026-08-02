import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PieceRoom } from "./piece-room";

let mockProduct: Record<string, unknown>;

const editablePiece = () => ({
  id: "piece-1",
  name: "Oak Writing Desk",
  brand: "Atelier Whitfield",
  layer: "personal",
  owner_user_id: "user-1",
  studio_id: null,
  status: "draft",
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

jest.mock("@patina/supabase", () => ({
  useProduct: () => ({
    data: mockProduct,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useUserWithRoles: () => ({
    user: { id: "user-1" },
    isSuperAdmin: false,
  }),
  useOrganizations: () => ({ data: [] }),
  useCaptureProduct: () => ({
    mutateAsync: jest.fn().mockResolvedValue({ id: "copy-1" }),
    isPending: false,
  }),
  useCaptureFromUrl: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useProductConfigurationDefinition: () => ({
    data: {
      productId: "piece-1",
      productName: "Oak Writing Desk",
      mode: mockProduct.configuration_mode ?? "standard",
      pricingStrategy: "base_plus_adjustments",
      revision: 0,
      optionGroups: [],
      variants: [],
      components: [],
      rules: [],
    },
    isLoading: false,
  }),
  useSavedProductConfigurations: () => ({ data: [] }),
  useUpsertProductConfigurationDefinition: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useEvaluateProductConfiguration: () => ({
    mutateAsync: jest.fn().mockImplementation(() => {
      if (mockProduct.configuration_mode !== "custom") {
        return new Promise<never>(() => undefined);
      }
      return Promise.resolve({
        valid: true,
        complete: true,
        violations: [],
        warnings: [],
        normalizedSelection: {},
        componentQuantities: {},
        matchedVariant: null,
        retailPriceCents: null,
        tradePriceCents: null,
        leadTimeWeeks: null,
        dimensions: null,
        schemaRevision: 1,
        snapshot: {
          productId: "piece-1",
          productName: "Oak Writing Desk",
          configurationMode: mockProduct.configuration_mode ?? "standard",
          schemaRevision: 1,
          variant: null,
          selections: [],
          components: [],
          retailPriceCents: null,
          tradePriceCents: null,
          leadTimeWeeks: null,
          dimensions: null,
          capturedAt: "2026-08-02T12:00:00Z",
        },
      });
    }),
    isPending: false,
  }),
  useSaveProductConfiguration: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock("@/hooks/use-hydrated", () => ({
  useHydrated: () => true,
}));

jest.mock("@patina/utils", () => ({
  buildRefreshDiff: () => [],
}));

jest.mock("@/hooks/use-piece-field", () => ({
  usePieceField: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("../../document-action", () => ({
  DocumentAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  DocumentActionGroup: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("../../mobile/mobile-shell", () => ({
  useMobilePrimaryAction: jest.fn(),
}));

jest.mock("../room-shell", () => ({
  RoomShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/components/document/strata-mark", () => ({
  StrataMark: () => <span data-testid="strata-mark" />,
}));

jest.mock("@/components/ui/strata-sweep", () => ({
  StrataSweep: () => <span>Loading piece</span>,
}));

jest.mock("./facet-field", () => {
  const Field = ({ label = "Dimensions" }: { label?: string }) => (
    <div>{label}</div>
  );
  return {
    FacetText: Field,
    FacetTextarea: Field,
    FacetNumber: Field,
    FacetMoney: Field,
    FacetSelect: Field,
    FacetChips: Field,
    FacetDimensions: Field,
    FacetVendorContact: () => <div>Vendor contact</div>,
    FacetVendorPicker: Field,
  };
});

jest.mock("./piece-folio", () => ({
  PieceFolio: () => <div>Piece folio</div>,
}));

jest.mock("./add-to-project-sheet", () => ({
  AddToProjectSheet: () => null,
}));

jest.mock("./custom-commission-sheet", () => ({
  CustomCommissionSheet: ({
    initialConfigurationId,
  }: {
    initialConfigurationId?: string | null;
  }) => (
    <div data-testid="custom-commission-sheet">
      {initialConfigurationId ?? "new-commission"}
    </div>
  ),
}));

jest.mock("../library/deep-analysis-sheet", () => ({
  DeepAnalysisSheet: () => null,
}));

jest.mock("@/components/products/promotion/promote-to-studio-modal", () => ({
  PromoteToStudioModal: () => null,
}));

jest.mock("@/components/products/nomination/nominate-to-catalog-modal", () => ({
  NominateToCatalogModal: () => null,
}));

describe("PieceRoom quiet facets", () => {
  beforeEach(() => {
    mockProduct = editablePiece();
  });

  it("lands editable pieces on the first incomplete facet and keeps one open", async () => {
    render(<PieceRoom productId="piece-1" />);

    const identity = screen.getByRole("button", { name: /Identity/i });
    const story = screen.getByRole("button", { name: /The story/i });
    const commerce = screen.getByRole("button", { name: /Commerce/i });

    await waitFor(() => expect(story).toHaveAttribute("aria-expanded", "true"));
    expect(identity).toHaveAttribute("aria-expanded", "false");
    expect(
      screen
        .getAllByRole("button")
        .filter((button) => button.getAttribute("aria-expanded") === "true"),
    ).toHaveLength(1);

    fireEvent.click(commerce);

    expect(story).toHaveAttribute("aria-expanded", "false");
    expect(commerce).toHaveAttribute("aria-expanded", "true");
    expect(
      screen
        .getAllByRole("button")
        .filter((button) => button.getAttribute("aria-expanded") === "true"),
    ).toHaveLength(1);
  });

  it("keeps a read-only catalog piece as an expanded static specimen", () => {
    mockProduct = {
      ...editablePiece(),
      layer: "catalog",
      owner_user_id: null,
      status: "published",
      seo_title: "Oak Writing Desk",
    };

    render(<PieceRoom productId="piece-1" />);

    expect(
      screen.queryByRole("button", { name: /Identity/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Style & character/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Style & character")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("SEO title")).toBeInTheDocument();
  });

  it("opens the custom commission workshop as a new project record", async () => {
    mockProduct = {
      ...editablePiece(),
      configuration_mode: "custom",
    };

    render(<PieceRoom productId="piece-1" />);

    const start = await screen.findByRole("button", {
      name: "Start commission",
    });
    await waitFor(() => expect(start).toBeEnabled());
    await act(async () => {
      fireEvent.click(start);
    });

    expect(screen.getByTestId("custom-commission-sheet")).toHaveTextContent(
      "new-commission",
    );
  });
});
