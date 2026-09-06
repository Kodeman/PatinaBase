/**
 * S10 — Stripe never sees the token. It is handed a single-purpose nonce, and
 * this route trades it back at the moment the guest returns. A nonce that names
 * nothing lands on the same dead sheet a guessed token does.
 */

import { GET } from "../route";
import { createServiceClient } from "@patina/supabase/server";
import { payLinkRequestAllowed } from "../../../[token]/invoice-link";

jest.mock("next/server", () => ({
  NextResponse: {
    redirect: (
      url: URL | string,
      init: { status: number; headers: Record<string, string> },
    ) => {
      const headers = new Map(
        Object.entries({ ...init.headers, location: url.toString() }).map(
          ([key, value]) => [key.toLowerCase(), value],
        ),
      );
      return {
        status: init.status,
        headers: {
          get: (name: string) => headers.get(name.toLowerCase()) ?? null,
        },
      };
    },
  },
}));
jest.mock("@patina/supabase/server", () => ({
  createServiceClient: jest.fn(),
}));
jest.mock("../../../[token]/invoice-link", () => ({
  payLinkRequestAllowed: jest.fn(),
}));

const NONCE = "b".repeat(64);
const TOKEN = "a".repeat(64);

type FakeResponse = {
  status: number;
  headers: { get(name: string): string | null };
};

/** The two-`eq` + maybeSingle chain the route walks. */
function stubClient(row: unknown) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null });
  const eqLink = jest.fn(() => ({ maybeSingle }));
  const eqNonce = jest.fn(() => ({ eq: eqLink }));
  const select = jest.fn(() => ({ eq: eqNonce }));
  const from = jest.fn(() => ({ select }));
  jest.mocked(createServiceClient).mockReturnValue({ from } as never);
  return { from, select, eqNonce, eqLink };
}

function call(search = "", nonce = NONCE): Promise<FakeResponse> {
  return GET(
    {
      url: `https://client.patina.test/pay/return/${nonce}${search}`,
      headers: new Headers(),
    } as Request,
    { params: Promise.resolve({ nonce }) },
  ) as unknown as Promise<FakeResponse>;
}

beforeEach(() => {
  jest.mocked(payLinkRequestAllowed).mockResolvedValue(true);
});

describe("GET /pay/return/[nonce]", () => {
  it("303s to the sheet, carrying the return params Stripe sent", async () => {
    const chain = stubClient({
      invoice_links: { token: TOKEN, status: "active" },
    });

    const response = await call(
      "?checkout=success&session_id=cs_1&payment_id=pay_1",
    );

    expect(chain.from).toHaveBeenCalledWith("invoice_checkout_attempts");
    expect(chain.eqNonce).toHaveBeenCalledWith("return_nonce", NONCE);
    expect(chain.eqLink).toHaveBeenCalledWith("invoice_links.status", "active");
    expect(response.status).toBe(303);

    const location = new URL(response.headers.get("location") as string);
    expect(location.pathname).toBe(`/pay/${TOKEN}`);
    expect(location.searchParams.get("checkout")).toBe("success");
    expect(location.searchParams.get("session_id")).toBe("cs_1");
    expect(location.searchParams.get("payment_id")).toBe("pay_1");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });

  it("carries a cancelled return the same way", async () => {
    stubClient({ invoice_links: { token: TOKEN, status: "active" } });
    const response = await call("?checkout=cancelled");
    const location = new URL(response.headers.get("location") as string);
    expect(location.searchParams.get("checkout")).toBe("cancelled");
  });

  it("drops anything else appended to the return address", async () => {
    stubClient({ invoice_links: { token: TOKEN, status: "active" } });
    const response = await call(
      "?checkout=success&next=https%3A%2F%2Felsewhere.test&foo=bar",
    );
    const location = new URL(response.headers.get("location") as string);
    expect(location.searchParams.get("next")).toBeNull();
    expect(location.searchParams.get("foo")).toBeNull();
  });

  it("sends an unknown, a malformed and an over-limit nonce to the same dead sheet", async () => {
    stubClient(null);
    const unknown = await call("?checkout=success");
    expect(unknown.status).toBe(303);
    expect(unknown.headers.get("location")).toBe(
      "https://client.patina.test/pay/dead",
    );

    const malformed = await call("?checkout=success", "not-a-nonce");
    expect(malformed.headers.get("location")).toBe(
      "https://client.patina.test/pay/dead",
    );

    jest.mocked(payLinkRequestAllowed).mockResolvedValue(false);
    const limited = await call("?checkout=success");
    expect(limited.headers.get("location")).toBe(
      "https://client.patina.test/pay/dead",
    );
  });

  it("never 303s to something that is not a token", async () => {
    stubClient({
      invoice_links: { token: "https://elsewhere.test", status: "active" },
    });
    const response = await call("?checkout=success");
    expect(response.headers.get("location")).toBe(
      "https://client.patina.test/pay/dead",
    );
  });
});
