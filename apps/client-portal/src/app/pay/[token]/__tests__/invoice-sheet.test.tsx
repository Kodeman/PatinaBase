/**
 * The sheet's arithmetic and its nine states.
 *
 * The figures are the ones the design fixed and the mockup draws: on a
 * $9,125.00 balance at 300 bps the three rows read $9,130.00 / $9,398.75 /
 * $9,125.00, and on a $675.00 studio invoice $680.00 / $695.25 / $675.00 — the
 * ACH cap holding on the first, the formula on the second. If any of these move
 * the page is quoting a number Stripe will not charge.
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import {
  CONFIRM_POLL_INTERVAL_MS,
  CONFIRM_POLL_TIMEOUT_MS,
  resetCheckoutReturn,
} from "@/lib/threshold/checkout-return";
import { payLinkEvents } from "@/lib/analytics/events";

import PayDeadPage from "../../dead/page";
import { InvoiceSheet } from "../invoice-sheet";
import { PayLinkBeacon } from "../pay-link-beacon";
import { DeadLink, SettlingSheet, WithdrawnSheet } from "../settling-sheet";
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

const TOKEN = "a".repeat(64);

function vale(
  overrides: Partial<InvoiceLinkPayload["invoice"]> = {},
): InvoiceLinkPayload {
  return {
    kind: "invoice",
    invoice: {
      number: "4",
      title: "Furnishings, second delivery",
      status: "partially_paid",
      issue_date: "2026-07-20",
      // Far future on purpose: the same 15 August the mockup draws, but a
      // date that has not passed, so `open` and `partly paid` are not silently
      // rendered as `past due` by the clock the suite happens to run under.
      due_date: "2099-08-15",
      paid_at: null,
      currency: "USD",
      subtotal_cents: 1_673_000,
      tax_cents: 0,
      tax_rate: 0,
      total_cents: 1_673_000,
      amount_paid_cents: 760_500,
      balance_cents: 912_500,
      memo: "The credenza left the bench on the 28th.",
      project_name: "The Vale residence",
      is_studio_invoice: false,
      ...overrides,
    },
    line_items: [
      {
        description: "Sconces — pair",
        quantity: 2,
        unit_amount_cents: 117_000,
        amount_cents: 234_000,
        kind: "product",
      },
    ],
    payments: [
      {
        amount_cents: 760_500,
        surcharge_cents: 0,
        method: "stripe",
        status: "succeeded",
        rail: "us_bank_account",
        received_at: "2026-08-05T12:00:00+00:00",
      },
    ],
    studio: {
      name: "Quist Interiors",
      logo_url: null,
      website: "quistinteriors.com",
      source: "project",
    },
    designer_display_name: "Nora Quist",
    client_display_name: "Harper Vale",
    payment_options: { card_surcharge_bps: 300, check_remit_to: null },
    pay: { rails: ["us_bank_account", "card", "check"], processing: false },
  };
}

/** Leah's studio invoice: $675.00, no house, nothing received. */
function studioInvoice(): InvoiceLinkPayload {
  const payload = vale();
  return {
    ...payload,
    invoice: {
      ...payload.invoice,
      number: "4",
      title: "Design consultation · June",
      status: "sent",
      due_date: null,
      subtotal_cents: 67_500,
      total_cents: 67_500,
      amount_paid_cents: 0,
      balance_cents: 67_500,
      project_name: null,
      is_studio_invoice: true,
    },
    line_items: [
      {
        description: "Design consultation, 3 hours",
        quantity: 1,
        unit_amount_cents: 67_500,
        amount_cents: 67_500,
        kind: "service",
      },
    ],
    payments: [],
    studio: {
      name: "Middle West Studio",
      logo_url: null,
      website: "middlewest.studio",
      source: "studio",
    },
    designer_display_name: "Leah Kochaver",
  };
}

function standAt(search: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      search,
      href: `https://client.test/pay/${TOKEN}${search}`,
      pathname: `/pay/${TOKEN}`,
      assign: jest.fn(),
    },
  });
}

beforeEach(() => {
  resetCheckoutReturn();
  standAt("");
  window.history.replaceState = jest.fn();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ url: "https://checkout.stripe.com/c/pay/cs_test_1" }),
  }) as unknown as typeof fetch;
});

