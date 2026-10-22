import 'server-only';

const FLAG = 'client-edition-page';
const DEADLINE_MS = 600;

function editionOverride(): boolean | undefined {
  const entry = process.env.NEXT_PUBLIC_FLAG_OVERRIDES?.split(',')
    .find((value) => value.includes(':') && value.slice(0, value.indexOf(':')).trim() === FLAG);
  return entry === undefined ? undefined : entry.slice(entry.indexOf(':') + 1).trim() === 'true';
}

function analyticsPossible(): boolean {
  return !!process.env.NEXT_PUBLIC_POSTHOG_KEY && (
    process.env.NODE_ENV !== 'development' || process.env.NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV === 'true'
  );
}

function editionValue(data: { flags?: Record<string, { enabled?: unknown }>; featureFlags?: Record<string, unknown> } | null, legacy: boolean): boolean {
  return legacy ? data?.featureFlags?.[FLAG] === true : data?.flags?.[FLAG]?.enabled === true;
}

async function requestEditionFlag(distinctId: string): Promise<boolean> {
  const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');
  const controller = new AbortController();
  // The fallback and response body share the original deadline.
  const timeout = setTimeout(() => controller.abort(), DEADLINE_MS);
  try {
    const options: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: process.env.NEXT_PUBLIC_POSTHOG_KEY, distinct_id: distinctId }),
      cache: 'no-store',
      signal: controller.signal,
    };
    let response = await fetch(`${host}/flags?v=2`, options);
    const legacy = [404, 405, 501].includes(response.status);
    if (legacy) {
      response = await fetch(`${host}/decide?v=3`, options);
    }
    if (response.status !== 200) return false;
    return editionValue(await response.json(), legacy);
  } finally {
    clearTimeout(timeout);
  }
}

/** userId comes from the page's request-cached, GoTrue-validated user. */
export async function clientEditionEnabled(userId?: string | null): Promise<boolean> {
  try {
    if (!userId) return false;
    const override = editionOverride();
    if (override !== undefined) return override;
    // The authenticated browser identifies with this same Supabase user UUID.
    return analyticsPossible() && await requestEditionFlag(userId);
  } catch {
    return false;
  }
}
