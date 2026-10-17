import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { HoldSpotlight } from "../hold-spotlight";
import { topActiveModalDialog } from "../active-dialog";
import { focusableWithin } from "@/lib/full-screen-boundary";
import { useHoldSpotlight } from "@/lib/document/spotlight/use-hold-spotlight";
import type { SpotlightHold } from "@/lib/document/spotlight/use-hold-spotlight";

jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

type Item = { id: string; label: string; reason: string };

const CLIENT: Item = {
  id: "client",
  label: "No client linked",
  reason: "Link a client before drafting this invoice.",
};
const PRICE: Item = {
  id: "price",
  label: "No client price",
  reason: "Set a client price for the walnut table.",
};
const STUDIO: Item = {
  id: "studio",
  label: "No studio named",
  reason: "Name the studio this invoice bills from.",
};

function Harness({
  items,
  fixed = [],
  onParentEsc,
}: {
  items: Item[];
  /** Holds whose target has unmounted: fixed in place, still in the list. */
  fixed?: string[];
  onParentEsc?: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const targets = useRef<Record<string, HTMLElement | null>>({});
  const holds: SpotlightHold[] = items.map((item) => ({
    ...item,
    target: () => targets.current[item.id] ?? null,
    fix: <button type="button">Fix {item.id}</button>,
  }));
  const spotlight = useHoldSpotlight(holds);

  // The host sheet's own Esc, as DocSheet wires it: a bubble-phase document listener.
  useEffect(() => {
    if (!onParentEsc) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onParentEsc();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onParentEsc]);

  return (
    <div>
      <button type="button">Outside the frame</button>
      <div ref={frame} data-testid="frame">
        <header data-testid="head">
          <button type="button">Put back</button>
        </header>
        <section data-testid="already-inert" inert>
          <button type="button">Long since inert</button>
        </section>
        {items
          .filter((item) => !fixed.includes(item.id))
          .map((item) => (
            <div
              key={item.id}
              data-testid={`target-${item.id}`}
              ref={(el) => {
                targets.current[item.id] = el;
              }}
            >
              <input aria-label={`Field ${item.id}`} />
            </div>
          ))}
        <p data-testid="between">Totals</p>
        <button
          type="button"
          onClick={(event) => spotlight.open(event.currentTarget)}
        >
          Draft the invoice
        </button>
      </div>
      <HoldSpotlight frame={frame} {...spotlight.props} />
    </div>
  );
}

const layer = () =>
  document.querySelector<HTMLElement>("[data-hold-spotlight]");
const windows = () =>
  Array.from(document.querySelectorAll("[data-hold-spotlight-window]"));
const status = () => screen.getByRole("status");

function openWith(items: Item[], onParentEsc?: () => void) {
  const view = render(<Harness items={items} onParentEsc={onParentEsc} />);
  fireEvent.click(screen.getByRole("button", { name: "Draft the invoice" }));
  return view;
}

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

beforeEach(() => mockReducedMotion(false));

describe("HoldSpotlight", () => {
  it("renders one window per hold, inside the frame and never at body level (K2)", () => {
    openWith([CLIENT, PRICE, STUDIO]);
    expect(
      windows().map((el) => el.getAttribute("data-hold-spotlight-window")),
    ).toEqual(["client", "price", "studio"]);
    const frame = screen.getByTestId("frame");
    expect(frame.contains(layer())).toBe(true);
    expect(
      Array.from(document.body.children).some((el) =>
        el.matches("[data-hold-spotlight-root]"),
      ),
    ).toBe(false);
    expect(topActiveModalDialog()).toBe(layer());
  });

  it("inerts the frame outside the windows and restores exactly, keeping pre-existing inert", () => {
    openWith([CLIENT, PRICE]);
    expect(screen.getByTestId("head")).toHaveAttribute("inert");
    expect(screen.getByTestId("between")).toHaveAttribute("inert");
    expect(
      screen.getByRole("button", { name: "Draft the invoice", hidden: true }),
    ).toHaveAttribute("inert");
    expect(screen.getByTestId("target-client")).not.toHaveAttribute("inert");
    expect(screen.getByTestId("target-price")).not.toHaveAttribute("inert");
    // Body-level nodes outside the frame stay live for the z-65/z-70 popovers.
    expect(
      screen
        .getByRole("button", { name: "Outside the frame" })
        .closest("[inert]"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(layer()).toBeNull();
    expect(screen.getByTestId("head")).not.toHaveAttribute("inert");
    expect(screen.getByTestId("between")).not.toHaveAttribute("inert");
    expect(
      screen.getByRole("button", { name: "Draft the invoice" }),
    ).not.toHaveAttribute("inert");
    expect(screen.getByTestId("already-inert")).toHaveAttribute("inert");
  });

  it("keeps Tab within the windows and the bar", () => {
    openWith([CLIENT, PRICE]);
    const frame = screen.getByTestId("frame");
    const reachable = focusableWithin(frame).map(
      (el) => el.getAttribute("aria-label") ?? el.textContent,
    );
    expect(reachable).toEqual([
      "Field client",
      "Field price",
      "Fix client",
      "Next",
      "Close",
    ]);

    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByLabelText("Field client"));
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);
  });

  it("closes on Esc in the capture phase so the host sheet never sees it", () => {
    const parentEsc = jest.fn();
    openWith([CLIENT, PRICE], parentEsc);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(layer()).toBeNull();
    expect(parentEsc).not.toHaveBeenCalled();
    // With the spotlight gone, the host's Esc is live again.
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(parentEsc).toHaveBeenCalledTimes(1);
  });

  it("drops a window when its target goes, and closes itself on the last", async () => {
    const view = openWith([CLIENT, PRICE]);
    expect(windows()).toHaveLength(2);

    view.rerender(<Harness items={[CLIENT, PRICE]} fixed={["client"]} />);
    await waitFor(() => expect(windows()).toHaveLength(1));
    expect(windows()[0]).toHaveAttribute("data-hold-spotlight-window", "price");
    expect(status()).toHaveTextContent(`1 thing needs attention: ${PRICE.reason}`);

    view.rerender(
      <Harness items={[CLIENT, PRICE]} fixed={["client", "price"]} />,
    );
    await waitFor(() => expect(layer()).toBeNull());
    expect(status()).toHaveTextContent("All set.");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Draft the invoice" }),
    );
  });

  it("returns focus to the act that opened it", () => {
    openWith([CLIENT]);
    const opener = screen.getByRole("button", {
      name: "Draft the invoice",
      hidden: true,
    });
    expect(document.activeElement).toBe(screen.getByLabelText("Field client"));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    expect(document.activeElement).toBe(opener);
  });

  it("speaks through a role=status line outside the inert subtree", () => {
    openWith([CLIENT, PRICE]);
    expect(status()).toHaveTextContent(
      `2 things need attention. First: ${CLIENT.reason}`,
    );
    expect(status().closest("[inert]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(status()).toHaveTextContent(`2 of 2: ${PRICE.reason}`);
    expect(windows()[1]).toHaveAttribute("data-active");
  });

  it("writes no transition at all under reduced motion", () => {
    mockReducedMotion(true);
    const reducedView = openWith([CLIENT, PRICE]);
    expect(layer()!.outerHTML).not.toMatch(/transition/);
    reducedView.unmount();

    // The other branch does write one, so the assertion above can fail.
    mockReducedMotion(false);
    openWith([CLIENT, PRICE]);
    expect(layer()!.outerHTML).toMatch(/transition/);
  });

  it("emits no shadow, blur or opacity, in the markup or its stylesheet block (D4)", () => {
    openWith([CLIENT, PRICE]);
    const banned = /opacity|box.?shadow|drop.?shadow|blur\(/i;
    expect(layer()!.outerHTML).not.toMatch(banned);

    const css = readFileSync(
      join(__dirname, "../../../../app/globals.css"),
      "utf8",
    );
    const block = css.slice(
      css.indexOf("US-36 K1/K2"),
      css.indexOf("end US-36 hold spotlight"),
    );
    expect(block).toContain(".hold-spotlight__fill { fill: var(--veil); }");
    expect(block.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(banned);
  });
});

describe("HoldSpotlight when its frame unmounts while open", () => {
  function DetachHarness({
    showFrame,
    onClose,
  }: {
    showFrame: boolean;
    onClose: () => void;
  }) {
    const frame = useRef<HTMLDivElement>(null);
    const target = useRef<HTMLButtonElement>(null);
    // Stable holds, as a memoizing owner passes them: no [holds] re-sync on rerender.
    const holds = useRef<SpotlightHold[]>([
      {
        ...CLIENT,
        target: () => target.current,
        fix: <button type="button">Fix client</button>,
      },
    ]).current;
    return (
      <div>
        {showFrame ? (
          <div ref={frame} data-testid="frame">
            <button ref={target} type="button">
              Link a client
            </button>
          </div>
        ) : null}
        <HoldSpotlight frame={frame} holds={holds} open onClose={onClose} />
      </div>
    );
  }

  it("closes once and stops listening for Esc", async () => {
    const onClose = jest.fn();
    const view = render(<DetachHarness showFrame onClose={onClose} />);
    await waitFor(() => expect(topActiveModalDialog()).not.toBeNull());
    view.rerender(<DetachHarness showFrame={false} onClose={onClose} />);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// jsdom lays nothing out, so these mock the frame's rect and the bar's
// height, and read the top the spotlight writes on the bar (in the layer's
// own coordinates, which start at the frame's top).
describe("HoldSpotlight bar placement", () => {
  const CHROME = 72;
  const BAR = 60;
  const VIEW = window.innerHeight;
  let frameRect = { top: 0, bottom: 0 };
  let hit: () => Element | null = () => null;

  function DockHarness({ frameStyle }: { frameStyle: CSSProperties }) {
    const frame = useRef<HTMLDivElement>(null);
    const target = useRef<HTMLButtonElement>(null);
    const holds = useRef<SpotlightHold[]>([
      { ...CLIENT, target: () => target.current },
    ]).current;
    return (
      <div>
        <div ref={frame} data-testid="frame" style={frameStyle}>
          <button ref={target} type="button">
            Link a client
          </button>
        </div>
        <nav data-testid="drawer" style={{ position: "fixed", bottom: 0 }}>
          Studio
        </nav>
        <HoldSpotlight frame={frame} holds={holds} open onClose={jest.fn()} />
      </div>
    );
  }

  /** A folio sheet: a page-high overlay that scrolls, its fixed backdrop beside the panel. */
  function FolioHarness() {
    const frame = useRef<HTMLDivElement>(null);
    const target = useRef<HTMLButtonElement>(null);
    const holds = useRef<SpotlightHold[]>([
      { ...CLIENT, target: () => target.current },
    ]).current;
    return (
      <div style={{ position: "fixed", inset: 0, overflowY: "auto" }}>
        <button
          type="button"
          data-testid="backdrop"
          aria-label="Close sheet"
          style={{ position: "fixed", inset: 0 }}
        />
        <div ref={frame} data-testid="frame" style={{ position: "relative" }}>
          <button ref={target} type="button">
            Link a client
          </button>
        </div>
        <HoldSpotlight frame={frame} holds={holds} open onClose={jest.fn()} />
      </div>
    );
  }

  const mockNarrow = (narrow: boolean) => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: narrow && query.includes("max-width: 640px"),
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  };

  beforeEach(() => {
    frameRect = { top: 0, bottom: 0 };
    hit = () => screen.queryByTestId("drawer");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => hit(),
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute("data-hold-spotlight-bar") ? BAR : 0;
      },
    });
    jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const { top, bottom } =
          this.dataset.testid === "frame"
            ? frameRect
            : this.dataset.testid === "drawer"
              ? { top: VIEW - CHROME, bottom: VIEW }
              : { top: 0, bottom: 0 };
        return {
          top,
          bottom,
          left: 0,
          right: 0,
          width: 0,
          height: bottom - top,
          x: 0,
          y: top,
          toJSON: () => ({}),
        } as DOMRect;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    delete (HTMLElement.prototype as { offsetHeight?: unknown }).offsetHeight;
  });

  const barTop = () => {
    const bar = document.querySelector<HTMLElement>("[data-hold-spotlight-bar]");
    return bar?.style.top ? Number.parseFloat(bar.style.top) : null;
  };

  it("keeps the bar on screen in a folio sheet taller than the viewport, scrolled past its top", async () => {
    // The panel runs from 1200px above the viewport to 900px below it; the
    // point at the viewport's foot lands on the sheet's own fixed backdrop.
    frameRect = { top: -1200, bottom: VIEW + 900 };
    hit = () => screen.queryByTestId("backdrop");
    render(<FolioHarness />);
    // At the viewport's foot, less the gap: (VIEW - 16 - BAR) on screen,
    // written from the frame's top.
    await waitFor(() => expect(barTop()).toBe(VIEW - 16 - BAR + 1200));
  });

  it("clamps the bar to the frame's visible foot when the frame ends on screen", async () => {
    frameRect = { top: -1200, bottom: 500 };
    hit = () => screen.queryByTestId("backdrop");
    render(<FolioHarness />);
    await waitFor(() => expect(barTop()).toBe(500 - 16 - BAR + 1200));
  });

  it("re-places the bar as the page scrolls", async () => {
    frameRect = { top: -1200, bottom: VIEW + 900 };
    hit = () => screen.queryByTestId("backdrop");
    render(<FolioHarness />);
    await waitFor(() => expect(barTop()).toBe(VIEW - 16 - BAR + 1200));
    frameRect = { top: -300, bottom: VIEW + 1800 };
    fireEvent.scroll(window);
    await waitFor(() => expect(barTop()).toBe(VIEW - 16 - BAR + 300));
  });

  it("docks the bar to the viewport's foot on a phone (≤640px), though the frame ends higher", async () => {
    mockNarrow(true);
    frameRect = { top: 40, bottom: 400 };
    hit = () => screen.queryByTestId("backdrop");
    render(<FolioHarness />);
    await waitFor(() => expect(barTop()).toBe(VIEW - BAR - 40));
  });

  it("docks above the fixed foot chrome on a frame that scrolls with the page, ignoring its landing reserve", async () => {
    frameRect = { top: -400, bottom: VIEW + 2000 };
    render(<DockHarness frameStyle={{ paddingBottom: "640px" }} />);
    await waitFor(() => expect(barTop()).toBe(VIEW - CHROME - 16 - BAR + 400));
  });

  it("docks to the frame's own foot inside a scrolling sheet panel, on a phone too", async () => {
    mockNarrow(true);
    frameRect = { top: 24, bottom: VIEW - 24 };
    hit = () => null;
    render(
      <DockHarness frameStyle={{ paddingBottom: "24px", overflowY: "auto" }} />,
    );
    await waitFor(() => expect(barTop()).toBe(VIEW - 24 - BAR - 24));
  });

  it("does not dock above the fixed overlay that holds the frame (the PO preview)", async () => {
    function OverlayHarness() {
      const frame = useRef<HTMLDivElement>(null);
      const target = useRef<HTMLButtonElement>(null);
      const holds = useRef<SpotlightHold[]>([
        { ...CLIENT, target: () => target.current },
      ]).current;
      return (
        <div style={{ position: "fixed", inset: 0 }}>
          <button
            type="button"
            data-testid="backdrop"
            aria-label="Close"
            style={{ position: "absolute", inset: 0 }}
          />
          <div
            ref={frame}
            data-testid="frame"
            style={{ position: "absolute", top: "4vh" }}
          >
            <button ref={target} type="button">
              Link a client
            </button>
          </div>
          <HoldSpotlight frame={frame} holds={holds} open onClose={jest.fn()} />
        </div>
      );
    }
    frameRect = { top: 30, bottom: VIEW + 500 };
    hit = () => screen.queryByTestId("backdrop");
    render(<OverlayHarness />);
    await waitFor(() => expect(barTop()).toBe(VIEW - 16 - BAR - 30));
  });
});

describe("HoldSpotlight as its holds are fixed and stepped", () => {
  /**
   * Each hold's window is a region with a one-shot fix button. A `cleared`
   * hold leaves the list and its fix button goes, as a fix that takes its own
   * control away does, while its region stays on the page. `nested` puts the
   * second hold's region inside the third's.
   */
  function StepHarness({
    items,
    cleared = [],
    nested = false,
  }: {
    items: Item[];
    cleared?: string[];
    nested?: boolean;
  }) {
    const frame = useRef<HTMLDivElement>(null);
    const holds: SpotlightHold[] = items
      .filter((item) => !cleared.includes(item.id))
      .map((item) => ({
        ...item,
        target: () => document.querySelector<HTMLElement>(`[data-region="${item.id}"]`),
      }));
    const spotlight = useHoldSpotlight(holds);
    const region = (item: Item, inner?: ReactNode) => (
      <div key={item.id} data-region={item.id}>
        {inner}
        {!cleared.includes(item.id) && <button type="button">Fix {item.id}</button>}
      </div>
    );
    const [a, b, c] = items;
    return (
      <div>
        <div ref={frame} data-testid="frame">
          {nested && a && b && c
            ? [region(a), region(c, region(b))]
            : items.map((item) => region(item))}
          <button
            type="button"
            onClick={(event) => spotlight.open(event.currentTarget)}
          >
            Draft the invoice
          </button>
        </div>
        <HoldSpotlight frame={frame} {...spotlight.props} />
      </div>
    );
  }

  const activeWindow = () =>
    document
      .querySelector("[data-hold-spotlight-window][data-active]")
      ?.getAttribute("data-hold-spotlight-window") ?? null;

  it("stays open after one of two holds is fixed from its window, and moves on to the other", async () => {
    const view = render(<StepHarness items={[CLIENT, PRICE]} />);
    fireEvent.click(screen.getByRole("button", { name: "Draft the invoice" }));
    expect(windows()).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Fix client" })).toHaveFocus();

    // The fix lands, taking the focused button with it.
    view.rerender(<StepHarness items={[CLIENT, PRICE]} cleared={["client"]} />);
    await waitFor(() =>
      expect(
        windows().map((el) => el.getAttribute("data-hold-spotlight-window")),
      ).toEqual(["price"]),
    );
    expect(layer()).not.toBeNull();
    expect(activeWindow()).toBe("price");
    expect(status()).toHaveTextContent(`1 thing needs attention: ${PRICE.reason}`);
    expect(screen.getByRole("button", { name: "Fix price" })).toHaveFocus();
  });

  it("steps Next through all three holds, though the third's window holds the second's", () => {
    render(<StepHarness items={[CLIENT, PRICE, STUDIO]} nested />);
    fireEvent.click(screen.getByRole("button", { name: "Draft the invoice" }));
    // As a pointer or keyboard press does, focus is on Next when it acts.
    const pressNext = () => {
      const next = screen.getByRole("button", { name: "Next" });
      act(() => next.focus());
      fireEvent.click(next);
    };
    const seen = [activeWindow()];
    pressNext();
    seen.push(activeWindow());
    expect(status()).toHaveTextContent(`2 of 3: ${PRICE.reason}`);
    pressNext();
    seen.push(activeWindow());
    expect(status()).toHaveTextContent(`3 of 3: ${STUDIO.reason}`);
    expect(seen).toEqual(["client", "price", "studio"]);
  });
});
