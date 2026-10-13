/**
 * A Today card (US-28 S3; uplift.md change 1): the S1 Card as an
 * `<article data-stage>` on its stage edge, the eyebrow (stage · holder ·
 * freshness), the job's name opening the job, then its lines.
 */
import { render, screen, within } from "@testing-library/react";
import type { SheetCard } from "@/lib/document/day-sheet";
import { DeskJobCard, clockTime, stageClass } from "../desk-job-card";

// Monday 12 October 2026, 10:40am local.
const NOW = new Date(2026, 9, 12, 10, 40);

function card(over: Partial<SheetCard> = {}): SheetCard {
  return {
    jobId: "p-holloway",
    name: "Holloway Den",
    stage: "project",
    holder: { userId: "me", name: "Leah", mine: true },
    lines: [
      {
        key: "overdue_invoice:inv-1",
        projectId: "p-holloway",
        projectName: "Holloway Den",
        need: {
          key: "overdue_invoice:inv-1",
          kind: "overdue_invoice",
          text: "Invoice is overdue",
          at: new Date(2026, 9, 12, 8, 40).toISOString(),
        },
      },
    ],
    ...over,
  } as SheetCard;
}

function renderCard(props: Partial<Parameters<typeof DeskJobCard>[0]> = {}) {
  return render(
    <DeskJobCard card={card()} scope="studio" now={NOW} {...props}>
      <li>a line</li>
    </DeskJobCard>,
  );
}

describe("DeskJobCard", () => {
  it("is an article on its stage edge, the S1 Card", () => {
    const { container } = renderCard();
    const article = container.querySelector("article")!;
    expect(article).toHaveAttribute("data-stage", "project");
    expect(article).toHaveClass("card", "st-project");
    expect(article.querySelector(".card-up")).not.toBeNull();
    expect(within(article).getByText("a line").closest("ul")).toHaveClass(
      "lines",
    );
  });

  it("stands Care on the install edge it grew out of", () => {
    const { container } = renderCard({ card: card({ stage: "care" }) });
    expect(container.querySelector("article")).toHaveAttribute(
      "data-stage",
      "care",
    );
    expect(container.querySelector("article")).toHaveClass("st-install");
    expect(stageClass("care")).toBe("st-install");
    expect(stageClass("brief")).toBe("st-brief");
  });

  it("prints a plain card with no stage edge when the stage is not known", () => {
    const { container } = renderCard({ card: card({ stage: null }) });
    expect(container.querySelector("article")).not.toHaveAttribute(
      "data-stage",
    );
    expect(container.querySelector("article")!.className).toBe("card");
  });

  it("always prints the holder in the studio’s scope, and freshness from timeWord", () => {
    const { container } = renderCard();
    expect(container.querySelector(".eb")).toHaveTextContent(
      /^Project · Leah’s · 2 hours ago$/,
    );
  });

  it("in Mine, prints the holder only on a job she does not carry", () => {
    const mine = renderCard({ scope: "mine" });
    expect(mine.container.querySelector(".eb")).toHaveTextContent(
      /^Project · 2 hours ago$/,
    );
    mine.unmount();
    const theirs = renderCard({
      scope: "mine",
      card: card({
        holder: { userId: "u-jordan", name: "Jordan", mine: false },
      }),
    });
    expect(theirs.container.querySelector(".eb")).toHaveTextContent(
      /^Project · Jordan’s · 2 hours ago$/,
    );
  });

  it("prints no freshness past a day", () => {
    const old = card();
    old.lines[0].need.at = new Date(2026, 9, 1, 9).toISOString();
    const { container } = renderCard({ card: old });
    expect(container.querySelector(".eb")!.textContent).not.toMatch(
      /ago|yesterday|just now/,
    );
  });

  it("names the job in display type, its link opening the job; card one carries the arrival’s job mark", () => {
    const first = renderCard({ first: true });
    const link = screen.getByRole("link", { name: "Holloway Den" });
    expect(link).toHaveAttribute("href", "/doc/p-holloway");
    expect(link).toHaveAttribute("data-part", "job");
    // The arrival's token link (arrival-mount.tsx TOKEN_LINKS).
    expect(link).toHaveAttribute("data-roster-name");
    expect(link.closest("h3")).toHaveClass("t-d3");
    first.unmount();
    renderCard();
    expect(
      screen.getByRole("link", { name: "Holloway Den" }),
    ).not.toHaveAttribute("data-part");
  });

  it("writes no shadow, badge or count", () => {
    const { container } = renderCard();
    for (const el of container.querySelectorAll("*")) {
      expect(el.className.toString()).not.toMatch(/shadow|rounded-full|badge/);
    }
    expect(container.textContent).not.toMatch(/\(\d+\)|\d+ lines?/);
  });
});

describe("clockTime", () => {
  it("prints the clock time a line settled at, 12-hour, no meridiem", () => {
    expect(clockTime(new Date(2026, 9, 12, 8, 42).toISOString())).toBe("8:42");
    expect(clockTime(new Date(2026, 9, 12, 16, 5).toISOString())).toBe("4:05");
    expect(clockTime(new Date(2026, 9, 12, 0, 30).toISOString())).toBe("12:30");
    expect(clockTime(null)).toBe("");
    expect(clockTime("not a time")).toBe("");
  });
});
