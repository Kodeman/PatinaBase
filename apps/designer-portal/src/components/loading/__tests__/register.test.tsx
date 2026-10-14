/**
 * US-34 N10 — the loading register on the Desk and the Document, behind
 * `loading-register` (US-33 PQ2, PQ3, PQ5–PQ7).
 *
 * Flag off is today: the three new route fallbacks render nothing. Flag on:
 * the Desk and the Document are shaped busy regions with no loader words (the
 * only words are the slow and stall line, timed from thresholds.ts), the
 * placeholders breathe on R15 and reduced motion stills them, and the
 * fallbacks that cannot read a flag retire their words by CSS.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, renderHook, screen } from "@testing-library/react";
import CatchAllLoading from "@/app/(document)/loading";
import DeskLoading from "@/app/(document)/desk/loading";
import DocumentLoading from "@/app/(document)/doc/[id]/loading";
import { SLOW_MS, STALL_MS } from "@/lib/loading/thresholds";
import {
  CeremonySkeleton,
  DeskSkeleton,
  DocumentSkeleton,
  DraftingSkeleton,
  LibrarySkeleton,
  StudioBoardsSkeleton,
  useLoadingRegister,
} from "..";

let mockFlag = { value: false, isLoading: false };
jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: (key: string) =>
    key === "loading-register" ? mockFlag : { value: false, isLoading: false },
}));

const html = document.documentElement;
const CSS = readFileSync(join(__dirname, "../../../app/globals.css"), "utf8");
const ARRIVAL_CSS = readFileSync(
  join(__dirname, "../../../lib/arrival/arrival.css"),
  "utf8",
);

/** The text a sighted reader could see: everything but sr-only and the timed slow line. */
function visibleWords(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  copy
    .querySelectorAll(".sr-only, [data-slow-line]")
    .forEach((n) => n.remove());
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}

afterEach(() => {
  mockFlag = { value: false, isLoading: false };
  html.removeAttribute("data-loading-register");
});

describe("the three route fallbacks", () => {
  const ROUTES = [
    ["desk", DeskLoading, "Loading today’s lines."],
    ["doc/[id]", DocumentLoading, "Loading the document."],
    ["(document)", CatchAllLoading, "Loading the page."],
  ] as const;

  // A loading boundary swaps the old page out at once, so flag off is a still,
  // shaped busy sheet (no breath, no slow line), never a blank one.
  it.each(ROUTES)(
    "%s: flag off is still a busy region, without the register mark",
    (_route, Loading, label) => {
      render(<Loading />);
      expect(
        screen.getByText(label).closest('[aria-busy="true"]'),
      ).not.toBeNull();
      expect(html.hasAttribute("data-loading-register")).toBe(false);
    },
  );

  it.each(ROUTES)(
    "%s: flag on is a busy region (aria-busy) and prints the register mark",
    (_route, Loading, label) => {
      mockFlag = { value: true, isLoading: false };
      const { container } = render(<Loading />);
      const region = screen.getByText(label).closest('[aria-busy="true"]');
      expect(region).not.toBeNull();
      expect(html.hasAttribute("data-loading-register")).toBe(true);
      // No sweep on blank paper (PQ6) and nothing to press but plain links (H3).
      expect(container.querySelector(".strata-sweep")).toBeNull();
      expect(
        container.querySelectorAll("button, input, [role='tab']"),
      ).toHaveLength(0);
    },
  );

  it("an unanswered flag keeps the session's mark rather than flipping on a fresh mount", () => {
    html.setAttribute("data-loading-register", "");
    mockFlag = { value: false, isLoading: true };
    const { result } = renderHook(() => useLoadingRegister());
    expect(result.current).toBe(true);
    expect(html.hasAttribute("data-loading-register")).toBe(true);
  });

  it("a flag that answers off clears the mark", () => {
    html.setAttribute("data-loading-register", "");
    renderHook(() => useLoadingRegister());
    expect(html.hasAttribute("data-loading-register")).toBe(false);
  });
});

