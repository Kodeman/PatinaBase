/**
 * US-34 N11 — the navigation rule, behind `loading-register` (US-33 PQ4, triage R14).
 *
 * It starts on a capture-phase anchor click or a wrapped router.push, draws at
 * 300 ms, and ends only once the destination has committed (pathname and
 * search equal the target) AND that destination's <main> holds no busy region.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NAV_RULE_DELAY_MS } from "@/lib/loading/thresholds";
import { NAV_RULE_DONE_MS, NavRule } from "../nav-rule";

let mockFlag = { value: true, isLoading: false };
jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: (key: string) =>
    key === "loading-register" ? mockFlag : { value: false, isLoading: false },
}));

let mockPath = "/desk";
let mockSearch = "";
const originalPush = jest.fn();
// The app router's one shared instance, as useRouter() returns it.
const mockRouter = { push: originalPush, replace: jest.fn(), prefetch: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

/* eslint-disable @next/next/no-html-link-for-pages */
/** The rendered page: whichever route is committed, its <main>, busy or not.
 *  Its links take the click the way next/link does (preventDefault, then the
 *  router); plain anchors, because next/link needs a mounted app router. */
function Page({ busy = false }: { busy?: boolean }) {
  return (
    <>
      <NavRule />
      <main onClick={(event) => event.preventDefault()}>
        <section aria-busy={busy ? "true" : undefined}>
          <a href="/doc/a">Holloway Den</a>
          <a href="/doc/b">Marlow Kitchen</a>
          <a href="/desk">Desk</a>
          <a href="/doc/a?tab=pieces">Pieces</a>
        </section>
      </main>
    </>
  );
}
/* eslint-enable @next/next/no-html-link-for-pages */

const rule = () => screen.queryByRole("progressbar", { hidden: true });

/** Advance the clock and let the mutation observer's microtask run. */
async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

