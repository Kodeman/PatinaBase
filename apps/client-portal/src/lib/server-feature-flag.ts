import 'server-only';

import { createServerClient } from '@patina/supabase/server';

const FLAG = 'client-edition-page';

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

function editionValue(data: { featureFlags?: Record<string, unknown> } | null): boolean {
  return data?.featureFlags?.[FLAG] === true;
}

async function requestEditionFlag(distinctId: string): Promise<boolean> {
  const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');
  const controller = new AbortController();
  // The fallback shares the original deadline, rather than adding 300 ms.
  const timeout = setTimeout(() => controller.abort(), 300);
  try {
    const options: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: process.env.NEXT_PUBLIC_POSTHOG_KEY, distinct_id: distinctId }),
      cache: 'no-store',
      signal: controller.signal,
    };
    let response = await fetch(`${host}/flags?v=2`, options);
    if ([404, 405, 501].includes(response.status)) {
      response = await fetch(`${host}/decide?v=3`, options);
    }
    if (response.status !== 200) return false;
    return editionValue(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

async function authenticatedEditionFlag(override: boolean | undefined): Promise<boolean> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return false;
    // The authenticated browser identifies with this same Supabase user UUID.
    return override === true || await requestEditionFlag(user.id);
  } catch {
    return false;
  }
}

export async function clientEditionEnabled(): Promise<boolean> {
  const override = editionOverride();
  if (override === false || (override === undefined && !analyticsPossible())) return false;
  return authenticatedEditionFlag(override);
}