function rowTotal(name: RegExp): string {
  const label = screen.getByRole("radio", { name }).closest("label");
  return within(label as HTMLElement).getByText(/^\$/).textContent ?? "";
}

describe("the three arrived-at totals", () => {
  it("quotes $9,130.00 / $9,398.75 / $9,125.00 on a $9,125.00 balance at 300 bps", () => {
    render(<InvoiceSheet token={TOKEN} payload={vale()} />);

    expect(screen.getByRole("radio", { name: /bank transfer/i })).toBeChecked();
    expect(rowTotal(/bank transfer/i)).toBe("$9,130.00");
    expect(rowTotal(/^card/i)).toBe("$9,398.75");
    expect(rowTotal(/mail a check/i)).toBe("$9,125.00");
    expect(
      screen.getByText("+ $5.00 · Bank transfer costs the least to process."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("+ $273.75 · This covers what card processing costs."),
    ).toBeInTheDocument();
    expect(screen.getByText("No fee.")).toBeInTheDocument();
  });

  it("quotes $680.00 / $695.25 / $675.00 on a $675.00 studio invoice — the cap, then the formula", () => {
    render(<InvoiceSheet token={TOKEN} payload={studioInvoice()} />);

    expect(rowTotal(/bank transfer/i)).toBe("$680.00");
    expect(rowTotal(/^card/i)).toBe("$695.25");
    expect(rowTotal(/mail a check/i)).toBe("$675.00");
  });
});

describe("the toggle moves the fee row, the total and the act together", () => {
  it("starts on bank transfer", () => {
    render(<InvoiceSheet token={TOKEN} payload={vale()} />);
    expect(
      within(screen.getByTestId("pay-fee-row")).getByText("Bank transfer fee"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("pay-fee-row")).getByText("$5.00"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("pay-total-row")).getByText("$9,130.00"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("pay-act")).toHaveTextContent("Pay $9,130.00");
  });

  it("moves all three to card", () => {
    render(<InvoiceSheet token={TOKEN} payload={vale()} />);
    fireEvent.click(screen.getByRole("radio", { name: /^card/i }));

    expect(
      within(screen.getByTestId("pay-fee-row")).getByText(
        "Card processing fee",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("pay-fee-row")).getByText("$273.75"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("pay-total-row")).getByText("$9,398.75"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("pay-act")).toHaveTextContent("Pay $9,398.75");
  });

  it("drops the fee row entirely on a check, and changes the act to a message", () => {
    render(<InvoiceSheet token={TOKEN} payload={vale()} />);
    fireEvent.click(screen.getByRole("radio", { name: /mail a check/i }));

    expect(screen.queryByTestId("pay-fee-row")).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("pay-total-row")).getByText("$9,125.00"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("pay-act")).toHaveTextContent(
      "Let Nora know a check is coming",
    );

    const panel = screen.getByTestId("pay-check-panel");
    expect(within(panel).getByText("Quist Interiors")).toBeInTheDocument();
    expect(
      within(panel).getByText("Contact your designer for mailing details"),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("Write Invoice No. 4 on the memo line."),
    ).toBeInTheDocument();
  });
});

describe("the one live region", () => {
  it("announces the pre-selected total on mount, then the one that moved", async () => {
    render(<InvoiceSheet token={TOKEN} payload={vale()} />);
    const live = screen.getByTestId("pay-live-region");
    expect(live).toHaveAttribute("aria-live", "polite");

    await waitFor(() =>
      expect(live).toHaveTextContent("Total to pay $9,130.00"),
    );

    fireEvent.click(screen.getByRole("radio", { name: /^card/i }));
    await waitFor(() =>
      expect(live).toHaveTextContent("Total to pay $9,398.75"),
    );
  });
});

describe("the states", () => {
  it("open — awaiting payment, due date said in words", () => {
    const payload = vale({
      status: "sent",
      amount_paid_cents: 0,
      balance_cents: 1_673_000,
    });
    payload.payments = [];
    render(<InvoiceSheet token={TOKEN} payload={payload} />);
    expect(
      screen.getByText("Awaiting payment · due 15 August"),
    ).toBeInTheDocument();
    expect(screen.getByText("No payments recorded yet.")).toBeInTheDocument();
  });

  it("partially paid — total and balance are visibly different numbers", () => {
    render(<InvoiceSheet token={TOKEN} payload={vale()} />);
    expect(screen.getByText("Partly paid · due 15 August")).toBeInTheDocument();
    expect(screen.getAllByText("$16,730.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$9,125.00").length).toBeGreaterThan(0);
    expect(screen.getByText("−$7,605.00")).toBeInTheDocument();
  });

  it("past due — how late, in days, in the same ink", () => {
    render(
      <InvoiceSheet token={TOKEN} payload={vale({ due_date: "2020-01-01" })} />,
    );
    expect(screen.getByText(/^Past due · \d+ days$/)).toBeInTheDocument();
  });

  it("processing — the chooser and the act are gone, the sentence stands", () => {
    const payload = vale();
    payload.pay.processing = true;
    payload.payments = [
      {
        amount_cents: 912_500,
        surcharge_cents: 500,
        method: "stripe",
        status: "pending",
        rail: "us_bank_account",
        received_at: null,
      },
    ];
    render(<InvoiceSheet token={TOKEN} payload={payload} />);

    expect(screen.getByTestId("pay-processing-notice")).toHaveTextContent(
      "Your bank transfer is on its way",
    );
    // P-1: a screen-only status sentence must not print into an accounting
    // inbox, where it reads as a claim about the document.
    expect(screen.getByTestId("pay-processing-notice")).toHaveAttribute(
      "data-pay-print",
      "hide",
    );
    expect(screen.queryByTestId("pay-chooser")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pay-act")).not.toBeInTheDocument();
    expect(screen.getByText("Payment processing")).toBeInTheDocument();
  });

  it("paid — a receipt, with the charged figure on the payment row", () => {
    const payload = vale({
      status: "paid",
      amount_paid_cents: 1_673_000,
      balance_cents: 0,
      paid_at: "2026-08-12T18:00:00+00:00",
    });
    payload.payments = [
      {
        amount_cents: 912_500,
        surcharge_cents: 500,
        method: "stripe",
        status: "succeeded",
        rail: "us_bank_account",
        received_at: "2026-08-12T18:00:00+00:00",
      },
    ];
    render(<InvoiceSheet token={TOKEN} payload={payload} />);

    expect(screen.getByText("Paid in full · 12 August")).toBeInTheDocument();
    expect(screen.queryByTestId("pay-chooser")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pay-total-row")).not.toBeInTheDocument();
    expect(screen.getAllByText("Balance").length).toBe(2);
    expect(
      screen.getByText(
        "Bank transfer · + $5.00 processing fee ($9,130.00 charged)",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Received 12 August 2026")).toBeInTheDocument();
  });

  it("studio invoice, no house — the title stands where a house name would", () => {
    render(<InvoiceSheet token={TOKEN} payload={studioInvoice()} />);
    expect(screen.getByText("from the studio")).toBeInTheDocument();
    expect(
      screen.getByText("Design consultation · June · from Leah Kochaver"),
    ).toBeInTheDocument();
    expect(screen.getByText("Awaiting payment")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Invoice No. 4" }),
    ).toBeInTheDocument();
  });

  it("returned cancelled — nothing was charged, and the notice can be put down", () => {
    standAt("?checkout=cancelled");
    render(<InvoiceSheet token={TOKEN} payload={vale()} />);

    const notice = screen.getByTestId("pay-return-notice");
    expect(notice).toHaveTextContent(
      "You left before paying. Nothing was charged.",
    );
    // The chooser is still there — she can pay after all.
    expect(screen.getByTestId("pay-chooser")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /dismiss this message/i }),
    );
    expect(screen.queryByTestId("pay-return-notice")).not.toBeInTheDocument();
  });

  it("returned confirming — the page waits and offers no second payment", () => {
    standAt("?checkout=success&session_id=cs_1");
    render(<InvoiceSheet token={TOKEN} payload={vale()} />);

    expect(screen.getByTestId("pay-return-notice")).toHaveTextContent(
      "Confirming your payment",
    );
    expect(screen.queryByTestId("pay-chooser")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pay-act")).not.toBeInTheDocument();
  });

  // T-5, first half: the state the brief singles out as behaviourally
  // load-bearing and which had no test at all.
  it("returned unconfirmed — says so, offers no second payment, and names the way out", async () => {
    jest.useFakeTimers();
    try {
      standAt("?checkout=success&session_id=cs_1");
      render(<InvoiceSheet token={TOKEN} payload={vale()} />);

      await act(async () => {
        jest.advanceTimersByTime(
          CONFIRM_POLL_TIMEOUT_MS + CONFIRM_POLL_INTERVAL_MS,
        );
      });

      const notice = screen.getByTestId("pay-return-notice");
      expect(notice).toHaveTextContent(
        "Checkout came back, but Patina hasn't confirmed a payment yet.",
      );
      // M-4: hiding the act is right; leaving the reader with no way forward
      // was not.
      expect(notice).toHaveTextContent("refresh this page in a minute");
      expect(screen.queryByTestId("pay-act")).not.toBeInTheDocument();
      expect(screen.queryByTestId("pay-chooser")).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  // T-5, second half: the poll answers, and the sheet becomes the receipt.
  it("returned confirmed — the poll settles it and the sheet becomes a receipt", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        kind: "invoice",
        status: "paid",
        amount_paid_cents: 1_673_000,
        balance_cents: 0,
        payments: [],
        processing: false,
      }),
    }) as unknown as typeof fetch;

    jest.useFakeTimers();
    try {
      standAt("?checkout=success&session_id=cs_1");
      render(
        <InvoiceSheet
          token={TOKEN}
          payload={vale({ paid_at: "2026-08-12T18:00:00+00:00" })}
        />,
      );

      // The wait is a 3s interval, not a microtask — the sheet reads its own
      // row rather than believing `?checkout=success`.
      await act(async () => {
        jest.advanceTimersByTime(CONFIRM_POLL_INTERVAL_MS + 1);
      });
      await act(async () => {});

      expect(global.fetch).toHaveBeenCalledWith(
        `/pay/${TOKEN}/state`,
        expect.objectContaining({ cache: "no-store" }),
      );
      expect(screen.getByText("Paid in full · 12 August")).toBeInTheDocument();
      expect(payLinkEvents.paymentCompleted).toHaveBeenCalled();
      expect(screen.queryByTestId("pay-return-notice")).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("the act", () => {
  it("opens Checkout with the chosen method and follows the URL", async () => {
    render(<InvoiceSheet token={TOKEN} payload={vale()} />);
    fireEvent.click(screen.getByRole("radio", { name: /^card/i }));

    await act(async () => {
      fireEvent.click(screen.getByTestId("pay-act"));
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `/pay/${TOKEN}/checkout`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ method: "card" }),
      }),
    );
    expect(window.location.assign).toHaveBeenCalledWith(
      "https://checkout.stripe.com/c/pay/cs_test_1",
    );
  });

  it("tells the designer a check is coming, once, and says so", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch;

    render(<InvoiceSheet token={TOKEN} payload={vale()} />);
    fireEvent.click(screen.getByRole("radio", { name: /mail a check/i }));

    await act(async () => {
      fireEvent.click(screen.getByTestId("pay-act"));
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `/pay/${TOKEN}/checkout`,
      expect.objectContaining({ body: JSON.stringify({ method: "check" }) }),
    );
    expect(screen.getByText("Nora has been notified.")).toBeInTheDocument();
    expect(screen.queryByTestId("pay-act")).not.toBeInTheDocument();
  });

  it("says a refusal in the house’s words and leaves the act takeable", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "invoice_link_not_payable" }),
    }) as unknown as typeof fetch;

    render(<InvoiceSheet token={TOKEN} payload={vale()} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("pay-act"));
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Unable to open the payment page just now.",
    );
    expect(screen.getByTestId("pay-act")).not.toBeDisabled();
  });
});