/** The router commits `path`: the hooks now read it, and the page re-renders. */
async function commit(
  rerender: (ui: React.ReactElement) => void,
  path: string,
  { busy = false, search = "" }: { busy?: boolean; search?: string } = {},
) {
  mockPath = path;
  mockSearch = search;
  await act(async () => {
    rerender(<Page busy={busy} />);
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockFlag = { value: true, isLoading: false };
  mockPath = "/desk";
  mockSearch = "";
  mockRouter.push = originalPush;
  originalPush.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  document.documentElement.removeAttribute("data-loading-register");
});

describe("NavRule", () => {
  it("draws nothing under 300 ms, then a rule at 300 ms", async () => {
    render(<Page />);
    fireEvent.click(screen.getByText("Holloway Den"));
    await tick(NAV_RULE_DELAY_MS - 1);
    expect(rule()).toBeNull();
    await tick(1);
    expect(rule()).toHaveAttribute("data-stage", "route");
  });

  it("a navigation that lands and settles inside 300 ms never draws", async () => {
    const { rerender } = render(<Page />);
    fireEvent.click(screen.getByText("Holloway Den"));
    await tick(100);
    await commit(rerender, "/doc/a");
    await tick(NAV_RULE_DELAY_MS);
    expect(rule()).toBeNull();
  });

  it("a 1 s destination delay on an idle old page keeps the rule until the destination commits and settles", async () => {
    const { rerender } = render(<Page />);
    fireEvent.click(screen.getByText("Holloway Den"));
    // The old Desk stays up and is NOT busy for the whole second: idleness alone must not end it.
    await tick(1_000);
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(rule()).toHaveAttribute("data-stage", "route");

    // The destination commits, still reading: the data stroke.
    await commit(rerender, "/doc/a", { busy: true });
    await tick(50);
    expect(rule()).toHaveAttribute("data-stage", "data");

    // Its paper settles: one frame, then the completing stroke and the fade.
    await commit(rerender, "/doc/a", { busy: false });
    await tick(16);
    expect(rule()).toHaveAttribute("data-stage", "done");
    expect(rule()).toHaveAttribute("aria-hidden", "true");
    await tick(NAV_RULE_DONE_MS);
    expect(rule()).toBeNull();
  });

  it("a wrapped router.push starts it and still navigates", async () => {
    render(<Page />);
    act(() => mockRouter.push("/doc/b"));
    expect(originalPush).toHaveBeenCalledWith("/doc/b", undefined);
    await tick(NAV_RULE_DELAY_MS);
    expect(rule()).not.toBeNull();
  });

  it("a superseded navigation moves the rule to the new target", async () => {
    const { rerender } = render(<Page />);
    fireEvent.click(screen.getByText("Holloway Den"));
    await tick(200);
    act(() => mockRouter.push("/doc/b"));
    // Measured from the first click: the second does not restart the wait.
    await tick(100);
    expect(rule()).not.toBeNull();

    // The abandoned destination's commit is not this run's landing.
    await commit(rerender, "/doc/a");
    await tick(500);
    expect(rule()).toHaveAttribute("data-stage", "route");

    await commit(rerender, "/doc/b");
    await tick(16);
    expect(rule()).toHaveAttribute("data-stage", "done");
  });

  it("the commit condition includes the search", async () => {
    const { rerender } = render(<Page />);
    fireEvent.click(screen.getByText("Pieces"));
    await tick(NAV_RULE_DELAY_MS);
    await commit(rerender, "/doc/a");
    await tick(500);
    expect(rule()).toHaveAttribute("data-stage", "route");
    await commit(rerender, "/doc/a", { search: "tab=pieces" });
    await tick(16);
    expect(rule()).toHaveAttribute("data-stage", "done");
  });

  it("a destination that redirects (middleware to sign-in) still ends the rule", async () => {
    const { rerender } = render(<Page />);
    fireEvent.click(screen.getByText("Holloway Den"));
    await tick(NAV_RULE_DELAY_MS);
    expect(rule()).toHaveAttribute("data-stage", "route");
    await commit(rerender, "/auth/signin", { search: "next=%2Fdoc%2Fa" });
    await tick(16);
    expect(rule()).toHaveAttribute("data-stage", "done");
  });

  it("after a supersede, neither the page left nor the abandoned target reads as a redirect", async () => {
    const { rerender } = render(<Page />);
    fireEvent.click(screen.getByText("Holloway Den"));
    act(() => mockRouter.push("/doc/b"));
    await tick(NAV_RULE_DELAY_MS);
    await commit(rerender, "/desk");
    await commit(rerender, "/doc/a");
    await tick(500);
    expect(rule()).toHaveAttribute("data-stage", "route");
    await commit(rerender, "/doc/b-renamed");
    await tick(16);
    expect(rule()).toHaveAttribute("data-stage", "done");
  });

  it("a click on the current address ends it at once", async () => {
    render(<Page />);
    fireEvent.click(screen.getByText("Holloway Den"));
    await tick(NAV_RULE_DELAY_MS + 100);
    expect(rule()).not.toBeNull();
    fireEvent.click(screen.getByText("Desk"));
    expect(rule()).toBeNull();
  });

  it("Back/Forward cancels it", async () => {
    render(<Page />);
    fireEvent.click(screen.getByText("Holloway Den"));
    await tick(NAV_RULE_DELAY_MS);
    expect(rule()).not.toBeNull();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(rule()).toBeNull();
  });

  it("ignores clicks the browser keeps: modified, new tab, refused", async () => {
    render(<Page />);
    const link = screen.getByText("Holloway Den");
    fireEvent.click(link, { metaKey: true });
    link.setAttribute("target", "_blank");
    fireEvent.click(link);
    link.removeAttribute("target");
    link.setAttribute("aria-disabled", "true");
    fireEvent.click(link);
    await tick(1_000);
    expect(rule()).toBeNull();
  });

  it("is an indeterminate progressbar with no live region", async () => {
    render(<Page />);
    fireEvent.click(screen.getByText("Holloway Den"));
    await tick(NAV_RULE_DELAY_MS);
    const bar = screen.getByRole("progressbar", { name: "Loading the page" });
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(bar).not.toHaveAttribute("aria-live");
    expect(bar).not.toHaveAttribute("aria-hidden");
  });

  it("flag off: renders nothing and leaves router.push alone", async () => {
    mockFlag = { value: false, isLoading: false };
    render(<Page />);
    expect(mockRouter.push).toBe(originalPush);
    fireEvent.click(screen.getByText("Holloway Den"));
    mockRouter.push("/doc/b");
    await tick(2_000);
    expect(rule()).toBeNull();
  });

  it("unmounting restores router.push", () => {
    const { unmount } = render(<Page />);
    expect(mockRouter.push).not.toBe(originalPush);
    unmount();
    expect(mockRouter.push).toBe(originalPush);
  });
});

describe("the (document) layout", () => {
  // The layout is a server component this suite cannot render; read its source,
  // as skip-to-paper.test.tsx does.
  it("mounts the rule once, outside the route boundary so /board/* has it too", () => {
    const layout = readFileSync(
      join(__dirname, "../../../app/(document)/layout.tsx"),
      "utf8",
    );
    const body = layout.slice(layout.indexOf("export default function"));
    expect(body.split("<NavRule />")).toHaveLength(2);
    expect(body.indexOf("<NavRule />")).toBeLessThan(
      body.indexOf("<DocumentRouteBoundary"),
    );
  });
});

describe("the rule's CSS", () => {
  const CSS = readFileSync(join(__dirname, "../../../app/globals.css"), "utf8");

  it("is 1 px of ink at 40%", () => {
    const block = CSS.slice(CSS.indexOf(".nav-rule {"));
    expect(block).toMatch(/height: 1px;/);
    expect(block).toMatch(
      /color-mix\(in srgb, var\(--text-primary\) 40%, transparent\)/,
    );
  });

  it("reduced motion steps instead of animating", () => {
    const reduced = CSS.slice(
      CSS.indexOf("@media (prefers-reduced-motion: reduce) {\n  .nav-rule"),
    );
    expect(reduced).toMatch(/animation: none;\s*transition: none;/);
  });
});
