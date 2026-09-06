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
  resetLimiterAbsenceReport,
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
    kind: "invoice",
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
        attribution: "Bertoia Studio",
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
      location: "Providence, RI",
    },
    designer_display_name: "Nora Quist",
    client_display_name: "Harper Vale",
    payment_options: { card_surcharge_bps: 300, check_remit_to: null },
    pay: {
      rails: ["us_bank_account", "card", "check"],
      processing: false,
      payable: true,
    },
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

  // S-7: families, not just spellings. `stripe_account` and `stripe_status`
  // are neither listed nor `_id`-suffixed, and `client_email` is not `email`.
  it("finds whole families the exact list does not name", () => {
    for (const key of [
      "stripe_account",
      "stripe_status",
      "client_email",
      "payer_name",
      "billing_email",
    ]) {
      expect(carriesForbiddenKey({ studio: { [key]: "x" } })).toBe(true);
    }
  });

  it("passes the contract payload untouched", () => {
    expect(carriesForbiddenKey(valePayload())).toBe(false);
    // The legitimate keys nearest those families must survive.
    for (const key of [
      "payment_options",
      "paid_at",
      "project_name",
      "client_display_name",
      "payments",
    ]) {
      expect(carriesForbiddenKey({ [key]: "x" })).toBe(false);
    }
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

  // S-8: taking [0] from a multi-row response would drop the rest WITHOUT the
  // forbidden-key walk ever seeing them.
  it("refuses a multi-row response rather than reading the first row", () => {
    expect(parseResolvedInvoiceLink([valePayload(), valePayload()])).toBeNull();
    expect(parseResolvedInvoiceLink([])).toBeNull();
  });

  // I-4: 00574 pinned `kind` as the discriminator and emits `sheet` alongside
  // as an alias. Only `kind` is read — but a payload claiming to be two
  // different sheets at once is incoherent and dies whole.
  it("refuses a payload carrying both spellings with different values", () => {
    const confused = { ...valePayload(), kind: "settling" };
    expect(parseResolvedInvoiceLink(confused)).toBeNull();
  });

  // J30(a): `kind` is the SOLE discriminator. A payload carrying `sheet` but
  // no `kind` at all must not fall back to reading `sheet` in its place.
  it("refuses a payload carrying only `sheet`, with no `kind` at all", () => {
    const onlySheet = valePayload() as Record<string, unknown>;
    delete onlySheet.kind;
    expect(parseResolvedInvoiceLink(onlySheet)).toBeNull();
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
      kind: "settling",
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
      contact: {
        designer_display_name: "Nora Quist",
        studio_name: "Quist Interiors",
        website: "quistinteriors.com",
      },
    });
    expect(parsed?.kind).toBe("withdrawn");
  });

  it("refuses anything that is not one of the three sheets", () => {
    expect(parseResolvedInvoiceLink(null)).toBeNull();
    expect(parseResolvedInvoiceLink("nope")).toBeNull();
    expect(
      parseResolvedInvoiceLink({ kind: "something-else", studio: {} }),
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
  it("opens in development when no Worker binding is reachable, and says so", async () => {
    await expect(payLinkRequestAllowed(new Headers())).resolves.toEqual({
      allowed: true,
      limiterMissing: true,
    });
  });

  // S-6: a typo'd binding name in production would otherwise write one error
  // line per page view, per state poll (every 3s during a return) and per
  // checkout. Flooding a log is the same thing as saying nothing.
  it("reports an absent binding once per isolate, not once per request", async () => {
    const previous = process.env.NODE_ENV;
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
    });
    resetLimiterAbsenceReport();

    await payLinkRequestAllowed(new Headers());
    await payLinkRequestAllowed(new Headers());
    await payLinkRequestAllowed(new Headers());

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("pay_link_ratelimit_missing");

    spy.mockRestore();
    Object.defineProperty(process.env, "NODE_ENV", {
      value: previous,
      configurable: true,
    });
    resetLimiterAbsenceReport();
  });
});