describe("the Desk and Document skeletons (Q, Quiet paper)", () => {
  it.each([
    ["Desk", DeskSkeleton],
    ["Document", DocumentSkeleton],
  ] as const)(
    "%s: filled bars, aria-busy, and no prose loader",
    (_name, Skeleton) => {
      const { container } = render(<Skeleton />);
      expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(
        container.querySelectorAll("[data-placeholder]").length,
      ).toBeGreaterThan(4);
      expect(container.querySelector(".desk-loading-frame")).toBeNull();
      // Frame words only ("Today", "Next —", the rail's way back): nothing that reads as loading.
      expect(visibleWords(container)).not.toMatch(
        /Picking up|Loading|Reading|…/,
      );
    },
  );

  it("the slow and stall words are timed from thresholds.ts, and Reload is a plain link", () => {
    const { container } = render(<DocumentSkeleton />);
    const slow = container.querySelector<HTMLElement>("[data-slow-line]")!;
    expect(slow).toHaveAttribute("role", "status");
    expect(slow.style.getPropertyValue("--slow-at")).toBe(`${SLOW_MS}ms`);
    expect(slow.style.getPropertyValue("--stall-at")).toBe(`${STALL_MS}ms`);
    expect(slow).toHaveTextContent(
      "Still reading. The connection is slow. Reload the page",
    );
    expect(slow.querySelector("a")).toHaveAttribute("href", "");
    expect(CSS).toMatch(
      /\.slow-line \{[^}]*visibility: hidden;[^}]*animation: slow-line-in 1ms linear var\(--slow-at, 4000ms\) forwards;/,
    );
    expect(CSS).toMatch(
      /\.slow-line-stall \{[^}]*visibility: hidden;[^}]*animation: slow-line-in 1ms linear var\(--stall-at, 10000ms\) forwards;/,
    );
  });
});

describe("words and the sweep retire under the register (PQ6, PQ7)", () => {
  it.each([
    ["Library", LibrarySkeleton, ["reading the shelf…"]],
    [
      "Studio boards",
      StudioBoardsSkeleton,
      ["Loading design boards…", "Reading the boards…"],
    ],
    ["Drafting", DraftingSkeleton, ["Opening the draft…"]],
    ["Ceremony", CeremonySkeleton, ["Arriving…"]],
  ] as const)(
    "%s: each loader word is marked data-register-off",
    (_name, Skeleton, words) => {
      render(<Skeleton />);
      for (const word of words) {
        expect(
          screen.getByText(word).closest("[data-register-off]"),
        ).not.toBeNull();
      }
    },
  );

  it("the Library's sweep is marked off with its words", () => {
    const { container } = render(<LibrarySkeleton />);
    expect(
      container.querySelector(".strata-sweep")?.closest("[data-register-off]"),
    ).not.toBeNull();
  });

  it("globals.css hides [data-register-off] under the mark and [data-register-on] without it", () => {
    expect(CSS).toMatch(
      /html:not\(\[data-loading-register\]\) \[data-register-on\],\s*html\[data-loading-register\] \[data-register-off\] \{\s*display: none !important;/,
    );
  });
});

describe("the breath (PQ5) and reduced motion", () => {
  /** The rule bodies of every block for this selector, outside and inside the reduced-motion query. */
  const reduced =
    CSS.slice(CSS.indexOf("/* ===== The loading register")).match(
      /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/,
    )?.[1] ?? "";

  it("placeholders breathe on doc-breath after their fade-in, only under the register", () => {
    expect(CSS).toMatch(
      /html\[data-loading-register\] \.ph-block \{\s*animation:\s*ph-in 50ms linear var\(--ph-delay, 150ms\) forwards,\s*doc-breath 3s ease-in-out calc\(var\(--ph-delay, 150ms\) \+ 50ms\) infinite;/,
    );
    expect(CSS).toMatch(
      /html\[data-loading-register\] \[data-loading-bar\] \{\s*animation: doc-breath 3s ease-in-out infinite;/,
    );
  });

  it("reduced motion has no animation: no breath, and the bars step in", () => {
    expect(reduced).toMatch(
      /html\[data-loading-register\] \.ph-block \{\s*animation: ph-in 50ms step-start var\(--ph-delay, 150ms\) forwards;/,
    );
    expect(reduced).toMatch(
      /html\[data-loading-register\] \[data-loading-bar\] \{\s*animation: none;/,
    );
    expect(reduced).not.toMatch(/doc-breath/);
  });
});

describe("arrival C (PQ3)", () => {
  it("arrival.css never veils the route root or the held paper under the register", () => {
    const veils =
      ARRIVAL_CSS.match(
        /^html\.arr-pre[^,{]*\{[^}]*(opacity|animation)[^}]*\}/gm,
      ) ?? [];
    expect(veils.length).toBeGreaterThan(0);
    for (const rule of veils)
      expect(rule.startsWith("html.arr-pre:not([data-loading-register])")).toBe(
        true,
      );
  });
});
