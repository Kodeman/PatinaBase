/**
 * PostHog Server-Side Query Client
 *
 * Queries PostHog's HogQL API for admin dashboard stats.
 * Requires POSTHOG_PERSONAL_API_KEY (generate at https://us.posthog.com/settings/user-api-keys)
 * and POSTHOG_PROJECT_ID.
 */

const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
// PostHog's app API is at app domain, not ingest domain
const POSTHOG_API_HOST = POSTHOG_HOST.replace('us.i.posthog.com', 'us.posthog.com').replace(
  'eu.i.posthog.com',
  'eu.posthog.com'
);

export interface PostHogStats {
  pageviewsLast7d: number;
  pageviewsLast30d: number;
  signupsLast7d: number;
  signupsLast30d: number;
  uniqueVisitorsLast7d: number;
  identifiedUsersLast30d: number;
  newsletterSignupsLast7d: number;
  waitlistSignupsLast7d: number;
  topEvents: Array<{ event: string; count: number }>;
  signupsByPlatform: Array<{ platform: string; count: number }>;
}

async function hogqlQuery<T = unknown>(query: string): Promise<T | null> {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;

  if (!projectId || !apiKey) {
    return null;
  }

  try {
    const response = await fetch(`${POSTHOG_API_HOST}/api/projects/${projectId}/query/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: { kind: 'HogQLQuery', query },
      }),
      // PostHog queries can be slow; 20s timeout
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[PostHog] Query failed:', response.status, text);
      return null;
    }

    const data = await response.json();
    return data as T;
  } catch (err) {
    console.error('[PostHog] Query error:', err);
    return null;
  }
}

interface HogQLResult {
  results?: Array<Array<string | number>>;
}

function firstCell(result: HogQLResult | null): number {
  if (!result?.results?.[0]?.[0]) return 0;
  const value = result.results[0][0];
  return typeof value === 'number' ? value : Number(value) || 0;
}

export async function fetchPostHogStats(): Promise<PostHogStats | null> {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;

  if (!projectId || !apiKey) {
    return null;
  }

  // Run queries in parallel
  const [
    pageviews7d,
    pageviews30d,
    signups7d,
    signups30d,
    uniqueVisitors7d,
    identifiedUsers30d,
    newsletter7d,
    waitlist7d,
    topEvents,
    signupsByPlatform,
  ] = await Promise.all([
    hogqlQuery<HogQLResult>(
      `SELECT count() FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 7 DAY`
    ),
    hogqlQuery<HogQLResult>(
      `SELECT count() FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY`
    ),
    hogqlQuery<HogQLResult>(
      `SELECT count() FROM events WHERE event = 'signup' AND timestamp >= now() - INTERVAL 7 DAY`
    ),
    hogqlQuery<HogQLResult>(
      `SELECT count() FROM events WHERE event = 'signup' AND timestamp >= now() - INTERVAL 30 DAY`
    ),
    hogqlQuery<HogQLResult>(
      `SELECT count(DISTINCT person_id) FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 7 DAY`
    ),
    hogqlQuery<HogQLResult>(
      `SELECT count(DISTINCT person_id) FROM events WHERE event = '$identify' AND timestamp >= now() - INTERVAL 30 DAY`
    ),
    hogqlQuery<HogQLResult>(
      `SELECT count() FROM events WHERE event = 'newsletter_signup' AND timestamp >= now() - INTERVAL 7 DAY`
    ),
    hogqlQuery<HogQLResult>(
      `SELECT count() FROM events WHERE event = 'waitlist_signup' AND timestamp >= now() - INTERVAL 7 DAY`
    ),
    hogqlQuery<HogQLResult>(
      `SELECT event, count() as c FROM events WHERE timestamp >= now() - INTERVAL 7 DAY GROUP BY event ORDER BY c DESC LIMIT 10`
    ),
    hogqlQuery<HogQLResult>(
      `SELECT properties.platform as p, count() as c FROM events WHERE event = 'signup' AND timestamp >= now() - INTERVAL 30 DAY AND properties.platform IS NOT NULL GROUP BY p ORDER BY c DESC`
    ),
  ]);

  return {
    pageviewsLast7d: firstCell(pageviews7d),
    pageviewsLast30d: firstCell(pageviews30d),
    signupsLast7d: firstCell(signups7d),
    signupsLast30d: firstCell(signups30d),
    uniqueVisitorsLast7d: firstCell(uniqueVisitors7d),
    identifiedUsersLast30d: firstCell(identifiedUsers30d),
    newsletterSignupsLast7d: firstCell(newsletter7d),
    waitlistSignupsLast7d: firstCell(waitlist7d),
    topEvents:
      topEvents?.results?.map((row) => ({
        event: String(row[0]),
        count: Number(row[1]) || 0,
      })) || [],
    signupsByPlatform:
      signupsByPlatform?.results?.map((row) => ({
        platform: String(row[0] || 'unknown'),
        count: Number(row[1]) || 0,
      })) || [],
  };
}

export function isPostHogConfigured(): boolean {
  return Boolean(process.env.POSTHOG_PROJECT_ID && process.env.POSTHOG_PERSONAL_API_KEY);
}
