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

  it("associates only namespaced Site Request links with the Field app", () => {
    const field = appleAppSiteAssociation().applinks.details.find(
      (entry) => entry.appID === "VP22LXHT7L.cloud.patina.field",
    );
    expect(field).toEqual({
      appID: "VP22LXHT7L.cloud.patina.field",
      paths: ["/field/sr_*"],
      components: [
        {
          "/": "/field/sr_*",
          comment:
            "Patina Field Site Request links only; legacy 64-hex Field links stay on web",
        },
      ],
    });
  });

  it("associates the piece and money paths with the client app", () => {
    const client = appleAppSiteAssociation().applinks.details.find(
      (entry) => entry.appID === "VP22LXHT7L.cloud.patina.app",
    );
    expect(client).toEqual({
      appID: "VP22LXHT7L.cloud.patina.app",
      paths: ["/piece/*", "/invoices/*", "/proposals/*", "/decisions/*"],
    });
  });

  // review M-D2: the association must name routes that exist on this host and
  // agree with the deep_link 00534 writes (/proposals/<id>, /invoices/<id>,
  // /decisions/<id>). A singular path associates nothing.
  it("associates the plural money routes the portal actually serves", () => {
    const client = appleAppSiteAssociation().applinks.details.find(
      (entry) => entry.appID === "VP22LXHT7L.cloud.patina.app",
    );
    for (const singular of ["/invoice/*", "/proposal/*", "/decision/*"]) {
      expect(client?.paths).not.toContain(singular);
    }
    for (const plural of ["/invoices/*", "/proposals/*", "/decisions/*"]) {
      expect(client?.paths).toContain(plural);
    }
  });

  it("serves exactly the two apps, and no wildcard app entry", () => {
    const { applinks } = appleAppSiteAssociation();
    expect(applinks.apps).toEqual([]);
    expect(applinks.details.map((entry) => entry.appID)).toEqual([
      "VP22LXHT7L.cloud.patina.field",
      "VP22LXHT7L.cloud.patina.app",
    ]);
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
