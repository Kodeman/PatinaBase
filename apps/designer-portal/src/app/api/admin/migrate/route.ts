import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Temporary migration endpoint — runs SQL through pg_meta directly
// Protected by requiring the service_role key as authorization
const PG_META_URL = process.env.PG_META_URL || 'http://meta-es8w8g0c00og4gsgg0k8w8o8:8080';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { query } = await request.json();
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const resp = await fetch(`${PG_META_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const body = await resp.text();
    return NextResponse.json({
      status: resp.status,
      result: body,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