describe("the sheets with no act", () => {
  it("the dead link says one sentence and names nothing", () => {
    render(<DeadLink />);
    expect(screen.getByTestId("pay-dead-link")).toHaveTextContent(
      "This link is no longer good. If you were sent an invoice, ask the studio for a fresh link.",
    );
    // No letterhead, no number, no amount: void, revoked and never-existed
    // must be indistinguishable from each other.
    expect(screen.queryByText(/Quist Interiors/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Invoice No\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("the dead page is the same sheet", () => {
    render(<PayDeadPage />);
    expect(screen.getByTestId("pay-dead-link")).toBeInTheDocument();
  });

  it("the settling sheet gives a charged guest a name and an address", () => {
    render(
      <SettlingSheet
        payload={{
          kind: "settling",
          invoice: { number: "4" },
          studio: {
            name: "Quist Interiors",
            logo_url: null,
            website: "quistinteriors.com",
            source: "project",
          },
          designer_display_name: "Nora Quist",
        }}
      />,
    );

    const sheet = screen.getByTestId("pay-settling-sheet");
    expect(
      within(sheet).getByRole("heading", { name: "Invoice No. 4" }),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText(
        "A payment on this invoice is being sorted out by Quist Interiors.",
      ),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText(
        /Nora Quist · quistinteriors\.com · There is nothing to pay here/,
      ),
    ).toBeInTheDocument();
    // No amounts, no chooser, no act.
    expect(within(sheet).queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("pay-chooser")).not.toBeInTheDocument();
  });

  it("the withdrawn sheet says who withdrew it (K5)", () => {
    render(
      <WithdrawnSheet
        payload={{
          kind: "withdrawn",
          invoice: { number: "4", title: "Furnishings, second delivery" },
          studio: {
            name: "Quist Interiors",
            logo_url: null,
            website: "quistinteriors.com",
            source: "project",
          },
          designer_display_name: "Nora Quist",
          contact: null,
        }}
      />,
    );

    const sheet = screen.getByTestId("pay-withdrawn-sheet");
    expect(
      within(sheet).getByText(
        "Invoice No. 4 was withdrawn by Quist Interiors.",
      ),
    ).toBeInTheDocument();
    expect(within(sheet).queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("pay-act")).not.toBeInTheDocument();
  });

  it("falls back to the contact when the withdrawn payload names no designer", () => {
    render(
      <WithdrawnSheet
        payload={{
          kind: "withdrawn",
          invoice: { number: null, title: null },
          studio: { name: null, logo_url: null, website: null, source: null },
          designer_display_name: null,
          contact: { name: "Nora Quist", website: "quistinteriors.com" },
        }}
      />,
    );
    expect(
      screen.getByText("Invoice was withdrawn by the studio."),
    ).toBeInTheDocument();
    expect(screen.getByText("prepared by Nora Quist")).toBeInTheDocument();
  });
});

// S-5: `deadLink`, `settling` and `rateLimitBindingMissing` were declared in
// §9 and unreachable — the terminal sheets are server components with no
// browser analytics path, and there is no server-side PostHog client in this
// portal. The beacon is the mouth they were missing.
describe("PayLinkBeacon", () => {
  it("reports a dead sheet, and nothing else", () => {
    render(<PayLinkBeacon sheet="dead" />);
    expect(payLinkEvents.deadLink).toHaveBeenCalledTimes(1);
    expect(payLinkEvents.settling).not.toHaveBeenCalled();
    expect(payLinkEvents.rateLimitBindingMissing).not.toHaveBeenCalled();
  });

  it("reports a settling sheet", () => {
    render(<PayLinkBeacon sheet="settling" />);
    expect(payLinkEvents.settling).toHaveBeenCalledTimes(1);
    expect(payLinkEvents.deadLink).not.toHaveBeenCalled();
  });

  it("carries S4's other half — the limiter binding is absent in production", () => {
    render(<PayLinkBeacon limiterMissing />);
    expect(payLinkEvents.rateLimitBindingMissing).toHaveBeenCalledTimes(1);
  });

  it("says nothing on an ordinary payable sheet", () => {
    render(<PayLinkBeacon />);
    expect(payLinkEvents.deadLink).not.toHaveBeenCalled();
    expect(payLinkEvents.settling).not.toHaveBeenCalled();
    expect(payLinkEvents.rateLimitBindingMissing).not.toHaveBeenCalled();
  });

  it("renders nothing at all", () => {
    const { container } = render(<PayLinkBeacon sheet="dead" />);
    expect(container).toBeEmptyDOMElement();
  });
});
