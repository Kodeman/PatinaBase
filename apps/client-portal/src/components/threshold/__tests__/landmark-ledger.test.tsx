import { render, screen } from "@testing-library/react";

import type { InvoiceProjection } from "@/lib/threshold/invoice-rollup";

import {
  ARRIVAL_PURPOSE,
  LandmarkLedger,
  invoiceArrivalLines,
  type LandmarkLedgerProps,
} from "../landmark-ledger";

function ledger(
  overrides: Partial<LandmarkLedgerProps> = {},
): LandmarkLedgerProps {
  return {
    invoices: true,
    approvals: "wall",
    progress: true,
    updates: "note",
    whatChanged: true,
    documents: true,
    contact: { anchor: "contact", label: "Contact Maren Holt" },
    ...overrides,
  };
}

/** The landmarks as rendered, in order: [label, href]. */
function struck(): Array<[string, string | null]> {
  return screen
    .getAllByRole("link")
    .map((link) => [link.textContent?.trim() ?? "", link.getAttribute("href")]);
}

describe("LandmarkLedger — literal names, each a jump to the place it names", () => {
  it("strikes Invoices, Approvals and Progress first, then the page in canvas order", () => {
    render(<LandmarkLedger {...ledger()} />);

    expect(struck()).toEqual([
      ["Invoices", "#letterbox"],
      ["Approvals", "#wall"],
      ["Progress", "#road"],
      ["Updates", "#note"],
      ["What changed", "#changed"],
      ["Documents", "#mat-papers"],
      ["Contact Maren Holt", "#contact"],
    ]);
  });

  it("is in-page wayfinding, not a header: a nav that scrolls with the page", () => {
    render(<LandmarkLedger {...ledger()} />);

    const nav = screen.getByTestId("landmark-ledger");
    expect(nav.tagName).toBe("NAV");
    expect(nav).toHaveAccessibleName("On this page");
    expect(nav.className).not.toMatch(/\b(fixed|sticky)\b/);
    expect(nav).not.toHaveAttribute("data-threshold-unit");
    expect(nav).not.toHaveAttribute("data-dimmable");
  });

  it("draws each link as a 44px target in forest ink at 16px", () => {
    render(<LandmarkLedger {...ledger()} />);

    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("min-h-[44px]");
      expect(link.className).toContain("t-body");
      expect(link.className).toContain("var(--color-forest)");
    }
  });

  it("keeps the existing analytics keys through the rename", () => {
    render(<LandmarkLedger {...ledger()} />);

    expect(
      screen
        .getAllByRole("link")
        .map((link) => link.getAttribute("data-action-key")),
    ).toEqual([
      "landmark_what_you_owe",
      "landmark_what_needs_you",
      "landmark_where_we_are",
      "landmark_updates",
      "landmark_what_changed",
      "landmark_the_papers",
      "landmark_contact",
    ]);
  });

  it("omits a landmark whose target does not render — never draws it disabled", () => {
    render(
      <LandmarkLedger
        {...ledger({
          whatChanged: false,
          approvals: null,
          updates: null,
          contact: null,
        })}
      />,
    );

    expect(struck()).toEqual([
      ["Invoices", "#letterbox"],
      ["Progress", "#road"],
      ["Documents", "#mat-papers"],
    ]);
    expect(screen.queryByText("Approvals")).not.toBeInTheDocument();
    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveAttribute("aria-disabled");
    }
  });

  it("keeps the money legible while the house is read as it moved", () => {
    render(<LandmarkLedger {...ledger()} />);

    expect(screen.getByText("Invoices").closest("a")).toHaveAttribute(
      "data-never-dim",
    );
    expect(screen.getByText("Progress").closest("a")).not.toHaveAttribute(
      "data-never-dim",
    );
  });

  it("sends Approvals to whichever ask actually drew, or to the approvals section", () => {
    const { rerender } = render(
      <LandmarkLedger {...ledger({ approvals: "door" })} />,
    );
    expect(screen.getByText("Approvals").closest("a")).toHaveAttribute(
      "href",
      "#door",
    );

    rerender(<LandmarkLedger {...ledger({ approvals: "approval-dec-9" })} />);
    expect(screen.getByText("Approvals").closest("a")).toHaveAttribute(
      "href",
      "#approval-dec-9",
    );

    rerender(<LandmarkLedger {...ledger({ approvals: "approvals" })} />);
    expect(screen.getByText("Approvals").closest("a")).toHaveAttribute(
      "href",
      "#approvals",
    );
  });

  it("renders nothing at all when the page has no landmark to give", () => {
    const { container } = render(
      <LandmarkLedger invoices={false} approvals={null} progress={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("pins the arrival purpose sentence (A7 · F6)", () => {
    expect(ARRIVAL_PURPOSE).toBe(
      "Pay invoices, review approvals, and follow your project here.",
    );
  });
});

function projection(
  overrides: Partial<InvoiceProjection> = {},
): InvoiceProjection {
  return {
    read: "complete",
    review: [],
    processing: [],
    payable: [],
    history: [],
    outstanding: [],
    counts: { review: 0, processing: 0, payable: 0, history: 0 },
    outstandingTotals: [],
    withheld: null,
    nothingToPay: true,
    allClear: true,
    ...overrides,
  };
}

describe("invoiceArrivalLines — the arrival counts what the projection counts", () => {
  it("counts the payable group in words", () => {
    expect(
      invoiceArrivalLines(
        projection({
          counts: { review: 0, processing: 0, payable: 6, history: 2 },
          nothingToPay: false,
          allClear: false,
        }),
      ),
    ).toEqual(["You have six invoices to pay."]);
    expect(
      invoiceArrivalLines(
        projection({
          counts: { review: 0, processing: 0, payable: 1, history: 0 },
          nothingToPay: false,
          allClear: false,
        }),
      ),
    ).toEqual(["You have one invoice to pay."]);
  });

  it("keeps payments in progress and payments needing review apart from what is payable", () => {
    expect(
      invoiceArrivalLines(
        projection({
          counts: { review: 2, processing: 1, payable: 0, history: 0 },
          allClear: false,
        }),
      ),
    ).toEqual(["One payment is in progress.", "Two payments need review."]);
  });

  it("withholds the number when counts are withheld — never falls back to zero", () => {
    for (const withheld of ["loading", "incomplete", "unverified"] as const) {
      expect(
        invoiceArrivalLines(
          projection({
            counts: null,
            withheld,
            nothingToPay: false,
            allClear: false,
          }),
        ),
      ).toEqual([]);
    }
    expect(invoiceArrivalLines(null)).toEqual([]);
  });

  it("says nothing at the arrival when nothing is outstanding; the Invoices section says it", () => {
    expect(invoiceArrivalLines(projection())).toEqual([]);
  });
});
