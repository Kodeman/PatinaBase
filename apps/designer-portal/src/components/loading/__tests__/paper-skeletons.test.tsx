/**
 * US-34 F13d–f — the route fallbacks for the rooms that already speak while
 * they load: the Library, Studio design boards, a design board, the Drafting
 * Room and the match ceremony.
 *
 * Each fallback is a busy region (H4) whose bars wait the PQ8 150 ms (H2),
 * and each keeps today's loader words, and the Library its StrataSweep, word
 * for word: retiring them is N10's (PQ6, PQ7). The leaves under a shaped room
 * get a quiet busy sheet of their own instead of their parent's skeleton.
 */

import { render, screen, within } from "@testing-library/react";
import BoardLoading from "@/app/(document)/board/[boardId]/loading";
import BoardsLoading from "@/app/(document)/boards/loading";
import CeremonyLoading from "@/app/(document)/ceremony/[leadId]/loading";
import FinishesPrintLoading from "@/app/(document)/doc/[id]/pieces/finishes/print/loading";
import DraftingLoading from "@/app/(document)/drafting/[proposalId]/loading";
import PieceLoading from "@/app/(document)/library/[id]/loading";
import JudgmentsLoading from "@/app/(document)/library/judgments/loading";
import LibraryLoading from "@/app/(document)/library/loading";
import RoomFileLoading from "@/app/(document)/room/[id]/file/loading";

const FALLBACKS = [
  {
    route: "/library",
    Loading: LibraryLoading,
    label: "Loading the library.",
    words: ["reading the shelf…"],
  },
  {
    route: "/boards",
    Loading: BoardsLoading,
    label: "Loading the studio's design boards.",
    words: ["Loading design boards…", "Reading the boards…"],
  },
  {
    route: "/board/[boardId]",
    Loading: BoardLoading,
    label: "Loading the design board.",
    words: [],
  },
  {
    route: "/drafting/[proposalId]",
    Loading: DraftingLoading,
    label: "Loading the draft.",
    words: ["Opening the draft…"],
  },
  {
    route: "/ceremony/[leadId]",
    Loading: CeremonyLoading,
    label: "Loading the match ceremony.",
    words: ["Arriving…"],
  },
] as const;

function regionOf(container: HTMLElement) {
  return container.firstElementChild as HTMLElement;
}

describe.each(FALLBACKS)("$route loading.tsx", ({ Loading, label, words }) => {
  it("is a busy region named for what is loading", () => {
    const { container } = render(<Loading />);
    const region = regionOf(container);
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region.querySelector(".sr-only")).toHaveTextContent(label);
    expect(region.style.getPropertyValue("--ph-delay")).toBe("150ms");
  });

  it("keeps today's loader words inside the region", () => {
    const { container } = render(<Loading />);
    const region = regionOf(container);
    words.forEach((sentence) => {
      expect(within(region).getByText(sentence)).toBeVisible();
    });
  });

  it("draws filled bars hidden from assistive technology, never a count", () => {
    const { container } = render(<Loading />);
    const bars = container.querySelectorAll("[data-placeholder]");
    expect(bars.length).toBeGreaterThan(3);
    bars.forEach((bar) => {
      expect(bar).toHaveAttribute("aria-hidden", "true");
      expect(bar).toHaveClass("ph");
      expect(bar).toBeEmptyDOMElement();
    });
    container.querySelectorAll(".ph-block").forEach((block) => {
      expect(block.closest('[aria-hidden="true"]')).not.toBeNull();
    });
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("offers nothing to press before hydration but a plain link (H3)", () => {
    const { container } = render(<Loading />);
    expect(
      container.querySelectorAll('button, input, textarea, [role="tab"]'),
    ).toHaveLength(0);
    container.querySelectorAll("a").forEach((link) => {
      expect(link).toHaveAttribute("href");
    });
  });
});

describe("the Library's fallback", () => {
  it("keeps the shelf's StrataSweep and its label", () => {
    render(<LibraryLoading />);
    const sweep = screen.getByRole("status", { name: "Reading All shelves" });
    expect(sweep).toHaveClass("strata-sweep");
    expect(screen.getByText("Resource library")).toBeInTheDocument();
  });
});

describe("the design board's fallback", () => {
  it("keeps the board's landmark name", () => {
    render(<BoardLoading />);
    expect(screen.getByRole("main", { name: "Loading mood board" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});

describe.each([
  { route: "/library/[id]", Loading: PieceLoading, label: "Loading the piece." },
  {
    route: "/library/judgments",
    Loading: JudgmentsLoading,
    label: "Loading style preferences.",
  },
  { route: "/room/[id]/file", Loading: RoomFileLoading, label: "Loading the room file." },
  {
    route: "/doc/[id]/pieces/finishes/print",
    Loading: FinishesPrintLoading,
    label: "Loading the finish schedule.",
  },
])("$route loading.tsx", ({ Loading, label }) => {
  it("is a quiet busy sheet, never its parent's skeleton", () => {
    const { container } = render(<Loading />);
    const region = regionOf(container);
    expect(region.tagName).toBe("MAIN");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveTextContent(label);
    expect(container.querySelectorAll("[data-placeholder], .ph-block")).toHaveLength(0);
  });
});
