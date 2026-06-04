import { NextResponse } from 'next/server';

// Read build-time stamping at runtime (set as Docker ENV in the runner stage).
// force-dynamic so the empty build-time env isn't frozen into a static response.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET() {
  return NextResponse.json(
    {
      service: process.env.APP_NAME ?? 'designer-portal',
      version: process.env.APP_VERSION ?? '0.0.0',
      gitSha: process.env.BUILD_SHA ?? 'unknown',
      buildTime: process.env.BUILD_TIME ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
