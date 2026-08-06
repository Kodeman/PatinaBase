import { GET } from "../route";
import { signResolvedPlanPrint } from "../../../plan-transmittal";

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
jest.mock("../../../plan-transmittal", () => ({
  signResolvedPlanPrint: jest.fn(),
}));

const TOKEN = "a".repeat(64);
const PRINT_ID = "50000000-0000-4000-8000-000000000001";

describe("GET /plans/[token]/print/[printId]", () => {
  beforeEach(() => {
    jest.mocked(signResolvedPlanPrint).mockReset();
  });

  it("redirects a valid view request to the short-lived signed URL with private headers", async () => {
    jest.mocked(signResolvedPlanPrint).mockResolvedValue({
      signedUrl: "https://storage.example.test/object?token=signed",
    });

    const response = await GET(
      {
        url: `https://client.patina.test/plans/${TOKEN}/print/${PRINT_ID}`,
      } as Request,
      { params: Promise.resolve({ token: TOKEN, printId: PRINT_ID }) },
    );

    expect(signResolvedPlanPrint).toHaveBeenCalledWith(TOKEN, PRINT_ID, false);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://storage.example.test/object?token=signed",
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("passes the explicit download request into signing", async () => {
    jest.mocked(signResolvedPlanPrint).mockResolvedValue({
      signedUrl: "https://storage.example.test/download?token=signed",
    });

    await GET(
      {
        url: `https://client.patina.test/plans/${TOKEN}/print/${PRINT_ID}?download=1`,
      } as Request,
      { params: Promise.resolve({ token: TOKEN, printId: PRINT_ID }) },
    );

    expect(signResolvedPlanPrint).toHaveBeenCalledWith(TOKEN, PRINT_ID, true);
  });

  it.each(["malformed", "expired", "revoked", "unknown-print", "not-ready"])(
    "redirects a %s request to the dead-link page with private headers",
    async () => {
      jest.mocked(signResolvedPlanPrint).mockResolvedValue(null);

      const response = await GET(
        {
          url: `https://client.patina.test/plans/${TOKEN}/print/${PRINT_ID}`,
        } as Request,
        { params: Promise.resolve({ token: TOKEN, printId: PRINT_ID }) },
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        `https://client.patina.test/plans/${TOKEN}?unavailable=1`,
      );
      expect(response.headers.get("cache-control")).toBe(
        "private, no-store, max-age=0",
      );
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    },
  );
});
