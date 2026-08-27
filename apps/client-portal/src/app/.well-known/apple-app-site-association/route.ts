import { NextResponse } from "next/server";

export const dynamic = "force-static";

export function appleAppSiteAssociation() {
  return {
    applinks: {
      apps: [],
      details: [
        {
          appID: "VP22LXHT7L.cloud.patina.field",
          paths: ["/field/sr_*"],
          components: [
            {
              "/": "/field/sr_*",
              comment:
                "Patina Field Site Request links only; legacy 64-hex Field links stay on web",
            },
          ],
        },
        {
          // Patina, the client app (PRODUCT_BUNDLE_IDENTIFIER cloud.patina.app).
          // A homeowner sharing a piece hands over a client.patina.cloud link;
          // with the app installed it should open on the piece rather than the
          // web page. The money paths are here for the same reason: a push or an
          // emailed link to an invoice, proposal or decision belongs in the app.
          //
          // Universal links are a DEVICE claim — the AASA must be deployed and
          // the app must carry applinks:client.patina.cloud in its entitlement
          // before any of this does anything, and iOS caches the file.
          appID: "VP22LXHT7L.cloud.patina.app",
          paths: ["/piece/*", "/invoice/*", "/proposal/*", "/decision/*"],
        },
      ],
    },
  };
}

export function GET() {
  return new NextResponse(JSON.stringify(appleAppSiteAssociation()), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
