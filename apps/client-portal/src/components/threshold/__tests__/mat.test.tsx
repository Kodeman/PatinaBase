import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Mat, type MatProps } from "../mat";

function mat(overrides: Partial<MatProps> = {}): MatProps {
  return {
    people: [
      {
        name: "Nora Quist",
        role: "on the letterhead",
        where: "Quist Interiors",
      },
      {
        name: "Prairie Coat Painting",
        role: "on the stair-hall wall",
        where: "Des Moines",
      },
    ],
    papers: [
      { label: "Furnishings authorization No. 7", href: "/documents/fa-7" },
      { label: "Invoice No. 4", onOpen: jest.fn() },
      { label: "The design set" },
    ],
    onOpenDetails: jest.fn(),
    onSignOut: jest.fn(),
    ...overrides,
  };
}

describe("Mat — the people, the papers, and the way out", () => {
  it("carries the anchor, the unit, and opts into dimming", () => {
    render(<Mat {...mat()} />);

    const root = screen.getByTestId("mat");
    expect(root).toHaveAttribute("id", "mat");
    expect(root).toHaveAttribute("data-threshold-unit", "mat");
    expect(root).toHaveAttribute("data-dimmable");
  });

  it("gives the papers their own sub-anchor", () => {
    render(<Mat {...mat()} />);

    expect(screen.getByTestId("mat-papers")).toHaveAttribute(
      "id",
      "mat-papers",
    );
  });

  it("names each person and where they work", () => {
    render(<Mat {...mat()} />);

    const people = screen.getByTestId("mat-people");
    expect(within(people).getByText(/Nora Quist/)).toBeInTheDocument();
    expect(within(people).getByText(/on the letterhead/)).toBeInTheDocument();
    expect(within(people).getByText("Quist Interiors")).toBeInTheDocument();
  });

  it("says nothing about a person whose place it does not know", () => {
    render(
      <Mat
        {...mat({
          people: [{ name: "Dan Okafor", role: "on the site line", where: "" }],
        })}
      />,
    );

    const people = screen.getByTestId("mat-people");
    expect(
      within(people).getByText("Dan Okafor · on the site line"),
    ).toBeInTheDocument();
    expect(within(people).getAllByText(/./)).toHaveLength(2); // the head and the one line
  });

  it("lists the papers — linked, openable, or simply named", async () => {
    const onOpen = jest.fn();
    render(
      <Mat
        {...mat({
          papers: [
            {
              label: "Furnishings authorization No. 7",
              href: "/documents/fa-7",
            },
            { label: "Invoice No. 4", onOpen },
            { label: "The design set" },
          ],
        })}
      />,
    );

    const papers = screen.getByTestId("mat-papers");
    expect(
      within(papers).getByRole("link", {
        name: "Furnishings authorization No. 7",
      }),
    ).toHaveAttribute("href", "/documents/fa-7");

    await userEvent.click(
      within(papers).getByRole("button", { name: "Invoice No. 4" }),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);

    expect(within(papers).getByText("The design set")).toBeInTheDocument();
  });

  it("reads a paper that both links and opens as a link", () => {
    const onOpen = jest.fn();
    render(
      <Mat
        {...mat({
          papers: [{ label: "Invoice No. 4", href: "/invoices/4", onOpen }],
        })}
      />,
    );

    const papers = screen.getByTestId("mat-papers");
    expect(
      within(papers).getByRole("link", { name: "Invoice No. 4" }),
    ).toBeInTheDocument();
    expect(
      within(papers).queryByRole("button", { name: "Invoice No. 4" }),
    ).not.toBeInTheDocument();
  });

  it("lists two papers of the same name without losing one", () => {
    render(
      <Mat
        {...mat({
          papers: [{ label: "Change order" }, { label: "Change order" }],
        })}
      />,
    );

    expect(
      within(screen.getByTestId("mat-papers")).getAllByText("Change order"),
    ).toHaveLength(2);
  });

  it("keeps a way to her own details, named once, opened in place", async () => {
    const onOpenDetails = jest.fn();
    render(<Mat {...mat({ onOpenDetails })} />);

    expect(screen.getAllByText("Your details")).toHaveLength(1);
    const yourDetails = screen.getByRole("button", { name: /your details/i });
    await userEvent.click(yourDetails);
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });

  it("announces the details act as a dialog trigger, and its open state", () => {
    const { rerender } = render(<Mat {...mat({ detailsOpen: false })} />);
    const yourDetails = screen.getByRole("button", { name: /your details/i });
    expect(yourDetails).toHaveAttribute("aria-haspopup", "dialog");
    expect(yourDetails).toHaveAttribute("aria-expanded", "false");

    rerender(<Mat {...mat({ detailsOpen: true })} />);
    expect(
      screen.getByRole("button", { name: /your details/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("offers the way out, and takes it", async () => {
    const onSignOut = jest.fn();
    render(<Mat {...mat({ onSignOut })} />);

    const leave = screen.getByRole("button", { name: /leave the house/i });
    expect(leave).toBeInTheDocument();

    await userEvent.click(leave);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
