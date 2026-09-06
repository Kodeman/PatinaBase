/**
 * The one hop between the browser and the guest endpoint. It carries the anon
 * key and the portal's own Origin — the two things the function's non-wildcard
 * CORS check needs — and it hands the function's refusals back VERBATIM: the
 * function is the authority on why a checkout was refused.
 */

import { POST } from "../checkout/route";
import { payLinkRequestAllowed } from "../invoice-link";

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
  INVOICE_LINK_TOKEN_PATTERN: /^[0-9a-f]{64}$/,
  payLinkRequestAllowed: jest.fn(),
}));

const TOKEN = "a".repeat(64);

type FakeResponse = {
  status: number;
  body: Record<string, unknown>;
  headers: { get(name: string): string | null };
};

function call(body: unknown, token = TOKEN): Promise<FakeResponse> {
  return POST(
    {
      url: `https://client.patina.test/pay/${token}/checkout`,
      headers: new Headers(),
      json: async () => body,
    } as unknown as Request,
    { params: Promise.resolve({ token }) },
  ) as unknown as Promise<FakeResponse>;
}

const OLD_ENV = process.env;

beforeEach(() => {
  jest
    .mocked(payLinkRequestAllowed)
    .mockResolvedValue({ allowed: true, limiterMissing: false });
  process.env = {
    ...OLD_ENV,
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.test",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    NEXT_PUBLIC_APP_URL: "https://client.patina.cloud",
  };
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ url: "https://checkout.stripe.com/c/pay/cs_test_1" }),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  process.env = OLD_ENV;
});

describe("POST /pay/[token]/checkout", () => {
  it("calls the guest function with the token and the anon key, and NO Origin", async () => {
    const response = await call({ method: "us_bank_account" });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://project.supabase.test/functions/v1/invoice-link-checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: TOKEN, method: "us_bank_account" }),
        headers: expect.objectContaining({
          apikey: "anon-key",
          Authorization: "Bearer anon-key",
        }),
      }),
    );
    // S-4: the function's Origin-ABSENT branch is the designed path for this
    // server-side hop. Sending one would make every guest checkout depend on
    // NEXT_PUBLIC_APP_URL byte-matching the function's CLIENT_PORTAL_URL
    // secret in all three environments — one trailing slash and the till 403s.
    const sentHeaders = (global.fetch as jest.Mock).mock.calls[0][1]
      .headers as Record<string, string>;
    expect(Object.keys(sentHeaders)).not.toContain("Origin");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
    });
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });

  it("accepts all three rails and refuses anything else", async () => {
    for (const method of ["card", "us_bank_account", "check"]) {
      const ok = await call({ method });
      expect(ok.status).toBe(200);
    }
    const bad = await call({ method: "bitcoin" });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: "bad_payment_method" });

    const missing = await call({});
    expect(missing.status).toBe(400);
  });

  it("hands the function’s refusal back with its own status and code", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: "invoice_checkout_in_progress",
        detail: "processing",
      }),
    }) as unknown as typeof fetch;

    const response = await call({ method: "card" });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "invoice_checkout_in_progress",
      detail: "processing",
    });
  });

  it("answers a malformed token and an over-limit request identically, without calling out", async () => {
    const malformed = await call({ method: "card" }, "not-a-token");
    expect(malformed.status).toBe(404);
    expect(malformed.body).toEqual({ error: "invoice_not_found" });

    jest
      .mocked(payLinkRequestAllowed)
      .mockResolvedValue({ allowed: false, limiterMissing: false });
    const limited = await call({ method: "card" });
    expect(limited.status).toBe(404);
    expect(limited.body).toEqual({ error: "invoice_not_found" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not throw when the network does", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("unreachable")) as unknown as typeof fetch;
    const response = await call({ method: "card" });
    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "stripe_error" });
  });
});
