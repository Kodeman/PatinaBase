import { GET } from "../route";
import { signResolvedSpecBookArtifact } from "../../spec-book-share";

jest.mock("next/server", () => ({
  NextResponse: {
    redirect: (
      url: URL,
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
jest.mock("../../spec-book-share", () => ({
  signResolvedSpecBookArtifact: jest.fn(),
}));

const TOKEN = "a".repeat(64);

describe("GET /field/spec-book/[token]/download", () => {
  beforeEach(() => {
    jest.mocked(signResolvedSpecBookArtifact).mockReset();
  });

  it("redirects a valid view request to the short-lived signed URL with private headers", async () => {
    jest.mocked(signResolvedSpecBookArtifact).mockResolvedValue({
      signedUrl: "https://storage.example.test/object?token=signed",
      title: "Client edition",
    });

    const response = await GET(
      {
        url: `https://client.patina.test/field/spec-book/${TOKEN}/download`,
      } as Request,
      { params: Promise.resolve({ token: TOKEN }) },
    );

    expect(signResolvedSpecBookArtifact).toHaveBeenCalledWith(TOKEN, false);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://storage.example.test/object?token=signed",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("passes the explicit download request into signing", async () => {
    jest.mocked(signResolvedSpecBookArtifact).mockResolvedValue({
      signedUrl: "https://storage.example.test/download?token=signed",
      title: "Client edition",
    });

    await GET(
      {
        url: `https://client.patina.test/field/spec-book/${TOKEN}/download?download=1`,
      } as Request,
      { params: Promise.resolve({ token: TOKEN }) },
    );

    expect(signResolvedSpecBookArtifact).toHaveBeenCalledWith(TOKEN, true);
  });

  it.each(["malformed", "expired", "revoked", "wrong-audience", "non-ready"])(
    "redirects a %s request to the same dead-link UI",
    async () => {
      jest.mocked(signResolvedSpecBookArtifact).mockResolvedValue(null);

      const response = await GET(
        {
          url: `https://client.patina.test/field/spec-book/${TOKEN}/download`,
        } as Request,
        { params: Promise.resolve({ token: TOKEN }) },
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        `https://client.patina.test/field/spec-book/${TOKEN}?unavailable=1`,
      );
    },
  );
});
