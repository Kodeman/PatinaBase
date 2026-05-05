import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  verifyAdmin,
  unauthorized,
  serverError,
} from '@/lib/admin-api';
import { buildUserDataExport } from '@/lib/gdpr';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const supabase = getServiceClient();
  const admin = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!admin) return unauthorized();

  const { userId } = await context.params;
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  try {
    const payload = await buildUserDataExport(supabase, userId);
    return NextResponse.json(payload, {
      headers: {
        'Content-Disposition': `attachment; filename="patina-data-export-${userId}.json"`,
      },
    });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to build export');
  }
}
