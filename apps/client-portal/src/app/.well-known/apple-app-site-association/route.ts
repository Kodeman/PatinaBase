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
