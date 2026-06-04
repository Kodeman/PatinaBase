import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// Reads build-time env at runtime + fans out to live endpoints — never cache.
export const dynamic = 'force-dynamic';

export type VersionStatus = 'current' | 'behind' | 'unreachable';

export interface VersionInfo {
  name: string;
  kind: 'portal' | 'service';
  service: string | null;
  version: string | null;
  gitSha: string | null;
  buildTime: string | null;
  status: VersionStatus;
  message?: string;
}

export interface SystemVersions {
  /** The SHA the admin image itself was built from — the deploy reference. */
  expectedSha: string;
  apps: VersionInfo[];
  checkedAt: string;
}

const TIMEOUT_MS = 3000;

interface Target {
  name: string;
  kind: 'portal' | 'service';
  base: string | undefined;
  defaultBase: string;
  /** orders/projects sit behind the `/v1` global prefix; media + portals do not. */
  path: string;
}

const TARGETS: Target[] = [
  {
    name: 'Designer Portal',
    kind: 'portal',
    base: process.env.DESIGNER_PORTAL_URL,
    defaultBase: 'http://localhost:3000',
    path: '/api/version',
  },
  {
    name: 'Client Portal',
    kind: 'portal',
    base: process.env.CLIENT_PORTAL_URL,
    defaultBase: 'http://localhost:3002',
    path: '/api/version',
  },
  {
    name: 'Orders',
    kind: 'service',
    base: process.env.ORDERS_SERVICE_URL,
    defaultBase: 'http://localhost:3015',
    path: '/v1/version',
  },
  {
    name: 'Media',
    kind: 'service',
    base: process.env.MEDIA_SERVICE_URL,
    defaultBase: 'http://localhost:3014',
    path: '/version',
  },
  {
    name: 'Projects',
    kind: 'service',
    base: process.env.PROJECTS_SERVICE_URL,
    defaultBase: 'http://localhost:3016',
    path: '/v1/version',
  },
];

function shortSha(sha: string | null | undefined): string | null {
  if (!sha || sha === 'unknown') return null;
  return sha.slice(0, 7);
}

async function fetchVersion(target: Target, expectedSha: string): Promise<VersionInfo> {
  const url = `${target.base ?? target.defaultBase}${target.path}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!res.ok) {
      return {
        name: target.name,
        kind: target.kind,
        service: null,
        version: null,
        gitSha: null,
        buildTime: null,
        status: 'unreachable',
        message: `HTTP ${res.status}`,
      };
    }

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const gitSha = typeof body.gitSha === 'string' ? body.gitSha : null;
    const matched = shortSha(gitSha) !== null && shortSha(gitSha) === shortSha(expectedSha);

    return {
      name: target.name,
      kind: target.kind,
      service: typeof body.service === 'string' ? body.service : null,
      version: typeof body.version === 'string' ? body.version : null,
      gitSha,
      buildTime: typeof body.buildTime === 'string' ? body.buildTime : null,
      status: matched ? 'current' : 'behind',
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'TimeoutError';
    return {
      name: target.name,
      kind: target.kind,
      service: null,
      version: null,
      gitSha: null,
      buildTime: null,
      status: 'unreachable',
      message: isAbort ? `timeout (${TIMEOUT_MS}ms)` : (err as Error).message ?? 'unreachable',
    };
  }
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const expectedSha = process.env.BUILD_SHA ?? 'unknown';

  try {
    const remote = await Promise.all(TARGETS.map((t) => fetchVersion(t, expectedSha)));

    // Admin portal reads its own version directly — no self-fetch.
    const self: VersionInfo = {
      name: 'Admin Portal',
      kind: 'portal',
      service: process.env.APP_NAME ?? 'admin-portal',
      version: process.env.APP_VERSION ?? '0.0.0',
      gitSha: process.env.BUILD_SHA ?? null,
      buildTime: process.env.BUILD_TIME ?? null,
      status: 'current', // by definition the reference build
    };

    const payload: SystemVersions = {
      expectedSha,
      apps: [self, ...remote],
      checkedAt: new Date().toISOString(),
    };

    return NextResponse.json(
      { data: payload },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load versions');
  }
}
