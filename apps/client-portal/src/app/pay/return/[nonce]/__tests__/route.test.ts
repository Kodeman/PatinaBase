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

/** §2.6's single-purpose RPC — one call, a `text` return, no embed. */
function stubClient(token: unknown, error: unknown = null) {
  const rpc = jest.fn().mockResolvedValue({ data: token, error });
  jest.mocked(createServiceClient).mockReturnValue({ rpc } as never);
  return { rpc };
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
  jest
    .mocked(payLinkRequestAllowed)
    .mockResolvedValue({ allowed: true, limiterMissing: false });
});

describe("GET /pay/return/[nonce]", () => {
  it("303s to the sheet, carrying the return params Stripe sent", async () => {
    const chain = stubClient(TOKEN);

    const response = await call(
      "?checkout=success&session_id=cs_1&payment_id=pay_1",
    );

    // S-1: the designed single-purpose RPC, not a hand-rolled embed whose
    // object-vs-array shape nothing proves.
    expect(chain.rpc).toHaveBeenCalledWith("resolve_invoice_return_nonce", {
      p_nonce: NONCE,
    });
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
    stubClient(TOKEN);
    const response = await call("?checkout=cancelled");
    const location = new URL(response.headers.get("location") as string);
    expect(location.searchParams.get("checkout")).toBe("cancelled");
  });

  it("drops anything else appended to the return address", async () => {
    stubClient(TOKEN);
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

    jest
      .mocked(payLinkRequestAllowed)
      .mockResolvedValue({ allowed: false, limiterMissing: false });
    const limited = await call("?checkout=success");
    expect(limited.headers.get("location")).toBe(
      "https://client.patina.test/pay/dead",
    );
  });

  it("never 303s to something that is not a token", async () => {
    stubClient("https://elsewhere.test");
    const response = await call("?checkout=success");
    expect(response.headers.get("location")).toBe(
      "https://client.patina.test/pay/dead",
    );
  });
});
