/**
 * HT-21 (W5) — a kind='time' line's dated sub-table (date · hours · rate),
 * rendered under the existing per-line attribution sub-slot rather than a
 * second one, and carrying no staffing detail (LEAH-15, REP-15).
 */

import { render, screen } from "@testing-library/react";

import { InvoiceSheet } from "../invoice-sheet";
import type { InvoiceLinkPayload } from "../invoice-link";

jest.mock("@/lib/analytics/events", () => ({
  __esModule: true,
  payLinkEvents: {
    view: jest.fn(),
    methodSelected: jest.fn(),
    paymentStarted: jest.fn(),
    paymentCompleted: jest.fn(),
    paymentCancelled: jest.fn(),
    checkIntent: jest.fn(),
    deadLink: jest.fn(),
    settling: jest.fn(),
    rateLimitBindingMissing: jest.fn(),
  },
}));

const mockRouter = {
  replace: jest.fn(),
  refresh: jest.fn(),
  push: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  prefetch: jest.fn(),
};
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

const TOKEN = "a".repeat(64);

function timeInvoice(attribution: string | null): InvoiceLinkPayload {
  return {
    kind: "invoice",
    invoice: {
      number: "7",
      title: "Design services · September",
      status: "sent",
      issue_date: "2026-09-01",
      due_date: "2099-09-15",
      paid_at: null,
      currency: "USD",
      subtotal_cents: 29_000,
      tax_cents: 0,
      tax_rate: 0,
      total_cents: 29_000,
      amount_paid_cents: 0,
      balance_cents: 29_000,
      memo: null,
      project_name: "Okonkwo Residence",
      is_studio_invoice: false,
    },
    line_items: [
      {
        description: "Design services — 2h (2 entries)",
        quantity: 1,
        unit_amount_cents: 29_000,
        amount_cents: 29_000,
        kind: "time",
        attribution,
      },
    ],
    payments: [],
    studio: {
      name: "Middle West Studio",
      logo_url: null,
      website: "middlewest.studio",
      source: "project",
      location: null,
    },
    designer_display_name: "Leah Kochaver",
    client_display_name: "Chidi Okonkwo",
    payment_options: { card_surcharge_bps: 300, check_remit_to: null },
    pay: {
      rails: ["us_bank_account", "card", "check"],
      processing: false,
      payable: true,
    },
  };
}

describe("a kind='time' line's dated sub-table (HT-21)", () => {
  it("renders one row per dated entry — date · hours · rate — with no name", () => {
    const attribution = JSON.stringify({
      kind: "patina_time_subtable",
      rows: [
        { date: "2026-09-03", minutes: 60, rateCents: 14_500 },
        { date: "2026-09-05", minutes: 30, rateCents: 14_500 },
      ],
    });
    render(<InvoiceSheet token={TOKEN} payload={timeInvoice(attribution)} />);

    const subtable = document.querySelector("[data-pay-line-time-subtable]");
    expect(subtable).not.toBeNull();
    // formatShortDate is "en-GB" day-month ("3 September"), matching every
    // other date on this sheet.
    expect(subtable).toHaveTextContent("3 September");
    expect(subtable).toHaveTextContent("1h");
    expect(subtable).toHaveTextContent("$145.00/hr");
    expect(subtable).toHaveTextContent("5 September");
    expect(subtable).toHaveTextContent("30m");

    // LEAH-15 / REP-15 — no staffing detail reaches the homeowner.
    expect(
      screen.queryByText(/Maria|Leah Brooks|Alvarez/),
    ).not.toBeInTheDocument();
  });

  it("falls back to plain text when attribution is not the JSON marker", () => {
    render(
      <InvoiceSheet token={TOKEN} payload={timeInvoice("some legacy note")} />,
    );
    expect(document.querySelector("[data-pay-line-time-subtable]")).toBeNull();
    expect(screen.getByText("some legacy note")).toBeInTheDocument();
  });

  it("renders no sub-slot at all when the line carries no attribution", () => {
    render(<InvoiceSheet token={TOKEN} payload={timeInvoice(null)} />);
    expect(document.querySelector("[data-pay-line-time-subtable]")).toBeNull();
  });

  it("a non-time line's JSON-shaped attribution is never mistaken for a subtable", () => {
    const payload = timeInvoice(null);
    payload.line_items = [
      {
        ...payload.line_items[0],
        kind: "product",
        attribution: JSON.stringify({ kind: "patina_time_subtable", rows: [] }),
      },
    ];
    render(<InvoiceSheet token={TOKEN} payload={payload} />);
    expect(document.querySelector("[data-pay-line-time-subtable]")).toBeNull();
  });
});
