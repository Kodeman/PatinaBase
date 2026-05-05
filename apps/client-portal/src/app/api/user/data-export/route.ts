import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@patina/supabase/client';
import { buildUserDataExport, bearerToken } from '@/lib/gdpr';

export async function GET(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data: userData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = await buildUserDataExport(adminClient, userData.user.id);
    payload.user = {
      ...payload.user,
      id: userData.user.id,
      email: userData.user.email ?? payload.user.email,
    };
    return NextResponse.json(payload, {
      headers: {
        'Content-Disposition': `attachment; filename="patina-data-export-${userData.user.id}.json"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to build export' },
      { status: 500 },
    );
  }
}
