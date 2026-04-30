import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

export interface SettingsOverview {
  environment: {
    nodeEnv: string;
    publicEnv: string;
    appUrl: string;
    supabaseUrl: string;
    ordersServiceUrl: string;
    mediaServiceUrl: string;
    projectsServiceUrl: string | null;
  };
  email: {
    senderFrom: string;
    domain: string;
    suppressedCount: number;
    bouncedLast30Days: number;
  };
  flags: {
    mfaEnabled: boolean;
    dualControlEnabled: boolean;
    impersonationEnabled: boolean;
    analyticsEnabled: boolean;
    debugEnabled: boolean;
  };
  caller: {
    id: string;
    email: string | null;
    roles: string[];
  };
}

function envFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient, user } = auth;
  const db = adminClient as unknown as { from: (t: string) => any };

  try {
    // Suppression list count and recent bounces — best-effort.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [suppressedRes, bouncedRes, rolesRes] = await Promise.all([
      db
        .from('email_suppression_list')
        .select('*', { count: 'exact', head: true })
        .then((r: any) => r)
        .catch(() => ({ count: 0 })),
      db
        .from('notification_log')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'bounced')
        .gte('created_at', since)
        .then((r: any) => r)
        .catch(() => ({ count: 0 })),
      db
        .from('user_roles')
        .select('role_id, roles!inner(name)')
        .eq('user_id', user.id),
    ]);

    const callerRoles: string[] = (rolesRes.data ?? [])
      .map((row: any) => row?.roles?.name)
      .filter(Boolean);

    const senderFrom = process.env.RESEND_FROM ?? 'hello@patina.cloud';
    const domain = senderFrom.includes('@') ? senderFrom.split('@')[1].replace(/[> ]/g, '') : '—';

    const payload: SettingsOverview = {
      environment: {
        nodeEnv: process.env.NODE_ENV ?? 'unknown',
        publicEnv: process.env.NEXT_PUBLIC_ENV ?? 'unknown',
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '—',
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '—',
        ordersServiceUrl: process.env.ORDERS_SERVICE_URL ?? 'http://localhost:3015',
        mediaServiceUrl: process.env.MEDIA_SERVICE_URL ?? 'http://localhost:3014',
        projectsServiceUrl: process.env.PROJECTS_SERVICE_URL ?? null,
      },
      email: {
        senderFrom,
        domain,
        suppressedCount: suppressedRes.count ?? 0,
        bouncedLast30Days: bouncedRes.count ?? 0,
      },
      flags: {
        mfaEnabled: envFlag(process.env.NEXT_PUBLIC_ENABLE_MFA),
        dualControlEnabled: envFlag(process.env.NEXT_PUBLIC_ENABLE_DUAL_CONTROL),
        impersonationEnabled: envFlag(process.env.NEXT_PUBLIC_ENABLE_IMPERSONATION),
        analyticsEnabled: envFlag(process.env.NEXT_PUBLIC_ENABLE_ANALYTICS),
        debugEnabled: envFlag(process.env.NEXT_PUBLIC_ENABLE_DEBUG),
      },
      caller: {
        id: user.id,
        email: user.email ?? null,
        roles: callerRoles,
      },
    };

    return NextResponse.json({ data: payload });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load settings overview');
  }
}
