import { GET, appleAppSiteAssociation } from "../route";
import { NextResponse } from "next/server";

jest.mock("next/server", () => ({
  NextResponse: jest.fn(function NextResponse(
    body: string,
    init: { status: number; headers: Record<string, string> },
  ) {
    return {
      body,
      status: init.status,
      headers: { get: (name: string) => init.headers[name] ?? null },
    };
  }),
}));

describe("Apple App Site Association", () => {
  beforeEach(() => {
    (NextResponse as unknown as jest.Mock).mockImplementation(
      (
        body: string,
        init: { status: number; headers: Record<string, string> },
      ) => ({
        body,
        status: init.status,
        headers: { get: (name: string) => init.headers[name] ?? null },
      }),
    );
  });

  it("associates only /field/* with the Patina Field production app", () => {
    expect(appleAppSiteAssociation()).toEqual({
      applinks: {
        apps: [],
        details: [
          {
            appID: "VP22LXHT7L.cloud.patina.field",
            paths: ["/field/*"],
            components: [
              {
                "/": "/field/*",
                comment: "Patina Field Site Request links only",
              },
            ],
          },
        ],
      },
    });
  });

  it("serves JSON directly without a redirect", () => {
    const response = GET() as unknown as {
      status: number;
      body: string;
      headers: { get(name: string): string | null };
    };
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(response.body).applinks.details[0].appID).toBe(
      "VP22LXHT7L.cloud.patina.field",
    );
  });
});
