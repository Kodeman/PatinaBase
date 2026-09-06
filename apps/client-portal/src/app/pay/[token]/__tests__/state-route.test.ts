/**
 * `state` was the cheaper, uncounted oracle (S2): it re-reads the same link the
 * page does, so it carries the same limiter and never records a view. It also
 * returns the moving parts ONLY — the record, the studio and the payment
 * options never travel a second time.
 */

import { GET } from "../state/route";
import { payLinkRequestAllowed, resolveInvoiceLink } from "../invoice-link";

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      body: unknown,
      init?: { status?: number; headers?: Record<string, string> },
    ) => {
      const headers = new Map(
        Object.entries(init?.headers ?? {}).map(([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      );
      return {
        status: init?.status ?? 200,
        body,
        headers: {
          get: (name: string) => headers.get(name.toLowerCase()) ?? null,
        },
      };
    },
  },
}));
jest.mock("../invoice-link", () => ({
  payLinkRequestAllowed: jest.fn(),
  resolveInvoiceLink: jest.fn(),
}));

const TOKEN = "a".repeat(64);

type FakeResponse = {
  status: number;
  body: Record<string, unknown>;
  headers: { get(name: string): string | null };
};

function call(): Promise<FakeResponse> {
  return GET(
    {
      url: `https://client.patina.test/pay/${TOKEN}/state`,
      headers: new Headers(),
    } as Request,
    { params: Promise.resolve({ token: TOKEN }) },
  ) as unknown as Promise<FakeResponse>;
}

const payable = {
  kind: "invoice" as const,
  invoice: {
    status: "partially_paid",
    amount_paid_cents: 760_500,
    balance_cents: 912_500,
    memo: "never travels twice",
  },
  payments: [{ amount_cents: 760_500, status: "succeeded" }],
  pay: { rails: ["us_bank_account", "card", "check"], processing: false },
  studio: { name: "Quist Interiors" },
};

beforeEach(() => {
  jest
    .mocked(payLinkRequestAllowed)
    .mockResolvedValue({ allowed: true, limiterMissing: false });
  jest.mocked(resolveInvoiceLink).mockReset();
});

describe("GET /pay/[token]/state", () => {
  it("re-resolves WITHOUT recording a view, and returns only the moving parts", async () => {
    jest.mocked(resolveInvoiceLink).mockResolvedValue(payable as never);

    const response = await call();

    expect(resolveInvoiceLink).toHaveBeenCalledWith(TOKEN, {
      recordView: false,
    });
    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual([
      "amount_paid_cents",
      "balance_cents",
      "kind",
      "payments",
      "processing",
      "status",
    ]);
    expect(response.body.status).toBe("partially_paid");
    expect(response.body.balance_cents).toBe(912_500);
    // I-7: `processing` is server-authoritative on the poll as well as on the
    // SSR payload, so the sheet reads one definition of the word, not two.
    expect(response.body.processing).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain("never travels twice");
    expect(JSON.stringify(response.body)).not.toContain("Quist Interiors");
  });

  it("answers a dead link with the same 404 an over-limit request gets", async () => {
    jest.mocked(resolveInvoiceLink).mockResolvedValue(null);
    const dead = await call();
    expect(dead.status).toBe(404);
    expect(dead.body).toEqual({ error: "invoice_not_found" });

    jest
      .mocked(payLinkRequestAllowed)
      .mockResolvedValue({ allowed: false, limiterMissing: false });
    const limited = await call();
    expect(limited.status).toBe(404);
    expect(limited.body).toEqual({ error: "invoice_not_found" });
    // Over-limit never reaches the database.
    expect(resolveInvoiceLink).toHaveBeenCalledTimes(1);
  });

  it("names a terminal sheet and nothing else", async () => {
    jest
      .mocked(resolveInvoiceLink)
      .mockResolvedValue({ kind: "settling" } as never);
    const response = await call();
    expect(response.body).toEqual({ kind: "settling" });
  });

  it("is never stored by anything in between", async () => {
    jest.mocked(resolveInvoiceLink).mockResolvedValue(payable as never);
    const response = await call();
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
