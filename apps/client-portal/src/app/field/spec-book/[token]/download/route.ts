import { NextResponse } from "next/server";

import { signResolvedSpecBookArtifact } from "../spec-book-share";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const download = new URL(request.url).searchParams.get("download") === "1";
  const signed = await signResolvedSpecBookArtifact(token, download);

  if (!signed) {
    const deadLink = new URL(
      `/field/spec-book/${encodeURIComponent(token)}`,
      request.url,
    );
    deadLink.searchParams.set("unavailable", "1");
    return NextResponse.redirect(deadLink, {
      status: 303,
      headers: PRIVATE_HEADERS,
    });
  }

  return NextResponse.redirect(signed.signedUrl, {
    status: 307,
    headers: PRIVATE_HEADERS,
  });
}
