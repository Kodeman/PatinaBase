/**
 * The payload parser is the second of the two enforcements on §3.1's forbidden
 * key list (the first is a SQL assertion). A payload that smuggles one in —
 * under any spelling, at ANY depth — is not the resolver speaking, and the
 * page dies whole rather than rendering a sheet that leaks.
 */

import {
  carriesForbiddenKey,
  parseResolvedInvoiceLink,
  payLinkRequestAllowed,
  resolveInvoiceLink,
  INVOICE_LINK_TOKEN_PATTERN,
} from "../invoice-link";

jest.mock("server-only", () => ({}));
jest.mock("@patina/supabase/server", () => ({
  createServiceClient: jest.fn(),
}));

const TOKEN = "a".repeat(64);

function valePayload() {
  return {
    sheet: "invoice",
    invoice: {
      number: "4",
      title: "Furnishings, second delivery",
      status: "partially_paid",
      issue_date: "2026-07-20",
      due_date: "2026-08-15",
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

describe("the token gate", () => {
  it("accepts exactly 64 lowercase hex and nothing else", () => {
    expect(INVOICE_LINK_TOKEN_PATTERN.test(TOKEN)).toBe(true);
    expect(INVOICE_LINK_TOKEN_PATTERN.test("A".repeat(64))).toBe(false);
    expect(INVOICE_LINK_TOKEN_PATTERN.test("a".repeat(63))).toBe(false);
    expect(INVOICE_LINK_TOKEN_PATTERN.test("not-a-token")).toBe(false);
  });
});

describe("carriesForbiddenKey", () => {
  it("finds a named forbidden key nested inside an array of objects", () => {
    expect(
      carriesForbiddenKey({
        payments: [{ amount_cents: 1, recorded_by: "someone" }],
      }),
    ).toBe(true);
  });

  it("finds an identifier key at depth, in either spelling", () => {
    expect(
      carriesForbiddenKey({ invoice: { number: "4", invoice_id: "x" } }),
    ).toBe(true);
    expect(carriesForbiddenKey({ studio: { studioId: "x" } })).toBe(true);
    expect(carriesForbiddenKey({ a: { b: { c: { id: "x" } } } })).toBe(true);
  });

  it("finds the stripe and dunning keys the invoice row carries internally", () => {
    for (const key of [
      "stripe_customer_id",
      "stripe_checkout_session_id",
      "payer_email",
      "internal_notes",
      "void_reason",
      "ar_last_chased_at",
      "reminder_count",
      "token",
      "return_nonce",
    ]) {
      expect(carriesForbiddenKey({ invoice: { [key]: "x" } })).toBe(true);
    }
  });

  it("passes the contract payload untouched", () => {
    expect(carriesForbiddenKey(valePayload())).toBe(false);
  });
});

describe("parseResolvedInvoiceLink", () => {
  it("parses the payable sheet", () => {
    const parsed = parseResolvedInvoiceLink(valePayload());
    expect(parsed?.kind).toBe("invoice");
    expect(parsed && "invoice" in parsed && parsed.invoice.balance_cents).toBe(
      912_500,
    );
  });

  it("unwraps a single-row array, as PostgREST returns it", () => {
    expect(parseResolvedInvoiceLink([valePayload()])?.kind).toBe("invoice");
  });

  it("kills a payload carrying a forbidden key at depth", () => {
    const leaky = valePayload();
    (leaky.payments[0] as Record<string, unknown>).recorded_by = "a-user";
    expect(parseResolvedInvoiceLink(leaky)).toBeNull();
  });

  it("kills a payload whose card rate is missing — there is no unknown-rate state", () => {
    const broken = valePayload();
    (broken.payment_options as Record<string, unknown>).card_surcharge_bps =
      null;
    expect(parseResolvedInvoiceLink(broken)).toBeNull();
  });

  it("kills a payload with an unknown invoice status", () => {
    const broken = valePayload();
    (broken.invoice as Record<string, unknown>).status = "void";
    expect(parseResolvedInvoiceLink(broken)).toBeNull();
  });

  it("parses the settling sheet", () => {
    const parsed = parseResolvedInvoiceLink({
      sheet: "settling",
      invoice: { number: "4" },
      studio: {
        name: "Quist Interiors",
        logo_url: null,
        website: "quistinteriors.com",
        source: "project",
      },
      designer_display_name: "Nora Quist",
    });
    expect(parsed?.kind).toBe("settling");
  });

  it("parses the withdrawn sheet, spelled with `kind` as K5 spells it", () => {
    const parsed = parseResolvedInvoiceLink({
      kind: "withdrawn",
      invoice: { number: "4", title: "Furnishings, second delivery" },
      studio: {
        name: "Quist Interiors",
        logo_url: null,
        website: "quistinteriors.com",
        source: "project",
      },
      designer_display_name: "Nora Quist",
      contact: { name: "Nora Quist", website: "quistinteriors.com" },
    });
    expect(parsed?.kind).toBe("withdrawn");
  });

  it("refuses anything that is not one of the three sheets", () => {
    expect(parseResolvedInvoiceLink(null)).toBeNull();
    expect(parseResolvedInvoiceLink("nope")).toBeNull();
    expect(
      parseResolvedInvoiceLink({ sheet: "something-else", studio: {} }),
    ).toBeNull();
  });
});

describe("resolveInvoiceLink", () => {
  it("refuses a malformed token before any round trip", async () => {
    const rpc = jest.fn();
    const client = { rpc } as never;
    expect(await resolveInvoiceLink("not-a-token", { client })).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("records a view by default and never on the state poll", async () => {
    const rpc = jest
      .fn()
      .mockResolvedValue({ data: valePayload(), error: null });
    const client = { rpc } as never;

    await resolveInvoiceLink(TOKEN, { client });
    expect(rpc).toHaveBeenLastCalledWith("resolve_invoice_link", {
      p_token: TOKEN,
      p_record_view: true,
    });

    await resolveInvoiceLink(TOKEN, { client, recordView: false });
    expect(rpc).toHaveBeenLastCalledWith("resolve_invoice_link", {
      p_token: TOKEN,
      p_record_view: false,
    });
  });

  it("dies quietly on an RPC error and on a throw", async () => {
    const failing = {
      rpc: jest.fn().mockResolvedValue({ data: null, error: { message: "x" } }),
    };
    expect(
      await resolveInvoiceLink(TOKEN, { client: failing as never }),
    ).toBeNull();

    const throwing = { rpc: jest.fn().mockRejectedValue(new Error("network")) };
    expect(
      await resolveInvoiceLink(TOKEN, { client: throwing as never }),
    ).toBeNull();
  });
});

describe("payLinkRequestAllowed", () => {
  it("opens in development when no Worker binding is reachable", async () => {
    await expect(payLinkRequestAllowed(new Headers())).resolves.toBe(true);
  });
});
