import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

export type ServiceStatus = 'healthy' | 'degraded' | 'down';

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  latencyMs: number | null;
  message?: string;
  details?: Record<string, string>;
}

export interface SystemHealth {
  services: ServiceHealth[];
  overall: ServiceStatus;
  checkedAt: string;
}

const PING_TIMEOUT_MS = 3000;
const DEGRADED_LATENCY_MS = 1500;

interface ServiceTarget {
  name: string;
  url: string | undefined;
  defaultUrl: string;
}

const SERVICE_TARGETS: ServiceTarget[] = [
  { name: 'Orders', url: process.env.ORDERS_SERVICE_URL, defaultUrl: 'http://localhost:3015' },
  { name: 'Media', url: process.env.MEDIA_SERVICE_URL, defaultUrl: 'http://localhost:3014' },
  { name: 'Projects', url: process.env.PROJECTS_SERVICE_URL, defaultUrl: 'http://localhost:3016' },
];

async function pingService(target: ServiceTarget): Promise<ServiceHealth> {
  const baseUrl = target.url ?? target.defaultUrl;
  const start = Date.now();

  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      cache: 'no-store',
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return {
        name: target.name,
        status: 'down',
        latencyMs,
        message: `HTTP ${res.status}`,
      };
    }

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const reportedStatus = typeof body.status === 'string' ? body.status : 'ok';
    const isHealthy = reportedStatus === 'healthy' || reportedStatus === 'ok';

    let status: ServiceStatus = isHealthy ? 'healthy' : 'down';
    if (status === 'healthy' && latencyMs > DEGRADED_LATENCY_MS) {
      status = 'degraded';
    }

    const details: Record<string, string> = {};
    if (typeof body.database === 'string') details.database = body.database;
    if (typeof body.uptime === 'number') details.uptime = `${Math.round(body.uptime)}s`;

    return {
      name: target.name,
      status,
      latencyMs,
      message: isHealthy ? undefined : reportedStatus,
      details: Object.keys(details).length ? details : undefined,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const isAbort = err instanceof Error && err.name === 'TimeoutError';
    return {
      name: target.name,
      status: 'down',
      latencyMs,
      message: isAbort ? `timeout (${PING_TIMEOUT_MS}ms)` : (err as Error).message ?? 'unreachable',
    };
  }
}

async function pingSupabase(
  adminClient: { from: (t: string) => any },
): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const { error } = await adminClient
      .from('roles')
      .select('id', { head: true, count: 'exact' })
      .limit(1);
    const latencyMs = Date.now() - start;

    if (error) {
      return { name: 'Supabase', status: 'down', latencyMs, message: error.message };
    }

    const status: ServiceStatus = latencyMs > DEGRADED_LATENCY_MS ? 'degraded' : 'healthy';
    return { name: 'Supabase', status, latencyMs };
  } catch (err) {
    return {
      name: 'Supabase',
      status: 'down',
      latencyMs: Date.now() - start,
      message: (err as Error).message ?? 'unreachable',
    };
  }
}

function rollUp(services: ServiceHealth[]): ServiceStatus {
  if (services.some((s) => s.status === 'down')) return 'down';
  if (services.some((s) => s.status === 'degraded')) return 'degraded';
  return 'healthy';
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  try {
    const services = await Promise.all([
      ...SERVICE_TARGETS.map((t) => pingService(t)),
      pingSupabase(auth.adminClient as unknown as { from: (t: string) => any }),
    ]);

    const payload: SystemHealth = {
      services,
      overall: rollUp(services),
      checkedAt: new Date().toISOString(),
    };

    return NextResponse.json(
      { data: payload },
      {
        headers: {
          'Cache-Control': 'private, max-age=5',
        },
      },
    );
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load system health');
  }
}
