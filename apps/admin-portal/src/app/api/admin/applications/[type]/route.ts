import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  badRequest,
  serverError,
} from '@/lib/supabase-admin';
import { listApplications, type ApplicationType } from '@/lib/applications';

function parseType(raw: string): ApplicationType | null {
  if (raw === 'designers') return 'designer';
  if (raw === 'makers') return 'maker';
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const { type: rawType } = await params;
  const type = parseType(rawType);
  if (!type) return badRequest('Unknown application type');

  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? undefined;
  const search = url.searchParams.get('search') ?? undefined;
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '25', 10)),
  );

  try {
    const { data, total } = await listApplications(adminClient, type, {
      status,
      search,
      page,
      pageSize,
    });
    return NextResponse.json({
      data: { data, meta: { total, page, pageSize } },
    });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to list applications');
  }
}
