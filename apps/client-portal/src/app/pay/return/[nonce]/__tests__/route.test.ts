/**
 * S10 — Stripe never sees the token. It is handed a single-purpose nonce, and
 * this route trades it back at the moment the guest returns. A nonce that names
 * nothing lands on the same dead sheet a guessed token does.
 *
 * R-BT: the trade happens ONCE. The RPC answers jsonb — `rotated` with the
 * fresh address, `spent` on any replay, NULL for anything it will not name —
 * and a spent nonce lands on /pay/used, which is readable, rather than killing
 * the address the first return handed the browser.
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

/** §2.6's single-purpose RPC — one call, a jsonb return, no embed. */
function stubClient(answer: unknown, error: unknown = null) {
  const rpc = jest.fn().mockResolvedValue({ data: answer, error });
  jest.mocked(createServiceClient).mockReturnValue({ rpc } as never);
  return { rpc };
}

/** The first resolution: the link was re-addressed and this is the address. */
const rotated = (token = TOKEN) => ({ state: "rotated", token });

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
    const chain = stubClient(rotated());

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

  it("carries whatever checkout marker rides along", async () => {
    // Stripe's cancel_url no longer points here (R-BT) — the marker is still
    // copied through rather than filtered, because the sheet reads it.
    stubClient(rotated());
    const response = await call("?checkout=cancelled");
    const location = new URL(response.headers.get("location") as string);
    expect(location.searchParams.get("checkout")).toBe("cancelled");
  });

  it("sends a spent nonce to /pay/used, and rotates nothing", async () => {
    const chain = stubClient({ state: "spent" });

    const response = await call("?checkout=success&session_id=cs_1");

    expect(chain.rpc).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://client.patina.test/pay/used",
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });

  it("drops anything else appended to the return address", async () => {
    stubClient(rotated());
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
    stubClient(rotated("https://elsewhere.test"));
    const response = await call("?checkout=success");
    expect(response.headers.get("location")).toBe(
      "https://client.patina.test/pay/dead",
    );
  });

  it("treats a shapeless answer as dead, not as a rotation", async () => {
    stubClient(TOKEN);
    const legacy = await call("?checkout=success");
    expect(legacy.headers.get("location")).toBe(
      "https://client.patina.test/pay/dead",
    );

    stubClient({ state: "rotated" });
    const tokenless = await call("?checkout=success");
    expect(tokenless.headers.get("location")).toBe(
      "https://client.patina.test/pay/dead",
    );
  });
});
