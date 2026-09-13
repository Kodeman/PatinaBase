import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvoicePaper, type InvoicePaperInvoice } from "./InvoicePaper";

/**
 * Fix round 1 (finding M2) — the printed/PDF invoice must carry the same
 * HT-21 dated sub-table the client's pay-link sheet renders, so a designer
 * printing an invoice and a homeowner opening the pay link see the same
 * document. Never a member name (LEAH-15/REP-15).
 */
const BASE_INVOICE: InvoicePaperInvoice = {
  status: "sent",
  invoice_number: "INV-0001",
  project_id: "p1",
  title: null,
  currency: "USD",
  issue_date: "2026-09-01",
  due_date: "2026-09-15",
  payment_terms_days: 15,
  subtotal_cents: 22_000,
  tax_rate: 0,
  tax_cents: 0,
  total_cents: 22_000,
  amount_paid_cents: 0,
  memo: null,
};

describe("InvoicePaper — HT-21 dated sub-table (fix round 1, finding M2)", () => {
  it("renders the dated sub-table beneath a kind=time line, no member name", () => {
    render(
      <InvoicePaper
        invoice={{
          ...BASE_INVOICE,
          line_items: [
            {
              id: "l1",
              kind: "time",
              description: "Design services — 1h 30m (2 entries)",
              quantity: 1,
              unit_amount_cents: 22_000,
              amount_cents: 22_000,
              metadata: {
                attribution: JSON.stringify({
                  kind: "patina_time_subtable",
                  rows: [
                    { date: "2026-09-03", minutes: 60, rateCents: 14_500 },
                    { date: "2026-09-04", minutes: 30, rateCents: 15_000 },
                  ],
                }),
              },
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByText(/Design services — 1h 30m \(2 entries\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sep 3, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Sep 4, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/\$145\.00\/hr/)).toBeInTheDocument();
    expect(screen.getByText(/\$150\.00\/hr/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Maria|Alvarez|Leah|Brooks/),
    ).not.toBeInTheDocument();
  });

  it("renders no sub-table for a non-time line even if metadata carries an attribution string", () => {
    render(
      <InvoicePaper
        invoice={{
          ...BASE_INVOICE,
          line_items: [
            {
              id: "l1",
              kind: "ffe",
              description: "Bespoke sofa",
              quantity: 1,
              unit_amount_cents: 22_000,
              amount_cents: 22_000,
              metadata: { attribution: "Acme Upholstery" },
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Bespoke sofa")).toBeInTheDocument();
    // The plain vendor-name string is not a parsed sub-table (no /hr rows).
    expect(screen.queryByText(/\/hr/)).not.toBeInTheDocument();
  });

  it("renders no sub-table when a time line carries no attribution or a malformed one", () => {
    render(
      <InvoicePaper
        invoice={{
          ...BASE_INVOICE,
          line_items: [
            {
              id: "l1",
              kind: "time",
              description: "Design services — 2h (2 entries)",
              quantity: 1,
              unit_amount_cents: 22_000,
              amount_cents: 22_000,
              metadata: {},
            },
            {
              id: "l2",
              kind: "time",
              description: "Design services — 1h (1 entry)",
              quantity: 1,
              unit_amount_cents: 10_000,
              amount_cents: 10_000,
              metadata: { attribution: "not json" },
            },
          ],
        }}
      />,
    );

    expect(screen.queryByText(/\/hr/)).not.toBeInTheDocument();
  });
});
