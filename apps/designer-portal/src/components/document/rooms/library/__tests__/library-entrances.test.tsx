import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LibraryRoom } from "../library-room";
import { LibrarianBar } from "../librarian-bar";
import { LibraryToolbar, type LibraryShelfLens } from "../library-toolbar";
import type { LibraryCapabilityFilter } from "../library-configuration-summary";

const mockUseCrossLayerSearch = jest.fn();
let mockRenderer = "legacy";
const mockPush = jest.fn();

jest.mock("@patina/supabase", () => ({
  useLayerCounts: () => ({ data: { personal: 2, studio: 7, catalog: 31 } }),
  useTeachingQueue: () => ({ data: [] }),
  useValidationQueue: () => ({ data: [] }),
  useOrganizations: () => ({ data: [] }),
  useCrossLayerSearch: (options: unknown) => mockUseCrossLayerSearch(options),
}));

jest.mock("@/components/document/engine/engine-results", () => ({
  EngineResults: ({ query }: { query: string }) => (
    <div data-testid="engine-results">{query}</div>
  ),
}));

jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

const exactRow = {
  id: "piece-1",
  name: "Linnea Sideboard",
  brand: "Vërellen",
  price_retail: null,
  price_trade: null,
  images: null,
  source_url: null,
  status: "published",
  category: "casegoods",
  layer: "personal" as const,
  owner_user_id: "designer-1",
  studio_id: null,
  created_at: "2026-07-31T00:00:00.000Z",
};

afterEach(() => jest.useRealTimers());

describe("Library omnibox", () => {
  beforeEach(() => {
    mockUseCrossLayerSearch.mockReset();
    mockUseCrossLayerSearch.mockReturnValue({
      data: {
        rows: [exactRow],
        byLayer: { personal: [exactRow], studio: [], catalog: [] },
      },
      isLoading: false,
      isError: false,
    });
  });

  it("uses one search control for debounced exact matches and explicit Engine asks", () => {
    jest.useFakeTimers();
    render(<LibrarianBar />);

    const searchboxes = screen.getAllByRole("searchbox");
    expect(searchboxes).toHaveLength(1);
    const omnibox = searchboxes[0];

    fireEvent.change(omnibox, { target: { value: "white oak console" } });
    act(() => jest.advanceTimersByTime(220));
    expect(mockUseCrossLayerSearch).toHaveBeenLastCalledWith({
      query: "white oak console",
    });
    expect(
      screen.getByRole("link", { name: /Linnea Sideboard/ }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("engine-results")).not.toBeInTheDocument();

    fireEvent.submit(omnibox.closest("form") as HTMLFormElement);
    expect(screen.getByTestId("engine-results")).toHaveTextContent(
      "white oak console",
    );

    fireEvent.change(omnibox, { target: { value: "walnut cabinet" } });
    expect(screen.queryByTestId("engine-results")).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(220));
    expect(mockUseCrossLayerSearch).toHaveBeenLastCalledWith({
      query: "walnut cabinet",
    });

    fireEvent.click(screen.getByRole("button", { name: "Ask a sourcing question" }));
    expect(screen.getByTestId("engine-results")).toHaveTextContent(
      "walnut cabinet",
    );
  });
});

function ToolbarHarness({
  onCompose,
  onImport,
  personalCount = 2,
}: {
  onCompose: () => void;
  onImport: () => void;
  personalCount?: number;
}) {
  const [active, setActive] = useState<LibraryShelfLens>("personal");
  const [capability, setCapability] = useState<LibraryCapabilityFilter>("all");
  return (
    <>
      <LibraryToolbar
        activeLayer={active}
        counts={{ personal: personalCount, studio: 7, catalog: 31 }}
        onLayerChange={setActive}
        onCompose={onCompose}
        onImport={onImport}
        activeCapability={capability}
        onCapabilityChange={setCapability}
      />
      <section
        id="library-shelf-panel"
        role="tabpanel"
        aria-labelledby={`library-lens-${active}`}
      >
        {active}
      </section>
      <output data-testid="active-capability">{capability}</output>
    </>
  );
}

describe("Library lens and Add disclosure", () => {
  it("shows one active counted shelf lens and supports arrow-key selection", async () => {
    render(<ToolbarHarness onCompose={jest.fn()} onImport={jest.fn()} />);

    const mine = screen.getByRole("tab", { name: "Personal, 2 products" });
    const studio = screen.getByRole("tab", { name: "Studio, 7 products" });
    const panel = screen.getByRole("tabpanel");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(panel).toHaveAttribute("id", "library-shelf-panel");
    expect(mine).toHaveAttribute("aria-controls", panel.id);
    expect(studio).toHaveAttribute("aria-controls", panel.id);
    expect(mine).toHaveAttribute("aria-selected", "true");
    expect(panel).toHaveTextContent("personal");

    fireEvent.click(studio);
    expect(studio).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("studio");

    fireEvent.keyDown(studio, { key: "ArrowRight" });
    const patina = screen.getByRole("tab", { name: "Patina catalog, 31 products" });
    expect(patina).toHaveAttribute("aria-controls", panel.id);
    expect(patina).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(patina).toHaveFocus());
  });

  it("uses singular product in the accessible name for one result", () => {
    render(
      <ToolbarHarness
        onCompose={jest.fn()}
        onImport={jest.fn()}
        personalCount={1}
      />,
    );

    expect(screen.getByRole("tab", { name: "Personal, 1 product" })).toBeInTheDocument();
  });

  it("routes Compose and Import through one disclosure with quiet dismissal", async () => {
    const onCompose = jest.fn();
    const onImport = jest.fn();
    render(<ToolbarHarness onCompose={onCompose} onImport={onImport} />);

    const trigger = screen.getByRole("button", { name: "Add to library" });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("region", { name: "Add to Library options" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create a product record" }),
      ).toHaveFocus(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Create a product record" }));
    expect(onCompose).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("region", { name: "Add to Library options" }),
    ).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Import product list" }));
    expect(onImport).toHaveBeenCalledTimes(1);

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("button", { name: "Create a product record" }), {
      key: "Escape",
    });
    expect(
      screen.queryByRole("region", { name: "Add to Library options" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole("region", { name: "Add to Library options" }),
    ).not.toBeInTheDocument();
  });

  it("filters the family shelf by honest configuration capability", () => {
    render(<ToolbarHarness onCompose={jest.fn()} onImport={jest.fn()} />);

    const all = screen.getByRole("button", { name: "All products" });
    const modular = screen.getByRole("button", { name: "Modular" });
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("active-capability")).toHaveTextContent("all");

    fireEvent.click(modular);

    expect(modular).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("active-capability")).toHaveTextContent(
      "modular",
    );
  });
});


jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), useSearchParams: () => new URLSearchParams(window.location.search) }));
jest.mock('@/hooks/use-paper-renderer', () => ({ usePaperRenderer: () => ({ renderer: mockRenderer }) }));
jest.mock('@/lib/help-system/use-document-surface', () => ({ useDocumentSurface: jest.fn() }));
jest.mock('../../../mobile/mobile-shell', () => ({ useMobilePrimaryAction: jest.fn() }));
jest.mock('../../room-shell', () => ({
  RoomShell: ({ heading, title, action, children }: { heading?: React.ReactNode; title: string; action: React.ReactNode; children: React.ReactNode }) => <main>{heading ?? <h1>{title}</h1>}{action}{children}</main>,
}));
jest.mock('../library-shelf', () => ({ LibraryShelf: () => <div data-testid="native-shelf" /> }));
jest.mock('../capture-extension-prompt', () => ({ CaptureExtensionPrompt: () => null }));
jest.mock('../capture-sheet', () => ({ CaptureSheet: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="Capture a product" /> : null }));
jest.mock('../import-sheet', () => ({ ImportSheet: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="Import product list" /> : null }));
jest.mock('../deep-analysis-sheet', () => ({ DeepAnalysisSheet: () => null }));
jest.mock('@/components/products/promotion/promote-to-studio-modal', () => ({ PromoteToStudioModal: () => null }));
jest.mock('@/components/products/nomination/nominate-to-catalog-modal', () => ({ NominateToCatalogModal: () => null }));

describe('Library renderer boundary', () => {
  it.each(['legacy', 'pending'])('keeps the existing room while renderer is %s', (renderer) => {
    mockRenderer = renderer;
    const { container } = render(<LibraryRoom />);
    expect(screen.getByRole('heading', { name: 'Resource library' })).toBeInTheDocument();
    expect(container.querySelector('[data-paper-renderer="round8"]')).toBeNull();
    expect(screen.queryByText(/Reference prices and lead times/)).not.toBeInTheDocument();
  });

  it('loads scoped editorial paper with every existing shelf, type, capture, import and compose entrance', async () => {
    mockRenderer = 'round8';
    const { container } = render(<LibraryRoom />);
    const heading = await screen.findByRole('heading', { name: 'A library with a point of view.' });
    expect(heading.closest('[data-library-room]')).toHaveAttribute('data-paper-renderer', 'round8');
    expect(heading.closest('.r8-library-intro')).not.toBeNull();
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByText(/Personal captures, not yet reviewed/)).toBeInTheDocument();
    expect(screen.getByText(/does not approve it, reserve stock or authorize a purchase/)).toHaveClass('r8-library-note');
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Custom commissions' })).toBeInTheDocument();
    expect(screen.getByTestId('native-shelf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Capture/ }));
    expect(screen.getByRole('dialog', { name: 'Capture a product' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add to library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import product list' }));
    expect(screen.getByRole('dialog', { name: 'Import product list' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add to library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create a product record' }));
    expect(mockPush).toHaveBeenCalledWith('/compose');
  });
});


describe("Library address ownership", () => {
  beforeEach(() => {
    mockRenderer = "legacy";
    mockUseCrossLayerSearch.mockReturnValue({ data: { rows: [], byLayer: { personal: [], studio: [], catalog: [] } }, isLoading: false, isError: false });
    window.history.replaceState({}, "", "/library?shelf=studio&capability=modular&q=oak%20linen");
  });
  afterEach(() => window.history.replaceState({}, "", "/library"));
  it("reads the shelf capability and omnibox query from a returning URL", () => {
    render(<LibraryRoom />);
    expect(screen.getByRole("tab", { name: "Studio, 7 products" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Modular" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("searchbox")).toHaveValue("oak linen");
  });
  it("replaces the current entry for filter and query edits without history spam", () => {
    const length = history.length;
    render(<LibraryRoom />);
    fireEvent.click(screen.getByRole("tab", { name: "Personal, 2 products" }));
    expect(new URLSearchParams(location.search).get("shelf")).toBe("personal");
    fireEvent.click(screen.getByRole("button", { name: "Variants" }));
    expect(new URLSearchParams(location.search).get("capability")).toBe("variant");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "walnut & oak" } });
    expect(new URLSearchParams(location.search).get("q")).toBe("walnut & oak");
    expect(history.length).toBe(length);
  });
});
