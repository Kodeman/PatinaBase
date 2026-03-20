import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://admin.patina.cloud',
  'https://client.patina.cloud',
  'https://app.patina.cloud',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
];

export function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export function handleCors(request: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}
